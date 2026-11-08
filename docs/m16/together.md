# Playing together: each boat as the boat she is

What stream 5 built, in `src/together/`. Tried with two real games on one machine (`tools/two-players/boats.mjs`, `aboard.mjs`). **All the Spaces itself, two real devices through its room, is untried.** The user can't run two devices and the tools only stand in for it.

## Her type in the pose

Each pose says which boat she is (`Y`, a `world/boat/Boats.js` key). A game that doesn't say, an older copy or anything unknown, is the lobster boat. The record of an away boat says it too (`b`, `game/Away.js`), so a boat left at anchor is on everyone's sea as herself.

## A template per type (`BoatCopies.js`)

- Your own type's template is your boat: its meshes are shared and nothing new is in memory.
- Another type's built with `loadBoat( id, tier )` the first time she's wanted within sight, in the background, shaders compiled before she's drawn.
- Each boat of a type is a clone, with her own lamps from her own `Vessel` figures and her own floodlight glow.
- A copy nobody's seen for a minute goes, and a type with no copies a minute after that.
- If you change boats, copies of the one you left keep her (`App.setBoat` asks `boatChanged`). If a built one of your new type exists, her copies go over to your boat and the built one's let go.
- Until she's there, or past the device's few (1, 2 and 6 on low, mid and high), a stand-in: one mesh of her size and rough shape, up to about 100 triangles, in the props' existing program.
- Low keeps only `lowCopy`, or `LOW_BOAT`'s meshes where she has them, or her largest meshes up to 9,000 triangles, until someone's about to board. What it won't draw is freed, not just hidden.

## Riding along on any boat

Boarding, the deck, walls and stepping off all read her own `Vessel`. Deck positions are sent in her frame, so everyone sees you where you stand on her, whichever berth or sea she's on here.

A boat that's sat in (`seated`, the kayak) has room for one rider on her tank well, held there and sitting. The figure at her helm sits at her paddle.

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
- **Big enough to make out**: the waves hide her lowest half metre, and what's left fades out from two-thirds of an arcminute to a third. So the last of a lobster boat's masthead goes at about 11 km, a little inside her 13.6 km horizon, and a kayak's gone by about 4 km however clear it is. That half metre and those arcminutes are my judgement, not from a source.
- **Colour:** dark up-sun, pale with the sun behind you.
- **At night** it's her white light, rated 2 to 3 nautical miles by the rules, picked out further on a clear night.
- **The island** hides her (a line of sight against the terrain, every 0.6 s).

An away boat shows the same way.

## Marta's dock (`Berths.js`)

On each device your boat lies at her own berth (`game/fleet`). Everyone else's about the pier head lies at a spare along the pier's stem, four of them, z 18 and 2 either side, by her beam, moving as her pose moves. She's let go back to her true pose between 10 and 40 m out. The old stand-in, your boat drawn for theirs, is gone.

Past four spares a boat stays at her true pose, and may overlap another.

Leaving, a boat on the stem's berths can pass through the pier head on your screen for a few seconds, as her offset closes. It only happens with three or more others at the dock on mid and high, and I've left it.

## What's on her, for everyone (`BoatCopies.js`, `Spread.js`)

- **Fitted and painted.** One number in the pose (`f`): a bit for each thing that comes and goes on her, her paint's place above them. A copy shows it on its own meshes, geometry and hull material, with no new shader, and your own boat of that type is never touched. Someone aboard walks a view of her as it's fitted (`walkedAs`): no tower to climb if she hasn't got one, and hers to climb if you haven't. The twin's sound reads the same number.
- **All of her, to walk on.** On a phone a copy is only what's seen from a way off, which leaves out the sportfisher's cabin and the console's helm. So she's built again whole before you're offered her, and her extra meshes show only within 12 m. A low-tier deck that isn't drawn is never boarded.
- **Her spread and kite**, a few numbers a line. **Her pool of light** (`U`). **Her name** every 50 poses, drawn within 40 m, on her stern as her owner sees it on their own game.
- **A kayak's stroke** (`kw`): her paddle, and the figure sat at it. And whether she's over, sent with her owner in the water too: everyone sees her keel up, and someone on her tank well goes in with her.

## What a rider can do on her

(Guest work, 2026-11-05: as a real crew does. The rods in a sportfisher's holders are the boat's, and whoever's angling fights the fish on that rod and reel; a lobster boat's deckhand pulls the captain's traps with the captain aboard. Before it, a rider worked none of her gear and fought her fish on their own tackle.)

Her owner's game runs her gear: what a rider does to it is asked of that game and done there, so her save, her bait and her chart stay her owner's. All of it wants her owner aboard her and in the room (`Together.skipper`); on an away boat, with nobody home, you fish off her with your own rod and nothing more.

- **Her tackle and bait, sent.** Her owner's game sends whoever's riding her rod, reel, drag and line, the leaders they own, the bait aboard her, how many lines she takes and whether she flies a kite (`'kit'`, `Rigs.kitOf`, checked by `Rigs.cleanKit`): on boarding, and again whenever it changes (a look each second).
- **Her spread.** With Troll picked (C) and one of her baits (B steps through hers), the cast key lets out a line on her next free holder (`'rig'` `line`: `Rigs.letOut`, her bait used), and the right button brings them all in (`in`). Her owner's told who did it, and so are you.
- **A rod that goes off** in her holder (R, within reach of it): the fish, its bait and how much line is out come over from her owner's game, and so does her tackle (`'rodIs'` `t`): you fight it on her reel, drag and line, and in a stand-up harness if she's the stand-up rod. The catch goes in your hold.
- **Her kite**, on her stand-up rod, with one of her live baits (`take`: lent to your hook, and given back to her owner if it's still on it when the rod goes away, `give`). The kite flies off her stern (`Rigs._kiteAt` on the boat you're riding), on your game and on everyone else's (`Spread._kiteBoat`).
- **Her electric reel** for a deep drop, with her bait, all 900 m of it. Without one, your own lead goes down as far as your own rod's line reaches.
- **Her chum**, over the side where you are (`chum`, `Rigs.chumFor`).
- **Sit in her chair** with a fish on, if she has one, with the chair's 40 kg hold.
- **Her searchlight**, at her helm (L): switched on her owner's game (`spot`). Her floodlights and underwater lights have no switch, for anyone: they come on from dusk if she's fitted with them. They're over your fish too, from her stern (`Game._litBy`), not your own boat's wherever she is.
- **Her traps**, on the lobster boat: you're her deckhand. At her hauler (the stand by it, starboard side) E sets one off her stack where the bottom suits, on her owner's chart and their buoys; alongside one of her buoys, as she's driven up to it, E gaffs it, her hauler brings it up, and what's in it comes out at your rail at a press each, gauged as yours are, into your own hold; then E stacks it back on her deck (`'trap'` and `'trapIs'`: `TrapWork.asked`, `told`). If you leave her deck mid-haul her owner's game lets go of it after 2.5 s. Anyone else's buoys are still "their gear, not yours to touch".
- **Your catch goes in your own hold**, from her rods and her traps alike (the user's call, 2026-11-05).

## Seen on everyone's game

- **Anyone's chum slick** is sent (`'slick'`), drawn, and brings the fish up on every game that's near it (`Rigs.theirSlicks`, `slickAt`).
- **Her traps stacked on her deck** (`ts` in her owner's pose) are drawn on her copy, and someone walking her deck walks round them (`TrapWork.stackedOn`).
- **The work at her rail** (`tj`, and `tb` when it's her deckhand's): the trap going over and its buoy after it, the buoy gaffed, the trap up under the davit's block and in on to the rail with its lobsters, and stacked. Run on between her poses on each game (`TrapWork._mirror`), drawn from her pose's frame, not her copy's (that's last frame's until `Together` has placed her).
- **A flashlight** (`T`): its lens glaring when it points at you, its beam in the night air and its light on what it meets, at the player's right hand. A boat's searchlight lamp half its size (`BoatLamps`, the same shaders, so nothing new to build) with a hand torch's throw (`Together._torch`). Before, only the nesting turtles minded it.

## Every boat's berth

An away boat keeps, drifts and is towed by her own `berthOf`, not the lobster boat's dock.

## Fixed by running it on real boats

- A guest stepping off crashed (`b.berth`: fixed here and by the sportfisher stream).
- **A slow device's frame of falling was read as the level below.** Under about 22 fps a walker on a raised deck was squeezed to that lower level's narrower walls and off the edge. This is what a slow guest "falling through" looks like (`Player.updateDeck`).
- At a rail, "Step ashore" could flip to "Jump overboard" as she bobbed, and E put you in the sea. What's on offer now comes from the rail you're at.
- Boarding the sportfisher put you in her fighting chair, and a figure at her helm stood in her seat.
- **A guest was put in the sea whenever her owner's poses stopped for 6 s** ("Robin's boat has gone"), as a screen turned off or a poor connection would do. The scripts set that time to 120 s for the CPU, so none of them saw it. The boat you're aboard now holds her last pose for 90 s, and she's gone when her owner leaves the room (`gap.mjs`).
- Her capsize was never sent: on everyone else's game her kayak stayed upright with nobody in her, and a rider stayed on her.
- Her name only showed on a console, on anyone else's game. Her owner sees it on every boat.
- A guest with their own lobster boat, traps stowed, walked into those traps' invisible colliders on hers (`BoatModel.walkedAs`).
- A rider's lead went down 900 m on a 180 m reel, with the fish then on the last half metre of it.
- Someone on a lobster boat's foredeck couldn't get off it. A hop off the bench takes you over the dash, and there's no walking back under the roof: it now has rails to go over the side from. Walking up there through the windscreen is still how you get there, and nothing gets you onto her roof by keys.
- Her kite vanished on everyone else's game the moment a fish took it; now it comes down, as on hers.

`tools/two-players/crew.mjs` checks a rider's work, part by part: rods (her tackle and bait reaching them, her spread let out and brought in, a rod off her holder on her tackle, her kite, her electric reel, her chum), lights (her searchlight from her helm, a flashlight seen, her underwater lights over their fish), traps (her stack seen and walked round, one set and one hauled by her deckhand, its lobsters in their hold) and hold (a boat taken out shows her hold at once). `tools/two-players/aboard.mjs` checks all this: every area in `areas.mjs`, under way, at a slow guest and a slow owner. `hard.mjs` is a guest pushed: taking off from her berth, her lever right up, hard over both ways, by keys between her areas and up her ladders, then all of it in a gale. `seen.mjs` is what's seen and done on another's game, part by part: the fights, kite, kayak, looks, flares, glasses, stern, north, kayakname, ladder, decks, sternfish, kitefish, drop, ashore. `heel-fps.mjs` is how far she really heels at a device's frame rate: the scripts' owners, at 1 to 3 fps, read more, as a shared game's waves keep the wall clock while the boat's frames stop at 0.1 s. `gap.mjs` is her poses going quiet, `mem.mjs` is script memory over a long run, and `heel.mjs` and `heel-flat.mjs` are how far each boat heels when she's flat out and hard over.

## Not done

- A boat with her own on Marta's one cradle: yours is what's on it on your game. Theirs isn't drawn while yours is there. A second cradle would be better.
- A speck's height is her type's, whatever's fitted: a sportfisher with no tower still shows as if she had one.
- A rider at someone else's helm hears their own horn from their own boat. Everyone else hears it from the boat they're driving.

## Readings, on the low tier

CPU renders, on a machine shared with other sessions. No GPU or phone has run any of this.

| | Draws (150) | Triangles (300,000) | Script memory (150 MB) |
|---|---|---|---|
| The complete check: built, alone | 75 | 240,012 | 129 MB |
| At the pier head, Sam's copy in sight: dev server, two games | 55 | 268,596 | 162 MB |
| Sam on the sportfisher's bridge under way | 24 | 49,501 | 160 MB |
| Their lobster boat 300 m off | 67 | 207,864 | 154 MB |
| Sam at his helm by night, her boat 400 m off | 66 | 183,496 | 163 MB |

A lobster copy and her owner's figure cost 7 draws and about 24,000 triangles. Their memory was too small to read against the noise.

**Script memory on the dev server sits above the 150 MB budget with company; a build doesn't.** After a forced GC, on low, on the sportfisher's bridge with a guest aboard: dev server 160 MB, built 98 to 100 MB, and a built game alone 89 MB. It rose as she met new things, and then held: built, drawing nothing, 99.2 to 98.3 MB and 96.6 to 99.9 MB over 16 minutes and about 1,700 frames each. At those frame rates that's about a minute of a phone's frames: a very slow leak isn't ruled out.

## Sources

- Horizon with refraction: [Distance to the Horizon Assuming Refraction](https://www.mathscinotes.com/2013/08/distance-to-the-horizon-assuming-refraction/), [Dip of the Horizon](https://aty.sdsu.edu/explain/atmos_refr/dip.html).
- Koschmieder's 3.912: [Airlight formula, AMS Glossary](https://glossary.ametsoc.org/wiki/Airlight_formula), [Lee 2016, Visibility](https://cocc.xmu.edu.cn/Lee_2016_Visibility.pdf).
- Tower heights, typically 25 to 40 ft above the waterline (11 m for a 48-footer is my reading of that range, not a published figure): [Florida Sportsman, Towers for Better Sight Fishing](https://www.floridasportsman.com/editorial/towers-better-sight-fishing/399700), [Marlin, Tuna Towers](https://www.marlinmag.com/boats/the-benefits-and-drawbacks-of-tuna-towers-in-offshore-sport-fishing/), [HMY, Tuna Towers](https://www.hmy.com/article/Tuna-Towers-A-Set-Up-For-Success/170).
- Lights' range: [33 CFR 83.22](https://www.gpo.gov/fdsys/pkg/CFR-2014-title33-vol1/pdf/CFR-2014-title33-vol1-sec83-21.pdf), [Rule 22](https://ialacolreg.com/en/colreg/rule-22).
