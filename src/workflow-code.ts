import type { RequestItem } from "./model";
import { parseBody, firstBodyExample, type WorkflowPlan } from "./workflow";
export type StepSpec = {
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  auth: { type: string; token: string; username: string; password: string };
  issues: string[];
  bodyMode: string;
  variables: string[];
};
const variable = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase();
function replaceValues(value: unknown, prefix: string): unknown {
  if (Array.isArray(value))
    return value.slice(0, 1).map((v, i) => replaceValues(v, `${prefix}_${i}`));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        replaceValues(v, `${prefix}_${k}`),
      ]),
    );
  if (typeof value === "string")
    return !value || /^\{\{\s*[^{}]+\s*\}\}$/.test(value)
      ? value
      : `{{${variable(prefix)}}}`;
  if (typeof value === "number") return 0;
  if (typeof value === "boolean") return false;
  return null;
}
function safeUrl(url: string): string {
  // Keep the endpoint structure, but replace all embedded credentials and query values.
  return url
    .replace(/^(https?:\/\/)[^/@]+:[^/@]+@/i, "$1")
    .replace(
      /([?&])([^=&]+)=([^&]*)/g,
      (_m, sep, key, value) =>
        `${sep}${key}=${/^\{\{[^{}]+\}\}$/.test(value) ? value : "{{" + variable(key) + "}}"}`,
    );
}
export function stepSpecs(
  plan: WorkflowPlan,
  requests: RequestItem[],
): StepSpec[] {
  return plan.steps.map((step, index) => {
    const r = requests.find((r) => r.id === step.requestId);
    if (!r)
      throw Error("A workflow endpoint was removed. Build the workflow again.");
    const issues = [...(r.importIssues ?? [])];
    const source = r.postmanSource?.request as
      { body?: { mode?: string } } | undefined;
    const bodyMode = source?.body?.mode ?? "raw";
    let body = parseBody(r.body);
    if (r.body.trim() && body === undefined) {
      body = firstBodyExample(r.body);
      issues.push(
        body === undefined
          ? "Body is not valid JSON/JSONC. Provide a reviewed payload manually."
          : "Body contains prose or multiple examples. The first JSON example is included; review the intended payload before removing this guard.",
      );
    }
    if (bodyMode !== "raw") issues.push(`Unsupported body mode: ${bodyMode}.`);
    const headers = Object.fromEntries(
      r.headers
        .filter(
          (h) =>
            h.enabled &&
            h.key.trim() &&
            !/^(authorization|cookie|proxy-authorization)$/i.test(h.key),
        )
        .map((h) => [
          h.key,
          /^(content-type|accept)$/i.test(h.key) &&
          /^[\w.+*\/-]+(?:;[\w =-]+)?$/.test(h.value)
            ? h.value
            : /^\{\{[^{}]+\}\}$/.test(h.value)
              ? h.value
              : `{{HEADER_${variable(h.key)}}}`,
        ]),
    );
    const bearer =
      r.authType === "bearer"
        ? r.bearer.match(/^\{\{[^{}]+\}\}$/)
          ? r.bearer
          : "{{API_TOKEN}}"
        : "";
    if (
      r.headers.some((h) => h.enabled && /^authorization$/i.test(h.key)) &&
      r.authType === "none"
    ) {
      headers.Authorization = "{{AUTHORIZATION}}";
    }
    if (r.headers.some((h) => h.enabled && /^cookie$/i.test(h.key)))
      headers.Cookie = "{{COOKIE}}";
    const spec: StepSpec = {
      name: r.name,
      method: r.method,
      url: safeUrl(r.url),
      headers,
      body:
        body === undefined ? null : replaceValues(body, `STEP_${index + 1}`),
      auth: {
        type: r.authType,
        token: bearer,
        username: r.authType === "basic" ? "{{BASIC_USERNAME}}" : "",
        password: r.authType === "basic" ? "{{BASIC_PASSWORD}}" : "",
      },
      issues: [...new Set(issues)],
      bodyMode,
      variables: [],
    };
    spec.variables = [
      ...new Set(
        [...JSON.stringify(spec).matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(
          (m) => m[1],
        ),
      ),
    ];
    return spec;
  });
}
function pythonLiteral(value: unknown, depth = 0): string {
  const pad = "    ".repeat(depth),
    next = "    ".repeat(depth + 1);
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value))
    return value.length
      ? "[\n" +
          value.map((v) => next + pythonLiteral(v, depth + 1)).join(",\n") +
          "\n" +
          pad +
          "]"
      : "[]";
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length
    ? "{\n" +
        entries
          .map(
            ([k, v]) =>
              next + JSON.stringify(k) + ": " + pythonLiteral(v, depth + 1),
          )
          .join(",\n") +
        "\n" +
        pad +
        "}"
    : "{}";
}
export function pythonCode(specs: StepSpec[]): string {
  return `"""Requestbench starter. Install: pip install requests
Review payloads, authentication, and identifier mappings before use.
String sample values were replaced with variables; numbers/booleans are 0/False.
No API requests run automatically. Unsupported Postman features remain blocked.
"""
import copy
import json
import os
import re
from urllib.parse import quote
import requests

STEPS = ${pythonLiteral(specs)}
VARIABLE = re.compile(r"\\{\\{\\s*([^{}]+?)\\s*\\}\\}")

def expand(value, variables, url=False):
    if isinstance(value, list):
        return [expand(item, variables) for item in value]
    if isinstance(value, dict):
        return {key: expand(item, variables) for key, item in value.items()}
    if not isinstance(value, str):
        return value
    def replace(match):
        key = match.group(1)
        if key not in variables or variables[key] is None:
            raise ValueError(f"Missing variable: {key}")
        result = str(variables[key])
        is_origin = match.start() == 0 and result.startswith(("http://", "https://"))
        return result if not url or is_origin else quote(result, safe="")
    return VARIABLE.sub(replace, value)

def call_step(index, variables, payload=None):
    spec = STEPS[index]
    if spec["issues"]:
        raise ValueError("Review this step before use: " + "; ".join(spec["issues"]))
    url = expand(spec["url"], variables, url=True)
    if not url.startswith(("http://", "https://")):
        raise ValueError("Set an HTTP(S) API base URL.")
    headers = expand(spec["headers"], variables)
    auth = None
    if spec["auth"]["type"] == "bearer":
        headers["Authorization"] = "Bearer " + expand(spec["auth"]["token"], variables)
    elif spec["auth"]["type"] == "basic":
        auth = (expand(spec["auth"]["username"], variables), expand(spec["auth"]["password"], variables))
    body = expand(copy.deepcopy(spec["body"]) if payload is None else payload, variables)
    kwargs = {"headers": headers, "auth": auth, "timeout": 30, "allow_redirects": False}
    if spec["method"] not in ("GET", "HEAD") and body is not None:
        kwargs["json"] = body
    response = requests.request(spec["method"], url, **kwargs)
    if 300 <= response.status_code < 400:
        raise RuntimeError("Redirect returned; review its destination before following it.")
    response.raise_for_status()
    if not response.content:
        return None
    try:
        return response.json()
    except ValueError:
        return response.text

${specs.map((s, i) => `def step_${i + 1}(variables, payload=None):\n    # ${s.name.replace(/[\r\n]/g, " ")}\n    return call_step(${i}, variables, payload)`).join("\n\n")}

# Suggested sequence (intentionally not executed):
# variables = dict(os.environ)
${specs.map((_s, i) => `# result_${i + 1} = step_${i + 1}(variables)${i < specs.length - 1 ? "\n# TODO: map identifiers from the actual response into variables for the next step." : ""}`).join("\n")}
# Do not assume that a response has an "id" field; inspect its documented schema.
`;
}
export function typescriptCode(specs: StepSpec[]): string {
  return `/** Requestbench starter for Node.js 22+ (fetch is built in).
 * Review payloads/auth and map identifiers between steps before calling functions.
 * String sample values are variables; numbers/booleans are 0/false.
 * No API requests run automatically. Unsupported Postman features remain blocked.
 */
type Variables = Record<string, string | number | boolean | null | undefined>;
type Step = { name: string; method: string; url: string; headers: Record<string,string>; body: unknown; auth: {type:string;token:string;username:string;password:string}; issues:string[];bodyMode:string;variables:string[] };
const STEPS: Step[] = ${JSON.stringify(specs, null, 2)};

function expand(value: unknown, variables: Variables, url = false): any {
  if (Array.isArray(value)) return value.map(item => expand(item, variables));
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,expand(item,variables)]));
  if (typeof value !== "string") return value;
  return value.replace(/\\{\\{\\s*([^{}]+?)\\s*\\}\\}/g, (_match,key:string,offset:number) => {
    if (variables[key] === undefined || variables[key] === null) throw new Error("Missing variable: " + key);
    const result = String(variables[key]);
    const isOrigin = offset === 0 && /^https?:\\/\\//.test(result);
    return !url || isOrigin ? result : encodeURIComponent(result);
  });
}

export async function callStep(index: number, variables: Variables, payload?: unknown): Promise<unknown> {
  const spec = STEPS[index];
  if (!spec) throw new Error("Unknown step index");
  if (spec.issues.length) throw new Error("Review this step before use: " + spec.issues.join("; "));
  const url = expand(spec.url,variables,true);
  if (!/^https?:\\/\\//.test(url)) throw new Error("Set an HTTP(S) API base URL.");
  const headers = new Headers(expand(spec.headers,variables));
  if (spec.auth.type === "bearer") headers.set("Authorization","Bearer " + expand(spec.auth.token,variables));
  if (spec.auth.type === "basic") headers.set("Authorization","Basic " + Buffer.from(expand(spec.auth.username,variables) + ":" + expand(spec.auth.password,variables)).toString("base64"));
  const data = expand(payload === undefined ? spec.body : payload,variables);
  const hasBody = !["GET","HEAD"].includes(spec.method) && data !== null;
  if (hasBody && !headers.has("Content-Type")) headers.set("Content-Type","application/json");
  const response = await fetch(url,{method:spec.method,headers,body:hasBody?JSON.stringify(data):undefined,redirect:"manual",signal:AbortSignal.timeout(30_000)});
  if (response.status >= 300 && response.status < 400) throw new Error("Redirect returned; review its destination.");
  if (!response.ok) throw new Error("HTTP " + response.status + ": " + await response.text());
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

${specs.map((s, i) => `// ${s.name.replace(/[\r\n]/g, " ")}\nexport const step${i + 1} = (variables: Variables, payload?: unknown) => callStep(${i},variables,payload);`).join("\n\n")}

// Suggested sequence (intentionally not executed):
// const variables: Variables = { ...process.env };
${specs.map((_s, i) => `// const result${i + 1} = await step${i + 1}(variables);${i < specs.length - 1 ? "\n// TODO: map identifiers from the actual response into variables for the next step." : ""}`).join("\n")}
// Do not assume a response has an "id" field; inspect its documented schema.
`;
}
