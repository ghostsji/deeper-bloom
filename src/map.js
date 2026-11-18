// The phone's Map app: the seabed drawn from the real terrain and coloured by depth, hidden
// under fog of war until you've swum near it (saved), with markers for what you know about
// and a waypoint you set by tapping the map (it shows on the compass).
import { floorY, WORLD_RADIUS, SURFACE_Y } from './world.js';

export const MAP = { cells: 96, revealRadius: 32, image: 320, nearSpan: 240 };
const R = WORLD_RADIUS + 20;          // the map covers the whole atoll and a little beyond
const SPAN = R * 2;

/** Depth colour for the map: shallow teal, deep blue, trenches near black, islands sand. */
function depthColour(y) {
  if (y > SURFACE_Y) return [140, 127, 99];
  const d = SURFACE_Y - y; // metres of water
  const stops = [[0, [92, 214, 196]], [10, [47, 140, 140]], [24, [22, 74, 92]], [38, [10, 34, 52]], [60, [2, 8, 14]]];
  for (let i = 1; i < stops.length; i++) {
    if (d <= stops[i][0]) {
      const [d0, c0] = stops[i - 1], [d1, c1] = stops[i], k = (d - d0) / (d1 - d0);
      return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
    }
  }
  return stops[stops.length - 1][1];
}

/** Fog-of-war grid: which cells of the atoll you've seen. Pure (testable without a page). */
export function createReveal(cells = MAP.cells) {
  let seen = new Uint8Array(cells * cells), count = 0, dirty = true;
  const cellSize = SPAN / cells;
  const cellOf = (x, z) => [Math.floor((x + R) / cellSize), Math.floor((z + R) / cellSize)];
  return {
    cells, cellSize,
    get dirty() { return dirty; },
    clean() { dirty = false; },
    /** Reveals everything within radius metres of (x, z). Returns how many cells were new. */
    reveal(x, z, radius = MAP.revealRadius) {
      const [cx, cz] = cellOf(x, z), n = Math.ceil(radius / cellSize);
      let added = 0;
      for (let i = cx - n; i <= cx + n; i++) for (let j = cz - n; j <= cz + n; j++) {
        if (i < 0 || j < 0 || i >= cells || j >= cells) continue;
        const wx = (i + 0.5) * cellSize - R, wz = (j + 0.5) * cellSize - R;
        if (Math.hypot(wx - x, wz - z) > radius + cellSize * 0.5) continue;
        if (!seen[j * cells + i]) { seen[j * cells + i] = 1; added++; }
      }
      if (added) { count += added; dirty = true; }
      return added;
    },
    seen(x, z) { const [i, j] = cellOf(x, z); return i >= 0 && j >= 0 && i < cells && j < cells && !!seen[j * cells + i]; },
    seenCell: (i, j) => !!seen[j * cells + i],
    /** Share of the atoll's water you've explored, 0..1. */
    get explored() {
      let water = 0, got = 0;
      for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
        const wx = (i + 0.5) * cellSize - R, wz = (j + 0.5) * cellSize - R;
        if (Math.hypot(wx, wz) > WORLD_RADIUS - 20) continue;
        water++; if (seen[j * cells + i]) got++;
      }
      return water ? got / water : 0;
    },
    // Saved as a compact string: one character per 6 cells.
    serialize() {
      let out = '';
      for (let k = 0; k < seen.length; k += 6) {
        let v = 0;
        for (let b = 0; b < 6; b++) if (seen[k + b]) v |= 1 << b;
        out += String.fromCharCode(48 + v);
      }
      return out;
    },
    load(str) {
      seen = new Uint8Array(cells * cells); count = 0;
      if (typeof str === 'string') for (let c = 0; c < str.length; c++) {
        const v = str.charCodeAt(c) - 48;
        for (let b = 0; b < 6; b++) if (v & (1 << b) && c * 6 + b < seen.length) { seen[c * 6 + b] = 1; count++; }
      }
      dirty = true;
    },
  };
}

// ---- Drawing (in the page) ----
let terrain = null; // a canvas of the whole seabed, built once per world
function terrainCanvas() {
  if (terrain) return terrain;
  const n = MAP.image, cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d'), img = g.createImageData(n, n);
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
    const x = (px + 0.5) / n * SPAN - R, z = (py + 0.5) / n * SPAN - R;
    const y = floorY(x, z), [r, gg, b] = depthColour(y);
    // A little relief shading from the slope, so banks and trench walls read.
    const shade = Math.max(-18, Math.min(18, (floorY(x + 3, z + 3) - y) * 9));
    const k = (py * n + px) * 4;
    img.data[k] = Math.max(0, Math.min(255, r + shade)); img.data[k + 1] = Math.max(0, Math.min(255, gg + shade)); img.data[k + 2] = Math.max(0, Math.min(255, b + shade)); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  terrain = cv;
  return cv;
}
export function resetMapImage() { terrain = null; }

/**
 * Draws the map. view: { zoom: 'all' | 'near', you: { x, z, heading }, echo, echoRange,
 * rafts: [{x,z}], buoys: [{x,z}], relayRange, satchel, pins: [{ kind, x, z }], waypoint }
 * Returns the transform used, so taps can be turned back into world positions.
 */
export function drawMap(canvas, reveal, view) {
  const size = canvas.width, g = canvas.getContext('2d');
  const span = view.zoom === 'near' ? MAP.nearSpan : SPAN;
  const cx = view.zoom === 'near' ? view.you.x : 0, cz = view.zoom === 'near' ? view.you.z : 0;
  const scale = size / span;
  const toPx = (x, z) => [(x - cx) * scale + size / 2, (z - cz) * scale + size / 2];
  g.fillStyle = '#020a10';
  g.fillRect(0, 0, size, size);
  // The seabed, then the fog over what you haven't seen.
  const t = terrainCanvas(), tScale = MAP.image / SPAN;
  const [sx, sy] = [(cx - span / 2 + R) * tScale, (cz - span / 2 + R) * tScale];
  g.imageSmoothingEnabled = true;
  g.drawImage(t, sx, sy, span * tScale, span * tScale, 0, 0, size, size);
  // Corrupted regions: the map draws the seabed from somewhere else there, tinted wrong.
  for (const b of view.corrupt || []) {
    const [px, py] = toPx(b.x, b.z), rr = b.r * scale;
    g.save(); g.beginPath(); g.arc(px, py, rr, 0, Math.PI * 2); g.clip();
    const [fx, fy] = [(b.x + b.ox - b.r + R) * tScale, (b.z + b.oz - b.r + R) * tScale];
    g.drawImage(t, fx, fy, b.r * 2 * tScale, b.r * 2 * tScale, px - rr, py - rr, rr * 2, rr * 2);
    g.fillStyle = 'rgba(255, 60, 200, 0.10)'; g.fillRect(px - rr, py - rr, rr * 2, rr * 2);
    g.restore();
  }
  g.fillStyle = 'rgba(2, 10, 16, 0.94)';
  const cs = reveal.cellSize;
  for (let j = 0; j < reveal.cells; j++) for (let i = 0; i < reveal.cells; i++) {
    if (reveal.seenCell(i, j)) continue;
    const [px, py] = toPx(i * cs - R, j * cs - R);
    const w = cs * scale + 0.6;
    if (px > size || py > size || px + w < 0 || py + w < 0) continue;
    g.fillRect(px, py, w, w);
  }
  // A dead zone of static (round the outpost, until Navigation is back).
  if (view.deadZone) {
    const [px, py] = toPx(view.deadZone.x, view.deadZone.z), rr = view.deadZone.r * scale;
    g.save(); g.beginPath(); g.arc(px, py, rr, 0, Math.PI * 2); g.clip();
    for (let y = py - rr; y < py + rr; y += 3) for (let x = px - rr; x < px + rr; x += 3) {
      const v = 30 + Math.random() * 90; g.fillStyle = `rgb(${v},${v},${v + 10})`; g.fillRect(x, y, 3, 3);
    }
    g.restore();
    g.fillStyle = '#ff8f8f'; g.font = '600 10px monospace'; g.textAlign = 'center'; g.fillText('NO DATA', px, py + 3);
  }
  // Echo's reach, and the buoys relaying it.
  const ring = (x, z, r, colour) => { const [px, py] = toPx(x, z); g.beginPath(); g.arc(px, py, r * scale, 0, Math.PI * 2); g.strokeStyle = colour; g.setLineDash([4, 4]); g.lineWidth = 1; g.stroke(); g.setLineDash([]); };
  ring(view.echo.x, view.echo.z, view.echoRange, 'rgba(244, 238, 230, .35)');
  for (const b of view.buoys) ring(b.x, b.z, view.relayRange, 'rgba(92, 242, 214, .3)');
  const dot = (x, z, r, colour, glow = 0) => { const [px, py] = toPx(x, z); g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fillStyle = colour; g.shadowColor = colour; g.shadowBlur = glow; g.fill(); g.shadowBlur = 0; };
  const PIN = { pod: '#5CF2D6', cell: '#FFC46B', fuse: '#FF9A5C', upgrade: '#F4FBFF', log: '#B59CFF', part: '#8FD0FF', outpost: '#FF9A5C', wreck: '#B8A07A' };
  for (const p of view.pins) {
    const [px, py] = toPx(p.x, p.z);
    if (p.kind === 'outpost' || p.kind === 'wreck') { g.fillStyle = PIN[p.kind]; g.fillRect(px - 4, py - 3, 8, 6); continue; }
    dot(p.x, p.z, 3, PIN[p.kind] || '#fff', 6);
  }
  for (const r of view.rafts) { const [px, py] = toPx(r.x, r.z); g.fillStyle = '#C9A36A'; g.fillRect(px - 3, py - 3, 6, 6); }
  for (const b of view.buoys) dot(b.x, b.z, 2.5, '#5CF2D6', 6);
  if (view.satchel) dot(view.satchel.x, view.satchel.z, 4, '#FFC46B', 8);
  dot(view.echo.x, view.echo.z, 4.5, '#F4EEE6', 10);
  if (view.waypoint) {
    const [px, py] = toPx(view.waypoint.x, view.waypoint.z);
    g.strokeStyle = '#FFC46B'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(px - 6, py - 6); g.lineTo(px + 6, py + 6); g.moveTo(px + 6, py - 6); g.lineTo(px - 6, py + 6); g.stroke();
    const [yx, yy] = toPx(view.you.x, view.you.z);
    g.setLineDash([3, 4]); g.strokeStyle = 'rgba(255, 196, 107, .55)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(yx, yy); g.lineTo(px, py); g.stroke(); g.setLineDash([]);
  }
  // You: an arrow pointing where you're facing (heading 0 = north, -z).
  const [yx, yy] = toPx(view.you.x, view.you.z);
  g.save(); g.translate(yx, yy); g.rotate(view.you.heading);
  g.beginPath(); g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6); g.closePath();
  g.fillStyle = '#5CF2D6'; g.shadowColor = '#5CF2D6'; g.shadowBlur = 8; g.fill(); g.restore();
  // North marker.
  g.fillStyle = 'rgba(230, 244, 242, .7)'; g.font = '600 11px Unbounded, sans-serif'; g.textAlign = 'center'; g.fillText('N', size / 2, 14);
  // Water damage: bands of the picture slip sideways now and then (less as you repair the visor).
  const glitch = view.glitch ?? 0;
  if (glitch > 0 && Math.random() < 0.25 + glitch * 0.5) {
    for (let k = 0; k < 1 + Math.floor(Math.random() * 3 * glitch + 0.5); k++) {
      const y = Math.random() * size, h = 4 + Math.random() * 18, dx = (Math.random() - 0.5) * 40 * glitch;
      g.drawImage(canvas, 0, y, size, h, dx, y, size, h);
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '92, 242, 214' : '255, 80, 200'}, 0.12)`; g.fillRect(0, y, size, h);
    }
  }
  return { toWorld: (px, py) => ({ x: (px - size / 2) / scale + cx, z: (py - size / 2) / scale + cz }) };
}
