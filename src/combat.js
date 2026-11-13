import * as THREE from 'three';
import { floorY, segDist, SURFACE_Y } from './world.js';
import { perk } from './progress.js';

// ---- Combat: tune here ----------------------------------------------------------
export const HARPOON_MAX = 30;     // shots before the harpoon needs repairing
const SPEAR = { speed: 26, drag: 0.9, sink: 2, range: 20, damage: 35, reel: 0.45 };
const EEL = {
  count: 14, health: 100, segments: 16, spacing: 0.32,
  idle: 2, chase: 5.2, lunge: 9.5,   // m/s (you swim about 5.4, 12 dashing)
  sight: 14, leash: 32, lungeRange: 4.2, biteRange: 1.6, bite: 18, retreat: 2.2,
  respawn: 120, safeFromSpawn: 26,   // eels never nest this close to where you start
  // Electric eels (every other one) build up a charge while hunting you, then discharge: a
  // ring of electricity that bursts out to `zap` metres. Swim out of it or get shocked.
  zap: 7, zapCharge: 1.1, zapSpeed: 11, zapEvery: [6, 10], zapRange: 9,
};
const ZAP_MAT = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, wireframe: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });

// The harpoon is held in front of the camera; eels live in kelp patches and hunt anything
// that swims too close. g: { onBite(dmg), onEelKilled(pos), onFishSpeared(), onHit(), onFire(), onSpot(),
// onEelCharge(), onEelZap() }
export function createCombat(scene, camera, world, g) {
  scene.add(camera); // so the held harpoon (a child of the camera) renders

  // ---- The harpoon gun (first-person view model) ----
  const gun = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x3d4d52, metalness: 0.7, roughness: 0.4 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3b2c1e, roughness: 0.9 });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0x5cf2d6, emissive: 0x5cf2d6, emissiveIntensity: 1.6 });
  const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); gun.add(m); return m; };
  part(new THREE.BoxGeometry(0.07, 0.09, 0.5), metal, 0, 0, 0);
  part(new THREE.BoxGeometry(0.06, 0.16, 0.08), grip, 0, -0.1, 0.12).rotation.x = 0.3;
  part(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8), metal, 0, 0.065, -0.2).rotation.x = Math.PI / 2;
  part(new THREE.TorusGeometry(0.05, 0.012, 6, 16), metal, 0, 0.02, 0.05).rotation.y = Math.PI / 2; // reel
  const loaded = part(new THREE.CylinderGeometry(0.01, 0.01, 0.55, 6), metal, 0, 0.065, -0.35);
  loaded.rotation.x = Math.PI / 2;
  const loadedTip = part(new THREE.ConeGeometry(0.025, 0.09, 8), tipMat, 0, 0.065, -0.66);
  loadedTip.rotation.x = -Math.PI / 2;
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.065, -0.66); gun.add(muzzle);
  const REST = new THREE.Vector3(0.16, -0.15, -0.5);
  gun.scale.setScalar(0.45);
  gun.position.copy(REST);
  gun.visible = false;
  camera.add(gun);

  // The spear in flight, and the line back to the gun.
  const spear = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 6), metal); shaft.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 8), tipMat); tip.rotation.x = Math.PI / 2; tip.position.z = 0.45;
  spear.add(shaft, tip);
  spear.visible = false;
  scene.add(spear);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xd8fff7, transparent: true, opacity: 0.5 }));
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);

  let equipped = false, shot = null, recoil = 0, bobT = 0;
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), fwd = new THREE.Vector3();

  function fire(durability) {
    if (!equipped || shot || durability <= 0) return false;
    camera.getWorldDirection(fwd);
    muzzle.getWorldPosition(vA);
    // Skill: Strong spring (faster, further spear).
    const spring = 1 + perk('spear');
    vB.copy(camera.position).addScaledVector(fwd, SPEAR.range * spring).sub(vA).normalize();
    shot = { pos: vA.clone(), vel: vB.multiplyScalar(SPEAR.speed * spring), travelled: 0, stuck: false, reel: 0 };
    spear.position.copy(shot.pos);
    spear.visible = line.visible = true;
    loaded.visible = loadedTip.visible = false;
    recoil = 1;
    g.onFire();
    return true;
  }

  function updateShot(dt, t) {
    if (!shot) return;
    muzzle.getWorldPosition(vB);
    if (shot.reel > 0 || shot.stuck) {
      // Reel the spear back to the gun.
      shot.reel += (dt * (1 + perk('reel'))) / SPEAR.reel; // Fast reel
      shot.pos.lerp(vB, Math.min(1, shot.reel));
      if (shot.reel >= 1) {
        shot = null;
        spear.visible = line.visible = false;
        loaded.visible = loadedTip.visible = true;
        return;
      }
    } else {
      const from = vA.copy(shot.pos);
      shot.vel.multiplyScalar(Math.exp(-SPEAR.drag * dt));
      if (shot.pos.y < SURFACE_Y) shot.vel.y -= SPEAR.sink * dt;
      shot.pos.addScaledVector(shot.vel, dt);
      shot.travelled += shot.vel.length() * dt;
      const hitEel = eels.find((e) => e.alive && e.segs.some((sg) => segDist(sg.position, from, shot.pos) < 0.5));
      if (hitEel) { hurtEel(hitEel, t); shot.stuck = true; }
      else if (world.spearFish(from, shot.pos, t)) { g.onFishSpeared(); shot.stuck = true; }
      else if (shot.pos.y < floorY(shot.pos.x, shot.pos.z) + 0.05 || shot.travelled > SPEAR.range * (1 + perk('spear'))) shot.stuck = true;
    }
    spear.position.copy(shot.pos);
    spear.lookAt(vA.copy(shot.pos).add(shot.reel > 0 || shot.stuck ? vB.clone().sub(shot.pos).negate() : shot.vel));
    const pts = lineGeo.attributes.position;
    pts.setXYZ(0, vB.x, vB.y, vB.z); pts.setXYZ(1, shot.pos.x, shot.pos.y, shot.pos.z);
    pts.needsUpdate = true;
  }

  // ---- Blighted eels ----
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a1a3a, roughness: 0.6, emissive: 0x1a0820, emissiveIntensity: 0.4 });
  const blightMat = new THREE.MeshStandardMaterial({ color: 0xff9a5c, emissive: 0xff9a5c, emissiveIntensity: 2.4 });
  const voltMat = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x9fe8ff, emissiveIntensity: 2.6 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffd36b, emissive: 0xffc46b, emissiveIntensity: 3 });
  const segGeo = new THREE.SphereGeometry(1, 10, 8), spotGeo = new THREE.SphereGeometry(0.05, 6, 4);

  const homes = world.kelpPatches.filter((p) => Math.hypot(p.x, p.z - 24) > EEL.safeFromSpawn).slice(0, EEL.count);
  const eels = homes.map((home, n) => {
    const mat = bodyMat.clone(); // its own, so only this eel flashes when hit
    const electric = n % 2 === 1;
    const segs = [];
    for (let i = 0; i < EEL.segments; i++) {
      const r = i === 0 ? 0.24 : 0.2 * (1 - i / EEL.segments) + 0.05;
      const sg = new THREE.Mesh(segGeo, mat);
      sg.scale.set(r, r * 0.85, i === 0 ? r * 1.9 : r * 2.4); // stretched so segments overlap into one body
      if (i % 3 === 1) { const spot = new THREE.Mesh(spotGeo, electric ? voltMat : blightMat); spot.position.set(0, 0.8, 0); sg.add(spot); }
      if (i === 0) {
        for (const x of [-0.45, 0.45]) { const eye = new THREE.Mesh(spotGeo, eyeMat); eye.position.set(x, 0.35, 0.6); eye.scale.setScalar(1.3); sg.add(eye); }
        sg.userData.scan = { species: 'eel', id: `eel:${n}` };
      }
      sg.position.set(home.x, home.y + 3, home.z + i * EEL.spacing);
      scene.add(sg);
      segs.push(sg);
    }
    world.scannables.push(segs[0]);
    return {
      home: new THREE.Vector3(home.x, home.y + 3, home.z), segs, mat, health: EEL.health, alive: true,
      mode: 'idle', modeT: 0, vel: new THREE.Vector3(), phase: n * 1.7, back: 0, flash: 0, dying: 0,
      electric, zapNext: EEL.zapEvery[0], charging: 0, ring: null, ringR: 0, ringHit: false,
    };
  });

  function hurtEel(e, t) {
    // Skills: Barbed tips (damage) and Weak spots (double-damage chance).
    e.health -= SPEAR.damage * (1 + perk('damage')) * (Math.random() < perk('crit') ? 2 : 1);
    e.flash = 0.25;
    e.vel.addScaledVector(shot.vel.clone().normalize(), 4); // knocked back
    g.onHit();
    if (e.health <= 0) {
      e.alive = false; e.dying = 1.6; e.back = t + EEL.respawn;
      g.onEelKilled(e.segs[0].position.clone());
    } else { e.mode = 'retreat'; e.modeT = 1.2; }
  }

  // An electric eel hunting you charges up (flickering blue), then discharges a ring.
  function zap(e, dt, dist, exposed) {
    const head = e.segs[0];
    if (e.ring) {
      e.ringR += EEL.zapSpeed * dt;
      e.ring.position.copy(head.position);
      e.ring.scale.setScalar(Math.max(0.01, e.ringR));
      e.ring.material.opacity = 0.8 * (1 - e.ringR / EEL.zap);
      e.ring.rotation.y += dt * 4;
      // The ring passes you: shocked, unless you got out of its reach (or onto a raft).
      if (!e.ringHit && exposed && Math.abs(e.ringR - head.position.distanceTo(camera.position)) < 0.9) { e.ringHit = true; g.onEelZap(); }
      if (e.ringR >= EEL.zap) { scene.remove(e.ring); e.ring.material.dispose(); e.ring = null; }
      return;
    }
    if (e.charging > 0) {
      e.charging -= dt;
      e.mat.emissive.setHex(Math.random() < 0.5 ? 0x9fe8ff : 0x1a0820);
      if (e.charging <= 0) {
        e.ring = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), ZAP_MAT.clone());
        e.ringR = 0.2; e.ringHit = false;
        scene.add(e.ring);
        e.mat.emissive.setHex(0x1a0820);
      }
      return;
    }
    e.zapNext -= dt;
    if (exposed && (e.mode === 'chase' || e.mode === 'lunge') && dist < EEL.zapRange && e.zapNext <= 0) {
      e.charging = EEL.zapCharge;
      e.zapNext = EEL.zapEvery[0] + Math.random() * (EEL.zapEvery[1] - EEL.zapEvery[0]);
      g.onEelCharge();
    }
  }

  let nightSight = 1; // eels see half as far again at night
  const want = new THREE.Vector3(), toPlayer = new THREE.Vector3();
  function updateEels(dt, t, playerExposed) {
    const p = camera.position;
    for (const e of eels) {
      const head = e.segs[0];
      if (!e.alive) {
        if (e.dying > 0) {
          // Sinks, and the blight's glow goes out.
          e.dying -= dt;
          for (const sg of e.segs) { sg.position.y -= dt * 0.8; sg.scale.multiplyScalar(1 - dt * 0.4); }
          if (e.dying <= 0) e.segs.forEach((sg) => { sg.visible = false; });
        } else if (t >= e.back) {
          e.alive = true; e.health = EEL.health; e.mode = 'idle';
          e.segs.forEach((sg, i) => {
            sg.visible = true;
            const r = i === 0 ? 0.24 : 0.2 * (1 - i / EEL.segments) + 0.05;
            sg.scale.set(r, r * 0.85, i === 0 ? r * 1.9 : r * 2.4); // stretched so segments overlap into one body
            sg.position.copy(e.home).z += i * EEL.spacing;
          });
        }
        continue;
      }
      toPlayer.subVectors(p, head.position);
      const dist = toPlayer.length(), fromHome = head.position.distanceTo(e.home);
      e.modeT -= dt;
      if (e.mode === 'idle' && playerExposed && dist < EEL.sight * nightSight) { e.mode = 'chase'; g.onSpot(); }
      if ((e.mode === 'chase' || e.mode === 'lunge') && (!playerExposed || fromHome > EEL.leash)) e.mode = 'home';
      if (e.mode === 'chase' && dist < EEL.lungeRange) { e.mode = 'lunge'; e.modeT = 0.5; }
      if (e.mode === 'lunge' && dist < EEL.biteRange) { g.onBite(EEL.bite); e.mode = 'retreat'; e.modeT = EEL.retreat; }
      if (e.mode === 'lunge' && e.modeT <= 0) e.mode = 'chase';
      if (e.mode === 'retreat' && e.modeT <= 0) e.mode = playerExposed && dist < EEL.sight ? 'chase' : 'home';
      if (e.mode === 'home' && fromHome < 3) e.mode = 'idle';

      let speed = EEL.idle;
      if (e.mode === 'idle') {
        want.set(Math.cos(t * 0.5 + e.phase) * 5, Math.sin(t * 0.9 + e.phase) * 1.2, Math.sin(t * 0.5 + e.phase) * 5).add(e.home).sub(head.position);
      } else if (e.mode === 'chase') { want.copy(toPlayer); speed = EEL.chase; }
      else if (e.mode === 'lunge') { want.copy(toPlayer); speed = EEL.lunge; }
      else if (e.mode === 'retreat') { want.copy(toPlayer).negate(); speed = EEL.chase * 0.8; }
      else { want.subVectors(e.home, head.position); speed = EEL.chase; }
      // Slither: a side-to-side wave on top of where it wants to go.
      want.normalize().multiplyScalar(speed);
      want.x += Math.sin(t * 6 + e.phase) * speed * 0.25;
      e.vel.lerp(want, Math.min(1, dt * 3));
      head.position.addScaledVector(e.vel, dt);
      head.position.y = THREE.MathUtils.clamp(head.position.y, floorY(head.position.x, head.position.z) + 0.6, SURFACE_Y - 1.5);
      head.lookAt(vA.copy(head.position).add(e.vel));
      // The body follows the head, each segment trailing the one before it.
      for (let i = 1; i < e.segs.length; i++) {
        const prev = e.segs[i - 1].position, sg = e.segs[i];
        vA.subVectors(sg.position, prev);
        if (vA.lengthSq() > EEL.spacing * EEL.spacing) sg.position.copy(prev).add(vA.setLength(EEL.spacing));
        sg.lookAt(prev);
      }
      e.flash -= dt;
      e.mat.emissive.setHex(e.flash > 0 ? 0xff3050 : 0x1a0820);
      if (e.electric) zap(e, dt, dist, playerExposed);
    }
  }

  return {
    get equipped() { return equipped; },
    get loaded() { return !shot; },
    get eels() { return eels; }, // for debugging and tests
    setNight(n) { nightSight = 1 + n * 0.5; },
    /** Where the living eels are (for the threat sensor on the compass). */
    eelPositions: () => eels.filter((e) => e.alive).map((e) => e.segs[0].getWorldPosition(new THREE.Vector3())),
    setEquipped(v) { equipped = v; gun.visible = v; },
    fire,
    // playerExposed: underwater and swimming (eels won't follow you up or onto a raft).
    update(dt, t, playerExposed, playerSpeed) {
      updateShot(dt, t);
      updateEels(dt, t, playerExposed);
      // Held-harpoon sway and recoil.
      bobT += dt * (1 + playerSpeed * 0.5);
      recoil = Math.max(0, recoil - dt * 5);
      gun.position.set(REST.x + Math.sin(bobT * 1.1) * 0.004, REST.y + Math.sin(bobT * 2.2) * 0.004, REST.z + recoil * 0.05);
      gun.rotation.x = recoil * 0.25;
    },
    // Nearest living eel within range that's hunting you, for Echo and the HUD.
    huntedBy() { return eels.some((e) => e.alive && (e.mode === 'chase' || e.mode === 'lunge')); },
  };
}
