"use client";
// Live fax tracker (owner, 21 Oct: "better icons, more interaction like sending, so I know it's going"): the bid's trip
// like a delivery tracker -- package ready -> sent to HumbleFax -> faxing HPD -> HPD received. The current step spins,
// finished steps fill green, a failed fax turns red; when HumbleFax confirms, a check pops with a burst of confetti.
import { useEffect, useState } from "react";

type FaxStage = "saved" | "waiting" | "confirmed" | "failed" | "unconfirmed";
type Step = { key: string; label: string; detail?: string; status: "done" | "now" | "todo" | "bad" };

const EFFECT_UNTIL: Record<string, number> = {}; // fax + state -> when its burst / shake ends
const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "");

export default function FaxTracker({ packageReady, sending, state, sentAt, confirmedAt, faxTo, error }: { packageReady: boolean; sending: boolean; state: FaxStage; sentAt?: string; confirmedAt?: string; faxTo?: string; error?: string }) {
  const sent = state !== "saved";
  const line = faxTo && /(\d{3})(\d{3})(\d{4})/.exec(faxTo.replace(/\D/g, "").slice(-10));
  const steps: Step[] = [
    { key: "package", label: "Package ready", status: packageReady || sent ? "done" : "todo" },
    { key: "humblefax", label: "Sent to HumbleFax", detail: sent ? time(sentAt) : sending ? "sending now" : error ? "not sent" : "", status: sent ? "done" : sending ? "now" : error ? "bad" : "todo" },
    { key: "faxing", label: "Faxing HPD", detail: line ? `(${line[1]}) ${line[2]}-${line[3]}` : "", status: state === "confirmed" ? "done" : state === "failed" ? "bad" : sent ? "now" : "todo" },
    { key: "received", label: state === "failed" ? "Fax failed: sending again" : "HPD received", detail: state === "confirmed" ? time(confirmedAt) : state === "unconfirmed" ? "no answer yet" : "", status: state === "confirmed" ? "done" : state === "failed" ? "bad" : "todo" },
  ];
  // The burst plays once per fax, when HumbleFax confirmed it in the last 3 minutes; a failed fax shakes once. Kept
  // outside the component: the bid screen redraws (and remakes this tracker) right when the fax is confirmed.
  const [, tick] = useState(0);
  useEffect(() => {
    const fresh = (iso?: string) => !!iso && Date.now() - Date.parse(iso) < 180000;
    const key = `${sentAt}|${state}`;
    if (!(key in EFFECT_UNTIL) && ((state === "confirmed" && fresh(confirmedAt)) || state === "failed")) EFFECT_UNTIL[key] = Date.now() + (state === "confirmed" ? 1800 : 700);
    const left = (EFFECT_UNTIL[key] || 0) - Date.now();
    if (left > 0) { tick((n) => n + 1); const t = window.setTimeout(() => tick((n) => n + 1), left + 30); return () => window.clearTimeout(t); }
  }, [state, confirmedAt, sentAt]);
  const until = EFFECT_UNTIL[`${sentAt}|${state}`] || 0;
  const burst = state === "confirmed" && Date.now() < until;
  const shake = state === "failed" && Date.now() < until;
  return (
    <ol className={`fc-faxtrack${shake ? " is-shake" : ""}`} data-hpd-smoke="fc-faxtrack" data-state={state} aria-label="Fax progress">
      {steps.map((s, i) => (
        <li key={s.key} className={`is-${s.status}`} data-hpd-smoke={`fc-faxtrack-${s.key}`} data-status={s.status}>
          <span className="fc-faxtrack-dot" aria-hidden="true">{s.status === "done" ? "✓" : s.status === "bad" ? "!" : s.status === "now" ? <span className="hpd-spin" /> : i + 1}</span>
          <span className="fc-faxtrack-text"><b>{s.label}</b>{s.detail ? <small>{s.detail}</small> : null}</span>
          {i < steps.length - 1 ? <span className={`fc-faxtrack-bar${s.status === "done" && steps[i + 1].status === "now" ? " is-flow" : ""}`} aria-hidden="true" /> : null}
        </li>
      ))}
      {burst ? <span className="fc-burst" data-hpd-smoke="fc-faxtrack-burst" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ["--a" as string]: `${i * (360 / 14)}deg`, ["--c" as string]: ["#22c55e", "#facc15", "#38bdf8", "#f472b6", "#fb923c"][i % 5] }} />)}<b>✓</b></span> : null}
    </ol>
  );
}
