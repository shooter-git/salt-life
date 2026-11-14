# M19, stream CHECKS: the checks never run, the looks, the radio's shadow and where a flare's seen

Stream CHECKS of [M19.md](../M19.md), built 2026-11-13 on `m19-checks` from `m19` (f34d71e). It covers:
- M18's checks that were never run, and its looks (M19.md's "From M18's list");
- two of the user's calls on the unsourced figures: the island's ridge blocking the VHF, and a flare seen from the village or Pearl's camp.

## The radio's shadow

**What changed.** The radio had line of sight only by the radio horizon. Now the island's hills shade it too (`Seaworthy.inSight`).
- **Who has an aerial where:** Marta's is on the boathouse's ridge by the chandlery; Pearl's is on her camp's shed (`SHORE_AERIAL`).
- **The test:** a set raises an aerial if, all along the line between them, the ground stays below the line. The earth's curve is in it, at the 4/3 radius radio uses.
- **Small rises don't block:** a rise standing up to `VHF_CLEAR`, 60 m, over the line doesn't stop it. The signal bends over a headland that size; knife-edge diffraction there costs a set some 20 dB of the 40 to 70 it has in hand at these ranges. The ridge, to 302 m, does stop it. The 60 m is judgement.
- **Where it applies:**
  - Marta's call says so: "Nothing but static. The island's between you and Marta's aerial by the chandlery. Pearl, on the north side, may hear you."
  - Pearl's call says the same when the island's between you and her.
  - With no one to call, someone happens by in the end. That now counts as being able to call only if your set raises one of them (`DaysOut._rescueNet`).

**On the real island** (both bakes), from a console's 3.71 m aerial, round the island 1.5 and 3 km out:
- the north raises Pearl and not Marta;
- the south raises Marta and not Pearl;
- round the east and the west, both raise Marta, and Pearl too;
- nowhere raises nobody.

That's the user's call: "From behind it you raise Pearl (and her tow), not Marta."

**The probe, at each margin.** It's 16 bearings from the north, clockwise. `M` raises Marta, `P` raises Pearl, `-` neither:

| The ground may stand over the line by | 3 km round |
|---|---|
| 0 m (strict line of sight) | -P -P -P -P -P -- -- M- M- M- M- -- -- -P -P -P |
| 20 m | -P -P -P -P -P -- M- M- M- M- M- -- -- -P -P -P |
| 40 m | -P -P -P -P MP M- M- M- M- M- M- M- M- -P -P -P |
| **60 m** (the game's) | -P -P -P MP MP MP M- M- M- M- M- M- MP -P -P -P |

With strict line of sight, the east and the west would raise nobody: the low headlands by the harbour stand in the way of an aerial 9.5 m up.

## Where a flare's seen

**What changed.** A flare was seen if it went up within reach of the island's middle. Now it's seen from the village (the harbour, the pier and the plaza by the bay) or from Pearl's camp:
- the watcher must be within the flare's reach (Seaworthy's `FLARE_M`, by day or by night, times the visibility);
- the meteor's height must be over the hills from where they stand, an eye 1.7 m over their ground (`WATCHERS`, `FLARE_UP` 111 m, `DaysOut.flareSeen`);
- light doesn't bend, so no margin.

Another player's flare is seen the same way, over the hills from where you are (`theirFlare`).

**On the real island:**
- by day, a flare north of the island is seen (from Pearl's camp), and so is one south of it (from the village);
- one 3.4 km north of the middle, past the camp's 2.8 km by day, isn't seen, where the island's middle had it in reach.

## The hogfish's mottling

**Before:** square on every device. It was one octave of value noise on a grid, thresholded, so the blotches followed the grid.

**Now** (`FishMaterial.js`'s hogfish): the noise's grid is turned and warped by a coarser one, with a finer octave on another turn. The blotches are irregular and round-edged.

**Seen** by the fish look page (`tools/fish-look/?fish=hogfish`), with the old `FishMaterial.js` served in its place for the before.

## The stars and the Milky Way turn with the sky

**Before:** the stars were hashed from cells of a fixed cube grid round the view direction, so they stood still while the sun and moon went over.

**Now:** the view direction is turned into the sky's own frame before the lookup (`skyCelestial`, a uniform set each frame by `Sky.update`):
- the turn is about the celestial pole, due north and 24° up, the island's latitude;
- it goes once a sidereal day, so it gains a degree a day on the sun;
- the sky's azimuth is undone first;
- the horizon's dimming and the twinkle still go by where you look.

The sign was found in Node: with the sun's own rate, the sun's direction in that frame stays put all day.

It's one uniform in the sky's own program: no new program, and the same program count in the loading frame.

## A slam reached through real fights

M17 counted the slams from the catch on. Now each kind is fought on the tackle a player would take to it, on the game's own terms (`tools/fight-sweep.mjs`' `fightOnce`, played with care), landed, and the slams counted from what was landed (`test/checks-m19.mjs`):

| Fish | Tackle | Landed in |
|---|---|---|
| 2.6 kg bonefish | 8-weight fly rod | 26 s |
| 9 kg permit | 10-weight | 35 s |
| 30 kg tarpon | 12-weight | 77 s |
| 5 kg snook | 15 lb spinning | 18 s |

Each was landed on its first fight. The grand slam came with the tarpon, the super grand slam with the snook.

## The CPU's water against the drawn water, at each tide level

**The method** (`tools/checks/water.mjs`):
- A small magenta ball, 6 cm across, is put at the CPU's height for the sea there (`App.query.heightAt`: `Waves` and `ShoreWaves`, what the boats, the swimmer and the bobber ride).
- The waves' clock is stopped, the same for both. ((M20) Not for the breakers: `App.frame` had already run `shore.update` before the tool set the clock back, so the drawn surf ran a frame ahead of the CPU's. Some of the swash's 6 to 12 cm may be the tool's; M20 measures it again: [M20.md](../M20.md).)
- The ball is looked down on from over it and stepped from 12 cm under the CPU's height to 12 over.
- Where its top comes out of the drawn sea (bright, not dimmed) is the drawn sea's height there, to ±2 cm.

Readings, on mid (+ means the drawn sea stands above the CPU's height):

| Tide | West's flat | Bay off the pier | Beach's swash |
|---|---|---|---|
| -0.9 m | 0 | 0 | 0 |
| -0.3 m | 0 | +4 cm | more than 6 cm under |
| +0.3 m | 0 | +4 cm | more than 6 cm under |
| +0.9 m | 0 | 0 | +12 cm |

**What it means:**
- On the flat and in the bay the two agree, within the method's 2 cm, or 4 cm in the bay at mid-tide.
- In the beach's swash, where the breakers' sheet runs (`ShoreWaves`), they don't. Its CPU copy and the shader's disagree by 6 to 12 cm, either way. That's what a swimmer or a kayak in the surf rides.
- Not fixed here: [Left](#left).

## Resting and the tow's jump

Run now (`tools/checks/tide-rest.mjs`, on low). It starts at a low water near noon (day 20, the sea at -0.32 m); a rest goes to dusk, near high water.

**Before the fix**, against a quiet frame (her within 1 to 2 cm of the water, rising or falling at most 0.26 m/s):
- **Moored at her berth:** the sea rose 0.56 m, and she was left 0.49 m under it, then thrown up at 1.6 m/s.
- **At anchor:** a 0.21 m rise left her 0.21 m off it, at 0.67 m/s.
- **Towed in to her berth:** she was 0.18 m off the water there, at 0.85 m/s.

**The fix** (`DaysOut._settle`, `settleSoon`):
- On quiet frames, her own height over the water under her is kept.
- For a few frames after the clock's jumped or a tow's put her somewhere (`passed`, `rescue`, `Game.tow`), she's set at that height over the water where she is, with nothing rising or falling.

**After the fix:**

| | Off the water, at most | Rising or falling, at most |
|---|---|---|
| Moored, the rest | 9 cm (from 49) | 0.38 m/s (from 1.6) |
| Anchored, the rest | 3 cm (from 21) | 0.20 m/s (from 0.67) |
| Towed in | 5.5 cm (from 18) | 0.21 m/s (from 0.85) |

The moored boat's 9 cm is her riding the swell at her berth at high water: the water under her falls 7 cm in six frames right after she's set on it. There's no jump.

## The catch card on mid's and high's studio light

`tools/looks/card.mjs`, now with `CARD_TIER`, at 844 × 390, the card up from the game's first seconds:
- **Mid:** 31 draws of the card's scene, none with a stand-in in it.
- **High:** 32 draws, none.

So the stand-ins M17 caught on low (one draw while the card's programs were made) don't show on mid's and high's studio light (`RoomEnvironment`) either. The toast clears the card's title on both.

## The stars, seen turning

`tools/checks/stars.mjs`, on low: the same view, south-east and 35° up, on day 23 (the night nearest new moon) at 21:00 and 23:00, at 01:00, and at 21:00 the night after.
- **Over the night:** between 21:00 and 23:00 the whole field and the Milky Way's band have wheeled on.
- **A day later:** at 21:00 the same stars are back, 10 to 12 px further on, about 0.8 to 0.9° at this lens (the sidereal day's gain is 0.99°). They move right and a little up: rising in the south-east and going round to the south, as the sky turns.

## The dark band under a surge

**Chased.** It's the lens's own waterline, not a fault in the game.

**What it is:** `tools/flats/look.mjs`'s beach view, under a 2 m surge on high water, lifts the eye to 1.2 m over the tide and the surge (3.8 m), as it does for any view whose ground is under the sea. But the surge's swash runs further up the beach there, by the boathouse. So the eye stood in it, and the frame was split along the swash's sloping surface: under it dark, the sky over it greyed.

**How it was found:**
- Hiding the boat, and anything named spray, wake, foam, swash or splash, left it.
- Hiding the water mesh left it too: its dark side turned black.
- With the eye lifted to 5.9 m it's gone.

## A tailing permit, drawn

`tools/flats/sight.mjs`'s new `permitTail` view, from wading, 8 m off, at a long 20° lens. The shot waits until one of the school has its tail up (Fish.js' own state, as its `onTail` reads it).

**The first try failed.** It was a school in 0.57 m of water: under Fish.js' 0.7 m, where a cruising permit stops to root on a crab, but too deep for its tail to clear the top. The sight model rated its body at 0.04, and nothing was drawn (the flats' budget spent nothing).

**In a foot of water or less** (a school in 0.22 m on day 6 at 13:45):
- the pair are drawn, one cruising side on and one head down on its crab with its tail up;
- the sight model reads the body 0.94, the tail 1, the shadow 0.48, and two shadows are marked on the sand;
- on low, mid and high.

So a permit tails visibly only in the shallowest of the water it crabs in. That's as the guides have it: "a foot or two of water".

## The piles' wet band, close up

`tools/flats/look.mjs`'s new `pileClose` view, from the sand 5 m off a bent, at low water (-0.9 m) and high (+0.9 m), on mid.
- At high water the sea's over where the band would be.
- At low water, under the deck's shade at noon, the piles' wood is so near black that a wet band doesn't show on it.

Judged: on these piles, in their own shade, it's not a look anyone will see. A band on piles in the sun, the outer ones or another hour, wasn't looked at.

## Left

- **The beach's swash:** the CPU's water and the drawn water disagree by 6 to 12 cm in the breakers' sheet (`ShoreWaves`). A swimmer or a kayak in the surf rides the CPU's.
- **The piles' wet band in the sun**, not looked at.
- **The radio's 60 m and the flare's watchers** are judgement, as is the water check's 2 cm.

## Tests and tools

- `test/checks-m19.mjs` (new), on both bakes of the island:
  - the radio's shadow, and the flares' watchers;
  - a slam reached through real fights;
  - the stars' sky turning.
- New tools:
  - `tools/checks/water.mjs`: the CPU's water against the drawn, and with `WATER_SWEEP=1` the stopped clock's sweep;
  - `tools/checks/tide-rest.mjs`;
  - `tools/checks/stars.mjs`.
- Old tools, new views:
  - `tools/flats/sight.mjs`: `permitTail`, with a wait for a tail;
  - `tools/flats/look.mjs`: `pileClose`;
  - `tools/looks/card.mjs`: `CARD_TIER`.
- `pnpm test` passes.

