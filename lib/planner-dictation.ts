type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; abort(): void;
};
export type RecognitionConstructor = new () => Recognition;

export function startDictation(Engine: RecognitionConstructor, draft: (text: string) => void, status: (text: string) => void, done: () => void) {
  const recognition = new Engine();
  let active = true;
  const finish = () => { if (active) { active = false; done(); } };
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    if (!active) return;
    const text = Array.from(event.results).map((result) => result[0]?.transcript || "").join(" ").trim();
    if (text) { draft(text); status("Draft ready"); }
  };
  recognition.onerror = ({ error }) => {
    if (!active) return;
    status(error === "not-allowed" || error === "service-not-allowed" ? "Microphone permission denied. You can still type." : `Voice input unavailable (${error}). You can still type.`);
    finish();
  };
  recognition.onend = finish;
  try { recognition.start(); } catch { status("Could not start microphone. You can still type."); finish(); }
  return () => { finish(); recognition.abort(); };
}
