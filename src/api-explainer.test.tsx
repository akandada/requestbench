import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { describeAction, inputFields, plainDescription } from "./api-explainer";
import { ApiExplainer, ProjectOverview } from "./ApiExplorer";
import { newRequest } from "./model";
test("exploration explains operation and nested inputs without exposing sample values", () => {
  const r = {
    ...newRequest("Create a guest"),
    method: "POST",
    body: '{"personal_info":{"first_name":"PRIVATE_NAME"},"enabled":true}',
  };
  assert.match(describeAction(r).impact, /real action/);
  assert.deepEqual(
    inputFields(r).fields.map((f) => [f.label, f.type]),
    [
      ["First name", "text"],
      ["Enabled", "yes / no"],
    ],
  );
  const html = renderToStaticMarkup(
    <ApiExplainer request={r} onTechnical={() => {}} onWorkflow={() => {}} />,
  );
  assert.doesNotMatch(html, /PRIVATE_NAME/);
  assert.match(html, /not known/);
  assert.match(html, /has not been called/);
  assert.match(html, /Open technical editor/);
  assert.doesNotMatch(html, /button[^>]*>Send/);
});
test("prose examples stay qualified and descriptions are plain text", () => {
  const r = {
    ...newRequest(),
    body: 'Minimum: {"guest_id":"sample"}\nFull: {"extra":true}',
    postmanSource: {
      request: { description: "<b>Find</b> a [guest](https://example.com)." },
      events: [],
      auth: null,
    },
  };
  assert.equal(inputFields(r).exampleOnly, true);
  assert.equal(inputFields(r).fields[0].path, "guest_id");
  assert.equal(plainDescription(r), "Find a guest.");
});
test("an empty project guides import and has no invented capabilities", () => {
  const html = renderToStaticMarkup(
    <ProjectOverview
      project={{
        id: "p",
        name: "New product",
        description: "",
        archived: false,
        requestCount: 0,
        environmentCount: 0,
        fixtureCount: 0,
      }}
      workspace={{
        format: "requestbench",
        version: 1,
        requests: [],
        environments: [],
        fixtures: [],
      }}
      onOpen={() => {}}
      onImport={() => {}}
      onWorkflow={() => {}}
    />,
  );
  assert.match(html, /Import your first collection/);
  assert.match(html, /New product/);
  assert.match(html, /A capability one system/);
});
