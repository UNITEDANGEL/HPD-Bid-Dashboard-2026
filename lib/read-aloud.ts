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

// Returns false when the device can't speak.
export function readAloud(text: string, onDone?: () => void) {
  if (!canReadAloud() || !text.trim()) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.trim());
  const voice = bestVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || "en-US";
  utterance.rate = 0.9;
  if (onDone) {
    utterance.onend = onDone;
    utterance.onerror = onDone;
  }
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopReading() {
  if (canReadAloud()) window.speechSynthesis.cancel();
}
