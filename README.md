# Deeper Bloom

Deep Bloom 2: a first-person dive through the glowing reef. Desktop only, fullscreen, mouse and keyboard.

## Run

```bash
npm install
npm start
```

Desktop app (always fullscreen, mouse always locked): `npm run desktop`. F11 toggles fullscreen (in a browser too), F12 opens devtools, Esc then **Quit to desktop** exits.

Flutter shell: `../deeper_bloom_shell` hosts this same game in a Flutter Windows app (WebView2) with a native main menu, save slots as files, phone, pause menu and settings (key rebinding, mouse sensitivity, Echo's live voice); see its README. The page detects it with `?shell=flutter` (bridge in `src/shell.js`, rebindable keys in `src/controls.js`).

Or in a browser: open http://localhost:5174 and click **Dive** (it needs a local server because it uses ES modules). Add `?debug` to expose `db` (renderer, scene, camera, world) in the console.

## Checks

Run these before committing (from PowerShell or cmd):

```bash
npm run verify
```

- `npm run check`: parses every game, Electron and tool file the way the browser and Electron will (catches syntax slips that would break the game at startup).
- `npm test`: unit tests for progression and survival (`test/*.test.js`, Node's built-in test runner).
- `npm run smoke`: boots the real game in an off-screen Electron window with a throwaway profile (your save is never touched), then dives, swims, opens every phone tab, scans, climbs a raft, earns goals, learns a skill and saves. Fails on any page error.

## Controls

WASD swim (toward where you look) · mouse look · Space rise (jump on a raft) · Ctrl or C sink · Q/E turn · Shift dash · 1 harpoon · Tab phone · hold right mouse Echo Lens · F use · R eat · X stop building · Esc or P pause.
Tab brings up your phone (Deep Bloom's app in a dive case; the game pauses): Build, Research, Codex and Status tabs. Hold right mouse to raise the Echo Lens and hold left mouse on a creature, coral or plant to scan it into the codex and earn Data. Research only works with the phone linked to a Research station (stand next to one, or press F at it). See DESIGN.md for where the game is heading.
Survival: breath drains underwater (refills at the surface), food drains over time, and health regenerates only while you're fed and breathing. Underwater, left-click grabs a silverfin in front of you (glide in slowly or they bolt) or strips the kelp you're aiming at. Build a Cook fire and press F at it to cook, a Kelp farm to grow kelp, and press R to eat. If health hits zero you black out, wake on your nearest raft, and your bag drops where you fell (swim to the gold ring to get it back).
Combat: press 1 to raise the harpoon and left-click to fire; the spear reels back on its line before you can fire again. Each shot wears it (30 shots); repair it at a Workbench with 2 kelp. Blighted eels nest in some kelp patches and hunt you when you swim close; they can't follow you onto a raft. Three hits burn the blight out of one and leave eel meat (cook it). The harpoon also spears silverfin.
Echo's voice: her lines ship as seven built-in voice packs in `assets/voice/<pack>/` (Sonia, Libby, Aria, Jenny, Natasha, Clara and Ryan neural voices, slowed to -18%, made with `npm run voices`; `-- --pack aria` makes one) and play through a live FX rack (lowpass + reverb). Pause → Settings has Sound (master, music, effects and ambience, menu sounds, mute) and the Black Relay voice studio's controls: a grouped Voice list (the built-in packs, the neural voice studio, each system voice by name, or off), any of Microsoft's ~320 neural voices (desktop app only; generated on demand through Edge's read-aloud service and cached in the app's user data folder), rate, pitch, volume, pause between lines, and the FX rack (room size, wet, damping, dry, cutoff) with a Preview button. After changing a line in `src/echo-lines.js`, run `npm run voices` to make its file (`-- --force` remakes all). Each pack's `manifest.txt` is in the studio's batch format if you'd rather generate the set there; keep its FX dry, since the game adds FX live.
Progression: Goals (19 achievement lines with endless tiers: Lumen, polyps, scans, fish, kelp, eels, building, distance, time underwater, cooking, meals, harpoon hits, depth, rare finds, Data, Lumen spent, blackouts, skills) pay Bloom points, spent in Skills: eight trees (Diver gear, Combat, Loot, Sea life, Rarity, Survival, Research, Building) whose ranks change the game. Polyps, silverfin and eels roll a rarity (Common to Mythic) that multiplies what they pay; the Rarity tree improves the odds. Both phones have Goals and Skills tabs. Tune it all in `src/progress.js`.
Building: pick a piece on the phone's Build tab, then at the surface aim at the water, left-click to place and right-click to take it back (refunds what you paid). The wheel switches pieces, X stops building. Swim into a raft to climb onto it. Lumen and builds are saved in the browser.
If the browser refuses pointer lock (embedded previews), the free cursor looks around and resting it near an edge keeps turning.

## Layout

- `src/main.js`: renderer, bloom post-processing, menus, fullscreen and pointer lock, Echo's lines, game loop
- `src/world.js`: the Shallows (seafloor, kelp, coral, polyps, lantern fish, jellies, Echo's pearl)
- `src/player.js`: swimming, treading water, walking on rafts, mouse-look
- `src/build.js`: grid building on the water surface
- `src/research.js`: Echo Lens scanning, codex entries and the research tree
- `src/survival.js`: breath, health, food, the bag, eating and cooking
- `src/phone.js`: the in-game phone (build, research, codex, status, goals, skills)
- `src/progress.js`: endless achievements, skill trees, rarity rolls (every bonus is read with `perk()`)
- `src/combat.js`: the harpoon (view model, spear, line) and blighted eels
- `src/echo-lines.js`: everything Echo says
- `src/voice.js`, `src/voice-settings.js`, `src/settings.js`: Echo's voice (bundled, live neural, system) and the Settings screen
- `electron/tts.cjs`, `electron/preload.cjs`: neural voice generation in the desktop app
- `tools/make-voices.mjs`: generates the bundled voice lines
- `src/audio.js`: synthesized Web Audio (Deep Bloom's "Sunlit reef" pad, bubble pops)

Three.js 0.170 is installed locally (no CDN), so it runs offline. `electron/main.cjs` is the desktop shell (serves the game from `app://game/`, no menu bar so Ctrl+W can't close it).
