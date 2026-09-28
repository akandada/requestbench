import test from "node:test";
import assert from "node:assert/strict";
import { draftKey, readDraft } from "./workflow-draft";
test("workflow drafts are keyed by project and drop removed endpoints when restored", () => {
  assert.notEqual(draftKey("a"), draftKey("b"));
  const draft = {
    goal: "create profile",
    plan: {
      title: "Profile",
      summary: "Example",
      provider: "local",
      steps: [
        { requestId: "a", reason: "Create" },
        { requestId: "b", reason: "Update" },
      ],
      gaps: [],
    },
  };
  assert.deepEqual(
    readDraft(JSON.stringify(draft), new Set(["a", "b"])),
    draft,
  );
  assert.deepEqual(
    readDraft(JSON.stringify(draft), new Set(["a"]))?.plan?.steps,
    [draft.plan.steps[0]],
  );
  assert.match(
    readDraft(JSON.stringify(draft), new Set(["a"]))!.plan!.gaps[0],
    /removed/,
  );
  assert.equal(readDraft("{broken", new Set()), undefined);
});
