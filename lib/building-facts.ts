// Facts about the building on an invitation to bid, from free NYC Open Data, looked up from the phone:
// NYC GeoSearch (address -> BBL / BIN), PLUTO (year built, floors, apartments, walk-up or elevator) and
// HPD's housing violations (open ones by class, and the ones that match the work in the bid).

export type RelatedViolation = { cls: string; apt: string; day: string; text: string };
export type BuildingFacts = {
  bbl: string; bin: string; yearBuilt: number; floors: number; units: number; buildingClass: string; kind: string;
  open: { A: number; B: number; C: number; total: number }; related: RelatedViolation[]; hpdBuildingId: string;
};

const BORO_NAME: Record<string, string> = { MN: "Manhattan", BK: "Brooklyn", QN: "Queens", BX: "Bronx", SI: "Staten Island" };
const SOCRATA = "https://data.cityofnewyork.us/resource";
const s = (v: unknown) => String(v ?? "").trim();
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// PLUTO building class -> what it means for the work (carrying doors and materials up stairs or not).
export function buildingKind(cls: string) {
  const c = s(cls).toUpperCase();
  if (/^C/.test(c)) return "walk-up";
  if (/^D/.test(c)) return "elevator building";
  if (/^A/.test(c)) return "one-family house";
  if (/^B/.test(c)) return "two-family house";
  if (/^S/.test(c)) return "house with a store";
  if (/^R/.test(c)) return "condo / co-op";
  return c ? `class ${c}` : "";
}

export function parsePluto(row: Record<string, unknown> | undefined) {
  const cls = s(row?.bldgclass);
  return { yearBuilt: n(row?.yearbuilt), floors: Math.round(n(row?.numfloors)), units: n(row?.unitsres), buildingClass: cls, kind: buildingKind(cls) };
}

export function openCounts(rows: Record<string, unknown>[]) {
  const out = { A: 0, B: 0, C: 0, total: 0 };
  for (const r of rows) {
    const c = s(r.class).toUpperCase() as "A" | "B" | "C";
    if (c === "A" || c === "B" || c === "C") { out[c] += n(r.count); out.total += n(r.count); }
  }
  return out;
}

// Words in the bid that also show up in HPD violation text, most specific first. Walls, floors and
// lights are named in almost every description ("east wall window", "1st floor"), so they only count
// when nothing more specific is there.
const WORK_WORDS = ["SELF-CLOS", "CLOSER", "LOCK", "LATCH", "HINGE", "DOOR", "GLASS", "WINDOW GUARD", "WINDOW", "SASH", "BUZZER", "INTERCOM",
  "SMOKE DETECT", "CARBON MONOXIDE", "LEAK", "FAUCET", "TOILET", "BATHTUB", "SINK", "PIPE", "RADIATOR", "HOT WATER", "HEAT", "ELECTRIC",
  "OUTLET", "MOLD", "CEILING", "PLASTER", "HANDRAIL", "STAIR", "ROOF", "CABINET", "TILE", "GAS"];
const GENERIC_WORDS = ["WALL", "FLOOR", "PAINT", "LIGHT"];

export function workWords(description: string) {
  const d = s(description).toUpperCase();
  const specific = WORK_WORDS.filter((w) => d.includes(w)).slice(0, 3);
  return specific.length ? specific : GENERIC_WORDS.filter((w) => d.includes(w));
}

// The bid's apartment, if it names one ("APT 3B", "APARTMENT #12C").
export function bidApartment(description: string) {
  const m = /\bAPT\.?\s*#?\s*([0-9]{1,3}[A-Z]?|[A-Z][0-9]{0,2})\b|\bAPARTMENT\s*#?\s*([0-9]{1,3}[A-Z]?)\b/i.exec(s(description));
  return m ? (m[1] || m[2]).toUpperCase() : "";
}

// Lead-paint certifications and similar paperwork orders mention windows and doors but aren't repairs.
const PAPERWORK_ONLY = /CERTIFY COMPLIANCE|LEAD-BASED PAINT|FILE (A |AN )?(CERTIFICATION|REGISTRATION)|REGISTER/i;

// "§ 27-2005, 27-2007 HMC, §238 MDL AND 28 RCNY §25-171: REPLACE ..." -> "REPLACE ..." (the code citations go).
export function plainViolation(text: string) {
  let t = s(text).replace(/\s+/g, " ");
  for (let i = 0; i < 3 && /^§/.test(t); i++) {
    const colon = t.indexOf(":");
    t = (colon > 0 && colon < 160 ? t.slice(colon + 1) : t.replace(/^§[\s\d,.\-§]+(HMC|ADM CODE)?(\s*AND DEPT\. RULES AND REGULATIONS\.?)?\s*-?/i, "")).trim();
  }
  t = t.trim();
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}

// How much a violation reads like the bid: shared words (window position, side, floor, part), ignoring
// the boilerplate both are written in.
const BOILER = new Set("THE AND AT OF IN TO FROM ON OR WITH FOR ALL ANY THAT THIS ARE IS BE BY AS AN A NYC HPD EMERGENCY OPERATIONS DIVISION ESSENTIAL SERVICE WORK PROPERLY REPAIR REPLACE BROKEN DEFECTIVE PROVIDE LOCATED APARTMENT APT STORY PUBLIC PART PARTS RETURN SAFE PROPER WORKING ORDER CONDITION CONDITIONS SUPPLY INSTALL REMOVE NEW SIMILAR MATERIAL HMC ADM CODE SECTION".split(" "));
const tokens = (t: string) => new Set(s(t).toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !BOILER.has(w)));
export function likeness(violation: string, description: string) {
  const d = tokens(description);
  let n = 0;
  for (const w of tokens(violation)) if (d.has(w)) n++;
  return n;
}

const day = (iso: string) => (/^(\d{4})-(\d{2})-(\d{2})/.exec(iso) ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(2, 4)}` : "");

// Open violations that match the work: same apartment first, then class C (immediately hazardous), newest first.
export function relatedViolations(rows: Record<string, unknown>[], description: string, max = 3): RelatedViolation[] {
  const words = workWords(description);
  if (!words.length) return [];
  const apt = bidApartment(description);
  const rank = (c: string) => (c === "C" ? 0 : c === "B" ? 1 : 2);
  return rows
    .filter((r) => !PAPERWORK_ONLY.test(s(r.novdescription)) && words.some((w) => s(r.novdescription).toUpperCase().includes(w)))
    .map((r) => ({ cls: s(r.class).toUpperCase(), apt: s(r.apartment).toUpperCase(), iso: s(r.inspectiondate), text: plainViolation(s(r.novdescription)), like: likeness(s(r.novdescription), description) }))
    .sort((a, b) => Number(!!apt && b.apt === apt) - Number(!!apt && a.apt === apt) || b.like - a.like || rank(a.cls) - rank(b.cls) || b.iso.localeCompare(a.iso))
    .slice(0, max)
    .map(({ cls, apt: a, iso, text }) => ({ cls, apt: a, day: day(iso), text }));
}

// Buildings with no real BIN get a "million" placeholder (1000000, 3000000...): use the lot (BBL) then.
const realBin = (bin: string) => /^[1-5]\d{6}$/.test(bin) && !/^[1-5]000000$/.test(bin);

export async function loadBuildingFacts(address: string, borough: string, description: string, fetchFn: typeof fetch = fetch): Promise<BuildingFacts | null> {
  const get = async (url: string) => { const r = await fetchFn(url); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };
  const geo = await get(`https://geosearch.planninglabs.nyc/v2/search?size=1&text=${encodeURIComponent(`${address}, ${BORO_NAME[borough] || borough}, NY`)}`);
  const pad = geo?.features?.[0]?.properties?.addendum?.pad || {};
  const bbl = s(pad.bbl), bin = s(pad.bin);
  if (!/^\d{10}$/.test(bbl)) return null;
  const where = realBin(bin) ? `bin='${bin}'` : `bbl='${bbl}'`;
  const q = (dataset: string, params: Record<string, string>) => `${SOCRATA}/${dataset}.json?${Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
  const [pluto, counts, open] = await Promise.all([
    get(q("64uk-42ks", { bbl, $select: "yearbuilt,numfloors,unitsres,bldgclass", $limit: "1" })),
    get(q("wvxf-dwi5", { $select: "class,count(*) as count", $where: `${where} AND violationstatus='Open'`, $group: "class" })),
    get(q("wvxf-dwi5", { $select: "class,novdescription,apartment,inspectiondate,buildingid", $where: `${where} AND violationstatus='Open'`, $order: "inspectiondate DESC", $limit: "500" })),
  ]);
  const rows = Array.isArray(open) ? open : [];
  return { bbl, bin, ...parsePluto(Array.isArray(pluto) ? pluto[0] : undefined), open: openCounts(Array.isArray(counts) ? counts : []), related: relatedViolations(rows, description), hpdBuildingId: s(rows[0]?.buildingid) };
}
