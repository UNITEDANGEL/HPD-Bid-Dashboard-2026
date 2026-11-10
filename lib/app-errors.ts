// What breaks on the owner's phone, sent to Claude (2 Nov, "keep upgrading": the voice stopped and nobody knew until the
// owner said so). Script errors, failed promises and screens that crash are kept on the phone (last 15, the same one
// counted, not repeated) and written to the status server as APP-ERRORS-<this phone> at most every 2 minutes, so the
// next upgrade session reads them (scripts/app-errors.mjs) and fixes them. The status server isn't private: emails,
// phone numbers and long numbers are taken out. Never from the automatic tests.
import { HPD_STATUS_WORKER_URL } from "./paperwork";

export type AppError = { at: string; kind: "error" | "promise" | "crash"; msg: string; where: string; page: string; n: number };
const LIST_KEY = "hpd-app-errors";
const DEVICE_KEY = "hpd-device-id";
const SENT_KEY = "hpd-app-errors-sent";
const EVERY_MS = 120000;
let timer: number | undefined;

// No emails, phone numbers or long numbers; short and on one line.
export function cleanError(text: unknown) {
  return String(text ?? "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<email>")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "<number>")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^Uncaught\s+(?:\(in promise\)\s+)?/i, "")
    .slice(0, 300);
}

// Noise every browser makes that says nothing about the app.
export function ignoredError(msg: string) {
  return !msg || /^Script error\.?$|ResizeObserver loop|AbortError|The operation was aborted|Load failed$|Failed to fetch$|NetworkError when attempting|ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed|play\(\) (request|failed)|NotAllowedError/i.test(msg);
}

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch { return "nostore"; }
}

export function storedErrors(): AppError[] {
  try { const v = JSON.parse(localStorage.getItem(LIST_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

function browserLabel() {
  const ua = navigator.userAgent;
  const what = /CriOS/.test(ua) ? "Chrome on iPhone" : /iPhone|iPad/.test(ua) ? "Safari on iPhone" : /Android/.test(ua) ? "Android" : /Edg\//.test(ua) ? "Edge computer" : /Chrome/.test(ua) ? "Chrome computer" : "other";
  const home = Boolean(window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone);
  return `${what}${home ? " (Home Screen)" : ""}`;
}

async function flush(version: string) {
  timer = undefined;
  const errors = storedErrors();
  if (!errors.length) return;
  try { localStorage.setItem(SENT_KEY, String(Date.now())); } catch { /* private mode */ }
  try {
    await fetch(`${HPD_STATUS_WORKER_URL.replace(/\/$/, "")}/override`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: `APP-ERRORS-${deviceId()}`, patch: { device: browserLabel(), version, updated: new Date().toISOString(), errors } }),
    });
  } catch { /* offline: sent with the next one */ }
}

// The exact code that ran (the commit /version.json says), next to the build number: the number alone differs between
// the GitHub build and a build on this computer (bids plan item 7: "version on the phone").
const CODE = process.env.NEXT_PUBLIC_APP_CODE || process.env.NEXT_PUBLIC_APP_COMMIT || "";
export function withCode(version = "") {
  return CODE && !version.includes(CODE) ? `${version} ${CODE}`.trim() : version;
}

export function recordError(kind: AppError["kind"], message: unknown, where: unknown = "", version = "") {
  version = withCode(version);
  if (typeof window === "undefined" || (navigator.webdriver && !(window as unknown as { __hpdReportInTests?: boolean }).__hpdReportInTests)) return;
  const msg = cleanError(message);
  if (ignoredError(msg)) return;
  const list = storedErrors();
  const page = location.pathname;
  const same = list.find((e) => e.msg === msg && e.page === page);
  if (same) { same.n += 1; same.at = new Date().toISOString(); } else list.push({ at: new Date().toISOString(), kind, msg, where: cleanError(where).slice(0, 160), page, n: 1 });
  list.sort((a, b) => a.at.localeCompare(b.at));
  try { localStorage.setItem(LIST_KEY, JSON.stringify(list.slice(-15))); } catch { /* private mode */ }
  if (timer) return;
  let last = 0;
  try { last = Number(localStorage.getItem(SENT_KEY) || 0); } catch { /* private mode */ }
  timer = window.setTimeout(() => void flush(version), Math.max(4000, last + EVERY_MS - Date.now()));
}

// Once per page: script errors and failed promises.
let installed = false;
export function installErrorReporting(version = "") {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    if (!(e instanceof ErrorEvent)) return; // a picture or file that didn't load
    const err = e.error as { stack?: string } | undefined;
    recordError("error", e.message || err, err?.stack?.split("\n").slice(0, 3).join(" ") || `${e.filename || ""}:${e.lineno || ""}`, version);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { name?: string; message?: string; stack?: string } | undefined;
    recordError("promise", r && (r.message || r.name) ? `${r.name || "Error"}: ${r.message || ""}` : String(r), r?.stack?.split("\n").slice(0, 3).join(" ") || "", version);
  });
}
