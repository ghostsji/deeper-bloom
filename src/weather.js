// Weather and tides. Storms come and go over the atoll (clear spells, a build-up, the storm,
// a fade). Tides lift and drop the water level twice a day, so low banks become islands and
// rafts can run aground. Pure state; main.js and world.js apply it.

export const WEATHER = { clear: [180, 360], build: 30, storm: [90, 180], fade: 30 };
export const TIDE = { amplitude: 2.2, perDay: 2 };
/** The tide (metres above or below mean sea level) at a phase of the day (0..1). */
export const tideAt = (phase) => TIDE.amplitude * Math.sin(phase * Math.PI * 2 * TIDE.perDay);
/** Is the tide rising at this phase? */
export const tideRising = (phase) => Math.cos(phase * Math.PI * 2 * TIDE.perDay) > 0;

function rng(seed) {
  let a = (seed ^ 0x2f6b8d1) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function createWeather(seed = 1) {
  const rand = rng(seed), span = ([a, b]) => a + rand() * (b - a);
  let stage = 'clear', left = span(WEATHER.clear);
  const next = { clear: 'build', build: 'storm', storm: 'fade', fade: 'clear' };
  const length = (s) => (s === 'clear' ? span(WEATHER.clear) : s === 'storm' ? span(WEATHER.storm) : WEATHER[s]);
  const strength = () => (stage === 'storm' ? 1 : stage === 'build' ? 1 - left / WEATHER.build : stage === 'fade' ? left / WEATHER.fade : 0);
  return {
    get stage() { return stage; },
    /** 0 calm .. 1 full storm. */
    get storm() { return Math.max(0, Math.min(1, strength())); },
    /** Returns { stormStart, stormEnd } when those happen. */
    update(dt) {
      const ev = {};
      left -= dt;
      while (left <= 0) {
        stage = next[stage];
        left += length(stage);
        if (stage === 'build') ev.stormStart = true;
        if (stage === 'clear') ev.stormEnd = true;
      }
      return ev;
    },
    /** Jumps to a stage (for testing). */
    force(s) { stage = s; left = length(s); },
    serialize: () => ({ stage, left }),
    load(d) { if (d?.stage && next[d.stage]) { stage = d.stage; left = d.left ?? length(stage); } },
  };
}
