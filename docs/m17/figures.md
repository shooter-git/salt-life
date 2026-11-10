# M17: M16's figures corrected from their sources

Step 4's last part, for [M17.md](../M17.md#figures-from-sources): each figure [sources-figures.md](sources-figures.md) checked, corrected in code from what it found, with the source in a comment where the figure is. Built 2026-11-10 on branch `claude/m17-figures-13be1e`, cut from `m17-flats` at dfb8b83. Items 1 to 6 are here. The lines, holds and dehooker (7) are the other session's ("the lines' strengths and the fight"), the underwater lights' photographs (8) were step 4's and the lobster boat's foredeck (9) step 3's. In `FishTable.js` only the `at` depth fields changed, so the two sessions merge cleanly.

| # | Figure | Before | Now | Where |
|---|---|---|---|---|
| 1 | VHF reach to Marta | handheld 9 km, any fixed set 37 km | worked out from both antennas: handheld 16.8 km, console and lobster boat 20.6, sportfisher 23.2 | `Seaworthy.js` `vhfReach`, `reachTo`, `VHF_H`, `SHORE_VHF_H` |
| 2 | A red meteor seen by day | 5 km | 2.8 km (night's 25 km stands) | `Seaworthy.js` `FLARE_M` |
| 3 | Ice: a cheap cooler | 0.3 kg/h, a bag in 15 h | 0.2 kg/h, a bag in 23 h | `Seaworthy.js` `meltKgH`, `COOLER_KGH` |
| 3 | Ice: an insulated hold or fish box | 60% of a cheap cooler's | FAO's measured melt: about half what it was | `Seaworthy.js` `meltKgH`, `FAO_MELT` |
| 4 | A day's stores | $12, nothing said of water | a day's food and 6 L of water, $16 | `Seaworthy.js` `STORES_PRICE`, `STORES_WATER_L` |
| 5 | Billfish at night | the day's depths | sailfish and white marlin [0, 20] m, blue marlin [0, 30] | `FishTable.js` `at` |
| 5 | Swordfish under the moon | (step 3's) | checked: it matches, left as it is | `FishTable.js` |
| 6 | A trap's soak | 1 − e^(−n/3) | Austin's (n/14)^0.1 | `Traps.js` `grown`, `SOAK` |
| 6 | The hauler | 1.2 m/s, "from memory" | 1.2 m/s, labelled as within makers' specs | `Traps.js` `HAULER_MS` |

## 1. VHF ranges

**How it's worked out now.** A VHF set reaches as far as its antenna and the other one can see each other over the sea's curve. That is the two antennas' radio horizons added: d = 4.12 km × (√h + √h′), heights in metres above the sea. The 4.12 is the 4/3-earth radio horizon, √(2 × 4/3 × 6,371 km); Bowditch's radar horizon (*The American Practical Navigator*, ch. 22) is the same, 2.21 nm √h. Inside the horizon a set's power hardly matters. Standard Horizon's HX-870 manual says range depends far more on the antenna's height than on the watts. (`Seaworthy.vhfReach( h, h2 )`, and `reachTo( stats, 'marta' | 'pearl' )` for a boat's set.)

A boat's stats now carry her antenna's height, `vhfH` (0 with no set), not a reach (`vhfM`). Every place that asked whether a set reaches now asks `reachTo`:
- `Radio.callMarta`: Marta's static past it;
- `Help.pearlCall`: Pearl's, to her own antenna;
- `DaysOut._rescueNet`: whether you can call for yourself, or wait for a passing boat;
- `Radio` and `Guide`: whether there's a set at all (`vhfH > 0`).

**Each boat's antenna, from her model.** Each height is to the middle of the whip.

| Set | Where it is on her | Its middle, above the sea |
|---|---|---|
| Handheld (the kayak's) | Held up to your face, sitting in her (`KayakModel` puts your eye 0.94 m above the water) | 1.0 m |
| Console | The 2.3 m whip on her T-top (`ConsoleHelm`: the top at 2.56 m) | 3.71 m |
| Lobster boat | The 2.4 m whip on her roof's after corner (`Wheelhouse`: `roofTopY`, 2.39 m, plus its mount) | 3.66 m |
| Sportfisher | An 8 ft (2.44 m) whip on a mount at her hardtop's after corner, like the lobster boat's (`SportfisherBridge`: the hardtop's edge at 5.18 m). **Her model draws none** | 6.47 m |

**Marta's antenna: chosen here.** No source gives a marina's antenna height. The search found only the general rule, as high as you can and clear of obstructions, and a house's roof at about 25 ft as an example. So I've chosen it for where she is:
- **What she is.** Marta's a chandler. Her set is a small coast station, the kind a marina or a towing firm is licensed for. It isn't the Coast Guard's: Rescue 21 meets its range from tall towers.
- **Where it's mounted.** On her boathouse by the chandlery, at the waterfront. It's the tallest building there, and the bay is open to the south from it. The model's ridge stands 5.25 m above the sea (`Buildings.buildBoathouse`: its eave 2.7 m over its ground at 0.97 m, and the roof's rise).
- **How.** An 8 ft fibreglass base-station whip on a 3 m pole standing on the ridge. Its middle is about 9.5 m above the sea.
- **Not on the hill.** The spur behind the village reaches 41 m about 190 m from her. Using it would need a long run of coax, which loses a lot of the signal at VHF, or a repeater up there. A village chandler wouldn't have either.

**Pearl's antenna** is mounted the same way, on her camp's shed. The shed's front stands about 4.3 m above the sea, so the whip's middle is about 8.5 m.

**What each reaches.**

| Set | Marta's, 9.5 m | Pearl's, 8.5 m | M16 |
|---|---|---|---|
| Handheld in the kayak | 16.8 km (9.1 nm) | 16.1 km | 9 km |
| Console | 20.6 km (11.1 nm) | 19.9 km | 37 km |
| Lobster boat | 20.6 km (11.1 nm) | 19.9 km | 37 km |
| Sportfisher | 23.2 km (12.5 nm) | 22.5 km | 37 km |

The shop's labels now say how far out Marta hears each set: "Handheld VHF, 5 watts (Marta hears it 9 miles out)" and "Fixed VHF on an 8 ft whip (Marta hears it 11 miles out)". The game's miles are nautical miles, as `Units.farOff` gives them.

**What a player notices.**
- The kayak's handheld reaches Marta from nearly twice as far. A kayak almost never goes that far out.
- Every fixed set reaches about 40% less far. The far grounds run from 14 km out from the island's middle to 24 km (`Weather.EDGE`).
  - From the console and the lobster boat, Marta is static past about 11 nm off her dock, which takes in the outer half of the far grounds.
  - From the sportfisher she's static past 12.5 nm, so only at the grounds' outer edge.
- Out there the EPIRB and the flares are what's left. With neither, it's the passing boat after 18 island hours.

## 2. A flare's reach

**Night, 25 km, stands.** Allard's law with the game's 16,000 cd red meteor (Orion's 12-gauge, `DaysOut.FLARE_SEEN.cd`) reaches the eye's least at night, 2 × 10⁻⁷ lux, at 25 km. That is 11 to 15 nm in 10 nm of visibility.

**Day, 2.8 km, was 5.** Worked out the same way as the night's, to the least light that can be picked out by day:
- **The threshold.** By IALA's figures (the lighthouse authorities' standard), a light needs 1,600 to 4,000 cd to be identifiable by day at half a mile (as the USCG R&D Center's CG-D-04-20 gives them, 2019). That makes 1.87 mlx the least, at the low end.
- **The reach.** A 16,000 cd meteor falls to 1.87 mlx at 2.6 km through clear air (20 nm visibility). With no air at all it would be 2.9 km. Through the game's night air (8.4 nm) it would be 2.3 km.
- **The trials.** The R&D Center's watchers regularly picked out the 30,000 cd SOLAS flares at 2 nm. Allard's law in the same air gives 1.9 nm for those, so the watchers saw them about 6% farther. As much farther for a meteor is **2.8 km (1.5 nm)**, within the 2.5 to 3.5 km sources-figures.md gave.

**The look and the seen test still agree.** Both read `FLARE_M`:
- the look by `DaysOut._flareBright`, how bright it's drawn at a distance;
- the seen test by `DaysOut.fire` (someone on the island sees yours) and `theirFlare` (you see someone else's).

So the changed figure moves both together.

**By day the look needed a floor, so it's seen as far as the test has it seen.** With the reach alone changed, step 4's look drew the flare by day fading to nothing at its reach, by the log of its light. `tools/looks/look.mjs` showed what that does on mid at 11:00, counting the pixels where red is 40 or more over the mean of green and blue:
- at 300 m, a red point 4 × 4 px, (190, 78, 84);
- at 1.5 km, only a faint pink tint, (163, 150, 165);
- at 2 km and 2.5 km, nothing.

Yet the seen test has it seen to 2.8 km. Step 4's 5 km had the same gap, from about 2 km out.

The reason is the day's sky. Against it, a red sprite is lost under about 0.38 opacity: at 11:00 the sky beside it is about (55, 100, 158), and that's where red comes out 40 over the mean of the others. By night even a faint one shows against the dark.

So by day it's now drawn at `FLARE_SEEN.dayLeast`, 0.4, at its reach, the eye's least. From there it rises with the log of its light, and it's gone over the last `dayEdge` (5%) of the reach. The night's drawing is unchanged. The opacity `_flareBright` gives by day:

| | 300 m | 1 km | 1.5 km | 2 km | 2.5 km | 2.7 km | 2.8 km | 3 km | 4 km |
|---|---|---|---|---|---|---|---|---|---|
| Step 4, M16's 5 km | 0.95 | 0.58 | 0.45 | 0.35 | 0.27 | 0.25 | 0.23 | 0.20 | 0.09 |
| The reach alone at 2.8 km | 0.93 | 0.45 | 0.28 | 0.16 | 0.05 | 0.02 | 0 | 0 | 0 |
| Now, with the floor | 0.96 | 0.67 | 0.57 | 0.49 | 0.43 | 0.29 | 0 | 0 | 0 |

By night it's as step 4 had it: full within 2 km, 0.59 at 8 km, 0.15 at 20 km. Dusk blends the two by the night's share, as before. What `look.mjs` drew with the floor is under [Checks](#checks).

**What a player notices.**
- A flare fired by day is seen from the island only within 2.8 km of its middle, where M16 had 5. The island itself reaches about 670 m from its middle.
- Someone else's flare is seen by day only within 2.8 km of you, and now it's drawn as a red point all that way. Step 4's faded out of sight by about 2 km.
- By night it's as before.

## 3. Ice

**How the game's days are spent decides it.** The box melts every island hour: by night, at her berth and while you're away (`DaysOut.awayHours`), as well as out in the sun with the lid opened for each fish. So its figure has to be a whole day's mean.

**The cheap cooler: 0.2 kg/h** (`COOLER_KGH`), a 10 lb bag in about 23 h. M16 had 0.3, a bag in 15 h, which is the hot, busy end. The sources:
- **FAO's measured box** (below), scaled by surface to the 48-quart's 45 L: 0.10 kg/h in shade.
- **A cheap cooler**, with thin foam and a lid that leaks, melts 1.5 to 2 times that: 0.15 to 0.2 in shade. In a deck's sun, opened through the day, it's 0.2 to 0.3.
- **Coolers tested in the sun.** Pew Pew Tactical left 52 to 55 quart coolers latched in a Carolina summer's sun: 0.15 kg/h.
- **The maker.** Coleman's claim for its 48-quart works out at 0.3 kg/h at a steady 32 °C.

A day out in the sun and the night after it, at the berth, come to about 0.2.

**Insulated holds and fish boxes: FAO's measured melt.** I chose the formula over a factor of 0.3:
- **FAO's figure.** A 90 L insulated fish container, full of ice, in shade, melts 0.1233 kg a day for each °C of the air: 3.6 kg a day at 28 °C (FAO Fisheries Technical Paper 436, §7.1).
- **Here.** Taken at the island's 28 °C (`AIR_C`, the sea's too) and scaled by surface, (V / 90 L)^(2/3). The game's holds are in her deck, out of the sun, as FAO's box was.
- **A box's litres.** 1.5 L for each kg it holds (`LITRES_PER_KG`), from the game's own 48-quart: 45 L for its 30 kg.
- **Why not the factor.** A factor of 0.3 on M16's cheap cooler gave about the same numbers. But the cheap cooler is now 0.2, so the factor would have had to move with it. FAO's formula stands on its own measurement.

| Box | Holds | M16, kg/h (a bag lasts) | Now | A day, M16 → now |
|---|---|---|---|---|
| Kayak's soft bag | 12 kg | 0.163 (28 h) | 0.109 (42 h) | 3.9 → 2.6 kg |
| Kayak's crate cooler | 25 kg | 0.266 (17 h) | 0.177 (26 h) | 6.4 → 4.3 kg |
| Lobster boat's cooler (48 qt) | 30 kg | 0.300 (15 h) | 0.200 (23 h) | 7.2 → 4.8 kg |
| Console's box | 60 kg | 0.476 (9.5 h) | 0.317 (14 h) | 11.4 → 7.6 kg |
| Ice chest | 70 kg | 0.528 (8.6 h) | 0.352 (13 h) | 12.7 → 8.4 kg |
| Insulated fish hold | 160 kg | 0.549 (8.3 h) | 0.277 (16 h) | 13.2 → 6.6 kg |
| Sportfisher's cockpit box (insulated) | 300 kg | 0.835 (5.4 h) | 0.421 (11 h) | 20.1 → 10.1 kg |
| Big insulated fish box | 600 kg | 1.326 (3.4 h) | 0.668 (6.8 h) | 31.8 → 16.0 kg |

The insulated hold now melts less all told than the cheaper, smaller ice chest, as you'd expect of the 30 to 63 mm of polyurethane FAO lists for commercial insulated containers. FAO's 1 kg of ice to 1 kg of fish and the 0.285 kg it takes to chill a kg of fish (`CHILL_KG`) stand.

**What a player notices.** A bag lasts about half again as long in the coolers, and twice as long in the insulated boxes. Marta's ice row says how many hours are left in the box, so it shows there.

## 4. A day's food and water

**The need.** A day's stores are a day's food and 6 L of water (`STORES_WATER_L`). WHO (Howard and Bartram 2003, after White et al. 1972) gives about 6 L for a day of moderate work in the sun at 30 °C, and 4.5 L at 25 °C. FEMA's gallon (3.8 L) is the least, for someone at rest. A day fishing in tropical sun is moderate work at 28 to 32 °C. The shop's row now says so: "A day's food and 1.6 gallons of water".

**Its cost, $16 (was $12, not sourced).**
- **Food: $11.00 a day.** USDA's Thrifty Food Plan, December 2025 (issued January 2026): $71.40 a week for a man of 20 to 50, $56.90 for a woman, and 20% more for one person living alone (the report's own adjustment). That's $12.24 a day for a man and $9.75 for a woman; between them, $11.00.
- **Water: $4.87.** Six litres bottled, at about 2.4 cents an ounce. That's from The Shelby Report's account of the 2025 bottled water figures (Beverage Marketing Corporation's, for IBWA), under a chart of IBWA's price an ounce; the text names no source for the price itself.
- **Together:** $15.87, so $16.

**What a player notices.** Staying out costs $4 a day more: $64 more to fill the sportfisher's 14 days. A day trip's first 12 hours are still free (`LUNCH_H`).

## 5. Billfish depths, and swordfish under the moon

Each band (`at`) now holds the depths the tags put most of the fish's time in, by day and by night. A hook outside a band gets nothing from that fish, fading over a third of the band past each end, at least 10 m (`Bites.depthWeight`).

| Fish | Day | Night, M16 | Night, now | Source |
|---|---|---|---|---|
| Sailfish | [0, 40] | [0, 40] | **[0, 20]** | Kerstetter et al. 2011 (16 fish): mostly in the top 20 m, dives to 50 to 150 m now and then, more of them by day. Mourato et al. 2010: most of the day and night in the top 10 m |
| White marlin | [0, 90] | [0, 90] | **[0, 20]** | Hoolihan et al. 2015 (28 fish): 95% of daylight in the top 100 m, 82% of the night in the top 20 |
| Blue marlin | [0, 120] | [0, 120] | **[0, 30]** | Goodyear et al. 2008 (51 fish): by day often at 40 to past 100 m, 17% at 100 m or more; at night 86% in the top 30 m |

sources-figures.md said "about [0, 30]" for both marlin. I've given the white marlin [0, 20], since its tags put 82% of the night in the top 20 m. That is the same rule as the blue's 86% in the top 30 and the sailfish's top 20.

**Swordfish: checked, left as it is.** Step 3 (stream 3, [moon.md](moon.md)) set new moon at night to [0, 75], full moon to [52, 300] and day to [320, 750]. Against §5:
- **New moon.** §5 gives about [0, 75], centred on 25 to 50 m. It matches.
- **Full moon.** §5 gives 64% at 100 to 500 m, centred on 100 to 200, with 36% still above 75. The band's middle is 176 m, and its fade runs to 383 m. A float 6 m down keeps 0.44 of its new-moon chance, which is 36/82. It matches.
- **Day.** §5 has "past 300 to 400 m". It matches.

**What a player notices.** At night a blue marlin takes nothing deeper than about 40 m, and a white marlin or a sailfish nothing deeper than about 30. By day they're as before. The float's 6 m, a troll's 2 m and a kite's 1 m reach all three by night as by day. So only a deep-set bait at night loses them, which leaves more of its bites to the swordfish and the tuna.

## 6. The traps: the soak, and the hauler

**The soak: Austin's fit.**
- **The fit.** Austin 1977 (*Fishery Bulletin* 75:213) fitted Robinson and Dimitriou's 1963 Florida trap data: catch per trap-day = 2.94 B^−0.90 over a soak of B days (R² 0.86). So a haul's catch goes as B^0.10.
- **In the game.** As a share of the two weeks' catch it's `grown( n )` = (n / 14)^0.1. Within the first night, lobsters come in as the night goes (linear up to the first night's share). It's capped at 1.
- **`SOAK.most`.** The 3.6 lobsters on the best bottom are now the 14-night catch. Florida's two-week soak is what it was worked out from.
- **The fade.** It still starts after 14 days: catches fall with a long soak (the 2024 video study of Florida's traps). The 40% floor and the fade's 14-day constant remain judgement.

| Of the two weeks' catch | 1 night | 3 | 7 | 14 |
|---|---|---|---|---|
| M16, 1 − e^(−n/3) | 0.29 | 0.64 | 0.91 | 1.0 |
| Now, (n/14)^0.1 | 0.77 | 0.86 | 0.93 | 1.0 |

Step 3's bait (`Traps.BAIT`) works through the same curve. An unbaited trap fishes 0.35 of a baited one, and the bait draws for 5 nights.

**The hauler: 1.2 m/s (236 ft a minute), labelled.** It's within makers' specs:
- Hydro-Slave's 10 in hanging hauler: about 166 ft/min;
- Mustad's line haulers: up to 425 and 500 ft/min;
- Marco's crab hauler: 600 ft/min.

A small boat's pump would put hers at 150 to 250 ft/min. No measured lobster boat's speed was found.

**What it does to a week's income from traps.** I worked this out with the real `haulOf` from each branch (base dfb8b83, and this one), over 3,000 seeds a case: traps on the reef's edge 6 m down, baited, $8 of bait for 4 traps a set. The rules are the game's:
- the gauge's 22.4 cm;
- berried females put back;
- the day's bag of 6, the heaviest kept;
- `fishValue`'s price.

A week of play is taken as an hour each evening. That's about three island days a real day: two in play, and one while you're away, since the clock runs an island hour a real hour then. (`node tools/figures/traps-week.mjs <base's root> <this root>`, the base from `git archive dfb8b83 src`.)

| A week, net of bait | 2 traps | 4 traps | 8 traps |
|---|---|---|---|
| Each night's soak hauled, 21 hauls | $269 → **$839** | $532 → **$1,576** | $1,032 → **$2,213** |
| Hauled once a session, 7 hauls of 3 nights | $217 → $301 | $424 → $555 | $663 → $760 |
| Once a week, one haul of 7 nights | $41 → $45 | $77 → $82 | $107 → $110 |

| One haul after one night | 2 traps | 4 traps | 8 traps |
|---|---|---|---|
| Lobsters kept, M16 → now | 0.94 → 2.47 | 1.85 → 4.51 | 3.60 → 5.88 (the bag's 6) |

**What changes.**
- A trap is worth hauling after a single night: it holds three quarters of a fortnight's catch then.
- A player who hauls every night's soak earns 2 to 3 times as much from traps a week.
- One who hauls once a session earns 14 to 40% more.
- One who hauls once a week earns the same.
- With 8 traps on good ground, one night now fills the day's bag of 6, so the bag becomes the limit, not the soak. With 4 traps a night comes close to it.
- The set toast's "leave it a few nights" now says "leave it overnight: the first night brings most of it".

## Yours to decide

These are left as they were, for you to decide:

- **Radio shadow.** VHF here is line of sight over the sea only. Marta's antenna is 9.5 m up in a valley, and the island's 300 m massif stands between her and the north side. A real set there wouldn't raise her from behind the island, only Pearl. Modelling that would mean the north side calls Pearl alone.
- **The sportfisher's whips.** Her model draws no VHF whip. Her reach is worked out for one on her hardtop, where real ones are. Two 8 ft whips on mounts there, like the lobster boat's, would change her look.
- **Where a flare's seen from.** The seen test measures from the island's middle (`Away.ISLE`, 113 m up inland), not from its shore or the people on it. By day that's a quarter of the 2.8 km. Measuring from the nearest shore, or from the village and Pearl's camp, would be closer to who'd actually see it.
- **The water bottled.** The $16 counts the 6 L as bottled water from Marta's. Filled at the village tap it would be about $11, the food alone.
- **The hours to parched.** Parched 12 hours after the stores run out (`DRY_H`), and your strength falling to half over 36 more (`WEAK_H`), are still unsourced. sources-figures.md didn't check them, and neither have I.
- **The traps' bait and `most`.** With step 3's bait, which draws for 5 nights, a baited trap soaked 14 nights brings 3.37 of `most`'s 3.6. If Florida's 3.6 a haul already includes bait running out mid-soak, which is likely, `most` would be 3.85.
- **The traps' bycatch.** The chance of something else in a trap still grows as 1 − e^(−n/2) (`haulOf`'s `fished`). It's unsourced and wasn't on the list.
- **Traps' income.** Traps now earn a nightly hauler 2 to 3 times what they did. Whether the bag of 6 should be the limit is a rules question, and those are Florida's rules as the game has them.
- **One melt figure for the whole day.** Each box melts at one rate, a day's mean. A rate for the sun by day and another for the shade by night would be closer, but no source gives the sun's factor (FAO only says the rates "should be upgraded").

## Checks

- **Tests** for each figure:
  - `test/days-out.mjs`: the melt and FAO's box; each boat's antenna, each reach to Marta and Pearl, and the shop's words; the flare by day and night, with the look agreeing with the seen test; the stores' food, water and price; the rescue net with a handheld in and out of range.
  - `test/north-pearl.mjs`: Pearl past and within the lobster boat's reach.
  - `test/getting-home.mjs`: the radio panel with and without a set.
  - `test/m16-fish.mjs`: the billfish's day and night bands, and a 60 m bait by day and at midnight.
  - `test/traps.mjs`: Austin's shares, the first night, unbaited, and the hauler.
- **`pnpm test`** on 0aa4909 passed: every test file, 3,998 checks, and the assets' lock. After it, only the day flare's floor and a comment changed. `test/days-out.mjs`, `getting-home.mjs` and `north-pearl.mjs` were run again on that and pass.
- **`tools/looks/look.mjs` on mid, the flare** (the new `flare-day-2000` and `-2500` shots added). Counting the pixels where red is 40 or more over the mean of green and blue:
  - **By day with the floor:**
    - 300 m: a red point 4 × 4 px, (196, 77, 80);
    - 1.5 km: 2 × 3, (187, 126, 132) against the sky's (122, 161, 194);
    - 2 km: 2 × 3, (187, 135, 140);
    - 2.5 km: 2 × 1, (187, 143, 147);
    - 3 km: nothing.

    Without it (the reach alone): nothing at 2 and 2.5 km, and only a pink tint at 1.5 km. Seen by eye side by side, the floor's point reads as red at 1.5, 2 and 2.5 km.
  - **By night, as step 4 had it:**
    - 100 m: 10 × 11 px, (205, 50, 37);
    - 300 m: its path of glints on the water;
    - 2 km: 10 × 9;
    - 8 km: 8 × 7, (119, 35, 33).
- **All the Spaces' complete check** passed once, on a clean copy of d4a81d7 (`git archive`). It ran with `cli.ts check` from All the Spaces' `main`, 57b4f25, on four cores (`taskset -c 0-3`), under the timing lock, with the load 9.8 at the start. Every check passed and every screen played:
  - draw calls 88 of 150;
  - triangles 252,000 of 300,000;
  - textures 70.3 MB of 128;
  - graphics memory 107.5 MB of 256;
  - 14 sounds of 16;
  - **script memory 119.8 MB of 150**;
  - 7.1 MB downloaded before it's ready (of 10);
  - the whole download 78.7 MB of 80.

  It's one run, and this branch changes figures, not what's held. So the script memory being lower than `m17-flats`' recent readings isn't this branch's doing.
- **No shader changed**, so `tools/gpu-limits.mjs` wasn't needed. The flare's look reads `FLARE_M` in script. The rest is figures and words.
- Not run here: the ready A/B and one-core plays. The M17 session runs those.

## Sources

- Bowditch, *The American Practical Navigator*, ch. 22, the radar horizon ([Wikisource](https://en.wikisource.org/wiki/The_American_Practical_Navigator/Chapter_22)). Standard Horizon HX-870 manual ([manualsdir](https://www.manualsdir.com/manuals/775752/standard-horizon-hx-870.html?page=9)).
- 46 CFR 160.066-7, red meteors ([LII](https://www.law.cornell.edu/cfr/text/46/160.066-7)). Orion 12-gauge red meteor ([West Marine](https://www.westmarine.com/orion-12-gauge-high-performance-red-meteor-flares-9376443.html)). USCG R&D Center, *Daytime Distress Signal Effectiveness*, CG-D-04-20, 2019 ([PDF](https://safety4sea.com/wp-content/uploads/2021/03/USCG-Daytime-Distress-Signal-Effectiveness-2019_12.pdf)).
- FAO Fisheries Technical Paper 436, §7.1 ([FAO](https://www.fao.org/4/y5013e/y5013e0a.htm)). FAO, ice consumption ([FAO](https://www.fao.org/4/r1263e/R1263E08.HTM)). Pew Pew Tactical's coolers ([link](https://www.pewpewtactical.com/yeti-igloo-pelican-coolers-review)). Practical Sailor's cooler test ([link](https://www.practical-sailor.com/belowdecks-amenities/galley/coleman-wins-cooler-cool-off/)).
- Howard and Bartram, *Domestic Water Quantity, Service Level and Health*, WHO/SDE/WSH/03.02, 2003 ([PDF](https://www.arctic.gov/uploads/assets/watersan6-water-quantity.pdf)). FEMA ([Ready.gov](https://ready.gov/water)). USDA, Official Thrifty Food Plan: U.S. Average, December 2025 ([PDF](https://fns-prod.azureedge.us/sites/default/files/resource-files/cnpp-costfood-tfp-dec2025.pdf)). IBWA's 2025 figures, as reported ([The Shelby Report](https://theshelbyreport.com/2026/05/16/bottled-water-names-no-1-packaged-beverage-for-10th-straight-year/)).
- Kerstetter et al. 2011, *Marine and Coastal Fisheries* 3:353 ([BioOne](https://bioone.org/journals/marine-and-coastal-fisheries/volume-3/issue-1/19425120.2011.623990/Sailfish-Habitat-Utilization-and-Vertical-Movements-in-the-Southern-Gulf/10.1080/19425120.2011.623990.full)). Mourato et al. 2010, ICCAT Collect. Vol. Sci. Pap. 65(5) ([PDF](https://www.iccat.int/Documents/CVSP/CV065_2010/n_5/CV065051740.pdf)). Hoolihan et al. 2015, *ICES J. Mar. Sci.* ([PDF](https://billfish.org/wp-content/uploads/2023/09/vertical-and-horizontal-habitat-use-by-white-marlin-kajikia-albida-poey-1860-in-the-western-north-atlantic-ocean.pdf)). Goodyear et al. 2008, *MEPS* 365:233 ([PDF](https://billfish.org/wp-content/uploads/2023/09/vertical-habitat-use-of-atlantic-blue-marlin-makaira-nigricans-interaction-with-pelagic-longline-gear.pdf)). Lerner et al. 2013 ([PDF](https://billfish.org/wp-content/uploads/2023/09/swordfish-vertical-distribution-and-habitat-use-in-relation-to-diel-and-lunar-cycles-in-the-western-north-atlantic.pdf)).
- Austin 1977, *Fishery Bulletin* 75(1):213 ([PDF](https://spo.nmfs.noaa.gov/sites/default/files/pdf-content/fish-bull/austin_0.pdf)). *Fisheries Research* 279 (2024), doi:10.1016/j.fishres.2024.107139. Hydro-Slave 10 ([go2marine](https://go2marine.com/Hydro-Slave-10-Hanging-Hauler)), Mustad Autoline ([Mustad](https://mustadautoline.com/produktvalg/haulingunits/)), Marco ([Marco](https://mail.marcoglobal.com/potfishing_04.html)).
