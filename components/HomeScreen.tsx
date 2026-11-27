"use client";

// The home screen: only what's used every day, with real numbers. Invitations to bid (open, due today,
// arrived today), the map with the jobs, paperwork, and bid stats. The old full dashboard is at /overview/.
import { useEffect, useState } from "react";
import { monthGlance, type MonthGlance } from "../lib/month-glance";
import { whoOwes, lateLine } from "../lib/who-owes";
import { daysLeft, expiringSoon, loadPapers } from "../lib/papers";
import { weekScore, onTimeLate, trend, trendMark, type WeekScore, type OnTimeLate } from "../lib/week-score";
import { paysBest } from "../lib/pays-best";
import { awardCountdown, daysLeftText, finishByText, finishMonth, afterAskText, maturityMoney, maturityNeedsAfter, maturityNotStarted, maturityWeek, maturityWorkerText, shiftMonth, MONTH_NAMES, type Countdown } from "../lib/award-countdown";
import { accessWaiting, triesText, type AccessWaiting } from "../lib/access-waiting";
import { allJobNotes } from "../lib/job-notes";
import { whoToCall, type CallWho } from "../lib/late-call";
import { loadPrivate } from "../lib/private-data";
import { workDoneToSend, type DoneToSend } from "../lib/monday-sweep";
import { fetchServerWorkflowOverrides } from "../lib/paperwork";
import { readLocalOverrides } from "../lib/override-sync";
import { paperworkNextHref } from "../lib/field-next-action";
import { countFieldPhotos } from "../lib/field-photo-store";
import { listFieldVisits } from "../lib/field-visit-store";
import { workerNewSet } from "../lib/worker-new";

type Bid = { omo: string; bidDue: string; bidDueTime: string; receivedAt?: number };
type Award = { OMO?: string; AwardDate?: string; BuildingAddress?: string };

const NY = "America/New_York";
const nyDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: NY }); // YYYY-MM-DD
// COA award dates are "01/05/26" (or ISO).
const isoDay = (v: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(v || "");
  if (!m) return String(v || "").slice(0, 10);
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
};
const minutes = (time: string) => {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(time || "");
  if (!m) return 24 * 60;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2]);
};

// This week vs last week (plan, 20 Nov): green ▲ up, red ▼ down, gray = same.
function Arrow({ now, before }: { now: number; before: number }) {
  const t = trend(now, before);
  return <span data-hpd-smoke="home-week-arrow" data-trend={t} aria-label={t === "same" ? "same as last week" : `${t} from last week`} style={{ color: t === "up" ? "#15803d" : t === "down" ? "#b91c1c" : "#64748b", fontWeight: 800 }}>{trendMark(now, before)}</span>;
}

export default function HomeScreen() {
  const [bids, setBids] = useState<Bid[] | null>(null);
  const [checkedAt, setCheckedAt] = useState("");
  const [unread, setUnread] = useState(0);
  const [awards, setAwards] = useState<Award[] | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [soon, setSoon] = useState<{ name: string; days: number }[]>([]);
  const [glance, setGlance] = useState<MonthGlance | null>(null);
  const [owed, setOwed] = useState<ReturnType<typeof whoOwes> | null>(null);
  const [week, setWeek] = useState<WeekScore | null>(null);
  const [ontime, setOntime] = useState<OnTimeLate | null>(null);
  const [lateOpen, setLateOpen] = useState(false); // 📋 See the late jobs (plan item 30)
  const [noAccess, setNoAccess] = useState<AccessWaiting[]>([]);
  const [countdown, setCountdown] = useState<Countdown[]>([]);
  const [doneSend, setDoneSend] = useState<DoneToSend[]>([]); // 🏁 Work done, send it (plan item 37)
  const [workerNote, setWorkerNote] = useState(""); // 📤 Send this week's list to the worker
  const [wfOverrides, setWfOverrides] = useState<Record<string, Record<string, unknown>>>({}); // 🚧 Not started yet
  const [startedHere, setStartedHere] = useState<string[]>([]); // 🚧 visits / photos saved on this phone
  const [photosHere, setPhotosHere] = useState<Record<string, { before: number; after: number }>>({}); // 🟠 Before / After on this phone
  const [calls, setCalls] = useState<Record<string, CallWho>>({});
  const [calOpen, setCalOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => nyDay(new Date()).slice(0, 7));
  const [calDay, setCalDay] = useState("");
  const [pay, setPay] = useState<{ staleCount: number; stale: number; disbursedCount: number; disbursed: number } | null>(null);

  useEffect(() => {
    fetch("/data/upcoming_bids.json", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      setBids(Array.isArray(d?.bids) ? d.bids : []);
      setCheckedAt(String(d?.generatedAt || ""));
      setUnread(Array.isArray(d?.unread) ? d.unread.length : 0);
    }).catch(() => setBids([]));
    fetch("/data/COA_Fetcher_2026.json", { cache: "no-store" }).then((r) => r.json()).then((d) => setAwards(Array.isArray(d) ? d : [])).catch(() => setAwards([]));
    fetch("/data/pip_payments.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((d) => setPay(d?.totals || null)).catch(() => {});
    const get = (u: string) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([get("/data/sent_paperwork.json"), get("/data/pip_paid.json"), get("/data/pip_payments.json")]).then(([sent, pipPaid, payments]) => {
      setNoAccess(accessWaiting({ notes: allJobNotes(), sent: sent?.jobs }));
      setOwed(whoOwes({ sent: sent?.jobs, pipPaid, today: nyDay(new Date()) }));
      setGlance(monthGlance({ sent: sent?.jobs, pipPaid, payments, month: nyDay(new Date()).slice(0, 7) }));
      fetch("/data/COA_Fetcher_2026.json", { cache: "no-store" }).then((r) => r.json()).catch(() => []).then(async (awardList) => {
        // Days left to finish after award (plan, 21 Nov): open awarded jobs, late and closest first.
        const hpd = await get("/data/hpd_job_status.json");
        const cd = awardCountdown({ awards: Array.isArray(awardList) ? awardList : [], sent: sent?.jobs, closed: hpd?.jobs, today: nyDay(new Date()) });
        setCountdown(cd);
        // 🏁 Work done, send it (plan item 37): work marked done (job or the step saved in the app), paperwork not sent.
        const jobsList = Array.isArray(awardList) ? awardList : [];
        const local = readLocalOverrides() as Record<string, Record<string, unknown>>;
        const upper = (o: Record<string, Record<string, unknown>>) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k.toUpperCase(), v]));
        setDoneSend(workDoneToSend({ jobs: jobsList, overrides: upper(local), sent: sent?.jobs, closed: hpd?.jobs, today: nyDay(new Date()) }));
        setWfOverrides(upper(local));
        // 🚧 Not started yet (plan, 25 Nov): a visit or a photo saved on this phone counts as started.
        const counted: Record<string, { before: number; after: number }> = {};
        Promise.all(maturityWeek(cd).map(async (c) => {
          try {
            const [photos, visits] = await Promise.all([countFieldPhotos(c.omo).catch(() => null), listFieldVisits(c.omo).catch(() => [])]);
            if (photos) counted[c.omo] = { before: photos.before, after: photos.after };
            return (photos && photos.total > 0) || (Array.isArray(visits) && visits.length > 0) ? c.omo : "";
          } catch { return ""; }
        })).then((ids) => { setStartedHere(ids.filter(Boolean)); setPhotosHere(counted); });
        fetchServerWorkflowOverrides().then((server) => {
          const merged: Record<string, Record<string, unknown>> = { ...upper(server) };
          for (const [k, v] of Object.entries(upper(local))) merged[k] = { ...(merged[k] || {}), ...v };
          setDoneSend(workDoneToSend({ jobs: jobsList, overrides: merged, sent: sent?.jobs, closed: hpd?.jobs, today: nyDay(new Date()) }));
          setWfOverrides(merged);
        });
        // 📞 Late jobs: who to call (plan item 23): tenant (signed in only) or the super saved for the building.
        const addresses: Record<string, string> = {};
        for (const a of Array.isArray(awardList) ? awardList : []) { const o = String(a?.OMO || "").toUpperCase(); if (o && !addresses[o]) addresses[o] = String(a?.BuildingAddress || ""); }
        let contacts = {};
        try { contacts = JSON.parse(localStorage.getItem("hpd-building-contacts") || "{}"); } catch { /* private mode */ }
        setCalls(whoToCall({ rows: cd, tenants: null, addresses, contacts }));
        loadPrivate().then((p) => { if (p) setCalls(whoToCall({ rows: cd, tenants: p.jobs, addresses, contacts })); });
        setWeek(weekScore({ sent: sent?.jobs, awards: Array.isArray(awardList) ? awardList : [], payments, today: nyDay(new Date()) }));
        // 📊 On time vs late (plan item 27): paperwork sent by HPD's finish date or after it.
        setOntime(onTimeLate({ sent: sent?.jobs, awards: Array.isArray(awardList) ? awardList : [], today: nyDay(new Date()) }));
      });
    });
    setSoon(expiringSoon(loadPapers(), Date.now()).map((p) => ({ name: p.name, days: daysLeft(p.expires, Date.now()) })));
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const today = nyDay(now);
  const nowMin = minutes(now.toLocaleTimeString("en-US", { timeZone: NY, hour: "numeric", minute: "2-digit" }));
  // Still open: due a later day, or today and the due time hasn't passed.
  const open = (bids || []).filter((b) => b.bidDue > today || (b.bidDue === today && minutes(b.bidDueTime) > nowMin));
  const dueToday = open.filter((b) => b.bidDue === today).sort((a, b) => minutes(a.bidDueTime) - minutes(b.bidDueTime));
  const arrivedToday = (bids || []).filter((b) => b.receivedAt && nyDay(new Date(b.receivedAt)) === today).length;
  const monthAgo = nyDay(new Date(now.getTime() - 30 * 86400000));
  // Which work pays best (plan, 20 Nov): top 3 kinds of work by money per work day.
  const best = paysBest((awards || []) as Parameters<typeof paysBest>[0]).slice(0, 3);
  const awarded30 = (awards || []).filter((a) => String(a.OMO || "").toUpperCase() !== "TEST-0001" && isoDay(String(a.AwardDate || "")) >= monthAgo && isoDay(String(a.AwardDate || "")) <= today).length;

  return (
    <main className="home" data-hpd-smoke="home">
      <header className="home-head">
        <div className="home-logo">HPD</div>
        <div>
          <h1>United Angel Construction</h1>
          <p>{now.toLocaleDateString("en-US", { timeZone: NY, weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
      </header>

      <a className="home-card home-bids" href="/map/?bids=1" data-hpd-smoke="home-bids">
        <span className="home-icon">📨</span>
        <span className="home-text">
          <strong>Invitations to bid</strong>
          {bids === null ? <em>Loading…</em> : (
            <>
              <b className="home-big">{open.length} open</b>
              <em>{dueToday.length ? `${dueToday.length} due today · next ${dueToday[0].bidDueTime}` : "none due today"} · {arrivedToday} arrived today</em>
              {checkedAt ? <small>Email checked {new Date(checkedAt).toLocaleTimeString("en-US", { timeZone: NY, hour: "numeric", minute: "2-digit" })}</small> : null}
              {unread ? <small className="home-warn">⚠️ {unread} invitation{unread > 1 ? "s" : ""} couldn&apos;t be read: open your email</small> : null}
            </>
          )}
        </span>
      </a>

      {glance ? (
        <a className="home-card" href="/payments/" data-hpd-smoke="home-month">
          <span className="home-icon">📅</span>
          <span className="home-text">
            <strong>This month at a glance</strong>
            <b className="home-big">{glance.jobsDone} job{glance.jobsDone === 1 ? "" : "s"} sent to HPD</b>
            <em>${Math.round(glance.paid).toLocaleString()} paid · ${Math.round(glance.waiting).toLocaleString()} still waiting (${Math.round(glance.onTheWay).toLocaleString()} on the way)</em>
            {glance.paidAsOf ? <small>Payments checked {glance.paidAsOf}</small> : null}
          </span>
        </a>
      ) : null}

      {owed && owed.count > 0 ? (
        <a className="home-card" href="/payments/" data-hpd-smoke="home-owed">
          <span className="home-icon">💵</span>
          <span className="home-text">
            <strong>Where is my money?</strong>
            <b className="home-big">${Math.round(owed.total).toLocaleString()} waiting on {owed.count} job{owed.count === 1 ? "" : "s"}</b>
            {lateLine(owed.jobs) ? <b data-hpd-smoke="home-owed-late" style={{ color: "#b45309" }}>⚠ {lateLine(owed.jobs)}</b> : null}
            {owed.jobs.map((j) => (
              <em key={j.omo}>{j.omo}: ${Math.round(j.amount).toLocaleString()} · {j.days} day{j.days === 1 ? "" : "s"}{j.partly ? " (partly paid)" : ""}</em>
            ))}
          </span>
        </a>
      ) : null}

      {noAccess.length ? (
        <a className="home-card" href="/map/" data-hpd-smoke="home-no-access">
          <span className="home-icon">🚪</span>
          <span className="home-text">
            <strong>Jobs waiting on access</strong>
            <b className="home-big">{noAccess.length} job{noAccess.length === 1 ? "" : "s"} where nobody let you in</b>
            {noAccess.map((j) => (
              <em key={j.omo}>{j.omo}: {j.tries.length} {j.tries.length === 1 ? "try" : "tries"} · {triesText(j.tries)}{j.tries.length >= 2 ? " · ready for the no-access paperwork" : ""}</em>
            ))}
          </span>
        </a>
      ) : null}

      {week ? (
        <div className="home-card" data-hpd-smoke="home-week">
          <span className="home-icon">{week.trophy ? "🏆" : "📈"}</span>
          <span className="home-text">
            <a href="/payments/" style={{ display: "flex", flexDirection: "column", gap: 4, color: "inherit", textDecoration: "none" }}>
              <strong>{week.trophy ? "Great week so far" : "Your week so far"}</strong>
              <b className="home-big">{week.sent} sent <Arrow now={week.sent} before={week.last.sent} /> · {week.won} won <Arrow now={week.won} before={week.last.won} /></b>
              <em>${Math.round(week.moneyIn).toLocaleString()} in this week (Monday to today) <Arrow now={week.moneyIn} before={week.last.moneyIn} /></em>
              <small data-hpd-smoke="home-week-last">Same days last week: {week.last.sent} sent · {week.last.won} won · ${Math.round(week.last.moneyIn).toLocaleString()} in</small>
            </a>
            {ontime && (ontime.onTime + ontime.late + ontime.last.onTime + ontime.last.late) > 0 ? (
              <span data-hpd-smoke="home-week-ontime" style={{ display: "block", marginTop: 6, fontSize: 16, lineHeight: 1.35 }}>
                <b style={{ color: "#15803d" }}>✅ {ontime.onTime} on time</b> · {ontime.late ? (
                  <button type="button" data-hpd-smoke="home-week-late-toggle" aria-expanded={lateOpen} onClick={() => setLateOpen(!lateOpen)} style={{ background: "#7f1d1d", color: "#fff", border: "1px solid #b91c1c", borderRadius: 999, padding: "6px 12px", minHeight: 40, fontSize: 16, fontWeight: 800 }}>⏰ {ontime.late} late {lateOpen ? "▲" : "▼"}</button>
                ) : <b style={{ color: "#64748b" }}>⏰ 0 late</b>} this week
                <small style={{ display: "block" }} data-hpd-smoke="home-week-ontime-last">Last week (same days): {ontime.last.onTime} on time · {ontime.last.late} late. On time = paperwork sent by HPD&apos;s finish date.</small>
                {lateOpen && ontime.lateList.length ? (
                  <span data-hpd-smoke="home-week-late-list" style={{ display: "block", marginTop: 8 }}>
                    {ontime.lateList.map((j) => (
                      <a key={j.omo} href={`/map/?omo=${encodeURIComponent(j.omo)}`} data-hpd-smoke="home-week-late-row" data-days={j.days} style={{ display: "block", padding: "8px 0", borderTop: "1px solid #24324f", color: "inherit", textDecoration: "none", fontSize: 17 }}>
                        <b>{j.omo}</b>: <b style={{ color: "#f87171" }}>{j.days} day{j.days === 1 ? "" : "s"} late</b> <small>(HPD finish {Number(j.due.slice(5, 7))}/{Number(j.due.slice(8, 10))}, sent {Number(j.sent.slice(5, 7))}/{Number(j.sent.slice(8, 10))})</small> <span aria-hidden>→</span>
                      </a>
                    ))}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      {doneSend.length ? (
        <div className="home-card" data-hpd-smoke="home-done-send">
          <span className="home-icon">🏁</span>
          <span className="home-text">
            <strong>Work done, send it</strong>
            <b className="home-big">{doneSend.length} finished job{doneSend.length === 1 ? "" : "s"} with paperwork not sent to HPD</b>
            {doneSend.map((d) => (
              <a key={d.omo} href={paperworkNextHref(d.omo, d.outcome)} data-hpd-smoke="home-done-send-row" style={{ display: "block", padding: "8px 0", borderTop: "1px solid #24324f", color: d.days !== null && d.days >= 7 ? "#b91c1c" : d.days !== null && d.days >= 3 ? "#b45309" : "inherit", fontSize: 17, fontWeight: 800, textDecoration: "none" }}>
                {d.omo}: {d.outcome === "PARTIAL_WORK" ? "partial work" : "work done"}{d.days === null ? "" : d.days === 0 ? " today" : ` ${d.days} day${d.days === 1 ? "" : "s"} ago`} <span aria-hidden>→</span>
              </a>
            ))}
            <small>Oldest first. Tap a job to open its paperwork (you see a preview before anything is sent).</small>
          </span>
        </div>
      ) : null}

      {(() => {
        // 💵 Maturity this week (plan item 35): jobs whose maturity date is today or in the next 7 days, closest first.
        const mw = maturityWeek(countdown);
        if (!mw.length) return null;
        const notStarted = new Set(maturityNotStarted(mw, { overrides: wfOverrides, started: startedHere }));
        const fromWorker = workerNewSet(wfOverrides); // 📸 New worker photos (plan item 43)
        const needsAfter = new Set(maturityNeedsAfter(mw, { overrides: wfOverrides, photos: photosHere })); // 🟠 plan item 44
        return (
          <div className="home-card" data-hpd-smoke="home-maturity-week">
            <span className="home-icon">💵</span>
            <span className="home-text">
              <strong>Maturity this week</strong>
              <b className="home-big">{mw.length} job{mw.length === 1 ? "" : "s"} to finish and send by {finishByText(mw[mw.length - 1].due, today).split(" (")[0]}</b>
              {mw.map((c) => (
                <a key={c.omo} href={`/map/?omo=${encodeURIComponent(c.omo)}`} data-hpd-smoke="home-maturity-week-row" data-days={c.days} style={{ display: "block", padding: "8px 0", borderTop: "1px solid #24324f", color: c.days <= 1 ? "#b91c1c" : c.days <= 3 ? "#b45309" : "inherit", fontSize: 17, fontWeight: 800, textDecoration: "none" }}>
                  {c.omo}: {finishByText(c.due, today)}{c.amount ? <span data-hpd-smoke="home-maturity-week-amount"> · ${Math.round(c.amount).toLocaleString()}</span> : null}{notStarted.has(c.omo) ? <span data-hpd-smoke="home-maturity-week-notstarted" style={{ display: "inline-block", marginLeft: 8, padding: "2px 10px", borderRadius: 999, background: "#b91c1c", color: "#fff", fontSize: 15, fontWeight: 800, verticalAlign: "middle" }}>🚧 not started</span> : null}{fromWorker.has(c.omo) ? <span data-hpd-smoke="home-maturity-week-worker-new" style={{ display: "inline-block", marginLeft: 8, padding: "2px 10px", borderRadius: 999, background: "#7c3aed", color: "#fff", fontSize: 15, fontWeight: 800, verticalAlign: "middle" }}>📸 new from worker</span> : null}{needsAfter.has(c.omo) ? <span data-hpd-smoke="home-maturity-week-needs-after" style={{ display: "inline-block", marginLeft: 8, padding: "2px 10px", borderRadius: 999, background: "#c2410c", color: "#fff", fontSize: 15, fontWeight: 800, verticalAlign: "middle" }}>🟠 needs After</span> : null} <span aria-hidden>→</span>
                </a>
              ))}
              {needsAfter.size ? <b data-hpd-smoke="home-maturity-week-needs-after-count" style={{ display: "block", padding: "8px 0", borderTop: "1px solid #24324f", color: "#c2410c", fontSize: 18 }}>🟠 {needsAfter.size} with Before but no After photo yet</b> : null}
              {mw.filter((c) => needsAfter.has(c.omo)).map((c) => (
                <button key={`ask-${c.omo}`} type="button" data-hpd-smoke="home-maturity-week-ask-after" data-omo={c.omo} onClick={async () => {
                  // 📷 Ask the worker for the After photo (plan item 46): job number, address and finish date only.
                  const a = (awards || []).find((x) => String(x?.OMO || "").trim().toUpperCase() === c.omo.toUpperCase());
                  const text = afterAskText(c, String(a?.BuildingAddress || ""), today);
                  try {
                    if (navigator.share) { await navigator.share({ title: `After photos for ${c.omo}`, text }); setWorkerNote(`Asked for ${c.omo}'s After photos ✓`); return; }
                    await navigator.clipboard.writeText(text); setWorkerNote(`Copied ✓ Paste it in a text to your worker (${c.omo}).`);
                  } catch (e) { if ((e as Error)?.name !== "AbortError") setWorkerNote("Couldn't share. Try again."); }
                }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", margin: "6px 0", minHeight: 48, borderRadius: 12, border: "none", background: "#c2410c", color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>📷 Ask worker for {c.omo}&apos;s After photo</button>
              ))}
              {notStarted.size ? <b data-hpd-smoke="home-maturity-week-notstarted-count" style={{ display: "block", padding: "8px 0", borderTop: "1px solid #24324f", color: "#b91c1c", fontSize: 18 }}>🚧 {notStarted.size} not started yet (no visit or photo)</b> : null}
              {maturityMoney(mw) > 0 ? <b data-hpd-smoke="home-maturity-week-total" style={{ display: "block", padding: "8px 0", borderTop: "1px solid #24324f", fontSize: 18 }}>💲 ${Math.round(maturityMoney(mw)).toLocaleString()} riding on this week</b> : null}
              <a href={`/map/?route=${mw.map((c) => encodeURIComponent(c.omo)).join(",")}`} data-hpd-smoke="home-maturity-week-route" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, margin: "8px 0", minHeight: 48, borderRadius: 12, background: "#1d4ed8", color: "#fff", fontSize: 18, fontWeight: 800, textDecoration: "none" }}>🗺 Route for these {mw.length} job{mw.length === 1 ? "" : "s"}</a>
              <button type="button" data-hpd-smoke="home-maturity-week-share" onClick={async () => {
                // 📤 Send this week's list to the worker: OMO, address and finish date only (no tenant names, phones or money).
                const addresses: Record<string, string> = {};
                for (const a of awards || []) { const o = String(a?.OMO || "").trim().toUpperCase(); if (o && !addresses[o]) addresses[o] = String(a?.BuildingAddress || ""); }
                const text = maturityWorkerText(mw, addresses, today);
                try {
                  if (navigator.share) { await navigator.share({ title: "Jobs to finish this week", text }); setWorkerNote("Shared ✓"); return; }
                  await navigator.clipboard.writeText(text); setWorkerNote("Copied ✓ Paste it in a text to your worker.");
                } catch (e) { if ((e as Error)?.name !== "AbortError") setWorkerNote("Couldn't share. Try again."); }
              }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", margin: "8px 0", minHeight: 48, borderRadius: 12, border: "none", background: "#15803d", color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>📤 Send this list to my worker</button>
              {workerNote ? <small data-hpd-smoke="home-maturity-week-share-note" style={{ display: "block", fontSize: 16, fontWeight: 700 }}>{workerNote}</small> : null}
              <small>Maturity = HPD&apos;s finish date. Tap a job to open it, 🗺 to plan the route (closest date first), or 📤 to send the jobs, addresses and finish dates to your worker (no tenant names or phones).</small>
            </span>
          </div>
        );
      })()}

      {countdown.length ? (
        <div className="home-card" data-hpd-smoke="home-countdown">
          <span className="home-icon">⏳</span>
          <span className="home-text">
            <strong>Days left to finish</strong>
            {countdown.slice(0, 5).map((c, i) => (
              <div key={c.omo} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "4px 0" }}>
                <a href={`/map/?omo=${encodeURIComponent(c.omo)}`} className={i === 0 ? "home-big" : undefined} data-hpd-smoke="home-countdown-row" data-days={c.days} style={{ flex: "1 1 auto", color: c.days < 0 ? "#b91c1c" : c.days <= 3 ? "#b45309" : "inherit", fontWeight: 800, textDecoration: "none" }}>{c.omo}: {daysLeftText(c.days)} <small style={{ fontWeight: 400 }}>(due {Number(c.due.slice(5, 7))}/{Number(c.due.slice(8, 10))})</small></a>
                {calls[c.omo] ? <a href={`tel:${calls[c.omo].tel}`} data-hpd-smoke="home-countdown-call" data-kind={calls[c.omo].kind} aria-label={`Call ${calls[c.omo].who} for ${c.omo}`} style={{ flex: "0 0 auto", background: "#15803d", color: "#fff", borderRadius: 999, padding: "8px 14px", fontSize: 16, fontWeight: 800, textDecoration: "none", minHeight: 40, display: "inline-flex", alignItems: "center" }}>📞 Call {calls[c.omo].who}</a> : null}
              </div>
            ))}
            <small>{countdown.length} awarded job{countdown.length === 1 ? "" : "s"} not sent yet{countdown.length > 5 ? ` (${countdown.length - 5} more on the map)` : ""}. Tap one to open it{Object.keys(calls).length ? ", 📞 to call who lets you in" : ""}.</small>
          </span>
        </div>
      ) : null}

      {countdown.length ? (() => {
        // 📅 Finish dates on a calendar (plan item 20, 21 Nov): each open awarded job on HPD's finish date, late ones red.
        const today = nyDay(now);
        const thisMonth = today.slice(0, 7);
        const inMonth = countdown.filter((c) => c.due.startsWith(calMonth));
        const lateBefore = countdown.filter((c) => c.days < 0 && c.due < `${calMonth}-01`).length;
        const picked = calDay ? countdown.filter((c) => c.due === calDay) : [];
        const navBtn = { minWidth: 48, minHeight: 44, fontSize: 22, fontWeight: 800, border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff", color: "#0f172a" } as const;
        return (
          <div className="home-card" data-hpd-smoke="home-finish-cal" style={{ display: "block" }}>
            <button type="button" data-hpd-smoke="home-finish-cal-toggle" aria-expanded={calOpen} onClick={() => { setCalOpen(!calOpen); setCalMonth(thisMonth); setCalDay(""); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: 0, padding: 0, textAlign: "left", fontSize: 18, fontWeight: 800, color: "inherit" }}>
              <span className="home-icon">📅</span>
              <span style={{ flex: 1 }}>Finish dates calendar<br /><small style={{ fontWeight: 400 }}>{countdown.filter((c) => c.due.startsWith(thisMonth)).length} due this month · tap to {calOpen ? "close" : "open"}</small></span>
              <span aria-hidden>{calOpen ? "▲" : "▼"}</span>
            </button>
            {calOpen ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <button type="button" aria-label="Month before" data-hpd-smoke="home-finish-cal-prev" style={navBtn} onClick={() => { setCalMonth(shiftMonth(calMonth, -1)); setCalDay(""); }}>‹</button>
                  <strong data-hpd-smoke="home-finish-cal-month" style={{ fontSize: 20 }}>{MONTH_NAMES[Number(calMonth.slice(5, 7)) - 1]} {calMonth.slice(0, 4)}</strong>
                  <button type="button" aria-label="Next month" data-hpd-smoke="home-finish-cal-next" style={navBtn} onClick={() => { setCalMonth(shiftMonth(calMonth, 1)); setCalDay(""); }}>›</button>
                </div>
                <div role="grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginTop: 8, fontSize: 15, textAlign: "center" }}>
                  {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <b key={i} style={{ color: "#64748b" }}>{d}</b>)}
                  {finishMonth(countdown, calMonth, today).flat().map((cell, i) => {
                    if (!cell) return <span key={i} />;
                    const late = cell.jobs.some((c) => c.days < 0);
                    const soon = !late && cell.jobs.some((c) => c.days <= 3);
                    const bg = !cell.jobs.length ? "transparent" : late ? "#fee2e2" : soon ? "#fef3c7" : "#dbeafe";
                    const fg = late ? "#b91c1c" : soon ? "#b45309" : "#1e3a8a";
                    return (
                      <button key={i} type="button" data-hpd-smoke="home-finish-cal-day" data-day={cell.iso} data-count={cell.jobs.length} disabled={!cell.jobs.length} onClick={() => setCalDay(calDay === cell.iso ? "" : cell.iso)}
                        aria-label={`${cell.iso}: ${cell.jobs.length} job${cell.jobs.length === 1 ? "" : "s"} due`}
                        style={{ minHeight: 46, padding: 2, borderRadius: 8, border: cell.today ? "2px solid #0f172a" : calDay === cell.iso ? "2px solid #2563eb" : "1px solid #e2e8f0", background: bg, color: cell.jobs.length ? fg : "#475569", fontSize: 15, fontWeight: cell.jobs.length ? 800 : 400, lineHeight: 1.1 }}>
                        {cell.date}{cell.jobs.length ? <><br /><span style={{ fontSize: 13 }}>{cell.jobs.length} job{cell.jobs.length === 1 ? "" : "s"}</span></> : null}
                      </button>
                    );
                  })}
                </div>
                {picked.length ? (
                  <div data-hpd-smoke="home-finish-cal-list" style={{ marginTop: 8 }}>
                    {picked.map((c) => (
                      <a key={c.omo} href={`/map/?omo=${encodeURIComponent(c.omo)}`} data-hpd-smoke="home-finish-cal-job" style={{ display: "block", padding: "8px 0", fontSize: 18, fontWeight: 800, color: c.days < 0 ? "#b91c1c" : c.days <= 3 ? "#b45309" : "inherit", textDecoration: "none" }}>{c.omo}: {daysLeftText(c.days)} ›</a>
                    ))}
                  </div>
                ) : null}
                <small data-hpd-smoke="home-finish-cal-note" style={{ display: "block", marginTop: 6 }}>
                  {inMonth.length} due in {MONTH_NAMES[Number(calMonth.slice(5, 7)) - 1]}{lateBefore ? ` · ${lateBefore} late from before (red on earlier months)` : ""}. Tap a day to see its jobs. Red = late, orange = 3 days or less.
                </small>
              </div>
            ) : null}
          </div>
        );
      })() : null}

      {best.length ? (
        <div className="home-card" data-hpd-smoke="home-pays-best">
          <span className="home-icon">📊</span>
          <span className="home-text">
            <strong>Which work pays best</strong>
            {best.map((k, i) => (
              <b key={k.kind} className={i === 0 ? "home-big" : undefined} data-hpd-smoke="home-pays-best-row" style={{ display: "block" }}>{k.icon} {k.kind}: ${k.perDay.toLocaleString()} a work day</b>
            ))}
            <small>Money per work day (start to finish), from {best.reduce((t, k) => t + k.jobs, 0)} past HPD jobs. Per job: {best.map((k) => `${k.kind.split(" ")[0]} ${k.perJob.toLocaleString()}`).join(" · ")}</small>
          </span>
        </div>
      ) : null}

      <a className="home-card" href="/map/" data-hpd-smoke="home-map">
        <span className="home-icon">🗺️</span>
        <span className="home-text">
          <strong>Map &amp; work orders</strong>
          <em>{awards === null ? "Loading…" : `${awarded30} awarded in the last 30 days`} · follow-up, dates, status</em>
        </span>
      </a>

      <a className="home-card" href="/paperwork/" data-hpd-smoke="home-paperwork">
        <span className="home-icon">📄</span>
        <span className="home-text">
          <strong>Paperwork</strong>
          <em>Affidavit, invoice, send to HPD</em>
        </span>
      </a>

      <a className="home-card" href="/map/?bids=1&tab=stats" data-hpd-smoke="home-stats">
        <span className="home-icon">📊</span>
        <span className="home-text">
          <strong>Bid stats &amp; prices</strong>
          <em>What jobs were won for, your win rate</em>
        </span>
      </a>

      <a className={`home-card${pay && pay.staleCount ? " home-pay-alert" : ""}`} href="/payments/" data-hpd-smoke="home-payments">
        <span className="home-icon">💵</span>
        <span className="home-text">
          <strong>Payments</strong>
          {pay ? <em>{pay.staleCount ? `⚠️ ${pay.staleCount} checks never cashed ($${Math.round(pay.stale).toLocaleString()}) · ` : ""}{pay.disbursedCount} on the way ($${Math.round(pay.disbursed).toLocaleString()})</em> : <em>From PIP: paid, on the way, uncashed checks</em>}
        </span>
      </a>

      <a className={`home-card${soon.length ? " home-pay-alert" : ""}`} href="/papers/" data-hpd-smoke="home-papers">
        <span className="home-icon">🗂</span>
        <span className="home-text">
          <strong>Your papers</strong>
          <em>{soon.length ? `⚠️ ${soon[0].name}: ${soon[0].days < 0 ? "ran out" : `${soon[0].days} days left`}${soon.length > 1 ? ` (+${soon.length - 1} more)` : ""}` : "Insurance and license dates, warned 30 days before"}</em>
        </span>
      </a>

      <a className="home-card" href="https://a127-pip.nyc.gov/webapp/PRDPCW/SelfService" target="_blank" rel="noreferrer" data-hpd-smoke="home-pip">
        <span className="home-icon">💵</span>
        <span className="home-text">
          <strong>HPD payments (PIP)</strong>
          <em>NYC Payee Information Portal: invoices and payments</em>
        </span>
      </a>

      <a className="home-more" href="/overview/">Full dashboard (charts, tables, system)</a>
    </main>
  );
}
