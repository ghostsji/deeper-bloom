import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWeather, tideAt, tideRising, WEATHER, TIDE } from '../src/weather.js';

test('storms build, rage and fade between clear spells', () => {
  const w = createWeather(9);
  assert.equal(w.storm, 0);
  const seen = new Set();
  let started = 0, ended = 0;
  for (let i = 0; i < 20000; i++) {
    const ev = w.update(0.1);
    seen.add(w.stage);
    if (ev.stormStart) started++;
    if (ev.stormEnd) ended++;
  }
  assert.deepEqual([...seen].sort(), ['build', 'clear', 'fade', 'storm']);
  assert.ok(started >= 2 && ended >= 2);
});

test('storm strength ramps up and down', () => {
  const w = createWeather(3);
  w.force('build');
  w.update(WEATHER.build / 2);
  assert.ok(w.storm > 0.3 && w.storm < 0.7);
  w.force('storm');
  assert.equal(w.storm, 1);
});

test('weather survives saving', () => {
  const w = createWeather(5);
  w.force('storm');
  const again = createWeather(5);
  again.load(JSON.parse(JSON.stringify(w.serialize())));
  assert.equal(again.stage, 'storm');
});

test('two tides a day, rising then falling', () => {
  assert.equal(tideAt(0), 0);
  assert.ok(Math.abs(tideAt(0.125) - TIDE.amplitude) < 1e-9);
  assert.ok(Math.abs(tideAt(0.375) + TIDE.amplitude) < 1e-9);
  assert.ok(tideRising(0.05) && !tideRising(0.2));
});
