// 🗄 The one store (6 Nov 2026): the first start copies everything from KV (the combined copy + phone alert entries);
// then each save is 1 store write and 0 KV writes; reads, deletes and the phone-alert lists come from the store.
import assert from "node:assert/strict";
import worker, { OverrideStore } from "./src/index.js";

const kvRows = new Map();
let kvPuts = 0;
const kv = {
  async put(k, v) { kvPuts += 1; kvRows.set(k, v); },
  async delete(k) { kvRows.delete(k); },
  async get(k, mode) { const v = kvRows.get(k); return mode === "json" && v ? JSON.parse(v) : v ?? null; },
  async list({ prefix = "" } = {}) { return { keys: [...kvRows.keys()].filter((n) => n.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
};
kvRows.set("__all_overrides__", JSON.stringify({ ER00001: { OMO: "ER00001", FieldArrivedAt: "2026-11-06T14:00:00Z" }, "CHANGE-REQUEST-1": { text: "hi" } }));
kvRows.set("PUSH-0123456789abcdef", JSON.stringify({ sub: "enc" }));
kvRows.set("__sync__:route:x", JSON.stringify({}));

const rows = new Map();
let storeWrites = 0;
const storage = {
  async get(k) { return rows.get(k); },
  async put(k, v) { if (typeof k === "object") { for (const [a, b] of Object.entries(k)) rows.set(a, structuredClone(b)); storeWrites += Object.keys(k).length; } else { rows.set(k, structuredClone(v)); storeWrites += 1; } },
  async delete(k) { rows.delete(k); },
  async list() { return new Map([...rows].sort(([a], [b]) => a.localeCompare(b))); },
};
const env = { OVERRIDES_CACHE_MS: "0", HPD_STATUS_OVERRIDES: kv };
let instance = new OverrideStore({ storage }, env);
env.STORE = { idFromName: () => "all", get: () => ({ fetch: (u, init) => instance.fetch(new Request(u, init)) }) };
const call = async (path, init) => (await worker.fetch(new Request(`https://w${path}`, init), env)).json();

let r = await call("/overrides");
assert.deepEqual(Object.keys(r.overrides).sort(), ["CHANGE-REQUEST-1", "ER00001", "PUSH-0123456789abcdef"], "copied from KV, sync rows left out");
const seeded = storeWrites;

kvPuts = 0; storeWrites = 0;
r = await call("/override", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "ER00002", patch: { FieldOutcome: "WORK_COMPLETED" } }) });
assert.equal(r.ok, true);
assert.equal(storeWrites, 1, "1 store write per save");
assert.equal(kvPuts, 0, "no KV writes");
r = await call("/overrides");
assert.equal(r.overrides.ER00002.FieldOutcome, "WORK_COMPLETED");

// A restart (new instance, same storage): no second copy from KV, saves still there.
instance = new OverrideStore({ storage }, env);
storeWrites = 0;
r = await call("/overrides");
assert.equal(storeWrites, 0, "no copy on restart");
assert.equal(r.overrides.ER00002.FieldOutcome, "WORK_COMPLETED");
assert.ok(!("__seeded_from_kv__" in r.overrides));

r = await call("/override?key=ER00002", { method: "DELETE" });
assert.equal(r.ok, true);
assert.ok(!("ER00002" in (await call("/overrides")).overrides));
assert.deepEqual((await call("/push-sub?id=PUSH-0123456789abcdef")).sub, { sub: "enc" });
assert.deepEqual(Object.keys((await call("/push-subs")).subs), ["PUSH-0123456789abcdef"]);
console.log(`STORE TEST PASSED (copied ${seeded - 1} entries once; 1 write per save, 0 KV writes)`);
