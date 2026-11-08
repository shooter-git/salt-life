# M17, step 2: the foundation

What [M17.md](../M17.md) asked before any stream starts ([How it would be built](../M17.md#how-it-would-be-built), 2): the flats themselves, the tide and the moon as numbers, the sea's level from them with the shore's waves at two levels, the boats and the kayak riding it, and the flats' fish as data. Done 2026-11-08 on `m17-flats`, on step 1 ([room.md](room.md)).

## The tide and the moon

`IslandClock`'s `tideAt( T )`, `tideRate`, `tideTurns`, `tideState` and `moonAt`, from the island's time (T, island hours since day 1 began), as the weather is.

**Settlement Point's tide** (NOAA 9710441, Grand Bahama). It's the only station in the Bahamas with harmonics of its own; Nassau, Andros and Eleuthera are predicted from it ([before.md](before.md), The tide).
- Twelve of its constituents (M2, S2, N2, K1, O1, P1, K2, NU2, MU2, 2N2, L2, Q1), each at its NOAA amplitude and Greenwich phase.
- Each turns at its own speed from the moon's, the sun's and the perigee's mean longitudes (Meeus), as a tide table's worked out.
- Left out: the seasons' SA and SSA (the game has no seasons), and the 18.6-year node's factors (held at their mean, 1).

**Checked against NOAA's own predictions.** With every constituent and the node's factors, the same sums reproduce NOAA's hourly 2026 predictions for the station to 1.1 cm RMS, which shows the astronomy's right. As the game has it (no seasons, no node), against NOAA's highs and lows for November 2026 (`test/tide.mjs`):
- each high and low within 7 minutes of NOAA's;
- each as high to 7.3 cm, once the month's mean level is set aside (2.5 cm: the seasons').

**Its shape**, over a year of island days (`test/tide.mjs`):

| | The game | NOAA (Settlement Point) |
|---|---|---|
| High to high | 12.421 h | 12.42 h |
| Mean range | 0.833 m | 0.834 m |
| Springs, about new and full moon | 0.96 m | 0.97 m (2026) |
| Neaps, at the quarters | 0.69 m | 0.64 m (2026) |
| Springs at perigee / apogee | 1.12 / 0.79 m | about 1.14 / 0.75 (before.md) |
| Springs after the moon | 1.2 days | 25.6 h (the age of the tide) |
| Highest and lowest, twenty island years | +0.72, -0.62 m | |

**The island's day 1 is 15 January 2027 by the sky**, its hours local mean time at the station's 79 W. That gives:
- a first-quarter moon on the first evening, so neaps to begin;
- high water at 12:33 on day 1, the tide near its mean and rising at a new game's 9:30, which is when All the Spaces' checks play;
- a full moon near perigee a week in, the first big springs.

**At the clock's pace** a flood is about ten minutes of play by day, faster at night. Resting, sleeping aboard and a tow's jump move it with the clock. Everyone on one clock has the same tide.

**+ - x / alone.** As the weather is, it's worked out without `Math.cos`: `cosTurns` is a series about the nearer of 0 and a quarter turn, good to 4e-13. So every device has the same tide to the last bit, and the flats' fish decided by it are the same on every device.

**The moon** (`moonAt`): its phase (0 new, 0.5 full) from how far it's drawn ahead of the sun, its age, how much of its disc is lit, and its distance from its mean anomaly (364,000 to 406,000 km). Its look, its light and what minds it are stream 3's.

## The sea's level

`G.seaLevel` is the tide plus a hurricane's surge (`WeatherDriver`: `tide`, and `G.tide`, the tide's share). Everything that read the surge follows the tide:
- the water drawn and the CPU's query (`WaterQuery`, through `Waves` and `ShoreWaves`);
- the boat you're in, the boats at their berths, swimmers, the bobber and the line;
- the fish's ceilings, the sea's culling box, the reef and the rain's rings.

A hurricane's damage reckons its water on the tide too (`StormDamage`), as does where its flying sheets land, so one at spring high water does the most.

**The shore's waves at two levels.** The island's own swell's field is solved:
- at low water (-0.6 m, `TIDE_FIELDS[ 0 ]`) at the load, where it was solved at 0 before;
- again at high water (+0.6) after the start, in the westerly's worker (`App.solveTideField`).

The two are blended by where the sea is between them, on the GPU and the CPU (`ShoreTrain.upperMix`; the shader's `shoreLevels`). High water's is in the surge's own texture slot (`shoreTexS`), since the sea's at 16 of 16 on high. A hurricane's surge field is solved on the tide's high water and takes high water's place while it's there; high water's is solved again after. Until high water's arrives, low water's alone serves at any level, as the island's own did at a surge before its field came. `test/waves.mjs`:
- each field exactly at its own level;
- between them, a wave's phase moving at most 1.7% of a wave a centimetre of tide (the surge's blend was held to 2%);
- the wash running up the village beach to 0.41 m at low water, 1.00 at mean and 1.68 at high water.

**Over the flats** the waves are taken out past the flat's rim (an 8 m grid of how much is left, `TerrainData.shoreCalmAt`, read by every field's solve). A swell breaks on the rim and dies away over the first tens of metres of a flat a few tenths of a metre deep. Before this, high water showed breakers across the whole flat. The bay's waves are as they were (exposure 1.00 at the beach).

**The kayak and the boats.**
- The kayak's pulled up past the tide's high-water mark (the surge's sea on the tide's highest, 0.72 m), so the flood comes up to her and goes, and only a surge floats her off. She starts 1.25 m up the sand, 17.5 m from the water. `test/kayak-play.mjs` holds her at the tide's highest, beached, and floats her off on a 2 m surge.
- One you own and aren't in is laid there too (`Berths.ashoreOf`).
- From low water the way up the sand is longer: pulled up within 40 m, pushed off within 60.
- The boats at their berths ride the drawn water as they always did, and the boat you're in, afloat at the dock, is at the sea's level.

## The flats

`world/terrain/Flats.js`, cut in by `TerrainData` as a bake's loaded, after the north beach and the trail.

**Where and what.** On the west, seaward of the mangroves, in the lee of the trades, as the flats of Andros's west side lie (the user's call on step 0, 2026-11-04). Its edge runs from the shore below the west's sea cave round to the shore south of the bight, both ends ashore. On low's bake (`test/flats.mjs`):
- **its size:** 10.1 ha under 1.2 m at mean water, 0.49 m deep on average;
- **its bars:** 67% bared at the lowest spring low;
- **its bottom:** white sand in low bars and long troughs, with sand waves on them; turtle grass in beds where the water's deeper at mean (39%); the mangroves' mud along their edge;
- **its creeks:** the mangrove creek's carried on out to the edge, with two branches, and one to the north and one to the south with a branch each, 2.3 to 0.75 m deep from mouth to head;
- **five potholes;**
- **its edge:** falling away at 1 in 5, then 1 in 2.5, to the seabed as it was, with rubble on its slope.

**The cut.** It only raises the ground (never the land above 0.8 m, nor the mangroves' floor), but for its creeks and potholes. The mangroves' own creek and pool are kept open, raised no higher than their bed, so the creek runs on out over the flat. The edge's slope is let go of 65 to 95 m off the rim, well inside its window, so no seam shows.

**Its cost at the load**, on this machine, low's bake: 63 to 95 ms (1 m bake: 220 to 350). A texel at a time it took 2 s, and 0.55 on low:
- the distances to the edge and the creeks are worked out by a chamfer from their lines drawn into the window, each line's own texels exact;
- inside the outline is found by scanlines;
- the slow noises are read off a 4 m grid, the mud off an 8 m one.

`flatsAt( x, z )` is the same worked out at a point, for tools and tests.

**What it kept.** What each texel was, height and masks, for the rocks' and the plants' placing as it was (`TerrainData.uncut`, `masksBefore`). It's kept in windows of the island's arrays: on low 58k texels, about 0.7 MB, where a Map of them would be megabytes. It's let go once the plants are placed (`letGoOfTheFlats`, from `App.plantsPlaced`). Two rocks of the island's scatter sit on it, as heads on the flat; the rest are off it.

**Low's masks** are the island's own, changed in place: nothing added but the 8 m calm grid (14 KB).

**The chart** draws it from the ground as it's loaded: the flats as shallows inside the 6 ft contour, soundings from 0.6 m. Drying ground (S-52's green) and depths from a chart datum are left for the tide's stream, which gives the day's tides on the chart and Joe's slate.

## The flats' fish, as data

`game/Flats.js`, pure: `flatsSchools( T, { wind, overcast, hour }, state )`. It gives where each school is by the clock, the tide and the moon, the same for everyone, as the far water's finds are.

Each high water brings its own fish, from the sources ([sources-tide-fish.md](sources-tide-fish.md)):
- **Bonefish:** 3 to 6 schools of 3 to 19.
  - Each comes up a creek (`FLATS_ROUTES`: the three from the edge and their branches) to one of twelve feeding grounds on the sand (`FLATS_HOMES`).
  - They feed there, tailing or mudding, from about 3 h into the flood to about 3 h into the ebb, and go back down a creek. They stage at the creeks' mouths either side.
  - There are fewer in a blow.
  - In a month of island days none fed on the flat outside those hours. Their feeding readings: 0.0% on sand the tide had bared, under 8% over a creek or a hole.
  - Ids: `bone:<high water>:<n>`.
- **Permit:** alone or in pairs, along the edge on the flood and at high water, off it at low.
- **Sharks:** a pack of blacktips and a lemon shark, on the flat at high water and its edge at low.
- **Snook:** along the mangroves' edge and at the creeks' heads on the ebb, facing up into the current.
- **By the day:** barracuda over the grass, and tarpon rolling in the main creek's mouth and the potholes (more at dawn and dusk and in still air), laid up on the edge in calm, sunny water.
- **Spawning:** about new and full moon, the bonefish gathering in their hundreds off the edge at dusk.

**How they move.** A school's anchor moves at the island's pace: up a creek in about an island hour (100 s by day), then drifting tens of metres over its ground. Its fish swim about it in real time; that's sight-fishing's (stream 1), as their looks, their seeing and their take are.

**What changes** is a small record to send:
- `spook( state, id, T )`: the school's gone for 0.6 island hours, a minute by day;
- `hook( state, id )`: one fewer in it;
- `forgetFlats`: what's long past let go.

+ - x /, hashes and `Math.sqrt`, so every device has the same fish.

## Readings

The release checks ([M17.md](../M17.md#before-release)), on this machine (8 cores, shared with other sessions, load 6 to 17):

| Check | v2.2.2 | The foundation |
|---|---|---|
| `pnpm test` (with `tide.mjs` and `flats.mjs`), the bake's check and the lock | passes | passes |
| Ready, phone upright, 4 CPUs, four rounds alternating | 4.25, 4.54, 4.73, 4.43 s | 4.50, 4.62, 4.49, 4.50 s |
| Programs built before ready | 16 | the same 16, by name and number (`tools/heap/programs.mjs`) |
| One screen's whole play (the laptop's) on one core | 342 s | 317 s |
| `tools/gpu-limits.mjs` | | all within: high's sea 16 of 16 textures, mid's 14; low's village wood 16 |

**All the Spaces' complete check** (`cli.ts check` from its `main`, `57b4f25`), each on a clean copy, on four cores (`taskset -c 0-3`):

| Script memory (MB) | Phone, upright | Phone, on its side | Tablet | Laptop | Judged |
|---|---|---|---|---|---|
| The foundation, first | 130.3 | 129.2 | 140.8 | 129.8 | **140.8**, 9.2 under |
| The foundation, second | 123.1 | 141.1 | 119.2 | 128.7 | **141.1**, 8.9 under |
| Step 1 (room.md), two checks | 138.3, 138.2 | 134.9, 137.1 | 118.1, 117.2 | 126.9, 133.0 | 138.3, 138.2 |

Everything else passed in both: 75 and 81 draw calls of 150, 232k and 234k triangles of 300k, 70.1 and 70.3 MB of textures, 105.4 and 106.1 MB of graphics memory (98 to 102 at step 1; high water's field's texture is 2.4 MB of it), 14 sounds, 7.0 MB before ready and 78.2 MB in all. The first ran beside the GPU limits' check on the other four cores, and its ready times read 4.9 to 11.1 s; the second's, beside the one-core plays, 4.6 to 6.3. The ready A/B, run alone, is the one to judge ready by.

**What the room went on.** The peak's 2.5 to 3 MB over step 1's, where it was asked to be at least 10 MB under 150 before the tide went in: high water's shore field (2.36 MB on low, at 384 cells a side) held from the start, less the detail texture's copy (1 MB) let go with the plants. It's 8.9 MB under now, and the peak's moved about the screens (the tablet's, then phone on its side) as it swings 20 MB with where the collector falls. The next cuts, if a stream needs room: `rock` as bytes (3 MB) and the debris placed early (6 MB) ([room.md](room.md), What's left).

**Not measured here:** the CPU's water query against the drawn water at each level. Both read the same sea level and the same blended fields (the query through `Waves` and `ShoreWaves`, the shader through `shoreSeaLevel` and `shoreLevels`), and the lobster boat at her berth rides the drawn water at -0.91, 0.31 and 0.90 m at low, mean and high water (`tools/flats/look.mjs`). Two games seeing the same tide is the same island time worked out the same way to the bit (`test/tide.mjs`: `cosTurns`); `tools/two-players` wasn't run for it.

## Seen

In `qa-output/flats/look/low/` (not kept in the repo). Seen there:
- **From the air:** at low water the creeks, the potholes and the troughs hold water across bared sand, and the edge's slope falls away blue; at high water a pale, shallow flat with its creeks dark through it. Before the waves were taken out over it, high water showed foam across the whole flat.
- **Wading:** at low water bared sand out to the water's edge, a line of wash at it; at high water clear water over sand, its caustics on the bottom.
- **The pier:** the lobster boat lower at her berth at low water and higher at high.
- **The beach:** the sea up to the pier's foot at high water, the kayak well up the sand.
- **What's left for stream 2:** the bared sand reads as dry beach sand, not wet, with no water lying in its hollows, and the grass doesn't show bared (the ground's grass needs depth over it).

`tools/flats/look.mjs` draws the flats from the air, wading and from the kayak's seat, the mangroves' edge, the village beach with the kayak on the sand, and the pier with the lobster boat at her berth. It holds the tide at any level, here low, mean and high water, on the CPU (SwiftShader). Its staged camera sets its own water, far plane and fog: the frame reads them at its own camera, and with the player wading it drew the far plane in to 32 m, cutting the ground off in a straight line that looked like stale heights. A readback of the GPU's height texture showed the flats' heights there exactly.

## Left for the streams

- **The tide seen** (stream 2): the flats drying, the wet bands, the swash, the caves' inlets, the creek's current; the chart's drying ground and datum; Joe's slate and the chart's tides.
- **The moon seen** (stream 3): its disc, its light, the turtles and the swordfish.
- **The fish seen, stalked and cast to** (stream 1): drawn from `flatsSchools`, their look, how they're seen and their take; the lemon shark's model.
- **What step 1 named and this didn't need:** `rock` as bytes (3 MB) and the debris placed early (6 MB), if the streams need room.
