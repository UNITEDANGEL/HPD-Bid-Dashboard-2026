// Run: node camera-alert/test.js
var L = require('./logic.js');
var assert = require('assert');
var MPH = L.MPH;

// geometry
var a = { lat: 40.75, lon: -73.99 };
var b = L.destination(a, 90, 500);
assert(Math.abs(L.distance(a, b) - 500) < 1, 'distance round-trip');
assert(Math.abs(L.bearing(a, b) - 90) < 0.5, 'bearing round-trip');
assert(L.angleDiff(350, 10) === 20, 'angleDiff wraps');

// yellow + stopping math
assert(L.yellowSeconds(25) === 3, 'NYC 25 mph yellow is 3 s');
assert(L.yellowSeconds(40) > 3.5, 'longer yellow at higher limits');
var v35 = 35 * MPH;
var dz = L.dilemmaZone(v35, 25);
assert(dz.stopDist > 40 && dz.stopDist < 60, 'stop distance at 35 mph ~49 m, got ' + dz.stopDist);
assert(dz.hasZone, 'dilemma zone exists at 35 in a 25');
assert(!L.dilemmaZone(15 * MPH, 25).hasZone, 'no dilemma zone at 15 mph');

// approach: red-light camera, driving east toward it at 35 mph
var cam = { lat: 40.75, lon: -73.99, type: 'redlight', dir: null };
var opts = { speedMps: v35, limitMph: 25, showAlpr: false };
var far = L.assess(cam, 700, opts);
assert.strictEqual(far.level, 0, 'silent at 700 m');
var heads = L.assess(cam, 300, opts);
assert.strictEqual(heads.level, 1, 'heads-up at 300 m, got ' + JSON.stringify(heads));
var ease = L.assess(cam, 110, opts);
assert.strictEqual(ease.level, 2, 'ease off at 110 m, got ' + JSON.stringify(ease));
assert(/Ease off/.test(ease.text));
var committed = L.assess(cam, 15, opts);
assert.strictEqual(committed.level, 0, 'no braking advice once committed');
assert.strictEqual(L.assess(cam, 110, { speedMps: 1, limitMph: 25 }).level, 0, 'silent when crawling');

// speed camera: only escalates when over the limit
var sc = { lat: 40.75, lon: -73.99, type: 'speed' };
assert.strictEqual(L.assess(sc, 250, { speedMps: 24 * MPH, limitMph: 25 }).level, 1);
assert.strictEqual(L.assess(sc, 250, { speedMps: 33 * MPH, limitMph: 25 }).level, 2);

// plate readers silent unless enabled
var alpr = { lat: 40.75, lon: -73.99, type: 'alpr' };
assert.strictEqual(L.assess(alpr, 200, { speedMps: v35, limitMph: 25, showAlpr: false }).level, 0);
assert.strictEqual(L.assess(alpr, 200, { speedMps: v35, limitMph: 25, showAlpr: true }).level, 1);

// cameras ahead: cone and facing direction
var pos = L.destination(cam, 270, 300);           // 300 m west of cam, driving east
var list = [cam, { lat: 40.76, lon: -73.99, type: 'speed' }];
var res = L.camerasAhead(list, pos, 90, 600);
assert.strictEqual(res.length, 1, 'only the camera in front');
assert.strictEqual(L.camerasAhead([cam], pos, 270, 600).length, 0, 'behind us is excluded');
var facingAway = { lat: cam.lat, lon: cam.lon, type: 'speed', dir: 90 }; // faces east, away from approaching driver
assert.strictEqual(L.camerasAhead([facingAway], pos, 90, 600).length, 0, 'camera facing away ignored');

// dedupe
assert.strictEqual(L.dedupe([cam, { lat: cam.lat + 0.00005, lon: cam.lon, type: 'redlight' }], 20).length, 1);
console.log('all tests passed');
