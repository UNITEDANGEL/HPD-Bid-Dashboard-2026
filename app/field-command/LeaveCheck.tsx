"use client";

import { useEffect, useState } from "react";
import { listFieldEvidenceLite } from "../../lib/field-photo-store";
import { checkPhoto, leaveProblems, leaveRetakeKind, summarizePhotoCheck, type PhotoCheckItem } from "../../lib/photo-check";
import { loadJobNotes } from "../../lib/job-notes";
import { savedPhotoReason } from "../../lib/photo-reason";
import { speak } from "../../lib/speak";

// 🚪 Before you leave (owner idea, 24 Nov: "AI checks photos before you leave"): tapping ✕ I left on the "Working at" bar
// first looks at that job's before / after photos on this phone. Missing, blurry or dark -> one box with what to fix,
// 📷 Take it now (opens the job card on the right photo button) or Leave anyway. All good -> it just leaves. Nothing is sent.
export default function LeaveCheck({ jobId, address, work, onTake, onLeave }: {
  jobId: string; address: string; work: boolean;
  onTake: (kind: "before" | "after") => void; onLeave: (good: boolean) => void;
}) {
  const [state, setState] = useState<{ problems: string[]; kind: "before" | "after"; bad: PhotoCheckItem[] } | null>(null);
  useEffect(() => {
    let stop = false;
    (async () => {
      const rows = (await listFieldEvidenceLite(jobId).catch(() => [])).filter((m) => m.kind === "before" || m.kind === "after");
      const counts = { before: rows.filter((r) => r.kind === "before").length, after: rows.filter((r) => r.kind === "after").length };
      const items: PhotoCheckItem[] = [];
      for (const row of rows) {
        if (stop) return;
        if (row.mediaType !== "image" || !row.dataUrl) continue;
        const j = await checkPhoto(row.dataUrl);
        if (j) items.push({ id: row.id, kind: row.kind as "before" | "after", verdict: j.verdict, dataUrl: row.dataUrl });
      }
      if (stop) return;
      const summary = summarizePhotoCheck(items, counts, work);
      let reason = "";
      try { reason = savedPhotoReason(loadJobNotes(jobId)); } catch { reason = ""; }
      const problems = leaveProblems(summary, Boolean(reason));
      if (!problems.length) { onLeave(summary.good); return; }
      setState({ problems, kind: leaveRetakeKind(summary, problems), bad: summary.bad.slice(0, 3) });
      speak(`Before you leave ${jobId.split("").join(" ")}: ${problems[0]}`, 200);
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, work]);

  return <div className="fc-leave-check" role="dialog" aria-label="Before you leave" data-hpd-smoke="fc-leave-check" data-ready={state ? "true" : "false"}>
    <b>📸 Before you leave {jobId}</b>
    <span className="fc-leave-addr">{address}</span>
    {!state ? <span data-hpd-smoke="fc-leave-busy">Checking the photos…</span> : <>
      <ul>{state.problems.map((p) => <li key={p} data-hpd-smoke="fc-leave-problem">⚠ {p}</li>)}</ul>
      {state.bad.length ? <div className="fc-leave-bad">{state.bad.map((b) => <img key={b.id} src={b.dataUrl} alt={`${b.kind} photo to take again`} />)}</div> : null}
      <div className="fc-leave-actions">
        <button type="button" className="is-go" data-hpd-smoke="fc-leave-take" onClick={() => onTake(state.kind)}>📷 Take {state.kind === "before" ? "the before" : "the after"} photo now</button>
        <button type="button" data-hpd-smoke="fc-leave-anyway" onClick={() => onLeave(false)}>Leave anyway</button>
      </div>
    </>}
  </div>;
}
