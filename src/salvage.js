import * as THREE from 'three';
import { floorY, SURFACE_Y } from './world.js';

// Phone apps the flood washed out of your phone. Each one's module lies somewhere on the reef
// in a salvage pod: a blinking capsule under a faint beam of light that reaches up to the
// surface, so you can spot it from a distance. Swim into a pod to put its app back.
export const APPS = [
  { id: 'codex', name: 'Codex', where: 'On the sand just off the reef, ahead of where you first dive in.' },
  { id: 'status', name: 'Status', where: 'Among the rocks west of the reef.' },
  { id: 'goals', name: 'Goals', where: 'Out on the dunes to the north-east.' },
  { id: 'skills', name: 'Skills', where: 'Deep in a kelp patch. Eels may be guarding it.' },
];
export const APP_IDS = APPS.map((a) => a.id);
const PICKUP = 2.4;

// Where each pod lies. Skills goes in a far kelp patch (where eels nest) to make it a trip.
function spots(kelpPatches) {
  const at = (x, z) => new THREE.Vector3(x, floorY(x, z) + 0.9, z);
  const far = [...kelpPatches].filter((p) => Math.hypot(p.x, p.z) < 66)
    .sort((a, b) => Math.hypot(b.x, b.z - 24) - Math.hypot(a.x, a.z - 24))[0];
  return { codex: at(7, 11), status: at(-26, -2), goals: at(30, -24), skills: far ? at(far.x + 1.5, far.z) : at(-34, -40) };
}

export function createSalvage(scene, kelpPatches) {
  const where = spots(kelpPatches);
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x2a3b42, metalness: 0.6, roughness: 0.35 });
  const pods = APPS.map((app) => {
    const g = new THREE.Group();
    g.position.copy(where[app.id]);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.55, 6, 12), shellMat);
    body.rotation.z = Math.PI / 2 - 0.35;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 24), new THREE.MeshBasicMaterial({ color: 0x5cf2d6 }));
    band.rotation.y = Math.PI / 2; band.rotation.x = 0.35;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    lamp.position.y = 0.36;
    // The beam: a faint column of light up to the surface, visible through the murk.
    const h = SURFACE_Y - g.position.y;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.5, h, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x5cf2d6, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    beam.position.y = h / 2;
    // A soft halo (not a light: lights coming and going would recompile every material).
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x5cf2d6, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    // A bright thin core, so the beam reads as a signal rather than one of the sun's rays.
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xd8fff8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    core.position.y = h / 2;
    // A sonar ring pulsing out across the sand.
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40),
      new THREE.MeshBasicMaterial({ color: 0x5cf2d6, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.55;
    g.add(body, band, lamp, beam, core, glow, ring);
    scene.add(g);
    return { app, g, lamp, beam, core, ring, band, found: false, phase: Math.random() * 6 };
  });

  return {
    /** Pods still out there: [{ id, pos }]. */
    remaining: () => pods.filter((p) => !p.found).map((p) => ({ id: p.app.id, pos: p.g.position })),
    found: (id) => pods.find((p) => p.app.id === id)?.found ?? false,
    /** Marks apps found (from a save) without a pickup. */
    load(ids) { for (const p of pods) { p.found = (ids || []).includes(p.app.id); p.g.visible = !p.found; } },
    serialize: () => pods.filter((p) => p.found).map((p) => p.app.id),
    /** Animates the pods; returns the app picked up this frame (or null) and the nearest distance. */
    update(t, pos) {
      let got = null, nearest = Infinity;
      for (const p of pods) {
        if (p.found) continue;
        const blink = (Math.sin(t * 4 + p.phase) > 0.6) ? 1 : 0.15;
        p.lamp.material.color.setScalar(blink);
        p.band.rotation.z = t * 1.5;
        p.g.children[0].position.y = Math.sin(t * 1.3 + p.phase) * 0.08;
        p.beam.material.opacity = 0.07 + Math.sin(t * 0.8 + p.phase) * 0.03;
        p.core.material.opacity = 0.25 + blink * 0.45;
        const ping = ((t + p.phase) % 2.6) / 2.6; // in step with the sonar ping's rhythm
        p.ring.scale.setScalar(0.5 + ping * 5);
        p.ring.material.opacity = 0.5 * (1 - ping);
        const d = p.g.position.distanceTo(pos);
        nearest = Math.min(nearest, d);
        if (d < PICKUP && !got) {
          p.found = true;
          p.g.visible = false;
          got = p.app;
        }
      }
      return { got, nearest };
    },
  };
}
