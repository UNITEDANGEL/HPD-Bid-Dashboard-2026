const fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm'), assert = require('node:assert/strict');
const text = fs.readFileSync('app/field-command/FieldCommandClient.tsx', 'utf8');
const ast = ts.createSourceFile('client.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let fn;
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'chooseMediaSource') fn = node; ts.forEachChild(node, visit); }
visit(ast);
assert.ok(fn);
const calls = [];
const context = { mediaChoice:'before', mediaBusy:'', pendingMediaKindRef:{current:null}, setMediaChoice: value => calls.push(['choice',value]) };
for (const name of ['cameraInputRef','mediaInputRef','videoCameraInputRef','videoLibraryInputRef']) context[name] = {current:{click:()=>calls.push(name)}};
vm.createContext(context);
vm.runInContext(ts.transpileModule(fn.getText(ast), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
for (const kind of ['before','after']) for (const [source,ref] of [['camera','cameraInputRef'],['library','mediaInputRef'],['video-camera','videoCameraInputRef'],['video-library','videoLibraryInputRef']]) {
  context.mediaChoice = kind; calls.length = 0;
  context.chooseMediaSource(source);
  assert.equal(context.pendingMediaKindRef.current,kind);
  assert.equal(calls[0],ref);
}
calls.length = 0; context.mediaBusy = 'before'; context.chooseMediaSource('video-camera'); assert.equal(calls.length,0);
assert.ok(text.includes('ref={videoCameraInputRef} type="file" accept="video/*" capture="environment"'));
assert.ok(text.includes('ref={videoLibraryInputRef} type="file" accept="video/*,.mov,.mp4,.m4v,.webm" multiple'));
console.log('PASS: before/after photo and video routing, record/upload inputs and busy protection');
const packageText = fs.readFileSync('app/paperwork/page.tsx', 'utf8');
const packageAst = ts.createSourceFile('page.tsx', packageText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const pathFn = packageAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'fullPackageMediaPath');
assert.ok(pathFn);
const paths = {fieldEvidenceKindClass: value => value.replace(/_/g,'-'), zipSafePart:value=>value, safeFilename:value=>value, mediaExtension:()=>'.mp4', safeAttachmentName:(name,fallback)=>name||fallback};
vm.createContext(paths);
vm.runInContext(ts.transpileModule(pathFn.getText(packageAst), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, paths);
for (const kind of ['before','after']) {
  const result = paths.fullPackageMediaPath('TEST-VIDEO',{kind,mediaType:'video',name:'TEST-VIDEO.mp4',evidenceLabel:kind},0,'test');
  assert.ok(result.startsWith(`videos/${kind}/`));
  assert.ok(result.includes('TEST-VIDEO.mp4'));
}
console.log('PASS: real package path keeps before and after videos in distinct folders');
