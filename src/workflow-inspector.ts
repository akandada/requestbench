import type { RequestItem, ResponseData } from "./model";
export type ResponseExample = {
  name: string;
  status?: number;
  statusText: string;
  headers: [string, string][];
  body: string;
};
export function responseExamples(request: RequestItem): ResponseExample[] {
  const responses = request.postmanSource?.responses;
  if (!Array.isArray(responses)) return [];
  return responses.flatMap((value: unknown) => {
    if (!value || typeof value !== "object") return [];
    const r = value as Record<string, unknown>;
    return [
      {
        name: typeof r.name === "string" ? r.name : "Imported example",
        status: typeof r.code === "number" ? r.code : undefined,
        statusText: typeof r.status === "string" ? r.status : "",
        body: typeof r.body === "string" ? r.body : "",
        headers: Array.isArray(r.header)
          ? r.header.flatMap((v: unknown) => {
              if (!v || typeof v !== "object") return [];
              const h = v as Record<string, unknown>;
              return typeof h.key === "string" && typeof h.value === "string"
                ? [[h.key, h.value] as [string, string]]
                : [];
            })
          : [],
      },
    ];
  });
}
export function responseSummary(
  request: RequestItem,
  result?: { data?: ResponseData; error?: string; loading?: boolean },
): string {
  if (result?.loading) return "Request in progress";
  if (result?.error) return "Last call failed";
  if (result?.data)
    return `Last result: ${result.data.status} · ${result.data.duration} ms`;
  const count = responseExamples(request).length;
  return count
    ? `${count} imported response example${count === 1 ? "" : "s"}`
    : "No captured response";
}
export function moveWorkflowStep<T>(
  steps: T[],
  index: number,
  delta: number,
): T[] {
  const target = index + delta;
  if (
    index < 0 ||
    index >= steps.length ||
    target < 0 ||
    target >= steps.length
  )
    return steps;
  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
