# M20, stream SEA: the surf's water height, the moon in the sea, wakes in shallow water

Stream SEA of [M20.md](../M20.md), built 2026-11-14 on `m20-sea` from `m20` (ec0d4f8). Its sources are in [sources-sea.md](sources-sea.md).

## The surf's water height

**What was wrong.** The water's height on the CPU (`WaterQuery.heightAt`) is what a swimmer, a kayak in the surf, a bobber and a cast net ride. In the surf it wasn't the height the sea draws, for three reasons:
1. **The breakers push the water along.** The sea draws each of its vertices at a resting point moved by the waves. For the open sea's waves the CPU already found the resting point drawn at the point asked about (`Waves.heightAt`). For the shore's breaking waves it didn't: it took the breaker's height at the point itself. A breaking wave pushes its water forward along its way by up to about 2 m, which squeezes its face into a wall and folds it over.
2. **The roller's lumps** on a bore were drawn, but the CPU didn't have them.
3. **Each wave's own height** came from a sine hash, `fract( sin( x ) * 43758.5453 )`. The sea's shader works it out in 32-bit floats and the CPU in doubles, and they don't agree, so the CPU's waves weren't the ones drawn.

M19's measurement also let the breakers' clock run a frame ahead of the CPU's (M20.md, "Found while planning"). `tools/checks/water.mjs` now stops it for both.

**How it's measured** (`tools/checks/shore-match.mjs`):
- The clock is stopped for both, the breakers' too.
- The sea alone is drawn from above into a float target. Each pixel is the drawn surface's place, and the CPU's height there is set against it.
- Four spots, each a 12 m square of 192 by 192 pixels: the beach's swash (42, −27), the surf off the beach (38, −12), the bay off the pier (66, 38) and the west's flat (−700, −128).
- Four tides: the sea at −0.9, −0.3, 0.3 and 0.9 m.
- Only wet pixels count, where the drawn water is more than 3 cm over the ground.

**Before** (v2.5.0, mid): the rms difference in cm, and in brackets the share of pixels more than 20 cm off.

| Spot | −0.9 | −0.3 | 0.3 | 0.9 |
|---|---|---|---|---|
| Beach's swash | 0.5 | 9.7 (5.0%) | 12.7 (9.3%) | 7.7 (3.0%) |
| Surf off the beach | 8.6 | 5.7 | 3.9 | 4.5 |
| Bay off the pier | 3.8 | 4.6 | 3.8 | 1.9 |
| West's flat | 0.6 | 0.3 | 0.2 | 0.1 |

**Now**, on each tier. The waves themselves are new (each wave's height comes from a new hash, below), so the surf isn't the same surf as before, but it's the same in kind.

| Spot | Tier (grid) | −0.9 | −0.3 | 0.3 | 0.9 |
|---|---|---|---|---|---|
| Beach's swash | high (0.25 m) | 0.05 | 2.1 (0.05%) | 3.8 (0.33%) | 0.7 |
| | mid (0.4 m) | 0.1 | 3.1 (0.33%) | 4.9 (0.94%) | 1.3 |
| | low (2.3 m) | 0.3 | 6.5 (2.7%) | 9.9 (4.4%) | 4.1 |
| Surf off the beach | high | 0.1 | 0.8 | 0.1 | 0.01 |
| | mid | 0.2 | 1.3 | 0.4 | 0.03 |
| | low | 3.1 | 3.8 | 3.4 | 0.3 |
| Bay off the pier | all three | 0.02 to 0.3 | | | |
| West's flat | all three | 0.02 to 0.7 | | | |

At 50,000 s on the water's clock (14 hours: a long day's thousands of waves), mid reads the same as at 1,000 s.

**What changed:**
- **The CPU finds the resting point** (`WaterQuery.heightAt`, `_solve`, `vertexAt`):
  - `vertexAt` is the sea's vertex shader on the CPU: the open sea's waves, the wakes, a sea cave's calm, the shore's waves with their push, the swash sheet's smooth max, and the push let go where the sheet is the surface.
  - First come the open sea's fixed-point steps, as before. Where the shore's waves push the water more than 5 mm, Broyden's steps follow on the whole vertex. They begin as fixed-point steps, and the slopes are measured wherever a step doesn't halve the miss.
  - Where the steps miss, or the water may fold over, it scans instead. The water may fold where it's squeezed along the push, or where the push changed by more than 0.5 m on the way. The scan takes the resting points on a line along the push and finds every one drawn at the point. The highest is kept, as the sea's seen from above.
  - The scan reaches as far as the shore's waves could push the water there (`ShoreWaves.sample`'s `reach`).
  - A query point's slopes are begun from its height's resting point (`updateSlots`).
- **The breakers on the CPU** (`ShoreWaves`): the push along the wave's way (`profile`, the shader's `shoreProfile`), the roller's lumps (`lumpNoise`), and the face's place (`Xi`, `Xc`, `Wt` in `breakParams`).
- **An integer hash** (PCG's, `pcgHash` and the shader's `shorePcg`) for each wave's height and the lumps' lattice. It's the same to the bit on both sides.
  - A float "hash without sine" (Dave Hoskins') was tried first. It agreed at 1,000 s, but in 32-bit floats it drifts from the doubles as the waves count up. Over 1% apart in 11% of waves 300 to 1,000, 43% of waves 1,000 to 3,000 (a fair day's 9 s waves reach 1,000 in 2.5 hours), and 71% past 3,000.
  - The waves' sizes and the lumps change with it: the same in kind, but different waves.
- **A train whose field doesn't reach a point is skipped** (it pushes nothing there, and its swash runs up by none). At the beach the north's train was half the cost.

**What's left over:**
- **Low's grid** is 2.3 m, so it draws the breakers in chords. The CPU gives the real surface, which stands up to 10 cm rms off low's in the swash.
- **A wall of water**, a breaking face squeezed nearly upright, is a few cm across. Its thinnest slivers fall between the grid's points, so a pixel may show the wall's foot where the CPU gives its top. That's most of the share over 20 cm.
- **A bore's toe** run up over the swash sheet ahead of it can be missed. It comes from a resting point the shore doesn't push (the sheet's), so nothing says to look behind. That's 2 points in 160 in the Node test, 20 cm at most.

**What it costs:**

| | Now | Before |
|---|---|---|
| A height in the swash | 25 to 30 µs | 4 to 7 µs |
| A query point's three heights (its height and its slopes): swash | 45 to 55 µs | |
| bay | 15 µs | |
| out at sea | 5 µs | |
| In the game at the start, the kayak's 32 hull points by the beach: the query's frame | 1.19 ms | 0.85 ms |

**Tests:** `test/surf-height.mjs`:
- the integer hash, against PCG's in BigInt;
- the heights in a big day's surf, against every resting point drawn there found by brute force, at two tides and two clocks. The old way is more than 5 cm off at 35 points and the new at 2;
- the cost.

## The moon in the sea

**Before:** the panorama the sea reflects has no disc in it, so at dusk the moon left nothing on the water. Once the sun was down and the moon became the key light, the water's own glint of the key light drew a path, as wide as the drawn waves and three's specular lobe made it.

**Now** (`WaterSurface.js`'s glint, `Sky.update`, the uniforms `waterMoon`, `waterMoonLight` and `waterMoonSlope`; no texture):
- **From moonrise, at dusk too.** The moon's light off the facets tilted to send it to you, as Cox and Munk's glitter has it: its light, times the density of the slopes that send it, over 4 cos( the view's angle ) cos⁴( the facet's tilt ).
  - The facets' tilt is taken from the drawn normal (its waves and ripples), so the path still glitters with the waves.
  - Smith's masking takes out the facets hidden behind the waves before them.
  - It never sends more than a mirror would, the disc's own brightness.
- **Its width follows the wind** (`MOON_SLOPE`). The slopes' density is Cox and Munk's: along the wind 3.16×10⁻³ U, across it 0.003 + 1.92×10⁻³ U, less what the drawn waves and ripples already give. That's 0.8 of them, judged by the paths measured below: at 1 they came out 20% too wide, and at 0.05 (the drawn waves alone) 1.8° against Cox and Munk's 4.2°.
- **Its light:**
  - by night, the moon's light as the key light has it (as bright as the night is drawn);
  - at dusk, the disc's light as the sky draws it against the day's sky, through the air at its height;
  - in between, as the night comes on;
  - under a grey sky's veil, and its greyed horizon.
- **No double count:** while the moon is the key light, the key light's own glint is kept off the sea (in three's lights' loop, a light within 0.8° of the key's way).

**Measured** (`tools/moon/sea.mjs`): a boat offshore, the eye 2.2 m up, looking toward the moon with a 40° lens, the sky clear. The path's full width at half its brightness over the sea beside it, at its mirror point, in linear light (the ACES curve undone from the shot). It's set against Cox and Munk's for the same wind, the disc added.

The full width at half brightness, in degrees, at night and then at twilight, on mid. In brackets, Cox and Munk's: wind along the line of sight to the moon, then across it.

| Weather (wind) | Moon 5° up | 10° | 20° |
|---|---|---|---|
| calm (2.5 m/s) | 2.5, 2.3 (2.1) | 4.1, 5.0 (4.2) | 10.2, 7.5 (8.2) |
| fair (7) | 3.2, 3.7 (3.0, 3.5) | 6.3, 6.1 (6.0, 7.0) | 12.9, 15.6 (11.8, 13.7) |
| breezy (11) | 4.9, 4.2 (3.7, 4.4) | 7.6, 7.6 (7.3, 8.8) | 16.9, 15.2 (14.3, 17.2) |

- 10 of the 18 fall inside Cox and Munk's range. The rest are within 25% over it: a 20° moon on a calm night, and in a fair twilight; the calm twilight at 10°; the low moon on a calm night and a breezy one.
- The sources call the formula rough above about 20°.
- At night the path's core is clipped by the tone curve on a calm sea; the widths are read from the pixels around it.

**Seen:** at night the path runs from the horizon to the boat, broken by the waves. In the twilight it stands out against the sky's paler reflection, a column of glints. Shots in `tools/moon/sea.mjs`' output.

**Left over:**
- **Clouds:** the clouds aren't read on the CPU, so a cloud passing over the moon leaves its path on the sea. Only a grey sky veils it.
- **Glassy water** (a disc-wide streak) needs still water the game doesn't have: its calm is 2.5 m/s, inside Cox and Munk's range.

## Wakes in shallow water

**Before:**
- The wakes' far arms took no account of the depth. Their angle, their waves' length and their speed were the deep water's.
- They faded out as the water shoaled from 1.5 m to 0.2 m (`WAKE_SHOAL`). The physics keeps a crest as it is until it breaks.
- The foam patches were shed over shallows and sand alike.

**Now** (`WakeWaves.js`; its sources are [sources-sea.md](sources-sea.md)'s 1):
- **The depth under her as she makes them.** Each sample of her track keeps the depth under her then (`WakeWaves.depthAt`, given by `Waves`). Her waves go as that depth has them: ω² = g k tanh( k h ), at n of their speed (`waveNumber`, `groupShare`).
- **Her arms** (`wakeWave`):
  - Her hull makes waves running the way they run in deep water, so that way is held. Their length is the depth's, and her arm is where their energy goes, so it's a little wider in shallow water.
  - On the plane at 20 kn she's at 8.2° at sea, 9.1° over 2 m and 15.0° over 1 m, where her waves barely run. Her waves are 5.8 m and 10.4 m long there, the sources' figures.
  - Over the transcritical range her arms open toward the wedge's cusp waves. They start at a depth Froude number of 0.7, are fully open by 0.95, and are back by 1.16 (judgement).
  - The wedge itself is worked from the dispersion (`wakeWedge`). Against the sources' table, from Kelvin's 19.5° to 72° near critical and asin( 1 / Fh ) past it, it's 0.05° off at most.
  - Past critical, no wave goes faster than the shallow water lets.
- **Twice as high near critical:** ×2 from a depth Froude number of 0.9 to 1, back to ×1 by 0.84 and 1.16 (`SHALLOW.bump`, judgement, from Soomere's "considerably" and the Tallinn paper's highest at critical).
- **Breaking** (`wakeBreak`, and the sea's shader's the same):
  - Each crest stays as high as it is until it's near 0.78 of the depth, crest to trough, then it's held under that. It's 1.5% lower at half of it and 16% at it.
  - The sea's foam shows where it breaks.
  - The fade from 1.5 m is gone.
- **The foam patches** aren't shed where the water's shallower than she draws (her model's draft), and one carried onto the sand is gone.
- **The shader:** each sample's depth goes in a new uniform array, four to a vector (`wakeDepth`, 10 vectors on mid and high, 6 on low). The plan had the depth in the tracks' spare slots, but a track's samples each need their own. No texture was added.

**Measured** (`tools/wakes/bank.mjs`): the console coming off the plane at 8.2 kn along the start's bay, over its bank, with the beach 45 m off her port side; and the same speed 2 km out.

| | The depth under her | Fh | Her arms | Her waves | Her crest, crest to trough |
|---|---|---|---|---|---|
| The bay's bank | 2.2 m | 0.90 | 34.4° | 12.7 m | 0.49 m (×2) |
| Out at sea | 179 m | 0.10 | 19.3° | 6.9 m | 0.24 m |

Her port arm runs in onto the beach and breaks there: a long crest, white along its top, that isn't there without her wake (the shots' `-without` pairs).

**Left over:**
- **Each wave keeps the depth it was made in.** As it runs from deep water over a bank it doesn't slow or turn (refraction), and doesn't shoal. For her short waves the shoaling factor is 0.91 to 1.03 anyway. It does break by the depth where it is.
- **The kayak's** ripples are still left out of the waves, as M17 left them. On the flats near critical they'd fan out to 35 to 80°, but they're 2 to 5 cm high.

**Tests:** `test/wakes.mjs` gains:
- the wedge against the sources' table;
- the dispersion;
- deep water as before, to the bit;
- the console on the plane over 2 m and 1 m, and coming off it over 2 m;
- the breaking;
- the shader's sum in 32-bit floats against the CPU's over a 2 m bank.

## Checks

- **`tools/gpu-limits.mjs`, every tier** (`SHOW=Water`). The sea has no texture more than before.

  | Tier | Fragment textures | Vertex uniforms (of 1024) |
  |---|---|---|
  | high | 16 of 16 | 195 |
  | mid | 14 | 195 |
  | low | 13 | 142 |

  All within what a graphics card allows. On low the flats' under-water marks didn't come within the wait, as before; their surface's did.
- **`pnpm test`:** every test file, and the assets' lock. `test/sea-origin.mjs`' stand-in sea gained the moon's slopes.
- **The merge check** (`4f8cd1d`, a clean copy built, against v2.5.0 built the same way):
  - the same 16 programs before ready, by name and number;
  - All the Spaces' complete check 14 of 14;
  - low's script memory 126.2 MB (up to 150), run with nothing else on the machine;
  - the download 78.9 MB (up to 80).
- **The ready A/B**, since the sea's loading shader changed (the integer hash): phone upright on 4 cores, 4 rounds each, alternating. v2.5.0: 2.32, 2.23, 2.23, 2.23 s (median 2.23). SEA: 2.27, 2.23, 2.30, 2.20 s (median 2.25). The same within the rounds' spread.
- **Renders on every tier:**
  - **The moon's path** at 10° up, calm and fair, night and twilight. The widths on low and high are as mid's, within 6% of Cox and Munk's at the top of their range:

    | Tier | Calm night | Calm twilight | Fair night | Fair twilight |
    |---|---|---|---|---|
    | low | 4.3 | 3.9 | 6.4 | 6.6 |
    | mid | 4.1 | 5.0 | 6.3 | 6.1 |
    | high | 4.3 | 4.3 | 6.5 | 7.0 |
    | Cox and Munk's | 4.2 | 4.2 | 6.0 to 7.0 | 6.0 to 7.0 |

  - **High's bloom.** On high at night the path throws a wide haze of bloom about it. v2.5.0's path did the same, a little more (its peak 25.7 against 24.3 now, `MOON_OLD=1`); the new path's better defined inside it. It's left for the tone curve's trial in wave 2.
  - **The wake over the bay's bank** (`tools/wakes/bank.mjs`) on low, mid and high: her figures the same on each (34.3 to 34.4°, 12.7 m, 0.49 m). Her port arm breaks on the beach on all three.
