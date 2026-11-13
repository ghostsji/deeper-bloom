// The dive suit's condition: the visor's battery (and the power cells that stretch it) and the
// stress deep water puts on unsealed glass (which cracks further and then leaks). Pure state
// and numbers; main.js applies the effects and hud-fx.js draws them.

export const POWER = {
  drain: 0.2,        // % per second while you play (about 8 minutes from full)
  cellSaving: 0.3,   // each power cell found cuts the drain by this share
  deck: 5,           // % per second recharging on a raft deck (its solar panels)
  surface: 1,        // % per second treading water at the surface
  lumenCharge: 25,   // % bought for LUMEN_COST Lumen on the phone
  lumenCost: 5,
};
// Below these levels (%), these HUD systems shut off to save power.
export const SHUTOFF = { nav: 30, depth: 20, ledger: 12, vitals: 5, comms: 0.01 };
export const LOW_WARNINGS = [30, 15, 5];

export const PRESSURE = {
  safeDepth: 20,     // metres: deeper than this, unsealed glass starts to strain
  rate: 1 / 40,      // stress per second per 6 m past the safe depth
  ease: 1 / 25,      // stress lost per second back above the safe depth
  layers: [0.35, 0.7, 1], // stress where new cracks spread; at 1 the visor leaks
  leakRise: 0.025,   // how fast water fills the visor while leaking (fraction per second)
  leakMax: 0.6,
  leakDrain: 0.08,   // how fast it drains back out (faster at the surface)
  leakBreath: 1.6,   // extra breath drain at a full leak (x normal)
};

export function createSuit() {
  let power = 100, cells = 0, stress = 0, leak = 0, warned = new Set();
  return {
    get power() { return power; },
    get cells() { return cells; },
    get stress() { return stress; },
    get leak() { return leak; },
    /** How many spread-crack layers are showing (0-3). */
    get crackLayers() { return PRESSURE.layers.filter((l) => stress >= l).length; },
    /** A system whose power has been cut to save the battery. */
    unpowered: (id) => power <= (SHUTOFF[id] ?? -1),
    addCell() { cells++; },
    charge(pct) { power = Math.min(100, power + pct); for (const w of LOW_WARNINGS) if (power > w) warned.delete(w); },

    // s: { depth (m below surface), surfaced (head out), onDeck, sealed (visor seal fixed) }
    // Returns what happened: { warn: % low-power warning, layer: new crack layer, leaking: started }
    update(dt, s) {
      const ev = {};
      // Battery.
      const drain = POWER.drain * Math.max(0.1, 1 - cells * POWER.cellSaving);
      const gain = s.onDeck ? POWER.deck : s.surfaced ? POWER.surface : 0;
      power = Math.max(0, Math.min(100, power + (gain - (gain ? 0 : drain)) * dt));
      for (const w of LOW_WARNINGS) {
        if (power <= w && !warned.has(w)) { warned.add(w); ev.warn = w; }
        if (power > w + 5) warned.delete(w);
      }
      // Pressure on unsealed glass.
      const before = this.crackLayers, wasLeaking = stress >= 1;
      if (s.sealed) stress = Math.max(0, stress - PRESSURE.ease * 2 * dt);
      else if (s.depth > PRESSURE.safeDepth) stress = Math.min(1, stress + ((s.depth - PRESSURE.safeDepth) / 6) * PRESSURE.rate * dt);
      else stress = Math.max(0, stress - PRESSURE.ease * dt);
      if (this.crackLayers > before) ev.layer = this.crackLayers;
      if (stress >= 1 && !s.sealed && !s.surfaced) leak = Math.min(PRESSURE.leakMax, leak + PRESSURE.leakRise * dt);
      else leak = Math.max(0, leak - PRESSURE.leakDrain * (s.surfaced ? 3 : 1) * dt);
      if (stress >= 1 && !wasLeaking) ev.leaking = true;
      return ev;
    },
    /** Extra breath lost per second from water in the visor (on top of normal drain). */
    leakBreathFactor: () => (leak / PRESSURE.leakMax) * PRESSURE.leakBreath,
    serialize: () => ({ power, cells, stress, leak }),
    load(d) {
      if (!d) return;
      power = d.power ?? 100; cells = d.cells ?? 0; stress = d.stress ?? 0; leak = d.leak ?? 0;
    },
  };
}
