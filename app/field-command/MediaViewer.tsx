"use client";

// 👁 See what's saved (owner, 6 Nov, at ER07610: "I clicked on the before, 10 saved items, I don't see none of them ...
// I should be able to see the before and after videos, that's our record"). Every photo and video saved on this phone
// for the job, before and after, with whether it's safe in Drive yet. Videos play from the file kept for the Drive
// backup (no whole video read into memory); an older video loads only when tapped.

import { useEffect, useState } from "react";
import { listFieldEvidenceLite, readFieldMedia, type FieldMediaLite } from "../../lib/field-photo-store";
import { getVideoEntry, STATUS_EVENT } from "../../lib/video-backup";

type Item = FieldMediaLite & { url: string; inDrive: boolean; driveError: string; driveId: string };

export default function MediaViewer({ jobId, kind, onClose }: { jobId: string; kind: "before" | "after"; onClose: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [tab, setTab] = useState<"before" | "after">(kind);
  useEffect(() => {
    let live = true;
    const urls: string[] = [];
    const load = async () => {
      const rows = await listFieldEvidenceLite(jobId).catch(() => [] as FieldMediaLite[]);
      const out: Item[] = [];
      for (const r of rows) {
        if (r.kind !== "before" && r.kind !== "after") continue;
        const entry = await getVideoEntry(r.id).catch(() => undefined);
        let url = r.dataUrl;
        if (r.mediaType === "video" && entry?.blob) { url = URL.createObjectURL(entry.blob); urls.push(url); }
        out.push({ ...r, url, inDrive: Boolean(entry?.uploadedAt), driveError: entry?.error || "", driveId: entry?.driveFileId || "" });
      }
      if (live) setItems(out);
    };
    void load();
    const again = () => void load();
    window.addEventListener(STATUS_EVENT, again);
    return () => { live = false; window.removeEventListener(STATUS_EVENT, again); for (const u of urls) URL.revokeObjectURL(u); };
  }, [jobId]);
  const loadOld = async (id: string) => {
    const m = await readFieldMedia(id).catch(() => null);
    if (m?.dataUrl) setItems((list) => (list || []).map((x) => (x.id === id ? { ...x, url: m.dataUrl } : x)));
  };
  const shown = (items || []).filter((x) => x.kind === tab);
  const count = (k: "before" | "after") => (items || []).filter((x) => x.kind === k).length;
  return (
    <div className="fc-media-viewer" role="dialog" aria-label="Saved photos and videos" data-hpd-smoke="fc-media-viewer">
      <header>
        <strong>📷 {jobId}: saved on this phone</strong>
        <button type="button" data-hpd-smoke="fc-media-viewer-close" onClick={onClose}>Close</button>
      </header>
      <div className="fc-media-viewer-tabs" role="tablist">
        {(["before", "after"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} data-hpd-smoke={`fc-media-tab-${k}`} onClick={() => setTab(k)}>{k === "before" ? "Before" : "After"} <b>{count(k)}</b></button>
        ))}
      </div>
      <div className="fc-media-viewer-body">
        {items === null ? <p>Loading…</p> : !shown.length ? <p>No {tab} photos or videos on this phone yet.</p> : (
          <ol className="fc-media-grid">
            {shown.map((x, i) => (
              <li key={x.id} data-hpd-smoke="fc-media-item" data-type={x.mediaType}>
                {x.mediaType === "video"
                  ? (x.url ? <video src={x.url} controls playsInline preload="metadata" /> : <button type="button" className="fc-media-load" onClick={() => void loadOld(x.id)}>🎥 Tap to load this video</button>)
                  : <img src={x.url} alt={`${tab} photo ${i + 1}`} />}
                <small>{x.mediaType === "video" ? "🎥" : "📷"} {i + 1}{x.capturedAt ? ` · ${new Date(x.capturedAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""} · <span data-hpd-smoke="fc-media-drive">{x.inDrive ? (x.driveId ? <a href={`https://drive.google.com/file/d/${encodeURIComponent(x.driveId)}/view`} target="_blank" rel="noreferrer" data-hpd-smoke="fc-media-drive-open">☁️ Open in Drive</a> : "☁️ in Drive") : x.driveError ? `⚠ not in Drive yet: ${x.driveError}` : "📱 on this phone, going to Drive"}</span></small>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
