import { zapSound } from './audio.js';

// Touching cracked glass (the visor's or the phone's) shocks you: a lightning burst where you
// touched, a flash, a jolt and a zap. The cracks carry invisible ".crack-hit" strokes (see
// hud-fx.js); the game decides what a shock costs through onShock().
let handler = () => {};
let last = 0;
export function onShock(fn) { handler = fn; }

// One jagged bolt from (0,0) out to length len, with a fork or two.
function bolt(len, ang, depth = 0) {
  let x = 0, y = 0, d = 'M0 0';
  const forks = [];
  const steps = 6 + ((Math.random() * 4) | 0);
  for (let i = 0; i < steps; i++) {
    const a = ang + (Math.random() - 0.5) * 1.3;
    x += Math.cos(a) * len / steps; y += Math.sin(a) * len / steps;
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    if (depth < 1 && Math.random() < 0.25) forks.push(`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">${bolt(len * 0.45, a + (Math.random() - 0.5) * 1.6, depth + 1)}</g>`);
  }
  return `<path d="${d}"/>${forks.join('')}`;
}

/** Plays the shock effect at a screen point. */
export function shockAt(x, y) {
  zapSound();
  const n = 5 + ((Math.random() * 3) | 0);
  const bolts = Array.from({ length: n }, (_, i) => bolt(60 + Math.random() * 90, (i / n) * Math.PI * 2 + Math.random() * 0.6)).join('');
  const zap = document.createElement('div');
  zap.className = 'zap';
  zap.style.left = `${x}px`;
  zap.style.top = `${y}px`;
  zap.innerHTML = `<svg viewBox="-160 -160 320 320"><g class="glow">${bolts}</g><g class="core">${bolts}</g><circle r="10"/></svg>`;
  const flash = document.createElement('div');
  flash.className = 'zap-flash';
  flash.style.setProperty('--x', `${x}px`);
  flash.style.setProperty('--y', `${y}px`);
  document.body.append(flash, zap);
  const html = document.documentElement;
  html.classList.remove('jolt'); void html.offsetWidth; html.classList.add('jolt');
  setTimeout(() => { zap.remove(); flash.remove(); html.classList.remove('jolt'); }, 650);
}

if (typeof document !== 'undefined') {
  // Capture phase, so the touch never reaches what's underneath (a phone button, the game).
  document.addEventListener('pointerdown', (e) => {
    const hit = e.target.closest?.('.crack-hit');
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    if (now - last < 450) return;
    last = now;
    shockAt(e.clientX, e.clientY);
    handler({ where: hit.closest('.phone') ? 'phone' : 'visor' });
  }, true);
  // The click that follows must not land on a button under the crack either.
  document.addEventListener('click', (e) => { if (e.target.closest?.('.crack-hit')) { e.preventDefault(); e.stopPropagation(); } }, true);
}
