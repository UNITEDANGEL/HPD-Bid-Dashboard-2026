// A short two-note chime for new emails from HPD (owner, 19 Oct: "I would like a ring or tone for the messages").
// iPhone only plays sound after a touch, so the first tap anywhere unlocks it. Muting is remembered on this phone.

let ctx: AudioContext | null = null;
const KEY = "hpd-chime-off";

export function chimeMuted() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function setChimeMuted(off: boolean) {
  try { if (off) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}

export function unlockChime() {
  if (ctx || typeof window === "undefined") return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  // A silent blip so iOS lets later sounds play.
  const o = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = 0; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.01);
}

export function playChime() {
  if (chimeMuted()) return false;
  try {
    if (!ctx) unlockChime();
    if (!ctx) return false;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    for (const [freq, at] of [[880, 0], [1320, 0.16]] as const) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.32);
      o.connect(g).connect(ctx.destination); o.start(t0 + at); o.stop(t0 + at + 0.34);
    }
    try { navigator.vibrate?.([60, 40, 60]); } catch { /* not on iPhone */ }
    return true;
  } catch { return false; }
}
