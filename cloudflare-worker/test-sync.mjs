import assert from "node:assert/strict";
import worker from "./src/index.js";

const rows = new Map();
let lists = 0, failLists = false;
const env = {
  SYNC_ENABLED: "1",
  HPD_STATUS_OVERRIDES: {
    async put(key, value) { rows.set(key, value); },
    async delete(key) { rows.delete(key); },
    async get(key, mode) {
      const value = rows.get(key);
      return mode === "json" && value ? JSON.parse(value) : value || null;
    },
    async list() { lists += 1; if (failLists) throw new Error("KV list limit exceeded"); return { keys: [...rows.keys()].map((name) => ({ name })), list_complete: true }; },
  },
};

const now = "2026-07-13T13:00:00.000Z";
const body = {
  deviceId: "device-synthetic-test",
  mutations: [{
    id: "mutation-route-stop-test",
    entityType: "route_stop",
    entityId: "route-test-TEST1234",
    action: "upsert",
    entity: {
      id: "route-test-TEST1234",
      routeId: "route-test",
      jobId: "TEST1234",
      stopIndex: 2,
      status: "planned",
      address: "MUST NOT SYNC",
      contactName: "MUST NOT SYNC",
      contactPhone: "MUST NOT SYNC",
      description: "MUST NOT SYNC",
    },
    createdAt: now,
    attempts: 0,
    status: "queued",
  }],
};

const capabilityResponse = await worker.fetch(new Request("https://worker.example/sync"), env);
assert.equal(capabilityResponse.status, 200);
assert.equal((await capabilityResponse.json()).sync, true);

const acceptedResponse = await worker.fetch(new Request("https://worker.example/sync", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://map-preview.hpd-bid-dashboard-2026.pages.dev" },
  body: JSON.stringify(body),
}), env);
assert.equal(acceptedResponse.status, 200);
const accepted = await acceptedResponse.json();
assert.deepEqual(accepted.accepted, ["mutation-route-stop-test"]);

const stored = JSON.parse(rows.get("__sync__:route_stop:route-test-TEST1234"));
assert.equal(stored.jobId, "TEST1234");
assert.equal(stored.stopIndex, 2);
assert.equal(stored.address, undefined);
assert.equal(stored.contactName, undefined);
assert.equal(stored.contactPhone, undefined);
assert.equal(stored.description, undefined);

const blockedResponse = await worker.fetch(new Request("https://worker.example/sync", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
  body: JSON.stringify(body),
}), env);
assert.equal(blockedResponse.status, 403);

const overridesResponse = await worker.fetch(new Request("https://worker.example/overrides"), env);
const overrides = await overridesResponse.json();
assert.deepEqual(overrides.overrides, {});

// Loading job steps: one combined copy, built once, then kept in step by saves and deletes.
const post = (key, patch) => worker.fetch(new Request("https://worker.example/override", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, patch }) }), env);
const load = async () => (await (await worker.fetch(new Request("https://worker.example/overrides"), env)).json()).overrides;
rows.delete("__all_overrides__");
rows.set("ER1", JSON.stringify({ OMO: "ER1", FieldOutcome: "WORK_COMPLETED" }));
lists = 0;
assert.deepEqual(Object.keys(await load()), ["ER1"]);
assert.deepEqual(Object.keys(await load()), ["ER1"]);
assert.equal(lists, 1, "the list is read once, then the combined copy");
await post("ER2", { FieldOutcome: "REFUSED_ACCESS" });
assert.equal((await load()).ER2.FieldOutcome, "REFUSED_ACCESS", "a save shows up without another list");
await worker.fetch(new Request("https://worker.example/override?key=ER1", { method: "DELETE" }), env);
assert.deepEqual(Object.keys(await load()), ["ER2"]);
assert.equal(lists, 1);
// A save before the first build doesn't start a copy holding only that job.
rows.delete("__all_overrides__");
await post("ER3", { FieldOutcome: "WORK_COMPLETED" });
assert.equal(rows.get("__all_overrides__"), undefined);
assert.deepEqual(Object.keys(await load()).sort(), ["ER2", "ER3"]);
// A KV limit answers "busy" (503 JSON), not a crash.
rows.delete("__all_overrides__"); failLists = true;
const busy = await worker.fetch(new Request("https://worker.example/overrides"), env);
assert.equal(busy.status, 503);
assert.match((await busy.json()).error, /busy/);
failLists = false;
// Cloud sync stays off unless SYNC_ENABLED is "1".
const off = { HPD_STATUS_OVERRIDES: env.HPD_STATUS_OVERRIDES };
assert.equal((await (await worker.fetch(new Request("https://worker.example/sync"), off)).json()).sync, false);
assert.equal((await worker.fetch(new Request("https://worker.example/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), off)).status, 403);

console.log("CLOUDFLARE SYNC TEST PASSED");
