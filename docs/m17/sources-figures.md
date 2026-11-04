# M17: M16's unsourced figures, checked against sources

Checked 2026-11-04 against the `m17-proposal` branch (916aea2). Nothing in the project was changed. Paths are relative to the repo root. "Derived" means I worked a number out from a sourced formula or figure; it is not a measured result. Sources are summarised, with at most one short quote each.

Verdicts, in short:

| # | Figure | Verdict |
|---|---|---|
| 1 | VHF: handheld 9 km, fixed set 37 km | The handheld's range is about right. The fixed set's 37 km holds only if Marta's antenna is about 50 m up. Better to work each range out from the two antenna heights |
| 2 | Flare: 5 km by day, 25 km by night | Night is about right. Day is too far: 2.5 to 3.5 km |
| 3 | Ice: a 10 lb bag lasts about 15 h in a cheap cooler; the insulated box melts at 0.6 of that | The cheap cooler is at the hot, busy end; about 23 h fits better. The insulated boxes melt about twice too fast |
| 4 | Water: 4 litres a day | That's the minimum. About 6 litres for a day working in tropical sun |
| 5 | Billfish depths; swordfish under the full moon | Sailfish's range stands. White and blue marlin should be shallower at night. The full-moon effect on swordfish is real, and Lerner 2013 measures it |
| 6 | Hauler 240 ft/min; soak τ = 3 nights, fade after 14 days | The hauler speed stands (within makers' specs). τ is too slow: Austin's fit puts about 3/4 of a two-week catch in the first night |
| 7 | Holds 10 / 18 / 40 kg; dehooker 6 m / 2.5 m | The holds are close to what's reported. Separate problem: `lineKg` is about 1.9× the labelled line strength. The dehooker's 6 m only works if it's measured from the leader |
| 8 | Underwater-light photos | Three candidate links. I haven't opened any of them |
| 9 | Lobster boat foredeck and roof | Usually a narrow side deck with handrails, or the V-berth's hatch. Not through the windscreen |

---

## 1. VHF ranges

**The game now.**
- `src/game/Seaworthy.js:171`: the comment says a handheld's 5 W "at sea level, to about 5 miles", and a fixed set's 25 W "on a mast, to about 20".
- `Seaworthy.js:174`: `VHF_HAND_M = 9000` (4.9 nm) and `VHF_FIXED_M = 37000` (20 nm).
- `Seaworthy.js:194-195`: the shop's labels read "5 miles" and "8 ft whip (20 miles)".
- `Seaworthy.js:186-187`: the lobster boat and the sportfisher get the same 37 km.
- `src/game/DaysOut.js:611` and `src/game/Radio.js:273`: the reach is checked against the distance to her berth, i.e. Marta's shore set. No range depends on either antenna's height.
- `docs/m16/days-out.md:48`.

**Sources.**
- **Line of sight.** Bowditch, *The American Practical Navigator*, Ch. 22 (NGA; [Wikisource](https://en.wikisource.org/wiki/The_American_Practical_Navigator/Chapter_22)) gives the radar horizon as D = 2.21 √h, with D in nm and h in metres (1.22 √h for h in feet). VHF uses the same 4/3-earth horizon. The range between two stations is the sum of their two horizons.
- **Maker.** The Standard Horizon HX-870 manual ([manualsdir](https://www.manualsdir.com/manuals/775752/standard-horizon-hx-870.html?page=9)) says a fixed 25 W set can reach "greater than 15 miles", and a 6 W portable more than 5 miles in line of sight. It also says range depends much more on the antenna's type, gain and height than on transmitter power. The HX-500S manual says 2 to 5 miles for a 5 W portable.
- **US Coast Guard.** Rescue 21 (the Coast Guard's coastal VHF network) must hear a 1 W set with its antenna 2 m above the sea out to 20 nm. That is a minimum, and it's met from tall towers ([Ocean Navigator](https://oceannavigator.com/?p=6529), [Defense Media Network](https://www.defensemedianetwork.com/stories/rescue-21-much-more-than-a-mayday-message-coast-guard-outlook-2020-2021-edition/), [GD Mission Systems](https://gdmissionsystems.com/articles/2015/01/22/news_1-22-2014-rescue-21)). I couldn't open NAVCEN's own pages (they returned 403).

**Derived ranges.** Radio horizon only, for these heights: a handheld at 1.5 m; a console's whip at about 3.5 m (base about 1.5 m plus the middle of an 8 ft whip); the lobster boat's roof whip at about 4.5 m; the sportfisher's tower at 8 to 10 m. Ranges are in nm, with km after the slash.

| | Handheld 1.5 m | Console 3.5 m | Lobster boat 4.5 m | Sportfisher 8 m | Shore 10 m | Shore 30 m | Shore 50 m |
|---|---|---|---|---|---|---|---|
| Handheld | 5.4 / 10 | 6.8 / 13 | 7.4 / 14 | 9.0 / 17 | 9.7 / 18 | 14.8 / 27 | 18.3 / 34 |
| Console | | 8.3 / 15 | 8.8 / 16 | 10.4 / 19 | 11.1 / 21 | 16.2 / 30 | 19.8 / 37 |
| Lobster boat | | | 9.4 / 17 | 10.9 / 20 | 11.7 / 22 | 16.8 / 31 | 20.3 / 38 |
| Sportfisher 8 m | | | | 12.5 / 23 | 13.2 / 25 | 18.4 / 34 | 21.9 / 41 |

**Verdict.**
- **Handheld, 9 km.** It stands as a handheld-to-boat range (Standard Horizon: about 5 miles). To a shore station it's on the safe side: even a 10 m mast at the waterfront gives about 18 km.
- **Fixed set, 37 km (20 nm).** This needs Marta's antenna about 50 m up, on a hill or a tower; for the console that works out at 51 m. The village sits in a valley by the bay (`TerrainData.js`: "spurs framing the village valley"). With a mast there of about 10 m, it should be about 21 km for the console, 22 km for the lobster boat and 25 km for the sportfisher. Boat to boat it's 15 to 23 km.
- **Recommendation.** Work the range out from both heights, d_km = 4.12 (√h_boat + √h_shore), once Marta's antenna height is chosen. If her antenna goes up the hill, the handheld's range to her grows too: at 50 m it's 34 km, nearly the fixed set's. The only things that make 37 km and 9 km differ are the boat's antenna height, and talking to boats rather than to the shore.
- "Miles" in the labels is ambiguous: 37 km is 20 nm, or 23 statute miles.

---

## 2. A flare's reach

**The game now.**
- `src/game/Seaworthy.js:171,174`: `FLARE_M = { day: 5000, night: 25000 }` (2.7 and 13.5 nm), times the weather's `visibility` (`DaysOut.js:564`).
- `DaysOut.js:32`: `FLARE = { rise: 28, up: 120, burn: 8 }` (m/s, m, s).
- `docs/m16/days-out.md:57`: "Seen by day within 3 miles of the island, 15 on a clear night".
- There is one kind: a red meteor. There are no hand flares.

**Sources.**
- **US recreational aerial flare, red meteor or parachute.** 46 CFR 160.066-7 ([LII](https://www.law.cornell.edu/cfr/text/46/160.066-7)): at least 10,000 cd peak, at least 5.5 s of red, at least 1,000 candela-minutes, and it must burn out before it falls back to the launch height. There is no altitude rule.
- **Maker.** Orion's 12-gauge red meteor ([West Marine](https://www.westmarine.com/orion-12-gauge-high-performance-red-meteor-flares-9376443.html)): up to 500 ft (150 m), 16,000 cd, about 7 s.
- **US hand-held rocket parachute flare.** 46 CFR 160.036-4 ([LII](https://www.law.cornell.edu/cfr/text/46/160.036-4)): at least 150 m, at least 20,000 cd average, at least 30 s, descending no faster than 4.5 m/s.
- **SOLAS** (the international Safety of Life at Sea rules), IMO LSA Code (MSC.48(66)) 3.1 and 3.2 ([IMO PDF](https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MSCResolutions/MSC.48(66).pdf)). Rocket parachute flare: at least 300 m, at least 30,000 cd, at least 40 s, at most 5 m/s down. Hand flare: at least 15,000 cd for at least 1 minute.
- **US hand flare.** 46 CFR 160.021: 500 cd for 2 minutes (cited in the report below).
- **Seen by day.** USCG Research and Development Center, *Daytime Distress Signal Effectiveness*, CG-D-04-20, Dec 2019 ([PDF via Safety4Sea](https://safety4sea.com/wp-content/uploads/2021/03/USCG-Daytime-Distress-Signal-Effectiveness-2019_12.pdf)).
  - At 2 nm, observers on shore could only regularly pick out the orange flag and the SOLAS-rated flares.
  - The 500 cd hand flare was hard to see even at ½ mile in sun.
  - By IALA's figures (the lighthouse authorities' standard), a light needs 1,600 to 4,000 cd to be identifiable by day at ½ mile.
  - The report: the SOLAS flare "proved 'easy to see' in bright sun".
- **Makers' claims.** A SOLAS parachute rocket is "visible about 30 miles" at night. That's a marketing figure, unverified.

**Derived.** These use Allard's law, the standard sighting law for lights, with T = 0.05^(1/V) per nm. The day threshold comes from the RDC's IALA figure, the night one from IALA's 2×10⁻⁷ lx up to 10⁻⁶ lx. The geometric horizon from 150 m is about 29 nm, so it never limits a meteor.

| Signal | By day | By night, 10 nm visibility | By night, 20 nm visibility |
|---|---|---|---|
| Red meteor, 10,000 to 16,000 cd | 0.8 to 1.5 nm (1.5 to 2.8 km) | 11 to 15 nm | 16 to 25 nm |
| SOLAS parachute, 30,000 cd | 1.2 to 2.0 nm | 13 to 17 nm | 20 to 27 nm |
| Hand flare, 500 cd | 0.2 to 0.3 nm | 5 to 8 nm (but the horizon from 2 m to a boat is about 6 nm) | |
| Hand flare, SOLAS 15,000 cd | about 1 to 1.5 nm | limited to about 6 nm by the horizon from 2 m | |

The RDC's 2 nm sightings of SOLAS flares were by observers looking for them, so they come out a little above Allard's figures.

**Verdict.**
- **Night, 25 km (13.5 nm), scaled by visibility.** It stands. It's right for about 10 nm of visibility, and on the safe side for a clear trade-wind night. together.md uses about 30 km, and that would give about 16 to 20 nm.
- **Day, 5 km (2.7 nm).** Too far for a red meteor. It should be about 2.5 to 3.5 km (1.5 to 2 nm): the RDC saw only SOLAS-grade signals regularly at 2 nm, and a meteor burns only 5.5 to 7 s.
- **The flight.** The game's 120 m and 8 s are fine against Orion's 150 m and 7 s. A real meteor is fired much faster than 28 m/s and reaches its height in a second or two, but that's a look, not a figure.
- **If a hand flare or a parachute rocket is ever added:**
  - Hand flare: about 0.3 nm by day (500 cd) and 5 to 6 nm by night, horizon-limited.
  - Parachute: about 2 nm by day, and 13 to 27 nm by night, burning 30 to 40 s.

---

## 3. Ice in a cheap cooler and in a fish box

**The game now.**
- `src/game/Seaworthy.js:102-107`: `ICE_BAG_KG = 4.54`, and `meltKgH = 0.3 × (holdKg/30)^(2/3) × (insulated ? 0.6 : 1)`. The cheap 48-quart cooler (`Gear.js:104`, holdKg 30) melts 0.3 kg/h, a bag in about 15 h (`docs/m16/days-out.md:30`).
- The other boxes in `Gear.js`:
  - the kayak's small cooler, 25 kg (`Gear.js:162`): 0.27 kg/h;
  - the ice chest, 70 kg (`Gear.js:105`): 0.53 kg/h;
  - the insulated fish hold, 160 kg (`Gear.js:106`): 0.55 kg/h;
  - the sportfisher's big insulated fish box, 600 kg (`Gear.js:218`): 1.33 kg/h, about 32 kg a day.

**Sources.**
- **Insulated container, measured.** FAO Fisheries Technical Paper 436, §7.1 ([FAO](https://www.fao.org/4/y5013e/y5013e0a.htm)).
  - A 90 L insulated fish container in the shade, full of ice: 0.15 kg/h (3.6 kg/day) at 28 °C.
  - Melt rate ≈ 0.1233 kg/day per °C of ambient, so about 4.9 kg/day at 40 °C.
  - In the sun the rates "should be upgraded".
  - §6.2.2 lists commercial HDPE insulated containers with 30 to 63 mm of polyurethane at U = 0.31 to 0.55 W/m²K. For the tropics FAO wants at least 75 mm.
- **Uninsulated fish box.** FAO, *Ice consumption* ([FAO](https://www.fao.org/4/r1263e/R1263E08.HTM)): keeping one 50 kg fish box chilled at +30 °C melts about 3 kg/h. That's an uninsulated box; a 35-box stack melts 1 kg/h per box.
- **Marine coolers.** [Practical Sailor, "Coleman Wins Cooler Cool-Off"](https://www.practical-sailor.com/belowdecks-amenities/galley/coleman-wins-cooler-cool-off/): nine 50 to 68 qt marine coolers, 16.5 lb of ice each, lids shut, 80 °F by day and 60 °F at night. Over 5 days they melted 167 to 220 oz, about 0.04 kg/h.
- **Mid-range coolers in hot sun.** [Pew Pew Tactical](https://www.pewpewtactical.com/yeti-igloo-pelican-coolers-review): 52 to 55 qt Igloo, Pelican and Yeti coolers in the North Carolina summer sun, 20 lb of ice, lids latched. All the ice was gone at 60 h, about 0.15 kg/h. With a 12-pack in and the lid opened once, they melted 6.3 to 6.6 lb in the first 24 h.
- **Makers' claims.** Coleman's 48 qt Performance claims 3 days at 90 °F. Igloo's method: filled to 90% with ice at 10 °F, lid shut, a 90 °F oven at 70% humidity, ending when the inside reaches 40 °F ([search summary of igloocoolers.com/pages/testing](https://igloocoolers.com/pages/testing); I couldn't open the page itself). A full 48 qt is about 20 kg of ice, so the claim implies about 0.3 kg/h at a constant 32 °C. That's a maker's figure.
- **Sources disagree.** Shut-lid tests in mild weather give 0.04 kg/h, the hot-sun test 0.15 kg/h, and Coleman's full-cooler claim implies about 0.3 kg/h.

**Derived.** Scaling FAO's 90 L box by surface area gives:
- an equally well insulated 45 L (48 qt) box at 30 °C in shade: about 0.10 kg/h;
- a cheap cooler (thin foam, a leaky lid): 1.5 to 2× that, so 0.15 to 0.2 kg/h in shade;
- in deck sun, opened through the day: 0.2 to 0.3 kg/h.

**Verdict.**
- **Cheap cooler, 0.3 kg/h (a bag in about 15 h).** This is the hot, busy end: full sun and the lid opened all day. A central figure of about 0.2 kg/h (a bag in about 23 h) fits FAO and the sun test better.
- **The insulated boxes melt about twice too fast.** FAO's measured box, scaled by surface area at 28 °C in shade, gives:
  - about 0.26 kg/h for the 160 kg hold (about 200 L), against the game's 0.55;
  - about 0.6 kg/h for the 600 kg box (about 700 L), against the game's 1.33.
- **Recommendation.** One sourced formula would do: insulated melt (kg/day) = 0.1233 × T_air(°C) × (V/90 L)^(2/3). Or keep the game's form and make the insulated factor about 0.3 rather than 0.6.
- FAO's tropical rule of thumb, 1 kg of ice to 1 kg of fish, and the 0.285 kg/kg to chill a fish both stand.

---

## 4. A person's water a day

**The game now.** `docs/m16/days-out.md:34,66` and `docs/M17.md:185` say four litres. The code has no litres: `src/game/Seaworthy.js:146-148` has a day's stores at $12 a day, and you're parched 12 h after they run out.

**Sources.**
- **WHO.** Howard and Bartram, *Domestic Water Quantity, Service Level and Health*, WHO/SDE/WSH/03.02, 2003 ([PDF](https://www.arctic.gov/uploads/assets/watersan6-water-quantity.pdf); [2nd edition, 2020](https://www.who.int/publications/i/item/9789240015241)). Water from food is included in these figures; about a third of it comes from food.
  - Table 2 (water for hydration): 2.9 L a day for an average man and 2.2 L for a woman in average conditions; 4.5 L for "manual labour in high temperatures".
  - Table 1 (IPCS 1994): 2.8 to 3.4 L at a high average temperature of 32 °C; 3.7 L with moderate activity.
  - US Army data (White et al. 1972): about 4.5 L at 25 °C with moderate work in the sun, "about 6 litres at 30 °C".
- **US Army.** TB MED 507, 2022 ([PHC fluid poster](https://ph.health.mil/PHC%20Resource%20Library/cphe-heat-fluid-replacement-poster.pdf)): easy work at WBGT (the heat index the Army uses) of 85 °F or more needs ¾ to 1 quart an hour. Never more than about 1 quart an hour, and 12 quarts a day.
- **FEMA.** [Ready.gov](https://ready.gov/water): at least a gallon (3.8 L) per person per day, for drinking and sanitation. Local agencies add that hot weather can double it.
- **US Coast Guard.** I found no USCG figure for daily water need.

**Verdict.** Four litres stands as a minimum, a gallon by Ready.gov's measure, for a person resting in shade. A day fishing in tropical sun, which is moderate work at 28 to 32 °C, comes to about 6 L. Say 6 L if a figure is ever shown. The code doesn't change either way, because stores are counted in days. The 12 h until parched is unsourced; I didn't check it.

---

## 5. Billfish and swordfish depths; swordfish and the moon

**The game now.** `src/game/FishTable.js`, `at` fields:
- sailfish (line 89): day and night [0, 40] m;
- white marlin (line 90): day and night [0, 90] m;
- blue marlin (line 91): day and night [0, 120] m;
- swordfish (line 96): day [320, 750] m, night [0, 110] m.

`docs/m16/fish.md:31` says the billfish depths are unsourced. `fish.md:22` says the moon isn't modelled.

**Sources.**
- **Sailfish.**
  - Mourato et al. 2010, ICCAT Collect. Vol. Sci. Pap. 65(5):1740 ([PDF](https://www.iccat.int/Documents/CVSP/CV065_2010/n_5/CV065051740.pdf)). Two PSATs (pop-up satellite archival tags) off Brazil: "the vast majority of their time within the upper ten meters". One fish was at 0 to 5 m 71% of the day and 65% of the night; the other at 5 to 10 m about 70% of both. Deepest dives 88 m and 376 m.
  - Kerstetter et al. 2011, *Marine and Coastal Fisheries* 3:353 ([BioOne](https://bioone.org/journals/marine-and-coastal-fisheries/volume-3/issue-1/19425120.2011.623990/Sailfish-Habitat-Utilization-and-Vertical-Movements-in-the-Southern-Gulf/10.1080/19425120.2011.623990.full)), Gulf of Mexico and Florida Straits, 16 fish. Mostly in the top 20 m, with short dives below the mixed layer to 50 to 150 m, more of them by day. The day/night split of top-20 m time came only from a search summary (75.7% vs 46.7%), and that looks inverted; I couldn't check it.
  - Hoolihan 2005, *Marine Biology*, Arabian Gulf ([Springer](https://link.springer.com/doi/10.1007/s00227-004-1488-2)): 84.3% of time above 10 m (from a search summary).
  - Hoolihan et al. 2011b, as cited in Hoolihan 2015: sailfish spent 93% of darkness and 82% of daylight in the surface mixed layer.
- **White marlin.** Hoolihan et al. 2015, *ICES J. Mar. Sci.* fsv082 ([PDF](https://billfish.org/wp-content/uploads/2023/09/vertical-and-horizontal-habitat-use-by-white-marlin-kajikia-albida-poey-1860-in-the-western-north-atlantic-ocean.pdf)), 28 fish.
  - In the upper 20 m: 50.8% of the day and 81.6% of the night.
  - 95.2% of daylight in the upper 100 m.
  - Deepest 387 m.
  - Horodysky et al. 2007 (cited there): 48% of time in the upper 10 m.
- **Blue marlin.** Goodyear et al. 2008, *MEPS* 365:233 ([PDF](https://billfish.org/wp-content/uploads/2023/09/vertical-habitat-use-of-atlantic-blue-marlin-makaira-nigricans-interaction-with-pelagic-longline-gear.pdf)), 51 fish.
  - At night about 50% of time in the top 10 m, 86% in the top 30 m, and under 2% at or below 100 m.
  - By day under 20% above 10 m, about 46% in the top 30 m, and about 17% at or below 100 m: "often at 40 to >100 m".
  - The average maximum depth was 319 m, and one fish went below 800 m.
- **Swordfish.** Lerner et al. 2013, *Trans. Am. Fish. Soc.* 142:95 ([PDF](https://billfish.org/wp-content/uploads/2023/09/swordfish-vertical-distribution-and-habitat-use-in-relation-to-diel-and-lunar-cycles-in-the-western-north-atlantic.pdf)), 8 fish in the Florida Straits.
  - Under 100 m at night and past 400 m by day, crossing between at dusk and dawn. Deepest 1,448 m.
  - **The moon.** Nights under a new moon (0 to 0.25 lit): 82% of the time shallower than 75 m, most often at 25 to 50 m (31%). Under a full moon (0.76 to 1.0 lit): 64% at 100 to 500 m and 36% shallower than 75 m, most often at 100 to 200 m (41%). Depth against the moon's lit fraction gives r² = 0.30, p < 0.0001.
  - The Florida Straits longliners set their hooks deeper the more of the moon was lit (p < 0.0001).
  - The paper says this agrees with Loefer et al. 2007 and Dewar et al. 2011, both in the western North Atlantic. One search summary said Loefer found the opposite sign; Lerner's own text says they agree.
  - Every tagged fish also basked at the surface by day, for 3 to 40 minutes.
- **Longline catches against the moon disagree.**
  - Highest at full moon: Draganik and Cholyst 1988 (central Atlantic) and Santos and Garcia 2005 (Portuguese longline), as cited in a Turkish review ([TrJFAS](https://trjfas.org/pdf.php?id=347)).
  - Higher in the first and last quarters, at weak moonlight: Poisson et al. 2010, Réunion, 2,009 sets ([Fishery Bulletin](https://fisherybulletin.nmfs.noaa.gov/sites/default/files/pdf-content/2010/1083/poisson.pdf)).
  - No effect: Ceyhan et al. 2018 (eastern Mediterranean).
  - Bigelow et al. 1999 (North Pacific): I couldn't check it.

**Verdict.**
- **Sailfish, [0, 40] day and night.** It stands. Night could be [0, 20]; by day the fish dive to 50 to 150 m now and then.
- **White marlin, [0, 90] both.** It stands by day; 95% of daylight is in the top 100 m. At night it should be shallower, about [0, 30], since 82% of the night is in the top 20 m.
- **Blue marlin, [0, 120] both.** By day [0, 120] is fair: the fish mostly hold at 40 to 100 m, with 17% at or below 100 m and dives far deeper. At night it should be about [0, 30] (86% in the top 30 m).
- **Swordfish.** Day [320, 750] stands (sources: past 300 to 400 m). Night [0, 110] is right for a dark night. M17's moon should push the night band down with the lit fraction:
  - new moon: about [0, 75], centred on 25 to 50 m;
  - full moon: about 64% at 100 to 500 m, centred on 100 to 200 m, with a third still above 75 m.
  - Catch rates against the moon disagree across fisheries, so the depth shift is the figure to use. A higher or lower catch at full moon is not established.

---

## 6. The hauler's speed, and a spiny lobster trap's catch against soak

**The game now.**
- `src/game/Traps.js:21-22`: `HAULER_MS = 1.2` m/s (236 ft/min). `docs/m16/traps.md:30` says 240 ft/min, from memory.
- `Traps.js:70`: `SOAK = { most: 3.6, tau: 3, fade: 14, fadeTau: 14, floor: 0.4 }`.
- `Traps.js:98-101`: catch = most × q × (1 − e^(−nights/3)), fading after 14 days toward 40%. `traps.md:22`: chosen to fit a shape.

**Sources, the hauler.** Makers' specs (none is a measured lobster-boat figure):
- [Hydro-Slave 10 hanging hauler](https://go2marine.com/Hydro-Slave-10-Hanging-Hauler) (dealer listing): about 166 ft/min, 5/16 in line on a 5 in sheave, about 350 lb pull, 127 rpm at 4 GPM.
- Mustad Autoline MA HV 50: up to 130 m/min (about 425 ft/min) at 43 L/min. The MA HH 3200 SuperHauler: 150 m/min (about 500 ft/min) ([Mustad](https://mustadautoline.com/produktvalg/haulingunits/)). Both seen only in search results.
- [Marco J0200 24 in Swinghauler](https://mail.marcoglobal.com/potfishing_04.html): an Alaskan crab hauler, at most 600 ft/min and 5,000 lb.
- Electric pot pullers: 115 to 150 ft/min.
- Speed scales with the pump's flow and the sheave's size. I found no field measurement of a lobster boat's hauling speed. The NOAA-funded R. B. Allen report on lobster haulers ([mass.gov](https://www.mass.gov/doc/final-report-on-a-project-designed-to-reduce-damage-to-sinking-groundlines-by-adjusting-lobster/download)) might have one, but it wouldn't open (403).

**Sources, the soak.**
- Austin 1977, "Incorporating soak time into measurement of fishing effort in trap fisheries", *Fishery Bulletin* 75(1):213 ([PDF](https://spo.nmfs.noaa.gov/sites/default/files/pdf-content/fish-bull/austin_0.pdf)). This is the paper traps.md already cites.
  - The fit to Robinson and Dimitriou's 1963 Florida *P. argus* data is catch per trap-day C/D = a·B^(−β), with a = 2.94, β = 0.90, n = 25, R² = 0.86. Since D = B, the catch per haul is C = 2.94·B^0.10.
  - Austin expects the real curve to be "probably sigmoidal" and to peak and fall at long soaks (deaths in the trap, escapes), but leaves that part out as outside normal practice.
  - The range of soak times in the data isn't given in the note.
- *Fisheries Research* 279 (2024), "Refining spiny lobster (*Panulirus argus*) escape and mortality estimates in Florida's lobster trap fishery using long-term video", doi:10.1016/j.fishres.2024.107139 (seen only in search results).
  - Cameras on traps through the fishery's typical 2-week soak.
  - Daily catch rates fell as the soak went on.
  - Octopus and triggerfish ate into the catch.
  - A dead lobster in the trap cut its effective soak by 33%, for about five days while it decayed.
- No Caribbean (Bahamas, Cuba, Belize, Mexico, Brazil) soak-time study turned up.

**Derived.** Austin's curve as a share of the 14-day catch is (n/14)^0.1: 0.77 after 1 night, 0.86 after 3 and 0.93 after 7. The game's curve gives 0.29, 0.64 and 0.91. No single exponential fits Austin's shape: a τ that gets 77% on the first night overshoots by night 3.

**Verdict.**
- **Hauler, 1.2 m/s (240 ft/min).** It stands: it's inside makers' specs (166 to 600 ft/min). A small boat's pump would put it at 150 to 250 ft/min. No measured figure exists, so it should be labelled as a maker's range.
- **τ = 3 nights.** Too slow by Austin's sourced fit, which puts about three-quarters of a two-week catch in the trap after the first night and very little more after.
- **Recommendation.** Replace (1 − e^(−n/3)) with Austin's (n/14)^0.1, capped at 1 and starting at the first night. If so, "most" (3.6) becomes the 14-night catch.
- **Fade after 14 days.** The 2024 video study supports catches falling with long soaks, and 14 days matches the fishery's usual soak. The 40% floor and the 14-day fade constant have no source.

---

## 7. The harness's and the chair's holds, and the dehooker's reach

**The game now.**
- `src/game/rigs/Rigs.js:40`: `HOLD_KG = { hand: 10, harness: 18, chair: 40 }`. `Rigs.js:673` picks one.
- `src/game/CatchMinigame.js:88-92`: the drag slips at `min(dragKg, holdKg × arms) / lineKg` of the line's strength.
- Reels (`src/game/Gear.js:24-25`): the conventional reel's drag is 12 kg, the two-speed's 24 kg. The electric reel's is 24 kg (`Rigs.js:41`).
- Lines (`Gear.js:14-17`): "8 lb mono" 7 kg, "15 lb mono" 13, "30 lb braid" 26, "60 lb braid" 50.
- `docs/m16/tackle.md:22,62,64`: tackle.md:62 says the 60 lb braid's 50 kg "holds 24 kg in the chair, 18 in the harness", against a source of 25 to 30% (20 to 25% on braid).
- Dehooker, `Rigs.js:45`: `DEHOOK = { landBig: 6, landSmall: 2.5, tiredBig: 0.5 }` (m from you when the fish comes off). Without it: 3 m (big) and 1.2 m (small) (`Rigs.js:682`). `tackle.md:35`.

**Sources.**
- **IGFA** (the International Game Fish Association, which keeps the records) [International Angling Rules](https://igfa.org/international-angling-rules/).
  - Line classes: 1, 2, 3, 4, 6, 8, 10, 15, 24, 37 and 60 kg, i.e. 2, 4, 6, 8, 12, 16, 20, 30, 50, 80 and 130 lb. 60 kg (130 lb) is the heaviest. The class list is an image on that page; I've given it from the classes the rules name.
  - Leader and double line: at most 4.57 m (15 ft) each and 6.1 m together up to the 10 kg class; at most 9.14 m (30 ft) each and 12.19 m together above it.
  - Once the leader is in the mate's grasp, or wound to the rod tip, more than one person may hold it.
  - Gimbals must swing free, and a chair may have no powered aids.
- **Drag settings.** Gary Caputi, "Stand-Up Tackle Tactics", *Salt Water Sportsman* ([link](https://www.saltwatersportsman.com/?p=49243)).
  - Of the line's breaking strength: prestrike 25 to 30%, strike about 35 to 40%, full about 50 to 55%.
  - On 50 lb stand-up line the most drag is under 30 lb (13.6 kg). On 80 and 130 lb the angler stands against "up to 70 pounds of drag" (32 kg).
- **The chair.** Marlin, "Quick Harness Adjustment" ([link](https://www.marlinmag.com/?p=38960)): a reasonably fit person in a chair can keep up 80 lb (36 kg) or more of drag on 130 lb tackle.
- **Reels.** A 50-class two-speed reel, Shimano Tiagra 50W LRSA: maximum drag 40 lb (18 kg) in US listings and 18 to 20 kg in Australian and NZ ones ([Sportsman's](https://www.sportsmans.com/fishing-gear-supplies/trolling-conventional-reels/shimano-tiagra-trollingconventional-reel/p/1463358)).
- **Dehookers.**
  - ARC makes hand dehookers up to 34 in and pole-mounted ones up to 12 ft (3.7 m) "for truly large sharks or billfish" ([Salt Water Sportsman](https://www.saltwatersportsman.com/?p=49130)).
  - NOAA's approved release gear has ARC 6, 8 and 12 ft poles. The rule for a long-handled dehooker is at least 6 ft (1.83 m) or 150% of freeboard, whichever is greater ([NOAA](https://www.fisheries.noaa.gov/resource/outreach-materials/approved-models-and-equipment-careful-release-sea-turtles-caught-gulf), [SAFMC](https://safmc.net/documents/tab13_a5b_appendixb1final_june16-pdf)).

**Verdict.**
- **Chair, 40 kg (88 lb).** It stands: Marlin gives about 36 kg or more on 130 lb tackle.
- **Harness, 18 kg (40 lb).** Plausible for a strong angler on 80 lb class line: Caputi has under 13.6 kg on 50 lb line and up to 32 kg on 80 to 130 lb. It's high for the average angler. No source gives a figure for an average angler.
- **By hand, 10 kg.** No source found; it's still judgement.
- **A separate problem: the lines.** `lineKg` is about 0.85 × the pound rating where it should be 0.4536, i.e. about 1.9× the real breaking strength: 60 lb is 27.2 kg, not 50. IGFA-class line breaks at or under its class. Ordinary braid often tests above its label, but not at twice.
  - So tackle.md:62's 24 kg on "60 lb braid" is 48% of the game's 50 kg. That's Caputi's "full" setting, not the 25 to 30% it cites.
  - On a real 60 lb (27 kg) line, 24 kg would be 88%: one wave from breaking.
  - Either relabel the lines (7, 13, 26 and 50 kg are about 15, 30, 57 and 110 lb), or set `lineKg` to the real figures (3.6, 6.8, 13.6, 27.2) and rebalance `CatchMinigame`'s fish power (it reads `lineKg`).
  - The two-speed reel's 24 kg is an 80-class reel's drag. A 50-class reel tops out at 18 to 20 kg.
- **Dehooker, 6 m big and 2.5 m small (3 m and 1.2 m without).** A dehooker's own reach from the gunwale is 1.8 to 3.7 m (a 6 to 12 ft pole), so 6 m holds only if it's measured to where the leader is taken: the leader's top at the rod tip, with the fish up to 9.14 m (30 ft) of leader away. The 2.5 m for a small fish fits a 6 to 8 ft pole. Unhooking by hand needs the fish alongside, under about 1 m. The 3 m and 1.2 m are fine as "gaffed or wired at arm's length", but long for a hand unhooking.

---

## 8. Photographs: underwater LED lights on a sportfisher's transom at night

`docs/m16/sportfisher.md:48`: "No photograph of one to compare". I haven't opened any of these images (links only). The captions and alt text are from the pages:

- **From the side, a sportfisher lit at night.**
  - Marlin, "Underwater Lighting Solutions" ([article](https://www.marlinmag.com/story/marine-electronics/underwater-lighting-solutions/)). Its hero photo by Chris Rabil, alt text "A sport fishing boat equipped with underwater lights": https://www.marlinmag.com/wp-content/uploads/2021/09/sport-fishing-boat-underwater-lights-1024x768.jpg
  - Panbo, "Underwater lights, Lumishore EOS blazes trail" ([article](https://panbo.com/underwater-lights-lumishore-eos-blazes-trail/)). The sportfisherman *Sandpiper* with her underwater lights on at Camden Public Landing, at dusk or night: https://panbo.com/assets_c/2015/12/Sandpiper_lights_up_Camden_Public_Landing_cPanbo-thumb-autox620-12472.jpg
- **Probably from aboard or close astern.** George Poveromo, "How to Use Fishing Lights", *Salt Water Sportsman* ([article](https://www.saltwatersportsman.com/?p=52758)). Photo 2, "Underwater lights on a fishing boat", captioned "Broadcast illumination draws invertebrates and baitfish": https://www.saltwatersportsman.com/wp-content/uploads/2021/09/SWS1120-Night-Lights-2.jpg
- **Possibly useful.** [Mercury Marine, "Saltwater fishing with underwater lights"](https://www.mercurymarine.com/us/en/lifestyle/dockline/saltwater-fishing-with-underwater-lights). [Poveromo, "The Light Brigade"](https://www.georgepoveromo.com/content.php?pid=48) has a photo credited to Aqua Lights, but its image URL wasn't in the page text.
- **Two notes for the look.**
  - Transom lights shine aft, parallel to the surface. Hull lights under the transom shine straight down (Poveromo).
  - OceanLED's transom series is spaced 2 to 4 ft apart ([NauticExpo](https://www.nauticexpo.com/prod/oceanled/product-26835-620211.html)).
- Wikimedia Commons had no such photograph.

---

## 9. How a 27 ft lobster boat's foredeck and roof are reached

The game now: `docs/m16/together.md:85` says you walk "through the windscreen", and nothing takes you onto her roof. `docs/M17.md:160` asks for "a hatch or steps, whichever her kind has". I found no builder's deck plan for a 26 to 28 ft Downeast or Caribbean lobster boat that I could open. Links only:

- **What owners describe.** These are a Ranger 25/27 tug, not a lobster boat, but she too has a house nearly filling her beam ([Tugnuts, "Questions re R-27"](https://www.tugnuts.com/threads/questions-re-r-27.1600/latest)).
  - Narrow side decks, a toe rail and handholds, with no rail until the foredeck.
  - Owners crawl along the cabin side to the bow: "The trip to the foredeck has plenty of hand holds".
  - The other way is out through the V-berth's hatch in the forward cabin top.
  - That's the usual pattern on small Downeast boats too: a forward hatch over the cuddy, plus handrails along the cabin top and hardtop.
- **A builder's plan, not opened.** Boat Builder Central's Lobster Boat 26 (26 ft 3 in, 8 ft 6 in beam; [product page](https://boatbuildercentral.com/product/lobster-boat-26-boat-plans-lb26/)). Its study plan PDF may show the house, side decks and hatch: https://boatbuildercentral.com/StudyPlans/LB26_STUDY.pdf
- **Listings of the 27 ft Downeast type**, for the photos in their galleries:
  - Eastern 27 Lobsterman, about 8 ft 4 in beam ([Brewer Yacht Sales 2007](https://breweryacht.com/listings/2007-eastern-27-ft/2843791), [boats.com 2007](https://uk.boats.com/power-boats/2007-eastern-lobsterman-27-9729119), [Boat Trader 1996](https://resources.boattrader.com/boat/1996-eastern-27-lobster-fisherman-9604047)). One review says handrails on the cabin and the hardtop make moving about the decks safe.
  - [Brewer: 1985 Ellis 28](https://breweryacht.com/listings/1985-ellis-28-ft-no-frills/2841966).
  - [Boat Trader: 1996 Webbers Cove 27](https://assets.boattrader.com/boat/1996-webbers-cove-downeast-8360753/).
- **Wikimedia Commons**, not viewed:
  - The Caribbean kind: [Lobster boat at Marathon Key, Florida](https://commons.wikimedia.org/wiki/File:Lobster_Boat_Marathon_Key_Florida_by_Izzy.JPG) (public domain, 2007).
  - Downeast: [Working lobster boat, Beals Island, Maine](https://commons.wikimedia.org/wiki/File:Working_lobster_boat,_Beals_Island,_Maine_(5128544235).jpg) (CC BY 2.0) and [Lobster boat in Camden, Maine](https://commons.wikimedia.org/wiki/File:Lobster_boat_in_Camden,_Maine.jpg).
  - [Category: Lobster boats of the United States](https://commons.wikimedia.org/wiki/Category:Lobster_boats_of_the_United_States) has 20 files.
- **What these point to.** Her kind of boat is reached forward by narrow side decks with handrails on the house, or through a hatch in the forward cabin top from the cuddy below. Not through the windscreen. No source here confirms steps up the house's side to the roof. Whether a given boat has them would need the photos looked at.
