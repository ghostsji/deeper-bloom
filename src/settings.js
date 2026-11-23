import { VOICE_DEFAULTS, VOICE_PACKS } from './voice-settings.js';
import { ECHO_LINES } from './echo-lines.js';
import { setVolumes } from './audio.js';
import { configure, voiceList, preview, liveAvailable, systemAvailable, stop, systemVoices, onSystemVoicesChanged } from './voice.js';
import { ACTIONS, keyLabel, keyFor, bind, setBindings, suspendBindings } from './controls.js';

// Options, from the main menu or the pause menu, in four tabs: Sound, Echo's voice (the
// Black Relay voice studio's controls: neural voice, rate, pitch, FX rack), Controls (look
// and key bindings) and Display. Saved per player.
const KEY = 'deeperbloom-settings';
const SAMPLE = "This is how I'll sound down here. Take your time. The reef isn't going anywhere.";
const TABS = [['sound', 'Sound'], ['voice', "Echo's voice"], ['controls', 'Controls'], ['display', 'Display & help']];
const CONTROL_DEFAULTS = { lookSens: 1, invertY: false, bindings: {} };
// reduceFlashing: null follows the system's reduced-motion setting until you choose.
const HELP_DEFAULTS = { showTutorial: true, showTips: true, readableText: false, reduceFlashing: null };
export const systemCalm = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// Performance: how far the camera draws, how far out scenery (coral, rocks, polyps, fish) is
// kept in the scene, and how big the scenery chunks are.
export const PERF_DEFAULTS = { viewDist: 150, sceneryDist: 150, chunkSize: 120, showFps: false };
// Hover help for the settings that aren't self-explanatory.
const TIPS = {
  masterVol: 'Everything at once.', musicVol: 'The main menu theme and the reef pad.', sfxVol: 'Bubbles, creatures, the harpoon, the sea.', uiVol: 'Menu hover and click sounds.',
  rate: 'How fast Echo speaks. Slower is calmer.', pitch: 'Higher or lower than the voice normally speaks.', volume: "Echo's voice only.",
  gap: 'How long Echo waits between lines, so she never piles tips on you.',
  roomSize: 'How big the space her voice echoes in sounds.', wet: 'How much of the echo you hear.', damping: 'How quickly the echo softens.',
  dry: 'How much of her plain voice you hear.', cutoff: 'Lower sounds more muffled and underwater.',
  lookSens: "How far the view turns when you move the mouse. Doesn't change the turn keys.",
  viewDist: 'How far you can see underwater (three times this in the open air). Lower is faster; the fog closes in to match.',
  sceneryDist: 'How far out coral, rocks, polyps, jellies and fish are kept. Lower is faster; things fade in closer.',
  chunkSize: 'Scenery loads in square chunks this wide. Smaller chunks load tighter round you (less drawn); bigger ones swap less often.',
};
const DESKTOP = typeof window !== 'undefined' ? window.deeperBloom : null;

const pct = (v) => `${Math.round(v * 100)}%`;
const signed = (unit) => (v) => `${v > 0 ? '+' : ''}${v}${unit}`;
// [setting, label, min, max, step, format, group]
const SLIDERS = [
  ['masterVol', 'Master volume', 0, 1, 0.05, pct, 'sound'],
  ['musicVol', 'Music', 0, 1, 0.05, pct, 'sound'],
  ['sfxVol', 'Effects and ambience', 0, 1, 0.05, pct, 'sound'],
  ['uiVol', 'Menu sounds', 0, 1, 0.05, pct, 'sound'],
  ['rate', 'Speech rate', -50, 20, 1, signed('%'), 'neural'],
  ['pitch', 'Pitch', -20, 20, 1, signed(' Hz'), 'neural'],
  ['volume', 'Volume', 0, 1, 0.05, pct, 'speech'],
  ['gap', 'Pause between lines', 0.5, 4, 0.1, (v) => `${v.toFixed(1)} s`, 'speech'],
  ['roomSize', 'Room size', 0, 1, 0.01, (v) => v.toFixed(2), 'fx'],
  ['wet', 'Wet level / echo mix', 0, 1, 0.01, (v) => v.toFixed(2), 'fx'],
  ['damping', 'Damping', 0, 1, 0.01, (v) => v.toFixed(2), 'fx'],
  ['dry', 'Dry level', 0, 1, 0.01, (v) => v.toFixed(2), 'fx'],
  ['cutoff', 'Lowpass cutoff', 500, 10000, 100, (v) => `${v} Hz`, 'fx'],
  ['lookSens', 'Look sensitivity', 0.2, 3, 0.05, (v) => `${v.toFixed(2)}×`, 'controls'],
  ['viewDist', 'Render distance', 60, 250, 10, (v) => `${v} m`, 'perf'],
  ['sceneryDist', 'Scenery distance', 40, 300, 10, (v) => `${v} m`, 'perf'],
  ['chunkSize', 'Chunk size', 40, 240, 20, (v) => `${v} m`, 'perf'],
];
const SOUND_KEYS = ['masterVol', 'musicVol', 'sfxVol', 'uiVol', 'muted'];

// The game's volume groups (and mute) from the saved settings.
const applySound = (s) => setVolumes({ master: s.masterVol, music: s.musicVol, sfx: s.sfxVol, ui: s.uiVol, muted: s.muted });

// onControls({ lookSens, invertY, bindings }) is told whenever look or key settings change.
export function loadSettings(onControls = () => {}) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* defaults */ }
  const s = { ...VOICE_DEFAULTS, ...CONTROL_DEFAULTS, ...HELP_DEFAULTS, ...PERF_DEFAULTS, ...saved };
  if (s.source === 'live' && !liveAvailable()) s.source = 'bundled';
  configure(s);
  applySound(s);
  setBindings(s.bindings);
  onControls(s);
  return s;
}

export const THEMES = [['', 'Echo cyan (default)'], ['amber', 'Salvage amber'], ['white', 'Clean white'], ['bloom', 'Deep Bloom pink'], ['green', 'Old sonar green']];
export function createSettings(el, { onBack, onControls = () => {}, sound = () => {}, themesUnlocked = () => false }) {
  let s = loadSettings(onControls);
  let voices = null, tab = 'sound', waiting = null, startFs = null;
  const save = () => {
    configure(s);
    applySound(s);
    setBindings(s.bindings);
    onControls(s);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not remembered */ }
  };
  const fmtOf = (k) => SLIDERS.find(([key]) => key === k)[5];
  const row = ([k, label, min, max, step, fmt]) => `
    <label class="srow"${TIPS[k] ? ` data-tip="${TIPS[k]}"` : ''}><span>${label}<b data-val="${k}">${fmt(s[k])}</b></span>
      <input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}"></label>`;
  const rows = (...groups) => SLIDERS.filter((r) => groups.includes(r[6])).map(row).join('');

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
  onSystemVoicesChanged(() => { if (!el.hidden && tab === 'voice') render(); });

  const panes = {
    sound: () => `${rows('sound')}
      <label class="scheck"><input type="checkbox" data-mute ${s.muted ? 'checked' : ''}> Mute all sound</label>
      <div class="sbtns"><button type="button" class="secondary" data-reset="sound">Reset sound</button></div>`,
    voice: () => {
      const neural = s.source === 'live', fxOn = s.source === 'bundled' || neural;
      const voiceSel = neural ? `<label class="srow"><span>Neural voice</span>
        <select data-voice>${voices ? voices.map((v) => `<option value="${v.name}"${v.name === s.voice ? ' selected' : ''}>${v.name} (${v.gender})</option>`).join('') : `<option>${s.voice} (loading list…)</option>`}</select></label>` : '';
      return `<label class="srow"><span>Voice</span><select data-source>${voiceOptions()}</select></label>
        ${voiceSel}
        ${s.source === 'off' ? '' : rows(...(neural ? ['neural', 'speech'] : ['speech']))}
        ${fxOn ? `<p class="sgroup">FX rack</p>${rows('fx')}` : ''}
        <div class="sbtns">
          <button type="button" class="primary small" data-preview>▶ Preview</button>
          <button type="button" class="secondary" data-reset="voice">Reset voice</button>
        </div>`;
    },
    controls: () => `${rows('controls')}
      <label class="scheck" data-tip="Moving the mouse up looks down, like a flight stick."><input type="checkbox" data-invert ${s.invertY ? 'checked' : ''}> Invert mouse Y</label>
      <p class="sgroup">Keys <small>click one, then press the new key (Esc cancels)</small></p>
      <div class="keys">${ACTIONS.map((a) => `<div class="keyrow"><span>${a.label}</span>
        <button type="button" data-tip="Click, then press the new key. If another action has it, they swap." class="keybtn${waiting === a.id ? ' waiting' : ''}${s.bindings[a.id] ? ' changed' : ''}" data-bind="${a.id}">${waiting === a.id ? 'Press a key…' : keyLabel(keyFor(s.bindings, a))}</button></div>`).join('')}</div>
      <div class="sbtns"><button type="button" class="secondary" data-reset="controls">Reset controls</button></div>`,
    display: () => `<label class="scheck"><input type="checkbox" data-fs ${document.fullscreenElement || winFs ? 'checked' : ''}> Fullscreen <small>(F11)</small></label>
      ${DESKTOP ? `<label class="scheck"><input type="checkbox" data-startfs ${startFs !== false ? 'checked' : ''}> Start the game in fullscreen</label>` : ''}
      <p class="sgroup">Visor theme</p>
      ${themesUnlocked() ? `<label class="srow"><span>HUD colours</span><select data-theme>${THEMES.map(([id, name]) => `<option value="${id}"${(s.theme || '') === id ? ' selected' : ''}>${name}</option>`).join('')}</select></label>`
        : '<p class="sub" data-tip="Restore all eight visor systems (SYS 100%).">Locked: restore every visor system to unlock new HUD colours.</p>'}
      <p class="sgroup">Help</p>
      <label class="scheck" data-tip="The task card in the top right, one step at a time. The phone's Guide tab has the full list."><input type="checkbox" data-help="showTutorial" ${s.showTutorial ? 'checked' : ''}> Show the tutorial</label>
      <label class="scheck" data-tip="Like this one."><input type="checkbox" data-help="showTips" ${s.showTips ? 'checked' : ''}> Show tooltips when hovering</label>
      <p class="sgroup">Accessibility</p>
      <label class="scheck" data-tip="Echo's lines and the visor readouts are never scrambled. Cracks, static and hum stay."><input type="checkbox" data-help="readableText" ${s.readableText ? 'checked' : ''}> Readable text</label>
      <label class="scheck" data-tip="Lightning, shocks, reboots and glitches fade softly instead of flashing, and the screen doesn't shake. Follows your system's reduced-motion setting until you change it."><input type="checkbox" data-help="reduceFlashing" ${(s.reduceFlashing ?? systemCalm()) ? 'checked' : ''}> Reduce flashing and shaking</label>
      <p class="sgroup">Performance</p>
      ${rows('perf')}
      <label class="scheck" data-tip="A small counter in the corner, to see what the settings above do."><input type="checkbox" data-help="showFps" ${s.showFps ? 'checked' : ''}> Show frame rate</label>
      <div class="sbtns"><button type="button" class="secondary" data-reset="perf">Reset performance</button></div>`,
  };
  let winFs = false;

  function render() {
    const body = el.querySelector('[data-body]');
    const keep = body ? body.scrollTop : 0;
    el.innerHTML = `<div class="card settings">
      <p class="eyebrow">Options</p>
      <div class="stabs" role="tablist">${TABS.map(([id, name]) => `<button type="button" role="tab" data-tab="${id}" class="${tab === id ? 'on' : ''}" aria-selected="${tab === id}">${name}</button>`).join('')}</div>
      <div class="sbody" data-body>${panes[tab]()}</div>
      <button type="button" class="secondary" data-back>Back</button>
    </div>`;
    el.querySelector('[data-body]').scrollTop = keep;
  }

  async function loadVoices() {
    if (voices || !liveAvailable()) return;
    try {
      // English voices first, then the rest, like the studio's list.
      const all = await voiceList();
      voices = [...all.filter((v) => v.locale.startsWith('en')), ...all.filter((v) => !v.locale.startsWith('en'))];
    } catch { voices = [{ name: s.voice, gender: 'offline' }]; }
    if (tab === 'voice') render();
  }
  async function refreshDisplay() {
    if (DESKTOP) {
      winFs = await DESKTOP.fullscreen();
      startFs = (await DESKTOP.prefs.get()).startFullscreen;
    }
    if (tab === 'display' && !el.hidden) render();
  }

  function cancelWait() {
    waiting = null;
    suspendBindings(false);
  }
  // While waiting for a key, catch it before the game does.
  addEventListener('keydown', (e) => {
    if (!waiting || el.hidden) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code !== 'Escape') s.bindings = bind(s.bindings, ACTIONS.find((a) => a.id === waiting), e.code);
    cancelWait();
    save();
    sound('click');
    render();
  }, true);

  el.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    s[k] = Number(e.target.value);
    el.querySelector(`[data-val="${k}"]`).textContent = fmtOf(k)(s[k]);
    save();
  });
  el.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches('[data-mute]')) { s.muted = t.checked; save(); }
    if (t.matches('[data-invert]')) { s.invertY = t.checked; save(); }
    if (t.matches('[data-help]')) { s[t.dataset.help] = t.checked; save(); }
    if (t.matches('[data-theme]')) { s.theme = t.value; save(); }
    if (t.matches('[data-source]')) {
      const [kind, ...rest] = t.value.split(':'), arg = rest.join(':');
      if (kind === 'pack') { s.source = 'bundled'; s.pack = arg; }
      else if (kind === 'system') { s.source = 'system'; s.systemVoice = arg; }
      else s.source = kind;
      save(); render();
      if (s.source === 'live') loadVoices();
    }
    if (t.matches('[data-voice]')) { s.voice = t.value; save(); }
    if (t.matches('[data-fs]')) {
      if (DESKTOP) await DESKTOP.fullscreen(t.checked);
      else if (t.checked) await document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setTimeout(refreshDisplay, 300);
    }
    if (t.matches('[data-startfs]') && DESKTOP) { startFs = t.checked; DESKTOP.prefs.set({ startFullscreen: t.checked }); }
  });
  el.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-tab]');
    if (tb) {
      sound('click');
      cancelWait(); stop();
      tab = tb.dataset.tab;
      render();
      if (tab === 'voice' && s.source === 'live') loadVoices();
      if (tab === 'display') refreshDisplay();
      return;
    }
    const kb = e.target.closest('[data-bind]');
    if (kb) {
      sound('click');
      waiting = waiting === kb.dataset.bind ? null : kb.dataset.bind;
      suspendBindings(!!waiting);
      render();
      return;
    }
    if (e.target.closest('[data-preview]')) previewNow();
    const reset = e.target.closest('[data-reset]')?.dataset.reset;
    if (reset) {
      sound('click');
      if (reset === 'sound') for (const k of SOUND_KEYS) s[k] = VOICE_DEFAULTS[k];
      if (reset === 'voice') s = { ...VOICE_DEFAULTS, ...Object.fromEntries(SOUND_KEYS.map((k) => [k, s[k]])), lookSens: s.lookSens, invertY: s.invertY, bindings: s.bindings, ...Object.fromEntries(Object.keys({ ...HELP_DEFAULTS, ...PERF_DEFAULTS }).map((k) => [k, s[k]])) };
      if (reset === 'controls') Object.assign(s, CONTROL_DEFAULTS, { bindings: {} });
      if (reset === 'perf') Object.assign(s, PERF_DEFAULTS);
      save(); render();
    }
    if (e.target.closest('[data-back]')) { sound('back'); cancelWait(); stop(); onBack(); }
  });
  el.addEventListener('pointerover', (e) => {
    const b = e.target.closest('button');
    if (b && !b.contains(e.relatedTarget)) sound('hover');
  });

  const previewNow = () => preview(SAMPLE, { key: 'meet', i: 1, text: ECHO_LINES.meet[1] });
  return {
    get gap() { return s.gap; },
    show() {
      render();
      el.hidden = false;
      if (tab === 'voice' && s.source === 'live') loadVoices();
      if (tab === 'display') refreshDisplay();
    },
    hide() { if (el.hidden) return; cancelWait(); stop(); el.hidden = true; },
    get open() { return !el.hidden; },
  };
}
