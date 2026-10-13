"use client";

// The home screen: only what's used every day, with real numbers. Invitations to bid (open, due today,
// arrived today), the map with the jobs, paperwork, and bid stats. The old full dashboard is at /overview/.
import { useEffect, useState } from "react";

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

export default function HomeScreen() {
  const [bids, setBids] = useState<Bid[] | null>(null);
  const [checkedAt, setCheckedAt] = useState("");
  const [unread, setUnread] = useState(0);
  const [awards, setAwards] = useState<Award[] | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    fetch("/data/upcoming_bids.json", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      setBids(Array.isArray(d?.bids) ? d.bids : []);
      setCheckedAt(String(d?.generatedAt || ""));
      setUnread(Array.isArray(d?.unread) ? d.unread.length : 0);
    }).catch(() => setBids([]));
    fetch("/data/COA_Fetcher_2026.json", { cache: "no-store" }).then((r) => r.json()).then((d) => setAwards(Array.isArray(d) ? d : [])).catch(() => setAwards([]));
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

      <a className="home-more" href="/overview/">Full dashboard (charts, tables, system)</a>
    </main>
  );
}
