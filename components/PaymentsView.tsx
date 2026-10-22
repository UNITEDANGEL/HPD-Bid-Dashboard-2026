"use client";
import { nowMs, useNow } from "../lib/use-now";

// Payments from the City (PIP, NYC Payee Information Portal exports): checks never cashed (stale-dated,
// the City still owes them), payments sent but not yet marked paid, and what was paid by month.
import { useEffect, useState } from "react";

type Payment = { date: string; status: string; id: string; amount: number };
type Data = {
  generatedAt: string;
  totals: { count: number; paid: number; stale: number; staleCount: number; disbursed: number; disbursedCount: number; from: string; to: string };
  stale: Payment[]; disbursed: Payment[]; byMonth: Record<string, number>; recent: Payment[];
};

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const day = (d: string) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}/${d.slice(2, 4)}` : "");
const daysAgo = (d: string) => Math.round((nowMs() - Date.parse(`${d}T12:00:00`)) / 86400000);

export default function PaymentsView() {
  useNow();
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => { fetch("/data/pip_payments.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null)); }, []);
  if (!data) return <main className="home"><p>Loading payments…</p></main>;
  const t = data.totals;
  const months = Object.entries(data.byMonth).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  const max = Math.max(...months.map(([, v]) => v), 1);
  const late = data.disbursed.filter((p) => daysAgo(p.date) > 7);
  return (
    <main className="home pay" data-hpd-smoke="payments">
      <header className="home-head">
        <a className="home-logo" href="/" aria-label="Home">HPD</a>
        <div><h1>Payments from the City</h1><p>From PIP · {t.count} payments {day(t.from)} – {day(t.to)} · {money(t.paid)} paid</p></div>
      </header>

      <section className="pay-card is-alert" data-hpd-smoke="pay-stale">
        <h2>⚠️ {t.staleCount} checks never cashed · {money(t.stale)}</h2>
        <p>These paper checks expired (stale-dated). The City still owes this money: ask HPD (or the Comptroller) to reissue them, with the payment IDs below. Check numbers are in your PIP export.</p>
        <ol>{data.stale.map((p) => <li key={p.id}><b>{money(p.amount)}</b><span>{p.id}</span><small>stale-dated {day(p.date)}</small></li>)}</ol>
        <a className="pay-link" href="https://a127-pip.nyc.gov/webapp/PRDPCW/SelfService" target="_blank" rel="noreferrer">Open PIP ↗</a>
      </section>

      <section className={`pay-card${late.length ? " is-warn" : ""}`} data-hpd-smoke="pay-disbursed">
        <h2>⏳ {t.disbursedCount} payments sent, not yet "Paid" · {money(t.disbursed)}</h2>
        <p>{late.length ? `${late.length} are older than a week: check they reached your bank account.` : "Electronic payments usually turn \"Paid\" within days."}</p>
        <ol>{data.disbursed.map((p) => <li key={p.id} className={daysAgo(p.date) > 7 ? "is-late" : ""}><b>{money(p.amount)}</b><span>{p.id}</span><small>sent {day(p.date)}{daysAgo(p.date) > 7 ? ` · ${daysAgo(p.date)} days ago` : ""}</small></li>)}</ol>
      </section>

      <section className="pay-card" data-hpd-smoke="pay-months">
        <h2>Paid by month</h2>
        <ol className="pay-months">{months.map(([m, v]) => (
          <li key={m}><span>{new Date(`${m}-15T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}</span><i style={{ width: `${Math.max(4, (v / max) * 100)}%` }} /><b>{money(Math.round(v))}</b></li>
        ))}</ol>
      </section>
      <p className="home-more">Updated from your PIP export {new Date(data.generatedAt).toLocaleDateString()}. To refresh, export Check/EFT Summary from PIP again.</p>
    </main>
  );
}
