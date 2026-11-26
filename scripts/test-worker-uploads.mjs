// 👷 Worker -> job card (25 Nov): the short pass, the worker's upload (only with a pass, only into that job's folder,
// labeled BEFORE / AFTER) and the owner's list / download / mark. No network: Google is faked.
import assert from "node:assert/strict";
import { makePass, checkPass, handleWorkerPublic, handleWorkerOwner } from "../server/worker-uploads.mjs";

const env = { HPD_DRIVE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url") };
const pass = await makePass(env, "ER08795");
assert.ok(pass.length <= 30, `short pass for a WhatsApp link: ${pass}`);
assert.equal(await checkPass(env, "ER08795", pass), true);
assert.equal(await checkPass(env, "ER08796", pass), false, "another job: no");
assert.equal(await checkPass(env, "ER08795", pass.slice(0, -1) + (pass.endsWith("A") ? "B" : "A")), false, "changed: no");
assert.equal(await checkPass(env, "ER08795", pass, Date.now() + 60 * 86400000), false, "ends after 45 days");
assert.equal(await checkPass(env, "ER08795", ""), false);

// Fake Drive: folders + files with appProperties.
const files = [];
let nextId = 1000000000;
const fake = async (url, opt = {}) => {
  const u = new URL(url);
  const method = opt.method || "GET";
  if (u.pathname === "/drive/v3/files" && method === "GET") {
    const q = u.searchParams.get("q");
    const kind = /value='([^']+)'/.exec(q)?.[1];
    const parent = /'([A-Za-z0-9_-]+)' in parents/.exec(q)?.[1];
    const name = /name = '([^']+)'/.exec(q)?.[1];
    const found = files.filter((f) => (f.appProperties.hpdKind === kind || f.appProperties.hpdMediaId === kind) && (!parent || f.parents?.includes(parent)) && (!name || f.name === name));
    return Response.json({ files: found });
  }
  if (u.pathname === "/drive/v3/files" && method === "POST") {
    const b = JSON.parse(opt.body); const f = { id: String(nextId++), ...b, ownedByMe: true }; files.push(f); return Response.json({ id: f.id });
  }
  if (u.pathname === "/upload/drive/v3/files") {
    const b = JSON.parse(opt.body); const f = { id: String(nextId++), ...b, mimeType: opt.headers["X-Upload-Content-Type"], ownedByMe: true }; files.push(f);
    return new Response(null, { status: 200, headers: { Location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=up${f.id}` } });
  }
  const m = /^\/drive\/v3\/files\/(\d+)$/.exec(u.pathname);
  if (m) {
    const f = files.find((x) => x.id === m[1]);
    if (!f) return new Response("", { status: 404 });
    if (u.searchParams.get("alt") === "media") return new Response("JPEGBYTES", { headers: { "Content-Type": f.mimeType } });
    if (method === "PATCH") { Object.assign(f.appProperties, JSON.parse(opt.body).appProperties); return Response.json({ id: f.id }); }
    return Response.json(f);
  }
  if (u.hostname.endsWith(".workers.dev") && u.pathname === "/override") { stamps.push(JSON.parse(opt.body)); return Response.json({ ok: true }); }
  throw new Error(`unexpected ${method} ${url}`);
};
const stamps = [];
const up = (headers, body) => new Request("https://app.example.test/api/drive/worker-start", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const photo = { mediaId: "w-1", size: 1234, mimeType: "image/jpeg", side: "before", n: 1, takenAt: "2026-11-20T15:00:00Z" };

let r;
r = await handleWorkerPublic(up({ "X-HPD-Job": "ER08795" }, photo), "worker-start", env, fake, async () => "tok");
assert.equal(r.status, 403, "no pass: no upload");
r = await handleWorkerPublic(up({ "X-HPD-Job": "ER08796", "X-HPD-Pass": pass }, photo), "worker-start", env, fake, async () => "tok");
assert.equal(r.status, 403, "pass for another job: no upload");
r = await handleWorkerPublic(up({ "X-HPD-Job": "ER08795", "X-HPD-Pass": pass }, { ...photo, mimeType: "text/html" }), "worker-start", env, fake, async () => "tok");
assert.equal(r.status, 400, "only photos and videos");
r = await handleWorkerPublic(up({ "X-HPD-Job": "ER08795", "X-HPD-Pass": pass }, photo), "worker-start", env, fake, async () => "");
assert.equal(r.status, 503, "owner's sign-in missing: clear message");
assert.match((await r.json()).error, /boss/);
r = await handleWorkerPublic(up({ "X-HPD-Job": "ER08795", "X-HPD-Pass": pass }, photo), "worker-start", env, fake, async () => "tok");
assert.equal(r.status, 200);
assert.match((await r.json()).session, /upload_id=/);
assert.equal(stamps.length, 0, "no announce: the status server isn't written");
r = await handleWorkerPublic(up({ "X-HPD-Job": "ER08795", "X-HPD-Pass": pass }, { ...photo, mediaId: "w-2", mimeType: "video/quicktime", side: "after", n: 1, takenAt: "2026-11-21T02:30:00Z" }), "worker-start", env, fake, async () => "tok");
assert.equal(r.status, 200);
const job = files.find((f) => f.appProperties.hpdKind === "hpd-worker-job");
assert.equal(job.name, "ER08795");
assert.equal(files.find((f) => f.appProperties.hpdKind === "hpd-worker-root").name, "HPD Worker Uploads");
const names = files.filter((f) => f.appProperties.hpdKind === "hpd-worker-file").map((f) => f.name);
assert.deepEqual(names, ["ER08795 BEFORE photo 1 2026-11-20.jpg", "ER08795 AFTER video 1 2026-11-20.mov"], "labeled Before / After + the day taken (New York) in the name");
// The same file again (phone retried): not twice.
r = await handleWorkerPublic(up({ "X-HPD-Job": "ER08795", "X-HPD-Pass": pass }, photo), "worker-start", env, fake, async () => "tok");
assert.equal((await r.json()).done, true);
assert.equal(files.filter((f) => f.appProperties.hpdKind === "hpd-worker-file").length, 2);
// The worker opens the link again later: the phone starts counting at 1, the server keeps going.
r = await handleWorkerPublic(up({ "X-HPD-Job": "ER08795", "X-HPD-Pass": pass }, { ...photo, mediaId: "w-3", n: 1 }), "worker-start", env, fake, async () => "tok");
assert.equal(r.status, 200);
r = await handleWorkerPublic(up({ "X-HPD-Job": "ER08795", "X-HPD-Pass": pass }, { ...photo, mediaId: "w-4", n: 1, side: "after", mimeType: "image/jpeg" }), "worker-start", env, fake, async () => "tok");
assert.deepEqual(files.filter((f) => f.appProperties.hpdKind === "hpd-worker-file").slice(2).map((f) => f.name),
  ["ER08795 BEFORE photo 2 2026-11-20.jpg", "ER08795 AFTER photo 1 2026-11-20.jpg"], "numbers keep going per Before / After and photo / video");
// 📍 Where it was taken: in the name, numbered per spot, kept for the job card's stamp.
for (const [mid, where] of [["w-5", "kitchen"], ["w-6", "Kitchen"], ["w-7", "Bathroom<script>"]]) {
  r = await handleWorkerPublic(up({ "X-HPD-Job": "ER08795", "X-HPD-Pass": pass }, { ...photo, mediaId: mid, n: 1, where }), "worker-start", env, fake, async () => "tok");
  assert.equal(r.status, 200);
}
assert.deepEqual(files.filter((f) => ["w-5", "w-6", "w-7"].includes(f.appProperties.hpdMediaId)).map((f) => [f.name, f.appProperties.hpdWhere]),
  [["ER08795 BEFORE Kitchen photo 1 2026-11-20.jpg", "Kitchen"], ["ER08795 BEFORE Kitchen photo 2 2026-11-20.jpg", "Kitchen"], ["ER08795 BEFORE Bathroomscript photo 1 2026-11-20.jpg", "Bathroomscript"]]);
for (const mid of ["w-5", "w-6", "w-7"]) files.splice(files.findIndex((f) => f.appProperties.hpdMediaId === mid), 1);
files.splice(files.findIndex((f) => f.appProperties.hpdMediaId === "w-3"), 1);
files.splice(files.findIndex((f) => f.appProperties.hpdMediaId === "w-4"), 1);

// Owner: list, download, mark on the card.
const own = (body) => new Request("https://app.example.test/api/drive/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
let kept = 0;
r = await handleWorkerOwner(own({ jobId: "ER08795" }), "worker-ticket", {}, fake, env, async () => { kept++; });
assert.equal(kept, 1, "keeps the owner's access for the uploads");
assert.equal(await checkPass(env, "ER08795", (await r.json()).pass), true);
r = await handleWorkerOwner(own({ jobId: "ER08795" }), "worker-list", {}, fake, env, async () => {});
const list = (await r.json()).files;
assert.ok(list.every((f) => f.where === ""), "no spot: empty");
assert.deepEqual(list.map((f) => [f.side, f.mimeType, f.done, f.taken]), [["before", "image/jpeg", false, "2026-11-20T15:00:00.000Z"], ["after", "video/quicktime", false, "2026-11-21T02:30:00.000Z"]]);
r = await handleWorkerOwner(own({ fileId: list[0].id }), "worker-file", {}, fake, env, async () => {});
assert.equal(await r.text(), "JPEGBYTES");
r = await handleWorkerOwner(own({ fileId: job.id }), "worker-file", {}, fake, env, async () => {});
assert.equal(r.status, 403, "only worker uploads can be read this way");
r = await handleWorkerOwner(own({ fileIds: list.map((f) => f.id) }), "worker-done", {}, fake, env, async () => {});
assert.equal(r.status, 200);
r = await handleWorkerOwner(own({ jobId: "ER08795" }), "worker-list", {}, fake, env, async () => {});
assert.ok((await r.json()).files.every((f) => f.done), "marked: on the job card");
r = await handleWorkerOwner(own({ jobId: "ER09999" }), "worker-list", {}, fake, env, async () => {});
assert.deepEqual((await r.json()).files, [], "no folder yet: nothing");
// 📸 New worker photos (plan item 43): the visit's first photo stamps the job (number + time only).
r = await handleWorkerPublic(up({ "X-HPD-Job": "ER08795", "X-HPD-Pass": pass }, { ...photo, mediaId: "w-ann", announce: true }), "worker-start", env, fake, async () => "tok");
assert.equal(r.status, 200);
assert.equal(stamps.length, 1, "announce: one stamp");
assert.equal(stamps[0].key, "ER08795");
assert.deepEqual(Object.keys(stamps[0].patch), ["WorkerNewAt"], "only the time, nothing private");
assert.ok(Date.parse(stamps[0].patch.WorkerNewAt) > Date.now() - 60000);
console.log("worker upload tests passed");
