// 📋 Photo checklist per job (app idea list: "each job shows the photos HPD needs with ticks as you take them"): before
// photos, a before video, after photos, an after video (owner, 1 Nov: "the before and after videos are our record").
// From the counts saved on the phone; 3 photos each is what the shot guide asks for.

export type MediaCounts = { before: number; after: number; beforeVideos?: number; afterVideos?: number };
export type CheckItem = { key: string; kind: "before" | "after"; label: string; done: boolean; note: string };

export function photoChecklist(c: MediaCounts | null | undefined): CheckItem[] {
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

export function checklistLine(items: CheckItem[]) {
  const left = items.filter((i) => !i.done);
  return left.length ? `Still to take: ${left.map((i) => i.label.toLowerCase()).join(", ")}` : "All photos and videos HPD needs are saved ✓";
}
