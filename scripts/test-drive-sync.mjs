import assert from "node:assert/strict";
import { syncMissingRecords } from "../lib/drive-backup-client.mjs";

let state;
const loaded = [];
const options = {
  storage: {},
  readState: async () => state,
  writeState: async (next) => { state = next; },
  api: async () => ({ files: [{ id: "old", createdTime: "2026-09-01" }, { id: "new", createdTime: "2026-09-30" }] }),
  load: async (id) => { loaded.push(id); return { snapshot: { id } }; },
  restore: async () => ({ added: 2, conflicts: 1 }),
};
await syncMissingRecords(options);
assert.deepEqual(loaded, ["new", "old"]);
assert.equal(state.added, 4);
assert.equal(state.conflicts, 2);
await syncMissingRecords(options);
assert.equal(loaded.length, 2, "previously verified snapshots are not re-imported");
state = undefined;
await assert.rejects(syncMissingRecords({ ...options, shouldContinue: () => false }), /paused/);
assert.equal(state.processed.length, 0);
state = undefined;
await assert.rejects(syncMissingRecords({ ...options, load: async () => { throw new Error("Integrity failed"); } }), /Integrity/);
assert.equal(state.processed.length, 0, "failed snapshot remains eligible for retry");
await syncMissingRecords(options);
assert.equal(state.error, null);
console.log("Drive sync: ordering, retry, deduplication, pause and conflict reporting passed.");
