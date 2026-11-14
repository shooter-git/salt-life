# Script memory over a long session (v2.2.2)

Measured 2026-11-08 on v2.2.2 (main, e2aa854), built by All the Spaces (`cli.ts build`) from a clean copy and served by `vite preview`; the two-player page from a worktree's dev server. One game alone (`MEM_MODE=alone`), the sportfisher at sea under way, low tier, readings after two forced GCs every minute (`tools/two-players/mem.mjs`). All on SwiftShader, so the frame rates are a CPU's, not a phone's.

**Verdict: no leak.** Script memory's slow climb in a long run is V8 compiling more of the game's own code as it runs, and it levels off. The game's own objects (every object, array, string and closure it holds) stay flat to within a few KB over half an hour. With V8's compilers switched off, script memory is flat. Nothing in the game needs fixing.

## What was seen

The M17 session read one game alone at about 0.3 fps: once settled, 2.4 KB a frame on M17's base, 3.2 KB a frame on v2.2.2 (85.7 to 87.0 MB over 404 frames). Geometries, textures and programs were flat. At that rate it couldn't tell whether the climb went by frames (4 to 6 MB a minute on a 30 fps phone, which would end a long session) or by the clock (about 3 MB an hour).

## Frames or the clock

Four runs at once over the same 40 minutes, at frame rates far apart:

| run | what's drawn | frames from the settled reading | fps | fitted MB/min | KB a frame |
|---|---|---|---|---|---|
| A | 640×360, drawn | 748 (8 to 39 min) | 0.40 | 0.049 | 2.06 |
| C | 160×90, drawn | 2274 (8 to 39 min) | 1.21 | 0.028 | 0.40 |
| D | 96×54, drawn | 4456 (8 to 35 min) | 2.73 | 0.033 | 0.22 |
| B | nothing drawn (`MEM_DRAW=0`) | 6282 (8 to 40 min) | 3.33 | 0.018 | 0.09 |

Per frame they differ 23 times over, so it isn't a fixed cost a frame. Per minute they're within a factor of three, but the slowest climbs fastest, so it isn't a fixed cost a second either. Set against the frames each had run, the three drawn runs lie on one curve whatever their frame rate:

| frames | A (0.4 fps) | C (1.2 fps) | D (2.7 fps) |
|---|---|---|---|
| about 210 | 86.08 MB | | |
| about 690 | 87.15 | 87.17 | 87.23 |
| about 1000 | 87.46 | 87.59 | 87.63 |
| about 2250 | | 87.95 | 87.86 |
| about 3100 | | 88.26 | 88.18 |
| 3886 to 5265 | | | 88.28 to 88.31 |

It climbs fast over the first thousand frames, then slower and slower, and D is flat over its last 1400 frames (+0.03 MB). A, at 0.4 fps, only ever saw the steep part. That's why the M17 reading looked like a steady 3 KB a frame.

Drawing alone holds nothing. `tools/heap/draw-probe.mjs` settles a game, stops its frames and calls only `App.drawWorld` 400 times: +0.01 MB.

## What holds it

Heap snapshots after a forced GC, early and late in the same run, diffed by `tools/heap/grow.mjs`:

| run | between | frames | snapshot grew | V8's compiled code | objects, arrays, strings, closures |
|---|---|---|---|---|---|
| D, drawn | 6 and 34 min | 602 to 4863 | +1.59 MB | +1.36 MB (15.87 to 17.20) | +2.3 / −1.6 / −10.5 / 0 KB |
| B, nothing drawn | 8 and 38 min | 2245 to 8236 | +0.78 MB | +0.55 MB (16.49 to 17.02) | +0.9 / +4.4 / −2.9 / 0 KB |
| G, nothing drawn | 8 and 38 min | 3879 to 18343 | +0.90 MB | +0.67 MB (16.56 to 17.21) | +1.0 / +2.3 / −1.0 / 0 KB |

The code is machine code from V8's compilers (`InstructionStream`, D: +263 of them, +0.93 MB), with their position tables and deoptimization data (`TrustedByteArray` +0.33 MB, `ProtectedFixedArray` +0.13 MB), less bytecode flushed from functions that stopped running (`BytecodeArray`, −0.04 MB). Functions running machine code went 1950 to 1985 in D, 1948 to 1978 in B and 1940 to 1972 in G (`tools/heap/jitted.mjs`), with about two code objects each: functions that run only now and then (once a second, or on a change of weather) reach V8's thresholds late, and functions already compiled get their later tiers. The rest of the growth is the browser's own and bounded: Event Timing and layout-shift entries from the script's key presses (`PerformanceEventTiming` +88; the browser keeps at most 150 of each) and computed styles in the page. Nothing new in the game's own objects hangs anywhere: no logs, histories, caches, together records, sound nodes or listeners.

With V8's compilers off (`TWO_JS_FLAGS="--no-opt --no-maglev --no-sparkplug"`: everything stays in the interpreter), run F (96×54, drawn, 3.4 fps) is flat: 74.32 MB at 6 min and 73.81 MB at 35 min, fitted −0.007 MB a minute over 6015 frames, with no function running machine code. D, with them on, grew 1.16 MB over frames 602 to 2696.

Run G (nothing drawn, up to 60 fps, 8 had) is the longest at frames, 18,971 in 40 minutes: from its settled reading 107.11 to 107.83 MB over 15,092 frames (fitted 0.021 MB a minute, 0.04 KB a frame), 0.10 KB a frame over frames 3879 to 8754, then 0.022 KB a frame over 8754 to 18,343. Nothing drawn, it holds about 20 MB more than a drawn game throughout: big textures' and geometry's CPU copies, which `ReleaseAfterUpload` frees only once they're uploaded, not growth.

## What it means for a phone and for All the Spaces' checks

- On a phone at 30 fps, G's 18,000 frames are ten minutes. By then the climb is down to about 0.02 KB a frame, 0.04 MB a minute, and falling. Even if it held there, an hour's play would add about 2.4 MB. The M17 reading's 4 to 6 MB a minute was its steep start read as a rate. It's bounded by the game's own code: what there is to compile, a few versions of each hot function at most, deoptimized versions freed.
- About 13 MB of a settled low-tier game's script memory is V8's compiled code (74 MB with the compilers off, about 87 MB with them on, D's late snapshot: 9.9 MB of machine code and 2.1 MB of its tables). `usedJSHeapSize`, which All the Spaces' checks read, counts it. Their play is a few minutes at CPU frame rates, so their peak holds less of it than a long session at 60 fps would. That's worth remembering when a check reads close to 150 MB, but there's nothing to fix in the game for it.

## Tools

- `tools/two-players/mem.mjs`: `MEM_DRAW=0`, `MEM_VIEW=WxH`, `MEM_FPS`, `MEM_SETTLE` (the minute the fitted slope starts, per minute and per 1000 frames), `MEM_SNAP=<dir>` with `MEM_SNAP_AT=8,38` (heap snapshots after a forced GC).
- `tools/two-players/lib.mjs`: `TWO_JS_FLAGS` adds V8 flags. `__stop`'s `drawWorld` lets `App.firstDraws` go, as stream 4 of M17 found (`claude/m17-together-d45753`), so a game's late stages come while nothing's drawn.
- `tools/heap/grow.mjs <early> <late>`: two snapshots of one page diffed by V8 type and by kind, the objects whose ids are new, and where those hang (V8 doesn't keep code objects' ids from snapshot to snapshot, so count code by kind, not by id).
- `tools/heap/draw-probe.mjs`: drawing alone, with the game's frames stopped.

Run from a worktree with `ALL_THE_SPACES` set to the sibling checkout, the build served on its own port through a `.claude/launch.json` entry (`vite preview` with a config naming the dist), and the two-player page from a dev server whose `server.fs.allow` paths are absolute.
