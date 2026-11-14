# M20, stream KIT: the floats, the landing net, the anchor's splash, the boats' details

Stream KIT of [M20.md](../M20.md), built 2026-11-14 on `m20-kit` from `m20` (SEA merged, `0797a96`). Its sources are in [sources-boats.md](sources-boats.md).

## The blue-water gun's floats

**Before:** one float held a fish of any size at the end of its float line.

**Now:**
- **One float holds a fish to 35 kg** (`FLOAT.holds`), the user's call within the sources' 23 to 36 kg.
- **Extra floats** (`spearFloats`, Gear): a second, a third and a fourth, $135 each (Rob Allen's 11 L). Two hold 70 kg, three 105 and four 140.
  - They're bought only with the blue-water gun fitted. `needs` can now ask for a level (`needsLevel`), and the shop says "Needs the blue-water speargun first" (`needsName`).
  - Each float drags on a running fish another 9 kg.
- **A fish heavier than its floats hold** drags them under at the end of the float line and pulls free: "It dragged the floats under and pulled free · more floats hold a bigger fish". The float line doesn't hold it there, as it holds a lighter one (`spearTerms`' `under`).
- **Drawn:** as many floats as are on the line, clipped together in a row along it (`floatGeometry`, `placeFloats`).

**In the sweep** (`tools/fight-sweep.mjs --spear`, now with S3+1 to S3+3), pulled with care:

| Fish | One float | Two | Three |
|---|---|---|---|
| a 30 kg wahoo | 100% | 100% | 100% |
| a 40 kg wahoo | 15% | 100% (70 s) | 100% |
| a 60 kg yellowfin | 0% | 100% (138 s) | 100% |
| a 90 kg yellowfin | 0% | 0% | 100% (206 s) |

A 40 kg wahoo on one float is now lost 85% of the time; M19's test had it landed. `test/gear-m19.mjs` now uses a 30 kg one.

## The float on other players' copies

**Before:** a copy's gun level was clamped to 0 to 2 (`Together.js`), so other players saw the blue-water gun as the railgun, and its float wasn't drawn on their copies.

**Now:**
- The level reaches the blue-water gun.
- A fish out on the float line sends where the float rides and how many floats there are (the pose's `Gf`).
- The copy draws them there (its `tackle()`'s `float`), the line bowed up to them as the owner's game draws it, and the shaft's flopper open with the fish on.
- The floats ride the sea where they are, on both games. They took the sea's height over the diver, so on high a swell's crest between covered them (`Speargun.update`'s `waterAt`; the copy's from its own sea).

## The landing net, drawn

**Before:** the landing net (M19) landed a fish from further off but wasn't drawn.

**Now:**
- A rubber net about EGO's size: a 50 cm hoop, a 42 cm bag and a 1.2 m handle (`netGeometry`).
- It's in the water beside a netted fish once it's within 2.2 m, and under it as it's lifted out, its handle toward you (`FishingRod.netting`, set from `Rigs.fightTerms`' `net`).
- Other players see it on your copy (the pose's `Ln`).

## The anchor's splash

**Now** (`FlatsFishing.splash`, `Game.plunk`): an anchor going in spooks the flats' fish that hear it. So do her Power-Poles' spikes and a stake-out pole.

**How far it's heard**, by a fish of a bonefish's wariness (the warier the further: `Sight`'s `wary`):

| | Heard to | Where it comes from |
|---|---|---|
| An anchor | 15 m | the plan |
| Her Power-Poles | 6 m | judgement |
| A stake-out pole | 4 m | judgement |

- It goes through `spooked`, so the school's gone from everyone's flats as any spook is.
- The Guide says why ("the anchor went in with a splash"; the poles' thump; the stake).
- An anchor makes a splash's sound and a spray of drops.

## The boats

**Standing in the Pilot:**
- Past 14° of heel you lose your footing and go in over her low side. She stays upright, the cooler with her (`HEEL.stand`, `KayakModel.fallIn`).
- Sitting keeps today's capsize limits.
- Beam on she heels 2° in calm, 6° in fair and 8° in breezy weather (`test/kayak.mjs`), so standing's safe in ordinary weather. A squall's gust (11°), a wake or a breaker can put you in.
- The 14° is judgement (sources-boats.md's 3), the user's call.

**The trolling motor's batteries** (`Trolling.js`; a charge in the days' record, `days.boats.console.troll`):
- Three 12 V AGMs in series, 80 Ah usable. The motor draws 52 A at full thrust, as the lever to the 1.5: 18.4 A at half. That's 1.5 h flat out and 4.4 h at half.
- Charged at 10 Ah an hour from her outboards running, or on the dock's charger while she's tied up (8 h from flat, a night's rest).
- Her thrust is all there until the last 5% of the bank, then goes with the voltage.
- They're spent in real time, as her fuel is, so a day's poling at a third of the lever is 9 h. The dock's charger goes by the island's clock, so a rest charges them.
- A Battery gauge in the purse while she has the motor, and a word when they're low and when they're flat.
- Only the boat you're in charges at the dock.

**The poles on hard bottom** (`Game._stakeHer`, and the console's K):
- Her Power-Poles and the kayak's pole hold on sand, mud and grass as before.
- They won't stake in rock or the reef's edge: "Hard bottom · her Power-Poles won't bite: find sand, mud or grass".
- They aren't put down on live coral (the Exuma park and the Keys' sanctuary forbid it): "Live coral under her · the Power-Poles don't go down on it".
- The bottom is the traps' (`TrapWork.bottom`).

## `kayaksand`

`tools/two-players/resume.mjs` gains the `kayaksand` scenario M19 asked for:
- You're sat in the kayak at the water's edge with an anchor aboard, and get out of her as the game does it. She's pulled up the sand, and no anchor goes down.
- Reloaded, she's there with no anchor.
- An anchor saved on her sand is let go on the load.

## Tests and checks

- `test/kit-m20.mjs`: the floats' holds and drag, the sweep's fights, bought only with the blue-water gun; standing and sitting in the Pilot; the batteries' draw, run times, charging and record; the poles on each bottom.
- `test/flats-together.mjs`: Robin's anchor sends a school off on her game and Sam's; her Power-Poles' thump 24 m off isn't heard.
- `test/gear-m19.mjs`: its wahoo's now 30 kg.
- `tools/two-players/kit.mjs` (two real games), on low, mid and high, all passing: Robin's blue-water gun with two floats out, on her game and as her copy on Sam's (the copy's floats within 0.5 m of hers); Robin landing a netted fish, on both.
- `tools/two-players/resume.mjs kayak kayaksand`: all passing (out on the sand, no anchor; reloaded, the same; an old anchor let go).
