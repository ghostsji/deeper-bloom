// Rebindable controls. The game listens for each action's default key (its `code`); a
// binding maps whatever key the player chose onto that default. Used by the Flutter shell,
// whose Settings screen edits the bindings (its own copy of this list is in
// deeper_bloom_shell/lib/controls.dart).
export const ACTIONS = [
  { id: 'forward', code: 'KeyW' }, { id: 'back', code: 'KeyS' },
  { id: 'left', code: 'KeyA' }, { id: 'right', code: 'KeyD' },
  { id: 'rise', code: 'Space' }, { id: 'sink', code: 'ControlLeft' },
  { id: 'turnLeft', code: 'KeyQ' }, { id: 'turnRight', code: 'KeyE' },
  { id: 'dash', code: 'ShiftLeft' }, { id: 'harpoon', code: 'Digit1' },
  { id: 'phone', code: 'Tab' }, { id: 'build', code: 'KeyB' }, { id: 'codex', code: 'KeyJ' },
  { id: 'use', code: 'KeyF' }, { id: 'eat', code: 'KeyR' }, { id: 'stopBuilding', code: 'KeyX' },
  { id: 'pause', code: 'KeyP' },
];

let fromKey = null; // pressed key code -> the default code it stands for (null: no remapping)
let unbound = new Set(); // default keys whose action moved elsewhere (so they do nothing now)

// bindings: { actionId: code } for the actions the player changed.
export function setBindings(bindings) {
  fromKey = new Map();
  unbound = new Set();
  for (const a of ACTIONS) {
    const key = bindings?.[a.id] || a.code;
    fromKey.set(key, a.code);
    if (key !== a.code) unbound.add(a.code);
  }
  for (const k of fromKey.keys()) unbound.delete(k);
}

// Remaps key events in the capture phase, before any game listener sees them.
const REMAPPED = Symbol('remapped');
for (const type of ['keydown', 'keyup']) {
  addEventListener(type, (e) => {
    if (!fromKey || e[REMAPPED]) return;
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
