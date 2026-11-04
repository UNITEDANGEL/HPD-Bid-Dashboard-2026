"use client";

import { useEffect, useRef, useState } from "react";
import { listFieldEvidenceLite } from "../../lib/field-photo-store";
import { checkPhoto, summarizePhotoCheck, type PhotoCheckItem, type PhotoCheckSummary, photoComment } from "../../lib/photo-check";
import { speak } from "../../lib/speak";
import HelperFace from "./HelperFace";

// 📸 Photo check on the job card: looks at the before/after photos on this phone (blurry, dark, washed out, missing)
// so a bad one is taken again at the building, not after HPD rejects the paperwork.
export default function PhotoCheck({ jobId, before, after, total, work }: { jobId: string; before: number; after: number; total: number; work: boolean }) {
  const [summary, setSummary] = useState<PhotoCheckSummary | null>(null);
  const [busy, setBusy] = useState(0);
  // A new photo while the card is open: the helper looks at it and says so (a talking face on the card, out loud).
  const seen = useRef<Set<string> | null>(null);
  const [say, setSay] = useState<{ text: string; good: boolean } | null>(null);
  useEffect(() => { if (!say) return; const t = window.setTimeout(() => setSay(null), 9000); return () => window.clearTimeout(t); }, [say]);
  useEffect(() => {
    let stop = false;
    (async () => {
      const rows = (await listFieldEvidenceLite(jobId).catch(() => [])).filter((m) => (m.kind === "before" || m.kind === "after") && m.mediaType === "image" && m.dataUrl);
      setBusy(rows.length);
      const items: PhotoCheckItem[] = [];
      for (const row of rows) {
        if (stop) return;
        const j = await checkPhoto(row.dataUrl);
        if (j) items.push({ id: row.id, kind: row.kind as "before" | "after", verdict: j.verdict, dataUrl: row.dataUrl });
      }
      if (stop) return;
      setBusy(0);
      setSummary(summarizePhotoCheck(items, { before, after }, work));
      const fresh = seen.current ? rows.filter((r) => !seen.current!.has(r.id)) : [];
      seen.current = new Set(rows.map((r) => r.id));
      const newest = fresh.sort((a, b) => String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")))[0];
      const item = newest && items.find((x) => x.id === newest.id);
      if (item) { const text = photoComment(item.verdict, item.kind); setSay({ text, good: item.verdict === "ok" }); speak(text, 300); }
    })();
    return () => { stop = true; };
  }, [jobId, before, after, total, work]);

  if (!work && !before && !after) return null;
  const good = summary?.good;
  return <section className={`jc-photo-check ${summary ? (good ? "is-good" : summary.problems.length ? "is-bad" : "") : ""}`} data-hpd-smoke="jc-photo-check" data-good={summary ? String(Boolean(good)) : ""} aria-live="polite">
    <strong>📸 Photo check</strong>
    {say ? <p className={`jc-photo-say${say.good ? " is-good" : " is-bad"}`} data-hpd-smoke="jc-photo-say" data-good={String(say.good)}><HelperFace mode={say.good ? "happy" : "worried"} size={34} /><span>{say.text}</span></p> : null}
    {busy ? <span>Looking at {busy} photo{busy === 1 ? "" : "s"}…</span>
      : !summary ? <span>Looking at the photos…</span>
      : good ? <span data-hpd-smoke="jc-photo-check-good">✓ {summary.checked === 1 ? "The photo looks" : `All ${summary.checked} photos look`} good for HPD{before && after ? " (before and after)" : ""}.</span>
      : summary.problems.length ? <ul>{summary.problems.map((p) => <li key={p} data-hpd-smoke="jc-photo-check-problem">⚠ {p}</li>)}</ul>
      : <span>Videos only: watch them once before you send.</span>}
    {summary?.bad.length ? <div className="jc-photo-check-bad">{summary.bad.slice(0, 4).map((b) => <figure key={b.id}>
      <img src={b.dataUrl} alt={`${b.kind} photo that ${b.verdict === "blurry" ? "looks blurry" : b.verdict === "dark" ? "is too dark" : "is too bright"}`} />
      <figcaption>{b.kind === "before" ? "Before" : "After"}: {b.verdict === "blurry" ? "blurry" : b.verdict === "dark" ? "dark" : "too bright"}</figcaption>
    </figure>)}</div> : null}
  </section>;
}
