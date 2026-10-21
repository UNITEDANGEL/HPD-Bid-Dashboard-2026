"use client";
// The phone-alert switch (owner, 20 Oct): turn alerts on (iPhone asks for permission), send a test, turn them off.
import { useEffect, useState } from "react";
import { autoRegisterPush, pushState, testAlert, thisPhoneOnServer, turnOffPush, turnOnPush, type PushState } from "../lib/push";
import { playChime, unlockChime } from "../lib/chime";
import { ALERT_KINDS, type AlertKind } from "../lib/alert-kinds";

export default function PhoneAlerts() {
  const [state, setState] = useState<PushState | "">("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // Whether the server really has this phone (the alerts come from the server), checked after registering.
  const [onServer, setOnServer] = useState<boolean | null | "checking">("checking");
  const check = () => { setOnServer("checking"); void thisPhoneOnServer().then(setOnServer); };
  useEffect(() => { void autoRegisterPush().finally(() => { void pushState().then(setState); check(); }); }, []);
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
      <p>{state === "on" ? "On, automatic: alerts come even with the app closed or the phone locked. This phone re-registers itself every time the app opens." : "An alert for everything, each with its own sound, even with the app closed: 💰 you won a job (cha-ching), ⏱ 24/72-hour notices, 📋 documents requests (Gafur, Lewis), 💵 payment rejections, 📩 messages from HPD, 🧾 new invitations to bid, ⏰ a notice under 6 hours."}</p>
      {state === "need-home-screen" ? <p className="fc-push-note" data-hpd-smoke="fc-push-homescreen">{typeof navigator !== "undefined" && /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent) ? <>You&apos;re in <b>Chrome</b>: iPhone alerts only work in the app added from <b>Safari</b>. Open <b>hpd-bid-dashboard-2026.pages.dev</b> in Safari, tap <b>Share → Add to Home Screen</b>, then open <b>HPD Field</b> from that icon.</> : <>On the iPhone: in Safari tap <b>Share → Add to Home Screen</b>, open <b>HPD Field</b> from the icon, then come back here.</>}</p> : null}
      {state === "blocked" ? <p className="fc-push-note" data-hpd-smoke="fc-push-blocked">Alerts are blocked for this app: on the iPhone go to Settings → Notifications → HPD Field → Allow Notifications, then tap below.</p> : null}
      {state === "on"
        ? <div className="fc-push-row"><button type="button" data-hpd-smoke="fc-push-test" onClick={() => void testAlert().then((ok) => setMsg(ok ? "Test alert sent to this phone." : "Couldn't show a test alert."))}>Send a test alert</button><button type="button" className="is-off" data-hpd-smoke="fc-push-off" disabled={busy} onClick={() => void off()}>Turn off</button></div>
        : state === "unsupported" ? <p className="fc-push-note">This browser can&apos;t show phone alerts.</p>
        : <button type="button" className="fc-push-on" data-hpd-smoke="fc-push-on" disabled={busy || !state} onClick={() => void on()}>{busy ? "Turning on…" : "🔔 Turn on phone alerts"}</button>}
      {state === "on" ? (
        <p className={`fc-push-server${onServer === true ? " is-ok" : onServer === false ? " is-bad" : ""}`} data-hpd-smoke="fc-push-server">
          {onServer === "checking" ? <><span className="hpd-spin" aria-hidden="true" /> Checking the server has this phone…</> : onServer === true ? "✓ The server has this phone: alerts will come here." : onServer === false ? "⚠️ The server doesn't have this phone yet." : "Couldn't check the server (no signal?)."}
          {onServer === false || onServer === null ? <button type="button" data-hpd-smoke="fc-push-fix" onClick={() => void (async () => { setOnServer("checking"); const r = await turnOnPush(); setMsg(r.message); check(); })()}>Fix it now</button> : null}
        </p>
      ) : null}
      {msg ? <p className="fc-push-msg" data-hpd-smoke="fc-push-msg" role="status">{msg}</p> : null}
      <div className="fc-push-sounds" data-hpd-smoke="fc-push-sounds">
        <small>Hear each sound (every kind has its own):</small>
        <div>{(Object.keys(ALERT_KINDS) as AlertKind[]).map((k) => <button key={k} type="button" data-hpd-smoke={`fc-push-sound-${k}`} onClick={() => { unlockChime(); playChime(k); }}>{ALERT_KINDS[k].icon} {ALERT_KINDS[k].name}</button>)}</div>
      </div>
    </section>
  );
}
