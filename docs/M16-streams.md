# M16: how it's being built

M16 is everything in [M16.md](M16.md), and every M15 leftover in its "From M15" section. It's built by parallel sessions on one foundation, each in its own git worktree and branch, merged one at a time into `m16-boats`. This page is what they share. It goes when M16 merges.

## The decisions (the user's, 2026-10-31)

- The boats must look good and work both alone and together. Hulls are in code, with Blender (3.4.1, `/usr/bin/blender`, scripted as `tools/props` and `tools/characters` are) for moulded fittings such as outboards, seats and the fighting chair.
- Everything in the doc's inventory, and all of M15's leftovers including the north side's extras. Lobster traps stay in.
- Those playing now keep the lobster boat, get the kayak free, and can buy the center console from Marta. New players start in the kayak. Any boat you own can be taken out. A boat still out at sea comes home for Marta's tow fee when you switch to another.
- Low's script memory stays at 150 MB unless a real 2 GB device passes.
- The way over to the north beach is made easy to find: its valley stretch reads as one path, the map shows it, and there are more signs along it.

## The foundation

Read these before anything else:

- `src/world/boat/Vessel.js`: everything the game asks of a boat. A boat extends it.
- `src/world/boat/Boats.js`: the boats there are, as data. Only the one you're in is built (`loadBoat`).
- `src/world/boat/Handling.js`: how a boat handles, and `propellerAndRudder`. Another way of being driven is another `propulsion` function beside it.
- `src/world/boat/HullLines.js`: extend it and override its design curves for another boat's lines.
- `src/world/boat/PlainBoat.js`: the stand-in behind `kayak/KayakModel.js`, `console/ConsoleModel.js` and `sportfisher/SportfisherModel.js`. Each floats, handles, walks and swaps now, at her real size, so nothing has to wait for a model. It's deleted once all three are real.
- `App.setBoat( id )`: getting into another boat. Anything that holds something of the boat takes the new one there.
- `GameState`: `boat`, `fleet`, `owns`, `addBoat`, `selectBoat`. `fuel`, `hull` and `hauled` are the boat you're in. Save v2; v1 saves migrate.
- `Gear.js`: `on` says which boat a track belongs to; a track with no `on` is your own. `gearStats( upgrades, boat )` counts only yours and hers. `Boats.js` `stats` is what she is before her tracks.
- `?boat=console` in a dev server or a driven browser starts you in that boat.

## Rules for every stream

**Git.** Branch `m16/<stream>` from `m16-boats`, in your own worktree. Symlink `node_modules` from the main checkout. Commit as you go, never push, never open a PR, never merge. Merge `m16-boats` into your branch when asked. Say which branch and commits are ready; the integrating session merges them.

**Stay in your files.** Each stream owns the files named below, and its new files go in its own folder. Contention points are `App.js`, `Game.js`, `GameState.js`, `Player.js`, `Together.js`, `GameHUD.js` and `FishMaterial.js`: keep edits there small, hooks rather than bodies, and put the work in your own module. New tests are new files in `test/` (`tools/run-tests.mjs` finds them). New docs go in `docs/m16/<stream>.md`, written as `docs/M15.md`'s sections are; `docs/M16.md` and `docs/ARCHITECTURE.md` are folded in at the end. Add a line to `credits`/`CREDITS.md` only through a new asset's own licence entry as the lock expects.

**Budgets, on low, worst case.** Before M16, All the Spaces' complete check reads script memory 149.96 of 150 MB, whole download 75.1 of 80 MB, 93 of 150 draw calls, 254,107 of 300,000 triangles, 14 of 16 sounds. The room step is freeing memory, but nothing is free:

| Stream | Script memory | Triangles | Draw calls | Download |
|---|---|---|---|---|
| Kayak | under the lobster boat's (it's a saving) | 12,000 | 5 | 0.2 MB |
| Center console | under the lobster boat's | 35,000 | 10 | 0.5 MB |
| Sportfisher, low version | no more than the lobster boat's | 47,000 | 13 | 0.8 MB |
| Sportfisher, mid and high | | 120,000 | 25 | |
| Fish and tackle | 1 MB each | as today's fish | none new | 0.2 MB |
| Days out, fleet, traps, together | 1 MB each, traps 2 | traps 6,000 | traps 3 | 0.2 MB |
| North side and leftovers | 3 MB, built only when near | 15,000 near | 8 near | 0.5 MB |
| Sound | decoded isn't counted | | at most 16 voices | 2 MB |

Report your readings when you say you're ready. `?readout` shows them; the complete check is what counts.

**Things that have bitten.**
- A shader past 16 textures a stage doesn't link on real GPUs and every headless check still passes. The sea's fragment shader is at exactly 16 on high: anything new there means moving or merging another. Run `node tools/gpu-limits.mjs` after any shader change. Prefer a new material to growing a shared one; the low tier's village program is at 16 too.
- GLSL reserved words (`patch`, `half`, `sample`, ...) break a compile.
- All the Spaces fails a cold phone-upright load past 45 s, about 7 s on this machine. Nothing new is built before ready unless it replaces something. Boats are the exception only in being the boat you're in.
- The check's script has a 25-minute budget across four screens. Don't add stops to `qa/script.json`.
- Dark materials in deep shade render near black: give shaded models their own fill.
- The pane has no WebGL. Render with Playwright from `/home/shooter/Documents/VS Code/all-the-spaces/node_modules/playwright/index.mjs` and SwiftShader; see the `headless-rendering` memory, which says how to do most things. It's a CPU render: say so, and that the GPU and phone look are unverified.
- This machine has 8 cores and no GPU, and several sessions share it. Wrap every headless render in `tools/render-slot.sh <command>`, which holds one of three slots. Use a dev server on your own port (pick from 5200 + your stream's number below).
- `pkill -f <pattern>` kills your own shell. So does `until ! pgrep -f` wait forever.

**The user's eye and ear.** The user doesn't know game design and doesn't review code; they judge how it looks, sounds and plays.
- Realism first: when there's a choice of look or behaviour, work out the realistic value from real boats and fish and lead with it. Real figures, from sources, with the sources noted in the doc.
- Boats and anything visible are shaped after real photographs, side by side with the render, irregular, each its own. Gather side, stern, deck and tower views before modelling. Show the comparison to the user with `SendUserFile` before calling it done; they called the first wreck low quality, and it was rebuilt.
- Sounds come from Freesound, CC0 only (`tools/audio/search.mjs`), never compilations. The user approves each pick and each download, by ear, on the local listening page.
- People are Rocketbox avatars built as Joe and Marta are, never a stand-in.
- Any question for the user is one short plain question, with your recommendation first.

**Done means:** `pnpm test` passes, your test covers what you added, it works alone and in the two-player tools if it's seen by others (`tools/two-players/`), and you've reported your budget readings and what you couldn't verify.

## The streams

Each stream's scope is the named parts of [M16.md](M16.md); that doc's wording is the brief.

| # | Branch | What | Owns |
|---|---|---|---|
| 1 | `m16/kayak` | The kayak: model, paddling (a paddle's `propulsion`, a sat-in boat: boarding, the seat, the camera), casting and fighting from the seat, capsizing and getting back on, no fuel, the squall's danger | `src/world/boat/kayak/*`; small hooks in `Player.js`, `Game.js` `canFish` |
| 2 | `m16/console` | The center console: model, outboards (`propulsion` steering by thrust, tilt, their own wake), T-top and its rain cover, the deck all round, the dive ladder and tanks racked, soaked in a squall | `src/world/boat/console/*` |
| 3 | `m16/sportfisher` | The sportfisher: hull, cockpit, cabin and galley inside, flybridge helm, tuna tower and its climbing (including falling in a seaway), fighting chair, twin diesels, the phone version, what you can see from up there | `src/world/boat/sportfisher/*`; small hooks in `Player.js`, `Vessel.js` |
| 4 | `m16/fleet` | Your fleet and Marta: her list with prices, the silhouette and unlock (12 of 19), buying, trade-in, tracks for every boat, gasoline and diesel, per-boat `Hull` figures, slips and upkeep, where the boats you own are kept (berths, what's drawn of those you're not in), choosing which to take out, haul-out for every boat, name and paint, away records per boat | `Gear.js`, `GameState.js`, `Hull.js`, `Away.js`, `GameHUD.js`' shop, `StormPlaces.js`, `Chandlery.js`, `SaveStore.js` |
| 5 | `m16/together` | Playing together: each boat as the boat it is (type in the pose, a template per type loaded on first sight), riding along on each, the crew's jobs on a big boat (helm, tower, chair), the others' boats as a speck past the fog, Marta's dock holding more than yours | `together/*`, `tools/two-players/*` |
| 6 | `m16/fish` | Fish: wahoo, sailfish, white and blue marlin, swordfish, bigger yellowfin and blackfin, the mahi mostly offshore, the kayak's flats fish; models and skins, the bites and orders, the release bonus and billfish trophies, the hurricane's mahi under its debris | `FishTable.js`, `world/fish/*`, `Fish.js`, `Bites.js`, `Orders.js`, `FishPortrait.js`, `FishMaterial.js` |
| 7 | `m16/tackle` | Ways to fish: trolling a spread off the outriggers, kite fishing, deep-dropping on an electric reel, hook depth, the fight on big fish; your new gear (rod and reel 4, leader, lures, landing, polarized glasses, dive kit, safety) and the new bait | `FishingRod.js`, `CatchMinigame.js`, `Bait.js`, new `src/game/rigs/*` |
| 8 | `m16/days-out` | Days out: bunks and sleeping aboard, ice and the catch keeping, stores, flares and EPIRB, the deep-water anchor and drift sock, navigation and a second finder as each boat's gear, what each boat can stand and how far out | `Radio.js`, `Chart.js`, `Minimap.js`, new `src/game/DaysOut.js` |
| 9 | `m16/traps` | Lobster traps: restored from git at `290b51b^` (`DeckGear.buildTraps`, `BoatMaterials.createTrap`, the colliders), set from the deck, soaking over real days, hauled with the hauler and davit, 2 then 4 then 8; a buoy in the water everyone sees | `DeckGear.js`, new `src/game/Traps.js`, `src/world/boat/TrapModel.js` |
| 10 | `m16/north` | The leftovers: the way over made easy to find (valley stretch, map, more signs); turtle sounds' hooks, hatchlings and tracks, turtles minding lights and people; finds on other shores, shells, the hurricane's wreckage in the wrack; Pearl's boat coming and going, camp lights, its roof in a hurricane, her coming out for you; the plotter (far sheet's blur, night palette, the Hump's label, gimbal, proper names), the radar's true heading; the radio's Marta and her can of diesel; a gale's seas at their true height; the sea's draw | `FishCamp.js`, `NorthTrail.js`, `Signpost.js`, `Turtles.js`, `NestingTurtles.js`, `Beachcomb.js`, `Beachcombing.js`, `Instruments.js`, `Radar.js`, `ShoreWaves` and `Waves.js` |

Second wave, once the models land:

- `m16/opening`: new players in the kayak (`START_BOAT`), the opening and the Guide rewritten, prices tuned against what the fish fetch.
- `m16/sound`: outboards, twin diesels, paddling, the electric reel, the radio's hiss and squelch, turtles, chosen by ear.

Finish, serially, in the integrating session: the checks visit the sportfisher by replacing a stop, the complete check on a clean copy, A/B the ready time, docs folded in, `PlainBoat` gone, `docs/M17.md`.
