// Your dive visor came through the flood damaged. Reaching a system's milestone gets you the
// part to fix it ("ready"); you then rewire it yourself on the visor panel (V) to bring it
// back online, where it stays. Damaged systems glitch, scramble or stay dark (see
// hud-fx.js); the phone's Status tab lists them with how to fix each one.
//
// check(c) reads c: { stat(id) lifetime stats (progress.js), codex(id) scans of a species,
// stations() research stations built, researched() research projects done }.
export const SYSTEMS = [
  { id: 'vitals', name: 'Vital signs', how: 'Eat something', fault: 'Health, breath and food bars flicker',
    need: 1, have: (c) => c.stat('meals') },
  { id: 'comms', name: 'Echo link', how: 'Scan Echo with the Echo Lens', fault: "Echo's subtitles break up",
    need: 1, have: (c) => c.codex('echo') },
  { id: 'ledger', name: 'Lumen & Data readout', how: 'Gather 15 polyps', fault: 'The counters glitch',
    need: 15, have: (c) => c.stat('polyps') },
  { id: 'depth', name: 'Depth gauge', how: 'Swim 150 m', fault: 'Depth readings jump about',
    need: 150, have: (c) => c.stat('meters') },
  { id: 'lens', name: 'Scanner overlay', how: 'Scan 5 things', fault: 'Scan readouts break up',
    need: 5, have: (c) => c.stat('scans') },
  { id: 'nav', name: 'Navigation', how: 'Build a research station', fault: 'No compass',
    need: 1, have: (c) => c.stations() },
  { id: 'sensor', name: 'Threat sensor', how: 'Cure a blighted eel', fault: 'Eels don\'t show on the compass',
    need: 1, have: (c) => c.stat('eels') },
  { id: 'visor', name: 'Visor seal', how: 'Finish 2 research projects', fault: 'Cracked glass',
    need: 2, have: (c) => c.researched() },
];

export function createSystems(ctx) {
  let restored = new Set(), ready = new Set();
  return {
    /** Marks systems whose milestone is met as ready to rewire. Returns the ones that just became ready. */
    update() {
      const now = SYSTEMS.filter((s) => !restored.has(s.id) && !ready.has(s.id) && s.have(ctx) >= s.need);
      for (const s of now) ready.add(s.id);
      return now;
    },
    /** Rewired: a ready system comes back online. Returns it (or null if it wasn't ready). */
    install(id) {
      if (!ready.has(id)) return null;
      ready.delete(id);
      restored.add(id);
      return SYSTEMS.find((s) => s.id === id);
    },
    online: (id) => restored.has(id),
    isReady: (id) => ready.has(id),
    /** Systems with their part in hand, waiting to be rewired. */
    get ready() { return SYSTEMS.filter((s) => ready.has(s.id)); },
    /** 0 (everything damaged) to 1 (fully restored). */
    get integrity() { return restored.size / SYSTEMS.length; },
    progress: (s) => ({ have: Math.min(Math.floor(s.have(ctx)), s.need), need: s.need }),
    serialize: () => ({ restored: [...restored], ready: [...ready] }),
    // Older saves stored just the restored list.
    load(d) {
      const ok = (id) => SYSTEMS.some((s) => s.id === id);
      const r = Array.isArray(d) ? d : d?.restored || [];
      restored = new Set(r.filter(ok));
      ready = new Set((Array.isArray(d) ? [] : d?.ready || []).filter((id) => ok(id) && !restored.has(id)));
    },
  };
}
