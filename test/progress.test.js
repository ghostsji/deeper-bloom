import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/progress.js';

const fresh = () => P.load({ stats: {}, tiers: {}, points: 0, ranks: {} });
beforeEach(fresh);

test('achievement targets grow forever and round nicely', () => {
  const polyps = P.ACHIEVEMENTS.find((a) => a.id === 'polyps');
  const targets = Array.from({ length: 30 }, (_, k) => P.target(polyps, k));
  for (let k = 1; k < targets.length; k++) assert.ok(targets[k] > targets[k - 1], `tier ${k} grows`);
  assert.deepEqual(targets.slice(0, 5), [10, 22, 48, 110, 230]);
});

test('reaching tiers pays Bloom points, more for later tiers', () => {
  const got = [];
  P.onAchievement((a, tier, pts) => got.push([a.id, tier, pts]));
  P.track('polyps', 60); // passes 10, 22 and 48
  assert.deepEqual(got.map(([, tier, pts]) => [tier, pts]), [[0, 1], [1, 1], [2, 2]]);
  assert.equal(P.points(), 4);
  P.onAchievement(() => {});
});

test('depth only counts your best', () => {
  P.trackMax('depth', 12);
  P.trackMax('depth', 4);
  assert.equal(P.stat('depth'), 12);
});

test('skills cost Bloom, need their prerequisites and stop at max rank', () => {
  P.load({ stats: {}, tiers: {}, points: 100, ranks: {} });
  assert.equal(P.canBuy('jet'), false, 'Jet fins needs Long fins');
  assert.ok(P.buy('fins'));
  assert.ok(P.canBuy('jet'));
  for (let i = 0; i < 20; i++) P.buy('fins');
  assert.equal(P.rank('fins'), 10, 'Long fins stops at 10');
  assert.ok(Math.abs(P.perk('swim') - 0.6) < 1e-9);
  assert.equal(P.buy('nope'), false);
});

test('a skill rank costs more as it rises', () => {
  P.load({ stats: {}, tiers: {}, points: 100, ranks: {} });
  const node = P.TREES.flatMap((t) => t.nodes).find((n) => n.id === 'shine');
  const costs = [];
  for (let i = 0; i < 4; i++) { costs.push(P.nodeCost(node)); P.buy('shine'); }
  assert.deepEqual(costs, [1, 1, 2, 2]);
});

test('rarity odds: common most of the time, luck shifts them up', () => {
  const share = (n) => {
    const c = Object.fromEntries(P.RARITY.map((r) => [r.id, 0]));
    for (let i = 0; i < n; i++) c[P.rollRarity().id]++;
    return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / n]));
  };
  const plain = share(40000);
  assert.ok(plain.common > 0.65 && plain.common < 0.75, `common ${plain.common}`);
  P.load({ stats: {}, tiers: {}, points: 0, ranks: { luck: 10 } });
  const lucky = share(40000);
  assert.ok(lucky.common < plain.common - 0.15, 'luck makes Common rarer');
  assert.ok(lucky.legendary > plain.legendary * 4, 'luck makes Legendary more likely');
});

test('rare rolls count toward the rare goals', () => {
  P.load({ stats: {}, tiers: {}, points: 0, ranks: { luck: 10 } });
  for (let i = 0; i < 2000; i++) P.rollRarity();
  assert.ok(P.stat('rare') > 0 && P.stat('legendary') > 0 && P.stat('rare') >= P.stat('legendary'));
});

test('big numbers stay readable', () => {
  assert.deepEqual([5, 12345, 2.5e6, 7.1e9, 3.3e12].map((v) => P.formatStat(v)), ['5', '12.3k', '2.5M', '7.1B', '3.3T']);
  assert.equal(P.formatStat(150, 'm'), '150 m');
  assert.equal(P.formatStat(7200, 'time'), '2.0 h');
  assert.equal(P.roman(1994), 'MCMXCIV');
});

test('save round-trip keeps progress and drops unknown skills', () => {
  P.load({ stats: { polyps: 5 }, tiers: { polyps: 0 }, points: 3, ranks: { fins: 2, removedSkill: 4 } });
  const s = P.serialize();
  fresh();
  P.load(s);
  assert.equal(P.stat('polyps'), 5);
  assert.equal(P.points(), 3);
  assert.equal(P.rank('fins'), 2);
  assert.equal(P.rank('removedSkill'), 0);
});
