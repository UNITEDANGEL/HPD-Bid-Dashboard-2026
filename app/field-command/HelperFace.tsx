"use client";

// 🤖 The helper's face (owner, 3 Nov: "the bot should look real: blink, move around, and when it's talking to me it
// should have a talking thing"). One small drawing: the eyes blink, the head tilts while it works, the mouth moves while
// it talks, the ears glow while it listens; it smiles when something good happens and worries over an overdue notice.
// Moves are CSS (field-command.css .fc-face), off with "reduce motion".
export type FaceMode = "idle" | "working" | "listening" | "talking" | "ask" | "off" | "happy" | "worried";

// look: where the eyes look, -1..1 each way (👀 they follow your finger on the map).
export default function HelperFace({ mode = "idle", size = 34, className = "", look }: { mode?: FaceMode; size?: number; className?: string; look?: { x: number; y: number } | null }) {
  return (
    <svg className={`fc-face is-${mode}${className ? ` ${className}` : ""}`} data-hpd-smoke="fc-face" data-mode={mode} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <g className="fc-face-head">
        <line x1="24" y1="4" x2="24" y2="10" stroke="#c4b5fd" strokeWidth="2.5" strokeLinecap="round" />
        <circle className="fc-face-antenna" cx="24" cy="4" r="3" fill="#22d3ee" />
        <rect className="fc-face-ear" x="3" y="20" width="5" height="11" rx="2.5" fill="#a78bfa" />
        <rect className="fc-face-ear" x="40" y="20" width="5" height="11" rx="2.5" fill="#a78bfa" />
        <rect x="7" y="10" width="34" height="30" rx="11" fill="#ede9fe" stroke="#7c3aed" strokeWidth="2.5" />
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
        <rect className="fc-face-mouth" x="19" y="33" width="10" height="3" rx="1.5" fill="#7c3aed" />
        <path className="fc-face-smile" d="M17.5 32.5 Q24 39 30.5 32.5" stroke="#7c3aed" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
