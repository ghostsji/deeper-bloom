import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setWorldSeed, floorY } from '../src/world.js';
import { deepSpots, DEEP } from '../src/deep.js';

test('deep life only goes in the trenches, the same for a seed', () => {
  setWorldSeed(31337);
  const a = deepSpots(20, 31337);
  assert.ok(a.length >= 10, `${a.length} deep spots`);
  assert.ok(a.every((p) => floorY(p.x, p.z) < DEEP.floor));
  assert.deepEqual(deepSpots(20, 31337), a);
});
