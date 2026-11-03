// "Did you mean…?" (owner, 3 Nov, pick 2 of making the chat smarter): what the helper didn't recognize is compared with
// the sentences it does know (letter pairs, so a misheard or mistyped word still lands close). Very close: done
// straight away; close: offered as choices; not close: it's a real question for the AI, as before.

const norm = (s: string) => ` ${String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()} `;
const pairs = (s: string) => { const out = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const p = s.slice(i, i + 2); out.set(p, (out.get(p) || 0) + 1); } return out; };

// Dice similarity of the letter pairs, 0..1.
export function similarity(a: string, b: string) {
  const A = pairs(norm(a)), B = pairs(norm(b));
  let both = 0, total = 0;
  for (const n of A.values()) total += n;
  for (const n of B.values()) total += n;
  for (const [p, n] of A) both += Math.min(n, B.get(p) || 0);
  return total ? (2 * both) / total : 0;
}

export const SURE = 0.8; // run it
export const MAYBE = 0.55; // offer it

export function closest(heard: string, phrases: string[], k = 3) {
  const seen = new Set<string>();
  return phrases.filter((p) => { const key = norm(p); if (seen.has(key)) return false; seen.add(key); return true; })
    .map((phrase) => ({ phrase, score: similarity(heard, phrase) }))
    .sort((x, y) => y.score - x.score).slice(0, k);
}
