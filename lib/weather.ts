// Weather for the work day (owner, 27 Oct: "I want the AI to be smarter: weather, traffic, etc."): New York City's
// forecast from Open-Meteo (free, no key, no tenant data sent: only the city's coordinates), said in plain words with
// what it means for the jobs (rain on roof work, freezing, wind on ladders, when it gets dark).

export type WeatherHour = { t: string; temp: number; rainPct: number; rain: number; code: number; wind: number };
export type WeatherDay = { date: string; max: number; min: number; rainPct: number; code: number; sunrise: string; sunset: string; wind: number };
export type Weather = { at: number; hours: WeatherHour[]; days: WeatherDay[] };

const URL = "https://api.open-meteo.com/v1/forecast?latitude=40.73&longitude=-73.94"
  + "&hourly=temperature_2m,precipitation_probability,precipitation,weathercode,windspeed_10m"
  + "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,sunrise,sunset,windspeed_10m_max"
  + "&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=3";
const KEY = "hpd-weather";

type Raw = {
  hourly?: { time?: string[]; temperature_2m?: number[]; precipitation_probability?: number[]; precipitation?: number[]; weathercode?: number[]; windspeed_10m?: number[] };
  daily?: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[]; weathercode?: number[]; sunrise?: string[]; sunset?: string[]; windspeed_10m_max?: number[] };
};

export function parseWeather(raw: Raw, at = Date.now()): Weather {
  const h = raw.hourly || {}, d = raw.daily || {};
  return {
    at,
    hours: (h.time || []).map((t, i) => ({ t, temp: h.temperature_2m?.[i] ?? NaN, rainPct: h.precipitation_probability?.[i] ?? 0, rain: h.precipitation?.[i] ?? 0, code: h.weathercode?.[i] ?? 0, wind: h.windspeed_10m?.[i] ?? 0 })),
    days: (d.time || []).map((date, i) => ({ date, max: d.temperature_2m_max?.[i] ?? NaN, min: d.temperature_2m_min?.[i] ?? NaN, rainPct: d.precipitation_probability_max?.[i] ?? 0, code: d.weathercode?.[i] ?? 0, sunrise: d.sunrise?.[i] || "", sunset: d.sunset?.[i] || "", wind: d.windspeed_10m_max?.[i] ?? 0 })),
  };
}

// Kept for 30 minutes on the phone, so asking again doesn't fetch again.
export async function fetchWeather(): Promise<Weather | null> {
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY) || "null") as Weather | null;
    if (kept && Date.now() - kept.at < 30 * 60000 && kept.days?.length) return kept;
  } catch { /* private mode */ }
  try {
    const r = await fetch(URL);
    if (!r.ok) return null;
    const w = parseWeather(await r.json());
    if (!w.days.length) return null;
    try { sessionStorage.setItem(KEY, JSON.stringify(w)); } catch { /* private mode */ }
    return w;
  } catch { return null; }
}

// WMO weather codes in plain words.
export function sky(code: number) {
  if (code === 0) return "clear";
  if (code <= 2) return "partly cloudy";
  if (code === 3) return "cloudy";
  if (code <= 48) return "foggy";
  if (code <= 57) return "drizzle";
  if (code <= 67) return code >= 66 ? "freezing rain" : "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "showers";
  if (code <= 86) return "snow showers";
  return "thunderstorms";
}

const clock = (iso: string) => { const [hh, mm] = (iso.split("T")[1] || "0:0").split(":").map(Number); return `${hh % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${hh < 12 ? "AM" : "PM"}`; };
const deg = (n: number) => `${Math.round(n)}°`;

// The day's hours from 7 AM to 7 PM (work hours), from now on when it's today.
function workHours(w: Weather, date: string, nowIso: string) {
  return w.hours.filter((x) => x.t.startsWith(date) && x.t.slice(11, 13) >= "07" && x.t.slice(11, 13) <= "19" && x.t >= nowIso.slice(0, 13));
}

// "Today: 58° to 66°, cloudy. Rain likely from 2 PM (70%). Wind up to 18 mph. Dark at 6:02 PM." + tips for the work.
export function weatherReport(w: Weather, when: "today" | "tomorrow", nowIso: string) {
  const today = nowIso.slice(0, 10);
  const day = when === "today" ? w.days.find((d) => d.date === today) : w.days.find((d) => d.date > today);
  if (!day) return { text: "", tips: [] as string[] };
  const hours = workHours(w, day.date, when === "today" ? nowIso : `${day.date}T00`);
  const wet = hours.find((x) => x.rainPct >= 50 || x.rain >= 0.02);
  const wetCode = wet ? sky(wet.code) : "";
  const wetWord = /snow/.test(wetCode) ? "Snow" : /thunder/.test(wetCode) ? "Storms" : /freezing/.test(wetCode) ? "Freezing rain" : "Rain";
  const dry = wet ? hours.filter((x) => x.t > wet.t).find((x) => x.rainPct < 30 && x.rain < 0.01) : undefined;
  // What's left of the day counts (late afternoon: the morning's rain is over).
  const hoursMaxRain = Math.max(0, ...hours.map((x) => x.rainPct));
  const windMax = Math.max(when === "today" ? 0 : day.wind, ...hours.map((x) => x.wind));
  const parts = [
    `${when === "today" ? "Today" : "Tomorrow"}: ${deg(day.min)} to ${deg(day.max)}F, ${sky(day.code)}.`,
    wet ? `${wetWord} likely from ${clock(wet.t)} (${Math.round(wet.rainPct)}%)${dry ? `, drying out by ${clock(dry.t)}` : ""}.` : hoursMaxRain >= 30 ? `Small chance of rain (${Math.round(hoursMaxRain)}%).` : "No rain expected during work hours.",
    windMax >= 20 ? `Wind up to ${Math.round(windMax)} mph.` : "",
    day.sunset ? `Dark at ${clock(day.sunset)}.` : "",
  ].filter(Boolean);
  const tips: string[] = [];
  if (wet) tips.push(`${wetWord} from ${clock(wet.t)}: do roof and outside work before then, bring tarps, and take the before photos early.`);
  if (day.min <= 32) tips.push("Freezing: no outside plaster, paint or caulk; expect no-heat and frozen-pipe jobs.");
  if (day.max >= 90) tips.push("Hot: water breaks; roof work early in the morning.");
  if (windMax >= 25) tips.push(`Windy (${Math.round(windMax)} mph): careful on ladders and roofs.`);
  if (day.sunset && when === "today") { const left = (Date.parse(`${day.sunset}:00`) - Date.parse(`${nowIso.slice(0, 16)}:00`)) / 3600000; if (left > 0 && left < 2.5) tips.push(`Dark at ${clock(day.sunset)}: finish outside photos before then.`); }
  return { text: parts.join(" "), tips };
}

// Rush hour in the city (no live traffic without a paid map service: Waze shows it live).
export function trafficNote(nowIso: string, weekday: number) {
  const h = Number(nowIso.slice(11, 13)) + Number(nowIso.slice(14, 16)) / 60;
  const workday = weekday >= 1 && weekday <= 5;
  if (workday && h >= 7 && h < 9.5) return "Morning rush hour now: bridges, tunnels and the BQE are slow; allow 20–30 extra minutes.";
  if (workday && h >= 15.5 && h < 19) return "Evening rush hour now: expect slow highways and bridges; allow 20–30 extra minutes.";
  if (workday && h >= 9.5 && h < 15.5) return "Midday: usually the easiest time to drive between jobs.";
  return "Traffic is usually light now.";
}

// The map's weather chip (27 Oct, owner: "I want to see temp etc on the map"): now, its icon, and what's coming.
export function skyIcon(code: number, night = false) {
  if (code === 0) return night ? "🌙" : "☀️";
  if (code <= 2) return night ? "☁️" : "🌤";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫";
  if (code <= 67 || (code >= 80 && code <= 82)) return "🌧";
  if (code <= 77 || code === 85 || code === 86) return "❄️";
  return "⛈";
}
export function weatherNow(w: Weather, nowIso: string) {
  const hour = nowIso.slice(0, 13);
  const at = w.hours.findIndex((x) => x.t.slice(0, 13) === hour);
  if (at < 0) return null;
  const h = w.hours[at];
  const day = w.days.find((d) => d.date === nowIso.slice(0, 10));
  const night = day ? nowIso < day.sunrise || nowIso > day.sunset : false;
  // Rain (or snow) in the next 6 hours, said as when it starts; else today's high and low.
  const wet = w.hours.slice(at + 1, at + 7).find((x) => x.rainPct >= 50 || x.rain >= 0.02);
  const raining = h.rainPct >= 50 || h.rain >= 0.02;
  const kind = (c: number) => (/snow/.test(sky(c)) ? "snow" : "rain");
  const note = raining ? `${kind(h.code)} now` : wet ? `${kind(wet.code)} ${clock(wet.t)}` : day ? `H ${deg(day.max)} L ${deg(day.min)}` : "";
  return { temp: Math.round(h.temp), icon: skyIcon(h.code, night), note, wind: Math.round(h.wind), alert: raining || Boolean(wet) || h.temp <= 32 || h.temp >= 90 || h.wind >= 25 };
}

// Rain / snow coming during the rest of today's work hours (7 AM-7 PM), for the heads-up when the route has outside work.
export function wetLater(w: Weather, nowIso: string) {
  const hours = workHours(w, nowIso.slice(0, 10), nowIso);
  const wet = hours.find((x) => x.rainPct >= 50 || x.rain >= 0.02);
  if (!wet) return null;
  const c = sky(wet.code);
  return { word: /snow/.test(c) ? "Snow" : /thunder/.test(c) ? "Storms" : /freezing/.test(c) ? "Freezing rain" : "Rain", at: clock(wet.t), now: wet.t.slice(0, 13) === nowIso.slice(0, 13) };
}
// Work that the weather stops: on the roof or outside the building.
export const OUTSIDE_WORK = /\b(roof|roofing|parapet|coping|gutter|leader|downspout|skylight|bulkhead|chimney|facade|fa[cç]ade|exterior|brick ?work|pointing|sidewalk|stoop|fire escape|yard|courtyard|siding|cornice)\b/i;
