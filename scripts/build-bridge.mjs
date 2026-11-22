/**
 * Builds `static/ui/vendor/bridge.js`, the one generated asset in the UI.
 *
 * The output is committed, so a deploy never depends on this having run.
 */
import { build } from 'esbuild';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const outfile = join(repo, 'static/ui/vendor/bridge.js');

await build({
  entryPoints: [join(repo, 'ui/bridge-entry.js')],
  outfile,
  bundle: true,
  format: 'iife',
  globalName: 'forgeBridge',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});

const { size } = statSync(outfile);
console.log(`static/ui/vendor/bridge.js  ${(size / 1024).toFixed(1)} KB`);
