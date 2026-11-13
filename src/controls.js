// Rebindable controls. The game listens for each action's default key (its `code`); a
// binding maps whatever key the player chose onto that default. Edited in Settings →
// Controls and saved with the other settings.
export const ACTIONS = [
  { id: 'forward', label: 'Swim forward', code: 'KeyW' }, { id: 'back', label: 'Swim back', code: 'KeyS' },
  { id: 'left', label: 'Strafe left', code: 'KeyA' }, { id: 'right', label: 'Strafe right', code: 'KeyD' },
  { id: 'rise', label: 'Rise / jump', code: 'Space' }, { id: 'sink', label: 'Sink', code: 'ControlLeft' },
  { id: 'turnLeft', label: 'Turn left', code: 'KeyQ' }, { id: 'turnRight', label: 'Turn right', code: 'KeyE' },
  { id: 'dash', label: 'Dash', code: 'ShiftLeft' }, { id: 'harpoon', label: 'Raise harpoon', code: 'Digit1' },
  { id: 'phone', label: 'Phone', code: 'Tab' }, { id: 'codex', label: 'Codex', code: 'KeyJ' },
  { id: 'use', label: 'Use', code: 'KeyF' }, { id: 'eat', label: 'Eat', code: 'KeyR' },
  { id: 'stopBuilding', label: 'Stop building', code: 'KeyX' }, { id: 'pause', label: 'Pause', code: 'KeyP' },
  { id: 'purge', label: 'Purge visor fog (hold)', code: 'KeyG' }, { id: 'equalise', label: 'Equalise ears', code: 'KeyH' }, { id: 'rewire', label: 'Rewire visor', code: 'KeyV' },
];

/** A readable name for a key code: "W", "Space", "Left Ctrl", "Arrow Up". */
export function keyLabel(code) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names = {
    ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift',
    AltLeft: 'Left Alt', AltRight: 'Right Alt', ArrowUp: 'Arrow Up', ArrowDown: 'Arrow Down', ArrowLeft: 'Arrow Left',
    ArrowRight: 'Arrow Right', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`',
    Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Minus: '-', Equal: '=',
  };
  return names[code] ?? code;
}

/** The key an action is on: the player's binding, or its default. */
export const keyFor = (bindings, action) => bindings?.[action.id] || action.code;

/** Binds an action to a key; an action already on that key swaps onto the old one. */
export function bind(bindings, action, code) {
  const next = { ...bindings };
  const old = keyFor(next, action);
  for (const other of ACTIONS) if (other.id !== action.id && keyFor(next, other) === code) next[other.id] = old;
  next[action.id] = code;
  for (const a of ACTIONS) if (next[a.id] === a.code) delete next[a.id];
  return next;
}

let fromKey = null; // pressed key code -> the default code it stands for (null: no remapping)
let unbound = new Set(); // default keys whose action moved elsewhere (so they do nothing now)
let suspended = false; // while Settings waits for a new key, keys pass through untouched

let active = {}; // the bindings in use now

/** The readable key an action is on right now ("W", "Tab"), for hints and the tutorial. */
export const keyName = (id) => keyLabel(keyFor(active, ACTIONS.find((a) => a.id === id)));

// bindings: { actionId: code } for the actions the player changed.
export function setBindings(bindings) {
  active = { ...bindings };
  fromKey = new Map();
  unbound = new Set();
  for (const a of ACTIONS) {
    const key = keyFor(bindings, a);
    fromKey.set(key, a.code);
    if (key !== a.code) unbound.add(a.code);
  }
  for (const k of fromKey.keys()) unbound.delete(k);
}
export function suspendBindings(on) { suspended = on; }

// Remaps key events in the capture phase, before any game listener sees them.
const REMAPPED = Symbol('remapped');
if (typeof window !== 'undefined') {
  for (const type of ['keydown', 'keyup']) {
    addEventListener(type, (e) => {
      if (!fromKey || suspended || e[REMAPPED]) return;
      const to = fromKey.get(e.code);
      if (to === e.code) return;
      if (!to && !unbound.has(e.code)) return; // not a game key: leave it alone
      e.stopImmediatePropagation();
      e.preventDefault();
      if (!to) return;
      const ev = new KeyboardEvent(type, { code: to, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey });
      ev[REMAPPED] = true;
      dispatchEvent(ev);
    }, true);
  }
}
