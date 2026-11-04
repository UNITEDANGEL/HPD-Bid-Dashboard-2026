// 🌎 Spanish (4 Nov): a Spanish question is told apart from English (accents, ¿, common words), so the robot answers and
// speaks in Spanish; English with one Spanish-looking word stays English.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.resolve('lib/speak.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
const { langOf } = mod.exports;
for (const es of ['¿Cuántos trabajos tengo hoy?', 'que tengo para mañana', 'dime los avisos de la semana', 'Cuántas ofertas mandé hoy']) assert.equal(langOf(es), 'es', es);
for (const en of ['what do I have today', 'How many bids did I send this week?', 'read me the job at 1 Mi Casa St', 'take me there']) assert.equal(langOf(en), 'en', en);
console.log('lang ok: Spanish questions found by accents, ¿ and common words; English stays English');
