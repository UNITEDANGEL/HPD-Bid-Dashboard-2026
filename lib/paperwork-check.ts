// Checks a finished affidavit + invoice against the reasons HPD rejected paperwork for payment
// (229 rejection notices, 2024-2026): dates that differ between the invoice and the affidavit (55),
// notary (39), total charge missing or different (30), area / location description that differs (25),
// address / apartment / borough (20), missing vendor signature (19). Works on the values actually
// printed on each document, so it checks what HPD will read.

export type PaperworkOutcomeKind = "work_completed" | "partial_work_completed" | "no_access" | "refused_access" | "completed_by_others" | string;

export type PaperworkCheckInput = {
  outcome: PaperworkOutcomeKind;
  affidavit: Record<string, string>; // affidavit field -> printed text
  invoice: Record<string, string>; // invoice field -> printed text
  // The vendor's signature is on the documents; null = a print copy signed by hand (not checked).
  signature: boolean | null;
  // The notary's date ("" = not notarized); null = a print copy notarized in person (not checked).
  notaryDate: string | null;
  location: string; // apartment / area from the form ("APT 4B", "PUBLIC HALL")
};

export type PaperworkIssue = { field: string; message: string };

const BOROUGHS = ["MANHATTAN", "BROOKLYN", "BRONX", "QUEENS", "STATEN ISLAND"];
const BORO_CODES: Record<string, string> = { MN: "MANHATTAN", BK: "BROOKLYN", BX: "BRONX", QN: "QUEENS", SI: "STATEN ISLAND" };

// "10/14/2026", "10/14/26", "2026-10-14", "Oct 14, 2026" -> "2026-10-14"; "" when not a date.
export function isoDay(value: string) {
  const v = String(value || "").trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(v);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = Date.parse(v);
  return Number.isFinite(t) && /\d{4}/.test(v) ? new Date(t).toISOString().slice(0, 10) : "";
}

const money = (value: string) => Number(String(value || "").replace(/[^0-9.]/g, "")) || 0;
const norm = (value: string) => String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

export function checkPaperwork(input: PaperworkCheckInput): PaperworkIssue[] {
  const { outcome, affidavit: a, invoice: inv } = input;
  const issues: PaperworkIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  // 1. Work started / completed: on the invoice for every outcome, and the same as the affidavit.
  const start = isoDay(inv["START DATE"]);
  const complete = isoDay(inv["COMPLETE DATE"]);
  if (!start || !complete) add("dates", "The invoice needs a work start and a work completed date (HPD: first day you attempted the job, and the last day).");
  if (start && complete && start > complete) add("dates", `The invoice start date (${inv["START DATE"]}) is after the completed date (${inv["COMPLETE DATE"]}).`);
  const same = (affField: string, invField: string, label: string) => {
    const x = isoDay(a[affField]);
    const y = isoDay(inv[invField]);
    if (x && y && x !== y) add("dates", `${label}: affidavit says ${a[affField]}, invoice says ${inv[invField]}. HPD rejects dates that don't match.`);
    if (x && !y) add("dates", `${label} is on the affidavit (${a[affField]}) but not on the invoice.`);
  };
  if (outcome === "work_completed") { same("Start Date", "START DATE", "Work started"); same("Complete Date", "COMPLETE DATE", "Work completed"); }
  if (outcome === "no_access") { same("Attempt1 Date", "START DATE", "1st attempt / work started"); same("Attempt2 Date", "COMPLETE DATE", "2nd attempt / work completed"); }
  if (outcome === "refused_access") same("Denied Date", "COMPLETE DATE", "Refusal date / work completed");
  if (outcome === "completed_by_others") same("WorkSite Date5", "COMPLETE DATE", "Verified date / work completed");

  // 2. Notary: the affidavit is notarized, on or after the last date of work.
  const notary = input.notaryDate === null ? null : isoDay(input.notaryDate);
  if (notary === "") add("notary", "The affidavit isn't notarized yet (notary approval with the date).");
  else if (notary && complete && notary < complete) add("notary", `The notary date (${input.notaryDate}) is before the work completed date (${inv["COMPLETE DATE"]}).`);

  // 3. Total charge: on the invoice, and the same amount on the affidavit where it asks for one.
  const total = money(inv["TOTAL CHARGE"]);
  if (!total) add("amount", "The invoice is missing the total charge amount.");
  const affAmount = outcome === "partial_work_completed" ? a["Partial Amount"] : outcome === "work_completed" ? "" : a["Service Charge Amount"];
  if (affAmount !== undefined && affAmount !== "" && money(affAmount) !== total) add("amount", `The affidavit amount (${affAmount}) differs from the invoice total (${inv["TOTAL CHARGE"]}).`);

  // 4. Area / apartment: on the invoice, and the same description on the affidavit.
  const place = norm(inv["Apt #"] || input.location);
  if (!place) add("location", "The invoice needs the apartment number or the area (e.g. APT 4B, PUBLIC HALL, BULKHEAD).");
  else if (!norm(a["Building Address"]).includes(place)) add("location", `The area on the invoice (${inv["Apt #"]}) isn't on the affidavit's address line. Use the same description on both.`);

  // 5. Address and borough: the same building on both, and a real borough.
  const invAddress = norm(inv["Building Address"]);
  if (!invAddress) add("address", "The invoice is missing the building address.");
  else if (!norm(a["Building Address"]).includes(invAddress)) add("address", `The building address differs: invoice "${inv["Building Address"]}", affidavit "${a["Building Address"]}".`);
  const boroRaw = norm(inv["Borough"] || inv["Boro"]);
  const boro = BORO_CODES[boroRaw] || boroRaw;
  if (!BOROUGHS.includes(boro)) add("borough", `The invoice borough "${inv["Borough"] || inv["Boro"] || ""}" isn't a borough (Manhattan, Brooklyn, Bronx, Queens, Staten Island).`);
  else if (!norm(a["Building Address"]).includes(boro)) add("borough", `The affidavit address doesn't name the same borough (${boro}).`);

  // 6. The vendor's signature.
  if (input.signature === false) add("signature", "The vendor signature is missing. Save your signature and keep \"sign the documents\" on.");

  // 7. Same OMO on both.
  if (norm(a["OMO"]) && norm(inv["OMO"]) && norm(a["OMO"]) !== norm(inv["OMO"])) add("omo", `The OMO differs: affidavit ${a["OMO"]}, invoice ${inv["OMO"]}.`);
  return issues;
}
