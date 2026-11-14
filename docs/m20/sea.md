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
