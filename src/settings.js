import { VOICE_DEFAULTS, VOICE_PACKS } from './voice-settings.js';
import { ECHO_LINES } from './echo-lines.js';
import { setVolumes } from './audio.js';
import { configure, voiceList, preview, liveAvailable, systemAvailable, stop, systemVoices, onSystemVoicesChanged } from './voice.js';

// Settings screen (from the pause menu). Echo's voice gets the Black Relay voice studio's
// controls: neural voice, rate, pitch, and the FX rack. Saved per player.
const KEY = 'deeperbloom-settings';
const SAMPLE = "This is how I'll sound down here. Take your time. The reef isn't going anywhere.";

const pct = (v) => `${Math.round(v * 100)}%`;
const SLIDERS = [
  ['masterVol', 'Master volume', 0, 1, 0.05, pct, 'sound'],
  ['musicVol', 'Music', 0, 1, 0.05, pct, 'sound'],
  ['sfxVol', 'Effects and ambience', 0, 1, 0.05, pct, 'sound'],
  ['uiVol', 'Menu sounds', 0, 1, 0.05, pct, 'sound'],
  // [setting, label, min, max, step, format]
  ['rate', 'Speech rate', -50, 20, 1, (v) => `${v > 0 ? '+' : ''}${v}%`, 'neural'],
  ['pitch', 'Pitch', -20, 20, 1, (v) => `${v > 0 ? '+' : ''}${v} Hz`, 'neural'],
  ['volume', 'Volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`],
  ['gap', 'Pause between lines', 0.5, 4, 0.1, (v) => `${v.toFixed(1)} s`],
  ['roomSize', 'Room size', 0, 1, 0.01, (v) => v.toFixed(2), 'fx'],
  ['wet', 'Wet level / echo mix', 0, 1, 0.01, (v) => v.toFixed(2), 'fx'],
  ['damping', 'Damping', 0, 1, 0.01, (v) => v.toFixed(2), 'fx'],
  ['dry', 'Dry level', 0, 1, 0.01, (v) => v.toFixed(2), 'fx'],
  ['cutoff', 'Lowpass cutoff', 500, 10000, 100, (v) => `${v} Hz`, 'fx'],
];

// The game's volume groups (and mute) from the saved settings.
const applySound = (s) => setVolumes({ master: s.masterVol, music: s.musicVol, sfx: s.sfxVol, ui: s.uiVol, muted: s.muted });

export function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* defaults */ }
  const s = { ...VOICE_DEFAULTS, ...saved };
  if (s.source === 'live' && !liveAvailable()) s.source = 'bundled';
  configure(s);
  applySound(s);
  return s;
}

export function createSettings(el, { onBack }) {
  let s = loadSettings();
  let voices = null;
  const save = () => {
    configure(s);
    applySound(s);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not remembered */ }
  };

  // One list for every voice: built-in packs, the live studio, each system voice, or off.
  const current = () => (s.source === 'bundled' ? `pack:${s.pack}` : s.source === 'system' ? `system:${s.systemVoice}` : s.source);
  const opt = (value, label, ok = true) => `<option value="${value}"${current() === value ? ' selected' : ''}${ok ? '' : ' disabled'}>${label}</option>`;
  function voiceOptions() {
    const sys = systemVoices();
    return `<optgroup label="Built-in Echo voices (work offline)">${VOICE_PACKS.map((p) => opt(`pack:${p.id}`, p.name)).join('')}</optgroup>
      <optgroup label="Voice studio">${opt('live', liveAvailable() ? 'Any neural voice (needs internet once per line)' : 'Any neural voice (desktop app only)', liveAvailable())}</optgroup>
      <optgroup label="System voices">${opt('system:', 'System default (soft female)', systemAvailable())}${sys.map((v) => opt(`system:${v.name}`, v.name.replace(/^Microsoft /, '').replace(/ - English/, ''))).join('')}</optgroup>
      <optgroup label="None">${opt('off', 'Off (subtitles only)')}</optgroup>`;
  }
  onSystemVoicesChanged(() => { if (!el.hidden) render(); });

  function render() {
    const neural = s.source === 'live';
    const fxOn = s.source === 'bundled' || s.source === 'live';
    const row = ([k, label, min, max, step, fmt]) => `
      <label class="srow"><span>${label}<b data-val="${k}">${fmt(s[k])}</b></span>
        <input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}"></label>`;
    const sound = SLIDERS.filter(([, , , , , , g]) => g === 'sound').map(row).join('');
    const speech = SLIDERS.filter(([, , , , , , g]) => g !== 'fx' && g !== 'sound' && (g !== 'neural' || neural)).map(row).join('');
    const fxRows = fxOn ? SLIDERS.filter(([, , , , , , g]) => g === 'fx').map(row).join('') : '';
    const voiceSel = neural ? `<label class="srow"><span>Neural voice</span>
      <select data-voice>${voices ? voices.map((v) => `<option value="${v.name}"${v.name === s.voice ? ' selected' : ''}>${v.name} (${v.gender})</option>`).join('') : `<option>${s.voice} (loading list…)</option>`}</select></label>` : '';
    el.innerHTML = `<div class="card settings">
      <p class="eyebrow">Settings</p>
      <h2>Sound</h2>
      ${sound}
      <label class="scheck"><input type="checkbox" data-mute ${s.muted ? 'checked' : ''}> Mute all sound</label>
      <p class="sgroup">Echo's voice</p>
      <label class="srow"><span>Voice</span><select data-source>${voiceOptions()}</select></label>
      ${voiceSel}
      ${s.source === 'off' ? '' : speech}
      ${fxOn ? `<p class="sgroup">FX rack</p>${fxRows}` : ''}
      <div class="sbtns">
        <button type="button" class="primary small" data-preview>▶ Preview</button>
        <button type="button" class="secondary" data-reset>Reset to defaults</button>
      </div>
      <button type="button" class="secondary" data-back>Back</button>
    </div>`;
  }

  async function loadVoices() {
    if (voices || !liveAvailable()) return;
    try {
      // English voices first, then the rest, like the studio's list.
      const all = await voiceList();
      voices = [...all.filter((v) => v.locale.startsWith('en')), ...all.filter((v) => !v.locale.startsWith('en'))];
    } catch { voices = [{ name: s.voice, gender: 'offline' }]; }
    render();
  }

  el.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    s[k] = Number(e.target.value);
    const fmt = SLIDERS.find(([key]) => key === k)[5];
    el.querySelector(`[data-val="${k}"]`).textContent = fmt(s[k]);
    save();
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-mute]')) { s.muted = e.target.checked; save(); }
    if (e.target.matches('[data-source]')) {
      const [kind, ...rest] = e.target.value.split(':'), arg = rest.join(':');
      if (kind === 'pack') { s.source = 'bundled'; s.pack = arg; }
      else if (kind === 'system') { s.source = 'system'; s.systemVoice = arg; }
      else s.source = kind;
      save(); render();
      if (s.source === 'live') loadVoices();
    }
    if (e.target.matches('[data-voice]')) { s.voice = e.target.value; save(); }
  });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-preview]')) previewNow();
    if (e.target.closest('[data-reset]')) { s = { ...VOICE_DEFAULTS }; save(); render(); }
    if (e.target.closest('[data-back]')) { stop(); onBack(); }
  });

  const previewNow = () => preview(SAMPLE, { key: 'meet', i: 1, text: ECHO_LINES.meet[1] });
  return {
    get gap() { return s.gap; },
    // For the Flutter shell's own Settings screen.
    state: () => ({ ...s }),
    apply(patch) { s = { ...s, ...patch }; save(); if (!el.hidden) render(); },
    preview: previewNow,
    stopPreview: () => stop(),
    show() {
      render();
      el.hidden = false;
      if (s.source === 'live') loadVoices();
    },
    hide() { el.hidden = true; },
  };
}
