import fs from 'node:fs';
import path from 'node:path';
fs.rmSync('dist',{recursive:true,force:true});
fs.mkdirSync('dist/assets',{recursive:true});
fs.mkdirSync('dist/manifests',{recursive:true});
for (const f of ['index.html','t11.html','t11-renderer.js']) fs.copyFileSync(f,path.join('dist',f));
for (const f of fs.readdirSync('manifests')) if (f.endsWith('.json')) fs.copyFileSync(path.join('manifests',f),path.join('dist/manifests',f));
fs.copyFileSync('node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js','dist/assets/lightweight-charts.standalone.production.js');
