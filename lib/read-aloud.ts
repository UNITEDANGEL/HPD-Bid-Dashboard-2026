// Reads text out loud with the phone's built-in voice (Web Speech API). Nothing is sent anywhere.

function bestVoice() {
  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter((voice) => /^en[-_]/i.test(voice.lang || ""));
  const preferred = ["Samantha", "Google US English", "Microsoft Aria", "Microsoft Jenny", "Alex", "Karen", "Daniel"];
  for (const name of preferred) {
    const found = english.find((voice) => voice.name.toLowerCase().includes(name.toLowerCase()));
    if (found) return found;
  }
  return english[0] || voices[0] || null;
}

export function canReadAloud() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Returns false when the device can't speak. iPhone (owner, 9 Nov: "button is not working"): speech started right after a
// cancel is often dropped without a word, so a cancel only happens when something is playing, the new speech starts a
// moment later, and if the phone hasn't started it after 1.5 s it is asked once more. onStart: the voice really began;
// onFail: it never did (the button can say so instead of doing nothing).
export function readAloud(text: string, onDone?: () => void, onStart?: () => void, onFail?: () => void) {
  if (!canReadAloud() || !text.trim()) return false;
  const synth = window.speechSynthesis;
  const busy = synth.speaking || synth.pending;
  if (busy) synth.cancel();
  try { synth.resume(); } catch { /* not paused */ }
  let started = false, tries = 0;
  const make = () => {
    const utterance = new SpeechSynthesisUtterance(text.trim());
    const voice = bestVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "en-US";
    utterance.rate = 0.9;
    utterance.onstart = () => { started = true; onStart?.(); };
    utterance.onend = () => { started = true; onDone?.(); };
    utterance.onerror = (e) => { if ((e as SpeechSynthesisErrorEvent).error === "interrupted" || (e as SpeechSynthesisErrorEvent).error === "canceled") { onDone?.(); return; } if (!started && tries < 2) return; onDone?.(); };
    return utterance;
  };
  const go = () => {
    tries += 1;
    synth.speak(make());
    window.setTimeout(() => {
      if (started) return;
      if (tries < 2) { synth.cancel(); window.setTimeout(go, 150); return; }
      onFail?.(); onDone?.();
    }, 1500);
  };
  if (busy) window.setTimeout(go, 150); else go();
  return true;
}

export function stopReading() {
  if (canReadAloud()) window.speechSynthesis.cancel();
}
