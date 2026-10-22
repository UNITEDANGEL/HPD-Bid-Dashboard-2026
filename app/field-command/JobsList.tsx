"use client";
// Jobs button (owner, 21 Oct: "there's a button for bids and notices, I need one for the jobs"): every open job in one
// list, the most urgent first -- to do (by complete-by date, late ones on top), ready to close out, 2nd tries, paperwork
// sent and waiting on HPD -- with a
// search. Tap a job: the map goes to it and its card opens.
import { useMemo, useState } from "react";

export type JobRow = { id: string; address: string; borough: string; status: string; color: string; due: string; award: string; group: "todo" | "closeout" | "secondtry" | "waiting"; note?: string };
type Tab = "todo" | "closeout" | "secondtry" | "waiting" | "all";

// "1/15/26", "01/15/2026", "2026-01-15" -> a day number (NaN if unreadable).
const dayNum = (v: string) => {
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || "");
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/.exec(v || "");
  if (m) return Date.UTC(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]) / 86400000;
  return NaN;
};
const todayNum = () => { const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()); return dayNum(p); };
const short = (v: string) => { const n = dayNum(v); if (!Number.isFinite(n)) return ""; const d = new Date(n * 86400000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };

export default function JobsList({ rows, onOpen, onClose }: { rows: JobRow[]; onOpen: (id: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("todo");
  const [q, setQ] = useState("");
  const today = todayNum();
  const shown = useMemo(() => {
    const term = q.trim().toUpperCase();
    return rows
      .filter((r) => tab === "all" || r.group === tab)
      .filter((r) => !term || r.id.includes(term) || r.address.toUpperCase().includes(term))
      .sort((a, b) => (dayNum(a.due) || 1e9) - (dayNum(b.due) || 1e9));
  }, [rows, tab, q]);
  const count = (t: Tab) => (t === "all" ? rows.length : rows.filter((r) => r.group === t).length);
  const tabs: [Tab, string][] = [["todo", "🔨 To do"], ["closeout", "📋 Close out"], ["secondtry", "🔒 2nd try"], ["waiting", "⏳ Waiting on HPD"], ["all", "All open"]];
  return (
    <div className="fc-package-sheet fc-summary-sheet fc-jobs-sheet" role="dialog" aria-label="Jobs" data-hpd-smoke="fc-jobs">
      <header>
        <strong>🔨 Jobs · {rows.length} open</strong>
        <button type="button" aria-label="Close" data-hpd-smoke="fc-jobs-close" onClick={onClose}>Close</button>
      </header>
      <div className="fc-summary-body">
        <div className="fc-notif-tabs" role="tablist">
          {tabs.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} data-hpd-smoke={`fc-jobs-tab-${k}`} onClick={() => setTab(k)}>{label} <b>{count(k)}</b></button>)}
        </div>
        <input className="fc-jobs-search" data-hpd-smoke="fc-jobs-search" placeholder="Search job # or address" value={q} onChange={(e) => setQ(e.target.value)} />
        {!shown.length ? <p className="fc-follow-note" data-hpd-smoke="fc-jobs-empty">{q ? "No job matches." : "Nothing here. 🎉"}</p> : null}
        <ul className="fc-jobs-list">
          {shown.map((r) => {
            const due = dayNum(r.due);
            const late = Number.isFinite(due) && due < today && r.group === "todo" ? Math.round(today - due) : 0;
            return (
              <li key={r.id} data-hpd-smoke="fc-jobs-row" data-omo={r.id} className={late ? "is-late" : ""}>
                <button type="button" onClick={() => onOpen(r.id)}>
                  <span className="fc-jobs-dot" style={{ background: r.color }} aria-hidden="true" />
                  <span className="fc-jobs-main">
                    <b>{r.id}</b> <small>{r.borough}</small>
                    <span>{r.address}</span>
                    <em>{r.note || r.status}{r.award ? ` · awarded ${short(r.award)}` : ""}</em>
                  </span>
                  <span className={`fc-jobs-due${late ? " is-late" : ""}`}>{late ? `${late}d late` : r.due && r.group === "todo" ? `due ${short(r.due)}` : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
