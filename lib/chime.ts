// Rings for the app's notifications (owner, 19 Oct: "a ring or tone for the messages"; 20 Oct: "ring for all
// notifications, including when they reply"). A different tone per kind: email (HPD wrote / replied), good (fax went
// through), bad (fax failed), new (new invitation to bid), urgent (a 24-hour notice under 6 hours). iPhone only plays
// sound after a touch and mutes it again after the app was in the background, so every touch re-unlocks it.
// Muting is remembered on this phone.

import { kindOf, type AlertKind } from "./alert-kinds";

let ctx: AudioContext | null = null;
const KEY = "hpd-chime-off";
export type RingKind = AlertKind;
// A tone of its own for each kind (20 Oct: "unique alerts for all different"). [frequency Hz, start s, length s]
const TONES: Record<AlertKind, [number, number, number][]> = {
  award: [[2093, 0.09, 0.5], [2637, 0.12, 0.7], [3136, 0.15, 0.9]],                    // cha-ching: the bell (the "cha" is a burst of noise)
  message: [[880, 0, 0.32], [1320, 0.16, 0.32]],                                     // two notes up
  notice: [[784, 0, 0.18], [988, 0.2, 0.18], [784, 0.4, 0.18], [988, 0.6, 0.3]],      // siren
  request: [[660, 0, 0.25], [990, 0.2, 0.4]],                                          // soft two notes
  rejection: [[523, 0, 0.22], [415, 0.22, 0.22], [523, 0.44, 0.22], [349, 0.66, 0.45]], // down: money held
  bid: [[1047, 0, 0.2], [1047, 0.26, 0.3]],                                            // double ping
  "fax-ok": [[660, 0, 0.18], [880, 0.12, 0.18], [1320, 0.24, 0.36]],                  // rising
  "fax-bad": [[440, 0, 0.4], [330, 0.3, 0.55]],                                        // low
  urgent: [[988, 0, 0.16], [988, 0.22, 0.16], [988, 0.44, 0.3]],                      // three beeps
};
const VIBES: Record<AlertKind, number[]> = { award: [40, 30, 40, 30, 200], message: [60, 40, 60], notice: [200, 80, 200, 80, 200], request: [80, 60, 80], rejection: [150, 60, 150, 60, 300], bid: [40, 40, 40], "fax-ok": [60], "fax-bad": [120, 60, 120, 60, 120], urgent: [120, 60, 120, 60, 120] };

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

export function playChime(kindIn: RingKind | string = "message") {
  const kind = kindOf(kindIn);
  if (chimeMuted()) return false;
  try {
    if (!ctx) unlockChime();
    if (!ctx) return false;
    if (ctx.state !== "running") void ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    if (kind === "award") {
      // "Cha": a short burst of bright noise (the register drawer), then the bell rings.
      const len = Math.floor(ctx.sampleRate * 0.08);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3000;
      const g = ctx.createGain(); g.gain.value = 0.5;
      src.connect(hp).connect(g).connect(ctx.destination); src.start(t0);
    }
    for (const [freq, at, len] of TONES[kind] || TONES.message) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.38, t0 + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      o.connect(g).connect(ctx.destination); o.start(t0 + at); o.stop(t0 + at + len + 0.02);
    }
    try { navigator.vibrate?.(VIBES[kind] || VIBES.message); } catch { /* not on iPhone */ }
    return true;
  } catch { return false; }
}

// Any part of the app rings and shows the banner through this (the map listens for it).
export type AppNotice = { kind: RingKind; title: string; text?: string; go?: "board" | "bids" | "money"; omo?: string };
export function notify(n: AppNotice) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AppNotice>("hpd-notify", { detail: n }));
}
