// Notifications list (owner, 20 Oct: "I need alerts all the time; add notifications so we can manage and keep track of
// all"): every banner / ring the app shows is kept here, newest first, with read / handled, so nothing is missed after
// the banner goes away. Kept on this phone (up to 400, 60 days).
import type { AppNotice } from "./chime";
import { kindOf } from "./alert-kinds";

export type LoggedNotice = AppNotice & { id: string; at: string; read?: boolean; done?: boolean };
const KEY = "hpd-notifications-v1";
const MAX = 400;
const KEEP_MS = 60 * 86400000;

export function readLog(now = Date.now()): LoggedNotice[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "[]") as LoggedNotice[];
    return Array.isArray(all) ? all.filter((n) => n && n.id && now - Date.parse(n.at) < KEEP_MS).map((n) => ({ ...n, kind: kindOf(n.kind) })) : [];
  } catch { return []; }
}
function write(all: LoggedNotice[]) {
  try { localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX))); } catch { /* private mode */ }
  try { window.dispatchEvent(new Event("hpd-notify-log")); } catch { /* not in a browser */ }
  return all;
}
// Adds one (the same title + text within 10 minutes counts once).
export function addToLog(n: AppNotice, now = Date.now()) {
  const all = readLog(now);
  if (all.some((x) => x.title === n.title && (x.text || "") === (n.text || "") && now - Date.parse(x.at) < 600000)) return all;
  return write([{ ...n, id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date(now).toISOString() }, ...all]);
}
export function markLog(id: string, patch: Partial<Pick<LoggedNotice, "read" | "done">>) {
  return write(readLog().map((n) => (n.id === id ? { ...n, ...patch } : n)));
}
export function markAllRead() { return write(readLog().map((n) => ({ ...n, read: true }))); }
export function clearHandled() { return write(readLog().filter((n) => !n.done)); }
export const unreadCount = (all: LoggedNotice[]) => all.filter((n) => !n.read && !n.done).length;

export type LogFilter = "all" | "unread" | "done" | "award" | "notice" | "request" | "rejection" | "message" | "bid" | "fax" | "urgent";
export function filterLog(all: LoggedNotice[], f: LogFilter) {
  if (f === "unread") return all.filter((n) => !n.read && !n.done);
  if (f === "done") return all.filter((n) => n.done);
  const open = all.filter((n) => !n.done);
  if (f === "all") return open;
  if (f === "fax") return open.filter((n) => n.kind === "fax-ok" || n.kind === "fax-bad");
  return open.filter((n) => n.kind === f);
}
