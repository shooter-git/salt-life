# M17, step 4: the looks

What step 0 found in play and left for the second wave ([before.md](before.md), "Seen once in play, run again" and item 8 of "What step 0 changes"), fixed, and the sportfisher's underwater lights' pool set after photographs ([M17.md](../M17.md), Looks and sounds). Built 2026-11-09 on branch `claude/m17-looks-e08ceb`, cut from `m17-flats` at 53ffb1c.

Everything here was drawn on the CPU (Chromium on SwiftShader), set beside photographs, and measured from its pixels. **No real GPU or phone has seen it**: the user runs nothing on their own devices.

How it's checked:
- `tools/looks/look.mjs <out> [tier] [groups]` draws every look in the real game, staged: the flare, the paint, the lobster boat, the pool, the berths.
- `tools/looks/card.mjs <out> [screens]` raises a catch card the moment the game starts and counts what's drawn in its scene, then puts a toast over it.
- `tools/looks/compare.mjs <before> <after> <out>` sets them side by side with the photographs, hot-linked, not kept (this branch's are in `qa-output/looks/compare/`, not committed).
- `test/days-out-clock.mjs` has the helm's guard.

A frame works the flare out (its size, how bright) and the lamps' places against the player's own camera, ashore by the dock, before the tool stages its own; `look.mjs` works both out again for its camera before each shot.

The before set was drawn from a clean copy of 53ffb1c on a server of its own, the after set from this branch, with the same tool and cameras.

## In short

| Look | Before (53ffb1c) | Now |
|---|---|---|
| Barn red on the console and the sportfisher | 0.85% albedo, near black in sun or shade | 6%, red in sun and plainly red in shade, darker than the photographs (the tone curve: below) |
| The console's own navy | near black | navy blue |
| A boat's side out of the sun | a tenth of its sunlit brightness, dark slate | about a quarter, light grey (between the Viking's tenth and *Bella*'s two fifths) |
| The flare at night | an orange dot 6 px across at 100 m, a pale speck at 300 m, nothing at 2 km or 8 km | a saturated red point at every range, the brightest thing in view; a red path on the water under it |
| The flare by day | an orange speck 2 × 3 px at 300 m, nothing past 1.5 km | a red point 4 × 4 px at 300 m, faint at 1.5 km |
| The underwater lights | a uniform pale turquoise disc | a hot core at her transom lights, an emerald glow going off over 15 to 20 m, her transom's foot lit |
| The catch card in its first seconds | the stand-ins drawn in it (caught once on low) | none |
| A toast over the card | over its name at 844 × 390 and 390 × 844 | waits till the card goes, where it would cover the name |
| The helm's guard at deep night | 1% to spare, −0.37 s of the wall at worst | 1.65 s of the wall at worst |
| Every boat's lower parts | the page's navy behind the canvas showing through, about half at her waterline | the canvas's alpha 1 on every tier: the boats' height left in it only on high, where the sea reads it, and set back in the post chain's last pass |

## The paint, to linear once

three's `Color( hex )` and `setHex( hex )` take a hex as sRGB and turn it to linear themselves (its colour management is on). The boats' materials then ran `convertSRGBToLinear()` again:
- `BoatMaterials`' and `SportfisherMaterials`' `linear()`: every colour written into their shaders (the lobster boat's antifouling and boot top, the sportfisher's boot stripe, antifouling and teak);
- `ConsoleMaterials`: her antifouling, her own navy and `setPaint`.

So every dark colour on a boat was far too dark. Barn red (`0x7c2a22`) was 0.85% albedo where it's 6%, and the console's own navy (`0x234a75`) came out near black. The white topsides' own paint was right on the lobster boat (`new Color( hex )`, once), wrong on the sportfisher.

Now each goes to linear once. `MooredLooks.paintColor` copied the double conversion on purpose (`TWICE`), so the boats at their berths matched; it goes once too, with `tools/moored-bake.mjs`' own colours. The bake was run again: console 107,324 bytes (was 107,264), lobster boat 109,100 (107,272), sportfisher 137,732 (136,816), the kayak the same. That's 2.8 KB more in the download.

The console's stand-in at her berth (`MooredModels`, drawn until her baked look comes, and far off) had white topsides where she comes navy. It's her navy now.

## Every boat's shade

**What it was.** The world's fill is kept low for the sand (Sky's levels: the environment 0.09, the hemisphere 0.25, against the sun's 3.2).
- A boat's side out of the sun was a tenth of its sunlit brightness: the lobster boat's white topsides read sRGB (24,45,61) in shade against (119,131,134) in sun at 10:30.
- The sportfisher had a fill of her own (`OUTSIDE_FILL`: 0.3 of her colour as light of its own), which a dark paint can't take: 0.3 of nearly nothing.
- The console had her white decks' bounce (`GroundBounce`, 0.44, for under her T-top and behind her console).
- The lobster boat had none. The boats at their berths had the environment 8 times over.

**The photographs** (sampled from their pixels; `tools/looks/compare.mjs` sets them beside the renders):
- A 2008 Viking 48 in Fort Lauderdale's morning sun (Off the Hook Yachts' listing): her sunlit topsides (228,227,219), her transom in shade (44,75,95), blue with the sky's light. In shade it's 0.09 of sunlit (linear luminance, as the camera has it).
- *Bella*, Tern Boatworks' 38 ft Downeast in barn red, under way: her house's side in shade (141,157,168) against her deck box in sun (232,226,214), 0.43; her red topsides (52,15,22) along her side and (97,36,43) where her flare turns to the light.
- Navy hulls in sun: a Donzi 38 ZSF (12,37,84), a Competition console (24,37,56).

So white in shade is anything from a tenth to two fifths of sunlit, by how much sky and bright water it sees and how the camera took it. A physical estimate for a vertical side at sea under a clear sky is 0.15 to 0.2.

**Now** (`BoatMaterials`' `SHADE` and `useShadeFill`; `Vessel.shadeFill`, from `loadBoat`, after each boat's own material changes):
- Her outside (hull, decks, wood, fittings; not her glass or the sportfisher's cabin) takes what a person's does (`GroundBounce`): the sky's light as much again (the world's is about half a real sky's, for the sand), and the light thrown up from under her.
- The bounce is the sunlit sea's glitter and her own sunlit decks and house, about neutral at 0.3 (`SHADE.bounce`; the sea's own albedo is about 0.07 and bluish). The console keeps her white decks' 0.44 (0.35 as she has it, `open` 0.8), near that.
- Diffuse only, so a dark paint stays its colour. And the sky in her gloss: the scene's environment twice over (`SHADE.env`), held by the material itself.
- The sportfisher's `OUTSIDE_FILL` went into it. The boats at their berths take the same (`MooredBoats`: the bounce, and the environment `SHADE.env` times over, where it was 8), so a boat matches herself at sea.

How the figures were chosen: swept live in the real game (`SHADE` hangs on each material's `userData`) at 8:30 and 10:30, the environment at 1, 2, 3 and 8 times, the bounce at 0 to 0.3, against the photographs:
These sweeps were first run with the page's navy over every boat's lower parts (found later: [Barn red in shade: the page showing through](#barn-red-in-shade-the-page-showing-through)). They were run again without it, and the figures here are those:
- **The environment past 2 turns a white side in shade blue and does little for a dark one.** At 8 times the lobster boat's white in shade went from (72,84,93) to (98,116,136), sky-blue; the sportfisher's barn red in shade from (17,2,2) to (21,3,3), the console's navy in shade from (1,7,24) to (1,10,37). Real glossy hulls show the sky in them, but not as a cast over a white side's own colour. With the page's navy over them, 8 times had read a purple-grey (31,25,34) on barn red; the boats at their berths had that.
- **The bounce, not the sky, warms the shade.** The game's sky light is a saturated blue, and red reflects next to none of it. The sportfisher's barn red in shade read (8,1,1) at a bounce of 0.09, (11,1,1) at 0.16 and (17,2,2) at 0.3: below 0.3 it's near black. The console keeps her decks' 0.35.
  - So 0.3 for every boat: what keeps barn red red in shade, as the user asked of it ("dark, but plainly red"). White in shade is then 0.23 of sunlit, inside the photographs' tenth to two fifths.
  - With the page's navy over them, the red had seemed to take a quarter to a third of the bounce the lobster boat's white did, for its albedo. It takes its albedo's share: the navy laid over it was most of what showed.

**What it read at 6a0281d** (`tools/looks/look.mjs`, 10:30, her side to the sun or away from it, 13 to 22 m off and from 6 m; sRGB medians of her topsides). Both columns have the page's navy over every boat's lower parts; what they read without it is in [the next section](#barn-red-in-shade-the-page-showing-through):

| | Before (53ffb1c) | 6a0281d | The photographs |
|---|---|---|---|
| The lobster boat's white topsides, sun | (155,165,165) | (152,163,165) | the Viking's (228,227,219) |
| Her topsides in shade | (24,45,62), 0.07 of sunlit | (93,108,118), about 0.39 of sunlit | the Viking's (44,75,95), 0.09; *Bella*'s house (141,157,168), 0.43 |
| Barn red, sun (console, sportfisher) | (9,23,33), (16,25,35) | (61,25,35), (58,26,36) | *Bella*'s side (52,15,22), her flare (97,36,43) |
| Barn red, shade, 13 to 22 m | (8,24,33), (10,25,35) | (26,21,30), (26,24,34) | |
| Barn red, shade, 6 m | (7,21,31), (8,20,29) | (26,22,31), (24,21,29) | |
| The console's own navy, sun | (7,23,38) | (7,45,83) | the Donzi's (12,37,84), the Competition's (24,37,56) |
| Her navy in shade, 6 m | (5,21,31) | (6,29,56) | |

- **Barn red in sun read barn red**, and the console's navy navy. Beside *Bella* it's darker than most of her side: her sampled patch (52,15,22) is one of her darker ones.
- **White in shade** went from the Viking's end of the photographs (a tenth) to *Bella*'s (two fifths), with a blue cast that was the page's navy.
- **Barn red in shade read maroon-grey here**, (26,21,30), from 6 m as from 20. The cause wasn't the light on it: it was the page behind the canvas showing through every boat's lower parts. It's found and fixed in [Barn red in shade: the page showing through](#barn-red-in-shade-the-page-showing-through), below, with what these figures read after it.

**At their berths** (the console and the sportfisher moored, seen from the water west and east of the pier at 10:30 and 15:30; you in the kayak). Before, both were near black in barn red or navy: their baked looks carried the double conversion on purpose. Now:
- barn red reads red in the sun and dark red in shade;
- the console's navy reads navy blue, the sportfisher's navy dark navy;
- each as the same boat does out at sea, the moored boats' material taking the same bounce and environment as the boats' own.

**The air's haze.** Before the page's navy was found, the marine haze (`HeightHaze`) was suspected for the grey over a far shade side. With the navy gone, barn red in shade reads the same from 6 m as from 22 m, within a level: at that range the haze barely shows, as it should (an extinction of 2.4 × 10⁻⁴ a metre near the sea is about 20 km's visibility).

## Barn red in shade: the page showing through

**What it was.** After the paint and the fill, barn red in shade still read a dark maroon-grey: (26,21,30) on the console, (26,24,34) on the sportfisher, from 6 m as from 20. It looked as if their topsides took a third of the light the lobster boat's did.

**How it was found.** Each lighting term of the three hulls was written to the frame in turn, at the same pixel of a side in shade, same sun and camera. A copy of `look.mjs` swapped each boat material's output for one term, its tone mapping and fog off: the direct and indirect diffuse and specular, the albedo, the emissive, metalness and roughness, the normal, the irradiance and the environment's.
- **The lighting is right.** The red's indirect diffuse is (0.0445, 0.0113, 0.0132) on the sportfisher and (0.0478, 0.0113, 0.0128) on the console. The lobster boat's white beside it is (0.194, 0.226, 0.248). In the red channel that's 0.23 of the white's, the paint's own albedo ratio (0.227).
  - Metalness is 0, roughness 0.23 to 0.29, the normals face out.
  - The albedo after `color_fragment` is the paint.
  - The bounce and the environment are the same on all three.
  - Inverting three's ACES curve on the final pixels gives the same: the red's red channel 0.23 of the white's.
- **Something was added after the shader.** Every term that should have been zero read sRGB (6,22,32), with the material's own fog and tone mapping off. Something outside the material put a dark navy over every boat pixel.
- **The page behind the canvas.**
  - `materials/SeenInWater.js` has every boat material write its height into the frame's alpha, for the sea to read on high: `( y + 4 ) / 10`, so about 0.45 at her waterline. Its note said "the frame's opaque, the canvas has none".
  - But the stage makes the WebGL context with `alpha: true, premultipliedAlpha: true`, and the page behind the canvas is `#0b2a3c` (`style.css`), rgb(11, 42, 60).
  - So the browser laid the page's navy over every boat's lower parts by one less her alpha: about 55% of (11,42,60) at her waterline, which is (6,23,33), the floor exactly. It's the same at any distance, because it's height, not air.
  - On a white hull it's a blue cast. On barn red in shade, whose own light is about (20,1,1), the navy was most of what showed.
  - Every boat and every tier had it, the boats at their berths too. It's been so since M16's `SeenInWater`.

**The fix, first** (dbd23fb, `App.opaqueFrame`): an alpha-only clear of the whole canvas after each frame. It worked, but it was a draw of its own over every pixel, and the CPU pays for it in full. The M17 session measured it against 53ffb1c: ready a median 0.08 s later paired by round (11 of 16 rounds behind), and one-core whole plays about 3% slower in both pairs (309.2 against 300.5 s, 290.7 against 280.9). 6a0281d, before it, wasn't slower. The context's alpha isn't the game's to turn off: the stage (All the Spaces) makes it.

**The fix, now** (79f0049): no draw of its own. The height is written only where something reads it, and set back to 1 in a pass that's drawn anyway:
- **Low and mid:** only the sea reads the frame's alpha, and only on high (`WATER_REFRACT`; `WaterSurface.refract` is `tier === 'high'`). The catch card's copy of the frame reads its colour alone. So on low and mid a boat's materials write no height (`SEEN.written`, which the sea sets as it's built, before any boat is). The alpha stays 1.
- **High:** every frame goes through the post chain (the scene, the sun's shafts, the bloom, the output pass, SMAA). The sea's copy of the frame is taken in the scene's pass, so it still has the boats' heights. The output pass now writes alpha 1 (`PostChain`: one line in its fragment shader), and SMAA after it carries the 1 to the canvas.
- The catch card draws straight to the canvas, not through the chain: its backdrop writes alpha 1, and its fish over it keeps 1 (below).
- `App.opaqueFrame` is gone.
- Every boat material goes through `seenInWater`: `BoatMaterials`' `withAux` (the lobster boat's, the console's and the sportfisher's) and `KayakModel`'s hull. The moored boats' material never wrote a height. The other materials that write alpha below 1 are blended, and every blend in the game leaves an alpha of 1 at 1 (spray, rain, drips and motes add theirs over what's there, the contact shadows the same, the hatchlings' tracks keep what's there).

**Seen on all three tiers** (`tools/looks/look.mjs` now reads the canvas's alpha straight after the game's own draw, and counts the programs writing a height):
- Low, mid and high: 0 of 360,000 pixels under 1, in every shot (paint and the lobster boat). Programs writing a height: none on low or mid; on high 6 with the console or the sportfisher in view and 4 with the lobster boat, so the sea still has them.
- A control on mid, the heights switched back on in the page with nothing to set the alpha back: 45,156 pixels under 1, and the lobster boat's white in sun read (125,138,146), blue-grey, where it reads (169,165,160). So the count sees a veil when there is one.
- The catch card on high (a probe of its own, not kept: a yellowtail's card raised at the start, the canvas read after each of its frames): its first frame, the world's, and 46 of its own with the fish in, all 1.
- The probe pixels on every tier read as with `opaqueFrame` on mid, within a level or two:

| | Low | Mid | High |
|---|---|---|---|
| Barn red, shade (sportfisher, console) | (20,2,2), (21,1,1) | (20,2,2), (21,1,1) | (21,3,3), (22,2,2) |
| Barn red, shade, 6 m | (19,1,1), (21,1,1) | (19,1,1), (21,1,1) | (19,1,1), (21,1,1) |
| The console's own navy, sun / shade | (1,23,51) / (1,7,24) | (1,23,51) / (1,7,24) | (1,23,51) / (0,8,25) |
| The lobster boat's white, shade | (81,84,90) | (81,85,91) | (81,85,91) |

High's bloom adds a level here and there.

**What it reads now** (`tools/looks/look.mjs` as above, 10:30, the bounce 0.3 and the environment twice over as before; sRGB medians of her topsides; `qa-output/looks/compare-veil/` has them beside the photographs):

| | With the veil (6a0281d) | Now (dbd23fb and 79f0049, mid) | The photographs |
|---|---|---|---|
| The lobster boat's white topsides, sun | (152,163,165) | (168,165,159) | the Viking's (228,227,219) |
| Her topsides in shade | (93,108,118) | (81,85,91), 0.23 of sunlit | the Viking's (44,75,95), 0.09; *Bella*'s house (141,157,168), 0.43 |
| Barn red, sun (sportfisher, console) | (58,26,36), (61,25,35) | (53,4,5), (31,2,2) | *Bella*'s side (52,15,22), her flare (97,36,43) |
| Barn red, shade, 13 to 22 m | (26,24,34), (26,21,30) | (20,2,2), (21,1,1) | |
| Barn red, shade, 6 m | (24,21,29), (26,22,31) | (19,1,1), (20,1,1) | |
| The console's own navy, sun / shade | (7,45,83) / (7,29,56) | (1,23,52) / (1,7,24) | the Donzi's (12,37,84), the Competition's (24,37,56) |
| The sportfisher's navy, sun / shade | (6,25,43) / (6,22,34) | (1,5,14) / (1,2,5) | |

- **Barn red is plainly red in shade now**, and in the sun, at any distance. White in shade lost its blue cast: that was the page's navy too.
- **The lighting on the paint was right all along.** In the scene's own light, before the tone curve, barn red in shade is 0.23 of the lobster boat's white in its red channel, its albedo ratio, and 0.084 of it in luminance.
- **The bounce stays at 0.3.** With the veil gone, white in shade is 0.23 of sunlit, inside the photographs' tenth to two fifths. Swept again at 0.09, 0.16 and 0.3: lower leaves barn red in shade near black. The environment swept at 2, 4, 6 and 8 times moves a dark paint by a few levels at most (the sportfisher's red in shade (17,2,2) to (21,3,3)): the sky in the gloss isn't what the photographs' dark hulls have more of.

## Dark paints and the tone curve: the user's call

What's left between the renders and the photographs is the tone curve, not the light on the paint. Barn red and navy now read darker than the photographs:
- barn red in shade is 0.021 of white in shade on the screen (luminance), where *Bella*'s is about 0.035 and the scene's own light 0.084;
- the console's navy in sun is (1,23,52), the photographs' (12,37,84) and (24,37,56).

The cause is three's ACES Filmic, the curve the whole game is drawn through (`App`: `ACESFilmicToneMapping`). Its toe takes dark values down about three times against mid-tones, and its matrices take a dark saturated colour's lesser channels to nothing. White barely moves.

Worked from the probe's own scene light (`outgoingLight`, before the curve) at the day's exposure, through each curve, the options (sRGB; the renders' medians above sit a few levels off these, at other pixels):

| | Barn red, shade | Barn red, sun | Navy, sun | Navy, shade | White, shade ÷ sun (at the probe's pixels) |
|---|---|---|---|---|---|
| **A. ACES Filmic, as now** | (22,3,5), 0.021 of white | (56,11,12) | (0,23,51) | (0,7,23) | 0.33 |
| **B. Neutral (Khronos PBR Neutral, three's `NeutralToneMapping`)**, exposure ×1.38 so white in sun is the same | (44,1,6), 0.046 of white | (78,8,5) | (1,41,74) | (0,21,47) | 0.34 |
| *The photographs* | *Bella* (52,15,22), about 0.035 | *Bella*'s flare (97,36,43) | (12,37,84), (24,37,56) | | 0.09 to 0.43 |

- **A** keeps every other look as it was tuned: the sky, the sea, the sand, the night, the moon, the flare and the pool were all set beside photographs under ACES.
- **B** is the more realistic for dark paint, by the photographs. But it changes the whole game's look: its highlights roll off from 0.76, and it keeps colours more saturated. Every look would want checking again beside its photographs, a pass of its own (and the ready A/B: the curve is in every program).
- A boats-only lift of dark paints would make a dark boat differ from a dark rock in the same light. Not offered.

This branch stays on A. B is for the user to choose, as its own piece of work.

## The flare

**What it was** (step 0, and the before set here):
- A sprite of a canvas gradient with no colour space, so its sRGB was read as linear: pale.
- Tone-mapped with the scene. By night an orange dot about 6 px across at 100 m, a pale speck at 300 m, nothing to be seen at 2 km or 8 km; by day a faint orange speck at 300 m, nothing past 1.5 km.
- Sized `( 4 + 0.004 d )` m, so 2 to 4 px past a kilometre.
- No light of its own.
- (The look tool's first before set had it bigger than this. The frame works the flare's size out against the player's own camera, ashore by the dock, before the tool stages its own. `look.mjs` works it out again for the staged camera now, and the lamps with it, and both sets were drawn again.)

**What a real one is.**
- A 12-gauge red meteor rises to about 140 m and burns about 7 s at about 16,000 cd (Orion's figures). A SOLAS parachute rocket is 30,000 cd for 40 s. The game's is 120 m and 8 s, as it was.
- Seen by Allard's law: E = I T^d / d², where the eye's least at night is 2 × 10⁻⁷ lux (COLREGS Annex I). With I = 16,000 cd that's 25 km through air letting 82% through a km: the game's `FLARE_M.night`, which [sources-figures.md](sources-figures.md) found stands (11 to 15 nm).
- By day the Coast Guard's 2019 trials saw one at 2.5 to 3.5 km. The game's 5 km by day is for the figures' pass to correct, and the look follows whatever `FLARE_M.day` says.
- Photographed at night (the International Fleet Review's flares over the destroyers off Visakhapatnam, 2016, Commons; the ships about 1.5 km off, the frame about 10.5° across): a pink-white core about 1.1 mrad across in a red glare about 3 mrad, a thin trail of smoke.
- Under one at night the sea's lit red, and a red path of glints runs to it. By day it's a small red point against the sky.

**What it is now** (`DaysOut._launch`, `_updateFlare`, `_flareBright`, `FLARE_SEEN`):
- Its texture in sRGB, as every canvas texture is. A hot pink-white heart, a saturated red core half of it across (a solid point of 4 px by day and 6 by night at its least size), a red glare fading out.
- Drawn as it is (`toneMapped: false`): the brightest thing in view, never brought down with the scene's exposure.
- **How bright, by distance:** Allard's law, the air's transmission worked out so that the flare's at the eye's least where `FLARE_M` has it seen (that's the weather's visibility too). Drawn by the log of its light between its brightest and that reach: full within 2 km by night and 250 m by day, half at 10 km by night, gone at 25 km; by day 0.35 at 2 km, gone at the day's reach. The game's "seen or not" (`fire`) and the look agree.
- **How big:** its glare by night grows as the cube root of its light up close (3 mrad at 1.5 km, after the photograph, about 1° at 100 m), none by day; and never under 12 CSS px across by night, 8 by day, measured in the screen's pixels (a CPU draws its canvas small and stretches it).
- **Its light on the water and what's about it:** a local light (`LocalLights`) of its red, from the top of its climb, lit in a breath and guttering. Its strength is the full moon's way: the night's drawn by the cube root of its light, the full moon high (0.244 lux) at the key light's 0.25, and the flare's 1.1 lux on the water under it drawn so (4,000 at 1 m, to 500 m). The sea takes it as it takes the lamps: on mid and high its glints, a red path on the water; on low its light in the water.
- No smoke trail, no handheld flare: not asked for here.

**Beside the before** (`tools/looks/look.mjs`, its flare held at the top of its climb, west of a boat at sea at 22:30 and at 11:00; pixels counted where red stands 40 over the mean of green and blue). On mid, 1280 × 720:

| | Before | Now |
|---|---|---|
| Night, 100 m | an orange dot 6 × 7 px, (216,183,154) at its brightest | a red point 10 × 11 px, (205,50,37); the sea under it tinged red |
| Night, 300 m | a pale speck, nothing red | a red point, and a path of red glints down the water to it |
| Night, 2 km | nothing | a red point 10 × 9 px |
| Night, 8 km | nothing | a red point 8 × 7 px, dimmer |
| Day, 300 m | an orange speck 2 × 3 px, (181,106,93) | a red point 4 × 4 px, (194,78,82) |
| Day, 1.5 km | nothing | faint, at the eye's edge |
| Day, 3 km | nothing | nothing |

On low (its canvas drawn at 0.625 and stretched): by night a red point 10 × 11 px at 100 m, 10 × 10 at 300 m, 10 × 9 at 2 km and 8 × 7 at 8 km, where the before had a 6 × 7 dot at 100 m and nothing past it; by day a red point 4 × 4 px at 300 m, faint at 1.5 km, as on mid.

Beside the Fleet Review's photograph (a red glare about 3 mrad across at about 1.5 km): on a phone's screen at 70° a point under 12 px is under the eye's glare anyway, so the least size is what shows past a few hundred metres, as the boats' navigation lights' 4.5 px is. The core comes pink-white over red where it's brightest, as the photograph's does.

## The underwater lights' pool

**The photographs.** None of the three linked in step 0 is green, but each shows the shape:
- *Marlin*'s hero photo (Chris Rabil), from a sportfisher's bridge looking aft: white-blue, the water at her transom near white, a wide glow out past the frame.
- Panbo's *Sandpiper* at Camden's landing at dusk: five lamps on her transom, each a hot point, the water and her transom's foot lit.
- *Salt Water Sportsman*'s console (Poveromo's piece): clear water lit all round her.

Found besides, green:
- seatechmarineproducts.com's (via thesuggested.com), a console at night from her side: a hot core at her stern, emerald going off a boat's length.
- A Hull Truth thread's photograph of green transom lights at a dock, from aboard: the transom's foot lit bright green.
- A dock light from above (underwatergreenfishinglights.com): a white-green heart, emerald about it.

What they share: a hot core at each lamp, white where a camera saturates; the water about it a saturated green; the brightest a few metres off and going off over 10 to 20 m in clear water; the transom's foot and the topsides near the stern lit from under.

**What it was:** a flat disc 13 m across centred 2 m aft of her transom, tone-mapped with the night's exposure.
- From her deck the whole view was a pale turquoise wash.
- From her bridge, a uniform disc.
- From off her side, a thin line.

**What it is now** (`SportfisherModel._makeGlow`, `POOL`; her paint's `UNDER_GLOW`):
- Two lamps 1.1 m apart at her transom, shining aft, as a transom series does (OceanLED's are 2 to 4 ft apart).
- Each lamp's light: a near glow 1.4 m to half and a far glow falling by e every 7 m, in a lobe aft, a little spilling to her sides and none forward under her.
- Its green an LED's emerald (linear 0.02, 0.6, 0.17), its heart going toward white as the cube of its light.
- Drawn as it is, additive, not tone-mapped up with the night's exposure.
- Along her centreline: 0.73 at 1 m, 0.52 at 2 m, 0.19 at 5 m, 0.06 at 10 m, nothing at 20 m. The mesh goes to nothing at its edge, so it has none.
- Kept a little over the water so the swell doesn't cut it, and down to the water against her hull.
- Her paint lit from under: the pool's green on white at her waterline, going off up her by e every 0.45 m and along her by e every 3.2 m.
- Made the first time they're lit, as before.

Set beside the photographs (the after set's pool shots are from before the bounce went to 0.3, which doesn't touch the pool):
- **From her deck**, looking down over the transom: the water astern emerald, its ripples showing through the light, a white-green heart at the lamps, going off to the sea's own dark. The dock light from above has the same heart and spread.
- **From her bridge**, looking aft: a hot core at the transom and a broad glow with no edge, as *Marlin*'s photograph has it in blue. Before: a uniform disc, and her hull's dark shape cut out of it.
- **From off her side**, 22 m: the green along the water astern, her transom's foot bright, her topsides lit near the stern, as seatech's and the Hull Truth's photographs have it. Before: a thin line.
- **From astern**, far off: a soft green spread on the water about her.
- The photographs' camera saturates the core to white; the game's is a white-green heart going emerald. No photograph of a green pool from directly above a sportfisher was found.

## The catch card's stand-ins

`FishPortrait.compile` puts a stand-in mesh for each fish material in the card's scene while three builds their programs after the start (`App.prepareLate`). A card up then drew them: small triangles at the fish's place, in the first second or so on a CPU. They're hidden now. three's `compile()` builds what's hidden too (as `heldTools` and the rest rely on), so the programs are the same and nothing's drawn.

`tools/looks/card.mjs` raises a card the moment the game starts and keeps it up until the card's shaders are made, counting each draw of the card's scene and any stand-in in it:
- **before** (53ffb1c, 844 × 390 on low): 19 draws of the card's scene. One came while its shaders were made, with both stand-ins in it; the picture caught a green triangle across the fish.
- **after**: 20 draws, one of them while the shaders were made, and no stand-in in any.

## The toast over the card's name

The card fills the screen on a phone, its name at the top; a toast sits at the top too. At 844 × 390 a toast covered the card's eyebrow and name (toast 72–420 × 16–73 px, eyebrow 346–498 × 10–39, name 282–562 × 48–91). At 390 × 844 it sat under the purse, over the name and the Latin name. On a laptop the card's eyebrow is under the top's toast too.

**Now a toast that would cover the card's name waits** (`Hud.clearOf`, set by `GameHUD`: the card's eyebrow, name and Latin name while it's up). It's hidden, its time not running, and shown once it would cover nothing: when the card goes. Toasts that come meanwhile wait behind it, a few at most, and show one after another. One that wouldn't cover them shows at once. Measured with `tools/looks/card.mjs` (two toasts put up over a card, a long one and a short one; then the card put away):
- **844 × 390** (before: both over the eyebrow and the name): both waited, nothing over the card; with the card gone, the first that had waited showed.
- **390 × 844** (before: over the name and the Latin name): the same.
- **1366 × 768:** the same. A toast at the top there would cover the card's eyebrow too (616–750 × 36–62 px).
- On every screen a real toast came during the card ("The ice has gone · the catch keeps about 12 hours without it"). It showed first when the card went, the two put up later behind it.

Chosen over moving the toast: in landscape the card takes the whole height, and the columns beside it are 140 to 230 px wide; a toast there wraps to several lines. The card's a few seconds, and what it says is the moment's.

## The helm's guard against slow frames

`DaysOut._clock` takes a clock that's moved by more than it could have run since the last look for a rest (it reckons her drift and puts you on deck). What it could have run is the wall's seconds since then at night's pace, and it had 1% over that to spare. At deep night the looks read 0.986 to 0.994 of what's allowed (step 0).

That 1% was the only slack, and what it has to cover isn't a share of the gap. In company the clock's the room's, read once in a frame (`Together.syncClock`), and the wall's time is read in `_clock` later in the same frame. So the two are a frame's work apart at most: half a second on a slow CPU. Over a 13 s gap that's 4%.

**Now the guard allows two seconds of the wall more** (`CLOCK_SLACK_S`): four slow frames. A real jump is still caught: a rest, a bunk, a tow all move the clock at once by half an hour and more, and two seconds of the night are 0.08 h. `test/days-out-clock.mjs`:
- deep night, pages hidden 13 s to 5 minutes, each look's clock up to 0.5 s off the wall either way: no rest; the old guard took 5 of those 30 for one;
- the least to spare at a look: 1.65 s of the wall (the old guard's −0.37 s);
- a 0.6 h rest straight after a page hidden 10 s at night, and a tow's 0.51 h after a second's look: both still rests.

## The checks

- **`pnpm test`:** passes (58c32c8; 7 min 44 s at a load of 25 to 30, `test/flats.mjs`' timing included; the two commits after change no tested figure). Passes again on dbd23fb, the frame's alpha (6 min 35 s). And on 79f0049, the height only where it's read (5 min 22 s, at a load of 14.8 falling to 3.3). `test/console.mjs` checks the height's written only where the sea reads it. `test/days-out-clock.mjs` has the helm's guard (above), and every boat test builds the boats through `loadBoat` with their shade.
- **The GPU limits on 79f0049**, high, mid and low one at a time: high 161 shaders, all within, the sea 16 of 16 fragment textures and 185 vertex uniforms; mid 100, all within, the sea 14 of 16; low 87, all within, the village's wood 16 of 16. As before: the change takes a varying from the boats' programs on low and mid and adds a line to high's output pass, no texture or uniform anywhere.
- **The GPU limits** (`tools/gpu-limits.mjs`, high, mid and low one at a time, on ec3587b): high 165 shaders, all within, the sea 16 of 16 fragment textures and 185 vertex uniforms as before; mid 98 shaders, all within, the sea 14 of 16; low 85 shaders, all within, the village's wood 16 of 16 as before ("the flats' marks never came" in the time it waits, as on `m17-flats`). No texture was added anywhere. The fill is uniforms and a few lines in the boats' own materials, the environment's map is the one they read already, and the flare's and the pool's programs have one texture or none. The sea's shader isn't touched: the flare's light on it is a local light, which it already takes.
- **The programs built before ready** (`tools/heap/programs.mjs`, `tools/wakes/ready-sources.mjs`, phone upright on low, builds of 53ffb1c and 58c32c8): the same 16 by name and number, and all 16 the same to the character. The two commits after (b605bd6, ec3587b) change a uniform's value and the flare's canvas, neither in a program's source. dbd23fb, the frame's alpha, against 53ffb1c again: the same 16, to the character. And 79f0049, the height only where it's read: the same 16, to the character. None of the 16 is a boat's: the boats are built after the start on the CPU, so the line they lose on low isn't among them.
  - On low and mid every boat's program, built after the start, has a varying fewer, and three lines (about 150 characters) fewer: the height in the vertex shader and the alpha in the fragment's.
  - Nothing here is drawn before ready on a CPU: the boats are held to after the start, and the flare, the pool and the card's fish come after it.
  - On a GPU the boat you start in, the kayak, builds in the loading frame with the fill's few lines in her hull.
- **The complete check on a clean copy of 79f0049**, the height only where it's read (`cli.ts check`): passes, no warning.
  - Script memory 144.2 MB of 150, on the tablet; 123.2 on the phone upright, 116.4 on its side, 138.0 on the laptop. dbd23fb's read 138.0 and b605bd6's 143.5: a run swings that much.
  - Whole download 78.3 MB of 80; 7.1 MB before it's ready.
  - 84 draw calls, 242,040 triangles, textures 73.6 MB, graphics memory 111.6 MB, 14 sounds at once.
  - Ready in 4.8, 4.7, 7.1 and 6.7 s on the four screens. It started at a load of 2.9 and ended at 13.3, the other sessions' work coming back, so the times are for the M17 session's quiet runs to judge.
- **The complete check on a clean copy of dbd23fb**, the frame's alpha (`cli.ts check`): passes, no warning.
  - Script memory 138.0 MB of 150, on the tablet; 127.4 on the phone upright, 119.4 on its side, 129.6 on the laptop.
  - Whole download 78.3 MB of 80; 7.1 MB before it's ready.
  - 80 draw calls, 231,905 triangles, textures 74.9 MB, graphics memory 112.8 MB, 14 sounds at once.
  - Ready in 4.6, 4.5, 5.6 and 4.5 s on the four screens. It started at a load of 3.2 and ended at 12.0, so the times are for the M17 session's quiet runs to judge.
- **The complete check on a clean copy** (b605bd6, `cli.ts check`; ec3587b after it changes only the flare's canvas, which the check never fires): passes, every screen played to the hurricane's dawn.
  - Script memory 143.5 MB of 150, on the phone on its side; 112.0 upright, 141.6 on the tablet, 134.3 on the laptop. `m17-flats`' last two read 142.7 and 142.3, and a run swings 20 MB.
  - Whole download 78.3 MB of 80; 7.1 MB before it's ready.
  - 77 draw calls, 231,951 triangles, textures 70.3 MB, 14 sounds at once.
  - One warning: "Paused for 5.5 seconds while drawing (Laptop)", which the check puts down to shaders made on the CPU.
  - It started at a load of 3.4 and ended at 35.7, the other sessions' renders coming back, so its times are the load's: ready in 6.3, 5.4, 7.1 and 6.8 s on the four screens. The pause and the times are for the M17 session's quiet runs to judge.
- **Script memory and the download:** the flare's texture is 64 px, the pool's mesh 577 vertices, made when first used. Low's script memory: see the complete check. The download is 2.8 KB more (the moored looks).

## For the M17 session's timing checks

Not run here, by the brief (three sessions on one machine; the load ran 25 to 37 through this work):
- the ready A/B, phone upright, 4 CPUs;
- one screen's whole play on one core;
- the two complete checks that judge the release.

What might move them:
- The boats' materials have a few lines more: the bounce, and an `onBeforeRender` that sets the environment's map. That's the kayak's hull before ready on a GPU, and every boat after it.
- The moored boats' program changed with them (`mooredBoat|groundBounce`), built after the start.
- The flare is a sprite (a program three already has, the glares') and one local light while it burns.
- The pool's material is new (not tone-mapped), built the first time her lights come on.
- The frame's alpha (79f0049): no draw of its own. On low and mid the boats' programs have a varying and three lines fewer. On high the output pass has one line more, in a pass drawn anyway. `App.opaqueFrame`'s clear of the whole canvas each frame (dbd23fb), which cost the CPU about 3% of a one-core play, is gone.

## Not verified

- No real GPU or phone has drawn any of it. That leaves how the flare's glare and the pool's additive green look on a phone's own screen, and whether the shade's figures hold on a real display's gamma.
- No daytime photograph of an aerial red meteor was found. Its look by day follows the Coast Guard's detection range, not a picture.
- Two players: someone else's flare (`theirFlare`) takes the same path, and the boats' copies the same materials (`paintedHull` keeps the fill), but neither was run with two games here.
- The card's stand-ins were caught on low (one draw while the card's shaders were made, both stand-ins in it, base 53ffb1c), and none after. Mid's and high's studio build (`RoomEnvironment`) wasn't run with a card up.
