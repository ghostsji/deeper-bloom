// Long-term progression: endless achievements that pay Bloom points, skill trees to spend
// them in, and rarity rolls for what you find. Every module reads its skill bonuses through
// perk(), so the trees change the game directly.

// ---- Achievements: tune here --------------------------------------------------
// Each line has endless tiers: tier k (from 0) asks for base × growth^k, rounded nicely.
// fmt: how the stat reads (default: a count).
export const ACHIEVEMENTS = [
  { id: 'lumen', stat: 'lumen', name: 'Light gatherer', desc: 'Gather {n} Lumen', base: 25, growth: 2.5 },
  { id: 'polyps', stat: 'polyps', name: 'Polyp picker', desc: 'Collect {n} glow polyps', base: 10, growth: 2.2 },
  { id: 'scans', stat: 'scans', name: 'Naturalist', desc: 'Scan {n} creatures and plants', base: 3, growth: 2 },
  { id: 'fish', stat: 'fish', name: 'Spearfisher', desc: 'Catch {n} silverfin', base: 3, growth: 2 },
  { id: 'kelp', stat: 'kelp', name: 'Kelp cutter', desc: 'Harvest {n} kelp', base: 5, growth: 2 },
  { id: 'eels', stat: 'eels', name: 'Blight breaker', desc: 'Burn the blight out of {n} eels', base: 1, growth: 2 },
  { id: 'builds', stat: 'builds', name: 'Raft wright', desc: 'Build {n} pieces', base: 3, growth: 2.2 },
  { id: 'meters', stat: 'meters', name: 'Long swim', desc: 'Swim {n}', base: 200, growth: 2.5, fmt: 'm' },
  { id: 'underwater', stat: 'underwater', name: 'Deep breath', desc: 'Spend {n} underwater', base: 120, growth: 2.2, fmt: 'time' },
  { id: 'cooked', stat: 'cooked', name: 'Grill master', desc: 'Cook {n} things', base: 5, growth: 2.2 },
  { id: 'meals', stat: 'meals', name: 'Reef cook', desc: 'Eat {n} meals', base: 3, growth: 2 },
  { id: 'hits', stat: 'hits', name: 'Sharp shot', desc: 'Land {n} harpoon hits', base: 5, growth: 2.2 },
  { id: 'depth', stat: 'depth', name: 'Into the deep', desc: 'Reach {n} deep', base: 5, growth: 1.5, fmt: 'm', max: true },
  { id: 'rare', stat: 'rare', name: 'Lucky find', desc: 'Find {n} things of Rare quality or better', base: 1, growth: 2.5 },
  { id: 'legendary', stat: 'legendary', name: 'Legend of the reef', desc: 'Find {n} Legendary or Mythic things', base: 1, growth: 3 },
  { id: 'data', stat: 'data', name: 'Data hoarder', desc: 'Earn {n} Data', base: 10, growth: 2.5 },
  { id: 'spent', stat: 'spent', name: 'Patron of the reef', desc: 'Spend {n} Lumen', base: 20, growth: 2.5 },
  { id: 'blackouts', stat: 'blackouts', name: 'Back from the dark', desc: 'Wake up from {n} blackouts', base: 1, growth: 3 },
  { id: 'skills', stat: 'skills', name: 'Bloom adept', desc: 'Learn {n} skill ranks', base: 1, growth: 2 },
];
const pointsFor = (tier) => 1 + Math.floor(tier / 2); // later tiers pay more

const nice = (v) => {
  if (v < 10) return Math.round(v);
  const p = 10 ** Math.floor(Math.log10(v) - 1);
  return Math.round(v / p) * p;
};
export const target = (a, tier) => nice(a.base * a.growth ** tier);

// ---- Skill trees: tune here --------------------------------------------------
// key: what the node changes (read with perk(key)); per: amount per rank.
// cost of rank r (from 0): cost + floor(r * step) Bloom points.
export const TREES = [
  { id: 'gear', name: 'Diver gear', nodes: [
    { id: 'fins', name: 'Long fins', desc: 'Swim {p} faster', key: 'swim', per: 0.06, max: 10, cost: 1, step: 0.5 },
    { id: 'lungs', name: 'Bigger lungs', desc: 'Hold your breath {p} longer', key: 'breath', per: 0.1, max: 10, cost: 1, step: 0.5 },
    { id: 'jet', name: 'Jet fins', desc: 'Dash {p} faster', key: 'dash', per: 0.08, max: 5, cost: 2, step: 1, requires: ['fins'] },
    { id: 'suit', name: 'Thick suit', desc: 'Bites hurt {p} less', key: 'armor', per: 0.06, max: 5, cost: 2, step: 1, requires: ['lungs'] },
    { id: 'gulp', name: 'Quick gulp', desc: 'Refill your breath {p} faster', key: 'refill', per: 0.15, max: 5, cost: 1, step: 1, requires: ['lungs'] },
  ] },
  { id: 'combat', name: 'Combat', nodes: [
    { id: 'barbs', name: 'Barbed tips', desc: 'Harpoon hits {p} harder', key: 'damage', per: 0.1, max: 10, cost: 1, step: 0.5 },
    { id: 'reel', name: 'Fast reel', desc: 'Reel the spear back {p} faster', key: 'reel', per: 0.12, max: 5, cost: 1, step: 1 },
    { id: 'spring', name: 'Strong spring', desc: 'The spear flies {p} faster and further', key: 'spear', per: 0.08, max: 5, cost: 2, step: 1, requires: ['reel'] },
    { id: 'shaft', name: 'Tough shaft', desc: '{f} more shots before repairs', key: 'durability', per: 5, max: 6, cost: 1, step: 1, flat: true },
    { id: 'weak', name: 'Weak spots', desc: '{p} chance of a double-damage hit', key: 'crit', per: 0.05, max: 5, cost: 2, step: 1, requires: ['barbs'] },
  ] },
  { id: 'loot', name: 'Loot', nodes: [
    { id: 'pockets', name: 'Deep pockets', desc: '{f} more bag slots', key: 'bag', per: 2, max: 6, cost: 1, step: 1, flat: true },
    { id: 'magnet', name: 'Lumen magnet', desc: 'Gather polyps from {p} further away', key: 'magnet', per: 0.15, max: 5, cost: 1, step: 1 },
    { id: 'shine', name: 'Bright harvest', desc: '{p} more Lumen from polyps', key: 'shine', per: 0.08, max: 10, cost: 1, step: 0.5 },
    { id: 'butcher', name: 'Clean cuts', desc: '{p} chance of extra eel meat', key: 'butcher', per: 0.2, max: 5, cost: 2, step: 1, requires: ['pockets'] },
    { id: 'bundle', name: 'Kelp bundles', desc: '{p} chance of double kelp', key: 'bundle', per: 0.15, max: 5, cost: 1, step: 1 },
  ] },
  { id: 'life', name: 'Sea life', nodes: [
    { id: 'calm', name: 'Calm presence', desc: 'Fish bolt from {p} closer', key: 'calm', per: 0.1, max: 5, cost: 1, step: 1 },
    { id: 'gentle', name: 'Gentle hands', desc: 'Polyps glow again {p} sooner', key: 'polypRegrow', per: 0.08, max: 5, cost: 1, step: 1 },
    { id: 'beds', name: 'Fertile beds', desc: 'Kelp grows back {p} sooner', key: 'kelpRegrow', per: 0.1, max: 5, cost: 1, step: 1 },
    { id: 'thumb', name: 'Green thumb', desc: 'Kelp farms grow {p} faster', key: 'farm', per: 0.12, max: 5, cost: 2, step: 1, requires: ['beds'] },
  ] },
  { id: 'rarity', name: 'Rarity', nodes: [
    { id: 'luck', name: 'Lucky charm', desc: 'Rare finds {p} more likely', key: 'luck', per: 0.1, max: 10, cost: 1, step: 0.5 },
    { id: 'keen', name: 'Keen eye', desc: 'Rare-or-better finds pay {p} more', key: 'rareBonus', per: 0.15, max: 10, cost: 1, step: 0.5, requires: ['luck'] },
    { id: 'gold', name: 'Gold rush', desc: '{p} more golden polyps', key: 'gold', per: 0.02, max: 5, cost: 2, step: 1, requires: ['luck'] },
  ] },
  { id: 'survival', name: 'Survival', nodes: [
    { id: 'appetite', name: 'Small appetite', desc: 'Get hungry {p} slower', key: 'hunger', per: 0.06, max: 5, cost: 1, step: 1 },
    { id: 'mend', name: 'Fast mending', desc: 'Heal {p} faster', key: 'regen', per: 0.15, max: 5, cost: 1, step: 1 },
  ] },
  { id: 'study', name: 'Research', nodes: [
    { id: 'steady', name: 'Steady lens', desc: 'Scan {p} faster', key: 'scan', per: 0.1, max: 5, cost: 1, step: 1 },
    { id: 'notes', name: 'Field notes', desc: '{p} more Data', key: 'data', per: 0.1, max: 10, cost: 1, step: 0.5 },
  ] },
  { id: 'craft', name: 'Building', nodes: [
    { id: 'thrift', name: 'Thrifty', desc: 'Build pieces cost {p} less', key: 'thrift', per: 0.05, max: 5, cost: 1, step: 1 },
  ] },
];
const NODES = Object.fromEntries(TREES.flatMap((t) => t.nodes.map((n) => [n.id, { ...n, tree: t.id }])));

// ---- Rarity -------------------------------------------------------------------
// mult: how much more a find of this rarity pays. Luck tilts the odds up the list.
export const RARITY = [
  { id: 'common', name: 'Common', color: '#B5D2D4', weight: 700, mult: 1 },
  { id: 'uncommon', name: 'Uncommon', color: '#6FE3A5', weight: 200, mult: 2 },
  { id: 'rare', name: 'Rare', color: '#9DB8FF', weight: 70, mult: 4 },
  { id: 'epic', name: 'Epic', color: '#8F7BFF', weight: 25, mult: 8 },
  { id: 'legendary', name: 'Legendary', color: '#FFC46B', weight: 4.5, mult: 20 },
  { id: 'mythic', name: 'Mythic', color: '#FF8FD0', weight: 0.5, mult: 50 },
];

// ---- State --------------------------------------------------------------------
const state = { stats: {}, tiers: {}, points: 0, ranks: {} };
let onTier = () => {};

/** Called with (achievement, tierIndex, points) whenever a new tier is reached. */
export function onAchievement(fn) { onTier = fn; }

export const stat = (id) => state.stats[id] || 0;
export const points = () => state.points;
export const rank = (id) => state.ranks[id] || 0;

/** Summed bonus for a key across every learned node (e.g. 0.18 for +18%). */
export function perk(key) {
  let v = 0;
  for (const [id, r] of Object.entries(state.ranks)) if (NODES[id]?.key === key) v += NODES[id].per * r;
  return v;
}

function check(statId) {
  for (const a of ACHIEVEMENTS) {
    if (a.stat !== statId) continue;
    let t = state.tiers[a.id] || 0;
    while (stat(statId) >= target(a, t)) {
      const pts = pointsFor(t);
      state.points += pts;
      t++;
      state.tiers[a.id] = t;
      onTier(a, t - 1, pts);
    }
  }
}

/** Counts toward an achievement stat. */
export function track(statId, amount = 1) {
  if (!amount) return;
  state.stats[statId] = stat(statId) + amount;
  check(statId);
}
/** For "best ever" stats like depth. */
export function trackMax(statId, value) {
  if (value <= stat(statId)) return;
  state.stats[statId] = value;
  check(statId);
}

export const nodeCost = (n) => n.cost + Math.floor(rank(n.id) * n.step);
export const unlocked = (n) => (n.requires || []).every((id) => rank(id) > 0);
export const canBuy = (id) => {
  const n = NODES[id];
  return !!n && rank(id) < n.max && unlocked(n) && state.points >= nodeCost(n);
};
/** Learns one rank of a skill. Returns true if it was bought. */
export function buy(id) {
  if (!canBuy(id)) return false;
  state.points -= nodeCost(NODES[id]);
  state.ranks[id] = rank(id) + 1;
  track('skills');
  return true;
}

/** A rarity roll, tilted by the Rarity tree's luck. */
export function rollRarity() {
  const luck = perk('luck');
  const weights = RARITY.map((r, i) => r.weight * (1 + luck) ** i);
  let x = Math.random() * weights.reduce((a, b) => a + b, 0);
  const i = weights.findIndex((w) => (x -= w) < 0);
  const r = RARITY[i < 0 ? 0 : i];
  if (i >= 2) track('rare');
  if (i >= 4) track('legendary');
  return { ...r, index: i < 0 ? 0 : i, pay: r.mult * (i >= 2 ? 1 + perk('rareBonus') : 1) };
}

// ---- Display helpers ------------------------------------------------------------
export function formatStat(v, fmt) {
  if (fmt === 'time') return v >= 3600 ? `${(v / 3600).toFixed(v >= 36000 ? 0 : 1)} h` : `${Math.round(v / 60)} min`;
  const units = [[1e15, ''], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e4, 'k']];
  const [div, unit] = units.find(([d]) => v >= d) || [1, ''];
  const n = v >= 1e15 ? v.toExponential(1).replace('+', '') : div > 1 ? `${+(v / (unit === 'k' ? 1e3 : div)).toFixed(1)}${unit}` : `${Math.floor(v)}`;
  return fmt === 'm' ? `${n} m` : n;
}
const ROMAN = [['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]];
export function roman(n) {
  let s = '';
  for (const [r, v] of ROMAN) while (n >= v) { s += r; n -= v; }
  return s;
}
export const describeNode = (n) => n.desc.replace('{p}', `${Math.round(n.per * 100 * Math.max(1, rank(n.id)))}%`).replace('{f}', `${n.per * Math.max(1, rank(n.id))}`);

/** Everything the Goals and Skills tabs show. */
export function snapshot() {
  return {
    points: state.points,
    achievements: ACHIEVEMENTS.map((a) => {
      const tier = state.tiers[a.id] || 0, prev = tier ? target(a, tier - 1) : 0, next = target(a, tier), v = stat(a.stat);
      return {
        id: a.id, name: `${a.name} ${roman(tier + 1)}`, desc: a.desc.replace('{n}', formatStat(next, a.fmt)),
        tier, value: formatStat(v, a.fmt), goal: formatStat(next, a.fmt), progress: Math.max(0, Math.min(1, (v - prev) / (next - prev))),
        reward: pointsFor(tier),
      };
    }),
    trees: TREES.map((t) => ({
      id: t.id, name: t.name,
      nodes: t.nodes.map((n) => ({
        id: n.id, name: n.name, desc: describeNode(n), rank: rank(n.id), max: n.max, cost: nodeCost(n),
        unlocked: unlocked(n), can: canBuy(n.id), requires: (n.requires || []).map((id) => NODES[id].name),
      })),
    })),
  };
}

export function serialize() { return JSON.parse(JSON.stringify(state)); }
export function load(s) {
  if (!s) return;
  state.stats = s.stats || {};
  state.tiers = s.tiers || {};
  state.points = s.points || 0;
  state.ranks = Object.fromEntries(Object.entries(s.ranks || {}).filter(([id]) => NODES[id]));
}
