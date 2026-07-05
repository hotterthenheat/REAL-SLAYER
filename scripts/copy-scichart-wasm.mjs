// Copies SciChart's WASM out of node_modules into public/scichart so Vite serves it locally
// (the CDN is blocked by our CSP). Run before dev/build so the wasm always matches the
// installed scichart version; the copied files are gitignored, not committed.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'scichart', '_wasm');
const dst = join(root, 'public', 'scichart');
const files = ['scichart2d.wasm', 'scichart3d.wasm'];

if (!existsSync(join(src, files[0]))) {
  console.warn('[copy-scichart-wasm] scichart not installed — skipping (charts stay on the three.js/echarts fallback).');
  process.exit(0);
}
mkdirSync(dst, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dst, f));
console.log('[copy-scichart-wasm] copied', files.join(', '), '→ public/scichart');
