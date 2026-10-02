// Text the fetcher sometimes captures from the wrong part of an ITB instead of
// the real scope of work. Any field containing one of these is discarded so a
// clean field on the same job can be used instead.
// Keep in sync with JUNK_DESCRIPTION_PATTERNS in scripts/verify-paperwork-data.js.
const JUNK_DESCRIPTION_PATTERNS = [
  // ITB page 3 table headers with no scope filled in.
  /APT\(S\)\/LOCATION\(S\)/i,
  /PROCEDURES\s+MATERIAL/i,
  // Federal wage determination page captured in place of the scope.
  /General\s+Decision\s+Number/i,
  // HPD Confirmation of Award letter captured in place of the scope.
  /Confirma\s*t?\s*ion\s+of\s+Award/i,
];

export function isJunkDescription(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return JUNK_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(text));
}

function cleanCandidates(job: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!job) return [];
  return keys
    .map((key) => job[key])
    // Recovered ITB text often starts with the ": " left over from its "JOB DESCRIPTION:" label.
    .map((value) => (value === undefined || value === null ? "" : String(value).trim().replace(/^:\s*/, "")))
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
