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
- `tools/sportfisher/seats.py`, `build-seats.mjs`: the fighting chair and the helm seat, modelled by script in Blender, packed into `seats.data.js`. The packed file ships with her chunk, so Node's tests build her as the game does.
- `tools/sportfisher/view.html`, `shots.mjs`: her alone on flat water, for comparing with the photographs.

## Going about her

Cockpit to mezzanine by a step; through the door to the salon; down the companionway to the cabins; up onto the boxes either side of the mezzanine and along the side decks to the bow. Up to the bridge and the tower by ladder.

**The climb** (`LadderClimb`, `player.climbing`; the player's mode stays `'deck'`, so all that asks "are you aboard" still says yes). W and S on the rungs, or the stick. A boat that rolls swings a tower through the air: at the head of the ladder, 7 m up, a 15 degree roll every 4 seconds throws you sideways at 0.67 of your weight (`swayAt`: her heel's share of gravity and her roll's acceleration times your height, measured in the test). You hold 0.72 of your weight still, 0.42 moving, with a hand off. Past that your grip drains at 2.4 a second per g over, and comes back at 0.6 a second when she eases. "Hold on" comes up before you're gone: stop, and let her come back. Come off and you go the way she threw you, at her speed: onto a deck, winded three seconds, or into the sea, to swim for it.

**What you can see.** The eye's real: the camera stands at 8.62 m, so the sea's horizon goes out to 10.5 km and `FarIsland`, `Glare` and the rest set things down under it by that eye. What you chart goes as the root of your height over the deck's (`Chart.sightOf`: 320 m from a deck, 590 m from the tower).

**Rain.** `Rain.setShelter` takes one box; three would mean a change to its shader. She has one for the house, one for the bridge under the hardtop, one for the tower's roof, and `shelterAt( p )` gives the one for where you are. What you see from there is what counts: rain falling on the salon's roof from the bridge is outside your box, and rain under the hardtop from the cockpit is far off and among the frame.

## Handling

`SPORTFISHER_HANDLING`: 18.5 t, roll about 4.6 s. Her resistance has a hump about 8.5 m/s (16.5 knots), over which a cruising lever (0.7) just carries her: half throttle won't get her on the plane, 0.7 settles at 26 knots, and flat out is 32.7. Twin screws: at the dock with the wheel over one engine goes ahead and the other astern, and she turns on the spot at about 14 degrees a second (`twinScrews`).

## What others read

`bunks`, `chair`, `rodHolders`, `outriggerTips`, `stations`, `lowCopy`, `towerEye`, `fit( stats )`, `setPaint( hex )`, `setOutriggersOut( out )`. `fit` takes `tower`, `outriggers` and `chair` or `fightingChair`; a stat that's undefined is shown, so she's whole until the fleet's tracks come.

## Phones

`new SportfisherModel( 'low' )`: 13 draws (the cushions in with the cabin, props and rudders static in the fittings, a single lever). The cabin, wheel, radar, chair and displays are `nearDetail`, not drawn from past 70 m.
