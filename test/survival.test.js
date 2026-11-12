import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/progress.js';
import { createSurvival, ITEMS, GEAR, bagSize, gearMax } from '../src/survival.js';

beforeEach(() => P.load({ stats: {}, tiers: {}, points: 0, ranks: {} }));

const make = () => {
  const events = { blackouts: [], changes: 0 };
  const s = createSurvival({ onBlackout: (dropped) => events.blackouts.push(dropped), onChange: () => events.changes++ });
  return { s, events };
};
const run = (s, secs, underwater) => { for (let t = 0; t < secs; t += 0.1) s.update(0.1, underwater); };

test('breath runs out in about 45 seconds underwater and refills at the surface', () => {
  const { s } = make();
  run(s, 30, true);
  assert.ok(s.stats.breath > 25 && s.stats.breath < 40, `after 30 s: ${s.stats.breath}`);
  run(s, 20, true);
  assert.equal(s.stats.breath, 0);
  run(s, 3, false);
  assert.equal(s.stats.breath, 100);
});

test('Bigger lungs makes a breath last longer', () => {
  const plain = make().s;
  run(plain, 40, true);
  P.load({ stats: {}, tiers: {}, points: 0, ranks: { lungs: 5 } }); // +50%
  const lungs = make().s;
  run(lungs, 40, true);
  assert.ok(lungs.stats.breath > plain.stats.breath + 25);
});

test('drowning blacks you out and drops the bag', () => {
  const { s, events } = make();
  s.add('fish', 2);
  s.stats.breath = 0;
  run(s, 12, true);
  assert.equal(events.blackouts.length, 1);
  assert.deepEqual(events.blackouts[0], { fish: 2 });
  assert.equal(s.bagCount, 0);
  s.wake();
  assert.equal(s.stats.health, 50);
});

test('the bag holds 12, and Deep pockets adds room', () => {
  const { s } = make();
  assert.equal(s.add('kelp', 20), 12);
  assert.equal(s.add('kelp'), 0);
  P.load({ stats: {}, tiers: {}, points: 0, ranks: { pockets: 2 } });
  assert.equal(bagSize(), 16);
  assert.equal(s.add('kelp', 20), 4);
});

test('eating picks the best food, cooking turns raw into cooked', () => {
  const { s } = make();
  s.add('fish', 2);
  s.add('kelp', 1);
  assert.equal(s.cook(), 3);
  assert.deepEqual({ ...s.bag }, { cooked: 2, crisp: 1 });
  s.stats.food = 20;
  assert.equal(s.eat().name, ITEMS.cooked.name);
  assert.equal(s.stats.food, 50);
  s.stats.food = 99;
  assert.equal(s.eat(), null, "you can't eat when full");
});

test('the harpoon wears out and repairs with kelp; Tough shaft raises its max', () => {
  const { s } = make();
  for (let i = 0; i < GEAR.harpoon.max; i++) assert.ok(s.wear('harpoon'));
  assert.equal(s.wear('harpoon'), false);
  assert.equal(s.repair('harpoon'), 'nokelp');
  s.add('kelp', 2);
  assert.equal(s.repair('harpoon'), 'repaired');
  assert.equal(s.gear.harpoon, 30);
  P.load({ stats: {}, tiers: {}, points: 0, ranks: { shaft: 2 } });
  assert.equal(gearMax('harpoon'), 40);
});

test('Thick suit softens bites', () => {
  const { s } = make();
  s.damage(20);
  assert.equal(s.stats.health, 80);
  P.load({ stats: {}, tiers: {}, points: 0, ranks: { suit: 5 } }); // -30%
  s.damage(20);
  assert.equal(s.stats.health, 66);
});
