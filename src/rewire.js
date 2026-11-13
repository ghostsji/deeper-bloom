// The visor panel (V): fitting a recovered part means rewiring the system by hand. Each wire
// (by colour) goes to the socket with its symbol. The wiring diagram that says which is which
// is water-damaged, so each line of it only flickers into view now and then: watch for it.
// A wrong connection shocks you.
//
// g: { onDone(systemId), onWrong(x, y), onClose(), sound(kind) }
const COLOURS = [['cyan', '#5CF2D6'], ['gold', '#FFC46B'], ['pink', '#FF8FD0'], ['violet', '#B59CFF']];
const SYMBOLS = ['Δ', '◇', '○', '□'];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function createRewire(el, g) {
  let sys = null, picked = null, links = 0, wires = [];

  function open(system, count) {
    sys = system;
    picked = null;
    links = 0;
    const syms = shuffle(SYMBOLS.slice(0, count));
    wires = COLOURS.slice(0, count).map(([name, hex], i) => ({ name, hex, sym: syms[i] }));
    const sockets = shuffle(wires.map((w) => w.sym));
    el.innerHTML = `<div class="card rewire-card">
      <p class="eyebrow">Visor panel</p>
      <h2>Rewire: ${sys.name}</h2>
      <div class="rw-legend" title="The wiring diagram (water-damaged)">${wires.map((w, i) => `<span style="--d:${(i * 0.9 + Math.random()).toFixed(2)}s"><i style="background:${w.hex}"></i>→ <b>${w.sym}</b></span>`).join('')}</div>
      <div class="rw-board">
        <svg class="rw-lines"></svg>
        <div class="rw-col">${wires.map((w) => `<button type="button" class="rw-wire" data-wire="${w.name}" data-sym="${w.sym}" style="--c:${w.hex}">${w.name}</button>`).join('')}</div>
        <div class="rw-col">${sockets.map((sy) => `<button type="button" class="rw-socket" data-socket="${sy}">${sy}</button>`).join('')}</div>
      </div>
      <p class="sub">Pick a wire, then its socket. The diagram flickers in and out: wait for each line to show. A wrong socket shocks you.</p>
      <button type="button" class="secondary" data-close>Close the panel (V)</button>
    </div>`;
    el.hidden = false;
  }

  function line(a, b, colour) {
    const svg = el.querySelector('.rw-lines'), box = svg.getBoundingClientRect();
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const x1 = ra.right - box.left, y1 = ra.top + ra.height / 2 - box.top, x2 = rb.left - box.left, y2 = rb.top + rb.height / 2 - box.top;
    svg.insertAdjacentHTML('beforeend', `<path d="M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}" stroke="${colour}"/>`);
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { g.sound('back'); close(); g.onClose(); return; }
    const w = e.target.closest('.rw-wire');
    if (w && !w.disabled) {
      g.sound('click');
      el.querySelectorAll('.rw-wire').forEach((x) => x.classList.toggle('picked', x === w));
      picked = w;
      return;
    }
    const sk = e.target.closest('.rw-socket');
    if (!sk || sk.disabled || !picked) return;
    if (picked.dataset.sym === sk.dataset.socket) {
      g.sound('click');
      line(picked, sk, wires.find((x) => x.name === picked.dataset.wire).hex);
      picked.disabled = sk.disabled = true;
      picked.classList.remove('picked');
      picked = null;
      if (++links === wires.length) { const id = sys.id; close(); g.onDone(id); }
    } else {
      const { clientX: x, clientY: y } = e;
      close();
      g.onWrong(x, y);
    }
  });

  function close() { el.hidden = true; sys = null; picked = null; }
  return { open, close, get isOpen() { return !el.hidden; } };
}
