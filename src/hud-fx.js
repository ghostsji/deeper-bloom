import { SYSTEMS } from './hud-systems.js';
import { glitchSound, staticSound, rebootSound, setVisorHum } from './audio.js';

// The visor HUD: corner brackets, scanlines and cracked glass over the view, glitches on the
// systems the flood damaged, the compass (once Navigation is back) and the boot-up flash when a
// system is restored. Game state comes in through update(); text that can be scrambled goes
// through text().

const GLYPHS = '░▒▓#%&@$<>/\\|=+*¤§';
const scramble = (s, p) => s.replace(/\S/g, (ch) => (Math.random() < p ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : ch));

// Branching crack lines from a few impact points, the same every time (seeded).
function cracks(w, h, seed) {
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const paths = [];
  const branch = (x, y, ang, len, depth) => {
    let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
    for (let i = 0; i < 6; i++) {
      ang += (rnd() - 0.5) * 0.7;
      x += Math.cos(ang) * len / 6; y += Math.sin(ang) * len / 6;
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      if (depth < 2 && rnd() < 0.3) branch(x, y, ang + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), len * 0.45, depth + 1);
    }
    paths.push(`<path d="${d}" stroke-width="${(2.2 - depth * 0.7).toFixed(1)}"/>`);
  };
  for (const [cx, cy, n] of [[w * 0.86, h * 0.16, 7], [w * 0.1, h * 0.78, 5], [w * 0.62, h * 0.9, 3]]) {
    paths.push(`<circle cx="${cx}" cy="${cy}" r="${6 + n}" fill="rgba(200,240,240,.08)" stroke-width="1"/>`);
    for (let i = 0; i < n; i++) branch(cx, cy, (i / n) * Math.PI * 2 + rnd(), (0.18 + rnd() * 0.22) * w, 0);
  }
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" fill="none" stroke="rgba(214,246,244,.55)" stroke-linecap="round" stroke-linejoin="round">${paths.join('')}</svg>`;
}
export const crackSvg = cracks;

// Which HUD elements each system drives.
const PARTS = { vitals: ['.stats'], comms: ['#subtitle'], ledger: ['.lumen', '.datacount'], depth: ['.depthbox'], lens: ['#lens'], nav: ['#compass'], sensor: [], visor: [] };

export function createHudFx(root, systems) {
  const $ = (q) => root.querySelector(q);
  const visor = $('#visor');
  visor.innerHTML = `<div class="v-cracks">${cracks(1600, 900, 7)}</div><div class="v-scan"></div><div class="v-static"></div>
    <i class="v-corner tl"></i><i class="v-corner tr"></i><i class="v-corner bl"></i><i class="v-corner br"></i><div class="v-flash"></div>`;
  const integrityEl = $('#integrity');

  // ---- Compass ----
  const compass = $('#compass');
  compass.innerHTML = `<div class="cmp-ticks"></div><div class="cmp-labels"></div><div class="cmp-marks"></div><b class="cmp-needle"></b>
    <span class="cmp-off">NAV OFFLINE · build a research station to restore</span>`;
  const ticks = compass.querySelector('.cmp-ticks');
  const NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const labels = NAMES.map((n) => {
    const s = document.createElement('span');
    s.textContent = n;
    if (n.length === 1) s.className = 'major';
    compass.querySelector('.cmp-labels').append(s);
    return s;
  });
  const markPool = [];
  const marks = compass.querySelector('.cmp-marks');
  const HALF_FOV = Math.PI / 3; // the strip shows 120 degrees
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function renderCompass(heading, points) {
    const w = compass.clientWidth || 520;
    const px = (a) => w / 2 + (wrap(a - heading) / HALF_FOV) * (w / 2);
    // 15-degree ticks: shift the repeating background with the heading.
    ticks.style.backgroundPosition = `${(-heading / (Math.PI / 12)) * (w / 2 / (HALF_FOV / (Math.PI / 12))) + w / 2}px 0`;
    labels.forEach((el, i) => {
      const a = (i / 8) * Math.PI * 2, d = Math.abs(wrap(a - heading));
      el.style.opacity = d < HALF_FOV ? 1 - (d / HALF_FOV) ** 3 : 0;
      el.style.transform = `translateX(${px(a)}px) translateX(-50%)`;
    });
    points.forEach((p, i) => {
      let m = markPool[i];
      if (!m) { m = document.createElement('span'); marks.append(m); markPool.push(m); }
      const d = Math.abs(wrap(p.bearing - heading));
      m.className = `mark ${p.kind}`;
      m.hidden = d > HALF_FOV;
      m.style.transform = `translateX(${px(p.bearing)}px) translateX(-50%)`;
      m.dataset.dist = p.dist != null ? `${Math.round(p.dist)}m` : '';
    });
    for (let i = points.length; i < markPool.length; i++) markPool[i].hidden = true;
  }

  // ---- Glitches ----
  const texts = new Map(); // element -> { text, prefix, sys }
  const bursts = Object.fromEntries(SYSTEMS.map((s) => [s.id, { next: 1 + Math.random() * 4, until: 0 }]));
  let staticUntil = 0, nextStatic = 4, booted = false, humClock = 0;

  function paint(el) {
    const t = texts.get(el);
    const sys = t.sys && !systems.online(t.sys) ? t.sys : null;
    // Damaged readouts break up badly in a burst and a little the rest of the time.
    const p = !sys ? 0 : bursts[sys].until > now ? 0.55 : sys === 'comms' ? 0.1 : 0;
    const shown = p ? scramble(t.text, p) : t.text;
    if (t.prefix) el.innerHTML = `${t.prefix}${shown.replace(/</g, '&lt;')}`; else el.textContent = shown;
  }
  let now = 0;

  /** Shows text in a HUD readout that the given system's damage can scramble. */
  function text(el, value, sys, prefix = '') {
    const t = texts.get(el);
    if (t && t.text === value && t.prefix === prefix) return;
    texts.set(el, { text: value, prefix, sys });
    paint(el);
  }

  function setParts() {
    for (const s of SYSTEMS) for (const q of PARTS[s.id]) root.querySelectorAll(q).forEach((el) => el.classList.toggle('dmg', !systems.online(s.id)));
    compass.classList.toggle('offline', !systems.online('nav'));
    visor.style.setProperty('--crack', systems.online('visor') ? 0 : Math.max(0.25, 0.75 - systems.integrity * 0.5));
    const pct = Math.round(systems.integrity * 100);
    integrityEl.innerHTML = `<span>SYS</span><i style="--v:${systems.integrity}"></i><b>${pct}%</b>`;
    integrityEl.classList.toggle('full', pct === 100);
  }

  /** A system just came back: reboot its parts with a flash. */
  function restore(sys) {
    for (const q of PARTS[sys.id]) root.querySelectorAll(q).forEach((el) => {
      el.classList.remove('boot'); void el.offsetWidth; el.classList.add('boot');
      setTimeout(() => el.classList.remove('boot'), 1400);
    });
    rebootSound();
    const f = visor.querySelector('.v-flash');
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
    setParts();
    for (const el of texts.keys()) paint(el);
  }

  return {
    text,
    restore,
    refresh() { setParts(); for (const el of texts.keys()) paint(el); },
    // info: { heading, points: [{ kind, bearing, dist }], playing }
    update(dt, t, info) {
      now = t;
      if (!booted) { setParts(); booted = true; }
      const damage = 1 - systems.integrity;
      for (const s of SYSTEMS) {
        if (systems.online(s.id)) continue;
        const b = bursts[s.id];
        if (t >= b.next) {
          b.until = t + 0.12 + Math.random() * 0.3;
          b.next = b.until + (2 + Math.random() * 6) / (0.4 + damage);
          for (const q of PARTS[s.id]) root.querySelectorAll(q).forEach((el) => el.classList.add('glitch'));
          // Heard only while you're playing, and only for parts you can see (the compass when it's
          // offline, Echo's subtitles while she's talking...).
          if (info.playing && PARTS[s.id].some((q) => [...root.querySelectorAll(q)].some((el) => el.offsetParent && getComputedStyle(el).opacity > 0.1))) glitchSound(0.6 + damage * 0.4);
          for (const [el, tx] of texts) if (tx.sys === s.id) paint(el);
        } else if (b.until && t >= b.until) {
          b.until = 0;
          for (const q of PARTS[s.id]) root.querySelectorAll(q).forEach((el) => el.classList.remove('glitch'));
          for (const [el, tx] of texts) if (tx.sys === s.id) paint(el);
        }
      }
      // The whole visor fuzzes now and then, less as it's repaired.
      if (info.playing && damage > 0 && t >= nextStatic) {
        staticUntil = t + 0.08 + Math.random() * 0.15;
        staticSound(staticUntil - t);
        nextStatic = staticUntil + (3 + Math.random() * 9) / damage;
      }
      visor.classList.toggle('fuzz', t < staticUntil);
      // The damage hum, a few times a second: louder the more is broken, a crack whistle while
      // the glass is cracked, silent behind menus and once everything is fixed.
      if ((humClock -= dt) <= 0) {
        humClock = 0.25;
        setVisorHum({ damage, cracked: !systems.online('visor'), on: info.playing });
      }
      if (systems.online('nav')) renderCompass(info.heading, info.points);
    },
  };
}
