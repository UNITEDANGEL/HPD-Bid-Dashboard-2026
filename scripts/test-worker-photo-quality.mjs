import assert from "node:assert/strict";
import { createRequire } from "node:module";
const src = (await import("node:fs")).readFileSync("lib/worker-photo-quality.ts", "utf8").replace(/export type[^\n]*\n/, "").replace(/: (Uint8ClampedArray \| number\[\]|number|File|Promise<PhotoVerdict>|PhotoVerdict)/g, "").replace(/\(gray, w, h\)/, "(gray, w, h)");
// only the pure function is tested here
const fn = new Function(`${src.split("export async function judgePhoto")[0].replace("export function", "function")}; return judgePixels;`)();
const w = 40, h = 40;
const flat = (v) => new Uint8ClampedArray(w * h).fill(v);
assert.equal(fn(flat(10), w, h).ok, false); assert.match(fn(flat(10), w, h).reason, /dark/);
assert.equal(fn(flat(250), w, h).ok, false); assert.match(fn(flat(250), w, h).reason, /bright/);
assert.match(fn(flat(120), w, h).reason, /Blurry/);
const sharp = new Uint8ClampedArray(w * h); for (let i = 0; i < w * h; i++) sharp[i] = (Math.floor(i / w) + (i % w)) % 2 ? 200 : 60;
assert.equal(fn(sharp, w, h).ok, true);
console.log("PASS worker photo quality: dark, bright and blurry photos are asked to be retaken; a sharp one passes");
