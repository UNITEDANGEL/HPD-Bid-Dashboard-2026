"use client";
// The phone-alert switch (owner, 20 Oct): turn alerts on (iPhone asks for permission), send a test, turn them off.
import { useEffect, useState } from "react";
import { pushState, testAlert, turnOffPush, turnOnPush, type PushState } from "../lib/push";

export default function PhoneAlerts() {
  const [state, setState] = useState<PushState | "">("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void pushState().then(setState); }, []);
  const on = async () => {
    setBusy(true);
    try { const r = await turnOnPush(); setMsg(r.message); } catch (e) { setMsg(`Couldn't turn alerts on: ${e instanceof Error ? e.message : "error"}`); }
    setState(await pushState());
    setBusy(false);
  };
  const off = async () => { setBusy(true); await turnOffPush(); setMsg("Phone alerts are off on this phone."); setState(await pushState()); setBusy(false); };
  return (
    <section className={`fc-push is-${state || "loading"}`} data-hpd-smoke="fc-push" data-state={state}>
      <b>🔔 Phone alerts</b>
      <p>{state === "on" ? "On: alerts come even with the app closed or the phone locked." : "Get an alert when HPD writes or replies, a new invitation to bid comes in, or a 24-hour notice drops under 6 hours, even with the app closed."}</p>
      {state === "need-home-screen" ? <p className="fc-push-note" data-hpd-smoke="fc-push-homescreen">On the iPhone: in Safari tap <b>Share → Add to Home Screen</b>, open <b>HPD Field</b> from the icon, then come back here.</p> : null}
      {state === "blocked" ? <p className="fc-push-note" data-hpd-smoke="fc-push-blocked">Alerts are blocked for this app: on the iPhone go to Settings → Notifications → HPD Field → Allow Notifications, then tap below.</p> : null}
      {state === "on"
        ? <div className="fc-push-row"><button type="button" data-hpd-smoke="fc-push-test" onClick={() => void testAlert().then((ok) => setMsg(ok ? "Test alert sent to this phone." : "Couldn't show a test alert."))}>Send a test alert</button><button type="button" className="is-off" data-hpd-smoke="fc-push-off" disabled={busy} onClick={() => void off()}>Turn off</button></div>
        : state === "unsupported" ? <p className="fc-push-note">This browser can&apos;t show phone alerts.</p>
        : <button type="button" className="fc-push-on" data-hpd-smoke="fc-push-on" disabled={busy || !state} onClick={() => void on()}>{busy ? "Turning on…" : "🔔 Turn on phone alerts"}</button>}
      {msg ? <p className="fc-push-msg" data-hpd-smoke="fc-push-msg" role="status">{msg}</p> : null}
    </section>
  );
}
