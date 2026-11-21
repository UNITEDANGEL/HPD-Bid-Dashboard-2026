"use client";

// The home screen: only what's used every day, with real numbers. Invitations to bid (open, due today,
// arrived today), the map with the jobs, paperwork, and bid stats. The old full dashboard is at /overview/.
import { useEffect, useState } from "react";
import { monthGlance, type MonthGlance } from "../lib/month-glance";
import { whoOwes, lateLine } from "../lib/who-owes";
import { daysLeft, expiringSoon, loadPapers } from "../lib/papers";
import { weekScore, trend, trendMark, type WeekScore } from "../lib/week-score";
import { paysBest } from "../lib/pays-best";
import { accessWaiting, triesText, type AccessWaiting } from "../lib/access-waiting";
import { allJobNotes } from "../lib/job-notes";

type Bid = { omo: string; bidDue: string; bidDueTime: string; receivedAt?: number };
type Award = { OMO?: string; AwardDate?: string };

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
  const [noAccess, setNoAccess] = useState<AccessWaiting[]>([]);
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
      fetch("/data/COA_Fetcher_2026.json", { cache: "no-store" }).then((r) => r.json()).catch(() => []).then((awardList) => {
        setWeek(weekScore({ sent: sent?.jobs, awards: Array.isArray(awardList) ? awardList : [], payments, today: nyDay(new Date()) }));
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
        <a className="home-card" href="/payments/" data-hpd-smoke="home-week">
          <span className="home-icon">{week.trophy ? "🏆" : "📈"}</span>
          <span className="home-text">
            <strong>{week.trophy ? "Great week so far" : "Your week so far"}</strong>
            <b className="home-big">{week.sent} sent <Arrow now={week.sent} before={week.last.sent} /> · {week.won} won <Arrow now={week.won} before={week.last.won} /></b>
            <em>${Math.round(week.moneyIn).toLocaleString()} in this week (Monday to today) <Arrow now={week.moneyIn} before={week.last.moneyIn} /></em>
            <small data-hpd-smoke="home-week-last">Same days last week: {week.last.sent} sent · {week.last.won} won · ${Math.round(week.last.moneyIn).toLocaleString()} in</small>
          </span>
        </a>
      ) : null}

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
