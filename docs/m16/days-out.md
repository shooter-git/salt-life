# Days out

Stream 8 of [M16](../M16.md). The figures are in `src/game/Seaworthy.js`, the game side in `src/game/DaysOut.js`, and the small hooks in `Game`, `App`, `Hull`, `Away`, `Radio`, `Chart`, `Minimap`, `TimeHUD`, `GameHUD`, `Guide`, `BoatController` and `Together`.

## What each boat can stand

There are no walls. How far out a boat goes comes of the sea she can stand, her fuel, what she can call for help with and what she has aboard.

The sea is worked out for where she is (`seaHere`), about once a second. The open sea's significant wave height is `Weather.seaHeight`, bigger past the far grounds (`withEdge`). The wind sea grows with the square root of the open water to windward, so the island's lee is calm. The swell falls off as the water shoals, and no wave stands higher than half the depth.

| Boat | Easy to, too much at (sea) | Easy to, too much at (wind) |
|---|---|---|
| Kayak | 1.6 ft, 3 ft | 15 kt, 20 kt |
| Center console | 4 ft, 7 ft | 20 kt, 28 kt |
| Lobster boat | 6.5 ft, 11 ft | 30 kt, 40 kt |
| Sportfisher | 10 ft, 16 ft | 35 kt, 50 kt |

`strainOf` gives 0 when she's fine, up to 1 when it's rough for her, and past 1 when it's too much. Past 0.6 she's said to be working hard, her slams cost her up to half as much again (`slamK`). Past 1 she ships green water (`awashLs`, into `Hull.step`'s bilge), which beats the bucket half as far again past it. So the kayak's fine in the bay on a fair day and too much at sea on the same day; a blow sends the console in; the lobster boat rides a gale, working hard; the sportfisher hardly notices a fair day past the far grounds. The radio's weather row says what the sea here is to her, and Marta's shop says what she's for.

The limits are judgement, not a standard: nobody publishes a sea limit for a given length of boat. The 7 ft is the Weather Service's small craft advisory, already in `MarineForecast`. The kayak's 15 to 20 knots is the top of what kayak fishing guides give for abort limits.

**Each boat's figures** (`ABLE`): her cruise and burn (`Chart.fuelFor`, `Gear.fuelBurn( rpm, boat )`), her drift and draught (`Away.awayOf`'s `env`, by `ableEnv`), and what a storm takes off her left out in it. `tools/boat-figures.mjs` measures her cruise, drift and sock from `BoatController`. It was first run on stand-ins; the cruise, drift and draught figures in `ABLE` are from the real models, measured again in the opening stream ([opening.md](opening.md), The real boats): rerun it after a change to a boat's hull or handling. The lobster boat's 5% was measured in M15 in the CPU's sea (9% in the tool's flat water, so it's for comparing boats and for the sock's share); it is 6.6% now, in the game's own fair-day sea.

Leeway: a 19 ft center console 4.9% of the wind (Coast Guard trials); boats under 30 ft about 6% at 20 to 30 knots.

## Ice and the catch

Fish age by warm hours (`keepCatch`). In the box at the sea's 28 C it's fresh for 6 hours, its price falls to half by 12, and at 12 it's off and over the side. On ice it ages 24 times slower: 12 days, the least the FAO gives for fish from tropical water. It keeps as long as the ice lasts, then warms. `f.value` itself goes down (`f.v0` is what it fetched fresh), so everything that reads a price follows. The same reckoning runs in play and while you're away (`App.pickUp`).

A 10 lb bag is $4. A cheap cooler melts a bag in about 15 hours (`meltKgH`). A bigger box melts more all told, as its surface; the insulated hold, 60% of that. ((M17) From sources since ([m17/figures.md](../m17/figures.md)): a cheap cooler 0.2 kg an hour, a bag in about 23 hours, a whole day's mean; an insulated hold or fish box FAO's measured melt, 0.1233 kg a day a degree for a 90 L box in shade, at 28 C and scaled by surface, about half M16's.) Each fish gives up its heat to the ice: 28 C to 0, 3.4 kJ/kg/K against ice's 334 kJ/kg, so 0.285 kg of ice for a kg of fish. The FAO's rule of thumb in the tropics is a kilo of ice to a kilo of fish. Ice takes room in the box, and a fish that doesn't fit beside it pushes it over the side. The sportfisher's icemaker adds `iceMakesKgH`.

(v2.3.0) Room is held for the ice the catch needs (`Seaworthy.iceHeld`, `shortOf`): a fish is let go of ice to make room for, but never below a day's melt of the box (`HELD_H`), or what's left once the fish is chilled, if that's less. Before, a box packed to the lid with fish had no ice left in it, and the catch was over the side in half a day: about 1,100 lb of fish in the sportfisher's big box used up its ice at once (seen in play, 2026-11-10). With no ice in the box, none is held. The icemaker stops when the box is full: there's never more ice than room for it beside the fish, at her berth, under way on the generator or over the hours you're away (it used to make ice without end). The bar at the top is drawn from the box every 20 frames, not only when the save changes, so it follows the ice as it melts, as it's made, and as a guest's catch comes aboard. Riding along, your catch is in her box (`together/SharedBox.js`, [together.md](together.md)).

(v2.4.1) Two bars for the box, each answering a skipper's own question (`Seaworthy.boxBars`, drawn by `GameHUD.drawHold` in a row of their own under the time and your money; the user's call, 2026-11-11):

- **Hold: how many more fish fit.** All the fish in the box, anyone's, against the room they can have: the box less the ice the catch must keep (`fishRoom`: a day's melt, or what there is if that's less). The ice past that isn't counted against them, as it gives way to fish as they go in. That's how it's done: anglers fill the fish box most of the way with ice before an offshore trip and put the fish in among it (the FAO's usual figure for the tropics is about a kg of ice to a kg of fish). The bar turns coral when there's no room for a fish a tenth of that room (`ROOM_LOW`). It's decided by `shortOf`, the catch card's own rule, so the two agree: any fish the bar shows room for goes in, and a full bar is always no room. Before, the bar counted the ice as if it were fish. A box an icemaker had filled read "Hold 1323 / 1323 lb" in coral with 13 lb of fish in it (a player's phone, 2026-11-11), though about 1,270 lb more fish would have gone in. It now reads "13 / 1,287 lb".
- **Ice: how long the catch keeps.** A time, not a weight: the ice at the box's net melt, less what an icemaker makes ("37 days", "5 h"). It says "Making" while an icemaker keeps up, and "No ice" when there's none. Its bar is full at a day (`HELD_H`), so a full bar is the ice the room's kept for. It turns coral with fish in the box and under `FRESH_H` (6 h) of ice left, the hours a fish keeps fresh with none, so the warning comes as long before the ice is gone as the catch has after it. It's shown on a phone too now (before, only once the ice was gone).
- **Together.** A fish going in grows the first bar and takes its chill off the second; the spare ice let go for it doesn't move the second. As melt takes the ice under a day, the room it held goes to fish. Riding along, both bars are her box's, as her owner's game tells it. Her melt is now sent to a hundred-thousandth of a kg an hour, as a hundredth put the time on a guest's bar hours out from hers. The Fish hold panel says the same two figures, and how much spare ice there is to give way. `test/box-bars.mjs` tests the sums, and `tools/box-bars.mjs` shoots the bars and the panel in the boxes that matter at each screen.

## Stores

Food and water, $12 a day ((M17) $16: a day's food, USDA's Thrifty Food Plan for one adult alone, and 6 litres of water bottled, what a day's work in the sun takes: [m17/figures.md](../m17/figures.md)), kept in her lockers (kayak 1 day, console 3, lobster boat 5, sportfisher 14). The first 12 hours out are your lunch. Past that a day's a day. With none left you're parched after 12 hours, and your reeling falls to half over the next 36 (`strengthOf`). Tied up or ashore, you've eaten.

## Sleeping aboard

`model.bunks` on a `Vessel`: stand within 1.6 m and E sleeps till dawn, or dusk by day. On your own the world dims and the clock moves. In company it's a wish like the clock's rest. Too much sea, a hurricane warning or going aground wakes you sooner (`wakeOf`).

Any clock jump now counts for her, aboard or ashore (`passed`). Resting ashore, she's reckoned as if you'd been away. Asleep aboard, she drifts the night's true hours, not play's: about 6 miles overnight at a fair day's wind, half on a sock. That's what the anchor and the sock are for. Past 3 km from the island with no bunks aboard, the clock's menu offers no rest: run for port, or sit up.

## The anchor and the sock

`deepAnchor_<boat>`: at 3 to 1, 600 ft of rode holds in 200 ft (the shelf's edge), 1,200 ft in 400 ft (the hump's top), 2,400 ft in 800 ft (the north ledge). Past that it's 1,800 m, and there's the sock. `driftSock_<boat>` goes out by itself when you leave the helm past the anchor's reach, and comes in when you take it. In `BoatController` it's a cone's drag at the stem head (Cd 1.4, mouth `sockM2`) with a yaw term for its long rode: measured, about half her drift and head to wind. `Away.awayOf` has it too (`left.sock`). Its line is the anchor rode's mesh, out to a small orange trip float riding the waves 26 m upwind, all you see of it. About half is what I recall a raft's drogue doing to its leeway; the search didn't turn up a figure for a boat's sock, so that half is measured from her physics, not sourced.

## Navigation and the finders

Every boat has a compass, free. The kayak and the console buy a VHF (`vhf_*`: a handheld reaches 5 miles, a fixed set on a whip 20; (M17) worked out since from both antennas' heights, the radio horizon of each added: Marta's set, on a pole on her boathouse 9.5 m up, from a handheld in the kayak 9 nm, the console and the lobster boat 11, the sportfisher 12.5: [m17/figures.md](../m17/figures.md)) and a GPS or plotter (`plotter_*`). The lobster boat and the sportfisher have theirs (`BASE`). With no plotter the map's label gives her compass heading in place of home's distance and the fuel, and the dash's chart is blank. With no VHF, the radio panel has only what you carry. Past the set's reach, Marta is static.

The dash set's finder finds the bottom to 1,200 ft (`Instruments.SOUNDER_REACH`), a kayak's puck to 200 ft; past it the HUD says "no bottom" and sees half the fish. The second, deep finder (`deepFinder_*`, none on a kayak) reaches 3,000 ft, the sportfisher's to the deep's floor, with its own screen over the map: the bottom's echo scrolling right to left, so the drop-off is seen as you run over it.

## In trouble

`trouble()` is real trouble: out of fuel, water over the engine, her hull badly worn, too much sea, parched, aground. The tackle stream's `safety` track's second level brings flares and an EPIRB. They show on the radio panel only for real trouble, and they work in a gale, when Marta won't answer a call.

- **EPIRB:** MEOSAR's fix is 5 km within 10 minutes; found and towed in, at the away fee's cap. On your own, the time it took goes by.
- **Flares:** three, restocked when you land. Seen by day within 3 miles of the island, 15 on a clear night, or by someone else near you. ((M17) By day 2.8 km since, 1.5 nm, by Allard's law and the Coast Guard's daylight trials; the night's 25 km stands: [m17/figures.md](../m17/figures.md).) Others in the room see it go up and are told whose it is, if it's within that reach of them.
- **Nothing to call with:** someone happens by after 4 island hours inside 14 km, 18 past it, so nobody's stuck for good.

## Sources

- Leeway: [Coast Guard leeway trials, DTIC ADA252345](https://apps.dtic.mil/sti/pdfs/ADA252345.pdf); [Leeway, Wikipedia](https://en.wikipedia.org/wiki/Leeway).
- Fish on ice: [FAO, the effect of species and fishing ground](https://www.fao.org/4/v7180e/V7180E0d.htm); [FAO, ice consumption](https://www.fao.org/4/r1263e/R1263E08.HTM); [FAO, icing of fish](https://www.fao.org/4/P3407E/P3407E07.htm).
- EPIRB: [NOAA SARSAT, MEOSAR](https://www.gps.gov/sites/default/files/2026-04/Foster%20CGISC_SARSAT_Final.pdf).
- Kayak limits: [Reel Yaks on wind forecasts](https://reelyaks.com/blogs/news/reading-wind-forecasts-kayak-anglers-beaufort-scale).
- From general knowledge, not checked against a source this time: VHF ranges, a flare's reach, ice's melt rate in a cheap cooler, a person's 4 litres of water a day. ((M17) Each checked in [m17/sources-figures.md](../m17/sources-figures.md) and corrected from its sources in [m17/figures.md](../m17/figures.md).)
