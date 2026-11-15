# M20, stream CHECKS: the checks M19 didn't run

Stream CHECKS of [M20.md](../M20.md), built 2026-11-15 on `m20-checks` from `m20` (wave 1 and FINISH merged, `886a005`). It runs what M19 left: the mate with two players, the full two-player sweep, the load-time A/B and one screen's play on one core, high's cloud shadows against the flats' shade, and the piles' wet band in the sun.

## The mate with two players

**The part** (`tools/two-players/crew.mjs mate`, two real games):
- Robin hires her mate and stands on her sportfisher's deck, out in the blue water.
- Sam takes a 220 kg blue marlin off her holder and into her chair.
- On Robin's game her mate should have her helm (`helmsman` 'mate'), bring her stern round to Sam's line and back her down on it.
- On Sam's game his fight should take her way through the water as she moves on his screen (`Game._riddenVelocity`), so the line comes back to him.

**What it found: the mate never took her helm in the game.** He waited for her engines to be running (`Mate.update`'s `b.engineOn`). Leaving her helm stops them (`Hull`: an engine runs only while she's driven), so by the time a fish was on and you were off her helm, they were always off. M19 tested his steering on the real sportfisher in Node (`test/mate.mjs`, `mateHelm`) and modelled him in the fight sweep, but nothing ran his taking her helm in a game.

**The fix** (`Mate.js`): her engines running isn't asked. He takes her helm and starts her, as taking her helm does (her hull cranks her once she's driven). `test/mate.mjs` now drives `Mate.update` with her engines stopped and a fish on: he has her helm and she's driven, and with the fish off she's yours again, stopped. That test fails without the fix.

**With two games now** (all passing; the two games ran at 6 to 8 frames a second):
- her mate has her helm on Sam's fish, his figure at it;
- her stern round to Sam's line, from 66° off to 7° off (the median after);
- backing down at 3.44 m/s, at most 3.86, Sam's fish 158 m off;
- on Sam's game, 59.3 m of line back to him over the 17 s she closed 57.0 m on hers;
- the fish off, she's Robin's again, stopped.

**Two things the numbers show:**
- **He runs over at a low frame rate.** At 30 frames a second (`test/mate.mjs`) he holds within 0.75 to 1.2 of the 3 m/s he wants. At the 6 to 8 two games get here his wheel and lever come a frame late each time, and he ran 1.07 to 1.21 of it (3.22, 3.63 and 3.44 m/s over three runs). That's no faster than boat tests back a sportfisher down (3.3 to 4.6 m/s). The part allows 1.3.
- **A slow game's fight sees her faster, and gets the right line back.** Sam's game had 7.3 s of its own time in 16.9 s (its frames held to 0.1 s), while her copy moved in real time, so his fight saw her at 4.6 m/s, not 3.4. The line it got back, her speed times his game's own time, was what she closed (59.3 m against 57.0). That's how the line should come back: by what the boat moved.

## The load-time A/B and one screen's play on one core

Against v2.5.0, each a clean copy built by All the Spaces' CLI (`cli.ts build`), the CHECKS tip at `b8d49d8` (wave 1, FINISH and the mate's fix), on a quiet machine with nothing else running:

| | v2.5.0 | CHECKS |
|---|---|---|
| Ready, phone upright, 4 cores, four rounds alternating | 2.19, 2.21, 2.26, 2.28 s (median 2.24) | 2.19, 2.29, 2.22, 2.21 s (median 2.22) |
| One screen's whole play (the laptop's, its script's 112 steps), one core each, two rounds alternating | 207, 215 s | 208, 210 s |

The same within the rounds' spread. (FINISH's own A/B at `405ca77`: 2.28 against 2.22 s.)

**The commands** (from All the Spaces' checkout, `ALL` its path; `A` and `B` the two copies' source folders, `A-dist` and `B-dist` their builds; Node 24):

```sh
# a clean copy of a commit, and its build
git -C salt-life archive <commit> | tar -x -C B && ln -s salt-life/node_modules B/node_modules
node packages/qa-browser/src/cli.ts build B B-dist
# ready, phone upright, 4 cores: a round each, alternating which goes first, readyMs from the JSON
taskset -c 0-3 node packages/qa-browser/src/cli.ts play B-dist out-B-1 --viewports phone-portrait --seconds 1 --json
# one screen's whole play on one core: the laptop's ("desktop"), the copy's own script played through; the wall time
taskset -c 0 node packages/qa-browser/src/cli.ts play B-dist out-B-1 --viewports desktop --script B/qa/script.json --json
```

Without `--script` a play is a few seconds of standing still (the first one-core rounds here took 40 s): the whole play is the script's.

## High's cloud shadows against the flats' shade

**What it was.** The flats' fish see a cloud's shade (`FlatsFishing.shadeAt`): the sight model's glare and contrast, the bites' conditions, the glint of a fish. On the CPU that was a field of its own, value noise drifting on the wind at the sky's cover. On high the clouds' shadows are drawn from a map of the sun's light through them (`SkyProClouds`' `shadowMap`, 256 texels over 12 km), and the two had nothing to do with each other (M18's list).

**How it's measured** (`tools/flats/shade.mjs`, high): from 300 m over the west's flats, the clock held, the map read back whole and sampled as the shaders sample it (`cloudShadowXZ`), over a grid of 1,681 points every 20 m in an 800 m square. "Shaded" is at a half: the sun's light through the cloud under 0.5, as the clouds have faded in.

| Sky | Drawn, shaded | The CPU's field, shaded | The field agreeing with the drawn | `shadeAt` now agreeing |
|---|---|---|---|---|
| Fair (cover 0.49) | 0% | 22% | 79% of points (0.20 apart on average) | all of them |
| Breezy (cover 0.55) | 30% | 32% | 79% (0.23 apart) | all of them |

So about one point in five was shaded on one and not the other: a fish under a drawn cloud seen as in the sun, and one in the sun as under a cloud.

**Now** (`CloudShadows.shadeAt`, App's `cloudShade`): on high a window of the map round the camera, 33 texels a side (1.5 km), is read back once a second, into a buffer of the GPU's and fenced, and taken when the fence has passed a frame or two later, so nothing waits on it. `shadeAt` is the drawn shade there. Off the window, before the first read, and on low and mid (no shadows drawn), it's the field as before.

**Found on the way:** the map's half floats here read back as red half floats (the device's own format for it), not the 32-bit floats asked for, and a read asked for that way came back empty. It's read as RGBA floats, which WebGL 2 reads any float target as. A read that gives anything outside 0 to 1 leaves the field in place.

## The piles' wet band in the sun

`tools/flats/look.mjs`' `piles` (from the sand 15 m off) and `pileClose` (4 m off), at low water (−0.9 m), on mid, with the clock held at 8:30 and at 16:00 (`FLATS_HOUR`, new).
- **At 8:30** the low sun's behind the camera and under the deck, on the piles' faces. The band shows as a gradient up from the water, not an edge. The near pile's foot is a dark olive, (23,23,11), its green level with its red and its blue low: the algae. It goes up through (36,35,20) and (48,44,32) about a third of the way to the deck into the wood's brown, (95,84,70).
- **At 16:00** the view's into the sun, and the piles are silhouettes.

Judged: in the sun it reads as piles darker and greener toward the water, as the weak photographs of piles have it (sources-tide-fish.md: no clear Bahamas photograph of a band was found). There's no sharp line at the high water mark: the shader fades the algae over 0.3 to 0.75 m, broken by the grime's noise. Nothing changed.

## The full two-player sweep

**The runner** (`tools/two-players/sweep.mjs`, new): every two-player job M17 and M19 added, and M20's, 36 in all, each through `tools/render-slot.sh` two at a time, one log each, and `sweep.md` with every failure and the lines before it. A job that exits well having checked nothing (a part it doesn't have) counts as having run nothing.

**The first pass** (61.7 minutes): 31 of 36 passed. The five that didn't, each followed up:

| Job | What it was | Now |
|---|---|---|
| `together slow` | The job read the sea's clock through a bare `import( '/src/core/Globals.js' )`. Once source has changed under the dev server, the game's modules carry a `?t=` and a bare import is a second copy, whose clock never moves: "the sea's gone 0 s by". | The two-player jobs import the game's own copy (14 places in 9 jobs). Passing. |
| `wakes` | The same stale clock: Robin never got under way, and it timed out. Run again, two jobs at once at 4 frames a second, the wake under Sam's kayak read 2.0 cm, on the check's edge. | Alone: 9.4 cm under her, the same in her own water query. Passing. |
| `flats hook` | The stale copy too, and then a real cause in the job: its waders were put from the dry beach straight into the flats, where the water's height a frame before was the sand's (the query reads dry sand as the ground less 0.1 m, on v2.5.0 as now). A metre and more of water over his feet, Sam swam (`SWIM_DEPTH`), and couldn't cast. | `wade` sets his water's height to the sea's, as going over a boat's side does; and the schools it picks are kept out of the flats' surf edge, where the shore's waves still run (a wader there is knocked over, on v2.5.0 as now). Passing. |
| `crew traps` | Robin's game refused Sam's set: "A trap needs a crawfish trap permit". The job predates M19's permit. | It buys her the permit. Passing. |
| `resume kayakanchor` | **A real fault, from M19** (its own check, never run). Sat in the kayak at anchor and reloaded, she came back with no anchor and drifted, 126 m in three hours; v2.5.0 did the same. Her record was kept with the anchor and saved again two seconds into the load without it. | Fixed (below). Passing, and every kayak scenario of `resume.mjs` with it, 198 checks. |

And `together hold` ran nothing: `together.mjs` has no `hold` part (it's `crew.mjs`'s since, which the sweep runs). It's dropped from the list.

**The kayak's anchor over a reload** (`App.pickUp`):
1. A kayak's start lays her on her sand at home (`KayakModel.atHome`), which marks her beached.
2. The load put her back where she was left, afloat at her anchor, still marked beached.
3. M19's rule, "drawn up on the sand, she's no anchor out" (`Game.updateAnchor`), let the anchor go that frame, without a word, and the next save kept her so.

Now the load clears that when she's left afloat, at anchor or adrift. Aground, or on her sand, she's kept lying there as before. (A first try cleared it always, and a kayak found aground slid off the sand: `resume.mjs`' `long` caught it.)

**The full sweep, run again** for the five on a fresh dev server: all passing.

## Tests and tools

- `test/mate.mjs`: the mate takes her helm with her engines stopped.
- `tools/two-players/crew.mjs`: the `mate` part.
- `tools/two-players/sweep.mjs` (new): the full two-player sweep, M17's jobs, M19's and M20's, through `tools/render-slot.sh`, each job's log kept and its failures written up (`sweep.md`).
- `tools/flats/shade.mjs` (new): a cloud's shade on the flats, the CPU's against the drawn map, on high.
- `tools/flats/look.mjs`: `FLATS_HOUR`, the clock held at another hour than noon.

## Checks

CHECKS_FINAL
