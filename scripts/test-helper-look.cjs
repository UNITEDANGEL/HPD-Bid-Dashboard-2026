// 🌤 What the robot wears (4 Nov): party hat for good news, nightcap at night, umbrella before rain or snow, a scarf
// when it's cold, sunglasses on a hot sunny day, nothing special otherwise.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.resolve('lib/helper-look.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', code)((m) => (m === 'react' ? { useEffect() {}, useState: (v) => [v, () => {}] } : require(m)), mod, mod.exports);
const { robotOutfit } = mod.exports;
assert.equal(robotOutfit({ happy: true, sleep: true, wx: { temp: 30, icon: '☀️', note: 'rain 2 PM' } }), 'party');
assert.equal(robotOutfit({ sleep: true, wx: { temp: 30, icon: '☀️', note: '' } }), 'pajamas');
assert.equal(robotOutfit({ wx: { temp: 58, icon: '🌧', note: 'rain 2 PM' } }), 'raincoat');
assert.equal(robotOutfit({ wx: { temp: 28, icon: '❄️', note: 'snow now' } }), 'winter');
assert.equal(robotOutfit({ wx: { temp: 36, icon: '☁️', note: 'H 41° L 30°' } }), 'winter');
assert.equal(robotOutfit({ wx: { temp: 50, icon: '☁️', note: 'H 52° L 44°' } }), 'jacket');
assert.equal(robotOutfit({ wx: { temp: 88, icon: '☀️', note: 'H 90° L 72°' } }), 'summer');
assert.equal(robotOutfit({ wx: { temp: 88, icon: '☁️', note: 'H 90° L 72°' } }), 'tshirt');
assert.equal(robotOutfit({ wx: { temp: 62, icon: '⛅', note: 'H 66° L 55°' } }), '');
assert.equal(robotOutfit({ wx: null }), '');
console.log('helper look ok: party, nightcap, raincoat in rain, winter coat in snow or ≤40°, jacket ≤55°, T-shirt ≥80° (sunglasses when sunny)');
