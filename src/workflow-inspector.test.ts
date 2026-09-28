import test from "node:test";
import assert from "node:assert/strict";
import { newRequest, parseImport, exportBundle } from "./model";
import {
  responseExamples,
  responseSummary,
  moveWorkflowStep,
} from "./workflow-inspector";
import { stepSpecs } from "./workflow-code";
test("Postman response examples survive Requestbench export/import and remain distinct from live data", () => {
  const imported = parseImport(
    JSON.stringify({
      info: { name: "Example", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
      item: [
        {
          name: "Create profile",
          request: {
            method: "POST",
            url: "{{base}}/profiles",
            body: { mode: "raw", raw: '{"name":"test"}' },
          },
          response: [
            {
              name: "Created",
              code: 201,
              status: "Created",
              header: [{ key: "Content-Type", value: "application/json" }],
              body: '{"profile_id":"example"}',
            },
          ],
        },
      ],
    }),
  );
  const roundtrip = parseImport(JSON.stringify(exportBundle(imported)));
  assert.deepEqual(responseExamples(roundtrip.requests[0]), [
    {
      name: "Created",
      status: 201,
      statusText: "Created",
      headers: [["Content-Type", "application/json"]],
      body: '{"profile_id":"example"}',
    },
  ]);
  assert.equal(
    responseSummary(roundtrip.requests[0]),
    "1 imported response example",
  );
  assert.equal(
    responseSummary(roundtrip.requests[0], {
      data: {
        status: 202,
        statusText: "Accepted",
        headers: [],
        body: "",
        size: 0,
        duration: 20,
      },
    }),
    "Last result: 202 · 20 ms",
  );
});
test("missing and malformed response samples are handled without inventing responses", () => {
  const r = newRequest();
  assert.deepEqual(responseExamples(r), []);
  assert.equal(responseSummary(r), "No captured response");
  r.postmanSource = {
    request: {},
    events: [],
    auth: null,
    responses: [
      null,
      "bad",
      { name: "Empty", header: [null, { key: "x", value: 2 }] },
    ],
  };
  assert.deepEqual(responseExamples(r), [
    { name: "Empty", status: undefined, statusText: "", headers: [], body: "" },
  ]);
  assert.equal(responseSummary(r, { error: "timeout" }), "Last call failed");
});
test("changing sequence changes generated code order without mutating stored requests", () => {
  const requests = [
    { ...newRequest("First"), id: "a" },
    { ...newRequest("Second"), id: "b" },
  ];
  const original = [
    { requestId: "a", reason: "" },
    { requestId: "b", reason: "" },
  ];
  const moved = moveWorkflowStep(original, 1, -1);
  assert.deepEqual(
    original.map((s) => s.requestId),
    ["a", "b"],
  );
  assert.deepEqual(
    stepSpecs(
      { title: "x", summary: "", steps: moved, gaps: [], provider: "local" },
      requests,
    ).map((s) => s.name),
    ["Second", "First"],
  );
  assert.equal(moveWorkflowStep(original, 0, -1), original);
});
