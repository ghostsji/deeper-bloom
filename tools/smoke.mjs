// Smoke test: boots the real game in an off-screen Electron window (with a throwaway profile, so
// your own save is never touched) and plays the basics through DevTools.
//   npm run smoke
// Fails on any page error, or if diving, swimming, the phone, scanning, building, goals,
// skills or saving stop working.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const electron = path.join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const PORT = 9231;
const profile = mkdtempSync(path.join(tmpdir(), 'deeper-bloom-smoke-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const app = spawn(electron, [root, `--remote-debugging-port=${PORT}`], {
  env: { ...process.env, DEEPER_BLOOM_DEBUG: '1', DEEPER_BLOOM_HEADLESS: '1', DEEPER_BLOOM_USER_DATA: profile },
  stdio: 'ignore',
});

const results = [];
const errors = [];
let ws;
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

try {
  // Connect to the page.
  let page;
  for (let i = 0; i < 40 && !page; i++) {
    await wait(500);
    try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page' && t.url.startsWith('app://game')); } catch { /* not up yet */ }
  }
  if (!page) throw new Error('the game window never opened');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id) pending.get(d.id)?.(d);
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description?.split('\n')[0] ?? d.params.exceptionDetails.text);
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon/.test(d.params.entry.text)) errors.push(d.params.entry.text);
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const run = async (body) => {
    const res = await send('Runtime.evaluate', { expression: `(async () => { ${body} })().then((v) => JSON.stringify(v))`, awaitPromise: true, userGesture: true });
    if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description ?? 'script error');
    return JSON.parse(res.result.result.value ?? 'null');
  };
  await send('Runtime.enable');
  await send('Log.enable');
  // Reload so errors thrown while the page loads are caught too.
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: true });
  await wait(3500);

  const boot = await run(`
    let frames = 0; const t0 = performance.now();
    await new Promise((r) => { const f = () => (performance.now() - t0 < 1000 ? (frames++, requestAnimationFrame(f)) : r()); requestAnimationFrame(f); });
    return { db: !!window.db, title: !document.getElementById('title').hidden, fps: frames };`);
  check('the game loop runs', boot.fps >= 20, `${boot.fps} fps`);
  check('the game loads (debug hooks present)', boot.db);
  check('the title screen shows', boot.title);

  const dive = await run(`
    document.getElementById('dive').click();
    await new Promise((r) => setTimeout(r, 600));
    return { hud: !document.getElementById('hud').hidden };`);
  check('Dive starts the game', dive.hud);

  const swim = await run(`
    const p0 = db.camera.position.clone();
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    await new Promise((r) => setTimeout(r, 1500));
    dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    return { moved: db.camera.position.distanceTo(p0) };`);
  check('W swims forward', swim.moved > 0.05, `${swim.moved.toFixed(2)} m`);

  const phone = await run(`
    const key = (c) => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    key('Tab');
    await new Promise((r) => setTimeout(r, 300));
    const tabs = [...document.querySelectorAll('#phone [data-tab]')].map((b) => b.dataset.tab);
    const rendered = {};
    for (const t of tabs) {
      document.querySelector('#phone [data-tab="' + t + '"]').click();
      rendered[t] = document.querySelector('#phone [data-body]').children.length;
    }
    key('Tab');
    await new Promise((r) => setTimeout(r, 200));
    return { open: tabs.length, rendered, closed: document.getElementById('phone').classList.contains('up') === false };`);
  check('the phone opens with all six tabs', phone.open === 6, JSON.stringify(phone.rendered));
  check('every phone tab renders', Object.values(phone.rendered).every((n) => n > 0));
  check('Tab puts the phone away', phone.closed);

  const scan = await run(`
    db.camera.position.set(0, 2.6, 6);
    db.player.lookBy(0, 0);
    const before = db.research.data;
    dispatchEvent(new MouseEvent('mousedown', { button: 2 }));
    dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    await new Promise((r) => setTimeout(r, 2500));
    dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    dispatchEvent(new MouseEvent('mouseup', { button: 2 }));
    return { data: db.research.data - before, echo: db.research.counts.echo || 0 };`);
  check('the Echo Lens scans Echo', scan.echo === 1 && scan.data > 0, `+${scan.data} Data`);

  const build = await run(`
    db.addLumen(20);
    db.builder.load([['0,9', 'raft', 3, null, 0]]);
    db.camera.position.set(1, 26.3, 18.5);
    await new Promise((r) => setTimeout(r, 400));
    return { onFoot: db.player.onFoot, pieces: db.builder.serialize().length };`);
  check('rafts float and you can climb onto them', build.onFoot && build.pieces === 1);

  const prog = await run(`
    const P = await import('./src/progress.js');
    const pts0 = P.points();
    P.track('polyps', 60);
    const earned = P.points() - pts0;
    const bought = P.buy('pockets');
    return { earned, bought, bag: (await import('./src/survival.js')).bagSize() };`);
  check('goals pay Bloom points', prog.earned >= 4, `+${prog.earned}`);
  check('skills can be learned and take effect', prog.bought && prog.bag === 14, `bag ${prog.bag}`);

  const save = await run(`
    db.dispatchShell?.({ type: 'noop' });
    const raw = localStorage.getItem('deeperbloom-save-v1');
    const s = raw && JSON.parse(raw);
    return { saved: !!s, hasProgress: !!s?.progress, hasBuilds: Array.isArray(s?.builds) };`);
  check('the game saves (with progress and builds)', save.saved && save.hasProgress && save.hasBuilds);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('smoke test ran', false, e.message);
} finally {
  try { ws?.close(); } catch { /* closed */ }
  app.kill();
  await wait(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Electron may still hold a file */ }
}

for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} smoke check${failed > 1 ? 's' : ''} failed.` : `\n✓ All ${results.length} smoke checks passed.`);
process.exit(failed ? 1 : 0);
