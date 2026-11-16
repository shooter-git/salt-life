# M21, the deck hand: the sportfisher's mate as one of the islanders

Stream DECK HAND of [M21.md](../M21.md), built 2026-11-16 on its own branch from `m21` (`d676d0c`), beside GEAR. The user's calls ([M21.md](../M21.md#the-deck-hand-the-users-2026-11-16)): the mate hired for the sportfisher (M19) looks like one of the game's people, the islander in a polo shirt and shorts (`player-m1`), on the players' clips; and he's aboard whenever she's out with him, standing in her cockpit and at her helm while he backs her down, on your game and on everyone else's.

## Before

- **Drawn as** the grey stand-in a player is drawn as while their look loads (`figureStandIn`), its arms hanging, and only while he had her helm.
- **Placed** at her helm's eye less 1.62 m, not at its `stand`.
- **On copies** the same stand-in at her helm, by her pose's `Mt: 1`.
- **Not lit as the stand-ins are:** the load readies the stand-in's program on one lit by `lightUp` (`Together.compile`). His wasn't lit, so it wasn't the program the load had readied.

## What was built

`game/rigs/Mate.js`:
- **`Deckhand`**, him seen: a group named `Deckhand` in her model (or in her copy), at the spot he's at, facing as he should. In it the stand-in until his look is in, then his look. One class for your game and for copies (`Together._mate`), so both draw the same man in the same places.
- **`deckhandLook( app )`**, his look's model, loaded once for every deck hand drawn:
  - from a player already wearing `player-m1` (Together's looks, already lit, compiled and uploaded) when there is one;
  - otherwise by `App.loadPerson`, as Pearl's boatman is: lit (`lightPerson`), its programs compiled and first used and its textures uploaded before it's drawn, the clips but his two let go, its shape on the GPU alone.

  Each deck hand is a skinned clone of it (`SkeletonUtils.clone`): its own skeleton and clips, its shape, materials and textures shared.
- **`Mate.where`** (`'helm'`, `'cockpit'` or null), **`Mate.aboard`** and **`Mate.wire()`**, for the pose.
- **`mateSpot( model, where )`**: where he stands on her.
- **`mateWire` and `mateRead`**: her pose's `Mt` both ways.
- When he takes her helm, her bridge's wheel and lever move under his hands (`helmInUse`), not the tower's if that was the last helm you took. How he steers her (`mateHelm`, `MATE`) is unchanged.

Elsewhere:
- `SportfisherModel.mateSpot`: his place in her cockpit, and at her helm (`helm`, with the wheel's `grips`). It's a new field; nothing of hers moved.
- `Together`: `Mt` in your pose from `Mate.wire()`, read by `mateRead`; `_mate` draws a `Deckhand` on her copy.
- `BoatCopies._template` leaves a group named `Deckhand` out of a copy made from your boat, as it leaves out her lamps and her name. Your boat is the template for her type: without it, a copy of someone else's sportfisher made while your mate was aboard would have carried a clone of him, skinned to your mate's bones.
- `App.loadCharacters` says when Joe's and Marta's looks are in (`_peopleIn`).

## Where he stands, and why

**In her cockpit** (`mateSpot`: x 1.6, y 0.5, z −4.0, facing aft and 31° inboard): its forward corner to port, his back to the mezzanine's box.
- **Clear of the chair:** 1.7 m from it. A swivelling chair and its footrest sweep about 0.6 m round it.
- **Clear of where you're put aboard** (`boardPoint`, on her centreline at z −3.75): 1.6 m.
- **Clear of where you walk:** 0.48 m outside the width of the step down from the mezzanine (±1.12 m), which is how you come into her cockpit from the house, the ladder and the side decks. Walking about her cockpit goes round the chair, aft of him.
- **Clear of the rod holders:** 0.76 m from the nearest (the forward pair, on the covering boards at z −3.6), and inboard of them. Rods in them lean outboard and aft (`Rigs._place`), away from him.
- **Clear of her sides:** 0.49 m in from the cockpit's side, 0.39 m clear of the mezzanine's box behind him.
- **To port:** her transom door and the bridge ladder's foot are both to starboard, where fish come in over the transom and people go up and down.
- **Facing aft over the cockpit and the water astern**, where the lines and the fish are, as a mate stands.

**At her helm** (`mateSpot.helm`: x 0, z 0.15, on the bridge at 3.1 m, facing her bow as the helm does), on `trolley_idle` played back and forth, as the players' looks are at a helm.
- **The clip doesn't put the hands on a wheel.** Measured through the whole clip in `player-m1`, `trolley_idle` holds the wrists at the hips (0.9 m up, 0 to 0.1 m ahead of the body), as `idle_neutral_01` does. Drawn at the helm's `stand` (z 0.02) on it alone, his arms hung by his sides in the first renders.
- **So his arms are reached to the rim after the clip** (`Deckhand._grip`, `reach`): each upper arm and forearm solved as a triangle of their own lengths, the elbows a little out and down. The wrists go 5 cm shy of the rim at ten to two (`grips`: the wheel's 0.2 m rim as it's mounted, `wheelOf`), and the hand closes round it.
- **A step nearer the wheel than the `stand`:** from the `stand` the rim is 0.64 m from his shoulders, past his arm's 0.56 m. At z 0.15 it's 0.55 m. His toes are still 0.15 m short of the console's foot, and he's further from her seat than at the `stand`, which is "where a figure's seen at it, clear of her seat" (another player at someone's helm is drawn there).
- **Measured in the game on every tier:** each wrist within 5 cm of its grip (9 cm for the right hand on low, where its shoulder sits a little higher).

`test/mate.mjs` holds the spots to it on her low and high models:
- his feet on the sole there (`soleY`);
- a body clear of every solid collider of hers (0.22 m round in her cockpit, 0.25 m at her helm, so his toes are clear of her console);
- the distances above;
- at her helm, both grips on the rim and within an arm's reach of his shoulders.

## When he's aboard

- **Hired** (`stats.mate`, Marta's `sfMate`), **on the sportfisher** (the boat you're in), **and she's out**: neither made fast at her berth (`moored`) nor hauled out (`hauled`).
- **In her cockpit** then; **at her helm** while he has it (`helmsman === 'mate'`, as M19's helming decides); back in her cockpit when he hands her back.
- Not on any other boat. Swapping boats builds her again (`App.setBoat`), and he goes into the new model.

## The choices

- **Not aboard at her berth.** The user's words are "aboard whenever she's out with him", and he's paid by the day out, the first as she leaves her berth (M19's `_pay`). So he comes aboard as she leaves her berth, with his day's pay toast, and goes as she's made fast in it again. A mate does ready a boat at the dock, but drawn there he'd stand in her cockpit all day and all night, every day, and his look would load in the village for anyone with him hired, near where the start's memory is tightest. **For the user to change if they want him there.**
- **A cut, not a fade,** between her cockpit and her helm, and as he comes aboard and goes. Fading a skinned look means drawing it see-through: a program of its own (three's `OPAQUE` define differs), on materials he shares with any player in that look. A cut costs nothing. His clip changes with no crossfade, so he doesn't blend between poses while he jumps.
- **Nothing of him before the game's ready,** nor before Joe's and Marta's looks are in (`App.loadCharacters`, after `prepareLate` has readied the stand-in's program). Joe's and Marta's loading is the start's high point of script memory, so his doesn't pile onto it. A game that starts at sea with him aboard shows him a few seconds in: the stand-in first, then his look.
- **On low, drawn within 60 m of the camera**, as the traders are there (`App.nearDetail`'s 60). Elsewhere within 800 m, as far as another player's drawn (`Together`'s `PERSON_SEE`). His clip plays within 120 m; further off his pose holds.
- **Shadows on high only**, as the players' looks.
- **The stand-in, while his look loads or if it doesn't:** standing, or both arms out to the wheel at her helm. It's lit as `Together.compile` lit the one it readied the program on, so it's the program the load made.

## On other players' games

- **Her pose's `Mt`:** 1 is her mate at her helm, as M19 sent it, so an older game still draws him there. 2 is aboard in her cockpit; an older game reads nothing from it, as it did. Absent, he isn't aboard.
- **The pose's size:** `"Mt":2` is 6 bytes more while he's aboard, sent with the rest of the pose (at most ten a second). The biggest pose in `crew.mjs`' run with him aboard was 265 bytes, against the room's 16 KB a message (`tools/two-players/host.js`).
- **On a copy of her** (`Together._mate`), the same `Deckhand` in her copy's group, at the same spots, in the same look.
- **On a copy of yours,** she's drawn from another model, so she has her own deck hand (see `BoatCopies` above).

## What it costs

Measured by `tools/deckhand/look.mjs` in the real game, drawn on the CPU (SwiftShader). Each tier was measured once the start's loading was done (the whale in); his look was then loaded and drawn. The script memory is after a forced collection, so a few hundred kB either way is noise (mid read less after than before).

| | low | mid | high |
|---|---|---|---|
| Script memory | +1.1 MB | −0.4 MB | +0.8 MB |
| Draws, him in her cockpit | +3 (61 → 64) | +3 (120 → 123) | +10 (148 → 158) |
| Draws, him at her helm | +3 (19 → 22) | +3 (33 → 36) | +9 (61 → 70) |
| His programs | 1 (`opacity`) | 1 (`opacity`) | 3 (`body`, two `opacity`) |
| Textures three holds | +9 | +10 | +13 |

- **Draws:** his look is three meshes (body, head, hair and lashes), so three draws. On high he casts shadows as the players do, which adds his shadows' draws.
- **Programs:** every one compiled by `loadPerson` before he's first drawn, after ready. The rest of the new programs in each reading are things the shots' cameras saw for the first time (the wreck, the village's awnings, the lighthouse's glass), not his.
- **Textures:** his are seven at 512² (`player-m1`'s, one file for every tier), about 10 MB on the GPU uncompressed with their mipmaps. Its body, head and hair are 7,440 triangles, about 0.3 MB.
- **Script memory** holds his two clips' keyframes (`loadPerson` lets the other five go), his skeleton's 80 bones and the template's. His shape's arrays go once they're on the GPU.
- **If a player in the session wears `player-m1`,** he's a clone of their model, so nothing more but his skeleton.
- **Before ready: nothing.** Nothing of him is made before the game's ready and Joe's and Marta's looks are in (`test/mate.mjs` holds it). So the 16 programs before ready are as they were by construction; the ready A/B is the merge check's.
- **The download is unchanged:** `player-m1.glb` was already there for the players.
- **The pose:** 6 bytes while he's aboard (`"Mt":2`).

## Checked

- **`test/mate.mjs`** (in `pnpm test`):
  - his spots on her low and high models (above);
  - where he is through the states: not hired, hired at her berth, out, a fish on with you on her deck, the fish off, hauled out, in another boat;
  - her pose's `Mt` both ways, with an older game's `Mt: 1` drawn at her helm and anything else nothing;
  - the `Deckhand` on her real model:
    - nothing before ready and before Joe's and Marta's looks;
    - then the stand-in at her cockpit's spot standing, at her helm with its arms out, and back, a cut;
    - not drawn 90 m off on low, nor when he isn't aboard;
    - named, so `BoatCopies` can leave him out.

  M19's and M20's checks of how he backs her down still pass unchanged.
- **`tools/two-players/crew.mjs`' `mate` part**, two real games (Robin hires him, Sam fights a blue marlin from her chair), 0 failed:
  - in her cockpit on Robin's game, `Mt` 2 in her pose;
  - on Sam's copy of her, the stand-in at the same spot, then his own look standing;
  - at her helm on both games while he backs her down (the clip `trolley_idle`), M20's backing-down checks passing with him drawn (3.16 m/s, her stern within 29°);
  - back in her cockpit on both games once the fish is off.

  The pose: biggest 265 bytes, at most 9 messages a second, never over the room's limits. Pictures are in `qa-output/deckhand/crew/` (`crew-mate-guest-back.png`: Sam's view of him in her cockpit).

## Renders

`tools/render-slot.sh node tools/deckhand/look.mjs qa-output/deckhand <tier>` (a dev server on `LOOK_PORT`), at sea in a calm, 11 in the morning. Each tier's folder in `qa-output/deckhand/` (not kept in git) has:
- `stand-in-cockpit.png` and `stand-in-helm.png`: the grey stand-in while his look's held back, standing, then its arms out to the wheel;
- `cockpit-quarter.png`, `cockpit-above.png` and `cockpit-astern.png`: him in her cockpit's corner;
- `helm-behind.png`, `helm-side.png` and `helm-bow.png`: at her helm backing her down, his hands on the wheel's rim;
- `back-quarter.png`: handed back, in her cockpit again;
- `report.json`: the figures above.

Looked at on every tier:
- **Feet:** his shoes are on her teak in the cockpit and on the bridge's sole at her helm.
- **Clear of her:** he's against nothing in the corner, and clear of the helm seat and the console.
- **Hands:** on the rim at her helm, either side of the hub.
- **His look:** the same man on every tier, lit as the players are.
- **Seen:** from astern and from off her bow he's seen as a man aboard her.

## What's left

- **He isn't solid:** you walk through him in her corner. A collider for him would be hers, and walked on by guests' games too.
- **He doesn't walk** from his corner up the ladder to her helm and back: a cut. Walking him would mean the ladder's climb for a character.
- **His hands stay at ten to two** as the wheel turns under them.
- **The other players at someone's helm** are drawn on the same `trolley_idle`, so their hands hang by their sides there too (`Avatar.js`, not this stream's). His reach (`reach` in `Mate.js`) would serve them.
- **Found, not touched:** on low the fighting chair is drawn on your sportfisher near the camera even when it isn't bought. Her `nearDetail` names it, and `App.updateNearDetail` shows near meshes regardless of `fit` (`qa-output/deckhand/low/cockpit-quarter.png` has it; mid and high don't).
- **At her berth he's ashore** (above), the user's to change.
- **A second copy of his look** loads if a player in `player-m1` comes after him: theirs is loaded with all the players' clips, his with two.
- **Someone else's mate on a copy of their sportfisher** (Robin's, on Sam's game) loads `player-m1` on Sam's game, as Robin's own game does. That's one skinned character more on a guest's phone.
