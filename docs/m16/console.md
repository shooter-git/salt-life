## The center console

A 23 ft deep-V with an open deck all round the helm, a T-top, and outboards on a bracket. She's modelled on the Regulator 23: the maker's plan view measured for her lines and layout, its photographs for everything else, shown side by side with her renders. Code in `src/world/boat/console/`.

**Figures, from the real boat.** LOA 23 ft 5 in (7.14 m), beam 8 ft 6 in (2.59 m), 24° of deadrise at the transom, 1 ft 9 in of draft, twin Yamaha 150s with 14.25 x 18 props at 1.86:1, over 48 mph flat out and 29 mph at cruise (Boating's test). The other figures come from Saltwater Sportsman's and Sportfishing's reviews and from Yamaha's outboard specifications. Sources:

- [Regulator 23, the maker's page and gallery](https://www.regulatormarine.com/boats/23/)
- [Boating: 2019 Regulator 23 test](https://boatingmag.com/2019-regulator-23/)
- [Saltwater Sportsman: Regulator 23](https://www.saltwatersportsman.com/?p=50854)
- [Sportfishing: Regulator 23 review](https://www.sportfishingmag.com/?p=47693)
- [Trade-a-Boat: Yamaha F300 review](https://www.tradeaboat.com.au/news-reviews/8278-review-yamaha-f300-marine-outboard), for the cowl's size and the shaft's length

**Her lines** (`ConsoleLines.js`). HullLines' section is one smooth curve through seven points: a lobster boat's round bilge. Hers has edges a smooth curve can't draw, so `sectionPoints` and `sectionCount` are overridden with a polyline: the keel's pad, three bottom panels, two lifting strakes each with its flat underside, the hard chine and the chine's flat, then flared topsides. `panels()` says where the hard edges are, so the shell's built panel by panel with creased normals. Everything else that reads a section (`setback`, `analyze`, `halfBreadth`, `tAt`, the buoyancy samples, the spray) works unchanged. The numbers come out as length 7.14 m, beam 2.59 m, 25° at the transom, 0.53 m draft, 2.5 t displaced.

**Under power** (`Outboards.js`, `ConsoleHandling.js`). The `outboards` propulsion has no rudder: the thrust's line swings with the engines on their swivels, 35° each way. So she turns with no way on, and astern the same wheel takes her stern that way.

- **Thrust:** the prop's power over the speed, capped by the bollard pull and gone at the prop's pitch speed. So her speed goes with the revs, as a real boat's does.
- **Pace:** the helm's 0.7 of the lever is her cruise, all of it her best. Sold with a single 150 (speedMul 1) she does 23 kn at cruise and 36 flat out. Twin 150s (`consoleEngine`, speedMul 1.25) give 32 and 43, which matches the real boat's test figures.
- **On the plane:** the bow rises about 9° over the hump, and she runs at about 4° at 43 kn, a little less at cruise.
- **Trim and tilt:** the engines trim down to get her up and out at speed, at the rate of a real trim motor. With nobody at the helm they tilt right up out of the water.
- **Turning:** hard over at cruise she leans about 18° into the turn, not out as the lobster boat does, and turns on a radius of about 22 m. She holds up to about 22 kn from 28.
- **In a seaway:** with the prop out of the water the thrust goes. On the plane a couple keeps her upright, standing in for the planing lift the buoyancy samples can't give once her sides are dry. Without it she rolled over at 25 kn in flat water.

**Her wake.** `wake` in the model sets her own: thrown from the chines at the transom, patches close enough to run together, the arms going out fast, a wash from each engine (`ocean/Wake.js` reads the optional figures).

**Her light.** White gelcoat in the shade came out near black, so her body and fittings take `GroundBounce` with a white bounce of their own in place of the sand's colour.

**Her deck.** The sole runs from the transom's box to the bow, with a walkway about 0.57 m wide each side of the console, so you fish from either end. Forward there's a sunk sole between two raised seats, then a riser you can step up to, and a hop onto the foredeck. Aft, a door through the transom's box on her starboard side leads to the bracket's mat. `clampToDeck` lets you through only there, and `soleY` gives the mat's height.

**T-top and its rain cover.** The top is a moulded oval on four legs. Its underside holds a pod with the VHF face (the instruments' atlas), spreaders and a dome light, with a rocket launcher along its after edge. `shelter` is the rain's box under it. Clear drop curtains (`setCover`), stowed on a fine day, are zipped on when it rains. `Soak.js` is how wet you are: out in a downpour you're soaked in about 18 s, told so, and drops run down your view (a CSS layer, nothing for the frame to draw). Under the top you stay nearly dry. If she runs fast with no curtains the rain would drive in, but the curtains come down by themselves in rain, so that only matters as it comes on. Her fittings come and go by `fit( stats )` without another draw: each mesh's index is rewritten to leave out what isn't fitted.

**Diving.** She has a folding stainless ladder over the platform's edge on her port side, down when nobody's at the helm and the boat's stopped, up otherwise. In the water the ladder's where you come aboard (`boardFrom`: "Climb the ladder"); without one you haul yourself up at the platform. By the ladder on the platform, E goes down it quietly (`overboard`); from the rail you jump in where you stand. Four tanks are racked on the back of the leaning post (`tankRack`). The scuba air itself is the dive kit's (`airS`, stream 7).

**The dash.** Everything's drawn by the instruments in `model.materials.display`: two screens (chart, sounder) on the upright panel, five dials in the black band on the slope, the compass on top, the VHF overhead. There's no radar. `model.gauges` gives her dials an outboard's scale (6000 rpm, 50 kn), read by `BoatInstruments.gauges`.

**Her lamps.** Rule 23 lets a power boat under 12 m show side lights and one all-round white. The side lights are on her bow's shoulders; the white's on a pole on the stern's starboard corner (BoatLamps' masthead and stern sectors at one point make all round), and the same lamp alone at anchor.

**Blender.** `tools/console/mould.py` makes the outboard (cowl, chaps, leg, plate, torpedo, skeg, prop) and the leaning post's seats, and writes them as base64 into `Moulded.js`. Nothing's fetched, and she's built in one go in Node tests as in the browser.

**To look at her:** `tools/console/look.html` (her on her own, on a dev server), `tools/console/look.mjs` (fixed views), `tools/console/game.mjs` (in the game), `tools/console/lines-check.mjs` (her figures).
