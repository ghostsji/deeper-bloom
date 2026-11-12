// Generates Echo's built-in voice packs into assets/voice/<pack>/ (see VOICE_PACKS).
//   npm run voices                  make any lines that are missing, in every pack
//   npm run voices -- --pack aria   just one pack
//   npm run voices -- --force       remake them (after changing a line)
// Each pack also gets manifest.txt in the Black Relay voice studio's batch format
// ("file.mp3 | text"), so you can regenerate a pack there instead. If you do, keep the
// studio's FX dry (wet 0, cutoff 10000 Hz): the game adds its FX live.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ECHO_LINES } from '../src/echo-lines.js';
import { VOICE_DEFAULTS, VOICE_PACKS, rateStr, pitchStr, lineFile } from '../src/voice-settings.js';

const require = createRequire(import.meta.url);
const { createTTS } = require('../electron/tts.cjs');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.includes('--pack') ? args[args.indexOf('--pack') + 1] : null;
const { rate, pitch } = VOICE_DEFAULTS;
const tts = createTTS(path.join(root, 'assets', 'voice', '.cache'));

for (const pack of VOICE_PACKS.filter((p) => !only || p.id === only)) {
  const outDir = path.join(root, 'assets', 'voice', pack.id);
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = [`# Echo's lines for Deeper Bloom. Voice: ${pack.voice}, rate ${rateStr(rate)}, pitch ${pitchStr(pitch)}`];
  let made = 0, kept = 0;
  for (const [key, lines] of Object.entries(ECHO_LINES)) {
    for (let i = 0; i < lines.length; i++) {
      const file = lineFile(key, i), out = path.join(outDir, file);
      manifest.push(`${file} | ${lines[i]}`);
      if (!force && fs.existsSync(out)) { kept++; continue; }
      const audio = await tts.render(lines[i], pack.voice, rateStr(rate), pitchStr(pitch));
      fs.writeFileSync(out, audio);
      made++;
      await new Promise((r) => setTimeout(r, 1200)); // be gentle with the service
    }
  }
  fs.writeFileSync(path.join(outDir, 'manifest.txt'), `${manifest.join('\n')}\n`);
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ voice: pack.voice, rate, pitch, lines: ECHO_LINES }, null, 2));
  console.log(`${pack.id}: ${made} made, ${kept} already there.`);
}
fs.rmSync(path.join(root, 'assets', 'voice', '.cache'), { recursive: true, force: true });
