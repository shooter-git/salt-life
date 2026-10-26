# How Salt Life is put together

Salt Life is [Tidewater](https://github.com/dgreenheck/tidewater) rebuilt as an All the Spaces creation.

- **What carried over:** its game logic, physics and procedural geometry, ported with little change.
- **What was rewritten:** its WebGPU drawing (WGSL materials, compute, storage buffers, GPU readbacks), for three.js and WebGL 2.
- **What was left out:** the systems that only made sense on a strong graphics card. These are the ocean FFT, the wake and shore simulations, GTAO, TAA, motion blur and the lens effects. Tidewater's history in this repository keeps them.

## Start-up

`src/main.js` connects to All the Spaces (`connect()` from `@allthespaces/portal`), then hands the portal to `App`, which it loads alongside (`import()`: most of the download). On its own (`pnpm dev`, GitHub Pages) there's no veil from the app, so `src/ui/LoadingVeil.js` puts one up at once, follows the same stages and lifts at the start; it also picks the device's tier, as All the Spaces would:

1. `App.init(progress)` builds the island behind the loading veil, reporting each stage (`portal.progress`, and a `performance.mark('load: …')` for profiles).
2. `portal.ready()`, then `App.start()`.
3. After the start, `App` brings in the things a person doesn't need at once, one after another:
   - the plants, where the device draws on its CPU;
   - the shaders for later (`prepareLate`);
   - Joe and Marta;
   - the beach's debris;
   - the reef and its fish;
   - the whale;
   - the air (motes, sun shafts).

## A frame

`App.frame(dt)` runs, in order:
1. The island's clock (`settings.timeOfDay` and `settings.day`, advanced by `IslandClock.advance`, or worked out from the session's clock: see [The island's day](#the-islands-day)).
2. The weather (`WeatherDriver`): the wind, the sea, the surf, the cloud and the light, from the clock (see [The weather](#the-weather)).
3. Input.
4. The boat's physics (`BoatController`).
5. The player (`Player`: walking, swimming, on deck or at the helm), then the fishing game (`Game`).
6. The sky.
7. The CPU water queries (`WaterQuery`: Gerstner waves plus the shore waves). They give heights for the boat, the swimmer, the bobber and the birds.
8. Everything else (plants, reef, fish, wildlife, spray, sound).
9. The drawing, through the SDK's `createStage`. On high it also goes through `PostChain`.

## Where things are

| Folder | What's in it |
|---|---|
| `src/core` | Globals (shared uniforms such as `G.time`, `G.sunDir`, `G.night`), input, saving (`SaveStore`: `portal.save.personal`), the CDLOD grid, `ClassicWorker`, `ReleaseAfterUpload` |
| `src/world` | The island: terrain, village, pier, rocks, plants, debris, reef and fish, wildlife, the whale, the boat model, colliders, the layout (`WorldLayout`); the weather's driver (`WeatherDriver`) |
| `src/ocean` | The sea: Gerstner waves, shore waves, the water surface and its detail, the wake, the CPU water queries |
| `src/sky` | Atmosphere, clouds, the sun and moon, the environment map, the lightning |
| `src/materials` | Shader pieces shared by many materials: local lights at night, the clouds' shadows (high), wet surfaces, height haze (three's fog chunks, replaced), underwater light, LOD fades |
| `src/player` | The player, the boat's physics, the bow spray |
| `src/game` | The fishing game: the rod, bites, the fight, the catch card, the cooler and log, the stalls, Joe and Marta, the HUD, the minimap, the guide; the speargun; the cast net and the bait; the island's clock and its weather (`Weather.js`) |
| `src/fx`, `src/post` | Spray, marine snow, air motes, the rain; the high tier's post chain and sun shafts |
| `src/ui` | The HUD's DOM, touch controls, fonts |
| `src/engine/index.js` | `three` itself, re-exported: the ported files still import it as Tidewater's engine |

Materials are three's `MeshStandardMaterial` (or `MeshPhysicalMaterial`), with GLSL added in `onBeforeCompile`. Each gets its own `customProgramCacheKey`.

## Playing together

`src/together/Together.js` handles everyone else on the island. It works through `portal.session`, the SDK's live session for the people in the space.

- **Who's here:**
  - Each player sends a pose message (`'p'`) about ten times a second, only while anyone else is here. It carries:
    - where they are and their heading;
    - walking, swimming, on deck or at the helm;
    - their speed;
    - the rod's state, their bobber and the line's tension;
    - their boat's pose, when it's away from its mooring or they're aboard.
  - Others are drawn 0.15 s behind the newest pose and eased between poses.
  - Each player is one of four Rocketbox islanders (`Avatar.js`): two men and two women. Everyone picks theirs on the cooler's Islander tab; it's saved with their progress and sent in the pose (`l`). Until someone picks, the same person always gets the same one. Each has their name over them in their colour and a dot on the minimap.
  - Their boat is a copy of yours that shares its meshes and materials. When both boats are at the dock, yours stands in for theirs.
  - Their rod, line and bobber are the rod's (`FishingRod.tackle()`).
  - Their boat shows its lamps (below): lit as under way when they're at the helm or away from the dock and not at anchor (`A`), and their searchlight when the pose says it's on (`S`).
- **Riding along:** standing by someone's boat offers "Board their boat".
  - Aboard, you ride on their boat wherever they take it (`Player.ride()`); your pose names the boat's owner (`R`), so everyone draws you on it.
  - Your own boat stays at its mooring, so each player always has a boat of their own. Jumping off or stepping ashore ends the ride.
  - You hear the boat you ride in: its engine at the revs its skipper sends from the helm (`E`), and the water past the hull. On foot or in the water, you hear the nearest boat going by.
  - (M10) An engine at the helm with its revs run down has stalled, and you hear it stop. While the skipper's starter turns her over the pose says so (`K`: 1 for a crank that won't catch, 2 for one that will), and you hear it too.
- **The horn:** sounding it is a `'horn'` message (1 when it starts, 0 when it's let go). The others hear it from that player's boat.
  - Each device draws only the nearest few players and boats.
- **The clock:** one time of day for everyone, kept in the shared value `'clock'` as `{ at, hour, day, speed }` (below).
  - The host sets it if there's none: a new room starts from its first player's saved clock.
  - When someone arrives, the host sets it again for everyone, running (in company it can't be held).
  - Each device works the hour out from the record and its own clock (`IslandClock.clockAt`).
  - Resting needs everyone here: each player's wish is their own shared value, `'rest.<id>'` (`{ to, c }`, `c`: the clock it was made on). Whoever's wish completes the agreement moves the clock, and so does the host when it sees it (the wishes arrive as events, so a host whose game is paused still hears them). A wish lasts two minutes, or until the clock changes.
- **Catches:** a landed fish is a `'catch'` message to the others.
  - They hear the player cheer, and the fish hangs on the player's line for a moment.
  - Only a fish worth hearing of is a toast: an island record, or a trophy (the top fifth of its kind's size range, about one catch in ten: `FishTable.isTrophy`). On a busy island a toast for every catch would add up.
- **The island's records:** each species' heaviest fish, with who caught it and when.
  - They're kept in the group's shared save (`portal.save.shared`, key `'records'`), so they last between visits.
  - A catch updates them with `update`, which retries when two saves cross.
  - The catch card says when a catch is the island's heaviest yet.
  - The records are chalked on a board beside Joe's stand (`RecordsBoard.js`, a canvas) and listed on the cooler's Records tab.
- **The week's order** (below): what each player has brought toward it is in the group's shared save too (`'weekOrder'`).
  - A sale toward it adds the player's kilos with `update` (which retries when two saves cross), then sends the saved tally to the others (`'week'`), so their slates and panels move at once.
  - Within a week the tally only grows, so a tally that arrives late or out of order never takes it back.

Everyone keeps their own progress and their own fish.

## The island's day

`src/game/IslandClock.js` is the clock's arithmetic, with no three.js, so `test/island-day.mjs` runs it under Node.

- **Pace:** by day an hour takes 100 s (`DAY_RATE`, 0.01 game hours a second). Deep night, from about 20:30 to 3:30, runs four times faster (`NIGHT_X`), eased in and out, so dusk and dawn linger and the dark passes in a few minutes. A whole day is about half an hour.
- **One record:** the time is worked out from `{ at, hour, day, speed }`, the hour and day at `at` (ms since 1970) running at `speed` (0: held). A table of the day's pace turns real seconds into hours, so every device gets the same hour from the same record without anything ticking over the network.
- **Saved:** the hour, the day and whether you'd held it are in your save (`'clock'`, written every 30 s, when the app covers the game and when you leave), so you come back to where you were. A new player starts at 9:30 on day 1. On its own (`pnpm dev`), `?hour=21` starts at that hour.
- **On your own** (a solo session, or nobody else here yet), you can hold the clock and rest until dawn, noon, dusk or night. In company it runs for everyone, and a rest needs all of you (Playing together, above).
- **The clock in the HUD** (`TimeHUD.js`): the time at the left of the purse, with a sun, a moon, or two bars while it's held. T (R3 on a gamepad, or a tap) opens a small menu under the purse. It says when Joe and Marta open or shut, and offers holding and resting, or, in company, who wants to rest until when. A dot on the clock says someone else wants to rest. Nothing about the clock is a toast: a rest dims the world for a moment instead.

**The stalls keep hours** (`Orders.HOURS`): Joe from 5 am to 7 pm, Marta from 7 am to 7 pm. In a gale or a thunderstorm they shut whatever the hour (`Orders.shutFor`, `stallOpen`: The weather, below).

- Out of them the trader has gone home (`Vendor.setOpen`: not drawn), and their minimap marker greys.
- A "Closed" board is out while they're away, saying when they're back and what's left out (`ClosedSign.js`: one plane drawn on a canvas, sharing the records board's program). Joe's is propped on his counter; Marta's leans on the front of her table.
- Joe's stand has his night box. It pays 70% of his price (`NIGHT_BOX`), and his wanted list in full.
- Marta's chandlery has diesel on the honesty box, so nobody is stranded at sea; the gear waits for her.
- Whoever is serving you at closing time finishes with you first. In their last ¾ hour they say so in their panel.

**The wanted lists** (`src/game/Orders.js`):

- Each morning Joe wants two fish: one of dusk and dawn (yellowtail, jacks, mutton snapper or tuna) at double, and one more at half as much again. Marta buys one kind of bait fish at a set price. Never a protected fish (Spearfishing, below): it's let go.
- The list comes from the day alone (`ordersFor(tradeDay)`), so everyone on one clock sees the same list and nothing is sent. It runs from Joe opening at 5 am until he opens the next morning, so a fish caught after dark counts, left in his night box.
- Each order takes a few fish from each player (3 for Joe's, 4 for Marta's); the biggest fill it first (`GameState.quote`). What you've filled that day is saved with your progress (`orders`).
- Joe's list is chalked on a slate on his counter (`WantedBoard.js`, one plane drawn on a canvas, sharing the records board's program), with where and when each fish bites. Your own ticks show on it.
- It's also in Joe's and Marta's panels, and a tag in the cooler and on the catch card marks a fish someone wants. A sale says how many went to the list, in its usual line.

**The week's order** (`src/game/WeekOrder.js`): a restaurant on the mainland orders one kind of fish through Joe, so many kilos by the end of the week, and everyone in the group fills it together.

- **Real weeks:** it runs from Monday 00:00 UTC to the next, the same for everyone wherever they are, and comes from the week alone (`weekOrder(now)`). The kinds come round in turn (red snapper, black grouper, mahi-mahi, tuna, yellowtail, hogfish), never the same two weeks running. The kilos are about twelve fish of the kind; the bonus is half of what that would fetch at Joe's price, and at least $200.
- **Filling it:** every one of those fish sold to Joe, or left in his night box, goes toward it and fetches half as much again (`WEEK_MUL`), or the day's list's price if it's on that too. The biggest go first, and the fish that fills it counts whole. The cooler and the catch card tag the fish it would take.
- **The tally** is the group's (`'weekOrder'` in the shared save: Playing together, above): who brought how many kilos. On its own the game keeps it in the stand-in's storage, so a player alone fills it alone.
- **Getting paid:** once it's filled, the bonus is shared by what each player brought. Joe pays your share when you next come to his stall while he's in. The last filled week's tally is kept for whoever hasn't collected yet, and your save records the last week you were paid for (`weekPaid`).
- **Where it shows:** under the day's list on Joe's slate (the fish, the group's kilos and a chalk bar), and as a block in Joe's panel with the bonus, the days left and what you've brought. A sale toward it says so in its usual line. Nothing else is a toast.
- A tally saved for a fish that has since been protected (the Nassau grouper's week) can't be filled; the week's order replaces it (`tallyFor`).

**Tarpon under the pier lights:** after dark the pier's lamps draw the tarpon (`lights` in `FishTable.js`).

- Their bites under the pier double while the lamps are lit (`Bites.lampsLit`, `Bites.pickSpecies`). A tarpon is let go: it's catch and release (Spearfishing, below).
- The bay's tarpon swim to the pier head once the lamps come on and back to the bay by day (`night` on their group in `world/Fish.js`; the app sets the lamps' state on the fish each frame).

## The weather

`src/game/Weather.js` is what the weather is, with no three.js (`test/weather.mjs` runs it under Node). `src/world/WeatherDriver.js` puts it on the island each frame.

- **From the day alone:** the weather is a function of the island's time (`islandTime( day, hour )`, game hours since day 1 began), as the wanted lists are of the day. Everyone on one clock has the same weather, and nothing is sent.
  - Three slow fields over that time: storminess (the wind, the swell), cloudiness (it can grey a calm day too) and how far the wind has turned from the trades (`veer`: up to about 35° either way). Each is value noise in two octaves, about 60 h and 14 h, mapped through its own distribution so that it's spread evenly.
  - They're read against the conditions' rows (`CONDITIONS`): calm, fair, breezy, cloudy, rain, blustery, gale and thunderstorm (`storm`). About half the time it's fair, a tenth calm, and a gale (or a thunderstorm in a gale's wind) about one hour in twenty-five.
  - **The rain** (M9) comes from two quicker fields: showeriness (about 3.5 h and 1.1 h) and how unsettled the air is (about 9 h and 3 h). It rains where it's showery enough for the sky: now and then a light shower on a clear fair day, about a third of the time under a grey sky, most of a gale (`RAIN_CHANCE`). It's heavier the greyer and stormier it is (`rain`, 0..1: 1 a tropical downpour), and the heaviest, in unsettled air, is a thunderstorm (`thunder`, 0..1). Rain brings its cloud, greys the sky and closes in the horizon. All told it rains about one hour in five (mostly showers), and thunders about one in twenty-five (`test/weather.mjs`).
  - **A blow on its way** (`front`, 0..1): how much stormier it gets in the next 2 to 4 hours. The fish feel it (below).
  - **(M12) Each blow its own track** (`trackAt`, `windAngle`): each peak of storminess's slow octave (on its lattice, every 60 game hours, `TRACK_SPAN`) is a blow, and a hash of it gives its track: down the trades about half the time (turned by `veer` as they always were), from the south about a sixth, from the west about a seventh, and now and then (about a fifth) a front. Between two blows the track goes over in the middle of the gap. A blow turns the wind to its track as it comes on (from a breeze to a stiff one, `BLOW`), so short of a breeze the wind's the trades' exactly, and a southerly backs it round from the trades through the west.
    - A front (`frontAt`): from the south ahead of it; at its blow's height (a few hours either side) a line of showers comes over (`FRONT_RAIN`) and the wind veers to the west in two game hours, then on round to the north over five more; behind it the sky clears (cover down to 0.4, no grey, the far horizon clear) for most of a day.
    - The weather comes the way the wind blows: the showers, the front's bank and the lightning come from up the track (`towardOf( windAngle )`).
    - **A westerly's swell** (`west`, 0..1): how much of the swell comes from the west, from the storm it comes from (the last six hours' westerly, as the swell it raised outlasts it, or the one on its way). None from a blow down the trades or from the south: the island's own swell comes from the south (`swellFrom`: 'S', 'S + W', 'W', on the slate and the clock's menu).
    - In 1,000 days: a blow is off the trades about two fifths of the time, the swell's from the west 5% of the time, and 14 fronts pass in full (`test/weather.mjs`).
  - **(M11) The showers about the island** (`showers`): cells of rain drifting with the weather (`FRONT_KMH`, 8 km a game hour), each bringing the rain the island has when it's over it (`weatherAt` then). So a shower you see coming is the rain that comes, and one going away out to sea is the rain that went. A slot every 4 km in the drifting frame, two cells a slot set off to either side (up to 14 km); those that pass over the island rain whenever it does, those off to the side half the time ((M12) a front's line all of them); each 1.2 to 3 km across. (M12) Each slot comes the way the wind blows when it's over the island (each cell's `x`, `z`): a southerly's showers are seen coming up from the south, where from the pier and the village the mountain no longer hides them. A picked weather holds its own rain in every slot (none for fair), down the trades. `test/weather.mjs`.
  - The name goes by a thunderstorm first, then the wind, then the rain and the cloud (`nameOf`).
  - The swell comes from the storm ahead (storminess 3 and 6 hours on), so the surf builds before a blow.
  - The surf's period: a storm's own swell is short (7.5 s in a gale), a swell from one still on its way long (up to `PERIOD_MAX`, 12 s), and by then smaller (`GROUNDSWELL_MAX`, 0.4 m, at the longest). Fair's is 9 s.
  - Only `+ − × ÷` and integer hashes: every device works out the same condition from the same time.
  - Day 1 is fair, and the forecast comes in over the first hours of day 2 (a new player's first morning; the checks start there).
  - **Fair is the island as it always was:** 7 m/s of wind from the trades' direction, today's sea, surf (9 s), cloud and light, and dry.
  - **The lightning's strikes** come from the real second and how thundery it is (`strikeIn`): in each second, a strike or none (at most `STRIKE_RATE`, one every 6 s or so in a full thunderstorm), where (from the island's middle, mostly up the blow's track until the storm's overhead, near ones rare; (M12) the track from the clock, `WeatherDriver.track`, not the eased wind, so everyone's strike is in the same place), and whether it comes down as a bolt (a third do). Everyone on one clock sees the same strike at the same moment, whatever their island clock (held, or resting).
- **What it drives** (`WeatherDriver`):
  - the wind, `G.windSpeed` and `G.windDir`: the plants, the village's flags and lanterns, the sea's gusts, slicks and windrows, the spray, the boat, the sound. The birds drift in no more than 10 m/s of it. Its direction turns about the trades' (`G.windPrevailing`), at most 0.015 rad a second ((M12) as fast as a front swings it: a quarter of the compass in two game hours):
    - the wind sea turns with it about the camera (`Waves.setWindDir`): each wave's phase is moved so that at the camera it's where it was (turned about the island's middle, the crests far from it would sweep past);
    - the slicks and windrows turn in a frame moved to the camera as it turns (`SeaDetail`, `seaDetailFrame`), and the whitecaps drift on the gusts' integrated offset;
    - the sand's ripples, the grass's comb and the clouds aloft keep to the trades' direction (they're laid by the usual wind, and the clouds' evolution runs along theirs);
  - the open sea (`Waves.setSea`): the swell's and the wind sea's heights, the wind sea growing as wind^1.5. Only the heights change, in place on the CPU and the GPU, so the sea builds where it is; the CPU's heights take more fixed-point steps on a steep sea;
  - whitecaps (`WaterSurface`): in a wind over fair's, Monahan's share of the sea breaking white, as patches along the crests near by and scattered further off. A uniform behind a branch: nothing is drawn for them on a fair day;
  - the surf (`ShoreWaves.setSurf`): its height, up to `SURF_MAX` (0.6 m: bigger, the sets break on the pier head and over the boat at the dock), and its period. Its run-up goes as the root of its height and in proportion to its period (Stockdon), so it never reaches the boardwalk (`test/waves.mjs`). The waves run on a clock (`ShoreWaves.clock`, the GPU's `shoreClock`) that's re-anchored whenever the period changes, counted from the bay's middle: every wave carries on, only the crests' spacing changes. The period changes at most 0.02 s a second, so the crests on their way in are hurried by no more than a few percent; the surf's sound and the shorebirds' swash take the same clock. (M11) The surf zone's water is as milky as the surf is high (its turbidity, `shoreMilk`: a fair day's as it always was, up to 1.8 times that), out to where the breakers stand (4.5 m deep on a fair day, deeper in a bigger surf), and a little clearer on a calm day;
  - (M12) a westerly's swell (`ShoreWaves.setSurf( amplitude, period, west )`, `Waves.setSwellWest`): below;
  - the cloud (`SkyProClouds`): its cover, and how grey it is (`overcast`: denser, its bases everywhere, darker below). Slow changes are followed by the panorama's progressive refresh and the view's history; only a step (a jump of the clock) makes a new panorama;
  - the light (`Sky.overcast`): the sun dims under a grey sky (to 30% of a clear day's on low and mid; to 70% on high, where the clouds' shadows dim the rest), and the sky's light greys and rises a little; (M10) the environment's level (`scene.environmentIntensity`: the lit materials' fill; (M11) the sea reflects the sky itself, grey and all) rises with it, by as much as the sky's light does under the grey and rain's deck (none under a clear sky);
  - how far you see (`Sky.visibility`): the tier's fog distances, nearer in murk;
  - the horizon: under a grey sky the fog greys, to a grey of the horizon's brightness, and the sky's dome takes the same grey toward its horizon (`skyGrey`, in the view and in the reflections), so the two meet without a seam;
  - the sound: the wind and the palms louder in a gale, the surf's waves louder as the root of the swell, and its far roar building faster;
  - (M9) the rain (`G.rain`: the streaks, the rings on the water) and how wet it's left everything (`G.wet`: soaked in seconds of a downpour, dry over four minutes once it's stopped);
  - (M9) rain's deck (`SkyProClouds.storm`, `Sky.storm`): its base 1.9 km lower, smoother below and darker, no cirrus above it, and no sun through it; of the sun it takes, half comes down through the cloud as the sky's light (`DECK_DIFFUSE`), and the eye adapts to a grey sky as a camera would;
  - (M9) the caustics on the seabed, faint under a grey sky and gone under rain's deck (`G.caustics`: the terrain's and `Underwater.js`'s), and the underwater fog dimmer under cloud;
  - (M10) the water's murk after a blow (`G.murk`, eased with the sea): below;
  - (M9) the weather on its way, up the blow's track (`SkyProClouds.front`; (M12) the way it comes, `frontDir`: the track of the weather 24 km off): the cover 12, 24 and 36 km upwind (and 12 km downwind) is the forecast's 1.5, 3 and 4.5 hours on, and the cloud's lead (a front comes in at 8 km a game hour, `FRONT_KMH`), against the cover here. The clouds' march reads it along the wind (`scFrontAt`, its largest rise bounding the empty cells), and so does the high tier's shadow map: a front's bank darkens the horizon before it's overhead;
  - (M11) the showers' curtains in the distance (`Sky.setCurtains`, from `Weather.showers` each frame): below;
  - (M9) the gusts: the cat's paws the sea shows (`SeaDetail.gustAt`, the same texels and drift on the CPU) raise and drop the wind by 22% either way, more in rain and squalls (`GUSTS`), where the boat is (`BoatController.windAt`) and where you're listening (the wind's and the palms' sound). A squall's downdraught freshens the wind while it passes (`SQUALL`, at most a gale's).
- **Easing:** the wind and the sea come round over half a minute or so, the cloud more slowly (a minute or two from fair to a gale's), the rain in seconds. The cloud follows the weather 0.6 game hours on (`CLOUD_LEAD`), so a shower's cloud is over before it rains. A jump of the clock (a rest, adopting the host's clock, coming back to the tab) sets it all at once, and the boat takes the sea as she finds it.
- **What stays as it was:** the island's own swell's direction, from the south (its travel times around the island are solved when the island loads).
- **(M12) A westerly's swell, crossing the island's own:**
  - Its field (`SWELL_WEST`, travelling east) is solved once one's on its way (`App.solveWestField`: when the weather's `west` first rises): in a worker (`world/shore/ShoreWorker.js`, through `classicWorker`), from the island's own field's depths (`ShoreField.fieldGround`: no terrain arrays sent, the same cells), a few tenths of a second on a laptop; on the page if there's no worker. Never at load. Its 512² float data is a second 4 MB texture.
  - The shore waves are two trains (`ShoreWaves.trains`, `ShoreTrain`: each its field, height, period, run-up and clock, re-anchored as its period changes). `setSurf( amplitude, period, west )` shares the weather's surf: the westerly's takes `amplitude × west` at the storm's period, while the south's dies down toward a background groundswell (a calm day's surf, 10 s). Where both run, their heights and slopes add and the foam, the swash and the rest are whichever's more (`shoreEvaluate`, `shoreSwashEdge`; on the CPU, `sample` and `swash`). The second is a uniform branch: nothing's evaluated for it until it has a height. `params`, `phase()` and `clock()` stay the south's; `surf` is the weather's (the fish, the sound).
  - Wrapping round the bay's western arm, a westerly's breakers pile onto the bay's west-facing eastern shore, and its western one is in the lee (`test/waves.mjs`: 0.81 m a wave against 0.04).
  - The open sea: every swell wave but the longest (the south's groundswell) turns to come from the west as far as the swell's from there, about the camera as the wind sea turns (`Waves.setSwellWest`), so the two cross offshore too.
  - The surf's sound hears each train break (`SoundScape.addShore`: stations along the shore of their own).
- **The rain** (`src/fx/Rain.js`): drops falling through a box that wraps around the camera, as the air motes do (a hash of the instance, no simulation), in one instanced draw: 1,400 on low, 3,200 on mid, 6,400 on high. Each falls at its size's speed (four sizes, eighths of 9 m/s, so each wraps whole) and is carried by the wind near the ground: a squall drives it slanting. It's drawn as the streak a moment's look leaves, at least a pixel or so across. How hard it rains is how many fall. They're lit by the sky, a glint of the sun against the light, and the lightning. None under the ground or the sea, (M11) or under what covers the island (below), or under the wheelhouse roof (`BoatModel.shelter`, a box in the boat's frame), or with the camera under water.
- **The rings** (`WaterSurface`, `waterRainRing`): a ring spreading from each drop, in two layers of cells, as the slope of the sea's ripples within 45 m of the camera; the drops beat the wind's ripples down there, and (M10) a downpour flattens them a third across the whole sea. Nothing's added on a dry day (a uniform branch).
- **(M10) The splashes** (`Rain.splash`): a small crown popping where a drop lands and gone in 0.15 s, a ring spreading at its foot and three drops thrown up out of it, lit brighter than the ground under them (the sky's light caught in the drops).
  - Hashed about the camera as the drops are (a 16 m square), each at a new spot each time it pops (every 0.3 to 0.7 s), as many as it's raining hard.
  - Only where something takes them: the top of what's there where it's above the sea (the sea has its rings), (M11) the pier's deck, the boardwalks, the roofs and the awnings where they cover the ground, or the ground; and the boat's cockpit sole aft of the wheelhouse (a box in her frame, `Rain.setDeck`), (M12) or whatever's highest of her there: the wheelhouse roof, the foredeck, the traps, the bait barrel, the hauler (`BoatModel.rainTops`, boxes in her frame). Not on thatch, which takes the rain in, and none under a cover.
  - (M12) And on the rocks about you (none of them is where the cover map reaches): the 16 nearest within 13 m of the camera, looked for again as you move (`Rocks.splashRocks`), each as the ellipsoid in its shape's bounds; a drop lands where it first meets one (`Rain.setRocks`, a ray against each in the splash's vertex shader).
  - One more instanced draw while it rains: 300 on low, 1,200 on mid, 2,400 on high.
- **Wet surfaces** (`src/materials/Wet.js`): every lit material that `App.lightUp` gives the local lights gets wet too (`useWet`: the `WET_SURFACES` define). In three's lighting chunks, just before the lights read the surface, `G.wet` darkens what faces up and glosses it (the materials that rewrite their emissive or their lights keep their code and still get wet).
  - (M11) Not under a cover (more than 0.25 to 0.5 m over it: a roof's own surface, its height kept at each texel's middle, is within that on its slope), nor under the wheelhouse roof (the rain's box for it). So the porches' and the boathouse's floors, the sand under the pier and the stilt huts, and Joe's counter stay dry. Where a fragment is comes from its view-space position and the camera's matrix (`wetSurfaces.update`), as the clouds' shadows do; the map's uniforms are given to every wet material compiled after `wetSurfaces.under( cover )` (App calls it once the village is built, before the plants and the load's compile).
- **(M11) What covers the island** (`src/world/Cover.js`, `CoverMap`; its CPU side tested under Node by `test/cover.mjs`): the pier and its T-head, the boardwalks, the roofs and porches, the stalls and the village's clutter, as the rain finds them. The terrain isn't in it, nor the boat (she moves: her own boxes), the rocks or the plants.
  - It's drawn once, after the start (`App.buildCover`, once Joe's and Marta's stalls are in, after `prepareLate`), from straight above: the village's merged meshes by what they're made of (`Village.coverParts`: wood, tin, thatch, stone, the hard bits, the canvas; not the drying nets), Joe's stand as tin, Marta's open table as wood. The depth test keeps the highest surface. Its program is made and first used as the rest are, and it's drawn in frames of its own (`frameSlot`), at most 200k triangles a frame (the checks count a frame's): one on low (131k), two on mid and high with the stalls' scans (239k). On a device that draws on its CPU it's ready a few seconds after the rest (3 to 6 s to build).
  - 0.2 m texels over the village and the pier (573 × 1012, 2.3 MB), one RGBA8 texel each: the height to the centimetre in r and g, the kind in b. Read back without waiting (`readRenderTargetPixelsAsync`), and the same bytes serve the CPU (`heightAt`, `kindAt`, `over`) and the GPU (`coverAt`, `coverHeightAt`: read texel by texel, so an eave's edge stays sharp).
  - Where a texel's middle fell between two of the pier's planks, the hole is closed (`CoverMap.close`: one texel across, between covers within 25 cm of each other's height), so no rain falls in sheets under the pier.
  - Until it's built nothing covers anything, as before.
- **(M11) The drips** (`src/fx/Drips.js`; where they come from tested under Node by `test/drips.mjs`): drops falling from rest off the eaves, the wheelhouse roof and the palms' fronds, and splashing where they land (the rain's crown, `CROWN_GLSL`; none on the sea).
  - The eaves come from the cover map (`eavePoints`): where tin, thatch or canvas falls toward an edge with more than 0.6 m under it, a place just outside it, one texel in three. A gable's rakes (level along their edge) don't drip, nor does a roof over a gutter (the gutter's within the drop), nor the decks. About 600 of them.
  - The wheelhouse roof's sides drip onto the gunwales beside the house, its back edge into the cockpit (`wheelhousePoints`, in the boat's frame: with her wherever she is). The palms' fronds drip from a ring under each crown, 2.6 to 3.8 m out and 1.2 to 2.4 m down (`palmPoints`, from Vegetation's records), onto the ground or what covers it.
  - Each place drips at its own rhythm (a period of 0.6 to 1.2 s, at least its fall and its splash); how hard it's dripping (`dripFlow`: a shower's enough, and on after it while `G.wet` is past 0.55, the first two minutes of its drying) is how many of those drops fall, so a change in the rain never jolts one on its way.
  - The places within 22 m of the camera take the instances (on a grid, looked for again every 0.3 s or 1.5 m), the boat's after them, in one instanced draw: 120 on low, 240 on mid, 400 on high. None until the cover map's built, but the boat's.
  - You hear them land: each drop's rhythm and chance come from an integer hash of its seed (`dripRand`), the same on the GPU and the CPU to the bit, so `Drips.landed` holds each frame's drops landing within 14 m on something that sounds (`LANDS`, kept with each place: tin rings; wood, stone, canvas and the boat are dull; the sand, the sea and thatch say nothing). `SoundScape.drip` plays one of eight drops on thin metal there: onto tin as recorded, onto the rest slowed to 0.75 with its top cut at 2.5 kHz. Two at once (one on low).
- **(M11) The showers' curtains** (`Sky`, in the sky dome's main view on every tier: the scene's fog ends a few kilometres out, so they're the sky's, as the clouds are; the island is never more than a kilometre or so off, so they're always beyond it):
  - The nearest of the showers (`setCurtains`: 6 on low, 12 on mid and high), from 2 km beyond their edge (full from 5 km: nearer, you're in the rain) out to 26 km, each strong as its rain.
  - Each a shaft of rain from the sea up into the haze under the cloud (to 3 km, or the cloud's base if that's lower), leaning with the wind, nearly as thick at its edge as through its middle, in streaks drifting down. Analytic along each view ray: how far the ray goes through each shaft below its top.
  - Lit as a veil over what's behind it (the sky and the cloud beyond, darker), silver toward the sun, and lit by a flash as the murk is; greyed into the horizon's grey under a grey sky as the rest of the dome is. Not in the reflections' panorama.
- **The lightning** (`src/sky/Lightning.js`):
  - It looks at each second's strike once (`Weather.strikeIn`, with the eased thunder and the wind's direction).
  - A flash is two to five return strokes tens of milliseconds apart, each fading in 50 ms. The brightest flash lights the cloud from inside about the strike, brightest where it's thickest, and the murk toward the horizon (`skyFlash`, in the sky's main view on every tier: the panorama's and the trace's clouds alike). It lights the island from the sky too (the hemisphere light, bluish white; the eye adapted to the dark at night makes the most of it) and the rain.
  - (M10) And the sea reflects it: the panorama the sea reflects is made over seconds and never has a flash, so the water adds the flash's lobe about the strike off its surface itself (`G.skyFlash`, shared with the sky with its eye adaptation, `G.skyExposure`), by the surface's Fresnel. A uniform branch: nothing's added without a flash.
  - ((M11) The sea reflects the sky as a mirror does: the environment is given to the water as its own (`WaterSurface.REFLECT`, 1: the sky drawn as you see it), so three doesn't give it the scene's fill, about 0.05 to 0.09, which it reflected at until M11 (its `envMapIntensity` of 12 never applied). Its Fresnel takes it: little looking down into the water, nearly all toward the horizon, where the sea is now a little darker than the sky above it (it was a fifth of its brightness). A ray reflected downward, off a wave's face at a grazing angle, is turned up to the sky, as on a real sea; from under water the surface's underside keeps the faint fill, mirroring the dark sea below. The flash's term doesn't go through it.)
  - A ground strike's bolt is built when it strikes: a main channel stepping down from the cloud's base in jagged runs, with branches that peter out and a few streaks under the base. It's drawn as ribbons a few pixels across in one draw, unfogged, dimmed by the rain's murk, and drawn nearer (as large in view) past 9 km, inside the camera's far plane.
  - The thunder reaches each listener its own distance at 343 m/s after (`onThunder( strike, distance, direction )`): a near crack within 3 km, a far rumble beyond, placed the way it came, dulled and slowed the farther it's come (`SoundScape.thunder`). (M12) Thunder is refracted up over a listener far off: it fades from 14 km and none is heard past 22 km (`HEARD`, `THUNDER_FADE`).
  - **(M12) Thunderstorms on the horizon** (`Weather.distantStrikesIn`, from `WeatherDriver.cells`: the showers out to 60 km, `STORM_RANGE`, each with its slot's thunder): a thundery shower past 8 km from the island's middle (`DISTANT_NEAR`: nearer, it's the island's own storm) strikes under itself, about every 12 s in a full thunderstorm, from the second and which shower it is alone, so everyone sees it. So a thunderstorm's lightning is seen on the horizon before it gets here (`test/weather.mjs`: before every one in 300 days), and after it's gone; past 20 km or so it's silent.
  - **(M12) A flash as it's seen from afar** (`Lightning.flashSeen`): close by as it was (its glow, and the light on the island, as `NEAR / dist`). Past 8 km its glow dims only as the air between takes it (30 km in clear air, nearer in rain), and tightens about the strike to its storm's size (`G.skyFlashShape`: the sky's lobe and the sea's reflection of it). From 6 to 14 km off it's more and more a storm of its own: not the cloud overhead lit, but its own, low on the horizon, a lumpy tower up to a thunderstorm's 12 km top, highest at its middle, with a faint halo in the haze about it, behind whatever cloud's between. Its bolt comes down from a thunderstorm's base (1,200 m), not the cloud overhead's.
    - Its light on the island: as far as it's the cloud overhead lit, as it was (`Sky.flashFill`, as the square of the distance past 4 km, on the sky's own light: the island, the murk about you and the rain). As far as it's a storm on the horizon, from its side (`Sky.flashLight`, a hemisphere light aimed level at it, there from the start and dark, so no program's made again when one flashes), as bright as its lit cloud as the sky draws it: its brightness over the sky it covers, against the sky's own over the whole dome, of the sky's light on the island. So the foreground answers the sky behind it: on a clear night a storm 16 km off lifts the sand by about half and what faces it by a third or more while it flashes (the canopy's own occlusion keeps the forest dark); by day it's a faint brightening about it, and the bolt against its rain.
- **The rain's sound** (`SoundScape`): a light shower's patter, a downpour's roar (crossfaded by how hard it rains), and aboard (on deck or at the helm) rain drumming on the boat, the rain beyond her quieter. Field recordings (CC0), built by `tools/audio/build-weather.mjs`.
  - (M11) And on what it falls on about you (`Cover.surroundings`: your spot, 3 m out and 8 m out, five times a second while it rains): the sea's share (light, medium and heavier recordings of rain on a lake, crossfaded as it rains harder), wood's (a porch in a shower, and once it's set in), the rest's (the ground, the roofs: the M9 beds), each by its share as power. Right by you, a downpour hissing on the sea close by, and drops slapping on the wood under you.
  - Under a cover (most of what's right by you under a roof, an awning or the pier's deck) the rain's beds go through a low-pass down to 900 Hz and lose 5 dB.
  - The low tier leaves out a share under a sixth, the sea's medium and the two close ones, to keep within its voices (9 of 14 at most, aboard in a thunderstorm).
  - Field recordings (CC0), built by `tools/audio/build-surfaces.mjs`.
- **The fish in the weather** (`Bites.weatherMood`, `habitat.weather` from `Game.habitat()`): none of it on a fair day, which bites exactly as before.
  - Ahead of a blow (`front`) the bites come up to 35% sooner and the big ones feed too (`rollWeight` skews less to the small end).
  - Under a grey sky by day each fish bites up to 60% of the way toward how it does at dusk, when that's better: the predators hunt.
  - A downpour or a thunderstorm puts them down: up to 80% slower.
  - A big surf stirs up the shallows (half as rich) and round the pier (a third less); a blow out on the open sea, the deep (40% less).
  - Their own taste (`weather` in `FishTable.js`): mahi and blackfin tuna up on the wind lines in a blow, tarpon rolling in the rain, bonefish off the flats in a big surf and a wind.
- **Joe and Marta in the weather:** they shut for a gale or a thunderstorm (`Orders.shutFor`), whatever the hour. Whoever's being served finishes first; Joe's night box and the diesel on Marta's honesty box stay out; their "Closed" boards, prompts, panels and the clock's menu say they've shut for the weather.
- **Joe's forecast slate** (`ForecastSlate.js`): chalked beside his wanted list (hung from it, so it goes up with it): the weather now and its rain, the wind in knots and where it's from, the surf ((M12) and where its swell's from), what's coming, and "Fish feeding: a blow's coming" when the front's on its way.
- **The boat in the wind** (`BoatController`): drag on the apparent wind, 6 m² end-on and 11 m² abeam, at a centre of effort over the keel's centre of lateral resistance, up on the house. It moves toward the end the wind comes from as it comes round from abeam (as on a flat plate), so beam-on is how she lies.
  - Left to herself she comes round beam-on and drifts downwind (about 0.3 m/s on a fair day, 0.9 in a gale), heeling a little.
  - At anchor she lies head to wind.
  - Past 25° of heel her full keel and flared topsides right her harder (`RIGHT_K`): the waterplane samples alone lose their grip there, and a gale's wind and beam seas would roll her over.
  - On a still day her drag through the air is what it always was.
- **Marta's tow:** when your boat has drifted more than 30 m from the dock with nobody at her helm, Marta's panel (and her honesty box) offers to tow her in (`Game.tow`): $20 and a little every 100 m, at most $90 (`towFee`). Short of it, she takes what you have.
- **The clock's menu** (`TimeHUD`):
  - what the weather is (where the wind comes from and its speed in knots, `windFrom`, `knots`; the surf as a report gives it, `surfText`, and its period) and what's coming (`forecast`);
  - on your own, a choice of it: the forecast or any condition. It's saved with the clock (`weather`), and holds only while you're surely alone (`Together.surelyAlone`: a solo session, or nobody else here once the first lists are in). In company the weather is the day's.
  - On its own (`pnpm dev`), `?weather=gale` holds it from the first frame, company or not; `?weather=forecast` is the day's.

## What the weather costs

(M10) Mild costs, never a game over: the boat's hull, the fishing in a blow, the water after one, and the island in it. None of it on a fair day.

**The boat's hull** (`src/game/Hull.js`, pure, tested under Node by `test/hull.mjs` with the real boat in the CPU's sea; `Game.updateHull` feeds it each frame and does what it says):
- **Wear** (`GameState.hull`, 0..1, saved until Marta repairs it):
  - From slams into a sea past 0.5 (`slamWear`: a fair day's hardest flat out are under it). Flat out into a gale's sea she wears about 8% a minute; at half throttle, next to nothing.
  - From knocks on the piles and drops onto the ground (`hitWear`, from 1.5 m/s closing: a pile at full speed, about a tenth), and from being driven along the bottom (`scrapeWear`, and a grind under power while she slides: a beaching at full speed, about a tenth). `BoatController.contact` records the hardest of each since the frame before.
  - It costs her speed (`thrustMul`: fully worn, 35% of her thrust gets her anywhere, a quarter off her top speed) and it leaks (half a litre a second, fully worn).
- **The bilge** (litres, for the voyage: not saved):
  - In: the leak, the rain into her open cockpit (0.1 L/s in a downpour), and green water over the bow in a slam past 0.85.
  - Out: the bucket (hold E on deck: 3 L/s, a scoop every 1.6 s; the rail's "Jump overboard" makes way for it, `Player.bailable`) and Marta's electric bilge pump (`bilgePump` in `Gear.js`, $120: 0.3 L/s, more than a downpour brings in).
  - Her mass is hers and what's in it: she sits lower (+500 kg, 3.6 cm), and others see it in her pose.
  - It reaches the engine at 500 L (`FLOOD_L`): the gauge pulses from 70% of it, and she coughs from 80% (her revs dip).
- **The engine** (`Hull.engine`: off, cranking, running, stalled; `BoatController.engineOn`):
  - Taking the helm cranks her (1.1 s, `CRANK_S`): a sound engine catches first time, one that's stalled takes a try or two (`crankChance`, less in a worn boat).
  - She stalls when the water reaches the engine, and won't start again until it's under 80% of that; or on a hard slam (0.95) in a worn boat (30%), now and then; or when the tank's dry.
  - Stalled, opening the throttle cranks her (W, the stick), and the helm's prompt says so. Not running, she has no thrust and her revs run down; she burns no fuel.
- **Marta's repair** (`Game.repairJob`, `GameState.payRepair`): her panel's row while she's open, with the boat at her dock: $150 for all of it, or as much of it as your money pays for.
- **The HUD**: the hull's gauge in the purse once it's worn, the bilge's while there's water in it; the guide's tips for the first water and the first wear; toasts when she stalls and as she wears.
- **Sound** (`SoundScape`; CC0 field recordings built by `tools/audio/build-hull.mjs`):
  - the starter (`starter.ogg`: a crank that won't catch, and one that catches as `CRANK_S` ends and runs into her idle, as the engine's bed comes up), on every start;
  - the hull knocking a pile (`hull_bump.ogg`, with the shutter's bang slow and low under a hard one) and the keel's scrape (`keel_scrape.ogg`);
  - the bucket (`bucket.ogg`), the pump (`bilge_pump.ogg`), the water sloshing in the bilge as she works (`bilge_slosh.ogg`), and the hull creaking in a sea, more often the more she's worn (`hull_creak.ogg`).
  - The boat's set loads once you're aboard (`boatReady`), so the starter's ready for the helm.
  - (M11) Whoever rides along hears them too: while you're aboard your boat and there's something to hear, her hull goes with her pose (`H`: the bilge's share of the engine's water, the pump, the keel scraping, her wear, how hard she's working: `App.hullHeard`), and their soundscape plays it as yours does (`Together.boatSound().hull`). A boat going by is heard the same way, faintly.

**Fishing in a blow** (the wind past a fair day's: `Weather.windBeyondFair`, `blowShare`):
- **The cast** (`FishingRod`): the wind bellies the line and carries the float along (`LINE_WIND`): into a gale a full cast falls a few metres short, across one it's set aside; downwind it runs on as far as the rod casts.
- **The float** drifts downwind, 2% of the wind past a fair day's, up to 6 m from where it came down and no shallower than 0.3 m. The bites follow it (`Game.habitat` reads where it is), and others see it in the pose.
- **The cast net** (`CastNet._step`): in the air each piece is dragged toward the wind, not still air; the netting's carried off far more than the leads, so in a gale it lands downwind of where it was aimed.
- **The fight** (`CatchMinigame`, `wind`): gusts on the line every few seconds, for a second or so, haul on it (`GUST`: 0.6 of the breaking point in a gale). Reel on through one and the line snaps; let it be and the drag gives it line (`GUST_EASED`). A fair fight draws nothing for it and goes as it did.

**The water after a blow** (`Weather.murkAt`, 0..1): the strongest blow of the last day (storminess past a stiff breeze's, full in a gale), as murky for six hours after and clearing over eighteen more; day 1 counts as fair, a held pick has its own. It's quite murky about one hour in eight.
- Under water the fog closes in (28 m down to 11 m) and turns a silty green-grey (`App`), and the caustics dim. (M11) And the fish notice you later: at the murkiest, at 60% of the distance they would in clear water (`Fish.wariness`, `MURK_WARY`; `test/spearfishing.mjs`).
- Joe's slate says the water's murky (unless a blow's coming, which it says first), and so does the clock's menu.

**(M12) The surf and a swimmer** (`ShoreWaves.currentAt`, `breakerAt` on the CPU, through `WaterQuery`; `Player.surf`; `test/waves.mjs`):
- **Rip currents:** seaward through the bar's rip channels (the shore waves' `shoreBar`, about every 100 m along the beach, some 20 m across: along the south's field, as the bottom's), from where you can't stand (1 m deep, in full from 1.6) out past the breakers (1.3 to 2.6 times their depth), at 0.5 m/s for each metre of the breakers' height there (the bigger swell's), pulsing with the sets (0.7 to 1.5 of that, about a minute apart). A few tenths of a m/s on a fair day; near 1 in the biggest surf's pulses (MacMahan et al. 2006). Out of the channels, inside the breakers, feeder currents run along the beach into them at under half that.
  - A swimmer is carried by it (the water moves; their stroke is through it). Four seconds carried out by one and the guide's tip says so: swim along the beach, not against it.
  - On the GPU, a rip's water is milkier, in a plume out through its channel past the breakers (`shoreSurfTurbidity`), as you'd spot one from the beach.
- **Tumbled:** a breaker past 2.8 m (`TUMBLE_H`: trough to crest as the shore waves shape it; one in thousands on a fair day, one in seven of the biggest surf's), plunging, as its crest passes over a swimmer within 55% of its height of the surface: carried toward the beach (1.8 to 3.2 m/s, easing), held under (0.7 to 1.6 m), the view rolled over, and 2 to 6 s of breath gone, for 1.3 to 2.4 s, the more the bigger it is. Dived deep enough under it, it passes over. The first time, the guide's tip says so.

**The surf and the fish in it** (`FishSchools.setSurf`, from the shore waves' height):
- The breakers' depth follows the surf (`breakDepth`, a fair day's where it always was), and their look-ahead grid is built again once it's moved 3 cm.
- The bait runners inside the breakers (`runnerMullet`, `runnerFry`) keep inside them, deeper in a big surf. From a surf of 0.5 m some of their schools go off, up to about half at the biggest: one that's out of range doesn't come back into it.

**The island in a blow:**
- The village's shutters bang, from a stiff blow (12 m/s), more often the harder it blows and in the gusts: one near you, placed at its house (`SoundScape._blow`, `shutter.ogg`).
- Torn bits of leaf tumble along and sand streams low over the beach (`AirMotes`, mid and high): blown faster than the motes, none below a blustery wind.

## Spearfishing

The speargun is `src/game/Speargun.js` and its half of `src/game/Game.js`. The fish's side is in `src/world/Fish.js`, and the held breath in `src/player/Player.js`.

- **The law** (`game/FishTable.js`):
  - Each species is a fish spearfishers take (`spear`), protected (`protected`: the Nassau grouper, the stoplight parrotfish, the tarpon), or neither (the reef's aquarium fish and the bait).
  - Some have a minimum size (`minCm`). `spearRule()` says whether one may be taken, and why not.
  - A protected fish caught on a line is measured, logged and released. The island's records still count it.
  - Joe pays a bounty on lionfish, an invader on the reef.
- **One key, R**: the rod on land or on deck, the speargun in the water. Neither leaves its element (`Game.canFish`, `canSpear`), so changing one for the other means getting out of the water or into it. The speargun fires only once you've dived (`Game.submerged`).
- **The sights** (`Game.sights`) name the first fish along the view within the shot's range (`Fish.pierce`), unless the reef is in the way (`groundHit`). The gun won't fire at one that mustn't be taken (`gun.safety`).
- **The shot** (`Speargun.stepShaft`):
  - It flies with the water's drag and a little sinking, and stops at the end of its shooting line.
  - Each step it's tested against the fish it may take (`Fish.pierce`), the bottom and the reef (`groundHit`, in ~10 cm steps) and the piles (`Colliders.segmentHit`).
  - A long shot at a big fish glances off.
- **A fish on the shaft** is the reef's own fish:
  - `Fish.hold` poses it on the shaft, thrashing, and the simulation leaves it alone. `release` lets it swim off; `take` removes it until its place is filled, out of sight, a few minutes later.
  - A clean shot through the head, or a small fish, is hauled straight in. A big one fights: `CatchMinigame` with `landAt` and `tired` lands it only once it's tired. One shot through the tail can work itself off.
  - It's weighed by the size it swam at (`fishWeightKg`), and its catch keeps the method (`'spear'`).
  - It sells like any other fish: it counts toward Joe's list and the week's order.
- **The fish notice the diver** (`Fish.wary`, `WARY`): the faster the diver comes, the farther off they react, and a fright keeps them warier a while (`SPOOKED`). (M11) In murky water they notice later (`MURK_WARY`). Frightened groupers tuck in at their coral head. Jacks, barracuda and mahi come to look at a diver keeping still (`curious`).
- **The spearfisher's fish**: hogfish on the sand at the reef's foot, black groupers and lionfish at the coral heads, mutton snappers along the reef's edges, red snappers over the deep holes in the bay and beyond its mouth, mahi and blackfin tuna in the blue water off the bay.
- **The breath** (`Player.breathe`):
  - 50 s finning easy, less kicking hard, more keeping still. It comes back at the surface in 10 s.
  - Running out is a blackout: the swimmer floats up, and whatever's on the line is lost.
  - With the speargun out the swimmer stalks (`Player.stalk`): a slow glide along, still brisk going down or up.
- **The gun in your hands**:
  - It's held like the rod: a pose in camera space, eased between its states.
  - Its depth is pressed against the near plane (`GameMaterials` `viewModel`), so the reef never cuts through it.
  - The bands are tubes the vertex shader lays out: stretched thin on the shaft's notch, slack under the muzzle, or on the way between as they're loaded.
  - Under the sea it takes the water's colour, as the reef does (`underwater`).
- **Playing together**:
  - The pose carries the speargun (`g`), which gun it is (`gl`) and the shaft while it's out (`G`).
  - Others see it in your hand (`gunModels`, per gun), its shaft and line, and a speared fish on the shaft.
  - The catch message and the records say a fish was speared (`m`).
- **Sound**: the speargun has no recordings of its own yet, so the fishing ones stand in (`SoundScape.spearShot`, `spearHit`, `bandStretch`).

## The cast net

The cast net is `src/game/CastNet.js` and its half of `src/game/Game.js`. The fish's side is in `src/world/Fish.js`; the bait is `src/game/Bait.js`, kept in `GameState`.

- **One key, N**: the net goes wherever the rod does (`Game.canFish`: ashore, wading, on the pier or on deck) and takes its place. R swaps it for the rod. Swimming or taking the helm puts it away, and whatever's in it goes back.
- **The throw**:
  - Hold the left mouse button (F, RT, or Throw on a touch screen) to wind up; let go to throw.
  - A ring on the water shows where it will land and how wide it opens. It brightens during the wind-up's moment (`SWEET`, as wide as the net's `spreadWin`): let go then and the net spins fully open; early or late, it opens partly (`openQuality`). Held too long, the arms tire.
  - The ring reddens over dry ground. Where the water is deeper than the hand line reaches (`aimReaches`), the prompt says the net will close before it gets to the bottom.
- **The net** is a radial cloth (`CastNet._step`):
  - 9 rings of 28 particles from the horn to the lead line, joined by ropes that pull and never push (a net folds and bunches), solved by position-based dynamics in substeps.
  - The leads are heavy and the netting light. In the water everything slows to the net's sinking speed (`sinkMs`). The horn is tied to the hand line and to the brails.
  - The hands pin the particles they hold (`HANDS`, in camera space): loaded, the horn and a gather of netting are in the right hand and a third of the lead line over the left. The throw sets the particles off with the spin the wind-up gave it.
  - Drawn, the netting is a smooth surface through the particles with a diamond-mesh shader (twine, knots, a veil far off). The lead line is a tube with sinkers along it, the brails and hand line are ribbons, and the horn and swivel are a small mesh.
  - States: `stowed`, `held`, `windup`, `throw`, `flying`, `sinking` (everything from the splash until it's out), `lifted`, `dumping`, `gather`. The game drains its moments with `takeEvents` (`'throw'`, `'splash'`, `'land'`, `'bottom'`, `'pursed'`, `'lifted'`, `'dump'`).
- **Closing and hauling**: holding the button draws the hand line in. First it pulls the brails through the horn, closing the lead line under the net into a purse (`draw`, 0 to 1); then the purse comes in hand over hand, slower with a heavy catch (`load`). It hangs in front of you a moment, dripping, then the brails let go and the catch spills out.
- **The fish under it** are the island's own fish (`Fish.netLand`, `netStep`):
  - When the net lands on the water, every fish inside the lead line (within `NET_EDGE` of it) is in it, and the rest nearby scatter.
  - The lead line's ring of splashes turns the fish inside in toward the middle for a moment (`NET_TURN`). Then each makes for the edge. One that gets there below the lead line slips out under it, until the lead line is on the bottom or drawn closed. A mullet may leap clear while it settles. A fish too long for the net tears out (`holdCm`); one small enough slips through the mesh (`meshCm`).
  - Drawn closed before it's on the bottom, the purse is the netting above the lead line, and a fish below it gets away. So in deep water (off the pier, round its piles) it's let sink first, and a heavier net gets down before they're out: from the deck, the 4 ft net keeps one now and then, the 10 ft net most of what it lands on.
  - Off a pier or a deck in deep water, the hand line runs out before the lead line reaches the bottom: the net purses where it hangs, and fish can still swim out under it until it's closed.
  - The net counts the ones that got away and how (`Fish.net.out`). An empty haul says so, instead of a tip.
  - Once the brails are mostly drawn (`BAG_FROM`), the fish ride in the purse, kicking (`Fish.hold`).
- **The haul** (`GameState.addHaul`): each fish is logged.
  - A mullet of 0.45 kg or more (`KEEPER_KG`) goes in the cooler (method `'net'`), and sells like any other fish.
  - Silversides, sergeant majors, grunts and smaller mullet go into the bait bucket while there's room.
  - Anything else, a protected fish, or a fish with no room for it, is thrown back toward where the net was thrown.
  - The haul card (`GameHUD.showHaul`) says what went where and why, for a few seconds over the prompt.
- **Where the bait is**:
  - Along the main beach, pods of finger mullet and silverside fry run the trough inside the breakers at wading depth (`runnerMullet`, `runnerFry`: `surf`, so they may swim where waves break). More fry school just outside the breakers.
  - Sergeant majors and grunts mill round the pier's piles.
  - Schools of bigger mullet cruise the bay in chest-deep water and deeper: from the pier or a boat.
  - Silverside schools swim over the reef, and a bait ball turns at its drop-off: from a boat.
- **The shop** (`Gear.js`, at Marta's chandlery):
  - The cast net: a hand-me-down 4 ft net; 6 ft monofilament ($70); an 8 ft bait net with heavy lead ($210); a 10 ft pro net ($520). Each step covers more water, sinks faster, throws farther and holds bigger fish, but its moment to let go is narrower.
  - The bait well: a 5-gallon bucket (24 baits), an aerated bucket ($90, 50), a livewell with a pump ($300, 120).
  - An upgrade bought while the net is out takes effect once it's back in the hands (`CastNet.setGear`).
- **Bait on the hook** (`Bait.js`):
  - B (the d-pad's ← → with the rod out, or the bait button on a touch screen) picks what goes on the hook at the next cast: the frozen shrimp, which never runs out, or a kind from the bucket. The cast takes one from the bucket; a live one still on the hook when the rod goes away goes back in.
  - Live and cut bait bite sooner (`speed`), draw their predators (`likes`), put the little fish off (`small`) and bring bigger fish (`skew`), through `Bites.pickSpecies`, `rollWeight` and `biteDelay`. A nibble can steal it (`steal`).
  - A mullet in the cooler can be cut into 2 to 8 chunks of cut bait (`GameState.cutBait`, one per 200 g or so). Cut bait doesn't count against the bucket.
  - Marta's daily bait order can be filled from the bucket (`GameState.sellBait`).
  - The bucket and the pick are saved with your progress (`bait`, `baitPick`).
- **Playing together**:
  - The pose carries the net's state (`n`), its size (`nl`), and while it's in the water how far the brails are drawn (`nd`) and how much hand line is out (`nh`). The throw itself is a `'net'` message: where it was aimed, how well it opened, and the seed of its spin.
  - Others throw a copy of your net as you threw it (`CastNet.remoteThrow`, `follow`), from their copy of you, and its arms reach for the net's hands (`Avatar.reachArm`). A net more than 90 m away isn't drawn or simulated.
  - A mullet netted for the cooler counts toward the island's records, and the toasts say it was netted.
- **Sound**: no recordings of its own yet (`SoundScape.netThrow`, `netSplash`, `netLand`, `netPull`, `netLift`, `netDump`). The rod's swish slowed down is the net spinning out; splashes sped up are the lead line coming down; swim strokes are the wet netting drawn in.
- **On the island**: cast nets hang drying by their horns on the beach racks (`Props.castNetHung`, through `netRack`), and lie in heaps on the sand by the chandlery and on the pier by the bait bucket (`castNetHeap`).

## The anchor

Marta sells one (`anchor` in `Gear.js`: a Danforth on 200 ft of rode, `anchorM` 20, so it holds in up to 66 ft of water).

- **No button:** it goes down when you leave the helm out on the water and comes up when you take it again, as the dock lines do at the berth (`Game.updateAnchor`). It waits for the boat to slow below 2.5 m/s (`ANCHOR_SPEED`) and isn't used within 14 m of the berth, where the dock lines take her (`BERTH_M`). Deeper than the rode holds, a toast says so and she drifts.
- **The rode** (`BoatController.anchor`, the spot on the bottom): it's made fast at the stem head, slack until the bow swings 4 m from over the anchor (`RODE_SLACK`), then a damped spring that only pulls, so the boat is brought up short and her bow comes round to it.
- **What you see:** the rode, the fishing line's ribbon at twice its width in rope's colour, from the stem head down and along the bottom (`Game.rode`). At night the masthead shows the anchor light.
- Others see it too: the pose says your boat is at anchor (`A`), and their copy of it shows the anchor light.
- The wind pushes her (The weather, below), and the rode holds her against it: she swings round to lie head to wind, and in a gale she sails about on it before she settles.

## The boat at night

`src/world/boat/BoatLamps.js` gives each boat (yours, and each copy of someone else's) the lamps a boat shows at night:

- **Navigation lights:**
  - Under way: the red sidelight to port, the green one to starboard, the white masthead light ahead and the white stern light. Each is seen only from its own arc, as at sea, so you can tell which way a boat is heading.
  - Moored or at anchor: one white anchor light at the masthead, seen all round.
  - They're glowing points a few pixels across at any distance, all in one draw.
- **The searchlight** (L at the helm, or the Searchlight button): a beam in the night air, its lens glaring when it points at you, and a spot in the local lights.
  - The sea takes the local lights in its own way (`LOCAL_LIGHTS_WATER` in `WaterSurface`). Beams light a pool on the water; a lamp's light on it is mostly its glints.
- **The deck floodlights** (`lights` in `Gear.js`), lit from dusk once fitted, draw fish to their pool astern (`Game.floodAt`: all of it within 5 m of the stern, none past 14 m).
  - Yellowtail, jacks and houndfish gather there (`flood` in `FishTable.js`): their weight in `Bites.pickSpecies` counts up to that many times more, about doubling their share of night bites.
  - The pool counts as richer water in `Bites.biteDelay`, so bites come sooner in open water (a reef or the pier is already as rich as it gets).
  - Only the odds change: the swimming fish don't crowd into the light as the tarpon do under the pier lamps.
- **The horn** (hold H at the helm, the Horn button, or the left stick): Félix Blume's field recording of a cruise boat's horn in Istanbul (CC0), three blasts in one sprite (`tools/audio/build-horn.mjs`).
  - It sounds from the wheelhouse roof for as long as it's held and fades when let go.

## The boat's instruments

(M11) `src/world/boat/Instruments.js` (`BoatInstruments`; its rules tested under Node by `test/instruments.mjs`): the dash's five gauges and two screens show what they read, drawn into one canvas (1024 × 512; 512 × 256 on low) that the dash's display meshes take their uvs from (`RECTS`, `atlasUV`, built in `Wheelhouse.js` into its own bucket and material, `BoatMaterials.display`: unlit, as a screen lights itself; one draw call).
- **The gauges:** the tachometer over the wheel (the engine's revs, `BoatController.rpm`, to 3,600; a flicker as the starter turns her over), the speed in knots and the fuel either side of it, the engine's temperature and the battery's volts by the centre screen. The game keeps neither of the last two: the engine warms toward 178°F as she runs and cools slowly as she stands (`engineTemp`), and the battery reads 12.6 V standing, 14.2 charging, 10.9 as she cranks (`batteryVolts`). The needles swing to their readings as a gauge's own do.
- **The depth sounder** (the centre screen): every boat has one. The bottom under her scrolls by, a strong red return over the sand, with the depth in feet and a scale to the next 10 ft past the deepest shown. With Marta's fish finder it marks the fish too, as arches in the water column, as often as the water under her is rich (Game's sonar, the HUD's).
- **The chart plotter** (the port screen): north up, 640 m across, on the minimap's baked chart: her, pointing where she heads, her track this trip, her speed over the ground and heading, and where she is (a made-up spot off the Florida Keys).
- Redrawn while you're aboard her (every 0.15 s; 0.25 on low), the sounder filled with the bottom under her as you come aboard. Ashore her screens are dark and her needles rest. Every other player's boat's dash is on standby (`ins.standby`: the same program, a dark glass for its map). (M12) Riding along in someone else's, their dash shows its skipper's readings (`App.riddenReading`, `dashOn`), and yours is on standby until you're back: the revs and the starter from their pose, the fuel, the fish finder and its fish as they send them while they're aboard (the pose's `F`: none, and it reads empty, with no finder), the speed and heading as she goes, and the depth under her and the chart where she is, worked out here. On the low tier others' boats have no dash.
- The instruments are made with the boat, so the display's program is made with the rest of the load's.

## Device tiers

`portal.tier` sizes everything. On its own (`pnpm dev`), `?tier=low|mid|high` tries another tier.

| | low | mid | high |
|---|---|---|---|
| Who | the checks, weak phones | most phones | laptops |
| Shadows | none | one 2048 map ahead of the camera | two cascades (three's `SunLight`) |
| Lights at night | 4, diffuse only off the boat | 8 | 8 |
| Reef, fish | shorter range, fewer schools | fewer schools | Tidewater's |
| Spray particles | 1k | 2k | 4k |
| Extras | | air motes | air motes, sun shafts, refraction, bloom, the clouds' shadows |
| Raindrops | 1,400 | 3,200 | 6,400 |
| (M10) The rain's splashes | 300 | 1,200 | 2,400 |
| (M10) A blow's debris | none | 140 | 140 |
| (M11) Drips near the camera | 120 | 240 | 400 |
| (M11) Showers' curtains drawn | 6 | 12 | 12 |
| (M11) The boat's instruments (canvas, redrawn aboard) | 512 × 256, 4 a second | 1024 × 512, 6 a second | 1024 × 512, 6 a second |
| The sun under a grey sky | 30% | 30% | 70% (the clouds' shadows do the rest) |

The checks hold the low tier to its budgets: 150 draw calls, 300k triangles, 128 MB of textures and 150 MB of script memory. Mid stays under 1M triangles and high under 3M.

## Devices that draw on the CPU

The checks' browser has no graphics card, and some laptops don't either. `App.cpuGL` (from `probeCpuGL`) changes how loading works there:

- **Small, staggered drawing:**
  - The canvas is held to a phone's pixels.
  - The loading frame is 8 × 8 px and draws only the sky, the ground and the sea.
  - The rest (`_late`: the rocks, the village, the stalls and their traders, the lobster boat) waits out of the scene once its geometry is on the GPU (`uploadLate`). Its shaders are made after the start (`lateReady`), then it's revealed a group per frame.
- **Shaders compiled late:** every shader compiled before the start is load time, and All the Spaces' checks allow 45 s to `portal.ready()` on a machine much slower than most. Shaders not needed at once are compiled in `prepareLate`, after the start: the rod and its line, the speargun, the lobster gear, the cast net, the rain and the lightning, and the fish in the swimming fish's skin.
  - three's `compile()` also compiles the materials of hidden objects. So what waits is taken out of the scene, not just hidden (`heldTools`, `_heldFish`, `_heldNet`, `_heldWeather` (the rain, its splashes, (M11) the drips, the lightning), `_lateHeld`).
  - On two CPU cores, a phone upright is ready in about 7 s (v1.5.0: 10.6 s, when the tools and the late parts were only hidden and so compiled with the rest).
- **Shaders first used off the frame:** a program's first use (three looking up its uniforms) waits for the GPU to finish everything queued before it, the program's own linking too. That's seconds there, with the page frozen; a frame that first uses one freezes it too.
  - After the start, `App.useNewPrograms` first waits for a fence (`gpuCaughtUp`, looked at between frames as `pacedFrame` does), so the page keeps answering. Then it uses every new program once, in a tick of `pacedFrame` that draws nothing, so the asking doesn't wait behind a frame.
  - What it readies stays out of the scene, or held back, until then: `readyToDraw` (`readyOffstage` for what's shown already: the wildlife, the debris), the parts in `prepareLate` (all at once, one wait), the plants, Joe and Marta, the records board, the other players' figures.
- **Heavy builds in workers:** the debris, the fish models and the reef's noise are built in workers, so their garbage stays out of script memory.
  - All the Spaces builds inline workers as module workers, which don't start in its sealed frame. `ClassicWorker` starts them as classic workers instead.

## Testing

- `pnpm test`: the game's logic (and the boat in the wind, and the tow, and the fish in the weather, and (M10) the fight and the cast in a blow), the island's day (the clock, the stalls' hours and shutting for the weather, the wanted lists), (M10) the hull (the real boat in the CPU's sea: its wear in a gale, aground and on the piles, the bilge, the engine, Marta's repair), (M11) the cover map (its heights and kinds, what's under it, the seams closed between the pier's planks) the listener's surroundings, and the drips (the eaves it shows, the palms, the wheelhouse and what each lands on, how hard it drips, each drop heard once, as it's drawn landing), the weather (and its rain, thunder, strikes and murk), the waves (a gale's sea, the biggest surf), the reef and fish, the spearfishing, the cast net and bait (and the surf's runners), the whale and the spray, under Node. It also checks that the baked terrain matches its generator and that every asset has a licence.
- Two players on one machine: `pnpm dev`, then `/tools/two-players/?name=Robin` and `?name=Sam` in two windows of one browser (`tools/two-players/`: a stand-in for the app and its realtime room).
- All the Spaces' checks, from its checkout: `node packages/qa-browser/src/cli.ts check ../salt-life`. Run them from an up-to-date `main` there.
- `qa/script.json` is what the checks play. (M10) It ends with the weather: a shower at noon and a thunderstorm at dusk, picked in the clock's menu (T, the arrows, Space: the checks play on their own, so a pick holds) and then rested to, so the clock jumps and the weather's all there at once. The checks judge the low tier's draw calls, triangles and memory there; their frame time isn't judged (on their machine `pacedFrame` holds it to the display's).
  - The clock's menu takes each key press of a frame in turn (`Input.presses`), so on a slow frame none is lost or merged.
