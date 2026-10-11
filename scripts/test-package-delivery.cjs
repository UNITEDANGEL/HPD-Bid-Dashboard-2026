// Synthetic files and a mocked /api/drive only: nothing is uploaded or emailed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { buildPackageEmail, deliverPackage, googleStatus, EMAIL_ATTACHMENT_LIMIT } = require(path.join(root, 'lib/package-delivery.ts'));

const bytes = (n, fill = 7) => new Uint8Array(n).fill(fill);
const pdf = { name: 'TEST-OMO-work-completed-affidavit-invoice.pdf', mimeType: 'application/pdf', bytes: bytes(1000, 1) };
const photo = { name: 'TEST-before.jpg', mimeType: 'image/jpeg', bytes: bytes(2000, 2) };
const video = { name: 'TEST-video.mp4', mimeType: 'video/mp4', bytes: bytes(3000, 3) };
const manifest = { name: 'PACKAGE-MANIFEST.txt', mimeType: 'text/plain', bytes: new TextEncoder().encode('manifest') };

// MIME body: text part + base64 attachments that decode back to the same bytes.
const email = buildPackageEmail('Hello ER05395 – done', [pdf, photo], 'hpd_boundary_test_01');
assert.ok(email.body.startsWith('--hpd_boundary_test_01\r\nContent-Type: text/plain; charset=UTF-8'));
assert.ok(email.body.trimEnd().endsWith('--hpd_boundary_test_01--'));
const sections = email.body.split('--hpd_boundary_test_01').slice(1, -1);
assert.equal(sections.length, 3);
const decode = section => Buffer.from(section.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64');
assert.equal(decode(sections[0]).toString('utf8'), 'Hello ER05395 – done');
assert.deepEqual([...decode(sections[2])], [...photo.bytes]);
assert.ok(email.body.split('\r\n').every(line => line.length <= 76 || line.startsWith('Content-')), 'base64 lines wrapped at 76');
assert.match(buildPackageEmail('x', [{ ...pdf, name: 'bad"\r\nBcc: a@b.c.pdf' }]).body, /filename="bad_Bcc: a@b.c.pdf"/);

function mockApi({ emailStatus = 200 } = {}) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/drive/session') return Response.json({ configured: true, connected: true, canEmail: true, email: 'owner@example.test' });
    if (url === '/api/drive/package-folder') return Response.json({ folderId: 'package_folder_01', link: 'https://drive.google.com/drive/folders/package_folder_01' });
    if (url === '/api/drive/package-file') return Response.json({ id: 'f', name: decodeURIComponent(options.headers['X-HPD-Name']) });
    if (url === '/api/drive/email-package') return emailStatus === 200 ? Response.json({ sent: true, to: ['owner@example.test'] }) : Response.json({ error: 'Gmail did not allow sending.' }, { status: emailStatus });
    throw new Error(url);
  };
  return { calls, fetcher };
}

(async () => {
  assert.deepEqual(await googleStatus(mockApi().fetcher), { configured: true, connected: true, canEmail: true, email: 'owner@example.test' });
  assert.equal((await googleStatus(async () => { throw new Error('offline'); })).connected, false);

  // Every file goes to Drive; the email carries the PDF, photos and videos, never the manifest.
  let api = mockApi();
  const progress = [];
  let result = await deliverPackage({ folderName: 'ER05395_pkg', files: [pdf, photo, video, manifest], emailSubject: 'ER05395 - Work Completed',
    emailText: (link, photos) => `Drive: ${link} photos=${photos}`, sendEmail: true, onProgress: m => progress.push(m) }, api.fetcher);
  assert.equal(result.uploaded, 4);
  assert.equal(result.folderLink, 'https://drive.google.com/drive/folders/package_folder_01');
  assert.equal(result.emailed, true);
  assert.equal(result.attachedPhotos, true);
  assert.equal(api.calls.filter(c => c.url === '/api/drive/package-file').length, 4);
  const sent = api.calls.find(c => c.url === '/api/drive/email-package');
  assert.equal(decodeURIComponent(sent.options.headers['X-HPD-Subject']), 'ER05395 - Work Completed');
  assert.match(sent.options.body, /TEST-OMO-work-completed-affidavit-invoice\.pdf/);
  assert.match(sent.options.body, /TEST-before\.jpg/);
  assert.match(sent.options.body, /TEST-video\.mp4/, 'videos are attached to the email');
  assert.ok(!/PACKAGE-MANIFEST/.test(sent.options.body));
  assert.equal(result.fileLinks['TEST-video.mp4'], 'https://drive.google.com/file/d/f/view');
  assert.ok(progress.some(m => /2 of 4/.test(m)) && progress.includes('Sending email...'));

  // Photos too big for one email: PDF only, text says photos are in Drive.
  api = mockApi();
  const big = { ...photo, bytes: bytes(EMAIL_ATTACHMENT_LIMIT, 4) };
  result = await deliverPackage({ folderName: 'x', files: [pdf, big], emailSubject: 's', emailText: (link, photos) => `photos=${photos}`, sendEmail: true }, api.fetcher);
  assert.equal(result.attachedPhotos, false);
  const bigBody = api.calls.find(c => c.url === '/api/drive/email-package').options.body;
  assert.ok(!bigBody.includes('TEST-before.jpg'));
  assert.equal(Buffer.from(bigBody.split('\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString(), 'photos=false');

  // A video too big to attach: not attached, but listed with its own Drive link.
  api = mockApi();
  const bigVideo = { ...video, bytes: bytes(EMAIL_ATTACHMENT_LIMIT, 5) };
  let summary;
  result = await deliverPackage({ folderName: 'x', files: [pdf, photo, bigVideo], emailSubject: 's', emailText: (link, photos, s) => { summary = s; return 'v'; }, sendEmail: true }, api.fetcher);
  assert.equal(summary.photos, 1);
  assert.equal(summary.videos, 0);
  assert.deepEqual(summary.linked, [{ name: 'TEST-video.mp4', url: 'https://drive.google.com/file/d/f/view' }]);
  assert.ok(!api.calls.find(c => c.url === '/api/drive/email-package').options.body.includes('filename="TEST-video.mp4"'));

  // Email failure keeps the Drive result and reports why.
  result = await deliverPackage({ folderName: 'x', files: [pdf], emailSubject: 's', emailText: () => 't', sendEmail: true }, mockApi({ emailStatus: 403 }).fetcher);
  assert.equal(result.emailed, false);
  assert.equal(result.folderLink, 'https://drive.google.com/drive/folders/package_folder_01');
  assert.match(result.emailError, /Gmail did not allow/);

  // Drive failure stops before email.
  const failing = async (url) => url === '/api/drive/package-folder' ? Response.json({ error: 'Sign in to Google Drive again.' }, { status: 401 }) : assert.fail(url);
  await assert.rejects(deliverPackage({ folderName: 'x', files: [pdf], emailSubject: 's', emailText: () => 't', sendEmail: true }, failing), /Sign in to Google Drive again/);

  console.log('Package delivery: all files to Drive, PDF + photos + videos emailed (too-big files linked), email and Drive errors reported.');
})().catch(error => { console.error(error); process.exit(1); });
