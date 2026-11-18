import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setWorldSeed } from '../src/world.js';
import { createRestoration, REEF } from '../src/reef.js';

test('dead patches exist on the open seabed, never on the reef', () => {
  setWorldSeed(2024);
  const r = createRestoration();
  assert.ok(r.dead.length > 10, `${r.dead.length} dead patches`);
  assert.equal(r.plant(0, 10), 'alive');
});

test('three seedlings restore a dead patch', () => {
  setWorldSeed(2024);
  const r = createRestoration();
  const [c] = r.cells();
  assert.equal(r.plant(c.x, c.z), 'planted');
  assert.equal(r.plant(c.x + 2, c.z), 'planted');
  assert.ok(!r.restoredAt(c.x, c.z));
  assert.equal(r.plant(c.x, c.z + 2), 'restored');
  assert.ok(r.restoredAt(c.x, c.z));
  assert.equal(r.plant(c.x, c.z), 'done');
  assert.ok(r.restored > 0 && r.restored < 1);
  assert.equal(REEF.seedlings, 3);
});
