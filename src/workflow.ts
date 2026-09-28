import { parse as parseJsonc, parseTree, type ParseError } from "jsonc-parser";
import type { RequestItem } from "./model";

export type WorkflowStep = { requestId: string; reason: string };
export type WorkflowPlan = {
  title: string;
  summary: string;
  steps: WorkflowStep[];
  gaps: string[];
  provider: "local" | "openai";
};
export type Candidate = { request: RequestItem; score: number; action: string };
export type SafeEndpoint = {
  id: string;
  name: string;
  method: string;
  folder: string;
  path: string;
  bodyFields: string[];
  reviewRequired: boolean;
};
const stop = new Set(
  "i me my we us the a an and or to for of with that which show find api apis endpoint endpoints allow allows able want workflow please can how do does be should then".split(
    " ",
  ),
);
const actionWords: Record<string, string[]> = {
  create: ["create", "add", "register", "insert", "new"],
  update: ["update", "edit", "modify", "change", "patch"],
  read: ["get", "read", "retrieve", "fetch", "view", "list", "search", "find"],
  delete: ["delete", "remove", "revoke", "cancel"],
};
const families = [
  ["profile", "guest", "customer", "user", "contact", "person"],
  ["appointment", "booking", "reservation"],
  ["employee", "staff", "therapist"],
  ["invoice", "billing", "payment"],
  ["product", "inventory", "stock"],
  ["membership", "member"],
  ["token", "auth", "authentication", "login"],
];
const word = (s: string) =>
  s
    .toLowerCase()
    .replace(/updated|updating/g, "update")
    .replace(/created|creating/g, "create")
    .replace(/deleted|deleting/g, "delete")
    .replace(/ies$/, "y")
    .replace(/s$/, "");
const tokens = (s: string) =>
  s
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(word);
function requestedActions(goal: string): string[] {
  const words = tokens(goal);
  return Object.entries(actionWords)
    .filter(([, aliases]) => aliases.some((a) => words.includes(a)))
    .map(([a]) => a);
}
function actionOf(request: RequestItem): string {
  const first = tokens(request.name)[0];
  for (const [action, aliases] of Object.entries(actionWords))
    if (aliases.includes(first)) return action;
  return (
    (
      {
        POST: "create",
        PUT: "update",
        PATCH: "update",
        DELETE: "delete",
        GET: "read",
        HEAD: "read",
      } as Record<string, string>
    )[request.method] ?? "read"
  );
}
export function requestDescription(request: RequestItem): string {
  const source = request.postmanSource?.request as
    { description?: string | { content?: string } } | undefined;
  return typeof source?.description === "string"
    ? source.description
    : (source?.description?.content ?? "");
}
export function rankEndpoints(
  requests: RequestItem[],
  goal: string,
): Candidate[] {
  const actions = requestedActions(goal);
  const raw = tokens(goal).filter(
    (t) => !stop.has(t) && !Object.values(actionWords).flat().includes(t),
  );
  const expanded = new Set(
    raw.flatMap((t) => families.find((f) => f.includes(t)) ?? [t]),
  );
  const seen = new Set<string>();
  return requests
    .flatMap((request) => {
      const key = JSON.stringify([
        request.method,
        request.url,
        request.folder,
        request.body,
      ]);
      if (seen.has(key)) return [];
      seen.add(key);
      const names = tokens(request.name),
        folders = tokens(request.folder),
        description = tokens(requestDescription(request));
      const action = actionOf(request);
      let entity = 0;
      for (const term of expanded) {
        if (names.includes(term)) entity = Math.max(entity, 30);
        else if (folders.includes(term)) entity = Math.max(entity, 12);
        else if (description.includes(term)) entity = Math.max(entity, 4);
      }
      if (raw.length && entity === 0) return [];
      let score =
        entity + (actions.includes(action) ? 22 : actions.length ? -20 : 0);
      if (names.length <= 4) score += 12;
      const qualifiers = [
        "note",
        "password",
        "address",
        "loyalty",
        "point",
        "security",
        "relationship",
        "form",
      ];
      if (qualifiers.some((t) => names.includes(t) && !raw.includes(t)))
        score -= 18;
      if (request.importIssues?.length) score -= 3;
      if (raw.length === 0 && actions.length === 0) return [];
      return [{ request, score, action }];
    })
    .filter((c) => c.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.request.name.localeCompare(b.request.name),
    );
}
export function localWorkflow(
  requests: RequestItem[],
  goal: string,
): WorkflowPlan {
  const ranked = rankEndpoints(requests, goal),
    actions = requestedActions(goal);
  const steps: WorkflowStep[] = [],
    gaps: string[] = [];
  const desired = actions.length ? actions : ["read"];
  for (const action of desired) {
    const match = ranked.find(
      (c) =>
        c.action === action && !steps.some((s) => s.requestId === c.request.id),
    );
    if (match)
      steps.push({
        requestId: match.request.id,
        reason: `Matches the ${action} action and your collection's resource names.`,
      });
    else
      gaps.push(
        `No confident ${action} endpoint match was found. Try the resource's name from your collection.`,
      );
  }
  if (!actions.length && ranked[0] && !steps.length)
    steps.push({
      requestId: ranked[0].request.id,
      reason: "Closest match in the imported collection.",
    });
  if (
    /profile/i.test(goal) &&
    steps.some((s) =>
      requests
        .find((r) => r.id === s.requestId)
        ?.name.toLowerCase()
        .includes("guest"),
    )
  )
    gaps.push(
      "“Profile” is interpreted as a guest/customer profile. Choose another endpoint if you meant an employee or a different profile type.",
    );
  if (steps.length > 1)
    gaps.push(
      "The arrows show a suggested order. Response-to-request field mappings are not verified; wire identifiers from the actual responses.",
    );
  return {
    title: steps.length ? "Suggested API workflow" : "No matching workflow yet",
    summary:
      "Local collection search matched your words, actions, and resource synonyms. This mode does not use an AI model.",
    steps,
    gaps,
    provider: "local",
  };
}
export function parseBody(raw: string): unknown | undefined {
  if (!raw.trim()) return undefined;
  const errors: ParseError[] = [];
  const value = parseJsonc(raw, errors, { allowTrailingComma: true });
  return errors.length ? undefined : value;
}
// Some collections store explanatory prose followed by several JSON examples.
// Preserve one valid example for starter code, while requiring explicit review.
export function firstBodyExample(raw: string): unknown | undefined {
  const start = raw.indexOf("{");
  if (start < 0) return undefined;
  const fragment = raw.slice(start);
  const node = parseTree(fragment, [], { allowTrailingComma: true });
  return node
    ? parseBody(fragment.slice(node.offset, node.offset + node.length))
    : undefined;
}
export function fieldPaths(value: unknown, path = "", depth = 0): string[] {
  if (depth > 6 || value === undefined) return [];
  if (Array.isArray(value))
    return value.length
      ? fieldPaths(value[0], path + "[]", depth + 1)
      : [path + "[]"];
  if (value !== null && typeof value === "object")
    return Object.entries(value)
      .slice(0, 100)
      .flatMap(([k, v]) => fieldPaths(v, path ? path + "." + k : k, depth + 1))
      .slice(0, 150);
  return [path + ":" + (value === null ? "null" : typeof value)];
}
export function safePath(url: string): string {
  return url
    .replace(/^https?:\/\/[^/]+/i, "{{base_url}}")
    .replace(
      /([?&][^=&]+)=([^&]*)/g,
      (_m, key, value) =>
        key + "=" + (/^\{\{[^{}]+\}\}$/.test(value) ? value : "{{value}}"),
    )
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "{{id}}");
}
export function safeCatalog(candidates: Candidate[]): SafeEndpoint[] {
  return candidates.slice(0, 40).map(({ request: r }) => ({
    id: r.id,
    name: r.name.slice(0, 180),
    method: r.method,
    folder: r.folder.slice(0, 250),
    path: safePath(r.url).slice(0, 1200),
    bodyFields: fieldPaths(parseBody(r.body)).filter(Boolean),
    reviewRequired: !!r.importIssues?.length,
  }));
}
export function validateAiPlan(
  value: unknown,
  candidates: SafeEndpoint[],
): WorkflowPlan {
  const v = value as Record<string, unknown>;
  const ids = new Set(candidates.map((c) => c.id));
  if (
    !v ||
    typeof v.title !== "string" ||
    typeof v.summary !== "string" ||
    !Array.isArray(v.steps) ||
    !Array.isArray(v.gaps) ||
    v.steps.length > 8
  )
    throw Error("AI returned an invalid workflow.");
  const seen = new Set<string>();
  const steps = v.steps.map((s: unknown) => {
    const step = s as WorkflowStep;
    if (
      !step ||
      typeof step.requestId !== "string" ||
      !ids.has(step.requestId) ||
      seen.has(step.requestId) ||
      typeof step.reason !== "string"
    )
      throw Error("AI selected an unknown or duplicate endpoint.");
    seen.add(step.requestId);
    return { requestId: step.requestId, reason: step.reason.slice(0, 2000) };
  });
  if (v.gaps.some((g) => typeof g !== "string"))
    throw Error("AI returned invalid workflow notes.");
  return {
    title: v.title.slice(0, 200),
    summary: v.summary.slice(0, 4000),
    steps,
    gaps: [
      ...(v.gaps as string[]).slice(0, 20).map((g) => g.slice(0, 2000)),
      "Suggested sequence only. Confirm response schemas and identifier mappings before running generated code.",
    ],
    provider: "openai",
  };
}
