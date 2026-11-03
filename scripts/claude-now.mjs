#!/usr/bin/env node
// 🤖 "Claude right now" (owner, 3 Nov: "I need to know every second what's going on"): what Claude is doing on the
// office computer, shown live on the phone (the Claude card on the map, the 🤖 Claude button, Your requests).
// One status-server key, CLAUDE-NOW: { at, text, task, state: "working" | "idle", log: [{ at, text }] (newest last) }.
//
//   node scripts/claude-now.mjs --task "Remove the duplicate AI button"   (what Claude is working on; also says it)
//   node scripts/claude-now.mjs --say "Testing on my computer"
//   node scripts/claude-now.mjs --idle                                     (finished: waiting for the owner)
//   node scripts/claude-now.mjs --hook                                     (Claude Code hook: reads the event on stdin)
//
// The hook turns each step into a fixed plain phrase (never the command or file text, so nothing private goes out),
// and only for HPD work. Every save is 2 KV writes (free plan: 1,000 a day), so it sends only when the phrase changes,
// at most every 20 s, a still-working ping every 5 min, and at most 150 a day.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_ = process.env.HPD_STATUS_URL || "https://hpd-status-worker.uac525.workers.dev";
const STATE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".claude-now.json");
const MIN_GAP = 20_000, SAME_GAP = 5 * 60_000, DAY_CAP = 150;
const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "") : null; };
const nyDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const load = () => { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return {}; } };
const store = (s) => { try { fs.writeFileSync(STATE, JSON.stringify(s)); } catch { /* read-only: skip */ } };

// One step of Claude's work -> a plain phrase, or "" (not HPD work / not worth saying).
export function phraseFor(ev) {
  const name = String(ev?.tool_name || "");
  const input = ev?.tool_input || {};
  const blob = JSON.stringify(input).replace(/\\\\/g, "/");
  const hpd = /HPD-Bid-Dashboard|HPD-auto|hpd-bid-dashboard|hpd-status-worker/i.test(blob);
  if (!hpd) return "";
  if (/^mcp__Claude_Browser__|^mcp__claude-in-chrome__/.test(name)) return /pages\.dev/.test(blob) ? "Checking it on the live app" : "Looking at the app on screen";
  const file = String(input.file_path || input.path || "").replace(/\\/g, "/");
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(name)) {
    if (/whats-new\.json|MASTER_PLAN/.test(file)) return "Writing the What's new note";
    if (/scripts\/test-/.test(file)) return "Writing a test for it";
    if (/\.css$/.test(file)) return "Changing how the screen looks";
    if (/\.tsx$/.test(file)) return "Changing the screen";
    if (/\/lib\//.test(file)) return "Teaching the chat new words";
    if (/\/server\/|\/functions\//.test(file)) return "Changing the server side";
    if (/\.github\//.test(file)) return "Changing the deploy steps";
    return "Writing the change";
  }
  if (/^(Read|Grep|Glob)$/.test(name)) return "Reading the app's code";
  if (/^(Bash|PowerShell)$/.test(name)) {
    const c = String(input.command || "");
    if (/git push/.test(c)) return "Sending it live (about 5 min)";
    if (/gh run (view|watch|list)/.test(c)) return "Watching it go live";
    if (/BASE_URL=https:\/\/hpd-bid-dashboard/.test(c)) return "Testing it on the live app";
    if (/test-|run-browser-tests/.test(c)) return "Testing on my computer";
    if (/npm run build|build:cloudflare/.test(c)) return "Building the app";
    if (/tsc --noEmit/.test(c)) return "Checking the code for mistakes";
    if (/git commit/.test(c)) return "Saving the change";
    if (/reply-change-request/.test(c)) return "Writing to you";
    if (/app-errors/.test(c)) return "Checking your phone for errors";
    if (/claude-now\.mjs/.test(c)) return "";
    if (/\bgrep\b|\bsed -n\b|\bcat\b|\bls\b|\bhead\b/.test(c)) return "Reading the app's code";
    if (/python .*scratchpad|\.py\b/.test(c)) return "Writing the change";
    return "Working on the computer";
  }
  return "";
}

async function post(s, patch) {
  const at = new Date().toISOString();
  const log = [...(s.log || []), ...(patch.text && patch.text !== s.text ? [{ at, text: patch.text }] : [])].slice(-8);
  const value = { at, text: patch.text ?? s.text ?? "", task: patch.task ?? s.task ?? "", state: patch.state || "working", log };
  const day = nyDay();
  const sent = s.day === day ? s.sent || 0 : 0;
  const next = { ...s, ...value, day, sent: sent + 1, postedAt: Date.now() };
  store(next);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    await fetch(`${URL_}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "CLAUDE-NOW", patch: value }), signal: ctrl.signal });
    clearTimeout(t);
  } catch { /* offline: the phone shows the last one */ }
  return value;
}

async function hook() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let ev = {};
  try { ev = JSON.parse(raw || "{}"); } catch { return; }
  const s = load();
  const event = String(ev.hook_event_name || "");
  const session = String(ev.session_id || "");
  const mine = s.session === session && Date.now() - (s.seenAt || 0) < 60 * 60_000;
  let text = "", state = "working";
  if (event === "UserPromptSubmit") { if (!mine) return; text = "Reading your message"; }
  else if (event === "Stop") { if (!mine || s.state === "idle") return; text = "Finished for now: waiting for your next message"; state = "idle"; }
  else {
    text = phraseFor(ev);
    if (!text) return;
    store({ ...s, session, seenAt: Date.now() });
    Object.assign(s, { session, seenAt: Date.now() });
  }
  const since = Date.now() - (s.postedAt || 0);
  const sentToday = s.day === nyDay() ? s.sent || 0 : 0;
  if (state !== "idle") {
    if (sentToday >= DAY_CAP) return;
    if (text === s.text && s.state === "working" && since < SAME_GAP) return;
    if (since < MIN_GAP && s.state === "working") return;
  }
  await post(s, { text, state });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  if (argv.includes("--hook")) await hook().catch(() => {});
  else {
    const s = load();
    const task = arg("task");
    if (argv.includes("--idle")) await post(s, { text: arg("idle") || "Finished for now: waiting for your next message", state: "idle" });
    else if (task !== null) await post(s, { task: task.slice(0, 120), text: `Starting: ${task.slice(0, 100)}` });
    else if (arg("say")) await post(s, { text: arg("say").slice(0, 120) });
    else { console.log("Use --task, --say, --idle or --hook"); process.exit(1); }
    console.log("CLAUDE-NOW:", load().text);
  }
}
