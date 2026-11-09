"use client";
// 📞 Tap to call the super (app idea list: "on a job card, one tap calls or texts the contact you saved for that
// address"): save the building's super / contact once (name, phone, a note like "basement door") and every job at that
// building shows it with Call and Text. Kept on this phone only (not on the status server, not in any file).
import { useEffect, useState } from "react";

type Contact = { name: string; phone: string; note?: string; savedAt: string };
const KEY = "hpd-building-contacts";
const load = (): Record<string, Contact> => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const digits = (p: string) => p.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
export const prettyPhone = (p: string) => { const d = digits(p); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p.trim(); };

export default function BuildingContact({ building, address }: { building: string; address: string }) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", note: "" });
  const [msg, setMsg] = useState("");
  useEffect(() => { const c = load()[building] || null; setContact(c); setEdit(false); setMsg(""); setForm({ name: c?.name || "", phone: c?.phone || "", note: c?.note || "" }); }, [building]);
  if (!building) return null;
  const save = () => {
    const phone = digits(form.phone);
    if (phone.length !== 10) { setMsg("Type a 10-digit phone number."); return; }
    const all = load();
    const c = { name: form.name.trim() || "Super", phone, note: form.note.trim(), savedAt: new Date().toISOString() };
    all[building] = c;
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode */ }
    setContact(c); setEdit(false); setMsg(`Saved for every job at ${address.replace(/,\s*\d{5}$/, "")}.`);
  };
  const remove = () => {
    const all = load(); delete all[building];
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode */ }
    setContact(null); setEdit(false); setForm({ name: "", phone: "", note: "" }); setMsg("Contact removed.");
  };
  return (
    <div className="jc-building-contact" data-hpd-smoke="jc-building-contact">
      {contact && !edit ? (
        <div className="jc-bc-row">
          <span>🏢 <b>{contact.name}</b> · {prettyPhone(contact.phone)}{contact.note ? <small> · {contact.note}</small> : null}</span>
          <a className="fc-call-btn" href={`tel:${contact.phone}`} data-hpd-smoke="jc-bc-call">Call</a>
          <a className="fc-call-btn" href={`sms:${contact.phone}`} data-hpd-smoke="jc-bc-text">Text</a>
          <button type="button" aria-label="Change the building contact" data-hpd-smoke="jc-bc-edit" onClick={() => setEdit(true)}>✎</button>
        </div>
      ) : edit ? (
        <div className="jc-bc-form" data-hpd-smoke="jc-bc-form">
          <input placeholder="Name (e.g. Super Jose)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-hpd-smoke="jc-bc-name" />
          <input inputMode="tel" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-hpd-smoke="jc-bc-phone" />
          <input placeholder="Note (optional: basement door, after 9 AM…)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} data-hpd-smoke="jc-bc-note" />
          <div>
            <button type="button" className="is-main" data-hpd-smoke="jc-bc-save" onClick={save}>Save</button>
            <button type="button" onClick={() => { setEdit(false); setMsg(""); }}>Cancel</button>
            {contact ? <button type="button" data-hpd-smoke="jc-bc-remove" onClick={remove}>Remove</button> : null}
          </div>
        </div>
      ) : (
        <button type="button" className="jc-bc-add" data-hpd-smoke="jc-bc-add" onClick={() => setEdit(true)}>＋ Save the super / building contact</button>
      )}
      {msg ? <small className="jc-bc-msg" role="status" data-hpd-smoke="jc-bc-msg">{msg}</small> : null}
    </div>
  );
}
