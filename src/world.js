import * as THREE from 'three';
import { perk } from './progress.js';

// ---- The Shallows: tune here --------------------------------------------------
// The water level. SEA_LEVEL is mean sea level (the seabed is shaped around it); SURFACE_Y is
// where the water actually is right now: the tide moves it (setWaterLevel). Modules import
// SURFACE_Y as a live binding, so they always read the current level.
export const SEA_LEVEL = 26;
export let SURFACE_Y = SEA_LEVEL;
export function setWaterLevel(tide) { SURFACE_Y = SEA_LEVEL + tide; }
export const WORLD_RADIUS = 420;   // the atoll's walls rise past this (it was 105)
export const REEF_RADIUS = 70;     // the familiar reef round Echo; procedural seabed beyond
const FOG = 0x0a3a46;
const SKY_FOG = 0x1a2c52;          // night air above the water
const TINTS = { cyan: 0x5cf2d6, pink: 0xff8fd0, gold: 0xffc46b, violet: 0x8f7bff };
const POLYP_COUNT = 260;
const POLYP_RESPAWN = 25;           // seconds before a gathered polyp glows again
const BRIGHT_POLYP_CHANCE = 0.12;   // golden polyps are worth 5 Lumen
const KELP_REGROW = 90;             // seconds for a harvested strand to grow back
const FISH_COUNT = 56;
const CORAL_COUNT = 420, ROCK_COUNT = 360, KELP_PATCHES = 95, JELLY_COUNT = 33;
const FISH_RESPAWN = 60;
const FISH_SKITTISH = { range: 4.5, speed: 2.5 }; // swim closer than this, faster than this, and they bolt
const CATCH_REACH = 2.6;

// Everything the Echo Lens can study; each root carries userData.scan = { species, id }.
const scannables = [];
// Centres of the kelp patches (eels make their homes in them).
const kelpPatches = [];

// Seeded RNG and noise: each save has its own world seed (setWorldSeed, before buildWorld),
// and the same seed always builds the same world.
let seed = 7, noiseSeed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
export function setWorldSeed(s) {
  noiseSeed = (Math.abs(Math.floor(s)) % 2147483646) + 1;
  seed = noiseSeed;
}
export const worldSeed = () => noiseSeed;

// Smooth 2D value noise (-1..1) from the seed, and a few octaves of it.
function hash(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(noiseSeed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}
export function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => noise(x, z) * 0.55 + noise(x * 2.1 + 7, z * 2.1 - 3) * 0.28 + noise(x * 4.3 - 11, z * 4.3 + 5) * 0.17;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const range = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[(rand() * arr.length) | 0];

// Seafloor height. Round Echo, the familiar reef: gentle dunes. Beyond it the seabed is
// generated from the world seed: rolling plains, shallow banks that rise close to the surface,
// and long trenches that drop far below the safe depth. At the edge of the atoll the floor
// rises into walls that break the surface as a ring of sandy islands.
export const DEEPEST = -34; // floor height of the deepest trench (60 m down)
export function floorY(x, z) {
  const r = Math.hypot(x, z);
  const reef = 1.6 * Math.sin(x * 0.05) * Math.cos(z * 0.04)
    + 0.8 * Math.sin(x * 0.13 + z * 0.07)
    + 0.35 * Math.sin(x * 0.31 - z * 0.27);
  let open = fbm(x / 150, z / 150) * 10 - 5
    + 0.9 * Math.sin(x * 0.07 + z * 0.05) * Math.cos(z * 0.06)
    + 0.4 * Math.sin(x * 0.19 - z * 0.23);
  // Trenches follow the ridge lines of a second noise field; banks rise where a third peaks.
  const ridge = 1 - Math.abs(noise(x / 240 + 40, z / 240 - 25));
  open -= smooth(0.8, 0.96, ridge) * 28;
  open += smooth(0.45, 0.8, noise(x / 95 + 17, z / 95 + 61)) * 20;
  const blend = smooth(REEF_RADIUS - 15, REEF_RADIUS + 45, r);
  // The highest banks reach a metre below mean sea level, so a low tide uncovers them as islands.
  const y = Math.min(SEA_LEVEL - 1, Math.max(DEEPEST, reef * (1 - blend) + open * blend));
  // The atoll's wall: whatever the seabed does near the edge, it rises out of the water.
  const wall = smooth(WORLD_RADIUS - 45, WORLD_RADIUS - 8, r);
  return y + (SEA_LEVEL + 4 - y) * wall;
}

// Scatter helper: a point uniformly over a ring of the world, retried until accept(x, z, y).
function scatter(rMin, rMax, accept = () => true, tries = 30) {
  let x = 0, z = 0;
  for (let k = 0; k < tries; k++) {
    const a = range(0, Math.PI * 2), r = Math.sqrt(range(rMin * rMin, rMax * rMax));
    x = Math.cos(a) * r; z = Math.sin(a) * r;
    if (accept(x, z, floorY(x, z))) break;
  }
  return [x, z];
}
const LIVE = WORLD_RADIUS - 55; // where life thins out before the atoll's walls

export function buildWorld(scene) {
  const time = { value: 0 };
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.FogExp2(FOG, 0.03);

  const hemi = new THREE.HemisphereLight(0x7ff7e6, 0x03111a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xcffaff, 1.4);
  sun.position.set(20, 60, 10);
  scene.add(sun);

  addFloor(scene);
  const surface = addSurface(scene, time);
  const rays = addRays(scene, time);
  addRocks(scene);
  addCoral(scene);
  const kelp = addKelp(scene, time);
  const snow = addSnow(scene);
  const school = addSchool(scene);
  const jellies = addJellies(scene);
  const polyps = addPolyps(scene);
  const echo = addEcho(scene);
  const sky = addSky(scene);
  const fish = addSilverfin(scene);
  const satchel = addSatchel(scene);
  const bursts = [];
  const waterFog = new THREE.Color(FOG), airFog = new THREE.Color(SKY_FOG);

  // How brightly the reef glows: rises as you gather Lumen. 0..1
  let bloom = 0;
  // Stirred-up silt clouding the water (0 clear .. 1 you can barely see). See main.js.
  let silt = 0;
  // Night (0 day .. 1 night): the light drops and the water goes near black.
  let night = 0, sonar = 0; // a sonar ping thins the fog for a moment
  let storm = 0, flash = 0;  // storm strength, and a lightning flash fading out
  const rain = addRain(scene), bolts = [];
  const nightWater = new THREE.Color(0x02090d), nightAir = new THREE.Color(0x04060f);
  const siltFog = new THREE.Color(0x3b3a2a);

  return {
    echo,
    jellies: jellies.list,
    scannables,
    kelpPatches,
    kelpMesh: kelp.mesh,
    setBloom(v) { bloom = v; },
    setSilt(v) { silt = v; },
    setNight(v) { night = v; },
    setSonar(v) { sonar = v; },
    setStorm(v) { storm = v; },
    /** A lightning strike down to the water at (x, z): a bolt and a flash. */
    strike(x, z) {
      const pts = [];
      let px = x + (Math.random() - 0.5) * 20, pz = z + (Math.random() - 0.5) * 20;
      for (let y = SURFACE_Y + 90; y > SURFACE_Y; y -= 6) {
        pts.push(new THREE.Vector3(px, y, pz));
        px += (x - px) * 0.25 + (Math.random() - 0.5) * 4; pz += (z - pz) * 0.25 + (Math.random() - 0.5) * 4;
      }
      pts.push(new THREE.Vector3(x, SURFACE_Y, z));
      const bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf2fbff, fog: false }));
      scene.add(bolt);
      bolts.push({ bolt, life: 0.25 });
      flash = 1;
    },
    update(dt, t, camera, playerSpeed = 0) {
      time.value = t;
      hemi.intensity = (0.9 + bloom * 0.7) * (1 - night * 0.72) * (1 - storm * 0.35) + flash * 4;
      sun.intensity = 1.4 * (1 - night * 0.9) * (1 - storm * 0.6);
      flash = Math.max(0, flash - dt * 4);
      for (let i = bolts.length - 1; i >= 0; i--) if ((bolts[i].life -= dt) <= 0) { scene.remove(bolts[i].bolt); bolts.splice(i, 1); }
      // The water moves with the tide.
      surface.under.position.y = surface.top.position.y = SURFACE_Y;
      rays.position.y = SURFACE_Y - SEA_LEVEL;
      // Above the water it's a clear night over the atoll; below, the glowing murk.
      const above = camera.position.y > SURFACE_Y;
      scene.fog.color.copy(above ? airFog : waterFog).lerp(above ? nightAir : nightWater, night * 0.8);
      scene.background.copy(scene.fog.color);
      scene.fog.density = (above ? 0.009 + storm * 0.016 : 0.03 - bloom * 0.008 + silt * 0.16 + storm * 0.004) * (1 - sonar * 0.6);
      rain.update(dt, camera, above && storm > 0.15, storm);
      if (!above && silt > 0) { scene.fog.color.lerp(siltFog, silt * 0.75); scene.background.copy(scene.fog.color); }
      sky.visible = above;
      rays.visible = !above && night < 0.6 && storm < 0.6;
      surface.under.visible = !above;
      snow.points.visible = !above;
      snow.update(dt, camera);
      sky.position.set(camera.position.x, 0, camera.position.z);
      rays.position.set(camera.position.x, 0, camera.position.z);
      school.update(dt, t);
      jellies.update(t);
      echo.update(t);
      fish.update(dt, t, camera.position, playerSpeed);
      kelp.update(t);
      satchel.update(t);
      for (let i = bursts.length - 1; i >= 0; i--) if (!bursts[i].update(dt)) bursts.splice(i, 1);
    },
    // Grab a silverfin right in front of you. Returns true if you caught one.
    catchFish(camera, t) { return fish.catchAt(camera, t); },
    // A harpoon moving from a to b: returns true if it skewered a silverfin on the way.
    spearFish(a, b, t) { return fish.spear(a, b, t); },
    // Strip a kelp strand (by instance index). Returns true if it had grown back.
    harvestKelp(index, t) { return kelp.harvest(index, t); },
    placeSatchel(pos) { satchel.place(pos); },
    clearSatchel() { satchel.clear(); },
    satchelNear(pos) { return satchel.near(pos); },
    // Swimming through a glowing polyp gathers it: onGather(lumen, bright).
    gather(pos, t, onGather) {
      for (const p of polyps) {
        if (!p.visible) {
          if (t >= p.userData.back) {
            // Polyps regrow golden at random (more often with the Gold rush skill).
            p.userData.bright = Math.random() < BRIGHT_POLYP_CHANCE + perk('gold');
            p.userData.bulb.material = p.userData.glow[p.userData.bright ? 'gold' : 'cyan'];
            p.visible = true;
          }
          continue;
        }
        const glow = p.userData.bulb;
        glow.scale.setScalar(1 + Math.sin(t * 3 + p.userData.phase) * 0.12);
        if (glow.getWorldPosition(_v).distanceTo(pos) < 1.7 * (1 + perk('magnet'))) { // Lumen magnet
          p.visible = false;
          p.userData.back = t + POLYP_RESPAWN * Math.max(0.3, 1 - perk('polypRegrow')); // Gentle hands
          bursts.push(makeBurst(scene, _v.clone(), p.userData.bright ? TINTS.gold : TINTS.cyan));
          onGather(p.userData.bright ? 5 : 1, p.userData.bright);
        }
      }
    },
  };
}
const _v = new THREE.Vector3();

// Distance from point p to the segment a-b.
const _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
export function segDist(p, a, b) {
  _ab.subVectors(b, a); _ap.subVectors(p, a);
  const len = _ab.lengthSq(), k = len ? THREE.MathUtils.clamp(_ap.dot(_ab) / len, 0, 1) : 0;
  return _ap.sub(_ab.multiplyScalar(k)).length();
}

function addFloor(scene) {
  const size = WORLD_RADIUS * 2 + 40, segs = 400;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = [];
  const sand = new THREE.Color(0x2f6a68), dark = new THREE.Color(0x0e2f36), dry = new THREE.Color(0x8c7f63), abyss = new THREE.Color(0x030b10), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = floorY(x, z);
    pos.setY(i, y);
    const n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2);
    c.copy(sand).lerp(dark, Math.min(1, n * 0.6 + Math.max(0, y - 2) * 0.05));
    if (y < -4) c.lerp(abyss, Math.min(1, (-4 - y) / 24)); // trenches fade to black
    if (y > SURFACE_Y - 1.5) c.copy(dry).lerp(dark, n * 0.25); // dry island sand
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
}

// Rain: streaks falling round the camera when you're above the water in a storm.
function addRain(scene) {
  const N = 600, pos = new Float32Array(N * 6), seeds = Array.from({ length: N }, () => [Math.random(), Math.random(), Math.random()]);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xa9c4d8, transparent: true, opacity: 0.5, fog: false }));
  lines.frustumCulled = false; lines.visible = false;
  scene.add(lines);
  let t = 0;
  return {
    update(dt, camera, on, strength) {
      lines.visible = on;
      if (!on) return;
      t += dt;
      const c = camera.position;
      for (let i = 0; i < N; i++) {
        const [a, b, k] = seeds[i];
        const x = c.x + (a - 0.5) * 50, z = c.z + (b - 0.5) * 50, y = SURFACE_Y + ((k * 30 - t * 22) % 30 + 30) % 30;
        pos.set([x, y, z, x + 0.3, y - 1.1, z + 0.2], i * 6);
      }
      geo.attributes.position.needsUpdate = true;
      lines.material.opacity = 0.2 + strength * 0.45;
    },
  };
}

// A soft blotchy texture, used for the shimmering surface overhead and the light shafts.
function blotchTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const x = range(0, 256), y = range(0, 256), r = range(10, 40);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { g.save(); g.translate(dx, dy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Two one-sided sheets at the waterline: the bright shimmer you see from below, and the
// dark night water you see from above (with the reef's glow faintly showing through).
function addSurface(scene, time) {
  const tex = blotchTexture(); tex.repeat.set(54, 54);
  const geo = new THREE.PlaneGeometry(WORLD_RADIUS * 2.6, WORLD_RADIUS * 2.6);
  const under = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xa8fff4, map: tex, transparent: true, opacity: 0.7, depthWrite: false }));
  under.rotation.x = Math.PI / 2;
  under.position.y = SURFACE_Y;
  under.onBeforeRender = () => { tex.offset.set(time.value * 0.01, time.value * 0.006); };
  scene.add(under);
  const topTex = tex.clone(); topTex.repeat.set(90, 90);
  const top = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0x05202a, emissive: 0x1d7f80, emissiveMap: topTex, emissiveIntensity: 0.5,
    roughness: 0.6, metalness: 0, transparent: true, opacity: 0.92, depthWrite: false,
  }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = SURFACE_Y;
  top.onBeforeRender = () => { topTex.offset.set(-time.value * 0.008, time.value * 0.011); };
  scene.add(top);
  return { under, top };
}

function addRays(scene, time) {
  // Vertical gradient so each shaft fades out before it reaches the floor.
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 128;
  const g = cv.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
  const fade = new THREE.CanvasTexture(cv);
  const mat = new THREE.MeshBasicMaterial({ color: 0x9ffcef, map: fade, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const geo = new THREE.CylinderGeometry(1.5, 5, 34, 20, 1, true);
  geo.translate(0, -17, 0);
  const group = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const ray = new THREE.Mesh(geo, mat);
    const a = range(0, Math.PI * 2), r = range(6, 70);
    ray.position.set(Math.cos(a) * r, SURFACE_Y, Math.sin(a) * r);
    ray.rotation.z = range(-0.25, 0.25);
    const phase = range(0, 6);
    ray.onBeforeRender = () => { ray.rotation.x = Math.sin(time.value * 0.2 + phase) * 0.08; };
    group.add(ray);
  }
  scene.add(group);
  return group;
}

function addRocks(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x1b3a40, roughness: 0.95, flatShading: true });
  for (let i = 0; i < ROCK_COUNT; i++) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    for (let j = 0; j < p.count; j++) p.setXYZ(j, p.getX(j) * range(0.75, 1.25), p.getY(j) * range(0.75, 1.25), p.getZ(j) * range(0.75, 1.25));
    geo.computeVertexNormals();
    const rock = new THREE.Mesh(geo, mat);
    const [x, z] = i < 55 ? scatter(8, 80) : scatter(80, LIVE);
    const s = range(0.8, i < 55 ? 3.6 : 5);
    rock.scale.set(s * range(1, 1.8), s * range(0.5, 1), s);
    rock.position.set(x, floorY(x, z) + s * 0.2, z);
    rock.rotation.set(range(0, 3), range(0, 3), range(0, 3));
    scene.add(rock);
  }
}

const coralMats = {};
function coralMat(tint) {
  return coralMats[tint] ??= {
    body: new THREE.MeshStandardMaterial({ color: new THREE.Color(tint).multiplyScalar(0.35), emissive: tint, emissiveIntensity: 0.25, roughness: 0.7 }),
    tip: new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 2.2 }),
  };
}

function addCoral(scene) {
  const branch = new THREE.CylinderGeometry(0.06, 0.14, 1, 6); branch.translate(0, 0.5, 0);
  const tip = new THREE.SphereGeometry(0.11, 8, 6);
  const brain = new THREE.SphereGeometry(1, 18, 12);
  for (let i = 0; i < CORAL_COUNT; i++) {
    // Coral likes the reef and the shallow banks; it's sparse in deep water.
    const [x, z] = i < 70 ? scatter(4, 75) : scatter(75, LIVE, (_x, _z, y) => y > -2 || rand() < 0.15);
    const tint = pick(Object.values(TINTS)), m = coralMat(tint);
    const cluster = new THREE.Group();
    cluster.position.set(x, floorY(x, z) - 0.1, z);
    const isBrain = rand() < 0.3;
    if (isBrain) {
      const b = new THREE.Mesh(brain, m.body);
      b.scale.set(range(0.6, 1.4), range(0.4, 0.7), range(0.6, 1.4));
      cluster.add(b);
    } else {
      const n = 5 + (rand() * 6) | 0;
      for (let k = 0; k < n; k++) {
        const len = range(0.8, 2.6);
        const stem = new THREE.Mesh(branch, m.body);
        stem.scale.set(1, len, 1);
        stem.rotation.set(range(-0.6, 0.6), range(0, 6.3), range(-0.6, 0.6));
        stem.position.set(range(-0.4, 0.4), 0, range(-0.4, 0.4));
        const bud = new THREE.Mesh(tip, m.tip);
        bud.position.y = 1;
        bud.scale.set(1, 1 / len, 1);
        stem.add(bud);
        cluster.add(stem);
      }
    }
    cluster.scale.setScalar(range(0.7, 1.6));
    cluster.userData.scan = { species: isBrain ? 'brain' : 'branch', id: `coral:${i}` };
    scannables.push(cluster);
    scene.add(cluster);
  }
}

function addKelp(scene, time) {
  const H = 9;
  const geo = new THREE.PlaneGeometry(0.7, H, 1, 18); geo.translate(0, H / 2, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f8a5e, emissive: 0x0f3d2a, roughness: 0.8, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float h = position.y / ${H.toFixed(1)};
      float ph = instanceMatrix[3].x * 0.3 + instanceMatrix[3].z * 0.2;
      transformed.x += sin(uTime * 1.1 + ph + position.y * 0.35) * 0.7 * h * h;
      transformed.z += cos(uTime * 0.8 + ph + position.y * 0.3) * 0.5 * h * h;`);
  };
  const count = KELP_PATCHES * 16, kelp = new THREE.InstancedMesh(geo, mat, count), m = new THREE.Matrix4();
  const q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let i = 0;
  // Kelp grows in patches.
  for (let patch = 0; patch < KELP_PATCHES && i < count; patch++) {
    // Kelp forests: middling depths, never in the trenches.
    const [cx, cz] = patch < 18 ? scatter(15, 78) : scatter(78, LIVE, (_x, _z, y) => y > -10 && y < 14);
    kelpPatches.push(new THREE.Vector3(cx, floorY(cx, cz), cz));
    for (let k = 0; k < 15 && i < count; k++, i++) {
      const x = cx + range(-5, 5), z = cz + range(-5, 5);
      p.set(x, floorY(x, z) - 0.2, z);
      q.setFromEuler(e.set(0, range(0, Math.PI), 0));
      const h = range(0.6, 1.9);
      s.set(range(0.8, 1.3), h, 1);
      kelp.setMatrixAt(i, m.compose(p, q, s));
    }
  }
  kelp.count = i;
  kelp.userData.scan = { species: 'kelp', instanced: true };
  scannables.push(kelp);
  scene.add(kelp);

  // Harvested strands shrink to a stub and grow back.
  const full = Array.from({ length: i }, (_, k) => { const fm = new THREE.Matrix4(); kelp.getMatrixAt(k, fm); return fm; });
  const regrowAt = new Float32Array(i);
  return {
    mesh: kelp,
    harvest(k, t) {
      if (k == null || k >= i || regrowAt[k] > t) return false;
      regrowAt[k] = t + KELP_REGROW * Math.max(0.3, 1 - perk('kelpRegrow')); // Fertile beds
      full[k].decompose(p, q, s);
      s.y *= 0.12;
      kelp.setMatrixAt(k, m.compose(p, q, s));
      kelp.instanceMatrix.needsUpdate = true;
      return true;
    },
    update(t) {
      for (let k = 0; k < i; k++) {
        if (!regrowAt[k] || regrowAt[k] > t) continue;
        regrowAt[k] = 0;
        kelp.setMatrixAt(k, full[k]);
        kelp.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

function addSnow(scene) {
  const N = 2600, BOX = 50, pos = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) pos[i] = range(-BOX / 2, BOX / 2);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd8fff7, size: 0.07, transparent: true, opacity: 0.65, depthWrite: false }));
  pts.frustumCulled = false;
  scene.add(pts);
  return {
    points: pts,
    update(dt, camera) {
      // Drift down slowly; wrap around the camera so the water always looks full.
      const c = camera.position;
      for (let i = 0; i < N; i++) {
        let y = pos[i * 3 + 1] - dt * 0.15;
        pos[i * 3] = wrap(pos[i * 3] + Math.sin(y + i) * dt * 0.05, c.x, BOX);
        pos[i * 3 + 1] = wrap(y, c.y, BOX);
        pos[i * 3 + 2] = wrap(pos[i * 3 + 2], c.z, BOX);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
const wrap = (v, centre, box) => centre + ((((v - centre + box / 2) % box) + box) % box) - box / 2;

// A school of lantern fish following a slow looping path around the reef.
function addSchool(scene) {
  const N = 48;
  const geo = new THREE.ConeGeometry(0.13, 0.55, 6); geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b4a20, emissive: TINTS.gold, emissiveIntensity: 1.3 });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false;
  mesh.userData.scan = { species: 'lanternfish', id: 'school' };
  scannables.push(mesh);
  scene.add(mesh);
  const fish = Array.from({ length: N }, () => ({
    p: new THREE.Vector3(range(-3, 3), 6 + range(-1, 1), range(-3, 3)),
    v: new THREE.Vector3(),
    off: new THREE.Vector3(range(-2.5, 2.5), range(-1.2, 1.2), range(-2.5, 2.5)),
  }));
  const target = new THREE.Vector3(), want = new THREE.Vector3(), d = new THREE.Object3D();
  return {
    update(dt, t) {
      target.set(Math.sin(t * 0.07) * 32, 7 + Math.sin(t * 0.21) * 2.5, Math.sin(t * 0.11) * 26);
      fish.forEach((f, i) => {
        want.copy(target).add(f.off).sub(f.p);
        f.v.lerp(want.clampLength(0, 4.5), Math.min(1, dt * 1.6));
        f.p.addScaledVector(f.v, dt);
        d.position.copy(f.p);
        d.lookAt(want.copy(f.p).add(f.v));
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null; // the school moves; let raycasts recompute its bounds
    },
  };
}

function addJellies(scene) {
  const bellGeo = new THREE.SphereGeometry(0.8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const bellMat = new THREE.MeshStandardMaterial({ color: TINTS.pink, emissive: TINTS.pink, emissiveIntensity: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const tentMat = new THREE.LineBasicMaterial({ color: TINTS.pink, transparent: true, opacity: 0.5 });
  const jellies = [];
  for (let i = 0; i < JELLY_COUNT; i++) {
    const j = new THREE.Group();
    j.add(new THREE.Mesh(bellGeo, bellMat));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2, pts = [];
      for (let s = 0; s <= 8; s++) pts.push(new THREE.Vector3(Math.cos(a) * 0.5, -s * 0.35, Math.sin(a) * 0.5 + Math.sin(s) * 0.1));
      j.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), tentMat));
    }
    const [jx, jz] = i < 9 ? scatter(10, 55) : scatter(55, LIVE);
    j.userData = { x: jx, z: jz, y: Math.min(SURFACE_Y - 3, floorY(jx, jz) + range(6, 14)), phase: range(0, 6) };
    j.userData.scan = { species: 'jelly', id: `jelly:${i}` };
    scannables.push(j);
    scene.add(j);
    jellies.push(j);
  }
  return {
    list: jellies,
    update(t) {
      for (const j of jellies) {
        const u = j.userData, pulse = Math.sin(t * 1.4 + u.phase);
        j.position.set(u.x + Math.sin(t * 0.05 + u.phase) * 4, u.y + Math.sin(t * 0.7 + u.phase) * 1.2, u.z);
        j.scale.set(1 + pulse * 0.1, 1 - pulse * 0.12, 1 + pulse * 0.1);
      }
    },
  };
}

function addPolyps(scene) {
  const stalkGeo = new THREE.CylinderGeometry(0.05, 0.09, 0.7, 6); stalkGeo.translate(0, 0.35, 0);
  const bulbGeo = new THREE.SphereGeometry(0.26, 14, 10);
  const stalkMat = new THREE.MeshStandardMaterial({ color: 0x1d5b55, roughness: 0.8 });
  const glow = {
    cyan: new THREE.MeshStandardMaterial({ color: TINTS.cyan, emissive: TINTS.cyan, emissiveIntensity: 3 }),
    gold: new THREE.MeshStandardMaterial({ color: TINTS.gold, emissive: TINTS.gold, emissiveIntensity: 3.4 }),
  };
  const polyps = [];
  for (let i = 0; i < POLYP_COUNT; i++) {
    const bright = rand() < BRIGHT_POLYP_CHANCE;
    // Most polyps grow on the reef; the rest are scattered across the seabed to find.
    const [x, z] = i < 46 ? scatter(5, 72) : scatter(72, LIVE, (_x, _z, y) => y > -14);
    const p = new THREE.Group();
    p.position.set(x, floorY(x, z) - 0.05, z);
    p.add(new THREE.Mesh(stalkGeo, stalkMat));
    const bulb = new THREE.Mesh(bulbGeo, bright ? glow.gold : glow.cyan);
    bulb.position.y = 0.8;
    p.add(bulb);
    p.userData = { bulb, bright, glow, phase: range(0, 6), back: 0 };
    p.userData.scan = { species: 'polyp', id: `polyp:${i}` };
    scannables.push(p);
    scene.add(p);
    polyps.push(p);
  }
  return polyps;
}

// Echo, the oldest pearl, rests on a rock in the middle of the reef.
function addEcho(scene) {
  const g = new THREE.Group();
  const y = floorY(0, 0);
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 1.6, 9), new THREE.MeshStandardMaterial({ color: 0x1b3a40, roughness: 1, flatShading: true }));
  rock.position.y = y + 0.6;
  g.add(rock);
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x3a6f78, emissive: 0x5cf2d6, emissiveIntensity: 0.15, side: THREE.DoubleSide });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shellMat);
  shell.scale.set(1, 0.45, 1);
  shell.position.y = y + 1.45;
  g.add(shell);
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 20), new THREE.MeshStandardMaterial({ color: 0xf4eee6, emissive: 0xf4eee6, emissiveIntensity: 1.6, roughness: 0.2 }));
  g.add(pearl);
  pearl.userData.scan = { species: 'echo', id: 'echo' };
  scannables.push(pearl);
  const light = new THREE.PointLight(0xf4eee6, 30, 18, 1.6);
  g.add(light);
  scene.add(g);
  const base = y + 1.9;
  return {
    position: new THREE.Vector3(0, base, 0),
    /** Grows the pearl and its rock (Echo's pearl upgrades). */
    setSize(f) { g.scale.setScalar(f); },
    update(t) {
      pearl.position.y = base + Math.sin(t * 1.2) * 0.12;
      light.position.copy(pearl.position);
      light.intensity = 26 + Math.sin(t * 2) * 6;
    },
  };
}

// Night sky over the atoll: a gradient dome, stars and a low moon. Only shown above water.
function addSky(scene) {
  const sky = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x050a1c) }, horizon: { value: new THREE.Color(SKY_FOG) } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main() { gl_FragColor = vec4(mix(horizon, top, pow(max(vDir.y, 0.0), 0.5)), 1.0); }',
  }));
  sky.add(dome);
  const N = 1400, pos = new Float32Array(N * 3), v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    v.set(range(-1, 1), range(0.05, 1), range(-1, 1)).normalize().multiplyScalar(300);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sky.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xeaf6ff, size: 1.3, sizeAttenuation: false, fog: false, depthWrite: false })));
  const moon = new THREE.Mesh(new THREE.CircleGeometry(14, 40), new THREE.MeshBasicMaterial({ color: 0xf4eee6, fog: false }));
  moon.position.set(-160, 70, -220);
  moon.lookAt(0, 0, 0);
  sky.add(moon);
  sky.visible = false;
  scene.add(sky);
  return sky;
}

// Silverfin: small edible reef fish. They drift near home and bolt if you rush them,
// so you catch them by gliding in slowly and grabbing (left-click).
function addSilverfin(scene) {
  const body = new THREE.SphereGeometry(1, 12, 8);
  const tail = new THREE.ConeGeometry(0.1, 0.18, 4); tail.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xbcd8e0, emissive: 0x5cf2d6, emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.35 });
  const list = [];
  for (let i = 0; i < FISH_COUNT; i++) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(body, mat); b.scale.set(0.1, 0.14, 0.3);
    const t = new THREE.Mesh(tail, mat); t.position.z = -0.36;
    g.add(b, t);
    const [x, z] = i < 16 ? scatter(10, 65) : scatter(65, LIVE, (_x, _z, y) => y > -12);
    const home = new THREE.Vector3(x, floorY(x, z) + range(1.5, 4), z);
    g.position.copy(home);
    g.userData = { home, vel: new THREE.Vector3(), phase: range(0, 6), flee: 0, back: 0, tail: t };
    g.userData.scan = { species: 'silverfin', id: `silverfin:${i}` };
    scannables.push(g);
    scene.add(g);
    list.push(g);
  }
  const want = new THREE.Vector3(), away = new THREE.Vector3(), fwd = new THREE.Vector3();
  return {
    update(dt, t, playerPos, playerSpeed) {
      for (const f of list) {
        const u = f.userData;
        if (!f.visible) {
          if (t >= u.back) { f.visible = true; f.position.copy(u.home); }
          continue;
        }
        const d = f.position.distanceTo(playerPos);
        if (d < FISH_SKITTISH.range * Math.max(0.3, 1 - perk('calm')) && playerSpeed > FISH_SKITTISH.speed) u.flee = 1.5; // Calm presence
        if (u.flee > 0) {
          u.flee -= dt;
          away.subVectors(f.position, playerPos).normalize().multiplyScalar(6);
          u.vel.lerp(away, Math.min(1, dt * 4));
        } else {
          // Lazy loops around home.
          want.set(Math.cos(t * 0.4 + u.phase) * 3, Math.sin(t * 0.7 + u.phase) * 0.6, Math.sin(t * 0.4 + u.phase) * 3)
            .add(u.home).sub(f.position).clampLength(0, 1.2);
          u.vel.lerp(want, Math.min(1, dt * 1.5));
        }
        f.position.addScaledVector(u.vel, dt);
        const floor = floorY(f.position.x, f.position.z) + 0.6;
        if (f.position.y < floor) f.position.y = floor;
        if (f.position.y > SURFACE_Y - 1) f.position.y = SURFACE_Y - 1;
        if (u.vel.lengthSq() > 0.01) f.lookAt(want.copy(f.position).add(u.vel));
        u.tail.rotation.y = Math.sin(t * (u.flee > 0 ? 30 : 8) + u.phase) * 0.5;
      }
    },
    spear(a, b, t) {
      for (const f of list) {
        if (!f.visible || segDist(f.position, a, b) > 0.45) continue;
        f.visible = false;
        f.userData.back = t + FISH_RESPAWN;
        return true;
      }
      return false;
    },
    catchAt(camera, t) {
      camera.getWorldDirection(fwd);
      let best = null, bestD = CATCH_REACH;
      for (const f of list) {
        if (!f.visible) continue;
        const d = f.position.distanceTo(camera.position);
        if (d > bestD) continue;
        if (away.subVectors(f.position, camera.position).normalize().dot(fwd) < 0.8) continue;
        best = f; bestD = d;
      }
      if (!best) return false;
      best.visible = false;
      best.userData.back = t + FISH_RESPAWN;
      return true;
    },
  };
}

// The bag you drop when you black out: a glowing satchel resting where you fell.
function addSatchel(scene) {
  const g = new THREE.Group();
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), new THREE.MeshStandardMaterial({ color: 0x7a5a36, emissive: 0xffc46b, emissiveIntensity: 0.6, roughness: 0.8 }));
  bag.scale.set(1, 0.8, 1);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.04, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffc46b, fog: false }));
  ring.rotation.x = Math.PI / 2;
  g.add(bag, ring);
  g.visible = false;
  scene.add(g);
  return {
    place(pos) {
      g.position.copy(pos);
      g.position.y = Math.max(floorY(pos.x, pos.z) + 0.4, Math.min(pos.y, SURFACE_Y - 0.5));
      g.visible = true;
    },
    clear() { g.visible = false; },
    near(pos) { return g.visible && g.position.distanceTo(pos) < 1.8; },
    update(t) {
      if (!g.visible) return;
      ring.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
      bag.position.y = Math.sin(t * 1.5) * 0.08;
    },
  };
}

function makeBurst(scene, at, tint) {
  const N = 40, pos = new Float32Array(N * 3), vel = [];
  for (let i = 0; i < N; i++) {
    pos.set([at.x, at.y, at.z], i * 3);
    vel.push(new THREE.Vector3(range(-1, 1), range(-0.4, 1.4), range(-1, 1)).normalize().multiplyScalar(range(1.5, 4)));
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: tint, size: 0.16, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  let life = 0;
  return {
    update(dt) {
      life += dt;
      for (let i = 0; i < N; i++) {
        vel[i].multiplyScalar(1 - dt * 2.5);
        pos[i * 3] += vel[i].x * dt; pos[i * 3 + 1] += vel[i].y * dt; pos[i * 3 + 2] += vel[i].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = Math.max(0, 1 - life / 0.9);
      if (life < 0.9) return true;
      scene.remove(pts); geo.dispose(); mat.dispose();
      return false;
    },
  };
}
