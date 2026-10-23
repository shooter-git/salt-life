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
2. Input.
3. The boat's physics (`BoatController`).
4. The player (`Player`: walking, swimming, on deck or at the helm), then the fishing game (`Game`).
5. The sky.
6. The CPU water queries (`WaterQuery`: Gerstner waves plus the shore waves). They give heights for the boat, the swimmer, the bobber and the birds.
7. Everything else (plants, reef, fish, wildlife, spray, sound).
8. The drawing, through the SDK's `createStage`. On high it also goes through `PostChain`.

## Where things are

| Folder | What's in it |
|---|---|
| `src/core` | Globals (shared uniforms such as `G.time`, `G.sunDir`, `G.night`), input, saving (`SaveStore`: `portal.save.personal`), the CDLOD grid, `ClassicWorker`, `ReleaseAfterUpload` |
| `src/world` | The island: terrain, village, pier, rocks, plants, debris, reef and fish, wildlife, the whale, the boat model, colliders, the layout (`WorldLayout`) |
| `src/ocean` | The sea: Gerstner waves, shore waves, the water surface and its detail, the wake, the CPU water queries |
| `src/sky` | Atmosphere, clouds, the sun and moon, the environment map |
| `src/materials` | Shader pieces shared by many materials: local lights at night, the clouds' shadows (high), height haze (three's fog chunks, replaced), underwater light, LOD fades |
| `src/player` | The player, the boat's physics, the bow spray |
| `src/game` | The fishing game: the rod, bites, the fight, the catch card, the cooler and log, the stalls, Joe and Marta, the HUD, the minimap, the guide |
| `src/fx`, `src/post` | Spray, marine snow, air motes; the high tier's post chain and sun shafts |
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
  - Their boat shows its lamps (below): lit as under way when they're at the helm or away from the dock, and their searchlight when the pose says it's on (`S`).
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

**The stalls keep hours** (`Orders.HOURS`): Joe from 5 am to 7 pm, Marta from 7 am to 7 pm.

- Out of them the trader has gone home (`Vendor.setOpen`: not drawn), and their minimap marker greys.
- A "Closed" board is out while they're away, saying when they're back and what's left out (`ClosedSign.js`: one plane drawn on a canvas, sharing the records board's program). Joe's is propped on his counter; Marta's leans on the front of her table.
- Joe's stand has his night box. It pays 70% of his price (`NIGHT_BOX`), and his wanted list in full.
- Marta's chandlery has diesel on the honesty box, so nobody is stranded at sea; the gear waits for her.
- Whoever is serving you at closing time finishes with you first. In their last ¾ hour they say so in their panel.

**The wanted lists** (`src/game/Orders.js`):

- Each morning Joe wants two fish: one of dusk, dawn or the dark (yellowtail, jacks, tuna or tarpon) at double, and one more at half as much again. Marta buys one kind of bait fish at a set price.
- The list comes from the day alone (`ordersFor(tradeDay)`), so everyone on one clock sees the same list and nothing is sent. It runs from Joe opening at 5 am until he opens the next morning, so a fish caught after dark counts, left in his night box.
- Each order takes a few fish from each player (3 for Joe's, 4 for Marta's); the biggest fill it first (`GameState.quote`). What you've filled that day is saved with your progress (`orders`).
- Joe's list is chalked on a slate on his counter (`WantedBoard.js`, one plane drawn on a canvas, sharing the records board's program), with where and when each fish bites. Your own ticks show on it.
- It's also in Joe's and Marta's panels, and a tag in the cooler and on the catch card marks a fish someone wants. A sale says how many went to the list, in its usual line.

**The week's order** (`src/game/WeekOrder.js`): a restaurant on the mainland orders one kind of fish through Joe, so many kilos by the end of the week, and everyone in the group fills it together.

- **Real weeks:** it runs from Monday 00:00 UTC to the next, the same for everyone wherever they are, and comes from the week alone (`weekOrder(now)`). The kinds come round in turn (red snapper, grouper, mahi-mahi, tuna, yellowtail, hogfish), never the same two weeks running. The kilos are about twelve fish of the kind; the bonus is half of what that would fetch at Joe's price, and at least $200.
- **Filling it:** every one of those fish sold to Joe, or left in his night box, goes toward it and fetches half as much again (`WEEK_MUL`), or the day's list's price if it's on that too. The biggest go first, and the fish that fills it counts whole. The cooler and the catch card tag the fish it would take.
- **The tally** is the group's (`'weekOrder'` in the shared save: Playing together, above): who brought how many kilos. On its own the game keeps it in the stand-in's storage, so a player alone fills it alone.
- **Getting paid:** once it's filled, the bonus is shared by what each player brought. Joe pays your share when you next come to his stall while he's in. The last filled week's tally is kept for whoever hasn't collected yet, and your save records the last week you were paid for (`weekPaid`).
- **Where it shows:** under the day's list on Joe's slate (the fish, the group's kilos and a chalk bar), and as a block in Joe's panel with the bonus, the days left and what you've brought. A sale toward it says so in its usual line. Nothing else is a toast.

**Tarpon under the pier lights:** after dark the pier's lamps draw the tarpon (`lights` in `FishTable.js`).

- Their bites under the pier double while the lamps are lit (`Bites.lampsLit`, `Bites.pickSpecies`), and Joe's hint says to fish there.
- The bay's tarpon swim to the pier head once the lamps come on and back to the bay by day (`night` on their group in `world/Fish.js`; the app sets the lamps' state on the fish each frame).

## The boat at night

`src/world/boat/BoatLamps.js` gives each boat (yours, and each copy of someone else's) the lamps a boat shows at night:

- **Navigation lights:**
  - Under way: the red sidelight to port, the green one to starboard, the white masthead light ahead and the white stern light. Each is seen only from its own arc, as at sea, so you can tell which way a boat is heading.
  - Moored: one white anchor light at the masthead, seen all round.
  - They're glowing points a few pixels across at any distance, all in one draw.
- **The searchlight** (L at the helm, or the Searchlight button): a beam in the night air, its lens glaring when it points at you, and a spot in the local lights.
  - The sea takes the local lights in its own way (`LOCAL_LIGHTS_WATER` in `WaterSurface`). Beams light a pool on the water; a lamp's light on it is mostly its glints.
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

The checks hold the low tier to its budgets: 150 draw calls, 300k triangles, 128 MB of textures and 150 MB of script memory. Mid stays under 1M triangles and high under 3M.

## Devices that draw on the CPU

The checks' browser has no graphics card, and some laptops don't either. `App.cpuGL` (from `probeCpuGL`) changes how loading works there:

- **Small, staggered drawing:**
  - The canvas is held to a phone's pixels.
  - The loading frame is 8 × 8 px and draws only the sky, the ground and the sea.
  - The rest (`_late`) is revealed a group per frame after the start.
- **Shaders compiled late:** every shader compiled before the start is load time. Shaders not needed at once are compiled in `prepareLate`, after the start: the rod and its line, and the fish in the swimming fish's skin.
  - three's `compile()` also compiles the materials of hidden objects. So what waits is taken out of the scene, not just hidden.
- **Heavy builds in workers:** the debris, the fish models and the reef's noise are built in workers, so their garbage stays out of script memory.
  - All the Spaces builds inline workers as module workers, which don't start in its sealed frame. `ClassicWorker` starts them as classic workers instead.

## Testing

- `pnpm test`: the game's logic, the island's day (the clock, the stalls' hours, the wanted lists), the waves, the reef and fish, the whale and the spray, under Node. It also checks that the baked terrain matches its generator and that every asset has a licence.
- Two players on one machine: `pnpm dev`, then `/tools/two-players/?name=Robin` and `?name=Sam` in two windows of one browser (`tools/two-players/`: a stand-in for the app and its realtime room).
- All the Spaces' checks, from its checkout: `node packages/qa-browser/src/cli.ts check ../salt-life`. Run them from an up-to-date `main` there.
- `qa/script.json` is what the checks play.
