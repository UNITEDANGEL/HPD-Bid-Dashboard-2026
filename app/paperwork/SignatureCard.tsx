"use client";

import { useEffect, useRef, useState } from "react";
import { clearSignature, loadSignature, saveSignature, signatureFromPhoto, signatureFromTypedName } from "../../lib/signature";
import { displayName, useSignaturePad } from "./useSignaturePad";

// Signer's signature for the affidavit and invoice, saved on this phone so it is made once.
// The notary signs in their own card below.

export default function SignatureCard({ signer, onChange }: { signer: string; onChange: (dataUrl: string) => void }) {
  const [saved, setSaved] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pad = useSignaturePad();
  const name = displayName(signer);

  useEffect(() => {
    const value = loadSignature();
    setSaved(value);
    onChange(value);
  }, [onChange]);

  function store(dataUrl: string) {
    try {
      saveSignature(dataUrl);
      setSaved(dataUrl);
      onChange(dataUrl);
      setError("");
      setDrawing(false);
      setTyping(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signature could not be saved.");
    }
  }

  function keepDrawing() {
    const dataUrl = pad.capture();
    if (!dataUrl) {
      setError("Sign in the box first.");
      return;
    }
    store(dataUrl);
  }

  // Typed name in a handwriting font, adopted as the signer's own e-signature.
  async function fromTypedName(value: string) {
    try {
      store(await signatureFromTypedName(value));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That name could not be drawn. Try signing with your finger.");
    }
  }

  async function fromPhoto(file?: File) {
    if (!file) return;
    try {
      store(await signatureFromPhoto(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That picture could not be used.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="refused-access-required sig-card ready" data-hpd-smoke="paperwork-signature-card">
      <div>
        <span>Your Signature</span>
        <strong>{saved ? `Saved on this phone: ${name || "signer"}` : "Make your signature once"}</strong>
        <small>Goes on the affidavit Signature line and the invoice Signature of Principal. It stays saved on this phone for every package.</small>
      </div>
      {saved && !drawing && !typing ? <img className="sig-preview" src={saved} alt="Saved signature" data-hpd-smoke="paperwork-signature-preview" /> : null}
      {typing ? (
        <label className="sig-type">
          Type your full name
          <input
            data-hpd-smoke="paperwork-signature-name"
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            placeholder={name || "Your name"}
            autoCapitalize="words"
          />
          <small>Only your own name. This becomes your signature on your Signature lines.</small>
        </label>
      ) : null}
      {drawing ? (
        <>
          <canvas className="sig-pad" data-hpd-smoke="paperwork-signature-pad" {...pad.padProps} />
          <small className="sig-hint">Sign on the line with your finger, as you would on paper.</small>
        </>
      ) : null}
      <div className="sig-actions">
        {drawing ? (
          <>
            <button type="button" className="sig-primary" data-hpd-smoke="paperwork-signature-save" onClick={keepDrawing}>Save this signature</button>
            <button type="button" onClick={() => { pad.clear(); setError(""); }}>Clear</button>
            <button type="button" onClick={() => setDrawing(false)}>Cancel</button>
          </>
        ) : typing ? (
          <>
            <button type="button" className="sig-primary" data-hpd-smoke="paperwork-signature-type-save" onClick={() => void fromTypedName(typedName.trim() || signer)}>Save typed signature</button>
            <button type="button" onClick={() => setTyping(false)}>Cancel</button>
          </>
        ) : (
          <>
            {!saved && name ? (
              <button type="button" className="sig-primary" data-hpd-smoke="paperwork-signature-quick" onClick={() => void fromTypedName(signer)}>
                Sign as {name}
              </button>
            ) : null}
            <button type="button" className={saved || !name ? "sig-primary" : undefined} data-hpd-smoke="paperwork-signature-draw" onClick={() => { setError(""); setDrawing(true); }}>
              {saved ? "Sign again" : "Sign with finger"}
            </button>
            <button type="button" data-hpd-smoke="paperwork-signature-type" onClick={() => { setError(""); setTypedName(typedName || name); setTyping(true); }}>Type to sign</button>
            <button type="button" onClick={() => fileRef.current?.click()}>Upload signature photo</button>
            {saved ? <button type="button" onClick={() => { clearSignature(); setSaved(""); onChange(""); }}>Remove</button> : null}
          </>
        )}
      </div>
      {error ? <small role="alert">{error}</small> : null}
      <input ref={fileRef} hidden type="file" accept="image/*" onChange={(event) => void fromPhoto(event.target.files?.[0])} />
    </div>
  );
}
