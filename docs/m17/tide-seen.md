# M17, stream 2: the tide seen, and fished by

What [M17.md](../M17.md) asked of the tide beyond its numbers ([The tide and the moon](../M17.md#the-tide-and-the-moon): what it changes, seen and fished), on the foundation ([foundation.md](foundation.md), "Left for the streams"): the flats drying at a spring low, the mangroves' roots out of the water, a wet band on the piles and the rocks, the beach's wet sand, the sea caves' inlets, the creek running, the bites by the tide's stage, the day's tides told, and the chart in a chart's convention. Done 2026-11-08 on branch `claude/m17-tide-seen-0f8a8c`, cut from `m17-flats` 3f1367b.

## What a tide leaves: the wet line

`world/shore/Tide.js`'s `wetLine( T )` is the highest the tide's stood in the last 1.5 island hours (`DRAIN`). `WeatherDriver` sets it on the surge each frame as `G.tideWet`. Ground and rock under it were under the sea lately and are wet still; above it they've dried in the sun. So on a flood the wet line is the sea itself (what's above it has had hours to dry), and on an ebb it hangs behind the sea, about 0.15 m over a spring's low water.

Everything that draws a wet band reads it, and nothing else that's wet moved: the rain's wetness (`Wet.js`) is as it was.

**From photographs** (each viewed in the browser, none downloaded; the sources page lists them, [sources-tide-fish.md](sources-tide-fish.md), "A dry flat at low tide", "Mangrove prop roots at low water", "Intertidal wet band"):
- a bared flat at low water (Long Island, Bahamas, Rüdiger Stehn, CC BY-SA 2.0): a mottle of pale sand on the rises and grey, wet sand in the lows, with water lying in its hollows and the sky in that water; the far flat shining like water at a low angle;
- rippled sand bared at low tide (Sampson Cay, Exumas, CC0): near-white carbonate sand, the bars' tops dry, darker and smoother by the water;
- an exposed seagrass meadow at low water (Culatra, Ria Formosa, Duartefrade, CC BY-SA 4.0: no bared turtle grass was found): the grass lying flat and matted, olive-brown, sheets of water among it;
- a drained mangrove creek (South Andros, Oscar Flowers, CC BY-SA 3.0) and roots bared at low water (Biscayne, Yinan Chen, public domain): the prop roots arching clear, a dark band at their feet, wet mud and pools between.

## The ground (`TerrainSurface`, `Terrain`)

What had been done by the ground's own height now goes by the sea's: how far under the sea a texel is (`subW`) and its wetness. The seabed's looks (its sand, grass, rubble, the reef's flat) stay by the ground's height, as they're the bottom's own.

- **The swash's band** from the sea as it is, as before, but none of it under the sea. It had been cut off by the ground's height, so bared seabed never got wet: that's why the flat read as dry beach sand.
- **Below the wet line** the sand's wet.
- **Over the water left in the sand** (its table: a third of the way from the sea up to the wet line, the sand draining behind the tide) a fine sand's held wet a quarter of a metre up (its capillary fringe) and damp twice that; a mud's held wet higher (0.6 m). So a flat bared at low water is wet all over but its bars' tops, which pale first.
- **Water lying in the hollows** (`pond`): low down wherever the ground dips under the table, and over the wet flat in the ground's own hollows. How far down in a hollow a point is is worked out in the vertex stage from the ground 5 m about it (`vTerrainSea.w`: no new texture), and the sand's smaller lumps from the detail. A pond is level, smooth and darker, and mirrors the sky in full: the world's reflections are held low for the dry sand (Sky's `levels.env`, 0.09 of the sky's), and Terrain's `aomap` chunk lifts a pond's back to the sky's own, as the sea's are. By day only: the sky's environment is made again only now and then (minutes apart on the CPU), and holding the day's sky into the night it lit the mangroves' pools white after dark; at night they take the world's reflections as the rest does.
- **Wet sand's sheen**: the same lift for wet sand's film of water (`tWet`), so at a low angle a bared flat and a beach's swash band take the sky's sheen.
- **The turtle grass bared**: a bed's grass is grass whether the tide's over it or not; out of the water it lies matted, browner. It had needed 0.3 to 0.9 m of water over it to show, so the flats' beds went to sand as they bared (`ss( 0.12, 0.45, depth )` now).
- **Between the tides**: a film of algae and the microbes' mats over the sand, grey-olive in patches and most in its lows.
- **The mangroves' mud**, where the flats' cut and the mangroves took the sand mask for mud: grey-brown, peaty. Bared at a spring low it had shown the meadow's green through it.
- **Nothing green below high water** (`tidalW`): the shore's sand or mud.
- **A sea cave's cobbles**, wet from the wet line up into its spray.

## The rocks, the piles and the roots

Each keeps its zones where the tide's reach on average sets them (by the datums) and takes its wet film from the wet line:
- **the rocks** (`TerrainShading`'s `terrainRockSurface`, the ground's rock and `Rocks`, the low tier's too; a sea cave's walls): wet and glossy up from the wet line. The black zone over high water, the barnacles and the algae between the mean low and high, are as they were;
- **the pier's piles** (`VillageMaterials`' `vlmTidal`): the algae's band by the datums, glossy up to the wet line and a hand of splash, dried paler and duller above it;
- **the mangroves' roots** (`VegMaterials`' roots): dark and wet up to the wet line, the oysters' and the algae's crust between the mean tides, olive and grey, ragged at its top.

No texture was added to any of them: each takes one uniform, `G.tideWet`.

## The creeks running (`world/shore/Creeks.js`)

The tide's own prism, through the flats' creeks and the mangrove creek. As the sea rises at r, every square metre it covers upstream of a channel's section takes r more water a second, and it all comes through that section; its speed is that over the section's wetted area. r is the real tide's rate, not the island clock's: the clock runs about 36 times fast by day, and the water, like the wind and the waves, goes at its own pace.
- The channels (`CHANNELS`): the flats' seven, mouth first, each branch running into the creek it leaves, and the mangrove creek out into the main one at its head.
- Each 8 m of the flat drains to its nearest channel point, unless the flat's edge is nearer (then it runs off over the edge as a sheet).
- The section's read from the ground across the channel, and the water's quickest in its deepest part (as its depth to the two-thirds, Manning's), still where it's dry.
- The tables are worked out a few milliseconds at a time the first time you're on the creeks (`build( ms )`, App's `creekAt`): 23 to 25 goes of 2 ms in Node.

What it gives, at a spring's mid-tide (`test/tide-seen.mjs`, both bakes): 1 to 14 cm/s along the creeks, down them on the ebb and up them on the flood; 1.4 m³/s out of the mangroves and 3.3 at the main creek's mouth, which drains 4.3 ha. With the flat bared at low water, a seventh as much goes out. That's gentle, because the flats are small (10 ha) and their creeks broad and deep for them. It's how real mangrove creeks run: ebbs past 10 cm/s and floods of 2 cm/s in the Fukido River's mangroves on Ishigaki (Tokyo University of Science's hydraulics laboratory, 2002: https://www.rs.noda.tus.ac.jp/hydrolab/papers/2002/2002101.pdf), ebbs up to three times the floods in a mangrove creek at Whitianga, New Zealand (Horstman, Mullarney and Bryan, NCK 2019: https://www.nck-web.org/boa-2019/tidal-currents-in-a-mangrove-creek-system-quantified). Both read from the papers' abstracts, through a search; neither is a Bahamas creek, and none measured there was found. A kayak drifts down a creek on the ebb at a few metres a minute; paddling up it she makes a few percent less.

**Who feels it**: the boat you're in, through her hydrodynamics (`BoatController.currentAt`: her hull's resistance, her keel's lift and drag, her rudder, her paddle or propeller and her drift sock all work on her velocity through the water, her velocity less the current's), and a swimmer, carried by it as by a rip (`Player.creekAt`).

## The bites by the tide's stage

`Tide.js`: `stageOf( T )` (flooding or ebbing and how hard, about high water or low, at the turn) and `tidePlace( x, z )` (a creek's mouth, a channel, the flat's edge, its top: from `flatsAt` and the four mouths). `tideBites` (`TIDE_BITES`) gives how much sooner the bites come there now; `Game.habitatOf` sets it as `habitat.tide`, and `Bites.biteDelay` divides its mean by it. It's not a water type, so which fish bites is as it was; how soon is the tide's. The sources' ([sources-tide-fish.md](sources-tide-fish.md)): the bonefish on the flats from about 3 h into the flood to about 3 h into the ebb (Murchie et al. 2013), the guides' edges and creek mouths on the falling tide, a pier at slack water.

| Where | Flood | About high water | Ebb | Low water | The turn |
|---|---|---|---|---|---|
| The flat's top | 1.65 | 1.35 | | 0.35 (and none where it's dry) | |
| Its edge | 1.0 | | 1.5 | | 0.8 |
| A channel | 1.0 | | 1.4 | | 0.7 |
| A creek's mouth | 0.9 | | 1.8 | | 0.7 |
| The pier | | | 0.8 | | 1.5 |

Anywhere else the bites come as they always did.

## The day's tides told, and the chart

- **The chart** (`ChartBake`, the plotter's vector chart `PlotterChart`): in a chart's convention, a US chart's and NOAA's for Settlement Point.
  - Depths and soundings below chart datum, MLLW, 0.446 m under the mean.
  - The coast the line of mean high water (0.415 m over the mean).
  - Drying ground between them in S-52's green (DEPIT), with the datum's line as a depth contour: the flats' bars, the mangroves' floor and a beach's foot.
  - NOAA's datums (`DATUMS`), and the game's tide sits on them: over a year, its mean low and high water within 5 cm of NOAA's MLW and MHW (`test/tide-seen.mjs`).
- **The cooler's Chart tab**: the day's tides, as a tide table gives them, each turn's time and height over datum in feet ("High 2:20 AM, 2.9 ft"), and a line saying what the heights and the green are (`tidesOf`, `tideText`).
- **Joe's slate**: a fifth row, the tide's next two turns ("High 2:20am, low 8:35am"), the rows a little closer.
- **The Guide**: a `tide` tip the first time you're out on the flats or in the mangrove creek: twice a day, 50 minutes later each day, the springs; where the flats fish at each stage; the creek running; where the day's tides are given.

## Left for the sea's shader (stream 6)

**The hard white line at the water's edge.** Over the flats it isn't the ground's but the sea's own: the swash's run-up has a floor of 0.35 m whatever the wave (`ShoreWaves.shoreSwashRunup`), and the swash front's foam isn't scaled by the run-up (`WaterSurface`'s `frontFoam`). So over the flats' calm (exposure about 0.06) a line of foam runs a few tenths of a metre in from every edge of the bared flat. Scaling both by the field's exposure (or the run-up, `se.w`) would leave the beaches as they are. Written down for stream 6 (the shared notes, `stream2-tide-seen-for-stream6.md`), not changed here.

**How far the swash runs up** is the shore field's (the foundation's two levels, 0.41, 1.00 and 1.68 m up the village beach at low, mean and high water), so the sea's. The ground's wet band follows the sea's level, as it did.

## Readings

The release checks ([M17.md](../M17.md#before-release)), on this machine (12 cores, shared with three other streams' renders and two-player runs: load 35 to 69 all afternoon, so every timing here is inflated and noisy):

| Check | `m17-flats` 3f1367b | This stream |
|---|---|---|
| `pnpm test` (with `tide-seen.mjs`), the bake's check and the lock | passes | passes. `north-plotter.mjs` changed: its soundings are below chart datum now |
| Programs built before ready (`tools/heap/programs.mjs`) | 16 | the same 16, by name and number |
| `tools/gpu-limits.mjs` | high's sea 16 of 16 textures, mid's 14, low's village wood 16 | the same, all within: no texture added anywhere, one uniform (`G.tideWet`) to the ground, the rocks, the village and the roots |
| Ready, phone upright, 4 CPUs, six rounds alternating (load 35 to 62) | 16.4, 12.5, 16.0, 13.2, 25.0, 25.1 s | 27.0, 15.5, 11.9, 11.7, 22.4, 25.8 s |
| The ground's program alone: link and first draw, eight rounds alternating in fresh browsers (load about 60) | median 2919 ms | median 3240 ms (+11%); its fragment source 128.3k to 133.4k characters (+4%), its vertex 23.8k to 24.2k |
| One screen's whole play (the laptop's), one core each, the two side by side | 369 s | 399 s |

**Ready.** The A/B can't tell them apart at this load: a round swings 12 to 27 s either way, the rounds' medians are 16.2 and 19.0 s and the paired rounds' differences' median is -0.4 s. What can be said is from the ground's program alone: about a tenth more to build. In v2.1.5's measures (the ground's first draw 0.42 s of a 4.5 s ready, and cutting 1 s of first draws cutting ready 0.4 s), that's of the order of +0.02 s on a quiet machine. It wants the A/B again when the machine's quiet, before the merge.

**One screen's whole play** was 8% longer, side by side on two cores of a machine at load 60. The ground's shader does a few more smoothsteps a pixel (the wet line's, the sand's table, the hollows' water in a branch) beside its hundreds of operations and fifteen texture reads, and four more height reads a vertex between the tides. The foundation's play alone was 317 s, v2.2.2's 342 s. It wants measuring again alone too.

**All the Spaces' complete check** (`cli.ts check`), each on a clean copy, on four cores (`taskset -c 0-3`), the first two on 6eac103:

| Script memory (MB, as the check gives it) | Phone, upright | Phone, on its side | Tablet | Laptop | Judged |
|---|---|---|---|---|---|
| First | 132.4 | 125.9 | 119.6 | 131.5 | **132.4**, 17.6 under |
| Second | 119.7 | 137.8 | 130.5 | 110.6 | **137.8**, 12.2 under |
| The foundation, two checks | 130.3, 123.1 | 129.2, 141.1 | 140.8, 119.2 | 129.8, 128.7 | 140.8, 141.1 |

Everything else passed in both: 59 and 41 draw calls of 150, 209k and 180k triangles of 300k, 64.8 and 61.9 MB of textures, 95.4 and 92.6 MB of graphics memory, 9 sounds, 7.0 MB before ready and 78.2 MB in all, no errors on any screen. Their ready times (15 to 25 s) are the machine's load. The creeks' tables are made only on the creeks, which the checks never go to, and nothing else here holds memory.

## Seen

In `qa-output/flats/look/low/` (not kept in the repo), `tools/flats/look.mjs` on the low tier, the CPU's WebGL (SwiftShader), at -0.6, -0.35, 0, +0.35 and +0.6 m (springs and neaps), the wet line held as on an ebb:
- **From the air**: the bared flat grey-olive and mottled, darker in its lows, the mangroves' mud dark; it had been one tan of dry beach sand. The chart on the minimap shows the drying ground green.
- **Wading at low water**: the bar under you damp and paler, wetter toward the water (at a spring low it stands 0.3 m over the sea). At dusk its wet sand takes the sun's sheen.
- **The mangroves' roots at low water**: arching clear of wet, dark mud, water lying between them with the sky in it, a dark band at their feet, much as the South Andros creek's photograph; at high water under the sea.
- **The beach**: a darker wet band down to the water at an ordinary low.
- **The sea cave's inlet**: its beach bared at low water, the coralline band at its foot, flooded to the mouth at high water.
- **Left as it was**: the hard white line along the flat's water's edge (the sea's, above).

## Not verified

- **Ready and the play's length**: the A/B and the one-core play want running again on a quiet machine (Readings).
- **A third complete check**, on the final commit ca3fa80 (one shader line past 6eac103's two: the sky's lift by day only), was running when this was written, as were the pier's views at springs and neaps (the boats at their berths) and a 2 m hurricane surge on spring high water (`FLATS_SURGE=2`: the beach, the roots, the piles, the pier). Their results aren't in this page.
- **The piles' band** close to: the views drawn show the piles small, against the light; the band's change with the tide isn't judged from them.
- **On a graphics card** and a phone: none run, by the user's decision. The GPU limits check stands in for the card's limits, not its look.
- **Resting and the tow's jump**: by construction (the wet line, the stage, the bites and the creeks are all worked out from the island's time alone, nothing kept between frames), not run.
- **Two games**: the same island time gives the same tide and wet line; `tools/two-players` wasn't run.

## Not verified

(filled in below)
