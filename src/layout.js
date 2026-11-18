import { floorY, WORLD_RADIUS, SURFACE_Y } from './world.js';
import { CABLE_SITES } from './hazards.js';
import { OUTPOST, WRECKS } from './outpost.js';
import { CURRENTS, SINKHOLES, VENTS } from './environment.js';

// Places everything that used to sit at a fixed spot, from the world seed: the sunken outpost
// (on flat ground, below the safe depth, a good swim out), wrecks, live cables (three round the
// outpost), currents, sinkholes, gas vents, and the salvage pods for the lost phone apps. The
// same seed always gives the same layout. Call applyLayout after buildWorld and before the
// modules that read these (salvage, hazards, outpost, environment).

export const SPOTS = {}; // salvage pod positions: { codex: {x, z}, status, goals, skills, far }
// Regions the water-damaged map gets wrong (it shows the seabed from somewhere else) until you
// swim right into them or sweep them with sonar: [{ x, z, r, ox, oz }].
export const CORRUPT = [];
const START = { x: 0, z: 24 };
const depthAt = (x, z) => SURFACE_Y - floorY(x, z);
const flat = (x, z, span = 7, tol = 2.5) => {
  const y = floorY(x, z);
  return [[span, 0], [-span, 0], [0, span], [0, -span]].every(([dx, dz]) => Math.abs(floorY(x + dx, z + dz) - y) < tol);
};

function rng(seed) {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function generateLayout(seed, kelpPatches = []) {
  const rand = rng(seed), range = (a, b) => a + rand() * (b - a);
  const placed = [];
  // A spot between rMin and rMax from the reef's centre that passes ok() and keeps `gap` metres
  // from everything already placed. Falls back to the best effort if nothing fits.
  function find(rMin, rMax, ok = () => true, gap = 18, from = { x: 0, z: 0 }) {
    let best = null;
    for (let k = 0; k < 600; k++) {
      const a = range(0, Math.PI * 2), r = Math.sqrt(range(rMin * rMin, rMax * rMax));
      const x = from.x + Math.cos(a) * r, z = from.z + Math.sin(a) * r;
      if (Math.hypot(x, z) > WORLD_RADIUS - 50) continue;
      best ??= { x, z };
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) continue;
      if (!ok(x, z)) continue;
      best = { x, z };
      break;
    }
    placed.push(best);
    return best;
  }
  const L = {};
  // The outpost: flat sand, 22-38 m down, 110-210 m out.
  L.outpost = find(110, 210, (x, z) => { const d = depthAt(x, z); return d > 22 && d < 38 && flat(x, z, 9); }, 40);
  // Wrecks: the first two hold the upgrades, the phone screen and two logs; four more lie further out.
  L.wrecks = Array.from({ length: 6 }, (_, i) => ({ ...find(i < 2 ? 70 : 140, i < 2 ? 170 : WORLD_RADIUS - 60, (x, z) => depthAt(x, z) > 8 && flat(x, z, 4, 3), 35), rot: range(-Math.PI, Math.PI) }));
  // Cables: three round the outpost (power cells lie by the first two), five elsewhere.
  L.cables = [
    ...Array.from({ length: 3 }, () => ({ ...find(14, 26, (x, z) => depthAt(x, z) > 6, 8, L.outpost), ang: range(-Math.PI, Math.PI) })),
    ...Array.from({ length: 5 }, () => ({ ...find(60, WORLD_RADIUS - 60, (x, z) => depthAt(x, z) > 6, 30), ang: range(-Math.PI, Math.PI) })),
  ];
  L.currents = Array.from({ length: 7 }, () => {
    const a = range(0, Math.PI * 2);
    return { ...find(90, WORLD_RADIUS - 50, () => true, 40), r: range(12, 20), dir: [Math.cos(a), 0, Math.sin(a)], strength: range(4, 7) };
  });
  L.sinkholes = Array.from({ length: 4 }, () => ({ ...find(60, WORLD_RADIUS - 70, (x, z) => depthAt(x, z) > 14 && flat(x, z, 6, 3), 50), r: range(6, 9), pull: 7 }));
  L.vents = Array.from({ length: 16 }, (_, i) => ({ ...find(25, WORLD_RADIUS - 60, (x, z) => depthAt(x, z) > 6, 25), phase: i * 2.3 }));
  // App pods: Codex close to where you dive in, the others progressively further out.
  L.spots = {
    codex: find(10, 22, (x, z) => depthAt(x, z) > 4, 6, START),
    status: find(35, 70, (x, z) => depthAt(x, z) > 4, 12),
    goals: find(85, 140, (x, z) => depthAt(x, z) > 4, 20),
    far: find(200, WORLD_RADIUS - 70, (x, z) => depthAt(x, z) > 4, 30),
  };
  // Skills: in a far kelp patch (where eels nest).
  const patch = [...kelpPatches].filter((p) => Math.hypot(p.x, p.z - START.z) > 130 && Math.hypot(p.x, p.z) < WORLD_RADIUS - 60)
    .sort((a, b) => Math.hypot(a.x, a.z - START.z) - Math.hypot(b.x, b.z - START.z))[0];
  L.spots.skills = patch ? { x: patch.x + 1.5, z: patch.z } : find(140, 220, () => true, 20);
  L.corrupt = Array.from({ length: 7 }, () => {
    const a = range(0, Math.PI * 2), shift = range(90, 160);
    return { ...find(60, WORLD_RADIUS - 70, () => true, 60), r: range(24, 42), ox: Math.cos(a) * shift, oz: Math.sin(a) * shift };
  });
  return L;
}

/** Generates the layout and writes it into the modules that use it. Returns it. */
export function applyLayout(seed, kelpPatches) {
  const L = generateLayout(seed, kelpPatches);
  Object.assign(OUTPOST, L.outpost);
  WRECKS.splice(0, WRECKS.length, ...L.wrecks);
  CABLE_SITES.splice(0, CABLE_SITES.length, ...L.cables);
  CURRENTS.splice(0, CURRENTS.length, ...L.currents);
  SINKHOLES.splice(0, SINKHOLES.length, ...L.sinkholes);
  VENTS.splice(0, VENTS.length, ...L.vents);
  Object.assign(SPOTS, L.spots);
  CORRUPT.splice(0, CORRUPT.length, ...L.corrupt);
  return L;
}
