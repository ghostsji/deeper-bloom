// Smoke test: boots the real game in an off-screen Electron window (with a throwaway profile, so
// your own save is never touched) and plays the basics through DevTools.
//   npm run smoke
//   npm run smoke -- --packaged   (tests the build from npm run package instead)
// Fails on any page error, or if the menus, diving, swimming, the phone, scanning, building,
// goals, skills, saving, save slots, Options or loading stop working.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packaged = process.argv.includes('--packaged');
const electron = packaged
  ? path.join(root, 'dist', 'Deeper Bloom-win32-x64', 'Deeper Bloom.exe')
  : path.join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const PORT = 9231;
const profile = mkdtempSync(path.join(tmpdir(), 'deeper-bloom-smoke-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const app = spawn(electron, [...(packaged ? [] : [root]), `--remote-debugging-port=${PORT}`], {
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
    const vis = (m) => !document.querySelector('[data-menu="' + m + '"]').hidden;
    return { db: !!window.db, title: !document.getElementById('title').hidden, fps: frames,
      menu: { cont: vis('continue'), exit: vis('exit'), saveOff: document.querySelector('[data-menu="save"]').disabled } };`);
  check('the game loop runs', boot.fps >= 20, `${boot.fps} fps`);
  check('the game loads (debug hooks present)', boot.db);
  check('the main menu shows', boot.title);
  check('a fresh profile has no Continue, Save is off, Exit is there', !boot.menu.cont && boot.menu.saveOff && boot.menu.exit);

  const dive = await run(`
    document.getElementById('dive').click();
    await new Promise((r) => setTimeout(r, 600));
    const card = document.getElementById('tutorial');
    const first = !card.hidden && card.textContent;
    dispatchEvent(new MouseEvent('mousemove', { movementX: 40, movementY: 0, clientX: innerWidth / 2, clientY: innerHeight / 2 }));
    dispatchEvent(new MouseEvent('mousemove', { movementX: -40, movementY: 0, clientX: innerWidth / 2, clientY: innerHeight / 2 })); // face forward again
    // The card updates on the next frames; give it up to 2 s.
    for (let i = 0; i < 20 && /Look around/.test(card.textContent); i++) await new Promise((r) => setTimeout(r, 100));
    return { hud: !document.getElementById('hud').hidden, first, next: card.textContent };`);
  check('New game starts the game', dive.hud);
  check('the tutorial starts with looking around', /Look around/.test(dive.first || ''));
  check('looking around moves the tutorial on to swimming', /Swim/.test(dive.next) && !/Look around/.test(dive.next));

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
    // Hovering the Bloom chip shows its tooltip.
    const chip = document.querySelector('#phone [data-bloom]'), r = chip.getBoundingClientRect();
    chip.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.x + 5, clientY: r.y + 5 }));
    await new Promise((res) => setTimeout(res, 600));
    const tip = document.querySelector('.tooltip.show')?.textContent || '';
    const guide = document.querySelector('#phone [data-tab="guide"]');
    guide.click();
    const tutList = document.querySelectorAll('#phone .tutlist li').length;
    key('Tab');
    await new Promise((r) => setTimeout(r, 200));
    return { open: tabs.length, rendered, tip, tutList, closed: document.getElementById('phone').classList.contains('up') === false };`);
  check('the phone opens with all seven tabs', phone.open === 7, JSON.stringify(phone.rendered));
  check('hovering shows a tooltip', /Bloom points/.test(phone.tip), phone.tip.slice(0, 40));
  check('the Guide tab lists the tutorial steps', phone.tutList >= 10, `${phone.tutList} steps`);
  check('every phone tab renders', Object.values(phone.rendered).every((n) => n > 0));
  check('Tab puts the phone away', phone.closed);

  // Lost phone apps: four start missing; swimming into a salvage pod brings one back.
  const apps = await run(`
    const missing0 = [...document.querySelectorAll('#phone [data-tab].missing')].map((b) => b.dataset.tab);
    const pods0 = db.salvage.remaining().filter((p) => p.kind === 'app').length;
    const pod = db.salvage.remaining().find((p) => p.id === 'codex');
    const back = db.camera.position.clone();
    db.camera.position.copy(pod.pos);
    await new Promise((r) => setTimeout(r, 400));
    db.camera.position.copy(back);
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' }));
    dispatchEvent(new KeyboardEvent('keyup', { code: 'Tab' }));
    await new Promise((r) => setTimeout(r, 300));
    const missing1 = [...document.querySelectorAll('#phone [data-tab].missing')].map((b) => b.dataset.tab);
    document.querySelector('#phone [data-tab="skills"]').click();
    const page = document.querySelector('#phone .missing-app h3')?.textContent;
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' }));
    dispatchEvent(new KeyboardEvent('keyup', { code: 'Tab' }));
    await new Promise((r) => setTimeout(r, 200));
    return { missing0, pods0, found: db.salvage.found('codex'), missing1, page, saved: JSON.parse(localStorage.getItem('deeperbloom-save-v1')).apps };`);
  check('Codex, Status, Goals and Skills start missing', apps.missing0.join() === 'codex,status,goals,skills' && apps.pods0 === 4, apps.missing0.join());
  check('swimming into a salvage pod recovers its app', apps.found && !apps.missing1.includes('codex') && apps.missing1.length === 3 && apps.saved?.includes('codex'), apps.missing1.join());
  check('a missing app shows where to look', apps.page === 'Skills');

  // Touching cracked glass shocks you: a little health, a stun that makes you sink, and the
  // phone knocked offline for a few seconds.
  const shock = await run(`
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const touch = (path) => {
      const pt = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM());
      path.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y }));
    };
    const tab = () => { dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'Tab' })); };
    const health = () => db.survival.stats.health;
    db.camera.position.set(0, 12, 20); // mid-water, so there's room to sink
    tab();
    await sleep(300);
    const h0 = health();
    touch(document.querySelector('#phone .crack-hit path'));
    const zap = !!document.querySelector('.zap');
    await sleep(150);
    const phoneClosed = !document.getElementById('phone').classList.contains('up');
    const stunned = db.player.stunned;
    const y0 = db.camera.position.y;
    await sleep(1200);
    const sank = y0 - db.camera.position.y;
    const note = document.getElementById('stunnote').textContent;
    tab();
    await sleep(300);
    const phoneBlocked = !document.getElementById('phone').classList.contains('up');
    const h1 = health();
    touch(document.querySelector('#visor .crack-hit path'));
    await sleep(100);
    const h2 = health();
    await sleep(2600);
    const recovered = !db.player.stunned;
    await sleep(1500); // let the sinking drift settle before the next test
    return { recovered, zap, phone: h0 - h1, visor: h1 - h2, phoneClosed, stunned, sank, note, phoneBlocked };`);
  check('touching the cracked phone screen shocks you', shock.zap && shock.phone > 0, `-${shock.phone.toFixed(1)} health`);
  check('touching a cracked visor shocks you', shock.visor > 0, `-${shock.visor.toFixed(1)} health`);
  check('a shock drops the phone and stuns you', shock.phoneClosed && shock.stunned && /STUNNED/.test(shock.note), shock.note);
  check('while stunned you sink', shock.sank > 0.5, `${shock.sank.toFixed(2)} m`);
  check('the phone stays offline for a while after a shock', shock.phoneBlocked);
  check('the stun wears off', shock.recovered);

  const scan = await run(`
    db.camera.position.set(0, 2.6, 6);
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

  // The flood-damaged visor: scanning Echo and gathering 60 polyps (above) restore two systems.
  const hud = await run(`
    await new Promise((r) => setTimeout(r, 800));
    const A = await import('./src/audio.js');
    A.glitchSound(); A.staticSound(); A.rebootSound(); A.setVisorHum({ damage: 0.5, cracked: true }); // the visor's sounds play without errors
    return {
      cracks: !!document.querySelector('#visor .v-cracks path'),
      navOff: document.getElementById('compass').classList.contains('offline'),
      vitalsDmg: document.querySelector('.stats').classList.contains('dmg'),
      ready: db.systems.isReady('ledger') && db.systems.isReady('comms') && !db.systems.online('ledger'),
      pct: document.getElementById('integrity').textContent,
    };`);
  check('the visor starts damaged (cracks, no compass, flickering vitals)', hud.cracks && hud.navOff && hud.vitalsDmg);
  check('milestones get you the parts to fix systems', hud.ready, hud.pct);

  // Rewiring (V): the right sockets bring a system back; a wrong one shocks you.
  const wire = await run(`
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const key = (c) => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    const P = await import('./src/progress.js');
    key('KeyV');
    await sleep(200);
    const panel = !document.getElementById('rewire').hidden;
    const first = db.systems.ready[0].id;
    // Wrong first: pick a wire, then a socket that isn't its symbol.
    const w0 = document.querySelector('.rw-wire');
    w0.click();
    const s0 = P.stat('shocks');
    [...document.querySelectorAll('.rw-socket')].find((x) => x.dataset.socket !== w0.dataset.sym).click();
    const zapped = P.stat('shocks') - s0, closed = document.getElementById('rewire').hidden;
    await sleep(2800); // the stun wears off
    key('KeyV');
    await sleep(200);
    for (const w of [...document.querySelectorAll('.rw-wire')]) {
      w.click();
      document.querySelector('.rw-socket[data-socket="' + w.dataset.sym + '"]').click();
    }
    await sleep(300);
    return { panel, zapped, closed, fixed: db.systems.online(first), playing: document.getElementById('rewire').hidden };`);
  check('V opens the visor panel', wire.panel);
  check('a wrong socket shocks you and shuts the panel', wire.zapped > 0 && wire.closed);
  check('wiring every socket right restores the system', wire.fixed && wire.playing);

  // The suit: a low battery cuts systems, deep water cracks and floods the visor, and live
  // cables and jellies shock you.
  const suitRes = await run(`
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    db.suit.load({ power: 25, cells: 0, stress: 0, leak: 0 });
    await sleep(300);
    const navOff = document.getElementById('compass').classList.contains('nopower'), depthOn = !document.querySelector('.depthbox').classList.contains('nopower');
    const pwr = document.getElementById('power').textContent;
    db.suit.load({ power: 80, stress: 0.999, leak: 0.3 });
    db.camera.position.set(4, 2.5, 30); // about 23 m down, open sand
    await sleep(700);
    const layers = document.querySelectorAll('.v-stress-layer.on').length, leaking = document.getElementById('visor').classList.contains('leaking');
    const strain = !document.getElementById('strain').hidden;
    db.suit.load({ power: 80, stress: 0, leak: 0 });
    const cable = db.hazards.sources.find((h) => h.kind === 'cable');
    const h0 = db.survival.stats.health;
    db.camera.position.copy(cable.pos()).y += 0.5;
    await sleep(300);
    const cableHit = h0 - db.survival.stats.health, stunned = db.player.stunned;
    db.camera.position.set(0, 12, 24); // away from the cable (stunned beside it, it would shock again)
    await sleep(2600);
    const jelly = db.hazards.sources.find((h) => h.kind === 'jelly');
    const h1 = db.survival.stats.health;
    db.camera.position.copy(jelly.pos());
    await sleep(200);
    const jellyHit = h1 - db.survival.stats.health;
    db.camera.position.set(0, 12, 24);
    await sleep(3200); // let the stun and the sinking wear off
    return { navOff, depthOn, pwr, layers, leaking, strain, cableHit, stunned, jellyHit };`);
  check('a low visor battery shuts navigation off first', suitRes.navOff && suitRes.depthOn && /PWR/.test(suitRes.pwr), suitRes.pwr);
  check('deep water spreads cracks and floods the visor', suitRes.layers === 3 && suitRes.leaking && suitRes.strain, `${suitRes.layers} crack layers`);
  check('a live cable shocks and stuns you', suitRes.cableHit > 0 && suitRes.stunned, `-${suitRes.cableHit.toFixed(1)} health`);
  check('an electric jelly shocks you', suitRes.jellyHit > 0, `-${suitRes.jellyHit.toFixed(1)} health`);

  // Fog (purged with G), overheating, running out of air, and water in the phone.
  const suit2 = await run(`
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const visor = document.getElementById('visor');
    db.camera.position.set(4, 8, 30);
    db.suit.load({ power: 90, fog: 0.8, heat: 1, phoneWet: 0.9 });
    await sleep(200);
    const fog0 = db.suit.fog, glare = visor.classList.contains('glare'), temp = document.getElementById('heat').textContent;
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG' }));
    await sleep(800);
    dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyG' }));
    const purged = fog0 - db.suit.fog;
    db.survival.stats.breath = 3;
    await sleep(300);
    const airfail = visor.classList.contains('airfail');
    db.survival.stats.breath = 100;
    await sleep(2500); // the phone is still rebooting from the jelly's shock
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'Tab' }));
    await sleep(300);
    const banner = !!document.querySelector('#phone .moisture');
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'Tab' }));
    db.suit.load({ power: 90, fog: 0, heat: 0, phoneWet: 0 });
    await sleep(300);
    return { purged, glare, temp, airfail, banner };`);
  check('holding G purges visor fog', suit2.purged > 0.3, `-${suit2.purged.toFixed(2)} fog`);
  check('overheating whites out the visor', suit2.glare && /HOT/.test(suit2.temp), suit2.temp);
  check('running out of air breaks the HUD down', suit2.airfail);
  check('a wet phone warns about moisture', suit2.banner);

  // Electric eels discharge, cables surge, and silt clouds the water.
  const haz2 = await run(`
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const P = await import('./src/progress.js');
    const e = db.combat.eels.find((x) => x.electric && x.alive);
    const s0 = P.stat('shocks');
    db.camera.position.copy(e.segs[0].position).add({ x: 0, y: 0, z: 3.5 });
    e.mode = 'chase'; e.zapNext = 0;
    await sleep(2200);
    const eelZap = P.stat('shocks') - s0;
    db.camera.position.set(0, 12, 24);
    await sleep(2800);
    db.hazards.forceSurge();
    await sleep(150);
    const surging = db.hazards.surging;
    const cable = db.hazards.sources.find((h) => h.kind === 'cable');
    const s1 = P.stat('shocks');
    db.camera.position.copy(cable.pos()).add({ x: 3.2, y: 0.6, z: 0 });
    await sleep(300);
    const surgeZap = P.stat('shocks') - s1;
    db.camera.position.set(0, 12, 24);
    db.setSilt(0.9);
    await sleep(200);
    const fog = db.scene.fog.density;
    db.setSilt(0);
    await sleep(3000);
    return { eelZap, surging, surgeZap, fog };`);
  check('an electric eel discharges and shocks you', haz2.eelZap > 0, `${haz2.eelZap} shock(s)`);
  check('a power surge makes cables reach much further', haz2.surging && haz2.surgeZap > 0);
  check('silt clouds the water', haz2.fog > 0.12, haz2.fog.toFixed(3));

  // The sunken outpost: fit three fuses and its vault opens (an upgrade, two logs); a log by Echo.
  const op = await run(`
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await sleep(2500); // let any stun and phone reboot from the last test pass
    db.giveFuses(3);
    db.camera.position.copy(db.outpost.consolePos);
    await sleep(100);
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
    dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' }));
    await sleep(100);
    const powered = db.outpost.powered;
    const plate = db.salvage.remaining().find((p) => p.id === 'up-plate');
    if (plate) db.camera.position.copy(plate.pos);
    await sleep(300);
    const upgraded = db.suit.has('plate');
    const log = db.salvage.remaining().find((p) => p.id === 'pod-log5');
    db.camera.position.copy(log.pos);
    await sleep(300);
    const logs = db.salvage.count('log');
    db.camera.position.set(0, 12, 24);
    await sleep(300);
    return { powered, vaultOpen: !!plate, upgraded, logs };`);
  check('fitting three fuses powers the outpost and opens its vault', op.powered && op.vaultOpen);
  check('a visor upgrade from the vault takes effect', op.upgraded);
  check("Echo's logs can be found", op.logs >= 1, `${op.logs} log(s)`);

  const save = await run(`
    const raw = localStorage.getItem('deeperbloom-save-v1');
    const s = raw && JSON.parse(raw);
    return { saved: !!s, hasProgress: !!s?.progress, hasBuilds: Array.isArray(s?.builds) };`);
  check('the game saves (with progress and builds)', save.saved && save.hasProgress && save.hasBuilds);

  const $ = (id) => `document.getElementById('${id}')`;
  const menus = await run(`
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const shown = (id) => !document.getElementById(id).hidden;
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
    dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP' }));
    await sleep(300);
    const paused = shown('pause') && ['resume', 'savegame', 'opensettings', 'tomenu', 'quit'].every(shown);
    ${$('savegame')}.click();
    await sleep(300);
    const rows = document.querySelectorAll('#slots [data-slot]').length;
    document.querySelector('#slots [data-slot="1"]').click();
    await sleep(400);
    const msg = document.querySelector('#slots [data-msg]')?.textContent;
    const slot1 = (await window.deeperBloom.saves.list())[0];
    await sleep(900);
    const backToPause = !shown('slots') && shown('pause');
    ${$('opensettings')}.click();
    await sleep(200);
    const tabs = {};
    for (const b of document.querySelectorAll('#settings [data-tab]')) {
      document.querySelector('#settings [data-tab="' + b.dataset.tab + '"]').click();
      await sleep(50);
      tabs[b.dataset.tab] = document.querySelector('#settings [data-body]').children.length;
    }
    document.querySelector('#settings [data-tab="controls"]').click();
    document.querySelector('#settings [data-bind="forward"]').click();
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI' }));
    const rebound = document.querySelector('#settings [data-bind="forward"]').textContent;
    document.querySelector('#settings [data-reset="controls"]').click();
    const reset = document.querySelector('#settings [data-bind="forward"]').textContent;
    document.querySelector('#settings [data-back]').click();
    await sleep(100);
    const settingsBack = !shown('settings') && shown('pause');
    ${$('tomenu')}.click();
    await sleep(300);
    const title = shown('title') && !document.querySelector('[data-menu="continue"]').hidden;
    return { paused, rows, msg, slot1: !!slot1?.summary, backToPause, tabs, rebound, reset, settingsBack, title };`);
  check('P opens the pause menu with all its buttons', menus.paused);
  check('Save game saves to a slot', menus.rows === 3 && menus.slot1 && /slot 1/.test(menus.msg), menus.msg);
  check('the slots close back to the pause menu', menus.backToPause);
  check('Options has four tabs that all render', Object.keys(menus.tabs).length === 4 && Object.values(menus.tabs).every((n) => n > 0) && menus.tabs.display >= 4, JSON.stringify(menus.tabs));
  check('keys can be rebound and reset', menus.rebound === 'I' && menus.reset === 'W', `${menus.rebound} → ${menus.reset}`);
  check('Options goes back to the pause menu', menus.settingsBack);
  check('Main menu goes to the title, now with Continue', menus.title);

  // Loading a slot reloads the page onto the "Ready to dive" card.
  await run(`
    document.querySelector('[data-menu="load"]').click();
    await new Promise((r) => setTimeout(r, 300));
    setTimeout(() => document.querySelector('#slots [data-slot="1"]').click(), 50);
    return true;`);
  await wait(3500);
  const loaded = await run(`
    const ready = !document.getElementById('pause').hidden && document.getElementById('pause-title').textContent;
    document.getElementById('resume').click();
    await new Promise((r) => setTimeout(r, 400));
    return { ready, hud: !document.getElementById('hud').hidden, lumen: db.builder && Number(document.getElementById('lumen').textContent.replace(/,/g, '')) };`);
  check('Load game reloads onto the ready card', loaded.ready === 'Ready to dive', String(loaded.ready));
  check('Dive from the ready card plays the loaded game', loaded.hud && loaded.lumen >= 20, `${loaded.lumen} Lumen`);

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
