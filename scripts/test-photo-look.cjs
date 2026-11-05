// Unit test: the AI's sentence becomes a short job note, or nothing when no problem was seen.
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("fs");
const m = { exports: {} };
new Function("module", "exports", ts.transpileModule(fs.readFileSync("lib/photo-look.ts", "utf8"), { compilerOptions: { module: "commonjs", target: "es2020" } }).outputText)(m, m.exports);
const { lookNote, lookMessage } = m.exports;
assert.match(lookNote("The image shows a leak stain on the ceiling."), /^Photo shows: Leak stain on the ceiling$/);
assert.equal(lookNote("No problem seen."), "");
assert.equal(lookNote(""), "");
assert.match(lookMessage("cap"), /30 a day/);
assert.match(lookMessage("off"), /isn't switched on/);
console.log("photo look unit ok");
