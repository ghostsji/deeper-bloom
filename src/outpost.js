import * as THREE from 'three';
import { floorY } from './world.js';

// The sunken research outpost the live cables run back to. Its power is out: three fuses lie
// scattered nearby, and fitting them at the console outside (F) brings the lights up and opens
// the vault doors, where a visor upgrade and two of Echo's logs wait. Electric floor grates
// pulse on and off along the path to the console, and the whole building sits below the safe
// depth, so an unsealed visor is under strain the whole time you're there.
export const OUTPOST = { x: -14, z: -22 };
export const FUSES_NEEDED = 3;
const CONSOLE = { dx: 7, dz: 0 };
// Floor grates near the console: on for 2 s, off for 2 s, each at its own phase.
const GRATES = [[9.5, 3], [9.5, -3], [12, 0]];
export const GRATE_RANGE = 1.6;

const at = (dx, dz, up = 0) => { const x = OUTPOST.x + dx, z = OUTPOST.z + dz; return new THREE.Vector3(x, floorY(x, z) + up, z); };
/** Spots for the salvage pods tied to the outpost (fuses, and what's in the vault). */
export const OUTPOST_SPOTS = {
  fuse1: () => at(13.5, 2.5, 0.9),     // behind the grates
  fuse2: () => at(0, 0, 6.4),          // on the roof
  fuse3: () => at(-11, -8, 0.9),       // out the back, in the sand
  vaultPlate: () => at(-2.5, 0, 1.1),
  vaultLog1: () => at(1.5, -2, 1.1),
  vaultLog2: () => at(1.5, 2, 1.1),
};

export function createOutpost(scene) {
  const g = new THREE.Group();
  const base = at(0, 0);
  g.position.copy(base);
  const hull = new THREE.MeshStandardMaterial({ color: 0x2c3a3f, metalness: 0.4, roughness: 0.7 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.9 });
  const lightOff = new THREE.MeshStandardMaterial({ color: 0x223036, emissive: 0x000000 });
  const lightOn = new THREE.MeshStandardMaterial({ color: 0xd8fff7, emissive: 0x5cf2d6, emissiveIntensity: 2.2 });
  const wall = (w, h, d, x, y, z, mat = hull) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
  // The hall: walls on three sides, the front (+x) open around the vault doors, a slanted roof.
  wall(12, 5, 0.4, 0, 2.5, -4.5); wall(12, 5, 0.4, 0, 2.5, 4.5); wall(0.4, 5, 9, -6, 2.5, 0);
  wall(0.4, 5, 2.6, 6, 2.5, -3.2); wall(0.4, 5, 2.6, 6, 2.5, 3.2); wall(0.4, 1.4, 3.8, 6, 4.3, 0);
  const roof = wall(13, 0.4, 10, 0, 5.4, 0, rust); roof.rotation.z = 0.06;
  wall(12, 0.3, 9, 0, 0.15, 0, rust); // floor
  // Light strips along the walls: dark until the power comes back.
  const strips = [wall(10, 0.15, 0.1, 0, 4, -4.25, lightOff), wall(10, 0.15, 0.1, 0, 4, 4.25, lightOff), wall(0.1, 0.15, 7, -5.75, 4, 0, lightOff)];
  // The vault doors (sliding apart when powered).
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x55666c, metalness: 0.7, roughness: 0.35 });
  const doorL = wall(0.3, 3.6, 1.9, 6.05, 1.8, -0.95, doorMat), doorR = wall(0.3, 3.6, 1.9, 6.05, 1.8, 0.95, doorMat);
  const stripe = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  wall(0.32, 0.2, 3.8, 6.05, 3.7, 0, stripe);
  // The console outside, with three fuse sockets.
  const con = new THREE.Group();
  con.position.set(CONSOLE.dx, 0, CONSOLE.dz);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 1.6), hull); desk.position.y = 0.65; desk.rotation.z = -0.15;
  con.add(desk);
  const socketOff = new THREE.MeshStandardMaterial({ color: 0x1a2226 }), socketOn = new THREE.MeshStandardMaterial({ color: 0xffc46b, emissive: 0xff9a5c, emissiveIntensity: 2 });
  const sockets = [-0.45, 0, 0.45].map((z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 10), socketOff); m.position.set(-0.3, 1.38, z); con.add(m); return m; });
  g.add(con);
  // Electric floor grates on the way in.
  const grateMat = () => new THREE.MeshStandardMaterial({ color: 0x2a3235, emissive: 0x9fe8ff, emissiveIntensity: 0 });
  const grates = GRATES.map(([dx, dz], i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 2), grateMat());
    const p = at(dx, dz, 0.08);
    m.position.copy(p).sub(base);
    g.add(m);
    return { mesh: m, pos: p, phase: i * 1.3 };
  });
  scene.add(g);

  const consolePos = at(CONSOLE.dx, CONSOLE.dz, 1);
  let fitted = 0, powered = false, doorOpen = 0;
  const live = (gr, t) => !powered && ((t + gr.phase) % 4) < 2;
  function setLights() {
    for (const s of strips) s.material = powered ? lightOn : lightOff;
    sockets.forEach((m, i) => { m.material = i < fitted ? socketOn : socketOff; });
  }

  return {
    get fitted() { return fitted; },
    get powered() { return powered; },
    consolePos,
    grates: () => grates.map((gr) => gr.pos),
    nearConsole: (pos) => pos.distanceTo(consolePos) < 3,
    /** Fits fuses; returns true if that brought the power back. */
    fit(n) {
      if (powered || n <= 0) return false;
      fitted = Math.min(FUSES_NEEDED, fitted + n);
      if (fitted >= FUSES_NEEDED) powered = true;
      setLights();
      return powered;
    },
    /** Animates; returns the grate you're standing on while it's live (or null). */
    update(dt, t, pos) {
      if (powered && doorOpen < 1) {
        doorOpen = Math.min(1, doorOpen + dt * 0.4);
        doorL.position.z = -0.95 - doorOpen * 1.7; doorR.position.z = 0.95 + doorOpen * 1.7;
      }
      let hit = null;
      for (const gr of grates) {
        const on = live(gr, t);
        gr.mesh.material.emissiveIntensity = on ? 1.4 + Math.random() * 1.2 : 0;
        if (on && Math.hypot(pos.x - gr.pos.x, pos.z - gr.pos.z) < GRATE_RANGE && pos.y - gr.pos.y < 2.5) hit = gr;
      }
      return { hit };
    },
    serialize: () => ({ fitted, powered }),
    load(d) {
      fitted = d?.fitted ?? 0; powered = !!d?.powered;
      if (powered) { doorOpen = 1; doorL.position.z = -2.65; doorR.position.z = 2.65; }
      setLights();
    },
  };
}

// Two sunken boats, each holding a visor upgrade and one of Echo's logs.
export const WRECKS = [{ x: 34, z: 26, rot: 0.6 }, { x: -40, z: 18, rot: -1.1 }];
/** Spot k (0: the upgrade, in the hull; 1: a log, by the bow) at wreck i. */
export function wreckSpot(i, k) {
  const w = WRECKS[i], a = w.rot, d = k ? 3.2 : -0.6;
  const x = w.x + Math.cos(a) * d, z = w.z + Math.sin(a) * d;
  return new THREE.Vector3(x, floorY(x, z) + 1, z);
}
export function createWrecks(scene) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.95 });
  const paint = new THREE.MeshStandardMaterial({ color: 0x5a6e74, roughness: 0.8 });
  for (const w of WRECKS) {
    const g = new THREE.Group();
    g.position.set(w.x, floorY(w.x, w.z) + 0.3, w.z);
    g.rotation.set(0.12, -w.rot, 0.35); // heeled over in the sand
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 7, 14, 1, true, Math.PI / 2, Math.PI), wood);
    hull.rotation.z = Math.PI / 2;
    hull.material.side = THREE.DoubleSide;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2, 14, 1, true, Math.PI / 2, Math.PI), wood);
    bow.rotation.z = -Math.PI / 2; bow.position.x = 4.5;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, 1.3, 1.8), paint); cabin.position.set(-1, 0.9, 0); cabin.rotation.y = 0.1;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2), wood); mast.position.set(1, 1.6, 0); mast.rotation.z = 0.5;
    g.add(hull, bow, cabin, mast);
    scene.add(g);
  }
}
