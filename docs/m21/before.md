# M21, step 0: the code the gear touches

Surveyed 2026-11-16 on `m21` (v2.6.0, `47c1351`, and M21's first commits). Nothing here was changed. It's for the GEAR stream: each rod and reel drawn as itself, in your hands, on other players' copies and in the boat's holders ([M21.md](../M21.md)).

## What's drawn now

Three models stand for every rod and reel (`FishingRod.setGear`):

| Model | Where it's built | What it's shaped after | When it's drawn |
|---|---|---|---|
| The spinning rod | `FishingRod.js`' `buildRodGeometry` | A 7 ft (2.13 m, `ROD_L`) carbon spinning rod, split EVA grip, eight guides, and a 3000-size spinning reel with moss-green braid | Anything cast: your light tackle, whatever rod and reel it is |
| The stand-up rod | `rigs/BigRod.js` | A 6 to 7 ft 50 lb class rod (glass blank, hard-EVA fore-grip, aluminium gimbal butt, six roller guides) and a gold two-speed lever-drag reel (a Penn International 50 or a Tiagra 50W) | Trolling, the kite, the deep-drop and the chair, if you own it (`standUp`) |
| The fly rod | `rigs/FlyRod.js` | A 9 ft saltwater fly rod with a large-arbour disc reel | The fly rig, any weight |

- **Which one** comes from `Rigs.rodGear`: your heavy tackle for the troll, the kite, the deep-drop and the chair; otherwise your light tackle, which is at most the 9 ft surf rod and the conventional reel (`Gear.LIGHT`, `tackleOf`). That's why the stand-up rod hasn't been seen when casting since M19.
- **Nothing else varies:** the hand-me-down, the 7 ft graphite and the 9 ft surf rod are one model; so are the old and the smooth spinning reels and the conventional; the 80-class, the 130-class and the electric reel have none of their own. The fly rod's one model serves 8, 10 and 12 weight.
- **Their size:** the stand-up rod is about 8,400 triangles and 0.9 MB of geometry, the fly rod about 9,400 and 0.7 MB (measured in Node).

## How they're drawn

- **One merged mesh a rod**, its reel in it, in the rod's own material (`createRodMaterial`, a prop material). All three use it, so there's one program between them.
- **The moving parts are tagged** in `aux.w` and moved in the vertex shader: 1 the rotor, 2 the bail, 3 the crank, 4 the spool and the drag knob, 5 the braid on the spool (its radius follows the line left).
- **The shader's pivots are constants:** the reel's axis (`REEL_Z`, 0.092 m under the blank), the crank's shaft (`BODY_Y`), the bail's pivots (`PIVOT_Y`), the braid's least radius (0.0205 m), where the blank starts to bend (`BLANK_START`) and the rod's length (`ROD_L`). The stand-up rod's reel was built with its crank on the same shaft for that reason.
  - So every new reel's moving parts must sit on those axes; or the constants become uniforms, set per rod.
  - That changes the program's source. The rod's mesh is in the scene, hidden, from the start, and the load's compile builds hidden meshes' programs (KIT found the same with the landing net), so it's very likely one of the sixteen built before ready. A change to it needs the ready A/B.
- **Another length** is drawn as the fly rod is: built at its real size, and drawn `ROD_L` long along the blank (`FLY_K`), the hand's matrix stretching it back. The bend follows the whole length.

## On other players' copies

- `FishingRod.copyMeshes` gives each copy a rod (the spinning rod's geometry, or the fly rod's), a bobber, a line and (M20) a net, each with its own material (the same program).
- The pose (`Together._mine`) sends the rod's state (`r`), the bobber (`b`), the net (`Ln`) and the fly rod's weight (`fw`). Nothing says which rod or reel.
- `Together`'s copy switches to the fly rod's geometry when `fw` comes (`T.flyFit`).

## In the boat's holders

- **Your spread** (`Rigs._drawLine`, in `RigMesh`: one mesh written each frame while anything's out) draws each rod in its holder as a tapered dark tube, bowed toward its line with a fish on, and its reel as a short gold cylinder.
- **On a copy of someone's boat** (`Spread.js`) it's the tube alone, straight.
- **The holders** are the boat's own (`Rigs.spots`, `Spread.rodOf`): their place and angle on each boat.

## The line

- The line in the air and on the water is `FishingRod`'s `lineMat`: one colour for mono, the fly line's for a fly (`FLY_LINE_COLOR`).
- The line on the spool is part of each reel's geometry (the spinning reel's is moss-green braid).

## The deck hand

- **Drawn as:** `figureStandIn()` (`together/Figure.js`), a grey low-poly figure in the avatars' material, its limbs never posed (arms hanging, not on the wheel). Placed at `helmEye` less 1.62 m (`Mate._show`), not at the helm's `stand` (the sportfisher's "where a figure's seen at it, clear of her seat").
- **Seen:** only while he has her helm (`Mate.update`: `figure.visible = helmsman === 'mate'`). Hired or not otherwise makes no difference to what's drawn.
- **On copies:** `Together._mate` builds the same stand-in on her copy when her pose carries `Mt` (her mate at her helm), at her `helmEye`.
- **What's there to build from:**
  - `App.loadPerson( url, clips )`: someone built as the traders are from one of the islanders' models, readied before drawn (Pearl's boatman: `player-m2`, `idle_neutral_01`, loaded within 220 m of him);
  - `Together._loadLook( look )`: the players' looks, each loaded once and shared by every avatar wearing it. A mate in `player-m1` could share it with a player who chose that look;
  - the players' models carry `idle_neutral_01`, `trolley_idle` (both hands on a wheel), walking, running, holding a rod up, a cheer and a wave (`tools/characters/README.md`). 512² textures on every tier, 2.3 MB for `player-m1`.
- **His places on her:** her helm (`SportfisherModel.helm`, on the bridge, `stand: [0, 0.02]`) and a spot in her cockpit clear of the chair (`CHAIR_Z`), the boarding point (`boardPoint`, z −3.75) and the rod holders: to be picked in the build.

## What the stream will have to watch

- **No download:** every model built in code (GeoKit), as these are.
- **Memory:** about 1 MB of geometry a rod and reel together, built the first time it's seen (yours and each copy's), and shared between copies that hold the same.
- **Nothing more before ready:** the new models built when first wanted, not in the scene at the load.
- **The rod's program:** the same one for all, so no new programs; if its source changes (the pivots as uniforms), the ready A/B.
- **Draw calls:** a rod and its reel drawn as one mesh, or as two in the same material (one more draw a rod).
- **The pose:** two small numbers more (the rod and the reel in your hands), and the line's.
