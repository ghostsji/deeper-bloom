import * as THREE from 'three';
import { SURFACE_Y, floorY } from './world.js';

// ---- Building on the water: tune here -----------------------------------------
const CELL = 2;          // grid size in metres
const REACH = 9;         // how far away you can build
const BUILD_RADIUS = 92; // stay inside the atoll's lagoon
const DECK_TOP = 0.28;   // deck surface height above the waterline

// floor pieces float on open water (walkable ones are decks you can stand and build on);
// props stand on a deck. unlock: the research that makes the piece available.
export const PIECES = [
  { id: 'raft', name: 'Raft', cost: 3, floor: true, walkable: true },
  { id: 'station', name: 'Research station', cost: 10 },
  { id: 'fire', name: 'Cook fire', cost: 5 },
  { id: 'kelpfarm', name: 'Kelp farm', cost: 6 },
  { id: 'workbench', name: 'Workbench', cost: 8 },
  { id: 'lantern', name: 'Lantern', cost: 5 },
  { id: 'planter', name: 'Bloom planter', cost: 8 },
  { id: 'buoy', name: 'Glow buoy', cost: 4, floor: true, unlock: 'buoy' },
  { id: 'jellylamp', name: 'Jelly lamp', cost: 8, unlock: 'jellylamp' },
  { id: 'garden', name: 'Coral garden', cost: 15, unlock: 'garden' },
];
const byId = Object.fromEntries(PIECES.map((p) => [p.id, p]));

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
const glow = (color, emissiveIntensity) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity });
const wood = std(0x5c4630), darkWood = std(0x3b2c1e), pot = std(0x2a4a50, { roughness: 0.8 });
const lanternGlow = glow(0xffc46b, 3), bloomMat = glow(0xff8fd0, 2.2), lensMat = glow(0x5cf2d6, 2.5);
const jellyGlow = new THREE.MeshStandardMaterial({ color: 0xff8fd0, emissive: 0xff8fd0, emissiveIntensity: 1.8, transparent: true, opacity: 0.7 });
const coralTips = [glow(0x5cf2d6, 2.2), glow(0xff8fd0, 2.2), glow(0xffc46b, 2.2), glow(0x8f7bff, 2.2)];
const stone = std(0x55605f), emberMat = glow(0xff9a5c, 2.6), kelpMat = std(0x2f8a5e, { emissive: 0x0f3d2a, side: THREE.DoubleSide });
export const FARM_MAX = 3; // kelp a farm holds before you collect it
const plankGeo = new THREE.BoxGeometry(CELL * 0.98, 0.14, CELL / 5 - 0.05);
const beamGeo = new THREE.BoxGeometry(0.16, 0.18, CELL * 0.96);
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

function makeMesh(id) {
  const g = new THREE.Group();
  const D = DECK_TOP;
  if (id === 'raft') {
    for (let i = 0; i < 5; i++) g.add(mesh(plankGeo, wood, 0, D - 0.07, -CELL / 2 + CELL / 10 + (i * CELL) / 5));
    for (const x of [-0.7, 0.7]) g.add(mesh(beamGeo, darkWood, x, D - 0.22, 0));
  } else if (id === 'lantern') {
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 8), darkWood, 0, D + 0.8));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), darkWood, 0.2, D + 1.55));
    g.add(mesh(new THREE.SphereGeometry(0.16, 14, 10), lanternGlow, 0.42, D + 1.38));
  } else if (id === 'planter') {
    g.add(mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.45, 12), pot, 0, D + 0.22));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, len = 0.5 + (i % 3) * 0.2;
      const stem = mesh(new THREE.CylinderGeometry(0.03, 0.06, len, 6), bloomMat, Math.cos(a) * 0.18, D + 0.45 + len / 2, Math.sin(a) * 0.18);
      stem.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
      g.add(stem);
    }
  } else if (id === 'station') {
    // A desk with the Echo Lens mounted on a stand, under a little shell roof.
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.08, 0.8), wood, 0, D + 0.95, -0.3));
    for (const x of [-0.65, 0.65]) for (const z of [-0.6, 0]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), darkWood, x, D + 0.47, z));
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.4, 8), darkWood, 0.3, D + 1.19, -0.4));
    g.add(mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 24), darkWood, 0.3, D + 1.55, -0.4));
    g.add(mesh(new THREE.CircleGeometry(0.18, 24), lensMat, 0.3, D + 1.55, -0.38));
    g.add(mesh(new THREE.BoxGeometry(0.35, 0.05, 0.25), std(0xd9cfb8), -0.35, D + 1.02, -0.25)); // notes
    for (const x of [-0.85, 0.85]) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), darkWood, x, D + 1.1, -0.75));
    const roof = mesh(new THREE.SphereGeometry(1.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x8a6f8f, { side: THREE.DoubleSide }), 0, D + 2.15, -0.4);
    roof.scale.set(1, 0.35, 0.8);
    g.add(roof);
  } else if (id === 'buoy') {
    g.add(mesh(new THREE.SphereGeometry(0.45, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xe6f4f2, { roughness: 0.5 }), 0, -0.05));
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), darkWood, 0, 0.8));
    g.add(mesh(new THREE.SphereGeometry(0.18, 14, 10), lensMat, 0, 1.3));
  } else if (id === 'jellylamp') {
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 8), darkWood, 0, D + 0.9));
    const bell = mesh(new THREE.SphereGeometry(0.32, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), jellyGlow, 0, D + 1.85);
    g.add(bell);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 4), jellyGlow, Math.cos(a) * 0.18, D + 1.55, Math.sin(a) * 0.18));
    }
  } else if (id === 'fire') {
    // A ring of stones on a clay slab, with a bed of embers and a cooking grill.
    g.add(mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.08, 16), std(0x6b4a3a), 0, D + 0.04));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, st = mesh(new THREE.DodecahedronGeometry(0.13), stone, Math.cos(a) * 0.45, D + 0.15, Math.sin(a) * 0.45);
      st.rotation.set(a, a * 2, 0);
      g.add(st);
    }
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.DodecahedronGeometry(0.09), emberMat, Math.cos(i * 1.3) * 0.18, D + 0.14, Math.sin(i * 1.3) * 0.18));
    const grill = mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 20), darkWood, 0, D + 0.42);
    grill.rotation.x = Math.PI / 2;
    g.add(grill);
    for (const x of [-0.32, 0.32]) g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 6), darkWood, x, D + 0.21));
  } else if (id === 'kelpfarm') {
    // A water-filled trough; up to FARM_MAX strands show as the kelp grows.
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.35, 0.7), darkWood, 0, D + 0.17));
    g.add(mesh(new THREE.BoxGeometry(1.36, 0.04, 0.56), glow(0x1d7f80, 0.4), 0, D + 0.33));
    const strands = [];
    for (let i = 0; i < FARM_MAX; i++) {
      const k = mesh(new THREE.PlaneGeometry(0.22, 1.1, 1, 4), kelpMat, -0.45 + i * 0.45, D + 0.9, 0);
      k.rotation.y = i * 0.7;
      k.visible = false;
      strands.push(k);
      g.add(k);
    }
    g.userData.strands = strands;
  } else if (id === 'workbench') {
    // A heavy bench with a vice and a coil of kelp rope.
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.1, 0.75), wood, 0, D + 0.85, 0));
    for (const x of [-0.65, 0.65]) for (const z of [-0.3, 0.3]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.85, 0.1), darkWood, x, D + 0.42, z));
    g.add(mesh(new THREE.BoxGeometry(1.3, 0.06, 0.6), darkWood, 0, D + 0.3, 0));
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.18, 0.2), stone, 0.5, D + 0.99, 0.15));
    const coil = mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 16), kelpMat, -0.4, D + 0.93, -0.1);
    coil.rotation.x = Math.PI / 2;
    g.add(coil);
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 6), stone, -0.05, D + 0.92, 0.15)).rotation.z = Math.PI / 2;
  } else if (id === 'garden') {
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.3, 1.5), pot, 0, D + 0.15));
    g.add(mesh(new THREE.BoxGeometry(1.35, 0.05, 1.35), std(0x2f6a68), 0, D + 0.31));
    for (let i = 0; i < 9; i++) {
      const x = ((i % 3) - 1) * 0.42, z = (Math.floor(i / 3) - 1) * 0.42, len = 0.3 + ((i * 7) % 5) * 0.08;
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.05, len, 6), darkWood, x, D + 0.33 + len / 2, z));
      g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), coralTips[i % 4], x, D + 0.33 + len, z));
    }
  }
  return g;
}

const key = (i, j) => `${i},${j}`;
const toCell = (v) => Math.floor(v / CELL);
const cellCentre = (i) => (i + 0.5) * CELL;

// Build mode lives at the surface: aim at the water (or a deck) with the crosshair,
// left-click to build, right-click to take it back, number keys or the wheel to pick a piece.
export function createBuilder(scene, { canAfford, costFor, isUnlocked, spend, refund, onChange }) {
  const cells = new Map(); // "i,j" -> { floor: { id, mesh, paid }, prop: { id, mesh, paid } | null }
  const raft = new THREE.Group(); // everything built bobs together on the swell
  scene.add(raft);
  let selected = 0;
  let target = null; // { i, j, ok, remove }

  const available = () => PIECES.filter((p) => !p.unlock || isUnlocked(p.unlock));
  const current = () => available()[Math.min(selected, available().length - 1)];

  // Ghost preview of the selected piece.
  let ghost = null, ghostId = null;
  function setGhost() {
    if (ghostId === current().id) return;
    if (ghost) raft.remove(ghost);
    ghostId = current().id;
    ghost = makeMesh(ghostId);
    ghost.traverse((o) => {
      if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0x5cf2d6, transparent: true, opacity: 0.35, depthWrite: false });
    });
    ghost.visible = false;
    raft.add(ghost);
  }
  setGhost();
  const tintGhost = (color) => ghost.traverse((o) => o.isMesh && o.material.color.setHex(color));

  function add(i, j, id, paid = costFor(id)) {
    const cell = cells.get(key(i, j));
    const piece = { id, mesh: makeMesh(id), paid };
    piece.mesh.position.set(cellCentre(i), 0, cellCentre(j));
    if (byId[id].floor) {
      if (cell) return;
      cells.set(key(i, j), { floor: piece, prop: null });
    } else {
      if (!cell || !byId[cell.floor.id].walkable || cell.prop) return;
      piece.mesh.rotation.y = ((i * 7 + j * 3) % 4) * (Math.PI / 2);
      cell.prop = piece;
    }
    raft.add(piece.mesh);
  }

  const dir = new THREE.Vector3(), at = new THREE.Vector3();
  let bob = 0, level = SURFACE_Y, swell = 0, aground = false;

  return {
    available,
    get selected() { return available().indexOf(current()); },
    select(n) {
      const len = available().length;
      selected = (n + len) % len;
      setGhost();
    },
    // Deck surface height at a point, or null over open water (buoys don't hold you up).
    deckAt(x, z) {
      const cell = cells.get(key(toCell(x), toCell(z)));
      return cell && byId[cell.floor.id].walkable ? level + DECK_TOP : null;
    },
    count(id) {
      let n = 0;
      for (const c of cells.values()) if (c.floor.id === id || c.prop?.id === id) n++;
      return n;
    },
    // Is a piece of this kind within r metres of pos?
    near(id, pos, r) { return !!this.nearest(pos, r, [id]); },
    // The closest piece of one of these kinds within r metres, or null.
    nearest(pos, r, ids) {
      let best = null, bestD = r;
      for (const c of cells.values()) {
        for (const p of [c.floor, c.prop]) {
          if (!p || !ids.includes(p.id)) continue;
          const d = p.mesh.getWorldPosition(at).distanceTo(pos);
          if (d < bestD) { best = p; bestD = d; }
        }
      }
      return best;
    },
    // Calls fn(piece) for every built piece of a kind. Pieces can carry state (piece.state).
    each(id, fn) {
      for (const c of cells.values()) for (const p of [c.floor, c.prop]) if (p?.id === id) fn(p);
    },
    // A deck to wake up on: the walkable tile closest to pos, or null with no rafts.
    deckNear(pos) {
      let best = null, bestD = Infinity;
      for (const c of cells.values()) {
        if (!byId[c.floor.id].walkable) continue;
        const d = c.floor.mesh.getWorldPosition(at).distanceTo(pos);
        if (d < bestD) { bestD = d; best = c.floor.mesh.getWorldPosition(new THREE.Vector3()); }
      }
      return best;
    },
    /** Storm swell (0..1): rafts bob and roll more. */
    setSwell(v) { swell = v; },
    /** Resting on the seabed (a low tide over a bank). */
    get aground() { return aground; },
    update(t, camera, active) {
      bob = Math.sin(t * 1.3) * (0.05 + swell * 0.35);
      // A raft can't sink below the seabed under it: at low tide over a bank it runs aground.
      let ground = -Infinity;
      for (const [k] of cells) { const [i, j] = k.split(',').map(Number); ground = Math.max(ground, floorY(cellCentre(i), cellCentre(j)) + 0.3); }
      aground = ground > SURFACE_Y + bob;
      level = Math.max(SURFACE_Y + bob, ground);
      raft.position.y = level;
      raft.rotation.z = aground ? 0 : Math.sin(t * 0.9) * 0.05 * swell;
      raft.rotation.x = aground ? 0 : Math.cos(t * 0.7) * 0.04 * swell;
      jellyGlow.emissiveIntensity = 1.6 + Math.sin(t * 1.4) * 0.8;
      target = null;
      ghost.visible = false;
      if (!active) return;
      setGhost();
      camera.getWorldDirection(dir);
      const planeY = level + DECK_TOP;
      if (dir.y > -0.05) return; // must look down at the water
      const dist = (planeY - camera.position.y) / dir.y;
      if (dist < 0 || dist > REACH) return;
      const x = camera.position.x + dir.x * dist, z = camera.position.z + dir.z * dist;
      const i = toCell(x), j = toCell(z), cell = cells.get(key(i, j));
      const piece = current();
      const inLagoon = Math.hypot(cellCentre(i), cellCentre(j)) < BUILD_RADIUS;
      const fits = piece.floor ? !cell : cell && byId[cell.floor.id].walkable && !cell.prop;
      target = { i, j, ok: inLagoon && fits && canAfford(costFor(piece.id)), remove: !!cell };
      ghost.position.set(cellCentre(i), 0, cellCentre(j));
      ghost.visible = inLagoon && !!fits;
      tintGhost(target.ok ? 0x5cf2d6 : 0xff6b6b);
    },
    place() {
      if (!target?.ok) return null;
      const piece = current(), cost = costFor(piece.id);
      spend(cost);
      add(target.i, target.j, piece.id, cost);
      onChange();
      return piece.id;
    },
    // Takes back the prop on the aimed tile first, then the floor piece; refunds what it cost.
    remove() {
      if (!target?.remove) return false;
      const k = key(target.i, target.j), cell = cells.get(k);
      const piece = cell.prop || cell.floor;
      raft.remove(piece.mesh);
      refund(piece.paid);
      if (cell.prop) cell.prop = null; else cells.delete(k);
      onChange();
      return true;
    },
    serialize() {
      return [...cells].map(([k, c]) => [k, c.floor.id, c.floor.paid, c.prop?.id ?? null, c.prop?.paid ?? 0, c.prop?.state ?? null]);
    },
    load(list) {
      for (const entry of list || []) {
        // Older saves: [key, propId] on a raft.
        const [k, floor, floorPaid, prop, propPaid, state] = entry.length === 2 ? [entry[0], 'raft', undefined, entry[1], undefined] : entry;
        const [i, j] = k.split(',').map(Number);
        if (byId[floor]) add(i, j, floor, floorPaid);
        if (prop && byId[prop]) add(i, j, prop, propPaid);
        const placed = cells.get(key(i, j))?.prop;
        if (placed && state) placed.state = state;
      }
    },
  };
}
