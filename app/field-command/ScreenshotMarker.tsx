"use client";

import { useRef, useState } from "react";

// 📷 "Ask for a change" picture (owner, 20 Nov: "upload an image so I can take a snapshot of the app, highlight what I
// don't like"). Pick a screenshot, draw on it with a finger in red, and it goes with the request as a small JPEG.
// Kept small (max 900 px wide, ~60-90 KB) because the status server keeps every request.
const MAX_W = 900;

export default function ScreenshotMarker({ onChange }: { onChange: (dataUrl: string) => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const original = useRef<HTMLImageElement | null>(null);
  const drawing = useRef(false);
  const [has, setHas] = useState(false);
  const [note, setNote] = useState("");

  const publish = () => { try { onChange(canvas.current ? canvas.current.toDataURL("image/jpeg", 0.65) : ""); } catch { onChange(""); } };

  const load = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) { setNote("That isn't a picture."); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = canvas.current;
      if (!c) return;
      const scale = Math.min(1, MAX_W / img.width);
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      original.current = img;
      URL.revokeObjectURL(url);
      setHas(true);
      setNote("Draw on the picture with your finger to circle what you don't like.");
      publish();
    };
    img.onerror = () => { URL.revokeObjectURL(url); setNote("I couldn't open that picture."); };
    img.src = url;
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!has) return;
    drawing.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const ctx = canvas.current!.getContext("2d")!;
    const p = pos(e);
    ctx.strokeStyle = "#e11d48"; ctx.lineWidth = Math.max(4, canvas.current!.width / 120); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const up = () => { if (drawing.current) { drawing.current = false; publish(); } };
  const clearMarks = () => {
    const c = canvas.current; const img = original.current;
    if (!c || !img) return;
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    publish();
  };
  const remove = () => {
    const c = canvas.current;
    if (c) { c.getContext("2d")?.clearRect(0, 0, c.width, c.height); c.width = 1; c.height = 1; }
    original.current = null; setHas(false); setNote(""); onChange("");
  };

  return (
    <div className="fc-shot" data-hpd-smoke="fc-ask-shot">
      <label className="fc-shot-pick">
        📷 Add a picture of the app
        <input type="file" accept="image/*" data-hpd-smoke="fc-ask-shot-file" style={{ display: "none" }} onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <canvas ref={canvas} data-hpd-smoke="fc-ask-shot-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ display: has ? "block" : "none", width: "100%", maxHeight: "60vh", objectFit: "contain", touchAction: "none", border: "2px solid #e11d48", borderRadius: 8, marginTop: 8, background: "#fff" }} />
      {has ? <div className="fc-shot-tools"><button type="button" onClick={clearMarks} data-hpd-smoke="fc-ask-shot-clear">↩ Clear my marks</button> <button type="button" onClick={remove} data-hpd-smoke="fc-ask-shot-remove">✕ Remove picture</button></div> : null}
      {note ? <small className="fc-follow-note">{note}</small> : null}
      {has ? <small className="fc-follow-note">The picture is saved with your request; leave out tenant names and phone numbers.</small> : null}
    </div>
  );
}
