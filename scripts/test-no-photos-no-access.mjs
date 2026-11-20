// No access / Refused access visits need no photos or videos (owner, 20 Nov).
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hpd-np-"));
fs.writeFileSync(path.join(dir, "pc.mjs"), ts.transpileModule(fs.readFileSync("lib/photo-checklist.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { photoChecklist, photosStillNeeded, checklistLine } = await import(pathToFileURL(path.join(dir, "pc.mjs")).href);

for (const o of ["NO_ACCESS", "REFUSED_ACCESS", "no_access"]) {
  assert.equal(photosStillNeeded({ before: 0, after: 0 }, o).left, 0);
  assert.equal(photoChecklist({ before: 0, after: 0 }, o).length, 0);
  assert.match(checklistLine([], o), /No photos needed/);
}
assert.equal(photosStillNeeded({ before: 0, after: 0 }, "WORK_COMPLETED").left, 8);
assert.equal(photosStillNeeded({ before: 0, after: 0 }).left, 8);
assert.equal(photoChecklist({ before: 0, after: 0 }).length, 4);
fs.rmSync(dir, { recursive: true, force: true });
console.log("no-photos-for-no-access tests passed");
