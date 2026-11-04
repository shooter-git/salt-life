# M17 sources: the tide, the flats fish, the kayak, references

Gathered 2026-11-04 for docs/M17.md ("The tide and the moon", "Sight-fishing on the flats"). Research only; nothing in the project was changed.

How sure, in short: **firm** = agency data or a peer-reviewed paper read here; **good** = reputable secondary (museum, agency profile) or a paper's abstract only; **guide lore** = anglers' and guides' writing, consistent but not measured; **derived** = worked out here from a sourced figure (the working is given); **none found** = no reliable source located.

NOAA figures were pulled from NOAA CO-OPS's metadata and data APIs (the same numbers the station pages show). The 2026 statistics come from NOAA's own 2026 high/low predictions, computed here.

---

## 1. The tide

### Datums (NOAA CO-OPS, National Tidal Datum Epoch 1983-2001, metres)

- **Settlement Point, Grand Bahama (9710441):** mean range (MN) **0.834 m**, great diurnal range (GT, MHHW to MLLW) **0.934 m**. Diurnal inequality is small: high waters differ by 0.073 m (DHQ), low waters by 0.027 m (DLQ). Highest astronomical tide is 1.25 m above MLLW and the lowest is 0.25 m below it. The observed extremes were 1.35 m above MLLW (1987-01-01) and 0.43 m below it (1988-03-20).
  Source: NOAA Tides & Currents, Datums for 9710441, https://tidesandcurrents.noaa.gov/datums.html?id=9710441 (API: https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/9710441/datums.json?units=metric).
  Sureness: firm. M17's "0.93 m MHHW over MLLW" is right; that figure is GT. The mean range is 0.83 m.
- **Key West (8724580):** MN **0.390 m**, GT **0.551 m**, DHQ 0.088 m, DLQ 0.073 m.
  Source: https://tidesandcurrents.noaa.gov/datums.html?id=8724580.
  Sureness: firm.
- **Other Keys stations, to show the Florida Bay side:**
  - Key Colony Beach (8723962), Atlantic side: MN 0.506 m, GT 0.632 m.
  - Vaca Key (8723970), Florida Bay side of Marathon, a few km away: MN 0.218 m, GT 0.297 m.
  - Boca Chica Marina (8724493): MN 0.254 m.
  - Sand Key Lighthouse (8724635), on the reef: MN 0.376 m.
  Source: the same NOAA datums pages (`datums.html?id=<id>`).
  Sureness: firm.
- **Nassau and the other Bahamas stations:** NOAA has no datums or harmonics for any of them. They are subordinate prediction stations, each predicted from Settlement Point by time offsets and height ratios:

  | Station | HW offset | LW offset | HW ratio | LW ratio |
  |---|---|---|---|---|
  | Nassau TEC4623 | −8 min | −3 min | 0.98 | 1.44 |
  | Fresh Creek, Andros TEC4613 | +5 | −8 | 0.97 | 1.11 |
  | North Bimini TEC4617 | +5 | +22 | 0.90 | 1.11 |
  | North Cat Cay TEC4615 | +22 | +32 | 0.86 | 1.11 |
  | Eleuthera west coast (bank side) TEC4625 | **+129** | **+153** | 0.94 | 1.11 |
  | Eleuthera east coast (ocean side) TEC4627 | +11 | +23 | 0.82 | 1.11 |
  | Guinchos Cay TEC4609 | +6 | +16 | 0.79 | 1.11 |

  Source: NOAA CO-OPS tide prediction offsets, e.g. https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/TEC4623/tidepredoffsets.json; station page https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=TEC4623.
  Sureness: firm that this is what NOAA uses. These are old offsets; how good they are isn't stated.
  - **No Exumas station** exists in NOAA's list. The nearest are Eleuthera's two, Nurse Channel (TEC4635) and Guinchos Cay.
- **NOAA's 2026 predictions, ranges computed here from the year's high/low list:**

  | Station | Mean range | 5–95% range | Max |
  |---|---|---|---|
  | Settlement Point | 0.81 m | 0.50–1.15 m | 1.30 m |
  | Nassau | 0.78 m | 0.42–1.15 m | 1.37 m |
  | Fresh Creek | 0.78 m | | |
  | North Bimini | 0.72 m | | |
  | Eleuthera west | 0.75 m | | |
  | Eleuthera east | 0.65 m | | |
  | Key West | 0.38 m | 0.10–0.65 m | |
  | Vaca Key | 0.21 m | | |

  Source: NOAA CO-OPS data API, product=predictions, interval=hilo, datum=MLLW, e.g. https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=20260101&end_date=20261231&station=TEC4623&product=predictions&datum=MLLW&time_zone=lst&interval=hilo&units=metric&format=json.
  Sureness: firm as NOAA's predictions; the statistics are derived.
- **Spring range:** NOAA's current datum pages don't list one. An old NOAA Tide Tables Table 2 extract shows Guinchos Cay at mean 2.1 ft and spring 2.6 ft (0.64 / 0.79 m). That figure comes from a search snippet of a govdocs copy that couldn't be opened, so it's unverified. Use the spring/neap figures below instead.
  - Definitions: NOAA Datum options, https://tidesandcurrents.noaa.gov/datum_options.html (firm).

### Harmonic constants (NOAA harcon; amplitude in m, phase in degrees, Greenwich epoch)

| Constituent | Settlement Point 9710441 | Key West 8724580 |
|---|---|---|
| M2 | 0.405 m, 10.6° | 0.179 m, 66.9° |
| S2 | 0.070 m, 36.6° | 0.051 m, 89.4° |
| N2 | 0.093 m, 349.8° | 0.036 m, 48.9° |
| K1 | 0.067 m, 197.1° | 0.086 m, 354.8° |
| O1 | 0.046 m, 199.2° | 0.089 m, 351.9° |
| K2 | 0.018 m | 0.015 m |
| P1 | 0.021 m | 0.028 m |
| SA (annual) | 0.082 m | 0.095 m |
| SSA (semiannual) | 0.032 m | 0.051 m |
| M4 | 0.000 m | 0.010 m |

- Local-epoch phases are on the same pages. Settlement Point: M2 225.7°, S2 246.6°, N2 207.6°, K1 121.9°, O1 129.5°.
- Sources: https://tidesandcurrents.noaa.gov/harcon.html?id=9710441 and https://tidesandcurrents.noaa.gov/harcon.html?id=8724580 (API: `.../stations/<id>/harcon.json?units=metric`).
- Sureness: firm.

### Its shape

- **Semidiurnal at Settlement Point; mixed at Key West.**
  - Form factor F = (K1+O1)/(M2+S2). Classes:
    - below 0.25: semidiurnal;
    - 0.25–1.5: mixed, mainly semidiurnal;
    - 1.5–3: mixed, mainly diurnal;
    - above 3: diurnal.
  - Settlement Point F = **0.24**: semidiurnal, just under the line.
  - Key West F = **0.76**: mixed, mainly semidiurnal.
  - Vaca Key (Florida Bay side) F = 2.07: mixed, mainly diurnal; NOAA predicts only 1.47 highs a day there.
  - The classification is Courtier's, as used by Pugh & Woodworth. Summarised in TU Delft's *Coastal Dynamics* open textbook, https://coastal.citg.tudelft.nl/book/3a_tidal_environments.html.
  - Sureness: firm (data); the classification is textbook.
  - For the game: Bahamas water is semidiurnal with a small daily inequality (DHQ 0.07 m). Keys water has a clear inequality (DHQ 0.09 m on a 0.39 m range). On some Key West days a range is almost nil (NOAA's 2026 minimum is 0.01 m).
- **12 h 25 min between highs, about 50 min later each day.** The lunar day is 24 h 50 min. NOAA's 2026 predictions give a mean high-to-high interval of 12.42 h at every Bahamas station.
  Source: NOAA Ocean Service, "Tides and Water Levels: Frequency of Tides – The Lunar Day", https://oceanservice.noaa.gov/education/tutorial_tides/tides05_lunarday.html.
  Sureness: firm.
- **Springs against neaps.** Springs come at new and full moon, neaps at the quarters; NOAA Ocean Service, "Tidal Variations", https://oceanservice.noaa.gov/education/tutorial_tides/tides06_variations.html (firm).
  - From harmonics (derived): springs ≈ 2(M2+S2) and neaps ≈ 2(M2−S2).
    - Settlement Point: **0.95 m** springs, **0.67 m** neaps, a ratio of 1.42.
    - Key West: 0.46 / 0.26 m.
  - From NOAA's 2026 predictions (derived), daily mean range at the fortnightly peaks and troughs:

    | Station | Springs mean (spread) | Neaps mean (spread) | Ratio |
    |---|---|---|---|
    | Settlement Point | **0.97 m** (0.75–1.11) | **0.64 m** (0.50–0.78) | ≈1.5 |
    | Nassau | 0.96 m | 0.58 m | 1.67 |
    | Key West | 0.49 m | 0.28 m | 1.77 |

    Geyman & Maloof (below) say the same for the bank top: amplitude "varies by nearly a factor of 2" over a spring-neap cycle (firm).
  - **The moon's distance matters as much as its phase here** (derived from harcon). At Settlement Point N2/M2 = 0.23 against S2/M2 = 0.17, so perigee/apogee moves the range more than the sun does. Springs at perigee reach about 2(M2+S2+N2) = 1.14 m; neaps at apogee shrink to about 0.48 m. That is why the 2026 springs vary from 0.75 to 1.11 m. A faithful model needs N2, not just M2+S2.
  - **Springs lag the moon by about a day** (derived). The age of the tide is (g_S2 − g_M2)/(ω_S2 − ω_M2): 26°/1.016° h⁻¹ = **25.6 h** at Settlement Point, 22 h at Key West.

### Over shallow banks and flats

- **Lagging and smaller on the Great Bahama Bank.**
  - From Landsat time series, NW of Andros, tidal phase shifts by about 4 h and amplitude by a factor of about 2 over 20 km or less.
  - The lag is about zero at the Tongue of the Ocean margin. The shallow water west of Andros and the Joulter Cays has about **4 h** lag and about **0.3 m** range.
  - Triple Goose Creek on the Andros tidal flats: **4.5 h** lag and **45%** smaller.
  - Most of the lag and attenuation happens within about 10 km of the shelf break.
  - The reference is Fresh Creek (mean 0.93 m). The paper calls this "amplitude" but it matches the range.
  - Bank-top tides are predominantly semidiurnal with strong spring-neap swings. Global models (FES2014) miss all of this.
  - Source: Geyman, E.C. & Maloof, A.C. (2020) "Deriving Tidal Structure From Satellite Image Time Series", *Earth and Space Science* 7, e2019EA000958, https://doi.org/10.1029/2019EA000958 (open PDF: https://maloof.princeton.edu/sites/g/files/toruqf1016/files/65maloof.pdf). Data: PANGAEA https://doi.pangaea.de/10.1594/PANGAEA.911255.
  - Sureness: firm.
- **Same in NOAA's offsets.** Eleuthera's bank-side (west) station runs about 2 h 10 min to 2 h 30 min behind its ocean-side (east) one: +129/+153 min against +11/+23 min. NOAA (Mofjeld 1975) noted the bank-side station has "smaller tidal amplitudes and later phases". NOAA's heights in fact give the west station a slightly larger range (0.75 against 0.65 m), so the two sources disagree on size but agree on lag.
  Sources: the offsets above; Mofjeld, H.O. (1975) *Empirical Model for Tides in the Western North Atlantic Ocean*, NOAA Tech. Rep. ERL 340-AOML 19, https://repository.library.noaa.gov/view/noaa/10976.
  Sureness: firm on the lag; mixed on the size.
- **A longer ebb than flood on the bank side** (derived, weak). NOAA's offsets make Eleuthera west's ebb 6.62 h and flood 5.80 h; North Bimini is 6.50/5.92 h. That is an artefact of unequal HW/LW offsets, not a measured asymmetry.
  - Theory: a large tide-to-depth ratio (a/h) gives shorter, stronger floods. Large intertidal storage relative to channel volume gives shorter ebbs.
    Source: Friedrichs, C.T. & Aubrey, D.G. (1988) "Non-linear tidal distortion in shallow well-mixed estuaries: a synthesis", *Estuarine, Coastal and Shelf Science* 27:521–545 (WHOI report copy: https://seagrant.whoi.edu/wp-content/uploads/2015/01/WHOI-R-88-018-Friedrichs-Carl-T.-and-Da.pdf).
    Sureness: good (abstract-level).
  - No measured flood/ebb durations for a Bahamas flat were found (none found).
- **Florida Bay damps the tide almost away.**
  - The range is about 1–1.5 m at the western (Gulf) edge and drops quickly behind the first mudbanks: less than 15 cm there, and 1–5 cm modelled in the eastern bay.
  - Sources: Lee, T.N. et al. (2016) *Bulletin of Marine Science* 92(2) (NOAA AOML copy https://www.aoml.noaa.gov/phod/docs/Lee_etal_BMS_2016.pdf, which redirected and could not be read here; figures via the abstract and search summaries); 1996 ICCE model paper https://icce-ojs-tamu.tdl.org/icce/article/download/5544/5218/23056.
  - Sureness: good. The Vaca Key against Key Colony Beach datums above (0.22 against 0.51 m, a few km apart) show the same thing firmly.

---

## 2. The flats fish

### Bonefish (*Albula vulpes*)

- **Tide (Cape Eleuthera telemetry).**
  - Bonefish moved out of tidal creeks on the ebb and into creeks and shallows on the flood. They used the creeks more by day, once tidal phase is controlled for.
  - Detections in creek backwaters by tidal phase (the paper's Table 3):

    | Tidal phase | Detections |
    |---|---|
    | 2 h after low | 223 |
    | 3 h after low | 1,233 |
    | 4 h after low | 1,945 |
    | 5 h after low | 1,394 |
    | <1 h after high | 1,590 |
    | 1 h after high | 1,753 |
    | 2 h after high | 1,846 |
    | 3 h after high | 1,247 |
    | 4 h after high | 78 |
    | 5 h after high | 17 |

    In words: they come in from about 3 h into the flood and leave by about 3–4 h into the ebb.
  - Semidiurnal tides there had a maximum daily range of 0.8 m.
  - Source: Murchie, K.J., Cooke, S.J., Danylchuk, A.J., et al. (2013) "Movement patterns of bonefish (*Albula vulpes*) in tidal creeks and coastal waters of Eleuthera, The Bahamas", *Fisheries Research* 147:404–412, https://doi.org/10.1016/j.fishres.2013.03.019 (PDF https://goldberglab.wisc.edu/pdf/P095.pdf).
  - Sureness: firm.
- **Tide (Grand Bahama tracking).**
  - Daily pattern: back to deeper water on the ebb, into very shallow water (under 1 m) on the flood.
  - Tracked in 0.1–4 m of water. In under 0.1 m, the dorsal and caudal fins were exposed. Fish stayed near the bottom (within 1 m).
  - "Mudding" was seen only at low tide at one site but through the whole tide at the other. Night movements followed the same pattern.
  - Source: Colton, D.E. & Alevizon, W.S. (1983) "Movement patterns of bonefish, *Albula vulpes*, in Bahamian waters", *Fishery Bulletin* 81(1):148–154, https://spo.nmfs.noaa.gov/sites/default/files/pdf-content/fish-bull/colton_0.pdf.
  - Sureness: firm (only three fish tracked long-term).
- **Florida Keys.** Bonefish use shallow habitat most; deep channels may be a refuge from the flats' rapid temperature swings. Only 2 of the tagged fish showed daily site fidelity.
  Source: Humston, R., Ault, J.S., Larkin, M.F., Luo, J. (2005) *Marine Ecology Progress Series* 291:237–248, https://doi.org/10.3354/meps291237.
  Sureness: firm.
- **School sizes.**
  - Tagged fish rejoined schools of **3–20** within 24 h (Colton & Alevizon 1983; firm).
  - Schools of up to about 100; 4–6 fish is common. Big adults are often solitary or in pairs, and smaller fish are more social. Feeding is often in water under 30 cm. Schools spread out while feeding and regroup when startled.
    Source: Florida Museum of Natural History, "Bonefish" species profile (Sean Morey), https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/bonefish/.
    Sureness: good.
  - Pre-spawning aggregations "often >1,000" fish gather for **4–7 days around full and new moons**, mainly October–May, near the Exuma Sound drop-off. They return to flats under 2 m shortly after.
    Source: Danylchuk, A.J. et al. (2011) "Aggregations and offshore movements as indicators of spawning activity of bonefish (*Albula vulpes*) in The Bahamas", *Marine Biology*, https://doi.org/10.1007/s00227-011-1707-6 (PDF https://goldberglab.wisc.edu/pdf/P076.pdf).
    Sureness: firm. This is a moon tie-in if wanted.
  - Schools are fluid: a tagged school split into two sub-schools within hours and stayed apart for months (Murchie et al. 2013; firm).
- **Tailing, mudding, cruising.**
  - Tailing on very shallow flats: Florida Museum photo caption (good).
  - Fins exposed in under 0.1 m; "mudding" defined as the turbidity from feeding in the bottom (Colton & Alevizon 1983; firm).
  - "Face-wedging" feeding ethogram: Murchie PhD thesis, Carleton 2010, ch. 6, https://www3.carleton.ca/fecpl/pdfs/KJM%20PhD%20thesis%202010.pdf (firm).
  - Nervous water and shadows as cues: guide lore (see the spooking section and item 4).
- **Water temperature.**
  - Critical thermal maximum: **36.4 ± 0.5 °C** for fish acclimated to 27.3 °C, and **37.9 ± 0.5 °C** at 30.2 °C acclimation.
  - Creek backwaters reached 40.6 °C (June) and fell to 9.0 °C (January), with daily swings up to 11.4 °C. Fish were not detected in backwaters while they were over CTmax.
  - Source: Murchie, K.J., Cooke, S.J., Danylchuk, A.J., Danylchuk, S.E. et al. (2011) "Thermal biology of bonefish (*Albula vulpes*) in Bahamian coastal waters and tidal creeks: an integrated laboratory and field study", *Journal of Thermal Biology* 36(1):38–48, https://doi.org/10.1016/j.jtherbio.2010.10.005.
  - Sureness: firm.
  - Water during tracks was 24–32 °C. Large fish (over 55.5 cm fork length) are rare on the flats in summer and return in the fall as the water cools (Colton & Alevizon 1983; firm).
  - Preferred: mid-70s to mid-80s °F (about 24–29 °C), per fisheries biologist Derke Snodgrass quoted in Salt Water Sportsman, "How to Catch Bonefish" (Scott Leon, 2013), https://www.saltwatersportsman.com/?p=48857. Sureness: good/guide lore.
  - Below about 60 °F (15.6 °C) is too cold. The 2010 Keys cold fronts took flats to the low 50s °F and killed bonefish in the shallows (Aaron Adams, BTT, quoted).
    Source: Florida Sportsman, "Gray ghost vanishing act" (Doug Kelly, 2013), https://floridasportsman.com/editorial/gray-ghost-vanishing-act/397690.
    Sureness: good/guide lore.

### Permit (*Trachinotus falcatus*)

- **Groups and habitat.**
  - Juveniles school in about tens; larger permit are solitary or in pairs.
  - Habitat: flats (sand, mud, marl, grass) and adjacent cuts, channels and holes. Often in water under 2 ft, but large adults can't get as shallow as bonefish.
  - They move onto flats on the flood and dig crabs, gastropods, urchins and bivalves out of the bottom.
  - Source: Florida Museum, "Permit" profile (Sean Morey), https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/permit.
  - Sureness: good. Tailing isn't in the profile; see guide lore below.
- **Florida Keys telemetry.**
  - 75% of 45 tagged permit used both nearshore flats (under 3 m) and the reef tract (15–40 m). Flats are for feeding, the reef for spawning. Reef occupancy peaked March–September, most in April–May.
    Source: Brownscombe, J.W. et al. (2020) *Journal of Fish Biology* 96(2):469–479, https://doi.org/10.1111/jfb.14227.
  - Residency rose at a reef spawning site before the full moon. Residency didn't follow water temperature consistently. Seagrass flats within about 10 km of spawning sites matter during the spawning season.
    Source: Brownscombe, J.W. et al. (2023) "Spatial-temporal patterns of Permit habitat residency in the Florida Keys", *Environmental Biology of Fishes* 106:419–431, https://doi.org/10.1007/s10641-022-01332-7.
  - Sureness: firm (abstract level). No permit telemetry relating flats use to tidal stage was found.
- **Wariness.** Permit come onto the flats only to feed (crabs, shrimp), only when tide, wind and temperature suit them, and leave at once if anything looks wrong.
  Source: Bonefish & Tarpon Trust blog (Sue Cocking, 2012), https://bonefishtarpontrust.org/blog/2012-10-17-sue-cockings-permit-pursuit-comes-full-circle.
  Sureness: guide lore.
- **Tailing on crabs, singles and small groups on the outer flats and edges.** Consistent across guides' writing, but no study was found. Sureness: guide lore.

### Tarpon (*Megalops atlanticus*)

- **Rolling (air breathing).**
  - Adults are facultative air breathers: they breathe air more in hypoxia, not after exhaustive exercise. Earlier forced-submersion work had called it obligate.
    Source: Martin, L., Dichiera, A.M., Esbaugh, A.J. (2025) "The role of air breathing in exhaustive exercise recovery in Atlantic tarpon", *Conservation Physiology* coaf089, https://doi.org/10.1093/conphys/coaf089 (PMC https://pmc.ncbi.nlm.nih.gov/articles/PMC12728282/).
    Sureness: firm.
  - Juveniles must breathe air. Adults in well-oxygenated water still roll, probably cued by seeing other tarpon do it (Florida Museum, "Tarpon", https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/tarpon; good).
  - **Sources disagree on obligate vs facultative.**
- **Time of day.** Juveniles in a Caribbean bay were **more active by day than by night, with crepuscular peaks**. At night they stayed in a small shallow lagoon, but left it for deeper water when it went over 30 °C.
  Source: Duffing Romero, M.D., Matley, J.K., Luo, J., Ault, J.S., Pittman, S.J., Nemeth, R.S. (2021) "Movement patterns of juvenile Atlantic tarpon in Brewers Bay, St. Thomas, USVI", *Animal Biotelemetry* 9, https://doi.org/10.1186/s40317-021-00239-x.
  Sureness: firm, but only 4 juveniles. **No adult diel study was found**; the common "tarpon feed at night" claim is unsourced here.
- **Laid up.**
  - Single fish resting or waiting on a tide stage, usually lethargic. They lie in shoreline points and troughs, potholes, creek mouths and sandbar edges.
  - Seen as a fin tip or dorsal, or as a big shape 1–3 ft down. They gulp air when the water is warm and calm. Sun over light sand makes their shadows harder to pick out.
  - The fly has to land about 24 in ahead of the nose.
  - Spooked by hull slap, a trolling motor, a hatch closing, the push pole on rock, loud talk, and sudden movement.
  - Source: Salt Water Sportsman, "Fly Angler's Guide to Laid-Up Tarpon" (Alex Suescun, 2019), https://www.saltwatersportsman.com/fly-anglers-guide-to-laid-up-tarpon.
  - Sureness: guide lore. **"Laid up at dawn" isn't supported.** One Key West fly report waited until "the sun got up a bit" to see laid-up fish (https://midcurrent.com/?p=5294); dawn-calm is when *rolling* fish show best (Coastal Angler, https://coastalanglermag.com/?p=105622). Laid-up fish want calm water and enough sun to be seen; rolling wants calm, dawn included.
- **Cold.**
  - Juvenile tarpon lost equilibrium at 11.3 °C (30 ppt) and 12.7 °C (1 ppt).
    Source: Coffill-Rivera, M.E. et al. (2023) *Journal of Fish Biology* 103(2):272–279, https://doi.org/10.1111/jfb.15451.
  - A pooled juvenile minimum lethal temperature of 12.0 ± 2.8 °C: *Environmental Biology of Fishes*, https://doi.org/10.1007/s10641-017-0619-9 (title not verified).
  - Sureness: firm for juveniles; adult figures found were unsourced.

### Common snook (*Centropomus undecimalis*)

- **Habitat and behaviour.** Inshore along mangrove shorelines, seagrass, beaches and structure. They face into moving water and wait for prey to be carried to them (ambush).
  Source: FWC, "Snook" profile, https://myfwc.com/wildlifehabitats/profiles/saltwater/snook/snook/.
  Sureness: good. "Lying still along the edge" is the same behaviour as guides describe it (guide lore).
- **Range.**
  - Abundant from Cape Canaveral through the Keys and Dry Tortugas (Florida Museum, https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/common-snook/).
  - FishBase lists most of the Antilles but doesn't name the Bahamas (https://www.fishbase.se/summary/Centropomus-undecimalis.html).
  - Sureness: good. **Whether snook are established in the Bahamas wasn't confirmed** by these sources.
- **Cold. Sources disagree.**
  - FWC says snook "cannot tolerate water temperatures below 60° F" (15.6 °C).
  - The Florida Museum gives lower lethal limits of 6–12 °C for adults and 9–14 °C for juveniles.

### Redfish (red drum, *Sciaenops ocellatus*)

- **Range.**
  - FishBase: "Massachusetts in USA to northern Mexico, including southern Florida" (https://www.fishbase.se/summary/Sciaenops-ocellatus.html).
  - ASMFC: Atlantic coast to **Key West** (ASMFC Red Drum fact sheet, https://asmfc.org/wp-content/uploads/2024/12/RedDrum.pdf).
  - Florida Museum: Cape Cod to Tuxpan, Mexico (https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/red-drum/).
  - **None includes the Bahamas.** Sureness: good. The game's FishTable note holds, and Key West (24.55°N) is about the limit. A redfish at 24°N is right at the southern edge; on a Bahamas-like island it would be out of range.
  - Redfish are a mainstay of Florida Bay and the Everglades backcountry: Salt Water Sportsman, "Florida Bay and Everglades National Park: Flats-Fishing Paradise", https://www.saltwatersportsman.com/?p=54535 (guide lore).
  - Few red drum larvae were found in Everglades National Park (Florida Bay), so they spawn outside it: Powell's larval surveys (1987 and 2002), Fishery Bulletin, https://spo.nmfs.noaa.gov/sites/default/files/20powell.pdf (good, from a search summary; which of the two papers is at that URL wasn't checked).
- **Habitat and temperature.** Sand, mud flats, seagrass, oyster bottom and surf; solitary or schooling; tolerates 4–34 °C (Florida Museum; good).
- **Tailing and pushing water.** These are guide lore; no study was found.
  - Tailing: head-down rooting for crabs and shrimp with the tail out.
  - Push: a bulge from the broad head with a long V behind, swimming straight; more often seen than tails.
  - Fewer tails on windy days.
  - Sources: guide sites in the search (e.g. https://kayakanglermag.com/tactics-skills/redfish-coast, https://castandspear.com/tailing-redfish/).

### Spotted seatrout (*Cynoscion nebulosus*)

- **Range.**
  - FishBase: "New York to southern Florida in USA and the entire Gulf of Mexico" (https://www.fishbase.se/summary/Cynoscion-nebulosus.html).
  - Florida Museum: Cape Cod to southern Florida and the Gulf (https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/spotted-seatrout/).
  - Not the Bahamas. Sureness: good.
  - Seatrout spawn in Florida Bay: their larvae dominate the bay's collections (Powell, NOAA Fishery Bulletin, link above; good).
- **Over grass.**
  - Shallow coastal water over sand and seagrass, to about 10 m. They are with seagrass beds in summer and move to deeper pockets in cool months.
  - Adults swim in small schools, "especially with incoming tides". They are ambush predators.
  - Source: Florida Museum (good).

### What spooks them, and how near an angler gets

- **No flight-initiation-distance study for any flats fish was found** (none found).
  - The general fish FID literature measures underwater approaches by divers and snorkelers on reefs, not anglers above water. In it, FID rises with fish body size and with fishing pressure.
  - Sources: Samia, D.S.M. et al. (2019) "A meta-analysis of fish behavioural reaction to underwater human presence", *Fish and Fisheries* 20(5):817–829, https://doi.org/10.1111/faf.12378; Nunes, J.A.C.C. et al. (2018) *Marine Environmental Research* (FID higher outside MPAs), https://blumsteinlab.eeb.ucla.edu/wp-content/uploads/sites/104/2018/02/Nunes_etal_2018_MER.pdf.
  - Sureness: good, but not transferable to numbers for the flats.
- **Guides' list (bonefish).**
  - An idling engine spooks fish "for many hundreds of yards", so stop 100 yd or more off the flat and pole in.
  - Bow wakes from a rocking skiff, waves slapping the hull, dropped pliers and hatches.
  - Long early or late shadows.
  - For cruisers, the fly should land a few inches past the fish; the "window" is 2 to more than 6 ft depending on depth.
  - Casts run about 45 ft (novice) to 65 ft (skilled).
  - Source: Chico Fernández, "Close to the Bone", MidCurrent 2011, https://midcurrent.com/techniques/close-to-the-bone/.
  - Sureness: guide lore.
- **Wading.** Shuffle and don't lift the feet; minimise false casts, whose shadow and motion spook fish; don't rush a tailing fish; wading is stealthier than standing on a skiff.
  Source: Salt Water Sportsman, "Wading for Bonefish" (2018), https://www.saltwatersportsman.com/wading-for-bonefish/.
  Sureness: guide lore.
- **Calm water.** On glassy days the push of water from footsteps can send fish off.
  Source: seen only in a search snippet, probably Angler Adventures, https://www.angleradventures.com/weather-conditions-and-fishing-techniques-adapting-your-approach/ (not opened).
  Sureness: guide lore, unverified at source.
- **Height cuts both ways.** Tall bow stands show more water but can spook redfish.
  Source: Louisiana Sportsman, "Pros and cons: Best stand height for sight-fishing reds" (Devin Denman, 2017), https://www.louisianasportsman.com/?p=61473.
  Sureness: guide lore. The optics below show why (derived).

### Seeing them: eye height, the sun, the glasses, clouds

- **No study measured spotting distance against eye height, sun or cloud** (none found). Guides agree that "Height is huge when it comes to sight fishing". They also agree on sun behind you, best from about 10 a.m. to 2 p.m., and that summer afternoon cloud ruins it.
  Source: Florida Sportsman, "Six ways to see fish better" (Brenton Roberts, 2016), https://floridasportsman.com/editorial/six-ways-see-fish-better/397867.
  Sureness: guide lore.
- **Geometry** (derived). A spot d metres off is seen at atan(h/d) below the horizon.

  | Eye height | 10 m | 20 m | 30 m |
  |---|---|---|---|
  | Seated kayak 0.8 m | 4.6° | 2.3° | 1.5° |
  | Standing 1.6 m | 9.1° | 4.6° | 3.1° |
  | Poling platform 2.5 m | 14.0° | 7.1° | 4.8° |

  For a given viewing angle, the distance scales with eye height. A platform at 2.5 m sees at 31 m what a seated kayaker sees at 10 m.
- **Fresnel reflection** (derived; seawater n = 1.34). Reflectance of the surface for skylight, by angle below the horizon:

  | Angle below horizon | Unpolarised R | Rp (what a vertical-axis polariser lets through) |
  |---|---|---|
  | 2° | 0.81 | 0.75 |
  | 3° | 0.72 | 0.66 |
  | 5° | 0.59 | 0.49 |
  | 7° | 0.48 | 0.37 |
  | 10° | 0.35 | 0.24 |
  | 15° | 0.22 | 0.11 |
  | 20° | 0.14 | 0.05 |
  | 37° | 0.04 | ≈0 (Brewster) |
  | 90° (straight down) | 0.02 | 0.02 |

  - Brewster's angle for water is about **53° from the vertical, 37° below the horizon**. There the reflection is fully polarised and polarised glasses remove it.
  - At the low angles where fish are spotted, most of the glare is p-polarised as well, so the glasses only help partly. At 20 m:
    - seated: about 0.72 of the skylight still reflected through the lens;
    - standing: about 0.52;
    - platform: about 0.36.
  - The light coming up from the bottom is transmitted at (1 − R), about 0.2–0.5 at those angles. So contrast rises steeply with height: that is why height matters.
  - The same (1 − R) dims the angler as the fish sees him low on the horizon, through the edge of Snell's window (critical angle 48.6°). A taller angler sits higher in the window and is seen better. This is consistent with the guides' "tall stands spook fish".
  - Sources for the physics: HyperPhysics, "Fresnel Equations", http://hyperphysics.phy-astr.gsu.edu/hbase/phyopt/freseq.html; Mobley, *Ocean Optics Web Book*, "The Level Sea Surface", https://oceanopticsbook.info/view/surfaces/the-level-sea-surface; polarization.com, "Polarization of water reflections", https://polarization.com/water/water.html (it gives maximum polarisation of sun glare with the sun about 37° up, and little help with a very low or very high sun on calm water).
  - Sureness: the physics is firm; how it turns into spotting range is derived.
- **A cloud over the water** (derived). Under clear sky with a high sun, diffuse skylight is under about 10% of the total.
  Source: AMS Glossary of Meteorology, "Diffuse sky radiation", https://glossary.ametsoc.org/wiki/Diffuse_sky_radiation (good).
  - A cloud's shadow therefore cuts the light on the bottom, and so the light coming up from fish and sand, to roughly a tenth. The surface meanwhile reflects a bright white cloud instead of blue sky.
  - Contrast collapses, which matches the guides. Rain roughens the surface and breaks up both the glare and the view (not sourced numerically).

### The grand slam

- A **bonefish, permit and tarpon in one day** is the classic flats "grand slam". That is anglers' usage (e.g. Keys Weekly, https://keysweekly.com/?p=13014; MidCurrent Travel, https://travel.midcurrent.com/?p=3104). Sureness: good.
- **IGFA's formal Inshore Grand Slam** is wider: **any three species from its inshore list in one calendar day**, under IGFA rules. Four in a day is a Super Grand Slam, five a Fantasy Slam, and all 13 over a lifetime a Royal Slam. The club began with four species: bonefish, tarpon, permit and snook.
  Source: IGFA, "Inshore Slamming" (Matt Harris, 2019), https://igfa.org/?p=32483. IGFA's slam-club list shows Tarpon + Permit + Atlantic Bonefish slams (e.g. Cudjoe Key, June 2023) beside Tarpon + Snook + Bonefish ones: https://igfa.org/wp-content/uploads/2023/07/IASlamsAndTrophyClubs.pdf.
  Sureness: firm.
  - **So M17's bonefish/permit/tarpon slam is the traditional definition, not IGFA's only one.** The "Super Slam" adds a snook (Tackle Village, https://tacklevillage.com/?p=2024968; guide lore).

---

## 3. The kayak: Perception Pescador 12.0

- **Maker's specs** (Confluence Outdoor, "Perception Pescador 12.0 Fishing Kayak", SKU 9350178031, https://www.confluenceoutdoor.com/products/perception-pescador-120-fishing-kayak-9350178031):
  - sit-on-top, hardshell;
  - length 144 in (365.76 cm);
  - **beam 32.5 in (82.55 cm)**;
  - height 14.5 in (36.83 cm);
  - weight 60 lb (27.22 kg);
  - **max capacity 375 lb (170.1 kg)**;
  - adjustable footpads.

  Sureness: firm.
  - Retailers disagree on weight (about 64 lb in several listings). One listing shows 12 ft 9 in, 28 in and 350 lb, probably another model. The Pescador **Pilot** 12.0 (pedal, 33.8 in, 475 lb) and **Pro** 12.0 (raised seat) are different boats.
- **Not rated for standing.**
  - The maker's page says nothing about standing. It claims "extreme stability", "stability that lets you relax", and that the 375 lb rating improves stability. There is no stand-up deck, standing pad or stand-assist.
  - Reviews say the seat sits right on the deck, so standing up and sitting down isn't easy. Its "flexible secondary stability" limits stand-up fishing; the Pescador Pro 12 or a stand-up design is the better pick for standing.
  - Review sources: Paddling Magazine review, https://paddlingmag.com/boats/perception-pescador-12/; PaddlingSpace, https://paddlingspace.com/?p=4464. Both blocked direct fetching here; seen via search summaries only.
  - Sureness: the maker's silence is firm; the reviews' verdict is good but unverified at source. **No maker statement either way was found.**
- **Anglers do stand in sit-on-tops to sight-fish.**
  - Builders design for it: tri-hulls and catamaran sterns, a 36 in beam (Diablo Adios), raised seats and mini poling platforms about 16 in up. The aim is a higher line of sight.
    Source: Texas Saltwater Fishing Magazine, "New Designs for Stand-up Sight-fishing" (Scott Null, 2012), https://texassaltwaterfishingmagazine.com/fishing/by-type/kayak-fishing/new-designs-stand-sight-fishing.
    Sureness: good.
  - Stand-up fishing kayaks are usually 32–36 in in beam, with flat or pontoon hulls; wind is the main limit.
    Source: retailer guides, e.g. https://reelyaks.com/blogs/news/how-to-fish-standing-up-from-kayak-safety-technique.
    Sureness: weak. The Pescador's 32.5 in sits at the narrow end of that, with a hull not built for it.
  - Standing in calm water with care is plausible; standing as a matter of course is not what she's made for. If the game lets her be stood in, a narrow window (calm water only, a wobble, a fall risk) is the realistic reading.

---

## 4. Photograph and video references (links only; nothing downloaded)

Checked by a helper agent.
- **viewed**: the page was opened and the image looked at.
- **caption**: the caption and credit were confirmed but the image wasn't looked at.
- **title**: for videos, the title, channel and description were read but the video wasn't watched.

### Bonefish

- **Tailing:**
  - https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/bonefish/ — Florida Museum, photo © Kenneth Krysko; several tails out of rippled water (viewed).
  - https://www.youtube.com/watch?v=LQbx8B_aFh4 — Deneki Outdoors; one fish tailing, South Andros (title).
  - https://www.youtube.com/watch?v=_8p-0pPBbOU — Angling Destinations; Little Abaco (title).
  - https://www.youtube.com/watch?v=l5Hfw0ZnJ1g — Sam Root; Florida Keys (title).
- **Mudding:**
  - https://www.floridasportsman.com/editorial/how-to-read-water-flats-surf-muds-bait-bottom/474760 — Florida Sportsman (2023); a milky silt streak left by a bonefish on a grass flat (viewed).
  - https://www.youtube.com/watch?v=m7z0beK-4LE — Bermuda, not the Bahamas (title).
  - No good large-school mud seen from above was found.
- **Nervous water:**
  - https://www.youtube.com/watch?v=0mQcjnEAEQ0 — Deneki; Andros South (title).
  - No still photo shows it clearly.
- **Shadow:**
  - https://deneki.com/2012/02/bonefish-shadow/ — photo Louis Cahill, South Andros; a fish and its dark shadow on sand (viewed).
  - https://deneki.com/2015/05/spotting-shadows/ — photo Peter Viau; a realistic hard-to-see view (viewed).
- **From above (drone):**
  - https://www.youtube.com/watch?v=ckD4gX1LThg — Andros, Conch Sound (title).
  - https://www.youtube.com/watch?v=5F2ucQ81hkw — location not stated (title).

### Permit

- https://nick-price-d3tv.squarespace.com/fly-fishing-photography-blog/tailing-permit — Nick Price; black sickle tail and fin out, Puerto Rico (viewed).
- https://www.youtube.com/watch?v=GygTST_rcpI — Tailwaters, "Tailing Permit" (title).
- https://www.youtube.com/watch?v=Iy3aWRMYyYA — Saltwater Experience, Florida (title).
- https://www.youtube.com/watch?v=uPjhFQyvpHE — permit tailing repeatedly, Mahahual, Mexico (title).
- https://www.youtube.com/watch?v=K2YSsttPhUA — a big school, Lower Keys; not tailing (title).

### Tarpon

- **Rolling:**
  - https://flylordsmag.com/why-do-tarpon-roll/ — Flylords (2025); backs and dorsals breaking calm water, mangroves behind (viewed).
  - https://www.sportfishingmag.com/gallery/2014/02/fabulous-fishing-photos-jason-stemple — Jason Stemple, slide 25 "Cruising", Islamorada (caption).
  - https://www.youtube.com/watch?v=0CtDKO3JLhQ — Sam Root, slow-roll footage (title).
- **Laid up:**
  - https://www.saltwatersportsman.com/fly-anglers-guide-to-laid-up-tarpon — photos Alex Suescun: a single fish from above in clear shallow water (viewed), and a laid-up fish gulping air (caption).
  - https://www.sportfishingmag.com/20-striking-photos-fishing-florida-and-bahamas — Jason Stemple; a tarpon seen straight down just under the surface, Islamorada (viewed).
  - https://www.youtube.com/watch?v=QY8GM0ii39U — laid-up tarpon in clear water, Lower Keys and Key West (title).

### Snook

- **No verified view from above of snook along mangrove roots.**
- https://www.youtube.com/watch?v=_IWfWEO0a-0 — Salt Strong; drone, five big snook on a Tampa Bay flat (title).
- https://www.youtube.com/watch?v=nrA6H3ugMe4 — drone, a big snook off a Central Florida beach (title).
- https://www.youtube.com/watch?v=Zbzr9ZBT_Ik — drone, snook and tarpon schools off Boynton Beach (title).
- Fallback: https://commons.wikimedia.org/wiki/File:Snook_(159046493).jpg — Clinton & Charles Robertson, CC BY-SA 2.0; underwater, over sand, Jupiter FL (viewed).

### Redfish

- **Tailing:**
  - https://www.sportfishingmag.com/gallery/2014/02/fabulous-fishing-photos-jason-stemple — slide "This Must be Heaven!"; dozens of tails across a **Florida Bay** flat (viewed).
  - https://www.sportfishingmag.com/20-striking-photos-fishing-florida-and-bahamas — tailing reds in spartina and at Folly Beach, SC (caption).
  - https://www.youtube.com/watch?v=smWZkopr7C0 — Mosquito Lagoon (title).
- **Push:** no still photo was found.
  - https://www.youtube.com/watch?v=UXxhwEvRzQI — Texas; wakes, boils and mud (title).
  - https://www.youtube.com/watch?v=1wtNa4zWCq8 — North Carolina; "a nervous push" (title).

### Spotted seatrout

- **No top-down still over grass was found.**
- https://www.floridasportsman.com/editorial/florida-seatrout-fishing-update/518026 — photo Pat Ford; underwater side view over turtle grass (viewed).
- https://www.youtube.com/watch?v=B-RVBw1WVSk — drone, a trout school in under 12 in of water (title).
- https://www.youtube.com/watch?v=8S0WVxMnbp0 — reds and trout on Pensacola grass flats (title).

### A dry flat at low tide

- **No photo of bared seagrass out of the water was found.**
- https://commons.wikimedia.org/wiki/File:Bahamas_1989_(741)_Long_Island_(26121739226).jpg — Rüdiger Stehn, CC BY-SA 2.0; a bared pale sand flat with mangrove seedlings and a grounded skiff, Long Island, Bahamas (viewed).
- https://commons.wikimedia.org/wiki/File:Low_Tide_at_Sampson_Cay_(3425533485).jpg — cogdogblog, CC0; rippled sand bared at low tide, Exumas (viewed).
- https://commons.wikimedia.org/wiki/File:Low_Tide_in_the_Creek_-_panoramio.jpg — Oscar Flowers, CC BY-SA 3.0; a drained creek with pools, skiffs, pitted limestone and young red mangroves, South Andros (viewed).
- https://floridakeys.noaa.gov/education/tidepools.html — NOAA Florida Keys National Marine Sanctuary; a limestone rock flat bared with tide pools (viewed).

### Mangrove prop roots at low water

- https://commons.wikimedia.org/wiki/File:Rhizophora_mangle_(red_mangroves)_(San_Salvador_Island,_Bahamas)_7_(15786145972).jpg — James St. John, CC BY 2.0; prop roots arching well clear of the water; tide state not stated (viewed).
- https://commons.wikimedia.org/wiki/File:Gfp-florida-biscayne-national-park-mangroves.jpg — Yinan Chen, public domain; roots bared over limestone with a dark band at the waterline, Biscayne National Park (viewed).
- https://commons.wikimedia.org/wiki/File:Low-tide_mangrove,_NPSphoto_(9258081478).jpg — NPS Everglades, public domain; Florida Bay at low tide (viewed).
- The South Andros creek photo above also shows exposed young red mangrove roots.

### Intertidal wet band

- **No clear Bahamas or Keys photo of a wet band on pilings was found.**
- https://commons.wikimedia.org/wiki/File:Intertidal_notch_(bioerosion_notch)_(northern_end_of_North_Point_Peninsula,_San_Salvador_Island,_Bahamas)_1_(15814993988).jpg — James St. John, CC BY 2.0. A limestone notch at low tide, with a dark algae shelf bared at its base. The description says the notch's top marks spring high water. Viewed.
- https://commons.wikimedia.org/wiki/File:Intertidal_notch_(bioerosion_notch)_(northern_end_of_North_Point_Peninsula,_San_Salvador_Island,_Bahamas)_2_(15816643277).jpg — the same notch at high tide; a good pair with the one above (viewed).
- https://people.bu.edu/golubic/notch.html — S. Golubic, Boston University; a small, low-resolution notch photo, Lee Stocking Island, Exumas (viewed).
- Weak piling examples, with the band faint:
  - https://commons.wikimedia.org/wiki/File:Old_Jaws_Dock_Pilings_-_panoramio.jpg — Oscar Flowers, CC BY-SA 3.0; Clifton, New Providence.
  - https://commons.wikimedia.org/wiki/File:PELICANS_ON_DOCK_PILINGS_AT_CONCH_KEY_-_NARA_-_548728.jpg — Flip Schulke, public domain; Conch Key, 1973.

---

## Corrections and cautions for M17

- **"Telemetry at Cape Eleuthera found them coming onto the flats with the high tide":** close. The detections run from about 3 h into the flood to about 3 h into the ebb, with almost none in the last 2 h of the ebb or the first 2 h of the flood (Murchie et al. 2013, Table 3).
- **Tarpon "laid up at dawn":** not supported. Laid-up fish need calm water and enough sun to be seen. Dawn-calm suits rolling fish.
- **Redfish "the easiest":** that's guide lore, and redfish are at or past their range limit at 24°N. They are absent from the Bahamas by every source.
- **The tide's size:** Settlement Point's 0.93 m is the great diurnal range; the mean range is 0.83 m.
  - Springs average about 0.97 m and neaps about 0.64 m; perigee alignment moves springs between about 0.75 and 1.1 m.
  - In Keys-like water the range is about half that and visibly mixed.
  - Behind a bank or mudbank the tide is hours late and up to about half the size (Andros, Eleuthera west, Florida Bay).
