// Text the fetcher sometimes captures from the wrong part of an ITB instead of
// the real scope of work. Any field containing one of these is discarded so a
// clean field on the same job can be used instead.
// Keep in sync with JUNK_DESCRIPTION_PATTERNS in scripts/verify-paperwork-data.js.
const JUNK_DESCRIPTION_PATTERNS = [
  // ITB page 3 table headers with no scope filled in.
  /APT\(S\)\/LOCATION\(S\)/i,
  /PROCEDURES\s+MATERIAL/i,
  // Other labels of the blank work-description form (a scanned ITB's text layer has only these).
  /Provide\/Install[\s\S]{0,80}Abate/i,
  /Replace\/Repair\s+Gas\/Electric/i,
  /GC:\s*ELEV\s*ATOR/i,
  // Federal wage determination page captured in place of the scope.
  /General\s+Decision\s+Number/i,
  // HPD Confirmation of Award letter captured in place of the scope.
  /Confirma\s*t?\s*ion\s+of\s+Award/i,
  // Purchase-order header (budget code, "submit invoice in quadruplicate") with no scope (ER04964).
  /Submit\s+Invoice\*?\s+In\s+Quadruplicate/i,
];

// The real scope sometimes sits after a "Job Description:" label, behind a junk header (the wage
// decision page, ER05421), and ends with HPD's contact boilerplate. Keep only the scope itself.
export function salvageScope(value: unknown) {
  let text = value === undefined || value === null ? "" : String(value).trim();
  const label = text.match(/Job\s+Description\s*:/i);
  if (label && label.index !== undefined && label.index > 0) text = text.slice(label.index + label[0].length);
  const tail = text.search(/CONTRACTOR\s+MUST\s+CONTACT\s+HPD|IF\s+NO\s+WORK\s+IS\s+PERFORMED\s+OR\s+CONTRACTOR/i);
  if (tail > 40) text = text.slice(0, tail);
  return text.trim().replace(/^:\s*/, "");
}

export function isJunkDescription(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return JUNK_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(text));
}

function cleanCandidates(job: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!job) return [];
  return keys
    .map((key) => job[key])
    // Recovered ITB text often starts with the ": " left over from its "JOB DESCRIPTION:" label.
    .map((value) => salvageScope(value))
    .filter((text) => text && !isJunkDescription(text));
}

// Longest non-junk value among the keys.
export function longestCleanDescription(job: Record<string, unknown> | null | undefined, keys: string[]) {
  return cleanCandidates(job, keys).reduce((best, text) => (text.length > best.length ? text : best), "");
}

// First non-junk value among the keys, in priority order.
export function firstCleanDescription(job: Record<string, unknown> | null | undefined, keys: string[]) {
  return cleanCandidates(job, keys)[0] || "";
}
