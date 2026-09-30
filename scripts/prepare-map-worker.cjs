const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'public', 'map-worker');
fs.mkdirSync(destination, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  fs.copyFileSync(path.join(root, 'node_modules', 'maplibre-gl', 'dist', file), path.join(destination, file));
}
console.log('Prepared same-origin MapLibre worker assets.');
