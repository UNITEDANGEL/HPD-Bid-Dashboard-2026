"use client";
// 🤖 Autopilot (23 Oct): what runs by itself, in one place. Texting service connected or not (and how to connect it),
// the automatic first text on new awards (a switch, saved on the status server so the 10-minute alert job sees it),
// the AI, and phone alerts.
import Link from "next/link";
import { useState } from "react";

export const AUTOPILOT_KEY = "SETTINGS-AUTOPILOT";

export default function AutopilotPanel({ smsReady, aiReady, workerUrl, onClose }: { smsReady: boolean; aiReady: boolean; workerUrl: string; onClose: () => void }) {
  const [autoText, setAutoText] = useState(() => { try { return localStorage.getItem("hpd-auto-tenant-text") !== "off"; } catch { return true; } });
  const [status, setStatus] = useState("");
  const toggle = async () => {
    const on = !autoText;
    setAutoText(on);
    try { localStorage.setItem("hpd-auto-tenant-text", on ? "on" : "off"); } catch { /* private mode */ }
    setStatus("Saving…");
    try {
      const r = await fetch(`${workerUrl.replace(/\/$/, "")}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: AUTOPILOT_KEY, patch: { autoTenantText: on } }) });
      setStatus(r.ok ? (on ? "✓ On: new awards get the first text by themselves." : "✓ Off: nothing is texted by itself.") : `Not saved (HTTP ${r.status}). Try again.`);
    } catch { setStatus("No connection: not saved. Try again."); }
  };
  return (
    <div className="fc-package-sheet fc-summary-sheet fc-autopilot" role="dialog" aria-label="Autopilot" data-hpd-smoke="fc-autopilot">
      <header>
        <strong>🤖 Autopilot</strong>
        <button type="button" aria-label="Close" data-hpd-smoke="fc-autopilot-close" onClick={onClose}>Close</button>
      </header>
      <div className="fc-summary-body">
        <ul className="fc-autopilot-list">
          <li className={aiReady ? "is-on" : ""} data-hpd-smoke="fc-autopilot-ai"><b>{aiReady ? "✅" : "⚪"} AI helper</b><small>{aiReady ? "On: answers free questions and does the app's actions for you." : "Off on this phone: sign in with Google to use it."}</small></li>
          <li className={smsReady ? "is-on" : ""} data-hpd-smoke="fc-autopilot-sms">
            <b>{smsReady ? "✅" : "⚪"} Texting service</b>
            {smsReady
              ? <small>Connected: texts go from the business number and tenants&apos; replies come back here.</small>
              : <small>Not connected yet. To switch it on: 1) a Twilio account and phone number; 2) US business-text registration (A2P 10DLC) in Twilio; 3) the Account SID, Auth Token and number added as secrets in Cloudflare Pages and GitHub; 4) the number&apos;s &quot;A message comes in&quot; webhook set to /api/sms-inbound. Until then texts open Messages on your phone.</small>}
          </li>
          <li className={autoText ? "is-on" : ""} data-hpd-smoke="fc-autopilot-autotext">
            <b>{autoText ? "✅" : "⚪"} First text to the tenant on every new award</b>
            <small>{smsReady ? "Working hours only, once per job; you get an alert when it goes." : "Waits for the texting service; the switch is kept."}</small>
            <button type="button" className={autoText ? "is-on" : ""} aria-pressed={autoText} data-hpd-smoke="fc-autopilot-autotext-toggle" onClick={() => void toggle()}>{autoText ? "On · tap to turn off" : "Off · tap to turn on"}</button>
            {status ? <small role="status" data-hpd-smoke="fc-autopilot-status">{status}</small> : null}
          </li>
          <li className="is-on"><b>✅ Alerts and reminders</b><small>Awards, payments, notices, fax results, appointments (an hour before), tenant replies. <Link href="/alerts/">Phone alerts</Link></small></li>
          <li className="is-on"><b>✅ Moves on by itself</b><small>Next bid after a send, next notice after a reply, next stop after a finished job.</small></li>
        </ul>
      </div>
    </div>
  );
}
