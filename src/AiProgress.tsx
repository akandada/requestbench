import { useEffect, useState } from "react";
import { LoaderCircle, CheckCircle2, AlertCircle } from "lucide-react";
import { aiFailure, type AiProgress as Progress } from "./ai-progress";
export default function AiProgress({
  state,
  onRetry,
  onSettings,
  onLocal,
  onDismiss,
}: {
  state: Progress;
  onRetry: () => void;
  onSettings: () => void;
  onLocal: () => void;
  onDismiss: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (state.phase !== "working") return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state]);
  if (state.phase === "idle") return null;
  if (state.phase === "working") {
    const seconds = Math.max(0, Math.floor((now - state.startedAt) / 1000));
    return (
      <div className="ai-progress working" role="status" aria-live="polite">
        <LoaderCircle className="ai-spinner" size={24} />
        <div>
          <strong>OpenAI is building your workflow…</strong>
          <p>
            Waiting for {state.model} to plan from {state.count} matching APIs.
            Your current workflow stays available below.
          </p>
          <span className="ai-elapsed" aria-live="off">
            {seconds}s elapsed
            {seconds >= 30
              ? " · Still waiting. This can take up to 90 seconds."
              : ""}
          </span>
          <div className="ai-progress-track" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
    );
  }
  if (state.phase === "success")
    return (
      <div className="ai-progress success" role="status">
        <CheckCircle2 size={24} />
        <div>
          <strong>
            {state.steps
              ? "Workflow ready"
              : "OpenAI finished — no matching workflow"}
          </strong>
          <p>
            {state.steps
              ? `${state.steps} API ${state.steps === 1 ? "step is" : "steps are"} ready to review below.`
              : "Review the explanation below or try a more specific question."}
          </p>
          <button onClick={onDismiss}>Dismiss</button>
        </div>
      </div>
    );
  const failure = aiFailure(state.message);
  return (
    <div className="ai-progress failure" role="alert">
      <AlertCircle size={24} />
      <div>
        <strong>{failure.title}</strong>
        <p>{failure.help}</p>
        <details>
          <summary>Error details</summary>
          <pre>{failure.detail}</pre>
        </details>
        <div className="workflow-toolbar">
          <button onClick={onRetry}>Retry OpenAI request</button>
          <button onClick={onSettings}>AI settings</button>
          <button onClick={onLocal}>Use local search</button>
          <button onClick={onDismiss}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}
