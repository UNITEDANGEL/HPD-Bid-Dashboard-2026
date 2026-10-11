const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
const mod = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync('lib/building-photo.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(mod.exports);
const { buildingPhoto, streetViewLink, BUILDING_PHOTO_LABEL } = mod.exports;
const photo = { kind: 'general', mediaType: 'image', evidenceLabel: BUILDING_PHOTO_LABEL, capturedAt: '2026-09-30T10:00:00Z' };
assert.equal(buildingPhoto([]), null);
assert.equal(buildingPhoto([{ ...photo, kind: 'before' }]), null);
assert.equal(buildingPhoto([{ ...photo, mediaType: 'video' }]), null);
const newer = { ...photo, capturedAt: '2026-09-30T11:00:00Z' };
const rows = [photo, newer];
assert.equal(buildingPhoto(rows), newer);
assert.equal(rows[0], photo);
const url = new URL(streetViewLink({ lat: 40.7, lng: -73.9 }));
assert.equal(url.origin, 'https://www.google.com');
assert.equal(url.searchParams.get('map_action'), 'pano');
assert.equal(url.searchParams.get('viewpoint'), '40.7,-73.9');
assert.equal(url.searchParams.get('api'), '1');
{
  const facing = new URL(streetViewLink({ lat: 40.7, lng: -73.9 }, 'PANO1', 123.6));
  assert.equal(facing.searchParams.get('map_action'), 'pano');
  assert.equal(facing.searchParams.get('pano'), 'PANO1');
  assert.equal(facing.searchParams.get('heading'), '124');
}
for (const point of [null, {lat:NaN,lng:1}, {lat:91,lng:1}, {lat:1,lng:181}, {lat:0,lng:0}]) assert.equal(streetViewLink(point), null);
console.log('PASS: building photos remain separate from work evidence; latest selection and Street View validation');
