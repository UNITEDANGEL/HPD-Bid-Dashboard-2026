// 🤖 Claude right now (3 Nov): each step of Claude's work becomes a fixed plain phrase (never the command or file text),
// only for HPD work; the hook sends only when the phrase changes, at most every 20 s (2 KV writes each). No network:
// the status server is faked with a local server.
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ownerNotes, phraseFor } from "./claude-now.mjs";

const W = "C:/dev/HPD-Bid-Dashboard-2026";
assert.equal(phraseFor({ tool_name: "Edit", tool_input: { file_path: `${W}/app/field-command/FieldCommandClient.tsx` } }), "Changing the screen");
assert.equal(phraseFor({ tool_name: "Edit", tool_input: { file_path: String.raw`C:\dev\HPD-Bid-Dashboard-2026\app\x.css` } }), "Changing how the screen looks");
assert.equal(phraseFor({ tool_name: "Write", tool_input: { file_path: `${W}/scripts/test-browser-x.mjs` } }), "Writing a test for it");
assert.equal(phraseFor({ tool_name: "Bash", tool_input: { command: `cd ${W} && git push -q origin HEAD:main` } }), "Sending it live (about 5 min)");
assert.equal(phraseFor({ tool_name: "Bash", tool_input: { command: `cd ${W} && BASE_URL=https://hpd-bid-dashboard-2026.pages.dev node scripts/test-browser-x.mjs` } }), "Testing it on the live app");
assert.equal(phraseFor({ tool_name: "Bash", tool_input: { command: `cd ${W} && rm -rf out && npm run build:cloudflare` } }), "Building the app");
assert.equal(phraseFor({ tool_name: "mcp__Claude_Browser__navigate", tool_input: { url: "https://hpd-bid-dashboard-2026.pages.dev/map/" } }), "Checking it on the live app");
assert.equal(phraseFor({ tool_name: "Bash", tool_input: { command: "ls D:/dev/ForexAgent" } }), "", "other projects say nothing");
assert.equal(phraseFor({ tool_name: "Bash", tool_input: { command: `cd ${W} && echo "Ms Smith 718-555-0100"` } }), "Working on the computer", "the command's words never go out");

// 👂 What the owner wrote since the last look: new requests, answers (also 💬 from the live card), the auto switch.
const notes = ownerNotes({ "CHANGE-REQUEST-20261103190000": { at: "2026-11-03T19:00:00Z", text: "(idea) Quiet hours" }, "CHANGE-ANSWER-20261103163347": { answers: [{ at: "2026-11-03T18:00:00Z", text: "old" }, { at: "2026-11-03T19:01:00Z", text: "⏸ Stop for now" }] }, "AUTO-UPGRADE": { on: true, at: "2026-11-03T19:02:00Z" } }, "2026-11-03T18:30:00Z");
assert.deepEqual(notes.map((n) => n.text), ["New request (20261103190000): (idea) Quiet hours", "Answer on request 20261103163347: ⏸ Stop for now", "Keep upgrading on its own turned ON"]);
assert.deepEqual(ownerNotes({ "CHANGE-REQUEST-1": { at: "2026-11-03T18:00:00Z", text: "old" } }, "2026-11-03T18:30:00Z"), [], "nothing old");

// The hook: a fake status server, a fresh state file.
const got = [];
const srv = http.createServer((q, r) => { let b = ""; q.on("data", (c) => (b += c)); q.on("end", () => { got.push(JSON.parse(b)); r.end("{}"); }); });
await new Promise((ok) => srv.listen(0, ok));
const state = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", ".claude-now.json");
const saved = fs.existsSync(state) ? fs.readFileSync(state) : null;
try {
  if (fs.existsSync(state)) fs.unlinkSync(state);
  const env = { ...process.env, HPD_STATUS_URL: `http://127.0.0.1:${srv.address().port}` };
  const hook = (ev) => new Promise((ok) => { const c = spawn(process.execPath, ["scripts/claude-now.mjs", "--hook"], { env }); c.on("close", ok); c.stdin.end(JSON.stringify({ session_id: "s1", ...ev })); });
  await hook({ hook_event_name: "UserPromptSubmit" });
  assert.equal(got.length, 0, "a message in a session that never touched HPD says nothing");
  await hook({ hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: `${W}/app/a.tsx` } });
  assert.equal(got.length, 1);
  assert.equal(got[0].key, "CLAUDE-NOW");
  assert.equal(got[0].patch.text, "Changing the screen");
  assert.equal(got[0].patch.state, "working");
  await hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: `cd ${W} && npm run build` } });
  assert.equal(got.length, 1, "a new step within 20 s waits");
  const s = JSON.parse(fs.readFileSync(state, "utf8")); s.postedAt -= 25000; fs.writeFileSync(state, JSON.stringify(s));
  await hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: `cd ${W} && npm run build` } });
  assert.equal(got.length, 2);
  assert.equal(got[1].patch.text, "Building the app");
  assert.deepEqual(got[1].patch.log.map((l) => l.text), ["Changing the screen", "Building the app"]);
  await hook({ hook_event_name: "Stop" });
  assert.equal(got.length, 3, "finishing is always said");
  assert.equal(got[2].patch.state, "idle");
  await hook({ hook_event_name: "Stop" });
  assert.equal(got.length, 3, "once");
  console.log("PASS claude-now: owner notes since the last look; steps become plain phrases (HPD work only, never the command text); sent on a change at most every 20 s; finishing said once");
} finally {
  srv.close();
  if (saved) fs.writeFileSync(state, saved); else if (fs.existsSync(state)) fs.unlinkSync(state);
}
