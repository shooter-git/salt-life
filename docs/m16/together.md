# Playing together: each boat as the boat she is

What stream 5 built, in `src/together/`. Tried with two real games on one machine (`tools/two-players/boats.mjs`). **All the Spaces itself, two real devices through its room, is untried.** The user can't run two devices and the tools only stand in for it.

## Her type in the pose

Each pose says which boat she is (`Y`, a `world/boat/Boats.js` key). A game that doesn't say, an older copy or anything unknown, is the lobster boat. The record of an away boat says it too (`b`, `game/Away.js`), so a boat left at anchor is on everyone's sea as herself.

## A template per type (`BoatCopies.js`)

- Your own type's template is your boat: its meshes are shared and nothing new is in memory.
- Another type's built with `loadBoat( id, tier )` the first time she's wanted within sight, in the background, shaders compiled before she's drawn.
- Each boat of a type is a clone, with her own lamps from her own `Vessel` figures and her own floodlight glow.
- A copy nobody's seen for a minute goes, and a type with no copies a minute after that.
- If you change boats, copies of the one you left keep her (`App.setBoat` asks `boatChanged`). If a built one of your new type exists, her copies go over to your boat and the built one's let go.
- Until she's there, or past the device's few (1, 2 and 6 on low, mid and high), a stand-in: one mesh of her size and rough shape, up to about 100 triangles, in the props' existing program.
- Low keeps only `lowCopy`, or `LOW_BOAT`'s meshes where she has them, or her largest meshes up to 9,000 triangles. What it won't draw is freed, not just hidden. Everything needed to walk her stays.

## Riding along on any boat

Boarding, the deck, walls and stepping off all read her own `Vessel`. Deck positions are sent in her frame, so everyone sees you where you stand on her, whichever berth or sea she's on here.

A boat that's sat in (`seated`, the kayak) has room for one rider on her tank well, held there and sitting. The figure at her helm sits too.

## A crew's jobs (`Crew.js`)

You take a job by going where it's done. Those aboard are told, and the name tag says it.

- **The helm.** With her owner aboard and away from it, a rider can take it. Their lever and wheel go in the pose (`c`), and her owner's game runs her on them: fuel, wear and physics stay the owner's. The owner taking the helm or going ashore ends it. Someone else at the helm while you fight a fish backs her down on it, about a knot astern: 0.4 m/s of line back (`backDown`, one line in `Game.js`). A real skipper's half of a fight on a big fish.
- **Up the tower.** Looking at birds, a weedline or something floating for a second is calling it. Everyone aboard hears where it lies by the clock from her bow (not asked of a key, so it works the same on a phone), and it's on their map for four minutes.
- **The chair.** Whoever's there sits facing aft for everyone. The helm's told when a fish is on. The chair's own advantage in the fight is the sportfisher stream's.

Where the tower and chair are: `stations` on her `Vessel` (`{ tower: { x, y, z, r }, chair: { x, y, z, r, facing } }`), or `player.station` if the model keeps its own. `PlainBoat`'s sportfisher has stand-in ones.

## Past the fog (`Specks.js`)

A dash on the horizon, one draw for all of them, nothing until someone's out there. How far:

- **Over the earth's curve**, refracted: 3.86 km x (root of eye height + root of her height), in metres. A lobster boat's masthead (4.05 m) from a deck eye 2.3 m up: 13.6 km. A sportfisher's tower: 18.6 km. Her hull goes first, so the dash gets lower before it goes.
- **Through the air** (Koschmieder): contrast falls by e^(-3.912 d / V), V about 30 km clear, 5 in rain, 2 in a storm, a hurricane's as its haze says. V is a judgement from the game's `visibility`: I found no source for the trades' figure.
- **Big enough to make out**: what's left of her height fades out from two-thirds of an arcminute to a third. So the last of a lobster boat's masthead goes at about 12 km, a little inside her 13.6 km horizon, and a kayak's gone by about 7 km however clear it is.
- **Colour:** dark up-sun, pale with the sun behind you.
- **At night** it's her white light, rated 2 to 3 nautical miles by the rules, picked out further on a clear night.
- **The island** hides her (a line of sight against the terrain, every 0.6 s).

An away boat shows the same way.

## Marta's dock (`Berths.js`)

On each device your boat lies at her own berth (`game/fleet`). Everyone else's about the pier head lies at a spare along the pier's stem, four of them, z 18 and 2 either side, by her beam, moving as her pose moves. She's let go back to her true pose between 10 and 40 m out. The old stand-in, your boat drawn for theirs, is gone.

Past four spares a boat stays at her true pose, and may overlap another.

Leaving, a boat on the stem's berths can pass through the pier head on your screen for a few seconds, as her offset closes. It only happens with three or more others at the dock on mid and high, and I've left it.

## Not done

- A copy shows her as built: `Vessel.fit` (her gear) and `setPaint` aren't sent, so others see default paint and no bought T-top or tower.
- No paddle or stroke on someone paddling a kayak: the figure sits with hands forward.
- Two boats on the cradle (a hurricane's haul-out) still share one spot.
- A rider at someone else's helm hears their own horn from their own boat, wherever she is. Everyone else hears it from the boat they're driving.

## Sources

- Horizon with refraction: [Distance to the Horizon Assuming Refraction](https://www.mathscinotes.com/2013/08/distance-to-the-horizon-assuming-refraction/), [Dip of the Horizon](https://aty.sdsu.edu/explain/atmos_refr/dip.html).
- Koschmieder's 3.912: [Airlight formula, AMS Glossary](https://glossary.ametsoc.org/wiki/Airlight_formula), [Lee 2016, Visibility](https://cocc.xmu.edu.cn/Lee_2016_Visibility.pdf).
- Tower heights, typically 25 to 40 ft above the waterline (11 m for a 48-footer is my reading of that range, not a published figure): [Florida Sportsman, Towers for Better Sight Fishing](https://www.floridasportsman.com/editorial/towers-better-sight-fishing/399700), [Marlin, Tuna Towers](https://www.marlinmag.com/boats/the-benefits-and-drawbacks-of-tuna-towers-in-offshore-sport-fishing/), [HMY, Tuna Towers](https://www.hmy.com/article/Tuna-Towers-A-Set-Up-For-Success/170).
- Lights' range: [33 CFR 83.22](https://www.gpo.gov/fdsys/pkg/CFR-2014-title33-vol1/pdf/CFR-2014-title33-vol1-sec83-21.pdf), [Rule 22](https://ialacolreg.com/en/colreg/rule-22).
