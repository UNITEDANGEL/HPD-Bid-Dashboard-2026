// Weather and traffic in plain words (27 Oct, owner: "the AI smarter: weather, traffic"): lib/weather.ts on a made-up
// forecast: rain from 2 PM drying by 5 PM, wind, dark at 6:02 PM; tips for the work; freezing tomorrow; rush hour.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { parseWeather, weatherReport, trafficNote, sky } = await loadLib("weather");
const { parseCommand } = await loadLib("voice-agent");
const { aspAnswer } = await loadLib("asp");

const hours = [];
for (const day of ["2026-10-27", "2026-10-28"]) for (let h = 0; h < 24; h++) {
  const wet = day === "2026-10-27" && h >= 14 && h < 17;
  hours.push({ t: `${day}T${String(h).padStart(2, "0")}:00`, temp: 60, rainPct: wet ? 70 : 10, rain: wet ? 0.1 : 0, code: wet ? 63 : 3, wind: h === 15 ? 27 : 10 });
}
const raw = {
  hourly: { time: hours.map((x) => x.t), temperature_2m: hours.map((x) => x.temp), precipitation_probability: hours.map((x) => x.rainPct), precipitation: hours.map((x) => x.rain), weathercode: hours.map((x) => x.code), windspeed_10m: hours.map((x) => x.wind) },
  daily: { time: ["2026-10-27", "2026-10-28"], temperature_2m_max: [66, 38], temperature_2m_min: [58, 29], precipitation_probability_max: [70, 0], weathercode: [63, 0], sunrise: ["2026-10-27T07:21", "2026-10-28T07:22"], sunset: ["2026-10-27T18:02", "2026-10-28T18:01"], windspeed_10m_max: [27, 8] },
};
const w = parseWeather(raw, 0);
assert.equal(w.days.length, 2);
assert.equal(sky(63), "rain");

const today = weatherReport(w, "today", "2026-10-27T10:00");
assert.equal(today.text, "Today: 58° to 66°F, rain. Rain likely from 2 PM (70%), drying out by 5 PM. Wind up to 27 mph. Dark at 6:02 PM.");
assert.ok(today.tips.some((t) => /^Rain from 2 PM: do roof and outside work before then/.test(t)), today.tips.join(" | "));
assert.ok(today.tips.some((t) => /Windy \(27 mph\)/.test(t)));
// Late in the day: the rain already passed, and it gets dark soon.
const late = weatherReport(w, "today", "2026-10-27T17:00");
assert.match(late.text, /No rain expected during work hours/);
assert.ok(late.tips.some((t) => /Dark at 6:02 PM: finish outside photos/.test(t)), late.tips.join(" | "));
const tomorrow = weatherReport(w, "tomorrow", "2026-10-27T10:00");
assert.match(tomorrow.text, /^Tomorrow: 29° to 38°F, clear\. No rain expected/);
assert.ok(tomorrow.tips.some((t) => /^Freezing/.test(t)));

assert.match(trafficNote("2026-10-27T08:15", 2), /Morning rush hour/);
assert.match(trafficNote("2026-10-27T17:30", 2), /Evening rush hour/);
assert.match(trafficNote("2026-10-27T11:00", 2), /Midday/);
assert.match(trafficNote("2026-10-25T08:15", 0), /light/);

for (const [said, intent, when] of [["what's the weather", "weather", "today"], ["is it going to rain tomorrow", "weather", "tomorrow"], ["do I need an umbrella", "weather", "today"], ["how's the traffic", "traffic"], ["is it rush hour", "traffic"]]) {
  const c = parseCommand(said);
  assert.equal(c.intent, intent, said);
  if (when) assert.equal(c.when, when, said);
}
assert.equal(parseCommand("rain leak in the bathroom").intent, "search", "a leak is not the weather");
// Alternate side parking from the 2026 calendar.
assert.match(aspAnswer("2026-11-03", "Today"), /^Today: alternate side parking is suspended \(Election Day\)\. Meters are still in effect\.$/);
assert.match(aspAnswer("2026-11-26", "Tomorrow"), /suspended \(Thanksgiving Day\)\. Meters are suspended too\./);
assert.match(aspAnswer("2026-10-28", "Today"), /in effect.*Next suspension: Tuesday, Nov 3 \(Election Day\)/);
assert.match(aspAnswer("2026-11-01", "Today"), /Sunday: no alternate side parking/);
assert.match(aspAnswer("2027-01-04", "Today"), /only have the 2026/);
for (const [said, intent, extra] of [["is alternate side on today", "asp"], ["do I need to move my car tomorrow", "asp"], ["where's the nearest home depot", "store"], ["take me to a hardware store", "store"], ["how old is this building", "building"], ["how old is 1207 1 avenue", "building", "1207 1 avenue"], ["how long to the next job", "drive-time"], ["how long will it take to get to 1207 1 avenue", "drive-time", "1207 1 avenue"], ["how far is EQ15239", "drive-time", "EQ15239"]]) {
  const c = parseCommand(said);
  assert.equal(c.intent, intent, said);
  if (extra) assert.equal(c.ref, extra, said);
}
assert.notEqual(parseCommand("how long will the job take").intent, "drive-time");
console.log("PASS weather: forecast in plain words (rain from 2 PM drying by 5, wind, dark at 6:02), tips for the work, freezing tomorrow, rush hour by the clock, voice phrases; alternate side parking (Election Day, Thanksgiving, next suspension, Sunday); store, building, drive-time phrases");
