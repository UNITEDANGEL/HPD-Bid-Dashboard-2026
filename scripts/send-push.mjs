// Phone alerts (owner, 20 Oct: "ring for all notifications", app closed / phone locked). Runs in the 10-minute fetcher
// after the emails and invitations are read: anything new since the last run -> an alert to every phone that turned
// alerts on (Alerts page). Each kind its own alert (20 Oct: "unique alerts for bids, notices, rejections, requests"):
// 💰 you won a job (cha-ching), ⏱ 24/72-hour notice, 📋 documents request (Gafur / AEP), 💵 payment rejected, 📩 message / reply (Lewis...),
// 🧾 new invitation to bid, ⏰ a 24-hour notice under 6 hours.
// What was already alerted is kept as short hashes in data/push_state.json (no names, no text). The first run only
// remembers. Needs VAPID_PRIVATE_KEY (GitHub secret) and HPD_PRIVATE_DATA_KEY; without them it does nothing.
//
//   node scripts/send-push.mjs            (CI)
//   node scripts/send-push.mjs --dry-run  (show what would be sent, send nothing)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DRY = process.argv.includes("--dry-run");
const STATE = path.join(ROOT, "data", "push_state.json");
const WORKER = (process.env.HPD_STATUS_WORKER_URL || "https://hpd-status-worker.uac525.workers.dev").replace(/\/$/, "");
const SITE = "https://hpd-bid-dashboard-2026.pages.dev";
export const PUSH_PUBLIC_KEY = "BBmtmIohi2rinq4pj68d--uCtbicYU9SraMID56vmadykHCEtF0kuoEBQshq0N81V7BhHK-ovdLmvLrutzdv1M0";

const h = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
function keyBuf() {
  const file = path.join(ROOT, "data/private/HPD_PRIVATE_DATA_KEY.txt");
  const text = process.env.HPD_PRIVATE_DATA_KEY || (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
  const k = Buffer.from(text.trim(), "base64");
  return k.length === 32 ? k : null;
}
export function openSealed(buf, k) {
  const d = crypto.createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]);
}
function vapidPrivate() {
  if (process.env.VAPID_PRIVATE_KEY) return process.env.VAPID_PRIVATE_KEY.trim();
  const f = path.join(ROOT, "data/private/VAPID_KEYS.json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).privateKey : "";
}
const name = (from) => String(from || "").replace(/<[^>]*>/g, "").replace(/"/g, "").replace(/\s*\(HPD\)\s*/i, "").replace(/^([^,]+),\s*(.+)$/, "$2 $1").trim();

// What is new since last time: [{ key, title, body, url, tag }].
export async function findAlerts({ conversations, bids, sent, requests, now = Date.now(), loadLib }) {
  const out = [];
  const kinds = loadLib ? await loadLib("alert-kinds") : null;
  // HPD wrote or replied (last 2 days): a notice, a documents request, a rejection or a message.
  for (const t of conversations?.threads || []) {
    for (const m of t.messages || []) {
      if (!m.hpd || m.mine || now - Date.parse(m.at) > 2 * 86400000) continue;
      const omo = (t.omos || [])[0] || "";
      const who = name(m.from);
      const replied = (t.messages || []).some((x) => x.mine && x.at < m.at);
      const subject = String(t.subject || m.subject || "");
      const kind = kinds ? kinds.emailKind(subject, t.kind || "", m.from || "") : "message";
      const title = kinds ? kinds.emailTitle(kind, who, omo, replied, subject) : `📩 ${who || "HPD"} ${replied ? "replied" : "wrote"}${omo ? ` · ${omo}` : ""}`;
      out.push({ key: `e:${h(`${t.id}|${m.at}`)}`, kind, title, body: String(m.subject || t.subject || "").slice(0, 120), url: kind === "rejection" ? "/map/?view=all&map=1&money=1" : "/map/?view=all&map=1&board=1", tag: `t-${h(t.id)}` });
    }
  }
  // Payment rejections (HPD's notices, last 7 days).
  for (const [omo, j] of Object.entries(requests?.jobs || {})) {
    const at = j?.rejectedAt;
    if (!at || now - Date.parse(at) > 7 * 86400000) continue;
    out.push({ key: `r:${h(`${omo}|${at}`)}`, kind: "rejection", title: `💵 Payment rejected · ${omo}`, body: String(j.rejectedReason || "Fix it and send it back.").slice(0, 120), url: "/map/?view=all&map=1&money=1", tag: `r-${omo}` });
  }
  // New invitations to bid (still open).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(now));
  for (const b of bids || []) {
    if (!b.omo || !b.bidDue || b.bidDue < today) continue;
    out.push({ key: `b:${h(`${b.omo}|${b.bidDue}`)}`, kind: "bid", title: `🧾 New invitation to bid · ${b.omo}`, body: `${b.address || ""} · due ${b.bidDue.slice(5).replace("-", "/")} ${b.bidDueTime || ""}`.trim(), url: "/map/?bids=1", tag: `b-${b.omo}` });
  }
  // A 24-hour notice under 6 hours with nothing sent (the board's own rule).
  if (loadLib && conversations?.threads) {
    try {
      const { buildBoard, urgentRows, hoursLeft } = await loadLib("notice-board");
      const threads = conversations.threads.map((t) => ({ ...t, omos: t.omos || [], people: t.people || [], subject: t.subject || "", messages: (t.messages || []).map((m) => ({ ...m, text: m.text || "", files: m.files || [] })) }));
      const rows = buildBoard({ threads, sent: sent || {}, marks: {}, now });
      for (const r of urgentRows(rows, now)) {
        const left = Math.round(hoursLeft(r, now));
        out.push({ key: `u:${h(r.key)}`, kind: "urgent", title: `⏰ ${r.omo}: ${left <= 0 ? "notice overdue" : `${left} h left on the notice`}`, body: "Nothing sent yet: answer it now.", url: "/map/?view=all&map=1&board=1", tag: `u-${r.omo}` });
      }
    } catch (e) { console.log(`notice check skipped: ${e.message}`); }
  }
  return out;
}

async function main() {
  const k = keyBuf();
  const priv = vapidPrivate();
  if (!k || !priv) { console.log("Phone alerts not set up (needs HPD_PRIVATE_DATA_KEY and VAPID_PRIVATE_KEY): nothing sent."); return; }
  const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p) : null);
  const convBuf = read(path.join(ROOT, "public/private/conversations.json.enc"));
  const conversations = convBuf ? JSON.parse(openSealed(convBuf, k).toString("utf8")) : null;
  const bids = JSON.parse(read(path.join(ROOT, "public/data/upcoming_bids.json")) || "{}").bids || [];
  const sent = JSON.parse(read(path.join(ROOT, "public/data/sent_paperwork.json")) || "{}").jobs || {};
  const requests = JSON.parse(read(path.join(ROOT, "public/data/hpd_requests.json")) || "{}");
  const { loadLib } = await import("./daily-report.mjs");
  const alerts = await findAlerts({ conversations, bids, sent, requests, loadLib });
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : null;
  const seen = new Set(state?.seen || []);
  const fresh = alerts.filter((a) => !seen.has(a.key));
  const nextState = { note: "Phone alerts already sent (short hashes only). scripts/send-push.mjs", seen: [...new Set([...(state?.seen || []), ...alerts.map((a) => a.key)])].slice(-3000), dead: state?.dead || [] };
  if (!state) { if (!DRY) fs.writeFileSync(STATE, JSON.stringify(nextState)); console.log(`First run: remembered ${alerts.length} things, nothing sent.`); return; }
  if (!fresh.length) { console.log("Phone alerts: nothing new."); return; }
  // Who gets them: the phones that turned alerts on (PUSH-<id> on the status server, encrypted).
  const res = await fetch(`${WORKER}/overrides`, { cache: "no-store" });
  const overrides = res.ok ? (await res.json()).overrides || {} : {};
  const subs = Object.entries(overrides).filter(([key, v]) => key.startsWith("PUSH-") && v?.enc && !v.off && !nextState.dead.includes(key)).map(([key, v]) => {
    try { return { key, sub: JSON.parse(openSealed(Buffer.from(v.enc, "base64"), k).toString("utf8")) }; } catch { return null; }
  }).filter(Boolean);
  // Several new things: one alert each (up to 5), then one "and N more".
  const list = fresh.length > 6 ? [...fresh.slice(0, 5), { key: "more", title: `🔔 ${fresh.length - 5} more updates`, body: "Open HPD Field to see them.", url: "/map/?view=all&map=1", tag: "more" }] : fresh;
  console.log(`Phone alerts: ${fresh.length} new, ${subs.length} phone(s).`);
  if (DRY) { for (const a of list) console.log(` - ${a.title} | ${a.body}`); return; }
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(SITE, PUSH_PUBLIC_KEY, priv);
  for (const { key, sub } of subs) {
    for (const a of list) {
      try {
        await webpush.sendNotification(sub, JSON.stringify({ title: a.title, body: a.body, url: a.url, tag: a.tag, kind: a.kind || "message" }), { TTL: 6 * 3600, urgency: a.kind === "urgent" || a.kind === "notice" || a.kind === "rejection" || a.kind === "award" ? "high" : "normal" });
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { nextState.dead.push(key); console.log(`${key}: phone turned alerts off (removed)`); break; }
        console.log(`${key}: not sent (${e.statusCode || e.message})`);
      }
    }
  }
  fs.writeFileSync(STATE, JSON.stringify(nextState));
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/").replace(/^([A-Za-z]):/, "/$1:")}` || process.argv[1]?.endsWith("send-push.mjs")) {
  main().catch((e) => { console.log(`Phone alerts failed: ${e.message}`); process.exitCode = 0; });
}
