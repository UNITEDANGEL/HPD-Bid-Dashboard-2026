// 🚗 "I'm on my way" (plan item 27): "tell the tenant I'm on my way" gets the arrival time added, from where you are
// and the traffic (straight line x 1.35 for the streets, 18 mph in the city, 12 in rush hour), rounded up to 5 minutes.

export const isOnMyWay = (msg: string) => /\b(?:on (?:my|our|the) way|heading (?:over|there|your way)|coming (?:now|over)|leaving now)\b/i.test(String(msg || ""));

const miles = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 3958.8, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const nyClock = (d: Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(String(p.weekday)), hour: Number(p.hour) };
};

export function etaMinutes(here: { lat: number; lng: number }, there: { lat: number; lng: number }, now = new Date()) {
  const { weekday, hour } = nyClock(now);
  const rush = weekday >= 1 && weekday <= 5 && ((hour >= 7 && hour < 10) || (hour >= 16 && hour < 19));
  return Math.max(3, Math.round(((miles(here, there) * 1.35) / (rush ? 12 : 18)) * 60));
}
// "I'm on my way." -> "I'm on my way. I should be there around 2:40 PM."
export function withArrival(msg: string, minutes: number, now = new Date()) {
  const at = new Date(Math.ceil((now.getTime() + minutes * 60000) / 300000) * 300000);
  const label = at.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  const base = String(msg || "").trim().replace(/[.!]*$/, ".");
  return `${base} I should be there around ${label}.`;
}
