const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../lib/override-sync.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const store = new Map();
global.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
const mod = { exports: {} };
new Function('exports', 'module', source)(mod.exports, mod);
const { mergeOverrideEntry, mergeOverrideMaps, queueOverrideSync, readOutbox, flushOverrideOutbox, LOCAL_OVERRIDES_KEY } = mod.exports;

(async () => {
  // The bug: the server held only the package fields; the whole-entry replace hid the phone's outcome.
  const local = { FieldOutcome: 'WORK_COMPLETED', PackageReviewStatus: 'Pending', updatedAt: '2026-10-05T10:00:00Z' };
  const server = { PackageApprovedAt: '2026-10-05T11:00:00Z', PackageReviewStatus: 'Approved', OMO: 'ER1', updatedAt: '2026-10-05T11:00:01Z' };
  const merged = mergeOverrideEntry(local, server);
  assert.equal(merged.FieldOutcome, 'WORK_COMPLETED', 'the phone outcome survives');
  assert.equal(merged.PackageReviewStatus, 'Approved', 'the newer server value wins');
  // A newer step on the phone wins over an older server value.
  assert.equal(mergeOverrideEntry({ FieldOutcome: 'NO_ACCESS_1_WAITING_72H', updatedAt: '2026-10-06T09:00:00Z' }, { FieldOutcome: '', updatedAt: '2026-10-05T12:00:00Z' }).FieldOutcome, 'NO_ACCESS_1_WAITING_72H');
  // Start over from the server (newer, explicit blanks) clears the phone's old values.
  assert.equal(mergeOverrideEntry({ FieldOutcome: 'WORK_COMPLETED', updatedAt: '2026-10-05T10:00:00Z' }, { FieldOutcome: '', updatedAt: '2026-10-05T12:00:00Z' }).FieldOutcome, '');
  // Waiting in the outbox: the phone keeps its values even if the server's clock is newer.
  assert.equal(mergeOverrideEntry({ FieldOutcome: 'REFUSED_ACCESS', updatedAt: '2026-10-05T10:00:00Z' }, { FieldOutcome: '', updatedAt: '2026-10-05T12:00:00Z' }, true).FieldOutcome, 'REFUSED_ACCESS');
  const maps = mergeOverrideMaps({ A: { x: 1, updatedAt: '2026-01-01' } }, { B: { y: 2 } }, {});
  assert.deepEqual(Object.keys(maps).sort(), ['A', 'B']);

  // Outbox: no signal -> stays queued; back online -> the FULL saved entry is sent, then removed.
  store.set(LOCAL_OVERRIDES_KEY, JSON.stringify({ ER1: { FieldOutcome: 'WORK_COMPLETED', FieldVisitHistory: [{ note: 'Arrived' }], updatedAt: '2026-10-05T10:00:00Z' } }));
  queueOverrideSync('ER1');
  assert.ok(readOutbox().ER1);
  let result = await flushOverrideOutbox('https://worker.test', async () => { throw new Error('offline'); });
  assert.deepEqual(result, { sent: 0, waiting: 1 });
  const posts = [];
  result = await flushOverrideOutbox('https://worker.test/', async (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return { ok: true }; });
  assert.deepEqual(result, { sent: 1, waiting: 0 });
  assert.equal(posts[0].url, 'https://worker.test/override');
  assert.equal(posts[0].body.key, 'ER1');
  assert.equal(posts[0].body.patch.FieldOutcome, 'WORK_COMPLETED');
  assert.equal(posts[0].body.patch.FieldVisitHistory[0].note, 'Arrived', 'the full entry is sent, not just the last change');
  // A server error keeps it queued.
  queueOverrideSync('ER1');
  result = await flushOverrideOutbox('https://worker.test', async () => ({ ok: false }));
  assert.deepEqual(result, { sent: 0, waiting: 1 });
  // Saved again while sending: stays queued for the next run.
  result = await flushOverrideOutbox('https://worker.test', async () => { await new Promise((r) => setTimeout(r, 5)); return { ok: true }; });
  queueOverrideSync('ER1');
  // Server entries are folded into the phone's copy, so the next full send keeps them.
  const { adoptServerOverrides, readLocalOverrides } = mod.exports;
  store.set('hpd-override-outbox-v1', '{}');
  store.set(LOCAL_OVERRIDES_KEY, JSON.stringify({ ER2: { FieldOutcome: 'WORK_COMPLETED', updatedAt: '2026-10-05T10:00:00Z' } }));
  adoptServerOverrides({ ER2: { PackageDriveLink: 'https://drive.example/x', updatedAt: '2026-10-05T11:00:00Z' }, ER3: { FieldOutcome: 'REFUSED_ACCESS', updatedAt: '2026-10-01T00:00:00Z' } });
  const adopted = readLocalOverrides();
  assert.equal(adopted.ER2.FieldOutcome, 'WORK_COMPLETED');
  assert.equal(adopted.ER2.PackageDriveLink, 'https://drive.example/x');
  assert.equal(adopted.ER3.FieldOutcome, 'REFUSED_ACCESS');
  assert.deepEqual(Object.keys(readOutbox()), [], 'adopting never queues a send');
  console.log('PASS override sync: field-by-field merge (newer wins, outbox keeps phone values), offline queue, full-entry send');
})().catch((error) => { console.error(error); process.exit(1); });
