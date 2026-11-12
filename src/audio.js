// All sound is synthesized with Web Audio, like Deep Bloom: no asset files to load or license.
// In the water the pad uses Deep Bloom's "Sunlit reef" progression; the main menu has its
// own slower theme. Everything sits under a lowpass that closes as you swim deeper.

const THEMES = {
  reef: {
    chords: [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 55, 59, 62], [45, 52, 57, 61, 64]],
    scale: [74, 76, 78, 81, 83, 86, 88, 90],
    chordLen: 8, pad: 'triangle', lp: 900, padGain: 0.035, bellChance: 0.55, bellGap: [0.8, 2.4], bellGain: 0.04,
  },
  // "Deeper": A minor, wide and slow, with a low drone and the odd distant whale call.
  title: {
    chords: [[45, 57, 60, 64, 71], [41, 53, 57, 60, 64], [48, 55, 60, 64, 67], [43, 55, 59, 62, 69]],
    scale: [76, 79, 81, 84, 86, 88, 91, 93],
    chordLen: 11, pad: 'sine', lp: 650, padGain: 0.05, bellChance: 0.45, bellGap: [1.6, 3.2], bellGain: 0.045,
    drone: true, whaleEvery: 3,
  },
};
let theme = THEMES.reef;

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

let ctx = null, master, water, music, sfx, echoIn, ui;
// The player's volumes (Settings → Sound), each 0..1, on top of the mix levels below.
let vol = { master: 1, music: 1, sfx: 1, ui: 1, muted: false };
let paused = false;
const MIX = { master: 0.8, music: 0.5, sfx: 0.7, pausedDip: 0.3 };
let chordIdx = 0, nextChord = 0, nextBell = 0;

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  ctx = new AudioContext();
  master = ctx.createGain();
  water = ctx.createBiquadFilter(); water.type = 'lowpass'; water.frequency.value = 2400; water.Q.value = 0.4;
  water.connect(master); master.connect(ctx.destination);
  music = ctx.createGain(); music.connect(water);
  sfx = ctx.createGain(); sfx.connect(water);
  ui = ctx.createGain(); ui.connect(master); // menu sounds skip the water filter
  applyVolumes(true);

  // A long feedback echo for bells and pops, so everything rings like it's underwater.
  echoIn = ctx.createGain(); echoIn.gain.value = 0.35;
  const delay = ctx.createDelay(2); delay.delayTime.value = 0.42;
  const fb = ctx.createGain(); fb.gain.value = 0.45;
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1800;
  echoIn.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(water);

  // Ambient water: looping brown noise, very low.
  const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 380;
  const ng = ctx.createGain(); ng.gain.value = 0.22;
  noise.connect(nf); nf.connect(ng); ng.connect(sfx); noise.start(); // ambience counts as effects

  nextChord = ctx.currentTime + 0.3;
  nextBell = ctx.currentTime + 2;
}

function voice(freq, t, dur, { type = 'sine', gain = 0.1, attack = 0.02, out = music, echo = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out);
  if (echo) { const e = ctx.createGain(); e.gain.value = echo; g.connect(e); e.connect(echoIn); }
  o.start(t); o.stop(t + dur + 0.05);
}

// Call every frame. depth: metres below the surface; above: head out of the water.
export function updateAudio(depth, above = false) {
  if (!ctx) return;
  const now = ctx.currentTime;
  water.frequency.setTargetAtTime(above ? 12000 : Math.max(500, 2600 - depth * 70), now, 0.5);

  const th = theme;
  if (now >= nextChord) {
    const n = chordIdx++, chord = th.chords[n % th.chords.length];
    const pad = ctx.createBiquadFilter(); pad.type = 'lowpass'; pad.frequency.value = th.lp; pad.connect(music);
    chord.forEach((m, i) => voice(hz(m), nextChord + i * 0.05, th.chordLen + 2, { type: th.pad, gain: th.padGain, attack: 2.2, out: pad }));
    if (th.drone) voice(hz(chord[0] - 12), nextChord, th.chordLen + 3, { gain: 0.06, attack: 3, out: pad });
    if (th.whaleEvery && n % th.whaleEvery === th.whaleEvery - 1) whale(nextChord + th.chordLen * 0.4);
    nextChord += th.chordLen;
  }
  if (now >= nextBell) {
    if (Math.random() < th.bellChance) {
      const m = th.scale[(Math.random() * th.scale.length) | 0];
      voice(hz(m), nextBell, 2.4, { gain: th.bellGain, attack: 0.01, echo: 0.8 });
    }
    nextBell += th.bellGap[0] + Math.random() * (th.bellGap[1] - th.bellGap[0]);
  }
}

// A far-off whale: a slow, low glide that rings out in the echo.
function whale(t) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'sine';
  o.frequency.setValueAtTime(190, t);
  o.frequency.exponentialRampToValueAtTime(260, t + 1.4);
  o.frequency.exponentialRampToValueAtTime(150, t + 3.6);
  f.type = 'lowpass'; f.frequency.value = 600;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
  o.connect(f); f.connect(g); g.connect(music);
  const e = ctx.createGain(); e.gain.value = 1; g.connect(e); e.connect(echoIn);
  o.start(t); o.stop(t + 4);
}

// Switches the music ('reef' in the water, 'title' on the main menu). The new theme comes
// in on the next chord while the last one rings out.
export function setMusic(name) {
  const next = THEMES[name];
  if (!next || next === theme) return;
  theme = next;
  if (ctx) nextChord = Math.min(nextChord, ctx.currentTime + 0.6);
}

// Menu sounds. They skip the water filter: menus aren't underwater.
export function uiSound(kind) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const blip = (freq, at, dur, gain, type = 'sine') => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, at); o.frequency.exponentialRampToValueAtTime(freq * 1.12, at + dur * 0.6);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(ui);
    o.start(at); o.stop(at + dur + 0.05);
  };
  if (kind === 'hover') blip(hz(88), t, 0.12, 0.035);
  else if (kind === 'click') { blip(hz(81), t, 0.22, 0.07, 'triangle'); blip(hz(88), t + 0.07, 0.3, 0.06, 'triangle'); }
  else if (kind === 'back') { blip(hz(84), t, 0.18, 0.05, 'triangle'); blip(hz(76), t + 0.06, 0.25, 0.045, 'triangle'); }
}

// Collecting a polyp: a rising bubble blip, brighter for rarer polyps.
export function pop(bright = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(bright ? 700 : 480, t);
  o.frequency.exponentialRampToValueAtTime(bright ? 1700 : 1100, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  o.connect(g); g.connect(sfx);
  const e = ctx.createGain(); e.gain.value = 0.5; g.connect(e); e.connect(echoIn);
  o.start(t); o.stop(t + 0.3);
  if (bright) voice(hz(THEMES.reef.scale[5]), t + 0.08, 1.6, { gain: 0.06, out: sfx, echo: 0.8 });
}

// Building: a hollow wooden knock (lower when taking a piece back).
export function thunk(remove = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'triangle';
  o.frequency.setValueAtTime(remove ? 150 : 220, t);
  o.frequency.exponentialRampToValueAtTime(remove ? 70 : 110, t + 0.15);
  f.type = 'lowpass'; f.frequency.value = 900;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(f); f.connect(g); g.connect(sfx);
  o.start(t); o.stop(t + 0.25);
}

// Echo speaking: a soft two-note chime.
export function chime() {
  if (!ctx) return;
  const t = ctx.currentTime;
  voice(hz(81), t, 2.5, { gain: 0.07, out: sfx, echo: 1 });
  voice(hz(88), t + 0.18, 2.5, { gain: 0.05, out: sfx, echo: 1 });
}

export function setPaused(p) {
  paused = p;
  applyVolumes();
}

// The player's volume settings: { master, music, sfx, ui } (0..1) and muted.
export function setVolumes(v) {
  vol = { ...vol, ...v };
  applyVolumes();
}

function applyVolumes(now = false) {
  if (!ctx) return;
  const set = (node, value) => (now ? node.gain.setValueAtTime(value, ctx.currentTime) : node.gain.setTargetAtTime(value, ctx.currentTime, 0.15));
  set(master, vol.muted ? 0 : MIX.master * vol.master * (paused ? MIX.pausedDip : 1));
  set(music, MIX.music * vol.music);
  set(sfx, MIX.sfx * vol.sfx);
  set(ui, vol.ui);
}

// ---- Survival sounds ------------------------------------------------------------
// A burst of filtered noise: the base of gasps, sizzles and crunches.
function noise(t, dur, { freq = 1000, q = 1, type = 'bandpass', gain = 0.3, attack = 0.01 } = {}) {
  const len = Math.ceil(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfx);
  src.start(t); src.stop(t + dur);
}

// Breaking the surface short of air.
export function gasp() {
  if (!ctx) return;
  noise(ctx.currentTime, 0.7, { freq: 1400, q: 0.7, gain: 0.35, attack: 0.08 });
}

// Low on health: a dull heartbeat thump (call about once a second).
export function heartbeat() {
  if (!ctx) return;
  const t = ctx.currentTime;
  voice(55, t, 0.25, { gain: 0.4, attack: 0.005, out: sfx });
  voice(50, t + 0.18, 0.3, { gain: 0.3, attack: 0.005, out: sfx });
}

// Breath running out: a thin warning ping.
export function warn() {
  if (!ctx) return;
  voice(hz(84), ctx.currentTime, 0.5, { gain: 0.06, out: sfx, echo: 0.5 });
}

export function munch() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) noise(t + i * 0.14, 0.09, { freq: 2200, q: 1.5, gain: 0.25 });
}

export function sizzle() {
  if (!ctx) return;
  noise(ctx.currentTime, 1.4, { freq: 5000, type: 'highpass', gain: 0.18, attack: 0.05 });
}

// Grabbing a fish or strand of kelp: a quick swish.
export function grab() {
  if (!ctx) return;
  noise(ctx.currentTime, 0.18, { freq: 800, q: 2, gain: 0.3 });
}

// ---- Combat sounds -----------------------------------------------------------
export function harpoonFire() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 0.25, { freq: 2600, q: 0.8, gain: 0.35 });
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.2);
  g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g); g.connect(sfx); o.start(t); o.stop(t + 0.25);
}
// The spear striking something.
export function thud() {
  if (!ctx) return;
  const t = ctx.currentTime;
  voice(90, t, 0.25, { gain: 0.45, attack: 0.003, out: sfx });
  noise(t, 0.12, { freq: 600, q: 1, gain: 0.3 });
}
// An eel noticing you: a wet rising hiss.
export function hiss() {
  if (!ctx) return;
  noise(ctx.currentTime, 0.9, { freq: 3500, q: 3, gain: 0.2, attack: 0.25 });
}
export function bite() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 0.15, { freq: 1200, q: 2, gain: 0.5 });
  voice(70, t, 0.35, { type: 'square', gain: 0.15, attack: 0.005, out: sfx });
}
// The blight burning out of an eel: a falling, softening tone.
export function release() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'triangle'; o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(110, t + 1.6);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  o.connect(g); g.connect(sfx); o.start(t); o.stop(t + 1.9);
  voice(hz(81), t + 0.4, 2, { gain: 0.05, out: sfx, echo: 1 });
}
// Dry-firing a broken harpoon.
export function click() {
  if (!ctx) return;
  noise(ctx.currentTime, 0.05, { freq: 3000, q: 4, gain: 0.3 });
}

// ---- Echo's voice FX ----------------------------------------------------------
// The same rack as the Black Relay voice studio: a lowpass, then a reverb mixed wet/dry.
// The voice skips the depth filter so Echo is always clear, however deep you are.
const irCache = new Map();
// A synthetic reverb tail: decaying noise, darker with more damping, longer with a bigger room.
function impulse(roomSize, damping) {
  const id = `${roomSize.toFixed(2)}:${damping.toFixed(2)}`;
  if (irCache.has(id)) return irCache.get(id);
  const secs = 0.4 + roomSize * 3.6, len = Math.ceil(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const smooth = 0.15 + damping * 0.8; // one-pole lowpass on the tail
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += (Math.random() * 2 - 1 - lp) * (1 - smooth);
      d[i] = lp * Math.pow(1 - i / len, 2 + damping * 2);
    }
  }
  irCache.set(id, buf);
  return buf;
}

// Plays decoded-or-encoded voice audio through the FX rack. Resolves when it finishes.
// fx: { volume, cutoff, roomSize, damping, wet, dry }
let voiceSrc = null;
export async function playVoice(audio, fx) {
  if (!ctx) return;
  stopVoice();
  const buffer = audio instanceof AudioBuffer ? audio : await ctx.decodeAudioData(audio.slice(0));
  const src = ctx.createBufferSource(); src.buffer = buffer;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = fx.cutoff; lp.Q.value = 0.5;
  const dry = ctx.createGain(); dry.gain.value = fx.dry;
  const rev = ctx.createConvolver(); rev.buffer = impulse(fx.roomSize, fx.damping);
  const wet = ctx.createGain(); wet.gain.value = fx.wet;
  const out = ctx.createGain(); out.gain.value = fx.volume;
  src.connect(lp); lp.connect(dry); lp.connect(rev); rev.connect(wet);
  dry.connect(out); wet.connect(out); out.connect(master);
  voiceSrc = src;
  return new Promise((resolve) => {
    src.onended = () => { if (voiceSrc === src) voiceSrc = null; resolve(); };
    src.start();
  });
}
export function stopVoice() {
  if (!voiceSrc) return;
  const s = voiceSrc; voiceSrc = null;
  try { s.stop(); } catch { /* already stopped */ }
}
export const audioReady = () => !!ctx;

// For debugging: is sound running, and which music is playing?
export const audioState = () => ({
  running: ctx?.state === 'running', music: Object.keys(THEMES).find((k) => THEMES[k] === theme),
  volumes: { ...vol }, masterGain: master ? +master.gain.value.toFixed(3) : null,
});
