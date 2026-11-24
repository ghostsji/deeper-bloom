// The first-run benchmark. The first time someone plays on this account, the game renders a few
// demanding views at each graphics preset, best first, and keeps the first preset that runs
// smoothly. The result is saved with that account's settings, so it only ever runs once (Options
// → Display has "Run the benchmark again"). The measuring lives in main.js; this is the pure part.

/** Graphics presets, best first. Values are the Options settings each one sets. */
export const PRESETS = [
  { id: 'ultra', name: 'Ultra', values: { renderScale: 1, bloom: true, viewDist: 250, sceneryDist: 300, chunkSize: 240 } },
  { id: 'high', name: 'High', values: { renderScale: 1, bloom: true, viewDist: 190, sceneryDist: 210, chunkSize: 160 } },
  { id: 'medium', name: 'Medium', values: { renderScale: 0.85, bloom: true, viewDist: 150, sceneryDist: 150, chunkSize: 120 } },
  { id: 'low', name: 'Low', values: { renderScale: 0.7, bloom: true, viewDist: 110, sceneryDist: 100, chunkSize: 80 } },
  { id: 'potato', name: 'Very low', values: { renderScale: 0.55, bloom: false, viewDist: 70, sceneryDist: 60, chunkSize: 60 } },
];

/**
 * How it measures and what counts as smooth: at each preset it settles for `warm` ms, then
 * samples `sample` ms of frames at each spot. Smooth means an average of at least `fps` and the
 * slowest 5% of frames no longer than `worst` ms (so no regular stutters).
 */
export const BENCH = {
  // The visor HUD is drawn during the run (it costs frames too), and a preset must beat the target
  // by `headroom`, since play adds creatures, combat and effects on top of these views.
  warm: 400, sample: 1100, fps: 55, worst: 30, headroom: 1.15,
  // A busy view across the reef round Echo; low over the open seabed far out; and above the water
  // looking out over the atoll (where the camera draws three times as far).
  spots: [
    { at: [0, 12, 40], look: [0, 2, 0] },
    { at: [500, 'floor+4', 300], look: [380, 'floor', 180] }, // the open seabed, near the floor
    { at: [-60, 'surface+2', 60], look: [0, 'surface', -260] },
  ],
};

/** Average fps and the 95th-percentile frame time (ms) from a list of frame times (ms). */
export function summarize(frames) {
  const ok = frames.filter((f) => f > 0 && f < 1000);
  if (!ok.length) return { fps: 0, p95: Infinity };
  const avg = ok.reduce((a, b) => a + b, 0) / ok.length;
  const sorted = [...ok].sort((a, b) => a - b);
  return { fps: Math.round(1000 / avg), p95: Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] * 10) / 10 };
}

/** The fps a preset must reach. A 60 Hz screen caps the game at 60 fps however fast the PC is, so
 *  the target never asks for more than 92% of the screen's own rate (hz, measured first). */
export const targetFps = (hz = Infinity) => Math.min(BENCH.fps * BENCH.headroom, hz * 0.92);
export const smooth = (r, hz) => r.fps >= targetFps(hz) && r.p95 <= BENCH.worst / BENCH.headroom;

/**
 * The check in play. The title-screen run can't see everything play adds (creatures, combat, the
 * visor's glitches), so for the first minutes of play the game keeps an eye on the real frame
 * rate: a window of play that isn't smooth steps the graphics down one preset; three smooth
 * windows in a row and the choice is confirmed, and the check stops for good.
 */
export const PLAYCHECK = { settle: 8, window: 8, confirm: 3, slack: 0.85 };
/** One window of play: 'down' (step a preset down), 'ok' or 'confirmed'. */
export function judgeWindow(fps, hz, streak) {
  if (fps < targetFps(hz) / BENCH.headroom * PLAYCHECK.slack) return 'down';
  return streak + 1 >= PLAYCHECK.confirm ? 'confirmed' : 'ok';
}

/** The best preset that ran smoothly ([{ id, fps, p95 }], best first); the lowest if none did. */
export function pickPreset(results, hz) {
  const hit = results.find((r) => smooth(r, hz));
  return PRESETS.find((p) => p.id === hit?.id) || PRESETS[PRESETS.length - 1];
}
