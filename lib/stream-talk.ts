// 🗣 The robot starts talking right away (idea list, 6 Nov): the answer comes word by word (server: aiAnswerStream);
// the phone says the first sentence as soon as it is whole, then the rest when the answer is done.

// The spoken part so far: no DO: / ASK: lines, no markdown marks, one paragraph.
function spokenSoFar(partial: string) {
  const cut = String(partial || "").split(/\r?\n\s*(?:DO|ASK):/i)[0];
  if (/^\s*(DO|ASK):/i.test(cut)) return "";
  return cut.replace(/[*#`_]/g, "").replace(/\s+/g, " ").replace(/^\s+/, "");
}

// The first whole sentence (12+ characters, ended by . ! or ? with more after it), else "".
export function firstSentence(partial: string) {
  const m = /^(.{12,}?[.!?])\s/.exec(spokenSoFar(partial));
  return m ? m[1].trim() : "";
}

// What is left to say once `head` was said, or null when the answer doesn't start with it.
export function restAfter(full: string, head: string): string | null {
  const a = String(full || "").replace(/\s+/g, " ").trim();
  const h = String(head || "").replace(/\s+/g, " ").trim();
  if (!h || !a.startsWith(h)) return null;
  return a.slice(h.length).trim();
}

export type AskAnswer = { ai?: boolean; text?: string; reason?: string; model?: string; reconnectRequired?: boolean; [k: string]: unknown };

// Reads the server's answer: word-by-word (application/x-ndjson, onText gets the text so far after each piece) or a
// plain JSON answer.
export async function readAnswerStream(r: Response, onText: (soFar: string) => void): Promise<AskAnswer> {
  const type = r.headers.get("Content-Type") || "";
  if (!/ndjson/i.test(type) || !r.body) return (await r.json().catch(() => ({}))) as AskAnswer;
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", soFar = "";
  let end: AskAnswer | null = null;
  const take = (raw: string) => {
    const l = raw.trim();
    if (!l) return;
    try {
      const j = JSON.parse(l);
      if (j && j.done) { end = j; return; }
      if (j && typeof j.t === "string") { soFar += j.t; onText(soFar); }
    } catch { /* a broken piece */ }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { take(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
    take(buf);
  } catch { /* cut off */ }
  if (end) { const { done: _d, ...rest } = end as AskAnswer & { done?: boolean }; return rest; }
  return soFar.trim() ? { ai: true, text: soFar.trim() } : { ai: false, reason: "The answer was cut off." };
}
