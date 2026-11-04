// 🔍 Search everything (owner's pick, 4 Nov): "find the job where the tenant said the dog bites" looks through your
// notes, the job cards' notes, the visit history, HPD's work descriptions and HPD's emails, best match first.
export type SearchDoc = { job: string; kind: string; text: string; at?: string };
export type SearchHit = { job: string; kind: string; snippet: string; at?: string; score: number };

const STOP = new Set("the a an and or of to in on at for with is was were be been it its this that there where which who what when how did do does i me my we our you your he she they them his her their had has have job jobs find search look show tell said say says about from by any one".split(" "));
const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "").replace(/(ing|ed)$/, "");
const words = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

export function searchQuery(text: string) {
  return String(text || "").replace(/^(please |can you |could you )?(find|search( for)?|look for|look up|which job (had|has|was|is|where)|what job (had|has|was|where)|where was the job( with| where)?)\s+/i, "").replace(/[?.!]+$/, "").trim();
}

export function searchAll(query: string, docs: SearchDoc[], k = 3): SearchHit[] {
  const q = [...new Set(words(query).map(stem))];
  if (!q.length) return [];
  const phrase = query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const best = new Map<string, SearchHit>();
  for (const d of docs) {
    const sentences = String(d.text || "").split(/(?<=[.!?\n])\s+/).filter(Boolean);
    for (const s of sentences) {
      const have = new Set(words(s).map(stem));
      const hit = q.filter((w) => have.has(w)).length;
      if (!hit) continue;
      const score = hit / q.length + (phrase.length > 6 && s.toLowerCase().includes(phrase) ? 1 : 0) + (d.kind === "note" || d.kind === "job note" ? 0.05 : 0);
      if (score < 0.5 && q.length > 1) continue;
      const prev = best.get(d.job);
      if (!prev || score > prev.score) best.set(d.job, { job: d.job, kind: d.kind, snippet: s.trim().slice(0, 160), at: d.at, score: Math.round(score * 100) / 100 });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, k);
}
