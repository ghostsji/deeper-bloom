# Deeper Bloom

Deep Bloom 2: a first-person dive through the glowing reef. Desktop only, fullscreen, mouse and keyboard.

## Download

Get the Windows build from [Releases](https://github.com/ghostsji/deeper-bloom/releases/latest): download `DeeperBloom-win32-x64.zip`, unzip it anywhere and run `Deeper Bloom.exe`. Windows SmartScreen may warn because the exe isn't signed: choose *More info → Run anyway*.

The game is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md): free to play, study, mod and share for noncommercial purposes; selling it needs permission. The zip includes the license as `LICENSE.md`. Echo's voice clips aren't covered (see [License](#license)).

## Run

```bash
npm install
npm start
```

Desktop app (the way to play; fullscreen unless you turn that off in Options → Display): `npm run desktop`. F11 toggles fullscreen (in a browser too), F12 opens devtools, **Exit** on the main menu or **Quit to desktop** on the pause menu closes it.

Standalone build: `npm run package` makes `dist/Deeper Bloom-win32-x64/` (run `Deeper Bloom.exe`, no Node needed) and a zip of it. `npm run smoke -- --packaged` tests that build.

Or in a browser: open http://localhost:5174 and click **New game** (it needs a local server because it uses ES modules). Add `?debug` to expose `db` (renderer, scene, camera, world) in the console.

## Checks

Run these before committing (from PowerShell or cmd):

```bash
npm run verify
```

- `npm run check`: parses every game, Electron and tool file the way the browser and Electron will (catches syntax slips that would break the game at startup).
- `npm test`: unit tests for progression and survival (`test/*.test.js`, Node's built-in test runner).
- `npm run smoke`: boots the real game in an off-screen Electron window with a throwaway profile (your save is never touched), then starts a new game, swims, opens every phone tab, scans, climbs a raft, earns goals, learns a skill, saves, pauses, saves to a slot, opens every Options tab, rebinds a key, goes to the main menu and loads the slot back. Fails on any page error. It always uses world seed 7, so its checks are repeatable (`$env:SMOKE_SEED=123` tries another world; in debug runs `DEEPER_BLOOM_SEED` fixes the seed for new games).

## The world

Every new game generates its own world from a seed (saved with the game; older saves keep seed 7). The atoll is about 2.4 km across (radius 1190 m), 8 times the area of the 840 m atoll it replaced and over 100 times the old reef. Round Echo the familiar reef stays the same in every world; beyond it the seabed is noise-generated: rolling plains, shallow banks that rise close to the surface, kelp forests at middling depths, and long trenches down to 60 m, far below the safe depth for a cracked visor. The atoll's walls break the surface at the edge. `src/layout.js` places everything that used to be hand-built from the same seed, with spacing and depth rules: the outpost (on flat sand, 22-38 m down, 110-210 m out, with three live cables round it), fourteen wrecks, twenty cables, twenty-four currents, twelve sinkholes, fifty-six gas vents, eighteen corrupted map regions and the app pods (Codex close by, the others further and further out, the farthest within 450 m). Life is scattered over the whole seabed (1760 polyps, 2170 coral, 2500 rocks, 634 kelp forests, 153 jellies, 256 silverfin, 14 eels; 40 anglerfish and 100 abyssal polyps in the trenches). The camera only draws what the fog leaves visible (150 m underwater, 450 m in the air); the seabed is cut into 100 tiles that are culled out of view, and everything scattered on it lives in 120 m chunks that are taken out of the scene when they're out of sight, so the world stays fast. The Map app's fog-of-war grid is 256 x 256 (about 9 m a square); a map saved from the smaller world starts afresh.

**The Map app** (phone): the seabed drawn from the real terrain and coloured by depth, under fog of war: everything within about 30 m of where you swim is revealed and saved. Markers for you (with your heading), Echo and her signal range, your rafts and glow buoys (with their relay range), your satchel, and pods, wrecks and the outpost once you've been near them. Tap to set a waypoint: it shows on the compass with its distance and clears when you reach it. Zoom between the whole atoll and the 240 m around you. See `src/map.js`.

**Map damage**: the map flickers (less as the visor is repaired), a dead zone of static hides the outpost's area until Navigation is back, and eighteen seeded regions show the seabed from somewhere else (tinted pink) until you swim into them or sweep them with sonar. **Sonar** (**Z**, 3% battery, every 4 s): a ring sweeps out, the fog thins for a moment, pods, creatures and deep life within 90 m are outlined on the visor, and the map fills in and repairs around you, but it wakes eels nearby and sometimes the giant answers. **The deep** (below about 40 m): the cold fogs the visor much faster, abyssal polyps (violet) pay 12 Lumen, crushed wreckage lines the trenches, and anglerfish hang in the dark with lures that look like polyps (`src/deep.js`).

**Storms** (`src/weather.js`): clear spells of 3-6 minutes, then a storm builds, rages for 1.5-3 minutes and fades. Rain cuts solar charging by up to 80%, rafts pitch and roll, the water near the surface gets rough, and lightning strikes the water and your rafts every 6-16 s: close to a strike at the surface, or on the struck raft, it shocks you hard (6 health). **Tides** lift and drop the water 2.2 m twice a day (shown under the depth): `SURFACE_Y` is now a live binding the tide moves (the seabed is shaped around a fixed `SEA_LEVEL`), so at low tide the highest banks come up as islands and rafts over them run aground, and at high tide sinkholes pull harder. **Reef restoration** (`src/reef.js`): patches of the open seabed are dead (bleached coral, grey on the map, from the seed); **T** plants a coral seedling (5 Lumen) and three bring a patch back: the bleached coral goes, glowing polyps grow, and the blight on your visor recedes while you're there. The map shows how much you've restored.

## Menus

Main menu: Continue (your last game), New game (asks first if it would replace one), Load game, Save game, Options, Exit. Save slots (three) are files in the app's user data folder (`saves/slot1.json`...; in a browser, localStorage). Pause (Esc or P): Resume, Save game, Options, Main menu, Quit to desktop. Loading or starting over lands on a "Ready to dive" card, since the mouse can only be captured after a click.
Options has four tabs: Sound, Echo's voice, Controls (look sensitivity, invert mouse Y, every key rebindable, swapping when a key is taken) and Display (fullscreen, start in fullscreen, and **Performance**: render distance 60-250 m underwater, three times that in the air, with the fog thickening to match; scenery distance 40-300 m, how far out coral, rocks, polyps and fish are kept; chunk size 40-240 m; and a frame-rate counter). Menu buttons have hover and click sounds, and the main menu has its own music. **Accessibility** (Display & help): *Readable text* stops Echo's lines and the visor readouts being scrambled (the cracks, static and hum stay); *Reduce flashing and shaking* turns lightning, shocks, reboots and glitches into soft fades with no screen shake, and follows the system's reduced-motion setting until you choose. Even with Readable text off, Echo's lines arrive broken up and decode after a moment, so what she says can always be read. Every button shows a visible keyboard focus ring. Underwater the music warps (two wobbling delay lines bend the pitch like a warped tape, a soft overdrive grits it up, and a resonant lowpass sweeps slowly and darkens with depth); above the water and on the menus it plays clean.

## Help

A tutorial card (top right) walks through 14 tasks one at a time: look, swim, gather Lumen, open the phone, scan, surface, build a raft, climb aboard, find food, eat, build a research station, research, use the harpoon and learn a skill. Each shows how, with your current key bindings, and ticks off when you've done it (things already done are skipped). The phone's **Guide** tab has the checklist, Skip / Start again, and how-to pages for everything. Hover almost anything on the phone, menus or Options for a tooltip. Both can be turned off in Options → Display & help. Steps live in `src/tutorial.js`, tooltips in `src/tooltips.js` (any element with `data-tip`).

## The visor

The HUD is your dive visor, and the flood damaged it: cracked glass, static, flickering vitals, scrambled readouts, Echo's subtitles breaking up and no compass. Eight systems come back online as you make progress, each with a reboot flash and power-up sound (damaged systems crackle when they glitch, the visor buzzes when it shorts out, and a low electrical hum (plus an air whistle through the cracks) runs under everything until it is fixed; all at the Effects volume, unmuffled since it is in your helmet): Vital signs (eat something), Echo link (scan Echo), Lumen & Data readout (gather 15 polyps), Depth gauge (swim 150 m), Scanner overlay (scan 5 things), Navigation (build a research station: a compass with Echo, your raft and your dropped satchel), Threat sensor (cure an eel: eels show on the compass) and Visor seal (finish 2 research projects: the cracks go). The broken glass has shattered impact points with stress rings, shadowed cracks that glint, colour bleeds and dead pixels where water got into the display, a stuck pixel row, and water sloshing along the bottom of the visor with drops running down it. The cracks are live: click one (on the visor when the mouse is free, or on the phone's cracked screen) and it shocks you, with a lightning burst, a flash, a jolt, a zap and 3 health lost (the click doesn't reach whatever is under the crack). It also stuns you for 2.5 s (no swimming, harpoon, lens or using things; the view lolls and the mouse barely turns it; the world goes grey) and you sink, and it knocks the phone offline for 6 s: if it was open it dies in your hand and drops away, and Tab says it's rebooting. Fixing the Visor seal makes the glass safe. SYS % (bottom left) and the phone's Status tab show what's left; the phone's own screen is cracked too until the visor is fixed. Milestones and effects live in `src/hud-systems.js` and `src/hud-fx.js`.

## Battery, pressure and live electricity

- **Visor battery** (PWR, bottom left): drains as you play (about 8 minutes from full). At 30% navigation shuts off, then the depth gauge (20%), Lumen/Data readouts (12%) and vitals (5%); at 0% Echo's subtitles go. Recharges fast on a raft deck and slowly at the surface, or buy 25% for 5 Lumen on the Status app. Two **power cells** lie in gold-banded salvage pods beside live cables; each makes the battery last 30% longer.
- **Pressure**: below 20 m an unsealed visor strains (GLASS STRAIN under the depth, creaking glass). New cracks draw themselves across it at 35%, 70% and 100%; at full strain it leaks: water fills the visor from the bottom, with bubbles, and your breath runs out much faster. Go shallower to ease it, surface to drain it, fix the Visor seal to stop it for good.
- **Live electricity**: three jellies carry a charge (pale, arcing) and three broken outpost cables lie on the sand with sparking ends. They crackle as you get close; touch one and it shocks you (4 health, stun, sink, phone reboot), and sinking stunned beside a cable can shock you again. With the Threat sensor they show on the compass (yellow), as do pods and cells once Navigation is back.

Logic in `src/suit.js` (unit tested), hazards in `src/hazards.js`.

## More suit trouble, hazards and the outpost

- **Running out of air** breaks the HUD down: tunnel vision, the cracks pulse red, readouts drop out, Echo's subtitles scramble, and near the end you see things that aren't there.
- **Fog**: cold deep water and heavy breathing fog the visor; hold **G** to purge it (a little battery). **Heat**: dashing and charging warm the suit (TEMP); overheat and the visor whites out and the battery drains twice as fast until the water cools you.
- **A wet phone** (after a shock or a leak): taps sometimes land on the wrong button, apps crash back to Build. Dry it at a cook fire.
- **Electric eels** (blue spots) charge up and discharge a ring out to 7 m. **Power surges** run down the cables every 40-80 s: the ends reach three times as far and nearby pods are cut off. **Silt** stirred up along the bottom clouds the water, jitters the compass and stops the lens locking on.
- **Rewiring**: a system's milestone now gets you its *part*; press **V** to open the visor panel and wire it in (each colour to its symbol, from a flickering, water-damaged diagram). A wrong socket shocks you.
- **The sunken outpost** (south-west, below the safe depth): find its three fuses (orange pods: behind the live floor grates, on the roof, out the back), fit them at the console with F, and the vault opens: the Pressure plate upgrade and two of Echo's logs.
- **Wrecks**: two sunken boats, each with a visor upgrade (Spark guard: half shock damage; Anti-fog coating: half fogging) and a log.
- **Echo's logs**: six violet pods; each plays a broken fragment, and the full set restores her memory of the flood (phone Guide).
- **Visor themes** unlock at SYS 100% (Options → Display & help).

## Blight, the deep, and Echo's reach

- **Blight**: eel bites smear blight on the visor; it spreads and darkens the readouts under it. Scrub it at a research station, or research the UV flush (G burns it off). **Tears**: bites can tear the suit (fog, a slow chill) until you patch them with kelp at a workbench. **Ears**: dropping fast builds pressure (whine, muffle, red edges, then pain); **H** equalises. **Short circuits**: after a leak the wet visor mirrors the compass, swaps your bars, or shows a false depth.
- **Night and day** (8-minute days, clock under the depth): at night the water goes dark, the visor light comes on (battery), eels see further and the giant passes more often. **Currents** on the east and west edges push you; a **sinkhole** south of the reef drags you down; **gas vents** give breath, fog the glass and throw you up. A **giant shape** passes beyond the fog every few minutes (closer once you have all of Echo's logs).
- **Echo's signal** (ECHO bars, top left) fades with distance from her pearl: her lines break up, arrive late, then stop. Glow buoys relay it 35 m. **Grow her pearl** with Lumen (F at the pearl: 25, 50, 100): more range and a brighter reef.
- **The outpost's rooms** (with power): the generator burns kelp (fuel runs down; no fuel, no power); the lab bench crafts a blight filter, a seal patch kit and a battery booster; the radio, once you have all six of Echo's logs, calls for help: the ending.
- **A new phone screen** lies in the second wreck's stern: fit it at a workbench by peeling off the cracked glass without touching the live cracks. No more phone shocks, and its colours come back.

## Lost phone apps

The flood washed the Codex, Status, Goals and Skills apps out of your phone: their tabs show as Missing (with a last-signal hint) until you find them. Each module lies on the reef in a salvage pod: a blinking capsule under a thin beam of light with a bright core, a sonar ring pulsing across the sand, and a ping that gets faster and louder as you close in (within about 30 m). Skills is in a far kelp patch where eels nest. Once Navigation is restored, pods show on the compass. Swim into a pod to put its app back. Build, Research and Guide are never lost. See `src/salvage.js`.

## Controls

WASD swim (toward where you look) · mouse look · Space rise (jump on a raft) · Ctrl or C sink · Q/E turn · Shift dash · 1 harpoon · Tab phone · hold right mouse Echo Lens · F use · R eat · X stop building · Esc or P pause.
Tab brings up your phone (Deep Bloom's app in a dive case; the game pauses): Build, Research, Codex and Status tabs. Hold right mouse to raise the Echo Lens and hold left mouse on a creature, coral or plant to scan it into the codex and earn Data. Research only works with the phone linked to a Research station (stand next to one, or press F at it). See DESIGN.md for where the game is heading.
Survival: breath drains underwater (refills at the surface), food drains over time, and health regenerates only while you're fed and breathing. Underwater, left-click grabs a silverfin in front of you (glide in slowly or they bolt) or strips the kelp you're aiming at. Build a Cook fire and press F at it to cook, a Kelp farm to grow kelp, and press R to eat. If health hits zero you black out, wake on your nearest raft, and your bag drops where you fell (swim to the gold ring to get it back).
Combat: press 1 to raise the harpoon and left-click to fire; the spear reels back on its line before you can fire again. Each shot wears it (30 shots); repair it at a Workbench with 2 kelp. Blighted eels nest in some kelp patches and hunt you when you swim close; they can't follow you onto a raft. Three hits burn the blight out of one and leave eel meat (cook it). The harpoon also spears silverfin.
Echo's voice: her lines ship as seven built-in voice packs in `assets/voice/<pack>/` (Sonia, Libby, Aria, Jenny, Natasha, Clara and Ryan neural voices, slowed to -18%, made with `npm run voices`; `-- --pack aria` makes one) and play through a live FX rack (lowpass + reverb). Options has Sound (master, music, effects and ambience, menu sounds, mute) and, under Echo's voice, the Black Relay voice studio's controls: a grouped Voice list (the built-in packs, the neural voice studio, each system voice by name, or off), any of Microsoft's ~320 neural voices (desktop app only; generated on demand through Edge's read-aloud service and cached in the app's user data folder), rate, pitch, volume, pause between lines, and the FX rack (room size, wet, damping, dry, cutoff) with a Preview button. After changing a line in `src/echo-lines.js`, run `npm run voices` to make its file (`-- --force` remakes all). Each pack's `manifest.txt` is in the studio's batch format if you'd rather generate the set there; keep its FX dry, since the game adds FX live.
Progression: Goals (19 achievement lines with endless tiers: Lumen, polyps, scans, fish, kelp, eels, building, distance, time underwater, cooking, meals, harpoon hits, depth, rare finds, Data, Lumen spent, blackouts, skills) pay Bloom points, spent in Skills: eight trees (Diver gear, Combat, Loot, Sea life, Rarity, Survival, Research, Building) whose ranks change the game. Polyps, silverfin and eels roll a rarity (Common to Mythic) that multiplies what they pay; the Rarity tree improves the odds. Both phones have Goals and Skills tabs. Tune it all in `src/progress.js`.
Building: pick a piece on the phone's Build tab, then at the surface aim at the water, left-click to place and right-click to take it back (refunds what you paid). The wheel switches pieces, X stops building. Swim into a raft to climb onto it. Lumen and builds are saved in the browser.
If the browser refuses pointer lock (embedded previews), the free cursor looks around and resting it near an edge keeps turning.

## Layout

- `src/main.js`: renderer, bloom post-processing, game states, pause menu, fullscreen and pointer lock, Echo's lines, game loop
- `src/menus.js`, `src/saves.js`: the main menu, save and load slots, and the new-game check
- `src/controls.js`: rebindable keys
- `src/world.js`: the Shallows (seafloor, kelp, coral, polyps, lantern fish, jellies, Echo's pearl)
- `src/player.js`: swimming, treading water, walking on rafts, mouse-look
- `src/build.js`: grid building on the water surface
- `src/research.js`: Echo Lens scanning, codex entries and the research tree
- `src/survival.js`: breath, health, food, the bag, eating and cooking
- `src/phone.js`: the in-game phone (build, research, codex, status, goals, skills)
- `src/progress.js`: endless achievements, skill trees, rarity rolls (every bonus is read with `perk()`)
- `src/combat.js`: the harpoon (view model, spear, line) and blighted eels
- `src/echo-lines.js`: everything Echo says
- `src/voice.js`, `src/voice-settings.js`, `src/settings.js`: Echo's voice (bundled, live neural, system) and the Options screen
- `electron/tts.cjs`: neural voice generation in the desktop app
- `electron/saves.cjs`, `electron/preload.cjs`: save slots as files, desktop preferences, and the page's bridge to them
- `tools/package.mjs`: the standalone build
- `tools/make-voices.mjs`: generates the bundled voice lines
- `src/audio.js`: synthesized Web Audio (Deep Bloom's "Sunlit reef" pad, bubble pops)

Three.js 0.170 is installed locally (no CDN), so it runs offline. `electron/main.cjs` is the desktop shell (serves the game from `app://game/`, no menu bar so Ctrl+W can't close it).

The Flutter shell (`../deeper_bloom_shell`) was an experiment and is retired: its menus now live in the game itself, and Electron is the one desktop app. The last game commit it works with is `a2be4df`.

## Getting around

**Ride the current** (fast travel): once Navigation is back (build a research station), the Map app lists places you know (Echo, your rafts, and the outpost once you've found it) with how far away they are. Pick one and you ride the reef's currents there in a fade, for 6% visor power (you need at least 10%). Places closer than 60 m aren't offered. The Guide tab has a page on it.

The controls hint at the start of a dive shows your own key bindings as keys, for 14 seconds; the tutorial and the phone's Guide cover the rest. Apps the flood took show as *Lost* in the phone's tab bar. *Into the deep* only counts depth you reach yourself (you start the game 19 m down), so it no longer pays out the moment you arrive.

## Looks and music

**Looks** (Options → Display & help → Look): a colour-grading shader over the 3D world (the HUD stays crisp on top). *Clean* (the default, no shader), *Deep cinema* (soft vignette, fine grain, lens fringing), *Bioluminescent* (richer colour, deeper blacks), *Murky water* (silty, green, close), *Old dive camera* (banded colour, scanlines, grain, colour bleed), *Sonar mono* (black and green) and *Shallows* (warm and sunlit). Every look is one shader with different settings (`src/looks.js`), so switching never stalls, and it costs no measurable frame rate. With Reduce flashing on, the grain holds still.

**Underwater music** (Options → Sound): *Sunlit reef* (the original), *Abyssal drone*, *Whale song*, *Glass garden*, *Tidepool* (with waves washing in and out) or *Ambience only*. All synthesized like the rest of the sound (`src/audio.js`); the main menu keeps its own theme, and whichever track you pick still warps underwater.

## First-run benchmark

The first time the game starts on a Windows account, a card over the title screen ("Tuning Deeper Bloom for this PC", about 15 seconds, skippable) benchmarks it. It measures the screen's refresh rate, then renders three demanding views (the reef round Echo, low over the open seabed far out, and above the water looking over the atoll) with the visor HUD showing, at each graphics preset from best to cheapest: **Ultra, High, Medium, Low, Very low** (resolution scale, glow, render distance, scenery distance and chunk size). It keeps the first preset that runs smoothly: an average of at least 55 fps with 15% headroom (or 92% of a slower screen's refresh rate, so a 60 Hz monitor isn't held against the PC) and no regular stutters. The result is saved with that account's settings, so it never runs again on its own.

Play adds more than the title screen can show (creatures, combat, the visor's glitches), so for the first minutes of play the game also watches the real frame rate: an 8-second stretch that isn't smooth steps the graphics down one preset (with a toast saying so); three smooth stretches in a row confirm the choice and the check stops for good. Changing any performance setting yourself stops it too, so your choice always wins.

Options → Display shows what the benchmark picked (and whether play confirmed it), has **Run the benchmark again**, and **Reset performance** goes back to the benchmark's choice. New settings there: **Resolution** (50-100%: the 3D world's pixel count; the HUD stays sharp) and **Glow (bloom)**. The logic is in `src/benchmark.js` (pure, unit-tested); debug runs skip the automatic benchmark unless the URL has `&bench`.

Performance notes from building it: the visor overlay was the biggest per-frame cost in play. The crack glints now animate as tiny composited elements instead of inside the full-screen crack SVG (which repainted the whole screen of cracks, with its shadow, every frame), the HUD only writes CSS variables when they change, and the fog blur and blight blobs only exist while you have them.

## License

Deeper Bloom is free to play, study, mod and share for noncommercial purposes under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). Selling it needs the author's permission. Echo's bundled voice clips (`assets/voice/`) were made with Microsoft neural voices and aren't covered by this license.
