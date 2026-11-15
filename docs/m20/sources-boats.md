# M20: the boats' figures, from sources

Checked 2026-11-14 on `m20` (259c92c). Nothing in the project was changed. Paths are relative to the repo root. "Derived" means I worked a number out from a sourced figure; it is not a measured result. "Judgement" means no source gave it. Sources are summarised, with at most one short quote each. Where I only saw a page through a search result and couldn't open it, I say so. Metric first, imperial in brackets.

In short:

| # | Figure | What the sources say | Recommendation for the game |
|---|---|---|---|
| 1 | The console's trolling motor on batteries | A 112 lb, 36 V motor draws 52 A at most (1.87 kW). Garmin's own table for its 36 V motor: 100 lbf at 54 A, a third of the thrust at 10 A. Three 12 V deep-cycle batteries in series, at least 110 Ah each (Minn Kota). A group 31 AGM: 100 Ah, 85 Ah at 25 A. Dock charger: 3 banks × 10 A, 4 to 6 hours. Under way: Minn Kota's alternator charger, 10 A a battery, once the start battery's at 13.6 V. A 150's alternator gives 35 to 60 A | Three 100 Ah AGMs, 80 Ah usable. Draw 52 A × lever^1.5. Flat out 1.5 h; half thrust 4.3 h. +10 Ah an hour at the dock or with an outboard running: 8 h from flat |
| 2 | Power-Pole and a kayak's pole on hard bottom | Spikes are sold for sand, mud and clay. Florida Sportsman: "not a good plan on rock or coral". Anglers: a spike won't go into rock, or slips on rock under thin silt. In soft mud a spike can drag. Anchoring on coral is banned in the Exuma park and the Florida Keys sanctuary; Abaco's guidance is to anchor in sand. Power-Pole says it holds "on any kind of bottom" | Both poles hold on sand, mud and grass as now. On rock they won't stake. On coral they're refused (a rule, and harm) |
| 3 | The Pilot stood up | No measured stability figure for any fishing kayak, seated or stood. The Pilot: 0.85 m (33.5 to 33.75 in) wide. Owners stand in her with care. Ship research: a standing person has to step or grab hold once the sideways push passes about a quarter of their weight | Standing, the angler's balance sets the limit, not her hull: past about 14° of heel, the angler goes in (judgement). She herself rarely goes over |
| 4 | Blue-water floats by the fish's size | One 11 L float measured 9.5 kgf (21 lb) of lift. Divers: one 11 L float holds fish to 23 kg (50 lb) "without fear", kingfish to 25 kg, and wahoo to 36 kg (80 lb) on one float. Big tuna take two or more floats, or a 33 L high-pressure one. Rob Allen 11 L $135 to $160 | The user's 40 kg a float is at the top of the sources' 23 to 36 kg. In line if read generously; 30 to 35 kg if read strictly. $135 an extra float is a real price |

---

## 1. The console's trolling motor on batteries

**The game now.**
- `src/game/Gear.js:301-307`: a bow trolling motor, "112 lb thrust, 36 V", `trollingN: 498`, $1,200. It has no battery.
- `src/player/BoatController.js:60-62`: `TROLL_U = 5.5` m/s, set so she tops out at 4 knots, 498 N falling to 314 N there.
- `BoatController.js:235-245`: `_troll` gives `trollingN × throttle × (1 − u / TROLL_U)`. The lever is a share of the bollard thrust.
- `docs/m19/sources-boats-bait.md:144`: run time was worked out on three 100 Ah batteries (judgement) at 52 A: 1.9 h flat out.
- `src/game/Gear.js:281-283`: her outboards are a single 150 or twin 150s.

**Sources.**
- **Minn Kota, Battery & Wiring Installation, rev. 2021** ([PDF](https://minnkota.johnsonoutdoors.com/sites/default/files/2023-01/min_productmanual_tm-battery-charts.pdf), opened).
  - 112 lb: 52 A at most, on a 60 A breaker at 36 V. 101 lb: 46 A. The maximum "only occur[s] intermittently during select conditions".
  - Any lead-acid deep-cycle 12 V battery; "at least a 110-ampere hour rating" for best results. Group 24: 70 to 85 Ah ("good"); group 27: 85 to 110 Ah ("better"); group 31: 95 to 125 Ah ("best").
  - 36 V is three 12 V batteries in series, all the same make, size and age.
  - Recharge lead-acid within 12 to 24 hours; leaving it flat is "the leading cause of premature battery failure".
- **Garmin, Force trolling motor owner's manual** ([PDF](https://www8.garmin.com/manuals/webhelp/forcetrollingmotor/EN-US/Force_Trolling_Motor_OM_EN-US.pdf), text extracted here). "Motor Thrust and Current-Draw Information", in calm water with the motor deep enough not to ventilate, ±7 N and ±5 A. At 36 V:

  | Throttle | 10% | 20% | 30% | 40% | 50% | 60% | 70% | 80% | 90% | 100% |
  |---|---|---|---|---|---|---|---|---|---|---|
  | Thrust (N) | 21 | 41 | 69 | 103 | 144 | 191 | 246 | 307 | 375 | 445 |
  | Current (A) | 1 | 2 | 4 | 6 | 10 | 15 | 21 | 29 | 39 | 54 |

  At 24 V it tops out at 355 N (80 lbf) and 57 A. Its specifications page: 60 A continuous, 2,160 W at full power at 36 V ([Garmin](https://www8.garmin.com/manuals/webhelp/GUID-3A9C1CE0-D2CD-4415-B65F-6F1FF9701E2D/EN-US/GUID-7EE20A35-4E0F-4E6A-89E5-270C5C907E3F.html), opened).
- **Minn Kota on draw at part speed** (forum and help-page summaries, search results only): Minn Kota says it can't give a draw at a setting, because wind, current and the boat change it. Ulterra 112 retailers list 52 A, Ultrex 112 listings 56 A (search results).
- **Dakota Lithium** ([dakotalithium.com](https://dakotalithium.com/how-to-choose-a-lithium-battery-for-trolling-motors/), opened): run time = Ah ÷ average draw; working from the maximum draw gives "a conservative full-power estimate". Its blog ([dakotalithium.com](https://dakotalithium.com/trolling-motors-how-does-the-power-setting-impact-run-time/), opened) reproduces Garmin's table and says a pro "averages a 30% of max power setting".
- **Odyssey ODX-AGM31 data sheet** ([PDF](https://cdn.shopify.com/s/files/1/0645/4932/3005/files/Odyssey-Battery-ODX-AGM31-Data-Sheet.pdf), opened): group 31 AGM, 100 Ah at 20 hours, 92 Ah at 10 hours, 205 minutes' reserve capacity (at 25 A), 35.3 kg (77.8 lb), charged at 14.4 to 14.8 V, 400 cycles at 80% depth of discharge. $590 to $700 each (Batteries Plus, Batterymart, search results).
- **Dakota Lithium 36 V 60 Ah**, one pack (search results only; Dakota's page returned 429): 20 kg (44 lb), $1,499 to $1,750, 60 A continuous (one listing says 120 A). It comes with a 36 V 8 A charger, about 8 hours to full; an 18 A charger does it in under 4. Dakota's chart pairs the 112 lb, 52 A motor with its 36 V single pack or three 12 V 100 Ah.
- **Dock charger: Minn Kota MK 330 PCL**, 3 banks × 10 A, 30 A, 450 W, "4-6 hours" (Minn Kota's charger selection guide and Vance Outdoors, search results; Minn Kota's pages returned 403). The older MK 330 PC is the same rating.
- **Under way: Minn Kota alternator chargers.**
  - Minn Kota's help page (search result only; 403): it starts charging the trolling batteries only once the start battery reaches 13.6 V with the ignition on, then "pushes 10 amps to the batteries ... until they reach 14.4 volts". Flooded and AGM lead-acid only: not for lithium.
  - MK-3-DC, three banks, 30 A total, 12/24/36 V out (several retailers, search results). $169.99 at Overton's ([overtons.com](https://overtons.com/minn-kota-on-board-alternator-charger---3-bank-317269.html), opened; the page gives no electrical figures).
- **Outboards' alternators.**
  - Yamaha ([yamahaoutboards.com](https://yamahaoutboards.com/inlinefour), opened): F150, 35 A (2.7 L) or 50 A (2.8 L) at full throttle; F200 in-line four, 50 A. No idle figure.
  - A forum post quotes Yamaha's F150 as "35 Amp (28 Amp @1000 rpm)" (marineengine.com, search result).
  - Mercury FourStroke 150: 60 A (Mercury's page, search result; 403). Mercury's V6 and V8: 85 A, 115 A with a kit (search result).
- **Not checked:** the MotorGuide Xi5 105's draw.

**Derived.**
- **Draw by thrust.** Garmin's current goes as the thrust to the power 1.5: `I = I_max × (T / T_max)^1.5` is within 2 A of every row from 30% up (fitted here: 1.47). That's what simple propeller theory gives for a prop held still: power goes as thrust^1.5. On the Minn Kota's 52 A:

  | Share of full thrust | 25% | 50% | 63% | 100% |
  |---|---|---|---|---|
  | Thrust | 125 N | 249 N | 314 N | 498 N |
  | Draw | 6.5 A | 18 A | 26 A | 52 A |
  | Power at 36 V | 230 W | 660 W | 940 W | 1.87 kW |

  The game's lever is already a share of bollard thrust, so the draw goes by the lever. Under way at full lever she makes 314 N at 4 knots, but the motor's still at full throttle and drawing near 52 A (judgement: a prop's current falls only a little with speed).
- **The bank.** Three 100 Ah AGMs: 36 V × 100 Ah = 3.6 kWh nominal, 106 kg of batteries.
  - From Odyssey's two ratings (100 Ah over 20 h; 85 Ah at 25 A), Peukert's exponent is 1.10. To flat: 1.5 h and 79 Ah at 52 A; 3.3 h and 85 Ah at 26 A; 9.3 h and 93 Ah at 10 A.
  - Run to 80% (Odyssey's cycle rating), 80 Ah. That's also about what's there at full draw, so a single 80 Ah serves at every speed.
  - On 80 Ah: 1.5 h flat out; 4.3 h at half thrust (18 A); 9.4 h at 30% (8.5 A). M19's 1.9 h used 100 Ah with nothing held back.
  - Lithium instead: Dakota's 60 Ah pack, all of it usable (judgement), lasts 1.15 h flat out, at a fifth of the weight.
- **Charging.** 10 A into each 12 V battery of a series bank puts back 10 Ah an hour into the 36 V bank. The dock charger and the alternator charger both do that.
  - From 80 Ah down, 8 hours at 10 A, plus lead-acid's losses (judgement: about 10 to 20% more in than came out). So overnight at the dock fills it; Minn Kota's 4 to 6 hours is from part-flat.
  - The alternator charger's 3 × 10 A at about 14.4 V is about 430 W, or about 35 A from the 12 V side (judgement on its losses). A 50 or 60 A alternator covers that and the electronics; a 35 A one only at speed.

**For the game.**
- **The bank:** three 12 V 100 Ah AGMs in series, 80 Ah usable at 36 V. They come with the motor (real: about $600 each).
- **Draw:** `52 A × |lever|^1.5`, whatever her speed. 1.5 h flat out, 4.3 h at half thrust.
- **Flat:** no thrust (judgement: a real lead-acid motor weakens as the voltage falls; one step's simpler).
- **Charge:** +10 Ah an hour docked at home, and +10 Ah an hour while an outboard runs (either 150, or both; the charger, not the alternator, sets the rate). 8 hours from flat.

---

## 2. A Power-Pole, and a kayak's pole, on hard bottom

**The game now.**
- `src/game/Gear.js:308-311`: "Power-Pole Blades, a pair, 8 ft (holds her in 2.4 m at a press)", `stakeM: 2.4`.
- `Gear.js:275-278`: the kayak's "Push and stake-out pole, 8 to 12 ft", `stakeM: 2.9`.
- `src/player/BoatController.js:70` and `:568-584`: staked, a stiff spring (`STAKE_W` 2 rad/s, critically damped) holds her point over the stake on any bottom.
- `docs/m19/sources-boats-bait.md:530`: "The Power-Pole not holding on rock or coral" was judgement. `docs/M20.md:97` plans the Power-Pole refused on coral.

**Sources.**
- **Power-Pole** ([power-pole.com](https://power-pole.com/learnmore/), opened). It keeps the boat secured "on any kind of bottom", and the spike doesn't harm "bottom grasses or reefs". No holding figure.
- **Power-Pole's spikes** (retailers, search results): the Heavy-Duty Spike, 8 and 8.5 ft, is made to "bite hard and hold fast in sand, mud, or clay". The Ultra-Lite Spike is for kayaks and small craft. The Micro's stake is listed for "sandy, rocky and soft mud-bottom conditions" (Academy, search result). No spike or paddle foot for hard bottom from Power-Pole was found: its other foot is the Drift Paddle, which slows a drift "up to 50%".
- **Florida Sportsman, "Getting into Power Anchors", 2016** ([floridasportsman.com](https://floridasportsman.com/editorial/getting-power-anchors/398036), opened).
  - Good on a sand hole. On grass the spike "jerks a narrow trail of grass out of the bottom".
  - "This is not a good plan on rock or coral": the pole makes "quite a bit of noise dragging over hard surfaces".
  - Poles work to 10 ft, 12 on the Minn Kota.
- **Saltwater Sportsman, "Better Fishing With Shallow-water Anchoring Systems"** ([saltwatersportsman.com](https://www.saltwatersportsman.com/?p=55004), opened).
  - In gumbo mud a guide's spikes dragged until he added drift paddles: "They stop you cold."
  - Push poles and stake pins are hard to use on shell, hard sand or rock. Power-Pole's factory wrap, or Wang Anchor's stainless tip, keeps shell and rock from splintering the spike.
- **GearJunkie, Power-Pole Micro** ([gearjunkie.com](https://gearjunkie.com/fishing/power-pole-micro-anchor-review), opened). It held his kayak on river rock in dam-released current, against his doubts. In mud it holds if the stake goes 6 in (15 cm) in. Rated "up to 1,500 lbs". He says it "doesn't hold well in water deeper than 7 feet" against a listed 8.5 ft.
- **Anglers on hard bottom** (forum results, search results only): "I couldn't seem to penetrate more than a foot or so" in hard bottom; rock under a thin layer of silt "isn't enough to get a good bite"; a Northwest angler: they "do not work that well on uneven bottoms, rock bottoms". Another snapped three spikes in six weeks in clay (2coolfishing).
- **The kayak's pole.**
  - Florida Sportsman's ParkNPole review ([floridasportsman.com](https://www.floridasportsman.com/editorial/gear-review-yakattack-parknpole/397488), opened): the nylon tip "helps penetrate hard soil, sand and other types of stubborn surfaces". Used on oyster beds and mud. No depth figure.
  - Bassmaster's YakStick review ([bassmaster.com](https://bassmaster.com/gear/gear-review-yakstick-floating-stake-out-stick), opened): its rigid nylon point "firmly anchors your vessel in hard bottom" and poles fine over rock and gravel; silt wants a broader foot, and the handle doubles as a mud foot.
  - Guides (search results only): plant the pole 10 to 12 in (25 to 30 cm); stake in firm sand, mud or clay and avoid rock; drive it at an angle into the wind or current so a drift drives it deeper; test it before tying off.
- **Coral: the rules.**
  - **Bahamas National Trust, Exuma Park Rules** ([PDF](https://bnt.bs/storage/2020/01/Exuma-Cays-Land-and-Sea-Park-Rules.pdf), opened): "Anchoring is not permitted in the mooring fields, on coral reefs and certain other designated areas". The park is no-take.
  - **Friends of the Environment, Abaco** ([PDF](https://www.friendsoftheenvironment.org/_files/ugd/04dc81_086bec6c57c3497fb05740b4b0fa3553.pdf), opened): with no mooring, "anchor in sand away from the reef" (one panel says "sand or grass"); "Don't touch, stand or walk on reefs". Guidance, not law.
  - **Southern Boating, 2014** ([southernboating.com](https://southernboating.com/destinations/bahamas/take-care-sea-grass-coral-cruise-anchor/), opened): the government was drafting coral regulations with "severe penalties"; anchor only in clear sand. I found no later Bahamian law that bans anchoring on coral outside the parks.
  - **Florida Keys National Marine Sanctuary** ([floridakeys.noaa.gov/regs](https://floridakeys.noaa.gov/regs), opened). Sanctuary-wide: no "vessel anchored on living coral", no striking or injuring coral or seagrass, no prop scarring. Touching or standing on coral is banned in its preservation areas.

**Derived.** None of the sources measures a hold on rock. They agree, but for anglers' reasons: the spike won't go in, or rides on a thin skin of silt, or drags noisily. The maker's "any kind of bottom" is the one dissent. A shallow-water anchor is an anchor, so the park rule and the Florida rule cover it (judgement: neither names one).

**For the game.**
- **Sand, mud, grass:** both poles hold, as now. Grass torn up behind a dragged spike (FS) is a detail for later.
- **Rock:** neither stakes. A press finds bottom and the boat drifts on (judgement on the feel: a clunk, no hold).
- **Coral:** refused, as `docs/M20.md:97` plans, for both. It's the rule in the Exuma park and the Florida Keys, and Abaco's advice everywhere. A line saying why (judgement on wording).
- **Soft mud:** a full hold, as now. Saltwater Sportsman's dragging spike was in gumbo mud with a breeze; the island's flats are sand and grass.

---

## 3. A stand-up fishing kayak's stability, stood up

**The game now.**
- `src/game/Gear.js:255-258`: the pedal drive makes her the Pescador Pilot 12, "hands free to fish, and stood in".
- `src/world/boat/kayak/KayakModel.js:87-90`: standing raises the eye to 1.7 m and nothing else.
- `src/world/boat/kayak/Capsize.js:3-5`: her deck edge is 27° off the water at the waterline. `:11`: she goes over at 41° bracing, 33° idle, 28° fishing.
- `docs/m19/sources-boats-bait.md:9`: beam 0.85 m; "Standing allowed, less stable than sitting".

**Sources.**
- **The Pilot 12.** Perception's own page wouldn't open again (429; the old link redirects to a collection that also returned 429).
  - KayakGuru ([kayakguru.com](https://kayakguru.com/perception-pescador-12-0-pilot/), opened): 33.75 in (0.857 m) wide, 85 lb, 475 lb capacity, "built with a wide hull ... for improved stability"; you "can potentially stand". A reviewer's view, not a test.
  - Perception's listing (search result only): "superior stability even allows anglers to cast from a standing position". Retailer copy: "incredible stability for stand-up fishing and on-deck movement" (search result).
  - Owners (search results only; BassResource returned 403): you can stand and cast but "had to be mindful of where your weight was positioned" and keep your feet facing ahead; the seat's height "isn't ideal for standing up out of". A Board and Kayak answer: stand in front of the seat with the raised drive as a handhold.
- **Others standing** (search results only): Paddlingspace on the narrower non-Pilot Pescador 12: "Not easy to stand up in". A Jackson rep: standing comfort "is a function of the person"; offshore hulls are narrower and less made for it (AgInfo, opened).
- **A standing test** ([Grand View Outdoors](https://www.grandviewoutdoors.com/fishing/surprising-video-kayak-stability-test), opened), on an Old Town Sportsman PDL 120: on a sit-on-top "the angler will often fall into the water before the kayak flips". No angles.
- **Stability curves.** Guillemot Kayaks ([guillemot-kayaks.com](https://guillemot-kayaks.com/kayak-stability), opened) explains Sea Kayaker's curves: GZ against heel, with the paddler rigid and the centre of gravity 10 in (25 cm) above the seat. A higher centre of gravity makes any boat less stable; "Just 1/2 inch will be quite noticable". No curves for a sit-on-top or a standing paddler. A paddling forum notes the curves treat the paddler as dead weight (search result).
- **A person standing on a moving deck.**
  - Morris and Langlois, Carleton University, 2014 ([PDF](https://avestia.com/CDSR2014_Proceedings/papers/62.pdf), opened): Graham's model treats a standing person as a block. A "motion induced interruption" is when they "must take a step, grab a hold, or stop", which comes when the moment about one foot falls to zero.
  - A MATEC 2017 paper (search result only; 403): the "tipping coefficient", half the stance width over the height of the centre of gravity, is typically 0.23 m ÷ 0.9 m, about 0.25, for an unsupported standing person. Crossland and Rich (1998) measured 0.27 side to side on a swaying platform.
- **Measured figures for a kayak stood in:** none found. No maker publishes a heel angle, a righting moment or a stability curve for a fishing kayak, seated or standing.

**Derived** (all judgement on the inputs).
- **Her stability, seated and stood.** Take her loaded at 130 kg (40 kg boat, an 80 kg angler, 10 kg of gear), on a waterline 3.6 m long and 0.80 m wide.
  - Her waterplane's inertia is about 0.046 × L × B³ = 0.085 m⁴. On 0.127 m³ displaced, BM is 0.67 m. With KB about 0.05 m, the metacentre is about 0.72 m above her keel.
  - Seated, the angler's centre of gravity is about 0.5 m above her keel (a seat about 0.2 m over the water, plus about 0.2 m). Her hull's is about 0.15 m. All together KG is 0.38 m, so GM is about +0.34 m.
  - Standing, feet on her deck about 0.2 m above the keel, plus Graham's 0.9 m: 1.1 m. That's 0.6 m higher, inside the 0.5 to 0.8 m rise expected. KG becomes 0.74 m, and GM about 0 (−0.1 to +0.1 m as the angler's weight and her waterline vary).
  - So with a standing angler held rigid, her hull has next to no stability of its own. The angler keeps her up by balancing, as on a paddleboard. That fits the test above: the angler falls before she flips.
- **The angler's limit.** A tipping coefficient of 0.25 is a static heel of atan 0.25 = 14°; 0.27 is 15°. Past that a person on a deck has to step or grab, and on a kayak a step is over the side. A wake's sideways jolt counts the same: about a quarter of a g.
- **Applying ship figures to a kayak** is judgement. A ship's deck doesn't roll when the person shifts; a kayak's does, so 14° may be generous.

**For the game.**
- **Standing:** past 14° of heel the angler goes in, and she usually stays upright (judgement, from the 0.25 tipping coefficient and the Old Town test). Seated limits stay as they are: 41°, 33°, 28°.
- **Getting up and down:** only in calm water (M19's call), and slower than sitting (judgement).
- **Breakers:** standing, a breaker that heels her past 14° puts the angler in, well short of the height that rolls her (`Capsize.js:13` and `:19`'s heights stay for her).

---

## 4. Blue-water spearfishing floats by the fish's size

**The game now.**
- `src/game/Gear.js:112-115`: the blue-water gun breaks away onto 30 m of float line and an 11 L float; `spearHold: 23` kg on the shaft, "bigger ones fought on the float". $135 the float.
- `docs/M20.md:16`: the user's decision. One float holds a fish to about 40 kg; extra floats at Marta's, about $135 each, hold bigger ones.
- `docs/m19/sources-big-game.md:367-369`: Florida Sportsman's rig, "perfect for fish less than 50 pounds or so", on "a couple of old floats".

**Sources.**
- **Florida Sportsman** ([floridasportsman.com](https://www.floridasportsman.com/editorial/dive-bluewater-spearfishing/398013), opened, again). 100 ft of float line to "a couple of old floats". "The buoys are more for drag and a last resort than for actually fighting the fish in this setup": the diver pulls the fish up the float line as it tires. No float sizes.
- **Spearfishing World, "Rob Allen 11L foam blown hard float", April 2015** ([spearfishing.world](https://spearfishing.world/thread/6935-rob-allen-11l-foam-blown-hard-float/), opened).
  - One diver's test: "Buoyancy is minimal at 21lb in saltwater" (9.5 kgf).
  - "Up to 50lb I would use it without fear of losing the gear." A 50 lb fish pulls it under "a little" on the first run.
  - Another: it "has eventually arrested Yellowtail Kingfish up to 25kg".
  - A third would want a more buoyant float for powerful fish.
- **DeeperBlue forum** (search results only; every page returned 403).
  - Hawaii, wahoo, mahi and ahi: a 30 lb hard float and a Riffe 2 ATM float at the end of the line, "sometimes another float behind that when expecting large fish".
  - "A couple of large lobster floats is all you need for wahoo"; a Venezuelan diver uses one float for wahoo up to 80 lb (36 kg).
  - Bungee float lines are used "on big fish (like 100lb+ tuna) with appropriate floats"; with longer lines "you can get away with smaller floats".
- **Neptonics, "Choosing the right spearfishing float (advanced)"** (search result only; the site refused the connection). Fish are 10 to 20% negative: a 100 kg (220 lb) tuna may need 20 kg (44 lb) of lift, so "you may need more than one float". Good pressurised floats have around 100 lb of lift. Its Riffe 3 ATM review: 95 lb of lift, holding its volume to 20 m (66 ft).
- **Adreno, bluefin gear guide** (search result only; 429): "one or two high-pressure floats connected in series" with a bungee between them.
- **Cast and Spear, Jon Stenstrom, updated 4 October 2026** ([castandspear.com](https://castandspear.com/best-spearfishing-floats/), opened). Reef fish want 15 to 30 lb of lift, pelagics high-pressure floats of 75 lb and up. "Extreme blue water applications (giant tuna, marlin) sometimes require two or more high-pressure floats rigged in sequence." Riffe 3 ATM: 33 L, 95 lb at 66 ft. Rob Allen 7 L hard: about 15 lb.
- **Prices** (search results only).
  - Rob Allen Remora 11 L inflatable, 1.5 bar: $135 to $160 (House of Scuba); A$219; NZ$159. The 35 L: A$329.99, NZ$229.
  - Rob Allen 12 L hard float: $110 (M19).
  - Riffe Torpedo Pro, 20 L: $120 to $124, sold as 53 lb of lift.
  - Riffe 3 ATM, 33 L: about $360.
  - Huntmaster Tuna Tamer: 45 L, "buoyant force of 120lbs".

**Derived.**
- **Lift by volume.** A litre of sea water weighs 1.025 kg, so 11 L lifts 11.3 kgf less the float's own weight: about 10 kgf. The test's 9.5 kgf fits.
- **Makers' lb figures run high.** 20 L can lift at most 20.5 kgf (45 lb), not 53 lb; 33 L at most 33.8 kgf (75 lb), not 95. Volume is the safer figure.
- **What one float holds.**
  - By the 10 to 20% rule, one 11 L float keeps a dead fish of 50 to 100 kg up. So lift isn't what limits it: a live fish's pull is.
  - The divers' figures for one float: 23 kg (50 lb), 25 kg (kingfish) and 36 kg (wahoo, float size not given). Florida Sportsman used two floats for under 23 kg, but for drag, not lift.
  - So the sources put one float at 23 to 36 kg. **The user's 40 kg is just above that range:** in line if read generously, a little high if read strictly.
- **Big fish.** A 33 L high-pressure float is three 11 L floats' worth. Two or more floats in series is what the sources use for big tuna and marlin.

**For the game.**
- **One 11 L float:** a fish to 40 kg (the user's), or 30 to 35 kg to sit inside the sources. The user's call.
- **Each extra float:** another 40 kg, at $135 (Rob Allen's 11 L, real price). Holding adds up float by float (judgement; the sources stack floats in series).
- **So:** wahoo and most yellowfin on one float; a big yellowfin (45 to 80 kg) on two; 80 to 120 kg on three, a Riffe 3 ATM's worth.
- **Its lift:** 10 kgf an 11 L float, if the game ever floats a dead fish on it.

---

## Numbers for the game

**Trolling motor batteries (§1)**
- Bank: three 12 V 100 Ah AGMs in series, 36 V, 80 Ah usable. Real: about $600 each, 35 kg each.
- Draw: `52 A × |lever|^1.5` (6.5 A at a quarter, 18 A at half, 52 A full). 1.87 kW full.
- Run time on 80 Ah: 1.5 h flat out; 4.3 h at half thrust; 9.4 h at 30%.
- Charge: +10 Ah an hour at the dock, +10 Ah an hour while an outboard runs. 8 h from flat.
- Lithium instead: 36 V 60 Ah, 20 kg, $1,500 to $1,750, 1.15 h flat out; not charged by Minn Kota's alternator charger.

**Shallow-water anchors on hard bottom (§2)**
- Hold on sand, mud and grass.
- Won't stake on rock.
- Refused on coral, for both poles.

**The Pilot stood up (§3)**
- Beam 0.85 m. GM about +0.34 m seated, about 0 standing (derived).
- Standing: the angler goes in past 14° of heel (judgement). Seated limits unchanged.

**Floats (§4)**
- 11 L float: about 10 kgf of lift.
- One float: to 40 kg (the user's; the sources say 23 to 36 kg).
- Extra floats: $135 each, another 40 kg each. Two for 45 to 80 kg, three for 80 to 120 kg.

## Unsourced, judgement

- **Draw by the lever, not her speed** (§1). Garmin's table is bollard thrust; a prop's current under way falls a little, and I've ignored it.
- **80 Ah usable** of 100: from Odyssey's cycle rating and the Peukert figure, not a battery maker's advice for a game (§1).
- **Thrust to nothing when flat**, rather than fading with the voltage (§1).
- **Charging losses** (10 to 20%), and the alternator charger's draw on the 12 V side (§1).
- **A 150's alternator covering the charger:** Mercury's 60 A and Yamaha's 50 A do on paper; Yamaha's 35 A only at speed (§1).
- **Rock giving no hold at all.** Anglers say it won't go in or slips; the maker says any bottom; GearJunkie held on river rock (§2).
- **The coral rule applied island-wide.** It's law in the Exuma park and the Florida Keys, and advice elsewhere in the Bahamas. I found no Bahamian law on anchoring on coral outside the parks (§2).
- **Every input to the Pilot's GM** (§3): her waterline (3.6 × 0.80 m), the waterplane factor (0.046), the seat's height, the angler's 80 kg and centre of gravity.
- **14° for a standing angler on a kayak**, from a ship's-deck figure (§3). A kayak rolls with the angler's own shifts; the real figure may be lower.
- **The float's 40 kg** (the user's) against the sources' 23 to 36 kg, and floats adding up in a straight line (§4).
- **Pages that wouldn't open:**
  - Perception's Pilot pages (429); Minn Kota's help pages and charger guide (403); Mercury's alternator page (403); Dakota's product page (429).
  - BassResource (403); Kayak Angler (403); the MATEC paper (403); DeeperBlue's forum and article (403); Neptonics (TLS refused); Adreno (429); Finalstalk (429); Dive Gear Australia (403).
  - BoatUS's shallow-anchoring article opened with no body.
  - Figures given "by search result" above came from search summaries of those pages, not from the pages.
