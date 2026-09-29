import type { WorkflowPlan } from "./workflow";
export type WorkflowDraft = { goal: string; plan: WorkflowPlan | null };
export const draftKey = (projectId: string) =>
  `requestbench.workflowDraft.v1.${projectId}`;
export function readDraft(
  raw: string | null,
  requestIds: Set<string>,
): WorkflowDraft | undefined {
  try {
    const d = JSON.parse(raw ?? "null");
    if (!d || typeof d.goal !== "string") return;
    if (d.plan === null) return { goal: d.goal, plan: null };
    const p = d.plan;
    if (
      !p ||
      typeof p.title !== "string" ||
      typeof p.summary !== "string" ||
      !["local", "openai"].includes(p.provider) ||
      !Array.isArray(p.steps) ||
      !Array.isArray(p.gaps) ||
      !p.gaps.every((g: unknown) => typeof g === "string")
    )
      return;
    const seen = new Set<string>();
    if (
      !p.steps.every(
        (s: any) =>
          s &&
          typeof s.requestId === "string" &&
          typeof s.reason === "string" &&
          !seen.has(s.requestId) &&
          !!seen.add(s.requestId),
      )
    )
      return;
    const steps = p.steps.filter((s: any) => requestIds.has(s.requestId));
    return {
      goal: d.goal,
      plan: {
        title: p.title,
        summary: p.summary,
        provider: p.provider,
        steps,
        gaps:
          steps.length === p.steps.length
            ? p.gaps
            : [
                ...p.gaps,
                "Some saved endpoints were removed from this project; those workflow steps were omitted.",
              ],
      },
    };
  } catch {
    return;
  }
}
