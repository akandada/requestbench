import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import {
  groupRequests,
  requestPath,
  type RequestGroup,
} from "./request-groups";
import type { RequestItem } from "./model";

function savedExpansion(preferenceKey: string): Record<string, boolean> {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? (Object.fromEntries(
          Object.entries(value).filter(([, v]) => typeof v === "boolean"),
        ) as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}
export default function RequestGroups({
  projectId,
  requests,
  selected,
  query,
  onSelect,
}: {
  projectId: string;
  requests: RequestItem[];
  selected: string;
  query: string;
  onSelect: (id: string) => void;
}) {
  const preferenceKey = `requestbench.expandedGroups.v1.${projectId}`;
  const groups = useMemo(
    () => groupRequests(requests, query),
    [requests, query],
  );
  const [expanded, setExpanded] = useState(() => savedExpansion(preferenceKey));
  const [searchExpansion, setSearchExpansion] = useState<
    Record<string, boolean>
  >({});
  const [limits, setLimits] = useState<Record<string, number>>({});
  const selectedFolder = requests.find((r) => r.id === selected)?.folder;
  useEffect(() => {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(expanded));
    } catch {
      /* Preferences must not block the workspace. */
    }
  }, [expanded]);
  useEffect(() => {
    setSearchExpansion({});
    setLimits({});
  }, [query]);
  useEffect(() => {
    const request = requests.find((r) => r.id === selected);
    if (!request) return;
    const path = requestPath(request);
    const keys = path.length
      ? path.map((_, i) => JSON.stringify(path.slice(0, i + 1)))
      : ["unfiled"];
    setExpanded((previous) => ({
      ...previous,
      ...Object.fromEntries(keys.map((key) => [key, true])),
    }));
    const peers = requests.filter((r) => r.folder === request.folder);
    const index = peers.findIndex((r) => r.id === selected);
    const key = keys.at(-1)!;
    setLimits((previous) => ({
      ...previous,
      [key]: Math.max(previous[key] ?? 100, Math.ceil((index + 1) / 100) * 100),
    }));
  }, [selected, selectedFolder]);
  const searching = !!query.trim();
  function renderGroup(group: RequestGroup, depth: number): React.ReactNode {
    const isOpen = searching
      ? (searchExpansion[group.key] ?? true)
      : (expanded[group.key] ?? depth === 0);
    const limit = limits[group.key] ?? 100;
    return (
      <li className="request-group" key={group.key}>
        <button
          className={`group-toggle ${depth === 0 ? "root-group" : ""}`}
          aria-expanded={isOpen}
          title={group.path.join(" / ") || "Unfiled"}
          onClick={() => {
            const update = searching ? setSearchExpansion : setExpanded;
            update((previous) => ({ ...previous, [group.key]: !isOpen }));
          }}
        >
          <ChevronRight
            size={13}
            className={isOpen ? "group-chevron open" : "group-chevron"}
          />
          {isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
          <span className="group-name">{group.name}</span>
          <span className="group-count" aria-label={`${group.count} requests`}>
            {group.count}
          </span>
        </button>
        {isOpen && (
          <ul className="group-children">
            {group.groups.map((child) => renderGroup(child, depth + 1))}
            {group.requests.slice(0, limit).map((request) => (
              <li key={request.id}>
                <button
                  className={`item grouped-request ${selected === request.id ? "selected" : ""}`}
                  aria-current={selected === request.id ? "page" : undefined}
                  title={`${request.method} ${request.name}`}
                  onClick={() => onSelect(request.id)}
                >
                  <span className={`method ${request.method.toLowerCase()}`}>
                    {request.method}
                  </span>
                  <span className="item-label">{request.name}</span>
                </button>
              </li>
            ))}
            {group.requests.length > limit && (
              <li>
                <button
                  className="text-button group-more"
                  onClick={() =>
                    setLimits((previous) => ({
                      ...previous,
                      [group.key]: limit + 100,
                    }))
                  }
                >
                  Show next {Math.min(100, group.requests.length - limit)}{" "}
                  requests
                </button>
              </li>
            )}
          </ul>
        )}
      </li>
    );
  }
  return (
    <div className="request-groups">
      {groups.length ? (
        <ul className="group-list" aria-label="API collections">
          {groups.map((group) => renderGroup(group, 0))}
        </ul>
      ) : (
        <p className="hint group-empty">
          {query
            ? "No matching APIs or categories."
            : "Add a request to get started."}
        </p>
      )}
    </div>
  );
}
