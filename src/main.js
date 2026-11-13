import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, SURFACE_Y, floorY } from './world.js';
import { createPlayer } from './player.js';
import { createBuilder, PIECES, FARM_MAX } from './build.js';
import { createSurvival, ITEMS, GEAR, gearMax, bagSize } from './survival.js';
import * as progress from './progress.js';
import { createCombat } from './combat.js';
import { createResearch, RESEARCH, SPECIES } from './research.js';
import { createPhone } from './phone.js';
import { ECHO_LINES } from './echo-lines.js';
import { speakLine, pauseVoice } from './voice.js';
import { createSettings } from './settings.js';
import { createMenus } from './menus.js';
import { createTutorial, STEPS } from './tutorial.js';
import { createSystems } from './hud-systems.js';
import { createHudFx } from './hud-fx.js';
import { createSalvage, APPS } from './salvage.js';
import { onShock, shockAt } from './shock.js';
import { createSuit, POWER } from './suit.js';
import { createHazards } from './hazards.js';
import { createOutpost, createWrecks, FUSES_NEEDED } from './outpost.js';
import { createRewire } from './rewire.js';
import { createEnvironment } from './environment.js';
import { LOGS, FULL_MEMORY } from './logs.js';
import { UPGRADES } from './suit.js';
import { setTooltips } from './tooltips.js';
import { keyName } from './controls.js';
import { initAudio, updateAudio, setMusic, uiSound, pop, chime, thunk, salvagePing, rebootSound, glitchSound, staticSound, creakSound, glassCrackSound, bubbleSound, lowPowerSound, chargeSound, sparkSound, setEars, earPop, giantDrone, setPaused, gasp, heartbeat, warn, munch, sizzle, grab, harpoonFire, thud, hiss, bite, release, click } from './audio.js';

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
// The tutorial in the corner: steps finish from lifetime stats plus these notes.
const tutorial = createTutorial(progress.stat);
let tutorialOn = true;
const STEP_INDEX = new Map(STEPS.map((st, i) => [st, i])), STEP_TOTAL = STEPS.length;
const research = createResearch({
  onChange: () => { save(); renderBuildBar(); renderHudData(); },
  onEntry: (sp) => {
    toast(`Codex entry complete: ${sp.name}`);
    chime();
    if (sp.id === 'echo') echoSay('scanEcho');
    echoSay('firstEntry');
  },
});
// The flood-damaged visor HUD: systems come back online as you make progress.
const systems = createSystems({
  stat: progress.stat,
  codex: (id) => research.counts[id] || 0,
  stations: () => builder.count('station'),
  researched: () => RESEARCH.filter((r) => research.isUnlocked(r.id)).length,
});
const hudFx = createHudFx(document.body, systems);
// The phone apps the flood washed away, in salvage pods out on the reef.
const salvage = createSalvage(scene, world.kelpPatches);
// The suit (visor battery, pressure on the glass) and the live electricity on the reef.
const suit = createSuit();
const hazards = createHazards(scene, world.jellies);
// The sunken outpost (fuses, a console, electric grates, a vault) and two wrecks.
const outpost = createOutpost(scene);
createWrecks(scene);
// Night and day, currents, the sinkhole, gas vents, and the giant.
const env = createEnvironment(scene);
// The visor's own light, for the dark. It's always in the scene (so adding it never makes the
// renderer rebuild its shaders); at night it comes on and costs battery.
const headlamp = new THREE.SpotLight(0xd8fff7, 0, 26, 0.5, 0.6, 1.4);
headlamp.position.set(0, 0, 0);
headlamp.target.position.set(0, 0, -1);
camera.add(headlamp, headlamp.target);
let fusesHeld = 0;
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
  onFire: () => { harpoonFire(); survival.wear('harpoon'); renderGear(); tutorial.note('fire'); },
  onHit: () => { thud(); progress.track('hits'); },
  onSpot: () => { hiss(); echoSay('eel'); },
  // Electric eels: a crackle as one charges up, then a shock if its ring catches you.
  onEelCharge: () => sparkSound(1),
  onEelZap: () => { shockAt(innerWidth / 2, innerHeight / 2); takeShock('eel', 5); },
  onBite: (dmg) => {
    silt = Math.min(1, silt + 0.5); // the thrashing stirs up the sand
    bite();
    survival.damage(dmg);
    hurtFlash();
    // Blight smears across the glass, and the bite may tear the suit.
    const blightBefore = suit.blight;
    if (suit.bitten()) toast(`The bite tore your suit (${suit.tears} tear${suit.tears > 1 ? 's' : ''})! Cold water is getting in. Patch it at a workbench with kelp.`, { color: '#ff8f8f' });
    else if (blightBefore < 0.01) toast("Eel blight on your visor! It'll spread. Scrub it off at a research station.", { color: '#ff9a5c' });
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

// Options opens from the main menu or the pause menu, and Back returns there.
let settingsNow = {}; // the latest settings (for re-applying the visor theme once it unlocks)
const applyTheme = () => { document.body.dataset.theme = systems.integrity >= 1 ? settingsNow.theme || '' : ''; };
const settings = createSettings($('settings'), {
  themesUnlocked: () => systems.integrity >= 1,
  onBack: () => {
    settings.hide();
    if (state === 'paused') $('pause').hidden = false;
  },
  onControls: (s) => {
    player.setMouse({ sens: s.lookSens, invertY: s.invertY });
    tutorialOn = s.showTutorial !== false;
    setTooltips(s.showTips !== false);
    settingsNow = s;
    applyTheme();
  },
  sound: (kind) => uiSound(kind),
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
    hudFx.text($('subtitle'), next.text, 'comms', '<b>ECHO</b>');
    $('subtitle').classList.add('show');
    lineUntil = t + 3 + next.text.length * 0.06 + settings.gap; // reading time
    chime();
    // Spoken lines stay up until Echo finishes (with a generous cap in case speech stalls).
    if (!next.silent && speakLine(next, () => { lineUntil = Math.min(lineUntil, playTime + settings.gap); })) lineUntil = t + 8 + next.text.length * 0.12;
  } else {
    $('subtitle').classList.remove('show');
  }
}

// ---- Game state ----------------------------------------------------------------
let state = 'title';   // title | playing | paused | phone | blackout
let lumen = 0;
let playTime = 0;

function setLumen(n) {
  lumen = n;
  hudFx.text($('lumen'), lumen.toLocaleString(), 'ledger');
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
      lumen, builds: builder.serialize(), research: research.serialize(), survival: survival.serialize(), progress: progress.serialize(), tutorial: tutorial.serialize(), systems: systems.serialize(), apps: salvage.serialize(), suit: suit.serialize(), env: env.serialize(), outpost: outpost.serialize(), fusesHeld,
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
    tutorial.load(data.tutorial);
    systems.load(data.systems);
    salvage.load(data.apps);
    suit.load(data.suit);
    outpost.load(data.outpost);
    env.load(data.env);
    if (outpost.powered) salvage.unlockVault();
    fusesHeld = data.fusesHeld || 0;
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
  hudFx.text($('data'), research.data.toLocaleString(), 'ledger');
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
  if (piece.id === 'station' && suit.cleanBlight()) { sizzle(); toast('Scrubbed the blight off your visor.'); save(); return; }
  if (piece.id === 'station') openPhone('research');
  if (piece.id === 'fire') {
    const n = survival.cook();
    const dried = suit.dryPhone();
    if (n) { sizzle(); toast(`Cooked ${n} item${n > 1 ? 's' : ''}${dried ? ', and dried your phone' : ''}`); echoSay('cooked'); progress.track('cooked', n); }
    else toast(dried ? 'Dried your phone by the fire.' : 'Nothing raw to cook.');
  }
  if (piece.id === 'workbench' && suit.tears) {
    // Tears first: one strand of kelp patches each.
    const n = suit.patch(survival.bag.kelp || 0);
    if (n) {
      survival.bag.kelp -= n;
      if (!survival.bag.kelp) delete survival.bag.kelp;
      renderBag(); thunk();
      toast(`Patched ${n} tear${n > 1 ? 's' : ''} in your suit${suit.tears ? ` (${suit.tears} left)` : ''}.`);
      save();
    } else toast('Patching a tear takes 1 kelp.');
    return;
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
    tutorial.note('research');
    toast(`Researched: ${RESEARCH.find((r) => r.id === id).name}`);
  },
  onEat: (id) => eat(id),
  onBuy: (id) => buySkill(id),
  suit,
  onMisread: () => { click(); toast('The wet phone misread your tap.', { color: '#9fe8ff' }); },
  onCharge: () => {
    if (suit.power >= 100) { toast('Your visor battery is already full.'); return; }
    if (lumen < POWER.lumenCost) { toast(`Charging takes ${POWER.lumenCost} Lumen.`); return; }
    setLumen(lumen - POWER.lumenCost);
    progress.track('spent', POWER.lumenCost);
    suit.charge(POWER.lumenCharge);
    chargeSound();
    save();
  },
  tutorial,
  systems,
  hasApp: (id) => salvage.found(id),
  logs: () => LOGS.filter((l) => salvage.found(`pod-${l.id}`)),
  fullMemory: FULL_MEMORY,
  onTutorial: (act) => {
    if (act === 'skip') tutorial.skip();
    if (act === 'resume') tutorial.load({ ...tutorial.serialize(), skipped: false });
    if (act === 'restart') tutorial.restart();
    lastStep = undefined;
    save();
  },
});

function openPhone(tab) {
  if (phoneDown() > 0) {
    toast(`Your phone is still rebooting after that shock (${Math.ceil(phoneDown())} s).`, { color: '#9fe8ff' });
    click();
    return;
  }
  setLens(false);
  if (document.pointerLockElement) document.exitPointerLock();
  tutorial.note('phone');
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
  if (state !== 'playing' || player.stunned) return; // stunned: your hands won't work either
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
    if (placed === 'station') tutorial.note('station');
  } else if (combat.equipped) shoot();
  else if (!atSurface()) forage();
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) scanHeld = false;
  if (e.button === 2) setLens(false);
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => {
  if (state === 'playing' && placing) cyclePiece(Math.sign(e.deltaY));
}, { passive: true });

// Enter fullscreen and lock the pointer. Either can be refused (an embedded browser, or the
// player hits Esc fast), and a refusal may never settle, so nothing waits on them: the game
// starts at once with cursor look, and pointerlockchange switches to mouse-look.
const ELECTRON = navigator.userAgent.includes('Electron');

function requestLock() {
  const lock = (opts) => Promise.resolve(canvas.requestPointerLock(opts));
  lock({ unadjustedMovement: true }).catch(() => lock().catch(() => {}));
}

function engage() {
  initAudio();
  player.setCursorLook(true);
  setState('playing');
  // The desktop app's window is already fullscreen (or windowed by choice in Options).
  if (!document.fullscreenElement && !ELECTRON) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch(() => {});
  // In fullscreen, Chrome and Edge let the game keep browser shortcuts like Ctrl+W (Ctrl sinks).
  navigator.keyboard?.lock?.(['ControlLeft', 'ControlRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyC', 'Space']).catch(() => {});
  requestLock();
}

function setState(s) {
  state = s;
  $('title').hidden = s !== 'title';
  $('pause').hidden = s !== 'paused';
  if (s === 'title') { setMusic('title'); menus.renderMain(); } else if (s === 'playing') setMusic('reef');
  if (s !== 'paused' && s !== 'title') settings.hide();
  if (s === 'playing') { $('slots').hidden = true; $('confirm').hidden = true; }
  if (s === 'paused') showPause();
  if (s !== 'phone' && phone.open) phone.hide();
  $('hud').hidden = s === 'title';
  setPaused(s !== 'playing' && s !== 'title'); // menu music plays at full volume
  pauseVoice(s !== 'playing' && s !== 'blackout');
  if (s !== 'rewire') rewire.close();
  if (s !== 'playing') { player.clearKeys(); setLens(false); document.body.classList.remove('stunned'); $('stunnote').hidden = true; }
}

// ---- Main menu, pause menu and save slots ----------------------------------------
// The title flyover moves the camera, so a dive starts from a fixed spot, or (back from
// the main menu) from where you left off.
let resumeAt = null;
function startGame() {
  ready = false;
  camera.position.copy(resumeAt ?? new THREE.Vector3(0, 7, 24));
  engage();
  echoSay('arrive');
  echoSay('phone');
  echoSay('harpoon');
  setTimeout(() => $('hint').classList.add('gone'), 9000);
}

const hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } };
const saveSummary = () => ({
  lumen, data: research.data, playTime: Math.round(playTime), builds: builder.serialize().length,
  codex: SPECIES.filter((sp) => research.complete(sp.id)).length, codexTotal: SPECIES.length,
});
// The game's own save (the same JSON it keeps between visits), for copying into a slot.
function currentSave() {
  save();
  let data = null;
  try { data = localStorage.getItem(SAVE_KEY); } catch { /* storage blocked */ }
  return { data, summary: data ? saveSummary() : null };
}
// Loading a slot or starting over reloads the page with the new save. The game then waits
// on a "Ready to dive" card, since the mouse can only be captured after a click.
const READY = 'deeperbloom-ready';
function restart(data) {
  try {
    if (data) localStorage.setItem(SAVE_KEY, data); else localStorage.removeItem(SAVE_KEY);
    sessionStorage.setItem(READY, data ? 'load' : 'new');
  } catch { /* storage blocked */ }
  location.reload();
}

const menus = createMenus({ main: $('title'), slots: $('slots'), confirm: $('confirm') }, {
  hasSave,
  canExit: ELECTRON,
  currentSave,
  onContinue: startGame,
  onStartNew: () => (hasSave() ? restart(null) : startGame()),
  onLoad: (data) => restart(data),
  onOptions: () => settings.show(),
  onExit: () => window.close(),
  sound: (kind) => uiSound(kind),
});

let ready = false; // the "Ready to dive" card after loading or starting over
function showPause() {
  $('pause-eyebrow').textContent = ready ? 'Ready' : 'Paused';
  $('pause-title').textContent = ready ? 'Ready to dive' : 'Holding your breath';
  $('resume').textContent = ready ? 'Dive' : 'Resume';
  $('savegame').hidden = ready;
}
$('resume').addEventListener('click', () => (ready ? startGame() : engage()));
$('savegame').addEventListener('click', () => {
  $('pause').hidden = true;
  menus.openSlots(true, () => { if (state === 'paused') $('pause').hidden = false; });
});
$('opensettings').addEventListener('click', () => { $('pause').hidden = true; settings.show(); });
$('tomenu').addEventListener('click', () => {
  save();
  if (!ready) resumeAt = camera.position.clone();
  ready = false;
  setState('title');
});
// The desktop app has no browser chrome to close, so it gets a quit button.
if (ELECTRON) {
  $('quit').hidden = false;
  $('quit').addEventListener('click', () => window.close());
}
for (const id of ['resume', 'savegame', 'opensettings', 'tomenu', 'quit']) {
  $(id).addEventListener('pointerenter', () => uiSound('hover'));
  $(id).addEventListener('click', () => uiSound('click'));
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
  if (e.code === 'Tab' && state === 'playing') openPhone();
  else if ((e.code === 'Tab' || e.code === 'KeyJ') && state === 'phone') engage();
  else if (e.code === 'KeyJ' && state === 'playing') openPhone('codex');
  if (e.code === 'KeyX' && state === 'playing' && placing) stopPlacing();
  if (e.code === 'Digit1' && state === 'playing' && !player.stunned) toggleHarpoon();
  if (e.code === 'KeyF' && state === 'playing' && !player.stunned && !lensOn && outpost.nearConsole(camera.position)) fitFuses();
  else if (e.code === 'KeyF' && state === 'playing' && !player.stunned && !lensOn && usable()) use(usable());
  // V: the visor panel, to rewire a system you've got the part for.
  if (e.code === 'KeyV' && state === 'playing' && !player.stunned) openRewire();
  else if (e.code === 'KeyV' && state === 'rewire') engage();
  if (e.code === 'Escape' && state === 'rewire') setState('paused');
  if (e.code === 'KeyR' && state === 'playing' && !player.stunned) eat();
  // Esc can't re-lock the mouse (browsers don't count it as a gesture), so it goes to the pause screen.
  if (e.code === 'Escape' && state === 'phone') setState('paused');
  // Cursor-look fallback has no pointer lock to lose, so Esc pauses directly.
  if (e.code === 'Escape' && state === 'playing' && document.pointerLockElement !== canvas) setState('paused');
  // P pauses too. With the mouse locked, letting go of the lock is what pauses.
  if (e.code === 'KeyP' && state === 'playing') {
    if (document.pointerLockElement === canvas) document.exitPointerLock(); else setState('paused');
  }
});

// ---- Tutorial card ---------------------------------------------------------------
let lastStep, lastCard = '', flashT = 0;
addEventListener('mousemove', (e) => { if (state === 'playing' && Math.abs(e.movementX) + Math.abs(e.movementY) > 2) tutorial.note('look'); });
function updateTutorial() {
  const step = tutorialOn ? tutorial.current() : null;
  // A step just finished: tick it off.
  if (lastStep && step !== lastStep && tutorial.done(lastStep)) {
    chime();
    flashT = performance.now();
    if (!step && tutorial.finished) toast("Tutorial complete. The phone's Guide tab has every how-to.");
    save();
  }
  lastStep = step;
  const card = $('tutorial');
  card.hidden = !step;
  if (!step) return;
  const pr = tutorial.progress(step);
  const html = `<p class="tut-eyebrow">Tutorial · ${STEP_INDEX.get(step) + 1} / ${STEP_TOTAL}</p>
    <b>${step.title}${pr.need > 1 ? ` <small>${Math.floor(pr.have)} / ${pr.need}</small>` : ''}</b>
    <p>${step.how(keyName)}</p>
    ${pr.need > 1 ? `<div class="bar" style="--v:${pr.have / pr.need}"></div>` : ''}
    <small class="tut-foot">${keyName('phone')} → Guide for every how-to, or to skip this</small>`;
  if (html !== lastCard) { card.innerHTML = html; lastCard = html; }
  card.classList.toggle('flash', performance.now() - flashT < 900);
}

// ---- Visor HUD ------------------------------------------------------------------
const _dir = new THREE.Vector3();
let sysClock = 0;
function updateVisor(dt) {
  // Restore systems whose milestones you've reached (checked a few times a second).
  if ((sysClock -= dt) <= 0 && state === 'playing') {
    sysClock = 0.3;
    for (const s of systems.update()) {
      toast(`Part recovered for ${s.name}. Press ${keyName('rewire')} to rewire it.`, { color: '#5CF2D6' });
      chime();
      hudFx.refresh();
      save();
    }
  }
  camera.getWorldDirection(_dir);
  const p = camera.position;
  const point = (kind, at) => ({ kind, bearing: Math.atan2(at.x - p.x, -(at.z - p.z)), dist: Math.hypot(at.x - p.x, at.z - p.z) });
  const points = [point('echo', world.echo.position)];
  const deck = builder.deckNear(p);
  if (deck) points.push(point('raft', deck));
  if (satchel) points.push(point('satchel', satchel.pos));
  if (systems.online('nav')) for (const pod of salvage.remaining()) points.push(point(pod.kind === 'app' ? 'pod' : pod.kind, pod.pos));
  if (systems.online('nav') && !outpost.powered) points.push(point('outpost', outpost.consolePos));
  if (systems.online('sensor') && env.giantPos) points.push({ ...point('giant', env.giantPos), dist: null });
  if (systems.online('sensor')) for (const h of hazards.sources) { const at = h.pos(); if (at.distanceTo(p) < 45) points.push({ ...point('hazard', at), dist: null }); }
  if (systems.online('sensor')) for (const e of combat.eelPositions()) if (e.distanceTo(p) < 45) points.push({ ...point('eel', e), dist: null });
  // Silt makes the compass jitter.
  hudFx.update(dt, t, { heading: Math.atan2(_dir.x, -_dir.z) + (Math.random() - 0.5) * silt * 1.2, points, playing: state === 'playing' });
}

// ---- Touching the cracks --------------------------------------------------------------
// The broken glass is live: touching a crack (visor or phone) shocks you for a little health.
// It also stuns you (you go limp and sink) and knocks the phone offline for a few seconds.
const STUN_SECS = 2.5, PHONE_DOWN_SECS = 6;
let shocked = 0, phoneDownUntil = 0;
const phoneDown = () => Math.max(0, phoneDownUntil - playTime);
let lastWorldShock = -9;
// where: 'visor' | 'phone' (touched the glass) | 'jelly' | 'cable' (swam into live electricity)
function takeShock(where, dmg = 3) {
  if (state !== 'playing' && state !== 'phone' && state !== 'rewire') return;
  survival.damage(dmg * suit.shockFactor()); // the Spark guard halves it
  suit.shocked();
  hurtFlash();
  progress.track('shocks');
  phoneDownUntil = playTime + PHONE_DOWN_SECS;
  // The phone dies in your hand and drops away. (This runs inside the click, so the mouse
  // can be captured again straight away.)
  if (state === 'phone') {
    $('phone').classList.add('dead');
    setTimeout(() => $('phone').classList.remove('dead'), 700);
    engage();
  }
  setLens(false);
  scanHeld = false;
  player.setStun(STUN_SECS);
  const MSG = {
    phone: "Zap! The phone's cracked screen is live. Keep your fingers off the cracks.",
    visor: "Zap! The cracked visor is live. Don't touch the cracks.",
    jelly: 'Zap! That jelly is carrying a charge. Give the pale ones room.',
    cable: 'Zap! That cable is still live. Keep clear of the sparking end.',
    eel: 'Zap! That eel discharged. When one flickers blue, swim out of reach.',
    grate: 'Zap! That floor grate is live. Cross when its glow goes out.',
    wire: "Zap! Wrong socket. Wait for the diagram to show each wire's symbol.",
  };
  if (!['phone', 'visor'].includes(where) || shocked++ < 2) toast(MSG[where], { color: '#9fe8ff' });
}
onShock(({ where }) => takeShock(where));

// ---- The suit: visor battery, pressure, live electricity --------------------------
let silt = 0, surgeBlockedSaid = false, lastCamY = 0, earsWarned = false, ventClock = 0, sinkSaid = false, nightSaid = false;
addEventListener('keydown', (e) => { if (e.code === 'KeyH' && state === 'playing' && suit.equalise()) earPop(); });
let creakClock = 3, bubbleClock = 0, sparkClock = 0, wasCharging = false, purgeHeld = false, purgeClock = 0;
addEventListener('keydown', (e) => { if (e.code === 'KeyG') purgeHeld = true; });
addEventListener('keyup', (e) => { if (e.code === 'KeyG') purgeHeld = false; });
addEventListener('blur', () => { purgeHeld = false; });
function updateSuit(dt) {
  const depth = Math.max(0, SURFACE_Y - camera.position.y), surfaced = atSurface(), sealed = systems.online('visor');
  // Night and day; currents, the sinkhole and vents push you about.
  const under = camera.position.y < SURFACE_Y;
  const envOut = env.update(dt, t, camera.position, { logsDone: salvage.count('log') === LOGS.length, exposed: under && !player.onFoot });
  player.push(envOut.push, dt);
  if (envOut.breath) survival.stats.breath = Math.min(100, survival.stats.breath + envOut.breath * dt);
  if (envOut.inVent && (ventClock -= dt) <= 0) { bubbleSound(); ventClock = 0.25; }
  if (envOut.inSinkhole && !sinkSaid) { sinkSaid = true; toast("A sinkhole! It's dragging you down into the deep. Swim hard up and out.", { color: '#ff8f8f' }); }
  if (!envOut.inSinkhole) sinkSaid = false;
  const night = env.night;
  world.setNight(night);
  combat.setNight(night);
  headlamp.intensity = night > 0.05 && suit.power > 0 && under ? 2.6 * night : 0;
  if (headlamp.intensity) suit.drain(0.12 * night * dt);
  if (night > 0.5 && !nightSaid) { nightSaid = true; toast('Night is falling. Your visor light is on (it costs battery), and the eels see further in the dark.', { color: '#9fb8ff' }); }
  if (night < 0.1) nightSaid = false;
  if (envOut.giantStart) {
    giantDrone(true);
    staticSound(0.6);
    if (systems.online('sensor')) toast('THREAT SENSOR: something very large, passing.', { color: '#ff8f8f' });
  }
  if (envOut.giantEnd) giantDrone(false);
  const sinkSpeed = Math.max(0, (lastCamY - camera.position.y) / Math.max(dt, 1e-3));
  lastCamY = camera.position.y;
  const ev = suit.update(dt, { depth, surfaced, onDeck: player.onFoot, sealed, dashing: player.dashing, breath: survival.stats.breath, sinkSpeed });
  // Cold water through tears and unequalised ears both hurt.
  const hd = suit.healthDrain({ surfaced, onDeck: player.onFoot });
  if (hd) survival.damage(hd * dt);
  setEars(suit.ears);
  if (suit.ears >= 0.6 && !earsWarned) { earsWarned = true; toast(`Your ears hurt from the pressure. Press ${keyName('equalise')} to equalise.`, { color: '#ff8f8f' }); }
  if (suit.ears < 0.2) earsWarned = false;
  // With the UV flush researched, purging also burns blight off.
  if (purgeHeld && research.isUnlocked('uv')) suit.uvFlush(dt);
  if (envOut.fog) suit.addFog(envOut.fog * dt);
  // Holding purge clears the fog, at a little battery.
  if (purgeHeld && suit.purge(dt) && (purgeClock -= dt) <= 0) { hiss(); purgeClock = 0.9; }
  if (ev.overheat) {
    staticSound(0.4);
    toast('Overheating! Your visor is whiting out and the battery is draining twice as fast. Stop dashing and let the water cool you.', { color: '#ff8f8f' });
  }
  // Running out of air: the HUD breaks down with you.
  hudFx.setAir(Math.max(0, Math.min(1, (30 - survival.stats.breath) / 30)), true);
  const charging = player.onFoot || surfaced;
  if (charging && !wasCharging && suit.power < 99) chargeSound();
  wasCharging = charging;
  if (ev.warn) {
    lowPowerSound(ev.warn <= 5);
    toast(ev.warn === 30 ? 'Visor battery 30%: navigation shut off to save power. Recharge on a raft deck, at the surface, or with Lumen (phone Status).'
      : ev.warn === 15 ? 'Visor battery 15%: depth gauge off. Get to a raft.' : 'Visor battery 5%: your HUD is going dark.', { color: '#ffc46b' });
  }
  if (ev.layer) {
    glassCrackSound();
    toast(ev.layer < 3 ? "The glass is cracking under the pressure! Go shallower (above 20 m) or fix the Visor seal." : 'Your visor is leaking! Get shallower, or surface to drain it.', { color: '#ff8f8f' });
  }
  // The glass groans more often the harder it's strained.
  if (!sealed && suit.stress > 0.15 && (creakClock -= dt) <= 0) {
    creakSound(suit.stress);
    creakClock = 1.5 + Math.random() * 5 * (1.2 - suit.stress);
  }
  // Water in the visor: bubbles, and it steals your breath.
  if (suit.leak > 0.01) {
    if (camera.position.y < SURFACE_Y) survival.stats.breath = Math.max(0, survival.stats.breath - (100 / 45) * suit.leakBreathFactor() * dt);
    if ((bubbleClock -= dt) <= 0) { bubbleSound(); bubbleClock = 0.6 + Math.random() * 1.2; }
  }
  hudFx.setSuit({ power: suit.power, charging: charging && suit.power < 100, unpowered: suit.unpowered, crackLayers: sealed ? 0 : suit.crackLayers, stress: suit.stress, leak: suit.leak, sealed, fog: suit.fog, heat: suit.heat, overheated: suit.overheated, blight: suit.blight, ears: suit.ears, tears: suit.tears, visorWet: suit.visorWet, clock: `${env.night > 0.5 ? '☾' : '☀'} ${env.clock}` });

  // Live electricity: crackle as you get close, shock if you touch.
  const hz = hazards.update(dt, t, camera.position);
  if (hz.surgeWarn) { chargeSound(); toast('Power surge building in the cables! Keep clear of them.', { color: '#fff27a' }); surgeBlockedSaid = false; }
  if (hz.surge) { staticSound(0.5); sparkSound(1); }
  // Silt: swimming fast along the bottom stirs it up; it settles slowly.
  const nearFloor = camera.position.y - floorY(camera.position.x, camera.position.z) < 1.8;
  silt = Math.max(0, Math.min(1, silt + (nearFloor && !player.onFoot && player.speed > 3 ? 0.45 : -0.12) * dt));
  world.setSilt(silt);
  if (hz.nearest < 8 && (sparkClock -= dt) <= 0) {
    sparkSound(1 - hz.nearest / 8);
    sparkClock = 0.15 + Math.random() * 0.5 * (hz.nearest / 8);
  }
  const op = outpost.update(dt, t, camera.position);
  if (op.hit && playTime - lastWorldShock > 2) {
    lastWorldShock = playTime;
    shockAt(innerWidth / 2, innerHeight / 2);
    takeShock('grate', 4);
  }
  if (hz.hit && playTime - lastWorldShock > 2) {
    lastWorldShock = playTime;
    shockAt(innerWidth / 2, innerHeight / 2);
    takeShock(hz.hit.kind, 4);
  }
}
// The STUNNED / PHONE REBOOTING readout and the stun overlay.
function updateStun() {
  const stunned = state === 'playing' && player.stunned, down = phoneDown();
  document.body.classList.toggle('stunned', stunned);
  const note = $('stunnote');
  note.hidden = !(state === 'playing' && (stunned || down > 0));
  if (note.hidden) return;
  const html = stunned ? `<b>STUNNED</b><span>you're sinking: ${player.stunLeft.toFixed(1)} s</span>`
    : `<b class="phone">PHONE REBOOTING</b><span>back in ${Math.ceil(down)} s</span>`;
  if (note.innerHTML !== html) note.innerHTML = html;
}

// ---- Rewiring and the outpost --------------------------------------------------------
const rewire = createRewire($('rewire'), {
  sound: (kind) => uiSound(kind),
  onDone: (id) => {
    const sys = systems.install(id);
    hudFx.restore(sys);
    toast(`System restored: ${sys.name}`, { color: '#5CF2D6' });
    if (systems.integrity >= 1) setTimeout(() => { toast('Every system restored. New visor themes unlocked in Options → Display & help.', { color: '#5CF2D6' }); applyTheme(); }, 3000);
    save();
    engage();
  },
  onWrong: (x, y) => { shockAt(x, y); takeShock('wire', 3); engage(); },
  onClose: () => engage(),
});
function openRewire() {
  const next = systems.ready[0];
  if (!next) { click(); toast("No parts to fit yet. Each system's milestone gets you its part (phone Status shows how)."); return; }
  setLens(false);
  if (document.pointerLockElement) document.exitPointerLock();
  setState('rewire');
  rewire.open(next, systems.integrity >= 0.5 ? 4 : 3);
}
function fitFuses() {
  if (outpost.powered) { toast('The outpost already has power.'); return; }
  if (!fusesHeld) { click(); toast(`The console needs ${FUSES_NEEDED - outpost.fitted} more fuse${FUSES_NEEDED - outpost.fitted > 1 ? 's' : ''}. They're somewhere around the outpost.`); return; }
  const n = fusesHeld;
  fusesHeld = 0;
  thunk();
  if (outpost.fit(n)) {
    rebootSound();
    salvage.unlockVault();
    toast('Power restored! The outpost lights up and its vault doors grind open.', { color: '#5CF2D6' });
  } else toast(`${outpost.fitted} of ${FUSES_NEEDED} fuses fitted.`, { color: '#ff9a5c' });
  save();
}

// ---- Salvage pods (lost phone apps) ---------------------------------------------------
let pingClock = 0;
function updateSalvage(dt) {
  const { got, nearest, blocked } = salvage.update(t, camera.position, (pos) => !hazards.cutOff(pos));
  if (blocked && !surgeBlockedSaid) { surgeBlockedSaid = true; toast("That pod is cut off by the surge. Wait for it to pass.", { color: '#fff27a' }); }
  if (got) {
    rebootSound();
    if (got.kind === 'cell') {
      suit.addCell();
      suit.charge(100);
      toast(`Power cell fitted (${suit.cells} of 2): your visor battery lasts longer, and it's fully charged.`, { color: '#ffc46b' });
    } else if (got.kind === 'fuse') {
      fusesHeld++;
      toast(`Picked up a fuse (${fusesHeld} held). Fit it at the sunken outpost's console with ${keyName('use')}.`, { color: '#ff9a5c' });
    } else if (got.kind === 'upgrade') {
      suit.addUpgrade(got.upgrade);
      toast(`Visor upgrade: ${UPGRADES[got.upgrade].name}. ${UPGRADES[got.upgrade].desc}`, { color: '#f4fbff' });
    } else if (got.kind === 'log') {
      const log = LOGS.find((l) => l.id === got.log), n = salvage.count('log');
      // The fragment plays as a broken line of text (no voice: the recording is too damaged).
      queue.push({ key: 'log', i: 0, text: `[${log.title}] ${log.text}`, silent: true });
      lineUntil = 0;
      toast(n === LOGS.length ? "Echo's memory is whole again. Read it on the phone's Guide tab." : `Echo's log recovered (${n} of ${LOGS.length})`, { color: '#b59cff' });
    } else toast(`Recovered the ${got.name} app (${APPS.filter((a) => salvage.found(a.id)).length} of ${APPS.length})`, { color: '#5CF2D6' });
    tutorial.note('salvage');
    save();
  }
  // A sonar ping from the nearest pod, faster and louder as you close in.
  if (nearest < 32 && (pingClock -= dt) <= 0) {
    const close = 1 - nearest / 32;
    salvagePing(close);
    pingClock = 2.6 - close * 1.8;
  }
}

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
    if (atSurface()) { echoSay('surface'); tutorial.note('surface'); }
    if (player.onFoot) tutorial.note('deck');
    updateSalvage(dt);
    updateStun();
    updateSuit(dt);
    updateTutorial();
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
  // Thick silt stops the lens locking on.
  const scan = state === 'playing' && lensOn ? research.update(dt, camera, world.scannables, scanHeld && silt < 0.4) : null;
  if (scan && silt >= 0.4) scan.status = 'Too much silt to lock on';
  $('scanlabel').hidden = !scan;
  $('scanring').style.setProperty('--p', scan ? scan.progress : 0);
  if (scan) {
    hudFx.text($('scanlabel'), scan.status, 'lens', `<b>${scan.name}</b>`);
    $('scanlabel').classList.toggle('known', scan.done);
  }
  const atConsole = state === 'playing' && !lensOn && !outpost.powered && outpost.nearConsole(camera.position);
  const near = state === 'playing' && !lensOn && !atConsole ? usable() : null;
  $('prompt').hidden = !near && !atConsole;
  if (atConsole) $('prompt').innerHTML = `<kbd>${keyName('use')}</kbd>Fit fuses (${fusesHeld} held, ${outpost.fitted} of ${FUSES_NEEDED} fitted)`;
  else if (near) $('prompt').innerHTML = `<kbd>F</kbd>${USE_LABEL[near.id]}${near.id === 'kelpfarm' ? ` (${near.state?.kelp || 0})` : ''}`;
  const depth = Math.max(0, SURFACE_Y - camera.position.y);
  hudFx.text($('depth'), player.onFoot ? 'On deck' : depth < 0.3 ? 'Surface' : `${depth.toFixed(1)} m`, 'depth');
  updateVisor(dt);
  updateAudio(depth, camera.position.y > SURFACE_Y || state === 'title'); // menus aren't muffled
  // A wet phone: apps crash now and then while it's out.
  if (state === 'phone' && suit.phoneWet > 0.2 && Math.random() < suit.phoneWet * 0.06 * dt) {
    phone.crash();
    glitchSound(1);
    toast('App crashed: there\'s water in your phone. Dry it at a cook fire.', { color: '#9fe8ff' });
  }
  composer.render();
  requestAnimationFrame(frame);
}


// ?debug exposes the internals in the console.
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { db: { renderer, composer, scene, camera, world, player, builder, research, survival, combat, settings, menus, tutorial, systems, hudFx, salvage, suit, hazards, outpost, rewire, env, headlamp, giveFuses: (n) => { fusesHeld += n; }, setSilt: (v) => { silt = v; }, getSilt: () => silt, addLumen: (n) => setLumen(lumen + n) } });

renderBuildBar();
load();
renderGear();
// Saves from before the visor HUD: systems you've already earned come back quietly.
systems.update();
hudFx.refresh();
// Saves from before the tutorial: count what's already built or researched.
if (builder.count('station')) tutorial.note('station');
if (RESEARCH.some((r) => research.isUnlocked(r.id))) tutorial.note('research');
// Back from loading a slot or starting over: wait on the ready card. Otherwise, the main menu.
let wasReady = null;
try { wasReady = sessionStorage.getItem(READY); sessionStorage.removeItem(READY); } catch { /* none */ }
if (wasReady) {
  ready = true;
  camera.position.set(0, 7, 24);
  setState('paused');
} else setState('title');
// Menu music. The desktop app allows sound straight away; a browser waits for a first click or key.
if (ELECTRON) initAudio();
else for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => initAudio(), { once: true });
frame();
