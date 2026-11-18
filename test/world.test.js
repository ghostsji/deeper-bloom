import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setWorldSeed, floorY, WORLD_RADIUS, REEF_RADIUS, SURFACE_Y, DEEPEST } from '../src/world.js';
import { generateLayout } from '../src/layout.js';

const sample = () => { const out = []; for (let x = -380; x <= 380; x += 20) for (let z = -380; z <= 380; z += 20) if (Math.hypot(x, z) < WORLD_RADIUS - 50) out.push(floorY(x, z)); return out; };

test('the same seed always builds the same seabed; another seed builds a different one', () => {
  setWorldSeed(1234);
  const a = sample();
  setWorldSeed(1234);
  assert.deepEqual(sample(), a);
  setWorldSeed(98765);
  const b = sample();
  assert.ok(a.some((y, i) => Math.abs(y - b[i]) > 1));
});

test("the reef round Echo is the same in every world", () => {
  setWorldSeed(1); const a = floorY(10, 20);
  setWorldSeed(2); const b = floorY(10, 20);
  assert.ok(Math.abs(a - b) < 1e-9);
  assert.ok(REEF_RADIUS < 100);
});

test('the open seabed has deep trenches and shallow banks, all underwater', () => {
  setWorldSeed(4242);
  const ys = sample();
  assert.ok(Math.min(...ys) < -15, `deepest ${Math.min(...ys)}`);
  assert.ok(Math.max(...ys) > 10, `shallowest ${Math.max(...ys)}`);
  assert.ok(ys.every((y) => y >= DEEPEST && y <= SURFACE_Y - 1)); // banks top out a metre below mean sea level
});

test('the atoll walls rise out of the water at the edge', () => {
  setWorldSeed(7);
  assert.ok(floorY(WORLD_RADIUS, 0) > SURFACE_Y);
});

test('the layout keeps things apart, puts the outpost deep and out, and is the same for a seed', () => {
  setWorldSeed(555);
  const L = generateLayout(555);
  assert.deepEqual(generateLayout(555), L);
  const o = L.outpost, d = Math.hypot(o.x, o.z), depth = SURFACE_Y - floorY(o.x, o.z);
  assert.ok(d >= 110 && d <= 210, `outpost ${d.toFixed(0)} m out`);
  assert.ok(depth > 20, `outpost ${depth.toFixed(0)} m down`);
  for (const c of L.cables.slice(0, 3)) assert.ok(Math.hypot(c.x - o.x, c.z - o.z) < 28);
  const near = (p) => Math.hypot(p.x, p.z - 24);
  assert.ok(near(L.spots.codex) < 25 && near(L.spots.codex) < near(L.spots.goals));
  assert.equal(L.wrecks.length, 14);
  assert.equal(L.vents.length, 56);
  assert.ok(Math.hypot(L.spots.far.x, L.spots.far.z) <= 450, "the far pod stays a reasonable swim");
});
