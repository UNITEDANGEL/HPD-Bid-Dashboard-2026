const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadFunctions(file, names) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(functions.length, names.length);
  const code = functions.map(node => node.getText(source)).join('\n');
  const context = vm.createContext({ Date, Intl });
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return context;
}

const record = loadFunctions('lib/jobs.ts', ['parseJobDate', 'formatDateForRecord']);
const card = loadFunctions('components/JobsMapBoard.tsx', ['usableDate', 'formatShortDate', 'formatJobCompletionDate']);
const map = loadFunctions('components/JobsMap.tsx', ['formatMapShortDate', 'maturityDateValue', 'mapMaturityLabel', 'mapMaturityShortLabel']);
let checks = 0;
for (const zone of ['America/New_York', 'UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
  process.env.TZ = zone;
  for (const [input, expected] of [
    ['2026-09-15', '2026-09-15'], ['9/15/26', '2026-09-15'],
    ['09/15/2026', '2026-09-15'], ['2026-03-08', '2026-03-08'],
    ['2026-11-01', '2026-11-01'], ['2024-02-29', '2024-02-29'],
    ['2026-01-01', '2026-01-01'],
  ]) {
    assert.equal(record.formatDateForRecord(record.parseJobDate(input), input), expected, `${zone}: ${input}`);
    assert.equal(card.formatShortDate(input), card.formatShortDate(expected));
    assert.equal(map.formatMapShortDate(input), map.formatMapShortDate(expected));
    checks += 3;
  }
  const job = { awardDate: '2026-09-15', startDate: '2026-09-16', completionDate: '2026-09-25' };
  assert.equal(map.mapMaturityLabel(job), 'Maturity Sep 25');
  assert.equal(card.formatJobCompletionDate(job), 'Sep 25, 2026');
  job.completionDate = '';
  assert.equal(map.mapMaturityLabel(job), 'Maturity unknown');
  assert.equal(map.mapMaturityShortLabel(job), 'No date');
  assert.equal(card.formatJobCompletionDate(job), 'Date unavailable');
  checks += 5;
}
console.log(`PASS: ${checks} date assertions across four timezones`);
