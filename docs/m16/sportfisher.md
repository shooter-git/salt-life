# The sportfisher

The offshore sportfisher (`src/world/boat/sportfisher/`): a 48 ft convertible, the boat the game saves up for and the heaviest model in it. Stream 3 of [M16](../M16-streams.md).

## What she's built after

Figures, from builders' and brokers' sheets:

| | Hatteras 48 Convertible | Viking 48 (2002–09) | Ocean 48 | Hers |
|---|---|---|---|---|
| Length overall | 48 ft 8 in | 48 ft 10 in | 48 ft | 48 ft 9 in (14.85 m) |
| Beam | 16 ft | 16 ft 6 in | 16 ft | 16 ft (4.88 m) |
| Draft | 4 ft 7 in | 4 ft 9 in | 4 ft 3 in | 4 ft 7 in (1.40 m) |
| Weight | | | 42,000 lb (19 t) | 18.5 t |
| Power | twin 735 hp | twin 1,100 hp | twin 660 hp | twin diesels |
| Cruise, knots | 26.3 | 30 | 25 to 27 | 26 at a cruising lever |
| Top, knots | 31 | 34 to 35 | 32 | 32.7 flat out |

A tuna tower puts its helm about 25 ft over the water on a boat of 43 ft and up (Marlin; Florida Sportsman; United Yacht). Hers stands the platform at 7.0 m, a standing eye at 8.62 m, 28 ft.

Sources: [Hatteras 48](https://www.yachtbuyer.com/en-us/hatteras/new/hatteras-48-convertible), [Viking 48 guide](https://www.hmy.com/yachting/powerboat-guide/viking-yachts/48-convertible/), [Ocean 48](https://southernboating.com/yacht/48-ocean-yachts-48-convertible-yacht-2000-441176), [towers, Marlin](https://www.marlinmag.com/tuna-towers-offshore-fishing-boats/), [towers, United Yacht](https://www.lovemyyacht.unitedyacht.com/boating-news/sport-fish-towers/).

Shape: the 2008 Viking 48's walk-round photographs ([Off the Hook Yachts](https://www.offthehookyachts.com/inventory/2008-Viking-48-Convertible/7697971): side, stern, cockpit, bridge, salon, galley, bunks, stateroom) and the towers in Marlin's survey.

## Her parts

- `SportfisherLines`: her `HullLines`. A Carolina bow (hollow, flared, a stem raked 0.74 over the water), hard chines, 13 degrees of deadrise at the transom, 16 amidships. The lines widen as `HullLines` lets them: its design curves, nothing stretched.
- `SportfisherHull`: shell, skeg, strakes, rubrail, cockpit, mezzanine, the deck round the house and over the bow, the bow rail.
- `SportfisherHouse`: the house with its long tinted window sweeping into a black windshield; and inside it the salon, the galley with its island, the settee and dinette, the companionway, the bunk room, the head, the stateroom.
- `SportfisherBridge`: the flybridge and its centre helm (the instruments' atlas, as the lobster boat's), the hardtop on its frame, the cockpit's ladder, the tower and its long ladder, the outriggers.
- `SportfisherDecks`: where you can stand. Her levels, as floors with a height at each point (`soleY`), what keeps you on the one you're on (`clampToDeck`) and the solid boxes.
- `LadderClimb`: the climb, below.
- `tools/sportfisher/seats.py`, `build-seats.mjs`: the fighting chair and the helm seat, modelled by script in Blender, packed into `seats.data.js`. The packed file ships with her chunk, so Node's tests build her as the game does. To change a seat: `blender -b --factory-startup -P tools/sportfisher/seats.py -- /tmp/seats.json`, then `node tools/sportfisher/build-seats.mjs /tmp/seats.json`.
- `tools/sportfisher/view.html`, `shots.mjs`: her alone on flat water, for comparing with the photographs. `drive.mjs`: her in the real game, every deck, the ladder by its keys, and her budgets from the readout. `walk.mjs`: the stairs, the side deck, the ladder and both helms, by the real keys.

## Going about her

Cockpit to mezzanine by two steps; through the door to the salon; down the companionway to the cabins; up onto the boxes either side of the mezzanine and along the side decks to the bow. Up to the bridge by the ladder from the mezzanine (its foot on the sole, inboard of the starboard box, clear of the door, as the 48's), and on up the tower by its own.

**The climb** (`LadderClimb`, `player.climbing`; the player's mode stays `'deck'`, so all that asks "are you aboard" still says yes). W and S on the rungs, or the stick. A boat that rolls swings a tower through the air: at the head of the ladder, 7 m up, a 15 degree roll every 4 seconds throws you sideways at 0.67 of your weight (`swayAt`: her heel's share of gravity and her roll's acceleration times your height, measured in the test). You hold 0.72 of your weight still, 0.42 moving, with a hand off. Past that your grip drains at 2.4 a second per g over, and comes back at 0.6 a second when she eases. "Hold on" comes up before you're gone: stop, and let her come back. Come off and you go the way she threw you, at her speed: onto a deck, winded three seconds, or into the sea, to swim for it.

**The tower's helm.** With the tower fitted, E at its pod takes her second helm (`towerHelm`, `helmAt( p, reach )`): you drive standing on the platform with your eye at 8.62 m, and rise onto the platform when you leave. Her two wheels are one instanced draw, so phones stay at 13; steering's hydraulic, so only the wheel in your hands turns (`helmInUse`, set by `Player.takeHelm`). Everything else about a helm holds: a rider takes it only when `helmFree` says so, and to the crew it's the helm (`jobAt`). The pose says where: `J: 1` with mode `'h'` is someone at the tower's helm, and `Together` draws them up there. From it you still call what you look at (`Crew`), and its pod has a compass and her revs and speed, but for a phone's.

**What you can see.** The eye's real: the camera stands at 8.62 m, so the sea's horizon goes out to 10.5 km and `FarIsland`, `Glare` and the rest set things down under it by that eye. What you chart goes as the root of your height over the deck's (`Chart.sightOf`: 320 m from a deck, 590 m from the tower).

**Rain.** `Rain.setShelter` takes one box; three would mean a change to its shader. She has one for the house, one for the bridge under the hardtop, one for the tower's roof, and `shelterAt( p )` gives the one for where you are. What you see from there is what counts: rain falling on the salon's roof from the bridge is outside your box, and rain under the hardtop from the cockpit is far off and among the frame.

**After dark.** Her stern light's on the transom's face and shows aft (`lamps.sternFacing`). Up on the transom's cap, with no cone, it put a white-hot spot on the sole under it, and was all that lit her cockpit. The cockpit's light is now the courtesy lights in the brow (`lamps.cockpit`), as in the photograph. The floods (deck lights) are an upgrade on top. With her underwater lights on, the green water lights her paint from below (`materials.under`): most at the waterline and the transom. No photograph of one to compare: that's how the light must fall.

`setPaint( null )` is how the fleet says "as she came": white, in `SportfisherMaterials`. `tools/sportfisher/view.html` never calls it, so it won't show you what the fleet does to her paint: look in the game as well (`night.mjs`, `walk.mjs`).

## Handling

`SPORTFISHER_HANDLING`: 18.5 t, roll about 4.6 s. Her resistance has a hump about 8.5 m/s (16.5 knots), over which a cruising lever (0.7) just carries her: half throttle won't get her on the plane, 0.7 settles at 26 knots, and flat out is 32.7. Twin screws: at the dock with the wheel over one engine goes ahead and the other astern, and she turns on the spot at about 14 degrees a second (`twinScrews`). On the plane she leans into a turn, about 10 degrees at half wheel flat out and 7 hard over, on radii of about 70 and 28 m; below it she's about upright. `test/turns.mjs` holds each boat to this.

## What others read

`bunks`, `chair`, `rodHolders`, `outriggerTips`, `stations`, `lowCopy`, `towerEye`, `towerHelm`, `fit( stats )`, `setPaint( hex )`, `setOutriggersOut( out )`. `fit` takes `tower`, `outriggers` and `chair` or `chair`; a stat that's undefined is shown, so she's whole until the fleet's tracks come.

**On someone else's.** A pose says what's fitted (`gearBits`, `G`): their copy's dressed as that (`dressCopy`) and you walk about on her as that (`withGear`), so their tower's there to climb whether or not you've one. An anchored boat with nobody home goes as she is. The console's and the kayak's fittings are cut from one shared geometry, so their copies can't yet.

## Phones

`new SportfisherModel( 'low' )`: 13 draws (the cushions in with the cabin, props and rudders static in the fittings, a single lever). The cabin, wheel, radar, chair and displays are `nearDetail`, not drawn from past 70 m. Every deck, the cabins and both ladders are all still there: the phones lose only detail.

## A trap, for anything built on BoatMaterials

three shares a program between materials whose `onBeforeCompile` reads the same, and `BoatMaterials`' `extend()` reads the same for every one. Hers each have their own `customProgramCacheKey`. Without it her cabin silently came out as her gelcoat.
