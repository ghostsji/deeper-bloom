import { SYSTEMS } from './hud-systems.js';
import { glitchSound, staticSound, rebootSound, setVisorHum } from './audio.js';

// The visor HUD: corner brackets, scanlines and cracked glass over the view, glitches on the
// systems the flood damaged, the compass (once Navigation is back) and the boot-up flash when a
// system is restored. Game state comes in through update(); text that can be scrambled goes
// through text().

const GLYPHS = '░▒▓#%&@$<>/\\|=+*¤§';
const SETTLE = 1.4; // seconds before a new subtitle decodes
const scramble = (s, p) => s.replace(/\S/g, (ch) => (Math.random() < p ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : ch));

// Shattered glass, the same every time (seeded): at each impact point a crushed core of shards,
// jagged rings of stress fractures, and long branching cracks. Every crack is drawn as a dark
// shadow plus a bright edge (so the glass has depth), with glints where light catches it. The
// crack lines are repeated as wide invisible "hit" strokes, so touching them can shock you.
function cracks(w, h, seed, impacts = [[0.86, 0.16, 7], [0.1, 0.78, 5], [0.62, 0.9, 3]], grow = false) {
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const f = (v) => v.toFixed(1);
  const lines = [], shards = [], glints = [], rings = [];
  const branch = (x, y, ang, len, depth) => {
    let d = `M${f(x)} ${f(y)}`;
    for (let i = 0; i < 6; i++) {
      ang += (rnd() - 0.5) * 0.7;
      x += Math.cos(ang) * len / 6; y += Math.sin(ang) * len / 6;
      d += ` L${f(x)} ${f(y)}`;
      if (rnd() < 0.18) glints.push([x, y, 1 + rnd() * 2.5]);
      if (depth < 2 && rnd() < 0.32) branch(x, y, ang + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), len * 0.45, depth + 1);
    }
    lines.push([d, 2.4 - depth * 0.75]);
  };
  for (const [fx, fy, n] of impacts) {
    const cx = w * fx, cy = h * fy, size = Math.min(w, h) * (0.015 + n * 0.004);
    // The crushed core: little triangles of frosted glass.
    for (let i = 0; i < 10 + n * 2; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * size, s2 = size * (0.25 + rnd() * 0.5);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const pts = [0, 1, 2].map((k) => { const b = a + k * 2.1 + rnd() * 0.8; return `${f(x + Math.cos(b) * s2)},${f(y + Math.sin(b) * s2)}`; }).join(' ');
      shards.push(`<polygon points="${pts}" fill="rgba(225,250,248,${(0.05 + rnd() * 0.16).toFixed(2)})" stroke="rgba(235,255,252,.5)" stroke-width=".6"/>`);
    }
    // Stress rings: jagged, broken loops around the impact.
    for (const k of [1.8, 3.4, 5.6].slice(0, n > 4 ? 3 : 2)) {
      const rad = size * k;
      let d = '', on = false;
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 2, rr = rad * (0.85 + rnd() * 0.3);
        if (rnd() < 0.22) { on = false; continue; } // gaps: the ring is broken
        d += `${on ? 'L' : 'M'}${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)} `;
        on = true;
      }
      rings.push([d, 1.1]);
    }
    for (let i = 0; i < n; i++) branch(cx, cy, (i / n) * Math.PI * 2 + rnd(), (0.18 + rnd() * 0.22) * w, 0);
  }
  const all = [...lines, ...rings];
  const draw = (stroke, dx, extra = 0) => all.map(([d, sw]) => `<path d="${d}" stroke="${stroke}" stroke-width="${f(sw + extra)}"${grow ? ' pathLength="1"' : ''}${dx ? ` transform="translate(${dx} ${dx})"` : ''}/>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g class="crack-shadow">${draw('rgba(0,10,14,.45)', 1.2, 0.8)}</g>
    <g class="crack-edge">${draw('rgba(214,246,244,.6)', 0)}</g>
    <g class="crack-shards">${shards.join('')}</g>
    <g class="crack-glints">${glints.map(([x, y, s2]) => `<path d="M${f(x - s2 * 2)} ${f(y)}H${f(x + s2 * 2)}M${f(x)} ${f(y - s2 * 2)}V${f(y + s2 * 2)}" stroke="#fff" stroke-width=".8" style="--d:${(rnd() * 4).toFixed(2)}s"/>`).join('')}</g>
    <g class="crack-hit">${lines.map(([d]) => `<path d="${d}"/>`).join('')}${impacts.map(([fx, fy, n]) => `<circle cx="${f(w * fx)}" cy="${f(h * fy)}" r="${f(Math.min(w, h) * (0.015 + n * 0.004) * 2)}"/>`).join('')}</g>
  </svg>`;
}
export const crackSvg = cracks;

// Which HUD elements each system drives.
const PARTS = { vitals: ['.stats'], comms: ['#subtitle'], ledger: ['.lumen', '.datacount'], depth: ['.depthbox'], lens: ['#lens'], nav: ['#compass'], sensor: [], visor: [] };

export function createHudFx(root, systems) {
  const $ = (q) => root.querySelector(q);
  const visor = $('#visor');
  visor.innerHTML = `<div class="v-cracks">
      <div class="v-bleed b1"></div><div class="v-bleed b2"></div><div class="v-bleed b3"></div>
      <div class="v-band"></div><div class="v-deadpx"></div>
      <div class="v-water"><svg viewBox="0 0 1600 60" preserveAspectRatio="none"><path d="M0 30 Q100 10 200 30 T400 30 T600 30 T800 30 T1000 30 T1200 30 T1400 30 T1600 30 V60 H0Z"/></svg>
        ${Array.from({ length: 7 }, (_, i) => `<i class="drop" style="left:${8 + i * 13 + (i % 3) * 3}%;--d:${(i * 1.7) % 6}s;--t:${4 + (i % 4)}s"></i>`).join('')}</div>
      ${cracks(1600, 900, 7)}</div>
    <div class="v-stress">${[[0.32, 0.3, 4], [0.72, 0.55, 4], [0.45, 0.72, 5]].map((imp, i) => `<div class="v-stress-layer" data-l="${i + 1}">${cracks(1600, 900, 31 + i * 7, [imp], true)}</div>`).join('')}</div>
    <div class="v-leak"><svg viewBox="0 0 1600 40" preserveAspectRatio="none"><path d="M0 20 Q80 6 160 20 T320 20 T480 20 T640 20 T800 20 T960 20 T1120 20 T1280 20 T1440 20 T1600 20 V40 H0Z"/></svg>
      ${Array.from({ length: 9 }, (_, i) => `<i class="bub" style="left:${6 + i * 11}%;--d:${(i * 0.7) % 3}s"></i>`).join('')}</div>
    <div class="v-blight">${Array.from({ length: 7 }, (_, i) => `<i style="--x:${[8, 82, 22, 70, 48, 4, 90][i]}%;--y:${[12, 8, 80, 74, 6, 46, 44][i]}%;--n:${i}"></i>`).join('')}</div>
    <div class="v-ears"></div>
    <div class="v-fog"></div><div class="v-tunnel"></div><div class="v-glare"></div><div class="v-phantom"></div>
    <div class="v-scan"></div><div class="v-static"></div>
    <i class="v-corner tl"></i><i class="v-corner tr"></i><i class="v-corner bl"></i><i class="v-corner br"></i><div class="v-flash"></div>`;
  const integrityEl = $('#integrity');
  const powerEl = $('#power'), strainEl = $('#strain'), cmpOff = () => compass.querySelector('.cmp-off');
  let suit = null; // { power, charging, unpowered(id), crackLayers, stress, leak, sealed }
  const powered = (id) => !suit || !suit.unpowered(id);

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
    let p = Math.max(!sys ? 0 : bursts[sys].until > now ? 0.55 : sys === 'comms' ? 0.1 : 0, t.sys === 'comms' ? Math.max(air * 0.5, (1 - signal) * 0.6) : 0);
    // Echo's lines arrive broken up, then decode: after a moment only a little noise is left,
    // so what she says can always be read. With Readable text on, nothing is scrambled.
    if (t.settle && now - t.at > SETTLE) p = Math.min(p, 0.04);
    if (readable) p = 0;
    const shown = p ? scramble(t.text, p) : t.text;
    if (t.prefix) el.innerHTML = `${t.prefix}${shown.replace(/</g, '&lt;')}`; else el.textContent = shown;
  }
  let signal = 1, readable = false;
  let now = 0, air = 0, phantomUntil = 0, shortUntil = 0, lieDepth = null;
  function shortCircuit() {
    const kind = ['mirror', 'swap', 'lie'][(Math.random() * 3) | 0];
    shortUntil = now + 3;
    staticSound(0.15);
    if (kind === 'mirror') { compass.classList.add('mirror'); setTimeout(() => compass.classList.remove('mirror'), 3000); }
    if (kind === 'swap') { const st2 = root.querySelector('.stats'); st2.classList.add('swapped'); setTimeout(() => st2.classList.remove('swapped'), 3000); }
    if (kind === 'lie') { lieDepth = `${(5 + Math.random() * 60).toFixed(1)} m`; setTimeout(() => { lieDepth = null; }, 3000); }
  }
  const heatEl = $('#heat'), phantom = visor.querySelector('.v-phantom');

  /** Shows text in a HUD readout that the given system's damage can scramble. */
  function text(el, value, sys, prefix = '') {
    if (lieDepth && sys === 'depth') value = lieDepth;
    const t = texts.get(el);
    if (t && t.text === value && t.prefix === prefix) return;
    texts.set(el, { text: value, prefix, sys, at: now, settle: el.id === 'subtitle', settled: false });
    paint(el);
  }

  function setParts() {
    for (const s of SYSTEMS) for (const q of PARTS[s.id]) root.querySelectorAll(q).forEach((el) => el.classList.toggle('dmg', !systems.online(s.id)));
    compass.classList.toggle('offline', !systems.online('nav') || !powered('nav'));
    if (cmpOff()) cmpOff().textContent = !systems.online('nav') ? 'NAV OFFLINE · build a research station to restore' : 'NAV · NO POWER · recharge your visor';
    visor.classList.toggle('sealed', systems.online('visor')); // fixed glass can't shock you
    visor.style.setProperty('--crack', systems.online('visor') ? 0 : Math.max(0.25, 0.75 - systems.integrity * 0.5));
    const pct = Math.round(systems.integrity * 100);
    const nReady = systems.ready.length;
    integrityEl.innerHTML = `<span>SYS</span><i style="--v:${systems.integrity}"></i><b>${pct}%${nReady ? ` <em>+${nReady} V</em>` : ''}</b>`;
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
    /** Echo's signal (0 none .. 1 full): her subtitles break up as it weakens; bars top left. */
    setSignal(v) {
      const was = signal;
      signal = v;
      if (Math.abs(was - v) > 0.03) for (const [el, tx] of texts) if (tx.sys === 'comms') paint(el);
      const bars = v <= 0.02 ? 0 : Math.ceil(v * 4);
      const el = root.querySelector('#signal');
      const html = `<span>ECHO</span>${[1, 2, 3, 4].map((i) => `<i class="${i <= bars ? 'on' : ''}" style="height:${3 + i * 3}px"></i>`).join('')}${bars ? '' : '<b>NO SIGNAL</b>'}`;
      if (el.innerHTML !== html) el.innerHTML = html;
      el.classList.toggle('weak', bars <= 1);
    },
    /** Running out of air (0 fine .. 1 about to black out): the HUD breaks down with you. */
    setAir(a, playing) {
      const was = air;
      air = playing ? a : 0;
      visor.style.setProperty('--air', air.toFixed(3));
      visor.classList.toggle('airfail', air > 0.05);
      // Readouts drop out at random, more often the worse it gets.
      for (const q of ['.lumen', '.datacount', '.depthbox', '.stats', '#compass', '#tutorial']) {
        const el = root.querySelector(q);
        if (!el) continue;
        if (air > 0.35 && Math.random() < air * 0.04) el.classList.toggle('airdrop');
        if (air <= 0.35) el.classList.remove('airdrop');
      }
      if (Math.abs(was - air) > 0.02) for (const [el, tx] of texts) if (tx.sys === 'comms') paint(el);
      // Near the end: things that aren't there.
      if (air > 0.75 && now > phantomUntil && Math.random() < 0.012) {
        const kinds = ['eel', 'marker', 'restored', 'echo'];
        const k = kinds[(Math.random() * kinds.length) | 0];
        phantom.className = `v-phantom on ${k}`;
        phantom.style.left = `${15 + Math.random() * 70}%`;
        phantom.style.top = `${20 + Math.random() * 55}%`;
        phantom.textContent = k === 'restored' ? 'SYSTEM RESTORED: ▒▒▒▒' : k === 'echo' ? "ECHO: I'm right behind you." : '';
        phantomUntil = now + 1.6;
        setTimeout(() => { phantom.className = 'v-phantom'; }, 1300);
      }
    },
    /** The suit's state each frame: battery, systems cut for power, pressure cracks, the leak. */
    setSuit(st) {
      const was = suit;
      suit = st;
      const pct = Math.round(st.power);
      const pHtml = `<span>PWR${st.charging ? ' <em>⚡</em>' : ''}</span><i style="--v:${st.power / 100}"></i><b>${pct}%</b>`;
      if (powerEl.innerHTML !== pHtml) powerEl.innerHTML = pHtml;
      powerEl.classList.toggle('low', pct <= 30);
      powerEl.classList.toggle('crit', pct <= 10);
      for (const s2 of SYSTEMS) for (const q of PARTS[s2.id]) root.querySelectorAll(q).forEach((el) => el.classList.toggle('nopower', !powered(s2.id)));
      if (!was || was.unpowered('nav') !== st.unpowered('nav')) setParts();
      root.querySelectorAll('.v-stress-layer').forEach((el) => el.classList.toggle('on', st.crackLayers >= Number(el.dataset.l)));
      visor.style.setProperty('--leak', st.leak.toFixed(3));
      visor.classList.toggle('leaking', st.leak > 0.01);
      strainEl.hidden = st.sealed || st.stress <= 0.01;
      strainEl.style.setProperty('--s', st.stress.toFixed(3));
      strainEl.classList.toggle('max', st.stress >= 1);
      visor.style.setProperty('--fog', (st.fog ?? 0).toFixed(3));
      // Blight creeps in from the edges; readouts under it go dark as it spreads.
      const bl = st.blight ?? 0;
      visor.style.setProperty('--blight', bl.toFixed(3));
      const BLIGHTED = [['.lumen', 0.3], ['.datacount', 0.3], ['.depthbox', 0.55], ['#compass', 0.7], ['.stats', 0.85]];
      for (const [q, at] of BLIGHTED) root.querySelector(q)?.classList.toggle('blighted', bl >= at);
      visor.style.setProperty('--ears', (st.ears ?? 0).toFixed(3));
      const tw = root.querySelector('#suitwarn');
      const clk = root.querySelector('#clock');
      if (st.clock && clk.textContent !== st.clock) clk.textContent = st.clock;
      const warn = [st.tears ? `SUIT TORN ×${st.tears}` : '', bl > 0.05 ? `BLIGHT ${Math.round(bl * 100)}%` : '', (st.ears ?? 0) > 0.4 ? 'EQUALISE' : ''].filter(Boolean).join(' · ');
      if (tw.textContent !== warn) tw.textContent = warn;
      tw.hidden = !warn;
      // A wet visor shorts out now and then: parts of the HUD swap, mirror or lie.
      if ((st.visorWet ?? 0) > 0.05 && now > shortUntil && Math.random() < 0.004 * st.visorWet) shortCircuit();
      visor.classList.toggle('glare', !!st.overheated);
      const hp = Math.round((st.heat ?? 0) * 100);
      const hHtml = `<span>TEMP</span><i style="--v:${(st.heat ?? 0).toFixed(3)}"></i><b>${st.overheated ? 'HOT' : `${hp}%`}</b>`;
      if (heatEl.innerHTML !== hHtml) heatEl.innerHTML = hHtml;
      heatEl.classList.toggle('warm', hp >= 70);
      heatEl.classList.toggle('hot', !!st.overheated);
    },
    refresh() { setParts(); for (const el of texts.keys()) paint(el); },
    /** Readable text (Options): HUD text is never scrambled. The rest of the damage still shows. */
    setReadable(v) { readable = !!v; for (const el of texts.keys()) paint(el); },
    // info: { heading, points: [{ kind, bearing, dist }], playing }
    update(dt, t, info) {
      now = t;
      for (const [el, tx] of texts) if (tx.settle && !tx.settled && now - tx.at > SETTLE) { tx.settled = true; paint(el); }
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
      if (systems.online('nav') && powered('nav')) renderCompass(info.heading, info.points);
    },
  };
}
