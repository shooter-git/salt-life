# M16: the fish

Wahoo, sailfish, white and blue marlin, swordfish and yellowfin in the far water; bigger blackfin and mahi, the mahi out there all but a few; redfish and trout on the kayak's flats beside the snook M15 brought. Each has its published length-weight relation, its range of sizes, where it lives and when, a model and skin shaped after photographs, and its place on the catch card, in the log and in the orders.

## The fish, and where the figures come from

`lw` in `FishTable.js` is W (g) = a TL^b, TL overall: a billfish's from the bill's tip to the tail's. Where the published relation is on another length it's converted, and for the billfish fitted (within 1.2% over their sizes: `test/m16-fish.mjs` checks every one against its source).

| Fish | W (kg) published | TL | kg in the game | Long | Record |
|---|---|---|---|---|---|
| Wahoo | 1.845e-6 TL^3.218 (Hogarth 1976, 795 fish, North Carolina; ICCAT manual 2.1.10.10) | | 5 to 50 | 1.0 to 2.0 m | 83.5 kg |
| Sailfish | 1.2869e-6 LJFL^3.2439 (Prager, Prince and Lee 1995; ICCAT) | LJFL = 18.171 + 0.686 TL | 12 to 55 | 1.8 to 3.0 m | 64 kg, Atlantic |
| White marlin | 5.2068e-6 LJFL^3.012 (same) | LJFL = -0.72 + 0.76 TL | 14 to 60 | 1.8 to 2.9 m | 82.5 kg |
| Blue marlin | 1.1955e-6 LJFL^3.3663 (same; to 378 cm) | LJFL = 2 + 0.763 TL | 50 to 450 | 2.4 to 4.6 m | 636 kg, Atlantic |
| Swordfish | 4.45373e-6 LJFL^3.2038 (ICCAT, North Atlantic; Turner, Mejuto) | LJFL 0.68 TL, between photographs (0.6) and FishBase's biggest (0.78): not published | 15 to 230 | 1.6 to 3.8 m | 536 kg |
| Yellowfin | 2.153e-5 FL^2.976 (Caverivière 1976, 6,487 fish; ICCAT) | FL 0.9 TL on these lobes | 8 to 110 | 0.8 to 2.0 m | 200 kg |
| Blackfin | unchanged (within 10% of FishBase's 0.0115 TL^3.05 over its range) | | 3 to 20 | 0.6 to 1.1 m | 20.6 kg (FishBase) |
| Mahi | unchanged (FishBase: 0.0118 TL^2.88) | | 1.5 to 32 | 0.6 to 1.6 m | 39.5 kg |
| Redfish | 8.51e-6 TL^3.07 (FishBase) | | 1 to 14 | 0.45 to 1.05 m | 42.7 kg |
| Spotted seatrout | 8.32e-6 TL^3.05 (FishBase) | | 0.3 to 3.6 | 0.3 to 0.7 m | 7.9 kg |

Where and when, from the sources:

- **Swordfish:** under 100 m at night, past 400 m by day, moving between at dusk and dawn; to 1,448 m (Lerner et al. 2013, eight fish, western North Atlantic; Dewar et al. 2011: past 300 m by day). So a float reaches one only after dark, and by day only a deep drop past 320 m does; between its depths at dusk and dawn (`at`, `Bites.depthWeight`). Lights draw the squid and the squid draw it (`flood`). Not modelled: they go deeper under a full moon (Lerner; Dewar), since the bites know no moon.
- **Wahoo:** the upper mixed layer, >90% of its time under 200 m (Theisen et al. 2012), usually alone or in small groups (ICCAT): on the drop-off above all, a float's bite rare and a troll's the thing.
- **Yellowfin:** most of their time above 100 m day and night (Brill et al. 1999, 2005); free schools the big ones, under floating objects mostly small (ICCAT 2.1.1): the debris' weight kept low.
- **Mahi:** 0 to 85 m, usually 5 to 10 (FishBase); fishers gather them under floating bundles of reeds and planks (FishBase, after FAO): under the debris and along the weed, and most under a hurricane's wreckage.
- **Redfish:** sand and sandy mud, coastal water and estuaries, the surf zone too (FishBase), south to southern Florida: this island's as far south as they come. **Spotted seatrout:** shallow water over sand, near seagrass (FishBase). Both are at the edge of their ranges here, as the design asks for them.
- **Bag limits** as the US rules have them: one swordfish, two wahoo, three yellowfin, ten mahi, one redfish, four trout. Billfish aren't kept at all, as the design's rules say (real rules let a big one be landed).

Not checked against a source, and worth knowing: the sailfish and marlin depths (`at`) are from general knowledge of them as surface-layer fish; the search that would have sourced them came back empty. Sizes at capture and `rarity` are judgement. Prices are a start: the second wave tunes them against what the boats cost.

## What bites, and how it's fished: the interface with `m16/tackle`

Stream 6 owns what bites, where and on what (`FishTable.js`, `Bites.js`). Stream 7 owns how it's fished (`src/game/rigs/*`, `FishingRod.js`, `CatchMinigame.js`, `Bait.js`'s new baits). They meet in one small object, the hook, and three table fields.

**The hook.** `Game.habitat()` puts it on the spot's habitat, as it does `flood` and `weather`; `pickSpecies` and `biteDelay` read it from there, and it isn't a water type.

```js
h.hook = {
	way: 'float' | 'troll' | 'kite' | 'drop',  // how the bait's fished
	depth: 8,          // m under the surface the bait is at, now (hook depth)
	lure: 'skirt',     // a lure's id, in place of a bait (null: bait: pickSpecies' `bait` argument)
};
```

`h.hook` missing is today's rig: a float, six metres down (`Bites.FLOAT`). Stream 7 sets `game.hook` (a getter or a plain object) and adds one line to `Game.habitat()`: `h.hook = this.hook || null`. Until then everything bites on the float.

**The table** (`FishTable.js`):

| Field | What it says | Missing |
|---|---|---|
| `ways` | `{ float, troll, kite, drop }`: its bite weight fished each way | float 1; drop 1 for a bottom fish of the deep or the ledge (`habitat.deep`, `habitat.ledge`), else 0; troll and kite 0 |
| `at` | `{ day: [ m, m ], night: [ m, m ] }`: the depths under the surface it feeds at. A hook outside them gets nothing from it (`hookWeight`: fading over a third of the span past each end, at least 10 m) | anywhere the hook is: bottom fish, whose water already says a bait reaches them |
| `eats` | bait or lure id -> its bite weight on that, ahead of `Bait.js`' `likes` (`baitWeight`). Names baits and lures that don't exist yet: `ballyhoo`, `squid`, `skirt`, `plug`, `jig` | `Bait.js`' `likes`, and 1 |
| `teeth` | it cuts mono: a rig's chance of a bite-off without the wire leader is stream 7's to set | no |

So stream 7's job on a bite: set the hook, call `pickSpecies( habitat, hour, rng, bait )` and `rollWeight` as `Game.updateBite` does. A trolled skirt off the outriggers is `{ way: 'troll', depth: 2, lure: 'skirt' }`; a kite's live bait `{ way: 'kite', depth: 1 }`; a deep drop `{ way: 'drop', depth: 500 }` as the reel takes it down; the float `{ way: 'float', depth: 6 }`. How soon a bite comes on each way (`biteDelay`, times what covering water's worth) is stream 7's, and how big the bait is (`BAITS[ id ].skew`, `Bites.rollWeight`) is `Bait.js`' as it is today.

Billfish are `protected` and `cr`: `addFish` lets them go, and `Game` pays the release bonus (`FishTable.releaseBonus`). The `landing` track's dehooker and tag kit pays more: `releaseBonus( id, kg, tagged )`, `tagged` true when the kit's aboard (`upgrades.landing >= 2`).

## Models

Every new fish goes through the same `fishGeometry`, with these additions:

- **The bill** (`mouth.from`): the upper jaw runs on ahead of the lower one. Ahead of the lower jaw's tip the head is shut, one piece; the mouth line, the jaw's weight and the mouth's cavity run only from there back. The bill's a thin stretch of the same `top`, `bot` and `wid` profiles, round on a marlin and broad and flat on a swordfish (its `wid` over twice its `top`).
- **Broad sickle tails** (`caudal.sweep`, `notch`), **ribbons of belly fins** (`pelvic.alpha`, `taper`, `base`), pectorals held down (`pectoral.droop`), a torn top edge (`jag`) and a fin left up on a dead fish (`fold`): the sailfish's sail shows on its card.
- `dorsal` is listed with the fin to keep last: the farthest level of detail draws only the last. `tools/fish-look/` draws one fish as the card's studio does, and `compare.mjs` puts it beside the photographs.

Skins are in `FishMaterial.js`, on the same table of colours. The far water's fins are nearly opaque (the card's see-through membranes read as a mesh on dark, stiff fins).

## Let go alive

A billfish is never kept. `addFish` lets it go, `Game.updateFight` pays `releaseBonus` through `Trophies.letGo`, and the picture and the log are the trophy: the card shows the fish with its bonus, and the log's "Trophies, let go alive" tab lists each kind with its biggest, the day and the place, with a button that shows the card again (`Game.showTrophy`). Marta's tags ask for a billfish let go. The trophies are saved with the game (`GameState.trophies`, `cleanTrophies`).

## In the far water

- **Far groups** (`Fish.js`, `FAR`): each far kind has its group, placed by `setFinds` around whatever the water holds near the boat (`farSpot`) and left where it is until the finds change. They draw through the same batches as today's fish, so no new draws.
- **Under the surface:** mahi, tuna and the far fish swim at `under: [ m, m ]` beneath it however deep the water is.
- **After a hurricane:** `Finds.hurricaneWake` scatters three to five pieces of its wreckage over the offshore water for six to eleven days, with `storm: 1`; `Game.findsNear` reads them into `h.wake`, and a fish with `wake` in the table (the mahi, at 3) bites `1 + wake * h.wake` times as well there. The far mahi's second group (`mahiWake`) gathers under them.

## Budgets

The complete check on a clean copy, on the CPU, 2026-11-01: draw calls 93 of 150, triangles 258,787 of 300,000 (254,107 before M16), script memory 136.2 of 150 MB, whole download 75.2 of 80 MB (75.1 before), texture memory 78.6 of 128 MB, graphics memory 115.2 of 256 MB, 14 of 16 sounds. `tools/gpu-limits.mjs` passes: 16 of 16 fragment textures on high and low, 14 of 16 on mid. Ready, phone upright, 4 CPUs, three alternating rounds at a load of about 28: 19.0 to 23.6 s on `m16-boats`, 15.6 to 26.4 s with the fish, no difference the noise lets through. The new models build 1.75 MB at load on top of the swimmers' 6.40 MB, freed once uploaded.

## Tools

`tools/fish-look/` draws one fish as the card's studio does: `index.html?fish=&lod=&w=&h=&lite=&fill=&seed=&curl=&yaw=&bg=`. `compare.mjs <out dir> [fish...]` puts the high and low tiers' renders beside photographs from Commons. `in-game.mjs <out dir> [tier]` shows the cards, the log, a trophy again and the wreckage from the deck and under the water, in the running game. All are CPU renders: run them in `tools/render-slot.sh`.
