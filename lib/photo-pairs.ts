// Before/after photos lined up in pairs (owner idea, 14 Nov): pair 1 = first before + first after, and so on,
// in the order they were taken. A side with fewer photos leaves the other side's extras alone (null).
export type PairItem = { kind: string; mediaType: string; capturedAt?: string };

export function pairPhotos<T extends PairItem>(items: T[]): { before: T | null; after: T | null }[] {
  const byTime = (a: T, b: T) => String(a.capturedAt || "").localeCompare(String(b.capturedAt || ""));
  const photos = items.filter((x) => x.mediaType === "image");
  const before = photos.filter((x) => x.kind === "before").sort(byTime);
  const after = photos.filter((x) => x.kind === "after").sort(byTime);
  const n = Math.max(before.length, after.length);
  return Array.from({ length: n }, (_, i) => ({ before: before[i] || null, after: after[i] || null }));
}
