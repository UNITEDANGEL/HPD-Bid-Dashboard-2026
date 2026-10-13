// Price help for a new bid, from reading the whole job description: what kinds of work it asks for
// (closer, lock, hinges, glass, sheetrock, painting, leak...), how many doors / windows, how many square
// feet, and how many separate tasks. Past awards are matched on that scope first and on wording second,
// and the answer says what it read and how sure it is. A guide from your own history, not a quote.

// A past awarded job: yours (won) or another contractor's. HPD awards the low bid, so the amount is
// the price it took to win that job.
export type PricedJob = { id: string; description: string; amount: number; address?: string; date?: string; won?: boolean };
export type JobScope = { items: string[]; labels: string[]; doors: number; windows: number; sqft: number; paintSqft: number; repairSqft: number; tasks: number; summary: string };
export type PriceHelp = {
  count: number; low: number; middle: number; high: number;
  scope: JobScope;
  confidence: "good" | "fair" | "low";
  why: string;
  unmatched: string[];
  examples: { id: string; amount: number; score: number; description: string; summary: string; date?: string; won?: boolean }[];
  // Winning prices of the comparable jobs (size-adjusted), recent ones weigh more: for the chance of
  // winning at a given price (winChance) and the suggested prices.
  prices: { amount: number; weight: number }[];
  // Every comparable job behind the numbers, closest first: to look back at what each was won for.
  similar: { id: string; amount: number; date?: string; won?: boolean; address?: string; summary: string }[];
  toWin: number;      // about 3 in 4 of these jobs were won at or above this
  yours: number;      // how many of the comparable jobs you won
  trend: { recent: number; before: number; change: number } | null;
};

// Chance a bid wins, from the comparable jobs: you win when you come in under the winning price.
export function winChance(help: Pick<PriceHelp, "prices">, price: number) {
  const total = help.prices.reduce((sum, p) => sum + p.weight, 0);
  if (!total || !(price > 0)) return 0;
  const beat = help.prices.reduce((sum, p) => sum + (p.amount > price ? p.weight : p.amount === price ? p.weight / 2 : 0), 0);
  return beat / total;
}

function weightedQuantile(rows: { amount: number; weight: number }[], q: number) {
  const sorted = [...rows].sort((a, b) => a.amount - b.amount);
  const total = sorted.reduce((sum, r) => sum + r.weight, 0);
  let run = 0;
  for (const r of sorted) { run += r.weight; if (run >= total * q) return Math.round(r.amount); }
  return Math.round(sorted.at(-1)?.amount || 0);
}

// Recent awards count more: a job from 6 months ago counts half as much as one from today.
const HALF_LIFE_DAYS = 180;
const ageDays = (date: string | undefined, now: Date) => (date ? Math.max(0, (now.getTime() - Date.parse(date)) / 86400000) : 365);

// Kinds of work, as HPD writes them. Order is the order shown.
const ITEMS: [key: string, label: string, pattern: RegExp][] = [
  // The unit the job comes from changes the price: lead abatement (DELEAD) jobs win at ~$2,540 and AEP
  // jobs at ~$1,800, against ~$790 for regular ERP work, so they are only compared with their own kind.
  ["lead", "lead abatement (DELEAD)", /\bdelead|lead[- ]based|\blbp\b|\bxrf\b|lead abatement|lead hazard|lead dust|lead[- ]safe|\blead paint|epa rrp|\blead\b(?! time| to)/],
  ["aep", "AEP program", /\baep\b|alternative enforcement/],
  ["door-new", "new door", /\b(new|replace\w*)\b[^.]{0,40}\b(door and (door )?(jamb|frame)|fire[- ]?rated (\w+ )?door|metal door|steel door|door assembly)|install (a )?new ((fire[- ]?rated|metal|steel|wood|entrance|apartment|bulkhead|hollow metal|kalamein) )?door\b(?! closer| knob| lock| hinge| sweep| stop| saddle| handle| viewer| chain)|replace (the )?(broken|defective|damaged)?[/ a-z]{0,25}door with (a )?new/],
  ["closer", "door closer", /closer/],
  // Building-entrance hardware (Adams Rite, Securtec, mortise, electric strike, mag lock) costs more than
  // a passage lock, so it is its own kind of work.
  ["entrance-lock", "entrance lock (Adams Rite / mortise / electric strike)", /adams ?rite|secure?[ -]?tec|mortise|electric strik|electric stik|mag(netic)? ?lock|maglock/],
  // A buzzer / intercom repair is more work than the lock alone (lock + buzzer jobs win at ~$1,400).
  ["intercom", "buzzer / intercom", /buzzer|intercom|door ?bell|entry phone/],
  ["lock", "lock / latch", /\block|latch ?set|door latch\b|lockset|cylinder|\bknob|lever handle|deadbolt|strik\w* plate/],
  ["hinges", "hinges", /hinge/],
  ["pushbar", "push bar / panic bar", /push ?bar|panic|re-?entry|exit device/],
  ["door-adjust", "door adjust (self-close & latch)", /self[- ]?clos|latching|adjust\w* [^.]{0,20}door|realign/],
  ["glass", "window glass", /(?<!semi[- ]?)glass|glazing|pane\b|plexi/],
  ["window-hardware", "window balance / sash / guard", /balance|sash cord|sash chain|window guard|window lock|window hardware/],
  ["window-new", "new window", /\b(new|replace\w*) (?:(?!glass|guard|balance|sash|lock|pane)\w+ ){0,3}window\b(?! glass| guard| lock| balance| sash| pane)/],
  ["leak", "trace & repair leak", /leak|trace/],
  ["sheetrock", "sheetrock / plaster", /sheetrock|gwb|gypsum|plaster|drywall|skim/],
  ["paint", "painting", /paint|primer|prime\b|coats?\b/],
  ["ceiling", "ceiling", /ceiling/],
  ["wall", "walls", /\bwalls?\b/],
  ["floor", "floor / tile", /floor|tile|vct|linoleum|saddle|tread|riser/],
  ["plumbing", "plumbing", /faucet|toilet|sink|basin|bathtub|\btub\b|shower|drain|valve|\bpipe|plumb|water closet|flush/],
  ["electric", "electrical", /electric(?!al)? (?!st\w* plate)|electrical|outlet|receptacle|\bswitch|light fixture|wiring|\blight\b|lighting|bulb|gfci|circuit/],
  ["detector", "smoke / CO detector", /smoke|carbon monoxide|\bco detector|detector/],
  ["mold", "mold", /\bmou?ld\b|mildew/],
  ["fire-escape", "fire escape", /fire escape(?! (upper |lower )?(window|sash))|drop ladder|gooseneck/],
  ["masonry", "masonry / concrete", /concrete|masonry|\bbrick|mortar|stucco|parapet|\bcoping|\bcement/],
  ["metal", "railing / metal work", /railing|handrail|guard ?rail|welding|\bweld\b/],
  ["roof", "roof", /(?<!(to|the) )\broof(?! door| bulkhead| access)|skylight|gutter|leader|flashing/],
  ["heat", "heat / radiator", /radiator|heat\b|heating|boiler|steam|riser pipe/],
  ["cabinet", "cabinets / counter", /cabinet|counter ?top|vanity/],
  ["obstruction", "remove obstruction", /obstruct|cleanout|clean out|debris removal|rubbish|garbage/],
  ["seal", "seal / board up", /board up|board-up|seal (up|off|the)|vacant|cinder block|cmu/],
];

const BOILERPLATE = new Set(("nyc hpd emergency operations division essential service work the and to of at in on for with all as per by be must from or a an any are is this that it its be other existing new proper properly working order condition total job done remove related debris contractor contact start date affidavit copy faxed site office landlord refuses access completes fax specifications approximately approx sqft sq ft public area story sty floor apartment apt building bldg location room make necessary repairs repair replace provide install restore return aep alternative enforcement program emergency vendor field dimension dimensions quantities verified prior bid tenant").split(" "));

// Only the work itself: HPD's contact list, sign-and-return and AEP bidding notes say nothing about the job.
function workText(description: string) {
  return String(description || "")
    .replace(/\s+/g, " ")
    .replace(/contractor must (contact|sign)[\s\S]*$/i, " ")
    .replace(/vendor is responsible for bidding[\s\S]*$/i, " ")
    .toLowerCase();
}

function words(text: string) {
  return text.replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !BOILERPLATE.has(w));
}

function countAfter(text: string, noun: string) {
  const forms = [
    new RegExp(`total[^.;=()\\d]{0,22}${noun}s?[^\\d]{0,8}(\\d{1,2})\\b`, "g"),
    new RegExp(`\\(?\\s*(\\d{1,2})\\s*\\)?\\s*${noun}s? in total`, "g"),
    new RegExp(`number of ${noun}s?[^\\d]{0,6}(\\d{1,2})\\b`, "g"),
  ];
  let best = 0;
  for (const re of forms) for (const m of text.matchAll(re)) best = Math.max(best, Number(m[1]));
  return best;
}

// Square feet, read the way a contractor prices it: area to paint/finish and repair area
// (sheetrock, plaster, tile, glass), each added up across rooms. "Remove 36 sq ft ... install 36 sq ft"
// is the same 36, counted once.
function squareFeet(text: string) {
  let paint = 0, repair = 0, lastRepair = -1, from = 0;
  for (const m of text.matchAll(/(\d{1,4}(?:\.\d+)?)\s*(?:sq\.?\s*f(?:ee)?t\.?|sqft|s\.?f\.?(?=[\s,.;)]|$)|square feet)/g)) {
    const before = text.slice(Math.max(from, m.index! - 140), m.index);
    from = m.index! + m[0].length;
    const n = Number(m[1]);
    if (/paint|coats?|primer|prime/.test(before)) paint += n;
    else if (n !== lastRepair) { repair += n; lastRepair = n; }
  }
  return { paint: Math.round(paint), repair: Math.round(repair) };
}

function numberedTasks(text: string) {
  const marks = new Set<string>();
  for (const m of text.matchAll(/(?:^|[\s*])(\d)\s*[).]\s+[a-z]/g)) marks.add(m[1]);
  return marks.size;
}

export function readScope(description: string): JobScope {
  const text = workText(description);
  const found = ITEMS.filter(([, , re]) => re.test(text));
  let items = found.map(([key]) => key);
  // "Adjust the door to self-close" is part of any closer/hinge/lock/push-bar job, not its own item.
  if (items.some((k) => ["closer", "hinges", "lock", "entrance-lock", "pushbar", "door-new"].includes(k))) items = items.filter((k) => k !== "door-adjust");
  if (items.includes("entrance-lock")) items = items.filter((k) => k !== "lock");
  // A ceiling/wall is a place, not a trade, when sheetrock or painting is already there.
  if (items.includes("sheetrock") || items.includes("paint")) items = items.filter((k) => k !== "ceiling" && k !== "wall");
  const labels = items.map((k) => ITEMS.find(([key]) => key === k)![1]);
  const doors = countAfter(text, "door");
  const windows = countAfter(text, "window");
  const area = squareFeet(text);
  const sqft = Math.max(area.paint, area.repair);
  const tasks = Math.max(numberedTasks(text), 1);
  const size = [doors > 0 ? `${doors} door${doors > 1 ? "s" : ""}` : "", windows > 0 ? `${windows} window${windows > 1 ? "s" : ""}` : "", area.repair > 0 ? `~${area.repair} sq ft repair area` : "", area.paint > 0 ? `~${area.paint} sq ft to paint` : "", tasks > 1 ? `${tasks} tasks` : ""].filter(Boolean);
  return { items, labels, doors, windows, sqft, paintSqft: area.paint, repairSqft: area.repair, tasks, summary: [labels.join(" + ") || "general repair", ...size].join(" · ") };
}

function quantile(sorted: number[], q: number) {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at), hi = Math.ceil(at);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo));
}

// How close two sizes are, 1 = same, falling off with the ratio (2 doors vs 1 is 0.5).
function sizeMatch(a: number, b: number) {
  if (!a && !b) return 1;
  if (!a || !b) return 0.6;
  return Math.min(a, b) / Math.max(a, b);
}

// A past job with a different number of doors/windows counts at a scaled price: more units cost more,
// but not in proportion (one trip, one setup). Tested on your past awards: square-root scaling fits best.
function sizeFactor(job: JobScope, past: JobScope) {
  const units = (s: JobScope) => Math.max(s.doors + s.windows, 1);
  return Math.min(Math.max(Math.sqrt(units(job) / units(past)), 0.5), 2.5);
}

// Each past job is read once (thousands of them), not on every lookup.
const READ = new WeakMap<PricedJob, { terms: Set<string>; scope: JobScope }>();

export function priceHelp(description: string, history: PricedJob[], limit = 12, now = new Date()): PriceHelp | null {
  const docs = history.filter((job) => job.amount > 0 && job.description).map((job) => {
    let read = READ.get(job);
    if (!read) { read = { terms: new Set(words(workText(job.description))), scope: readScope(job.description) }; READ.set(job, read); }
    return { job, ...read };
  });
  if (!docs.length) return null;
  const scope = readScope(description);
  const query = new Set(words(workText(description)));
  if (!query.size && !scope.items.length) return null;

  // Rare words and rare kinds of work count more than common ones.
  const df = new Map<string, number>();
  const itemDf = new Map<string, number>();
  for (const doc of docs) {
    doc.terms.forEach((t) => df.set(t, (df.get(t) || 0) + 1));
    doc.scope.items.forEach((k) => itemDf.set(k, (itemDf.get(k) || 0) + 1));
  }
  const idf = (t: string) => Math.log((docs.length + 1) / ((df.get(t) || 0) + 1)) + 1;
  const itemWeight = (k: string) => Math.log((docs.length + 1) / ((itemDf.get(k) || 0) + 1)) + 1;
  const norm = (terms: Set<string>) => Math.sqrt([...terms].reduce((sum, t) => sum + idf(t) ** 2, 0)) || 1;
  const qNorm = norm(query);
  // The unit (lead abatement, AEP, regular ERP) is a filter, not shared work: an AEP leak job is not like
  // an AEP door job. Work is compared without the unit; a job from another unit counts much less.
  const UNITS = ["lead", "aep"];
  const unitOf = (s: JobScope) => s.items.find((k) => UNITS.includes(k)) || "regular";
  const qUnit = unitOf(scope);
  const qItems = new Set(scope.items.filter((k) => !UNITS.includes(k)));

  const ranked = docs.map(({ job, terms, scope: s }) => {
    let dot = 0;
    query.forEach((t) => { if (terms.has(t)) dot += idf(t) ** 2; });
    const text = dot / (qNorm * norm(terms));
    // Same kinds of work: weighted overlap of the two item lists (both ways, so extra work counts too).
    let shared = 0, union = 0;
    const work = s.items.filter((k) => !UNITS.includes(k));
    new Set([...qItems, ...work]).forEach((k) => {
      const w = itemWeight(k);
      union += w;
      if (qItems.has(k) && work.includes(k)) shared += w;
    });
    const sameUnit = unitOf(s) === qUnit;
    const items = union ? shared / union : 1;
    const size = (sizeMatch(scope.doors, s.doors) + sizeMatch(scope.windows, s.windows) + sizeMatch(scope.sqft, s.sqft) + sizeMatch(scope.tasks, s.tasks)) / 4;
    const raw = 0.45 * items + 0.3 * text + 0.25 * size;
    // Same unit first: a job from another unit only comes after them (and the screen says so).
    return { job, scope: s, raw, score: raw * (sameUnit ? 1 : 0.6), items: sameUnit ? items : items * 0.5, sameUnit };
  })
    .filter((row) => row.raw >= 0.35)
    .sort((a, b) => b.score - a.score || a.job.id.localeCompare(b.job.id));
  // Enough past wins with exactly this mix of work: price from those only, so a closer + lock job
  // isn't pulled down by closer-only jobs. Otherwise the closest jobs overall.
  const same = ranked.filter((row) => row.items >= 0.99).slice(0, limit);
  const scored = same.length >= 3 ? same : ranked.slice(0, limit);
  if (scored.length < 2) return null;

  const prices = scored.map((row) => ({ amount: row.job.amount * sizeFactor(scope, row.scope), weight: 0.5 ** (ageDays(row.job.date, now) / HALF_LIFE_DAYS) }));
  const low = weightedQuantile(prices, 0.25), middle = weightedQuantile(prices, 0.5), high = weightedQuantile(prices, 0.75);
  // Bid just under the lower winning prices to win most of these jobs.
  const toWin = Math.max(low - 5, 1);
  // Price direction for this kind of work: last 90 days against the 9 months before, all matching jobs.
  const sameAll = ranked.filter((row) => row.items >= 0.99 && row.job.date);
  const med = (rows: typeof sameAll) => quantile(rows.map((r) => r.job.amount * sizeFactor(scope, r.scope)).sort((x, y) => x - y), 0.5);
  const recentRows = sameAll.filter((r) => ageDays(r.job.date, now) <= 90), beforeRows = sameAll.filter((r) => ageDays(r.job.date, now) > 90 && ageDays(r.job.date, now) <= 365);
  const trend = recentRows.length >= 4 && beforeRows.length >= 4 ? (() => { const recent = med(recentRows), before = med(beforeRows); return { recent, before, change: Math.round(((recent - before) / before) * 100) }; })() : null;
  const matchedItems = new Set(scored.flatMap((row) => row.scope.items));
  const unmatched = scope.items.filter((k) => !matchedItems.has(k)).map((k) => ITEMS.find(([key]) => key === k)![1]);
  const sameWork = scored.filter((row) => row.items >= 0.99).length;
  const spread = middle ? (high - low) / middle : 1;
  // Bigger than anything it is compared with: the range is likely too low, so say so plainly.
  const biggest = Math.max(...scored.map((row) => row.scope.sqft));
  const bigger = scope.sqft >= 20 && scope.sqft > biggest * 1.5 ? `this job is ~${scope.sqft} sq ft, bigger than these jobs (up to ${biggest} sq ft): expect to price higher` : "";
  const confidence: PriceHelp["confidence"] = unmatched.length || sameWork < 2 || spread > 0.8 || bigger ? "low" : sameWork >= 4 && spread <= 0.4 ? "good" : "fair";
  const why = [
    bigger,
    spread > 0.8 ? "these winning prices vary a lot" : "",
    qUnit !== "regular" && scored.some((row) => !row.sameUnit) ? `only ${scored.filter((row) => row.sameUnit).length} ${qUnit === "lead" ? "lead abatement" : "AEP"} job${scored.filter((row) => row.sameUnit).length === 1 ? "" : "s"} to compare with; regular jobs added (${qUnit === "lead" ? "lead" : "AEP"} usually pays more)` : "",
    sameWork === scored.length ? `from ${sameWork} jobs HPD awarded with the same kind of work` : sameWork ? `${sameWork} of ${scored.length} awarded jobs had the same kind of work` : `no awarded job had exactly this mix of work; ${scored.length} closest shown`,
    unmatched.length ? `no awarded job with ${unmatched.join(", ")}: price that part yourself` : "",
    scored.some((row) => sizeFactor(scope, row.scope) !== 1) ? "prices of jobs with a different number of doors/windows adjusted" : "",
    scope.tasks > 1 || scope.items.length > 2 ? "several items: check each one is covered" : "",
  ].filter(Boolean).join(" · ");

  return {
    count: scored.length, low, middle, high, scope, confidence, why, unmatched, prices, toWin, trend,
    yours: scored.filter((row) => row.job.won).length,
    similar: scored.map(({ job, scope: s }) => ({ id: job.id, amount: job.amount, date: job.date, won: job.won, address: job.address, summary: s.summary })),
    examples: scored.slice(0, 3).map(({ job, score, scope: s }) => ({ id: job.id, amount: job.amount, score: Math.round(score * 100) / 100, description: workText(job.description).slice(0, 110), summary: s.summary, date: job.date, won: job.won })),
  };
}
