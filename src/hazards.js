import * as THREE from 'three';
import { floorY } from './world.js';

// Live electricity on the reef. Some jellies carry a charge (pale, crackling with arcs), and
// broken cables from the flooded outpost lie on the sand with sparking, frayed ends. Swim too
// close and it shocks you (the same shock as touching cracked glass). The power cells you want
// lie near the cables, so getting them is a risk.

export const LIVE_JELLIES = { every: 3 };   // every third jelly is electric
export const JELLY_RANGE = 2;                 // metres from a live jelly's bell
export const SPARK_RANGE = 1.7;               // metres from a cable's frayed end
// Power surges: every so often current pulses down every cable. A glowing pulse runs along
// each one, the frayed ends reach three times as far, and nearby pods can't be reached.
export const SURGE = { every: [40, 80], warn: 2, length: 4, reach: 3, podRadius: 5 };
// Broken cables: a junction box at (x, z), and the cable running off at angle ang. Placed from
// the world seed by layout.js (three round the outpost); these are the defaults.
export const CABLE_SITES = [
  { x: -20, z: -12, ang: 0.4 },
  { x: 24, z: 6, ang: 2.2 },
  { x: -6, z: -34, ang: -1 },
];
/** Where a site's frayed end lies (shock source), and a spot beside it (for a power cell). */
export function cableEnd(site) {
  const x = site.x + Math.cos(site.ang) * 7, z = site.z + Math.sin(site.ang) * 7;
  return new THREE.Vector3(x, floorY(x, z) + 0.35, z);
}

const ARC_MAT = new THREE.LineBasicMaterial({ color: 0xeafcff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

// A few jagged arcs around a point, rebuilt every so often so they crackle.
function arcs(count, radius) {
  const segs = count * 5, pos = new Float32Array(segs * 2 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const line = new THREE.LineSegments(geo, ARC_MAT);
  line.frustumCulled = false;
  return {
    line,
    regen(on) {
      line.visible = on;
      if (!on) return;
      let i = 0;
      for (let a = 0; a < count; a++) {
        let x = (Math.random() - 0.5) * radius * 0.4, y = (Math.random() - 0.5) * radius * 0.4, z = (Math.random() - 0.5) * radius * 0.4;
        const dx = (Math.random() - 0.5) * 2, dy = (Math.random() - 0.5) * 2, dz = (Math.random() - 0.5) * 2;
        for (let k = 0; k < 5; k++) {
          pos[i++] = x; pos[i++] = y; pos[i++] = z;
          x += dx * radius * 0.25 + (Math.random() - 0.5) * radius * 0.3;
          y += dy * radius * 0.25 + (Math.random() - 0.5) * radius * 0.3;
          z += dz * radius * 0.25 + (Math.random() - 0.5) * radius * 0.3;
          pos[i++] = x; pos[i++] = y; pos[i++] = z;
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

export function createHazards(scene, jellies) {
  const sources = [];

  // ---- Electric jellies ----
  for (let idx = 1; idx < jellies.length; idx += LIVE_JELLIES.every) {
    const j = jellies[idx];
    if (!j) continue;
    j.traverse((o) => {
      if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(0xdff6ff); o.material.emissive.set(0x9fdcff); }
      if (o.isLine) { o.material = o.material.clone(); o.material.color.set(0xbfefff); }
    });
    const a = arcs(6, 2);
    a.line.position.y = -0.3;
    j.add(a.line);
    j.userData.live = true;
    const centre = new THREE.Vector3();
    sources.push({ kind: 'jelly', range: JELLY_RANGE, arcs: a, pos: () => centre.copy(j.position).setY(j.position.y - 0.6) });
  }

  // ---- Broken cables ----
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x3b4a50, metalness: 0.5, roughness: 0.6 });
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x1d2629, roughness: 0.8 });
  const warnMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  for (const site of CABLE_SITES) {
    const g = new THREE.Group();
    const y0 = floorY(site.x, site.z);
    // The junction box, half-buried and tilted, with a hazard stripe.
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.9), boxMat);
    box.position.set(site.x, y0 + 0.35, site.z);
    box.rotation.set(0.15, -site.ang, 0.2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.12, 0.92), warnMat);
    stripe.position.copy(box.position).y += 0.3;
    stripe.rotation.copy(box.rotation);
    // The cable snaking across the sand to its broken end.
    const end = cableEnd(site), pts = [];
    for (let i = 0; i <= 6; i++) {
      const f = i / 6, x = THREE.MathUtils.lerp(site.x, end.x, f) + Math.sin(f * 7 + site.x) * 0.8 * f, z = THREE.MathUtils.lerp(site.z, end.z, f) + Math.cos(f * 5 + site.z) * 0.6 * f;
      pts.push(new THREE.Vector3(x, floorY(x, z) + 0.15 + Math.sin(f * Math.PI) * 0.3, z));
    }
    pts[pts.length - 1].copy(end);
    const curve = new THREE.CatmullRomCurve3(pts);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.09, 6), cableMat);
    // The surge pulse that runs down the cable.
    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: 0xeafcff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    pulse.visible = false;
    // Frayed copper at the end, glowing hot, with arcs and sparks.
    const fray = new THREE.Group();
    fray.position.copy(end);
    for (let k = 0; k < 6; k++) {
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35), new THREE.MeshBasicMaterial({ color: 0xff9a5c }));
      wire.position.set(0, 0, 0);
      wire.rotation.set(Math.random() * 2 - 1, Math.random() * 3, Math.random() * 2 - 1);
      wire.translateY(0.16);
      fray.add(wire);
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    fray.add(glow);
    const a = arcs(5, 1.4);
    fray.add(a.line);
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(14 * 3);
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xfff2c0, size: 0.13, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sparks.frustumCulled = false;
    fray.add(sparks);
    g.add(box, stripe, cable, fray, pulse);
    scene.add(g);
    sources.push({ kind: 'cable', range: SPARK_RANGE, arcs: a, glow, sparks, sparkPos, curve, pulse, pos: () => end });
  }

  let arcClock = 0, surgeAt = SURGE.every[0], surgeT = -1;
  return {
    sources,
    /** Starts a surge now (for testing). */
    forceSurge() { surgeAt = 0.01; surgeT = -1; },
    /** True while a surge is running down the cables. */
    get surging() { return surgeT >= 0 && surgeT < SURGE.length; },
    /** Is a spot cut off by a surge (too close to a cable end)? */
    cutOff(pos) { return this.surging && sources.some((s) => s.kind === 'cable' && s.pos().distanceTo(pos) < SURGE.podRadius); },
    /** Animates the hazards. Returns the source you're touching (or null) and how far the nearest one is. */
    update(dt, t, playerPos) {
      // Surges: a warning, then a few seconds of high current.
      const ev = {};
      if (surgeT < 0) {
        surgeAt -= dt;
        if (surgeAt <= SURGE.warn && surgeAt + dt > SURGE.warn) ev.surgeWarn = true;
        if (surgeAt <= 0) { surgeT = 0; ev.surge = true; }
      } else {
        surgeT += dt;
        if (surgeT >= SURGE.length) { surgeT = -1; surgeAt = SURGE.every[0] + Math.random() * (SURGE.every[1] - SURGE.every[0]); }
      }
      const surging = this.surging;
      arcClock -= dt;
      const regen = arcClock <= 0;
      if (regen) arcClock = 0.06;
      let hit = null, nearest = Infinity;
      for (const s of sources) {
        const away = s.pos().distanceTo(playerPos);
        if (away > 90) { nearest = Math.min(nearest, away); continue; } // too far off to see
        // Arcs come in bursts, so the charge flickers.
        const burst = Math.sin(t * 7.3 + s.range * 10 + sources.indexOf(s)) > -0.2 || Math.random() < 0.1;
        if (regen) s.arcs.regen(burst);
        if (s.kind === 'cable') {
          s.pulse.visible = surging;
          if (surging) s.pulse.position.copy(s.curve.getPointAt((surgeT * 1.6) % 1));
          s.glow.scale.setScalar(surging ? 2.2 : 1);
          s.glow.material.opacity = surging ? 0.6 + Math.random() * 0.3 : burst ? 0.35 + Math.random() * 0.35 : 0.08;
          s.sparks.visible = burst;
          if (burst && regen) for (let i = 0; i < s.sparkPos.length; i++) s.sparkPos[i] = (Math.random() - 0.5) * 0.9 + (i % 3 === 1 ? 0.25 : 0);
          s.sparks.geometry.attributes.position.needsUpdate = burst && regen;
        }
        const d = s.pos().distanceTo(playerPos);
        nearest = Math.min(nearest, d);
        const reach = s.kind === 'cable' && surging ? s.range * SURGE.reach : s.range;
        if (d < reach && !hit) hit = s;
      }
      return { hit, nearest, ...ev };
    },
  };
}
