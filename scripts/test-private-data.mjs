// Private files (tenant names / phones): stored encrypted, opened only for the signed-in owner.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handlePrivate, decryptPrivate } from "../server/private-data.mjs";

const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hpd-private-"));
// Encrypted by the Python helper the fetcher uses.
fs.writeFileSync(path.join(dir, "in.json"), JSON.stringify({ EQ1: { TenantName: "TEST TENANT", TenantPhone: "000-000-0000" } }));
execFileSync("python", ["-I", path.resolve("scripts/private_data.py"), path.join(dir, "in.json"), path.join(dir, "tenants.json.enc")], { env: { ...process.env, HPD_PRIVATE_DATA_KEY: key } });
const enc = fs.readFileSync(path.join(dir, "tenants.json.enc"));
assert.ok(!enc.toString("latin1").includes("TEST TENANT"), "not readable as stored");
assert.equal(JSON.parse(new TextDecoder().decode(await decryptPrivate(enc, key))).EQ1.TenantName, "TEST TENANT");
const pdf = Buffer.from("%PDF-1.7 test invitation");
execFileSync("python", ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(path.resolve("scripts"))}); import private_data as p; open(${JSON.stringify(path.join(dir, "a.pdf.enc"))}, "wb").write(p.encrypt_bytes(${JSON.stringify(pdf.toString())}.encode(), ${JSON.stringify(key)}))`]);
const files = { "/private/tenants.json.enc": enc, "/private/itb/ER1_1.pdf.enc": fs.readFileSync(path.join(dir, "a.pdf.enc")) };
const env = { HPD_PRIVATE_DATA_KEY: key, ASSETS: { fetch: async (u) => (files[new URL(u).pathname] ? new Response(files[new URL(u).pathname]) : new Response("", { status: 404 })) } };
const req = (p) => new Request(`https://example.test/api/private/${p}`);
const yes = async () => true, no = async () => false;
assert.equal((await handlePrivate(req("tenants"), env, no)).status, 401, "not signed in");
const ok = await handlePrivate(req("tenants"), env, yes);
assert.equal(ok.status, 200);
assert.match(ok.headers.get("Cache-Control"), /no-store/);
assert.equal((await ok.json()).EQ1.TenantPhone, "000-000-0000");
const p = await handlePrivate(req("itb/ER1_1.pdf"), env, yes);
assert.equal(p.headers.get("Content-Type"), "application/pdf");
assert.equal(Buffer.from(await p.arrayBuffer()).toString(), pdf.toString());
assert.equal((await handlePrivate(req("itb/../tenants.json.pdf"), env, yes)).status, 404, "no path tricks");
assert.equal((await handlePrivate(req("itb/missing.pdf"), env, yes)).status, 404);
assert.equal((await handlePrivate(req("other"), env, yes)).status, 404);
assert.equal((await handlePrivate(req("tenants"), { ...env, HPD_PRIVATE_DATA_KEY: "" }, yes)).status, 503);
assert.equal((await handlePrivate(new Request("https://example.test/api/private/tenants", { method: "POST" }), env, yes)).status, 405);
const wrongKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
assert.equal((await handlePrivate(req("tenants"), { ...env, HPD_PRIVATE_DATA_KEY: wrongKey }, yes)).status, 500, "wrong key can't open it");
console.log("PASS private data: encrypted at rest (Python helper), owner sign-in required, no-store, PDF + tenants, path tricks / wrong key / no key refused");
