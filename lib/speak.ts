// Voice alerts (owner, 22 Oct: "instead of beeps I want an actual voice: urgent email, message from Lewis, requesting
// documents, new invitation to bid, confirmation of award"): after its tone, the alert is said out loud with the
// phone's own voice (Web Speech). Works while the app is open; a locked phone only plays its notification sound, so
// the phone alert's text carries the same words. iPhone only speaks after a touch, so the first touch primes it.
// Off / on is remembered on this phone.

const KEY = "hpd-voice-off";
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

// A clear English voice: the phone's US voice if it has one.
function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter((v) => /^en[-_]US/i.test(v.lang));
  return en.find((v) => /samantha|google us english|aria|jenny|ava|allison/i.test(v.name)) || en.find((v) => v.localService) || en[0] || voices.find((v) => /^en/i.test(v.lang));
}

// On a touch: an empty utterance so later ones are allowed (iPhone).
export function primeVoice() {
  if (primed || !voiceSupported()) return;
  try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; window.speechSynthesis.speak(u); primed = true; } catch { /* no voice */ }
}

// Say it after the tone (delay ms); a newer alert replaces one still being said.
export function speak(text: string, delay = 900) {
  if (!text || !voiceSupported() || voiceOff()) return false;
  try {
    window.setTimeout(() => {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
      u.rate = 0.98;
      u.pitch = 1;
      u.volume = 1;
      synth.speak(u);
    }, delay);
    return true;
  } catch { return false; }
}
