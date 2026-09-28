import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Sparkles,
  ArrowUpRight,
  ArrowDownToLine,
  Upload,
  Plus,
  Send,
  Square,
  Layers,
  Braces,
  Settings2,
  Clock,
  Trash2,
  Copy,
  Check,
  ChevronRight,
  Terminal,
  Search,
  Save,
  X,
  LockKeyhole,
} from "lucide-react";
import {
  starter,
  newRequest,
  uid,
  methods,
  pretty,
  type Workspace,
  type RequestItem,
  type Row,
  type Environment,
  type Fixture,
  type ResponseData,
  type HistoryEntry,
} from "./model";
import { parseImportAsync } from "./import-client";
import RequestGroups from "./RequestGroups";

import WorkflowAssistant from "./WorkflowAssistant";

type View = "requests" | "environments" | "fixtures" | "history" | "workflows";
type Result = { data?: ResponseData; error?: string; loading?: boolean };
const native = isTauri();
export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [view, setView] = useState<View>("requests"),
    [selected, setSelected] = useState(""),
    [envId, setEnvId] = useState(""),
    [tab, setTab] = useState("headers"),
    [responseTab, setResponseTab] = useState("body"),
    [query, setQuery] = useState(""),
    [visibleCount, setVisibleCount] = useState(100),
    [importing, setImporting] = useState(false),
    [results, setResults] = useState<Record<string, Result>>({}),
    [history, setHistory] = useState<HistoryEntry[]>([]),
    [notice, setNotice] = useState(""),
    [saveStatus, setSaveStatus] = useState("Loading"),
    [exportScope, setExportScope] = useState<"workspace" | "item" | null>(null),
    [includeSecrets, setIncludeSecrets] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false),
    [importPreview, setImportPreview] = useState<Workspace | null>(null),
    [openTabs, setOpenTabs] = useState<string[]>([]);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const currentRef = useRef(workspace);
  currentRef.current = workspace;
  const revision = useRef(0),
    saveQueue = useRef<Promise<unknown>>(Promise.resolve()),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    calls = useRef(new Map<string, string>());
  const notify = (message: string) => setNotice(message);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    if (!native) {
      setSaveStatus("Desktop app required");
      return;
    }
    invoke<Workspace | null>("load_workspace")
      .then((data) => {
        const w = data ?? starter();
        setWorkspace(w);
        setSelected(w.requests[0]?.id ?? "");
        setOpenTabs(w.requests[0] ? [w.requests[0].id] : []);
        setEnvId(w.environments[0]?.id ?? "");
        setSaveStatus("Saved locally");
        if (!data) void save(w, 0);
      })
      .catch((e) => notify(`Could not load workspace: ${e}`));
    void invoke<HistoryEntry[]>("load_history")
      .then(setHistory)
      .catch((e) => notify(String(e)));
  }, []);
  function save(w: Workspace, version: number) {
    setSaveStatus("Saving…");
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => invoke<Workspace>("save_workspace", { workspace: w }))
      .then((clean) => {
        if (version === revision.current) {
          setWorkspace(clean as Workspace);
          setSaveStatus("Saved locally");
        }
        return true;
      })
      .catch((e) => {
        setSaveStatus("Save failed");
        notify(`Could not save: ${e}`);
        return false;
      });
    return saveQueue.current as Promise<boolean>;
  }
  function update(fn: (w: Workspace) => Workspace) {
    const w = fn(currentRef.current!);
    currentRef.current = w;
    setWorkspace(w);
    const rev = ++revision.current;
    setSaveStatus("Unsaved changes");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(w, rev), 400);
  }
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    if (currentRef.current)
      return await save(currentRef.current, revision.current);
    return true;
  }
  flushRef.current = flush;
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    const win = getCurrentWindow();
    void win
      .onCloseRequested(async (event) => {
        event.preventDefault();
        if (await flushRef.current()) await win.destroy();
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      });
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  const request = workspace?.requests.find((r) => r.id === selected),
    environment = workspace?.environments.find((e) => e.id === selected),
    fixture = workspace?.fixtures.find((f) => f.id === selected);
  const active =
    view === "requests"
      ? request
      : view === "environments"
        ? environment
        : fixture;
  const editRequest = (patch: Partial<RequestItem>) =>
    update((w) => ({
      ...w,
      requests: w.requests.map((r) =>
        r.id === selected ? { ...r, ...patch } : r,
      ),
    }));
  const editEnvironment = (patch: Partial<Environment>) =>
    update((w) => ({
      ...w,
      environments: w.environments.map((e) =>
        e.id === selected ? { ...e, ...patch } : e,
      ),
    }));
  const editFixture = (patch: Partial<Fixture>) =>
    update((w) => ({
      ...w,
      fixtures: w.fixtures.map((f) =>
        f.id === selected ? { ...f, ...patch } : f,
      ),
    }));
  function select(nextView: View, id?: string) {
    setView(nextView);
    if (nextView !== view) {
      setQuery("");
      setVisibleCount(100);
    }
    const list =
      nextView === "history" || nextView === "workflows"
        ? []
        : (workspace?.[nextView] ?? []);
    const next = id ?? list[0]?.id ?? "";
    setSelected(next);
    if (nextView === "requests" && next)
      setOpenTabs((t) => (t.includes(next) ? t : [...t, next]));
  }
  function add() {
    if (view === "requests") {
      const r = newRequest();
      update((w) => ({ ...w, requests: [...w.requests, r] }));
      select("requests", r.id);
    }
    if (view === "environments") {
      const e = { id: uid(), name: "New environment", variables: [] };
      update((w) => ({ ...w, environments: [...w.environments, e] }));
      setSelected(e.id);
    }
    if (view === "fixtures") {
      const f: Fixture = {
        id: uid(),
        name: "New fixture",
        kind: "request",
        body: "{}",
      };
      update((w) => ({ ...w, fixtures: [...w.fixtures, f] }));
      setSelected(f.id);
    }
  }
  async function send() {
    if (!request || !workspace) return;
    if (request.importIssues?.length) {
      notify("Review this request’s imported Postman features before sending.");
      return;
    }
    const id = request.id;
    if (calls.current.has(id)) {
      await invoke("cancel_request", { callId: calls.current.get(id) }).catch(
        (e) => notify(String(e)),
      );
      return;
    }
    const callId = uid();
    calls.current.set(id, callId);
    setResults((r) => ({ ...r, [id]: { loading: true } }));
    try {
      const data = await invoke<ResponseData>("send_request", {
        callId,
        request,
        environment: workspace.environments.find((e) => e.id === envId) ?? null,
      });
      setResults((r) => ({ ...r, [id]: { data } }));
      setHistory(await invoke<HistoryEntry[]>("load_history"));
    } catch (e) {
      setResults((r) => ({ ...r, [id]: { error: String(e) } }));
    } finally {
      calls.current.delete(id);
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "Enter" &&
        view === "requests"
      ) {
        e.preventDefault();
        void send();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void flush();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  async function startImport() {
    if (importing) return;
    setImporting(true);
    try {
      const text = await invoke<string | null>("import_file");
      if (text !== null) setImportPreview(await parseImportAsync(text));
    } catch (e) {
      notify(`Import failed: ${e}`);
    } finally {
      setImporting(false);
    }
  }
  function finishImport() {
    if (!importPreview) return;
    update((w) => ({
      ...w,
      requests: [...w.requests, ...importPreview.requests],
      environments: [...w.environments, ...importPreview.environments],
      fixtures: [...w.fixtures, ...importPreview.fixtures],
    }));
    if (importPreview.requests[0])
      select("requests", importPreview.requests[0].id);
    else if (importPreview.environments[0])
      select("environments", importPreview.environments[0].id);
    else if (importPreview.fixtures[0])
      select("fixtures", importPreview.fixtures[0].id);
    setImportPreview(null);
    notify("Import added to your workspace.");
  }
  async function doExport() {
    if (!workspace) return;
    const out =
      exportScope === "workspace"
        ? workspace
        : {
            format: "requestbench",
            version: 1,
            requests: view === "requests" && request ? [request] : [],
            environments:
              view === "environments" && environment ? [environment] : [],
            fixtures: view === "fixtures" && fixture ? [fixture] : [],
          };
    try {
      await parseImportAsync(JSON.stringify(out));
      const saved = await invoke<boolean>("export_file", {
        workspace: out,
        includeSecrets,
      });
      if (saved) {
        setExportScope(null);
        notify("JSON export saved.");
      }
    } catch (e) {
      notify(`Export failed: ${e}`);
    }
  }
  function saveFixture(body: string, kind: "request" | "response") {
    try {
      JSON.parse(body);
      const f = {
        id: uid(),
        name: `${request?.name ?? "New"} ${kind === "request" ? "body" : "response"}`,
        kind,
        body: pretty(body),
      };
      update((w) => ({ ...w, fixtures: [...w.fixtures, f] }));
      notify("Saved to fixtures.");
    } catch {
      notify("Fixtures must contain valid JSON.");
    }
  }
  function remove() {
    if (view === "history" || view === "workflows") return;
    update((w) => ({ ...w, [view]: w[view].filter((x) => x.id !== selected) }));
    setOpenTabs((t) => t.filter((x) => x !== selected));
    setSelected("");
    setDeleteOpen(false);
  }
  if (!native)
    return (
      <div className="launch-message">
        <Terminal size={36} />
        <h1>Open Requestbench on your desktop</h1>
        <p>
          This interface uses the native Rust request engine and local SQLite
          workspace.
        </p>
        <code>npm start</code>
        <p>Run from the Requestbench project folder.</p>
      </div>
    );
  if (!workspace)
    return (
      <div className="launch-message">
        <Terminal size={36} />
        <h1>Opening your workspace…</h1>
        {notice && <p role="alert">{notice}</p>}
      </div>
    );
  const result = results[selected];
  const filteredItems =
    view === "history" || view === "workflows"
      ? []
      : workspace[view].filter((x) =>
          x.name.toLowerCase().includes(query.toLowerCase()),
        );
  return (
    <>
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">
            <Terminal size={21} />
          </span>
          Requestbench<span className="desktop-badge">DESKTOP</span>
        </div>
        <div className="header-actions">
          <span
            className={`save-status ${saveStatus === "Save failed" ? "error-text" : ""}`}
          >
            {saveStatus === "Saved locally" && <Check size={13} />} {saveStatus}
          </span>
          <button
            onClick={startImport}
            disabled={importing}
            aria-busy={importing}
          >
            <Upload size={15} /> {importing ? "Reading collection…" : "Import"}
          </button>
          <button
            onClick={() => {
              setExportScope("workspace");
              setIncludeSecrets(false);
            }}
          >
            <ArrowDownToLine size={15} /> Export workspace
          </button>
        </div>
      </header>
      <div className="shell">
        <aside>
          <div className="workspace-label">PERSONAL WORKSPACE</div>
          <nav>
            {(
              [
                { id: "requests", label: "Requests", icon: ArrowUpRight },
                { id: "environments", label: "Environments", icon: Settings2 },
                { id: "fixtures", label: "Fixtures", icon: Braces },
                { id: "history", label: "History", icon: Clock },
                {
                  id: "workflows",
                  label: "Workflow assistant",
                  icon: Sparkles,
                },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={view === id ? "active" : ""}
                onClick={() => select(id)}
              >
                <Icon size={17} />
                {label}
                <span>
                  {id === "history"
                    ? history.length
                    : id === "workflows"
                      ? ""
                      : workspace[id].length}
                </span>
              </button>
            ))}
          </nav>
          {view !== "history" && view !== "workflows" && (
            <>
              <div className="list-heading">
                <span>
                  {view === "requests" ? "COLLECTIONS" : view.toUpperCase()}
                </span>
                <button
                  className="icon-button"
                  aria-label="Add item"
                  onClick={add}
                >
                  <Plus size={18} />
                </button>
              </div>
              <label className="search">
                <Search size={14} />
                <input
                  aria-label="Search items"
                  placeholder={
                    view === "requests"
                      ? "Find APIs or categories…"
                      : `Find ${view}…`
                  }
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setVisibleCount(100);
                  }}
                />
              </label>
              <div className="item-list">
                {view === "requests" ? (
                  <RequestGroups
                    requests={workspace.requests}
                    selected={selected}
                    query={query}
                    onSelect={(id) => select("requests", id)}
                  />
                ) : (
                  <>
                    {filteredItems.slice(0, visibleCount).map((item) => (
                      <button
                        key={item.id}
                        className={`item ${selected === item.id ? "selected" : ""}`}
                        onClick={() => select(view, item.id)}
                      >
                        {view === "fixtures" ? (
                          <Braces size={15} />
                        ) : (
                          <Settings2 size={15} />
                        )}
                        <span className="item-label">{item.name}</span>
                      </button>
                    ))}
                    {filteredItems.length > visibleCount && (
                      <button
                        className="text-button"
                        onClick={() => setVisibleCount((n) => n + 100)}
                      >
                        Show next{" "}
                        {Math.min(100, filteredItems.length - visibleCount)} ·{" "}
                        {filteredItems.length.toLocaleString()} total
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
          <div className="sidebar-foot">
            <LockKeyhole size={14} />
            <div>
              Local by design<small>SQLite workspace · Rust engine</small>
            </div>
          </div>
        </aside>
        <main>
          {view === "requests" && openTabs.length > 0 && (
            <div className="request-tabs">
              {openTabs
                .map((id) => workspace.requests.find((r) => r.id === id))
                .filter(Boolean)
                .map((r) => (
                  <div
                    key={r!.id}
                    className={selected === r!.id ? "active" : ""}
                  >
                    <button onClick={() => select("requests", r!.id)}>
                      <span className={`method ${r!.method.toLowerCase()}`}>
                        {r!.method}
                      </span>
                      {r!.name}
                    </button>
                    <button
                      aria-label={`Close ${r!.name}`}
                      onClick={() => {
                        const remaining = openTabs.filter((id) => id !== r!.id);
                        setOpenTabs(remaining);
                        if (selected === r!.id)
                          setSelected(remaining.at(-1) ?? "");
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
            </div>
          )}
          <div hidden={view !== "workflows"}>
            <WorkflowAssistant
              requests={workspace.requests}
              results={results}
              fixtures={workspace.fixtures}
              onOpenRequest={(id) => select("requests", id)}
            />
          </div>
          <div className="main-content" hidden={view === "workflows"}>
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {view === "requests"
                    ? "BUILD · SEND · INSPECT"
                    : view === "environments"
                      ? "VARIABLES & CREDENTIALS"
                      : view === "fixtures"
                        ? "REUSABLE JSON"
                        : "RECENT REQUESTS"}
                </div>
                <h1>
                  {view === "requests"
                    ? "Make the connection."
                    : view === "environments"
                      ? "One request. Any environment."
                      : view === "fixtures"
                        ? "Good data, ready to reuse."
                        : "Your last 100 connections."}
                </h1>
              </div>
              {view === "requests" && (
                <label className="env-select">
                  <Settings2 size={16} />
                  <select
                    aria-label="Active environment"
                    value={envId}
                    onChange={(e) => setEnvId(e.target.value)}
                  >
                    <option value="">No environment</option>
                    {workspace.environments.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {view === "history" ? (
              <div className="history">
                <p className="hint">
                  Status and timing only. Credentials, request URLs, and
                  response bodies are not stored in history.
                </p>
                {history.length === 0 ? (
                  <Empty
                    title="Your history starts with a request."
                    text="Send a request to see its result here."
                  />
                ) : (
                  history.map((h) => (
                    <div key={h.id} className="history-row">
                      <span className={`method ${h.method.toLowerCase()}`}>
                        {h.method}
                      </span>
                      <strong>{h.name}</strong>
                      <span
                        className={
                          h.status < 400 ? "success-text" : "error-text"
                        }
                      >
                        {h.status}
                      </span>
                      <span>{h.duration} ms</span>
                      <time>{new Date(h.at * 1000).toLocaleString()}</time>
                    </div>
                  ))
                )}
              </div>
            ) : !active ? (
              <Empty
                title="A fresh page."
                text={`Select an item or add a new ${view === "requests" ? "request" : view === "environments" ? "environment" : "fixture"} to get started.`}
              />
            ) : (
              <>
                <div className="item-title">
                  <input
                    aria-label="Item name"
                    value={active.name}
                    onChange={(e) =>
                      view === "requests"
                        ? editRequest({ name: e.target.value })
                        : view === "environments"
                          ? editEnvironment({ name: e.target.value })
                          : editFixture({ name: e.target.value })
                    }
                  />
                  <button
                    className="icon-button"
                    title="Save now"
                    aria-label="Save now"
                    onClick={() => void flush()}
                  >
                    <Save size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title="Export item"
                    aria-label="Export item"
                    onClick={() => {
                      setExportScope("item");
                      setIncludeSecrets(false);
                    }}
                  >
                    <ArrowDownToLine size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title="Delete item"
                    aria-label="Delete item"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {view === "requests" && request && (
                  <>
                    {!!request.importIssues?.length && (
                      <section className="import-warning" role="note">
                        <strong>Imported features need review</strong>
                        <ul>
                          {request.importIssues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                        <p>
                          Sending is paused to avoid changing the original
                          request’s behavior. Configure the body and
                          authentication, then explicitly use it as a manual
                          request.
                        </p>
                        <button
                          onClick={() => editRequest({ importIssues: [] })}
                        >
                          Use current configuration without Postman features
                        </button>
                      </section>
                    )}
                    {request.postmanSource && (
                      <details className="import-source">
                        <summary>Original Postman request and scripts</summary>
                        <pre>
                          {JSON.stringify(request.postmanSource, null, 2)}
                        </pre>
                      </details>
                    )}
                    <div className="url-bar">
                      <select
                        aria-label="HTTP method"
                        className={`method-select ${request.method.toLowerCase()}`}
                        value={request.method}
                        onChange={(e) =>
                          editRequest({ method: e.target.value })
                        }
                      >
                        {methods.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                      <input
                        aria-label="Request URL"
                        placeholder="https://api.example.com/v1/users"
                        value={request.url}
                        onChange={(e) => editRequest({ url: e.target.value })}
                      />
                      <button
                        className="primary send"
                        onClick={() => void send()}
                      >
                        {result?.loading ? (
                          <>
                            <Square size={14} /> Cancel
                          </>
                        ) : (
                          <>
                            Send <Send size={15} />
                          </>
                        )}
                      </button>
                    </div>
                    <div className="request-meta">
                      <label>
                        Collection{" "}
                        <input
                          aria-label="Collection name"
                          placeholder="Unfiled"
                          value={request.folder}
                          onChange={(e) =>
                            editRequest({ folder: e.target.value })
                          }
                        />
                      </label>
                      <span>⌘ / Ctrl + Enter to send</span>
                    </div>
                    <div className="tabs">
                      {["headers", "body", "authorization"].map((t) => (
                        <button
                          key={t}
                          className={tab === t ? "active" : ""}
                          onClick={() => setTab(t)}
                        >
                          {t === "headers"
                            ? `Headers${request.headers.length ? " · " + request.headers.length : ""}`
                            : t === "body"
                              ? "Body"
                              : "Authorization"}
                        </button>
                      ))}
                    </div>
                    <div className="request-pane">
                      {tab === "headers" && (
                        <Rows
                          rows={request.headers}
                          onChange={(headers) => editRequest({ headers })}
                        />
                      )}
                      {tab === "body" && (
                        <>
                          <div className="toolbar">
                            <select
                              aria-label="Load request fixture"
                              value=""
                              onChange={(e) => {
                                const f = workspace.fixtures.find(
                                  (f) => f.id === e.target.value,
                                );
                                if (f) {
                                  editRequest({ body: f.body });
                                  notify("Fixture copied into request body.");
                                }
                              }}
                            >
                              <option value="">Load a fixture…</option>
                              {workspace.fixtures
                                .filter((f) => f.kind === "request")
                                .map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.name}
                                  </option>
                                ))}
                            </select>
                            <div className="actions">
                              <button
                                onClick={() =>
                                  saveFixture(request.body, "request")
                                }
                              >
                                Save as fixture
                              </button>
                              <button
                                onClick={() => {
                                  try {
                                    editRequest({
                                      body: JSON.stringify(
                                        JSON.parse(request.body),
                                        null,
                                        2,
                                      ),
                                    });
                                  } catch {
                                    notify("This body is not valid JSON.");
                                  }
                                }}
                              >
                                Format JSON
                              </button>
                            </div>
                          </div>
                          <textarea
                            className="code-editor"
                            spellCheck={false}
                            aria-label="Request body"
                            value={request.body}
                            onChange={(e) =>
                              editRequest({ body: e.target.value })
                            }
                            placeholder={'{\n  "message": "Hello, world"\n}'}
                          />
                          <p className="hint">
                            Raw body · {"{{variables}}"} supported · GET and
                            HEAD omit the body.
                          </p>
                        </>
                      )}
                      {tab === "authorization" && (
                        <div className="auth-panel">
                          <label>
                            Authentication
                            <select
                              aria-label="Authentication type"
                              value={request.authType}
                              onChange={(e) =>
                                editRequest({
                                  authType: e.target
                                    .value as RequestItem["authType"],
                                })
                              }
                            >
                              <option value="none">No auth</option>
                              <option value="bearer">Bearer token</option>
                              <option value="basic">Basic auth</option>
                            </select>
                          </label>
                          {request.authType === "bearer" && (
                            <label>
                              Token
                              <input
                                aria-label="Bearer token"
                                type="password"
                                placeholder="{{api_token}}"
                                value={request.bearer}
                                onChange={(e) =>
                                  editRequest({ bearer: e.target.value })
                                }
                              />
                            </label>
                          )}
                          {request.authType === "basic" && (
                            <>
                              <label>
                                Username
                                <input
                                  aria-label="Basic auth username"
                                  value={request.basicUser}
                                  onChange={(e) =>
                                    editRequest({ basicUser: e.target.value })
                                  }
                                />
                              </label>
                              <label>
                                Password
                                <input
                                  aria-label="Basic auth password"
                                  type="password"
                                  placeholder="{{password}}"
                                  value={request.basicPassword}
                                  onChange={(e) =>
                                    editRequest({
                                      basicPassword: e.target.value,
                                    })
                                  }
                                />
                              </label>
                            </>
                          )}
                          <p className="hint">
                            Use secret environment variables for credentials.
                            Literal values entered here are stored and exported
                            as written.
                          </p>
                        </div>
                      )}
                    </div>
                    <section className="response">
                      <div className="response-heading">
                        <span>Response</span>
                        {result?.data ? (
                          <div className="metrics">
                            <strong
                              className={
                                result.data.status < 400
                                  ? "success-text"
                                  : "error-text"
                              }
                            >
                              {result.data.status} {result.data.statusText}
                            </strong>
                            <span>{result.data.duration} ms</span>
                            <span>
                              {(result.data.size / 1024).toFixed(2)} KB
                            </span>
                            <button
                              onClick={() =>
                                saveFixture(result.data!.body, "response")
                              }
                            >
                              Save fixture
                            </button>
                          </div>
                        ) : (
                          <small>
                            {result?.loading
                              ? "Rust engine is working…"
                              : "Ready when you are"}
                          </small>
                        )}
                      </div>
                      {result?.loading ? (
                        <Empty
                          title="Connecting…"
                          text="You can cancel this request. Timeout: 30 seconds."
                        />
                      ) : result?.error ? (
                        <div role="alert" className="request-error">
                          {result.error}
                        </div>
                      ) : result?.data ? (
                        <>
                          <div className="response-toolbar">
                            <div className="tabs">
                              {["body", "headers"].map((t) => (
                                <button
                                  key={t}
                                  className={responseTab === t ? "active" : ""}
                                  onClick={() => setResponseTab(t)}
                                >
                                  {t === "body" ? "Body" : "Headers"}
                                </button>
                              ))}
                            </div>
                            <button
                              className="icon-button"
                              aria-label="Copy response"
                              onClick={() =>
                                navigator.clipboard
                                  .writeText(result.data!.body)
                                  .then(() => notify("Response copied."))
                                  .catch(() =>
                                    notify(
                                      "Clipboard unavailable. Select and copy the response text.",
                                    ),
                                  )
                              }
                            >
                              <Copy size={15} />
                            </button>
                          </div>
                          <pre>
                            {responseTab === "body"
                              ? pretty(result.data.body) || "(empty body)"
                              : result.data.headers
                                  .map(([k, v]) => `${k}: ${v}`)
                                  .join("\n")}
                          </pre>
                        </>
                      ) : (
                        <Empty
                          title="Your next response starts here."
                          text="Send a request to inspect its status, headers, and body."
                        />
                      )}
                    </section>
                  </>
                )}
                {view === "environments" && environment && (
                  <>
                    <p className="intro">
                      Reference variables with{" "}
                      <code>{"{{variable_name}}"}</code> in your requests.
                      Secret values are kept in your OS credential store and
                      excluded from exports by default.
                    </p>
                    <Rows
                      rows={environment.variables}
                      variables
                      onChange={(variables) => editEnvironment({ variables })}
                      onClearSecret={async (row) => {
                        try {
                          await invoke("clear_secret", {
                            environmentId: environment.id,
                            key: row.key,
                          });
                          editEnvironment({
                            variables: environment.variables.map((r) =>
                              r === row
                                ? { ...r, value: "", hasSecret: false }
                                : r,
                            ),
                          });
                          notify("Saved secret cleared.");
                        } catch (e) {
                          notify(String(e));
                        }
                      }}
                    />
                    <p className="hint">
                      A blank secret field marked “Stored securely” keeps its
                      existing value. Enter a new value to replace it.
                    </p>
                  </>
                )}
                {view === "fixtures" && fixture && (
                  <>
                    <div className="toolbar">
                      <select
                        aria-label="Fixture type"
                        value={fixture.kind}
                        onChange={(e) =>
                          editFixture({
                            kind: e.target.value as Fixture["kind"],
                          })
                        }
                      >
                        <option value="request">Request body</option>
                        <option value="response">Response sample</option>
                      </select>
                      <button
                        onClick={() => {
                          try {
                            editFixture({
                              body: JSON.stringify(
                                JSON.parse(fixture.body),
                                null,
                                2,
                              ),
                            });
                          } catch {
                            notify("Fixture is not valid JSON.");
                          }
                        }}
                      >
                        Format JSON
                      </button>
                    </div>
                    <textarea
                      className="code-editor fixture-editor"
                      spellCheck={false}
                      aria-label="Fixture JSON"
                      value={fixture.body}
                      onChange={(e) => editFixture({ body: e.target.value })}
                    />
                    <p className="hint">
                      Request fixtures can be loaded from the Body tab. Response
                      samples are saved examples, not mock endpoints.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
          <footer>
            <span>
              <Terminal size={13} /> Rust request engine
            </span>
            <span>On your device. Under your control.</span>
            <span>Requestbench 0.4.1</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {exportScope && (
        <Modal
          title="Share your workspace"
          onClose={() => setExportScope(null)}
        >
          <p>
            Save{" "}
            {exportScope === "workspace"
              ? "requests, environments, and fixtures"
              : "this item"}{" "}
            as a portable JSON file.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeSecrets}
              onChange={(e) => setIncludeSecrets(e.target.checked)}
            />
            Include secret environment values
          </label>
          <p className="hint">
            Secret variables are blank by default. Literal credentials in URLs,
            headers, authentication, bodies, or fixtures export as written.
          </p>
          <div className="modal-actions">
            <button onClick={() => setExportScope(null)}>Cancel</button>
            <button className="primary" onClick={() => void doExport()}>
              Save JSON…
            </button>
          </div>
        </Modal>
      )}
      {importPreview && (
        <Modal title="Import JSON" onClose={() => setImportPreview(null)}>
          <p>
            Ready to add {importPreview.requests.length} requests,{" "}
            {importPreview.environments.length} environments, and{" "}
            {importPreview.fixtures.length} fixtures.
          </p>
          <p className="hint">
            Imported items get new IDs. Your existing workspace stays intact.
            Secret variable values will be moved into your credential store.
          </p>
          {importPreview.requests.some((r) => r.importIssues?.length) && (
            <p className="import-warning">
              {
                importPreview.requests.filter((r) => r.importIssues?.length)
                  .length
              }{" "}
              requests contain Postman features that need review before sending.
              Original request details and scripts are preserved; scripts will
              not run.
            </p>
          )}
          <div className="modal-actions">
            <button onClick={() => setImportPreview(null)}>Cancel</button>
            <button className="primary" onClick={finishImport}>
              Add to workspace
            </button>
          </div>
        </Modal>
      )}
      {deleteOpen && (
        <Modal title="Delete this item?" onClose={() => setDeleteOpen(false)}>
          <p>
            “{active?.name}” will be removed from this workspace. Export a copy
            first if you want to keep it.
          </p>
          <div className="modal-actions">
            <button onClick={() => setDeleteOpen(false)}>Keep item</button>
            <button className="danger" onClick={remove}>
              Delete item
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Rows({
  rows,
  onChange,
  variables = false,
  onClearSecret,
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  variables?: boolean;
  onClearSecret?: (row: Row) => void;
}) {
  return (
    <div className="rows">
      <div className="row-labels">
        <span />
        <span>{variables ? "VARIABLE" : "HEADER"}</span>
        <span>VALUE</span>
        {variables && <span>SECRET</span>}
        <span />
      </div>
      {rows.map((row, i) => (
        <div className={`key-row ${variables ? "variable-row" : ""}`} key={i}>
          <input
            type="checkbox"
            aria-label={`Enable row ${i + 1}`}
            checked={row.enabled}
            onChange={(e) =>
              onChange(
                rows.map((r, j) =>
                  j === i ? { ...r, enabled: e.target.checked } : r,
                ),
              )
            }
          />
          <input
            aria-label={`Key ${i + 1}`}
            value={row.key}
            disabled={!!row.hasSecret}
            title={
              row.hasSecret
                ? "Clear the stored secret before renaming this variable"
                : undefined
            }
            placeholder={variables ? "base_url" : "Content-Type"}
            onChange={(e) =>
              onChange(
                rows.map((r, j) =>
                  j === i ? { ...r, key: e.target.value, hasSecret: false } : r,
                ),
              )
            }
          />
          <input
            aria-label={`Value ${i + 1}`}
            type={row.secret ? "password" : "text"}
            placeholder={
              row.secret && row.hasSecret
                ? "Stored securely"
                : variables
                  ? "https://api.example.com"
                  : "application/json"
            }
            value={row.value}
            onChange={(e) =>
              onChange(
                rows.map((r, j) =>
                  j === i ? { ...r, value: e.target.value } : r,
                ),
              )
            }
          />
          {variables && (
            <label className="secret-check">
              <input
                type="checkbox"
                aria-label={`Secret row ${i + 1}`}
                checked={!!row.secret}
                onChange={(e) =>
                  onChange(
                    rows.map((r, j) =>
                      j === i
                        ? { ...r, secret: e.target.checked, hasSecret: false }
                        : r,
                    ),
                  )
                }
              />
              {row.hasSecret && (
                <button
                  className="icon-button"
                  aria-label={`Clear stored secret ${i + 1}`}
                  onClick={() => onClearSecret?.(row)}
                >
                  <LockKeyhole size={13} />
                </button>
              )}
            </label>
          )}
          <button
            className="icon-button"
            aria-label={`Remove row ${i + 1}`}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      {rows.length === 0 && (
        <p className="hint">
          No {variables ? "variables" : "headers"} yet. Add one below.
        </p>
      )}
      <button
        className="text-button"
        onClick={() =>
          onChange([
            ...rows,
            { key: "", value: "", enabled: true, secret: false },
          ])
        }
      >
        <Plus size={14} /> Add {variables ? "variable" : "header"}
      </button>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <div className="empty-symbol">
        <ArrowUpRight size={25} />
      </div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose}>
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
