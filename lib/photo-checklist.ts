// 📋 Photo checklist per job (app idea list: "each job shows the photos HPD needs with ticks as you take them"): before
// photos, a before video, after photos, an after video (owner, 1 Nov: "the before and after videos are our record").
// From the counts saved on the phone; 3 photos each is what the shot guide asks for.

export type MediaCounts = { before: number; after: number; beforeVideos?: number; afterVideos?: number };
export type CheckItem = { key: string; kind: "before" | "after"; label: string; done: boolean; note: string };

// Owner, 20 Nov: a No access or Refused access visit does not need any photo or video.
export const noPhotosNeeded = (outcome?: string | null) => /NO_ACCESS|REFUSED/i.test(String(outcome || ""));

export function photoChecklist(c: MediaCounts | null | undefined, outcome?: string | null): CheckItem[] {
  if (noPhotosNeeded(outcome)) return [];
  const m = c || { before: 0, after: 0 };
  const bv = m.beforeVideos || 0, av = m.afterVideos || 0;
  const bp = Math.max(0, (m.before || 0) - bv), ap = Math.max(0, (m.after || 0) - av);
  const photos = (n: number) => (n >= 3 ? `${n} ✓` : n ? `${n} of 3` : "none yet");
  return [
    { key: "before-photos", kind: "before", label: "Before photos", done: bp > 0, note: photos(bp) },
    { key: "before-video", kind: "before", label: "Before video", done: bv > 0, note: bv ? `${bv} ✓` : "none yet" },
    { key: "after-photos", kind: "after", label: "After photos", done: ap > 0, note: photos(ap) },
    { key: "after-video", kind: "after", label: "After video", done: av > 0, note: av ? `${av} ✓` : "none yet" },
  ];
}

export function checklistLine(items: CheckItem[], outcome?: string | null) {
  if (noPhotosNeeded(outcome)) return "No photos needed for no access / refused access ✓";
  const left = items.filter((i) => !i.done);
  return left.length ? `Still to take: ${left.map((i) => i.label.toLowerCase()).join(", ")}` : "All photos and videos HPD needs are saved ✓";
}

// Photo count on every job card (plan, 14 Nov): how many photos/videos are still needed before you leave the building.
// 3 before photos + 3 after photos + a before and an after video; counts come from the same saved counts as the checklist.
export function photosStillNeeded(c: MediaCounts | null | undefined, outcome?: string | null): { left: number; line: string } {
  if (noPhotosNeeded(outcome)) return { left: 0, line: "📷 No photos needed (no access / refused access) ✓" };
  const m = c || { before: 0, after: 0 };
  const bv = m.beforeVideos || 0, av = m.afterVideos || 0;
  const bp = Math.max(0, (m.before || 0) - bv), ap = Math.max(0, (m.after || 0) - av);
  const left = Math.max(0, 3 - bp) + Math.max(0, 3 - ap) + (bv ? 0 : 1) + (av ? 0 : 1);
  // 26 Nov (owner saw "4 still needed" after the worker's photos came in): say which ones, so it's clear what came in.
  const more = (n: number, side: string) => (n > 0 ? [`${n} ${side} photo${n === 1 ? "" : "s"}`] : []);
  const what = [...more(3 - bp, "before"), ...(bv ? [] : ["a before video"]), ...more(3 - ap, "after"), ...(av ? [] : ["an after video"])];
  const has = bp + ap + bv + av;
  return { left, line: left ? `📷 ${left} photo${left === 1 ? "" : "s"}/video${left === 1 ? "" : "s"} still needed: ${what.join(", ")}${has ? ` (you have ${bp + bv} before, ${ap + av} after)` : ""}` : "📷 All photos and videos done ✓" };
}

// 7 AM bids brief (plan, 14 Nov): "3 bids due today, the closest at 11:00 AM, and 2 due tomorrow."
export function bidsBriefLine(b: { unsentToday?: number; tomorrow?: number; firstTime?: string }): string {
  const n = b.unsentToday || 0, t = b.tomorrow || 0;
  if (!n && !t) return "";
  const today = n ? `${n} bid${n === 1 ? "" : "s"} due today${b.firstTime ? `, ${n === 1 ? "closing" : "the closest closes"} at ${b.firstTime}` : ""}` : "";
  const tom = t ? `${t} due tomorrow` : "";
  return [today, tom].filter(Boolean).join(" and ");
}
