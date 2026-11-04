// 🎨 Dress the helper (owner's pick, 3 Nov): its color and a hat, kept on this phone. Every face in the app follows
// (the 🤖 button, the chat, the little robot riding along on the route).
import { useEffect, useState } from "react";

export type HelperColor = "purple" | "blue" | "green" | "orange";
export type HelperHat = "none" | "hardhat" | "cap";
export type HelperLook = { color: HelperColor; hat: HelperHat };

export const HELPER_COLORS: Record<HelperColor, { face: string; line: string; ear: string; label: string }> = {
  purple: { face: "#ede9fe", line: "#7c3aed", ear: "#a78bfa", label: "Purple" },
  blue: { face: "#dbeafe", line: "#2563eb", ear: "#60a5fa", label: "Blue" },
  green: { face: "#dcfce7", line: "#16a34a", ear: "#4ade80", label: "Green" },
  orange: { face: "#ffedd5", line: "#ea580c", ear: "#fb923c", label: "Orange" },
};
export const HELPER_HATS: Record<HelperHat, string> = { none: "No hat", hardhat: "⛑ Hard hat", cap: "🧢 Cap" };

const KEY = "hpd-helper-look";
const EVENT = "hpd-helper-look";
const DEFAULT: HelperLook = { color: "purple", hat: "none" };

export function getHelperLook(): HelperLook {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return { color: v?.color in HELPER_COLORS ? v.color : DEFAULT.color, hat: v?.hat in HELPER_HATS ? v.hat : DEFAULT.hat };
  } catch { return DEFAULT; }
}

export function setHelperLook(patch: Partial<HelperLook>) {
  const next = { ...getHelperLook(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVENT));
  return next;
}

export function useHelperLook() {
  const [look, setLook] = useState<HelperLook>(DEFAULT);
  useEffect(() => {
    const on = () => setLook(getHelperLook());
    on();
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return look;
}
