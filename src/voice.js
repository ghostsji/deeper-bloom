import { playVoice, stopVoice, audioReady } from './audio.js';
import { VOICE_DEFAULTS, rateStr, pitchStr, lineFile, packById } from './voice-settings.js';

// Echo's voice. Sources, best first:
//   bundled  a built-in voice pack shipped in assets/voice/<pack> (works offline)
//   live     any neural voice, generated on demand by the desktop app (and cached)
//   system   the browser's built-in speech
// Bundled and live audio go through the FX rack in audio.js; a missing bundled line falls
// back to live, and anything that fails falls back to the system voice.

const live = typeof window !== 'undefined' ? window.deeperBloom?.tts : null;
const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
let cfg = { ...VOICE_DEFAULTS };
let token = 0; // bumps on every new line, so a stale line's "finished" never cuts the next one short

export const liveAvailable = () => !!live;
export const systemAvailable = () => !!synth;
export function configure(next) { cfg = { ...cfg, ...next }; }
export const voiceList = () => (live ? live.voices() : Promise.resolve([]));

const fx = () => ({ volume: cfg.volume, cutoff: cfg.cutoff, roomSize: cfg.roomSize, damping: cfg.damping, wet: cfg.wet, dry: cfg.dry });

async function fromBundle(key, i) {
  const res = await fetch(`assets/voice/${packById(cfg.pack).id}/${lineFile(key, i)}`);
  if (!res.ok) throw new Error('not bundled');
  return res.arrayBuffer();
}
// Live lines use the studio's voice; a pack missing a line borrows its own voice, at pack speed.
const fromLive = (text, pack) => live.synth(pack
  ? { text, voice: pack.voice, rate: rateStr(VOICE_DEFAULTS.rate), pitch: pitchStr(VOICE_DEFAULTS.pitch) }
  : { text, voice: cfg.voice, rate: rateStr(cfg.rate), pitch: pitchStr(cfg.pitch) });

// Soft female system voices, best first (Windows "Natural" voices sound far better).
const PREFERRED = [/aria.*natural/i, /jenny.*natural/i, /sonia.*natural/i, /natural.*female/i,
  /aria/i, /jenny/i, /sonia/i, /samantha/i, /google uk english female/i, /zira/i, /hazel/i, /susan/i, /female/i];
// English system voices, for the Settings list.
export const systemVoices = () => (synth ? synth.getVoices().filter((v) => /^en/i.test(v.lang)) : []);
export function onSystemVoicesChanged(fn) { synth?.addEventListener?.('voiceschanged', fn); }

function systemVoice() {
  const voices = systemVoices();
  const chosen = cfg.systemVoice && voices.find((v) => v.name === cfg.systemVoice);
  if (chosen) return chosen;
  for (const re of PREFERRED) { const v = voices.find((x) => re.test(x.name)); if (v) return v; }
  return voices[0] || null;
}
function speakSystem(text, my) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = systemVoice(); if (v) u.voice = v;
    u.rate = Math.max(0.5, 1 + cfg.rate / 100);
    u.pitch = Math.min(2, Math.max(0, 1 + cfg.pitch / 40));
    u.volume = cfg.volume;
    u.onend = u.onerror = () => resolve(my);
    synth.speak(u);
  });
}

async function play(text, key, i, my) {
  const source = cfg.source;
  if (audioReady() && (source === 'bundled' || source === 'live')) {
    let audio = null;
    if (source === 'bundled' && key) audio = await fromBundle(key, i).catch(() => null);
    if (!audio && live) audio = await fromLive(text, source === 'bundled' ? packById(cfg.pack) : null).catch(() => null);
    if (my !== token) return my;
    if (audio) { await playVoice(audio, fx()); return my; }
  }
  if (synth) return speakSystem(text, my);
  return my;
}

// Speaks one of Echo's lines. onEnd runs once she's finished (not if a newer line took over).
// Returns false when the voice is off, so the caller can fall back to reading time.
export function speakLine({ key, i, text }, onEnd) {
  if (cfg.source === 'off' || (!synth && !live && !audioReady())) return false;
  stop();
  const my = ++token;
  play(text, key, i, my).then((t) => { if (t === token) onEnd?.(); });
  return true;
}
// Built-in packs only hold Echo's real lines, so they preview one of those instead of `text`.
export function preview(text, packLine) { return speakLine(cfg.source === 'bundled' && packLine ? packLine : { text }); }

export function stop() {
  token++;
  stopVoice();
  synth?.cancel();
}
export function pauseVoice(paused) {
  if (paused) synth?.pause(); else synth?.resume();
}
