import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightAt, clockText } from '../src/environment.js';

test('the day has a dusk, a night and a dawn', () => {
  assert.equal(nightAt(0.2), 0);
  assert.ok(nightAt(0.5) > 0 && nightAt(0.5) < 1);
  assert.equal(nightAt(0.7), 1);
  assert.ok(nightAt(0.97) > 0 && nightAt(0.97) < 1);
  assert.equal(nightAt(1.2), 0);
});

test('the clock starts at dawn and wraps', () => {
  assert.equal(clockText(0), '06:00');
  assert.equal(clockText(0.5), '18:00');
  assert.equal(clockText(0.75), '00:00');
});
