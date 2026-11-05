"use client";

import { useEffect, useRef, useState } from "react";
import { HELPER_COLORS, HELPER_HAIRS, HELPER_SKINS, useHelperLook, type HelperHat, type HelperOutfit } from "../../lib/helper-look";
import { SPEAK_WORD_EVENT, visemesOf, type Viseme } from "../../lib/speak";

// 🧑 The helper (owner, 3 Nov: "the bot should look real: blink, move around, a talking thing"; 4 Nov: "the mouth, hands
// and everything. I want it to look like a whole person, not a robot"): a person, head and shoulders, in a work shirt
// of the owner's color, with the skin and hair the owner picks (🎨). The eyes blink and follow your finger, the mouth
// opens and closes while it talks, the ears perk up while it listens, the head tilts while it thinks; it smiles at good
// news, frowns over an overdue notice, naps at night and stretches when it wakes up; its hands wave, point and give a
// thumbs up. Moves are CSS (field-command.css .fc-face), off with "reduce motion".
// proud: after a win today (chin up, a smile); focused: at a job (brows down a little, eyes steady).
export type FaceMode = "idle" | "working" | "listening" | "talking" | "ask" | "off" | "happy" | "worried" | "sleep" | "proud" | "focused";

// look: where the eyes look, -1..1 each way (👀 they follow your finger on the map).
// outfit: what it wears right now (lib/helper-look robotOutfit); arms: 👋 wave, 👉 point, 👍 thumbs up; hat: a hat for
// the moment (⛑ at a job site) over the owner's pick.
export type HelperArms = "wave" | "point" | "thumbs" | "";

// A hand: palm and four fingers (open), or a fist with the index finger out (point) or the thumb up.
function Hand({ kind, skin, shade }: { kind: "open" | "point" | "thumb"; skin: string; shade: string }) {
  if (kind === "open") return (
    <g className="fc-hand">
      {[-3.2, -1.1, 1.1, 3.2].map((x, i) => <rect key={i} x={x - 0.9} y={-6.8 + Math.abs(x) * 0.35} width="1.8" height="5" rx="0.9" fill={skin} stroke={shade} strokeWidth="0.4" />)}
      <rect x="4" y="-2.4" width="1.7" height="4" rx="0.85" fill={skin} stroke={shade} strokeWidth="0.4" transform="rotate(35 4.8 -0.4)" />
      <ellipse cx="0" cy="0" rx="4.2" ry="3.6" fill={skin} stroke={shade} strokeWidth="0.5" />
    </g>
  );
  if (kind === "point") return (
    <g className="fc-hand">
      <rect x="2" y="-1.2" width="6.5" height="2" rx="1" fill={skin} stroke={shade} strokeWidth="0.4" />
      <ellipse cx="0" cy="0.4" rx="3.4" ry="3" fill={skin} stroke={shade} strokeWidth="0.5" />
    </g>
  );
  return (
    <g className="fc-hand">
      <rect x="-1" y="-7" width="2" height="5.2" rx="1" fill={skin} stroke={shade} strokeWidth="0.4" />
      <rect x="-3.6" y="-2.6" width="7.2" height="6" rx="2.6" fill={skin} stroke={shade} strokeWidth="0.5" />
      <path d="M-2.6 -0.4 H2.6 M-2.6 1.4 H2.6" stroke={shade} strokeWidth="0.45" />
    </g>
  );
}

export default function HelperFace({ mode = "idle", size = 34, className = "", look, outfit = "", arms = "", hat }: { mode?: FaceMode; size?: number; className?: string; look?: { x: number; y: number } | null; outfit?: HelperOutfit; arms?: HelperArms; hat?: HelperHat }) {
  const picked = useHelperLook();
  const dress = { ...picked, hat: outfit === "party" || outfit === "pajamas" ? ("none" as HelperHat) : hat || picked.hat };
  const shirt = HELPER_COLORS[dress.color];
  const { skin, shade } = HELPER_SKINS[dress.skin] || HELPER_SKINS.medium;
  const hair = (HELPER_HAIRS[dress.hair] || HELPER_HAIRS.black).hair;
  // Waking up: a stretch for a moment after a nap.
  const prev = useRef(mode);
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    if (prev.current === "sleep" && mode !== "sleep") { setWaking(true); const t = window.setTimeout(() => setWaking(false), 1400); prev.current = mode; return () => window.clearTimeout(t); }
    prev.current = mode;
  }, [mode]);
  // 👄 The mouth follows the words while it talks (word events from lib/speak); with none (some phones), the
  // steady talking motion stays.
  const [viseme, setViseme] = useState<Viseme | "">("");
  useEffect(() => {
    if (mode !== "talking") { setViseme(""); return; }
    const timers: number[] = [];
    let quiet = 0;
    const on = (e: Event) => {
      const word = String((e as CustomEvent<{ word?: string }>).detail?.word || "");
      timers.splice(0).forEach((t) => window.clearTimeout(t));
      const shapes = visemesOf(word);
      shapes.forEach((v, i) => timers.push(window.setTimeout(() => setViseme(v), i * 90)));
      window.clearTimeout(quiet);
      quiet = window.setTimeout(() => setViseme(""), 900);
    };
    window.addEventListener(SPEAK_WORD_EVENT, on);
    return () => { window.removeEventListener(SPEAK_WORD_EVENT, on); timers.forEach((t) => window.clearTimeout(t)); window.clearTimeout(quiet); };
  }, [mode]);
  const eyeShift = look ? { transform: `translate(${(look.x * 1.1).toFixed(2)}px, ${(look.y * 0.8).toFixed(2)}px)` } : undefined;
  return (
    <svg className={`fc-face is-human is-${mode}${waking ? " is-waking" : ""}${className ? ` ${className}` : ""}`} data-hpd-smoke="fc-face" data-mode={mode} data-color={dress.color} data-skin={dress.skin} data-hair={dress.hair} data-hat={dress.hat} data-outfit={outfit || undefined} data-arms={arms || undefined} data-viseme={viseme || undefined} width={size} height={size} viewBox="0 0 48 48" overflow="visible" aria-hidden="true">
      {/* Shoulders in a work shirt (the owner's color), the neck. */}
      <path d="M3 49 Q3.5 38.5 14.5 36.2 L33.5 36.2 Q44.5 38.5 45 49 Z" fill={shirt.line} />
      <path d="M18.5 36.2 L24 43 L29.5 36.2 Z" fill={shirt.face} />
      <path d="M16 36.6 L24 43 M32 36.6 L24 43" stroke={shirt.ear} strokeWidth="1.2" strokeLinecap="round" />
      <rect x="20.4" y="29.5" width="7.2" height="8" rx="3" fill={shade} />
      {outfit === "scarf" ? <g className="fc-face-outfit" data-hpd-smoke="fc-face-outfit"><rect x="14.5" y="33" width="19" height="5" rx="2.5" fill="#dc2626" /><rect x="27" y="35.5" width="5" height="9" rx="2" fill="#b91c1c" /></g> : null}
      <g className="fc-face-head">
        {/* Ears (they perk up while it listens). */}
        <ellipse className="fc-face-ear" cx="12.7" cy="21.5" rx="2.1" ry="3.1" fill={skin} stroke={shade} strokeWidth="0.6" />
        <ellipse className="fc-face-ear" cx="35.3" cy="21.5" rx="2.1" ry="3.1" fill={skin} stroke={shade} strokeWidth="0.6" />
        {/* The face, then the hair over it. */}
        <ellipse cx="24" cy="21" rx="11" ry="12.6" fill={skin} />
        <path d="M24 33.4 Q30.5 33.2 33.6 27.5 Q31.5 32 24 32.6 Q16.5 32 14.4 27.5 Q17.5 33.2 24 33.4 Z" fill={shade} opacity="0.35" />
        {dress.hat === "none" || outfit === "party" || outfit === "pajamas"
          ? <path d="M12.7 20 Q11.4 7.4 24 6.6 Q36.6 7.4 35.3 20 Q34.4 13.6 29.6 12.4 Q25.5 14.4 19.4 12.9 Q14.6 13.4 12.7 20 Z" fill={hair} />
          : <path d="M12.9 19.5 Q12.6 14.5 14.5 13.5 L33.5 13.5 Q35.4 14.5 35.1 19.5 Q33.8 15.6 30 15.3 L18 15.3 Q14.2 15.6 12.9 19.5 Z" fill={hair} />}
        {/* Eyebrows, eyes (blink; they follow your finger), nose, cheeks. */}
        <g className="fc-face-browline" stroke={hair} strokeWidth="1.25" strokeLinecap="round" fill="none">
          <path d="M16.6 16.9 Q19 15.6 21.6 16.6" />
          <path d="M26.4 16.6 Q29 15.6 31.4 16.9" />
        </g>
        <g className="fc-face-eyes">
          <ellipse cx="19.2" cy="20.4" rx="2.5" ry="1.8" fill="#fff" />
          <ellipse cx="28.8" cy="20.4" rx="2.5" ry="1.8" fill="#fff" />
          <g className="fc-face-look" style={eyeShift}>
            <circle cx="19.2" cy="20.5" r="1.3" fill="#4a3424" />
            <circle cx="28.8" cy="20.5" r="1.3" fill="#4a3424" />
            <circle cx="19.2" cy="20.5" r="0.6" fill="#0b0b0b" />
            <circle cx="28.8" cy="20.5" r="0.6" fill="#0b0b0b" />
            <circle cx="19.7" cy="20" r="0.35" fill="#fff" />
            <circle cx="29.3" cy="20" r="0.35" fill="#fff" />
          </g>
          <path d="M16.6 19.6 Q19.2 17.9 21.8 19.6 M26.2 19.6 Q28.8 17.9 31.4 19.6" stroke={shade} strokeWidth="0.6" fill="none" />
        </g>
        <path d="M24.2 21.4 Q23 24.6 24.9 25.3" stroke={shade} strokeWidth="1" fill="none" strokeLinecap="round" />
        <circle cx="17.4" cy="25.2" r="2" fill="#f87171" opacity="0.18" />
        <circle cx="30.6" cy="25.2" r="2" fill="#f87171" opacity="0.18" />
        {/* The mouth: lips at rest, an opening that moves while it talks, a big smile for good news. */}
        <path className="fc-face-lips" d="M20.9 28.1 Q24 30.2 27.1 28.1" stroke="#a6463f" strokeWidth="1.15" fill="none" strokeLinecap="round" />
        <ellipse className="fc-face-mouth" cx="24" cy="28.7" rx="2.5" ry="0.85" fill="#6b1d1d" />
        <path className="fc-face-smile" d="M19.6 27.3 Q24 32.6 28.4 27.3 Z" fill="#6b1d1d" stroke="#a6463f" strokeWidth="0.8" strokeLinejoin="round" />
        <g className="fc-face-brows" stroke={hair} strokeWidth="1.3" strokeLinecap="round">
          <line x1="16.8" y1="16.2" x2="21.4" y2="17.6" />
          <line x1="31.2" y1="16.2" x2="26.6" y2="17.6" />
        </g>
        {dress.hat === "hardhat" ? <g className="fc-face-hat">
          <path d="M11.8 15.6 Q24 0.5 36.2 15.6 Z" fill="#facc15" stroke="#ca8a04" strokeWidth="1.2" />
          <rect x="22.5" y="5" width="3" height="10" rx="1.5" fill="#eab308" />
          <rect x="8.5" y="14.2" width="31" height="3.2" rx="1.6" fill="#eab308" stroke="#ca8a04" strokeWidth="0.8" />
        </g> : dress.hat === "cap" ? <g className="fc-face-hat">
          <path d="M12.2 15.6 Q24 3 35.8 15.6 Z" fill="#1d4ed8" stroke="#1e3a8a" strokeWidth="1.2" />
          <path d="M28 14.4 L42 15.6 L41 18 L28 16.8 Z" fill="#1e40af" />
          <circle cx="24" cy="6.6" r="1.4" fill="#93c5fd" />
        </g> : null}
        {outfit === "sunglasses" ? <g className="fc-face-outfit" data-hpd-smoke="fc-face-outfit"><rect x="15.6" y="18.3" width="7.4" height="4.6" rx="2" fill="#0f172a" /><rect x="25" y="18.3" width="7.4" height="4.6" rx="2" fill="#0f172a" /><line x1="23" y1="19.6" x2="25" y2="19.6" stroke="#0f172a" strokeWidth="1.2" /></g> : null}
        {outfit === "party" ? <g className="fc-face-outfit" data-hpd-smoke="fc-face-outfit"><path d="M18 9.5 L24 -7 L30 9.5 Z" fill="#f472b6" stroke="#be185d" strokeWidth="1" /><circle cx="24" cy="-7" r="2.4" fill="#facc15" /><circle cx="22" cy="3.5" r="1.1" fill="#fff" /><circle cx="26" cy="0" r="1.1" fill="#fff" /></g> : null}
        {outfit === "pajamas" ? <g className="fc-face-outfit" data-hpd-smoke="fc-face-outfit"><path d="M12.4 13 Q22 -2 35 6 Q39 9 42 15 L38.5 16 Q35 11.5 33 12 Q24 8 12.4 13 Z" fill="#3b82f6" stroke="#1e40af" strokeWidth="1" /><circle cx="41.5" cy="16" r="2.4" fill="#fff" /></g> : null}
        <text className="fc-face-zzz" x="36" y="9" fontSize="9" fontWeight="900" fill="#a5b4fc">z</text>
      </g>
      {/* Hands: 👋 a wave by the head, 👉 pointing, 👍 a thumbs up; the sleeve in the shirt color. */}
      {arms ? <g className={`fc-face-arms is-${arms}`} data-hpd-smoke="fc-face-hands">
        <g className="fc-arm-r">
          {arms === "wave" ? <>
            <path d="M40 40 Q44.5 34 45 27.5" stroke={shirt.line} strokeWidth="5" strokeLinecap="round" fill="none" />
            <g transform="translate(45 24.5) rotate(12)"><Hand kind="open" skin={skin} shade={shade} /></g>
          </> : arms === "point" ? <>
            <path d="M40 40 Q46 37 49 33" stroke={shirt.line} strokeWidth="5" strokeLinecap="round" fill="none" />
            <g transform="translate(51 32) rotate(-22)"><Hand kind="point" skin={skin} shade={shade} /></g>
          </> : <>
            <path d="M40 41 Q45.5 39 46 33.5" stroke={shirt.line} strokeWidth="5" strokeLinecap="round" fill="none" />
            <g transform="translate(46 30)"><Hand kind="thumb" skin={skin} shade={shade} /></g>
          </>}
        </g>
      </g> : null}
      {outfit === "umbrella" ? <g className="fc-face-outfit fc-face-umbrella" data-hpd-smoke="fc-face-outfit"><path d="M30 2 Q42 -10 54 2 Z" fill="#0ea5e9" stroke="#0369a1" strokeWidth="1.2" /><path d="M42 2 L42 16 Q42 19 39.5 19" stroke="#334155" strokeWidth="1.8" fill="none" strokeLinecap="round" /></g> : null}
    </svg>
  );
}

// The same person as plain HTML, for a map marker (Leaflet draws markers from HTML, not React).
export function helperFaceHtml(color = "purple", size = 30, skinKey = "medium", hairKey = "black") {
  const c = HELPER_COLORS[(color in HELPER_COLORS ? color : "purple") as keyof typeof HELPER_COLORS];
  const { skin, shade } = HELPER_SKINS[(skinKey in HELPER_SKINS ? skinKey : "medium") as keyof typeof HELPER_SKINS];
  const hair = HELPER_HAIRS[(hairKey in HELPER_HAIRS ? hairKey : "black") as keyof typeof HELPER_HAIRS].hair;
  return `<svg class="fc-face is-human is-working" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true"><path d="M3 49 Q3.5 38.5 14.5 36.2 L33.5 36.2 Q44.5 38.5 45 49 Z" fill="${c.line}"/><path d="M18.5 36.2 L24 43 L29.5 36.2 Z" fill="${c.face}"/><rect x="20.4" y="29.5" width="7.2" height="8" rx="3" fill="${shade}"/><g class="fc-face-head"><ellipse cx="12.7" cy="21.5" rx="2.1" ry="3.1" fill="${skin}"/><ellipse cx="35.3" cy="21.5" rx="2.1" ry="3.1" fill="${skin}"/><ellipse cx="24" cy="21" rx="11" ry="12.6" fill="${skin}"/><path d="M12.7 20 Q11.4 7.4 24 6.6 Q36.6 7.4 35.3 20 Q34.4 13.6 29.6 12.4 Q25.5 14.4 19.4 12.9 Q14.6 13.4 12.7 20 Z" fill="${hair}"/><g class="fc-face-eyes"><ellipse cx="19.2" cy="20.4" rx="2.5" ry="1.8" fill="#fff"/><ellipse cx="28.8" cy="20.4" rx="2.5" ry="1.8" fill="#fff"/><circle cx="19.2" cy="20.5" r="1.3" fill="#4a3424"/><circle cx="28.8" cy="20.5" r="1.3" fill="#4a3424"/></g><path d="M20.9 28.1 Q24 30.2 27.1 28.1" stroke="#a6463f" stroke-width="1.15" fill="none" stroke-linecap="round"/></g></svg>`;
}
