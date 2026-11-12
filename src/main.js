// The Flutter shell bridge goes first: it sets up the live-voice connection voice.js reads.
import { SHELL, toShell, onShell, dispatchShell } from './shell.js';
import { setBindings } from './controls.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, SURFACE_Y } from './world.js';
import { createPlayer } from './player.js';
import { createBuilder, PIECES, FARM_MAX } from './build.js';
import { createSurvival, ITEMS, GEAR, gearMax, bagSize } from './survival.js';
import * as progress from './progress.js';
import { createCombat } from './combat.js';
import { createResearch, RESEARCH, SPECIES } from './research.js';
import { createPhone, PIECE_INFO } from './phone.js';
import { VOICE_PACKS } from './voice-settings.js';
import { ECHO_LINES } from './echo-lines.js';
import { speakLine, pauseVoice, systemVoices } from './voice.js';
import { createSettings } from './settings.js';
import { initAudio, updateAudio, setMusic, uiSound, pop, chime, thunk, setPaused, gasp, heartbeat, warn, munch, sizzle, grab, harpoonFire, thud, hiss, bite, release, click } from './audio.js';

const $ = (id) => document.getElementById(id);
const BLOOM_FULL = 60;   // Lumen gathered for the reef to glow at full strength
const SAVE_KEY = 'deeperbloom-save-v1';

// ---- Desktop only --------------------------------------------------------------
const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
if (touchOnly) {
  $('title').hidden = true;
  $('mobile').hidden = false;
  throw new Error('Deeper Bloom is desktop only');
}

// ---- Renderer ------------------------------------------------------------------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 400);
camera.position.set(0, 7, 24);

const world = buildWorld(scene);
const player = createPlayer(camera, canvas);
const research = createResearch({
  onChange: () => { save(); renderBuildBar(); renderHudData(); },
  onEntry: (sp) => {
    toast(`Codex entry complete: ${sp.name}`);
    chime();
    if (sp.id === 'echo') echoSay('scanEcho');
    echoSay('firstEntry');
  },
});
const survival = createSurvival({
  onBlackout: blackout,
  onChange: () => { renderBag(); save(); },
});
// Woven kelp decks make rafts cheaper.
// Woven kelp decks make rafts cheaper; the Thrifty skill takes a share off everything.
const costFor = (id) => {
  const base = id === 'raft' && research.isUnlocked('weave') ? 1 : PIECES.find((p) => p.id === id).cost;
  return Math.max(1, Math.round(base * (1 - progress.perk('thrift'))));
};
const builder = createBuilder(scene, {
  canAfford: (n) => lumen >= n,
  costFor,
  isUnlocked: research.isUnlocked,
  spend: (n) => { setLumen(lumen - n); progress.track('spent', n); },
  refund: (n) => setLumen(lumen + n),
  onChange: save,
});
player.setDeckQuery(builder.deckAt);
const combat = createCombat(scene, camera, world, {
  onFire: () => { harpoonFire(); survival.wear('harpoon'); renderGear(); },
  onHit: () => { thud(); progress.track('hits'); },
  onSpot: () => { hiss(); echoSay('eel'); },
  onBite: (dmg) => {
    bite();
    survival.damage(dmg);
    hurtFlash();
  },
  onEelKilled: () => {
    release();
    progress.track('eels');
    // Rarer eels drop more Lumen; Clean cuts can give a second piece of meat.
    const r = progress.rollRarity();
    const bonus = Math.round(10 * r.pay);
    setLumen(lumen + bonus);
    progress.track('lumen', bonus);
    let meat = addToBag('eel', true) ? 1 : 0;
    if (meat && Math.random() < progress.perk('butcher') && addToBag('eel', true)) meat++;
    toast(`${r.index ? `${r.name} eel! ` : ''}The blight burned out of it. +${bonus} Lumen${meat ? `, ${meat} eel meat` : ''}`, r);
    echoSay('eelDown');
  },
  onFishSpeared: () => { thud(); catchFish('Speared'); },
});

// Inside the Flutter desktop shell (deeper_bloom_shell), Flutter draws the pause menu and
// the page talks to it over WebView2 messages.
const settings = createSettings($('settings'), {
  onBack: () => {
    settings.hide();
    if (SHELL) toShell({ type: 'state', state: 'paused' }); else $('pause').hidden = false;
  },
});
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.6);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---- Echo ----------------------------------------------------------------------
const said = new Set();
const queue = [];
let lineUntil = 0;
function echoSay(key) {
  if (said.has(key)) return;
  said.add(key);
  ECHO_LINES[key].forEach((text, i) => queue.push({ key, i, text }));
}
// One line at a time, with a pause after each so Echo never piles tips on you.
function updateSubtitle(t) {
  if (t < lineUntil) return;
  const next = queue.shift();
  if (next) {
    $('subtitle').innerHTML = `<b>ECHO</b>${next.text}`;
    $('subtitle').classList.add('show');
    lineUntil = t + 3 + next.text.length * 0.06 + settings.gap; // reading time
    chime();
    // Spoken lines stay up until Echo finishes (with a generous cap in case speech stalls).
    if (speakLine(next, () => { lineUntil = Math.min(lineUntil, playTime + settings.gap); })) lineUntil = t + 8 + next.text.length * 0.12;
  } else {
    $('subtitle').classList.remove('show');
  }
}

// ---- Game state ----------------------------------------------------------------
let state = 'title';   // title | playing | paused | phone | shellphone (Flutter shell) | blackout
let lumen = 0;
let playTime = 0;

function setLumen(n) {
  lumen = n;
  $('lumen').textContent = lumen.toLocaleString();
  world.setBloom(Math.min(1, lumen / BLOOM_FULL));
  renderBuildBar();
  if (phone?.open) phone.render();
}

// A polyp gathered: its Lumen, times its rarity and the Bright harvest skill.
function gather(n, bright) {
  const r = progress.rollRarity();
  const got = Math.max(1, Math.round(n * r.pay * (1 + progress.perk('shine'))));
  setLumen(lumen + got);
  progress.track('lumen', got);
  progress.track('polyps');
  if (r.index >= 2) toast(`${r.name} polyp! +${got} Lumen`, r);
  pop(bright || r.index >= 2);
  save();
  if (lumen >= 10) echoSay('ten');
  if (lumen >= BLOOM_FULL) echoSay('bloom');
}

// Lumen, builds, research and survival are kept between visits (best effort: storage may be blocked).
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      lumen, builds: builder.serialize(), research: research.serialize(), survival: survival.serialize(), progress: progress.serialize(),
      satchel: satchel && { pos: satchel.pos.toArray(), items: satchel.items },
    }));
  } catch { /* not saved */ }
}
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!data) return;
    progress.load(data.progress); // first: skills change costs, bag size and gear
    research.load(data.research); // before builds: build costs depend on it
    builder.load(data.builds);
    setLumen(data.lumen || 0);
    renderHudData();
    survival.load(data.survival);
    renderBag();
    if (data.satchel) {
      satchel = { pos: new THREE.Vector3().fromArray(data.satchel.pos), items: data.satchel.items };
      world.placeSatchel(satchel.pos);
    }
  } catch { /* fresh start */ }
}

let toastTimer = 0;
// A short message at the top of the screen; rare finds show in their rarity's colour.
function toast(text, tint = null) {
  $('toast').textContent = text;
  $('toast').style.color = tint?.color || '';
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500);
}
function renderHudData() {
  $('data').textContent = research.data.toLocaleString();
}

// ---- Achievements and skills ----------------------------------------------------
progress.onAchievement((a, tier, pts) => {
  toast(`Achievement: ${a.name} ${progress.roman(tier + 1)}  ·  +${pts} Bloom`, { color: '#FFC46B' });
  chime();
  save();
});
function buySkill(id) {
  if (!progress.buy(id)) return false;
  thunk();
  renderBag(); renderGear(); renderBuildBar();
  save();
  return true;
}

// ---- Survival ------------------------------------------------------------------
const FARM_SECS = 45;       // a kelp farm grows a strand this often
const USE_RANGE = 3.5;      // how close you need to be to use a raft piece
const KELP_REACH = 3;
let satchel = null;         // { pos, items } dropped at your last blackout
const kelpRay = new THREE.Raycaster(), centre = new THREE.Vector2();

function renderBag() {
  const bag = survival.bag;
  const chips = Object.keys(ITEMS).filter((k) => bag[k]).map((k) => `<span>${ITEMS[k].name}<b>${bag[k]}</b></span>`);
  $('bag').innerHTML = chips.length ? `${chips.join('')}<small>${survival.bagCount} / ${bagSize()}</small>` : '';
}

function addToBag(id, quiet = false) {
  if (survival.add(id)) return true;
  if (!quiet) toast('Your bag is full. Eat something, or cook it down.');
  return false;
}

// ---- Harpoon -------------------------------------------------------------------
function renderGear() {
  const d = survival.gear.harpoon;
  $('gear').hidden = !combat.equipped;
  $('gear').innerHTML = `<span>Harpoon</span><div class="bar${d <= 5 ? ' low' : ''}" style="--v:${d / gearMax('harpoon')}"></div><b>${d}/${gearMax('harpoon')}</b>`;
}
function toggleHarpoon() {
  combat.setEquipped(!combat.equipped);
  renderGear();
}
function shoot() {
  if (survival.gear.harpoon <= 0) { click(); toast('Your harpoon is broken.'); echoSay('broken'); return; }
  combat.fire(survival.gear.harpoon);
}
let hurtT = 0;
function hurtFlash() { hurtT = 0.5; }

// Underwater left-click: grab a silverfin in front of you, or strip the kelp you're aiming at.
function forage() {
  if (survival.bagCount >= bagSize()) { toast('Your bag is full. Eat something, or cook it down.'); return; }
  if (world.catchFish(camera, t)) {
    grab(); catchFish('Caught'); echoSay('catch');
    return;
  }
  kelpRay.far = KELP_REACH;
  kelpRay.setFromCamera(centre, camera);
  const hit = kelpRay.intersectObject(world.kelpMesh)[0];
  if (hit && world.harvestKelp(hit.instanceId, t) && addToBag('kelp')) {
    grab();
    progress.track('kelp');
    // Kelp bundles: sometimes a second strand.
    if (Math.random() < progress.perk('bundle') && survival.add('kelp')) { progress.track('kelp'); toast('Double kelp!'); }
  }
}

// A silverfin caught by hand or harpoon. Rarer fish come with a Lumen bonus.
function catchFish(how) {
  if (!addToBag('fish')) return;
  progress.track('fish');
  const r = progress.rollRarity();
  const bonus = r.index ? Math.round(3 * r.pay) : 0;
  if (bonus) { setLumen(lumen + bonus); progress.track('lumen', bonus); }
  toast(r.index ? `${how} a ${r.name} silverfin! +${bonus} Lumen` : `${how} a silverfin`, r.index ? r : null);
}

function eat(which) {
  const food = survival.eat(which);
  if (food) { munch(); toast(`Ate ${food.name}`); progress.track('meals'); }
  else if (survival.stats.food > 95) toast("You're full.");
  else toast('Nothing to eat. Catch silverfin or strip some kelp.');
}

// F at a raft piece.
const USABLE = ['station', 'fire', 'kelpfarm', 'workbench'];
const USE_LABEL = { station: 'Research station', fire: 'Cook food', kelpfarm: 'Collect kelp', workbench: 'Repair harpoon' };
const usable = () => builder.nearest(camera.position, USE_RANGE, USABLE);
function use(piece) {
  if (piece.id === 'station') openPhone('research');
  if (piece.id === 'fire') {
    const n = survival.cook();
    if (n) { sizzle(); toast(`Cooked ${n} item${n > 1 ? 's' : ''}`); echoSay('cooked'); progress.track('cooked', n); }
    else toast('Nothing raw to cook.');
  }
  if (piece.id === 'workbench') {
    const r = survival.repair('harpoon');
    if (r === 'repaired') { thunk(); toast('Harpoon repaired'); renderGear(); }
    else if (r === 'full') toast("Your harpoon doesn't need fixing.");
    else toast(`Repairs take ${GEAR.harpoon.repair} kelp.`);
  }
  if (piece.id === 'kelpfarm') {
    const st = piece.state;
    if (!st?.kelp) { toast('The kelp is still growing.'); return; }
    const got = survival.add('kelp', st.kelp);
    if (!got) { toast('Your bag is full.'); return; }
    st.kelp -= got;
    grab(); toast(`Collected ${got} kelp`);
    save();
  }
}

function growFarms(dt) {
  let changed = false;
  builder.each('kelpfarm', (p) => {
    p.state ??= { kelp: 0, grow: 0 };
    // Green thumb makes farms grow faster.
    if (p.state.kelp < FARM_MAX && (p.state.grow += dt) >= FARM_SECS / (1 + progress.perk('farm'))) { p.state.grow = 0; p.state.kelp++; changed = true; }
    p.mesh.userData.strands.forEach((k, i) => { k.visible = i < p.state.kelp; });
  });
  if (changed) save();
}

// Health hit zero: fade out, drop the bag where you fell, wake on the nearest raft.
function blackout(dropped) {
  setState('blackout');
  $('fade').classList.add('show');
  const fell = camera.position.clone();
  setTimeout(() => {
    if (Object.keys(dropped).length) {
      // A new blackout replaces the old satchel; whatever was in it is lost.
      satchel = { pos: fell, items: dropped };
      world.placeSatchel(fell);
    }
    const deck = builder.deckNear(fell);
    if (deck) camera.position.set(deck.x, SURFACE_Y + 2, deck.z);
    else camera.position.set(0, SURFACE_Y + 0.3, 24);
    survival.wake();
    progress.track('blackouts');
    echoSay('blackout');
    setState('playing');
    $('fade').classList.remove('show');
  }, 1800);
}

function pickUpSatchel() {
  if (!satchel || !world.satchelNear(camera.position)) return;
  for (const [id, n] of Object.entries(satchel.items)) {
    const got = survival.add(id, n);
    if (got === n) delete satchel.items[id]; else satchel.items[id] = n - got;
  }
  if (Object.keys(satchel.items).length) { toast('Your bag is too full to take everything.'); return; }
  satchel = null;
  world.clearSatchel();
  grab(); toast('Recovered your satchel');
  save();
}

let wasUnder = false, lowBreathWarned = false, beatClock = 0;
function updateSurvival(dt) {
  const under = camera.position.y < SURFACE_Y;
  survival.update(dt, under);
  const st = survival.stats;
  if (wasUnder && !under && st.breath < 35) gasp();
  wasUnder = under;
  if (st.breath < 25 && under && !lowBreathWarned) { warn(); lowBreathWarned = true; }
  if (st.breath > 50) lowBreathWarned = false;
  if (st.health < 30 && (beatClock -= dt) <= 0) { heartbeat(); beatClock = 0.9; }
  if (st.breath < 40) echoSay('breath');
  if (st.food < 35) echoSay('hungry');
  pickUpSatchel();

  // HUD: breath only shows when it matters.
  for (const k of ['health', 'breath', 'food']) $(`bar-${k}`).style.setProperty('--v', st[k] / 100);
  $('stat-breath').hidden = !under && st.breath >= 100;
  hurtT = Math.max(0, hurtT - dt);
  $('danger').style.opacity = Math.max(st.breath < 25 ? (25 - st.breath) / 25 : 0, st.health < 30 ? (30 - st.health) / 45 : 0, hurtT * 2);
}

// ---- Echo Lens and the phone ----------------------------------------------------
const STATION_RANGE = 3.5;
let lensOn = false, scanHeld = false;
const nearStation = () => builder.near('station', camera.position, STATION_RANGE);

// Hold right mouse to raise the lens (unless you're placing a build piece at the surface).
function setLens(on) {
  if (on === lensOn) return;
  lensOn = on;
  scanHeld = false;
  $('lens').hidden = !on;
  if (on) echoSay('lens');
}

// Tab brings the phone up. It frees the mouse and pauses the game.
const phone = createPhone($('phone'), {
  research, survival, builder, costFor,
  lumen: () => lumen,
  nearStation,
  placing: () => placing,
  onPick: (id) => { startPlacing(id); engage(); },
  onStopBuilding: () => stopPlacing(),
  onResearch: (id) => {
    if (!nearStation() || !research.research(id)) return;
    chime();
    toast(`Researched: ${RESEARCH.find((r) => r.id === id).name}`);
  },
  onEat: (id) => eat(id),
  onBuy: (id) => buySkill(id),
});

// In the Flutter shell the whole phone is drawn by Flutter: the game pauses and sends it
// everything the four tabs show; Flutter answers with what you did (see onShell below).
function phoneSnapshot(tab) {
  const st = survival.stats;
  return {
    type: 'phone', tab, lumen, data: research.data, placing, atSurface: atSurface(), atStation: nearStation(),
    pieces: builder.available().map((p) => ({ id: p.id, name: p.name, cost: costFor(p.id), info: PIECE_INFO[p.id] || '' })),
    research: RESEARCH.map((r) => ({
      id: r.id, name: r.name, desc: r.desc, cost: r.cost, owned: research.isUnlocked(r.id), can: research.canResearch(r.id),
      needs: r.needs.map((id) => ({ name: SPECIES.find((sp) => sp.id === id).name, ok: research.complete(id) })),
    })),
    codex: SPECIES.map((sp) => ({ id: sp.id, name: sp.name, need: sp.need, count: research.counts[sp.id] || 0, complete: research.complete(sp.id), text: sp.text })),
    stats: { health: st.health, breath: st.breath, food: st.food },
    gear: { harpoon: survival.gear.harpoon, max: gearMax('harpoon'), repair: GEAR.harpoon.repair },
    bag: Object.keys(ITEMS).filter((k) => survival.bag[k]).map((k) => ({ id: k, name: ITEMS[k].name, count: survival.bag[k], food: ITEMS[k].food, health: ITEMS[k].health })),
    bagCount: survival.bagCount, bagSize: bagSize(),
    progress: progress.snapshot(),
  };
}
function openPhone(tab) {
  setLens(false);
  if (document.pointerLockElement) document.exitPointerLock();
  if (SHELL) {
    setState('shellphone');
    toShell(phoneSnapshot(tab));
    return;
  }
  setState('phone');
  phone.show(tab);
}

// ---- Building ------------------------------------------------------------------
const atSurface = () => camera.position.y > SURFACE_Y - 0.3;
// You build by picking a piece on the phone; the bar shows what you're placing.
let placing = null;
function startPlacing(id) {
  placing = id;
  builder.select(builder.available().findIndex((p) => p.id === id));
  renderBuildBar();
}
function stopPlacing() {
  placing = null;
  renderBuildBar();
}
function cyclePiece(step) {
  const list = builder.available();
  startPlacing(list[(list.findIndex((p) => p.id === placing) + step + list.length) % list.length].id);
}
function renderBuildBar() {
  if (!placing) return;
  const p = builder.available().find((x) => x.id === placing), cost = costFor(placing);
  $('buildslots').innerHTML = `<div class="slot on${lumen < cost ? ' poor' : ''}">${p.name}<span>${cost} Lumen</span></div>`;
  $('buildtip').textContent = atSurface()
    ? 'Left-click place · Right-click take back · Wheel to switch · X to stop'
    : 'Swim up to the surface to build · X to stop';
}
addEventListener('mousedown', (e) => {
  if (state !== 'playing') return;
  const building = placing && atSurface();
  if (e.button === 2) {
    if (building) { if (builder.remove()) thunk(true); } else setLens(true);
    return;
  }
  if (e.button !== 0) return;
  if (lensOn) { scanHeld = true; return; }
  if (building) {
    const placed = builder.place();
    if (placed) progress.track('builds');
    if (placed) { thunk(); echoSay(placed === 'station' ? 'station' : 'build'); }
  } else if (combat.equipped) shoot();
  else if (!atSurface()) forage();
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) scanHeld = false;
  if (e.button === 2) setLens(false);
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => {
  // In the Flutter shell the plugin's own (misplaced) wheel events are ignored; shellScroll
  // sends the real ones.
  if (SHELL && e.isTrusted) return;
  if (state === 'playing' && placing) cyclePiece(Math.sign(e.deltaY));
}, { passive: true });

// Enter fullscreen and lock the pointer. Either can be refused (an embedded browser, or the
// player hits Esc fast), and a refusal may never settle, so nothing waits on them: the game
// starts at once with cursor look, and pointerlockchange switches to mouse-look.
const ELECTRON = navigator.userAgent.includes('Electron');
const DESKTOP_APP = ELECTRON || !!SHELL; // their windows are already fullscreen

function requestLock() {
  const lock = (opts) => Promise.resolve(canvas.requestPointerLock(opts));
  lock({ unadjustedMovement: true }).catch(() => lock().catch(() => {}));
}

function engage() {
  initAudio();
  // The Flutter shell captures the mouse itself and sends look movement over messages.
  player.setCursorLook(!SHELL);
  setState('playing');
  if (SHELL) return;
  if (!document.fullscreenElement && !DESKTOP_APP) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch(() => {});
  // In fullscreen, Chrome and Edge let the game keep browser shortcuts like Ctrl+W (Ctrl sinks).
  navigator.keyboard?.lock?.(['ControlLeft', 'ControlRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyC', 'Space']).catch(() => {});
  requestLock();
}

function setState(s) {
  state = s;
  $('title').hidden = s !== 'title' || !!SHELL; // the shell draws its own main menu
  $('pause').hidden = s !== 'paused' || !!SHELL;
  toShell({ type: 'state', state: s });
  if (s === 'title') setMusic('title'); else if (s === 'playing') setMusic('reef');
  if (SHELL) document.body.style.cursor = s === 'playing' ? 'none' : '';
  if (s !== 'paused') settings.hide();
  if (s !== 'phone' && phone.open) phone.hide();
  $('hud').hidden = s === 'title';
  setPaused(s !== 'playing' && s !== 'title'); // menu music plays at full volume
  pauseVoice(s !== 'playing' && s !== 'blackout');
  if (s !== 'playing') { player.clearKeys(); setLens(false); }
}

// Diving in from the title screen (the Dive button, or the Flutter shell's main menu).
// The title flyover moves the camera, so the first dive starts from a fixed spot and later
// ones (back from the main menu) from where you left off.
let resumeAt = null;
function startGame() {
  camera.position.copy(resumeAt ?? new THREE.Vector3(0, 7, 24));
  engage();
  echoSay('arrive');
  echoSay('phone');
  echoSay('harpoon');
  setTimeout(() => $('hint').classList.add('gone'), 9000);
}
$('dive').addEventListener('click', startGame);
$('resume').addEventListener('click', engage);
$('opensettings').addEventListener('click', () => { $('pause').hidden = true; settings.show(); });
// The desktop app has no browser chrome to close, so it gets a quit button.
// Messages from the Flutter shell.
onShell('look', (m) => { if (state === 'playing') player.lookBy(m.dx, m.dy); });
// Keys Flutter caught (the page doesn't always have keyboard focus): replay them here.
onShell('key', (m) => dispatchEvent(new KeyboardEvent(m.down ? 'keydown' : 'keyup', { code: m.code })));
onShell('scroll', (m) => shellScroll(m));
onShell('pause', () => { if (state === 'playing') setState('paused'); });
onShell('resume', () => { if (state === 'paused') engage(); });
onShell('settings', () => { if (state === 'paused') { settings.show(); toShell({ type: 'state', state: 'settings' }); } });
// The phone.
onShell('pick', (m) => { if (state === 'shellphone') { startPlacing(m.id); engage(); } });
onShell('stopBuilding', () => { if (state === 'shellphone') { stopPlacing(); engage(); } });
onShell('closeMenu', () => { if (state === 'shellphone') engage(); });
onShell('research', (m) => {
  if (state !== 'shellphone' || !nearStation() || !research.research(m.id)) return;
  chime();
  toast(`Researched: ${RESEARCH.find((r) => r.id === m.id).name}`);
  toShell(phoneSnapshot());
});
onShell('eat', (m) => { if (state === 'shellphone') { eat(m.id); toShell(phoneSnapshot()); } });
onShell('buyNode', (m) => { if (state === 'shellphone') { buySkill(m.id); toShell(phoneSnapshot()); } });
// Flutter's Settings screen edits Echo's voice through these.
const voiceState = () => ({
  type: 'voiceState', settings: settings.state(), packs: VOICE_PACKS.map((p) => ({ id: p.id, name: p.name })),
  systemVoices: systemVoices().map((v) => v.name),
});
onShell('getVoiceState', () => toShell(voiceState()));
onShell('setVoice', (m) => settings.apply(m.patch));
onShell('previewVoice', () => settings.preview());
onShell('stopVoice', () => settings.stopPreview());
onShell('bindings', (m) => setBindings(m.map));
onShell('uiSound', (m) => uiSound(m.kind));
// The shell's main menu and save slots. Saves are the same JSON the game keeps in
// localStorage; the shell stores copies as files. Loading or starting over reloads the page.
const saveSummary = () => ({
  lumen, data: research.data, playTime: Math.round(playTime), builds: builder.serialize().length,
  codex: SPECIES.filter((sp) => research.complete(sp.id)).length, codexTotal: SPECIES.length,
});
onShell('startGame', () => { if (state === 'title') startGame(); });
onShell('toTitle', () => {
  save();
  resumeAt = camera.position.clone();
  setState('title');
});
onShell('getSave', () => {
  save();
  let data = null;
  try { data = localStorage.getItem(SAVE_KEY); } catch { /* storage blocked */ }
  toShell({ type: 'saveData', data, summary: data ? saveSummary() : null });
});
onShell('loadSave', (m) => {
  try { localStorage.setItem(SAVE_KEY, m.data); } catch { /* storage blocked */ }
  location.reload();
});
onShell('newGame', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage blocked */ }
  location.reload();
});

// The mouse wheel, as reported by the Flutter shell: scroll whatever is under the cursor
// (the phone, Settings, ...), and pass it on as a wheel event for the game's own listeners.
const scrollable = (n) => /(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight;
function shellScroll(msg) {
  const { x, y, dx, dy } = msg;
  window.lastShellScroll = msg; // for debugging the bridge
  const target = document.elementFromPoint(x, y);
  let box = null;
  for (let n = target; n && !box; n = n.parentElement) if (scrollable(n)) box = n;
  // Nothing scrollable right under the cursor: scroll whichever panel is open.
  box ??= [$('phone').hidden ? null : $('phone').querySelector('[data-body]'), $('settings').hidden ? null : $('settings').querySelector('.card')]
    .find((n) => n && scrollable(n));
  box?.scrollBy({ top: dy, left: dx });
  (target || window).dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: dy, bubbles: true }));
}
if (ELECTRON) {
  $('quit').hidden = false;
  $('quit').addEventListener('click', () => window.close());
}

// A lock asked for mid-way through entering fullscreen is refused, so ask again once it's done.
document.addEventListener('fullscreenchange', () => {
  if (state === 'playing' && document.fullscreenElement && document.pointerLockElement !== canvas) requestLock();
});
// Some embedded browsers forbid pointer lock entirely; after repeated refusals, say so.
let lockFails = 0;
document.addEventListener('pointerlockerror', () => {
  if (state === 'playing' && ++lockFails >= 3) $('locknote').hidden = false;
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { player.setCursorLook(false); lockFails = 0; $('locknote').hidden = true; }
  else if (state === 'playing') setState('paused');
});
addEventListener('keydown', (e) => {
  // Tab and J are keyboard input, which counts as a user gesture, so closing re-locks the mouse.
  if (SHELL && e.code === 'KeyB' && state === 'playing') openPhone('build');
  else if (SHELL && ['KeyB', 'KeyJ', 'Escape', 'Tab'].includes(e.code) && state === 'shellphone') { engage(); return; }
  if (e.code === 'Tab' && state === 'playing') openPhone();
  else if ((e.code === 'Tab' || e.code === 'KeyJ') && state === 'phone') engage();
  else if (e.code === 'KeyJ' && state === 'playing') openPhone('codex');
  if (e.code === 'KeyX' && state === 'playing' && placing) stopPlacing();
  if (e.code === 'Digit1' && state === 'playing') toggleHarpoon();
  if (e.code === 'KeyF' && state === 'playing' && !lensOn && usable()) use(usable());
  if (e.code === 'KeyR' && state === 'playing') eat();
  // Esc can't re-lock the mouse (browsers don't count it as a gesture), so it goes to the pause screen.
  if (e.code === 'Escape' && state === 'phone') setState('paused');
  // Cursor-look fallback has no pointer lock to lose, so Esc pauses directly.
  if (e.code === 'Escape' && state === 'playing' && document.pointerLockElement !== canvas) setState('paused');
  // P pauses too. With the mouse locked, letting go of the lock is what pauses.
  if (e.code === 'KeyP' && state === 'playing') {
    if (document.pointerLockElement === canvas) document.exitPointerLock(); else setState('paused');
  }
});

// ---- Loop ----------------------------------------------------------------------
const clock = new THREE.Clock();
const GARDEN_SECS = 10;
let t = 0, gardenClock = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;  // the world keeps drifting behind menus; only the player stops
  if (state === 'playing') {
    playTime += dt;
    const before = camera.position.clone();
    player.update(dt, t);
    // Long swim, Deep breath and Into the deep.
    if (!player.onFoot) progress.track('meters', Math.min(camera.position.distanceTo(before), 2));
    if (camera.position.y < SURFACE_Y) {
      progress.track('underwater', dt);
      progress.trackMax('depth', Math.round(SURFACE_Y - camera.position.y));
    }
    world.gather(camera.position, t, gather);
    if (camera.position.distanceTo(world.echo.position) < 7) echoSay('meet');
    if (atSurface()) echoSay('surface');
    updateSubtitle(playTime);
    updateSurvival(dt);
    growFarms(dt);
    // Coral gardens grow Lumen while you play.
    gardenClock += dt;
    if (gardenClock >= GARDEN_SECS) {
      gardenClock -= GARDEN_SECS;
      const n = builder.count('garden');
      if (n) { setLumen(lumen + n); save(); }
    }
  } else if (state === 'title') {
    // Slow drift over the reef behind the title card.
    // Slow drift over the reef, above the kelp tops.
    camera.position.set(Math.sin(t * 0.05) * 34, 19, Math.cos(t * 0.05) * 34);
    camera.lookAt(0, 2, 0);
  }
  world.update(dt, t, camera, state === 'playing' ? player.speed : 0);
  if (state === 'playing') combat.update(dt, t, camera.position.y < SURFACE_Y - 0.5 && !player.onFoot, player.speed);
  const building = state === 'playing' && !!placing && atSurface() && !lensOn;
  builder.update(t, camera, building);
  $('buildbar').hidden = !(state === 'playing' && placing && !lensOn);
  if (placing) renderBuildBar();
  const scan = state === 'playing' && lensOn ? research.update(dt, camera, world.scannables, scanHeld) : null;
  $('scanlabel').hidden = !scan;
  $('scanring').style.setProperty('--p', scan ? scan.progress : 0);
  if (scan) {
    $('scanlabel').innerHTML = `<b>${scan.name}</b>${scan.status}`;
    $('scanlabel').classList.toggle('known', scan.done);
  }
  const near = state === 'playing' && !lensOn ? usable() : null;
  $('prompt').hidden = !near;
  if (near) $('prompt').innerHTML = `<kbd>F</kbd>${USE_LABEL[near.id]}${near.id === 'kelpfarm' ? ` (${near.state?.kelp || 0})` : ''}`;
  const depth = Math.max(0, SURFACE_Y - camera.position.y);
  $('depth').textContent = player.onFoot ? 'On deck' : depth < 0.3 ? 'Surface' : `${depth.toFixed(1)} m`;
  updateAudio(depth, camera.position.y > SURFACE_Y || state === 'title'); // menus aren't muffled
  composer.render();
  requestAnimationFrame(frame);
}


// ?debug exposes the internals in the console.
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { db: { renderer, composer, scene, camera, world, player, builder, research, survival, combat, shellScroll, dispatchShell, addLumen: (n) => setLumen(lumen + n) } });

renderBuildBar();
load();
renderGear();
setState('title'); // announces the title screen (the Flutter shell shows its main menu and sends key bindings)
// Menu music. The desktop apps allow sound straight away; a browser waits for a first click or key.
if (DESKTOP_APP) initAudio();
else for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => initAudio(), { once: true });
// The web menus' buttons get the same sounds as the Flutter menu.
for (const id of ['dive', 'resume', 'opensettings', 'quit']) {
  $(id).addEventListener('pointerenter', () => uiSound('hover'));
  $(id).addEventListener('click', () => uiSound('click'));
}
frame();
