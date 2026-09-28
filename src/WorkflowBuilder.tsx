import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Minus,
  Maximize2,
  GripHorizontal,
  ArrowUp,
  ArrowDown,
  Trash2,
} from "lucide-react";
import type { RequestItem, ResponseData, Fixture } from "./model";
import { pretty } from "./model";
import type { WorkflowPlan } from "./workflow";
import {
  responseExamples,
  responseSummary,
  moveWorkflowStep,
} from "./workflow-inspector";
type Result = { data?: ResponseData; error?: string; loading?: boolean };
type Point = { x: number; y: number };
export default function WorkflowBuilder({
  plan,
  requests,
  fixtures,
  results,
  onChange,
  onOpenRequest,
}: {
  plan: WorkflowPlan;
  requests: RequestItem[];
  fixtures: Fixture[];
  results: Record<string, Result>;
  onChange: (plan: WorkflowPlan) => void;
  onOpenRequest: (id: string) => void;
}) {
  const [selected, setSelected] = useState(""),
    [tab, setTab] = useState("request"),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [zoom, setZoom] = useState(1),
    [positions, setPositions] = useState<Record<string, Point>>({}),
    [responseSource, setResponseSource] = useState("live"),
    [reveal, setReveal] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    origin: Point;
  } | null>(null);
  const steps = plan.steps.map((s) => ({
    ...s,
    request: requests.find((r) => r.id === s.requestId),
  }));
  const selectedId = steps.some((s) => s.requestId === selected)
    ? selected
    : (steps[0]?.requestId ?? "");
  const request = requests.find((r) => r.id === selectedId),
    result = results[selectedId];
  const examples = useMemo(
    () => (request ? responseExamples(request) : []),
    [request],
  );
  useEffect(() => {
    setResponseSource(
      results[selectedId]?.data
        ? "live"
        : responseExamples(
              requests.find((r) => r.id === selectedId) ?? ({} as RequestItem),
            ).length
          ? "example:0"
          : "live",
    );
    setReveal(false);
  }, [selectedId]);
  const categories = [...new Set(requests.map((r) => r.folder))];
  const available = requests.filter(
    (r) =>
      !plan.steps.some((s) => s.requestId === r.id) &&
      (!category || r.folder === category) &&
      `${r.name} ${r.method} ${r.url} ${r.folder}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const point = (id: string, index: number) =>
    positions[id] ?? { x: 28 + index * 350, y: 60 };
  const width = Math.max(
    700,
    ...steps.map((s, i) => point(s.requestId, i).x + 335),
  );
  const height = Math.max(
    400,
    ...steps.map((s, i) => point(s.requestId, i).y + 285),
  );
  function select(id: string, nextTab = tab) {
    setSelected(id);
    setTab(nextTab);
  }
  function add(id: string) {
    if (!id) return;
    onChange({
      ...plan,
      steps: [
        ...plan.steps,
        { requestId: id, reason: "Added from the API library." },
      ],
    });
    setSelected(id);
  }
  function changeOrder(delta: number) {
    const index = steps.findIndex((s) => s.requestId === selectedId);
    onChange({ ...plan, steps: moveWorkflowStep(plan.steps, index, delta) });
    setPositions({});
  }
  const selectedIndex = steps.findIndex((s) => s.requestId === selectedId);
  const example = responseSource.startsWith("example:")
    ? examples[Number(responseSource.split(":")[1])]
    : undefined;
  const fixture = responseSource.startsWith("fixture:")
    ? fixtures.find((f) => f.id === responseSource.slice(8))
    : undefined;
  const response = responseSource === "live" ? result?.data : example;
  const sensitive = (key: string) =>
    /authorization|cookie|token|secret|api[-_]?key|password/i.test(key);
  const headerValue = (key: string, value: string) =>
    !reveal && sensitive(key) ? "•••••• (hidden)" : value;
  return (
    <div className="workflow-builder">
      <div className="builder-library">
        <div>
          <strong>API library</strong>
          <span className="hint"> Add any saved API to this workflow</span>
        </div>
        <div className="workflow-toolbar">
          <input
            aria-label="Find workflow API"
            placeholder="Search name, method, URL…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Workflow API category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c || "Unfiled"}
              </option>
            ))}
          </select>
          <select
            aria-label="Add API to workflow"
            value=""
            onChange={(e) => add(e.target.value)}
          >
            <option value="">
              + Add an API ({available.length} available)
            </option>
            {available.map((r) => (
              <option key={r.id} value={r.id}>
                {r.method} · {r.name} · {r.folder}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="builder-toolbar">
        <span>
          {steps.length} API calls · arrows show sequence, not field mappings
        </span>
        <div>
          <button
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.35, z - 0.15))}
          >
            <Minus size={14} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => {
              setPositions({});
              setZoom(
                Math.max(
                  0.35,
                  Math.min(
                    1,
                    (viewport.current?.clientWidth ?? 700) /
                      (steps.length * 350 + 30),
                  ),
                ),
              );
              viewport.current?.scrollTo(0, 0);
            }}
          >
            <Maximize2 size={14} /> Arrange & fit
          </button>
        </div>
      </div>
      <div className="builder-workspace">
        <div
          ref={viewport}
          className="builder-viewport"
          aria-label="Workflow canvas"
          tabIndex={0}
        >
          <div style={{ width: width * zoom, height: height * zoom }}>
            <div
              className="builder-stage"
              style={{ width, height, transform: `scale(${zoom})` }}
            >
              <svg
                className="builder-edges"
                width={width}
                height={height}
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="workflow-arrowhead"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8" fill="#a395f5" />
                  </marker>
                </defs>
                {steps.slice(0, -1).map((s, i) => {
                  const a = point(s.requestId, i),
                    b = point(steps[i + 1].requestId, i + 1);
                  return (
                    <path
                      key={s.requestId}
                      d={`M ${a.x + 300} ${a.y + 122} C ${a.x + 330} ${a.y + 122}, ${b.x - 30} ${b.y + 122}, ${b.x - 7} ${b.y + 122}`}
                      fill="none"
                      stroke="#a395f5"
                      strokeWidth="2"
                      markerEnd="url(#workflow-arrowhead)"
                    />
                  );
                })}
              </svg>
              {!steps.length && (
                <div className="builder-empty">
                  Add an API above to start a workflow.
                </div>
              )}
              {steps.map((s, i) => {
                const r = s.request;
                if (!r)
                  return (
                    <div key={s.requestId}>A saved endpoint was removed.</div>
                  );
                const p = point(s.requestId, i);
                return (
                  <article
                    key={r.id}
                    className={`builder-node ${selectedId === r.id ? "selected" : ""}`}
                    style={{ left: p.x, top: p.y }}
                  >
                    <button
                      className="builder-drag"
                      aria-label={`Select or drag ${r.name}`}
                      onClick={() => select(r.id)}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        select(r.id);
                        e.currentTarget.setPointerCapture(e.pointerId);
                        drag.current = {
                          id: r.id,
                          x: e.clientX,
                          y: e.clientY,
                          origin: p,
                        };
                      }}
                      onPointerMove={(e) => {
                        const d = drag.current;
                        if (!d || d.id !== r.id) return;
                        setPositions((prev) => ({
                          ...prev,
                          [r.id]: {
                            x: Math.max(
                              10,
                              d.origin.x + (e.clientX - d.x) / zoom,
                            ),
                            y: Math.max(
                              10,
                              d.origin.y + (e.clientY - d.y) / zoom,
                            ),
                          },
                        }));
                      }}
                      onPointerUp={() => {
                        drag.current = null;
                      }}
                      onPointerCancel={() => {
                        drag.current = null;
                      }}
                    >
                      <span>
                        {i + 1} · {r.name}
                      </span>
                      <GripHorizontal size={16} />
                    </button>
                    <div className="builder-node-url">
                      <b>{r.method}</b>
                      <code title={r.url}>{r.url}</code>
                    </div>
                    <button
                      className="builder-node-row"
                      onClick={() => select(r.id, "request")}
                    >
                      <span>Request</span>
                      <small>
                        {r.headers.filter((h) => h.enabled).length} headers ·{" "}
                        {r.authType} auth
                      </small>
                    </button>
                    <button
                      className="builder-node-row"
                      onClick={() => select(r.id, "payload")}
                    >
                      <span>Payload</span>
                      <small>
                        {r.body.trim()
                          ? `${r.body.length.toLocaleString()} characters`
                          : "No body"}
                      </small>
                    </button>
                    <button
                      className="builder-node-row"
                      onClick={() => select(r.id, "response")}
                    >
                      <span>Response</span>
                      <small>{responseSummary(r, results[r.id])}</small>
                    </button>
                    {!!r.importIssues?.length && (
                      <div className="builder-review">
                        {r.importIssues.length} import review notes
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </div>
        <section className="builder-inspector" aria-label="API step inspector">
          {request ? (
            <>
              <div className="builder-inspector-heading">
                <span className="eyebrow">STEP {selectedIndex + 1}</span>
                <h3>{request.name}</h3>
                <p className="hint">{request.folder}</p>
                <div className="workflow-toolbar">
                  <button onClick={() => onOpenRequest(request.id)}>
                    Open request editor
                  </button>
                  <button
                    aria-label="Move step earlier"
                    disabled={selectedIndex === 0}
                    onClick={() => changeOrder(-1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    aria-label="Move step later"
                    disabled={selectedIndex === steps.length - 1}
                    onClick={() => changeOrder(1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    aria-label="Remove step from workflow"
                    onClick={() => {
                      onChange({
                        ...plan,
                        steps: plan.steps.filter(
                          (s) => s.requestId !== selectedId,
                        ),
                      });
                      setPositions({});
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div
                className="builder-tabs"
                role="tablist"
                aria-label="Step details"
              >
                {["request", "payload", "response"].map((t) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="builder-detail" role="tabpanel">
                {tab === "request" && (
                  <>
                    <p className="hint">
                      Saved request template. Environment variables are
                      unresolved here.
                    </p>
                    <b>{request.method}</b>
                    <pre>{request.url}</pre>
                    <h4>Headers</h4>
                    {request.headers.length ? (
                      <table>
                        <tbody>
                          {request.headers.map((h, i) => (
                            <tr key={i}>
                              <th>
                                {h.key}
                                {!h.enabled ? " (disabled)" : ""}
                              </th>
                              <td>{headerValue(h.key, h.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="hint">No saved headers</p>
                    )}
                    <label>
                      <input
                        type="checkbox"
                        checked={reveal}
                        onChange={(e) => setReveal(e.target.checked)}
                      />{" "}
                      Reveal sensitive header values
                    </label>
                    <h4>Authentication</h4>
                    <p>
                      {request.authType === "none"
                        ? "No separately configured authentication; check headers."
                        : `${request.authType} — credentials stay in the request editor.`}
                    </p>
                    {steps[selectedIndex]?.reason && (
                      <p className="hint">{steps[selectedIndex].reason}</p>
                    )}
                    {request.importIssues?.map((issue, i) => (
                      <p className="workflow-message" key={i}>
                        {issue}
                      </p>
                    ))}
                  </>
                )}
                {tab === "payload" && (
                  <>
                    <p className="hint">
                      Saved request payload, including any imported comments or
                      examples. Edit it in the request editor.
                    </p>
                    <pre>
                      {request.body.trim()
                        ? pretty(request.body)
                        : "This request has no saved body."}
                    </pre>
                  </>
                )}
                {tab === "response" && (
                  <>
                    <select
                      aria-label="Response source"
                      value={responseSource}
                      onChange={(e) => setResponseSource(e.target.value)}
                    >
                      <option value="live">
                        Last response from this app session
                      </option>
                      {examples.map((x, i) => (
                        <option value={`example:${i}`} key={i}>
                          Imported example · {x.name}
                        </option>
                      ))}
                      {fixtures
                        .filter((f) => f.kind === "response")
                        .map((f) => (
                          <option value={`fixture:${f.id}`} key={f.id}>
                            Fixture · {f.name}
                          </option>
                        ))}
                    </select>
                    {responseSource === "live" && (
                      <p className="hint">
                        Last captured result, not a new call. It may belong to
                        an earlier request configuration. Run from the request
                        editor to refresh.
                      </p>
                    )}
                    {responseSource.startsWith("example:") && (
                      <p className="hint">
                        Imported response example — not a live result.
                      </p>
                    )}
                    {fixture && (
                      <p className="hint">
                        Manually selected response fixture — association with
                        this endpoint is not verified.
                      </p>
                    )}
                    {response ? (
                      <>
                        <div className="builder-response-status">
                          {response.status ?? "Example"} {response.statusText}
                          {"duration" in response
                            ? ` · ${response.duration} ms · ${response.size} bytes`
                            : ""}
                        </div>
                        <h4>Headers</h4>
                        <table>
                          <tbody>
                            {response.headers.map(([key, value], i) => (
                              <tr key={i}>
                                <th>{key}</th>
                                <td>{headerValue(key, value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <h4>Body</h4>
                        <pre>
                          {response.body
                            ? pretty(response.body)
                            : "Empty response body"}
                        </pre>
                      </>
                    ) : fixture ? (
                      <pre>{pretty(fixture.body)}</pre>
                    ) : (
                      <div className="builder-empty">
                        {result?.loading
                          ? "Request in progress…"
                          : result?.error
                            ? `Last call failed: ${result.error}`
                            : "No response captured. Open the request editor to send it, or choose an available example or fixture."}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="builder-empty">
              Select an API node to inspect its request, payload, and response.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
