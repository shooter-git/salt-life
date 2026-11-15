# M20, stream FINISH: the tone curve's trial, the moon's path on high, the sounds measured in the game

Stream FINISH of [M20.md](../M20.md), built 2026-11-15 on `m20-finish` from `m20` (wave 1 merged, `f8721d4`). Its sources are step 0's: [sources-sea.md](sources-sea.md) for the tone curves, [docs/m17/sounds.md](../m17/sounds.md) for the mix.

## The tone curve's trial: ACES stays

**What was tried.** Each of three.js's tone curves, drawn over every look on every tier, at the exposure that matches ACES' mid-grey:
- **ACES Filmic**, as the game has it;
- **Neutral** (Khronos PBR Neutral) at ×1.4, step 0's figure (sources-sea.md: ×1.34 to 1.42 for greys of 0.05 to 0.3);
- **AgX** at ×0.99, worked out the same way.

`?tone=neutral|agx` draws the game under either (`App`'s `TONE`, on its own page only, not in All the Spaces). Things drawn without the curve (the flare, the glares, the transom glow) were left as they are, as was the catch card's `FishPortrait.EXPOSURE`, which takes the curve's exposure factor. `TONE=` on the look tools draws through it.

**What was drawn** (Chromium on SwiftShader, each tool from its own copy of the branch, three at once against one dev server):
- `tools/looks/look.mjs`: the paints in sun and shade (barn red, the console's navy, the sportfisher's navy, the lobster boat's white), the pool of the transom lights, the flare by night and by day;
- `tools/flats/look.mjs`: the flats from the air, wading, the beach;
- `tools/moon/look.mjs`: the full and crescent moon over the sky, the beach and the sea;
- `tools/gear/look.mjs`: the blue-water gun's float from the water, and aiming under it;
- `tools/moon/sea.mjs`: the moon's path in a calm, at night and in the twilight.

**The paints against the photographs** (the medians of each hull's topsides, sRGB; mid, high within a few levels):

| | ACES | Neutral ×1.4 | AgX | The photographs |
|---|---|---|---|---|
| Barn red, sun (console, sportfisher) | (36,2,3), (53,4,5) | (64,7,1), (81,13,2) | (60,5,4), (78,13,9) | *Bella*'s side (52,15,22), her flare (97,36,43) |
| Barn red, shade | (21,1,1), (20,2,2) | (49,4,1), (47,4,2) | (38,1,2), (36,2,2) | |
| The console's navy, sun / shade | (1,24,52) / (1,7,24) | (2,43,76) / (1,25,50) | (1,45,78) / (1,19,45) | the Donzi's (12,37,84), the Competition's (24,37,56) |
| The sportfisher's navy, sun | (1,8,20) | (1,21,40) | (1,22,43) | |
| The lobster boat's white, sun / shade | (154,151,144) / (87,88,89) | (154,150,142) / (89,90,92) | (143,141,137) / (100,101,102) | the Viking's (228,227,219) / (44,75,95) |

Neutral and AgX both bring the dark paints to the photographs, as M17 found Neutral would. ACES leaves them two to four times too dark.

**The rest of the scene** (medians of each region, sRGB, its luminance and its saturation; mid):

| | ACES | Neutral ×1.4 | AgX |
|---|---|---|---|
| The day's sky above the horizon | (96,137,183) L131 s0.47 | (91,137,194) L131 s0.53 | (108,138,169) L134 s0.36 |
| The open sea by day | (9,26,55) L24 s0.83 | (6,38,74) L34 s0.92 | (22,49,80) L45 s0.73 |
| The flats from the air | (22,89,84) L75 | (27,108,96) L90 | (54,114,108) L101 s0.55 |
| Sand on the beach | (175,161,135) s0.23 | (179,161,130) s0.28 | (159,148,131) s0.18 |
| Under the water (aiming) | (42,118,117) s0.65 | (41,120,118) s0.67 | (63,120,120) s0.48 |
| The night's sky (full moon) | (15,21,31) L21 | (10,26,44) L24 s0.78 | (29,39,52) L38 |
| The night's sea off the moon's path | (6,18,27) L16 | (3,32,47) L27 s0.94 | (13,35,48) L31 |
| The night's sea by the transom lights | (0,0,4) | (0,4,21) | (0,2,10) |

- **AgX greys the day:** the sea's saturation from 0.83 to 0.73 and lifted toward grey (L24 to 45), the sand's from 0.23 to 0.18, the flats and the sky paler. It's the fault the game turned it down for long ago, still there.
- **Neutral keeps the day's hues** and saturates them (the sea 0.92, the swash's turquoise a bright cyan on the beach). But by night:
  - it lifts the dark sea and sky to a saturated navy (the sea off the moon's path L16 to 27, saturation 0.94), where the night was set by photographs under ACES;
  - the transom lights' pool loses its white-hot heart: Neutral keeps it a saturated emerald to the edge of white, where the photographs (`compare.mjs`' *Marlin*, *seatech*, *dock*) have a white-green core in emerald;
  - on high, by day, its brighter highlights set off the bloom's ghosts in the sky above the flare.

**Decided: ACES stays.** Neutral is better on one look, the dark paints, and worse or untuned on the others: the night, the lights' pool, the swash. Switching would mean setting every look again beside its photographs under the new curve (the sea's colours, the night's exposure, the pool), a pass of its own. AgX is out. The dark paints stay as M17 left them: correct in the scene's light, darkened by ACES' toe. A switch to Neutral, with that pass, is the user's to call (gathered in M20.md's calls).

**High and low** draw the same differences, within a few levels of mid's. On low (no bloom, the simpler sea) the console's barn red in sun is (36,2,3) under ACES, (65,7,1) under Neutral and (60,5,4) under AgX; the open sea's saturation by day 0.90, 0.95 and 0.83; the beach's sand 0.23, 0.28 and 0.18. On high, Neutral's ghosts and the pool's emerald show most, the bloom spreading what it brightens.

## The moon's path on high: kept under the bloom

**What it was.** On high at night the moon's path threw a haze of bloom over the whole frame: the sea and the sky beside it four to five times as bright as on low and mid, and warm grey. v2.5.0's did the same (SEA's notes). The path itself is as bright as it should be: about 300 times the sea beside it, as the sun's glitter is by day.

**Why.** High's bloom (`PostChain`: three's UnrealBloomPass, strength 0.18, threshold 0.92) takes the scene's light before the frame's exposure. By night the exposure is several times the day's (the eye's adaptation, up to 6), so the night's scene light is small and the path's many times the threshold. All of it is spread by the bloom, and the exposure then lifts the spread light with the rest. By day the same glitter blooms against a bright sky and sea, where it doesn't show as a haze.

**The trial** (`tools/moon/sea.mjs` on high, the moon 10° up, a calm night, `MOON_CAP=`): the glint capped at a brightness as it's shown, after the exposure. "The sea beside it" is the light of the sea's outer fifths, the path's own haze; low and mid read 0.016.

| The glint at most | ACES draws it at | The sea beside it | The path's peak |
|---|---|---|---|
| no cap (as before) | 255 | 0.076 | 24.4, clipped |
| 4 as shown | 250 of 255 | 0.040 | 12.8 |
| 2 as shown | 242 | 0.016 | 3.3 |

A fixed cap as shown works only for one night's exposure. Cap 2 cleared the haze and cap 4 didn't, so that night's exposure was between 2.2 and 4.3.

**The cap** (`WaterSurface`'s `MOON_CAP`): on high the glint's kept under 0.95 of the bloom's threshold, its colour kept (`bloomThreshold`, which App gives the sea from its `PostChain`). That holds whatever the night's exposure. On low and mid, with no bloom, nothing's capped.

**On high now** (the same tool, the moon 10° up; the night's exposure 3.3, the twilight's 2.4):

| | Calm night | Fair night | Calm twilight | Fair twilight |
|---|---|---|---|---|
| The sea beside it, before | 0.076 | 0.043 | 0.021 | 0.018 |
| The sea beside it, now (low and mid: 0.016, 0.015 by night) | 0.016 | 0.016 | 0.020 | 0.019 |
| The path's peak, now | 4.75 (ACES' 246 of 255) | 4.5 | 0.41 | 0.16 |

- **The haze is gone,** and the night's its dark blue as on mid. In the twilight the path's under the cap anyway, so nothing changed there.
- **The path's drawn as wide as mid's.** Across the mirror point, the columns over 128, 200 and 240 of 255 span 8.2°, 7.3° and 4.7° on high now, 8.6°, 6.2° and 4.4° on mid, and 26.7°, 13.2° and 7.3° on high before.
- **The tool's own width reads wider** (6.6° calm, 7.6° fair) because it's read at half the path's peak, and the cap flattens the peak, so half of it falls further out. The light at the path's edges hasn't changed.

## The sounds, measured in the game

**How** (`tools/audio/levels.mjs`): the real game in headless Chromium, its audio running, on the west flat in a foot of water by day in a calm. Each sound is played as the game plays it at its reference place in `MIX` (its own slices and jitter, its panning, the tier's HRTF or equal-power), everything else muted. Its loudness is read off the game's output after its limiter: BS.1770's K-weighting, 400 ms windows every 100 ms, both channels; a one-shot's loudest moment, a bed's steady level.
- **The meter checked:** a 997 Hz tone at −20 dBFS on both channels reads −18.71. The limiter adds 1.29 dB to everything (a DynamicsCompressor's makeup gain), so a sound on its level reads 1.29 over. The figures below have it taken off.
- **What's measured:** a bonefish's tail 10 m off, a school of 12 bolting 15 m off, the anchor going in (`Game.plunk`'s splash at 0.75), Pearl's outboard 12 m off idling and flat out, the kayak's push at her seat at hull speed, and another player's kayak at hull speed 2 m and 9 m off.
- `ONLY=push,Pearl` runs just those. Under a loaded machine a recording can take many seconds to fetch and decode, and an early window read silence (the first runs' silent push on mid and high). Each measure waits for its recording to be playing now.

**Before and after** (dB off its `MIX` level, the limiter's 1.29 taken off):

| | Before, low | Before, mid | After, low | After, mid | After, high |
|---|---|---|---|---|---|
| A bonefish's tail, 10 m (−33) | −3.5 | −4.1 | −1.1 | −0.5 | −1.7 |
| A school bolting, 15 m (−26) | −3.5 | −3.1 | −0.2 | +0.3 | −0.2 |
| The anchor going in (−32) | +0.3 | +0.4 | +0.5 | +0.5 | +0.3 |
| Pearl idling, 12 m (−36) | +0.9 | +4.2 | +1.0 | −0.2 | +0.2 |
| Pearl flat out, 12 m (−30) | +0.8 | +4.7 | +1.2 | +0.7 | +0.2 |
| The kayak's push at her seat (−40) | −4.8 | not read | −0.2 | 0.0 | 0.0 |
| Another's kayak, 2 m (−40) | silent | silent | −0.1 | +0.7 | +0.7 |
| Another's kayak, 9 m (−46) | silent | silent | +0.1 | +0.4 | +0.5 |

The tail's spread is its own: each slap is jittered ±2 dB and its slices differ (−34.9 to −30.7 on mid).

**What was wrong, and what's changed:**
1. **The tail and the bolt were 3 to 4 dB quiet.** A mono recording played straight into the stereo mix sounds in both ears at once, 3 dB louder than its file, so the mix takes 3 dB off every mono sound (`MONO`). Through a panner that's wrong: the panner splits it between the ears and keeps its loudness. M17's flats sounds are played whole now (`_shot`'s and `_shotAt`'s `whole`). The older panned sounds (the birds, the surf's waves, the whale's blows) still take the 3 dB, as they were set; see the call below.
2. **The kayak's push at her seat was 4.8 dB quiet on low.** It went through her panner, from a point under you, and took the 3 dB too. Sat in her (within 1.5 m of her middle, `IN_BOAT`), her water's heard round you as her engine is at a boat's helm, unpanned.
   The first runs also read her push silent on mid and high. That was the meter starting before her recording had loaded, not her panner: measured again once it's playing, it's on its level there.
3. **Pearl was 4 to 5 dB over on mid and high, on her level on low.** Chromium's HRTF panner isn't loudness-matched to equal-power panning. It adds most to a low, even sound: 4.4 dB to her outboard, averaged round you (`tools/audio/hrtf.mjs`, which renders each recording through both in an OfflineAudioContext). Her level's back to M17's −36, and on mid and high her HRTF's gain is taken off (`PASSING.hrtf`). (A first try took 2 dB off her everywhere, which left low 2 dB quiet. It's undone.)
4. **Another player's kayak was never heard** (M19's `kayak_push_theirs`). The frame's state sent her (`theirKayak`, `Together.kayakHeard`) and the mix never read it into its own (`_readState`), so her push sat at nothing. It reads her now. And she's heard where she is, from a panner of her own (`theirPan`), where M19 put her through your own boat's sound, which, out of your boat, is placed at your boat. `kayakHeard` sends her place.

**Chromium's HRTF, recording by recording** (`tools/audio/hrtf.mjs`: what HRTF adds over equal-power, averaged round you, level with your ears; a few recordings timed out on the busy machine and weren't read):
- **Mono, low and even:** +4 to +5 dB. A hull's bump +5.2, the starter +4.9, the boat's horn +4.7, the distant surf +4.6, a boat's lapping +4.5, footsteps on wood and rock +4.5, Pearl's outboard +4.4, the whale's song +4.1, a wave's crash +3.8.
- **Mono, middling:** 0 to +3 dB. A splash +3.0, a big splash +2.6, the whale's blow +2.0, the boat's rush +2.0, footsteps on sand +1.9, a tail's slap +0.9, the kayak's push +0.8, a gull 0.
- **Mono, high and sharp:** below 0. A tern −0.9, the reel's wind −2.4, its drag −3.7, coins −4.1.
- **Stereo:** −1 to −5.5 dB, most from behind you. The wind −0.8, the crickets −3.1, the palms −3.2, the dawn's birds −3.5, the reef under water −5.5.

## Not changed, for the user

- **The tone curve: Neutral with its pass.** It brings the dark paints to the photographs; everything else would need setting again under it, by photographs, and the ready A/B. Not done here.
- **The older panned sounds, on every tier.** Two things move their levels away from `MIX`, in opposite ways:
  - the mono trim taken twice through a panner (3 dB quiet on every tier);
  - Chromium's HRTF gain on mid and high (up to 5 dB loud for low, even recordings; stereo ones 1 to 5 dB quieter).
  
  On mid and high they partly cancel. On low the panned mono sounds are 3 dB under their levels. Setting every panned sound right on every tier (the whole trim, and each recording's HRTF figure off on mid and high) changes the whole soundscape's balance, so it's the user's to call.

## Tests and checks

- `test/flats-sounds.mjs`: Pearl's level on low and through the HRTF; another player's kayak heard at her level and from where she is, 6 dB under at 9 m, nothing when none's sent.
- `test/sea-origin.mjs`: its stand-in sea gained the moon's cap.

## Checks

- **`pnpm test`:** every test file, and the assets' lock.
- **`tools/gpu-limits.mjs`, every tier** (`SHOW=Water`): the sea has one uniform more and no texture more.

  | Tier | Fragment textures | Fragment uniforms (of 1024) | Vertex uniforms |
  |---|---|---|---|
  | high | 16 of 16 | 228 | 195 |
  | mid | 14 | 212 | 195 |
  | low | 13 | 190 | 142 |

  All within what a graphics card allows.
- **The merge check** (`405ca77`, a clean copy built, against v2.5.0 built the same way):
  - the same 16 programs before ready, by name and number;
  - All the Spaces' complete check 14 of 14;
  - low's script memory 126.9 MB (up to 150), run with nothing else on the machine;
  - the download 79.0 MB (up to 80; 78.9 at SEA and KIT).
- **The ready A/B**, since the sea's loading program gained the cap's uniform: phone upright on 4 cores, 4 rounds each, alternating. v2.5.0: 2.29, 2.23, 2.29, 2.27 s (median 2.28). FINISH: 2.21, 2.24, 2.22, 2.21 s (median 2.22). No slower.
- **The trial's renders** were drawn from copies of the branch at `62b6ac1`, before the moon's cap, so high's night in them still has its haze under every curve.

**The commands** (from the repository, a dev server on 5241 for the game's tools):

```sh
# the sounds in the game, every tier (ALL_THE_SPACES for Playwright, Node 24)
for t in low mid high; do node tools/audio/levels.mjs qa-output/audio/levels-$t.json $t; done
ONLY=another node tools/audio/levels.mjs qa-output/audio/theirs-mid.json mid   # one measure alone
node tools/audio/hrtf.mjs qa-output/audio/hrtf.json                             # HRTF over equal-power, each recording
# the moon's path, and a cap tried (MOON_CAP=1e9 for none)
node tools/moon/sea.mjs qa-output/moon-sea high 10 calm,fair night,twilight
MOON_CAP=1e9 node tools/moon/sea.mjs qa-output/moon-sea-before high 10 calm night
# the tone curves (the game's ?tone=, TONE= on the look tools; a dev server for each curve's copy, LOOK_PORT etc. on it)
TONE=neutral node tools/looks/look.mjs qa-output/looks-neutral mid paint,lobster,pool,flare
TONE=agx node tools/flats/look.mjs mid 0.6 aerial,wading,beach
```
