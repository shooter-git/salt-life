# M17, step 1: room

What [M17.md](../M17.md) asked before the tide goes in ([Script memory's headroom](../M17.md#script-memorys-headroom)): low's peak of script memory at least 10 MB under its 150 MB on two complete checks. Done 2026-11-08 on `m17-flats` (main as of v2.2.2, `e2aa854`, with step 0 and both proposal commits merged in), with the tools that measured it in `tools/heap/`.

## Where the peak comes from

All the Spaces' checks read `usedJSHeapSize` every 250 ms on each of four screens and judge the highest. `tools/heap/probe.mjs` plays `qa/script.json` the same way and keeps every reading, with the game's marks and the step under way. On v2.2.2 the laptop screen read 147.5, 116.3, 144.9 and 143.2 MB in four runs. Where the peak falls swings it by 30 MB.

**It's never the load.** On a CPU's WebGL the plants, the catch card's shaders, the cover map, Joe and Marta, the animals and the debris, the scans and the reef all come after the start, one after another (`App.start`), while the script plays. The peaks came 50 to 120 s in, where three things overlapped:
- the late stages, the plants growing and `prepareLate` (20 s of it);
- F8's trips, three boats built in about twenty seconds (bank, far, home: the lobster boat, the sportfisher, the lobster boat again);
- the weather picked, the thunderstorm's most often.

Most often it came straight after the third build, the lobster boat built again to come home.

**What's held**, from a heap snapshot after the check's play (89 MB once collected):
- Half of it is buffers (50.9 MB): the island's heights (4 MB), its `rock` mask (4 MB, floats), six more masks (1 MB each), three of the shore's fields (2.25 MB each) and the bank's (1 MB), the cover map (2.2 MB), the plants' instances, the boat's geometry.
- Compiled code, 15 MB; boxed numbers, 4 MB, 2.5 MB of them in the plants' records.
- The village's part cache, 3 MB (`GeoBuilder`'s `partCache`).

**Build-only data, held all through the checks.** The masks, the plants' records and the village's shapes are let go after the animals and the debris (`App.letGoOfTheBuild`, `releaseMasks`). On a graphics card that's at the load. On the CPU it's minutes after the start. In a long run the heap fell from 89 to 74 MB at 240 s, when they went: the check's play had ended at about 180 s. Most of it had last been read when the plants were placed, at about 45 s.

**A boat's build**, in plain Node (`tools/heap/boat-mem.mjs`):
- 95 to 109 MB allocated on the heap, most of it boxed numbers of code run cold, dead young.
- 7 MB of typed arrays.
- 20 to 27 MB still on the heap straight after, for the collector to find.
- Her parts' own arrays are held in `GeoKit`'s buckets until they're merged, then dropped: 1.5 to 2.6 MB a boat.
- Her lines' section cache, 0.7 to 0.9 MB, stays for as long as she's yours.

## What changed

1. **What only the plants read goes once they're placed** (`App.plantsPlaced`, on every device). The plants' records but for what the drips, the crabs and the debris read: the palms whole, the trees' feet and size, the bananas' and young palms' feet (`Vegetation.slimRecords`). The gully, rubble and scarp masks, read only by the ground's maps, the rocks and the plants, all made by then. On a CPU's WebGL the village's part cache too (`releaseParts`). With a graphics card the debris come next, at the load, and use it. About 9 MB, from about 45 s after the start on the CPU, where it went at about 240 s.
2. **A boat's arrays given back as she's built.** `GeoKit.merged` detaches each part's arrays once its bucket's merged (`core/FreeNow.js`), and `loadBoat` clears her lines' section cache once she's built, as the sportfisher's was already. Every boat's meshes are the same byte for byte: a hash over every attribute and index of all four boats on low and high.
3. **The checks' spots far first, then the bank, then home** (`game/CheckSpots.js`), so each boat's built once: the sportfisher far out, then the lobster boat at the bank and home in her. `qa/script.json`'s far-out screenshot follows the first F8 now. Each spot is still read in the boat it was.
4. `freeNow` leaves a buffer that's already detached alone: `transfer` throws on one.

## Readings

`tools/heap/probe.mjs`, v2.2.2 and the change side by side, each on four cores of its own, one round per screen and two of each, on a machine shared with other sessions (load 9 to 21):

| Screen | v2.2.2 (MB) | M17 step 1 (MB) |
|---|---|---|
| Phone, upright | 149.2, 138.8 | 127.9, 105.6 |
| Phone, on its side | 137.4, 145.9 | 127.0, 131.3 |
| Tablet | 128.5, (the browser lost its network) | 131.1, 117.5 |
| Laptop | 115.6, 132.0 | 111.9, 123.9 |
| Highest, mean | 149.2, 135.3 | 131.3, 122.0 |

The lowest reading between 60 and 110 s, near what's live then, is 8 MB lower: 68 MB against 76 on average.

**All the Spaces' complete check** (`cli.ts check` from its `main`, `57b4f25`), each on a clean copy, on four cores (`taskset -c 0-3`), one after another:

| Script memory (MB) | Phone, upright | Phone, on its side | Tablet | Laptop | Judged |
|---|---|---|---|---|---|
| M17 step 1, first | 138.3 | 134.9 | 118.1 | 126.9 | **138.3**, 11.7 under |
| M17 step 1, second | 138.2 | 137.1 | 117.2 | 133.0 | **138.2**, 11.8 under |
| v2.2.2, the same night | 151.4 | 151.8 | 124.0 | 152.8 | **152.8**, over |

v2.2.2's ran with two probes beside it on four other cores, and its phone upright was ready in 8.4 s against 4.6 to 5.0 for the others. Everything else passed in all three: 66 to 83 draw calls of 150, 238k to 245k triangles of 300k, 68 to 70 MB of textures, 98 to 102 MB of graphics memory, 14 sounds, 7.0 MB before ready and 78.2 MB in all.

The checks read higher than most probes, but they aren't measuring differently. Their own play of this build, phone upright alone (`cli.ts play --viewports phone-portrait`), read 117.2 and then 139.5 MB. Phone upright, the first screen after the warm-up, has a high mode at 138 to 140 MB, and both complete checks landed in it. So the room this gives is the 10 MB asked for, with about 2 MB over at that mode.

## Tried, and not done

- **`rock` as the bytes it's baked as**, 3 MB. The load flattens the ground under the village's buildings and the lighthouse, and that scales `rock` there (`TerrainData.flatten`), so not every value is a 256th any more. The plants' placing has to read the same floats or they'd move, so it would need its changed cells kept apart. Not taken.
- **The shore fields' CPU copies**, 2.25 MB each. The water's query reads them every frame, the arrival time in seconds at full precision, and the texture's drawn from the same array. They stay.
- **The ground's detail texture's copy**, 1 MB. It's kept at the load only so the plants can sample it after the start (`releaseTextures`' `keep`), so it could go with the rest in `plantsPlaced`, once the texture's on the GPU. Found after the checks below, so it's left for the foundation.
- **A boat's garbage while she's built.** Most of it is boxed numbers of code run cold, which die young. There's no cheap cut.
- **The animals and the debris before Joe and Marta.** The masks they read, 6 MB more, would go at about 120 s instead of 240, but that's past where the peaks are.

## The tools (`tools/heap/`)

- `probe.mjs`: script memory over a check's play, as above, on one screen of a build (`cli.ts build`). By the environment it also samples allocations (`PROBE_SAMPLE`; `PROBE_SAMPLE_OLD` for only what outlived the young generation), records every buffer of 64 KB or more (`PROBE_BUFFERS`), takes a heap snapshot at the end (`PROBE_SNAPSHOT`), or goes on until a mark (`PROBE_UNTIL_MARK`). Compare two builds side by side, on cores of their own (`taskset`), several rounds on every screen. One run says little.
- `timeline.mjs`: a run as a timeline, each bucket's lowest and highest reading with the marks and steps in it.
- `profile.mjs` and `buffers.mjs`: the sampled allocations and the buffers, by the source file and line that made them. They need the script built again with its maps beside it (`build-map.mjs`).
- `snapshot.mjs` and `snapshot-buffers.mjs`: what a snapshot holds by kind, and each buffer by its path from `window.__app`.
- `boat-mem.mjs`: what a boat's build costs, in plain Node.

## What's left

- The tide holds a second shore field (2.25 MB on low, at 384 cells a side) and the flats' fish add a little. That's what this room is for.
- More is there if the tide needs it, each to be checked as these were:
  - the detail texture's copy, 1 MB (above);
  - `rock` as bytes with its flattened cells kept apart, 3 MB;
  - the debris and the crabs' homes placed as soon as the plants are, so the masks they read (`rock`, `sand`, `path`, 6 MB) can go then, not minutes after the start.
- The checks on the server are slower than these, and their peaks have run higher (128 to 152 MB on v2.1.x). What this gives there is only known once a build's imported.
