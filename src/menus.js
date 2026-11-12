import { listSlots, readSlot, writeSlot } from './saves.js';

// The main menu (Continue, New game, Load game, Save game, Options, Exit), the save and load
// slots, and the "start a new game?" check. g: { hasSave(), canExit, currentSave() -> { data,
// summary }, onContinue(), onStartNew(), onLoad(data, slot), onOptions(), onExit(), sound(kind) }
export function createMenus({ main, slots, confirm }, g) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const when = (iso) => {
    const t = new Date(iso), two = (v) => String(v).padStart(2, '0');
    return `${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}, ${two(t.getHours())}:${two(t.getMinutes())}`;
  };

  // ---- Main menu ----
  function renderMain() {
    const has = g.hasSave();
    main.querySelector('[data-menu="continue"]').hidden = !has;
    main.querySelector('[data-menu="new"]').classList.toggle('primary', !has);
    main.querySelector('[data-menu="save"]').disabled = !has;
    main.querySelector('[data-menu="exit"]').hidden = !g.canExit;
  }
  main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-menu]');
    if (!b || b.disabled) return;
    g.sound('click');
    const act = b.dataset.menu;
    if (act === 'continue') g.onContinue();
    if (act === 'new') { if (g.hasSave()) showConfirm(); else g.onStartNew(); }
    if (act === 'load') openSlots(false);
    if (act === 'save') openSlots(true);
    if (act === 'options') g.onOptions();
    if (act === 'exit') g.onExit();
  });

  // ---- Save / load slots ----
  let saving = false, back = null;
  async function openSlots(save, onBack = null) {
    saving = save;
    back = onBack;
    const list = await listSlots();
    slots.innerHTML = `<div class="card slots-card">
      <p class="eyebrow">${save ? 'Save game' : 'Load game'}</p>
      <h2>${save ? 'Pick a slot to save to' : 'Pick a game to load'}</h2>
      ${list.map((info, i) => {
        const n = i + 1, usable = save || info;
        const s = info?.summary || {};
        return `<button type="button" class="slot-row" data-slot="${n}" ${usable ? '' : 'disabled'}>
          <span class="slot-num">${n}</span>
          <span class="slot-info">${info
            ? `<b>${when(info.savedAt)}</b><small>${s.lumen ?? 0} Lumen · ${s.data ?? 0} Data · codex ${s.codex ?? 0}/${s.codexTotal ?? '?'} · ${s.builds ?? 0} built</small>`
            : `<small>${save ? 'Empty slot' : 'Empty'}</small>`}</span>
          ${save && info ? '<span class="slot-over">Overwrite</span>' : ''}
        </button>`;
      }).join('')}
      <p class="slot-msg" data-msg></p>
      <button type="button" class="secondary" data-back>Back</button>
    </div>`;
    slots.hidden = false;
  }
  function closeSlots() {
    slots.hidden = true;
    back?.();
  }
  slots.addEventListener('click', async (e) => {
    if (e.target.closest('[data-back]') || e.target === slots) { g.sound('back'); closeSlots(); return; }
    const row = e.target.closest('[data-slot]');
    if (!row || row.disabled) return;
    g.sound('click');
    const n = Number(row.dataset.slot);
    if (saving) {
      const { data, summary } = g.currentSave();
      const msg = slots.querySelector('[data-msg]');
      if (!data) { msg.textContent = 'Nothing to save yet. Dive in first.'; return; }
      await writeSlot(n, data, summary);
      await openSlots(true, back);
      slots.querySelector('[data-msg]').textContent = `Saved to slot ${n}.`;
      setTimeout(() => { if (!slots.hidden) closeSlots(); }, 900);
    } else {
      const data = await readSlot(n);
      if (data) g.onLoad(data, n);
    }
  });

  // ---- New game? ----
  function showConfirm() {
    confirm.innerHTML = `<div class="card">
      <h2>Start a new game?</h2>
      <p class="lede">Your current game will be replaced. Save it to a slot first if you want to come back to it.</p>
      <div class="confirm-btns">
        <button type="button" class="secondary" data-c="save">Save first</button>
        <button type="button" class="danger" data-c="new">Start over</button>
        <button type="button" class="secondary" data-c="cancel">Cancel</button>
      </div>
    </div>`;
    confirm.hidden = false;
  }
  confirm.addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (!c) return;
    g.sound(c === 'cancel' ? 'back' : 'click');
    confirm.hidden = true;
    if (c === 'save') openSlots(true);
    if (c === 'new') g.onStartNew();
  });

  // Hover sounds for every menu button.
  for (const el of [main, slots, confirm]) {
    el.addEventListener('pointerover', (e) => {
      const b = e.target.closest('button');
      if (b && !b.disabled && !b.contains(e.relatedTarget)) g.sound('hover');
    });
  }

  return { renderMain, openSlots, get open() { return !slots.hidden || !confirm.hidden; } };
}
