// Every workflow that builds the app for Cloudflare passes the public map keys (18 Nov: "I do not see images of
// building any more"): the data fetcher rebuilt the live app every ~10 minutes without NEXT_PUBLIC_GOOGLE_MAPS_KEY,
// so the Street View picture on bids and job cards vanished.
import assert from "node:assert/strict";
import fs from "node:fs";

const dir = ".github/workflows";
let checked = 0;
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".yml"))) {
  const s = fs.readFileSync(`${dir}/${f}`, "utf8");
  if (!/npm run build:cloudflare/.test(s) || !/pages deploy out --project-name=hpd-bid-dashboard-2026 --branch/.test(s)) continue;
  for (const key of ["NEXT_PUBLIC_GOOGLE_MAPS_KEY", "NEXT_PUBLIC_MAPTILER_KEY"]) {
    assert.ok(s.includes(`${key}: ${"${{"} secrets.${key} }}`), `${f} builds the live app without ${key}`);
  }
  checked += 1;
}
assert.ok(checked >= 2, `found the deploys (${checked})`);
console.log(`PASS every live build (${checked} workflows) has the Google picture key and the map key`);
