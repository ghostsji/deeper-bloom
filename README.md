# Deeper Bloom

Deep Bloom 2: a first-person dive through the glowing reef. Desktop only, fullscreen, mouse and keyboard.

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
- `npm run smoke`: boots the real game in an off-screen Electron window with a throwaway profile (your save is never touched), then starts a new game, swims, opens every phone tab, scans, climbs a raft, earns goals, learns a skill, saves, pauses, saves to a slot, opens every Options tab, rebinds a key, goes to the main menu and loads the slot back. Fails on any page error.

## Menus

Main menu: Continue (your last game), New game (asks first if it would replace one), Load game, Save game, Options, Exit. Save slots (three) are files in the app's user data folder (`saves/slot1.json`...; in a browser, localStorage). Pause (Esc or P): Resume, Save game, Options, Main menu, Quit to desktop. Loading or starting over lands on a "Ready to dive" card, since the mouse can only be captured after a click.
Options has four tabs: Sound, Echo's voice, Controls (look sensitivity, invert mouse Y, every key rebindable, swapping when a key is taken) and Display (fullscreen, start in fullscreen). Menu buttons have hover and click sounds, and the main menu has its own music.

## Help

A tutorial card (top right) walks through 14 tasks one at a time: look, swim, gather Lumen, open the phone, scan, surface, build a raft, climb aboard, find food, eat, build a research station, research, use the harpoon and learn a skill. Each shows how, with your current key bindings, and ticks off when you've done it (things already done are skipped). The phone's **Guide** tab has the checklist, Skip / Start again, and how-to pages for everything. Hover almost anything on the phone, menus or Options for a tooltip. Both can be turned off in Options → Display & help. Steps live in `src/tutorial.js`, tooltips in `src/tooltips.js` (any element with `data-tip`).

## The visor

The HUD is your dive visor, and the flood damaged it: cracked glass, static, flickering vitals, scrambled readouts, Echo's subtitles breaking up and no compass. Eight systems come back online as you make progress, each with a reboot flash and power-up sound (damaged systems crackle when they glitch, the visor buzzes when it shorts out, and a low electrical hum (plus an air whistle through the cracks) runs under everything until it is fixed; all at the Effects volume, unmuffled since it is in your helmet): Vital signs (eat something), Echo link (scan Echo), Lumen & Data readout (gather 15 polyps), Depth gauge (swim 150 m), Scanner overlay (scan 5 things), Navigation (build a research station: a compass with Echo, your raft and your dropped satchel), Threat sensor (cure an eel: eels show on the compass) and Visor seal (finish 2 research projects: the cracks go). SYS % (bottom left) and the phone's Status tab show what's left; the phone's own screen is cracked too until the visor is fixed. Milestones and effects live in `src/hud-systems.js` and `src/hud-fx.js`.

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
