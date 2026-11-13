import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEMS, createSystems } from '../src/hud-systems.js';

const ctxWith = (over = {}) => {
  const c = { stats: {}, codexN: {}, st: 0, rs: 0, ...over };
  return { c, ctx: { stat: (id) => c.stats[id] || 0, codex: (id) => c.codexN[id] || 0, stations: () => c.st, researched: () => c.rs } };
};

test('everything starts damaged', () => {
  const { ctx } = ctxWith();
  const s = createSystems(ctx);
  assert.deepEqual(s.update(), []);
  assert.equal(s.integrity, 0);
  for (const sys of SYSTEMS) assert.equal(s.online(sys.id), false);
});

test('milestones get you the part; rewiring brings the system back, once', () => {
  const { c, ctx } = ctxWith();
  const s = createSystems(ctx);
  c.stats.meals = 1;
  c.stats.polyps = 14;
  assert.deepEqual(s.update().map((x) => x.id), ['vitals']);
  c.stats.polyps = 15;
  assert.deepEqual(s.update().map((x) => x.id), ['ledger']);
  assert.deepEqual(s.update(), []);
  assert.equal(s.integrity, 0);
  assert.ok(s.isReady('vitals') && !s.online('vitals'));
  assert.equal(s.install('depth'), null); // no part for it yet
  assert.equal(s.install('vitals').id, 'vitals');
  assert.equal(s.install('ledger').id, 'ledger');
  assert.equal(s.integrity, 2 / SYSTEMS.length);
  assert.deepEqual(s.update(), []);
  assert.deepEqual(s.progress(SYSTEMS.find((x) => x.id === 'depth')), { have: 0, need: 150 });
});

test('restored systems survive saving, even if the stat later drops', () => {
  const { c, ctx } = ctxWith();
  const s = createSystems(ctx);
  c.st = 1;
  c.stats.meals = 1;
  s.update();
  s.install('nav');
  const again = createSystems(ctxWith().ctx);
  again.load(JSON.parse(JSON.stringify(s.serialize())));
  assert.ok(again.online('nav'));
  assert.ok(again.isReady('vitals'));
  const old = createSystems(ctxWith().ctx);
  old.load(['comms']); // the older save format
  assert.ok(old.online('comms'));
});

test('restoring everything reaches full integrity', () => {
  const { ctx } = ctxWith({ stats: { meals: 1, polyps: 99, meters: 999, scans: 9, eels: 1 }, codexN: { echo: 1 }, st: 1, rs: 3 });
  const s = createSystems(ctx);
  assert.equal(s.update().length, SYSTEMS.length);
  for (const sys of SYSTEMS) s.install(sys.id);
  assert.equal(s.integrity, 1);
});
