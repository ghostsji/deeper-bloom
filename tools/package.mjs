// Builds the standalone desktop game: dist/Deeper Bloom-win32-x64/ (run "Deeper Bloom.exe")
// and a zip of it to hand round.
//   npm run package
import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'dist');

// Only what the game needs at run time goes in (dev dependencies are pruned automatically).
const SKIP = [/^\/dist($|\/)/, /^\/test($|\/)/, /^\/tools($|\/)/, /^\/\.git/, /^\/assets\/voice\/\.cache($|\/)/, /^\/[^/]*\.md$/, /^\/\.claude($|\/)/];

const [dir] = await packager({
  dir: root,
  out,
  name: 'Deeper Bloom',
  executableName: 'Deeper Bloom',
  platform: 'win32',
  arch: 'x64',
  overwrite: true,
  prune: true,
  asar: false, // the game is served from its own files over app://
  ignore: (p) => SKIP.some((re) => re.test(p.replace(/\\/g, '/'))),
  appCopyright: 'Deeper Bloom',
  win32metadata: { ProductName: 'Deeper Bloom', FileDescription: 'Deeper Bloom' },
});

const zip = `${dir}.zip`;
rmSync(zip, { force: true });
// Windows ships bsdtar, which writes zips with -a.
execFileSync('tar', ['-a', '-c', '-f', zip, '-C', out, path.basename(dir)], { stdio: 'inherit' });
console.log(`✓ Built ${path.relative(root, dir)}\n✓ Zipped ${path.relative(root, zip)}`);
