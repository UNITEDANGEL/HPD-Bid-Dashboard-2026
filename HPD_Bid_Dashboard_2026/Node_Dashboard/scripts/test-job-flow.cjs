const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.createSourceFile('board.tsx', fs.readFileSync('components/JobsMapBoard.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const parts = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['selectedNextSiteAction', 'selectedPrimaryFlowLabel'].includes(node.name.getText(source))) {
    parts[node.name.getText(source)] = `var ${node.getText(source)};`;
  }
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'handleSelectedPrimaryFlow') parts.handler = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(Object.keys(parts).length, 3);
const code = ts.transpileModule(Object.values(parts).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const cases = [
  ['New job', {}, null, null, 'Arrive', 'Arrived On Site'],
  ['Arrived', { 'Arrived On Site': true }, null, null, 'Start', 'Work Started'],
  ['Started', { 'Arrived On Site': true, 'Work Started': true }, null, null, 'Outcome', 'expand'],
  ['Refused without starting', { 'Arrived On Site': true }, 'Refused Access', null, 'Generate documents', 'generate'],
  ['Existing outcome without visit stamps', {}, 'Work Completed', null, 'Generate documents', 'generate'],
  ['Package ready', {}, 'No Access', {}, 'Save & archive', 'archive'],
];
(async () => {
  for (const [name, events, outcome, docs, label, expected] of cases) {
    const calls = [];
    const context = vm.createContext({
      selected: { id: 'TEST-ONLY' }, selectedFlowEvents: events,
      selectedOutcome: outcome, selectedGeneratedDocs: docs,
      VISIT_STATUS_ACTIONS: [{ value: 'Arrived On Site' }, { value: 'Work Started' }],
      updateSelectedStatus: async value => calls.push(value),
      setJobSheetExpanded: value => { assert.equal(value, true); calls.push('expand'); },
      saveAndArchiveSelectedPackage: async () => calls.push('archive'),
      generateSelectedPackagePreview: async () => calls.push('generate'),
    });
    vm.runInContext(code, context);
    assert.equal(context.selectedPrimaryFlowLabel, label, name);
    await context.handleSelectedPrimaryFlow();
    assert.deepEqual(calls, [expected], name);
    context.selected = null;
    await context.handleSelectedPrimaryFlow();
    assert.equal(calls.length, 1, `${name}: no selection must do nothing`);
  }
  console.log('PASS: 6 workflow scenarios, 18 assertions; no live job writes');
})().catch(error => { console.error(error); process.exitCode = 1; });
