// Voice alerts (owner, 22 Oct: "instead of beeps I want an actual voice: urgent email, message from Lewis, requesting
// documents, new invitation to bid, confirmation of award"): after its tone, the alert is said out loud with the
// phone's own voice (Web Speech). Works while the app is open; a locked phone only plays its notification sound, so
// the phone alert's text carries the same words. iPhone only speaks after a touch, so the first touch primes it.
// Off / on is remembered on this phone.

const KEY = "hpd-voice-off";
const VOICE_KEY = "hpd-voice-name";
const RATE_KEY = "hpd-voice-rate";
let primed = false;

export function voiceSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}
export function voiceOff() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function setVoiceOff(off: boolean) {
  try { if (off) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}

// The most natural English voice on the phone (27 Oct, "the app should feel premium"): your pick from Phone alerts if
// you made one, else the phone's best: Premium / Enhanced / natural voices first, then the known clear ones; the
// novelty voices (Bells, Zarvox…) never.
export function voiceScore(v: { name: string; lang: string }) {
  if (!/^en/i.test(v.lang)) return -1;
  let n = /^en[-_]US/i.test(v.lang) ? 20 : 5;
  if (/premium/i.test(v.name)) n += 60;
  if (/enhanced|neural|natural|online/i.test(v.name)) n += 40;
  if (/siri/i.test(v.name)) n += 35;
  if (/\b(ava|zoe|evan|nathan|samantha|allison|aria|jenny|guy|google us english)\b/i.test(v.name)) n += 20;
  if (/novelty|whisper|bells|bad news|good news|bahh|bubbles|cellos|jester|organ|trinoids|zarvox|superstar|wobble|boing|albert|fred|junior|ralph|kathy/i.test(v.name)) n -= 80;
  return n;
}
export function englishVoices(): SpeechSynthesisVoice[] {
  if (!voiceSupported()) return [];
  return window.speechSynthesis.getVoices().filter((v) => voiceScore(v) > 0).sort((a, b) => voiceScore(b) - voiceScore(a));
}
export function chosenVoiceName() { try { return localStorage.getItem(VOICE_KEY) || ""; } catch { return ""; } }
export function setChosenVoice(name: string) { try { if (name) localStorage.setItem(VOICE_KEY, name); else localStorage.removeItem(VOICE_KEY); } catch { /* private mode */ } }
export function voiceRate() { try { const r = Number(localStorage.getItem(RATE_KEY)); return r >= 0.7 && r <= 1.4 ? r : 1; } catch { return 1; } }
export function setVoiceRate(r: number) { try { localStorage.setItem(RATE_KEY, String(r)); } catch { /* private mode */ } }
function pickVoice() {
  const all = englishVoices();
  const chosen = chosenVoiceName();
  return (chosen && all.find((v) => v.name === chosen)) || all[0];
}

// Said the way a person would (27 Oct): no emoji or bullets, "58°F" -> "58 degrees", "mph" -> "miles per hour".
export function speechText(text: string) {
  return text
    .replace(/\p{Extended_Pictographic}|️|‍/gu, "")
    .replace(/^\s*[•·]\s*/gm, "")
    .replace(/(\d+)°\s*F\b/g, "$1 degrees").replace(/(\d+)°/g, "$1 degrees")
    .replace(/\bmph\b/g, "miles per hour").replace(/(\d) ?mi\b/g, "$1 miles").replace(/(\d) ?min\b/g, "$1 minutes")
    .replace(/\s*\n+\s*/g, ". ").replace(/([.!?:])\.\s/g, "$1 ").replace(/\s+/g, " ").trim();
}

// Speaking now or not, for the helper's "Stop talking" button.
let talking = false;
function setTalking(on: boolean) {
  if (talking === on) return;
  talking = on;
  try { window.dispatchEvent(new CustomEvent("hpd-speaking", { detail: on })); } catch { /* old browser */ }
}
export function isSpeaking() { return talking; }
export function stopSpeaking() {
  try { if (voiceSupported()) window.speechSynthesis.cancel(); } catch { /* no voice */ }
  setTalking(false);
}

// On a touch: an empty utterance so later ones are allowed (iPhone).
export function primeVoice() {
  if (primed || !voiceSupported()) return;
  try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; window.speechSynthesis.speak(u); primed = true; } catch { /* no voice */ }
}

// Say it after the tone (delay ms); a newer alert replaces one still being said.
// The iPhone's silent switch mutes web sounds unless the page says it plays audio like a music app (Safari 16.4+;
// owner, 23 Oct: "I don't hear the sound alert or the voice").
export function playThroughSilent() {
  try { const nav = navigator as unknown as { audioSession?: { type: string } }; if (nav.audioSession && nav.audioSession.type !== "playback") nav.audioSession.type = "playback"; } catch { /* older iPhone */ }
}

export function speak(text: string, delay = 900, onEnd?: () => void) {
  if (!text || !voiceSupported() || voiceOff()) { if (onEnd) window.setTimeout(onEnd, 300); return false; }
  playThroughSilent();
  try {
    window.setTimeout(() => {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(speechText(text));
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
      u.rate = 0.98 * voiceRate();
      u.pitch = 1;
      u.volume = 1;
      let done = false;
      const fin = () => { if (!done) { done = true; setTalking(false); onEnd?.(); } };
      u.onend = fin; u.onerror = fin;
      // Some phones never say "done": give up after the time it would take to say it.
      window.setTimeout(fin, Math.min(60000, 2500 + text.length * 80));
      setTalking(true);
      synth.speak(u);
    }, delay);
    return true;
  } catch { return false; }
}
