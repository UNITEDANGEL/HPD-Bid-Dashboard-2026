// 💬 Tenant answers in the chat: the answer the helper offers for a tenant's text without a day and time.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.resolve('lib/tenant-reply.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
const { suggestTenantReply: s } = mod.exports;
assert.match(s('Yes I am home most days'), /^Thank you! What day and time works for you\?/);
assert.match(s("Sorry I can't this week"), /^No problem\. What day and time works better/);
assert.match(s('Who is this?'), /^This is United Angel Construction/);
assert.match(s('The super already fixed it'), /^Thank you for letting us know/);
assert.equal(s('Wrong number, stop texting me'), '');
assert.match(s('hmm'), /^Thank you\. What day and time works for you for the repair\?$/);
console.log('tenant reply ok');
