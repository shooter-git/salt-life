# M20: the sea's figures, from sources

Checked 2026-11-14 on `m20` (259c92c). Nothing in the project was changed. Paths are relative to the repo root. "Derived" means I worked a number out from a sourced figure or formula; it is not a measured result. "Judgement" means no source gave it. Sources are summarised, with at most one short quote each. Where I only saw a page through a search result and couldn't open it, I say so. The derived numbers came from short scripts run outside the repo (linear wave theory, the photographs' pixels, and three.js 0.186.1's own tone-mapping code).

In short:

| # | Topic | What the sources say | Recommendation for the game |
|---|---|---|---|
| 1 | A boat's wake in shallow water | Waves in depth h obey ω² = gk tanh kh. The wake's half-angle depends on the depth Froude number Fh = U / √(gh). It stays at Kelvin's 19.47° up to Fh 0.56 to 0.7 and widens to 90° at Fh = 1. Above that it is asin(1/Fh), and every wave is a divergent one. Waves are highest and longest near critical speed (0.84 < Fh < 1.16), and highest of all where hump speed and critical speed coincide. Short waves hardly shoal (the factor stays between 0.91 and 1.03) before they break at H ≈ 0.78 h | Take the angle and wavelength from Fh as well as the hull's Froude number. The console planing at 20 kn over 1 to 5 m is supercritical (Fh 1.5 to 3.3). Her wedge's outer edge sits at 18 to 43°, but her visible arms move little (about 8 to 11°, against 8.2° now). Her biggest wake comes at 7 to 8.5 kn in 1.4 to 2 m of water. Drop the fade from 1.5 m: keep each crest's height until H = 0.78 h, then break it. The kayak only nears critical on the flats, in 0.25 to 0.5 m |
| 2 | The moon's glitter path | The path's width over its length is the sine of the moon's height. Cox and Munk's slope variance is 0.003 + 0.00512 U. On calm water the path is only as wide as the disc, a broken streak. The photographs show the path at dusk, with the sky still blue | Path width (FWHM) ≈ 2.355 σ⊥ (sin δ + sin ε), which is 4.71 σ⊥ sin ε at the moon's mirror point. With the moon 10° up: about 4.2° wide in the game's calm, 6 to 7° in fair, 7 to 9° in breezy. Add the disc (0.52°), and draw the path from moonrise, twilight included |
| 3 | Neutral against ACES | PBR Neutral outputs c − 0.04 for channels between 0.08 and 0.8, so hue and saturation are kept. It has a toe on the smallest channel below 0.08 and a 1/x shoulder from 0.76, desaturating at 0.15. It never shifts hue. ACES Filmic darkens and desaturates the darks and skews hues (orange goes yellow). three's ACES multiplies its input by 1/0.6 | ×1.4 exposure matches mid-grey (×1.34 to 1.42 for scene greys from 0.05 to 0.3; ×1.38 was found before). At that exposure, dark paints rise 2 to 4 times in luminance and keep their colour. The sea, the shallows and the sky get more saturated. Whites and sand in the sun get brighter. Neutral near-blacks get darker, and night's blue gets more saturated |

---

## 1. A boat's wake in shallow water

**The game now.**
- `src/ocean/WakeWaves.js:12-14`: the divergent waves go out at their deep-water group velocity, half their phase speed (ω = √(gk)).
- `WakeWaves.js:63-77`: `wakeTan` and `wakeCos` take the angle from the hull's length Froude number alone. It is Kelvin's 19.47° up to Fr ≈ 0.5, then narrows as 1/Fr (Rabaud and Moisy). Depth plays no part.
- `WakeWaves.js:83-91`: `wakeHeight`, fitted to Macfarlane et al., for deep water.
- `src/ocean/Waves.js:71` and `:412-418`, and `src/ocean/WaterSurface.js:287`: `WAKE_SHOAL = [0.2, 1.5]` fades the crests out between 1.5 and 0.2 m of depth.
- `src/ocean/Wake.js`: foam patches shed at the quarters and astern, with no depth or land check.
- The hulls: the console's waterline is 5.61 m and her displaced volume 2.49 m³ (`WakeWaves.js:39`). The kayak is 12 ft (3.7 m, `src/together/BoatCopies.js:36`), with a hull speed of 4.4 knots (`src/audio/FlatsSound.js:12`).

**Sources.**
- **Soomere 2006, "Nonlinear ship wake waves as a model of rogue waves and a source of danger to the coastal environment: a review"**, *Oceanologia* 48(S) ([PDF](https://ecp.iopan.pl/oceanologia/48Ssoome.pdf); opened, text extracted here).
  - The wedge's half-angle satisfies sin α = 1 / (2c/c_g − 1). That gives asin(1/3) in deep water, where c = 2c_g. In depth H, c/c_g = 2 / [1 + 2kH / sinh(2kH)], so α "only depends on the depth Froude number".
  - Shallow-water effects start at kH < π. For divergent waves at the wedge's edge that is Fh ≈ 0.687, and for transverse waves Fh ≈ 0.56 (Sorensen 1973). At Fh = 1, α reaches 90°.
  - "wave heights do increase considerably at Fh → 1 and wave periods increase gradually as the ship's speed does so."
  - The transcritical range is 0.84 < Fh < 1.15 (Hüsig et al. 2000). The leading waves of fast ferries are typically about 1 m high, with periods of 10 to 15 s.
  - A ship may send solitary waves ahead of her from Fh ≥ 0.2. They are largest at transcritical speeds, Fh 0.9 to 1.2 in models (Ertekin et al.).
  - It cites Havelock (1908) for the finite-depth pattern. I didn't open Havelock, Newman or Lighthill.
- **Parnell, Soomere et al. 2008, "Far-field vessel wakes in Tallinn Bay"**, *Estonian Journal of Engineering* 14(4) ([PDF](https://kirj.ee/public/Engineering/2008/issue_4/eng-2008-4-273-302.pdf); opened, text extracted).
  - Near-critical means within ±15% of √(gh), 0.84 < Fh < 1.16.
  - Hump speed is F_L ≈ 1/√π ≈ 0.56 (the transverse wave twice the hull's length). "The highest waves eventually occur when the hump and the critical speed coincide."
  - The highest vessel waves there reach periods of about 15 s, against 3 to 8 s for the bay's wind waves.
- **Pethiyagoda, McCue and Moroney, "Wake angle for surface gravity waves on a finite depth fluid"** ([arXiv 1505.04336](https://ar5iv.labs.arxiv.org/html/1505.04336); opened).
  - The wedge angle runs from asin(1/3) at small F_H up to π/2 at F_H = 1. It falls monotonically above 1, as F_H⁻¹ for large F_H.
  - "For supercritical flows, F_H > 1, the wave pattern is entirely made up of divergent waves."
  - In shallow channels the apparent angle (where the waves are highest) follows the wedge closely. In deep ones it behaves as in infinitely deep water.
  - For large F_H, θ_app ≈ β/F_H. Their Eq. 8 gives β from δ = L/H. β tends to 1 for shallow water and to 0 for deep.
- **US Army Corps of Engineers, *Coastal Engineering Manual* EM 1110-2-1100, Part II, Ch. 7, vessel waves** ([tpub mirror](https://coastalengineeringmanual.tpub.com/Part-II-Chap7/Part-II-Chap70061.htm); opened).
  - Waves are deep-water waves below F ≈ 0.7. The cusp-locus angle rises from 19°28′ at F ≈ 0.7 to 90° at F = 1, where "Most of the wave energy is concentrated in a single large wave at the bow."
  - The cusp heights fall off as distance^-1/3, as the game has them.
  - Above planing speed, wave height doesn't rise much.
- **A full-scale catamaran study** ([ICCE paper](https://icce-ojs-tamu.tdl.org/icce/article/download/5612/5284/23324); a scanned PDF I couldn't read, so search result only). The largest waves came at Fh ≈ 0.93, just under the theoretical 1. At supercritical speeds the waves were lower than in deep water.
- **Bosboom and Stive, *Coastal Dynamics***, TU Delft, on LibreTexts.
  - Shoaling ([page](https://geo.libretexts.org/Bookshelves/Oceanography/Coastal_Dynamics_(Bosboom_and_Stive)/05%3A_Coastal_hydrodynamics/5.02%3A_Wave_transformation/5.2.02%3A_Shoaling); opened): K_sh = H/H₀ = √(1 / (tanh kh · 2n)), with n = c_g/c. It "is 1.0 in deep water, then decreases slightly with water depth to 0.91 and subsequently rises to infinity." Breaking limits the rise.
  - Breaking ([page](https://geo.libretexts.org/Bookshelves/Oceanography/Coastal_Dynamics_(Bosboom_and_Stive)/05%3A_Coastal_hydrodynamics/5.02%3A_Wave_transformation/5.2.5%3A_Wave_breaking); opened). Miche: [H/L]max = 0.142 tanh(kh), which gives H/h ≈ 0.88 in shallow water. Solitary-wave theory gives γ ≈ 0.78. The breaker index runs from about 0.6–0.8 (spilling) to 0.8–1.2 (plunging), about 0.8 on average. These limits were derived for a level bottom.
- **McCowan's 0.78** (search result only, an ICCE paper's snippet): derived from solitary-wave theory. Yamada later gave 0.8261.
- **Wikipedia, "Wave shoaling"** ([page](https://en.wikipedia.org/wiki/Wave_shoaling); opened). Green's law: H·h^1/4 is constant, so H ∝ h^-1/4. It holds where the depth is under a twentieth of the local wavelength.

**Derived.**

The formulas (linear theory):
- dispersion: ω² = g k tanh(kh); phase speed c = √((g/k) tanh kh); group speed c_g = n c, with n = ½ (1 + 2kh / sinh 2kh): n = ½ in deep water and 1 in shallow.
- depth Froude number Fh = U / √(gh); critical speed U = √(gh).
- a steady wake holds the waves whose phase speed is U cos ψ (ψ is the wave's direction off her heading). Their energy runs out at tan α = n cos ψ sin ψ / (1 − n cos²ψ) off her track. The wedge is the largest α.
- for Fh > 1, only waves with cos ψ < 1/Fh exist (no transverse waves). The wedge is the long-wave edge, where n → 1: **sin α = 1/Fh**.
- shoaling K_s = √(c_g0 / c_g), with no loss. Green's law (H ∝ h^-1/4) is its shallow limit.
- breaking: H_b ≈ 0.78 h (crest to trough), or Miche's 0.142 L tanh(kh) if that is lower.

The wedge's half-angle by Fh, worked numerically from the above (for Fh > 1 it equals asin(1/Fh) to 0.1°):

| Fh | 0.5 | 0.6 | 0.7 | 0.8 | 0.85 | 0.9 | 0.95 | 0.99 | 1.05 | 1.2 | 1.5 | 2 | 3 | 4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| half-angle | 19.5° | 19.6° | 20.5° | 24.3° | 28.2° | 34.6° | 46.1° | 67.9° | 72.2° | 56.4° | 41.8° | 30.0° | 19.5° | 14.5° |

Critical speeds: 3.13 m/s (6.1 kn) over 1 m, 4.43 m/s (8.6 kn) over 2 m, 5.42 m/s (10.5 kn) over 3 m, 7.00 m/s (13.6 kn) over 5 m.

Near critical the waves get long. Worked for 2 m of water, the wave at the cusp, and her transverse wave:

| Fh (speed in 2 m) | Cusp wave | Transverse wave | Deep-water transverse |
|---|---|---|---|
| 0.7 (6.0 kn) | 4.7 m, 1.7 s | 6.4 m, 2.1 s | 6.2 m |
| 0.9 (7.7 kn) | 11.9 m, 3.1 s | 14.6 m, 3.7 s | 10.2 m |
| 0.95 (8.2 kn) | 17.9 m, 4.3 s | 21.8 m, 5.2 s | 11.3 m |
| 0.99 (8.5 kn) | 41.5 m, 9.5 s | 50.8 m, 11.6 s | 12.3 m |

The 23 ft console (waterline 5.61 m) at **20 knots** (10.29 m/s): hull Froude number 1.39. The game's angle is 8.2°. Her arms' waves run 73° off her heading, 5.62 m long, period 1.9 s. Her highest wave is 0.26 m one waterline length off her track, and 0.16 m four lengths off (`wakeHeight`).

| Depth | Fh | Wedge (outer edge) | Apparent angle, β/Fh | Her arms' wave in that depth | Shoaling factor | Breaks at H |
|---|---|---|---|---|---|---|
| 5 m | 1.47 | 42.9° | ≈ 8° | 5.6 m (unchanged) | 1.00 | 3.9 m |
| 3 m | 1.90 | 31.8° | ≈ 8° | 5.6 m | 0.99 | 2.3 m |
| 2 m | 2.32 | 25.5° | ≈ 9° | 5.8 m | 0.97 | 1.6 m |
| 1 m | 3.28 | 17.7° | ≈ 11° | 10.4 m (barely exists) | 0.91 | 0.78 m |
| 0.5 m | 4.65 | 12.4° | ≈ 11° | can't exist: her waves must run more than 78° off her heading | 0.94 | 0.39 m |

- On the plane she is supercritical over anything shallower than 10.8 m. No transverse waves are left. The far edge of her wake (the long, low waves) opens to asin(1/Fh), while her highest crests stay near the narrow angle she has in deep water.
- **Coming off or onto the plane is where depth shows.** Her hump (F_L 0.5 to 0.56) is 7.2 to 8.1 kn, and critical speed equals that in 1.4 to 1.8 m of water. At 8.6 kn in 2 m (Fh 1.0, F_L 0.60) the game now gives her 0.41 m at one length off, already her largest. By the Tallinn paper, that is where shallow water makes it larger still.

The **kayak** (3.7 m) at her hull speed, 4.4 kn (2.26 m/s), F_L 0.38: Kelvin's 19.5°, her waves 2.2 m long (1.2 s), 5 cm high one length off. At 3 kn (1.54 m/s): 1.0 m long (0.8 s), 2 cm.

| Depth | Fh at 4.4 kn | Wedge | Fh at 3 kn | Wedge |
|---|---|---|---|---|
| 5 m | 0.32 | 19.5° | 0.22 | 19.5° |
| 2 m | 0.51 | 19.5° | 0.35 | 19.5° |
| 1 m | 0.72 | 21.0° | 0.49 | 19.5° |
| 0.5 m | 1.02 | ~78° | 0.70 | 20.5° |
| 0.3 m | 1.32 | 49.3° | 0.90 | 34.5° |

She goes critical in 0.52 m of water at full paddle and in 0.24 m at 3 kn: only on the flats. Her 2 to 5 cm waves break in 3 to 7 cm of water.

Shoaling, for the waves the game draws:
- The console's 1.9 s waves change by under 10% on their way in: ×0.97 at 2 m, ×0.91 at 1 m, ×0.94 at 0.5 m, ×1.01 at 0.3 m. Her 0.26 m crest breaks in 0.33 m of water, her 0.16 m crest in 0.21 m.
- Miche's limit doesn't bite first: in 1 m her wave is 4.85 m long, so it could stand 0.59 m before breaking by steepness.
- Green's law only applies to these short waves under about 0.3 m of depth, inside the breaking zone. It matters for the long near-critical waves above (λ/h of 6 to 20).

**For the game.**
- **Dispersion and speed.** Use ω² = gk tanh kh where the water is shallower than about half a wavelength (kh < π: under 2.8 m for the console's 5.6 m crests). In 1 m her 1.9 s waves slow from 2.96 to 2.55 m/s, and their group speed goes from half the phase speed to 0.7 of it.
- **The angle.** Replace the depth-blind `wakeTan` by the larger of two angles (judgement on how to blend them):
  - the hull's angle as now (Kelvin, or Rabaud and Moisy's 1/Fr on the plane);
  - the depth's wedge from the table above, carrying only long, low waves at its edge when supercritical.
  On the plane the visible arms barely move. The new look is the wide, long-crested leading wave at transcritical speeds.
- **Height near critical.** No source gives a factor for a small boat. Soomere says "considerably", and the Tallinn paper says highest where hump and critical coincide.
  - Suggested: ×2 at Fh 0.9 to 1.0 (judgement), back to ×1 by Fh 0.84 and 1.16.
  - Supercritical, a little under the deep-water height, as the catamaran study found (search result only).
  - The console's worst case is 7 to 8.5 kn in 1.4 to 2 m of water.
- **Shoaling and breaking.** Replace `WAKE_SHOAL`'s fade from 1.5 m:
  - keep each crest's height (×K_s, 0.91 to 1.03 for these waves) until H ≥ 0.78 h;
  - break it there, with foam along the crest;
  - hold it at about 0.78 h, or 0.4 to 0.5 h as a random sea's significant height, as it runs up into nothing (judgement on the decay).
  - Refraction, with crests turning to the depth contours, follows from the slower speed in shallow water.
- **Foam.** No patches over land or in water shallower than the hull draws. Add breaking foam where a wake crest's H exceeds 0.78 h.
- **Kayak.** Nothing changes except on the flats: in 0.25 to 0.5 m her ripple fans out to 35 to 80° near critical speed.

---

## 2. The moon in the sea: the glitter path

**The game now.**
- `src/sky/Environment.js:16`: the sea reflects the sky's environment variant, which has no sun or moon disc.
- `src/sky/Atmosphere.js:106`: the key light becomes the moon at night. The water's direct specular uses the key light (`src/ocean/WaterSurface.js:186-187`, `waterSunDir`), so the moon draws a path at night. As the brief says, there is no disc in it and nothing at twilight.
- `WaterSurface.js:235`: the sea's roughness is 0.1, scaled by the detail and the slick at `:746`. In a blow the direct specular dims (`:806-807`).
- The winds: calm 2.5, fair 7, breezy 11 m/s at 10 m (`src/game/Weather.js:52-55`).

**Sources.**
- **Cox and Munk 1954**, as given in Mobley's *Ocean Optics Web Book* ([page](https://oceanopticsbook.info/view/surfaces/cox-munk-sea-surface-slope-statistics); opened).
  - Wind U in m/s at 12.5 m (41 ft). Upwind σ_a² = 3.16×10⁻³ U. Crosswind σ_c² = 0.003 + 1.92×10⁻³ U. Total σ² = 0.003 + 5.12×10⁻³ U (±0.004, r = 0.986).
  - The slopes are close to a bivariate Gaussian. Wind "ruffles the sea surface so that the Sun's direct beam can be reflected from a wider area".
  - Their original paper ([PDF](https://data-ww3.ifremer.fr/BIB/Cox_Munk_JOSA1954.pdf)) refused me (403). From its summary in a search result: the mean square slope is (tan 16°)² at 14 m/s.
- **Shaw 1999, "Glittering Light on Water"**, *Optics & Photonics News* ([PDF](https://www.montana.edu/jshaw/documents/Glitter_patterns_OPN1999.pdf); opened, text extracted).
  - For a high source the glitter's angular length is four times the maximum wave slope: two from waves tilted either way, two from the doubling on reflection.
  - "The ratio of the glitter-pattern width to its length is given by the sine of the source elevation angle."
  - A source at the observer's height gives half the size with the same ratio. The ratio is smallest when the source's height is twice the maximum slope. Lower than that, shadowing shortens the pattern until it disappears.
  - A smooth swell makes loops of light, the moon's included.
  - The same text is on NOAA PSL's education page ([page](https://psl.noaa.gov/outreach/education/science/glitter); opened).
- ***Atmospheric Optics*, glitter paths** ([page](https://atoptics.co.uk/fz236.htm); opened). Paths are often only as wide as the moon or sun. The width is set by the moon's height and the waves' slopes, not their height. Paths widen near the shore, where the waves are steeper.
- **Photographs on Wikimedia Commons**, from Category:Mångata ("moon street", 206 files) and Category:Water reflections of the Moon ([category](https://commons.wikimedia.org/wiki/Category:Water_reflections_of_the_Moon); opened). I read each file's licence and camera data through the Commons API and looked at each picture. I measured the moon's height and the path's width from the camera's field of view (derived, ±20%).

| File | Licence, author | Moon up | Exposure | What it shows | Path width (FWHM) |
|---|---|---|---|---|---|
| `Moonlight Samui Chaweng 2013 may - panoramio.jpg` | CC BY 3.0, Roma Neus | 2° (orange, rising) | 16 s | A calm Gulf of Thailand. A narrow straight column from the horizon, widening toward the camera | 0.8° under the horizon, 1.7° at 7° below |
| `Moon over sea Cala Millor.jpg` | CC BY 3.0, Maksym Mozul | 6° (full moon at dusk) | 0.4 s | The sky still blue, the sea lit by it. The path is a column of separate glints, plain against the sea | 1.9 to 2.0° |
| `Full moon setting over Lanai.jpg` | CC BY-SA 3.0, Vossman | 9° | 3.2 s | At moonset off Maui. A smooth column to the foreground | 3.2 to 4.4° (clipped core) |
| `Moon over Archie Carr National Wildlife Refuge (5776828551).jpg` | Public domain, USFWS | 7° | 20 s | Florida's Atlantic beach. A smooth column 3 to 5° wide to the shore | 3.2 to 4.7° (clipped core) |
| `Andaman Sea at night, Moonset, Moonlight.jpg` | CC BY 4.0, Vyacheslav Argenberg | 17° | 1.3 s | A beach with small surf. A broad path, broken where the waves break | about 6° (3.5 to 7.6°) |
| `Waxing half moon over Brofjorden 1.jpg` | CC0, W.carter | 7° | 10 s | A glassy fjord at dusk, the sky blue. The reflection is a single streak at the mirror point, 5.4 to 8.3° below the horizon | 0.3 to 0.5°, the disc's width |
| `The Moon Over the Ocean (13372749025).jpg` | CC BY 2.0, Mike Lewinski | about 5° | 1/100 s | Dusk, calm water. The disc's reflection is a dashed vertical streak, 3.3 to 6.0° below the horizon | about 0.4° |
| `Moon and clouds over Brofjorden 1.jpg` | CC0, W.carter | low | 3.2 s | Dusk, glassy. The reflection is a short bright streak | not measured |
| `Moon over Black Sea in Crimea.jpg` | CC BY-SA 4.0, Crimea Sleepwalker | low | 1/320 s | Dusk. A column of separate glints, broken into dashes | not measured |

(`Mediterranean moonrise, Port-la-Nouvelle.jpg` is edited, with a blue cast and a moon far larger than a lens of that kind gives, so it isn't used.)

**Derived.**
- **Where a glint can be.** A view ray δ below the horizon reflects a moon ε up only off a facet whose slope along the line of sight is s_∥ = tan((ε − δ)/2), exactly. Off to the side by a screen angle w, the facet needs a cross slope s⊥ = w / (sin δ + sin ε).
- **So, for Gaussian slopes:**
  - across the path, FWHM ≈ 2.355 σ⊥ (sin δ + sin ε) radians. At the mirror point (δ = ε) that is 4.71 σ⊥ sin ε. At the horizon it is half that, and it widens toward you.
  - along the path, the brightness peaks at δ = ε and halves at δ = ε ± 2 atan(1.177 σ_∥).
  - this is Shaw's width/length = sin ε. Small-angle forms, rough above about 20°.
  - Add the disc's 0.52° in quadrature.
  - σ⊥ is the crosswind slope when the wind blows along your line of sight to the moon, and the upwind slope when it blows across it.
- **The photographs fit it.**
  - Samui's widening (0.8 to 1.7°) gives σ⊥ ≈ 0.08 at both ends, Cox and Munk's for about 2 m/s.
  - Cala Millor: about 0.11 (about 5 m/s). Andaman: about 0.11. Lanai: 0.11 to 0.14. Archie Carr: up to 0.14 to 0.17. Both of those are upper bounds, since a clipped core reads wide.
  - The two glassy cases (Brofjorden, Lewinski) are far smoother than Cox and Munk's zero-wind intercept. That intercept alone would give about 1.9° at 7°. Brofjorden's 3° streak gives σ_∥ ≈ 0.01.
- **The game's winds by Cox and Munk** (their 12.5 m wind taken as the game's 10 m one, a few per cent off):

| Weather (wind) | σ_c | σ_a | rms tilt | Along the path, half-brightness at |
|---|---|---|---|---|
| calm (2.5 m/s) | 0.088 | 0.089 | 7.2° | ±12° about the mirror point |
| fair (7) | 0.128 | 0.149 | 11.1° | ±20° |
| breezy (11) | 0.155 | 0.186 | 13.7° | ±25° |

So for a moon under about 12 to 25° up, the path runs from the horizon to well below its mirror point, close to the boat.

Path width (FWHM) at the mirror point, disc included. The first figure is for wind along the line of sight to the moon, the second for wind across it:

| Moon up | 2° | 5° | 10° | 20° | 30° |
|---|---|---|---|---|---|
| calm (2.5 m/s) | 1.0°, 1.0° | 2.1°, 2.2° | 4.2°, 4.2° | 8.2°, 8.2° | 12°, 12° |
| fair (7) | 1.3°, 1.5° | 3.1°, 3.5° | 6.0°, 7.0° | 12°, 14° | 17°, 20° |
| breezy (11) | 1.6°, 1.8° | 3.7°, 4.4° | 7.3°, 8.8° | 14°, 17° | 21°, 25° |
| glassy (σ ≈ 0.01) | 0.5° | 0.5° | 0.5°, a streak a few degrees long | | |

With the moon 10° up in calm air, the path is 2.2° wide just under the horizon, 4.2° at the mirror point and 6.2° at 20° below.

- **Brightness.** Fresnel reflectance at the mirror point (n = 1.333): 0.80 with the moon 2° up, 0.58 at 5°, 0.35 at 10°, 0.13 at 20°, 0.06 at 30°, 0.02 at 60°. A low moon's path is many times brighter per glint.

**For the game.**
- **Width from the surface.** The sea's slope spread as drawn, wave geometry plus detail normals plus the specular lobe, should total Cox and Munk's: σ² ≈ 0.003 + 0.00512 U. That is about 0.016 in the calm, 0.039 in fair and 0.059 in breezy, split upwind 3.16×10⁻³ U and crosswind 0.003 + 1.92×10⁻³ U. The path's width then follows the table without being set by hand.
- **The disc.** Put the moon's disc (0.52°) into what the sea reflects, so glassy water shows the disc as a broken streak and every path has the disc's width as its floor.
- **Twilight.** Draw the path whenever the moon is up and bright against the sky, not only once it is the key light. Five of the photographs are at dusk with the sky blue, and the path stands out in each.
- **Glassy water.** A narrower look (σ ≈ 0.01, a disc-wide streak) is for still water in the lee or at dawn. The game's calm (2.5 m/s) is inside Cox and Munk's range, so it gets their figures. When glassy water appears is judgement.

---

## 3. three.js's Neutral tone curve against ACES

**The game now.**
- `src/App.js:261-263`: `ACESFilmicToneMapping`, exposure from the settings ("the SDK's default AgX greys out the sand and the sea").
- `docs/m17/looks.md:150-175` ("Dark paints and the tone curve"). Through ACES, barn red in shade is 0.021 of white in shade on the screen, against about 0.035 in the photographs. Neutral at ×1.38 (white in sun matched) gave 0.046. That page left the choice to the user.
- three 0.186.1 (`node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js`):
  - `ACESFilmicToneMapping` multiplies by `toneMappingExposure / 0.6`, then applies the sRGB-to-AP1 matrix, Hill's RRT+ODT fit and the matrix back;
  - `NeutralToneMapping` is Khronos's, with `StartCompression = 0.8 - 0.04` and `Desaturation = 0.15`.

**Sources.**
- **Khronos, PBR Neutral specification** ([GitHub](https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/README.md); opened).
  - In linear Rec. 709: x = min(R,G,B). The offset f = x − x²/(4·0.04) for x ≤ 0.08, otherwise 0.04.
  - Below the peak p = max − f ≤ 0.76 the output is c − f. Above it, the peak goes to 1 − 0.24²/(p − 0.52), and the colour blends toward white at a rate of 0.15.
  - For channels between 0.08 and 0.8 the output is exactly c − 0.04: the base colour of a shiny dielectric facing you under unit white light.
  - "For all input colors, there are no hue shifts". The mapping is 1:1 and analytically invertible.
- **Lalish, "Tone mapping" write-up** on modelviewer.dev ([page](https://modelviewer.dev/examples/tone-mapping); opened).
  - ACES and AgX lose saturation, and "push colors toward white the brighter they are". Under ACES, "a paper-white material does not produce white pixels".
  - Neutral is 1:1 up to 0.8 (sRGB 231). The 0.04 offset counters the Fresnel desaturation of dielectrics, and there is a quadratic toe below 0.08. Above 0.8 a 1/x shoulder takes over, with peak 255 compressed to 243.
  - The write-up says nothing on matching exposure between curves.
- **three.js PR #27668**, "Add Support for Khronos Neutral Tone Mapping", by its designer, merged 2024-02-09 (read through the GitHub API).
  - Over ACES and AgX it "Maintains color saturation", has a larger reachable set of sRGB, and "Avoids hue skews".
  - AgX is better for out-of-gamut colours, and for "important visual detail across a wide dynamic range (e.g. landscape photography). The HDR is aggressively compressed in this tone mapper".
- **Filament, `ToneMapper.h`** (google/filament, read through the GitHub API).
  - PBR Neutral was "designed to preserve the appearance of materials across lighting conditions while avoiding artifacts in the highlights".
  - Filament's `ACESLegacyToneMapper` "applies a brightness multiplier of ~1.6" to match its old Filmic's brightness, the same kind of gain as three's 1/0.6.
- **three.js forum, "Tone Mapping Overview"**, by Usnul ([thread](https://discourse.threejs.org/t/tone-mapping-overview/75204); opened).
  - "ACES changes your colors, not just the intensities": "your oranges will end up yellow and your water will have a cyan color". It "boosts contrast and tends to darken your image".
  - Neutral "will faithfully reproduce colors". AgX looks flat.
- **Blender's forum, "Adding PBR Neutral tone mapper"** ([thread](https://forum.blender.org/t/adding-pbr-neutral-tone-mapper/33602); opened). The Fresnel compensation mainly affects dark colours. It shipped in Blender 4.2.
- **Unity's post-processing docs** (search result only). Neutral does "range-remapping with minimal impact on color hue & saturation". ACES is "more contrasted and has an effect on actual color hue and saturation".
- Babylon.js: I found no page on its PBR Neutral option. It is only listed among adopters in Khronos's press coverage.

**Derived** (from three 0.186.1's two functions, run in Python):

A grey of scene value g (already times exposure), to the screen (sRGB 0–255):

| g | 0.01 | 0.02 | 0.05 | 0.1 | 0.18 | 0.3 | 0.5 | 0.8 | 1.0 | 2.0 |
|---|---|---|---|---|---|---|---|---|---|---|
| ACES ×1 | 8 | 21 | 50 | 87 | 127 | 165 | 197 | 219 | 226 | 242 |
| Neutral ×1 | 2 | 8 | 34 | 69 | 105 | 139 | 181 | 226 | 240 | 251 |
| Neutral exposure to match ACES | ×2.0 | ×1.70 | ×1.42 | ×1.34 | ×1.41 | ×1.38 | ×1.20 | ×1.01 | ×0.80 | ×0.54 |

- **The usual match is about ×1.4** at mid-grey (×1.34 to 1.42 for g from 0.05 to 0.3). The game's ×1.38 for white in sun is the g = 0.3 figure: its sunlit white renders at about 165, which is ACES of 0.3.
- **No single exposure matches everywhere.** ACES is an S-curve with a soft shoulder. Neutral is straight (less 0.04) up to 0.76, then has a hard shoulder. At ×1.4, Neutral is brighter above about g 0.5 and darker for near-black greys under about 0.03 (its toe is 6.25 g² for a grey under 0.08).
- **Colours.** These are illustrative scene values, not the game's measured ones. Each is shown as ACES ×1, then Neutral ×1.40, in sRGB with saturation (HSV):
  - barn red in shade (0.03, 0.003, 0.004): (26,1,2) → (55,0,5); luminance ×3.4, hue the same.
  - barn red in sun (0.12, 0.012, 0.016): (87,6,18) → (109,6,21); ×1.6.
  - navy in shade (0.001, 0.012, 0.04): (0,10,38), hue 223° → (0,33,66), hue 210°; ×4.2. ACES turns navy toward violet.
  - sea blue (0.01, 0.06, 0.10): (0,57,83) → (4,75,100); ×1.7.
  - turquoise shallows (0.05, 0.35, 0.35): (77,175,174), saturation 0.56 → (49,179,179), saturation 0.73.
  - sky blue (0.25, 0.45, 0.9): (163,191,222), saturation 0.26 → (140,181,246), saturation 0.43. Deeper and bluer.
  - sand in sun (0.9, 0.75, 0.55): (223,216,204), saturation 0.08 → (246,227,198), saturation 0.19. Brighter and warmer.
  - white in sun (1.2, 1.2, 1.15): 232 → 249.
  - sunset orange (1.5, 0.5, 0.1): hue 38° (yellowed) → 24°.
  - a moonlit blue-grey (0.01, 0.012, 0.02): (8,11,19), saturation 0.58 → (4,13,33), saturation 0.88.

**For the game** (what to expect at ×1.4):
- **Dark paints in shade.** They come up 2 to 4 times in luminance and keep their colour. Barn red in shade goes from about 0.021 of white in shade to the photographs' 0.035 or above (looks.md's probe gave 0.046). Navy stops going violet.
- **The sea.** More saturated and a little brighter in its mid-blues; the shallows' turquoise much more saturated. ACES's cyan push goes. The sea's look was tuned beside photographs under ACES, so it needs checking again.
- **The sky.** Deeper, more saturated blue, and a little darker at the zenith's values. Near the sun, Neutral's hard shoulder takes everything over 0.76 to near-white sooner. The sun's glint and the bright sky round it clip more. This is the "wide dynamic range" case where its author says AgX does better.
- **Sand.** In the sun it gets brighter and warmer, not greyer: the opposite of AgX's fault. If it reads too bright, that is the shoulder starting at 0.76.
- **Night.** Near-neutral darks go darker (×1.7 would be needed at g 0.02), but tinted darks keep their tint. A blue moonlit night goes more saturated blue. The moon's disc and its path, being highlights, compress harder. Night wants its own exposure check.
- **Sunsets.** They stay orange instead of yellowing.

---

## Numbers for the game

**Wakes in shallow water (§1)**
- Dispersion ω² = gk tanh kh. n = ½ (1 + 2kh / sinh 2kh). Shallow effects below kh = π.
- Fh = U / √(gh). Critical speed 6.1 kn over 1 m, 8.6 over 2 m, 10.5 over 3 m, 13.6 over 5 m.
- Wedge half-angle: 19.5° to Fh 0.6; 20.5° at 0.7; 24.3° at 0.8; 34.6° at 0.9; 46.1° at 0.95; 90° at 1; then asin(1/Fh): 56.4° at 1.2, 41.8° at 1.5, 30° at 2, 19.5° at 3.
- Near-critical band 0.84 < Fh < 1.16. Highest where hump (F_L ≈ 0.56) and critical meet: the console at 7 to 8.5 kn in 1.4 to 2 m.
- Near-critical waves in 2 m: 12 m at Fh 0.9, 18 m at 0.95, 40 to 50 m at 0.99, against 6 to 12 m in deep water.
- Console at 20 kn over 1 to 5 m: Fh 3.3 to 1.5; wedge edge 18 to 43°; visible arms about 8 to 11°.
- Kayak: critical in 0.52 m at 4.4 kn and 0.24 m at 3 kn.
- Shoaling K_s = √(c_g0 / c_g): 0.91 to 1.03 for the game's wake waves. Green's law H ∝ h^-1/4 for h < λ/20.
- Breaking: H_b = 0.78 h. Miche [H/L]max = 0.142 tanh kh. The console's 0.26 m crest breaks in 0.33 m of water, her 0.16 m crest in 0.21 m, the kayak's 5 cm in 7 cm.

**The moon's path (§2)**
- Cox and Munk: σ_a² = 3.16×10⁻³ U; σ_c² = 0.003 + 1.92×10⁻³ U; total 0.003 + 5.12×10⁻³ U. The game's calm, fair and breezy give totals of 0.016, 0.039 and 0.059.
- Path FWHM across = 2.355 σ⊥ (sin δ + sin ε), plus the disc's 0.52° in quadrature. At the mirror point, 4.71 σ⊥ sin ε.
- Along the path: brightest at δ = ε, half at ε ± 2 atan(1.177 σ_∥): ±12° in calm, ±20° fair, ±25° breezy.
- Moon 10° up: 4.2° wide in calm, 6 to 7° fair, 7 to 9° breezy. At 5°: 2.1°, 3.1 to 3.5° and 3.7 to 4.4°.
- Fresnel at the mirror point: 0.58 at 5°, 0.35 at 10°, 0.13 at 20°, 0.06 at 30°.
- Glassy water: a disc-wide (0.5°) streak about 3° long, broken into dashes.

**Tone curve (§3)**
- Neutral: c − 0.04 for channels between 0.08 and 0.8; toe c − (x − 6.25x²) below a smallest channel of 0.08; shoulder from 0.76; desaturation 0.15.
- three's ACES: input × exposure / 0.6.
- Neutral's exposure to match ACES: ×1.4 at mid-grey (1.34 to 1.42 over scene greys 0.05 to 0.3); ×1.0 at 0.7; ×0.8 at 1.0; ×1.7 at 0.02.

## Unsourced, judgement

- **How much higher a small boat's wake gets near critical speed.** I suggest ×2 at Fh 0.9 to 1.0. No source gave a factor; the catamaran study's figures were only seen through a search result.
- **How to blend** the hull's angle (Rabaud and Moisy) with the depth's wedge, and whether the long leading waves at the wedge's edge are drawn at all (§1). The apparent angle β/Fh comes from an asymptote for large Fh and a pressure patch, used here as a guide.
- **The broken crest's decay** into the beach, at 0.78 h or 0.4 to 0.5 h (§1).
- **Whether a 5.6 m hull really raises 40 m waves** at Fh 0.99. Linear theory allows them; how much energy goes into them from so short a hull isn't sourced.
- **The photographs' measurements:** fields of view from the cameras' 35 mm-equivalent focal lengths (±20%), horizons read by eye, and clipped cores widening some paths. The wind at each place is unknown, so "fits Cox and Munk" means only that the widths fall in their range.
- **When glassy water appears** in the game (§2), and its slope spread of about 0.01, from one fjord photograph.
- **The game's own scene values** for sand, sea and sky weren't measured here. The colour examples in §3 are illustrative, so the sizes of the changes are indicative only.
- **Whether to switch the tone curve at all.** That is the user's call, as M17 left it. Neutral's author recommends AgX over it for wide-dynamic-range scenes, and the game is one.
- **Pages that wouldn't open:**
  - Cox and Munk's 1954 PDF (403);
  - the ICCE catamaran paper (scanned images);
  - Blender's issue tracker (403);
  - Apsley's Manchester notes (connection refused);
  - Havelock, Newman, Lighthill and Longuet-Higgins weren't reached; Havelock is cited through Soomere and Pethiyagoda.
