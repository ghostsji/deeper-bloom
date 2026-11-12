// Hover tooltips for anything with a data-tip attribute (the phone, menus, Options). They
// show while the mouse is free, after a short pause, next to the cursor. data-tip may hold
// simple HTML (<b>, <kbd>, <br>).
let enabled = true;
export function setTooltips(on) { enabled = on; if (!on) hide(); }

let tip = null, target = null, timer = 0, x = 0, y = 0;
const DELAY = 350;

function place() {
  const pad = 14, r = tip.getBoundingClientRect();
  let left = x + pad, top = y + pad;
  if (left + r.width > innerWidth - 8) left = x - r.width - pad;
  if (top + r.height > innerHeight - 8) top = y - r.height - pad;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}
function show() {
  if (!enabled || !target?.isConnected || document.pointerLockElement) return;
  tip.innerHTML = target.dataset.tip;
  tip.hidden = false;
  place();
  tip.classList.add('show');
}
function hide() {
  clearTimeout(timer);
  target = null;
  if (tip) { tip.classList.remove('show'); tip.hidden = true; }
}

if (typeof document !== 'undefined') {
  tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  document.body.append(tip);

  document.addEventListener('pointermove', (e) => {
    x = e.clientX; y = e.clientY;
    const el = e.target.closest?.('[data-tip]');
    if (el !== target) {
      hide();
      target = el;
      if (el) timer = setTimeout(show, DELAY);
    } else if (!tip.hidden) place();
  });
  // Clicking, scrolling or a re-render can move things out from under the tip.
  for (const type of ['pointerdown', 'wheel', 'keydown']) addEventListener(type, hide, true);
  document.addEventListener('pointerleave', hide);
  document.addEventListener('pointerlockchange', hide);
}
