// ✍️ A signature that looks signed by hand on each copy (owner, 10 Nov: "can you do placement a little different in every
// invoice and signature so they look real"): a small shift, tilt and size change per job and per page, the same every
// time that job's copy is made again (so a re-made copy matches the one sent before).
export type SignJitter = { dx: number; dy: number; rotate: number; scale: number };

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// 0..1 from the hash, a different one per "slot".
const unit = (seed: string, slot: number) => (hash(`${slot}#${seed}#${slot * 7919}`) % 10007) / 10007;

export function signJitter(job: string, page: string): SignJitter {
  const seed = `${String(job || "").toUpperCase()}|${page}`;
  return {
    dx: Math.round((unit(seed, 1) * 12 - 6) * 10) / 10,     // ±6 pt left / right
    dy: Math.round((unit(seed, 2) * 6 - 3) * 10) / 10,      // ±3 pt up / down
    rotate: Math.round((unit(seed, 3) * 5 - 2.5) * 10) / 10, // ±2.5°
    scale: Math.round((0.92 + unit(seed, 4) * 0.14) * 100) / 100, // 92%-106%
  };
}
