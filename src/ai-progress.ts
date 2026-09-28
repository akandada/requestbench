export type AiProgress =
  | { phase: "idle" }
  | { phase: "working"; startedAt: number; model: string; count: number }
  | { phase: "success"; steps: number }
  | { phase: "error"; message: string };
export function aiFailure(error: unknown): {
  title: string;
  help: string;
  detail: string;
} {
  const detail = error instanceof Error ? error.message : String(error);
  if (/HTTP 401|^Add your OpenAI API key|credential store/i.test(detail))
    return {
      title: "Could not authenticate with OpenAI",
      help: "Check your API key in AI settings, then retry.",
      detail,
    };
  if (
    /429|quota|rate limit/i.test(detail) &&
    !/HTTP (400|403|404|5\d\d)/.test(detail)
  )
    return {
      title: "OpenAI usage limit reached",
      help: "Check your API quota or wait before retrying.",
      detail,
    };
  if (/403|404/.test(detail))
    return {
      title: "Model access unavailable",
      help: "Check the model name and your account access in AI settings.",
      detail,
    };
  if (/timed out|timeout/i.test(detail))
    return {
      title: "OpenAI request timed out",
      help: "The request took too long. Retry or use local collection search.",
      detail,
    };
  if (/reach OpenAI|connection|network|read AI response/i.test(detail))
    return {
      title: "Connection to OpenAI failed",
      help: "Check your connection and retry. Local collection search works offline.",
      detail,
    };
  if (/HTTP 5\d\d/.test(detail))
    return {
      title: "OpenAI is temporarily unavailable",
      help: "Try again shortly, or use local collection search.",
      detail,
    };
  return {
    title: "Workflow generation failed",
    help: "Review the details, adjust your question or settings, and retry. Your existing workflow is unchanged.",
    detail,
  };
}
