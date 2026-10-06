// Phone space levels: when the app warns that space is running low or almost full.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hpd-space-"));
fs.writeFileSync(path.join(dir, "phone-storage.mjs"), ts.transpileModule(fs.readFileSync("lib/phone-storage.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { storageLevel, formatBytes } = await import(path.join(dir, "phone-storage.mjs"));
const MB = 1024 * 1024, GB = 1024 * MB;

assert.equal(storageLevel(1 * GB, 10 * GB), "ok");
assert.equal(storageLevel(8 * GB, 10 * GB), "low");            // 80% used
assert.equal(storageLevel(1.6 * GB, 2 * GB), "low");           // 80% used
assert.equal(storageLevel(100 * MB, 550 * MB), "low");         // under 500 MB left
assert.equal(storageLevel(9.6 * GB, 10 * GB), "full");         // 96% used
assert.equal(storageLevel(10 * MB, 150 * MB), "full");         // under 150 MB left
assert.equal(storageLevel(0, 0), "ok");                        // not reported
assert.equal(formatBytes(1.25 * GB), "1.3 GB");
assert.equal(formatBytes(300 * MB), "300 MB");
assert.equal(formatBytes(2048), "2 KB");
console.log("PASS phone storage: low at 80% or under 500 MB left, full at 95% or under 150 MB left");
