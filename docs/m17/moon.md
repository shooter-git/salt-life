# M17, stream 3: the moon

What [M17.md](../M17.md) asked of the moon ([The tide and the moon](../M17.md#the-tide-and-the-moon), "The moon"), on the foundation's numbers ([foundation.md](foundation.md): `IslandClock.moonAt`):
- its phase in the sky;
- the night's light with it;
- the turtles minding it, and a turned-back turtle's night saved;
- swordfish deeper under a full moon;
- the springs after the drawn new and full moon.

Done 2026-11-09 on branch `claude/m17-moon-e9944f`, cut from `m17-flats` 7495f79.

## The moon in the sky

`sky/Moon.js` is pure (no three.js), so the sky draws it, and the turtles and the bites read the same moon. `moonSky( T, hours, azimuth )` works it out from the island's time.

**Where it stands.**
- On the ecliptic, as far ahead of the sun as `moonAt`'s phase puts it. That's the mean elongation, the same the tide turns on.
- Off the ecliptic by its orbit's 5.1 degrees, as its argument of latitude has it (Meeus).
- Through the obliquity to an hour angle and declination, then to the island's sky at the sky's 24 degrees north. This is the same transform as `Sky.sunDirectionFromTime`.
- The game's sun stands at 6 degrees' declination all year (no seasons). So it's on the ecliptic's spring side (early April), and the moon's ways repeat month on month, as the sun's do day on day.
- So: full opposite the sun, new beside it, a quarter square to it.
- It rises 50.5 minutes later each day on average over three lunations. Each day's delay runs from 34 to 61 minutes with its declination. Sources give "about 50 minutes later each day" ([EarthSky](https://earthsky.org/moon-phases/understandingmoonphases); [Wikipedia, Moonrise and moonset](https://en.wikipedia.org/wiki/Moonrise_and_moonset)).
- The full moon at midnight stands 60 to 70 degrees up in the south. A first quarter at sunset stands high in the south, as it does in the tropics in spring.
- Its disc is 29.4 to 32.8 arcminutes across, by its distance.
- Its face is turned to its north pole, which is taken as the ecliptic's pole (within 1.5 degrees of it). So the face tilts across the sky through the night as the real one does, and an evening crescent in the tropics lies on its back.
- Not drawn: libration, its parallax (a degree), and eclipses.

**Its disc** (`skyMoon` in the sky's shader):
- **Lit from the sun's side** by the Lommel-Seeliger law the moon's surface follows, 2 mu0 / ( mu0 + mu ). It's flat to the limb at full, as the full moon is, and darkens toward the terminator, where its craters' shadows make the edge ragged.
- **Lit to its phase.** Its surface's brightness goes by its phase angle, apart from what that shading gives. So the disc's whole light follows the moon's magnitude law: V = -12.73 + 0.026|a| + 4e-9 a^4 (Allen 1976, as Krisciunas and Schaefer 1991's eq. 9 gives it).
  - A quarter moon gives 9% of a full one's light, not half. That's the opposition surge: "only one-tenth as bright" (Berman 1995), "more like 10", as much as 15 (J. M. Palmer).
  - Left out: the last 35% of the surge within 4 degrees of exactly full (Buratti et al. 1996), which only an eclipse's full moon reaches.
- **Its seas** (twenty-seven patches from the IAU's centres and diameters, the big irregular ones as several), added into one field so they run together where they overlap, as the seas do. Their edges are broken inward by noise, never past their outlines, and each has its own darker and lighter lava. Tycho is bright in the south. No texture.
- **Earthshine on the rest.** The Earth's light on the dark side: 14.9 mag/arcsec² at half moon (Bazzon et al. 2013, after Montañés-Rodríguez et al. 2007), against the full moon's 3.36. The Earth's light goes by its own phase seen from the moon, as a Lambert sphere, so it's brightest at new moon.
- **It hides the stars behind it**, dark side too. It's drawn by day and by night, through the air as the sun's disc is, so a rising moon's orange.

**How bright it's drawn.**
- **By day, as it is:** the full moon's 0.31 lux above the air over its disc, in the sky's units, against the day's sky. A day moon is a pale disc.
- **At night, as the photographs and the eye have it** (set beside them, below):
  - its highlands near white and its seas plainly darker;
  - a crescent near white too, so its surface's brightness is taken by the fifth root. The cube root left a crescent a dull grey beside the photographs;
  - its earthshine by the cube root, as the night's brightness is. That draws a crescent's as the photographs show it, a dim grey disc;
  - the earthshine seen only on a crescent. Past that the lit part's glare hides it: to the naked eye it's a crescent's.

## The night's light by it

Real moonlight (`Moon.js`; `MOON`'s figures):

| | lux on level ground | Source |
|---|---|---|
| Full moon above the air, mean distance | 0.313 | Krisciunas and Schaefer 1991, eq. 8 and 9 |
| Full moon at the zenith | about 0.32 | Kyba, Mohar and Posch 2017 (0.26 measured at 55.5 degrees up) |
| Full moon at the zenith, at most | 0.32 | Hänel et al. 2018, Table 2 |
| Half moon at the zenith, at most | 0.025 | Hänel et al. 2018 (after Schäfer 1978) |
| A natural starlit night | 0.0006 to 0.0009 | Hänel et al. 2018 |
| The game: the full moon 60 degrees up (its midnight height here) | 0.237 | |
| The game: the brightest night of a year (a full moon near perigee, high) | 0.244 | "0.3 lux ... a few hours each year, in the tropics" (Kyba et al.) |
| The game: a moonless night | 0.00075 | |

The air: 0.2 magnitudes an airmass (Kasten and Young 1989's airmass). That's between Mauna Kea's 0.172 at 2,800 m (Krisciunas and Schaefer) and the 0.3 or so that Kyba et al.'s 0.26 lux at 55.5 degrees implies for a lowland.

The moonlit sky: 7% of the moon's light on the ground (`skyShare`). That makes a full moon's sky 18.5 mag/arcsec² against a dark one's 21.7. Measured: 18.0 to 18.5 on clear full-moon nights (Puschnig et al. 2014), and "up to 4 mag" brighter (Benn and Ellison, La Palma Technical Note 115).

**Drawn as a dark-adapted eye sees it.** The night's brightness is the cube root of the real light: Stevens' power law for brightness, about 0.33 for a target in the dark (J. C. Stevens and S. S. Stevens 1963, *JOSA* 53:375; I couldn't open the paper itself to check the figure in it).
- The full moon high is the night as this game always drew it: the key light 0.25, the sky's fill 0.1625.
- A moonless night's 0.00075 lux is drawn at a sixth of it. The boat's lights, the flashlight and the lamps are as they were, so they carry it.
- The light's split as it really is between the moon's own (the key, square to it) and the rest (the sky's fill). Both take one gain that makes their sum seen so. The fill takes what's left of the full moon's share (it was this game's choice to lift the night's shadows).
- Its colour: the moon's blue-white as before, reddened by the air low down (the atmosphere's own transmittance at its height). A rising moon's light and its path on the sea are orange.
- With the moon set the key light's way is straight down, and it gives none. So nothing that reads the key's way draws a shadow from a moon that's down (the creatures' contact shadows, the turtles' tracks).

The sky the same way. The moonlit sky (its aureole about the moon) and the night's own glow, greyer, each drawn by the cube root of their sum. The fog and the horizon take the same colour.

**The stars by it.** The naked eye's limiting magnitude by the sky's brightness is Crumey 2014's, as Hänel et al. give it, with F 1.4. That's 6.5 on a moonless night, 6.0 under a quarter moon and 5.1 under a full one. The Milky Way's out where the sky's darker than 19.8 to 21.3 mag/arcsec²: it was seen at about 19.8 in a partial eclipse's sky (Project Nightflight), and its bulge is 20.5 to 21.0 (Roach and Gordon 1973).

**The moon's path on the sea** is the key light's specular in the sea's own lighting (three's, from the key light). So it goes where the moon is, as bright as it is, with no change to the sea's shader. The sea's reflections of the sky (its environment) have no moon disc in them, as they never had a sun. A low moon's path is orange.

## The turtles minding it

`game/Turtles.js`: `seaGlow( T, hour )`, the sea's low horizon under the moon, of a moonless night's (`Moon.horizonOf`: the moon's light scattered about the sky, over the night's own). A light has to outshine that before it draws a hatchling off its way (`Clutch.lure`'s `sea`: `LURE.from` is now a moonless night's).

What's real:
- Hatchlings are misoriented most near new moon (Salmon and Witherington 1995; the 1992 Florida cases, most "on or near the new moon", Witherington et al. 2014).
- Less the more of the moon's lit (Stanley et al. 2020).
- With a full moon visible, normal orientation came back (Berry, Booth and Limpus 2013).
- None of them says how much brighter a lamp has to be under a full moon. So it's the horizon's own brightness: 25 times a moonless night's under a full moon high.

In `test/moon-life.mjs`:
- A lamp 22 m off leads 83 hatchlings off their way on a moonless night, and none under a full moon high. One 2.5 m off still leads them.
- A flashlight in its beam leads them from its whole 30 m range on a moonless night, and from 18 m under a full moon high.

Stanley et al. also found a lower moon reduced misorientation more. That isn't modelled: the horizon's only brighter by the moon's light through the air at its height.

Nothing's sent about it. Every game has the same moon, and a light on the beach is each game's own as before.

## A turned-back turtle's night saved

`Minding.kept( hour, day )` and `restore( list, ground )`. Each turtle turned back whose tracks are still on the sand is kept as `[ id, t, x, z, heading, phase, s, dig, out ]`: where and how she turned. That's what makes her way down again (`turnBack` is seeded by her alone), and the up track cut where she turned.

**The save:** one field, `turtles`, in the clock's save (`App.saveClock`, `saltlife.clock`), written only while there's one. `loadClock` reads it, and the turtles take it as they're built. That's the whole change to the save (stream 5's).

In `test/moon-life.mjs`:
- a turtle turned back as she came up;
- the clock's save the next morning (130 characters);
- a fresh game's turtles from it: her way down point for point, her up track cut where it was, her crawl, her whole night the same;
- let go with her tracks;
- a bad or stale record passed over.

## Swordfish under the moon

`FishTable`'s swordfish: `at.night` is the new moon's night depths, `at.full` the full moon's. Between them, by how much of the moon's lit (`Bites.depthWeight`'s `moon`, from `Game.habitatOf`'s `h.moon`, `moonAt`'s lit share).

**Lerner et al. 2013** (*Trans. Am. Fish. Soc.* 142:95-104), eight fish in the Florida Straits, the Bahamas' own water:
- At new moon 82% of their night above 75 m, most of it at 25 to 50 m. So 0 to 75 m.
- At full moon 64% at 100 to 500 m, most at 100 to 200, and 36% above 75 m. So 52 to 300 m, which leaves a float 6 m down 0.44 of its new moon's chance (36 / 82).
- Their median depth is 32 m + 53 m x the lit share.
- Dewar et al. 2011 ("nighttime depth increased around the full moon") and Tracey et al. 2023 (Pacific: 18 m at new, 46 m at full) found the same.

In `test/moon-life.mjs`:
- its depths' middle at midnight goes from 44 m at new moon to 179 at full;
- a bait 150 m down at midnight takes swordfish under a full moon and none at new;
- on a squid float in the blue at midnight, 2,392 of 4,000 bites are swordfish at new moon and 1,559 at full;
- by day the moon's nothing to it.

## The springs

They follow the moon through the tide's constituents (the foundation's). Checked here against the drawn moon (`test/moon.mjs`):
- each day's range over two island years, averaged by days since the drawn moon was new or full, peaks 0.82 days after it at 1.09 m;
- the neaps fall 8.5 days on, at 0.76 m.

NOAA's age of the tide at Settlement Point is 25.6 h (the foundation's 1.2 days took each spring's own highest).

## Seen

`tools/moon/look.mjs [tier] [phases] [views]` holds the island's clock on a night of each phase (the first month's, from `Moon.js`) and draws:
- `disc`: the moon through a 1.5 degree lens;
- `sky`: it and the sky about it;
- `beach`: the north's turtle beach, no lamp near;
- `sea`: from the water out past the island toward it, its path on the sea.

These are headless on SwiftShader, into `qa-output/moon/look/<tier>/`. `tools/moon/compare.mjs` sets them beside photographs from Wikimedia Commons, hot-linked, not kept: crescents with earthshine, a first quarter, a waxing gibbous, Gregory H. Revera's and Luc Viatour's full moons, the moon over the sea at Cala Millor and the Red Sea, moonlit beaches, a beach under the Milky Way.

READINGS_SEEN

## Readings

READINGS

## Not done, or not verified

- **Timing** (the M17 session's, on a quiet machine): the ready A/B, phone upright, 4 CPUs. The sky's shader is built in the loading frame. Its program count before ready is unchanged (16, by name and number), but the main view's fragment has grown by the disc (`skyMoon`: a loop over 27 seas, five value-noise lookups, only past an early return outside the disc). Also the one-core whole play.
- **A real GPU or phone:** every look here is a CPU render (SwiftShader).
- **Two players:** nothing's sent. Both games work the moon out from the same clock, so they have the same moon, and a turtle's night saved is each player's own. `tools/two-players` wasn't run for it.
- **Not modelled:**
  - libration, the moon's parallax and eclipses;
  - the last of the opposition surge within 4 degrees of exactly full;
  - a lower moon lessening the hatchlings' misorientation more (Stanley et al.);
  - the adult turtles minding the moon;
  - the swordfish's depth by whether the moon's up (Lerner's relation is to the lit share alone).
- **The stars and the Milky Way don't turn with the sky.** They're fixed to the world as they always were, while the moon now crosses the sky through the night. Turning them by the sidereal hour about the sky's pole is a small change in the same shader, and wasn't asked.
- **The moon's place in the reflections:** the sea's environment has no moon disc (it never had a sun's); its path on the water is the key light's specular.

## Sources

- Allen, C. W. 1976, *Astrophysical Quantities*, 3rd ed., p. 144 (as cited by Krisciunas and Schaefer).
- Krisciunas, K. and Schaefer, B. E. 1991, "A model of the brightness of moonlight", *PASP* 103:1033-1039.
- Kyba, C. C. M., Mohar, A. and Posch, T. 2017, "How bright is moonlight?", *Astronomy & Geophysics* 58(1):1.31-1.32.
- Hänel, A. et al. 2018, "Measuring night sky brightness: methods and challenges", *JQSRT* 205:278-290.
- Puschnig, J. et al. 2014, *JQSRT* 139.
- Benn, C. R. and Ellison, S. L., La Palma Technical Note 115.
- Crumey, A. 2014, *MNRAS* 442:2600-2619 (as given by Hänel et al.).
- Kasten, F. and Young, A. T. 1989, "Revised optical air mass tables and approximation formula", *Applied Optics* 28:4735.
- Bazzon, A., Schmid, H. M. and Gisler, D. 2013, *A&A* 556, A117.
- Buratti, B. J., Hillier, J. K. and Wang, M. 1996, *Icarus* 124:490-499.
- Stevens, J. C. and Stevens, S. S. 1963, "Brightness function: effects of adaptation", *JOSA* 53(3):375-385.
- Salmon, M. and Witherington, B. E. 1995, *Copeia* 1995:931-938 (as reported by Stanley et al. and Witherington et al.).
- Witherington, B., Martin, R. E. and Trindell, R. N. 2014, FWRI Technical Report TR-2.
- Stanley, T. R. et al. 2020, *Frontiers in Marine Science* 7:221.
- Berry, M., Booth, D. T. and Limpus, C. J. 2013, *Australian Journal of Zoology* 61:137-145.
- Lerner, J. D. et al. 2013, "Swordfish vertical distribution and habitat use in relation to diel and lunar cycles in the western North Atlantic", *Trans. Am. Fish. Soc.* 142:95-104.
- Dewar, H. et al. 2011, *Fisheries Oceanography* 20:219-241 (its abstract).
- Tracey, S. R. et al. 2023, *Scientific Reports* 13:11812.
- Meeus, J. 1998, *Astronomical Algorithms*, ch. 47.
