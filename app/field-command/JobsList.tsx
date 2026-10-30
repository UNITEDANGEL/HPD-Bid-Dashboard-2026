"use client";
// Jobs button (owner, 21 Oct: "there's a button for bids and notices, I need one for the jobs"): every open job in one
// list, the most urgent first -- to do (by complete-by date, late ones on top), ready to close out, 2nd tries, paperwork
// sent and waiting on HPD -- with a
// search. Tap a job: the map goes to it and its card opens.
import { useEffect, useMemo, useState } from "react";

export type JobRow = { id: string; address: string; borough: string; status: string; color: string; due: string; award: string; group: "todo" | "closeout" | "secondtry" | "waiting"; note?: string; packageHref?: string; due2nd?: boolean;
  // The tenant (29 Oct): reached / tried / nothing yet / a public-area job.
  contact?: { tone: "none" | "try" | "ok" | "common"; tries: number; phone: boolean; lastAt?: string } };
type Tab = "todo" | "closeout" | "secondtry" | "waiting" | "all";

// "1/15/26", "01/15/2026", "2026-01-15" -> a day number (NaN if unreadable).
const dayNum = (v: string) => {
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || "");
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/.exec(v || "");
  if (m) return Date.UTC(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]) / 86400000;
  return NaN;
};
// Tenants still to call, in calling order (30 Oct): to-do / 2nd-try jobs with a tenant phone whose tenant isn't reached
// yet, oldest due first; jobs tried in the last 3 hours wait their turn. Used by ▶ Start calling and the card's ➡️ Next.
export const needsCall = (r: JobRow) => (r.group === "todo" || r.group === "secondtry") && (r.contact?.tone === "none" || r.contact?.tone === "try");
export function tenantsToCall(rows: JobRow[], exceptId = "", now = Date.now()) {
  return rows.filter((r) => r.id !== exceptId && needsCall(r) && r.contact?.phone && !(r.contact.lastAt && now - Date.parse(r.contact.lastAt) < 3 * 3600000))
    .sort((a, b) => (dayNum(a.due) || 1e9) - (dayNum(b.due) || 1e9));
}
const todayNum = () => { const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()); return dayNum(p); };
const short = (v: string) => { const n = dayNum(v); if (!Number.isFinite(n)) return ""; const d = new Date(n * 86400000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };

export default function JobsList({ rows, onOpen, onClose, initialTab, onTab, onShown, mini = false, onMini }: {
  rows: JobRow[]; onOpen: (id: string) => void; onClose: () => void; initialTab?: string;
  onTab?: (tab: string) => void; onShown?: (key: string, ids: string[]) => void; mini?: boolean; onMini?: (mini: boolean) => void;
}) {
  const [tab, setTabState] = useState<Tab>(() => (initialTab as Tab) || "todo");
  const setTab = (t: Tab) => { setTabState(t); onTab?.(t); onMini?.(false); };
  const [q, setQ] = useState("");
  const [toReach, setToReach] = useState(false);
  const today = todayNum();
  const shown = useMemo(() => {
    const term = q.trim().toUpperCase();
    return rows
      .filter((r) => tab === "all" || r.group === tab)
      .filter((r) => !term || r.id.includes(term) || r.address.toUpperCase().includes(term))
      .filter((r) => !toReach || needsCall(r))
      .sort((a, b) => (dayNum(a.due) || 1e9) - (dayNum(b.due) || 1e9));
  }, [rows, tab, q, toReach]); // eslint-disable-line react-hooks/exhaustive-deps
  // The map above shows these jobs.
  const shownKey = shown.map((r) => r.id).join(",");
  useEffect(() => { onShown?.(`${tab}|${q.trim()}${toReach ? "|reach" : ""}`, shownKey ? shownKey.split(",") : []); }, [tab, q, shownKey, toReach]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (t: Tab) => (t === "all" ? rows.length : rows.filter((r) => r.group === t).length);
  const tabs: [Tab, string][] = [["todo", "🔨 To do"], ["closeout", "📋 Close out"], ["secondtry", "🔒 2nd try"], ["waiting", "⏳ Waiting on HPD"], ["all", "All open"]];
  return (
    <div className={`fc-package-sheet fc-summary-sheet fc-jobs-sheet${mini ? " is-mini" : ""}`} role="dialog" aria-label="Jobs" data-hpd-smoke="fc-jobs">
      <header>
        <strong data-hpd-smoke="fc-jobs-title">🔨 Jobs · {shown.length} on the map</strong>
        <button type="button" className="fc-jobs-fold" data-hpd-smoke="fc-jobs-fold" aria-pressed={mini} onClick={() => onMini?.(!mini)}>{mini ? "☰ List" : "🗺 Map"}</button>
        <button type="button" aria-label="Close" data-hpd-smoke="fc-jobs-close" onClick={onClose}>Close</button>
      </header>
      <div className="fc-summary-body">
        <div className="fc-notif-tabs" role="tablist">
          {tabs.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} data-hpd-smoke={`fc-jobs-tab-${k}`} onClick={() => setTab(k)}>{label} <b>{count(k)}</b></button>)}
        </div>
        <input className="fc-jobs-search" data-hpd-smoke="fc-jobs-search" placeholder="Search job # or address" value={q} onChange={(e) => setQ(e.target.value)} />
        {(() => {
          const n = rows.filter((r) => (tab === "all" || r.group === tab) && needsCall(r)).length;
          const first = toReach ? tenantsToCall(shown)[0] : undefined;
          return n || toReach ? (
            <div className="fc-jobs-reachrow">
              <button type="button" className={`fc-jobs-reach${toReach ? " is-on" : ""}`} aria-pressed={toReach} data-hpd-smoke="fc-jobs-reach" onClick={() => setToReach((v) => !v)}>{toReach ? "✕ Show every job" : `📞 Tenant not reached yet: ${n}`}</button>
              {/* ▶ Start calling (30 Oct): opens the first tenant; ➡️ Next on the card goes on from there. */}
              {first ? <button type="button" className="fc-jobs-startcall" data-hpd-smoke="fc-jobs-startcall" data-omo={first.id} onClick={() => onOpen(first.id)}>▶ Start calling</button> : null}
            </div>
          ) : null;
        })()}
        {!shown.length ? <p className="fc-follow-note" data-hpd-smoke="fc-jobs-empty">{q ? "No job matches." : "Nothing here. 🎉"}</p> : null}
        <ul className="fc-jobs-list">
          {shown.map((r) => {
            const due = dayNum(r.due);
            const late = Number.isFinite(due) && due < today && r.group === "todo" ? Math.round(today - due) : 0;
            return (
              <li key={r.id} data-hpd-smoke="fc-jobs-row" data-omo={r.id} className={late || r.due2nd ? "is-late" : ""}>
                <button type="button" onClick={() => onOpen(r.id)}>
                  <span className="fc-jobs-dot" style={{ background: r.color }} aria-hidden="true" />
                  <span className="fc-jobs-main">
                    <b>{r.id}</b> <small>{r.borough}</small>
                    <span>{r.address}</span>
                    <em>{r.note || r.status}{r.award ? ` · awarded ${short(r.award)}` : ""}</em>
                    {r.contact && (r.group === "todo" || r.group === "secondtry") ? <i className={`fc-jobs-contact is-${r.contact.tone}`} data-hpd-smoke="fc-jobs-contact">{{ none: r.contact.phone ? "🔴 Call the tenant first" : "🔴 Tenant not reached (no phone)", try: `🟡 Not reached yet · ${r.contact.tries} ${r.contact.tries === 1 ? "try" : "tries"}`, ok: "✅ Tenant reached", common: "🏢 Public area: no tenant" }[r.contact.tone]}</i> : null}
                  </span>
                  <span className={`fc-jobs-due${late || r.due2nd ? " is-late" : ""}`}>{late ? `${late}d late` : r.due2nd ? "due now" : r.due && r.group === "todo" ? `due ${short(r.due)}` : ""}</span>
                </button>
                {r.packageHref ? <a className="fc-jobs-package" data-hpd-smoke="fc-close-out-package" href={r.packageHref}>📄 Package</a> : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
