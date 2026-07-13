import assert from "node:assert/strict";
import worker from "./src/index.js";

const rows = new Map();
const env = {
  HPD_STATUS_OVERRIDES: {
    async put(key, value) { rows.set(key, value); },
    async delete(key) { rows.delete(key); },
    async get(key, mode) {
      const value = rows.get(key);
      return mode === "json" && value ? JSON.parse(value) : value || null;
    },
    async list() { return { keys: [...rows.keys()].map((name) => ({ name })) }; },
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

console.log("CLOUDFLARE SYNC TEST PASSED");
