// Auto-fix a rejected affidavit / invoice from HPD's reason (owner, 16 Oct 2026): read what HPD says is wrong
// and set the paperwork fields from HPD's own record of the job (address, borough, apartment, award amount)
// and from the paperwork originally sent (dates). Everything changed is listed so the owner can check it on the
// preview; what only the owner can do (sign in ink, a phone number nobody recorded) is listed as "check".

export type FixContext = {
  omo: string;
  address: string;      // HPD's address for the job
  borough: string;      // HPD's borough (MN / BX / BK / QN / SI or the full name)
  location: string;     // apartment / area on HPD's record ("APT 5D", "PUBLIC HALL 1ST FL")
  amount: number;       // HPD's award amount
  workStart: string;    // dates on the paperwork originally sent (M/D/YYYY), when known
  workComplete: string;
  tenantPhone: string;
  current: Record<string, string>; // the paperwork's current values (same keys as the changes)
};
export type FixChange = { field: "address" | "borough" | "location" | "amount" | "workStart" | "workComplete" | "invoiceDate" | "tenantPhone"; label: string; from: string; to: string };
export type FixResult = { changes: FixChange[]; notes: string[]; checks: string[] };

const BOROUGHS: [RegExp, string][] = [[/manhattan|\bmn\b/i, "Manhattan"], [/bronx|\bbx\b/i, "Bronx"], [/brooklyn|\bbk\b/i, "Brooklyn"], [/queens|\bqn\b/i, "Queens"], [/staten island|\bsi\b/i, "Staten Island"]];
const boroughName = (b: string) => BOROUGHS.find(([re]) => re.test(b))?.[1] || b;
const slashDate = (s: string) => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s); return m ? `${Number(m[1])}/${Number(m[2])}/${m[3].length === 2 ? `20${m[3]}` : m[3]}` : ""; };
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function autoFix(reason: string, ctx: FixContext): FixResult {
  const r = String(reason || "").replace(/\s+/g, " ");
  const low = r.toLowerCase();
  const changes: FixChange[] = [];
  const notes: string[] = [];
  const checks: string[] = [];
  const set = (field: FixChange["field"], label: string, to: string) => {
    const from = String(ctx.current[field] || "");
    if (!to) return;
    if (from.trim().toUpperCase() === to.trim().toUpperCase()) { notes.push(`${label}: prints ${to} (HPD's record)`); return; }
    if (!changes.some((c) => c.field === field)) changes.push({ field, label, from, to });
  };

  // Borough: "incorrect borough ... should be Manhattan instead of the bronx" -> the one HPD names, else HPD's record.
  if (/borough|county/.test(low)) {
    const named = /should be (manhattan|bronx|the bronx|brooklyn|queens|staten island)/i.exec(r);
    set("borough", "Borough", named ? boroughName(named[1]) : boroughName(ctx.borough));
    if (/county/.test(low)) notes.push("County: printed from the borough (Manhattan = New York County, Brooklyn = Kings, Staten Island = Richmond).");
  }
  // Work location / apartment: "correct work location / APT: 5D", "location on invoice is different".
  if (/location|apt\b|apartment|area description|same area/.test(low)) {
    const apt = /apt\.?\s*[:#]?\s*([a-z0-9-]{1,5})\b/i.exec(r);
    set("location", "Work location", apt ? `APT ${apt[1].toUpperCase()}` : ctx.location);
    notes.push("The invoice and the affidavit print the same work location, so they match each other and the award.");
  }
  // Address spelled wrong / different.
  if (/address/.test(low)) set("address", "Address", ctx.address);
  // Dates: "end work date on the invoice ... to match the end work date on the affidavit which is 03/01/2023",
  // "dates do not match ... use the first day you attempted ... and the very last day".
  if (/date/.test(low)) {
    const target = /(?:end|complet\w*) (?:work )?date[^.]*?(?:which is|is|should be)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(r);
    const start = /start\w* (?:work )?date[^.]*?(?:which is|is|should be)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(r);
    set("workComplete", "Work completed", target ? slashDate(target[1]) : ctx.workComplete);
    set("workStart", "Work started", start ? slashDate(start[1]) : ctx.workStart);
    if (!ctx.workStart && !ctx.workComplete && !target) checks.push("Work dates: HPD says they're wrong and the app has no record of the dates you sent. Enter the first and last day you went (calls count).");
    if (/invoice date/.test(low)) set("invoiceDate", "Invoice date", ctx.workComplete || ctx.current.invoiceDate);
    notes.push("Invoice and affidavit print the same work dates.");
  }
  // Amount: "new invoice and affidavit for $1,500", "total amount charges is missing".
  if (/\$\s?[\d,]+|amount|charges/.test(low)) {
    const named = /\$\s?([\d,]+(?:\.\d{2})?)/.exec(r);
    const value = named ? Number(named[1].replace(/,/g, "")) : ctx.amount;
    if (value > 0) set("amount", "Amount", money(value));
  }
  // Tenant phone / section 5.
  if (/phone|section\s*#?\s*5/.test(low)) {
    if (ctx.tenantPhone) set("tenantPhone", "Tenant phone (section 5)", ctx.tenantPhone);
    else checks.push("Section 5: HPD wants the phone number you called. None is recorded for this job: add it before printing.");
  }
  // Wrong OMO number: the app always prints this job's own OMO.
  if (/omo/.test(low) && new RegExp(`\\b(?!${ctx.omo})E[A-Z]\\d{5}\\b`).test(r.toUpperCase())) notes.push(`OMO: every page prints ${ctx.omo}.`);
  // Only the owner can do these.
  if (/sign/.test(low)) checks.push("Signature: sign the affidavit and the invoice by hand in blue ink (no signature pictures).");
  if (/notar/.test(low)) checks.push("Notary: have the notary sign and stamp it (the notary date is today).");
  if (/dust wipe|lead/.test(low)) checks.push("Dust wipe / lead: this needs the lab paperwork, not just a new affidavit.");
  if (!changes.length && !checks.length && !notes.length) checks.push("The app couldn't tell what to change from HPD's reason: read it on the preview and change it by hand.");
  return { changes, notes: [...new Set(notes)], checks };
}
