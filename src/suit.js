// The dive suit's condition: the visor's battery (and the power cells that stretch it), the
// stress deep water puts on unsealed glass (which cracks further and then leaks), fog on the
// glass, heat, water in the phone, and the upgrades found in wrecks. Pure state and numbers;
// main.js applies the effects and hud-fx.js draws them.

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

export const FOG = {
  coldDepth: 15,     // metres: colder than this, your breath fogs the glass
  cold: 0.012,       // fog per second per 10 m past coldDepth
  panting: 0.05,     // fog per second while dashing or short of breath
  clear: 0.2,        // fog cleared per second with your head out of the water
  purge: 0.7,        // fog cleared per second holding purge
  purgePower: 0.6,   // battery % per second the purge costs
};
export const HEAT = {
  dash: 0.14, charge: 0.03, shock: 0.25, // heat per second (per shock): a long dash overheats in ~12 s
  cool: 0.04,        // per second underwater (faster deeper)
  air: 0.01,         // per second out of the water
  hot: 0.7,          // above this the battery drains twice as fast
  reset: 0.55,       // after overheating, cooled back below this you're fine again
};
// Blight from eel bites creeps across the glass and eats into the readouts under it.
export const BLIGHT = { bite: 0.25, spread: 0.006, uvClean: 0.2, uvPower: 1.2 };
// Ear pressure: dropping faster than this (m/s) without equalising builds it up.
export const EARS = { safeSink: 1.2, rate: 0.14, ease: 0.04, hurt: 2 /* health per second at full */ };
// Suit tears: a bite can rip the suit, letting cold water in (more fog, a slow chill).
export const TEARS = { max: 3, chance: 0.5, fog: 0.03, chill: 0.15 /* health per second per tear */ };
// Visor upgrades found in wrecks and the outpost.
export const UPGRADES = {
  plate: { name: 'Pressure plate', desc: 'The glass takes 5 m more depth before it strains.' },
  guard: { name: 'Spark guard', desc: 'Shocks do half the damage.' },
  coating: { name: 'Anti-fog coating', desc: 'The visor fogs half as fast.' },
};

export function createSuit() {
  let fog = 0, heat = 0, overheated = false, phoneWet = 0, upgrades = new Set();
  let blight = 0, visorWet = 0, ears = 0, tears = 0, filter = false;
  let power = 100, cells = 0, stress = 0, leak = 0, warned = new Set();
  return {
    get power() { return power; },
    get cells() { return cells; },
    get stress() { return stress; },
    get leak() { return leak; },
    get fog() { return fog; },
    get heat() { return heat; },
    get overheated() { return overheated; },
    get phoneWet() { return phoneWet; },
    has: (id) => upgrades.has(id),
    get blight() { return blight; },
    get visorWet() { return visorWet; },
    get ears() { return ears; },
    get tears() { return tears; },
    /** An eel bite: blight on the glass, and maybe a tear in the suit. Returns true if it tore. */
    bitten(roll = Math.random()) {
      blight = Math.min(1, blight + BLIGHT.bite);
      if (tears < TEARS.max && roll < TEARS.chance) { tears++; return true; }
      return false;
    },
    cleanBlight() { const was = blight; blight = 0; return was > 0.02; },
    /** The UV flush (researched): burns blight off with the purge, at extra battery. */
    uvFlush(dt) { if (blight <= 0 || power <= 0) return false; blight = Math.max(0, blight - BLIGHT.uvClean * dt); power = Math.max(0, power - BLIGHT.uvPower * dt); return true; },
    /** A blight filter (crafted at the outpost lab) halves how fast it spreads. */
    fitFilter() { filter = true; },
    get filter() { return filter; },
    equalise() { const was = ears; ears = Math.max(0, ears - 0.8); return was > 0.05; },
    /** Patches tears (one kelp each, at a workbench). Returns how many were patched. */
    patch(kelp) { const n = Math.min(tears, kelp); tears -= n; return n; },
    addUpgrade(id) { upgrades.add(id); },
    get upgrades() { return [...upgrades]; },
    /** A shock heats the suit, fogs the glass and gets water in the phone. */
    shocked() { heat = Math.min(1, heat + HEAT.shock); fog = Math.min(1, fog + 0.25); phoneWet = Math.max(phoneWet, 0.5); },
    /** Holding purge: clears fog, costs battery. */
    purge(dt) { if (fog <= 0 || power <= 0) return false; fog = Math.max(0, fog - FOG.purge * dt); power = Math.max(0, power - FOG.purgePower * dt); return true; },
    /** Extra battery used this frame (the visor's light at night). */
    drain(pct) { power = Math.max(0, power - pct); },
    addFog(v) { fog = Math.min(1, fog + v); },
    dryPhone() { const was = phoneWet; phoneWet = 0; return was > 0.05; },
    /** How much shock damage gets through. */
    shockFactor: () => (upgrades.has('guard') ? 0.5 : 1),
    /** How many spread-crack layers are showing (0-3). */
    get crackLayers() { return PRESSURE.layers.filter((l) => stress >= l).length; },
    /** A system whose power has been cut to save the battery. */
    unpowered: (id) => power <= (SHUTOFF[id] ?? -1),
    addCell() { cells++; },
    charge(pct) { power = Math.min(100, power + pct); for (const w of LOW_WARNINGS) if (power > w) warned.delete(w); },

    // s: { depth (m below surface), surfaced (head out), onDeck, sealed (visor seal fixed),
    //      dashing, breath (0..100), sinkSpeed (m/s, downward) }
    // Returns what happened: { warn: % low-power warning, layer: new crack layer, leaking: started,
    // overheat: just overheated }
    update(dt, s) {
      const ev = {};
      // Heat: dashing and charging warm you, the water cools you.
      const charging = (s.onDeck || s.surfaced) && power < 100;
      heat += ((s.dashing ? HEAT.dash : 0) + (charging ? HEAT.charge : 0)) * dt;
      heat -= (s.surfaced || s.onDeck ? HEAT.air : HEAT.cool * (1 + s.depth / 25)) * dt;
      heat = Math.max(0, Math.min(1, heat));
      if (heat >= 1 && !overheated) { overheated = true; ev.overheat = true; }
      if (overheated && heat < HEAT.reset) overheated = false;
      // Fog: cold deep water and heavy breathing fog the glass; air clears it.
      const fogRate = (Math.max(0, s.depth - FOG.coldDepth) / 10) * FOG.cold + (s.dashing || (s.breath ?? 100) < 40 ? FOG.panting : 0);
      if (s.surfaced || s.onDeck) fog = Math.max(0, fog - FOG.clear * dt);
      else fog = Math.min(1, fog + fogRate * (upgrades.has('coating') ? 0.5 : 1) * dt);
      // Blight spreads once it has a hold (half as fast with a filter).
      if (blight > 0) blight = Math.min(1, blight + BLIGHT.spread * (filter ? 0.5 : 1) * dt);
      // Ears: dropping fast builds pressure; equalising (or easing off) lets it out.
      const sink = s.sinkSpeed ?? 0;
      if (!s.surfaced && sink > EARS.safeSink) ears = Math.min(1, ears + (sink - EARS.safeSink) * EARS.rate * dt);
      else ears = Math.max(0, ears - EARS.ease * dt);
      // Tears let cold water in: the glass fogs faster.
      if (tears && !s.surfaced && !s.onDeck) fog = Math.min(1, fog + TEARS.fog * tears * dt);
      // Water in the visor's electronics after a leak (it causes short circuits as it dries).
      visorWet = leak > 0.1 ? 1 : Math.max(0, visorWet - 0.012 * dt);
      // Water in the phone dries slowly, faster in the air.
      phoneWet = Math.max(0, phoneWet - (s.onDeck ? 0.03 : 0.004) * dt);
      if (leak > 0.2) phoneWet = Math.max(phoneWet, 0.8);
      // Battery.
      const drain = POWER.drain * Math.max(0.1, 1 - cells * POWER.cellSaving) * (heat > HEAT.hot ? 2 : 1);
      const gain = s.onDeck ? POWER.deck : s.surfaced ? POWER.surface : 0;
      power = Math.max(0, Math.min(100, power + (gain - (gain ? 0 : drain)) * dt));
      for (const w of LOW_WARNINGS) {
        if (power <= w && !warned.has(w)) { warned.add(w); ev.warn = w; }
        if (power > w + 5) warned.delete(w);
      }
      // Pressure on unsealed glass.
      const before = this.crackLayers, wasLeaking = stress >= 1;
      if (s.sealed) stress = Math.max(0, stress - PRESSURE.ease * 2 * dt);
      else if (s.depth > this.safeDepth) stress = Math.min(1, stress + ((s.depth - this.safeDepth) / 6) * PRESSURE.rate * dt);
      else stress = Math.max(0, stress - PRESSURE.ease * dt);
      if (this.crackLayers > before) ev.layer = this.crackLayers;
      if (stress >= 1 && !s.sealed && !s.surfaced) leak = Math.min(PRESSURE.leakMax, leak + PRESSURE.leakRise * dt);
      else leak = Math.max(0, leak - PRESSURE.leakDrain * (s.surfaced ? 3 : 1) * dt);
      if (stress >= 1 && !wasLeaking) ev.leaking = true;
      return ev;
    },
    get safeDepth() { return PRESSURE.safeDepth + (upgrades.has('plate') ? 5 : 0); },
    /** Health lost per second to cold (tears) and ear pressure. */
    healthDrain: (s) => (tears && !s.surfaced && !s.onDeck ? TEARS.chill * tears : 0) + (ears > 0.8 ? EARS.hurt * (ears - 0.8) / 0.2 : 0), // hurts from 80%, fully at 100%
    /** Extra breath lost per second from water in the visor (on top of normal drain). */
    leakBreathFactor: () => (leak / PRESSURE.leakMax) * PRESSURE.leakBreath,
    serialize: () => ({ power, cells, stress, leak, fog, heat, phoneWet, upgrades: [...upgrades], blight, visorWet, ears, tears, filter }),
    load(d) {
      if (!d) return;
      power = d.power ?? 100; cells = d.cells ?? 0; stress = d.stress ?? 0; leak = d.leak ?? 0;
      fog = d.fog ?? 0; heat = d.heat ?? 0; phoneWet = d.phoneWet ?? 0; upgrades = new Set(d.upgrades || []);
      overheated = heat >= 1;
      blight = d.blight ?? 0; visorWet = d.visorWet ?? 0; ears = d.ears ?? 0; tears = d.tears ?? 0; filter = !!d.filter;
    },
  };
}
