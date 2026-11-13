import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSuit, POWER, PRESSURE } from '../src/suit.js';

const deep = { depth: 25, surfaced: false, onDeck: false, sealed: false };
const shallow = { depth: 8, surfaced: false, onDeck: false, sealed: false };
const run = (suit, secs, s) => { const evs = []; for (let i = 0; i < secs * 10; i++) evs.push(suit.update(0.1, s)); return evs; };

test('the battery drains while you play and warns as it gets low', () => {
  const suit = createSuit();
  const evs = run(suit, 100 / POWER.drain - 1, shallow);
  assert.ok(suit.power < 1);
  assert.deepEqual(evs.filter((e) => e.warn).map((e) => e.warn), [30, 15, 5]);
});

test('systems shut off in order as power runs down', () => {
  const suit = createSuit();
  run(suit, (100 - 25) / POWER.drain - 2, shallow); // down to about 25%
  assert.ok(suit.unpowered('nav') && !suit.unpowered('depth'));
});

test('power cells stretch the battery; decks and the surface recharge it', () => {
  const a = createSuit(), b = createSuit();
  b.addCell(); b.addCell();
  run(a, 100, shallow); run(b, 100, shallow);
  assert.ok(b.power > a.power);
  run(a, 3, { ...shallow, onDeck: true });
  assert.ok(a.power > 100 - 100 * POWER.drain + 10);
});

test('deep water strains unsealed glass: cracks spread, then it leaks', () => {
  const suit = createSuit();
  const evs = run(suit, 60, deep);
  assert.deepEqual(evs.filter((e) => e.layer).map((e) => e.layer), [1, 2, 3]);
  assert.ok(evs.some((e) => e.leaking));
  assert.ok(suit.leak > 0 && suit.leakBreathFactor() > 0);
});

test('going shallower eases the strain and drains the leak', () => {
  const suit = createSuit();
  run(suit, 70, deep);
  run(suit, 40, { ...shallow, surfaced: true });
  assert.equal(suit.crackLayers, 0);
  assert.equal(suit.leak, 0);
});

test('a sealed visor takes no strain', () => {
  const suit = createSuit();
  run(suit, 120, { ...deep, sealed: true });
  assert.equal(suit.stress, 0);
  assert.equal(suit.leak, 0);
});

test('suit state survives saving', () => {
  const suit = createSuit();
  suit.addCell();
  run(suit, 30, deep);
  const again = createSuit();
  again.load(JSON.parse(JSON.stringify(suit.serialize())));
  assert.deepEqual(again.serialize(), suit.serialize());
  assert.ok(PRESSURE.layers.length === 3);
});
