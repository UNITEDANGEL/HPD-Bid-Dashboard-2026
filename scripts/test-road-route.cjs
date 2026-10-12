const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const load = (file) => {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'module', code)(mod.exports, mod);
  return mod.exports;
};
const road = load('lib/road-route.ts');
const day = load('lib/day-route.ts');

(async () => {
  // OSRM answer for start -> A -> B: the street line is cut into one piece per leg at each stop.
  const points = [{ lat: 40.70, lng: -73.90 }, { lat: 40.72, lng: -73.92 }, { lat: 40.75, lng: -73.95 }];
  const body = {
    code: 'Ok',
    routes: [{ distance: 8046.72, duration: 1500, legs: [{ distance: 3218.69, duration: 600 }, { distance: 4828.03, duration: 900 }],
      geometry: { coordinates: [[-73.90, 40.70], [-73.91, 40.71], [-73.92, 40.72], [-73.93, 40.73], [-73.95, 40.75]] } }],
    waypoints: [{ location: [-73.90, 40.70] }, { location: [-73.92, 40.72] }, { location: [-73.95, 40.75] }],
  };
  const parsed = road.parseRoadRoute(body, 3);
  assert.equal(parsed.legs.length, 2);
  assert.deepEqual(parsed.legs.map((l) => l.minutes), [10, 15]);
  assert.equal(parsed.miles.toFixed(1), '5.0');
  assert.equal(parsed.minutes, 25);
  assert.deepEqual(parsed.legs[0].path, [[40.70, -73.90], [40.71, -73.91], [40.72, -73.92]]);
  assert.deepEqual(parsed.legs[1].path, [[40.72, -73.92], [40.73, -73.93], [40.75, -73.95]]);
  assert.equal(road.parseRoadRoute({ code: 'NoRoute' }, 3), null);
  assert.equal(road.parseRoadRoute(body, 4), null, 'leg count must match the stops');
  assert.match(road.roadRouteUrl(points), /^https:\/\/router\.project-osrm\.org\/route\/v1\/driving\/-73\.900000,40\.700000;-73\.920000,40\.720000;-73\.950000,40\.750000\?overview=full&geometries=geojson/);

  // Fetch: one request per route (then remembered); no signal or a bad answer gives null, never throws.
  let calls = 0;
  const ok = async () => { calls += 1; return { ok: true, json: async () => body }; };
  assert.equal((await road.fetchRoadRoute(points, ok)).minutes, 25);
  assert.equal((await road.fetchRoadRoute(points, ok)).minutes, 25);
  assert.equal(calls, 1, 'same route is not fetched twice');
  const other = [{ lat: 40.6, lng: -73.8 }, { lat: 40.61, lng: -73.81 }, { lat: 40.62, lng: -73.82 }];
  assert.equal(await road.fetchRoadRoute(other, async () => { throw new Error('offline'); }), null);
  assert.equal(await road.fetchRoadRoute(other, async () => ({ ok: false, json: async () => ({}) })), null);
  assert.equal(await road.fetchRoadRoute([points[0]], ok), null);

  // Real driving minutes go into the schedule (+5 to park); without them, the estimate is used.
  const s = { date: '2026-10-12', start: '08:00', end: '17:00', minutes: 45, borough: 'ALL' };
  const job = (id, lat, lng, days) => ({ id, address: id, borough: 'BK', lat, lng, days, pending: true, closed: false });
  const two = [job('A', 40.72, -73.92, 10), job('B', 40.75, -73.95, 10)];
  const withRoad = day.scheduleStops(two, s, points[0], [10, 15]);
  assert.deepEqual(withRoad.map((x) => x.travel), [15, 20]);
  assert.equal(withRoad[0].arrival, 8 * 60 + 15);
  assert.equal(withRoad[1].arrival, 8 * 60 + 15 + 45 + 20);
  assert.deepEqual(day.scheduleStops(two, s, points[0]).map((x) => x.travel), two.map((j, i) => day.travelEstimate(i ? two[0] : points[0], j)));

  // Order: from Brooklyn, nearby Brooklyn jobs come before the Bronx ones even when a Bronx job is a
  // bit more overdue - no zigzag across the city. A far more overdue job still goes first.
  const origin = { lat: 40.68, lng: -73.95 };
  const mixed = [
    job('BX1', 40.85, -73.88, 240), job('BK1', 40.69, -73.95, 220), job('BX2', 40.86, -73.89, 230),
    job('BK2', 40.67, -73.96, 225), job('BK3', 40.68, -73.94, 215),
  ];
  const plan = day.planDay(mixed, s, origin).map((j) => j.id);
  assert.deepEqual(plan.slice(0, 3).sort(), ['BK1', 'BK2', 'BK3'], `Brooklyn first, got ${plan}`);
  assert.deepEqual(plan.slice(3).sort(), ['BX1', 'BX2']);
  // When only one job fits in the day, the much more overdue one a short drive away is the one chosen.
  const oneSlot = { ...s, start: '08:00', end: '09:10' };
  const urgent = day.planDay([job('NEAR', 40.681, -73.951, 5), job('FAR-OLD', 40.70, -73.97, 400)], oneSlot, origin).map((j) => j.id);
  assert.deepEqual(urgent, ['FAR-OLD']);

  // Untangling: stops along a line are visited in line order, not back and forth.
  const line = [job('L3', 40.71, -73.95, 100), job('L1', 40.69, -73.95, 100), job('L4', 40.72, -73.95, 100), job('L2', 40.70, -73.95, 100)];
  assert.deepEqual(day.planDay(line, s, origin).map((j) => j.id), ['L1', 'L2', 'L3', 'L4']);

  console.log('PASS road route: street legs, one fetch per route, offline fallback, real drive minutes in the schedule, no zigzag order');
})().catch((error) => { console.error(error); process.exitCode = 1; });
