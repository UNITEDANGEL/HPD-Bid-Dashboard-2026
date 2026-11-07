// 🌧 Rain check on the route (app idea list: "if rain or snow is coming, the route plan puts indoor jobs first and
// warns you about outdoor ones"): the work descriptions that are outside (roof, facade, gutters, sidewalk…), the
// day's forecast (Open-Meteo, lib/weather), and the stops' planned times. Nothing is sent anywhere.
import { sky, type Weather } from "./weather";

export const OUTSIDE_WORK = /\b(roof|roofing|exterior|facade|façade|gutters?|leaders?|parapet|sidewalk|courtyard|backyard|yard|fire escape|pointing|stoop|areaway|skylight|bulkhead|outside wall|outside)\b/i;

// The outside word in a work description ("roof"), else "".
export function outsideWord(text: string) {
  const m = OUTSIDE_WORK.exec(String(text || ""));
  return m ? m[1].toLowerCase().replace("façade", "facade") : "";
}

export type RainStop = { id: string; address: string; outside?: string; arrival: number; finish: number };
export type RainCheck = { word: string; from: number; to: number; pct: number; outside: { id: string; address: string; outside: string; wet: boolean }[]; fix: "first" | "last" | ""; text: string };

const clock = (min: number) => { const h = Math.floor(min / 60) % 24; return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`; };
const noZip = (a: string) => String(a || "").replace(/,\s*\d{5}$/, "");

// The rain (or snow) on the route's day, 7 AM-8 PM, and which outside stops it falls on. null = dry, or no outside work.
export function rainCheck(w: Weather | null, date: string, stops: RainStop[]): RainCheck | null {
  if (!w || !stops.length) return null;
  const wet = w.hours.filter((x) => x.t.startsWith(date) && Number(x.t.slice(11, 13)) >= 7 && Number(x.t.slice(11, 13)) <= 19 && (x.rainPct >= 50 || x.rain >= 0.02));
  if (!wet.length) return null;
  const outsideStops = stops.filter((s) => s.outside);
  if (!outsideStops.length) return null;
  const hourOf = (t: string) => Number(t.slice(11, 13));
  const from = hourOf(wet[0].t) * 60, to = (hourOf(wet[wet.length - 1].t) + 1) * 60;
  const pct = Math.max(...wet.map((x) => x.rainPct));
  const kind = sky(wet[0].code);
  const word = /snow/.test(kind) ? "Snow" : /thunder/.test(kind) ? "Storms" : "Rain";
  const isWet = (s: RainStop) => wet.some((x) => { const h = hourOf(x.t) * 60; return h < s.finish && h + 60 > s.arrival; });
  const outside = outsideStops.map((s) => ({ id: s.id, address: s.address, outside: s.outside!, wet: isWet(s) }));
  const inRain = outside.filter((s) => s.wet);
  const first = stops[0].arrival, last = stops[stops.length - 1].finish;
  const fix: RainCheck["fix"] = !inRain.length ? "" : from > first + 30 ? "first" : to < last - 30 ? "last" : "";
  const when = `${word} ${clock(from)}-${clock(to)}${pct ? ` (${pct}%)` : ""}`;
  const list = (xs: typeof outside) => xs.slice(0, 2).map((s) => `${noZip(s.address)} (${s.outside})`).join(", ") + (xs.length > 2 ? ` and ${xs.length - 2} more` : "");
  const text = !inRain.length
    ? `${word === "Snow" ? "❄️" : "🌧"} ${when}. Your outside work (${list(outside)}) is planned before or after it.`
    : `${word === "Snow" ? "❄️" : "🌧"} ${when}. Outside work in it: ${list(inRain)}. ${fix === "first" ? "Do it first, before it starts." : fix === "last" ? "Do the inside work first; outside after it stops." : "It's wet all day: think about moving it to a dry day."}`;
  return { word, from, to, pct, outside, fix, text };
}

// The open stops with the outside ones moved first (before the rain) or last (after it), each group in its own order.
export function outsideOrder(ids: string[], outsideIds: string[], first: boolean) {
  const out = ids.filter((id) => outsideIds.includes(id)), inn = ids.filter((id) => !outsideIds.includes(id));
  return first ? [...out, ...inn] : [...inn, ...out];
}
