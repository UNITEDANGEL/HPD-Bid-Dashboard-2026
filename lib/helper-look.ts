// 🎨 Dress the helper (owner's pick, 3 Nov): its color and a hat, kept on this phone. Every face in the app follows
// (the 🤖 button, the chat, the little robot riding along on the route).
import { useEffect, useState } from "react";

export type HelperColor = "purple" | "blue" | "green" | "orange";
export type HelperHat = "none" | "hardhat" | "cap";
export type HelperSkin = "light" | "medium" | "tan" | "brown" | "dark";
export type HelperHair = "black" | "brown" | "blond" | "gray";
// color = the shirt now (owner, 4 Nov: "I want it to look like a whole person, not a robot"); skin and hair are picks too.
// name: what the owner calls the helper (🏷, 4 Nov); it answers to it ("Hey Mike, what's next?"). Empty = "Your helper".
export type HelperLook = { color: HelperColor; hat: HelperHat; skin: HelperSkin; hair: HelperHair; name: string };
export const cleanHelperName = (v: unknown) => String(v || "").replace(/[^\p{L}\p{N} '-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 20);
export const HELPER_SKINS: Record<HelperSkin, { skin: string; shade: string; label: string }> = {
  light: { skin: "#f7d7c4", shade: "#e8b89f", label: "Light" },
  medium: { skin: "#eac09a", shade: "#d49d73", label: "Medium" },
  tan: { skin: "#d29a6a", shade: "#b67c4d", label: "Tan" },
  brown: { skin: "#a8714a", shade: "#8a5735", label: "Brown" },
  dark: { skin: "#70452a", shade: "#56331d", label: "Dark" },
};
export const HELPER_HAIRS: Record<HelperHair, { hair: string; label: string }> = {
  black: { hair: "#1f1a17", label: "Black" },
  brown: { hair: "#5b3a24", label: "Brown" },
  blond: { hair: "#c99a4a", label: "Blond" },
  gray: { hair: "#9ca3af", label: "Gray" },
};

export const HELPER_COLORS: Record<HelperColor, { face: string; line: string; ear: string; label: string }> = {
  purple: { face: "#ede9fe", line: "#7c3aed", ear: "#a78bfa", label: "Purple" },
  blue: { face: "#dbeafe", line: "#2563eb", ear: "#60a5fa", label: "Blue" },
  green: { face: "#dcfce7", line: "#16a34a", ear: "#4ade80", label: "Green" },
  orange: { face: "#ffedd5", line: "#ea580c", ear: "#fb923c", label: "Orange" },
};
export const HELPER_HATS: Record<HelperHat, string> = { none: "No hat", hardhat: "⛑ Hard hat", cap: "🧢 Cap" };

const KEY = "hpd-helper-look";
const EVENT = "hpd-helper-look";
const DEFAULT: HelperLook = { color: "purple", hat: "none", skin: "medium", hair: "black", name: "" };

export function getHelperLook(): HelperLook {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return { color: v?.color in HELPER_COLORS ? v.color : DEFAULT.color, hat: v?.hat in HELPER_HATS ? v.hat : DEFAULT.hat,
      skin: v?.skin in HELPER_SKINS ? v.skin : DEFAULT.skin, hair: v?.hair in HELPER_HAIRS ? v.hair : DEFAULT.hair, name: String(v?.name || "").replace(/[^\p{L}\p{N} '-]/gu, "").slice(0, 20) };
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

// 🌤 What the robot wears right now (owner's picks, 4 Nov): a party hat for good news, a nightcap when it naps, an
// umbrella when rain or snow is on the way, a scarf when it's cold, sunglasses on a hot sunny day.
export type HelperOutfit = "party" | "pajamas" | "umbrella" | "scarf" | "sunglasses" | "";
export function robotOutfit(o: { happy?: boolean; sleep?: boolean; wx?: { temp: number; icon: string; note: string } | null }): HelperOutfit {
  if (o.happy) return "party";
  if (o.sleep) return "pajamas";
  const wx = o.wx;
  if (!wx) return "";
  if (/rain|snow/i.test(wx.note)) return "umbrella";
  if (wx.temp <= 40) return "scarf";
  if (wx.temp >= 80 && /☀/.test(wx.icon)) return "sunglasses";
  return "";
}

// 🔋 Battery saver: no moving pictures (on by hand in 🎨, or by itself under 20% battery where the phone tells).
const SAVER = "hpd-battery-saver";
export function batterySaverOn() { try { return localStorage.getItem(SAVER) === "1"; } catch { return false; } }
export function setBatterySaver(on: boolean) {
  try { if (on) localStorage.setItem(SAVER, "1"); else localStorage.removeItem(SAVER); } catch { /* private mode */ }
  applyBatterySaver(on);
}
export function applyBatterySaver(on: boolean) {
  try { document.documentElement.classList.toggle("hpd-saver", on); } catch { /* server */ }
}
