// Which jobs are safe to free on the phone: package saved to a Drive folder AND emailed.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hpd-free-"));
const source = fs.readFileSync("lib/free-space.ts", "utf8").replace(/^import .*$/gm, "");
fs.writeFileSync(path.join(dir, "free-space.mjs"), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { driveFolderId, sentJobs } = await import(path.join(dir, "free-space.mjs"));

assert.equal(driveFolderId("https://drive.google.com/drive/folders/package_folder_01"), "package_folder_01");
assert.equal(driveFolderId("https://drive.google.com/drive/folders/package_folder_01?usp=sharing"), "package_folder_01");
assert.equal(driveFolderId("https://example.com/x"), "");
assert.equal(driveFolderId(""), "");

const rows = {
  ER1: { PackageEmailedAt: "2026-10-06T15:00:00Z", PackageDriveLink: "https://drive.google.com/drive/folders/folder_er1_0001" },
  ER2: { PackageDriveLink: "https://drive.google.com/drive/folders/folder_er2_0001" },          // in Drive, not emailed
  ER3: { PackageEmailedAt: "2026-10-06T15:00:00Z" },                                             // emailed, no Drive folder
  ER4: { PackageEmailedAt: "2026-10-06T15:00:00Z", PackageDriveLink: "https://drive.example/F" }, // not a Drive folder
};
assert.deepEqual(sentJobs(JSON.stringify(rows)), [{ jobId: "ER1", folderId: "folder_er1_0001" }]);
assert.deepEqual(sentJobs(null), []);
assert.deepEqual(sentJobs("not json"), []);
console.log("PASS free space: only jobs saved to a Drive folder and emailed are freed");
