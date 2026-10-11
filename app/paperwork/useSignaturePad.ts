"use client";

import { useCallback, useRef } from "react";
import { trimCanvas } from "../../lib/signature";

// Shared finger/pen pad for the signer's and the notary's cards. Strokes are smoothed with
// curves through the midpoints of the touch samples and get thinner when moving fast, so a
// finger signature looks like pen ink instead of jagged straight segments. A pen's pressure is
// used when the device reports it.

const INK = "#0b1f4d";
const MIN_WIDTH = 1.4;
const MAX_WIDTH = 3.6;

type Sample = { x: number; y: number; t: number; width: number };

export function useSignaturePad() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const last = useRef<Sample | null>(null);
  const mid = useRef<{ x: number; y: number } | null>(null);
  const inked = useRef(false);

  // Sizes the canvas to its on-screen box at device resolution and wipes it.
  const reset = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    const context = canvas.getContext("2d")!;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = INK;
    context.fillStyle = INK;
    inked.current = false;
    last.current = null;
    mid.current = null;
  }, []);

  // Callback ref: sets the canvas up the moment it mounts.
  const attach = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    if (canvas) reset();
  }, [reset]);

  function sample(event: PointerEvent | React.PointerEvent<HTMLCanvasElement>, previous: Sample | null): Sample {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const t = event.timeStamp;
    let width = (MIN_WIDTH + MAX_WIDTH) / 2;
    if (event.pointerType === "pen" && event.pressure > 0) {
      width = MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * event.pressure;
    } else if (previous) {
      const speed = Math.hypot(x - previous.x, y - previous.y) / Math.max(1, t - previous.t);
      const target = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, MAX_WIDTH - speed * 1.1));
      width = previous.width * 0.7 + target * 0.3;
    }
    return { x, y, t, width };
  }

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== Math.round(canvas.clientWidth * Math.max(2, window.devicePixelRatio || 1)) && !inked.current) reset();
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const start = sample(event, null);
    last.current = start;
    mid.current = { x: start.x, y: start.y };
    // A tap leaves a dot (for the i and the period after an initial).
    const context = canvas.getContext("2d")!;
    context.beginPath();
    context.arc(start.x, start.y, start.width / 2, 0, Math.PI * 2);
    context.fill();
    inked.current = true;
  }, [reset]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !last.current || !mid.current) return;
    const context = canvas.getContext("2d")!;
    const native = event.nativeEvent;
    const events = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    for (const item of events.length ? events : [native]) {
      const previous = last.current;
      const next = sample(item, previous);
      if (Math.hypot(next.x - previous.x, next.y - previous.y) < 0.8) continue;
      const nextMid = { x: (previous.x + next.x) / 2, y: (previous.y + next.y) / 2 };
      context.beginPath();
      context.lineWidth = next.width;
      context.moveTo(mid.current.x, mid.current.y);
      context.quadraticCurveTo(previous.x, previous.y, nextMid.x, nextMid.y);
      context.stroke();
      last.current = next;
      mid.current = nextMid;
    }
  }, []);

  const onPointerUp = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas && last.current && mid.current) {
      const context = canvas.getContext("2d")!;
      context.beginPath();
      context.lineWidth = last.current.width;
      context.moveTo(mid.current.x, mid.current.y);
      context.lineTo(last.current.x, last.current.y);
      context.stroke();
    }
    last.current = null;
    mid.current = null;
  }, []);

  // The signature trimmed to its ink as a PNG data URL, or "" when nothing was drawn.
  const capture = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !inked.current) return "";
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        if (pixels[(y * canvas.width + x) * 4 + 3] > 0) {
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
    }
    return maxX < 0 ? "" : trimCanvas(canvas, minX, minY, maxX + 2, maxY + 2);
  }, []);

  const padProps = { ref: attach, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
  return { padProps, capture, clear: reset };
}

// "JOTJAGRAJ SINGH" -> "Jotjagraj Singh" for button labels.
export function displayName(name: string) {
  const raw = name.trim();
  return raw === raw.toUpperCase() ? raw.toLowerCase().replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()) : raw;
}
