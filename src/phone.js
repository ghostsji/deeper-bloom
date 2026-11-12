import { SPECIES, RESEARCH } from './research.js';
import { ITEMS, GEAR, gearMax, bagSize } from './survival.js';
import * as progress from './progress.js';

// The diver's phone: Deep Bloom's app on a ruggedised handset. Tab brings it up, and the
// game pauses while it's out. Four tabs: build, research, codex and status.

const ICONS = {
  build: '<path d="M3 20h18M5 20V10l7-5 7 5v10M9 20v-6h6v6"/>',
  research: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M11 8v6M8 11h6"/>',
  codex: '<path d="M3 12c4-6 12-6 15 0-3 6-11 6-15 0zM18 12l4-4v8z"/>',
  status: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  goals: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
  skills: '<path d="M12 3v6M12 9l-5 5M12 9l5 5M7 14v5M17 14v5"/><circle cx="12" cy="3" r="1"/>',
};
const TABS = [['build', 'Build'], ['research', 'Research'], ['codex', 'Codex'], ['status', 'Status'], ['goals', 'Goals'], ['skills', 'Skills']];
const svg = (id) => `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg>`;

// What each build piece is for, shown on its card.
export const PIECE_INFO = {
  raft: 'A floating deck. Stand on it, build on it.',
  station: 'Spend Data on research. Stand next to it.',
  fire: 'Cooks everything raw in your bag.',
  kelpfarm: 'Grows a strand of kelp every 45 seconds.',
  workbench: `Repairs your harpoon with ${GEAR.harpoon.repair} kelp.`,
  lantern: 'A warm light for your raft.',
  planter: 'Pink bloom coral in a tub.',
  buoy: 'Floats on open water to mark a spot.',
  jellylamp: 'A slow pink pulse of light.',
  garden: 'Grows coral and 1 Lumen every 10 seconds.',
};
const SPECIES_TINT = { polyp: '#5CF2D6', lanternfish: '#FFC46B', jelly: '#FF8FD0', kelp: '#6FE3A5', branch: '#8F7BFF', brain: '#9DB8FF', silverfin: '#BCD8E0', eel: '#FF9A5C', echo: '#F4EEE6' };

export function createPhone(el, g) {
  // g: { research, survival, builder, costFor, lumen(), nearStation(), placing(), onPick(id),
  //      onStopBuilding(), onResearch(id), onEat(id), onBuy(skillId), onClose() }
  let tab = 'build';

  el.innerHTML = `
    <div class="phone-case">
      <div class="phone-screen">
        <header class="phone-hud">
          <div><div class="label">Lumen</div><div class="big cyan" data-lumen></div></div>
          <div class="phone-chips"><span class="chip gold" data-data></span><span class="chip pink" data-bagchip></span><span class="chip cyan" data-bloom></span></div>
        </header>
        <section class="phone-body" data-body></section>
        <nav class="phone-tabs">${TABS.map(([id, name]) => `<button type="button" data-tab="${id}">${svg(id)}${name}</button>`).join('')}</nav>
      </div>
    </div>
    <p class="phone-hint">Tab or Esc to put it away</p>`;
  const body = el.querySelector('[data-body]');

  function renderBuild() {
    const placing = g.placing();
    const cards = g.builder.available().map((p) => {
      const cost = g.costFor(p.id), poor = g.lumen() < cost, on = placing === p.id;
      return `<button type="button" class="pcard piece${on ? ' on' : ''}${poor ? ' poor' : ''}" data-pick="${p.id}">
        <div class="row"><b>${p.name}</b><span class="cost">${cost} Lumen</span></div>
        <p>${PIECE_INFO[p.id] || ''}</p></button>`;
    }).join('');
    return `<div class="label pad">Build on the water</div>
      <p class="sub">Pick a piece, then aim at the water from the surface. Left-click to place, right-click to take back.</p>
      <div class="plist">${cards}</div>
      ${placing ? '<button type="button" class="btn" data-stop>Stop building</button>' : ''}`;
  }

  function renderResearch() {
    const at = g.nearStation();
    const cards = RESEARCH.map((r) => {
      const owned = g.research.isUnlocked(r.id);
      const needs = r.needs.map((id) => `<span class="chip ${g.research.complete(id) ? 'ok' : 'dim'}">${SPECIES.find((s) => s.id === id).name}</span>`).join('');
      const action = owned ? '<span class="owned">Researched</span>'
        : `<button type="button" class="btn small" data-research="${r.id}" ${at && g.research.canResearch(r.id) ? '' : 'disabled'}>Research · ${r.cost} Data</button>`;
      return `<div class="pcard${owned ? ' done' : ''}"><div class="row"><b>${r.name}</b></div><p>${r.desc}</p><div class="needs">${needs}</div>${action}</div>`;
    }).join('');
    return `<div class="label pad">Research</div>
      ${at ? '<p class="sub cyan">Linked to your research station.</p>' : '<p class="note">Not linked. Stand next to a research station on your raft to research.</p>'}
      <div class="plist">${cards}</div>`;
  }

  function renderCodex() {
    const done = SPECIES.filter((s) => g.research.complete(s.id)).length;
    const grid = SPECIES.map((s) => {
      const n = g.research.counts[s.id] || 0;
      return `<div class="cchip${n ? '' : ' dim'}"><i style="background:${n ? SPECIES_TINT[s.id] : 'var(--track)'}"></i><b>${n ? s.name : '???'}</b><span>${n}/${s.need}</span></div>`;
    }).join('');
    const entries = SPECIES.filter((s) => g.research.counts[s.id]).map((s) => {
      const full = g.research.complete(s.id);
      return `<div class="pcard${full ? ' done' : ''}"><div class="row"><b>${s.name}</b><span class="small">${full ? 'Complete' : `${g.research.counts[s.id]} / ${s.need}`}</span></div>
        <p>${full ? s.text : 'Scan more of them to complete this entry.'}</p></div>`;
    }).join('');
    return `<div class="collection">
        <div class="row"><span class="label">Codex</span><span class="small muted">${done} / ${SPECIES.length} complete</span></div>
        <div class="cgrid">${grid}</div>
        <div class="bar"><div class="fill" style="width:${(done / SPECIES.length) * 100}%"></div></div>
      </div>
      <p class="sub">Hold right mouse to raise the Echo Lens, then hold left mouse on something to scan it.</p>
      <div class="plist">${entries}</div>`;
  }

  function renderStatus() {
    const s = g.survival.stats, bag = g.survival.bag;
    const meter = (name, v, cls) => `<div class="meter"><div class="row"><span class="label">${name}</span><b>${Math.round(v)}</b></div><div class="bar"><div class="fill ${cls}" style="width:${v}%"></div></div></div>`;
    const items = Object.keys(ITEMS).filter((k) => bag[k]).map((k) => {
      const it = ITEMS[k];
      return `<div class="pcard"><div class="row"><b>${it.name} <span class="muted">×${bag[k]}</span></b>
        <button type="button" class="btn small" data-eat="${k}">Eat</button></div>
        <p>+${it.food} food${it.health ? `, ${it.health > 0 ? '+' : ''}${it.health} health` : ''}</p></div>`;
    }).join('');
    return `<div class="label pad">Status</div>
      ${meter('Health', s.health, 'pink-bg')}${meter('Breath', s.breath, 'cyan-bg')}${meter('Food', s.food, 'gold-bg')}
      <div class="label pad">Gear</div>
      ${meter(`Harpoon ${g.survival.gear.harpoon <= 0 ? '(broken)' : ''}`, (g.survival.gear.harpoon / gearMax('harpoon')) * 100, '')}
      <p class="sub">Press 1 to raise it. Repair at a workbench with ${GEAR.harpoon.repair} kelp.</p>
      <div class="row"><span class="label">Bag</span><span class="small muted">${g.survival.bagCount} / ${bagSize()}</span></div>
      <div class="plist">${items || '<p class="sub">Empty. Grab silverfin or strip kelp underwater with left-click.</p>'}</div>`;
  }

  // Endless achievements: each line's next tier, how close you are, and what it pays.
  function renderGoals() {
    const p = progress.snapshot();
    const cards = p.achievements.map((a) => `<div class="pcard${a.tier ? ' done' : ''}">
        <div class="row"><b>${a.name}</b><span class="small gold">+${a.reward} Bloom</span></div>
        <p>${a.desc}</p>
        <div class="bar"><div class="fill" style="width:${a.progress * 100}%"></div></div>
        <div class="row small muted" style="margin-top:6px"><span>${a.value} / ${a.goal}</span><span>${a.tier} tier${a.tier === 1 ? '' : 's'} done</span></div>
      </div>`).join('');
    return `<div class="label pad">Goals</div>
      <p class="sub">Every goal has endless tiers. Each tier pays Bloom points to spend on Skills.</p>
      <div class="plist">${cards}</div>`;
  }

  // Skill trees bought with Bloom points.
  function renderSkills() {
    const p = progress.snapshot();
    const trees = p.trees.map((t) => `<div class="label pad">${t.name}</div>
      <div class="plist">${t.nodes.map((n) => `<div class="pcard${n.rank ? ' done' : ''}${n.unlocked ? '' : ' locked'}">
          <div class="row"><b>${n.name}</b><span class="small ${n.rank ? 'cyan' : 'muted'}">${n.rank} / ${n.max}</span></div>
          <p>${n.desc}</p>
          ${n.requires.length ? `<div class="needs">${n.requires.map((r) => `<span class="chip ${n.unlocked ? 'ok' : 'dim'}">Needs ${r}</span>`).join('')}</div>` : ''}
          ${n.rank >= n.max ? '<span class="owned">Mastered</span>'
            : `<button type="button" class="btn small" data-buy="${n.id}" ${n.can ? '' : 'disabled'}>Learn · ${n.cost} Bloom</button>`}
        </div>`).join('')}</div>`).join('');
    return `<div class="note">${p.points} Bloom points to spend. Earn more from Goals.</div>${trees}`;
  }

  const RENDER = { build: renderBuild, research: renderResearch, codex: renderCodex, status: renderStatus, goals: renderGoals, skills: renderSkills };

  function render() {
    el.querySelector('[data-lumen]').textContent = g.lumen().toLocaleString();
    el.querySelector('[data-data]').textContent = `${g.research.data} Data`;
    el.querySelector('[data-bloom]').textContent = `${progress.points()} Bloom`;
    el.querySelector('[data-bagchip]').textContent = `Bag ${g.survival.bagCount}/${bagSize()}`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.toggleAttribute('aria-current', b.dataset.tab === tab));
    const scroll = body.scrollTop;
    body.innerHTML = RENDER[tab]();
    body.scrollTop = scroll;
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; body.scrollTop = 0; render(); return; }
    if (b.dataset.pick) { g.onPick(b.dataset.pick); return; }
    if ('stop' in b.dataset) { g.onStopBuilding(); render(); return; }
    if (b.dataset.research) { g.onResearch(b.dataset.research); render(); return; }
    if (b.dataset.eat) { g.onEat(b.dataset.eat); render(); }
    if (b.dataset.buy) { g.onBuy(b.dataset.buy); render(); }
  });

  return {
    get open() { return el.classList.contains('up'); },
    show(which) {
      if (which) tab = which;
      render();
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add('up'));
    },
    hide() {
      el.classList.remove('up');
      setTimeout(() => { if (!el.classList.contains('up')) el.hidden = true; }, 260);
    },
    render,
  };
}
