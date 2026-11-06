// 👂 It understands better (plan item 18; owner, 5 Nov: "he needs to be more understanding"): it learns your own words.
// When you pick from "Did you mean…?", what you said is remembered and done straight away next time; and you can teach
// it: "when I say close it, I mean send the affidavit". Kept on this phone only.

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const KEY = "hpd-my-words-v1";
const ls = (): Store | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };
export const normWords = (t: string) => String(t || "").toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();

export function readWords(store: Store | null = ls()): Record<string, string> {
  try { const o = JSON.parse(store?.getItem(KEY) || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
export function learnWords(said: string, meaning: string, store: Store | null = ls()) {
  const k = normWords(said);
  const v = String(meaning || "").trim();
  if (!k || !v || k === normWords(v) || k.split(" ").length > 10) return false;
  const all = readWords(store);
  all[k] = v.slice(0, 160);
  const keys = Object.keys(all);
  for (const old of keys.slice(0, Math.max(0, keys.length - 60))) delete all[old];
  try { store?.setItem(KEY, JSON.stringify(all)); } catch { /* private mode */ }
  return true;
}
export function forgetWords(said: string, store: Store | null = ls()) {
  const all = readWords(store);
  const k = normWords(said);
  if (!(k in all)) return false;
  delete all[k];
  try { store?.setItem(KEY, JSON.stringify(all)); } catch { /* private mode */ }
  return true;
}
// What you mean by it, if it was learned (the exact words, ignoring case and punctuation).
export const myMeaning = (said: string, store: Store | null = ls()) => readWords(store)[normWords(said)] || "";

// "when I say close it, I mean send the affidavit" / "close it means send the affidavit" / "forget close it".
export function parseTeach(t: string): { said: string; meaning: string } | { forget: string } | null {
  const s = String(t || "").trim().replace(/[.!]+$/, "");
  let m = /^(?:from now on,?\s+)?(?:when|if) i say ["“]?(.+?)["”]?,?\s+(?:i mean|that means|it means|do|then do)\s+["“]?(.+?)["”]?$/i.exec(s);
  if (m) return { said: m[1].trim(), meaning: m[2].trim() };
  m = /^["“]?(.{2,40}?)["”]? means ["“]?(.+?)["”]?$/i.exec(s);
  if (m && !/^(?:what|which|this|that|it)$/i.test(m[1].trim())) return { said: m[1].trim(), meaning: m[2].trim() };
  m = /^forget (?:what )?(?:i mean by |the words? )?["“]?(.+?)["”]?$/i.exec(s);
  if (m && !/^(?:it|that|everything)$/i.test(m[1].trim())) return { forget: m[1].trim() };
  return null;
}
