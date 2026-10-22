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
const TEST = process.argv.includes("--test");
const BRIEF_NOW = process.argv.includes("--briefing"); // the morning briefing right now (owner asked to see it)
const WRAP_NOW = process.argv.includes("--wrapup");
const MONEY_NOW = process.argv.includes("--money"); // the Friday money report right now // the evening wrap-up right now // one test alert to every phone, nothing else (owner asked to try it)
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

// Weekdays 8 AM - 8 PM in New York (repeat reminders only then; no 3 AM alerts).
export function workingHours(now = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  const hour = Number(p.hour);
  return !["Sat", "Sun"].includes(p.weekday) && hour >= 8 && hour < 20;
}

// What is new since last time: [{ key, title, body, url, tag }].
export async function findAlerts({ conversations, bids, sent, requests, now = Date.now(), loadLib, records = {}, pip = null, payments = null }) {
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
      out.push({ key: `e:${h(`${t.id}|${m.at}`)}`, kind, title, body: String(m.subject || t.subject || "").slice(0, 120), url: kind === "rejection" ? `/map/?view=all&map=1&money=1&omo=${omo}` : kind === "award" ? `/map/?view=all&map=1&omo=${omo}` : `/map/?view=all&map=1&board=1&omo=${omo}`, tag: `t-${h(t.id)}` });
    }
  }
  // Payment rejections (HPD's notices, last 7 days).
  for (const [omo, j] of Object.entries(requests?.jobs || {})) {
    const at = j?.rejectedAt;
    if (!at || now - Date.parse(at) > 7 * 86400000) continue;
    out.push({ key: `r:${h(`${omo}|${at}`)}`, kind: "rejection", title: `💵 Payment rejected · ${omo}`, body: String(j.rejectedReason || "Fix it and send it back.").slice(0, 120), url: `/map/?view=all&map=1&money=1&omo=${omo}`, tag: `r-${omo}` });
  }
  // New invitations to bid (still open).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(now));
  for (const b of bids || []) {
    if (!b.omo || !b.bidDue || b.bidDue < today) continue;
    out.push({ key: `b:${h(`${b.omo}|${b.bidDue}`)}`, kind: "bid", title: `🧾 New invitation to bid · ${b.omo}`, body: `${b.address || ""} · due ${b.bidDue.slice(5).replace("-", "/")} ${b.bidDueTime || ""}`.trim(), url: `/map/?bids=1&omo=${b.omo}`, tag: `b-${b.omo}` });
  }
  // A 24-hour notice under 6 hours with nothing sent (the board's own rule).
  if (loadLib && conversations?.threads) {
    try {
      const { buildBoard, urgentRows, hoursLeft } = await loadLib("notice-board");
      const threads = conversations.threads.map((t) => ({ ...t, omos: t.omos || [], people: t.people || [], subject: t.subject || "", messages: (t.messages || []).map((m) => ({ ...m, text: m.text || "", files: m.files || [] })) }));
      const rows = buildBoard({ threads, sent: sent || {}, marks: {}, now });
      for (const r of urgentRows(rows, now)) {
        const left = Math.round(hoursLeft(r, now));
        out.push({ key: `u:${h(r.key)}`, kind: "urgent", title: `⏰ ${r.omo}: ${left <= 0 ? "notice overdue" : `${left} h left on the notice`}`, body: "Nothing sent yet: answer it now.", url: `/map/?view=all&map=1&board=1&omo=${r.omo}`, tag: `u-${r.omo}` });
        // Overdue: again every 2 hours, weekdays 8 AM - 8 PM New York, until it's answered (owner, 21 Oct: ER01987 went
        // overdue after one alert). Each 2-hour slot is its own alert.
        if (left <= 0 && workingHours(now)) {
          const slot = Math.floor(now / (2 * 3600000));
          const late = Math.max(1, Math.round(-hoursLeft(r, now)));
          out.push({ key: `o:${h(`${r.key}|${slot}`)}`, kind: "urgent", title: `⏰ ${r.omo}: notice overdue ${late} h — answer now`, body: `${r.hours}-hour notice from ${r.who || "vendor tracking"}. Nothing sent yet.`, url: `/map/?view=all&map=1&board=1&omo=${r.omo}`, tag: `u-${r.omo}` });
        }
      }
    } catch (e) { console.log(`notice check skipped: ${e.message}`); }
  }
  // ☀️ Morning briefing (owner, 21 Oct "next upgrade"): once each weekday from 8 AM New York, the day in one alert.
  const brief = await morningBriefing({ conversations, bids, sent, requests, now, loadLib });
  if (brief) out.push(brief);
  // 🌆 Evening wrap-up (owner, 21 Oct "next upgrade"): once each weekday from 6 PM, what got done and what's left.
  const wrap = await eveningWrapup({ conversations, bids, sent, records, now, loadLib });
  if (wrap) out.push(wrap);
  // 💵 Friday money report (owner, 22 Oct "next upgrade"): once each Friday from 2 PM, what HPD owes and what holds it up.
  const cash = await moneyReport({ pip, payments, requests, sent, now, loadLib });
  if (cash) out.push(cash);
  return out;
}

// The day's results from the bid records on the status server (BID-<OMO> / NOBID-<OMO>), the emails and tomorrow's bids.
export async function eveningWrapup({ conversations, bids, sent, records = {}, now = Date.now(), loadLib, force = false }) {
  const p = nyParts(now);
  const hour = Number(p.hour);
  if (!force && (!workingHours(now - 2 * 3600000) || hour < 18 || hour >= 22)) return null; // weekdays 6-10 PM
  const today = `${p.year}-${p.month}-${p.day}`;
  const dayOf = (iso) => { if (!iso) return ""; const q = nyParts(Date.parse(iso)); return `${q.year}-${q.month}-${q.day}`; };
  const lines = [];
  const faxed = Object.entries(records).filter(([k, v]) => k.startsWith("BID-") && v && dayOf(v.sentAt) === today);
  if (faxed.length) {
    const ok = faxed.filter(([, v]) => v.status === "confirmed").length;
    const bad = faxed.filter(([, v]) => v.status === "failed").length;
    const wait = faxed.length - ok - bad;
    lines.push(`📠 ${faxed.length} bid${faxed.length === 1 ? "" : "s"} faxed (${[ok ? `${ok} confirmed` : "", wait ? `${wait} waiting` : "", bad ? `${bad} failed` : ""].filter(Boolean).join(", ")})`);
  }
  const noBids = Object.entries(records).filter(([k, v]) => k.startsWith("NOBID-") && v && !v.undone && dayOf(v.faxedAt || v.at) === today);
  if (noBids.length) lines.push(`🚫 ${noBids.length} NO BID${noBids.length === 1 ? "" : "s"}`);
  // Notices / requests you answered today (your email in their thread).
  const answered = new Set();
  for (const t of conversations?.threads || []) {
    const isVendor = /poor performance|missing documents|\b(24|72)[ -]?h(ou)?r/i.test(t.subject || "") || ["past due", "AEP", "correction"].includes(t.kind);
    if (isVendor && (t.messages || []).some((m) => m.mine && dayOf(m.at) === today)) for (const o of t.omos || []) answered.add(o);
  }
  if (answered.size) lines.push(`✉ ${answered.size} notice${answered.size === 1 ? "" : "s"} / request${answered.size === 1 ? "" : "s"} answered`);
  if (loadLib && conversations?.threads) {
    try {
      const { buildBoard, hoursLeft } = await loadLib("notice-board");
      const threads = conversations.threads.map((t) => ({ ...t, omos: t.omos || [], people: t.people || [], subject: t.subject || "", messages: (t.messages || []).map((m) => ({ ...m, text: m.text || "", files: m.files || [] })) }));
      const late = buildBoard({ threads, sent: sent || {}, marks: {}, now }).filter((r) => r.next && r.kind === "ppn" && !r.steps.sent.done && hoursLeft(r, now) < 24);
      if (late.length) lines.push(`⏰ still open: ${late.slice(0, 3).map((r) => r.omo).join(", ")}${late.length > 3 ? ` +${late.length - 3}` : ""}`);
    } catch (e) { console.log(`wrap-up notices skipped: ${e.message}`); }
  }
  const tomorrow = (() => { const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1)); return d.toISOString().slice(0, 10); })();
  const dueTomorrow = (bids || []).filter((b) => b.bidDue === tomorrow).sort((a, b) => minutesOf(a.bidDueTime) - minutesOf(b.bidDueTime));
  const sentFor = new Set(Object.entries(records).filter(([k, v]) => k.startsWith("BID-") && v?.sentAt && v.bidDue === tomorrow).map(([k]) => k.slice(4)));
  const toBid = dueTomorrow.filter((b) => !sentFor.has(b.omo));
  if (toBid.length) lines.push(`🧾 tomorrow: ${toBid.length} bid${toBid.length === 1 ? "" : "s"} to send (first ${toBid[0].bidDueTime})`);
  return {
    key: `w:${today}`, kind: "message",
    title: "🌆 Today's wrap-up",
    body: lines.length ? lines.join(" · ") : "A quiet day: nothing sent, nothing waiting. See you tomorrow.",
    url: "/map/?view=all&map=1&today=1", tag: "wrapup",
  };
}

// From PIP (pip_paid.json: owed per job; pip_payments.json: payments by date) and the rejections. PIP comes in when
// the owner downloads the summaries, so the report says how old the numbers are and asks for new ones after a week.
export async function moneyReport({ pip, payments, requests, sent, now = Date.now(), loadLib, force = false }) {
  const p = nyParts(now);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(now));
  const hour = Number(p.hour);
  if (!force && (weekday !== "Fri" || hour < 14 || hour >= 20)) return null; // Fridays 2-8 PM
  if (!pip?.jobs) return null;
  const today = `${p.year}-${p.month}-${p.day}`;
  const usd = (n) => "$" + `${Math.round(n).toLocaleString("en-US")}`;
  const lines = [];
  const owed = Object.entries(pip.jobs).filter(([, j]) => !j.closed && j.outstanding > 0);
  const owedSum = owed.reduce((a, [, j]) => a + j.outstanding, 0);
  if (owed.length) lines.push(`💰 HPD owes ${usd(owedSum)} on ${owed.length} job${owed.length === 1 ? "" : "s"}`);
  // Paid in the last 7 days (as far as PIP's numbers go).
  const weekAgo = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
  const paid = (payments?.recent || []).filter((x) => x.date > weekAgo && x.date <= today && /paid|disbursed/i.test(x.status || ""));
  if (paid.length) lines.push(`✅ paid this week: ${usd(paid.reduce((a, x) => a + (Number(x.amount) || 0), 0))} (${paid.length} payment${paid.length === 1 ? "" : "s"})`);
  // Rejections until HPD pays: the same numbers as the app (💰 To get paid).
  if (loadLib) {
    try {
      const { paperworkRejections } = await loadLib("job-followup");
      const { trackPayments } = await loadLib("payment-track");
      const t = trackPayments({ rejections: paperworkRejections(requests?.jobs || {}, [], pip.jobs), corrections: [], sent: sent || {}, now }).summary;
      if (t.heldCount) lines.push(`💵 ${t.toFix} rejection${t.toFix === 1 ? "" : "s"} to fix · ${usd(t.held)} held up`);
    } catch (e) { console.log(`money report rejections skipped: ${e.message}`); }
  }
  // The oldest money: owed the longest.
  const oldest = owed.filter(([, j]) => j.lastDate).sort((a, b) => a[1].lastDate.localeCompare(b[1].lastDate))[0];
  if (oldest && now - Date.parse(oldest[1].lastDate) > 60 * 86400000) lines.push(`⌛ oldest: ${oldest[0]} ${usd(oldest[1].outstanding)} since ${oldest[1].lastDate.slice(5).replace("-", "/")}`);
  const asOf = String(payments?.generatedAt || pip.generatedAt || "").slice(0, 10);
  const stale = asOf && now - Date.parse(asOf) > 7 * 86400000;
  if (stale) lines.push(`📥 PIP numbers from ${asOf.slice(5).replace("-", "/")}: download the new summaries`);
  return {
    key: `f:${today}`, kind: "message",
    title: `💵 Friday money${owed.length ? `: ${usd(owedSum)} owed` : ""}`,
    body: lines.join(" · ") || "Nothing owed in PIP.",
    url: "/map/?view=all&map=1&money=all", tag: "money",
  };
}

const nyParts = (now) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
const minutesOf = (t) => { const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(t || ""); return m ? ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2]) : 24 * 60; };
export async function morningBriefing({ conversations, bids, sent, requests, now = Date.now(), loadLib, force = false }) {
  if (!force && !workingHours(now)) return null;
  const p = nyParts(now);
  const today = `${p.year}-${p.month}-${p.day}`;
  const nowMin = Number(p.hour) * 60 + Number(p.minute);
  const lines = [];
  // Bids due today (still open).
  const dueToday = (bids || []).filter((b) => b.bidDue === today && minutesOf(b.bidDueTime) > nowMin).sort((a, b) => minutesOf(a.bidDueTime) - minutesOf(b.bidDueTime));
  if (dueToday.length) lines.push(`🧾 ${dueToday.length} bid${dueToday.length === 1 ? "" : "s"} due today (first ${dueToday[0].bidDueTime})`);
  // Notices: overdue / due today, and documents requests waiting.
  if (loadLib && conversations?.threads) {
    try {
      const { buildBoard, hoursLeft } = await loadLib("notice-board");
      const threads = conversations.threads.map((t) => ({ ...t, omos: t.omos || [], people: t.people || [], subject: t.subject || "", messages: (t.messages || []).map((m) => ({ ...m, text: m.text || "", files: m.files || [] })) }));
      const rows = buildBoard({ threads, sent: sent || {}, marks: {}, now }).filter((r) => r.next);
      const open = rows.filter((r) => r.kind === "ppn" && !r.steps.sent.done);
      const overdue = open.filter((r) => hoursLeft(r, now) < 0);
      const dueSoon = open.filter((r) => hoursLeft(r, now) >= 0 && hoursLeft(r, now) < 24);
      if (overdue.length) lines.push(`⏰ ${overdue.length} notice${overdue.length === 1 ? "" : "s"} overdue (${overdue.slice(0, 3).map((r) => r.omo).join(", ")})`);
      if (dueSoon.length) lines.push(`⏱ ${dueSoon.length} notice${dueSoon.length === 1 ? "" : "s"} due within 24 h`);
      const docs = rows.filter((r) => r.kind === "docs" && !r.steps.sent.done);
      if (docs.length) lines.push(`📋 ${docs.length} documents request${docs.length === 1 ? "" : "s"} to send`);
    } catch (e) { console.log(`briefing notices skipped: ${e.message}`); }
  }
  // Payment rejections not answered yet (rejected after the paperwork on record, last 120 days).
  const toFix = Object.entries(requests?.jobs || {}).filter(([omo, j]) => j?.rejectedAt && now - Date.parse(j.rejectedAt) < 120 * 86400000 && !(sent?.[omo]?.sentAt && sent[omo].sentAt > j.rejectedAt));
  if (toFix.length) lines.push(`💵 ${toFix.length} payment rejection${toFix.length === 1 ? "" : "s"} to fix`);
  return {
    key: `m:${today}`, kind: "message",
    title: lines.length ? "☀️ Good morning: your day" : "☀️ Good morning: nothing urgent today",
    body: lines.length ? lines.join(" · ") : "No bids due, no notices running late. Open HPD Field for the map.",
    url: "/map/?view=all&map=1&today=1", tag: "morning",
  };
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
  // The bid records (faxes, NO BIDs) for the evening wrap-up.
  let records = {};
  try { const r = await fetch(`${WORKER}/overrides`, { cache: "no-store" }); if (r.ok) records = (await r.json()).overrides || {}; } catch { /* no records: the wrap-up leaves faxes out */ }
  const pip = JSON.parse(read(path.join(ROOT, "public/data/pip_paid.json")) || "null");
  const payments = JSON.parse(read(path.join(ROOT, "public/data/pip_payments.json")) || "null");
  const alerts = TEST || BRIEF_NOW || WRAP_NOW || MONEY_NOW ? [] : await findAlerts({ conversations, bids, sent, requests, loadLib, records, pip, payments });
  if (MONEY_NOW) { const f = await moneyReport({ pip, payments, requests, sent, loadLib, force: true }); if (f) alerts.push({ ...f, key: `f:now:${Date.now()}` }); }
  if (WRAP_NOW) { const w = await eveningWrapup({ conversations, bids, sent, records, loadLib, force: true }); if (w) alerts.push({ ...w, key: `w:now:${Date.now()}` }); }
  if (BRIEF_NOW) { const b = await morningBriefing({ conversations, bids, sent, requests, loadLib, force: true }); if (b) alerts.push({ ...b, key: `m:now:${Date.now()}` }); }
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : null;
  const seen = new Set(state?.seen || []);
  const fresh = alerts.filter((a) => !seen.has(a.key));
  const nextState = { note: "Phone alerts already sent (short hashes only). scripts/send-push.mjs", seen: [...new Set([...(state?.seen || []), ...alerts.map((a) => a.key)])].slice(-3000), dead: state?.dead || [] };
  if (!TEST && !BRIEF_NOW && !WRAP_NOW && !MONEY_NOW && !state) { if (!DRY) fs.writeFileSync(STATE, JSON.stringify(nextState)); console.log(`First run: remembered ${alerts.length} things, nothing sent.`); return; }
  if (TEST) fresh.push({ key: "test", kind: "award", title: "💰 Test alert from HPD Field", body: "Phone alerts work. Wins ring cha-ching; notices, requests, rejections and new bids each have their own alert.", url: "/map/?view=all&map=1", tag: "hpd-test" });
  if (!fresh.length) { console.log("Phone alerts: nothing new."); return; }
  // Who gets them: the phones that turned alerts on (PUSH-<id> on the status server, encrypted).
  // Straight from storage (/push-subs); the combined list (/overrides) can miss a phone saved at a busy moment.
  let overrides = {};
  const direct = await fetch(`${WORKER}/push-subs`, { cache: "no-store" }).catch(() => null);
  if (direct?.ok) overrides = (await direct.json()).subs || {};
  else { const res = await fetch(`${WORKER}/overrides`, { cache: "no-store" }); overrides = res.ok ? (await res.json()).overrides || {} : {}; }
  const subs = Object.entries(overrides).filter(([key, v]) => key.startsWith("PUSH-") && v?.enc && !v.off && !nextState.dead.includes(key)).map(([key, v]) => {
    try { return { key, full: v.signedIn === true, sub: JSON.parse(openSealed(Buffer.from(v.enc, "base64"), k).toString("utf8")) }; } catch { return null; }
  }).filter(Boolean);
  // Several new things: one alert each (up to 5), then one "and N more".
  const list = fresh.length > 6 ? [...fresh.slice(0, 5), { key: "more", title: `🔔 ${fresh.length - 5} more updates`, body: "Open HPD Field to see them.", url: "/map/?view=all&map=1", tag: "more" }] : fresh;
  console.log(`Phone alerts: ${fresh.length} new, ${subs.length} phone(s).`);
  if (DRY) { for (const a of list) console.log(` - ${a.title} | ${a.body}`); return; }
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(SITE, PUSH_PUBLIC_KEY, priv);
  for (const { key, sub, full } of subs) {
    for (const a of list) {
      try {
        await webpush.sendNotification(sub, JSON.stringify({ title: a.title, body: full ? a.body : "Open HPD Field to see it.", url: a.url, tag: a.tag, kind: a.kind || "message" }), { TTL: 6 * 3600, urgency: a.kind === "urgent" || a.kind === "notice" || a.kind === "rejection" || a.kind === "award" ? "high" : "normal" });
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { nextState.dead.push(key); console.log(`${key}: phone turned alerts off (removed)`); break; }
        console.log(`${key}: not sent (${e.statusCode || e.message})`);
      }
    }
  }
  if (!TEST && !BRIEF_NOW && !WRAP_NOW && !MONEY_NOW) fs.writeFileSync(STATE, JSON.stringify(nextState));
  else console.log(`${BRIEF_NOW ? "Morning briefing" : WRAP_NOW ? "Evening wrap-up" : MONEY_NOW ? "Friday money report" : "Test alert"} sent to ${subs.length} phone(s).`);
}

if (/send-push\.mjs$/.test(process.argv[1] || "")) {
  main().catch((e) => { console.log(`Phone alerts failed: ${e.message}`); process.exitCode = 0; });
}
