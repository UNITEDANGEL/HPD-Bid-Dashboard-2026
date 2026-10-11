"use client";

import { useEffect, useState } from "react";
import { clearSignature, loadSignature, NOTARY_SIGNATURE_KEY, saveSignature, signatureFromTypedName } from "../../lib/signature";
import { displayName, useSignaturePad } from "./useSignaturePad";

// The notary's approval for each affidavit. The notary's signature can be saved on this phone
// so they don't redraw it every time, but it is only ever placed on an affidavit after the
// notary confirms they witnessed the signing and taps approve -- every affidavit, fresh. The
// printed stamp text is added automatically; a printed copy still needs the real ink stamp.

export type NotaryApproval = { signature: string; name: string; date: string };

// Whose saved notary signature this is, so a different notary never gets someone else's.
const NOTARY_NAME_KEY = "hpd-notary-signature-name-v1";

function loadSavedNotary(): { signature: string; name: string } {
  const signature = loadSignature(NOTARY_SIGNATURE_KEY);
  try {
    return signature ? { signature, name: localStorage.getItem(NOTARY_NAME_KEY) || "" } : { signature: "", name: "" };
  } catch {
    return { signature: "", name: "" };
  }
}

export default function NotaryCard({ minDate, defaultName, onApprove }: { minDate: string; defaultName?: string; onApprove: (notary: NotaryApproval | null) => void }) {
  const [saved, setSaved] = useState({ signature: "", name: "" });
  const [signature, setSignature] = useState("");
  const [name, setName] = useState(defaultName || "");
  const [date, setDate] = useState(minDate);
  const [approved, setApproved] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [error, setError] = useState("");
  const pad = useSignaturePad();
  const shownName = displayName(name);

  useEffect(() => {
    const value = loadSavedNotary();
    setSaved(value);
    if (value.signature) {
      setSignature(value.signature);
      if (value.name) setName(value.name);
    }
  }, []);

  // The saved signature only belongs to the notary it was made for.
  function changeName(value: string) {
    setName(value);
    if (saved.signature && signature === saved.signature && value.trim().toUpperCase() !== saved.name.trim().toUpperCase()) setSignature("");
  }

  function keep(dataUrl: string) {
    setSignature(dataUrl);
    setDrawing(false);
    setTyping(false);
    setError("");
    try {
      saveSignature(dataUrl, NOTARY_SIGNATURE_KEY);
      localStorage.setItem(NOTARY_NAME_KEY, name.trim());
      setSaved({ signature: dataUrl, name: name.trim() });
    } catch {
      // Still usable for this affidavit even if the phone won't store it.
    }
  }

  function keepDrawing() {
    const dataUrl = pad.capture();
    if (!dataUrl) {
      setError("The notary needs to sign in the box first.");
      return;
    }
    keep(dataUrl);
  }

  async function fromTypedName(value: string) {
    try {
      keep(await signatureFromTypedName(value));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That name could not be drawn. Try signing with a finger instead.");
    }
  }

  function forgetSaved() {
    clearSignature(NOTARY_SIGNATURE_KEY);
    try { localStorage.removeItem(NOTARY_NAME_KEY); } catch {}
    setSaved({ signature: "", name: "" });
    setSignature("");
  }

  function approve() {
    if (!signature) { setError("The notary needs to sign (or type to sign) first."); return; }
    if (!name.trim()) { setError("The notary needs to type their name."); return; }
    if (!date) { setError("Pick the notary date."); return; }
    if (date < minDate) { setError(`The notary date can't be before ${minDate}.`); return; }
    setApproved(true);
    setError("");
    onApprove({ signature, name: name.trim(), date });
  }

  function undoApproval() {
    setApproved(false);
    onApprove(null);
  }

  if (approved) {
    return (
      <div className="refused-access-required sig-card ready" data-hpd-smoke="paperwork-notary-card">
        <div>
          <span>Notary</span>
          <strong>Notarized by {shownName}</strong>
          <small>The printed stamp text is added to this emailed/Drive copy automatically. A printed copy still needs the notary&apos;s real ink stamp.</small>
        </div>
        <img className="sig-preview" src={signature} alt="Notary signature" />
        <div className="sig-actions">
          <button type="button" onClick={undoApproval}>Redo notary step</button>
        </div>
      </div>
    );
  }

  const usingSaved = Boolean(signature && signature === saved.signature);
  return (
    <div className="refused-access-required sig-card needs-description" data-hpd-smoke="paperwork-notary-card">
      <div>
        <span>Notary</span>
        <strong>{usingSaved ? `${shownName}: confirm and approve` : "Hand the phone to your notary"}</strong>
        <small>
          {usingSaved
            ? "The notary's saved signature is ready. The notary checks the date and taps the approve button, which confirms they witnessed the signing. Required for every affidavit."
            : "Your notary signs once (finger or typed name) -- it stays saved on this phone. Then they confirm the date, that they witnessed you sign, and approve."}
        </small>
      </div>
      {signature && !drawing && !typing ? <img className="sig-preview" src={signature} alt="Notary signature" data-hpd-smoke="paperwork-notary-preview" /> : null}
      {typing ? (
        <label className="sig-type">
          Type the notary&apos;s full name
          <input
            data-hpd-smoke="paperwork-notary-type-name"
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            placeholder={shownName || "Notary's name"}
            autoCapitalize="words"
          />
          <small>Only the notary&apos;s own name. This becomes their signature.</small>
        </label>
      ) : null}
      {drawing ? (
        <>
          <canvas className="sig-pad" data-hpd-smoke="paperwork-notary-pad" {...pad.padProps} />
          <small className="sig-hint">Notary: sign on the line with your finger.</small>
        </>
      ) : null}
      <div className="sig-actions">
        {drawing ? (
          <>
            <button type="button" className="sig-primary" onClick={keepDrawing} data-hpd-smoke="paperwork-notary-sign">Save this signature</button>
            <button type="button" onClick={() => { pad.clear(); setError(""); }}>Clear</button>
            <button type="button" onClick={() => setDrawing(false)}>Cancel</button>
          </>
        ) : typing ? (
          <>
            <button type="button" className="sig-primary" data-hpd-smoke="paperwork-notary-type-save" onClick={() => void fromTypedName(typedName.trim() || name)}>Save typed signature</button>
            <button type="button" onClick={() => setTyping(false)}>Cancel</button>
          </>
        ) : (
          <>
            {!signature && shownName ? (
              <button type="button" className="sig-primary" data-hpd-smoke="paperwork-notary-quick" onClick={() => void fromTypedName(name)}>Sign as {shownName}</button>
            ) : null}
            <button type="button" data-hpd-smoke="paperwork-notary-draw" onClick={() => { setError(""); setDrawing(true); }}>{signature ? "Sign again" : "Sign with finger"}</button>
            <button type="button" data-hpd-smoke="paperwork-notary-type" onClick={() => { setError(""); setTypedName(typedName || shownName); setTyping(true); }}>Type to sign</button>
            {saved.signature ? <button type="button" onClick={forgetSaved}>Remove saved signature</button> : null}
          </>
        )}
      </div>
      <label className="paperwork-field">
        Notary&apos;s printed name
        <input
          data-hpd-smoke="paperwork-notary-name"
          value={name}
          onChange={(event) => changeName(event.target.value)}
          placeholder="Notary's full name"
          autoCapitalize="words"
        />
      </label>
      <label className="paperwork-field">
        Notary date
        <input
          type="date"
          data-hpd-smoke="paperwork-notary-date"
          value={date}
          min={minDate}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      {/* One tap: the button itself is the notary's statement that they witnessed the signing. */}
      <div className="sig-actions">
        <button type="button" className="sig-primary" data-hpd-smoke="paperwork-notary-approve" onClick={approve}>
          ✓ I am the notary and I witnessed the signing today: approve
        </button>
      </div>
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}
