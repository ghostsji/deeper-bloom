import { perk } from './progress.js';

// ---- Survival: tune here ------------------------------------------------------
const BREATH_SECS = 45;       // a full breath lasts this long underwater
const BREATH_REFILL = 35;     // per second with your head above water
const FOOD_MINUTES = 12;      // a full stomach empties in this long
const REGEN = 0.8;            // health per second while fed and breathing
const DROWN = 12;             // health lost per second with no breath
const STARVE = 0.8;           // health lost per second with no food
const FED = 25;               // food above this lets health regenerate
export const BAG_SIZE = 12;

// food: hunger restored; health: health change when eaten (raw fish isn't great for you).
export const ITEMS = {
  smoked: { name: 'Smoked eel', food: 45, health: 15 },
  cooked: { name: 'Grilled silverfin', food: 30, health: 10 },
  crisp: { name: 'Kelp crisp', food: 15, health: 2 },
  kelp: { name: 'Kelp', food: 6, health: 0 },
  fish: { name: 'Raw silverfin', food: 8, health: -4 },
  eel: { name: 'Raw eel', food: 12, health: -6 },
};
const EAT_ORDER = ['smoked', 'cooked', 'crisp', 'kelp', 'fish', 'eel'];
// What the cook fire turns raw food into.
const COOKS = { fish: 'cooked', kelp: 'crisp', eel: 'smoked' };
// Gear wears out with use. REPAIR: kelp fibre it takes at a workbench to make it good as new.
export const GEAR = { harpoon: { name: 'Harpoon', max: 30, repair: 2 } };

// With skills: Tough shaft adds harpoon shots, Deep pockets adds bag slots.
export const gearMax = (id) => GEAR[id].max + (id === 'harpoon' ? perk('durability') : 0);
export const bagSize = () => BAG_SIZE + perk('bag');

export function createSurvival({ onBlackout, onChange }) {
  const s = { health: 100, breath: 100, food: 100 };
  const gear = { harpoon: GEAR.harpoon.max };
  let bag = {};
  let down = false; // blacked out, waiting to wake

  const total = () => Object.values(bag).reduce((a, b) => a + b, 0);

  return {
    stats: s,
    gear,
    // Wears a tool down by one use. Returns false if it's already broken.
    wear(id) {
      if (gear[id] <= 0) return false;
      gear[id]--;
      onChange();
      return true;
    },
    // Repairs a tool with kelp from the bag. Returns 'repaired', 'full' or 'nokelp'.
    repair(id) {
      if (gear[id] >= gearMax(id)) return 'full';
      if ((bag.kelp || 0) < GEAR[id].repair) return 'nokelp';
      bag.kelp -= GEAR[id].repair;
      if (!bag.kelp) delete bag.kelp;
      gear[id] = gearMax(id);
      onChange();
      return 'repaired';
    },
    damage(n) {
      if (down) return;
      s.health = Math.max(0, s.health - n * Math.max(0.2, 1 - perk('armor'))); // Thick suit
      // update() notices zero health and blacks you out on the next frame.
    },
    get bag() { return bag; },
    get bagCount() { return total(); },
    // underwater: head below the surface.
    update(dt, underwater) {
      if (down) return;
      // Skills: Bigger lungs, Quick gulp, Small appetite, Fast mending.
      if (underwater) s.breath = Math.max(0, s.breath - (100 / (BREATH_SECS * (1 + perk('breath')))) * dt);
      else s.breath = Math.min(100, s.breath + BREATH_REFILL * (1 + perk('refill')) * dt);
      s.food = Math.max(0, s.food - (100 / (FOOD_MINUTES * 60)) * Math.max(0.3, 1 - perk('hunger')) * dt);

      let dh = 0;
      if (s.breath <= 0) dh -= DROWN;
      if (s.food <= 0) dh -= STARVE;
      if (!dh && s.food > FED) dh = REGEN * (1 + perk('regen'));
      s.health = Math.min(100, Math.max(0, s.health + dh * dt));
      if (s.health <= 0) {
        down = true;
        const dropped = bag;
        bag = {};
        onBlackout(dropped);
      }
    },
    // After a blackout: wake with some breath and health back, and a little food.
    wake() {
      down = false;
      s.health = 50; s.breath = 100; s.food = Math.max(s.food, FED);
      onChange();
    },
    add(id, n = 1) {
      const room = Math.min(n, bagSize() - total());
      if (room <= 0) return 0;
      bag[id] = (bag[id] || 0) + room;
      onChange();
      return room;
    },
    addAll(items) {
      let added = 0;
      for (const [id, n] of Object.entries(items)) added += this.add(id, n);
      return added;
    },
    // Eats one of an item (default: the best food carried). Returns the item eaten, or null.
    eat(which) {
      if (s.food > 95) return null;
      const id = which ?? EAT_ORDER.find((k) => bag[k]);
      if (!bag[id]) return null;
      if (!--bag[id]) delete bag[id];
      s.food = Math.min(100, s.food + ITEMS[id].food);
      s.health = Math.min(100, Math.max(1, s.health + ITEMS[id].health));
      onChange();
      return ITEMS[id];
    },
    // Cooks everything raw in the bag. Returns how many were cooked.
    cook() {
      let n = 0;
      for (const [raw, done] of Object.entries(COOKS)) {
        if (!bag[raw]) continue;
        n += bag[raw];
        bag[done] = (bag[done] || 0) + bag[raw];
        delete bag[raw];
      }
      if (n) onChange();
      return n;
    },
    serialize() { return { ...s, bag: { ...bag }, gear: { ...gear } }; },
    load(d) {
      if (!d) return;
      for (const k of ['health', 'breath', 'food']) if (typeof d[k] === 'number') s[k] = d[k];
      bag = Object.fromEntries(Object.entries(d.bag || {}).filter(([k]) => ITEMS[k]));
      if (s.health <= 0) s.health = 50;
      for (const k of Object.keys(gear)) if (typeof d.gear?.[k] === 'number') gear[k] = d.gear[k];
    },
  };
}
