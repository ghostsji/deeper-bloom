import { SPECIES, RESEARCH } from './research.js';
import { ITEMS, GEAR, gearMax, bagSize } from './survival.js';
import * as progress from './progress.js';
import { STEPS } from './tutorial.js';
import { keyName } from './controls.js';
import { SYSTEMS } from './hud-systems.js';
import { crackSvg } from './hud-fx.js';
import { APPS, CELLS } from './salvage.js';
import { POWER, PRESSURE } from './suit.js';
import { drawMap } from './map.js';

// The diver's phone: Deep Bloom's app on a ruggedised handset. Tab brings it up, and the
// game pauses while it's out. Tabs: build, research, codex, status, goals, skills and a
// guide (the tutorial checklist and how-tos). Hover almost anything for a tooltip.

const ICONS = {
  build: '<path d="M3 20h18M5 20V10l7-5 7 5v10M9 20v-6h6v6"/>',
  research: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M11 8v6M8 11h6"/>',
  codex: '<path d="M3 12c4-6 12-6 15 0-3 6-11 6-15 0zM18 12l4-4v8z"/>',
  status: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  goals: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
  skills: '<path d="M12 3v6M12 9l-5 5M12 9l5 5M7 14v5M17 14v5"/><circle cx="12" cy="3" r="1"/>',
  map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',
  guide: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>',
};
const TABS = [['build', 'Build'], ['research', 'Research'], ['codex', 'Codex'], ['map', 'Map'], ['status', 'Status'], ['goals', 'Goals'], ['skills', 'Skills'], ['guide', 'Guide']];
const k = (id) => `<kbd>${keyName(id)}</kbd>`;
const TAB_TIPS = {
  build: () => '<b>Build</b><br>Raft pieces, paid for with Lumen. Pick one, then place it from the surface.',
  research: () => '<b>Research</b><br>Upgrades paid for with Data. Needs you next to a research station.',
  codex: () => `<b>Codex</b><br>Everything you've scanned with the Echo Lens. ${k('codex')} opens it.`,
  map: () => '<b>Map</b><br>The seabed you\'ve explored, coloured by depth. Tap it to set a waypoint.',
  status: () => '<b>Status</b><br>Visor systems, health, breath, food, your harpoon and your bag. Eat from here.',
  goals: () => '<b>Goals</b><br>Endless achievements. Each tier pays Bloom points.',
  skills: () => '<b>Skills</b><br>Eight skill trees, paid for with Bloom points (never Lumen).',
  guide: () => '<b>Guide</b><br>The tutorial checklist and how to do everything.',
};
const esc = (t) => String(t).replace(/"/g, '&quot;');

// The how-to pages on the Guide tab.
const GUIDES = [
  ['Moving around', () => `${k('forward')}${k('left')}${k('back')}${k('right')} swim toward where you look, the mouse looks, ${k('turnLeft')}/${k('turnRight')} turn. ${k('rise')} rises, ${k('sink')} sinks and ${k('dash')} dashes. Swim into a raft to climb onto it; on deck ${k('rise')} jumps. ${k('pause')} or Esc pauses.`],
  ['Lumen, Data and Bloom', () => '<b class="cyan">Lumen</b> is the reef\'s light: swim through glowing polyps to gather it, and spend it on building. <b class="gold">Data</b> comes from scanning, and pays for research. <b class="cyan">Bloom points</b> come from finishing Goal tiers, and pay for skills. Skills never cost Lumen.'],
  ['Gathering Lumen', () => 'Glowing polyps on the reef give Lumen when you swim through them, and glow again after a while. Some are rarer (the colour of the message tells you) and pay more. Blighted eels drop Lumen, and coral gardens on your raft grow it slowly.'],
  ['Scanning and the codex', () => `Hold <kbd>Right mouse</kbd> to raise the Echo Lens, then hold <kbd>Left mouse</kbd> on a creature, coral or plant until the ring fills. Each new scan earns Data and fills in the codex; finishing an entry pays extra. ${k('codex')} opens the codex.`],
  ['Building', () => `Open the phone (${k('phone')}) → Build and pick a piece. Swim to the surface, aim at the water and <kbd>Left-click</kbd> to place it; <kbd>Right-click</kbd> takes it back for a full refund. The wheel switches pieces and ${k('stopBuilding')} stops building. Most pieces go on a raft deck.`],
  ['Research', () => `Build a research station and stand next to it, then press ${k('use')} at it or open the phone's Research tab. Research costs Data, and some needs particular codex entries first.`],
  ['Breath, health and food', () => 'Breath drains underwater and refills at the surface; when it runs out you lose health. Food drains slowly. Health heals only while you\'re fed and have breath. The bars bottom left show all three.'],
  ['Food and cooking', () => `Underwater, <kbd>Left-click</kbd> a silverfin in front of you (glide in slowly, or it bolts) or the kelp you're aiming at. ${k('eat')} eats. Raw food is better cooked: press ${k('use')} at a cook fire. A kelp farm grows kelp for you; press ${k('use')} to collect it.`],
  ['The harpoon and eels', () => `${k('harpoon')} raises the harpoon and <kbd>Left-click</kbd> fires; the spear reels back before the next shot. Each shot wears it down; repair it at a workbench with kelp (${k('use')}). Blighted eels guard some kelp patches. Three hits cure one, and it drops Lumen and eel meat. They can't follow you onto a raft.`],
  ['Missing phone apps', () => 'The flood washed the Codex, Status, Goals and Skills apps out of your phone. Each one\'s module lies on the reef in a salvage pod: a blinking capsule under a thin beam of light that reaches the surface. Pods ping louder as you get close, and once Navigation is restored they show on the compass. Swim into a pod to put its app back. Goals still pay Bloom points while the apps are missing.'],
  ['Visor battery', () => `Your HUD runs on a battery that drains as you play. At 30% navigation shuts off, then the depth gauge (20%), the Lumen and Data readouts (12%) and your vitals (5%); at 0% Echo's subtitles go too. It recharges fast on a raft deck and slowly while you tread water at the surface, or you can buy ${POWER.lumenCharge}% for ${POWER.lumenCost} Lumen on the Status app. Two power cells lie in salvage pods next to live cables: each makes the battery last longer.`],
  ['Pressure on the glass', () => `Below ${PRESSURE.safeDepth} m, deep water strains your cracked visor. The glass groans, the GLASS STRAIN bar under your depth fills, and new cracks spread across it. When it's full the visor leaks: water fills it from the bottom and you run out of breath much faster. Go shallower to ease it, surface to drain the water, and fix the Visor seal (finish 2 research projects) to stop it for good.`],
  ['Live electricity', () => 'Some jellies carry a charge: they\'re paler, and crackle with little arcs. Broken cables from the flooded outpost lie on the sand with sparking ends. You\'ll hear them crackle as you get close. Touch one and it shocks you like the cracked glass: you lose health, you\'re stunned and sink, and your phone reboots. Sinking stunned next to a cable can shock you again. With the Threat sensor restored they show on the compass.'],
  ['Rewiring the visor', () => `Each visor system's milestone gets you its part. Then press ${k('rewire')} to open the visor panel and wire it in: each coloured wire goes to the socket with its symbol. The wiring diagram is water-damaged, so each line of it only flickers into view now and then. Wait for it. Plug a wire into the wrong socket and it shocks you (and the panel slams shut).`],
  ['The sunken outpost', () => `The live cables run back to a flooded research outpost 110 to 210 m out from Echo, on flat sand deeper than is safe for a cracked visor. Every world puts it somewhere different. Its power is out. Find its three fuses (orange-banded pods: one behind the electric floor grates, one on its roof, one out the back) and fit them at the console outside with ${k('use')}. Cross the grates when their glow goes out. With the power back, the vault opens: a visor upgrade and two of Echo's logs.`],
  ['Wrecks and upgrades', () => 'Two boats went down in the flood. Each holds a visor upgrade (white-banded pod) and one of Echo\'s logs. Upgrades: the Pressure plate (in the outpost\'s vault) lets you go 5 m deeper before the glass strains, the Spark guard halves shock damage, and the Anti-fog coating halves fogging.'],
  ['Blight, tears and your ears', () => `An eel bite smears orange blight on your visor. It spreads, and the readouts it covers go dark: scrub it off with ${k('use')} at a research station, or research the UV flush so holding ${k('purge')} burns it off. A bite can also tear your suit (up to three tears): cold water gets in, the glass fogs faster and you slowly lose health until you patch each tear with 1 kelp at a workbench. Dropping fast builds pressure in your ears (a whine, muffled sound, the edges pulsing red); press ${k('equalise')} to equalise, or it starts to hurt. After a leak the visor's electronics stay wet for a while and short out: the compass mirrors, your bars swap places, the depth gauge lies.`],
  ['Night, currents, vents and the deep', () => 'A day lasts 8 minutes. At night the water goes almost black: your visor light comes on (it costs battery), glowing things become your best light, eels spot you from further away, and the big shape passes more often. Currents along the reef\'s east and west edges push you sideways (watch the drifting streaks). South of the reef a sinkhole drags you down into deep, high-pressure water: swim hard up and out. Gas vents burst every few seconds: swim into the bubbles for breath, but they fog your visor and throw you upwards.'],
  ['Echo\'s signal and her pearl', () => `Echo can only reach you so far from her pearl. Further out her subtitles break up, her tips arrive late, and past a certain range she goes quiet (ECHO bars, top left). Glow buoys you build relay her signal for another 35 m around them. Bring Lumen to her pearl and press ${k('use')} to grow it (25, 50, then 100 Lumen): each size reaches 25 m further and makes the whole reef glow brighter.`],
  ['The outpost\'s rooms', () => `Once the outpost has power, its rooms work, for as long as the generator has fuel: feed it kelp with ${k('use')} (1 kelp = 20%). The lab bench crafts visor parts from kelp and Lumen (a blight filter, a seal patch kit, a battery booster). The radio is for calling for help, once you know what happened here.`],
  ['Fixing the phone', () => `The second wreck's stern hides a replacement phone screen (light blue pod). Take it to a workbench and press ${k('use')}: peel the cracked glass away piece by piece without touching the live cracks. After that the phone never shocks you again, and its colours come back.`],
  ['Sonar', () => `Press ${k('sonar')} to send a sonar ping (3% battery, every 4 s): a ring sweeps out, the fog thins for a moment, everything within 90 m (pods, creatures, deep life) is outlined on your visor, and the map fills in around you and repairs any corrupted regions it reaches. But eels hear it and come to look, and sometimes something very large answers.`],
  ['The deep', () => 'Below about 40 m, in the trenches, the cold fogs your visor much faster and the pressure is brutal on unsealed glass. Abyssal polyps (violet) grow only down here and pay far more Lumen. Crushed wreckage litters the floor. And some of those glowing lights aren\'t polyps: anglerfish hang in the dark with a lure that looks just like one, and lunge when you swim up to it.'],
  ['Storms and tides', () => 'Storms roll over the atoll every few minutes: rain cuts your solar charging by up to 80%, rafts pitch and roll, the water near the surface gets rough and shoves you about, and lightning strikes the water and your raft. Get struck at the surface or on a raft near the strike and it shocks you hard. You\'re safer deeper. Tides lift and drop the water by about 2 m twice a day (shown under your depth): at low tide the highest banks come up as islands and rafts over them run aground; at high tide sinkholes pull harder.'],
  ['Restoring the reef', () => `The blight has killed patches of the open seabed: grey, bleached coral (grey squares on the map). Swim down to one and press ${k('plant')} to plant a coral seedling (${5} Lumen). Three seedlings bring a patch back to life: the bleached coral goes, glowing polyps grow there, and while you're in a living patch the blight on your visor recedes. The map shows how much of the dead reef you've restored.`],
  ['The map', () => 'The map is water-damaged too: it flickers, a dead zone of static hides the outpost\'s area until Navigation is back, and some regions (tinted pink) show the seabed from somewhere else until you swim into them or sweep them with sonar. The Map app shows the seabed coloured by depth: pale teal shallows, deep blue, and near-black trenches. It starts hidden: everything within about 30 m of where you swim is revealed, and it remembers. Pods, wrecks and the outpost appear once you\'ve been near them. Tap the map to set a waypoint: it shows on your compass with its distance, and clears when you get there. Zoom in to see the 240 m around you.'],
  ['Goals and skills', () => 'Every goal (Lumen gathered, scans, fish, distance swum...) has endless tiers. Each tier pays Bloom points, which you spend on the Skills tab. Some skills need another one learned first.'],
  ['Blacking out', () => 'If your health hits zero you black out and wake on your nearest raft. Your bag drops where you fell: swim back to the gold ring to pick it up. Blacking out again before you do loses it.'],
  ['Saving', () => 'The game saves as you play. Save game (on the pause menu or the main menu) also copies it to one of three slots, and Load game brings one back.'],
];

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
  //      onStopBuilding(), onResearch(id), onEat(id), onBuy(skillId), tutorial, systems, hasApp(id), onTutorial(skip|resume|restart) }
  let tab = 'build';

  el.innerHTML = `
    <div class="phone-case">
      <div class="phone-screen">
        <div class="repair" data-repair hidden></div>
        <div class="phone-cracks">${crackSvg(400, 780, 3)}</div>
        <header class="phone-hud">
          <div data-tip="<b>Lumen</b><br>The reef's light. Swim through glowing polyps to gather it. Spend it on building."><div class="label">Lumen</div><div class="big cyan" data-lumen></div></div>
          <div class="phone-chips"><span class="chip gold" data-data data-tip="<b>Data</b><br>Earned by scanning with the Echo Lens. Spend it on research at a research station."></span><span class="chip pink" data-bagchip data-tip="<b>Bag</b><br>The food you carry. The Deep pockets skill adds slots."></span><span class="chip cyan" data-bloom data-tip="<b>Bloom points</b><br>Earned by finishing Goal tiers. Spend them on Skills. Skills never cost Lumen."></span></div>
        </header>
        <section class="phone-body" data-body></section>
        <nav class="phone-tabs">${TABS.map(([id, name]) => `<button type="button" data-tab="${id}" data-name="${name}">${svg(id)}<span>${name}</span></button>`).join('')}</nav>
      </div>
    </div>
    <p class="phone-hint">Tab or Esc to put it away</p>`;
  const body = el.querySelector('[data-body]');
  // Fitting a new screen (at a workbench): peel the cracked glass off shard by shard. The live
  // cracks stay on top of the shards, so a careless tap still shocks you.
  let shards = null;
  const repairEl = el.querySelector('[data-repair]');
  function renderRepair() {
    repairEl.hidden = !shards;
    if (!shards) { repairEl.innerHTML = ''; return; }
    repairEl.innerHTML = `<p class="repair-tip">Peel the old glass away, piece by piece. Don't touch the live cracks. <b>${shards.filter(Boolean).length} left</b></p>
      ${shards.map((sh, i) => sh ? `<button type="button" class="shard" data-shard="${i}" style="left:${sh.x}%;top:${sh.y}%;--r:${sh.r}deg"></button>` : '').join('')}`;
  }

  function renderBuild() {
    const placing = g.placing();
    const cards = g.builder.available().map((p) => {
      const cost = g.costFor(p.id), poor = g.lumen() < cost, on = placing === p.id;
      const tip = poor ? `You need <b>${cost - g.lumen()} more Lumen</b> for this.` : `Costs <b>${cost} Lumen</b>. Click, then aim at the water from the surface and left-click to place.`;
      return `<button type="button" class="pcard piece${on ? ' on' : ''}${poor ? ' poor' : ''}" data-pick="${p.id}" data-tip="${esc(tip)}">
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
      const why = owned ? 'Already researched.' : [
        ...r.needs.filter((id) => !g.research.complete(id)).map((id) => `Complete the ${SPECIES.find((s) => s.id === id).name} codex entry (scan more of them).`),
        ...(g.research.data < r.cost ? [`Earn ${r.cost - g.research.data} more Data by scanning.`] : []),
        ...(at ? [] : ['Stand next to a research station.']),
      ].join('<br>') || `Ready: costs <b>${r.cost} Data</b>.`;
      return `<div class="pcard${owned ? ' done' : ''}" data-tip="${esc(why)}"><div class="row"><b>${r.name}</b></div><p>${r.desc}</p><div class="needs">${needs}</div>${action}</div>`;
    }).join('');
    return `<div class="label pad">Research</div>
      ${at ? '<p class="sub cyan">Linked to your research station.</p>' : '<p class="note">Not linked. Stand next to a research station on your raft to research.</p>'}
      <div class="plist">${cards}</div>`;
  }

  function renderCodex() {
    const done = SPECIES.filter((s) => g.research.complete(s.id)).length;
    const grid = SPECIES.map((s) => {
      const n = g.research.counts[s.id] || 0;
      const tip = n ? `${s.name}: ${n} of ${s.need} scans${n >= s.need ? ' (complete)' : ''}.` : 'Not found yet. Find it and scan it with the Echo Lens.';
      return `<div class="cchip${n ? '' : ' dim'}" data-tip="${esc(tip)}"><i style="background:${n ? SPECIES_TINT[s.id] : 'var(--track)'}"></i><b>${n ? s.name : '???'}</b><span>${n}/${s.need}</span></div>`;
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
    const TIPS = {
      Health: 'Heals slowly while you\'re fed and have breath. At zero you black out and drop your bag.',
      Breath: 'Drains underwater and refills at the surface. When it runs out you start losing health.',
      Food: `Drains over time. Eat (${k('eat')}) to keep it up; your health only heals while you're fed.`,
    };
    const meter = (name, v, cls) => `<div class="meter" data-tip="${esc(TIPS[name] || `Shots left before it breaks. Repair it at a workbench with ${GEAR.harpoon.repair} kelp.`)}"><div class="row"><span class="label">${name}</span><b>${Math.round(v)}</b></div><div class="bar"><div class="fill ${cls}" style="width:${v}%"></div></div></div>`;
    const items = Object.keys(ITEMS).filter((k) => bag[k]).map((k) => {
      const it = ITEMS[k];
      return `<div class="pcard" data-tip="${esc(`${it.name}: +${it.food} food${it.health ? `, ${it.health > 0 ? '+' : ''}${it.health} health` : ''}.${it.health < 0 ? ' Cook it at a cook fire first.' : ''}`)}"><div class="row"><b>${it.name} <span class="muted">×${bag[k]}</span></b>
        <button type="button" class="btn small" data-eat="${k}">Eat</button></div>
        <p>+${it.food} food${it.health ? `, ${it.health > 0 ? '+' : ''}${it.health} health` : ''}</p></div>`;
    }).join('');
    const sys = g.systems, pct = Math.round(sys.integrity * 100);
    const sysRows = SYSTEMS.map((x) => {
      const on = sys.online(x.id), pr = sys.progress(x), rdy = sys.isReady(x.id);
      return `<li class="${on ? 'ok' : ''}" data-tip="${esc(on ? `${x.name}: back online.` : `<b>${x.name}</b>: damaged. ${x.fault}.<br>Fix: ${x.how}.`)}">
        <span class="tick">${on ? '✓' : '!'}</span><div><b>${x.name}</b>
        <p>${on ? 'Online' : rdy ? `<span class="gold">Part ready: press ${keyName('rewire')} to rewire it</span>` : `${x.how}${pr.need > 1 ? ` <small>${pr.have} / ${pr.need}</small>` : ''}`}</p></div></li>`;
    }).join('');
    const su = g.suit, pw = Math.round(su.power);
    const battery = `<div class="pcard" data-tip="${esc(`Runs your HUD. As it drains, navigation, then the depth gauge, readouts and vitals shut off. Recharges on a raft deck (fast) or at the surface (slowly). Power cells from salvage pods make it last longer.`)}">
        <div class="row"><b>Visor battery</b><span class="small ${pw <= 30 ? 'gold' : 'cyan'}">${pw}%</span></div>
        <div class="bar" style="margin-top:8px"><div class="fill ${pw <= 30 ? 'gold-bg' : ''}" style="width:${pw}%"></div></div>
        <p>Power cells fitted: ${su.cells} of ${CELLS.length}. Recharges on a raft deck, or slowly at the surface.</p>
        <div class="row" style="margin-top:10px"><button type="button" class="btn small" data-charge ${pw >= 100 || g.lumen() < POWER.lumenCost ? 'disabled' : ''}>Charge +${POWER.lumenCharge}% · ${POWER.lumenCost} Lumen</button></div>
      </div>`;
    return `${battery}<div class="collection systems" data-tip="The flood damaged your visor. Each system comes back online when you reach its milestone.">
        <div class="row"><span class="label">Visor systems</span><span class="small ${pct === 100 ? 'cyan' : 'gold'}">${pct}% restored</span></div>
        <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
        <ol class="tutlist">${sysRows}</ol>
      </div>
      <div class="label pad">Status</div>
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
    const cards = p.achievements.map((a) => `<div class="pcard${a.tier ? ' done' : ''}" data-tip="${esc(`Next tier at <b>${a.goal}</b>. It pays <b>${a.reward} Bloom points</b> to spend on Skills.`)}">
        <div class="row"><b>${a.name}</b><span class="small gold">+${a.reward} Bloom</span></div>
        <p>${a.desc}</p>
        <div class="bar"><div class="fill" style="width:${a.progress * 100}%"></div></div>
        <div class="row small muted" style="margin-top:6px"><span>${a.value} / ${a.goal}</span><span>${a.tier} tier${a.tier === 1 ? '' : 's'} done</span></div>
      </div>`).join('');
    return `<div class="label pad">Goals</div>
      <p class="sub">Every goal has endless tiers. Each tier pays Bloom points to spend on Skills.</p>
      <div class="plist">${cards}</div>`;
  }

  function skillTip(n, pts) {
    if (n.rank >= n.max) return 'Mastered: every rank learned.';
    if (!n.unlocked) return `Learn ${n.requires.join(' and ')} first.`;
    if (pts < n.cost) return `Needs <b>${n.cost} Bloom points</b>; you have ${pts}. Finish Goal tiers to earn more.`;
    return `Spends <b>${n.cost} Bloom points</b> (not Lumen). Each rank costs a little more.`;
  }

  // The tutorial checklist and the how-to pages.
  function renderGuide() {
    const t = g.tutorial, cur = t.current();
    const done = STEPS.filter((s) => t.done(s)).length;
    const steps = STEPS.map((s) => {
      const ok = t.done(s), now = s === cur, pr = t.progress(s);
      return `<li class="${ok ? 'ok' : now ? 'now' : ''}"><span class="tick">${ok ? '✓' : now ? '›' : ''}</span><div><b>${s.title}${!ok && pr.need > 1 ? ` <small>${Math.floor(pr.have)} / ${pr.need}</small>` : ''}</b>${now ? `<p>${s.how(keyName)}</p>` : ''}</div></li>`;
    }).join('');
    const ctl = t.skipped ? '<button type="button" class="btn small" data-tut="resume">Show the tutorial again</button>'
      : t.finished ? '<button type="button" class="btn small" data-tut="restart">Start the tutorial again</button>'
      : '<button type="button" class="btn small ghost" data-tut="skip">Skip the tutorial</button>';
    return `<div class="collection">
        <div class="row"><span class="label">Tutorial</span><span class="small muted">${done} / ${STEPS.length} done</span></div>
        <div class="bar"><div class="fill" style="width:${(done / STEPS.length) * 100}%"></div></div>
        <ol class="tutlist">${steps}</ol>
        <div class="row">${ctl}</div>
      </div>
      ${(() => {
        const found = g.logs();
        return `<div class="label pad">Echo's logs <small class="muted">${found.length} / 6</small></div>
          <div class="plist">${found.length ? found.map((l) => `<div class="pcard"><b>${l.title}</b><p>${l.text}</p></div>`).join('') : '<p class="sub">Corrupted fragments of Echo\'s memory lie in violet-banded salvage pods around the reef.</p>'}
          ${found.length === 6 ? `<div class="pcard done"><b>Echo's memory</b><p>${g.fullMemory}</p></div>` : ''}</div>`;
      })()}
      <div class="label pad">How to</div>
      <div class="plist">${GUIDES.map(([title, text], i) => `<details class="pcard guide"${i === 1 ? ' open' : ''}><summary><b>${title}</b></summary><p>${text()}</p></details>`).join('')}</div>`;
  }

  // Skill trees bought with Bloom points.
  function renderSkills() {
    const p = progress.snapshot();
    const trees = p.trees.map((t) => `<div class="label pad">${t.name}</div>
      <div class="plist">${t.nodes.map((n) => `<div class="pcard${n.rank ? ' done' : ''}${n.unlocked ? '' : ' locked'}" data-tip="${esc(skillTip(n, p.points))}">
          <div class="row"><b>${n.name}</b><span class="small ${n.rank ? 'cyan' : 'muted'}">${n.rank} / ${n.max}</span></div>
          <p>${n.desc}</p>
          ${n.requires.length ? `<div class="needs">${n.requires.map((r) => `<span class="chip ${n.unlocked ? 'ok' : 'dim'}">Needs ${r}</span>`).join('')}</div>` : ''}
          ${n.rank >= n.max ? '<span class="owned">Mastered</span>'
            : `<button type="button" class="btn small" data-buy="${n.id}" ${n.can ? '' : 'disabled'}>Learn · ${n.cost} Bloom</button>`}
        </div>`).join('')}</div>`).join('');
    return `<div class="note">${p.points} Bloom points to spend. Earn more from Goals.</div>${trees}`;
  }

  // The map: the seabed you've explored, with a waypoint you set by tapping it.
  let mapZoom = 'all', mapXf = null;
  function renderMap() {
    const v = g.mapView(), pct = Math.round(g.reveal.explored * 100);
    return `<div class="row"><span class="label">Map</span><span class="small muted">${pct}% explored · reef ${Math.round((v.reefRestored || 0) * 100)}% restored</span></div>
      <canvas class="map" data-map width="680" height="680" data-tip="Tap to set a waypoint (it shows on your compass). Fog hides what you haven't swum near yet."></canvas>
      <div class="row">
        <button type="button" class="btn small ghost" data-zoom>${mapZoom === 'all' ? 'Zoom in' : 'Whole atoll'}</button>
        ${v.waypoint ? `<span class="small gold">Waypoint ${Math.round(Math.hypot(v.waypoint.x - v.you.x, v.waypoint.z - v.you.z))} m</span><button type="button" class="btn small ghost" data-clearwp>Clear</button>` : '<span class="small muted">Tap the map to set a waypoint</span>'}
      </div>
      <p class="sub"><span class="mk" style="background:#F4EEE6"></span>Echo <span class="mk" style="background:#5CF2D6"></span>pods <span class="mk sq" style="background:#C9A36A"></span>rafts <span class="mk sq" style="background:#FF9A5C"></span>outpost <span class="mk sq" style="background:#B8A07A"></span>wrecks. Dashed rings: Echo's signal and your buoys' reach.</p>`;
  }
  let mapTimer = 0;
  function paintMap() {
    const cv = body.querySelector('[data-map]');
    if (!cv) { clearInterval(mapTimer); mapTimer = 0; return; }
    mapXf = drawMap(cv, g.reveal, { ...g.mapView(), zoom: mapZoom });
    // Redraw now and then while it's open, so the water damage flickers.
    if (!mapTimer) mapTimer = setInterval(() => { if (tab === 'map' && el.classList.contains('up')) paintMap(); else { clearInterval(mapTimer); mapTimer = 0; } }, 450);
  }

  // An app the flood washed away: an empty, broken page until you find its module.
  const missing = (id) => APPS.some((a) => a.id === id) && !g.hasApp(id);
  function renderMissing(id) {
    const app = APPS.find((a) => a.id === id);
    const found = APPS.filter((a) => g.hasApp(a.id)).length;
    return `<div class="missing-app">
        <div class="glyph">${svg(id)}</div>
        <p class="label">App missing</p>
        <h3>${app.name}</h3>
        <p class="sub">The flood washed this app out of your phone. Its module is somewhere on the reef in a salvage pod: look for a blinking capsule under a thin beam of light, and listen for its ping. Swim into it to put the app back.</p>
        <p class="note">Last signal: ${app.where}</p>
        <p class="small muted">${found} of ${APPS.length} apps recovered</p>
      </div>`;
  }

  const RENDER = { build: renderBuild, research: renderResearch, codex: renderCodex, map: renderMap, status: renderStatus, goals: renderGoals, skills: renderSkills, guide: renderGuide };

  function render() {
    el.style.setProperty('--crack', g.systems.online('visor') ? 0 : Math.max(0.15, 0.6 - g.systems.integrity * 0.5));
    const fixed = g.phoneFixed();
    el.classList.toggle('fixed', fixed);
    el.classList.toggle('sealed', fixed || g.systems.online('visor')); // fixed glass can't shock you
    if (fixed) el.style.setProperty('--crack', 0);
    el.querySelector('[data-lumen]').textContent = g.lumen().toLocaleString();
    el.querySelector('[data-data]').textContent = `${g.research.data} Data`;
    el.querySelector('[data-bloom]').textContent = `${progress.points()} Bloom`;
    el.querySelector('[data-bagchip]').textContent = `Bag ${g.survival.bagCount}/${bagSize()}`;
    el.querySelectorAll('[data-tab]').forEach((b) => {
      const gone = missing(b.dataset.tab);
      b.toggleAttribute('aria-current', b.dataset.tab === tab);
      b.classList.toggle('missing', gone);
      b.querySelector('span').textContent = gone ? 'Missing' : b.dataset.name;
      b.dataset.tip = gone ? `<b>${b.dataset.name}: missing</b><br>The flood washed this app away. Find its salvage pod on the reef to get it back.` : TAB_TIPS[b.dataset.tab]();
    });
    const scroll = body.scrollTop;
    const wet = g.suit.phoneWet;
    el.classList.toggle('wet', wet > 0.2);
    el.style.setProperty('--wet', wet.toFixed(2));
    const banner = wet > 0.2 ? '<p class="moisture">Moisture detected: taps may misread and apps may crash. Dry the phone at a cook fire (or leave it on a raft deck).</p>' : '';
    body.innerHTML = banner + (missing(tab) ? renderMissing(tab) : RENDER[tab]());
    if (tab === 'map') paintMap();
    body.scrollTop = scroll;
  }

  el.addEventListener('click', (e) => {
    const cv = e.target.closest?.('[data-map]');
    if (cv && mapXf) {
      const r = cv.getBoundingClientRect(), k = cv.width / r.width;
      g.onWaypoint(mapXf.toWorld((e.clientX - r.left) * k, (e.clientY - r.top) * k));
      render();
      return;
    }
    const b = e.target.closest('button');
    if (!b) return;
    if ('zoom' in b.dataset) { mapZoom = mapZoom === 'all' ? 'near' : 'all'; render(); return; }
    if ('clearwp' in b.dataset) { g.onWaypoint(null); render(); return; }
    // Water in the phone: sometimes a tap lands on the wrong button.
    const wet = g.suit.phoneWet;
    if (wet > 0.2 && !b.dataset.redirected && Math.random() < wet * 0.35) {
      const others = [...el.querySelectorAll('button:not([disabled])')].filter((x) => x !== b);
      const other = others[(Math.random() * others.length) | 0];
      if (other) {
        g.onMisread?.();
        other.dataset.redirected = '1';
        other.click();
        delete other.dataset.redirected;
        return;
      }
    }
    if (b.dataset.tab) { tab = b.dataset.tab; body.scrollTop = 0; render(); return; }
    if (b.dataset.pick) { g.onPick(b.dataset.pick); return; }
    if ('stop' in b.dataset) { g.onStopBuilding(); render(); return; }
    if (b.dataset.research) { g.onResearch(b.dataset.research); render(); return; }
    if (b.dataset.eat) { g.onEat(b.dataset.eat); render(); }
    if (b.dataset.buy) { g.onBuy(b.dataset.buy); render(); }
    if (b.dataset.tut) { g.onTutorial(b.dataset.tut); render(); }
    if (b.dataset.shard && shards) {
      shards[Number(b.dataset.shard)] = null;
      g.onShard?.();
      if (!shards.some(Boolean)) { shards = null; g.onRepaired(); render(); }
      renderRepair();
      return;
    }
    if ('charge' in b.dataset) { g.onCharge(); render(); }
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
    /** Starts fitting the new screen. */
    startRepair() {
      shards = Array.from({ length: 6 }, () => ({ x: 8 + Math.random() * 70, y: 14 + Math.random() * 62, r: Math.round(Math.random() * 360) }));
      renderRepair();
    },
    get repairing() { return !!shards; },
    /** An app crashes back to the home screen (water in the phone). */
    crash() {
      tab = 'build';
      el.classList.remove('crashed'); void el.offsetWidth; el.classList.add('crashed');
      render();
    },
  };
}
