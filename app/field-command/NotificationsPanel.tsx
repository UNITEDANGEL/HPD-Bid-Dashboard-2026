"use client";
// The notifications list (owner, 20 Oct): every alert the app showed, newest first. Tap one to go there (it's marked
// read); ✓ marks it handled; filters by kind. Phone alerts are switched on from here too.
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { clearHandled, filterLog, markAllRead, markLog, readLog, unreadCount, type LogFilter, type LoggedNotice } from "../../lib/notify-log";
import { ALERT_KINDS, kindOf } from "../../lib/alert-kinds";
import { speak } from "../../lib/speak";
import { sayOmo } from "../../lib/alert-summary";
// Which day an alert came (23 Oct, better alerts): "Today", "Yesterday" or the date, New York time.
const dayOf = (iso: string) => {
  const ny = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(t));
  const d = ny(Date.parse(iso));
  return d === ny(Date.now()) ? "Today" : d === ny(Date.now() - 86400000) ? "Yesterday" : new Date(Date.parse(iso)).toLocaleDateString("en-US", { weekday: "long", month: "numeric", day: "numeric" });
};
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) + " " + new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

export default function NotificationsPanel({ onGo, onClose }: { onGo: (n: LoggedNotice) => void; onClose: () => void }) {
  const [all, setAll] = useState<LoggedNotice[]>([]);
  const [filter, setFilter] = useState<LogFilter>("all");
  useEffect(() => {
    const load = () => setAll(readLog());
    load();
    window.addEventListener("hpd-notify-log", load);
    return () => window.removeEventListener("hpd-notify-log", load);
  }, []);
  const shown = filterLog(all, filter);
  const count = (f: LogFilter) => filterLog(all, f).length;
  const tabs: [LogFilter, string][] = [["all", "All"], ["unread", "Unread"], ["award", "💰 Won"], ["notice", "⏱ Notices"], ["request", "📋 Requests"], ["rejection", "💵 Rejections"], ["message", "📩 Messages"], ["bid", "🧾 Bids"], ["fax", "📠 Faxes"], ["urgent", "⏰ Deadlines"], ["done", "✓ Handled"]];
  return (
    <div className="fc-package-sheet fc-summary-sheet fc-notif-sheet" role="dialog" aria-label="Notifications" data-hpd-smoke="fc-notif">
      <header>
        <strong>🔔 Notifications{unreadCount(all) ? ` · ${unreadCount(all)} new` : ""}</strong>
        <button type="button" aria-label="Close" data-hpd-smoke="fc-notif-close" onClick={onClose}>Close</button>
      </header>
      <div className="fc-summary-body">
        <div className="fc-notif-tabs" role="tablist">
          {tabs.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? "is-on" : ""} data-hpd-smoke={`fc-notif-tab-${k}`} onClick={() => setFilter(k)}>{label} <b>{count(k)}</b></button>)}
        </div>
        <div className="fc-notif-actions">
          {/* Read the new ones out loud, newest first (23 Oct, better alerts). */}
          <button type="button" data-hpd-smoke="fc-notif-read-aloud" disabled={!unreadCount(all)} onClick={() => {
            const fresh = all.filter((n) => !n.read && !n.done).slice(0, 6);
            const words = fresh.map((n, i) => `${i + 1}. ${n.title.replace(/^\p{Extended_Pictographic}️?\s*/u, "")}${n.text ? `. ${n.text}` : ""}`).join(". ");
            speak(sayOmo(`You have ${fresh.length} new alert${fresh.length === 1 ? "" : "s"}. ${words}`).replace(/\bHPD\b/g, "H P D").replace(/\s*·\s*/g, ", "), 100);
          }}>🔊 Read them to me</button>
          <button type="button" data-hpd-smoke="fc-notif-all-read" disabled={!unreadCount(all)} onClick={() => setAll(markAllRead())}>Mark all read</button>
          {filter === "done" && shown.length ? <button type="button" data-hpd-smoke="fc-notif-clear" onClick={() => setAll(clearHandled())}>Clear handled</button> : null}
          <Link href="/alerts/" data-hpd-smoke="fc-notif-phone">📱 Phone alerts</Link>
        </div>
        {!shown.length ? <p className="fc-follow-note" data-hpd-smoke="fc-notif-empty">{filter === "all" ? "No notifications yet. Notices, documents requests, payment rejections, messages from HPD, new invitations, fax results and deadlines show here." : "Nothing here."}</p> : null}
        <ul className="fc-notif-list">
          {shown.map((n, i) => (
            <Fragment key={n.id}>
            {i === 0 || dayOf(shown[i - 1].at) !== dayOf(n.at) ? <li className="fc-notif-day" data-hpd-smoke="fc-notif-day">{dayOf(n.at)}</li> : null}
            <li className={`is-${kindOf(n.kind)}${n.read ? "" : " is-unread"}${n.done ? " is-done" : ""}`} style={{ borderLeftColor: ALERT_KINDS[kindOf(n.kind)]?.color }} data-hpd-smoke="fc-notif-row" data-kind={kindOf(n.kind)}>
              <button type="button" className="fc-notif-main" onClick={() => { setAll(markLog(n.id, { read: true })); onGo(n); }}>
                <span aria-hidden="true">{ALERT_KINDS[kindOf(n.kind)]?.icon || "🔔"}</span>
                <span><small className="fc-notif-kind" style={{ color: ALERT_KINDS[kindOf(n.kind)]?.color }}>{ALERT_KINDS[kindOf(n.kind)]?.name}</small><b>{n.title.replace(/^\p{Extended_Pictographic}️?\s*/u, "")}</b>{n.text ? <small>{n.text}</small> : null}<em>{ago(n.at)}</em></span>
              </button>
              <button type="button" className="fc-notif-done" aria-label={n.done ? "Not handled" : "Handled"} data-hpd-smoke="fc-notif-done" onClick={() => setAll(markLog(n.id, { done: !n.done, read: true }))}>{n.done ? "↩" : "✓"}</button>
            </li>
            </Fragment>
          ))}
        </ul>
      </div>
    </div>
  );
}
