import * as THREE from 'three';
import { floorY, WORLD_RADIUS, SURFACE_Y, worldSeed } from './world.js';

// The trenches have their own life. Anglerfish hang in the dark with a lure that looks just
// like a glowing polyp; swim up to it and the fish lunges. Abyssal polyps (violet) grow only
// down here and pay far more Lumen than reef polyps. Pressure-crushed wreckage litters the
// floor. (The cold down here fogs the visor faster: see suit.js.)

export const DEEP = {
  floor: -14,          // floor height below which a spot counts as deep (40 m+ of water)
  anglers: 40, lunge: 2.6, bite: 14, sight: 9, cooldown: 4,
  polyps: 100, polypLumen: 12, polypRespawn: 120, reach: 1.6,
  debris: 140,
};

function rng(seed) {
  let a = (seed ^ 0x51ed270b) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Deep spots from the world seed (as many as can be found in the trenches). */
export function deepSpots(n, seed = worldSeed()) {
  const r = rng(seed + n), out = [];
  for (let k = 0; k < n * 80 && out.length < n; k++) {
    const a = r() * Math.PI * 2, d = 60 + r() * (WORLD_RADIUS - 120);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (floorY(x, z) < DEEP.floor && out.every((p) => Math.hypot(p.x - x, p.z - z) > 8)) out.push({ x, z, r: r() });
  }
  return out;
}

export function createDeep(scene) {
  // ---- Anglerfish: a dark body, jaws, and a lure on a stalk ----
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0d10, roughness: 0.9 });
  const teeth = new THREE.MeshStandardMaterial({ color: 0xd8e0d0, emissive: 0x223030 });
  const lureMat = new THREE.MeshStandardMaterial({ color: 0x5cf2d6, emissive: 0x5cf2d6, emissiveIntensity: 3.2 });
  const anglers = deepSpots(DEEP.anglers).map((s) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), dark); body.scale.set(1, 0.85, 1.25);
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.6, 12, 1, true), teeth); jaw.rotation.x = Math.PI / 2; jaw.position.set(0, -0.15, 1);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.4), dark); stalk.position.set(0, 0.9, 0.8); stalk.rotation.x = 0.9;
    const lure = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), lureMat); lure.position.set(0, 1.4, 1.5);
    g.add(body, jaw, stalk, lure);
    const home = new THREE.Vector3(s.x, floorY(s.x, s.z) + 2 + s.r * 3, s.z);
    g.position.copy(home);
    g.rotation.y = s.r * Math.PI * 2;
    scene.add(g);
    return { g, lure, home, phase: s.r * 9, lunging: 0, cool: 0 };
  });
  // ---- Abyssal polyps: violet, rare, valuable ----
  const stalkMat = new THREE.MeshStandardMaterial({ color: 0x2a1a4a });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xb59cff, emissive: 0x9a6bff, emissiveIntensity: 3.6 });
  const polyps = deepSpots(DEEP.polyps).map((s) => {
    const g = new THREE.Group();
    g.position.set(s.x, floorY(s.x, s.z), s.z);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.9, 6), stalkMat); st.position.y = 0.45;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), bulbMat); bulb.position.y = 1;
    g.add(st, bulb);
    scene.add(g);
    return { g, bulb, back: 0, phase: s.r * 7 };
  });
  // ---- Crushed wreckage ----
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a4044, metalness: 0.6, roughness: 0.6, flatShading: true });
  for (const s of deepSpots(DEEP.debris)) {
    const geo = new THREE.BoxGeometry(1 + s.r * 3, 0.6 + s.r, 1 + s.r * 2, 3, 2, 3);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.7 + Math.random() * 0.5), p.getY(i) * (0.4 + Math.random() * 0.8), p.getZ(i) * (0.7 + Math.random() * 0.5)); // crumpled
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, metal);
    m.position.set(s.x, floorY(s.x, s.z) + 0.2, s.z);
    m.rotation.set(s.r, s.r * 6, s.r * 2);
    scene.add(m);
  }

  const lw = new THREE.Vector3(), toward = new THREE.Vector3();
  return {
    anglers, polyps,
    /** Returns { bite: damage or 0, collected: Lumen, deepAhead } for this frame. */
    update(dt, t, pos, exposed) {
      const out = { bite: 0, collected: 0 };
      for (const a of anglers) {
        if (a.home.distanceTo(pos) > 80) continue; // too far to matter
        a.cool = Math.max(0, a.cool - dt);
        a.lure.position.y = 1.4 + Math.sin(t * 1.3 + a.phase) * 0.12;
        a.lure.getWorldPosition(lw);
        const d = lw.distanceTo(pos);
        // You came for the light: it lunges.
        if (exposed && !a.cool && d < DEEP.lunge) { a.lunging = 0.35; a.cool = DEEP.cooldown; out.bite = DEEP.bite; }
        if (a.lunging > 0) {
          a.lunging -= dt;
          toward.subVectors(pos, a.g.position).normalize();
          a.g.position.addScaledVector(toward, dt * 10);
        } else {
          a.g.position.lerp(a.home, dt * 0.5);
          a.g.position.y += Math.sin(t * 0.6 + a.phase) * 0.004;
        }
      }
      for (const p of polyps) {
        if (!p.g.visible) { if (t >= p.back) p.g.visible = true; continue; }
        if (Math.abs(p.g.position.x - pos.x) > 6 || Math.abs(p.g.position.z - pos.z) > 6) continue;
        p.bulb.scale.setScalar(1 + Math.sin(t * 2.5 + p.phase) * 0.15);
        if (p.bulb.getWorldPosition(lw).distanceTo(pos) < DEEP.reach) {
          p.g.visible = false;
          p.back = t + DEEP.polypRespawn;
          out.collected += DEEP.polypLumen;
        }
      }
      return out;
    },
    /** Things the sonar can outline near a point: [{ kind, pos }]. */
    near(pos, radius) {
      const out = [];
      for (const a of anglers) if (a.g.position.distanceTo(pos) < radius) out.push({ kind: 'angler', pos: a.g.position });
      for (const p of polyps) if (p.g.visible && p.g.position.distanceTo(pos) < radius) out.push({ kind: 'abyss', pos: p.bulb.getWorldPosition(new THREE.Vector3()) });
      return out;
    },
  };
}
export const isDeep = (y) => y < DEEP.floor || SURFACE_Y - y > 40;
