// Parses every game and desktop-shell file the way the browser and Electron will, so a
// syntax slip fails here instead of at startup: npm run check
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const files = [
  ...readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.js')).map((f) => path.join('src', f)),
  ...readdirSync(path.join(root, 'electron')).filter((f) => f.endsWith('.cjs')).map((f) => path.join('electron', f)),
  ...readdirSync(path.join(root, 'tools')).filter((f) => f.endsWith('.mjs')).map((f) => path.join('tools', f)),
];
let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error(`✗ ${f}\n${String(e.stderr).trim()}\n`);
  }
}
console.log(failed ? `${failed} of ${files.length} files have syntax errors.` : `✓ ${files.length} files parse.`);
process.exit(failed ? 1 : 0);
