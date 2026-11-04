# M17, step 0: before any code

What [M17.md](../M17.md) asked to be found before anything is built: the island's flats, the sources for the tide, the flats fish and M16's figures, and the things seen once in play run again. Done 2026-11-04 on `m17-flats`, nothing in the game changed. The sources in full are [sources-tide-fish.md](sources-tide-fish.md) and [sources-figures.md](sources-figures.md), each figure with its source and how sure it is (firm, good, guide lore, derived, none found). Both were gathered by research agents and read here; the links in them weren't all opened.

What it changes in the plan is at the end ([What step 0 changes](#what-step-0-changes)).

## The flats, as the island has them

`tools/flats-map.mjs` reads the island's bake as `TerrainData` has it and maps its water at low, mean and high water for a tide of a given range. It prints each stretch under 1.2 m of water at mean level, with its area, depths and bottom, and writes a picture of it. With Settlement Point's 0.93 m (below):

| Water, island-wide (ha) | 0 to 0.3 m | 0.3 to 0.6 m | 0.6 to 1.2 m | 1.2 to 3.5 m |
|---|---|---|---|---|
| Low water | 2.05 | 1.85 | 4.30 | 16.19 |
| Mean | 5.07 | 2.93 | 3.71 | 16.46 |
| High water | 0.99 | 2.47 | 7.41 | 16.25 |

**The island has almost no flats.** It has a narrow strip of shallow water along each beach:
- The biggest stretch is the village beach's, 2.0 ha and a few tens of metres wide, beside the kayak's berth.
- The west's mangrove mud is 1.6 ha.
- Ten more stretches of 0.2 to 0.8 ha are beach fringes round the coast.
- Off the bay's beach the floor falls to several metres at once. On the west coast the shelf reaches about 5 m deep within 100 to 150 m of the shore, and 20 m some 300 to 400 m out.

Real flats in this water run to hundreds of hectares. Before there's anything to sight-fish on, flats have to be made. That's a landform cut in as the island loads, as the north beach and the caves are (`TerrainData`'s cuts, placing from `TerrainData.uncut`).

The likeliest place is the west side, seaward of the mangroves. It's in the lee of the trades, where flats and mangroves lie in the Bahamas: Andros's west side, the Bight, is the best-known bonefish water there is. It's the user's call ([What step 0 changes](#what-step-0-changes)).

## The tide

From NOAA's own data ([sources-tide-fish.md](sources-tide-fish.md), 1):

- **Settlement Point, Grand Bahama (9710441), is the only station in the Bahamas with datums and harmonics of its own.** Nassau, Andros, Bimini and Eleuthera are all predicted from it.
  - Mean range 0.83 m. The 0.93 m in the proposal is its great diurnal range (higher high to lower low).
  - Semidiurnal, form factor 0.24, with a small daily inequality: the two highs differ by 0.07 m.
  - Its constituents: M2 0.405 m, S2 0.070, N2 0.093, K1 0.067, O1 0.046.
- **Springs about 0.97 m, neaps about 0.64 m** (NOAA's 2026 predictions). Springs come about a day after new and full moon (25.6 h).
- **The moon's distance moves the range more than its phase does.** N2 is bigger than S2 there, so springs at perigee reach about 1.1 m and at apogee about 0.75. A tide worked out from M2 and S2 alone would miss that. It needs N2, and the moon needs its distance as well as its phase.
- **Over a big bank the tide comes late and small:** up to 4.5 h late and 45% smaller on the Great Bahama Bank (Geyman and Maloof 2020, from satellite images). Most of that builds over the first 10 km in from deep water. A flat of a few hundred metres off a steep island would see none of it to speak of.
- **Key West is a different tide:** mean range 0.39 m, mixed. Florida Bay's side of the Keys is smaller again (0.22 m at Vaca Key) and mainly diurnal.

A steep island facing the open Atlantic at 24 degrees north has an oceanic tide like Settlement Point's. The Keys' small tides come from the Florida shelf and the Gulf behind them.

## The flats fish

From studies where there are any ([sources-tide-fish.md](sources-tide-fish.md), 2):

- **Bonefish.** These are the firmest figures:
  - telemetry at Cape Eleuthera found them in the creeks from about 3 h into the flood to about 3 h into the ebb, almost never outside that (Murchie and others 2013);
  - schools of 3 to 20 fish, in 0.1 to 4 m of water, mudding (Colton and Alevizon 1983);
  - schools of over a thousand gathering offshore for 4 to 7 days about new and full moon to spawn (Danylchuk 2011);
  - a heat limit of 36 to 38 °C.
- **Permit:** big ones alone or in pairs, feeding on the flats, spawning on the reef (Keys telemetry). No study ties their use of the flats to the tide.
- **Tarpon:**
  - they roll to breathe air, mostly when the water's short of oxygen, though older work calls it obligatory;
  - laid-up fish want calm water and the sun to be seen in, so the proposal's "laid up at dawn" isn't supported.
- **Snook** face into the current along the mangroves and ambush. Whether they're in the Bahamas wasn't confirmed.
- **Redfish and spotted seatrout aren't in the Bahamas, by any source.** Key West is redfish's southern limit (ASMFC), and both are common in Florida Bay. The game's fish table already notes southern Florida as the furthest south either comes.
- **What spooks them:** no study has measured how near an angler gets. Guides name engines, a hull's knocks, shadows, a wake, and a fly landing too close; wading, they shuffle.
- **How far they're seen.** Nobody has measured it; worked out from the geometry and Fresnel's equations:
  - the angle you look down grows with your eye's height, so a 2.5 m platform sees at 31 m what a kayak's seat (0.8 m) sees at 10 m;
  - at 20 m, about 72% of the sky's glare comes through polarized glasses from the seat, 52% standing and 36% from a platform;
  - a cloud's shadow takes the light on the bottom down to about a tenth.
- **A grand slam** is a bonefish, a permit and a tarpon in a day, by tradition. IGFA's own Inshore Grand Slam is any three of 13 species in a day.

**The kayak can't be stood in.** The Perception Pescador 12.0 is 32.5 in wide with a 375 lb capacity. Her maker says nothing of standing, and reviews say she isn't for it. So her water is fished sitting, close in. Standing is for wading, and for the console's bow or the lobster boat's roof.

## M16's figures

From [sources-figures.md](sources-figures.md), each with the game's figure, its file and line, and the sources:

| Figure | The game | Verdict |
|---|---|---|
| A handheld VHF | 9 km | stands (about 5 miles to a boat; more to a mast ashore) |
| A fixed VHF to Marta | 37 km | only with her antenna about 50 m up. With a 10 m mast in the village, about 21 to 25 km by the boat's antenna. Work it out from both heights: 4.12 (√h boat + √h shore) km |
| A flare by night | 25 km × the visibility | stands (Allard's law: 11 to 15 nm for a red meteor) |
| A flare by day | 5 km | too far: about 2.5 to 3.5 km (the Coast Guard's 2019 daytime trials) |
| Ice in a cheap cooler | a 10 lb bag in about 15 h | the hot, open-lid end; about 23 h fits better |
| Ice in an insulated hold or the big box | 0.6 of the cooler's rate | about twice too fast; about 0.3 (FAO's measured insulated boxes) |
| Water a day | 4 L | a minimum; about 6 L working in tropical sun. Stores are counted in days, so nothing changes |
| Sailfish's depths | 0 to 40 m | stand |
| White and blue marlin at night | deeper than tagged | about 0 to 30 m (Hoolihan 2015; Goodyear 2008) |
| Swordfish and the moon | not modelled | real: at a new moon most of the night above 75 m, at a full moon mostly 100 to 200 m (Lerner 2013) |
| The hauler | 240 ft/min | stands (makers' 166 to 600) |
| A trap's soak | a time constant of 3 nights | too slow: about three quarters of a two-week catch comes the first night (Austin 1977, Florida's 1963 data); the 40% floor on a long soak has no source |
| The chair's and harness's holds | 40 kg and 18 kg | close to what's reported |
| The dehooker | 6 m | real ones reach 1.8 to 3.7 m; 6 m only if measured to where the leader's taken |
| **The lines' strengths** | "8 lb mono" holds 7 kg, "60 lb braid" 50 kg | **about 1.9 times their labels** (8 lb is 3.6 kg, 60 lb 27.2). The fight's tension, drag and holds are all measured against `lineKg` (`Gear.js`, `CatchMinigame.js`), so correcting it touches the whole fight's balance |
| The lobster boat's foredeck | through the windscreen, for a script | real ones go forward by a narrow side deck with handrails on the house, or by the hatch over the V-berth |

The underwater lights' pool has three candidate photographs linked there, not yet looked at.

## Seen once in play, run again

The speck past the fog at night:

- **The speck at night stands.** A boat's light on the game's speck is near invisible at 9 km (alpha about 0.06 to 0.086). Under COLREGS Annex I, a light's rated range is where its glow falls to the eye's threshold (2 × 10⁻⁷ lux) through air that lets 80% through each mile. A sportfisher's masthead light, rated 3 miles, is then about 12 candela. Through air that lets 90% through, an exceptionally clear night, the same light reaches the threshold at about 4.6 miles, about the 9 km where the speck fades.

The rest were rendered on the CPU (Playwright on SwiftShader; no GPU here), by a research agent working from the dev server, with nothing in the game changed:

- **Flares on low: still so, and explained** (`DaysOut._launch`, `_updateFlare`).
  - **Pale:** the flare's `CanvasTexture` has no colour space, so its sRGB gradient is read as linear. Every other canvas texture in the game sets one. With sRGB set, the top of its climb went from (204,159,147) to (185,29,39).
  - **Never brighter than the sky:** its sprite is tone-mapped with the scene's exposure. At night it blows out to white near by, and from a km or more it's a beige-grey smudge.
  - **Tiny:** sized `( 4 + 0.004 d )` m, it's 2 to 4 px at any range past a km. That much is right for a star 100 to 150 m up; a real one is a saturated red point, the brightest thing in view.
  - There is only the aerial meteor. No handheld flare, no light cast on the water, no smoke.
- **Barn red near black: still so, and explained.**
  - **The console's and the sportfisher's paint is turned to linear twice.** three's `setHex` already converts sRGB to linear, then `convertSRGBToLinear()` runs again (`ConsoleMaterials.setPaint`, `SportfisherMaterials`' `linear()`). So barn red's albedo is 0.85% where it should be 6%, near black even in full sun. Every dark paint on those two boats is darkened the same way, the console's own navy as she came included. `MooredLooks.js` copies the double conversion on purpose, so the boats at their berths match.
  - **The shade's light is too low for a dark paint on every boat.** The world's fill is kept low for the sand, and the boats' own fills (the console's GroundBounce, the sportfisher's outside fill) scale with the paint's brightness, so they can't lift a dark one. The lobster boat has no fill of her own: her white topsides in shade are a tenth of their sunlit brightness.
  - Real barn red is about a tenth of white gelcoat's brightness in sun or shade: dark, but plainly red.
- **The sportfisher off her helm: explained, and mended since.**
  - The sound run was on 2026-11-01. The guard against slow frames and hidden pages came the next day (5a10307), and its message names this fault.
  - Five minutes at a sixth of the CPU's speed, with sound on, day and deep night, never dropped her; nor did a page held still for two minutes.
  - Only a real jump of the clock drops you now: a rest, a bunk, a rest agreed in company, a tow, each meant to.
  - **One margin is thin:** at deep night the guard has 1% to spare (looks read 0.986 to 0.994 of what's allowed). A frame's timing could one day tip it.
- **The blocky, cut-off catch card: not a fault of the skipping.**
  - "Draws skipped" (`__stop` in `tools/two-players/lib.mjs`) only blackens the card's backdrop; the fish is drawn anyway.
  - "Cut off" is the fish's 0.7 s slide-in from the stage's edge, caught by a slow CPU frame.
  - "Blocky" is the CPU's missing anti-aliasing and low's pixel ratio. A phone's GPU smooths the edges. The hogfish's mottling is square on every device, though: its value noise on a grid (`FishMaterial.js`).
  - **One real fault, seen once:** the stand-in triangles `FishPortrait.compile` puts in the card's scene are drawn if a card is up while it compiles, in the first second or so after the start. A player would hardly ever see it.
  - Also seen: at 844 × 390 a toast sits over the card's title.

The screenshots and scripts are in the session's scratchpad, not the repo.

## What step 0 changes

For the plan ([M17.md](../M17.md)):

1. **The flats have to be made first.** A landform of its own in the foundation, before the tide and the fish: where, how big, its bottom (white sand, grass, the mangroves' mud), its creeks and its edge. It's cut in at load as the north beach is, its rocks and plants placed from the ground as it was. What it costs is measured before anything goes on it: the cut's time at load in the ready A/B, the shore field over the new shallows, the chart's soundings, and low's masks.
2. **The tide is Settlement Point's**, with N2 as well as M2, S2, K1 and O1. The moon has a distance as well as a phase.
3. **Bonefish keep to the tide as the telemetry has them.** On the flats and in the creeks from about 3 h into the flood to 3 h into the ebb, in schools of 3 to 20. Each new and full moon they gather offshore to spawn, which is something to find in itself.
4. **Tarpon are laid up in calm, sunny water**, not at dawn. They roll more where the water's short of oxygen.
5. **The kayak is fished sitting.** Seeing from her seat is close work, about 10 m. Standing is for wading, the console's bow and the lobster boat's roof.
6. **Redfish and seatrout are out of their range here.** Whether they stay is the user's call.
7. **The lines' strengths are about 1.9 times their labels.** Correcting them touches the whole fight's balance, so that's the user's call too.
8. **The looks' fixes, for the second wave:**
   - the flare's colour space, its brightness and its light on the water;
   - the paint converted once on the console and the sportfisher, and their baked looks at their berths again;
   - a shade fill that lifts a dark paint, the lobster boat's included;
   - the portrait's stand-ins kept out of a card that's up;
   - the toast clear of the card's title;
   - the night's 1% margin on the helm's guard widened.
9. **M16's figures, corrected in the second wave**, from the table above.
