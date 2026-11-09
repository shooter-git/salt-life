# M17, stream 6: the wakes' far arms as waves

What [M17.md](../M17.md#the-boats) asked: a boat's wake's far arms as smooth crests on the sea's surface, worked out from her track, in the CPU's water query too, so a kayak rocks in a passing console's wake and the bobber rides it, with the foam as it was ([console.md](../m16/console.md)). Built 2026-11-08 on `m17-flats` 3f1367b ([foundation.md](foundation.md)).

## What a real wake is

**Its shape.** A boat's waves go out at their group velocity, half their phase speed in deep water. So the crests made at one place spread into a wedge: Kelvin's 19.47° each side up to a hull Froude number of about 0.5. Past that the waves she can make are those no shorter than her own length, and the wake narrows as 1 / Fr ([Rabaud & Moisy 2013](https://arxiv.org/abs/1304.2653)). The foam's arms already opened at that angle (`wakeTan`).

**The crests in the arms**, seen in photographs side by side:
- A motorboat at a moderate speed on a calm lake (Lake Wakatipu, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:014_Wake_pattern_waves_on_lake_surface_-_Kelvin_wake_pattern_produced_by_a_motorboat_on_Lake_Wakatipu,_New_Zealand.jpg)): each arm a band of short crests en echelon, a dozen or more, each curved, the band wider and its crests longer the further out they've come. The middle of the V is nearly flat, the white wash down it.
- A speedboat on the plane, from her own deck ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Scene_while_speedboat_riding_at_maheshkhali.jpg)): two or three long, smooth ridges each side, nearly along the arm, the first the biggest, the foam between.
- Planing boats seen from a cliff on a breezy sea ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Trails_on_the_Ionian_Canvas.jpg)): the foam is nearly all that's seen; the crests hardly show on a rippled sea.

**Their length.** At Kelvin's angle the arm's waves run 35.26° off the track, 2/3 of a transverse wave's length (2π U² / g). On the plane the arm's waves are about her waterline's length: the waves at the narrower angle are the ones no shorter than she is. Their period hardly changes with speed there. Macfarlane et al.'s ski boat makes its wave B at 2.0 to 2.3 s at 12 to 30 kn.

**Their height**, crest to trough, from [Macfarlane, Bose & Duffy, SNAME 2012](https://www.amcsearch.com.au/source-assets/images/GJM_NB_JTD-SNAME-AM2012_Final-plus-Discussion-and-Responses_30Oct2012.pdf): 19 hulls in a basin, checked against full-size trials.
- A ski boat (L / V^1/3 4.79, about her own; 4.18 lengths off, about 25 m): 0.20 m at 12 and 17 kn, 0.10 at 22, 0.052 at 30. The highest wave of the train comes off the semi-planing speeds, and less as she gets up on the plane. Minnesota's field study found the same of real boats on a lake: the biggest wakes at about 10 mph, the smallest planing at 20 ([SAFL, Marr et al. 2022](https://conservancy.umn.edu/handle/11299/226190)).
- A 17 m, 12 t monohull 20 m off, in 6 m of water: 0.15, 0.5 and 0.88 of its highest (0.33 m) at Fr 0.2, 0.3 and 0.4.
- Slimmer hulls make less: their γ falls about as ( L / V^1/3 )^-2.3 (Fig. 6).
- Off the track it decays as a power of the distance, y^n, n -0.25 to -0.4 for these waves (Fig. 10): Havelock's cusp waves' y^-1/3.

## What's built

`ocean/WakeWaves.js`, pure but for three's Vector4 for its uniforms. `Waves` makes one (`waves.wakes`); the sea's vertex shader and the CPU's heights read the same samples.

**Her track.** `follow( key, x, z, vx, vz, L, V, t )` each frame for each boat under way:
- a sample (her place, heading, speed and the sea's time) every 6 s on a straight run;
- more in a turn (each 12°) or as her speed changes by 15%, at most one in 0.3 s;
- 16 kept a boat;
- none under 1.2 m/s. A jump of 60 m since she was last followed, or the sea's clock going back, starts her track again.

`Wake.track` follows the boat you're in (not the kayak, whose wake is ripples) and every boat in company by where she's drawn (`followDrawn`: her velocity from her place frame to frame, her hull from `WAKE.hulls`, as her model has it). `App.frame` calls it before the water's queries, so the CPU and the sea read the same samples each frame.

**What's sent** (`update`): the boat you're in first, then the nearest within 1 km (600 m on low). Up to 40 samples in 4 tracks on mid and high, 24 in 2 on low.

For each track:
- her now;
- where her arms come up, one and two and a half waterline lengths behind her middle (none on her own hull, so she never rides her own waves);
- what's recorded;
- where her arms end, at 75 s (about 110 m off her track on the plane), put in between.

Each sample carries:
- its age;
- its waves' k and cos θ: θ is the divergent waves' way whose energy goes out at the wake's angle, tan ψ = tan θ / ( 1 + 2 tan² θ ), so the crests lie where the foam's arms do;
- the height its crests have by then: Macfarlane's fit at her length, slenderness and speed, y off her track, faded in behind her and out at the end;
- how far the train reaches behind its highest crest: wider as it goes out, and wider again under Kelvin's angle, for the feathered band of a slow boat; but no further in than half its way off her track. The middle of her V is left nearly flat, as in the photographs: close behind her a ridge or two each side, the two trains crossing only further astern. (Before this cap they crossed right behind her, and from abeam the crossing drew an egg-crate of oval highlights.)

**The crests** (`heightAt`, and the GLSL `wakeAt`, the same sum):
- Each sample's crests are now at P + age · cg · n either side, n their way.
- Each arm is the line through those, sample to sample.
- Along a length, the arm's quantities are put in between its ends, and each length fades into the next over 2 m where they meet.
- Across it: the train's highest crest on the line, gone a wavelength outside, the rest of the train behind it toward her track.
- The phase is the one each end's waves have from where she made them: k n · ( x − P ) − ω age. On a straight run that's the steady pattern exactly, whichever sample, and round a turn it carries on.
- On the GPU it's a loop over the tracks (skipping any whose box the vertex is outside), each over its samples, each over its two arms: one copy of the code, however many there are.

**The sea.**
- In the vertex shader, on the grid's point, as the open sea's waves are, under the cave's calm and the swash's sheet. Its slope goes into the normal.
- Faded out as the water shoals from 1.5 m to 0.2 m (`WAKE_SHOAL`), where it would have broken.
- The waves too short for the grid's spacing fade as the open sea's do (5 to 2.5 vertices a wavelength). On low's 2.3 m grid that leaves out the console's 5.6 m crests: see [On low](#on-low).
- Not in the plain sea a device that draws on its CPU loads with (`WATER_PLAIN`), so nothing's added before ready there. It's in the whole sea put in after the start (`fullSea`). No texture. Its uniforms: 2 a sample and 2 a track, 89 on mid and high, 53 on low.

**The CPU.**
- `Waves.heightAt` adds it at the point it finds under (x, z) (the grid's point, as drawn), with the same shoaling. So the boats, the swimmer, the bobber, the spray, the debris and the foam's patches all ride it.
- What it adds is what the sea draws near you: each sample's height faded by the sea's finest grid spacing (`WaterSurface` sets `wakes.spacing`: 2.29 m on low, 0.4 on mid, 0.25 on high; `wakeDrawn`), as `Waves` has always evaluated only the waves the tier draws. On mid and high that's all of every boat's. With no sea (Node), all of it.
- `Waves.displacement` doesn't: the whitecaps' crests are the open sea's.

**The foam** is `Wake.js` as it was.

**What they come to**, from `wakeHeight` and the angle and length above (crest to trough; off her track):

| Boat | kn | Fr | Arm's angle | λ (m) | T (s) | 10 m off | 30 m | 100 m |
|---|---|---|---|---|---|---|---|---|
| console (5.61 m on her waterline, 2.49 m³) | 12 | 0.83 | 13.5° | 5.7 | 1.9 | 0.34 | 0.24 | 0.16 |
| | 23 (cruise) | 1.59 | 7.1° | 5.6 | 1.9 | 0.16 | 0.11 | 0.08 |
| | 43 (flat out, twins) | 2.98 | 3.8° | 5.6 | 1.9 | 0.05 | 0.03 | 0.02 |
| lobster boat (7.79 m, 3.26 m³) | 9 | 0.53 | 19.5° | 9.2 | 2.4 | 0.31 | 0.21 | 0.14 |
| | 16 | 0.94 | 12.0° | 7.9 | 2.2 | 0.31 | 0.21 | 0.14 |
| sportfisher (12.84 m, 18.5 m³) | 15 | 0.69 | 16.2° | 13.5 | 2.9 | 0.65 | 0.49 | 0.33 |
| | 25 | 1.15 | 9.9° | 12.9 | 2.9 | 0.60 | 0.45 | 0.30 |

The console's chunkier than Macfarlane's ski boat (L / V^1/3 4.14 against 4.79), so a little more; the sportfisher's a big boat's 2 ft wake at cruise.

## Readings

On this machine (8 cores), shared all along with three other streams' renders and checks: load 25 to 80 through every reading below, against the foundation's 6 to 17. So nothing here is timed against the foundation's own numbers, only base and wakes side by side, alternating.

**Before ready: the same programs.** `tools/wakes/ready-sources.mjs` loads each build as All the Spaces' harness does (phone upright, low) and sets the programs made by ready side by side by their sources:
- 3f1367b and the wakes both make the same 16;
- 14 are the same to the character;
- the two seas (the plain one the loading frame draws, and the whole one put in straight after the start) have the same fragment shaders, character for character. Their vertex shaders differ only by the wakes' two blocks inside `#ifndef WATER_PLAIN`, which the plain sea's preprocessor takes out, so it compiles to the same program as before.

**Ready, phone upright, 4 CPUs**, four rounds in turn: 3f1367b 7.7, 17.1, 10.8, 11.1 s; the wakes 12.0, 19.9, 12.6, 10.2 s, at load 25 to 38. Noise only, but the plain sea above compiles to the same program, so nothing the wakes add is built before ready. Not run at a quiet hour (below).

**The whole sea after the start** (`fullSea`, where the wakes' GLSL is paid for on a device that draws on its CPU):
- `tools/wakes/compile-time.mjs`: the sea's program alone, compiled, linked and first drawn on SwiftShader, base and wakes taken in turn, five rounds, each source made unique. Medians: 3f1367b 0.23 s; the wakes 0.20 s with their loops' trip counts fixed (40), 0.23 with them run to the uniforms' counts (as built); the plain sea 0.23. No difference to measure.
- In the game, from ready to the whole sea in (FULL_SEA in `ready-sources.mjs`), three rounds each in turn at load 45 to 74: 3f1367b 25.2, 20.4, 13.2 s; the wakes 19.1, 29.6, 17.5. The noise is all there is.

**The download:** 10.4 KB more (82,095,157 bytes against 82,084,749).

**`tools/gpu-limits.mjs`** (`SHOW=Water` for the sea's own counts), all within on every tier:

| Tier | The sea's textures (fragment / vertex) | Its vertex uniforms (the wakes') | Its fragment uniforms |
|---|---|---|---|
| high | 16 of 16 / 8 | 185 (89) | 225, 226 |
| mid | 14 / 8 | 185 (89) | 208 |
| low | 13 / 8 | 136 (53) | 186 |

185 is under even WebGL 2's floor of 256 vertex uniform vectors.

**The CPU's query against the drawn crests** (`tools/wakes/look.mjs` match, high, the console at 18 and 22 kn): the sea alone drawn from above into a float target, each pixel the drawn surface's place, against `WaterQuery.heightAt` there.

| Where | Grid | Drawn against the CPU: RMS / most | The crests there: RMS / most | Their drawn RMS |
|---|---|---|---|---|
| 45 m astern, 8 m off (first run) | 0.25 m | 0.77 / 7.1 mm | 86 / 245 mm | 86 mm |
| 45 m astern, 8 m off | 0.25 m | 0.43 / 4.0 mm | 50 / 158 mm | 49 mm |
| 200 m astern, 26 m off | 0.25 m | 0.57 / 7.1 mm | 34 / 144 mm | 34 mm |
| low, 45 m astern (console at 24 kn; the CPU's then unfaded) | 2.3 m | 31 / 83 mm | 30 / 83 mm | 0 |
| low, 200 m astern (the same) | 2.3 m | 16 / 60 mm | 16 / 58 mm | 0 |
| low, 45 m astern, drawn at 44% (tried, not kept) | 2.3 m | 7.6 / 34 mm | 13.8 / 38 mm | 9.4 mm |
| low, 200 m astern, the same | 2.3 m | 4.1 / 22 mm | 6.9 / 25 mm | 4.4 mm |

The first two were before the CPU took the sea's grid into account: low drew none of the console's crests and the CPU had them all. Now on low it has none of hers either (`test/wakes.mjs`: on low, a sportfisher's crests the shader's and the CPU's alike, to 0.00 mm).

## On low

Low's sea grid is 2.29 m near you, so the console's 5.6 m crests are 2.4 vertices a wavelength, under the 2.5 at which the open sea's waves are let go. Tried (2026-11-08): fading the wakes on low from 2.5 to 2 vertices a wavelength instead, so her crests were drawn at 44% near you, the CPU's matched to that.
- **Against the CPU:** the triangles drew them more than half wrong: 7.6 mm RMS off on crests of 13.8 (the table above).
- **Seen astern** with and without them: her arms weren't to be told apart. Four frames running, close over her arm, showed nothing regular enough to call a crest.

So on low they're left out, drawn and ridden alike: on a phone a console's wake is her foam, and a kayak doesn't rock in it. The lobster boat's crests (8 to 9 m: about 60 to 85% of them near you) and the sportfisher's (13 m, all of them) are drawn and ridden on low as on the others.

Without the crests the same patch differs by 0.10 mm RMS (the open sea's own inversion): the rest is the triangles between vertices.

**A kayak in a console's wake at speed** (`test/wakes.mjs`, the real `BoatController` on the CPU's sea, flat but for the wake): the kayak lying still, side on, and a console at 30 kn passing 30 m off.
- The wake reaches her 17.6 s after the console passes; the arm's angle says 20.3, the train's front coming first.
- It's 6.5 cm crest to trough there, against Macfarlane's fit's 6.6.
- She heaves 7.5 cm and rolls 8.8° across (4.4 each way), pitching 0.9°.
- She settles upright as it goes by.
- Lying still before it, she doesn't move.

**Two players** (`tools/two-players/wakes.mjs`, mid, through `render-slot.sh`): Robin's console, driven along her line at 25 kn by the sea's clock, past Sam's kayak lying still 30 m off it, both seas flattened; nothing drawn between the checks, as the two-player scripts run.
- On Sam's game, Robin's wake is followed from where she's drawn, and it reaches Sam's kayak on Robin's fourth pass: 3.5 cm crest to trough under her, the same 3.5 in her own water query.
- Her kayak didn't ride it: she heaved 0.5 cm. The two games ran at 1.9 and 1.6 frames a second (30 asked; the machine at load 30, three streams' renders in its other slots). In company the sea's clock is the wall's, while a game steps its boat at most 0.1 s a frame. So below 10 frames a second she covers a fraction of the wake's passing, about a tenth here. Alone, the sea's clock is the game's own, and she rides it: in the game on high her roll across went from 1.75° to 4.4° in it, and the Node test has her heaving 7.5 cm on 6.5.
- **Robin's speed** read off where she's drawn had been 5 to 99 kn for a true 25 at about a frame a second, frame to frame. It's taken over at least a second of her drawn track now (`DRAWN_SPAN`); at the same rate it read up to 58 kn here, and 19 to 33 kn in `test/wakes.mjs`, her drawn place 3 m out either way each frame.
- **Earlier runs:**
  - Robin's console under her own power wandered 23° off her line and passed Sam 240 m off.
  - Sam's game stalled for up to 140 s at a time on its late building after the start, while the wake went by on the wall's clock.
  - A wait for that building to end never ended with nothing drawn: it waits on first draws.

**`pnpm test`**, with `test/wakes.mjs` (51 checks): all pass (a400c1c's tree). An earlier run at load 48 failed only `north-plotter.mjs`'s stopwatch ("a redraw's numbers 18.5 ms at best"); the run since passed it.

**All the Spaces' complete check** (`cli.ts check` from its `main`, `57b4f25`), each on a clean copy, at load 45 to 80:

| Script memory (MB) | Phone, upright | Phone, on its side | Tablet | Laptop | Judged |
|---|---|---|---|---|---|
| First (51b481e) | 135.6 | 128.9 | 132.1 | 111.1 | **135.6**, 14.4 under |
| Second (b7fa644) | 130.4 | 136.1 | 113.0 | 137.5 | **137.5**, 12.5 under (its play fell behind: see below) |
| The foundation's two | 130.3, 123.1 | 129.2, 141.1 | 140.8, 119.2 | 129.8, 128.7 | 140.8, 141.1 |

Everything else passed in both: 66 and 39 draw calls of 150, 218k and 170k triangles of 300k, 65.0 and 61.9 MB of textures, 95.9 and 92.6 MB of graphics memory, 13 and 9 sounds, 7.0 MB before ready and 78.2 MB in all.
- The second's play fell behind its script at load 60: its later screenshots never leave the far spot (no hurricane, no dawn), so its peaks don't cover what the first's did. A third, at a quieter hour, is left.
- The first noted the laptop's screen pausing 8.9 s while drawing ("probably while making its shaders"), at load 60 to 80. The whole sea's build alone measures the same with the wakes as without (above).

## Seen

`tools/wakes/look.mjs`, into `qa-output/wakes/<tier>/` (not kept in the repo), each view with the crests and the same instant without:
- **Astern, high, midday, the console at 19 kn:** with the crests the two arms show as long smooth bands opening from the foam toward the horizon; without them, only the ripples. Low and long beside the foam, as in the photographs of planing boats on a rippled sea.
- **From the air,** straight down: the deep water's nearly black and the crests hardly show; a wake shows by the sky in its faces, at a slant.
- **Abeam, high, midday, the console at 24 kn:** her arm as a few long, smooth ridges nearly along her track, running out from her foam; without them, only the ripples. It reads as the speedboat seen from her own deck does. In the first runs, at dusk and before the trains' reach was capped, the two arms' inner trains crossed behind her and drew an egg-crate of oval highlights; drawn again since the cap (the views now in her heading only: in her own frame, pitched up on the plane, the camera 40 m astern had been under the water), there's none.
- **A kayak in a console's wake, high, midday** (the kayak lying still in open water; the console's stand-in at 30 kn, 30 m off her starboard side, its wake followed as a boat in company's is): from her seat, as it reaches her, broad smooth ridges sweep diagonally across the view; without them, only the finer ripples. Her readings there, frame by frame on the open sea's swell (1.4 m of heave of its own): the wake under her 6.8 cm crest to trough (the Node test's 6.5); her roll across 1.75° before it, 4.4° in it; her pitch 2.7° and 4.1°.
- **Low, the console at 24 kn**, its crests drawn at 44% as tried ([On low](#on-low)): astern, her arms weren't to be told from the sea without them; four frames running close over her arm showed nothing regular enough to call a crest, and nothing that crawled either.

## Not verified, and left

- **A real graphics card,** and a phone's frame rate with the loop in the vertex shader: not measured here (Devices). With no boat under way the loop ends at once.
- **On low, no console's crests** ([On low](#on-low)), and a boat in company leaves no foam on your screen (the foam's only the boat you're in, as before), so on a phone another player's console passes and leaves nothing to see but her.
- **Two players at a real frame rate:** at the 1.6 frames a second this machine gave two games, a kayak in company doesn't ride a wake: her steps fall behind the sea's shared clock. At 10 frames a second and up they keep up; not run here. Each game's samples come from its own frames, so the crests can differ a little between the two.
- **Shallow water:** the waves are deep water's, faded out as it shoals under 1.5 m. A wake's growth and change of shape as it nears the depth's critical speed isn't modelled.
- **The ready A/B, `north-plotter.mjs` and a third complete check at a quiet hour:** the machine stayed at load 25 to 80 all day; the M17 session runs them for every branch in turn.
- **Left for the next stream:** stream 2's note (the shared notes) asked for the swash's 0.35 m run-up floor and the front's foam to go with the shore field's exposure, for the flats' hard white line. It's the sea's shader, but not done here.
