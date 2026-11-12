import * as THREE from 'three';
import { perk, track } from './progress.js';

// ---- Research: tune here ------------------------------------------------------
const LENS = { range: 12, scanSecs: 1.6 };
const TUNED_LENS = { range: 22, scanSecs: 1 };
const DATA_PER_SCAN = 2;
const DATA_PER_ENTRY = 5; // bonus for completing a codex entry

// Codex entries. need: distinct individuals to scan before the entry is complete.
export const SPECIES = [
  { id: 'polyp', name: 'Glow polyp', need: 3,
    text: 'A soft stalk with a bulb of stored light. Polyps drink the faint glow of everything around them and give it back as Lumen. They regrow if left alone.' },
  { id: 'lanternfish', name: 'Lantern fish', need: 1,
    text: 'They swim as one, so the lens reads the whole school at once. Each fish carries a gold lure that brightens when the school turns together.' },
  { id: 'jelly', name: 'Drift jelly', need: 3,
    text: 'Mostly water and patience. A drift jelly\'s pulse quickens near living coral, and the coral grows faster for it.' },
  { id: 'kelp', name: 'Tall kelp', need: 3,
    text: 'Grows in patches from a single root mat. The fibre is tough enough to weave, if you strip it while it\'s still green.' },
  { id: 'branch', name: 'Branch coral', need: 4,
    text: 'Every tip is a colony of thousands. The colour depends on what the colony ate: cyan, pink, gold, sometimes a rare violet.' },
  { id: 'brain', name: 'Brain coral', need: 2,
    text: 'Slow, heavy and very old. Brain coral anchors a reef. Where it grows, other coral settles.' },
  { id: 'silverfin', name: 'Silverfin', need: 2,
    text: 'Small, quick and good to eat. A silverfin stays near the patch of reef it was born on and bolts from anything that rushes it. Glide in slowly.' },
  { id: 'eel', name: 'Blighted eel', need: 1,
    text: 'A kelp eel with ember-bright sores along its back. The blight is fire that got into the water. It makes them hunt anything that moves, even things too big to eat. Stay on your raft, or bring a harpoon.' },
  { id: 'echo', name: 'Echo', need: 1,
    text: 'The oldest pearl in the reef. It remembers the fire, and the tide running backwards. It doesn\'t like being scanned, but it lets you.' },
];
const speciesById = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

// The research tree. needs: codex entries that must be complete first.
export const RESEARCH = [
  { id: 'lens', name: 'Tuned lens', cost: 10, needs: ['polyp', 'jelly'], desc: 'Scan from twice as far, and faster.' },
  { id: 'buoy', name: 'Glow buoy', cost: 8, needs: ['polyp'], desc: 'Build piece: a floating light that marks a spot on open water.' },
  { id: 'jellylamp', name: 'Jelly lamp', cost: 12, needs: ['jelly'], desc: 'Build piece: a pulsing pink lamp for your rafts.' },
  { id: 'weave', name: 'Woven kelp decks', cost: 10, needs: ['kelp'], desc: 'Rafts cost 1 Lumen instead of 3.' },
  { id: 'garden', name: 'Coral garden', cost: 20, needs: ['branch', 'brain'], desc: 'Build piece: grows coral on your raft and makes 1 Lumen every 10 seconds.' },
];
const researchById = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));

export function createResearch({ onChange, onEntry }) {
  let data = 0;
  const counts = {};            // species -> distinct scans
  const scanned = new Set();    // ids already scanned
  const unlocked = new Set();   // research ids
  const ray = new THREE.Raycaster();
  const centre = new THREE.Vector2(0, 0);
  let progress = 0, targetId = null;

  const complete = (sp) => (counts[sp] || 0) >= speciesById[sp].need;
  const lens = () => (unlocked.has('lens') ? TUNED_LENS : LENS);

  // Finds the scannable under the crosshair: { species, id } or null.
  function aim(camera, roots) {
    ray.far = lens().range;
    ray.setFromCamera(centre, camera);
    for (const hit of ray.intersectObjects(roots, true)) {
      let scan = null, shown = true;
      for (let o = hit.object; o; o = o.parent) {
        if (!o.visible) shown = false;
        scan ??= o.userData.scan;
      }
      // Gathered polyps are hidden but still in the scene; look past them.
      if (scan && shown) return { species: scan.species, id: scan.instanced ? `${scan.species}:${hit.instanceId}` : scan.id };
    }
    return null;
  }

  return {
    get data() { return data; },
    counts,
    complete,
    isUnlocked: (id) => unlocked.has(id),
    // Call each frame while the lens is up. Returns what the HUD should show.
    update(dt, camera, roots, holding) {
      const t = aim(camera, roots);
      if (!t) { progress = 0; targetId = null; return null; }
      const sp = speciesById[t.species];
      const known = scanned.has(t.id), full = complete(t.species);
      if (t.id !== targetId) { progress = 0; targetId = t.id; }
      if (holding && !known && !full) {
        progress += (dt * (1 + perk('scan'))) / lens().scanSecs; // Steady lens
        if (progress >= 1) {
          progress = 0;
          scanned.add(t.id);
          counts[t.species] = (counts[t.species] || 0) + 1;
          // Field notes: more Data per scan.
          const earned = Math.round((DATA_PER_SCAN + (complete(t.species) ? DATA_PER_ENTRY : 0)) * (1 + perk('data')));
          data += earned;
          track('scans');
          track('data', earned);
          if (complete(t.species)) onEntry(sp);
          onChange();
        }
      } else if (!holding) progress = 0;
      return {
        name: sp.name,
        status: full ? 'Codex complete' : known ? 'Already scanned' : `${counts[t.species] || 0} / ${sp.need} scanned`,
        progress, done: known || full,
      };
    },
    canResearch(id) {
      const r = researchById[id];
      return !unlocked.has(id) && data >= r.cost && r.needs.every(complete);
    },
    research(id) {
      if (!this.canResearch(id)) return false;
      data -= researchById[id].cost;
      unlocked.add(id);
      onChange();
      return true;
    },
    serialize() {
      return { data, counts: { ...counts }, scanned: [...scanned], unlocked: [...unlocked] };
    },
    load(s) {
      if (!s) return;
      data = s.data || 0;
      Object.assign(counts, s.counts || {});
      (s.scanned || []).forEach((id) => scanned.add(id));
      (s.unlocked || []).forEach((id) => researchById[id] && unlocked.add(id));
    },
  };
}
