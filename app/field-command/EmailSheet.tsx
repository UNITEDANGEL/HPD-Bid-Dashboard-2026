"use client";

// ✉️ Email screen (owner, 6 Nov, said to the helper: "Add email feature to the app"). Pick who (Lewis, Gafur or
// another HPD person who wrote to you), tap a ready line or type / say it, check, then Send. "Send to me first" puts
// the same email in your own Gmail to check or forward. Nothing goes out without your tap on Send.

import { useMemo, useState } from "react";
import { EMAIL_LINES, ERP_COPIES, emailDraft, firstName, isHpdAddress, withLewis, type EmailPerson } from "../../lib/email-people";
import { VT_LINES, vtDay } from "../../lib/notice-fix";

export type EmailJob = { omo: string; address: string; unit: "erp" | "aep" } | null;

// vt: "📣 Update vendor tracking" from a job card (9 Nov): Lewis, a copy to Saul and Rishi on ERP jobs, the short
// "in touch, going on <day>" line written in. visitDate: the job's next visit (yyyy-mm-dd), for that line.
export default function EmailSheet({ people: given, job, onClose, onSent, vt = false, visitDate = "", line = "touch" }: { people: EmailPerson[]; job: EmailJob; onClose: () => void; onSent?: (line: string) => void; vt?: boolean; visitDate?: string; line?: string }) {
  const people = useMemo(() => (job?.unit === "erp" || vt ? withLewis(given) : given), [given, job, vt]);
  const start = useMemo(() => (job ? people.find((p) => p.unit === job.unit) : null) || people[0] || null, [people, job]);
  const [to, setTo] = useState(start?.to || "");
  const [other, setOther] = useState("");
  const who = people.find((p) => p.to === to)?.who || "";
  const [day, setDay] = useState(visitDate);
  const first = emailDraft({ omo: job?.omo, address: job?.address, who, line: vt && job ? (VT_LINES.find((l) => l.key === line) || VT_LINES[0]).text(job.omo, vtDay(visitDate)) : "" });
  if (vt && job) first.subject = `${first.subject} - update`.slice(0, 200);
  // Copies to Saul and Rishi (ERP jobs): on for a vendor tracking update, off for other emails.
  const erp = job?.unit === "erp";
  const [cc, setCc] = useState<string[]>(() => (vt && erp ? ERP_COPIES.map((p) => p.to) : []));
  const [subject, setSubject] = useState(first.subject);
  const [text, setText] = useState(first.text);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const address = to === "other" ? other.trim().toLowerCase() : to;

  const pick = (next: string) => {
    const name = firstName(people.find((p) => p.to === next)?.who || "");
    setTo(next);
    // Swap the greeting to the new person, keep the rest of what was written.
    setText((t) => t.replace(/^(Hi [^,\n]*,|Hello,)/, name ? `Hi ${name},` : "Hello,"));
  };
  const addLine = (line: string) => setText((t) => {
    const parts = t.split("\n\nThank you,");
    const body = parts[0].replace(/\n+$/, "");
    const rest = parts.length > 1 ? `\n\nThank you,${parts.slice(1).join("\n\nThank you,")}` : "";
    const [greet, ...said] = body.split("\n\n");
    return `${[greet, ...said.filter(Boolean), line].join("\n\n")}${rest}`;
  });

  async function send(toSelf: boolean) {
    if (!toSelf && !isHpdAddress(address)) { setStatus("Pick an HPD person, or type an @hpd.nyc.gov address."); return; }
    if (!subject.trim()) { setStatus("Add a subject first."); return; }
    setBusy(true);
    setStatus(toSelf ? "Sending to you…" : "Sending…");
    try {
      const r = await fetch("/api/drive/hpd-reply", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toSelf ? { toSelf: true, subject: subject.trim(), text: text.trim() } : { to: address, subject: subject.trim(), text: text.trim(), ...(erp && cc.length ? { cc: cc.filter((x) => x !== address) } : {}) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.sent) throw new Error(r.status === 401 ? "sign in with Google on this phone" : d.error || `HTTP ${r.status}`);
      const copied = !toSelf && Array.isArray(d.cc) && d.cc.length ? ` (copy to ${ERP_COPIES.filter((p) => d.cc.includes(p.to)).map((p) => p.who.split(/\s+/).pop()).join(" and ")})` : "";
      const line = toSelf ? "✓ Sent to your own Gmail to check." : `✓ Sent to ${firstName(who) || address}${copied}.`;
      setStatus(line);
      if (!toSelf) { onSent?.(line); window.setTimeout(onClose, 1500); }
    } catch (e) {
      setStatus(`Not sent (${e instanceof Error ? e.message : "no connection"}). Try again.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fc-email-sheet" role="dialog" aria-label="Write an email" data-hpd-smoke="fc-email-sheet">
      <header>
        <strong>{vt ? "📣 Update vendor tracking" : "✉️ Email"}{job ? ` · ${job.omo}` : ""}</strong>
        <button type="button" data-hpd-smoke="fc-email-close" onClick={onClose}>Close</button>
      </header>
      <div className="fc-email-body">
        <label>To</label>
        <div className="fc-email-people" role="radiogroup" aria-label="Who gets it">
          {people.slice(0, 6).map((p) => (
            <button key={p.to} type="button" role="radio" aria-checked={to === p.to} className={to === p.to ? "is-on" : ""} data-hpd-smoke="fc-email-person" onClick={() => pick(p.to)}>
              {p.unit === "erp" ? "🚨 " : p.unit === "aep" ? "🏛 " : ""}{p.who}{p.unit ? <small>{p.unit === "erp" ? "ERP" : "AEP"}</small> : null}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={to === "other"} className={to === "other" ? "is-on" : ""} data-hpd-smoke="fc-email-other" onClick={() => pick("other")}>Someone else at HPD</button>
        </div>
        {to === "other" ? <input type="email" inputMode="email" placeholder="name@hpd.nyc.gov" value={other} onChange={(e) => setOther(e.target.value)} data-hpd-smoke="fc-email-other-input" /> : null}
        {erp ? (
          <div className="fc-email-cc" data-hpd-smoke="fc-email-cc">
            <small>Copy to</small>
            {ERP_COPIES.map((p) => (
              <label key={p.to} className={cc.includes(p.to) ? "is-on" : ""}>
                <input type="checkbox" data-hpd-smoke={`fc-email-cc-${p.who.split(/\s+/).pop()!.toLowerCase()}`} checked={cc.includes(p.to)} onChange={(e) => setCc((c) => (e.target.checked ? [...c, p.to] : c.filter((x) => x !== p.to)))} /> {p.who}
              </label>
            ))}
          </div>
        ) : null}
        <label htmlFor="fc-email-subject">Subject</label>
        <input id="fc-email-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value.replace(/[\r\n]/g, " "))} placeholder="OMO# ..." data-hpd-smoke="fc-email-subject" />
        {job ? (
          <div className="fc-email-vt" data-hpd-smoke="fc-email-vt">
            <div className="fc-email-day"><small>📣 Short update · the day you go</small><input type="date" value={day} onChange={(e) => setDay(e.target.value)} data-hpd-smoke="fc-email-day" aria-label="The day you go" /></div>
            <div className="fc-email-lines">
              {VT_LINES.map((l) => <button key={l.key} type="button" data-hpd-smoke={`fc-email-vt-${l.key}`} onClick={() => addLine(l.text(job.omo, vtDay(day)))}>{l.label}</button>)}
            </div>
          </div>
        ) : null}
        {job ? (
          <div className="fc-email-lines" data-hpd-smoke="fc-email-lines">
            {EMAIL_LINES.map((l) => <button key={l.key} type="button" data-hpd-smoke={`fc-email-line-${l.key}`} onClick={() => addLine(l.text(job.omo))}>{l.label}</button>)}
          </div>
        ) : null}
        <label htmlFor="fc-email-text">Message <small>(tap 🎤 on the keyboard to say it)</small></label>
        <textarea id="fc-email-text" rows={9} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} data-hpd-smoke="fc-email-text" />
        {status ? <p className="fc-email-status" role="status" data-hpd-smoke="fc-email-status">{status}</p> : null}
      </div>
      <footer>
        <button type="button" disabled={busy} data-hpd-smoke="fc-email-self" onClick={() => void send(true)}>📥 Send to me first</button>
        <button type="button" className="is-main" disabled={busy || (to === "other" ? !isHpdAddress(address) : !to)} data-hpd-smoke="fc-email-send" onClick={() => void send(false)}>✉️ Send{to && to !== "other" ? ` to ${firstName(who)}` : ""}</button>
      </footer>
    </div>
  );
}
