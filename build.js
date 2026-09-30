const fs = require('fs');
const path = require('path');

const root = __dirname;
const dist = path.join(root, 'dist');
const assets = path.join(dist, 'assets');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(assets, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));
fs.copyFileSync(
  path.join(root, 'node_modules', 'lightweight-charts', 'dist', 'lightweight-charts.standalone.production.js'),
  path.join(assets, 'lightweight-charts.standalone.production.js')
);
console.log('Built Rosetta T11 static site in dist/');
