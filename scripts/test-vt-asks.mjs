// 🔥 Every open ask from vendor tracking is a priority (lib/vt-asks.ts): status update requests, corrections, notices
// (any kind of email) where Lewis / Gafur wrote last; answered threads and ones marked handled after are off. Then the
// real conversations (when the key is on this computer): Lewis's waiting asks all come out.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const src = fs.readFileSync(new URL("../lib/vt-asks.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", js)(m, m.exports, createRequire(import.meta.url));
const { vtAsks } = m.exports;
const msg = (at, from, mine = false) => ({ at, from, mine, hpd: !mine, subject: "x", text: "", files: [] });
const threads = [
  { id: "a", subject: "OMO#ER07717- STATUS UPDATE REQUEST", omos: ["ER07717"], kind: "message", waiting: true, messages: [msg("2026-10-28T15:54:00Z", "Joy-Ann Lewis"), msg("2026-10-29T11:56:00Z", "Joy-Ann Lewis")] },
  { id: "b", subject: "Status Update", omos: ["EP11387", "EQ14718"], kind: "correction", waiting: true, messages: [msg("2026-10-28T11:47:00Z", "Deoranie Gafur")] },
  { id: "c", subject: "answered", omos: ["ER01111"], kind: "message", waiting: false, messages: [msg("2026-10-20T10:00:00Z", "Joy-Ann Lewis"), msg("2026-10-20T12:00:00Z", "You", true)] },
  { id: "d", subject: "handled", omos: ["ER02222"], kind: "message", waiting: true, messages: [msg("2026-10-21T10:00:00Z", "Joy-Ann Lewis")] },
  { id: "e", subject: "auto", omos: ["ER03333"], kind: "rejection", waiting: true, messages: [msg("2026-10-21T10:00:00Z", "Department of Housing Preservation")] },
];
const asks = vtAsks(threads, { ER02222: "2026-10-22T00:00:00Z" });
assert.deepEqual(asks.map((a) => a.omo), ["EP11387", "EQ14718", "ER07717"]);
assert.equal(asks.find((a) => a.omo === "ER07717").who, "Lewis");
assert.equal(asks.find((a) => a.omo === "EP11387").who, "Gafur");
// Sent after their email = closed out: by the sent list, or our own email with the job's AFF INVOICE PDF.
assert.deepEqual(vtAsks(threads, {}, { EP11387: { sentAt: "2026-10-30T00:00:00Z" } }).map((a) => a.omo), ["ER02222", "EQ14718", "ER07717"]);
const withPdf = [...threads, { id: "f", subject: "sent", omos: ["ER07717"], kind: "message", waiting: false, messages: [msg("2026-10-30T10:00:00Z", "You", true)] }];
withPdf[5].messages[0].files = ["ER07717 AFF INVOICE.pdf"];
assert.ok(!vtAsks(withPdf).some((a) => a.omo === "ER07717"), "our AFF INVOICE email after her ask");
let real = "";
try {
  const { readFileSync } = fs;
  const keyText = process.env.HPD_PRIVATE_DATA_KEY || readFileSync(new URL("../data/private/HPD_PRIVATE_DATA_KEY.txt", import.meta.url), "utf8");
  const crypto = await import("node:crypto");
  const buf = readFileSync(new URL("../public/private/conversations.json.enc", import.meta.url));
  const key = Buffer.from(keyText.trim(), "base64");
  const iv = buf.subarray(0, 12), tag = buf.subarray(buf.length - 16), body = buf.subarray(12, buf.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv); d.setAuthTag(tag);
  const conv = JSON.parse(Buffer.concat([d.update(body), d.final()]).toString("utf8"));
  const r = vtAsks(conv.threads);
  real = ` · real email: ${r.length} jobs waiting on you (${r.filter((a) => a.who === "Lewis").length} Lewis, ${r.filter((a) => a.who === "Gafur").length} Gafur), oldest ${r[0]?.omo} ${r[0]?.at.slice(0, 10)}`;
} catch (e) { real = ` · real email not checked (${e.message.slice(0, 60)})`; }
console.log(`PASS vendor tracking asks: any email kind where Lewis / Gafur wrote last is a priority; answered / handled / automatic ones are off${real}`);
