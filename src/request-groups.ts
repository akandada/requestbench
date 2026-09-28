import type { RequestItem } from "./model";

export type RequestGroup = {
  key: string;
  name: string;
  path: string[];
  groups: RequestGroup[];
  requests: RequestItem[];
  count: number;
};

// Postman folder paths have been stored using this separator since version 0.2.
// Splitting only the spaced separator preserves names such as "Billing/API".
export function requestPath(request: RequestItem): string[] {
  return request.folder
    .split(" / ")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function groupRequests(
  requests: RequestItem[],
  query = "",
): RequestGroup[] {
  const roots: RequestGroup[] = [];
  const byPath = new Map<string, RequestGroup>();
  const search = query.trim().toLowerCase();
  for (const request of requests) {
    if (
      search &&
      ![request.name, request.folder, request.method].some((value) =>
        value.toLowerCase().includes(search),
      )
    )
      continue;
    const path = requestPath(request);
    if (!path.length) {
      let group = byPath.get("unfiled");
      if (!group) {
        group = {
          key: "unfiled",
          name: "Unfiled",
          path: [],
          groups: [],
          requests: [],
          count: 0,
        };
        byPath.set(group.key, group);
        roots.push(group);
      }
      group.requests.push(request);
      group.count++;
      continue;
    }
    let siblings = roots;
    let group: RequestGroup | undefined;
    for (let depth = 0; depth < path.length; depth++) {
      const parts = path.slice(0, depth + 1);
      const key = JSON.stringify(parts);
      group = byPath.get(key);
      if (!group) {
        group = {
          key,
          name: path[depth],
          path: parts,
          groups: [],
          requests: [],
          count: 0,
        };
        byPath.set(key, group);
        siblings.push(group);
      }
      group.count++;
      siblings = group.groups;
    }
    group!.requests.push(request);
  }
  return roots;
}
