import type { JobRecord } from "./types";

const NO_MATCH = Number.POSITIVE_INFINITY;

function normalizeSearchValue(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeOmoQuery(value: string) {
  return String(value || "")
    .trim()
    .replace(/^omo\s*[:#-]?\s*/i, "")
    .trim();
}

export function jobSearchRank(job: JobRecord, query: string) {
  const cleanedQuery = normalizeOmoQuery(query);
  const compactQuery = normalizeSearchValue(cleanedQuery);
  if (!compactQuery) return 0;

  const compactOmo = normalizeSearchValue(job.id);
  if (compactOmo === compactQuery) return 0;
  if (compactOmo.startsWith(compactQuery)) return 1;
  if (compactOmo.includes(compactQuery)) return 2;

  const rawQuery = cleanedQuery.toLowerCase();
  const haystack = [
    job.id,
    job.address,
    job.trade,
    job.description,
    job.status,
    job.borough,
    job.tenantName,
    job.tenantPhone,
  ]
    .join(" ")
    .toLowerCase();

  if (rawQuery && haystack.includes(rawQuery)) return 3;
  if (normalizeSearchValue(haystack).includes(compactQuery)) return 4;

  return NO_MATCH;
}

export function matchesJobSearch(job: JobRecord, query: string) {
  return Number.isFinite(jobSearchRank(job, query));
}

export function compareJobsBySearch(query: string) {
  if (!normalizeSearchValue(normalizeOmoQuery(query))) {
    return () => 0;
  }

  return (a: JobRecord, b: JobRecord) => {
    const rankDelta = jobSearchRank(a, query) - jobSearchRank(b, query);
    if (rankDelta) return rankDelta;
    return a.id.localeCompare(b.id);
  };
}
