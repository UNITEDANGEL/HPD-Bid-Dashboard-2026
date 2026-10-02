"use client";

import { useEffect, useRef, useState } from "react";
import { clearSignature, loadSignature, saveSignature, signatureFromPhoto, signatureFromTypedName, trimCanvas } from "../../lib/signature";

// Signer's signature for the affidavit and invoice. The notary section is left for the notary.

export default function SignatureCard({ signer, onChange }: { signer: string; onChange: (dataUrl: string) => void }) {
  const [saved, setSaved] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const inked = useRef(false);

  useEffect(() => {
    const value = loadSignature();
    setSaved(value);
    onChange(value);
  }, [onChange]);

  useEffect(() => {
    if (!drawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
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
  }, [drawing]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
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

  function store(dataUrl: string) {
    try {
      saveSignature(dataUrl);
      setSaved(dataUrl);
      onChange(dataUrl);
      setError("");
      setDrawing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signature could not be saved.");
    }
  }

  function keepDrawing() {
    const canvas = canvasRef.current;
    if (!canvas || !inked.current) {
      setError("Sign in the box first.");
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
    store(trimCanvas(canvas, minX, minY, maxX + 2, maxY + 2));
  }

  // Typed name in a handwriting font, adopted as the signer's own e-signature.
  async function fromTypedName() {
    try {
      store(await signatureFromTypedName(typedName.trim() || signer));
      setTyping(false);
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
        <strong>{saved ? `Signed as ${signer || "signer"}` : "Add your signature once"}</strong>
        <small>Goes on the affidavit Signature line and the invoice Signature of Principal. The notary section stays blank for your notary.</small>
      </div>
      {saved && !drawing ? <img className="sig-preview" src={saved} alt="Saved signature" /> : null}
      {typing ? (
        <label className="sig-type">
          Type your full name
          <input
            data-hpd-smoke="paperwork-signature-name"
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            placeholder={signer || "Your name"}
            autoCapitalize="words"
          />
          <small>Only your own name. This becomes your signature on your Signature lines.</small>
        </label>
      ) : null}
      {drawing ? (
        <canvas
          ref={canvasRef}
          className="sig-pad"
          data-hpd-smoke="paperwork-signature-pad"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={() => { last.current = null; }}
          onPointerCancel={() => { last.current = null; }}
        />
      ) : null}
      <div className="sig-actions">
        {drawing ? (
          <>
            <button type="button" className="sig-primary" data-hpd-smoke="paperwork-signature-save" onClick={keepDrawing}>Use this signature</button>
            <button type="button" onClick={() => setDrawing(false)}>Cancel</button>
          </>
        ) : typing ? (
          <>
            <button type="button" className="sig-primary" data-hpd-smoke="paperwork-signature-type-save" onClick={() => void fromTypedName()}>Use typed signature</button>
            <button type="button" onClick={() => setTyping(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" className="sig-primary" data-hpd-smoke="paperwork-signature-draw" onClick={() => { setError(""); setDrawing(true); }}>
              {saved ? "Sign again" : "Sign with finger"}
            </button>
            <button type="button" data-hpd-smoke="paperwork-signature-type" onClick={() => { setError(""); setTypedName(typedName || signer); setTyping(true); }}>Type to sign</button>
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
