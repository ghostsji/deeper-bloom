import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, bind, keyFor, keyLabel } from '../src/controls.js';

const action = (id) => ACTIONS.find((a) => a.id === id);

test('every action has its own default key', () => {
  assert.equal(new Set(ACTIONS.map((a) => a.code)).size, ACTIONS.length);
});

test('binding a free key moves just that action', () => {
  const b = bind({}, action('forward'), 'KeyI');
  assert.deepEqual(b, { forward: 'KeyI' });
  assert.equal(keyFor(b, action('forward')), 'KeyI');
  assert.equal(keyFor(b, action('back')), 'KeyS');
});

test('binding a taken key swaps the two actions', () => {
  const b = bind({}, action('forward'), 'KeyS');
  assert.equal(keyFor(b, action('forward')), 'KeyS');
  assert.equal(keyFor(b, action('back')), 'KeyW');
});

test('binding an action back to its default clears it', () => {
  const b = bind(bind({}, action('forward'), 'KeyI'), action('forward'), 'KeyW');
  assert.deepEqual(b, {});
});

test('key labels read like keys', () => {
  assert.equal(keyLabel('KeyW'), 'W');
  assert.equal(keyLabel('Digit1'), '1');
  assert.equal(keyLabel('ControlLeft'), 'Left Ctrl');
  assert.equal(keyLabel('Space'), 'Space');
});
