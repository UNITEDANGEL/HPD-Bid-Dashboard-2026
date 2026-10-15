"use client";

// Your real win rate: only the bids you faxed HPD (price read from each package) against HPD's award
// (public/data/bid_win_stats.json, scripts/build-bid-win-stats.mjs). Totals only: no job's price is published.
import { useEffect, useState } from "react";

type Group = { bids: number; won: number; winRate: number | null; lostAboveBy: number | null; lostAbovePct: number | null; closeLosses: number; lostBelow: number };
type Stats = {
  generatedAt: string;
  ocrCheck: { wonJobsChecked: number; exact: number };
  total: Group;
  byWork: (Group & { work: string })[];
  byBoro: (Group & { boro: string })[];
  byMonth: (Group & { month: string })[];
  last30?: { since: string; awarded: number; bid: number; notBid: number; notBidValue: number; won: number; lostHigher: number; medianGapPct: number | null; lostBelow: number; byWork: { work: string; lost: number; medianGapPct: number | null }[] };
};

const money = (n: number | null) => (n === null ? "-" : `$${Math.round(n).toLocaleString()}`);
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

export default function SentBidStats() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    fetch("/data/bid_win_stats.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => setS(null));
  }, []);
  if (!s) return null;
  const t = s.total;
  const recent = s.byMonth.slice(-3);
  const before = s.byMonth.slice(-9, -3);
  const rate = (list: Group[]) => { const b = list.reduce((a, g) => a + g.bids, 0); return b ? Math.round((list.reduce((a, g) => a + g.won, 0) / b) * 100) : null; };
  const maxBids = Math.max(...s.byMonth.map((g) => g.bids), 1);
  return (
    <section className="fc-stats-block fc-sent-stats" data-hpd-smoke="fc-sent-stats">
      {s.last30 ? (
        <div className="fc-last30" data-hpd-smoke="fc-last30">
          <h4>Last 30 days: where the jobs went</h4>
          <div className="fc-stats-tiles">
            <div className="is-bad"><b>{s.last30.notBid} of {s.last30.awarded}</b><small>invitations got <b>no bid</b> from you: {money(s.last30.notBidValue)} went to others</small></div>
            <div><b>{s.last30.won} won</b><small>of {s.last30.bid} you bid</small></div>
            <div className="is-bad"><b>{s.last30.lostHigher}</b><small>lost on price: typically <b>{s.last30.medianGapPct}% above</b> the winner</small></div>
            <div><b>{s.last30.lostBelow}</b><small>lost although your price was lower</small></div>
          </div>
          {s.last30.byWork.length ? <p className="fc-stats-note">Biggest price gaps: {s.last30.byWork.map((g) => `${g.work} (${g.lost} lost, ${g.medianGapPct}% above)`).join(" · ")}. The price box now warns when a price would win fewer than 1 in 4 jobs like it.</p> : null}
        </div>
      ) : null}
      <h4>Bids you sent: win rate</h4>
      <div className="fc-stats-tiles">
        <div><b>{t.won} / {t.bids}</b><small>bids won ({t.winRate}%)</small></div>
        <div><b>{rate(recent)}%</b><small>last 3 months (before: {rate(before)}%)</small></div>
        <div><b>{money(t.lostAboveBy)}</b><small>typical gap when you lost ({t.lostAbovePct}% above the winner)</small></div>
        <div><b>{t.closeLosses}</b><small>lost by less than 10%</small></div>
      </div>
      <p className="fc-stats-note">From the {t.bids.toLocaleString()} bids you faxed since Nov 2025 that HPD has awarded. Your price is read from each package (it matched HPD&apos;s award on {s.ocrCheck.exact} of {s.ocrCheck.wonJobsChecked} jobs you won). {t.lostBelow} times you were the lowest and still didn&apos;t get the job: check the fax went through, the package was complete and on time.</p>
      <div className="fc-sent-months" data-hpd-smoke="fc-sent-months" aria-label="Win rate by month">
        {s.byMonth.map((g) => (
          <div key={g.month} title={`${monthLabel(g.month)}: won ${g.won} of ${g.bids}`}>
            <span className="fc-sent-bar" style={{ height: `${Math.max(6, ((g.bids || 0) / maxBids) * 56)}px` }}><i style={{ height: `${g.winRate || 0}%` }} /></span>
            <b>{g.winRate}%</b>
            <small>{monthLabel(g.month)}</small>
          </div>
        ))}
      </div>
      <table className="fc-sent-table" data-hpd-smoke="fc-sent-work">
        <thead><tr><th>Kind of work</th><th>Won</th><th>When you lost</th></tr></thead>
        <tbody>{s.byWork.slice(0, 10).map((g) => (
          <tr key={g.work}><td>{g.work}</td><td>{g.won}/{g.bids} · <b>{g.winRate}%</b></td><td>{g.lostAboveBy === null ? "-" : `${money(g.lostAboveBy)} above (${g.lostAbovePct}%)`}{g.closeLosses ? ` · ${g.closeLosses} close` : ""}</td></tr>
        ))}</tbody>
      </table>
    </section>
  );
}
