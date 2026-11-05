// 🔁 ☎️ 🔥 🛒 🚦 (owner, 5 Nov: "do all"): the translator endpoint, the store on the way, streaks, traffic colors and
// the words that open them. No real network or AI: everything here is faked.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";
import { aiTranslate, translateFacts } from "../server/ai-draft.mjs";

const { parseCommand } = await loadLib("voice-agent");
const { pickStore, overpassQuery, findStore, storeLine } = await loadLib("store-stop");
const { streaks, streakLine, bumpBest } = await loadLib("streaks");
const { trafficLevels, trafficRuns, rushLevel, parseRoadRoute, roadRouteUrl } = await loadLib("road-route");

// The words.
for (const s of ["translate", "translator", "translate for the tenant", "the tenant speaks Spanish", "talk to the tenant in Russian", "interpreter"]) assert.equal(parseCommand(s).intent, "translate", s);
assert.equal(parseCommand("talk to the tenant in Chinese").lang, "zh");
assert.equal(parseCommand("the tenant only speaks russian").lang, "ru");
for (const s of ["what do I say to HPD", "HPD is calling about ER07663", "before I call HPD back", "what should I tell HPD"]) assert.equal(parseCommand(s).intent, "hpd-call", s);
assert.equal(parseCommand("HPD is calling about ER07663").ref, "ER07663");
for (const s of ["my streak", "streaks", "my records", "how many days in a row"]) assert.equal(parseCommand(s).intent, "streaks", s);
for (const s of ["store on my way", "store stop", "stop at Home Depot on the way", "Home Depot on the way"]) assert.equal(parseCommand(s).intent, "store-stop", s);
assert.equal(parseCommand("nearest Home Depot").intent, "store");
assert.equal(parseCommand("tell the tenant I'm on my way").intent, "on-my-way");

// 🔁 The translator: only the four languages, short text, nothing else.
assert.deepEqual(translateFacts({ text: " Hola,  el baño gotea ", from: "es", to: "en" }), { text: "Hola, el baño gotea", from: "es", to: "en" });
assert.equal(translateFacts({ text: "hi", from: "en", to: "en" }), null);
assert.equal(translateFacts({ text: "hi", from: "en", to: "fr" }), null);
assert.equal(translateFacts({ text: "", from: "en", to: "es" }), null);
assert.equal(translateFacts({ text: "x".repeat(900), from: "en", to: "es" }).text.length, 600);
let ran = null;
const env = { AI: { run: async (model, input) => { ran = { model, input }; return { translated_text: "Hello, the bathroom leaks" }; } } };
const out = await aiTranslate(env, { text: "Hola, el baño gotea", from: "es", to: "en" });
assert.equal(out.ai, true); assert.equal(out.text, "Hello, the bathroom leaks");
assert.equal(ran.model, "@cf/meta/m2m100-1.2b"); assert.equal(ran.input.source_lang, "es"); assert.equal(ran.input.target_lang, "en");
assert.equal((await aiTranslate({}, { text: "x", from: "es", to: "en" })).ai, false);

// 🛒 The store with the fewest extra minutes; a big chain wins a near-tie; nameless places skipped.
const from = { lat: 40.7, lng: -73.83 }, to = { lat: 40.7, lng: -73.75 };
const body = { elements: [
  { lat: 40.7, lon: -73.79, tags: { shop: "hardware", name: "Corner Hardware", "addr:housenumber": "12", "addr:street": "Main St" } },
  { type: "way", center: { lat: 40.705, lon: -73.79 }, tags: { shop: "doityourself", name: "The Home Depot", "addr:housenumber": "50", "addr:street": "Jamaica Ave" } },
  { lat: 40.9, lon: -73.9, tags: { shop: "hardware", name: "Far Away Supply" } },
  { lat: 40.7, lon: -73.79, tags: { shop: "hardware" } },
] };
const best = pickStore(body, from, to);
assert.equal(best.name, "The Home Depot"); assert.equal(best.big, true); assert.equal(best.address, "50 Jamaica Ave");
assert.ok(best.extraMin >= 10 && best.extraMin < 20, String(best.extraMin));
assert.match(storeLine(best), /The Home Depot, 50 Jamaica Ave: about \d+ min out of your way/);
assert.equal(pickStore({ elements: [] }, from, to), null);
assert.match(overpassQuery(from, to), /shop.*doityourself\|hardware.*around:\d+,40\.70000,-73\.79000/);
let sent = null;
const s2 = await findStore(from, to, async (url, init) => { sent = { url, init }; return { ok: true, json: async () => body }; });
assert.equal(s2.name, "The Home Depot"); assert.match(sent.url, /overpass-api\.de/); assert.match(sent.init.body, /^data=/);
assert.equal(await findStore(from, to, async () => { throw new Error("offline"); }), null);

// 🔥 Streaks: weekends don't break it; today counts once a bid went out.
const at = (d) => `${d}T15:00:00Z`;
// Thu 5 Nov 2026; bids Mon 2 - Wed 4, and Fri 30 Oct.
let s = streaks({ bidSentAt: ["2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04"].map(at), finished: [], today: "2026-11-05" });
assert.deepEqual(s, { bids: 4, bidsToday: false, paperwork: 0 });
s = streaks({ bidSentAt: ["2026-11-04", "2026-11-05"].map(at), finished: [], today: "2026-11-05" });
assert.equal(s.bids, 2); assert.equal(s.bidsToday, true);
// Sunday: Friday's run still counts.
assert.equal(streaks({ bidSentAt: ["2026-11-05", "2026-11-06"].map(at), finished: [], today: "2026-11-08" }).bids, 2);
// A missed weekday ends it.
assert.equal(streaks({ bidSentAt: ["2026-11-02", "2026-11-04"].map(at), finished: [], today: "2026-11-05" }).bids, 1);
// Paperwork the same day, newest first; a job finished today with no paperwork yet doesn't break it.
s = streaks({ bidSentAt: [], today: "2026-11-05", finished: [
  { finishedAt: at("2026-11-05"), paperworkAt: "" },
  { finishedAt: at("2026-11-04"), paperworkAt: "2026-11-04T22:00:00Z" },
  { finishedAt: at("2026-11-03"), paperworkAt: "2026-11-03T20:00:00Z" },
  { finishedAt: at("2026-11-02"), paperworkAt: "2026-11-04T12:00:00Z" },
  { finishedAt: at("2026-11-01"), paperworkAt: "2026-11-01T20:00:00Z" },
] });
assert.equal(s.paperwork, 2);
assert.match(streakLine({ bids: 4, bidsToday: false, paperwork: 2 }, { bids: 4, paperwork: 5 }), /4 work days in a row with bids sent \(your record!\): send one today.*\n.*2 finished jobs.*\(record 5\)/);
assert.match(streakLine({ bids: 0, bidsToday: false, paperwork: 0 }, { bids: 6, paperwork: 0 }), /No bid streak right now \(record 6 days\)/);
const mem = {}; const store = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
assert.deepEqual(bumpBest({ bids: 3, paperwork: 1 }, store).beat, ["🔥 New record: 3 work days in a row with bids sent!"]);
assert.deepEqual(bumpBest({ bids: 3, paperwork: 1 }, store).beat, [], "cheered once");
assert.equal(bumpBest({ bids: 4, paperwork: 0 }, store).beat.length, 1);
assert.deepEqual(JSON.parse(mem["hpd-streak-best"]), { bids: 4, paperwork: 1 });

// 🚦 Traffic: rush hour by the NY clock; highways red, fast avenues orange; runs joined.
assert.equal(rushLevel(new Date("2026-11-05T13:00:00Z")), 2, "Thu 8 AM");
assert.equal(rushLevel(new Date("2026-11-05T17:00:00Z")), 1, "Thu noon");
assert.equal(rushLevel(new Date("2026-11-05T03:00:00Z")), 0, "Wed 10 PM");
assert.equal(rushLevel(new Date("2026-11-08T13:00:00Z")), 0, "Sun 8 AM");
assert.deepEqual(trafficLevels([20, 12, 5], 2), [2, 1, 0]);
assert.deepEqual(trafficLevels([20, 12, 5], 1), [1, 0, 0]);
assert.deepEqual(trafficLevels([20, 12, 5], 0), [0, 0, 0]);
const path = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]];
assert.deepEqual(trafficRuns(path, [2, 2, 0, 1]), [{ level: 2, path: [[0, 0], [0, 1], [0, 2]] }, { level: 1, path: [[0, 3], [0, 4]] }]);
assert.match(roadRouteUrl([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]), /annotations=speed/);
const road = parseRoadRoute({ code: "Ok", waypoints: [], routes: [{ distance: 3200, duration: 600, geometry: { coordinates: [[0, 0], [1, 0], [2, 0]] }, legs: [{ duration: 600, distance: 3200, annotation: { speed: [20, 8] } }] }] }, 2);
assert.deepEqual(road.speeds, [20, 8]);
console.log("translate, store stop, streaks, traffic: ok");
