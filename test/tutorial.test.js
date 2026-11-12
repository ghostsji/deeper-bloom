import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, createTutorial } from '../src/tutorial.js';

const fakeStats = () => {
  const stats = {};
  return { stats, stat: (id) => stats[id] || 0 };
};

test('starts on the first step and moves on when it is done', () => {
  const { stats, stat } = fakeStats();
  const t = createTutorial(stat);
  assert.equal(t.current().id, 'look');
  t.note('look');
  assert.equal(t.current().id, 'swim');
  stats.meters = 7;
  assert.deepEqual(t.progress(t.current()), { have: 7, need: 15 });
  stats.meters = 20;
  assert.equal(t.current().id, 'gather');
});

test('things already done are skipped', () => {
  const { stats, stat } = fakeStats();
  Object.assign(stats, { meters: 100, polyps: 10 });
  const t = createTutorial(stat);
  t.note('look');
  assert.equal(t.current().id, 'phone');
});

test('food counts fish or kelp', () => {
  const { stats, stat } = fakeStats();
  const t = createTutorial(stat);
  const forage = STEPS.find((s) => s.id === 'forage');
  assert.equal(t.done(forage), false);
  stats.kelp = 1;
  assert.equal(t.done(forage), true);
});

test('skip hides it, restart counts again from now, and both survive saving', () => {
  const { stats, stat } = fakeStats();
  stats.meters = 100;
  const t = createTutorial(stat);
  t.note('look');
  t.skip();
  assert.equal(t.current(), null);
  t.restart();
  assert.equal(t.current().id, 'look');
  t.note('look');
  assert.equal(t.current().id, 'swim'); // the 100 m swum before the restart don't count
  const again = createTutorial(stat);
  again.load(JSON.parse(JSON.stringify(t.serialize())));
  assert.equal(again.current().id, 'swim');
});

test('every step explains itself with the current keys', () => {
  for (const s of STEPS) assert.ok(s.how((id) => `<${id}>`).length > 10, s.id);
});

test('finishing every step ends the tutorial', () => {
  const { stats, stat } = fakeStats();
  const t = createTutorial(stat);
  for (const s of STEPS) {
    if (s.note) t.note(s.note);
    for (const id of s.stats || [s.stat]) if (id) stats[id] = 999;
  }
  assert.equal(t.current(), null);
  assert.ok(t.finished);
});
