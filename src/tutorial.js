// The tutorial: one task at a time in the corner of the screen, each with how to do it.
// A step is done when its check passes, so anything you've already done (in this game or
// an older save) is skipped. Steps read lifetime stats from progress.js, plus "notes" the
// game makes for things progress doesn't count (looking around, opening the phone...).
//
// how(k) gets k(actionId) -> the key that action is on now, so rebinding keeps it right.

const kbd = (s) => `<kbd>${s}</kbd>`;

export const STEPS = [
  { id: 'look', title: 'Look around', note: 'look',
    how: (k) => `Move the mouse to look. ${kbd(k('turnLeft'))} and ${kbd(k('turnRight'))} turn too.` },
  { id: 'swim', title: 'Swim', stat: 'meters', need: 15,
    how: (k) => `${kbd(k('forward'))}${kbd(k('left'))}${kbd(k('back'))}${kbd(k('right'))} swim where you look. ${kbd(k('rise'))} rises, ${kbd(k('sink'))} sinks, ${kbd(k('dash'))} dashes.` },
  { id: 'gather', title: 'Gather Lumen', stat: 'polyps', need: 3,
    how: () => 'Swim through the glowing polyps on the reef. Lumen is what you build with.' },
  { id: 'phone', title: 'Open your phone', note: 'phone',
    how: (k) => `Press ${kbd(k('phone'))}. The game pauses while it's out; ${kbd(k('phone'))} again puts it away.` },
  { id: 'scan', title: 'Scan with the Echo Lens', stat: 'scans', need: 1,
    how: () => `Hold ${kbd('Right mouse')} to raise the lens, then hold ${kbd('Left mouse')} on a creature or coral until the ring fills. Scans earn Data.` },
  { id: 'surface', title: 'Reach the surface', note: 'surface',
    how: (k) => `Hold ${kbd(k('rise'))} until your head breaks the water. Your breath refills up there.` },
  { id: 'raft', title: 'Build a raft', stat: 'builds', need: 1,
    how: (k) => `At the surface: ${kbd(k('phone'))} → Build → Raft. Aim at the water and ${kbd('Left-click')} to place it (${kbd('Right-click')} takes it back).` },
  { id: 'climb', title: 'Climb aboard', note: 'deck',
    how: () => 'Swim into your raft to haul yourself up onto it.' },
  { id: 'forage', title: 'Find food', stats: ['fish', 'kelp'], need: 1,
    how: () => `Underwater, ${kbd('Left-click')} a silverfin in front of you (glide in slowly or it bolts), or the kelp you're aiming at.` },
  { id: 'eat', title: 'Eat something', stat: 'meals', need: 1,
    how: (k) => `Press ${kbd(k('eat'))}, or tap Eat on the phone's Status tab. Being fed is what lets your health heal.` },
  { id: 'station', title: 'Build a research station', note: 'station',
    how: (k) => `${kbd(k('phone'))} → Build → Research station, then place it on your raft.` },
  { id: 'research', title: 'Research something', note: 'research',
    how: (k) => `Stand next to the station and press ${kbd(k('use'))}, or use the phone's Research tab. It spends Data from your scans.` },
  { id: 'harpoon', title: 'Try the harpoon', note: 'fire',
    how: (k) => `Press ${kbd(k('harpoon'))} to raise it and ${kbd('Left-click')} to fire. Shots wear it down; repair it at a workbench.` },
  { id: 'skill', title: 'Learn a skill', stat: 'skills', need: 1,
    how: (k) => `Goals pay Bloom points (not Lumen). Spend them on the phone's Skills tab (${kbd(k('phone'))} → Skills).` },
];

const STAT_IDS = [...new Set(STEPS.flatMap((s) => s.stats || (s.stat ? [s.stat] : [])))];

// How far a step has got: { have, need }. stat(id) here is counted from the (re)start.
function count(step, stat, notes) {
  const need = step.need ?? 1;
  const have = step.note ? (notes.has(step.note) ? 1 : 0)
    : step.stats ? step.stats.reduce((sum, s) => sum + stat(s), 0) : stat(step.stat);
  return { have: Math.min(have, need), need };
}

// lifetime(id) -> lifetime stat value (progress.stat). Restarting counts from then on.
export function createTutorial(lifetime) {
  let notes = new Set(), skipped = false, base = {};
  const stat = (id) => lifetime(id) - (base[id] || 0);
  const done = (step) => { const c = count(step, stat, notes); return c.have >= c.need; };
  return {
    note(id) { notes.add(id); },
    get skipped() { return skipped; },
    skip() { skipped = true; },
    restart() { skipped = false; notes = new Set(); base = Object.fromEntries(STAT_IDS.map((id) => [id, lifetime(id)])); },
    done,
    /** The step to show now, or null when finished or skipped. */
    current() { return skipped ? null : STEPS.find((s) => !done(s)) ?? null; },
    progress(step) { return count(step, stat, notes); },
    get finished() { return STEPS.every(done); },
    serialize: () => ({ notes: [...notes], skipped, base }),
    load(s) { notes = new Set(s?.notes || []); skipped = !!s?.skipped; base = s?.base || {}; },
  };
}
