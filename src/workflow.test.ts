import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { newRequest } from "./model";
import {
  localWorkflow,
  rankEndpoints,
  safeCatalog,
  validateAiPlan,
} from "./workflow";
import { stepSpecs, pythonCode, typescriptCode } from "./workflow-code";
const create = {
  ...newRequest("Create a guest"),
  method: "POST",
  url: "{{api_url}}/v1/guests",
  folder: "Collection / Guests",
  body: '{ // example\n "personal_info":{"first_name":"PRIVATE_PERSON"},"active":true,"age":42}',
  authType: "bearer" as const,
  bearer: "PRIVATE_TOKEN",
};
const update = {
  ...newRequest("Update a guest"),
  method: "PUT",
  url: "{{api_url}}/v1/guests/{{guest_id}}",
  folder: "Collection / Guests",
  body: '{"name":"PRIVATE_PERSON"}',
};
const question = "Show me APIs that allow me to create and update a profile";
test("profile intent selects create then update guests and deduplicates repeated imports", () => {
  const list = [
    create,
    update,
    { ...create, id: "duplicate" },
    {
      ...newRequest("Update guest password"),
      method: "PUT",
      folder: "Collection / Guests",
    },
  ];
  const plan = localWorkflow(list, question);
  assert.deepEqual(
    plan.steps.map((s) => s.requestId),
    [create.id, update.id],
  );
  assert.equal(
    rankEndpoints(list, question).filter((c) => c.request.name === create.name)
      .length,
    1,
  );
  assert.match(plan.gaps.join(" "), /interpreted.*guest/);
  assert.equal(localWorkflow(list, "create a spaceship").steps.length, 0);
});
test("AI metadata excludes body samples, auth, and headers; rejects invented endpoints", () => {
  const catalog = safeCatalog(
    rankEndpoints(
      [
        {
          ...create,
          headers: [{ key: "X-Key", value: "PRIVATE_HEADER", enabled: true }],
        },
      ],
      question,
    ),
  );
  assert.doesNotMatch(JSON.stringify(catalog), /PRIVATE/);
  assert.ok(catalog[0].bodyFields.includes("personal_info.first_name:string"));
  assert.throws(
    () =>
      validateAiPlan(
        {
          title: "x",
          summary: "x",
          steps: [{ requestId: "invented", reason: "x" }],
          gaps: [],
        },
        catalog,
      ),
    /unknown/,
  );
});
test("starter code keeps JSONC shape but replaces sample data and blocks unsupported imports", () => {
  const specs = stepSpecs(localWorkflow([create, update], question), [
    create,
    update,
  ]);
  const code = pythonCode(specs) + typescriptCode(specs);
  assert.doesNotMatch(code, /PRIVATE_PERSON|PRIVATE_TOKEN/);
  assert.match(code, /STEP_1_PERSONAL_INFO_FIRST_NAME/);
  assert.match(code, /API_TOKEN/);
  const blocked = {
    ...create,
    importIssues: ["Pre-request script needs review"],
  };
  assert.deepEqual(
    stepSpecs(localWorkflow([blocked], question), [blocked])[0].issues,
    blocked.importIssues,
  );
});
test("generated Python parses and TypeScript compiles; mocked calls preserve ordering, URL encoding and auth", async () => {
  const dir = mkdtempSync(join(tmpdir(), "requestbench-workflow-"));
  try {
    const specs = stepSpecs(localWorkflow([create, update], question), [
      create,
      update,
    ]);
    const py = join(dir, "workflow.py"),
      ts = join(dir, "workflow.ts");
    writeFileSync(py, pythonCode(specs));
    writeFileSync(ts, typescriptCode(specs));
    execFileSync("python3", [
      "-c",
      "import ast,sys; ast.parse(open(sys.argv[1]).read())",
      py,
    ]);
    execFileSync(process.execPath, [
      "node_modules/typescript/bin/tsc",
      "--strict",
      "--noEmit",
      "--skipLibCheck",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--typeRoots",
      join(process.cwd(), "node_modules/@types"),
      ts,
    ]);
    const script = `import runpy,sys,types\ncalls=[]\nclass Response:\n status_code=200\n content=b'{}'\n def raise_for_status(self): pass\n def json(self): return {'guest_key':'abc'}\ndef request(*args,**kwargs):\n calls.append((args,kwargs)); return Response()\nsys.modules['requests']=types.SimpleNamespace(request=request)\nm=runpy.run_path(sys.argv[1])\nassert not calls\nv={'api_url':'https://example.invalid','guest_id':'a/b','API_TOKEN':'fake','STEP_1_PERSONAL_INFO_FIRST_NAME':'Test','STEP_2_NAME':'Test'}\nm['step_1'](v);m['step_2'](v)\nassert calls[0][1]['headers']['Authorization']=='Bearer fake'\nassert calls[1][0][1]=='https://example.invalid/v1/guests/a%2Fb'\ntry: m['step_1']({})\nexcept ValueError: pass\nelse: raise AssertionError('Missing variable accepted')\n`;
    execFileSync("python3", ["-c", script, py]);
    // Transpile to a disposable CommonJS module and mock fetch, never real APIs.
    execFileSync(process.execPath, [
      "node_modules/typescript/bin/tsc",
      "--skipLibCheck",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--typeRoots",
      join(process.cwd(), "node_modules/@types"),
      "--outDir",
      dir,
      ts,
    ]);
    execFileSync(process.execPath, [
      "-e",
      `const calls=[];global.fetch=async (url,options)=>{calls.push({url,options});return new Response('{}',{status:200})};const m=require(process.argv[1]);if(calls.length)throw Error('auto execution');(async()=>{const v={api_url:'https://example.invalid',guest_id:'a/b',API_TOKEN:'fake',STEP_1_PERSONAL_INFO_FIRST_NAME:'Test',STEP_2_NAME:'Test'};await m.step1(v);await m.step2(v);if(calls[1].url!=='https://example.invalid/v1/guests/a%2Fb')throw Error('encoding');if(calls[0].options.headers.get('Authorization')!=='Bearer fake')throw Error('auth');})().catch(e=>{console.error(e);process.exit(1)})`,
      join(dir, "workflow.js"),
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('prose and multiple body examples preserve first JSON shape with an execution guard',()=>{
 const request={...create,body:'Minimum object: {"name":"PRIVATE_PERSON"}\nFull object: {"name":"PRIVATE_PERSON","age":30}'};
 const spec=stepSpecs(localWorkflow([request],'create profile'),[request])[0];
 assert.deepEqual(spec.body,{name:'{{STEP_1_NAME}}'});
 assert.match(spec.issues.join(' '),/first JSON example/);
 assert.doesNotMatch(pythonCode([spec]),/PRIVATE_PERSON/);
});
