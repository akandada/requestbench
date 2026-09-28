import { useEffect, useMemo, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import AiProgress from "./AiProgress";
import type { AiProgress as AiProgressState } from "./ai-progress";
import { draftKey, readDraft } from "./workflow-draft";
import WorkflowBuilder from "./WorkflowBuilder";
import type { RequestItem, ResponseData, Fixture } from "./model";
import {
  localWorkflow,
  rankEndpoints,
  safeCatalog,
  validateAiPlan,
  type WorkflowPlan,
  type SafeEndpoint,
} from "./workflow";
import { stepSpecs, pythonCode, typescriptCode } from "./workflow-code";
export default function WorkflowAssistant({
  projectId,
  onPlanningChange,
  requests,
  results,
  fixtures,
  onOpenRequest,
}: {
  projectId: string;
  onPlanningChange: (busy: boolean) => void;
  requests: RequestItem[];
  results: Record<
    string,
    { data?: ResponseData; error?: string; loading?: boolean }
  >;
  fixtures: Fixture[];
  onOpenRequest: (id: string) => void;
}) {
  const [draft] = useState(() => {
    try {
      return readDraft(
        localStorage.getItem(draftKey(projectId)),
        new Set(requests.map((r) => r.id)),
      );
    } catch {
      return undefined;
    }
  });
  const [goal, setGoal] = useState(
      draft?.goal ?? "Show me the APIs to create and update a profile",
    ),
    [engine, setEngine] = useState("local"),
    [plan, setPlan] = useState<WorkflowPlan | null>(draft?.plan ?? null),
    [language, setLanguage] = useState<"python" | "typescript">("python"),
    [settings, setSettings] = useState(false),
    [key, setKey] = useState(""),
    [hasKey, setHasKey] = useState<boolean | null>(null),
    [model, setModel] = useState("gpt-5-mini"),
    [preview, setPreview] = useState<{
      goal: string;
      catalog: SafeEndpoint[];
    } | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [aiProgress, setAiProgress] = useState<AiProgressState>({
    phase: "idle",
  });
  useEffect(() => {
    try {
      localStorage.setItem(draftKey(projectId), JSON.stringify({ goal, plan }));
    } catch {
      setMessage(
        "This workflow draft could not be saved locally. Export the starter code before switching projects.",
      );
    }
  }, [projectId, goal, plan]);
  useEffect(() => {
    onPlanningChange(aiProgress.phase === "working");
  }, [aiProgress.phase, onPlanningChange]);
  const progressRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(false);
  const lastAttempt = useRef<{
    goal: string;
    catalog: SafeEndpoint[];
    model: string;
  } | null>(null);
  async function generateWorkflow(retry = false) {
    const attempt = retry
      ? lastAttempt.current
      : preview
        ? { ...preview, model }
        : null;
    if (!attempt || pendingRef.current) return;
    pendingRef.current = true;
    lastAttempt.current = attempt;
    setBusy(true);
    setMessage("");
    setAiProgress({
      phase: "working",
      startedAt: Date.now(),
      model: attempt.model,
      count: attempt.catalog.length,
    });
    requestAnimationFrame(() =>
      progressRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      }),
    );
    try {
      const result = await invoke("generate_ai_workflow", attempt);
      const next = validateAiPlan(result, attempt.catalog);
      setPlan(next);
      setPreview(null);
      setAiProgress({ phase: "success", steps: next.steps.length });
    } catch (error) {
      setAiProgress({
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }
  const candidates = useMemo(
    () => rankEndpoints(requests, goal),
    [requests, goal],
  );
  const specs = useMemo(
    () =>
      plan
        ? stepSpecs(
            {
              ...plan,
              steps: plan.steps.filter((s) =>
                requests.some((r) => r.id === s.requestId),
              ),
            },
            requests,
          )
        : [],
    [plan, requests],
  );
  const code =
    language === "python" ? pythonCode(specs) : typescriptCode(specs);
  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  function build() {
    setMessage("");
    setAiProgress({ phase: "idle" });
    if (engine === "local") {
      setPlan(localWorkflow(requests, goal));
      return;
    }
    if (hasKey === false) {
      setSettings(true);
      setMessage(
        "Add your OpenAI API key to enable AI planning. Local search works without a key.",
      );
      return;
    }
    const catalog = safeCatalog(candidates);
    if (!catalog.length) {
      setMessage(
        "No matching endpoints found. Try a resource name from your collection.",
      );
      return;
    }
    setPreview({ goal, catalog });
  }
  return (
    <section className="workflow-assistant">
      <div className="eyebrow">DISCOVER · PLAN · BUILD</div>
      <h1>From intent to API workflow.</h1>
      <p className="hint">
        Ask about your imported APIs. Review a suggested sequence, then export
        starter code.
      </p>
      <label className="workflow-label">
        What do you want to build?
        <textarea
          disabled={aiProgress.phase === "working"}
          aria-label="Workflow goal"
          value={goal}
          maxLength={8000}
          onChange={(e) => setGoal(e.target.value)}
        />
      </label>
      <div className="workflow-toolbar">
        <select
          disabled={aiProgress.phase === "working"}
          aria-label="Workflow engine"
          value={engine}
          onChange={(e) => setEngine(e.target.value)}
        >
          <option value="local">Local collection search (no AI model)</option>
          <option value="openai">OpenAI workflow planning</option>
        </select>
        <button disabled={busy || !goal.trim()} onClick={build}>
          {busy ? "Working…" : "Build workflow"}
        </button>
        <button disabled={busy} onClick={() => setSettings(!settings)}>
          AI settings
        </button>
        <button
          disabled={busy}
          onClick={() =>
            setPlan({
              title: "Custom API workflow",
              summary:
                "Add API calls from your collection and arrange their sequence.",
              steps: [],
              gaps: [],
              provider: "local",
            })
          }
        >
          New blank workflow
        </button>
      </div>
      <div ref={progressRef}>
        <AiProgress
          state={aiProgress}
          onRetry={() => void generateWorkflow(true)}
          onSettings={() => {
            setAiProgress({ phase: "idle" });
            setSettings(true);
          }}
          onDismiss={() => setAiProgress({ phase: "idle" })}
          onLocal={() => {
            setEngine("local");
            setPlan(localWorkflow(requests, lastAttempt.current?.goal ?? goal));
            setPreview(null);
            setAiProgress({ phase: "idle" });
          }}
        />
      </div>
      {message && (
        <p role="status" className="workflow-message">
          {message}
        </p>
      )}
      {settings && (
        <div className="workflow-panel">
          <h2>OpenAI settings</h2>
          <p>
            Your key is stored in macOS Keychain and excluded from workspace
            exports. OpenAI API usage is billed to your account.
          </p>
          <label className="workflow-label">
            Model
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-label="AI model"
            />
          </label>
          <label className="workflow-label">
            API key
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                hasKey ? "Key saved in Keychain" : "Enter your OpenAI API key"
              }
            />
          </label>
          <div className="workflow-toolbar">
            <button
              disabled={busy || !key.trim()}
              onClick={() =>
                void run(async () => {
                  await invoke("save_ai_key", { apiKey: key });
                  setKey("");
                  setHasKey(true);
                  setMessage("API key saved in Keychain.");
                })
              }
            >
              Save key
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const found = await invoke<boolean>("ai_status");
                  setHasKey(found);
                  setMessage(
                    found
                      ? "A saved OpenAI key is available."
                      : "No saved OpenAI key found.",
                  );
                })
              }
            >
              Check saved key
            </button>
            {hasKey && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await invoke("delete_ai_key");
                    setHasKey(false);
                    setMessage("API key removed.");
                  })
                }
              >
                Remove key
              </button>
            )}
            <button onClick={() => setSettings(false)}>Close settings</button>
          </div>
        </div>
      )}
      {preview && (
        <div className="workflow-panel">
          <h2>Review what will be sent to OpenAI</h2>
          <p>
            Your question and up to 40 matching endpoint names, categories, URL
            patterns, and body field names/types will be shared. Header values,
            environment values, body sample values, and scripts are excluded.
            Names and paths may still contain private information.
          </p>
          <details>
            <summary>View exact question and endpoint metadata</summary>
            <pre>{JSON.stringify(preview, null, 2)}</pre>
          </details>
          <div className="workflow-toolbar">
            <button
              disabled={busy}
              onClick={() => void generateWorkflow()}
              aria-busy={aiProgress.phase === "working"}
            >
              {aiProgress.phase === "working"
                ? "Waiting for OpenAI…"
                : "Send to OpenAI"}
            </button>
            <button disabled={busy} onClick={() => setPreview(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {plan && (
        <>
          <div className="workflow-result-heading">
            <h2>{plan.title}</h2>
            <span>{plan.provider === "local" ? "Local search" : "OpenAI"}</span>
          </div>
          <p>{plan.summary}</p>
          <WorkflowBuilder
            plan={plan}
            requests={requests}
            results={results}
            fixtures={fixtures}
            onChange={setPlan}
            onOpenRequest={onOpenRequest}
          />
          {plan.gaps.length > 0 && (
            <ul className="workflow-notes">
              {plan.gaps.map((gap, i) => (
                <li key={i}>{gap}</li>
              ))}
            </ul>
          )}
          {!!specs.length && (
            <div className="workflow-panel">
              <h2>Starter code</h2>
              <p>
                Review payloads and fill variables before calling the generated
                functions. No requests run automatically. Sample strings are
                placeholders; numbers and booleans default to 0 and false.
              </p>
              {specs.some((s) => s.issues.length > 0) && (
                <div className="workflow-message">
                  Some steps require review and are blocked in the generated
                  code:
                  <ul>
                    {specs.flatMap((s) =>
                      s.issues.map((issue, i) => (
                        <li key={s.name + i}>
                          {s.name}: {issue}
                        </li>
                      )),
                    )}
                  </ul>
                </div>
              )}
              <details>
                <summary>
                  Required variables (
                  {new Set(specs.flatMap((s) => s.variables)).size})
                </summary>
                <p className="workflow-variables">
                  {[...new Set(specs.flatMap((s) => s.variables))].join(", ")}
                </p>
              </details>
              <div className="workflow-toolbar">
                <button
                  aria-pressed={language === "python"}
                  onClick={() => setLanguage("python")}
                >
                  Python
                </button>
                <button
                  aria-pressed={language === "typescript"}
                  onClick={() => setLanguage("typescript")}
                >
                  TypeScript
                </button>
                <button
                  onClick={() =>
                    void run(async () => {
                      await navigator.clipboard.writeText(code);
                      setMessage("Starter code copied.");
                    })
                  }
                >
                  Copy code
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (
                        await invoke<boolean>("save_generated_file", {
                          language,
                          contents: code,
                        })
                      )
                        setMessage("Starter code saved.");
                    })
                  }
                >
                  Save .{language === "python" ? "py" : "ts"}
                </button>
              </div>
              <pre className="workflow-code" tabIndex={0}>
                {code}
              </pre>
            </div>
          )}
        </>
      )}
    </section>
  );
}
