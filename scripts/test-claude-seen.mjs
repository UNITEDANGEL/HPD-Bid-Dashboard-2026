// ✓ Seen within seconds (20 Nov): a new request gets "Seen ✓" with its place in line, a request Claude already answered
// gets nothing, and one waiting behind a busy Claude says what Claude is on and that a second Claude takes it.
import assert from "node:assert/strict";
import { seenReplies, workingOn } from "./claude-seen.mjs";

const now = Date.parse("2026-11-20T15:00:00Z");
const ago = (m) => new Date(now - m * 60000).toISOString();
const o = {
  "CHANGE-REQUEST-20261120140000": { at: ago(60), text: "(said to the helper) Make the notices map better" },
  "CHANGE-REPLY-20261120140000": { status: "Working on it", workingAt: ago(2), updates: [{ at: ago(55), text: "On it" }] },
  "CHANGE-REQUEST-20261120145000": { at: ago(10), text: "Old one" },
  "CHANGE-REPLY-20261120145000": { status: "Done", updates: [{ at: ago(5), text: "Done" }] },
  "CHANGE-REQUEST-20261120145900": { at: ago(1), text: "Add a button" },
  "CHANGE-REQUEST-20261120145930": { at: ago(0.5), text: "And another one" },
};
assert.ok(workingOn(o, "20261120140000", now));
const list = seenReplies(o, now);
assert.deepEqual(list.map((x) => x.id), ["20261120145900", "20261120145930"], "only the new ones without a reply");
assert.match(list[0].patch.updates[0].text, /^Seen ✓ Claude is working on "Make the notices map better" right now\. Yours is next/);
assert.match(list[1].patch.updates[0].text, /#2 in line/);
assert.equal(list[0].patch.status, "Received", "still open, so the watcher picks it up");
assert.equal(list[0].patch.workingAt, "");
// Once answered, never again.
for (const x of list) o[`CHANGE-REPLY-${x.id}`] = x.patch;
assert.deepEqual(seenReplies(o, now), []);
// Nothing busy: starting now.
const q = { "CHANGE-REQUEST-1": { at: ago(0), text: "Hi" } };
assert.match(seenReplies(q, now)[0].patch.updates[0].text, /^Seen ✓ Claude is starting on it now\./);
// A stale green light (over 30 min) isn't busy.
assert.equal(workingOn({ "CHANGE-REPLY-1": { workingAt: ago(31) } }, "1", now), false);
console.log("PASS seen ✓ right away, place in line, busy Claude named, never twice");
