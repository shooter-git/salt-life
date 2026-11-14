# M19, stream GEAR: the blue-water speargun, the landing net, and the Bahamas' rules on the snook and the pelagics

Stream GEAR of [M19.md](../M19.md), built 2026-11-13 on `m19-gear` from `m19` (8e528c2). It covers:
- two of decision 6's items: the blue-water speargun, and the rubber landing net;
- two of step 0's rulings: the snook let go, and the pelagic bags dropped.

The sources are [sources-big-game.md](sources-big-game.md), sections 8 and 9.

## The blue-water speargun

The fourth gun (`speargun` level 3), $1,580:
- **The gun:** 140 cm (55 in), four 14 mm bands, a 1.65 m shaft, a deep teak stock.
- **The rig:** 4.6 m of shooting line, onto a breakaway, a bungee and 30 m of float line, to an 11 L float.
- **Its reach:** 6 m, within its shooting line and shaft.
- **The price:** Wong's 60 in Super Magnum is $1,345, a Riffe float line $100, and a Rob Allen float $135.

**Its four bands** are drawn by the bands' own shader, which now takes four (`BANDS`; strands parts 1 to 8, wishbones 9 to 12; `bandEnd0` to `bandEnd3`). Each band has its own notch on the shaft. They load one after another, so drawing all four back takes 2.8 s. A one- or two-band gun folds the rest away into its first band's anchor. Other players' copies of the gun take four too (`Together`).

**The breakaway:**
- A big fish shot with it takes the shooting line off the gun and runs on the float line.
- The float holds it back as a reel's drag would (`Speargun.FLOAT.kg`, 9 kg: the float's 11 L pulled under, less the bungee's stretch; judgement).
- It can run out to the float line's end, 34.6 m, and no further: it tows the float (CatchMinigame's new `tether`).
- The shaft seldom tears out, unless you haul into its runs.
- The float rides on the surface between you and the fish, with the line bowed up to it (`floatMesh`, in the shaft's own program).
- A fish being fought now stays off the bottom and under the surface. It starts its run along the line it was shot on: before, it swung round over a couple of seconds from the last fight's bearing.

**The terms** are one pure function, `Speargun.spearTerms`, used by the game (`Game.updateSpear`) and the sweep (`tools/fight-sweep.mjs --spear`). The other guns' fights are as they were.

**Held back while loading:** the float is held out of the scene with the rest of the gun while the game loads (`App.heldTools`), and its geometry is made the first time it's shown. That keeps the shaft's program out of the loading frame. The merge check had first found it there: 17 programs before ready.

**The sweep** (`--spear --n 40`): the share of each size landed, pulled with care. The railgun (S2) and the blue-water gun (S3) against the kinds the blue water's for:

| Kind (kg) | S2, the railgun | S3, on its float |
|---|---|---|
| Wahoo, 14.8 | 100% | 100% |
| Wahoo, 25.5 / 49.0 | 0% / 0% | 100% in 42 s / 100% in 87 s |
| Yellowfin, 15.2 | 100% | 100% |
| Yellowfin, 30.2 / 54.5 / 88.9 | 0% | 100%, in 98, 140 and 261 s |
| Yellowfin, 107.8 | 0% | 18% within 15 min (the rest still on) |
| Mahi, 25.7 / 31.3 | 80% / 18% | 100% / 100% |
| Cubera snapper, 24.9 / 44.2 | 5% / 0% | 100% / 100% |

The smaller fish land on every gun as they did.

**Is it too generous?** On its float, a careful diver lands the biggest yellowfin given time. Real blue-water divers fight fish of that size on several floats, for half an hour and more. The risk in the game is the time it takes: a shark or a goliath can take a fish off the shaft while it's out on the line.

## The rubber landing net

The landing net (`landingNet`), $90 (rubber nets sell for $85 to $95):
- It takes a fish up to 13.6 kg (30 lb, EGO's rated load), though not a billfish, which has a bill (`Rigs.NET`, `netted`).
- A netted fish is never lost at the side (`landedAtBoat`). By hand alone, one over 12 kg can shake off.
- It nets a fish from 1.8 m off, where a hand takes it at 1.2 m (`Rigs.landAt`). That covers a fish to be let go, too.
- A dehooker's reach, and a big fish at the leader, are as they were.

Barthel et al. 2003 found about 4 in 100 fish hurt when let go from a rubber net. The game doesn't use that figure: the only released fish it counts as hurt is a billfish, and the net doesn't take billfish.

The net isn't drawn; the catch card shows the fish.

## The Bahamas' rules

- **Snook are let go**, under the Bahamas' 2017 flats rules, as bonefish, permit and tarpon already are: `protected` and `cr` ("Catch and release: everyone lets one go").
  - Joe's ask for a snook from the mangrove creek is now Marta's: she pays $30 to tag one and let it go. It keeps the same place in the asks' list, so no other day's ask moves.
  - A super grand slam is now told as "all let go".
- **No pelagic bag:** the Florida-style bags on mahi (10), wahoo (2), yellowfin (3) and swordfish (1) are gone. The Bahamas' 18 pelagics a vessel is a visitor's limit, and she's a resident.

## Tests

- `test/gear-m19.mjs` (new), covering:
  - the blue-water gun's four bands, each on its notch, and a one-band gun's three folded away;
  - its terms;
  - a 40 kg wahoo lost on the railgun and landed on the float, and a fish let run going out to the float line's end and no further;
  - a careless haul into every run tearing it off;
  - the net's weight limit, no billfish in it, none lost at the side, and its reach;
  - the snook and the bags;
  - no ask of Joe's for a protected fish.
- `test/spearfishing.mjs`: every gun's bands stretch about 3.2 times on their notches, the blue-water gun's four too.
- Updated:
  - `game-logic.mjs`: the bag's own workings, tested on a mahi lent its old bag of 10;
  - `island-sides.mjs` and `m16-fish.mjs`: the snook let go;
  - `life-list.mjs`: the super grand slam "all let go".
- `pnpm test` passes.
- **Seen** by `tools/gear/look.mjs` (new) on mid and low:
  - the blue-water gun loaded, its bands along the top of the stock;
  - being loaded, the bands not yet drawn hanging slack under the muzzle;
  - the railgun beside it;
  - a fish out on the float in the blue water, the orange float riding the surface with the line running down from it.

## Not done

- **Other players' copies:** they show the gun with its four bands, and its shaft and line, but not the float.
- **The net** isn't drawn.

## For the user

- **The float's hold** (9 kg), and landing the biggest yellowfin on one float given time: judgement.
- **The blue-water gun's price** ($1,580) is the real gear's: a good deal more than the railgun's $480.
