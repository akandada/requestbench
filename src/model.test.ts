import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseImport, exportBundle, starter } from "./model.ts";
test("imports the original prototype bundle with fresh IDs", () => {
  const data = parseImport(
    readFileSync(
      new URL("../examples/shared-workspace.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(data.requests.length, 1);
  assert.equal(data.fixtures.length, 2);
  assert.ok(data.requests[0].id);
  assert.equal(data.requests[0].authType, "none");
});
test("export round trip preserves fixtures and strips secrets", () => {
  const w = starter();
  w.environments[0].variables.push({
    key: "token",
    value: "not-a-real-secret",
    secret: true,
    enabled: true,
  });
  const out = parseImport(JSON.stringify(exportBundle(w)));
  assert.equal(out.environments[0].variables[1].value, "");
  assert.deepEqual(
    out.fixtures.map((f) => f.body),
    w.fixtures.map((f) => f.body),
  );
  assert.notEqual(out.requests[0].id, w.requests[0].id);
  assert.equal(w.environments[0].variables[1].value, "not-a-real-secret");
});
test("invalid imports fail without mutating a workspace", () => {
  const w = starter();
  const bad = structuredClone(w);
  (bad.requests[0] as any).headers = [null];
  assert.throws(() => parseImport(JSON.stringify(bad)), /object/);
  assert.equal(w.requests.length, 1);
});
test("Postman folders, bearer auth, raw bodies and variables are preserved", () => {
  const imported = parseImport(
    JSON.stringify({
      info: {
        name: "Example",
        schema:
          "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}" }] },
      variable: [{ key: "base", value: "http://localhost" }],
      item: [
        {
          name: "Users",
          item: [
            {
              name: "Create",
              request: {
                method: "POST",
                url: { raw: "{{base}}/users" },
                body: { mode: "raw", raw: "{}" },
                header: [{ key: "X-Test", value: "yes", disabled: true }],
              },
            },
          ],
        },
      ],
    }),
  );
  assert.equal(imported.requests[0].folder, "Example / Users");
  assert.equal(imported.requests[0].bearer, "{{token}}");
  assert.equal(imported.requests[0].headers[0].enabled, false);
  assert.equal(imported.environments[0].variables[0].key, "base");
});
test("unsupported Postman features are preserved and flagged for review", () => {
  const script = {
    listen: "prerequest",
    script: { exec: ["pm.variables.set('token', 'example');"] },
  };
  const request = {
    method: "POST",
    url: "http://localhost",
    body: {
      mode: "formdata",
      formdata: [{ key: "file", type: "file", src: "sample.txt" }],
    },
  };
  const imported = parseImport(
    JSON.stringify({
      info: {
        schema:
          "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      event: [script],
      item: [{ name: "Upload", request }],
    }),
  );
  assert.equal(imported.requests.length, 1);
  assert.equal(imported.requests[0].importIssues?.length, 2);
  assert.deepEqual(imported.requests[0].postmanSource?.request, request);
  assert.deepEqual(imported.requests[0].postmanSource?.events, [script]);
  const roundTrip = parseImport(JSON.stringify(exportBundle(imported)));
  assert.deepEqual(
    roundTrip.requests[0].postmanSource,
    imported.requests[0].postmanSource,
  );
  assert.deepEqual(
    roundTrip.requests[0].importIssues,
    imported.requests[0].importIssues,
  );
});
test("Postman environments retain secret types and disabled flags", () => {
  const w = parseImport(
    JSON.stringify({
      _postman_variable_scope: "environment",
      name: "Dev",
      values: [
        { key: "token", value: "example", type: "secret", enabled: false },
      ],
    }),
  );
  assert.equal(w.environments[0].variables[0].secret, true);
  assert.equal(w.environments[0].variables[0].enabled, false);
});
test("malformed fixtures are rejected", () => {
  const w = starter();
  w.fixtures[0].body = "not json";
  assert.throws(() => parseImport(JSON.stringify(w)));
});

test("imports a Postman collection over 25 MB with 2500 requests", () => {
  const payload = JSON.stringify({ value: "x".repeat(12_000) });
  const input = JSON.stringify({
    info: {
      name: "Large collection",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: Array.from({ length: 2500 }, (_, i) => ({
      name: `Request ${i}`,
      request: {
        method: "POST",
        url: `https://example.com/items/${i}`,
        body: { mode: "raw", raw: payload },
      },
    })),
  });
  assert.ok(Buffer.byteLength(input) > 25_000_000);
  const w = parseImport(input);
  assert.equal(w.requests.length, 2500);
  assert.equal(w.requests[2499].body, payload);
  assert.equal(w.requests[2499].url, "https://example.com/items/2499");
});
test("large Requestbench exports round-trip all item types without count caps", () => {
  const w = starter();
  w.requests = Array.from({ length: 1100 }, (_, i) => ({
    ...w.requests[0],
    id: `r${i}`,
    name: `Request ${i}`,
  }));
  w.environments = Array.from({ length: 1100 }, (_, i) => ({
    ...w.environments[0],
    id: `e${i}`,
    name: `Environment ${i}`,
  }));
  w.fixtures = Array.from({ length: 1100 }, (_, i) => ({
    ...w.fixtures[0],
    id: `f${i}`,
    name: `Fixture ${i}`,
    body: JSON.stringify({ data: "x".repeat(6000) }),
  }));
  const input = JSON.stringify(exportBundle(w));
  assert.ok(Buffer.byteLength(input) > 5_000_000);
  const imported = parseImport(input);
  assert.equal(imported.requests.length, 1100);
  assert.equal(imported.environments.length, 1100);
  assert.equal(imported.fixtures.length, 1100);
  assert.equal(imported.fixtures[1099].body, w.fixtures[1099].body);
});

test("invalid imported methods are preserved and require explicit correction", () => {
  const input = {
    info: {
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [
      {
        name: "Invalid method",
        request: { method: ">", url: "http://localhost" },
      },
    ],
  };
  const w = parseImport(JSON.stringify(input));
  assert.equal(w.requests[0].method, "GET");
  assert.match(w.requests[0].importIssues![0], /needs correction/);
  assert.deepEqual(w.requests[0].postmanSource?.request, input.item[0].request);
});
