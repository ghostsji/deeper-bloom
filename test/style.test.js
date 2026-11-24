import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS } from '../src/looks.js';
import { AMBIENTS } from '../src/audio.js';

test('every look has a name, a description and every shader setting', () => {
  const ids = new Set();
  for (const l of LOOKS) {
    assert.ok(l.id && l.name && l.desc, l.id);
    assert.ok(!ids.has(l.id)); ids.add(l.id);
    for (const k of ['sat', 'contrast', 'vignette', 'grain', 'chroma', 'poster', 'scan']) assert.equal(typeof l[k], 'number', `${l.id}.${k}`);
    assert.equal(l.tint.length, 3); assert.equal(l.lift.length, 3);
  }
  assert.equal(LOOKS[0].id, 'clean');
});

test('the underwater music list starts with the original track and has no repeats', () => {
  assert.equal(AMBIENTS[0][0], 'reef');
  assert.equal(new Set(AMBIENTS.map(([id]) => id)).size, AMBIENTS.length);
  for (const [, name, desc] of AMBIENTS) assert.ok(name && desc);
});
