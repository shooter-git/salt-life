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
1. The clock (`settings.timeOfDay`, advanced by `timeSpeed`).
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
| `src/materials` | Shader pieces shared by many materials: local lights at night, height haze (three's fog chunks, replaced), underwater light, LOD fades |
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
  - Each player is one of four Rocketbox islanders (`Avatar.js`), always the same one for the same person. Each has their name over them in their colour and a dot on the minimap.
  - Their boat is a copy of yours that shares its meshes and materials. When both boats are at the dock, yours stands in for theirs.
  - Their rod, line and bobber are the rod's (`FishingRod.tackle()`).
  - Each device draws only the nearest few players and boats.
- **The clock:** one time of day for everyone, kept in the shared value `'clock'` as `{ at, hour, speed }`.
  - The host sets it if there's none.
  - T changes it for everyone.
  - Each device works the hour out from the time of day on its own clock.
- **Catches:** a landed fish is a `'catch'` message to the others.
  - They see a toast and hear the player cheer.
  - The fish hangs on the player's line for a moment.
- **The island's records:** each species' heaviest fish, with who caught it and when.
  - They're kept in the group's shared save (`portal.save.shared`, key `'records'`), so they last between visits.
  - A catch updates them with `update`, which retries when two saves cross.
  - The catch card says when a catch is the island's heaviest yet.
  - The records are chalked on a board beside Joe's stand (`RecordsBoard.js`, a canvas) and listed in the cooler.

Everyone keeps their own progress and their own fish.

## Device tiers

`portal.tier` sizes everything. On its own (`pnpm dev`), `?tier=low|mid|high` tries another tier.

| | low | mid | high |
|---|---|---|---|
| Who | the checks, weak phones | most phones | laptops |
| Shadows | none | one 2048 map ahead of the camera | two cascades (three's `SunLight`) |
| Lights at night | 4, diffuse only off the boat | 8 | 8 |
| Reef, fish | shorter range, fewer schools | fewer schools | Tidewater's |
| Spray particles | 1k | 2k | 4k |
| Extras | | air motes | air motes, sun shafts, refraction, bloom |

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

- `pnpm test`: the game's logic, the waves, the reef and fish, the whale and the spray, under Node. It also checks that the baked terrain matches its generator and that every asset has a licence.
- All the Spaces' checks, from its checkout: `node packages/qa-browser/src/cli.ts check ../salt-life`. Run them from an up-to-date `main` there.
- `qa/script.json` is what the checks play.
