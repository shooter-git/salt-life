# How Salt Life is put together

Salt Life is [Tidewater](https://github.com/dgreenheck/tidewater) rebuilt as an All the Spaces creation.

- **What carried over:** its game logic, physics and procedural geometry, ported with little change.
- **What was rewritten:** its WebGPU drawing (WGSL materials, compute, storage buffers, GPU readbacks), for three.js and WebGL 2.
- **What was left out:** the systems that only made sense on a strong graphics card. These are the ocean FFT, the wake and shore simulations, GTAO, TAA, motion blur and the lens effects. Tidewater's history in this repository keeps them.

## Start-up

`src/main.js` connects to All the Spaces (`connect()` from `@allthespaces/portal`), then hands the portal to `App`:

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
  - The name goes by a thunderstorm first, then the wind, then the rain and the cloud (`nameOf`).
  - The swell comes from the storm ahead (storminess 3 and 6 hours on), so the surf builds before a blow.
  - The surf's period: a storm's own swell is short (7.5 s in a gale), a swell from one still on its way long (up to `PERIOD_MAX`, 12 s), and by then smaller (`GROUNDSWELL_MAX`, 0.4 m, at the longest). Fair's is 9 s.
  - Only `+ − × ÷` and integer hashes: every device works out the same condition from the same time.
  - Day 1 is fair, and the forecast comes in over the first hours of day 2 (a new player's first morning; the checks start there).
  - **Fair is the island as it always was:** 7 m/s of wind from the trades' direction, today's sea, surf (9 s), cloud and light, and dry.
  - **The lightning's strikes** come from the real second and how thundery it is (`strikeIn`): in each second, a strike or none (at most `STRIKE_RATE`, one every 6 s or so in a full thunderstorm), where (from the island's middle, mostly up the trades until the storm's overhead, near ones rare), and whether it comes down as a bolt (a third do). Everyone on one clock sees the same strike at the same moment, whatever their island clock (held, or resting).
- **What it drives** (`WeatherDriver`):
  - the wind, `G.windSpeed` and `G.windDir`: the plants, the village's flags and lanterns, the sea's gusts, slicks and windrows, the spray, the boat, the sound. The birds drift in no more than 10 m/s of it. Its direction turns about the trades' (`G.windPrevailing`), at most 0.003 rad a second:
    - the wind sea turns with it about the camera (`Waves.setWindDir`): each wave's phase is moved so that at the camera it's where it was (turned about the island's middle, the crests far from it would sweep past);
    - the slicks and windrows turn in a frame moved to the camera as it turns (`SeaDetail`, `seaDetailFrame`), and the whitecaps drift on the gusts' integrated offset;
    - the sand's ripples, the grass's comb and the clouds aloft keep to the trades' direction (they're laid by the usual wind, and the clouds' evolution runs along theirs);
  - the open sea (`Waves.setSea`): the swell's and the wind sea's heights, the wind sea growing as wind^1.5. Only the heights change, in place on the CPU and the GPU, so the sea builds where it is; the CPU's heights take more fixed-point steps on a steep sea;
  - whitecaps (`WaterSurface`): in a wind over fair's, Monahan's share of the sea breaking white, as patches along the crests near by and scattered further off. A uniform behind a branch: nothing is drawn for them on a fair day;
  - the surf (`ShoreWaves.setSurf`): its height, up to `SURF_MAX` (0.6 m: bigger, the sets break on the pier head and over the boat at the dock), and its period. Its run-up goes as the root of its height and in proportion to its period (Stockdon), so it never reaches the boardwalk (`test/waves.mjs`). The waves run on a clock (`ShoreWaves.clock`, the GPU's `shoreClock`) that's re-anchored whenever the period changes, counted from the bay's middle: every wave carries on, only the crests' spacing changes. The period changes at most 0.02 s a second, so the crests on their way in are hurried by no more than a few percent; the surf's sound and the shorebirds' swash take the same clock;
  - the cloud (`SkyProClouds`): its cover, and how grey it is (`overcast`: denser, its bases everywhere, darker below). Slow changes are followed by the panorama's progressive refresh and the view's history; only a step (a jump of the clock) makes a new panorama;
  - the light (`Sky.overcast`): the sun dims under a grey sky (to 30% of a clear day's on low and mid; to 70% on high, where the clouds' shadows dim the rest), and the sky's light greys and rises a little;
  - how far you see (`Sky.visibility`): the tier's fog distances, nearer in murk;
  - the horizon: under a grey sky the fog greys, to a grey of the horizon's brightness, and the sky's dome takes the same grey toward its horizon (`skyGrey`, in the view and in the reflections), so the two meet without a seam;
  - the sound: the wind and the palms louder in a gale, the surf's waves louder as the root of the swell, and its far roar building faster;
  - (M9) the rain (`G.rain`: the streaks, the rings on the water) and how wet it's left everything (`G.wet`: soaked in seconds of a downpour, dry over four minutes once it's stopped);
  - (M9) rain's deck (`SkyProClouds.storm`, `Sky.storm`): its base 1.9 km lower, smoother below and darker, no cirrus above it, and no sun through it; of the sun it takes, half comes down through the cloud as the sky's light (`DECK_DIFFUSE`), and the eye adapts to a grey sky as a camera would;
  - (M9) the caustics on the seabed, faint under a grey sky and gone under rain's deck (`G.caustics`: the terrain's and `Underwater.js`'s), and the underwater fog dimmer under cloud;
  - (M9) the weather on its way, up the trades (`SkyProClouds.front`): the cover 12, 24 and 36 km upwind (and 12 km downwind) is the forecast's 1.5, 3 and 4.5 hours on, and the cloud's lead (a front comes in at 8 km a game hour, `FRONT_KMH`), against the cover here. The clouds' march reads it along the wind (`scFrontAt`, its largest rise bounding the empty cells), and so does the high tier's shadow map: a front's bank darkens the horizon before it's overhead;
  - (M9) the gusts: the cat's paws the sea shows (`SeaDetail.gustAt`, the same texels and drift on the CPU) raise and drop the wind by 22% either way, more in rain and squalls (`GUSTS`), where the boat is (`BoatController.windAt`) and where you're listening (the wind's and the palms' sound). A squall's downdraught freshens the wind while it passes (`SQUALL`, at most a gale's).
- **Easing:** the wind and the sea come round over half a minute or so, the cloud more slowly (a minute or two from fair to a gale's), the rain in seconds. The cloud follows the weather 0.6 game hours on (`CLOUD_LEAD`), so a shower's cloud is over before it rains. A jump of the clock (a rest, adopting the host's clock, coming back to the tab) sets it all at once, and the boat takes the sea as she finds it.
- **What stays as it was:** the swell's direction (its travel times around the island are baked when the island loads: [docs/M10.md](M10.md)).
- **The rain** (`src/fx/Rain.js`): drops falling through a box that wraps around the camera, as the air motes do (a hash of the instance, no simulation), in one instanced draw: 1,400 on low, 3,200 on mid, 6,400 on high. Each falls at its size's speed (four sizes, eighths of 9 m/s, so each wraps whole) and is carried by the wind near the ground: a squall drives it slanting. It's drawn as the streak a moment's look leaves, at least a pixel or so across. How hard it rains is how many fall. They're lit by the sky, a glint of the sun against the light, and the lightning. None under the ground or the sea, or under the wheelhouse roof (`BoatModel.shelter`, a box in the boat's frame), or with the camera under water.
- **The rings** (`WaterSurface`, `waterRainRing`): a ring spreading from each drop, in two layers of cells, as the slope of the sea's ripples within 45 m of the camera; the drops beat the wind's ripples down. Nothing's added on a dry day (a uniform branch).
- **Wet surfaces** (`src/materials/Wet.js`): every lit material that `App.lightUp` gives the local lights gets wet too (`useWet`: the `WET_SURFACES` define). In three's lighting chunks, just before the lights read the surface, `G.wet` darkens what faces up and glosses it (the materials that rewrite their emissive or their lights keep their code and still get wet).
- **The lightning** (`src/sky/Lightning.js`):
  - It looks at each second's strike once (`Weather.strikeIn`, with the eased thunder and the wind's direction).
  - A flash is two to five return strokes tens of milliseconds apart, each fading in 50 ms. The brightest flash lights the cloud from inside about the strike, brightest where it's thickest, and the murk toward the horizon (`skyFlash`, in the sky's main view on every tier: the panorama's and the trace's clouds alike). It lights the island from the sky too (the hemisphere light, bluish white; the eye adapted to the dark at night makes the most of it) and the rain.
  - A ground strike's bolt is built when it strikes: a main channel stepping down from the cloud's base in jagged runs, with branches that peter out and a few streaks under the base. It's drawn as ribbons a few pixels across in one draw, unfogged, dimmed by the rain's murk, and drawn nearer (as large in view) past 9 km, inside the camera's far plane.
  - The thunder reaches each listener its own distance at 343 m/s after (`onThunder( strike, distance, direction )`): a near crack within 3 km, a far rumble beyond, placed the way it came, dulled and slowed the farther it's come (`SoundScape.thunder`).
- **The rain's sound** (`SoundScape`): a light shower's patter, a downpour's roar (crossfaded by how hard it rains), and aboard (on deck or at the helm) rain drumming on the boat, the rain beyond her quieter. Field recordings (CC0), built by `tools/audio/build-weather.mjs`.
- **The fish in the weather** (`Bites.weatherMood`, `habitat.weather` from `Game.habitat()`): none of it on a fair day, which bites exactly as before.
  - Ahead of a blow (`front`) the bites come up to 35% sooner and the big ones feed too (`rollWeight` skews less to the small end).
  - Under a grey sky by day each fish bites up to 60% of the way toward how it does at dusk, when that's better: the predators hunt.
  - A downpour or a thunderstorm puts them down: up to 80% slower.
  - A big surf stirs up the shallows (half as rich) and round the pier (a third less); a blow out on the open sea, the deep (40% less).
  - Their own taste (`weather` in `FishTable.js`): mahi and blackfin tuna up on the wind lines in a blow, tarpon rolling in the rain, bonefish off the flats in a big surf and a wind.
- **Joe and Marta in the weather:** they shut for a gale or a thunderstorm (`Orders.shutFor`), whatever the hour. Whoever's being served finishes first; Joe's night box and the diesel on Marta's honesty box stay out; their "Closed" boards, prompts, panels and the clock's menu say they've shut for the weather.
- **Joe's forecast slate** (`ForecastSlate.js`): chalked beside his wanted list (hung from it, so it goes up with it): the weather now and its rain, the wind in knots and where it's from, the surf, what's coming, and "Fish feeding: a blow's coming" when the front's on its way.
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
- **The fish notice the diver** (`Fish.wary`, `WARY`): the faster the diver comes, the farther off they react, and a fright keeps them warier a while (`SPOOKED`). Frightened groupers tuck in at their coral head. Jacks, barracuda and mahi come to look at a diver keeping still (`curious`).
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
| The sun under a grey sky | 30% | 30% | 70% (the clouds' shadows do the rest) |

The checks hold the low tier to its budgets: 150 draw calls, 300k triangles, 128 MB of textures and 150 MB of script memory. Mid stays under 1M triangles and high under 3M.

## Devices that draw on the CPU

The checks' browser has no graphics card, and some laptops don't either. `App.cpuGL` (from `probeCpuGL`) changes how loading works there:

- **Small, staggered drawing:**
  - The canvas is held to a phone's pixels.
  - The loading frame is 8 × 8 px and draws only the sky, the ground and the sea.
  - The rest (`_late`) is revealed a group per frame after the start.
- **Shaders compiled late:** every shader compiled before the start is load time. Shaders not needed at once are compiled in `prepareLate`, after the start: the rod and its line, the speargun, the cast net, and the fish in the swimming fish's skin.
  - three's `compile()` also compiles the materials of hidden objects. So what waits is taken out of the scene, not just hidden.
- **Shaders first used off the frame:** a program's first use (three looking up its uniforms) waits for the GPU to finish everything queued before it, the program's own linking too. That's seconds there, with the page frozen; a frame that first uses one freezes it too.
  - After the start, `App.useNewPrograms` first waits for a fence (`gpuCaughtUp`, looked at between frames as `pacedFrame` does), so the page keeps answering. Then it uses every new program once, in a tick of `pacedFrame` that draws nothing, so the asking doesn't wait behind a frame.
  - What it readies stays out of the scene, or held back, until then: `readyToDraw` (`readyOffstage` for what's shown already: the wildlife, the debris), the parts in `prepareLate` (all at once, one wait), the plants, Joe and Marta, the records board, the other players' figures.
- **Heavy builds in workers:** the debris, the fish models and the reef's noise are built in workers, so their garbage stays out of script memory.
  - All the Spaces builds inline workers as module workers, which don't start in its sealed frame. `ClassicWorker` starts them as classic workers instead.

## Testing

- `pnpm test`: the game's logic (and the boat in the wind, and the tow, and the fish in the weather), the island's day (the clock, the stalls' hours and shutting for the weather, the wanted lists), the weather (and its rain, thunder and strikes), the waves (a gale's sea, the biggest surf), the reef and fish, the spearfishing, the cast net and bait, the whale and the spray, under Node. It also checks that the baked terrain matches its generator and that every asset has a licence.
- Two players on one machine: `pnpm dev`, then `/tools/two-players/?name=Robin` and `?name=Sam` in two windows of one browser (`tools/two-players/`: a stand-in for the app and its realtime room).
- All the Spaces' checks, from its checkout: `node packages/qa-browser/src/cli.ts check ../salt-life`. Run them from an up-to-date `main` there.
- `qa/script.json` is what the checks play.
