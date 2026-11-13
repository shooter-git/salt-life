# M19, stream TOGETHER: playing together's loose ends

Stream TOGETHER of [M19.md](../M19.md), built 2026-11-13 on `m19-together` from `m19` (f6c4acb): the playing-together fixes M18's list held ([M18.md](../M18.md), "Playing together").

## The yard's third cradle

- **The problem:** a guest's boat hauled out in Marta's yard, on your screen where yours is on her own cradle, had the yard's second cradle (M17). A second guest's of the same kind had none, and lay through yours.
- **The fix:** each kind has a third place now (`StormPlaces.THIRD_YARD`; `Berths.spareYard`'s `n`, from how many of her kind already have one: `Together._takeBerth`):
  - the lobster boat's at (95, −109);
  - the kayak's beside hers;
  - the console's beside her spare;
  - the sportfisher's west of hers.
- **Where:** each is on the yard's level ground, within 0.15 m along her length, and clear of every other place by its 0.6 m margin (`test/together-aboard.mjs`, on both of the island's bakes). Past the third there's none, as before past the second.

## A guest put back aboard

- **The problem:** coming back to a room whose owner was there but ashore, with her boat at anchor out on the water, a guest who'd been aboard her was put ashore: "Robin's boat isn't out there now".
- **The fix:** they're put back aboard her where they stood, as when her owner's aboard (`Together._boardable`: her owner's pose says she's at anchor, `anchored`, and not at the dock).

## Anchored copies

**What's sent:** others' copies of an anchored lobster boat, and of a console, no longer show her anchor on its roller. Her owner's game sends that it's down, in her pose's fit, as the console's ladder is sent (`BoatCopies`' `now`: the lobster boat's first `anchorDown`, the console's fourth; `fitNow`).

**What's drawn:** each copy of her draws her fittings without the anchor while it's down (`BoatModel.dressCopy`, `ConsoleModel.dressCopy`).

**Older games:** a game from before M19 has no reader for the lobster boat's fit and draws it on the roller, as it did. Her paint reads the same (`test/fit-bits.mjs`).

## The room's keys

**The problem:** All the Spaces' room never lets a key go. One set to null still counts against its 256 (`creation-room.ts`' `setShared`), so a `'flats.<id>'` and a `'rest.<id>'` for every player who ever wrote one piled up toward the limit over a room's life.

**The fix** (`together/RoomSlots.js`):
- Each player's record is in one of 16 slots now, `'flats.@<n>'` and `'rest.@<n>'`, its value their own with their id beside it.
- A player writes to the slot that's theirs, or a free one, or one whose player's gone from the room and whose record's spent (`slotFor`).
- Two taking the same slot at once: the one whose write was lost finds another and writes there.
- With all 16 live and their players here, a player's own key as before.
- An older game reads a slot as one more player's record; its own keys are read as theirs (`ownerOf`).

**In Node** (`test/together-m19.mjs`): 200 players over a room's life, 8 at a time, never more than 16 keys.

## Crossed saves tried again

- **The problem:** the SDK's `shared.update` re-reads and re-applies a change three times when saves cross, and fails past that. Before, the life list tried again after 5 s, and the island's records (`Together.caught`), the boats, the week's order and the tray warned and went on.
- **The fix:** every change to the group's save goes through `RoomSlots.updateAgain` (`Together._update`). It's tried up to four times more, each later than the last (0.8, 1.6, 2.4 and 3.2 s, each at a random moment within half to one and a half of that), so the saves that crossed come apart. The change is applied to what's there each time, so nothing's lost.

## Company foam

- **The problem:** a boat in company left no foam on your screen, so on low, where a console's crests are too short for the sea's grid, another player's console passed and left nothing to see but her.
- **The fix:** her foam's shed on your sea as yours is (`Wake.track`, `_shed`):
  - from where she's drawn, her way as the waves' track already follows it (`WakeWaves.followDrawn`'s `vx`, `vz`), her heading as drawn;
  - her own model's wake figures, from the copies' model of her kind;
  - in the same pool of patches, on every tier.
- **Not the sea's shader:** these are the foam's patches.

## Another kayak heard

- **The problem:** the boat you hear is one: your own, the one you ride, or the nearest under way if you're ashore or swimming (`Together.boatSound`). So from your own boat another player's kayak beside you wasn't heard.
- **The fix:** her push through the water is heard beside it now, within 15 m, by her speed (`Together.kayakHeard`, SoundScape's `kayak_push_theirs`: the same recording as your kayak's, its buffer shared, `same`). Her paddle's strokes aren't sent, so they're still not heard.

## Not done here

- **The seated guest looking about** (M17's item 5, never reproduced) on touch, a gamepad and a real pointer lock: left to the final pass's two-player runs with those devices emulated.
- **Two real devices** through All the Spaces' room: still untried.

## Tests

- `test/together-m19.mjs` (new): the slots, the saves tried again, anchored copies, company foam.
- `test/together-aboard.mjs`: the third cradles.
- `test/together-boats.mjs`: the fit's numbers with the anchor.
- `test/flats-together.mjs`: the records found by whose they are.
- `pnpm test` passes.
