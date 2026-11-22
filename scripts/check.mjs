import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { transform } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

const ROOTS = ['src', 'tests', 'scripts', 'static/ui', 'ui'];
const SKIP = new Set(['vendor', 'node_modules', 'out']);

function walk(directory, out = []) {
  for (const entry of readdirSync(directory)) {
    if (SKIP.has(entry)) continue;
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) walk(path, out);
    else if (entry.endsWith('.js') || entry.endsWith('.mjs')) out.push(path);
  }
  return out;
}

const files = ROOTS.flatMap((root) => {
  try {
    return walk(join(repo, root));
  } catch {
    return [];
  }
});
const failures = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  try {
    await transform(source, { loader: 'js', format: 'esm', sourcefile: file });
  } catch (error) {
    const where = relative(repo, file);
    const first = error.errors && error.errors[0];
    failures.push(
      first
        ? `${where}:${first.location?.line ?? '?'}  ${first.text}`
        : `${where}  ${error.message}`,
    );
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} file(s) do not parse:\n`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`parsed ${files.length} files`);
