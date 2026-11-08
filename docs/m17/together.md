# M17, stream 4: aboard together

What [M17.md](../M17.md) listed for a guest on someone else's boat ([Aboard together](../M17.md#aboard-together), items 2 to 13; item 1 was done ahead of M17 on main, v2.2.0). Built 2026-11-08 on branch `claude/m17-together-d45753`, cut from `m17-flats` at step 2 (`3f1367b`). Two real games on one machine (`tools/two-players/together.mjs`, a part each) and Node tests (`test/together-aboard.mjs`) check it. **All the Spaces itself, two real devices through its room, is untried**, as for all of `together/`: the user runs nothing on their own devices.

## What each is now

**2. A second cradle in Marta's yard.** Everyone's boat hauled out is on the same cradle on their own game: the lobster boat's is the village's (`StormPlaces.CRADLE`), the others' are their places in the yard (`YARD`). On your screen a guest's boat on hers, while one of yours is on it (the one you're in, hauled, or one you own lying there: `Together._yardMine`), lies on the yard's second for her type (`StormPlaces.SPARE_YARD`): the lobster boat's beside the cradle, the kayak's and the console's behind their own, the sportfisher's beside hers, each clear of the yard's others and on its level ground (`test/together-aboard.mjs`). She's as high over the ground there as on her own (`Berths.spareYard`'s `rise`). Before, hers wasn't drawn at all while yours was there.
- **Blocks under her.** Only the lobster boat's first cradle has blocks of the village's; the yard's other places are drawn by your own moored boats when they're yours. So a guest's boat in the yard (on her own place or the second) has keel blocks and stands of her own under her copy, down to the ground, as Marta's cradle has them (`Berths.cradleGeometry`, about 140 triangles, in the props' program the stand-ins use: no new shader). Made when she's first seen there, gone with her.
- Put back in, she's where her pose has her at once, as on her owner's game.
- Only one second cradle a type: a third player's boat of the same type hauled out with yours and another's still overlaps on your screen, as all of them did before.

**3. The shell tray from the group's save.** Marta's tray by her table is the group's now: the first whole set anyone gives her is in the group's shared save (`'tray'`: who, their id, the day, when), and it's laid out on everyone's game who's in the group, whether they've a set of their own or not (`Together.layTray`, `_setTray`; `Game.updateBeachcomb`). Someone joining later reads it from the save. A set given before this (your save's `shells.wall`) goes into the group's tray the first time you play in company, if there's none there. Your own set's still yours (the Shells tab says it's in her tray), and Marta still pays for a second whole set; the tray shows the first.

**4. A guest's fish too big for their own hold, in hers.** As the user decided on 2026-11-05, a guest's catch goes in the guest's own hold. What's left: a fish too big for it, caught aboard her with her owner aboard, goes in her hold if there's room in it. It's still the guest's: in their log, on their hold's list, theirs to sell.
- Her owner's game sends the room in her hold with her kit (`kitOf`'s `h`: what she holds, less her own catch and anyone else's in it), as it sends her tackle and bait (`Together._kits`). The guest's game has it as `GameState.aboardHold`.
- A fish heavier than the guest's own hold holds, and no heavier than her room left, is kept with `aboard` (her owner's id) and `boat` (her owner's name) on it (`GameState.stowFor`, `addFish`). It doesn't count in the guest's own cooler (`holdKg`), and the catch card says "in Robin's hold" (`lastCatch.stowed`). One that would fit the guest's own hold goes there, full or not, as before.
- The guest's pose says what of theirs is in whose hold (`Hs`), so her owner's game has the room it has (`GameState.lent`, in `fits`), and says so once: "Sam's fish is in your hold: too big for theirs". Sold, it's gone from both.
- Saved with the guest's catch (`aboard`, `boat` on an inventory entry: a small change to the save, read back by `fromJSON`).
- Not modelled: the fish physically aboard her. It's sold wherever the guest sells, and kept on the guest's own ice.

**5. A seated guest looks about.** Traced and not reproduced, on today's code or on M16's (`4979a33`, run the same way): a guest on a kayak's tank well turns his view by the mouse's look (`Input.look`), dragging the real mouse, with his rod out, in a lobster boat or a kayak of his own, her owner sat at her paddle or paddling, and her owner sees his figure turn with him. `Player.updateDeck` turns `deckYaw` for a perched rider as for anyone on deck (`Crew.perched` keeps her `seated` false), and nothing else takes the camera. Left untried: a touch screen, a gamepad, a real pointer lock (a driven browser never locks: `Input.requestLock`), and the Guide's cards, which the scripts close. `together.mjs seat` stays as the check.

**6. Spare berths** (`together/Berths.js`).
- **As many as the stem holds**, not four: each boat's place along either side of the stem by her own length, deepest first, with 1.5 m between boats and 0.3 m under her keel at the lowest tide (`stemBerth`, `TIDE_LOWEST`). Nine lobster boats, twelve consoles or four sportfishers on either bake, or a mix (two sportfishers, four lobster boats and two consoles: seven of the eight fit).
- **A kayak on the sand**: a visitor's lying where yours does (her owner's game has her at the same spot: `onTheSand`) is drawn beside it, 1.6 m along the sand each, up past the high-water mark as yours is (`sandBerth`: `TIDE_HIGHEST` + 0.5, as `fleet/Berths.ashoreOf`).
- **Leaving the stem round the head, not through it.** At her spare she moves as her pose does only as far as her lines' play (`SWING`, 0.5 m): beyond that her owner's moves made again beside the stem took her into it. Then she goes out from the stem sideways, along the head's end on her side, past its face, across it if she's for its far side, and on to her pose (`leaving`): each corner taken only as far as her pose needs it, so the way never jumps.
- What a spare is is held per boat (`o.spot`: `{ kind: 'stem' | 'sand' | 'yard', ... }`); `o.berth` is still a number for the scripts.

**7. Pearl's berth** looks at anyone's boat. Her pirogue lay off only for your own boat stopped at her jetty; now for anyone's, as Together has it on your screen (`Together.stoppedNear`: someone else's stopped there, or an away boat anchored there; `FishCamp.live`). Every game knows the same boats, so she lies off on all of them.

**8. A speck's height is her fit's.** Past the fog a boat's height over the water is as she's fitted (`BoatCopies.airOf`, `bareOf`): a sportfisher with no tower is her hardtop and its radar, 5.65 m, as the model measures it, not the tower's 11; a console with no T-top is her console's grab rail, about 2.1 m, about as high as her skipper's head. Her outriggers and her whip are centimetres thick, nothing at a speck's distance. From a deck 2.3 m up a sportfisher shows to 18.6 km with her tower and 15.0 without. Her stand-in (before she's built, or past the device's few) has no tower or T-top either when she hasn't.

**9. The horn** is heard from the boat it's sounded on. At someone else's helm a rider's horn was heard on his own game from his own boat, wherever that was; now from hers (`App`: the boat the player's on, `player.boat`), as it already was on everyone else's (`Together._hornAt`).

**10. The console's ladder on a copy** folds down as on her owner's game. It's one more bit in the fit (`BoatCopies.fitWire`'s `now`, above her paint: `NOW_SHIFT`), from her owner's game as it folds it (`ConsoleModel.fitNow`), and her copy shows it in its own geometry (`dressCopy`: a view of her fittings for each way, made once and kept). What's walked of her is keyed on her fit without it (`STILL`), so a guest's walking colliders don't change as it folds. A game from before reads her paint wrongly while it's down (it's above the paint's bits); everyone in a room runs the same version but for the minutes after a release.

**11. Boarding from the water by her ladder.** Someone swimming by her is offered her the way her owner is: at her ladder, within its own reach (2.2 m with a ladder, 1.4 m without), "Climb the ladder" or "Haul yourself aboard" (`Vessel.boardFrom`, read as she's fitted: `copies.walked`), and E puts them on her platform. It was 4.2 m from her cockpit's boarding point, "Board Robin's boat". Ashore it's as before.

**12. Standing beside the chair isn't sitting in it.** The chair's job is whoever's strapped into it (`Player.chair`, set by `Rigs._sit`, for a fish on), not whoever stands within its station's reach (`Crew.jobAt`'s `chair`). Everyone sees them in it, and the helm's told, only then.

**13. A slow game in company.** In company the waves go by the wall clock (`Together.syncWaves`) while a frame's capped at 0.1 s, so under 10 fps a boat was worked out over less time than the waves had gone by: on a slow game they passed under her two or three times as fast as they do. Now, in company, a frame's boat is worked out over all the water's time since the last, up to three seconds (`App`'s `CATCH_UP`), in steps of 0.1 s at most, each on the water at its own time (`BoatController.catchUp`, `WaterQuery.updateSlots` for her samples alone). Alone, or past three seconds (joining, a hidden tab), the frame's own, as before. At 3 fps on a 9 s swell she rises and falls with it (Node: 1.00 correlated with it, 1.03 of its height, against 0.83 and 1.11 stopped at 0.1 s a frame).

**The tide.** Nothing in `together/` is at a fixed water height: a copy at a spare berth is floated on your own sea where she's drawn, the away boats on the sea's level (`G.seaLevel`), a kayak on the sand on the sand, and Pearl on the water as she always was.

## Checked

`tools/two-players/together.mjs <part>`, two real games on one machine, low tier, on the dev server; frame rates are the CPU's, printed by each part. RESULTS

`test/together-aboard.mjs` (in `pnpm test`): the stem's berths on both bakes, any mix, clear of the pier and each other, with water under them at the lowest tide; leaving them for five places never in the head or the stem and never a jump; the sand's places past the high-water mark; the yard's second cradles clear of every other place there and over a surge; the ladder's bit, the paint read through it, the walked view the same either way, and a copy's fittings as each way; boarding at the ladder; the speck's and the stand-in's heights; the chair by the seat; a fish in her hold, saved, and her owner's room; the tray's record; Pearl's berth; a slow game's boat on a swell.

## Readings

READINGS

## Not done

- **Item 5** wasn't reproduced; what was tried is above.
- A third player's boat of a type with yours and another's in the yard has no third cradle.
- A guest's fish in someone else's hold is sold anywhere they sell and kept on their own ice.
- A game from before M17 reads a console's paint wrongly while her ladder's down.
- Two devices through All the Spaces' room, as for everything in `together/`.
