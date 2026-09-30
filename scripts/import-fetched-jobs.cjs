const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const idOf = row => String(row.OMO || row.id || '').trim().toUpperCase();
function mergeNewJobs(existing, incoming) {
  assert.ok(Array.isArray(existing) && Array.isArray(incoming), 'Expected job arrays');
  const ids = new Set(existing.map(idOf));
  assert.equal(ids.size, existing.length, 'Existing job IDs must be unique');
  assert.ok(!ids.has(''), 'Missing existing job ID');
  const seen = new Set();
  const added = [];
  for (const row of incoming) {
    const id = idOf(row);
    assert.ok(id && !seen.has(id), 'Missing or duplicate incoming job ID');
    seen.add(id);
    if (ids.has(id)) continue;
    const lat = Number(row.Latitude || row.latitude);
    const lon = Number(row.Longitude || row.longitude);
    assert.ok(lat > 40 && lat < 41 && lon > -75 && lon < -73, `Invalid coordinates: ${id}`);
    assert.ok(String(row.BuildingAddress || row.Address || row.address || '').trim(), `Missing address: ${id}`);
    added.push(row);
  }
  return { jobs: [...existing, ...added], added: added.map(idOf) };
}

if (require.main === module) {
  const source = process.argv[2];
  assert.ok(source, 'Pass the successful fetch data directory');
  const status = JSON.parse(fs.readFileSync(path.join(source, 'fetcher_latest_status.json'), 'utf8'));
  assert.ok(status.ok === true && status.state === 'complete' && status.lastSuccessfulFetchAt, 'Fetch must complete successfully before import');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const existing = read('data/COA_Fetcher_2026.json');
  assert.deepEqual(existing, read('public/data/COA_Fetcher_2026.json'), 'App data copies differ; refusing to overwrite');
  const result = mergeNewJobs(existing, read(path.join(source, 'COA_Fetcher_2026.json')));
  console.log(JSON.stringify({ before: existing.length, after: result.jobs.length, added: result.added }));
  if (process.argv.includes('--write')) {
    for (const dir of ['data', 'public/data']) {
      fs.writeFileSync(path.join(dir, 'COA_Fetcher_2026.json'), JSON.stringify(result.jobs, null, 2) + '\n');
      fs.writeFileSync(path.join(dir, 'fetcher_latest_status.json'), JSON.stringify(status, null, 2) + '\n');
    }
  }
}
module.exports = { mergeNewJobs };
