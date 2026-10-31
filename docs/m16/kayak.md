# The kayak

What every new player starts in: a 12 ft sit-on-top fishing kayak, paddled, sat in, and low enough to the water for the weather to matter. Her files are in `src/world/boat/kayak/`; the hooks elsewhere are small (`Player.js`, `Game.js`, `App.js`, `BoatController.js`, `Avatar.js`, `Radio.js`, `TouchControls.js`).

## After the real thing

Shaped after a Perception Pescador 12.0 (12 ft 0, 32.5 in, 375 lb capacity, about 64 lb), and the same general layout as most 12 ft fishing sit-on-tops:

- Her outline was read pixel by pixel off the maker's plan and profile photographs ([confluenceoutdoor.com](https://www.confluenceoutdoor.com/products/perception-pescador-120-fishing-kayak-9350178031), plan and profile), at 40 stations: half-breadth, keel rocker and gunwale height are the tables in `KayakLines.js`. Her hull fits the profile's keel to within a few millimetres, up to the raked stem.
- [A Commons photograph of one on the grass](https://commons.wikimedia.org/wiki/File:Kayak-MarChiquita-Bsas-feb2024.jpg) gave the three-quarter view: how the wells sit in the deck, how the marbled colour goes.
- What's on the deck, going aft from the bow: a carry handle, a big oval hatch, the cockpit with a low console between the foot wells, the seat, the bridge with two flush rod holders and scuppers, the long tank well with its criss-cross bungee, and the stern's carry handle.
- She's rotomoulded, one piece of swirled colour: one mesh with its colours in the vertices. The deck's a height field with its wells cut by distance functions, so the edges are soft as moulded plastic's are.

Her small cooler is a 16 quart hard cooler strapped in the tank well, the 12 kg `holdKg` of `Boats.js`. The safety whip with its orange pennant and all-round white is what kayak anglers run at dawn and dusk.

## Paddling

`Paddle.js`: a `propulsion` of its own. There's no thrust figure. The stroke moves the blade (a low-angle stroke, the shaft swinging about a point in front of the chest), and the water pushes back on the blade at the speed it goes past it (1/2 rho Cd A v², Cd 1.9, 0.075 m² of blade), with the kayak's own motion counted. So the paddle's speed sets the boat's:

| | Stroke | Speed |
|---|---|---|
| Stick a little forward | 1.7 s | 2.3 knots |
| W, or the stick most of the way | 1.1 s | 3.1 knots |
| Shift, or the stick all the way | 0.74 s | 4.0 knots (hull speed 4.4) |
| S | | stops her in about 3 m |
| A or D on the spot | sweep ahead on the far side, sweep astern on the near | about 30 deg/s |
| A or D under way | sweeps on the far side, her hull edged | about 12 deg/s |

Each stroke pulls her bow a little to its side, about 3 degrees either way, as a real one does; the view from the seat doesn't follow it. Her resistance is friction and form (Cf 0.0037 over 2.6 m² wetted, form factor 1.2) with wave-making past Froude 0.3. A paddler's a little under 30 W net at 3 knots, which is a pace people hold all day: paddling tires nothing. Left alone she drifts at about 6% of the wind, against the 5% the away reckoning uses.

A stick is analog: how far it's pushed is how hard you paddle.

## Sat in

`Vessel.seated`. There's no deck mode; E beside her gets you straight into the seat. Seat.js is `Player`'s mode `'boat'` for her: W S A D paddle, V changes between your own eyes and the chase camera (closer in than the big boats'), E gets out. The eye's 0.81 m off the water.

You're drawn in her: a Rocketbox islander, your chosen look, posed by `SeatPose.js` after the clip (hips down on the seat, legs out to the foot braces, back turning with the stroke, arms by two-bone IK to where the hands hold the shaft). From your own eyes the same figure's there with its head folded away, so you can look down at your legs and see your hands on the paddle. Others get the same pose through `Avatar.pose( { seat } )`.

## Fishing from the seat

`Game.canFish` takes a seated boat. Take out the rod (or the cast net) and the paddle's laid along the gunwale, the view's your own, and she drifts. A fish on tows her, by the rod, as hard as it's pulling (tension × up to 110 N): it swings her round to it, and a big one takes her for a ride.

## The weather

**Soaked.** `Capsize.js` `soakStep`, `player.soak` 0..1. A downpour soaks you in about a minute and a half, a sea over her deck in moments, spray once the wind's over 12 m/s; it dries in about a quarter of an hour. From your own eyes it shows as drops on the view (`Drops.js`, an element over the canvas, nothing drawn). She's self-bailing: rain and seas leave by her scuppers, so she has no bilge to bail (`handling.plastic`).

**Over.** Her gunwale's 27 degrees off the water, and past it she's over all at once. What puts her there is her own rigid body: the wind on someone sitting up on the water, heeling her, and the sea rolling her. A steady beam wind holds her at 3 degrees at 12 m/s and 6 at 16; about 20 m/s, a squall's gust, she's past holding. Bow to it, the same wind's 7 degrees. So in a squall you turn her into it, as you're told to in a real one.

| | Heel she goes over at |
|---|---|
| Paddling (a blade in the water: a low brace) | 41 degrees |
| Sat there | 33 |
| Rod or net in your hands | 28 |

A breaking wave of about a metre on the beam rolls her, 1.6 m on the bow.

Over, she's turned keel up (the `body` group: the rigid body under it stays upright) and you're in the water. Some of the cooler goes (half, with a life jacket a quarter), and you lose some breath. Swim to her: E rights her, E again climbs back on (2.3 s; 1.4 s with a life jacket). She drifts downwind at about 1 m/s meanwhile, so don't dawdle: you swim 1.5, 2.5 flat out.

## On the sand

`Shore.js`. Run her up on a beach and step out (E): she's pulled up the sand clear of the wash (`ctl.beached`: physics off, lying on her keel on the slope), and you're beside her. E beside her: you're in her and she's shoved down the sand till she floats, 2.4 m/s, bow first, and away. A surge up the sand floats her off. Off a beach too steep for it (a grade past 0.45), she's just left where she is. Over the side, out of your depth, she drifts.

She's kept on the sand, not at the dock: `BoatController` asks her `atHome` at the start, after a tow, and on the safety net's reset. With the fleet's berths in, `ctl.berth` is where she looks from, up the sand to the first dry place. `App.saveBoat` counts her as fast when she's on the sand, and `rest` lays her back on it when you return.

## What she needs of the others

- **Light:** `handling.contact` and `handling.mooring` scale the controller's grounding and mooring, which are made for tons. `handling.wetDepth` says how little water she needs to be fully wet (0.06 m, against 0.3): her hydrodynamic forces were a third of what they should be without it.
- **No engine:** `handling.engine` is null. `Game` doesn't burn fuel or crank; `Hull` gets `driven: false`, and with `handling.plastic` no rain, wear or storm. No horn, searchlight or radio on her; the rod's touch button stays the rod's.
- **Together:** `model.stroke.wire` is the paddle's pose to send, and setting it poses a copy; `seated` and `perch` as stream 5 asks.

## Budget

Her own mesh and paddle: see the report on the merge. The figure in her is one more islander, as anyone else on the island is, and only while you're in her.
