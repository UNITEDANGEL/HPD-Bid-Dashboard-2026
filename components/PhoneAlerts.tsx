"use client";
// The phone-alert switch (owner, 20 Oct): turn alerts on (iPhone asks for permission), send a test, turn them off.
import { useEffect, useState } from "react";
import { autoRegisterPush, pushState, testAlert, thisPhoneOnServer, turnOffPush, turnOnPush, type PushState } from "../lib/push";
import { ring, unlockChime, type AppNotice } from "../lib/chime";
import { setVoiceOff, voiceOff, voiceSupported } from "../lib/speak";
import { ALERT_KINDS, type AlertKind } from "../lib/alert-kinds";

// What each alert sounds like (tone, then the words), with made-up work orders.
const SAMPLES: Record<AlertKind, AppNotice> = {
  award: { kind: "award", title: "💰 You won · ER07640!", omo: "ER07640" },
  notice: { kind: "notice", title: "⏱ 72-hour notice · EQ31364 from Joy-Ann Lewis", omo: "EQ31364", who: "Joy-Ann Lewis", text: "72-hour notice: they want the affidavit and invoice for EQ31364" },
  request: { kind: "request", title: "📋 Deoranie Gafur asked for documents", who: "Deoranie Gafur", text: "Missing documents for 15 work orders: EP27489 affidavit and invoice, EP27382 affidavit and invoice and 13 more" },
  rejection: { kind: "rejection", title: "💵 Payment rejected · EL25850", omo: "EL25850", text: "The work dates on the invoice and affidavit don't match" },
  message: { kind: "message", title: "📩 Joy-Ann Lewis wrote · ER06498", omo: "ER06498", who: "Joy-Ann Lewis", text: "They want a status update on ER06498: the completion date has passed" },
  bid: { kind: "bid", title: "🧾 3 new invitations to bid" },
  "fax-ok": { kind: "fax-ok", title: "✅ Fax went through · ER07749: HPD received your bid" },
  "fax-bad": { kind: "fax-bad", title: "❌ Fax failed · ER07749", text: "The line was busy. Send it again." },
  urgent: { kind: "urgent", title: "⏰ ER01987: notice overdue 2 h", text: "Nothing sent yet: answer it now" },
  claude: { kind: "claude", title: "🤖 Claude: Working on it", text: "Making the map buttons bigger; you'll see it after the next update" },
};

export default function PhoneAlerts() {
  // Checked after the page loads (the server copy can't know the phone's voices).
  const [voice, setVoice] = useState(true);
  const [canSpeak, setCanSpeak] = useState(true);
  useEffect(() => { setCanSpeak(voiceSupported()); setVoice(voiceSupported() && !voiceOff()); }, []);
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
      {state === "need-home-screen" ? <p className="fc-push-note" data-hpd-smoke="fc-push-homescreen">{typeof navigator !== "undefined" && /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent) ? <>You&apos;re in a <b>Chrome</b> tab: iPhone alerts only work from a Home Screen icon. In Chrome tap <b>Share</b> (⬆ in the address bar, or ⋯ → Share) → <b>Add to Home Screen</b>, then open <b>HPD Field</b> from that icon.</> : <>On the iPhone: in Safari tap <b>Share → Add to Home Screen</b>, open <b>HPD Field</b> from the icon, then come back here.</>}</p> : null}
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
        {/* Voice (22 Oct): the tone, then the alert said out loud while the app is open. */}
        <button type="button" className={`fc-push-voice${voice ? " is-on" : ""}`} data-hpd-smoke="fc-push-voice" aria-pressed={voice} disabled={!canSpeak} onClick={() => { const next = !voice; setVoice(next); setVoiceOff(!next); unlockChime(); if (next) ring(SAMPLES.message); }}>
          {voice ? "🗣 Voice on: alerts are read out loud" : "🔇 Voice off: tones only"}
        </button>
        <small>{canSpeak ? "While the app is open you hear the tone, then the words (who it's from, the work order, what they want). With the phone locked the alert shows the same words." : "This browser can't speak: tones only."}</small>
        <small>Hear each one:</small>
        <div>{(Object.keys(ALERT_KINDS) as AlertKind[]).map((k) => <button key={k} type="button" data-hpd-smoke={`fc-push-sound-${k}`} onClick={() => { unlockChime(); ring(SAMPLES[k]); }}>{ALERT_KINDS[k].icon} {ALERT_KINDS[k].name}</button>)}</div>
      </div>
    </section>
  );
}
