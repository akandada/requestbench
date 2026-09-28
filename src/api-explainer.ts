import type { RequestItem } from "./model";
import { parseBody, firstBodyExample, requestDescription } from "./workflow";
export function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
export function describeAction(request: RequestItem) {
  const action: Record<
    string,
    { label: string; summary: string; impact: string }
  > = {
    GET: {
      label: "Read information",
      summary: "Looks up information from the connected service.",
      impact:
        "Usually retrieves information without changing it. Confirm the API’s documentation before trying it.",
    },
    HEAD: {
      label: "Check availability",
      summary: "Checks response headers without downloading the response body.",
      impact: "Usually reads service information.",
    },
    POST: {
      label: "Create or take action",
      summary: "Sends information to create something or trigger an action.",
      impact: "May create records or trigger a real action.",
    },
    PUT: {
      label: "Update information",
      summary: "Sends a replacement or updated version of a record.",
      impact:
        "May change existing information. Some APIs replace the whole record.",
    },
    PATCH: {
      label: "Change selected details",
      summary: "Sends changes to part of a record.",
      impact: "May change existing information.",
    },
    DELETE: {
      label: "Remove information",
      summary: "Asks the service to remove a record.",
      impact: "May permanently remove information.",
    },
  };
  return (
    action[request.method] ?? {
      label: "Service operation",
      summary: "Performs an operation on the connected service.",
      impact: "Check the documentation for its effects.",
    }
  );
}
export type InputField = { path: string; label: string; type: string };
export function inputFields(request: RequestItem): {
  fields: InputField[];
  exampleOnly: boolean;
} {
  let body = parseBody(request.body);
  const exampleOnly = body === undefined && !!request.body.trim();
  if (exampleOnly) body = firstBodyExample(request.body);
  const fields: InputField[] = [];
  function visit(value: unknown, path: string, depth: number) {
    if (depth > 5 || fields.length >= 60) return;
    if (Array.isArray(value)) {
      if (value.length) visit(value[0], path + "[]", depth + 1);
      else
        fields.push({
          path,
          label: humanize(path.split(".").at(-1) ?? path),
          type: "list",
        });
    } else if (value && typeof value === "object") {
      for (const [key, v] of Object.entries(value))
        visit(v, path ? `${path}.${key}` : key, depth + 1);
    } else if (path)
      fields.push({
        path,
        label: humanize(path.split(".").at(-1) ?? path),
        type:
          value === null
            ? "not specified"
            : typeof value === "number"
              ? "number"
              : typeof value === "boolean"
                ? "yes / no"
                : "text",
      });
  }
  visit(body, "", 0);
  return { fields, exampleOnly };
}
export function plainDescription(request: RequestItem): string {
  return requestDescription(request)
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800);
}
