import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReveal, MAP } from '../src/map.js';

test('swimming somewhere reveals the map around it, once', () => {
  const r = createReveal();
  assert.ok(!r.seen(0, 0));
  assert.ok(r.reveal(0, 0) > 0);
  assert.ok(r.seen(0, 0) && r.seen(20, 0) && !r.seen(MAP.revealRadius + 30, 0));
  assert.equal(r.reveal(0, 0), 0);
  assert.ok(r.explored > 0 && r.explored < 0.05);
});

test('the explored map survives saving', () => {
  const r = createReveal();
  r.reveal(100, -50); r.reveal(-200, 30);
  const again = createReveal();
  again.load(r.serialize());
  assert.ok(again.seen(100, -50) && again.seen(-200, 30) && !again.seen(0, 0));
  assert.equal(again.explored, r.explored);
});
