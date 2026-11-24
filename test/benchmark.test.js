import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, BENCH, PLAYCHECK, summarize, pickPreset, smooth, targetFps, judgeWindow } from '../src/benchmark.js';

test('frame times turn into an average fps and a slow-frame figure', () => {
  const r = summarize([...Array(95).fill(10), ...Array(5).fill(40)]);
  assert.equal(r.fps, Math.round(1000 / 11.5));
  assert.equal(r.p95, 40);
  assert.equal(summarize([]).fps, 0);
});

test('the best preset that runs smoothly is picked', () => {
  const results = [{ id: 'ultra', fps: 40, p95: 35 }, { id: 'high', fps: 75, p95: 20 }];
  assert.equal(pickPreset(results, 144).id, 'high');
  assert.ok(!smooth({ fps: 90, p95: BENCH.worst + 5 }, 144), 'regular stutters are not smooth');
});

test('a 60 Hz screen is not held against the PC', () => {
  assert.ok(targetFps(60) <= 60 * 0.92 + 1e-9);
  assert.equal(pickPreset([{ id: 'ultra', fps: 59, p95: 18 }], 60).id, 'ultra');
  assert.equal(pickPreset([{ id: 'ultra', fps: 59, p95: 18 }, { id: 'high', fps: 120, p95: 9 }], 144).id, 'high');
});

test('if nothing runs smoothly, the lowest preset is used', () => {
  assert.equal(pickPreset([{ id: 'ultra', fps: 10, p95: 120 }]).id, PRESETS[PRESETS.length - 1].id);
});

test('presets go from best to cheapest', () => {
  for (let i = 1; i < PRESETS.length; i++) {
    const a = PRESETS[i - 1].values, b = PRESETS[i].values;
    assert.ok(b.renderScale <= a.renderScale && b.viewDist <= a.viewDist && b.sceneryDist <= a.sceneryDist, PRESETS[i].id);
  }
});

test('play that is not smooth steps down; steady play confirms the choice', () => {
  assert.equal(judgeWindow(20, 60, 0), 'down');
  assert.equal(judgeWindow(58, 60, 0), 'ok');
  assert.equal(judgeWindow(58, 60, PLAYCHECK.confirm - 1), 'confirmed');
});
