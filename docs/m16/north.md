## The way over, made easy to find

The user walked the island and couldn't see the path at all. Rendered at each stop, three things were wrong, and they were each worse than they sounded.

- **The tread came out in patches.** The path mask is drawn thinner than the map that carries it can hold: the ground's maps are 2 m a texel on every tier, and the valley's trail is 0.6 m either side. Measured along its middle as the ground's shader reads it (it starts to show at 0.28 and it's whole at 0.62), the stretch from the square to the fork was 30% whole, with 17 gaps up to 13 m long; and on high, where the 1 m mask is averaged down, the way over itself was 49% whole, with 259 gaps. Low's way over was fine.
- **The fingerposts couldn't be read from where you walk up to them.** An arm pointing straight on is edge on to whoever's coming along the way it points: the square's two arms both were, and from the valley's foot the post was a bare stick. The start's North beach arm was the same.
- **The map had nothing to show** until you'd walked it.

What it is now:

- **One path** (`NorthTrail.wearWay`), from where the plaza's path comes in, up the valley and on to the beach: worn into the ground's baked map at 1.05 m either side, its width wandering as the tread's does, full down the middle and gone by twice that, its edge broken by the ground's own detail. The thinnest it reads along its whole length above the beach is 0.48, on the last zigzags; nowhere is it missing, and all of its 1.5 km above the beach is one line on both islands. 4 ms as the map's baked. It's wider than a real footpath (about 2.5 m against a metre), because that's as narrow as a 2 m map holds a continuous line; a metre's would take a finer map than the budget has.
- **Nothing placed moves.** It's worn into the map at the end of its bake, so the masks the rocks, plants and debris read aren't touched: rock positions compared before and after, 688 on high and 599 on low, are the same to the centimetre, and debris doesn't read it at all. What stands on the valley's stretch and in the few metres about each post is taken off after placing, as the way over's are.
- **On the map** (`ChartBake.drawWay`): a red dashed line over a pale edge, from the square to the beach, there from the start and over what you haven't charted, as the one thing the chart tells you before you've been. As if someone had pencilled it on for you. It's on the plotter's close ranges too, since the plotter draws the same sheet. The Guide's tip on going round the island says to follow it.
- **More signs**: eight new fingerposts (`TRAIL_POSTS`), at the top of the boardwalk on the way to the square, up the valley, at the hairpin in the east where the way stops heading away from the village and comes back north, the plateau's top, the two turns on the plateau that double back, where it goes over the edge into the gully and partway down its zigzags. Each says how far on and how far back (true within a fifth: the test measures it), with its top painted as a walker's blaze and more fill in the shade, because bare wood goes near black under the trees. Their arms lean across the way you come, tip over the path, near enough the way to go, so they're read walking up; the square's are now at 2.2 rad where the true way's 1.5.
- **Lighter than before**: a post was 2 draws and 3 for each arm, now 2 in all (the wood and the planks one mesh by their vertices' colours, the letters a row each of one canvas), drawn only within reading range (110 m along the trail, 220 m for the start's). The view from the start went from 71 draws to 41, though other streams' edits are in that figure too; the most near the way itself is 48, at the gully top looking over the beach.
- `test/north-way.mjs` tests it. **Checked** headless on the CPU (SwiftShader), low and high, at each stop. **Not checked**: a real GPU or phone. The forest floor's so dark in these renders that the tread's only a little lighter than it, though it does read as a line; whether that's as dark on a real screen is for the user's eye.

## The whole chart

Asked for by the user after M15 (through another session, 2026-10-31): in v1.11.1 nothing shows the whole chart. The minimap's a small circle about you, the plotter's at the helm, and buying Marta's chart added nothing you could look at as a whole.

- **On the Fish Hold's Chart tab**, above the marks (`game/ChartMap.js`): the chart as you've charted it, or as Marta's has it if you've bought hers, north up as a paper chart's read. Where you are and which way you face, your boat when you're ashore, your marks as the plotter's red diamonds with their numbers, the names you've come to, the way over's dashes, a scale in feet close in and nautical miles further out.
- **Moved** by a drag, zoomed by a pinch or the wheel, or by its buttons; a double click zooms in; You brings it back. From 120 m to the far grounds' whole 32 km. It stays where you left it while the tab's redrawn. The names go by the zoom as the minimap's do.
- **What it costs.** It draws the minimap's own sheets, so it holds no copy of them, only a canvas the size it's shown: 0.5 MB on a 390 wide phone, outside script memory. Its effect on script memory was below the reading's noise (the heap read lower after opening it, on both screens, as other work let go). A draw's under a millisecond; it's drawn when moved, and once a second while it's open. Nothing's made until the tab's first opened.
- `test/north-chartmap.mjs` tests its view, its zoom and its scale. **Checked** headless on the CPU at 1366 by 768 and 390 by 844, a drag, a two-finger pinch and the wheel sent as pointer events, and the buttons clicked. **Not checked**: real fingers on a real phone. A gamepad can't move it: the tab's still read with the D-pad but the map stays where it opens.

## Pearl's day, and help on the water

M16's stream 10, the rest of M15's fish camp and its way of getting home. `test/north-pearl.mjs` tests it.

**The boat.** The camp's boat is a pirogue, the working boat of the Caribbean's windward landing beaches, and someone else runs her: Pearl buys and sells, and on the radio she calls him Winston.

- What's real, and from where. Her size is Grenada's fishing pirogue as a world watercraft dictionary gives it (quoted on shipstamps.co.uk): 4.6 to 7.3 m, one example 7 m by 1.9 m, 0.7 m deep. She's 7.3 m (24 feet), the top of the FAO's range for Grenada's open trolling pirogues (18 to 24 feet, one gasoline outboard of 45 to 75 hp, two men). Her day is the FAO's too: "Leave 4:00 am", back at 11:00 to 12:00 (the source writes "am" for the return, taken as noon). Her shape and paint are from photographs on Wikimedia Commons, Trinidad's pirogues being the ones there: "Fishing Boat, King's Wharf, San Fernando" (the green top strake over white over a dark bottom, all of it scraped and patched, the black outboard, the whip upright aft, the long low run with the bow lifted in its last quarter), "Moruga coastline" (her bright blue inside, the pale thwarts, the flat transom) and "Fishing at Mayaro" (her trim on the plane).
- What was built (`world/village/Pirogue.js`). In code, on the village's builders: her sheer low aft, sweeping up to a sharp raked bow 1.3 m over the keel; a hard turn of bilge aft going to a deep V forward; a band for each coat of paint, so each edge is a painted line; scrapes, weed, old teal showing through, each side its own from one random stream; STILL TRYING by hand on the white of her bow, in strokes of geometry laid on the hull, so no texture and no draw; thwarts each a little out of square, one replaced in bare timber; an ice box, two red fuel tanks and their hose, a coil, a grapnel, bamboo; a big two-stroke's black cowl, its leg and foot. Everything in the village's wood material: one mesh, one draw.
- Her day (`game/PearlsDay.js`), worked out from the clock and the weather, as the turtles' nights are, so she's in the same place for everyone. Out between 4:00 and 4:45, a run of about two and three quarter minutes out to sea at her own pace in real seconds; back between 11:00 and noon, her last three minutes in sight. Dead slow at the jetty, 21 knots on the plane. She comes in past the jetty's head and round, to come up to its west face head to the sea, as a boat comes alongside on a windward shore; she leaves straight ahead from there. She lies alongside the rest of the day on her own fenders and cleats, so the head's east face stays yours. Lines out to the cleats only when she's made fast. Her outboard's tilted up alongside and comes down to go.
- She stays in one day in seven (her rest day), and past 25 knots or under thunder (the wind now and five hours on, as they'd look at the sky and hear the forecast). From a hurricane's watch until 18 hours after its winds have gone she's up the beach, on rollers that lie there always, and in a gale too: a jetty's face on a windward shore is no place to lie in one. There's nobody to haul her, so it isn't done in front of you: she moves when you're not looking.
- She floats on the sea's own heights (`ocean/WaterQuery`, in doubles, as everything is since "Drawn about where you are": an ordinary object's matrix is already reckoned in doubles), by her bow, stern and sides, with her trim on the plane, working a little on her lines alongside. Her wake is the game's own (`ocean/Wake.js`), a second one made the first time she's seen under way, by day.
- Solid where she lies, alongside or on the beach (`Colliders`), not while she's under way. If your boat's stopped in her berth she lies off, 20 m away, and comes in once you've gone; other players' boats aren't looked at.
- Nobody's drawn in her. A figure's only allowed as a Rocketbox character, and one more skinned character is over this piece's memory; so she runs without a crew, which shows from close to. Hook for the sound stream: `camp.boat.sound` -> null or `{ x, y, z, speed, throttle }`.

**Its lights.** Kerosene, warm and dim (`game/CampLights.js`): the hurricane lantern under the lean-to, a lamp in the shed showing at a new small window and through the gaps in its boards, and the fire pit some nights, about one in three, not in rain or past 10 m/s. On at dusk (18:05 and after), each out by its own hour that night between 20:24 and 22:36; the lantern and the shed again from 3:40 before dawn on a day the boat goes. Out altogether in a gale, with a hurricane warned of, or in one. On the shared block (`materials/LocalLights.js`): three sources with a `scale`, which LocalLights passes over before anything's reckoned when it's 0, so a light that's out costs nothing and takes no slot. What's seen of them is one small mesh, drawn only while one's lit and you're within 90 m; past that the lantern's a point of light from the sea (`world/Glare.js`), a dim one, lost in the air by about 2.6 km. The lantern's glass no longer lights itself all night as the village's do.

For the turtles: `LAMPS` and `lightsAt( hour, day, pick, since )` in `game/PearlsDay.js` (pure), `camp.lightsAt( hour, day )`, `camp.lightsOn( hour, day )`. The turtles' piece reads them from LocalLights, with their scale, as it does any lamp.

**Its roofs in a hurricane.** The village's own way: the shed's and the lean-to's tin are two more holes on `Village.roofHoles` (`addRoofHoles`: 16 of the roof material's 16 slots now, so the next roof needs the list grown), their fates `pieceState( D, 'tin', 900 + k )` so the same on every tier. Sheets lift off at their thresholds (31 to 44 m/s) and fly (`FlyingSheets`), purlins and the sky showing through; a blue tarp a day or so after; new tin in three to six days, weathering in over a month. Over 15 picked hurricanes 16 of 30 runs went, as the village's do: not every roof every time. No new shader or texture. The lean-to's slab now reckons up from its eave, as the material's holes want.

**Pearl coming out for you.** On the north side (nearer her jetty than Marta's dock, or `windwardAt` past 0.5), the radio's panel has a third row. Through her hours she answers: she'll send Winston out, or raise him if he's out on the grounds. $15 and $4 a 100 m, against Marta's $20 and $5: a smaller boat, cheaper to run, and nearer when you're round there (2 km off her jetty is $95; Marta from there, 900 m round the island's far side and more, costs a good deal more). The pirogue's quick out (18 knots) and slow in tow (5 knots). She brings you to her jetty: on deck, on the camp's mooring off the head's east face (it's an anchor to the game, so a save and Marta's own tow know where she is), the diesel drums at the jetty's foot. Short of her fee she takes what you have. Past 15 m/s she says no, a little sooner than Marta (an open boat), nor with a hurricane watched for or warned of, nor with the boat up the beach. Out of her hours there's no answer. The rest of it is as the tow: a dim, a line of text, no time passes.

**Marta's can.** A fuel drop, as the towing firms do. What's real: BoatUS's members pay for the fuel alone, the delivery being covered; for everyone else no price is published, and it's billed as the boat's time like a tow, whose non-member average was $1,091 in BoatUS's 2025 figures (Sea Tow says $900 to $1,000 on average, and $250 an hour and up). So: 19 L (5 gallons) at her pump price ($28.50 of diesel), a call-out of $40, and her boat's time at her tow's own rate: $2.50 a 100 m, for out and back at speed is exactly half the boat hours of out at speed and back in tow. A kilometre off, $94 against her tow's $70; they cross 1.9 km off (`CAN_PAYS`); at the bank $311 against $505; 24 km off $669 against $1,220. On the same call as her tow, a second thing to ask for: no more than the tank has room for, and you're where you were, with the sum in a line of text. Short of it she takes what you have, as her tow does. A boat with no engine isn't offered one. What a boat burns goes through `fuelOf( boat )` in `game/Help.js`, from `Boats.js`; gasoline's price is `Gear.GAS_PRICE` if the fleet stream gives it one, diesel's till then.

**What it costs**, on low, near: the boat 2,207 triangles (4,171 on high), one draw; the lights about 100 triangles, one draw at night within 90 m, one sprite past it; 250 KB of script memory, measured under Node (224 KB her geometry and object, 26 KB the lights), a wake's arrays more when she's first seen under way; no download but the code. Built only with the camp, never before ready.

**Checked** headless on the CPU (SwiftShader, 720p, low): the boat at her berth and coming in, the camp at night, the roof after a hurricane, side by side with the San Fernando photograph. `test/north-pearl.mjs`: her day, the way she goes (at least 1 m of water all along, on both islands, clear of the jetty), the weather, her colliders, the lights by the hour, a light that's out costing nothing, the tin's fates, the sums, the radio's rows.

**Not checked:** how any of it looks on a real GPU or a phone. Two players seeing her together (she's from the clock, so they should). The Glare's strength against a real night sky. **Not done:** anyone in her; other players' boats in her berth.

## Other shores, shells and the hurricane's wrack

M15 left the north beach with all the finds, and the bay's beach with the odd one off the same list. `test/north-shores.mjs` tests what follows.

**What the island really has.** Reading the bake (sand over 0.55, little rock, gentle, 0.15 to 3 m up): two beaches, the bay's (15,000 m²) and the north beach (3,300 m²), and nothing else over 200 m². The rest of its shore is rock with a strip or a pocket of sand: the bay's east side (a narrow foreshore, x 182-186, z 5-85), the rock down each arm of the bay, one pocket on the north coast 100 m west of the north beach, and the mangroves on the west. So those are the shores. No beach was invented.

**Each shore, by what brings things to it** (`game/Beachcomb.js`, `BEACHES`; each day's from the day alone, the same for everyone, and the north beach's M15 days are unchanged to the digit):

| Shore | Why | What it gets |
|---|---|---|
| North beach | windward; the trades and the North Equatorial Current bring the Atlantic's drift | as M15; now and then a big shell after a sea |
| The bay's beach | the lee: nothing's come far | what its own bottom gives up (six-keyhole sand dollars, sea egg tests, tellins, fighting conchs, olives, an emptied queen conch), what the village has lost (sea glass, a lure off the pier, once in a long while a stem of an old clay pipe, as Port Royal's seabed is littered with) |
| The bay's east side | the trades blow across the bay toward it, so what floats ends up here | floats, driftwood, a sponge, a sea fan torn off in a blow, the sand flats' shells |
| The rocks down each arm | no drift to speak of | the splash zone's top shells and bleeding teeth, cowries from under the stones |
| The pocket west of the north beach | windward, and it holds what's jammed in it | drift, the reef's big shells, a glass float may lodge unbroken |
| The mangroves' back | prop roots comb out what floats: studies in Honduras and Florida find them holding more litter than the beaches | red mangrove seedlings, floats, a bottle once in a long while, mangrove periwinkles |

A sea in the bay (`App.beachDays`' `lee`, from the bay's surf) turns more out on the lee's shores, as a north sea does on the windward's. Seed-pods and glass floats don't reach the lee.

**No wrack line on the other shores.** The north beach's costs 66,000 triangles on low; this piece has 3,000. It wouldn't be right either: a lee beach has no sargassum bank, and the bay's beach already has its scatter of weed, shells, coral and coconuts from the debris. So only the finds are added.

**The shell collection** (`game/Shells.js`): fourteen, each checked to live in these islands.

| Shell | Drawn | Where | How rare |
|---|---|---|---|
| Queen conch, *Aliger gigas* | 22 cm | bay, east side, north beach | uncommon |
| Fighting conch, *Strombus pugilis* | 8 cm | bay, east side | common |
| Sunrise tellin, *Tellina radiata* | 6 cm | bay, east side | common |
| Turkey wing, *Arca zebra* | 7 cm | east side, rocks | common |
| Netted olive, *Americoliva reticularis* | 4 cm | bay | fairly common |
| West Indian top shell, *Cittarium pica* | 8 cm | rocks | common |
| Bleeding tooth, *Nerita peloronta* | 3 cm | rocks | common |
| Atlantic yellow cowrie, *Naria acicularis* | 2 cm | rocks | fairly common |
| Measled cowrie, *Macrocypraea zebra* | 7 cm | rocks, pocket | uncommon |
| Mangrove periwinkle, *Littoraria angulifera* | 3 cm | mangroves' back | common, there only |
| Flamingo tongue, *Cyphoma gibbosum* | 3 cm | north shore, rocks, after a blow | rare |
| King helmet, *Cassis tuberosa* | 20 cm | north shore, east side, after a sea | rare |
| Atlantic triton, *Charonia variegata* | 25 cm | north shore, after a sea | rare |
| Music volute, *Voluta musica* | 7 cm | bay, east side | rarest, about once in 25 days |

- **Left out, though the brief named them:** the junonia (North Carolina to Texas and Mexico, the Gulf's), the lightning whelk (the Carolinas to the Gulf; a source says "Caribbean Sea" but none names an island) and the sunray venus (North Carolina to Texas). In their places the sunrise tellin, the king helmet and the music volute, the last recorded from St Lucia, Barbados, St Vincent, Grenada, Trinidad and Tobago.
- **The queen conch is a keepsake.** It's on CITES Appendix II, so trade in the shell needs a permit; a person may carry up to three as personal effects; some islands limit it further (Turks and Caicos: three mature shells a person); Florida bans taking them. So one of yours is in your set and a spare is yours to keep: nobody buys it, and the game says why. An empty one on a beach has the fisherman's cut in its spire, as real ones do: that's how the meat's got out, and it's what's in the great middens.
- **The flamingo tongue is drawn plain.** The orange spots everyone knows are the living animal's mantle and aren't in the shell.
- **Kept**: the first of each goes to your set, a spare with your finds (Marta pays a dollar to $35). The Shells tab in the Fish Hold shows the set as a drawer, all to one scale (5 px a cm, a scale bar over it), so a queen conch is eleven times a yellow cowrie, as it is; an outline at its size with its name and where for each you haven't got; tap one for a close look and all it says. Its pictures are drawn from the same numbers as the shells on the sand (`world/ShellShapes.js`, a little z-buffer), one at a time and only when you open the page.
- **What completing it gives**: Marta wants a whole set for a tray by her table: $200, your shells laid out there at their true sizes for anyone to see, built only when you're near. Plain, as asked. It's one field in the save, `shells`, with its default in `Shells.readShells`; saves from before load with none, and the save's version is unchanged.
- **How long**: walking every shore every third day, about 27 game days for a whole set (12 to 57). Most players will take longer.
- **The shapes**: a gastropod is the curve of its mouth swept round a logarithmic spiral (Raup 1966), with its shoulder knobs, canal, flared lip and narrowed mouth on that; a cowrie or an olive a rolled ovoid with its slit; a bivalve one valve, its beak at the hinge. Each marking's worked out at each vertex, compared side by side with photographs of each from Wikimedia Commons.

**The hurricane's wreck in its wrack** (`Beachcomb.wreckageAt`, `world/debris/WreckPieces.js`): 16 to 30 pieces on the bay's beach, more the higher its sea came, from the storm alone so the same for everyone. Sheets of roofing tin (the roofs' own material, colours and bend), the pier's planks (the debris's), a board shutter, a plank door, the village's crate and fish pot (Props' on high; on low a stove-in few of their slats, since they're 300 triangles whole), a kitchen chair on its side. Each lies with one end or edge under the sand, a mat or two of weed heaped against it from the storm's own wrack, not laid on top. They stop at the top of the beach (2.2 m up): the storm's wrack line can reach the village's grass, and heavy things are dropped first. They're moved off the buildings' footprints and Marta's and Joe's stalls. Each is cleared on its own day, from 30 hours to ten days after, as the sheets on the ground are, so the beach thins: 25, 17, 9, 3, 0 pieces at 6, 60, 120, 200 and 239 hours in one storm.

About half is sound enough to carry to Marta as scrap: a sheet of tin $4, a plank $2, a shutter $5, a door $9, a fish pot $8. A sound sheet really does go on someone's lean-to after a storm. What's picked up stays gone as long as it could have lain there. Nothing of this comes before the storm leaves its wrack, and no rock, plant or debris moved: nothing here reads or writes their random streams.

**A saving along the way.** Each find was its own draw: 40-odd on the north beach on a good day. Now a shore's finds are drawn a stretch of 70 m at a time, one mesh a material, made the frame after anything on it changes, and let go when you're far.

**What it costs**, on low, worst case (the bay's beach, the morning after a hurricane, three days of finds): see the readings below.

**Sources:** queen conch: [Wikipedia](https://en.wikipedia.org/wiki/Aliger_gigas), [CITES Res. Conf. 13.7](https://cites.unia.es/file.php/1/handbook/eng/res/all/E-Res-13-07R16.pdf), [50 CFR 23.15](https://www.law.cornell.edu/cfr/text/50/23.15), [Turks and Caicos](https://www.visittci.com/travel-info/buying-collecting-exporting-conchs-shells-corals). Others: Wikipedia's [fighting conch](https://en.wikipedia.org/wiki/Strombus_pugilis), [sunrise tellin](https://en.wikipedia.org/wiki/Tellina_radiata), [top shell](https://en.wikipedia.org/wiki/Cittarium_pica), [bleeding tooth](https://en.wikipedia.org/wiki/Nerita_peloronta), [measled cowrie](https://en.wikipedia.org/wiki/Macrocypraea_zebra), [yellow cowrie](https://en.wikipedia.org/wiki/Naria_acicularis), [periwinkle](https://en.wikipedia.org/wiki/Littoraria_angulifera), [flamingo tongue](https://en.wikipedia.org/wiki/Cyphoma_gibbosum), [king helmet](https://en.wikipedia.org/wiki/Cassis_tuberosa), [triton](https://en.wikipedia.org/wiki/Charonia_variegata), [music volute](https://en.wikipedia.org/wiki/Voluta_musica), [six-keyhole sand dollar](https://en.wikipedia.org/wiki/Leodia_sexiesperforata), [sea egg](https://en.wikipedia.org/wiki/Tripneustes_ventricosus), [sea fan](https://en.wikipedia.org/wiki/Gorgonia_ventalina); left out: [junonia](https://en.wikipedia.org/wiki/Scaphella_junonia), [lightning whelk](https://en.wikipedia.org/wiki/Sinistrofulgur_sinistrum), [sunray venus](https://en.wikipedia.org/wiki/Macrocallista_nimbosa). Mangroves holding litter: [Honduras and elsewhere](https://www.boa.unimib.it/retrieve/ad84b5f3-35d5-4f17-a270-6a0c965881b9/Cerri-2025-Marine%20Pollution%20Bulletin-VoR.pdf), [Florida](https://www.fau.edu/science/documents/espinosa-cristal2022.pdf). Not found in a source I could check: the turkey wing's range beyond general guides, and what a lee beach's scatter is; Warmke and Abbott's *Caribbean Seashells* (1961) is the book to check them in.

## The plotter and the compass

M16's stream 10. `test/north-plotter.mjs` tests it; `world/boat/PlotterChart.js` is new. What M15's "Charts and finding your way" left: the far sheet's blur close in, the night colours, the Hump's label, proper names, the gimbal, and the radar's true heading.

**Close in, a vector chart.** A real plotter's chart is vector data, drawn for the screen at each range: sharp lines and flat depth areas at any zoom. Ours blew up the far sheet, 32 m a pixel (64 on low), into a blur.

- The plotter now has one small canvas of its own: its screen and 16 pixels round it. Where a sheet's pixel would be more than 1.6 of the screen's, it reads the seabed for just that view (`TerrainData.heightAt`, the ground the sounder reads) on a grid every 4 pixels, smooths it over half the seabed map's cell, and draws it: the four depth areas filled, the contours and the coast as lines at the screen's own pixel (marching squares), the 60 ft safety contour bolder, as S-52 has it. That's the far sheet up to 3 NM across, the waters' sheet up to 0.75 NM. Further out, and over the island's own sheet, with its reefs, buildings and lights, it's the sheets as before.
- Drawn again only when the view's changed: its range, its palette, the chart (once a second at most), or when she's gone 14 pixels. The atlas copies it at each of its redraws, as it stands, a pixel at a time. That's fewer sheet draws than before, when each one was scaled into the atlas 4 to 7 times a second.
- Its own soundings at those ranges, from the same ground, on a lattice fixed to the sea, jittered as a surveyor's lines wander. At the closest range over the bank M15 had one far-sheet sounding, 700 m apart; there are some 40 now.
- Blank where you haven't been still holds, from the same cells, its edge now a clean line (the far sheet's cells are 128 m, a soft smear 100 pixels wide when blown up).
- The seabed's own map is 32 m (64 on low), so the lines close in are as true as that map: smooth and sharp, not more detailed than the ground. The bar's crest and the bank's rim read shallow, as the sheets do, by taking the shallower of the smoothed depth and half the real one.

**Ranging in when she's stopped.** M15's rule ranges out with the distance from the island, so over the bank the plotter was at 12 NM across and over the Hump at 6: you never saw its closest range out there, and the sandbar was 30 pixels long. There's no key for it, as ← → are the radar's. So now, under 3 knots for 4 seconds (drifting, anchored, fishing), it ranges right in to its closest, 0.35 NM, and goes back out when she's under way. My decision, the plain way to have this seen on every device: a range key could be added beside it.

**Its night colours.** S-52's own DUSK and NIGHT tables as OpenCPN gives them (`data/s57data/chartsymbols.xml`; `S52_DUSK`, `S52_NIGHT` in `ChartBake.js`): deep water 7,7,7, shallows 3,4,19, land 13,10,8, contours 31,34,35, names and soundings a dim grey that's lighter than the water, as the ink turns over after dark. The bars, her mark, your marks and the fish take S-52's user-interface colours. A black background, not a dimmed white one, because a dimmed white chart still lights the wheelhouse (the reasoning in the IHO's papers on the palettes).

- It changes as the VHF's amber comes on: dusk from `G.night` 0.2, night from 0.7, 0.03 either way before turning back, so it doesn't flicker.
- Only the plotter's screen. The sounder, the radar, the dials and the minimap are as they were.
- A change of palette is one redraw, not a copy of a sheet. A vector view's simply drawn in the palette. A view with a sheet in it (by the island) is drawn by day, and its pixels looked up in one table of 12 KB, 16 steps a channel, the only pixels read back.
- One departure: S-52's night makes no-chart the same 7,7,7 as deep water, and tells them apart by a pattern over it (NODATA03). Here it's a flat 17,19,19, for blank to still read as blank.

**The Hump's label.** It was 500 m north of its top, over 266 m. Now at (5140, -3320), the middle of all that's shallower than 110 m on both the seabed's maps, over 102 m (its top's 99). Checked at the same time, all fine and now tested: the ledge's over 213 m on the terrace, the bank's over 19 m, the bar's over 0.4 m (0.7 on low), the canyon's in it at 179 m, 130 m deeper than 300 m either side.

**The chart's names.** Named as a real chart of these islands has them: a shape, a colour, a family, a ship, a saint, a surveyor. The kind of thing stays in the name wherever a chart would have it, so nobody wonders where Joe's "the bank" is. Change any in `NAMES` in `Chart.js`; ids and saves don't use them.

| Chart | Plain | Why it's that |
|---|---|---|
| Pelican Bay | the bay | the birds that work it |
| Battery Head | the bay's east head | an old gun battery, as Fort Point and Gun Point are |
| Goat Head | the bay's west head | the Windwards' Goat Point and such |
| Govt Pier | the pier | a chart's abbreviation, as for a Government Wharf |
| Mt St Anne 992 | the summit | a saint, with its height in feet, as Grenada's Mt St Catherine |
| Snook Creek | the mangrove creek | the fish that hunt it |
| Smugglers Cave | the sea cave (west) | as the Grenadines' tales go |
| Cathedral Cave | the sea cave (north-west) | its shape |
| Gallows Point | the north-west point | as Port Royal's |
| Gallows Pt Lt | the lighthouse | how a chart writes a light (Alligator Reef Lt) |
| Worlds End Reef | the windward reef | the Tobago Cays' real one, the last before the Atlantic |
| Mary Joseph Wk | the wreck | a coaster's family name, "Wk" as a chart has it |
| Turtle Beach | the north beach | what nests there; Tobago's has it |
| Pearl's Landing | the fish camp | whose it is |
| Pelican Canyon | the canyon | named off the bay it heads for, as Hudson Canyon is |
| Sigsbee Ledge | the north ledge | a surveyor, as Pourtales Terrace off the Keys (Sigsbee commanded the *Blake*) |
| Sisters Hump | the hump | its three peaks, and the Keys' Marathon Hump, Islamorada Hump |
| Thunder Bank | the bank | a ship, as Thunder Knoll (HMS Thunder), and its surf |
| Silver Bar | the sandbar | its colour, awash |

- The chart's name where the chart's drawn: the minimap, the plotter. Both where it's told: "On your chart: Thunder Bank (the bank)", "You've found the bank: … · Thunder Bank on your chart", the Chart tab's list, the Guide's chart tip. Plain everywhere else: Joe, Marta, the log, the Records and the forecast. `Places`' ids and names and saves are untouched (`namedAs`).

**The compass card on its gimbal.** A real card rides level on its pivot by its own weight while the bowl pitches and rolls round it. `BoatModel.swingCompass` now also keeps its tilt (`_gimbal`, `GIMBAL`): the world's up in her frame says the tilt that would have it level, about the bowl's two axes, with a pendulum of 0.8 s, damped 0.6, the fluid dragging it with the bowl. In a seaway of 15° roll at 4 s and 6° pitch at 3 s the card's about 4° off level with the bowl 16°; a lurch of 20° in a third of a second has it 9° behind. It touches at 30° of pitch and 45° of roll, then goes with her: Silva's 102 and 125 publish those figures for their internal gimbal; a retailer gives a Ritchie's as 45° and 90°, and Ritchie's own sheet gives none, so I took the published pair. It tilts about the dome's middle, 20 mm under it, so its rim stays inside the dome at every tilt (51 of 52 mm). Its low side goes under the bowl's top past about 25°, as into a deep bowl. No new triangles: a real gimbal's inside the bowl, unseen. It doesn't lean to her acceleration in a turn, as a real one does a little. Its heading reads as before.

**The radar's heading.** It reads magnetic, and says so: `HDG 096.3°M`. A boat this size has no gyro: one heading sensor, a fluxgate compass, feeds the radar and the plotter over NMEA (Furuno's 1815 takes HDG, HDM or HDT), so both show the same magnetic figure. Furuno's own users complain on its forum when a display shows them true beside a magnetic compass, 8° out, which is what ours did. Its bearing scale goes with it: its 000 at magnetic north, heading up, as before. To the degree, it's the plotter's figure all round.

**What it costs**, on low: script memory about 0.08 MB kept (the grid 66 KB, the look-up 12 KB, its few soundings) against a share of 0.2, plus 0.2 MB of garbage a redraw at night by the island only (the pixels read back; its canvas, 278 x 199, 0.2 MB, is off the script's heap); 0 draw calls, 0 triangles, nothing before ready (the canvas and its grid are made the first time the plotter's drawn, aboard, and the chart's bake is untouched). A redraw on this machine, busy, headless, on low: 0.6 to 1.6 ms typically out at sea, 6.6 ms with the look-up, 20 ms at worst; on high 2 to 13 ms and 34 at worst. Every few seconds at most under way. The first redraw with a sheet in it at night is slower once (see Not checked).

**Checked:** in Node, the lines against known fields and the real seabed on both maps, the palette's every colour, what's redrawn when, the labels, the names, the gimbal; the instruments' whole screen at night (none of its colours brighter than 70 of 255) and the sounder unchanged. Headless on the CPU (SwiftShader) at a true 720p, low and high, by day, dusk and night, over the bank and the Hump at the closest range, beside M15's blur and beside a real ECDIS's screens (the session's side-by-sides).

**Not checked:** the GPU and phone look and cost of it; a real phone's time for a redraw; the first night redraw with a sheet in the view, whose first read of the pixels took from 1 s to 12 s on SwiftShader with the machine at a load of 50, and milliseconds after that (a real GPU should take milliseconds the first time too; not measured); a photograph of a plotter's S-52 night mode (Commons has none: the side-by-side's real one is the DEV Aratere's ECDIS by night and an oil tanker's by day). The fluid-damped pendulum's figures are chosen, not measured on a real card. Hurricane-force heels on a real compass.

Sources: [OpenCPN's chartsymbols.xml](https://github.com/OpenCPN/OpenCPN/blob/master/data/s57data/chartsymbols.xml); [Silva 102B/H's gimbal](https://shop.foghmarine.com/silva-102b-h-compass.html); [Furuno 1815's brochure](https://cdn.shopify.com/s/files/1/1406/4308/files/model1815w.pdf); [Furuno's forum on true and magnetic](https://furunousaforum.com/threads/heading-line-on-radar-display-true-vs-magnetic.4683); [DEV Aratere's ECDIS, TAIC](https://commons.wikimedia.org/wiki/File:DEV_Aratere_ECDIS_21_June_2024.png); [an oil tanker's electronic chart, Hervé Cozanet](https://commons.wikimedia.org/wiki/File:Navigation_system_on_a_merchant_ship.jpg).

## The turtles, minded

`game/Turtles.js` (who, when, what each does: pure, tested under Node), `world/NestingTurtles.js` (what's drawn). `test/north-turtles.mjs` tests it. What M15's turtle beach left for later: a hatchling's tracks, the turtles minding a light or you, and the hooks for their sounds.

**What's real, and from where.**
- Keeping back: Western Australia's flatback code of conduct (DBCA) has 15 m, lights off, while she's coming up and while she digs her body pit, up to 2 m behind her at the egg chamber, 1 m behind her laying ("not sensitive to her surroundings"), over 3 m as she covers, 15 m as she goes back; "very sensitive to light and movement on the beach" while she's coming up. Christmas Island National Park's says stop at 15 m, behind her, low; closer (2 m) only once she's laying; no white light, never on her; for hatchlings no lights at all, and don't stand between them and the sea. Both name no figure for how long a light takes to turn her: that (how many seconds' worth) is my choice, below, made so that an accident doesn't do it.
- A false crawl is a real turtle's answer to being troubled, and real ones mostly come back another night (SWOT, Florida FWC). So a nest laid "in the clock" still hatches 50 to 60 nights on whatever happened that night.
- Hatchling tracks: from USGS photographs (Randolph Femmer, public domain): two rows of small scooped dimples side by side, alternating, a lip behind each, sometimes a faint line down the middle; each wandering, tracks crossing and merging. A green turtle hatchling's shell is about 5 cm, 25 g (NPS, Mass.gov); the track's 8 to 10 cm is the brief's figure, in keeping with those and the photos' scale. I found no source that measures it.
- The fan: 62 to 76 degrees measured of green turtle hatchlings in low artificial light at a Malaysian site (Conservation Evidence). The turtles' fan was 52; it's about 66 now.
- Hatchlings go for the brightest, lowest horizon; a brighter light on land takes them from it, misoriented, a clear path off the sea's way, or disoriented, wandering round (Salmon; Witherington and Martin; WA's page on light).

**Hatchling tracks.** Each hatchling's route (`Clutch`) is worked out from the hatching and its own number: from the nest's mouth in its own direction in the fan about the nearest of the sea (the low, bright horizon, however she came up), wandering, its time at each point. It's thinned to the points it bends at, and it walks that thin route, so it's always on its own track. A thin strip along each, drawn up to where it's got to (a little behind it), its marks in the strip's shader: all the nest's in one mesh, one draw. It only darkens and lightens what's under it (2 x shade x what's there, 0.5 leaving it alone), so it's lit by whatever lights the sand, moon, flashlight or sun, for no lighting of its own, and no textures. Too far off to tell the marks apart, they become the band of them, a thin dark line. A small crater at the nest's mouth. There into the next morning, fading from 08:00, gone by noon; washed off below the waves' reach as hers are, and at the water's edge at once.

**Her minding.** A turtle's night is still the clock and the day, the same for everyone; `femaleAt` with nobody about is what it was. Each game keeps her alarm (`Minding`) from who it knows is there:
- Someone moving within 15 m ahead of her, 7 m behind (5 and 2 at the egg chamber), adds to it the nearer and quicker they are. Someone standing still only within 3 m ahead of her (1.5 behind; 1.5 and 0.8 at the chamber).
- A light on her: the flashlight in its beam, the searchlight, a boat's floodlights (their glare, within 45 m), the camp's lamps, each by how strong it is on her (`LocalLights`' own intensity / m^2): from a flashlight at 15 m about 2 seconds, at 30 m about 8, a third slower from behind. Kerosene at the camp only troubles her within 10 m or so.
- Nothing troubling her, it ebbs. At 1 she turns back: she stops, her head up, turns, and crawls back down to the sea by a way of her own (seeded by her alone, so two games have nearly the same one). Her up track stops where she turned, her way down's the new one; if she'd started a pit the scuffed patch stays.
- From `lay` she can't be turned, by anything, and that holds through covering and her way back.

So you can walk along the beach below her, or past at 12 m, and she goes on. Stand still at 15 m with your light off and you see the whole thing; once she's laying you can go up behind her.

**Two players.** Nothing's sent about her. Each game reacts to everyone it knows: you, and the others' positions and speeds from `Together`, their flashlight (a new one-letter flag in the pose, `T`), their boat's floods and searchlight, which the pose had. Both games get the same people and lights, so she turns at about the same moment and spot in both (tested). Someone who walks up later sees her as the clock has her until their own game has cause to turn her.

**Hatchlings and lights.** Every 0.4 s, each hatchling on the sand: is any light on it past a third of what draws it as much as the sea's horizon does? (0.02: the flashlight's whole 30 m if it's in the beam, 18 m from the camp's lantern.) If so its route ahead is rewritten toward the light from where it is, the more it's outshining the sea the straighter; at the light, round and round under it. When the light's gone it goes back to the sea from where it is. The way it's come stays: its track shows it. After 10 minutes they all go regardless. Nothing about this is sent either: a local departure, and without a light it's the same in every game.

**Sound hooks.** Nothing's attached and not one thing is heard. `app.turtles.sounds.<name> = ( x, y, z, strength ) => …`, strength 0..1, world metres, fired only while you're near the beach:
- `breath`: at the top of each lift of her head, a gasp out and in: resting on the crawl (0.8), digging (0.9), at the chamber (0.7), laying, quietest (0.6), covering, hardest (1), startled (1).
- `sandThrown`: a throw, from where the sand comes from, behind her: both front flippers digging (0.8), hiding it (1), a rear flipper's scoop or pull (0.45 to 0.5).
- `crawlStroke`: her front flippers biting into the sand, each stroke: up (0.75), down (0.6).
- `scramble`: a nest's hatchlings, every half second while any are on the sand, at their middle, strength how many of the clutch are out; once at 0 when the last has gone.
Her pose runs from her own clock now, not a count of frames, so they match it.

**What it costs, on low, near.** Built only when a nest's hatching near you, nothing before ready: one more draw call and 1,802 triangles at a nest of 89 (at most 1,992: one mesh however many nests, the two nearest), its buffers and routes 0.098 MB in Node's count. No textures, no shared material touched; a new small shader program of its own, compiled the first time it's drawn, on the beach.

**Checked.** `test/north-turtles.mjs` (42 checks, under Node, on the low tier's island). Rendered on low, CPU: a turtle coming up at night, a nest hatching at night with and without the flashlight, the tracks close to and from a walker's eye the next morning, one nest's drawn to a lamp; beside USGS's photographs. The shader compiled with no errors.

**Not checked.** The look on a real GPU or a phone: a CPU render. Two real players on a beach (`tools/two-players` not run for this): the test feeds two `Minding`s the others' figures. The moon: a real full moon lessens what a light does to hatchlings, and that's not modelled. Red light isn't a thing the game has. Nothing here's saved: if you turn her back, quit, and come back the next morning, her tracks are the clock's, not the ones she made.

Sources: [DBCA flatback code of conduct](https://flatbacks.dbca.wa.gov.au/resources/code-of-conduct), [DBCA watching hatchlings](https://flatbacks.dbca.wa.gov.au/watching-hatchlings), [Christmas Island National Park](https://christmasislandnationalpark.gov.au/do/turtle-watching), [USGS hatchling tracks (Femmer)](https://www.usgs.gov/media/images/sea-turtle-hatchling-tracks-sand-2), [Conservation Evidence: low intensity lighting](https://www.conservationevidence.com/actions/3623), [FWC on artificial lighting](https://myfwc.com/research/wildlife/sea-turtles/threats/artificial-lighting/), [DBCA on light](https://flatbacks.dbca.wa.gov.au/what-we-do/research/threats/light), [NPS sea turtles](https://home.nps.gov/viis/learn/nature/upload/Seaturtles1acc.pdf).

## A gale's seas, and the sea's draw

M16's stream 10 (2026-11-01). `test/north-sea.mjs` tests what Node can. A gale's sea was drawn 5 to 7 ft, and its big waves ran up from the south, straight against the trades' wind.

**What's real.**

- NOAA's Beaufort scale has force 8 (34 to 40 kt; a gale here is 39) at 18 to 25 ft on the open ocean, force 7 at 13 to 19 ([SPC's table](https://www.spc.noaa.gov/faq/tornado/beaufort.html)).
- These waters have less. Key West's own [gale warning of February 2021](https://mesonet.agron.iastate.edu/api/1/nwstext/202102011518-KKEY-WHUS72-MWWKEY) gives 6 to 10 ft over the Straits for 25 to 30 kt, gusts to 35, and scaled up that's about 12 ft at 39 kt. The 10 to 14 ft figure itself wasn't found in a Key West product: it's the brief's, and this agrees with it.
- SMB's fetch-limited curve (Hs = 1.6e-3 sqrt( g X / U² ) U² / g, the Shore Protection Manual's) gives 10.6 ft over 100 km and 13.0 over 150 km, the water these waters have upwind (15 ft on its adjusted wind).
- So **12 ft**, and past 14 km half again as the soft edge has it: about **18 ft**, the Beaufort scale's open ocean.
- A higher sea's a longer one: a fully developed sea's peak period is about 4.9 sqrt( Hs ) (from memory of Pierson-Moskowitz, not found in a source here; SMB's 9 s over that fetch agrees): 9.4 s, 11.4 s past the far grounds. It was 7.5 s.

**What was built.**

| Weather | Wind | Was | Now | Past the far grounds | Period |
|---|---|---|---|---|---|
| Calm, fair, cloudy, rain, breezy | to 21 kt | 2.5 to 4.2 ft | the same, to the bit | half again, as it was | as it was |
| Thunderstorm | 27 kt | 4.7 ft | 7.4 ft | 10.9 ft | 7.4 s |
| Blustery | 29 kt | 4.9 ft | 8.4 ft | 12.3 ft | 7.8 s |
| Gale | 39 kt | 5.0 ft | 12.1 ft | 17.7 ft | 9.4 s |
| Southerly gale | 39 kt | 7.1 ft | 13.1 ft | 19.3 ft | 9.8 s |
| Hurricane's wall | 74 to 100 kt | 13 to 18 ft | 24 to 31 ft | | |

- **A blow's own sea** (`Weather.blowSeaOf`, `w.blow`) is added to the swell as energy, on the long waves, from a breezy day's wind up. As it outgrows the swell the long waves come round to run down the wind, about the camera and no faster than a minute and a half. So a gale down the trades leaves the bay in the island's lee by the lee already worked out, wave by wave, and a southerly's comes in.
- **The wind sea's cap** went from 3 to 3.8 x a fair day's, and on low, which has two long waves, the second is 50 m and not 85 in a blow. Rippling goes further and rougher in a blow, and rain's neat rings go. A gale on low had looked like a smooth hill from the deck.
- **The radio** says it: "Seas 10 to 14 feet. Dominant period 9 seconds." Past the far grounds, "Seas 14 to 20 feet". A big sea reads in a wide band, as the Weather Service gives one; a fair day's words are as they were.
- **Whitecaps and spray**: in a blow they break on the long waves' crests, on the CPU's spray as on the GPU. Foam's blown in streaks from a near gale, as Beaufort 7 and 8 have it; it started at Beaufort 10.
- **A sea breaking on her** (`game/BreakingSeas.js`). A 9 m boat rides a 12 ft, 9 s wave like a hill: her stem stays out of it. So the danger's a roller reaching her up on a crest: 60 L in her bilge, a hard slam and a knock about her keel, about one a minute, under way or at anchor, from 9.5 ft. Unbailed, her engine floods in about eight minutes. Marta won't come out in it.

**What it does**, measured on the real boat under Node: at 240 s she heaves 3.9 m, tilts to 28 degrees; 549 L in her head to it, 382 L at anchor (one run each: it varies). Held head to it flat out she's worn 26% a minute, 9% at a third of her throttle, slams being the short seas' (`test/hull.mjs` had been running through them the wrong way, and is mended; `Hull.js` is untouched). Crests reach 0.62 m at the pier's tip in a trades gale and 1.47 m at its head in a southerly, under its 2.3 m deck. The surf and its run-up are the shore's own figures, unchanged, so they reach no further than they did; the north shore's 6 to 12 ft was already in proportion. On low what's drawn counts 10.8 ft, its highest wave 13 ft (four waves can't make a rogue); on high 11.4 and 16.

**The sea's draw, on low.** The sea alone, 640 by 360, the CPU's GPU, by removal in one page (a phone's shader, `?fullsea`; CPU time of the browser's processes, against a busy machine; two rounds, so a figure under about 6% is noise):

| Taken out | Fair, blue water | Gale | Fair, by the dock |
|---|---|---|---|
| Whitecaps, all | 21% | 19% | 26% |
| of it, their marbling and froth | 14% | 20% | 26% |
| their 23 m carrier | 7% | 2% | 13% |
| The panorama's reflections | 5% | 18% | 15% |
| Weedlines | 17% | 3% | 9% |
| Front's slick | 4% | 4% | 11% |
| Gusts and slicks, the ground's height, ripples, front's noise, sun, fog, boils, lamps | noise | noise | noise |

So the whitecaps' cost is their marbling's noises, not their crests' hashes. The CPU's GPU runs both sides of a branch a pixel at a time, so these over-weight whatever's behind a branch. A phone's skips them, which is where most of the cuts below tell.

Cut, nothing added to the textures:

- Eight lace noises and four more for the surf and swash, on every pixel of open sea: now only where there's whitewater. Same to the bit (max 0/255, three scenes).
- Marbling and froth seen from afar, ten noises: now only near by, the rollers kept. Same by the sums; this last form wasn't re-rendered.
- A second panorama lookup for what comes to 1/255 at most.
- Crests' hashes from 0.6 crest a pixel, not 0.9: at most 0.05% of channels past 2/255. Side by side, no difference seen.
- Ripple reads past where they've faded, spume past where it's faded, weedlines wholly behind you.

Tried and left: a lighter crest hash and one marbling noise fewer (each moved under about 6%, which is noise, and the hash moves every whitecap), and foam a period shorter (a look lost for no measured gain).

| The sea's draw, CPU ms | Before (e4a32dc) | Now | |
|---|---|---|---|
| Calm, blue water | 1248 | 1140 | 8.7% off |
| Fair, by the dock | 1774 | 1632 | 8.0% off |
| Gale, blue water | 1522 | 1506 | 1.1% off, with more sea and foam in it |
| First build (3 runs each, wall) | 6.5 s | 5.9 s | |

Fair in blue water read 4414 against 1686 in the first scene of that run, with the page's late work still going, its calm and gale neighbours at the same spot as above. It's discarded, not measured again. Same-page, before the last cuts, it read within noise.

**Not checked.**

- The frame's calm day from before and after: the two pages' clocks differed, so that comparison says nothing. What holds: the waves' figures to the bit under Node, the shader's guards at 0/255 and 1/255 on fair and gale frames, and whitecaps absent below 3 m/s.
- The shore in a gale, and the far sea in a gale, rendered: not done, to save rendering. Their figures are under Node.
- The sky in the gale frames is still blue, the clouds being slow on the CPU, so the side-by-side's sky means nothing. Against Beaufort's photographs the foam's well short: fewer patches, thinner streaks. Near the boat the rougher ripples throw bright glints. Both want a look on a real GPU.
- The hit's words: no toast is said when a sea comes aboard. Other boats take the same litres: the kayak's and the others' figures are their own streams' to set.
- A real phone's frame rate.

## The way home in the HUD's panel

Asked for by the user after M15, through another session (2026-11-01), from a mock-up: the way home was a label by the map, and its fuel a word in it.

- **One panel at the top right** (`GameHUD`'s `.gm-purse`). Its first row is always the time, your money and the cooler, with the breath and the bait when they're up. Its second, aboard, is the boat's: fuel, then the hull once it's worn, the bilge with water in it, the finder if fitted, and past 600 m from the dock, Home's distance and magnetic bearing. They wrap to a third row when they're all up.
- **On the fuel bar**, a small white tick at what it takes to get home (`game/HomeReadout.js`, `Chart.fuelFor` as before), and beside the gallons a mark in green, amber or red, as the mariner's rule of thirds has it. It's ✓, ! or ✕, not a tick in three colours as the mock-up had: a red tick reads as all's well, and someone who can't tell red from green still gets it.
- **Riding in someone else's** there's no fuel, no tick and no mark, and Home stays; today's bar showed your own fuel there, which was wrong. **A boat with no engine** has no fuel row, and Home still shows.
- **Upright on a phone** the panel runs the width of the screen, under the corner menu rather than beside it, with shorter bars, as the menu's a real control the mock-up didn't have. **On its side** and on a computer it's compact in the corner. The map and the tips follow where it ends, as they did.
- `test/north-home.mjs` tests the readout's sums. **Checked** headless on the CPU at 1366, 1024, 844, 667, 390, 360, 320 and 768 wide, with every gauge up: nothing off the screen, nothing over the map, nothing out of the panel. **Not checked**: a real phone; riding with another real player (its panel was set by hand).
