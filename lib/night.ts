// 🌙 Dark map at night (idea list: "a switch for a dark screen that is easier on the eyes in a dark truck"): night in
// New York = from half an hour after sunset to 6:30 AM. Sunset by month (New York, rounded, clock time with summer time).
const SUNSET = [17.1, 17.6, 19.0, 19.5, 20.0, 20.4, 20.4, 19.9, 19.1, 18.3, 16.8, 16.6];
export function isNightNy(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value || 0);
  const h = get("hour") + get("minute") / 60;
  return h >= SUNSET[get("month") - 1] + 0.5 || h < 6.5;
}
export type MapStyle = "light" | "dark" | "night" | "satellite";
export const MAP_STYLE_LABEL: Record<MapStyle, string> = { light: "Street map", dark: "Dark map", night: "Dark at night", satellite: "Satellite" };
