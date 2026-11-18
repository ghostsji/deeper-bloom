import * as THREE from 'three';
import { floorY, SURFACE_Y } from './world.js';

// The reef's moods: night and day, currents along the edges and a sinkhole that drags you
// down, gas vents that breathe for you (and fling you up), and something very big that passes
// in the dark.

// ---- Night and day ----
export const DAY = { length: 480 }; // seconds for a whole day; phase 0 = 06:00, 0.5 = 18:00
/** How dark it is at a phase of the day (0 day .. 1 night), with a dusk and a dawn. */
export function nightAt(phase) {
  const p = ((phase % 1) + 1) % 1;
  const ramp = (x) => Math.min(1, Math.max(0, x));
  if (p < 0.45) return 0;
  if (p < 0.55) return ramp((p - 0.45) / 0.1);   // dusk
  if (p < 0.95) return 1;
  return ramp(1 - (p - 0.95) / 0.05);             // dawn
}
export const clockText = (phase) => {
  const mins = Math.floor((((phase % 1) + 1) % 1) * 1440 + 360) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};

// ---- Currents and the sinkhole ----
export const CURRENTS = [
  { x: -56, z: 10, r: 14, dir: [0, 0, 1], strength: 6 },
  { x: 50, z: -16, r: 12, dir: [-0.95, 0, 0.3], strength: 5 },
];
// Placed from the world seed by layout.js (these are the defaults before it runs).
export const SINKHOLES = [{ x: 12, z: -48, r: 7, pull: 7 }];
// ---- Gas vents: bursts of bubbles every 9 s, 4 s long ----
export const VENTS = [[18, -8], [-8, 14], [-30, -30], [26, -36]].map(([x, z], i) => ({ x, z, phase: i * 2.3 }));
export const VENT = { every: 9, on: 4, radius: 1.6, height: 8, breath: 30, fog: 0.3, lift: 9 };
const ventOn = (v, t) => ((t + v.phase) % VENT.every) < VENT.on;

// ---- The big shape ----
export const GIANT = { every: [120, 240], pass: 26, far: 50, near: 28 };

export function createEnvironment(scene) {
  let phase = 0.1;

  // Current streaks: short lines drifting with the flow.
  const streaks = CURRENTS.map((c) => {
    const n = 36, pos = new Float32Array(n * 6), seeds = Array.from({ length: n }, () => [Math.random(), Math.random(), Math.random()]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc9d9c0, transparent: true, opacity: 0.35 }));
    lines.frustumCulled = false;
    scene.add(lines);
    return { c, pos, seeds, geo };
  });
  // The sinkhole: a dark mouth on the sand and a slow spiral of grit going down it.
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x010405, transparent: true, opacity: 0.85 });
  const gritMat = new THREE.PointsMaterial({ color: 0xb8b090, size: 0.08, transparent: true, opacity: 0.7 });
  const holes = SINKHOLES.map((h) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(h.r, 40), holeMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(h.x, floorY(h.x, h.z) + 0.05, h.z);
    scene.add(mesh);
    const grit = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3)), gritMat);
    grit.frustumCulled = false;
    scene.add(grit);
    return { h, mesh, grit };
  });
  // Vent bubbles.
  const vents = VENTS.map((v) => {
    const y0 = floorY(v.x, v.z);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.7, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2f2a, roughness: 1 }));
    cone.position.set(v.x, y0 + 0.3, v.z);
    scene.add(cone);
    const n = 40, pos = new Float32Array(n * 3);
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ color: 0xdffaff, size: 0.12, transparent: true, opacity: 0.75 }));
    pts.frustumCulled = false;
    scene.add(pts);
    return { v, y0, pts, pos, seeds: Array.from({ length: n }, () => Math.random()) };
  });
  // The giant: a long dark body that only ever shows as a shape in the murk.
  const giant = new THREE.Group();
  const dark = new THREE.MeshBasicMaterial({ color: 0x010608 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.4, 26, 6, 16), dark);
  body.rotation.z = Math.PI / 2;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 4), dark); tail.rotation.z = Math.PI / 2; tail.position.x = -17;
  const fin = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5, 3), dark); fin.position.set(2, 3, 0);
  giant.add(body, tail, fin);
  giant.visible = false;
  scene.add(giant);
  let giantNext = GIANT.every[0], giantT = -1, giantFrom = new THREE.Vector3(), giantTo = new THREE.Vector3();

  const push = new THREE.Vector3(), tmp = new THREE.Vector3();
  return {
    get phase() { return phase; },
    set phase(v) { phase = v; },
    get night() { return nightAt(phase); },
    get clock() { return clockText(phase); },
    get giantPos() { return giant.visible ? giant.position : null; },
    /** Skips ahead (for testing). */
    forceGiant() { giantNext = 0; },
    /** Something heard your sonar: the giant comes by soon. */
    answer() { if (giantT < 0) giantNext = Math.min(giantNext, 3 + Math.random() * 4); },

    // Returns { push (acceleration on the player), breath, fog (per second), inSinkhole, inVent, giantStart, giantEnd }
    update(dt, t, p, { logsDone = false, exposed = true } = {}) {
      phase = (phase + dt / DAY.length) % 1;
      push.set(0, 0, 0);
      const out = { push, breath: 0, fog: 0 };
      // Currents.
      for (const st of streaks) {
        const { c } = st, dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
        if (exposed && d < c.r) push.add(tmp.set(...c.dir).multiplyScalar(c.strength * (1 - d / c.r)));
        if (d > c.r + 90) continue;
        for (let i = 0; i < st.seeds.length; i++) {
          const [a, b, k] = st.seeds[i], f = (k + t * 0.12 * c.strength / 5) % 1;
          const ox = (a - 0.5) * c.r * 1.6, oz = (b - 0.5) * c.r * 1.6, along = (f - 0.5) * c.r * 1.8;
          const x = c.x + ox + c.dir[0] * along, z = c.z + oz + c.dir[2] * along, y = floorY(x, z) + 1 + a * 6;
          st.pos.set([x, y, z, x + c.dir[0] * 1.4, y, z + c.dir[2] * 1.4], i * 6);
        }
        st.geo.attributes.position.needsUpdate = true;
      }
      // Sinkholes: pull you in and down.
      for (const { h, mesh, grit } of holes) {
        const sx = h.x - p.x, sz = h.z - p.z, sd = Math.hypot(sx, sz);
        if (exposed && sd < h.r * 1.6) {
          const f = 1 - sd / (h.r * 1.6);
          push.x += (sx / (sd || 1)) * 3 * f; push.z += (sz / (sd || 1)) * 3 * f;
          if (sd < h.r) { push.y -= h.pull * f; out.inSinkhole = true; }
        }
        if (sd > 90) continue; // only animate the ones you could see
        const gp = grit.geometry.attributes.position;
        for (let i = 0; i < 60; i++) {
          const a = t * 0.8 + i * 0.7, r = ((i * 0.37 + t * 0.15) % 1) * h.r;
          gp.setXYZ(i, h.x + Math.cos(a) * r, mesh.position.y + 0.2 + r * 0.6, h.z + Math.sin(a) * r);
        }
        gp.needsUpdate = true;
      }
      // Vents.
      for (const vt of vents) {
        const far = Math.hypot(p.x - vt.v.x, p.z - vt.v.z) > 90;
        const on = ventOn(vt.v, t) && !far;
        vt.pts.visible = on;
        if (on) {
          for (let i = 0; i < vt.seeds.length; i++) {
            const k = vt.seeds[i], h = ((k * 7 + t * 2.4) % VENT.height);
            vt.pos.set([vt.v.x + Math.sin(k * 40 + t * 3) * 0.4 * (1 + h * 0.08), vt.y0 + 0.6 + h, vt.v.z + Math.cos(k * 31 + t * 2) * 0.4 * (1 + h * 0.08)], i * 3);
          }
          vt.pts.geometry.attributes.position.needsUpdate = true;
          if (Math.hypot(p.x - vt.v.x, p.z - vt.v.z) < VENT.radius && p.y > vt.y0 && p.y < vt.y0 + VENT.height + 1) {
            out.breath += VENT.breath; out.fog += VENT.fog; push.y += VENT.lift; out.inVent = true;
          }
        }
      }
      // The giant: a slow pass beyond the fog (closer once you know Echo's whole story).
      if (giantT < 0) {
        giantNext -= dt * (1 + nightAt(phase)); // twice as often at night
        if (giantNext <= 0) {
          giantT = 0;
          const a = Math.random() * Math.PI * 2, dist = logsDone ? GIANT.near : GIANT.far, y = Math.max(floorY(p.x, p.z) + 6, Math.min(SURFACE_Y - 6, p.y - 4));
          giantFrom.set(p.x + Math.cos(a) * dist - Math.sin(a) * 60, y, p.z + Math.sin(a) * dist + Math.cos(a) * 60);
          giantTo.set(p.x + Math.cos(a) * dist + Math.sin(a) * 60, y, p.z + Math.sin(a) * dist - Math.cos(a) * 60);
          giant.visible = true;
          out.giantStart = true;
        }
      } else {
        giantT += dt / GIANT.pass;
        giant.position.lerpVectors(giantFrom, giantTo, giantT);
        giant.position.y += Math.sin(giantT * Math.PI * 3) * 1.5;
        giant.lookAt(giantTo);
        giant.rotateY(-Math.PI / 2);
        if (giantT >= 1) {
          giant.visible = false; giantT = -1;
          giantNext = GIANT.every[0] + Math.random() * (GIANT.every[1] - GIANT.every[0]);
          out.giantEnd = true;
        }
      }
      return out;
    },
    serialize: () => ({ phase }),
    load(d) { if (typeof d?.phase === 'number') phase = d.phase; },
  };
}
