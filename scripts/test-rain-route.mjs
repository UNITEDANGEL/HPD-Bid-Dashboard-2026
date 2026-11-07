// 🌧 Rain check on the route: outside work found in the description; rain later -> outside first; rain in the morning
// -> outside last; wet all day -> move it; dry or no outside work -> nothing; the reorder keeps each group's order.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { outsideWord, rainCheck, outsideOrder } = await loadLib("rain-route");
assert.equal(outsideWord("REPAIR ROOF LEAK ABOVE APT 5"), "roof");
assert.equal(outsideWord("Point brick on exterior facade"), "exterior");
assert.equal(outsideWord("Replace door lock in apartment"), "");
assert.equal(outsideWord("Paint walls in bedroom"), "", "inside paint is not outside");

const D = "2026-11-09";
const weather = (wetHours, code = 61) => ({ at: 0, days: [], hours: Array.from({ length: 24 }, (_, h) => ({ t: `${D}T${String(h).padStart(2, "0")}:00`, temp: 50, rainPct: wetHours.includes(h) ? 80 : 10, rain: wetHours.includes(h) ? 0.1 : 0, code: wetHours.includes(h) ? code : 2, wind: 5 })) });
const stops = [
  { id: "A", address: "1 MAIN ST, 10001", arrival: 8 * 60, finish: 9 * 60 },
  { id: "B", address: "2 ELM ST, 10002", arrival: 10 * 60, finish: 11 * 60 },
  { id: "R", address: "3 OAK AVE, 11201", outside: "roof", arrival: 14 * 60, finish: 15 * 60 },
];
// Rain from 1 PM: the roof at 2 PM is in it -> do it first.
const later = rainCheck(weather([13, 14, 15, 16]), D, stops);
assert.equal(later.fix, "first");
assert.equal(later.text, "🌧 Rain 1 PM-5 PM (80%). Outside work in it: 3 OAK AVE (roof). Do it first, before it starts.");
assert.deepEqual(outsideOrder(["A", "B", "R"], ["R"], true), ["R", "A", "B"]);
// After moving it first (8-9 AM) it's dry: a calm line.
const moved = rainCheck(weather([13, 14, 15, 16]), D, [{ ...stops[2], arrival: 480, finish: 540 }, { ...stops[0], arrival: 560, finish: 620 }]);
assert.equal(moved.fix, "");
assert.match(moved.text, /^🌧 Rain 1 PM-5 PM \(80%\)\. Your outside work \(3 OAK AVE \(roof\)\) is planned before or after it\.$/);
// Morning rain over the roof at 8 AM -> outside last.
const morning = rainCheck(weather([7, 8, 9]), D, [{ ...stops[2], arrival: 480, finish: 540 }, { ...stops[0], arrival: 600, finish: 660 }, { ...stops[1], arrival: 720, finish: 780 }]);
assert.equal(morning.fix, "last");
assert.match(morning.text, /Do the inside work first; outside after it stops\./);
assert.deepEqual(outsideOrder(["R", "A", "B"], ["R"], false), ["A", "B", "R"]);
// Snow all day.
const snow = rainCheck(weather([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], 73), D, stops);
assert.equal(snow.word, "Snow"); assert.equal(snow.fix, "");
assert.match(snow.text, /^❄️ Snow 7 AM-8 PM \(80%\)\..*think about moving it to a dry day\.$/);
// Dry, or nothing outside: nothing.
assert.equal(rainCheck(weather([]), D, stops), null);
assert.equal(rainCheck(weather([13, 14]), D, stops.slice(0, 2)), null);
assert.equal(rainCheck(null, D, stops), null);
console.log("PASS rain route: outside work found; rain later -> first, morning rain -> last, all day -> move it; dry / inside only -> nothing");
