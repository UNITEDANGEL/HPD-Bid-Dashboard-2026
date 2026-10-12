// Price help for a new bid: the past awards whose job descriptions are most like this one (word
// overlap, weighted so rare trade words count more than HPD boilerplate), with the middle and range of
// what they were awarded. A guide from your own history, not a quote.

export type PricedJob = { id: string; description: string; amount: number; address?: string };
export type PriceHelp = { count: number; low: number; middle: number; high: number; examples: { id: string; amount: number; score: number; description: string }[] };

const BOILERPLATE = new Set(("nyc hpd emergency operations division essential service work the and to of at in on for with all as per by be must from or a an any are is this that it its be other existing new proper properly working order condition total job done remove related debris contractor contact start date affidavit copy faxed site office landlord refuses access completes fax specifications approximately approx sqft sq ft public area story sty floor apartment apt building bldg location room make necessary repairs repair replace provide install restore return aep alternative enforcement program emergency vendor field dimension dimensions quantities verified prior bid tenant").split(" "));

function words(text: string) {
  return String(text || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !BOILERPLATE.has(w));
}

function quantile(sorted: number[], q: number) {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at), hi = Math.ceil(at);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo));
}

export function priceHelp(description: string, history: PricedJob[], limit = 8): PriceHelp | null {
  const docs = history.filter((job) => job.amount > 0 && job.description).map((job) => ({ job, terms: new Set(words(job.description)) }));
  if (!docs.length) return null;
  const df = new Map<string, number>();
  for (const doc of docs) doc.terms.forEach((t) => df.set(t, (df.get(t) || 0) + 1));
  const idf = (t: string) => Math.log((docs.length + 1) / ((df.get(t) || 0) + 1)) + 1;
  const query = new Set(words(description));
  if (!query.size) return null;
  const norm = (terms: Set<string>) => Math.sqrt([...terms].reduce((sum, t) => sum + idf(t) ** 2, 0)) || 1;
  const qNorm = norm(query);
  const scored = docs
    .map(({ job, terms }) => {
      let dot = 0;
      query.forEach((t) => { if (terms.has(t)) dot += idf(t) ** 2; });
      return { job, score: dot / (qNorm * norm(terms)) };
    })
    .filter((row) => row.score >= 0.2)
    .sort((a, b) => b.score - a.score || a.job.id.localeCompare(b.job.id))
    .slice(0, limit);
  if (scored.length < 2) return null;
  const amounts = scored.map((row) => row.job.amount).sort((a, b) => a - b);
  return {
    count: scored.length,
    low: quantile(amounts, 0.25),
    middle: quantile(amounts, 0.5),
    high: quantile(amounts, 0.75),
    examples: scored.slice(0, 3).map(({ job, score }) => ({ id: job.id, amount: job.amount, score: Math.round(score * 100) / 100, description: job.description.replace(/\s+/g, " ").slice(0, 110) })),
  };
}
