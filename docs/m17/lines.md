# M17: the lines at their labels, and the fight retuned

Done 2026-11-10 on `claude/m17-lines-501e31`, cut from `m17-flats` at dfb8b83. [sources-figures.md](sources-figures.md) §7 found the problem: the four lines held about 1.9 times their labels. This page fixes that and the figures that came with it. It also retunes the fight so that the same fish stay landable on the gear meant for them.

## What was wrong

- **The lines.** "8 lb mono" held 7 kg, "15 lb" 13, "30 lb braid" 26 and "60 lb braid" 50 (`Gear.js`). A line breaks at its label, lb × 0.4536: 3.6, 6.8, 13.6 and 27.2 kg.
- **The drags were the reel's most, whatever the line.** The conventional reel's 12 kg and the two-speed's 24 kg were over the 8 lb line's 7 kg, so on 8 lb a drag reel had no drag at all: the line broke before the drag gave. On 15 lb by hand the drag slipped at 77% of the line, in the harness at 92%. On 60 lb in the chair it was 48%.
- **The two-speed's 24 kg** is an 80-class reel's drag; a 50-class two-speed's most is 18 to 20 kg.
- **The holds were real kg set against a line twice its label.** The harness's 18 kg was a third of the old 50 kg line. On the real 27.2 kg line it's two thirds.

## What's changed

| What | Before | Now | Source |
|---|---|---|---|
| Lines (`Gear.js`, `lineLb`, `lineKg`) | 7, 13, 26, 50 kg | at the label: 3.63, 6.80, 13.61, 27.22 kg (`LB` = 0.45359237) | [IGFA](https://igfa.org/international-angling-rules/): line classes 2 to 130 lb, a line breaking at or under its class |
| Conventional reel's most (`dragKg`) | 12 kg | 15.0 kg (33 lb) | A 30-class lever drag, Penn's [Fathom II Lever Drag 30](https://www.pennfishing.com/products/fathom-ii-lever-drag-conventional-reel): 33 lb |
| Two-speed's most | 24 kg | 18.1 kg (40 lb) | A 50-class two-speed, Shimano's Tiagra 50W LRSA: 40 lb in US listings ([Sportsman's](https://www.sportsmans.com/fishing-gear-supplies/trolling-conventional-reels/shimano-tiagra-trollingconventional-reel/p/1463358)), 20 kg in NZ ones ([Land & Sea](https://www.land-sea.co.nz/product/2793/shimano-tiagra-50w-lrs-lever-drag-game-reel)) |
| Electric reel's most (`Rigs.ELECTRIC.drag`) | 24 kg | 22 kg (48 lb) | Daiwa's Tanacom 1000: 48 lb ([J&H](https://www.jandh.com/products/daiwa-dendoh-tanacom-1000-power-assist-electric-reel.html)), 22 kg in NZ ([Complete Angler](https://www.completeangler.co.nz/daiwa-tanacom-1000-u-electric-reel-52)) |
| The drag as it's set (`CatchMinigame.DRAG_SET`) | the reel's most, always | strike (37.5% of the line) as the fight starts, rising to full (52.5%) by the time the fish is half spent, under the reel's most | Gary Caputi, [Stand-Up Tackle Tactics](https://www.saltwatersportsman.com/?p=49243), *Salt Water Sportsman*: prestrike 25 to 30% for the first run, strike 35 to 40% once it stops and you pump, full 50 to 55% at the end with it circling under the boat |
| The fish's pull (`LINE_MATCH`) | power read against half the line's figure | read against 0.9645 × the line's: the same fish on the 8 lb line, and under 3% weaker on the others | Not a source: it keeps the old balance (below) |
| Holds (`Rigs.HOLD_KG`) | 10, 18, 40 kg | unchanged | Chair: Marlin, a fit angler keeps up 80 lb (36 kg) or more on 130 lb. Harness: Caputi, under 30 lb (13.6 kg) on 50 lb stand-up, up to 70 lb (32 kg) on 80 and 130 lb, so 18 kg is a strong angler's. By hand: judgment |
| Dehooker (`Rigs.DEHOOK`) | big 6 m, small 2.5 m; let go without one 3 m (big), 1.2 m (small) | 6 m and 2.5 m stand; let go without one, 1 m (`byHand`); one you keep, 3 m and 1.2 m as before | 6 m: the leader taken at the rod tip, the fish a leader's length off (IGFA: up to 9.14 m over the 10 kg class). 2.5 m: inside a dehooker's own 1.8 to 3.7 m (ARC's 6 to 12 ft poles, [NOAA](https://www.fisheries.noaa.gov/resource/outreach-materials/approved-models-and-equipment-careful-release-sea-turtles-caught-gulf)). Unhooking by hand needs the fish alongside |

Some details:

- **Strike, not prestrike, starts the fight.** The prestrike run is the one a rod in its holder already takes before you get to it (`Rigs.RUN_OUT`, `HOOK_S`). Starting a fight in your hands at prestrike let a 200 kg blue marlin's first runs take the whole 600 m: the chair then landed 10% of them in the sweep, against the base's 100%.
- **When full drag comes in is judgment.** At half spent the chair's 200 kg blue marlin comes out as it was. At 70% spent, the endgame, `test/tackle.mjs`'s chair lands 19 of them in 30, against the base's 29.
- **`LINE_MATCH`.**
  - Before, a fish's pull was read against `lineKg × 0.5`. The old figures were 1.93 times the label on 8 lb, 1.91 on 15 and 30 lb, and 1.84 on 60 lb.
  - 0.9645 is `0.5 × 7 / (8 lb in kg)`, so every fight on the starting line goes exactly as it did. `test/game-logic.mjs`'s fights are identical to the base's to the tenth of a second.
  - On 15 and 30 lb the fish are 0.5% weaker, on 60 lb 2.6%. Nothing comes out harder. A fish right at the edge of what its line holds lands more often. On 15 lb that's four cells, by 10 to 15 points. On 60 lb's spinning reels it's six, the biggest yellowfin, sailfish and white marlin, by 30 to 50 points: a 54 kg sailfish, 40% to 90%.
- **The speargun is as it was.** Its `lineKg` is the shaft's hold, not a line, so it reads its pull against `SHAFT_MATCH` (0.5), the old figure.
- **The fish table is untouched.** None of `FishTable.js`'s `fight`, `stamina` or `kg` changed, and none of its `at` fields.
- **Saves.** A save holds your gear's levels, not its figures (`GameState.toJSON`: `upgrades.line` is 0 to 3). So an old save's "60 lb braid" is level 3 and loads as 27.2 kg by itself.
- **A guest's kit.** The only `lineKg` that crosses between games is the kit a guest crewing on her rods gets from her owner's game (`Rigs.kitOf`, `cleanKit`). A game still on the old figures sends 50 kg and 24 kg. `Gear.realTackle` reads those as the 60 lb braid and the two-speed, not as a 110 lb line. The new figures are never the old ones, so the two can be told apart.
- **A guest on her rods fights on her tackle.** Standing or in her chair, `fightTerms` gives them her line, drag, reel, spool and hold, and the same fight hers would be to the tenth of a second (`test/lines.mjs`).

## The sweep

`tools/fight-sweep.mjs` fights every kind of fish at its weights, against every line, reel and hold, in plain Node:

- **The fish.** The 38 kinds with a fight (all but the lobster), at six sizes: the 10, 30, 50, 70, 90 and 99% points of the sizes that bite (`Bites.rollWeight`).
- **The rigs.** 40 of them:
  - each line on each reel by hand;
  - on the conventional and the two-speed, also in the stand-up harness and in the chair;
  - the electric reel, dropped from 300 m, by hand and in the chair.
- **The terms.** Each fight's terms come from the game's own `Rigs.fightTerms` on the gear's `gearStats`, with the leader that suits the fish (wire for teeth, 200 lb for a bill).
- **The player.** A careful one: reels below two-thirds of the breaking point and not into a run, as `test/game-logic.mjs` and `test/tackle.mjs` do.
- **The fights.** 20 to a cell, at 30 updates a second, capped at an hour.

It was run on the base first, then on the change; it's deterministic, so `node tools/fight-sweep.mjs --n 20` on either checkout gives the same numbers again. Below, "landed" is a careful player's share, and a "cell" is one kind at one size on one rig: 9,120 cells in all.

### Before and after

- **8,543 cells within 15 points of the base, 573 up, 4 down.**

| Line | Spinning reels (no drag) | Drag reels (conventional, two-speed, electric) |
|---|---|---|
| 8 lb | 456 as they were | 1,417 as they were, 407 up |
| 15 lb | 456 as they were | 1,695 as they were, 125 up, 4 down |
| 30 lb | 456 as they were | 1,814 as they were, 10 up |
| 60 lb | 450 as they were, 6 up | 1,799 as they were, 25 up |

- **The fight's length, where both land it:** a median of 1.00 times the base's on every reel and hold.
  - From the 10th to the 90th percentile it's within 0.93 and 1.03 times the base's.
  - Outliers: by hand on 60 lb with a drag reel, about half as long (below). On 15 lb by hand with the conventional, up to twice as long (a 98 kg goliath grouper: 373 s to 765 s).

### The gear each stage is meant for

The heaviest fish landed at least half the time on each stage's gear, in kg: before → after where it changed. These six rigs are what `test/lines.mjs` holds to the base. Their cells, before and after, are in [lines-sweep.json](lines-sweep.json).

| Fish | 8 lb, old spinning | 15 lb, smooth spinning | 30 lb, conventional | 60 lb, two-speed, harness | 60 lb, two-speed, chair | 60 lb, electric, chair |
|---|---|---|---|---|---|---|
| Blackfin tuna | 11 | 16 → 20 | 20 | 20 | 20 | 20 |
| Mahi | 8 | 15 | 31 | 31 | 31 | 31 |
| Wahoo | 8 | 15 | 49 | 49 | 49 | 49 |
| Yellowfin | – | 9 | 55 → 108 | 108 | 108 | 108 |
| Sailfish | – | 12 | 54 | 54 | 54 | 54 |
| White marlin | – | 14 | 59 | 59 | 59 | 59 |
| Blue marlin | – | – | 53 → 78 | 78 → 137 | 137 | 233 |
| Swordfish | – | – | 62 | 113 → 225 | 186 → 225 | 225 |
| Tarpon | – | 12 → 18 | 44 | 44 | 44 | 44 |
| Cubera snapper | 8 | 16 | 44 | 44 | 44 | 44 |
| Goliath grouper | – | 16 | 98 | 98 | 98 | 98 |
| Black grouper | 13 | 20 → 25 | 25 | 25 | 25 | 25 |
| Barracuda, permit, bonefish, snook, redfish, jack | as they were | | | | | |

- **On these six rigs nothing landed at the base is harder now.**
  - Spinning-reel fights are as they were, on 8 lb exactly.
  - The chair and the electric reel in the chair are as they were, their fights within 3% of the base's length (5% at most, on the electric reel).
- **The 200 kg blue marlin of `test/tackle.mjs`, in the chair:** 29 of 30 landed in 9.3 minutes (the base: 29 in 9.8).
- **Blue marlin at the edge, 80 fights each:**

| Blue marlin | 205 kg | 215 kg | 225 kg | 240 kg |
|---|---|---|---|---|
| Chair, before | 99% | 63% | 10% | 0% |
| Chair, after | 99%, 9.6 min | 70%, 10.3 min | 16%, 10.8 min | 0% |
| Standing, before | 0% | 0% | 0% | 0% |
| Standing, after | 99%, 29 min | 83%, 42 min | 10%, 57 min | 0% |

### What came out more real, and why

1. **A drag reel on 8 and 15 lb has a drag** (407 and 125 cells up).
   - The base's 12 and 24 kg were over those lines, so the line broke before the drag gave. Now the drag's set under the line, so a fish many times the line can be fought, slowly. That's what M16 said the drag does ([tackle.md](../m16/tackle.md), The fight).
   - A 49 kg wahoo on 8 lb with the conventional reel takes 364 s, against 114 s on 15 lb.
   - A 46 kg sailfish on 8 lb is landed 90% of the time, in 11.5 minutes.
   - The cheapest gear that lands the big inshore and pelagic fish is the starting line on a conventional reel, where it was 15 lb on one. The 15 lb line is $60.
2. **Standing up on 60 lb holds the drag the chair does.**
   - Full drag on real 60 lb braid is 14.3 kg, inside the harness's 18; Caputi has under 13.6 kg on 50 lb stand-up. So on 60 lb the line limits the drag, not the angler. What the chair spares is your back: standing, your arms give out and you reel at half speed.
   - So a 137 kg blue marlin standing is landed every time (it was spooled every time), as from the chair in the same 5 minutes. A 200 kg one is landed 30 in 30, but in 27 minutes against the chair's 9.
   - Where the chair holds what standing can't is 80 lb line and up: up to 32 kg on 80 and 130 lb stand-up (Caputi), 36 kg and more in the chair on 130 lb (Marlin). The game has no line past 60 lb.
3. **30 lb on the conventional reel by hand lands bigger fish** (yellowfin to 108 kg, blue marlin to 78 kg; the base needed the harness for them). Full drag on 30 lb is 7.1 kg, inside the hand's 10.
4. **By hand on 60 lb with a drag reel the fights are half as long.** The hand's 10 kg was 20% of the old 50 kg line, under Caputi's prestrike. On the real line it's 37%, his strike.

### What came out harder, and why

Four cells, all a big fish on 15 lb mono with the conventional reel and its 350 m:

| Fish | Rig | Before | After |
|---|---|---|---|
| 52 kg blue marlin | by hand | 100% | 5% |
| 52 kg blue marlin | harness | 75% | 0% |
| 52 kg blue marlin | chair | 45% | 0% |
| 62 kg swordfish | by hand | 100% | 0% |

The base fought these at 77% of the line's strength by hand, and at 92% in the harness and the chair (12 kg of the 13), well past Caputi's full of 50 to 55%. At full drag on real 15 lb (3.6 kg) a 115 to 135 lb fish runs off 350 m. It's the 15 lb line that's wrong for them: the 30 lb conventional lands both, by hand, every time (in 208 s and 221 s).

## Tests

- **`test/lines.mjs` (new).**
  - The lines against lb × 0.4536.
  - The reels' most against their sources, each holding full drag on the line it's offered with.
  - The drag rising from strike to full.
  - The holds, and the dehooker's reach.
  - An old kit coming in as the same line and reel.
  - A guest on her rods, standing and in her chair, fighting on her tackle as her owner would.
  - The sweep of the six stage rigs against the base's figures in `lines-sweep.json`: nothing landed at the base harder, spinning fights as they were, no fight far longer or shorter, and the only gains standing on 60 lb and the conventional on 30 lb. About 5 s.
- **`test/tackle.mjs`.**
  - Its fights read the gear's own figures, not 26 and 50 kg.
  - "Standing up it takes all your line" is now "standing up it takes far longer", as above.
  - The top reel's drag is 18 kg or more, not 20.
- **`test/game-logic.mjs`, `test/m16-fish.mjs`, `test/spearfishing.mjs`.** The lines' figures from `UPGRADES`, the spear's `SHAFT_MATCH`.
- **`tools/earnings.mjs`.**
  - Its stages read the lines from `UPGRADES`.
  - Its rule "lost past twice the line" is now 3.9 times the real line (the same fish), and up to 200 kg with the two-speed (from the sweep).
  - Its dollars an hour move by under 0.4%.

## The checks

- **`pnpm test` passes:** 6 min 52 s, at a load of 18 to 22, `test/flats.mjs` included.
- **All the Spaces' complete check passes on a clean copy of d0071cf.** That's `cli.ts check` from its `main` (57b4f25), on four cores, under the timing lock, at a load of 9.9 to 10.9.
  - Every check passed and every screen played, with no errors.
  - Script memory 142.6 MB of 150, by screen 136.8, 142.6, 110.5 and 132.9; `m17-flats`' last two read 142.7 and 142.3. Nothing here is held in memory but a few constants.
  - 86 draw calls of 150; 238,229 triangles of 300k; 70.3 MB of textures; 107.6 MB of graphics memory; 14 sounds of 16.
  - 7.1 MB before ready, 78.7 MB in all. Ready in 4.7 to 5.1 s.
- **No shader changed.** The fight's figures are all in plain JavaScript, so `tools/gpu-limits.mjs` wasn't run.

## Not verified, and judgment

- **Judgment:**
  - when full drag comes in (half spent);
  - the arms' time (`ARMS`, `ARMS_CHAIR`);
  - the hand's 10 kg;
  - `LINE_MATCH`, which keeps the old balance rather than coming from a source. No source gives how hard a fish pulls.
- **The reels' most are from listings as searches reported them.** Several listings agree for each: Penn's 33 lb; 40 lb in the US and 20 kg in NZ for the Tiagra 50W; 48 lb and 22 kg for the Tanacom 1000. The pages themselves weren't opened (they refused or rate-limited the fetch). Caputi's settings were read on his page.
- **Not changed.** The spools (180, 220, 350 and 600 m) are the game's, not a source's.
  - Real reels hold more braid: a Fathom II 30 about 740 yd of 40 lb braid, a Tiagra 50W 1,575 yd of 80 lb.
  - More line would make the spooled fights above rarer. But `spoolM` also sets how far a sinker goes and how much a trolled line lets out, so it's its own change.
- **The sweep's player alone.** It doesn't steer the boat. A helm backing down on a fish gets line back in the game, so the spooled fights are the worst case.
- **Not run:**
  - the two-player crew script (`tools/two-players/crew.mjs`); its `holdKg === 18` and kit checks still hold on these figures;
  - the ready A/B and one-core plays, which the M17 session runs.
- **No device ran this.** The fight is plain Node and draws nothing new; no shader changed.

## The user's call

On 60 lb braid, standing now lands what the chair does, in about three times as long. That's the realistic outcome of the real line and the sources' holds. If the chair should again be the only way to a 200 kg blue marlin, the realistic way is an 80 or 130 lb line, where full drag (19 or 31 kg) is past the harness's 18 kg. That would be its own figures and its own sweep. Shortening the arms' time to get there instead would have no source.
