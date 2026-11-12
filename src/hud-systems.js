// Your dive visor came through the flood damaged. Each HUD system comes back online when you
// reach a milestone, and stays restored. Damaged systems glitch, scramble or stay dark (see
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
  let restored = new Set();
  return {
    /** Restores anything whose milestone is met. Returns the systems restored just now. */
    update() {
      const now = SYSTEMS.filter((s) => !restored.has(s.id) && s.have(ctx) >= s.need);
      for (const s of now) restored.add(s.id);
      return now;
    },
    online: (id) => restored.has(id),
    /** 0 (everything damaged) to 1 (fully restored). */
    get integrity() { return restored.size / SYSTEMS.length; },
    progress: (s) => ({ have: Math.min(Math.floor(s.have(ctx)), s.need), need: s.need }),
    serialize: () => [...restored],
    load(list) { restored = new Set((list || []).filter((id) => SYSTEMS.some((s) => s.id === id))); },
  };
}
