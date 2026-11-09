// 🐞 "Something's not working" (owner, 9 Nov: "Button is not working, fix it" — and nobody could tell which button):
// the last taps on this phone (the button's name, never what was typed), kept in memory only, so one tap on
// "Something's not working" tells Claude exactly which button, on which screen, and the errors right before it.
// The status server isn't private: phone numbers, emails and long numbers are taken out (cleanError).
import { cleanError, storedErrors } from "./app-errors";

export type Tap = { at: number; what: string; screen: string };
const trail: Tap[] = [];
let installed = false;

// What a tap was on: the button's own name (aria-label, else its words), short.
export function tapName(el: Element | null): string {
  const b = el?.closest?.("button, a, [role=button], summary, label, input[type=checkbox], select");
  if (!b) return "";
  if (b instanceof HTMLInputElement || b instanceof HTMLSelectElement) return cleanError(b.getAttribute("aria-label") || b.name || b.type).slice(0, 50);
  // The first two lines of what the button shows ("🐞 · Something's not working"), not its small print.
  const shown = ((b as HTMLElement).innerText || b.textContent || "").split(/\n+/).map((x) => x.trim()).filter(Boolean).slice(0, 2).join(" · ");
  const name = b.getAttribute("aria-label") || shown || b.getAttribute("data-hpd-smoke") || b.tagName.toLowerCase();
  return cleanError(name).slice(0, 50);
}

// Which screen it was: the open sheet or panel, else the map.
export function screenName(): string {
  const pick = [
    ['[data-hpd-smoke="fc-itb-full"]', "HPD's page full screen"], ['[data-hpd-smoke="fc-bid-sheet"]', "a bid"], ['[data-hpd-smoke="fc-bids-list"]', "bids map"],
    ['[data-hpd-smoke="job-card"], .fc-job-sheet', "a job card"], ['[data-hpd-smoke="fc-notices"]', "notices"], ['[role="dialog"]', "a pop-up"],
  ] as const;
  for (const [sel, name] of pick) if (document.querySelector(sel)) return name;
  return location.pathname.replace(/\/$/, "") || "/";
}

export function installTapTrail() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("pointerdown", (e) => {
    const what = tapName(e.target as Element);
    if (!what) return;
    trail.push({ at: Date.now(), what, screen: screenName() });
    if (trail.length > 15) trail.shift();
  }, { capture: true, passive: true });
}

export const lastTaps = () => trail.slice();

// The report Claude gets: what you said (optional), the last taps, the errors of the last 30 minutes, the version.
export function brokenReport(note: string, version: string, now = Date.now()) {
  const taps = trail.filter((t) => now - t.at < 30 * 60000).slice(-10)
    .map((t) => `${new Date(t.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })} ${t.what} (${t.screen})`);
  const errs = storedErrors().filter((e) => now - Date.parse(e.at) < 30 * 60000).slice(0, 5).map((e) => `${e.kind}: ${e.msg}`);
  return [
    `🐞 Something's not working${note.trim() ? `: ${note.trim()}` : ""}`,
    `Screen now: ${screenName()}`,
    `Last taps: ${taps.length ? taps.join(" → ") : "none recorded"}`,
    `Errors in the last 30 min: ${errs.length ? errs.join(" | ") : "none"}`,
    `Version: ${version || "?"} · ${navigator.userAgent.includes("iPhone") ? "iPhone" : navigator.userAgent.includes("Android") ? "Android" : "computer"}`,
  ].join("\n");
}
