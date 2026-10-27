// Browser tests run against a plain static server (no Pages Functions): answer /api/private/* the way the
// signed-in route does (server/private-data.mjs), by decrypting public/private/*.enc with HPD_PRIVATE_DATA_KEY
// (env in CI, data/private/HPD_PRIVATE_DATA_KEY.txt on the owner's PC). No key: the route answers 401, like a
// phone that isn't signed in.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
function key() {
  const file = path.join(ROOT, "data/private/HPD_PRIVATE_DATA_KEY.txt");
  const text = process.env.HPD_PRIVATE_DATA_KEY || (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
  const k = Buffer.from(text.trim(), "base64");
  return k.length === 32 ? k : null;
}
function open(file, k) {
  const buf = fs.readFileSync(file);
  const d = crypto.createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]);
}

// opts.conversations: change the decrypted HPD emails before the page gets them (e.g. add a fresh notice for a test).
// The What's new lines count as seen (no "🆕 New update" card over the screen); also for signed-out tests.
export async function markNewsSeen(context) {
  let news = [];
  try { news = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/whats-new.json"), "utf8")).versions.flatMap((v) => v.items); } catch { /* none */ }
  await context.addInitScript((items) => { try { if (!localStorage.getItem("hpd-whatsnew-seen")) localStorage.setItem("hpd-whatsnew-seen", JSON.stringify(items)); } catch { /* private mode */ } }, news.slice(0, 60));
}
export async function routePrivate(context, opts = {}) {
  const k = key();
  // The "🆕 New update includes…" card (27 Oct) shows on a reload; the What's new lines count as seen in the tests
  // (test-browser-newupdate sets its own).
  await markNewsSeen(context);
  await context.route(/\/api\/private\//, (route) => {
    if (!k) return route.fulfill({ status: 401, json: { error: "not signed in (test)" } });
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/api\/private\//, ""));
    const target = rel === "tenants" ? "tenants.json.enc" : rel === "notices" ? "notices.json.enc" : rel === "conversations" ? "conversations.json.enc" : rel === "search" ? "search.json.enc" : rel.startsWith("itb/") ? `itb/${rel.slice(4)}.enc` : rel.startsWith("itb-page/") ? `itb-pages/${rel.slice(9)}.enc` : rel.startsWith("notice/") ? `notices/${rel.slice(7)}.enc` : "";
    const file = target && path.join(ROOT, "public", "private", target);
    if (!file || rel.includes("..") || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "Not found" });
    const type = rel === "tenants" || rel === "notices" || rel === "conversations" || rel === "search" ? "application/json" : rel.endsWith(".png") ? "image/png" : "application/pdf";
    if (rel === "conversations" && opts.conversations) return route.fulfill({ status: 200, contentType: type, body: JSON.stringify(opts.conversations(JSON.parse(open(file, k).toString("utf8")))) });
    return route.fulfill({ status: 200, contentType: type, body: open(file, k) });
  });
}
