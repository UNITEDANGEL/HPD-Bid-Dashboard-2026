"use client";

import { useRef, useState } from "react";
import { signatureFromTypedName, trimCanvas } from "../../lib/signature";

// The notary's own in-person (or online) approval: never saved, never reused. Fresh for every
// affidavit. Hand the signer's phone to the notary after they sign; the notary signs or types
// their name, picks the date, confirms they witnessed the signing, then approves. The printed
// stamp text is added automatically for this emailed/Drive copy -- a printed copy still needs
// the notary's real ink stamp.

export type NotaryApproval = { signature: string; name: string; date: string };

export default function NotaryCard({ minDate, defaultName, onApprove }: { minDate: string; defaultName?: string; onApprove: (notary: NotaryApproval | null) => void }) {
  const [signature, setSignature] = useState("");
  const [name, setName] = useState(defaultName || "");
  const [date, setDate] = useState(minDate);
  const [witnessed, setWitnessed] = useState(false);
  const [approved, setApproved] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const inked = useRef(false);

  function resetCanvasSurface() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(2, window.devicePixelRatio || 1);
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    const context = canvas.getContext("2d")!;
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.6;
    context.strokeStyle = "#0b1f4d";
    inked.current = false;
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!canvasRef.current?.width) resetCanvasSurface();
    event.currentTarget.setPointerCapture(event.pointerId);
    last.current = point(event);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!last.current) return;
    const context = event.currentTarget.getContext("2d")!;
    const next = point(event);
    context.beginPath();
    context.moveTo(last.current.x, last.current.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    last.current = next;
    inked.current = true;
  }

  function keepSignature() {
    const canvas = canvasRef.current;
    if (!canvas || !inked.current) {
      setError("The notary needs to sign in the box first.");
      return;
    }
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        if (pixels[(y * canvas.width + x) * 4 + 3] > 0) {
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX < 0) {
      setError("The notary needs to sign in the box first.");
      return;
    }
    setSignature(trimCanvas(canvas, minX, minY, maxX + 2, maxY + 2));
    setError("");
  }

  function clearSignature() {
    setSignature("");
    resetCanvasSurface();
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function fromTypedName() {
    try {
      const value = await signatureFromTypedName(typedName.trim() || name);
      setSignature(value);
      setError("");
      setTyping(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That name could not be drawn. Try signing with a finger instead.");
    }
  }

  function approve() {
    if (!signature) { setError("The notary needs to sign (or type to sign) first."); return; }
    if (!name.trim()) { setError("The notary needs to type their name."); return; }
    if (!date) { setError("Pick the notary date."); return; }
    if (date < minDate) { setError(`The notary date can't be before ${minDate}.`); return; }
    if (!witnessed) { setError("The notary needs to confirm they witnessed the signing."); return; }
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
          <strong>Notarized by {name}</strong>
          <small>The printed stamp text is added to this emailed/Drive copy automatically. A printed copy still needs the notary&apos;s real ink stamp.</small>
        </div>
        <img className="sig-preview" src={signature} alt="Notary signature" />
        <div className="sig-actions">
          <button type="button" onClick={undoApproval}>Redo notary step</button>
        </div>
      </div>
    );
  }

  return (
    <div className="refused-access-required sig-card needs-description" data-hpd-smoke="paperwork-notary-card">
      <div>
        <span>Notary</span>
        <strong>Hand the phone to your notary</strong>
        <small>Your notary signs (or types to sign, e.g. for an online notary) below, types their own name, picks today&apos;s (or a later) date, and confirms they witnessed you sign. Nothing here is saved -- it&apos;s done fresh for every affidavit.</small>
      </div>
      {typing ? (
        <label className="sig-type">
          Type the notary&apos;s full name
          <input
            data-hpd-smoke="paperwork-notary-type-name"
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            placeholder={name || "Notary's name"}
            autoCapitalize="words"
          />
          <small>Only the notary&apos;s own name. This becomes their signature above.</small>
        </label>
      ) : (
        <canvas
          ref={canvasRef}
          className="sig-pad"
          data-hpd-smoke="paperwork-notary-pad"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={() => { last.current = null; }}
          onPointerCancel={() => { last.current = null; }}
        />
      )}
      <div className="sig-actions">
        {typing ? (
          <>
            <button type="button" className="sig-primary" data-hpd-smoke="paperwork-notary-type-save" onClick={() => void fromTypedName()}>Use typed signature</button>
            <button type="button" onClick={() => setTyping(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" onClick={keepSignature} data-hpd-smoke="paperwork-notary-sign">Use this signature</button>
            <button type="button" data-hpd-smoke="paperwork-notary-type" onClick={() => { setError(""); setTypedName(typedName || name); setTyping(true); }}>Type to sign</button>
            {signature ? <button type="button" onClick={clearSignature}>Clear</button> : null}
          </>
        )}
      </div>
      {signature && !typing ? <img className="sig-preview" src={signature} alt="Notary signature preview" /> : null}
      <label className="paperwork-field">
        Notary&apos;s printed name
        <input
          data-hpd-smoke="paperwork-notary-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
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
      <label className="paperwork-checkbox">
        <input
          type="checkbox"
          data-hpd-smoke="paperwork-notary-witnessed"
          checked={witnessed}
          onChange={(event) => setWitnessed(event.target.checked)}
        />
        I am the notary and I personally witnessed the signer sign today.
      </label>
      <div className="sig-actions">
        <button type="button" className="sig-primary" data-hpd-smoke="paperwork-notary-approve" onClick={approve}>Notary approve</button>
      </div>
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}
