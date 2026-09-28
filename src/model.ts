export type Row = {
  key: string;
  value: string;
  enabled: boolean;
  secret?: boolean;
  hasSecret?: boolean;
};
export type RequestItem = {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: Row[];
  body: string;
  bearer: string;
  authType: "none" | "bearer" | "basic";
  basicUser: string;
  basicPassword: string;
  folder: string;
  importIssues?: string[];
  postmanSource?: {
    request: unknown;
    events: unknown[];
    auth: unknown;
    responses?: unknown[];
  };
};
export type Environment = { id: string; name: string; variables: Row[] };
export type Fixture = {
  id: string;
  name: string;
  kind: "request" | "response";
  body: string;
};
export type Workspace = {
  format: "requestbench";
  version: 1;
  requests: RequestItem[];
  environments: Environment[];
  fixtures: Fixture[];
};
export type ResponseData = {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  size: number;
  duration: number;
};
export type HistoryEntry = {
  id: string;
  name: string;
  method: string;
  status: number;
  duration: number;
  at: number;
};
export const uid = () => crypto.randomUUID();
export const methods = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];
export const newRequest = (name = "Untitled request"): RequestItem => ({
  id: uid(),
  name,
  method: "GET",
  url: "",
  headers: [],
  body: "",
  bearer: "",
  authType: "none",
  basicUser: "",
  basicPassword: "",
  folder: "",
});
export const starter = (): Workspace => ({
  format: "requestbench",
  version: 1,
  requests: [
    {
      ...newRequest("Meet your Rust engine"),
      url: "requestbench://demo",
      folder: "Getting started",
    },
  ],
  environments: [
    {
      id: uid(),
      name: "Development",
      variables: [
        { key: "base_url", value: "http://localhost:3000", enabled: true },
      ],
    },
  ],
  fixtures: [
    {
      id: uid(),
      name: "Create a customer",
      kind: "request",
      body: JSON.stringify(
        { name: "Alex Morgan", email: "alex@example.com" },
        null,
        2,
      ),
    },
  ],
});
function obj(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Expected a JSON object.");
  return value as Record<string, any>;
}
function str(value: unknown, label: string): string {
  if (typeof value !== "string") throw Error(`${label} must be text.`);
  return value;
}
function rows(value: unknown): Row[] {
  if (!Array.isArray(value))
    throw Error("Variables and headers must be arrays.");
  return value.map((v) => {
    const r = obj(v);
    if (r.enabled !== undefined && typeof r.enabled !== "boolean")
      throw Error("Enabled must be true or false.");
    if (r.secret !== undefined && typeof r.secret !== "boolean")
      throw Error("Secret must be true or false.");
    return {
      key: str(r.key, "Key"),
      value: str(r.value ?? "", "Value"),
      enabled: r.enabled !== false,
      secret: r.secret === true,
      hasSecret: r.hasSecret === true,
    };
  });
}
export function parseImport(text: string): Workspace {
  const raw = obj(JSON.parse(text));
  if (raw.info?.schema?.includes("schema.getpostman.com"))
    return postmanCollection(raw);
  if (raw._postman_variable_scope === "environment")
    return {
      format: "requestbench",
      version: 1,
      requests: [],
      fixtures: [],
      environments: [
        {
          id: uid(),
          name: str(raw.name, "Environment name"),
          variables: rows(
            (raw.values ?? []).map((v: any) => ({
              ...v,
              value: String(v.value ?? ""),
              secret: v.type === "secret",
            })),
          ),
        },
      ],
    };
  if (raw.format !== "requestbench" || raw.version !== 1)
    throw Error(
      "Choose a Requestbench v1 export or a Postman v2.1 collection/environment.",
    );
  for (const kind of ["requests", "environments", "fixtures"])
    if (!Array.isArray(raw[kind])) throw Error(`${kind} must be an array.`);
  const result: Workspace = {
    format: "requestbench",
    version: 1,
    requests: raw.requests.map((v: unknown) => {
      const r = obj(v);
      if (!methods.includes(r.method)) throw Error("Unsupported HTTP method.");
      return {
        ...newRequest(str(r.name, "Request name")),
        method: r.method,
        url: str(r.url, "URL"),
        headers: rows(r.headers),
        body: str(r.body, "Body"),
        bearer: str(r.bearer ?? "", "Bearer token"),
        authType:
          r.authType === "basic"
            ? "basic"
            : r.authType === "bearer" || r.bearer
              ? "bearer"
              : "none",
        basicUser: str(r.basicUser ?? "", "Username"),
        basicPassword: str(r.basicPassword ?? "", "Password"),
        folder: str(r.folder ?? "", "Folder"),
        importIssues:
          r.importIssues === undefined
            ? undefined
            : (() => {
                if (!Array.isArray(r.importIssues))
                  throw Error("Import issues must be an array.");
                return r.importIssues.map((v: unknown) =>
                  str(v, "Import issue"),
                );
              })(),
        postmanSource:
          r.postmanSource === undefined
            ? undefined
            : (obj(r.postmanSource) as RequestItem["postmanSource"]),
      };
    }),
    environments: raw.environments.map((v: unknown) => {
      const e = obj(v);
      return {
        id: uid(),
        name: str(e.name, "Environment name"),
        variables: rows(e.variables).map((r) => ({ ...r, hasSecret: false })),
      };
    }),
    fixtures: raw.fixtures.map((v: unknown) => {
      const f = obj(v);
      if (!["request", "response"].includes(f.kind))
        throw Error("Fixture kind must be request or response.");
      const body = str(f.body, "Fixture body");
      JSON.parse(body);
      return {
        id: uid(),
        name: str(f.name, "Fixture name"),
        kind: f.kind,
        body,
      };
    }),
  };
  if (
    [...result.requests, ...result.environments, ...result.fixtures].some(
      (x) => !x.name.trim(),
    )
  )
    throw Error("All items need a name.");
  return result;
}
function postmanCollection(raw: Record<string, any>): Workspace {
  const result: Workspace = {
    format: "requestbench",
    version: 1,
    requests: [],
    environments: [],
    fixtures: [],
  };
  const convertAuth = (auth: any) => {
    if (!auth || auth.type === "noauth") return {};
    if (auth.type === "bearer")
      return {
        authType: "bearer" as const,
        bearer: String(
          auth.bearer?.find((v: any) => v.key === "token")?.value ?? "",
        ),
      };
    if (auth.type === "basic")
      return {
        authType: "basic" as const,
        basicUser: String(
          auth.basic?.find((v: any) => v.key === "username")?.value ?? "",
        ),
        basicPassword: String(
          auth.basic?.find((v: any) => v.key === "password")?.value ?? "",
        ),
      };
    return {};
  };
  const walk = (
    items: any[],
    folder: string,
    auth: any,
    inheritedEvents: any[] = [],
    depth = 0,
  ) => {
    if (depth > 30) throw Error("Collection nesting is too deep.");
    if (!Array.isArray(items)) throw Error("Invalid Postman collection.");
    for (const item of items) {
      const events = [...inheritedEvents, ...(item.event ?? [])];
      if (item.item) {
        walk(
          item.item,
          [folder, item.name].filter(Boolean).join(" / "),
          item.auth ?? auth,
          events,
          depth + 1,
        );
        continue;
      }
      const r =
        typeof item.request === "string"
          ? { url: item.request, method: "GET" }
          : obj(item.request);
      const issues: string[] = [];
      if (
        events.some((event: any) => {
          const exec = event.script?.exec;
          return typeof exec === "string"
            ? !!exec.trim()
            : Array.isArray(exec) &&
                exec.some(
                  (line: unknown) => typeof line === "string" && !!line.trim(),
                );
        })
      )
        issues.push("Postman scripts are preserved but are not executed.");
      if (r.body?.mode && r.body.mode !== "raw")
        issues.push(
          `Body mode “${r.body.mode}” is preserved but cannot be sent by this version.`,
        );
      const effectiveAuth = r.auth ?? auth;
      if (
        effectiveAuth &&
        !["noauth", "bearer", "basic"].includes(effectiveAuth.type)
      )
        issues.push(
          `Authentication “${effectiveAuth.type}” must be configured manually.`,
        );
      if (
        typeof r.url === "object" &&
        r.url.query?.some((q: any) => q.disabled)
      )
        issues.push(
          "Review disabled Postman query parameters in the imported raw URL.",
        );
      const method = methods.includes(r.method) ? r.method : "GET";
      if (!methods.includes(r.method))
        issues.push(
          `HTTP method “${String(r.method ?? "missing")}” needs correction. The editor defaults to GET until you choose a valid method.`,
        );
      const url = typeof r.url === "string" ? r.url : r.url?.raw;
      if (typeof url !== "string")
        throw Error("Postman request needs a raw URL.");
      result.requests.push({
        ...newRequest(str(item.name, "Request name")),
        folder,
        method,
        url,
        body: r.body?.raw ?? "",
        headers: rows(
          (r.header ?? []).map((h: any) => ({ ...h, enabled: !h.disabled })),
        ),
        ...convertAuth(effectiveAuth),
        importIssues: issues,
        postmanSource: {
          request: r,
          events,
          auth: effectiveAuth ?? null,
          responses: Array.isArray(item.response) ? item.response : [],
        },
      });
    }
  };
  walk(
    raw.item,
    raw.info.name ?? "Imported collection",
    raw.auth,
    raw.event ?? [],
  );
  if (raw.variable?.length)
    result.environments.push({
      id: uid(),
      name: `${raw.info.name ?? "Collection"} variables`,
      variables: rows(
        raw.variable.map((v: any) => ({
          ...v,
          value: String(v.value ?? ""),
          enabled: !v.disabled,
          secret: v.type === "secret",
        })),
      ),
    });
  return result;
}
export function exportBundle(
  workspace: Workspace,
  includeSecrets = false,
): Workspace {
  return {
    ...workspace,
    environments: workspace.environments.map((e) => ({
      ...e,
      variables: e.variables.map(({ hasSecret, ...v }) => ({
        ...v,
        value: v.secret && !includeSecrets ? "" : v.value,
      })),
    })),
  };
}
export function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
