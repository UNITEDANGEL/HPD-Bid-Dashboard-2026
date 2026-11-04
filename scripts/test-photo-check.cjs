// 📸 Photo check: sharp, blurry, dark and washed-out pictures are told apart, and missing before/after is said.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.resolve('lib/photo-check.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
const { judgePixels, summarizePhotoCheck, photoComment } = mod.exports;

const W = 120, H = 90;
let seed = 7;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
// A brick wall: sharp edges.
const sharp = new Uint8ClampedArray(W * H).map((_, i) => { const x = i % W, y = Math.floor(i / W); return (x % 12 < 2 || y % 8 < 2) ? 60 : 150 + rand() * 40; });
function blur(src, passes) {
  let a = Float32Array.from(src);
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(a.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) { s += a[yy * W + xx]; n++; } }
      b[y * W + x] = s / n;
    }
    a = b;
  }
  return Uint8ClampedArray.from(a);
}
assert.equal(judgePixels(sharp, W, H).verdict, 'ok', JSON.stringify(judgePixels(sharp, W, H)));
const soft = judgePixels(blur(sharp, 3), W, H);
assert.equal(soft.verdict, 'blurry', JSON.stringify(soft));
assert.equal(judgePixels(sharp.map((v) => v / 6), W, H).verdict, 'dark');
assert.equal(judgePixels(new Uint8ClampedArray(W * H).fill(250), W, H).verdict, 'bright');
assert.equal(judgePixels(new Uint8ClampedArray(W * H).fill(130), W, H).verdict, 'blurry', 'a flat grey picture has no detail');

const ok = (kind, id) => ({ id, kind, verdict: 'ok', dataUrl: 'x' });
let s = summarizePhotoCheck([ok('before', 1), ok('after', 2)], { before: 1, after: 1 }, true);
assert.equal(s.good, true);
assert.deepEqual(s.problems, []);
s = summarizePhotoCheck([ok('before', 1)], { before: 1, after: 0 }, true);
assert.deepEqual(s.problems, ['No after photo yet. HPD needs one.']);
s = summarizePhotoCheck([], { before: 0, after: 0 }, false);
assert.deepEqual(s.problems, [], 'no work and no photos: nothing to say');
s = summarizePhotoCheck([ok('before', 1), { id: 2, kind: 'after', verdict: 'blurry', dataUrl: 'x' }, { id: 3, kind: 'after', verdict: 'blurry', dataUrl: 'x' }, { id: 4, kind: 'before', verdict: 'dark', dataUrl: 'x' }], { before: 2, after: 2 }, true);
assert.deepEqual(s.problems, ['1 before photo is too dark: take it again.', '2 after photos look blurry: take them again.']);
assert.equal(s.bad.length, 3);
assert.equal(s.good, false);
// What the helper says about the photo just taken (4 Nov).
assert.match(photoComment('ok', 'after'), /^Nice after photo, that one looks good\.$/);
assert.match(photoComment('blurry', 'before'), /before photo looks a bit blurry.*take another/);
assert.match(photoComment('dark', 'after'), /a bit dark.*flash/);
assert.match(photoComment('bright', 'after'), /too bright/);
console.log('photo check ok');
