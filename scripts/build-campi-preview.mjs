// After npm run build: node scripts/build-campi-preview.mjs /path/Campi-preview.html
// Produces a self-contained offline review page. No account or backend calls.
import { build } from 'esbuild';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const result = await build({ entryPoints:['src/dev/CampiPreview.tsx'], bundle:true, format:'iife', write:false, minify:true, loader:{'.css':'empty'}, define:{'process.env.NODE_ENV':'"production"'}, tsconfig:'tsconfig.app.json' });
let js = result.outputFiles[0].text;
for (const pose of ['rest','blink','wave','wave2','smile','curious','surprised','wink','angry','sad','celebrate','flight','run','run2']) {
  const file = `campi-${pose}.webp`;
  const base64 = readFileSync(`public/campi/${file}`).toString('base64');
  js = js.replaceAll(`/campi/${file}`, `data:image/webp;base64,${base64}`);
}
const css = readdirSync('dist/assets').filter(name=>name.endsWith('.css')).map(name=>readFileSync(`dist/assets/${name}`,'utf8')).join('\n');
const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Campi · prueba de gestos</title><style>${css.replaceAll('</style','<\\/style')}</style></head><body><div id="root"></div><script>${js.replaceAll('</script','<\\/script')}</script></body></html>`;
const output = resolve(process.argv[2] || 'Campi-preview.html');
writeFileSync(output, html); console.log(output);
