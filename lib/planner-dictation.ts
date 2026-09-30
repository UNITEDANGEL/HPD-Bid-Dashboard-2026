type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
  start(): void; abort(): void;
};
export type RecognitionConstructor = new () => Recognition;

export function startDictation(Engine: RecognitionConstructor, draft: (text: string) => void, status: (text: string) => void, done: () => void) {
  const recognition = new Engine();
  let active = true;
  let received = false;
  const timer = setTimeout(() => {
    if (!active) return;
    status("No speech received. Open in Safari and check microphone permission and Siri. You can still use keyboard dictation.");
    finish();
    recognition.abort();
  }, 20000);
  const finish = () => { if (active) { active = false; clearTimeout(timer); done(); } };
  recognition.onstart = () => { if (active) status("Listening"); };
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    if (!active) return;
    const text = Array.from(event.results).map((result) => result[0]?.transcript || "").join(" ").trim();
    if (text) { received = true; draft(text); status("Draft ready"); }
  };
  recognition.onerror = ({ error }) => {
    if (!active) return;
    status(error === "not-allowed" || error === "service-not-allowed" ? "Microphone permission denied. Open in Safari, check website microphone permission and Siri, then retry." : `Voice input unavailable (${error}). Open in Safari or use keyboard dictation.`);
    finish();
  };
  recognition.onend = () => {
    if (active && !received) status("No speech received. Try again or use keyboard dictation.");
    finish();
  };
  try { recognition.start(); } catch { status("Could not start microphone. You can still type."); finish(); }
  return () => { finish(); recognition.abort(); };
}
