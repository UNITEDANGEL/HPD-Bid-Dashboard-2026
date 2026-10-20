// Rings for the app's notifications (owner, 19 Oct: "a ring or tone for the messages"; 20 Oct: "ring for all
// notifications, including when they reply"). A different tone per kind: email (HPD wrote / replied), good (fax went
// through), bad (fax failed), new (new invitation to bid), urgent (a 24-hour notice under 6 hours). iPhone only plays
// sound after a touch and mutes it again after the app was in the background, so every touch re-unlocks it.
// Muting is remembered on this phone.

let ctx: AudioContext | null = null;
const KEY = "hpd-chime-off";
export type RingKind = "email" | "good" | "bad" | "new" | "urgent";
// [frequency Hz, start s, length s]
const TONES: Record<RingKind, [number, number, number][]> = {
  email: [[880, 0, 0.32], [1320, 0.16, 0.32]],
  good: [[660, 0, 0.18], [880, 0.12, 0.18], [1320, 0.24, 0.36]],
  bad: [[440, 0, 0.4], [330, 0.3, 0.55]],
  new: [[1047, 0, 0.2], [1047, 0.26, 0.3]],
  urgent: [[988, 0, 0.16], [988, 0.22, 0.16], [988, 0.44, 0.3]],
};

export function chimeMuted() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function setChimeMuted(off: boolean) {
  try { if (off) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}

export function unlockChime() {
  if (typeof window === "undefined") return;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state !== "running") void ctx.resume();
    // A silent blip so iOS lets later sounds play.
    const o = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = 0; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.01);
  } catch { /* no sound on this browser */ }
}

export function playChime(kind: RingKind = "email") {
  if (chimeMuted()) return false;
  try {
    if (!ctx) unlockChime();
    if (!ctx) return false;
    if (ctx.state !== "running") void ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    for (const [freq, at, len] of TONES[kind] || TONES.email) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.38, t0 + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      o.connect(g).connect(ctx.destination); o.start(t0 + at); o.stop(t0 + at + len + 0.02);
    }
    try { navigator.vibrate?.(kind === "bad" || kind === "urgent" ? [120, 60, 120, 60, 120] : [60, 40, 60]); } catch { /* not on iPhone */ }
    return true;
  } catch { return false; }
}

// Any part of the app rings and shows the banner through this (the map listens for it).
export type AppNotice = { kind: RingKind; title: string; text?: string; go?: "board" | "bids"; omo?: string };
export function notify(n: AppNotice) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AppNotice>("hpd-notify", { detail: n }));
}
