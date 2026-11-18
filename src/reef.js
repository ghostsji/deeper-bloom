import * as THREE from 'three';
import { floorY, noise, WORLD_RADIUS, REEF_RADIUS } from './world.js';

// Reef restoration. The blight has killed patches of the open seabed (grey, bleached coral, from
// the world seed). Plant coral seedlings in a dead patch (T, a little Lumen each); three bring
// it back to life: the bleached coral goes, new glowing polyps grow, and while you're in a
// living patch the blight on your visor recedes. The map shows dead and restored patches.

export const REEF = { cell: 24, seedlings: 3, cost: 5, grow: 40, bonusLumen: 3, bonusRespawn: 40 };
const N = Math.ceil((WORLD_RADIUS * 2) / REEF.cell), HALF = (N * REEF.cell) / 2;
const centre = (i) => i * REEF.cell - HALF + REEF.cell / 2;
export const cellOf = (x, z) => [Math.floor((x + HALF) / REEF.cell), Math.floor((z + HALF) / REEF.cell)];

/** Is this patch of seabed dead (and so can be restored)? Seeded through the world's noise. */
export function deadCell(i, j) {
  const x = centre(i), z = centre(j), r = Math.hypot(x, z);
  if (r < REEF_RADIUS + 20 || r > WORLD_RADIUS - 60) return false;
  return noise(x / 110 + 5.3, z / 110 - 9.1) > 0.22 && floorY(x, z) > -14;
}

/** Restoration progress, kept apart from the scene so it can be tested. */
export function createRestoration() {
  const progress = new Map(); // "i,j" -> seedlings planted
  const dead = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (deadCell(i, j)) dead.push([i, j]);
  return {
    dead,
    /** Plants one seedling at (x, z). Returns 'alive' (not a dead patch), 'done' (already
     *  restored), 'planted' or 'restored' (that seedling brought the patch back). */
    plant(x, z) {
      const [i, j] = cellOf(x, z), k = `${i},${j}`;
      if (!deadCell(i, j)) return 'alive';
      const n = progress.get(k) || 0;
      if (n >= REEF.seedlings) return 'done';
      progress.set(k, n + 1);
      return n + 1 >= REEF.seedlings ? 'restored' : 'planted';
    },
    stage(i, j) { return progress.get(`${i},${j}`) || 0; },
    restoredAt(x, z) { const [i, j] = cellOf(x, z); return deadCell(i, j) && (progress.get(`${i},${j}`) || 0) >= REEF.seedlings; },
    /** Share of the dead seabed brought back, 0..1. */
    get restored() { return dead.length ? dead.filter(([i, j]) => (progress.get(`${i},${j}`) || 0) >= REEF.seedlings).length / dead.length : 0; },
    cells: () => dead.map(([i, j]) => ({ x: centre(i), z: centre(j), size: REEF.cell, stage: progress.get(`${i},${j}`) || 0 })),
  };
}

export function createReef(scene) {
  const model = createRestoration();
  // Bleached coral: one instanced mesh for every dead patch (6 stalks each).
  const geo = new THREE.CylinderGeometry(0.05, 0.12, 1, 5); geo.translate(0, 0.5, 0);
  const bleached = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xb8b4a8, roughness: 1 }), model.dead.length * 6);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const slot = new Map(); // cell -> first instance
  model.dead.forEach(([i, j], c) => {
    slot.set(`${i},${j}`, c * 6);
    for (let k = 0; k < 6; k++) {
      const x = centre(i) + Math.sin(c * 13 + k * 7) * REEF.cell * 0.4, z = centre(j) + Math.cos(c * 11 + k * 5) * REEF.cell * 0.4;
      p.set(x, floorY(x, z) - 0.1, z);
      q.setFromEuler(e.set(Math.sin(k * 3 + c) * 0.5, k, Math.cos(k * 2 + c) * 0.5));
      s.set(1, 0.8 + ((c + k) % 4) * 0.5, 1);
      bleached.setMatrixAt(c * 6 + k, m.compose(p, q, s));
    }
  });
  scene.add(bleached);
  const hideCell = (i, j) => {
    const base = slot.get(`${i},${j}`);
    if (base == null) return;
    for (let k = 0; k < 6; k++) bleached.setMatrixAt(base + k, m.makeScale(0, 0, 0));
    bleached.instanceMatrix.needsUpdate = true;
  };
  // Seedlings you've planted, and the polyps a restored patch grows.
  const seedMat = new THREE.MeshStandardMaterial({ color: 0x1d5b55, emissive: 0x5cf2d6, emissiveIntensity: 0.6 });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0x8dffb0, emissive: 0x6fe3a5, emissiveIntensity: 2.6 });
  const polypMat = new THREE.MeshStandardMaterial({ color: 0x5cf2d6, emissive: 0x5cf2d6, emissiveIntensity: 3 });
  const seedlings = [], bonus = [], planted = [];
  function addSeedling(x, z, t0) {
    const g = new THREE.Group();
    g.position.set(x, floorY(x, z), z);
    for (let k = 0; k < 4; k++) {
      const st = new THREE.Mesh(geo, seedMat); st.scale.set(1, 0.9 + k * 0.25, 1); st.rotation.set(Math.sin(k) * 0.5, k * 1.6, Math.cos(k) * 0.5);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), tipMat); tip.position.y = 1; st.add(tip);
      g.add(st);
    }
    g.scale.setScalar(0.05);
    scene.add(g);
    seedlings.push({ g, t0 });
  }
  function addBonus(i, j) {
    for (let k = 0; k < 2; k++) {
      const x = centre(i) + (k ? 3 : -3), z = centre(j) + (k ? -2 : 2);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), polypMat);
      bulb.position.set(x, floorY(x, z) + 0.8, z);
      scene.add(bulb);
      bonus.push({ bulb, back: 0 });
    }
  }
  return {
    model,
    /** Plants a seedling on the floor at (x, z). See createRestoration().plant for results. */
    plant(x, z, t, quiet = false) {
      const r = model.plant(x, z);
      if (r !== 'planted' && r !== 'restored') return r;
      planted.push({ x, z });
      addSeedling(x, z, quiet ? -REEF.grow : t);
      if (r === 'restored') { const [i, j] = cellOf(x, z); hideCell(i, j); addBonus(i, j); }
      return r;
    },
    /** Grows seedlings; returns Lumen from the restored patches' polyps you swam through. */
    update(t, pos) {
      let lumen = 0;
      for (const sd of seedlings) if (sd.g.scale.x < 1) sd.g.scale.setScalar(Math.min(1, Math.max(0.05, (t - sd.t0) / REEF.grow)));
      for (const b of bonus) {
        if (!b.bulb.visible) { if (t >= b.back) b.bulb.visible = true; continue; }
        if (b.bulb.position.distanceTo(pos) < 1.6) { b.bulb.visible = false; b.back = t + REEF.bonusRespawn; lumen += REEF.bonusLumen; }
      }
      return lumen;
    },
    serialize: () => planted.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10]),
    load(list) { for (const [x, z] of list || []) this.plant(x, z, 0, true); },
  };
}
