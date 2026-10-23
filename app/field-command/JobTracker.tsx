"use client";
// 🧭 Job tracker (owner, 23 Oct): every job by stage from award to payment, with counts. Tap a stage to see its jobs,
// tap a job to open it. The stage with work for you first is opened by itself.
import { useState } from "react";
import { TRACKER_STAGES, type TrackerStage } from "../../lib/job-tracker";

export type TrackerRow = { id: string; address: string; stage: TrackerStage; note: string };

export default function JobTracker({ rows, onOpen, onClose }: { rows: TrackerRow[]; onOpen: (id: string) => void; onClose: () => void }) {
  const count = (k: TrackerStage) => rows.filter((r) => r.stage === k).length;
  const firstToDo = (["text", "book", "paperwork", "appointment", "waiting", "work", "sent", "payment", "closed", "paid"] as TrackerStage[]).find((k) => count(k) > 0) || "text";
  const [open, setOpen] = useState<TrackerStage | null>(firstToDo);
  return (
    <div className="fc-package-sheet fc-summary-sheet fc-tracker" role="dialog" aria-label="Job tracker" data-hpd-smoke="fc-tracker">
      <header>
        <strong>🧭 Job tracker · {rows.length} jobs</strong>
        <button type="button" aria-label="Close" data-hpd-smoke="fc-tracker-close" onClick={onClose}>Close</button>
      </header>
      <div className="fc-summary-body">
        <p className="fc-follow-note">From the award to the money: where every job is, and what to do next.</p>
        <ol className="fc-tracker-stages">
          {TRACKER_STAGES.map((s) => {
            const list = rows.filter((r) => r.stage === s.key);
            const isOpen = open === s.key;
            return (
              <li key={s.key} className={`fc-tracker-stage is-${s.key}${list.length ? "" : " is-empty"}${isOpen ? " is-open" : ""}`} data-hpd-smoke={`fc-tracker-stage-${s.key}`}>
                <button type="button" className="fc-tracker-head" aria-expanded={isOpen} disabled={!list.length} onClick={() => setOpen(isOpen ? null : s.key)}>
                  <span aria-hidden="true">{s.icon}</span>
                  <b>{s.label}</b>
                  <em data-hpd-smoke={`fc-tracker-count-${s.key}`}>{list.length}</em>
                </button>
                {isOpen && list.length ? (
                  <div className="fc-tracker-list">
                    <small>{s.todo}</small>
                    <ul>
                      {list.slice(0, 60).map((r) => (
                        <li key={r.id}>
                          <button type="button" data-hpd-smoke="fc-tracker-job" onClick={() => onOpen(r.id)}>
                            <b>{r.id}</b> <span>{r.address}</span>{r.note ? <small>{r.note}</small> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {list.length > 60 ? <small>… and {list.length - 60} more</small> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
