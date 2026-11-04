"use client";

import { useEffect, useRef, useState } from "react";
import { HELPER_COLORS, useHelperLook, type HelperHat, type HelperOutfit } from "../../lib/helper-look";

// 🤖 The helper's face (owner, 3 Nov: "the bot should look real: blink, move around, and when it's talking to me it
// should have a talking thing"). One small drawing: the eyes blink, the head tilts while it works, the mouth moves while
// it talks, the ears glow while it listens; it smiles when something good happens and worries over an overdue notice;
// it naps at night and stretches when it wakes up. Its color and hat are the owner's pick (lib/helper-look).
// Moves are CSS (field-command.css .fc-face), off with "reduce motion".
export type FaceMode = "idle" | "working" | "listening" | "talking" | "ask" | "off" | "happy" | "worried" | "sleep";

// look: where the eyes look, -1..1 each way (👀 they follow your finger on the map).
// outfit: what it wears right now (lib/helper-look robotOutfit); arms: 👋 wave, 👉 point, 👍 thumbs up; hat: a hat for
// the moment (⛑ at a job site) over the owner's pick.
export type HelperArms = "wave" | "point" | "thumbs" | "";
export default function HelperFace({ mode = "idle", size = 34, className = "", look, outfit = "", arms = "", hat }: { mode?: FaceMode; size?: number; className?: string; look?: { x: number; y: number } | null; outfit?: HelperOutfit; arms?: HelperArms; hat?: HelperHat }) {
  const picked = useHelperLook();
  const dress = { ...picked, hat: outfit === "party" || outfit === "pajamas" ? ("none" as HelperHat) : hat || picked.hat };
  const c = HELPER_COLORS[dress.color];
  // Waking up: a stretch for a moment after a nap.
  const prev = useRef(mode);
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    if (prev.current === "sleep" && mode !== "sleep") { setWaking(true); const t = window.setTimeout(() => setWaking(false), 1400); prev.current = mode; return () => window.clearTimeout(t); }
    prev.current = mode;
  }, [mode]);
  return (
    <svg className={`fc-face is-${mode}${waking ? " is-waking" : ""}${className ? ` ${className}` : ""}`} data-hpd-smoke="fc-face" data-mode={mode} data-color={dress.color} data-hat={dress.hat} data-outfit={outfit || undefined} data-arms={arms || undefined} width={size} height={size} viewBox="0 0 48 48" overflow="visible" aria-hidden="true">
      {arms ? <g className={`fc-face-arms is-${arms}`} stroke={c.line} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path className="fc-arm-l" d="M4 30 Q-2 34 -1 40" />
        {arms === "wave" ? <g className="fc-arm-r"><path d="M44 28 Q50 22 50 14" /><circle cx="50" cy="12" r="2.8" fill={c.ear} stroke="none" /></g>
          : arms === "point" ? <g className="fc-arm-r"><path d="M44 28 L54 26" /><path d="M54 26 l3 -1" strokeWidth="2" /></g>
          : <g className="fc-arm-r"><path d="M44 30 Q50 30 50 24" /><text x="45" y="22" fontSize="10" stroke="none">👍</text></g>}
      </g> : null}
      <g className="fc-face-head">
        {dress.hat === "none" && outfit !== "party" && outfit !== "pajamas" ? <>
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
        {outfit === "sunglasses" ? <g className="fc-face-outfit" data-hpd-smoke="fc-face-outfit"><rect x="12" y="19" width="10.5" height="7" rx="3" fill="#0f172a" /><rect x="25.5" y="19" width="10.5" height="7" rx="3" fill="#0f172a" /><line x1="22" y1="21.5" x2="26" y2="21.5" stroke="#0f172a" strokeWidth="1.6" /></g> : null}
        {outfit === "scarf" ? <g className="fc-face-outfit" data-hpd-smoke="fc-face-outfit"><rect x="8" y="37" width="32" height="6" rx="3" fill="#dc2626" /><rect x="28" y="40" width="6" height="9" rx="2" fill="#b91c1c" /></g> : null}
        {outfit === "party" ? <g className="fc-face-outfit" data-hpd-smoke="fc-face-outfit"><path d="M17 11 L24 -6 L31 11 Z" fill="#f472b6" stroke="#be185d" strokeWidth="1.2" /><circle cx="24" cy="-6" r="2.6" fill="#facc15" /><circle cx="21.5" cy="5" r="1.2" fill="#fff" /><circle cx="26" cy="1" r="1.2" fill="#fff" /></g> : null}
        {outfit === "pajamas" ? <g className="fc-face-outfit" data-hpd-smoke="fc-face-outfit"><path d="M10 12 Q22 -4 36 6 Q40 10 44 16 L40 17 Q36 12 34 12 Z" fill="#3b82f6" stroke="#1e40af" strokeWidth="1.2" /><circle cx="43" cy="17" r="2.6" fill="#fff" /></g> : null}
        <text className="fc-face-zzz" x="36" y="10" fontSize="9" fontWeight="900" fill="#a5b4fc">z</text>
      </g>
      {outfit === "umbrella" ? <g className="fc-face-outfit fc-face-umbrella" data-hpd-smoke="fc-face-outfit"><path d="M30 2 Q42 -10 54 2 Z" fill="#0ea5e9" stroke="#0369a1" strokeWidth="1.2" /><path d="M42 2 L42 16 Q42 19 39.5 19" stroke="#334155" strokeWidth="1.8" fill="none" strokeLinecap="round" /></g> : null}
    </svg>
  );
}

// The same face as plain HTML, for a map marker (Leaflet draws markers from HTML, not React).
export function helperFaceHtml(color = "purple", size = 30) {
  const c = HELPER_COLORS[(color in HELPER_COLORS ? color : "purple") as keyof typeof HELPER_COLORS];
  return `<svg class="fc-face is-working" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true"><g class="fc-face-head"><line x1="24" y1="4" x2="24" y2="10" stroke="#c4b5fd" stroke-width="2.5" stroke-linecap="round"/><circle class="fc-face-antenna" cx="24" cy="4" r="3" fill="#22d3ee"/><rect x="3" y="20" width="5" height="11" rx="2.5" fill="${c.ear}"/><rect x="40" y="20" width="5" height="11" rx="2.5" fill="${c.ear}"/><rect x="7" y="10" width="34" height="30" rx="11" fill="${c.face}" stroke="${c.line}" stroke-width="2.5"/><rect x="11" y="15" width="26" height="15" rx="7" fill="#1e1b4b"/><g class="fc-face-eyes"><ellipse cx="18.5" cy="22.5" rx="3" ry="3.4" fill="#67e8f9"/><ellipse cx="29.5" cy="22.5" rx="3" ry="3.4" fill="#67e8f9"/></g><rect x="19" y="33" width="10" height="3" rx="1.5" fill="${c.line}"/></g></svg>`;
}
