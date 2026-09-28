import test from "node:test";
import assert from "node:assert/strict";
import { groupRequests } from "./request-groups";
import { newRequest } from "./model";
const request = (name: string, folder: string) => ({
  ...newRequest(name),
  folder,
});
test("reconstructs nested categories in collection order without moving requests", () => {
  const requests = [
    request("List guests", "Zenoti API / Guests"),
    request("List employee blocks", "Zenoti API / Employees / BlockOutTimes"),
    request("List employees", "Zenoti API / Employees"),
    request("List room blocks", "Zenoti API / Rooms / BlockOutTimes"),
  ];
  const before = JSON.stringify(requests);
  const roots = groupRequests(requests);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].count, 4);
  assert.deepEqual(
    roots[0].groups.map((g) => g.name),
    ["Guests", "Employees", "Rooms"],
  );
  const employees = roots[0].groups[1];
  assert.equal(employees.count, 2);
  assert.equal(employees.requests[0].id, requests[2].id);
  assert.notEqual(employees.groups[0].key, roots[0].groups[2].groups[0].key);
  assert.equal(JSON.stringify(requests), before);
});
test("category search includes descendants while request search keeps only matches", () => {
  const requests = [
    request("Get hours", "API / Employees"),
    request("Block a shift", "API / Employees / Blocks"),
    request("Create guest", "API / Guests"),
  ];
  const category = groupRequests(requests, "employees");
  assert.equal(category[0].count, 2);
  assert.equal(category[0].groups.length, 1);
  const single = groupRequests(requests, "block a shift");
  assert.equal(single[0].count, 1);
  assert.equal(single[0].groups[0].groups[0].requests[0].name, "Block a shift");
  assert.deepEqual(groupRequests(requests, "no-match"), []);
});
test("unfiled items do not collide with named Unfiled folders or slash names", () => {
  const roots = groupRequests([
    request("Loose", ""),
    request("Named", "Unfiled"),
    request("Slash", "API / Billing/API"),
  ]);
  assert.notEqual(roots[0].key, roots[1].key);
  assert.equal(roots[2].groups[0].name, "Billing/API");
});
test("all requests remain reachable in a large category", () => {
  const requests = Array.from({ length: 2500 }, (_, i) =>
    request(`Request ${i}`, "API / Large"),
  );
  const roots = groupRequests(requests);
  assert.equal(roots[0].count, 2500);
  assert.equal(roots[0].groups[0].requests[2499].id, requests[2499].id);
});
