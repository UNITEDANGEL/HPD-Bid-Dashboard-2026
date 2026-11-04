"use client";

import { useEffect, useRef, useState } from "react";
import { HELPER_COLORS, useHelperLook } from "../../lib/helper-look";

// 🤖 The helper's face (owner, 3 Nov: "the bot should look real: blink, move around, and when it's talking to me it
// should have a talking thing"). One small drawing: the eyes blink, the head tilts while it works, the mouth moves while
// it talks, the ears glow while it listens; it smiles when something good happens and worries over an overdue notice;
// it naps at night and stretches when it wakes up. Its color and hat are the owner's pick (lib/helper-look).
// Moves are CSS (field-command.css .fc-face), off with "reduce motion".
export type FaceMode = "idle" | "working" | "listening" | "talking" | "ask" | "off" | "happy" | "worried" | "sleep";

// look: where the eyes look, -1..1 each way (👀 they follow your finger on the map).
export default function HelperFace({ mode = "idle", size = 34, className = "", look }: { mode?: FaceMode; size?: number; className?: string; look?: { x: number; y: number } | null }) {
  const dress = useHelperLook();
  const c = HELPER_COLORS[dress.color];
  // Waking up: a stretch for a moment after a nap.
  const prev = useRef(mode);
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    if (prev.current === "sleep" && mode !== "sleep") { setWaking(true); const t = window.setTimeout(() => setWaking(false), 1400); prev.current = mode; return () => window.clearTimeout(t); }
    prev.current = mode;
  }, [mode]);
  return (
    <svg className={`fc-face is-${mode}${waking ? " is-waking" : ""}${className ? ` ${className}` : ""}`} data-hpd-smoke="fc-face" data-mode={mode} data-color={dress.color} data-hat={dress.hat} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <g className="fc-face-head">
        {dress.hat === "none" ? <>
          <line x1="24" y1="4" x2="24" y2="10" stroke="#c4b5fd" strokeWidth="2.5" strokeLinecap="round" />
          <circle className="fc-face-antenna" cx="24" cy="4" r="3" fill="#22d3ee" />
        </> : null}
        <rect className="fc-face-ear" x="3" y="20" width="5" height="11" rx="2.5" fill={c.ear} />
        <rect className="fc-face-ear" x="40" y="20" width="5" height="11" rx="2.5" fill={c.ear} />
        <rect x="7" y="10" width="34" height="30" rx="11" fill={c.face} stroke={c.line} strokeWidth="2.5" />
        <rect x="11" y="15" width="26" height="15" rx="7" fill="#1e1b4b" />
        <g className="fc-face-look" style={look ? { transform: `translate(${(look.x * 3).toFixed(1)}px, ${(look.y * 2.2).toFixed(1)}px)` } : undefined}>
          <g className="fc-face-eyes">
            <ellipse cx="18.5" cy="22.5" rx="3" ry="3.4" fill="#67e8f9" />
            <ellipse cx="29.5" cy="22.5" rx="3" ry="3.4" fill="#67e8f9" />
          </g>
        </g>
        <g className="fc-face-brows" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round">
          <line x1="14.5" y1="19" x2="21" y2="16.8" />
          <line x1="33.5" y1="19" x2="27" y2="16.8" />
        </g>
        <rect className="fc-face-mouth" x="19" y="33" width="10" height="3" rx="1.5" fill={c.line} />
        <path className="fc-face-smile" d="M17.5 32.5 Q24 39 30.5 32.5" stroke={c.line} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        {dress.hat === "hardhat" ? <g className="fc-face-hat">
          <path d="M9.5 12.5 Q24 -3 38.5 12.5 Z" fill="#facc15" stroke="#ca8a04" strokeWidth="1.5" />
          <rect x="22.5" y="2.5" width="3" height="10" rx="1.5" fill="#eab308" />
          <rect x="5" y="11.5" width="38" height="3.6" rx="1.8" fill="#eab308" stroke="#ca8a04" strokeWidth="1" />
        </g> : dress.hat === "cap" ? <g className="fc-face-hat">
          <path d="M10 12.5 Q24 0 38 12.5 Z" fill="#1d4ed8" stroke="#1e3a8a" strokeWidth="1.5" />
          <path d="M30 11.5 L46 13 L45 16 L30 14.5 Z" fill="#1e40af" />
          <circle cx="24" cy="3.6" r="1.6" fill="#93c5fd" />
        </g> : null}
        <text className="fc-face-zzz" x="36" y="10" fontSize="9" fontWeight="900" fill="#a5b4fc">z</text>
      </g>
    </svg>
  );
}

// The same face as plain HTML, for a map marker (Leaflet draws markers from HTML, not React).
export function helperFaceHtml(color = "purple", size = 30) {
  const c = HELPER_COLORS[(color in HELPER_COLORS ? color : "purple") as keyof typeof HELPER_COLORS];
  return `<svg class="fc-face is-working" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true"><g class="fc-face-head"><line x1="24" y1="4" x2="24" y2="10" stroke="#c4b5fd" stroke-width="2.5" stroke-linecap="round"/><circle class="fc-face-antenna" cx="24" cy="4" r="3" fill="#22d3ee"/><rect x="3" y="20" width="5" height="11" rx="2.5" fill="${c.ear}"/><rect x="40" y="20" width="5" height="11" rx="2.5" fill="${c.ear}"/><rect x="7" y="10" width="34" height="30" rx="11" fill="${c.face}" stroke="${c.line}" stroke-width="2.5"/><rect x="11" y="15" width="26" height="15" rx="7" fill="#1e1b4b"/><g class="fc-face-eyes"><ellipse cx="18.5" cy="22.5" rx="3" ry="3.4" fill="#67e8f9"/><ellipse cx="29.5" cy="22.5" rx="3" ry="3.4" fill="#67e8f9"/></g><rect x="19" y="33" width="10" height="3" rx="1.5" fill="${c.line}"/></g></svg>`;
}
