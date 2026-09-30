const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const moduleUnderTest = { exports: {} };
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/job-priority.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function('exports', 'module', source)(moduleUnderTest.exports, moduleUnderTest);
const { calendarDay, jobDate, jobPriority } = moduleUnderTest.exports;
const rows = JSON.parse(fs.readFileSync(process.argv[2] || path.join(__dirname, '../public/data/COA_Fetcher_2026.json'), 'utf8'));
const now = new Date(process.argv[3] || Date.now());
const invalid = [], chronology = [], bands = {};
for (const row of rows) {
  const dates = Object.fromEntries(['award', 'start', 'finish', 'maturity'].map(key => [key, calendarDay(jobDate(row, key))]));
  for (const [field, day] of Object.entries(dates)) if (day === null) invalid.push({ id: row.OMO, field, value: jobDate(row, field) });
  const issues = [];
  if (dates.start !== null && dates.finish !== null && dates.finish < dates.start) issues.push('finish_before_start');
  if (dates.award !== null && dates.finish !== null && dates.finish < dates.award) issues.push('finish_before_award');
  if (issues.length) chronology.push({ id: row.OMO, award: jobDate(row, 'award'), start: jobDate(row, 'start'), finish: jobDate(row, 'finish'), source: row.COAFile, issues });
  const priority = jobPriority(row, now);
  bands[priority.band] = (bands[priority.band] || 0) + 1;
}
console.log(JSON.stringify({ checkedAt: now.toISOString(), count: rows.length, uniqueIds: new Set(rows.map(row => row.OMO)).size, explicitMaturity: rows.filter(row => row.MaturityDate || row.maturityDate || row.DueDate || row.dueDate).length, invalid, chronology, bands, note: 'Chronology flags require COA source review; contract finish is the maturity fallback. No source data changed.' }, null, 2));
if (invalid.length || new Set(rows.map(row => row.OMO)).size !== rows.length) process.exitCode = 1;
