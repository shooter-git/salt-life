# M19, stream RECORDS: line-class records

Stream RECORDS of [M19.md](../M19.md), built 2026-11-13 on `m19-records` from `m19` (b8aa17e). It's decision 10: the heaviest fish of each kind on each IGFA line class, in your log and the Log tab, announced on the catch card, and a line on the island's records board. The classes are step 0's ([sources-big-game.md](sources-big-game.md), section 1).

## The classes

`game/LineClass.js` (pure). A class is named in kg, as IGFA names it, with its pound label.

**A line** goes in the lightest class it doesn't test over, by IGFA's own figures (the 4 kg class may test up to 8.81 lb):

| The game's line | Its class |
|---|---|
| 8 lb mono | 4 kg (8 lb) |
| 15 lb mono | 8 kg (16 lb): it over-tests the 6 kg's 13.22 lb |
| 30 lb braid | 15 kg (30 lb) |
| 60 lb braid | 37 kg (80 lb) |
| 80 lb mono | 37 kg (80 lb) |
| 130 lb mono | 60 kg (130 lb) |

**A fly's tippet** goes in the tippet classes (1 to 10 kg), the same way and by the tippet alone; IGFA puts no limit on the fly line or the backing. The 12, 16 and 20 lb tippets are the 6, 8 and 10 kg tippet classes, keyed `f6`, `f8` and `f10`.

**IGFA's rules for a record:**
- A record fish weighs at least half its class.
- It beats the one before by 2 oz (56.69 g) under 25 lb, and by 0.5% from 25 lb up (`counts`, `beats`).

## What counts

- **Every fish landed on a rod**, kept or let go, on the line or tippet it was fought on: yours, or the tackle in your hands when you fight on someone else's (`Game.updateFight`, `classOf( f.lineKg, f.rig === 'fly' )`).
- **Not on the electric reel:** IGFA won't have a powered reel.
- **Not a fish taken by speargun, net or hand.**
- **A guest's fish counts for the guest**, since each game logs its own player's catches. Checked with two players, below.

## Where it shows

- **Your log:** each kind's best on each class, `{ kg, day, place }` in its entry's `cls`. The foundation's save reads it back (`cleanLog`). `GameState.logFish` keeps it, and `addFish` tells the catch card (`lastCatch.clsRecord`: the class and the weight it beat).
- **The catch card:**
  - its badge, when nothing bigger has it: "Line-class record";
  - a note over the rest: "A line-class record: your heaviest crevalle jack on 4 kg (8 lb) line, the first on it", or "…, beating 19.6 lb".
- **The Log tab:** a "Line-class records" block, after the billfish. It lists each kind on each class with the day and the place, the lines' classes first, then the tippets', lightest first.
- **The island's records board:**
  - **The line:** the island's best fish for its line class, by IGFA's ratio of the fish's weight to the class's: "Line class: Sam's 44 lb crevalle jack on 4 kg (8 lb), 5.0 to 1" (`classLine`). With the life lists' two lines it takes a seventh row's room.
  - **Where it's kept:** in the group's records under the one key `'%'`, whatever the class (`Together.caughtClass`). So the room's keys, and the group's save, don't grow with the classes.

## Tests

- `test/line-class.mjs` (new):
  - the game's lines and tippets in their classes, and a line over its class going up one;
  - half the class, and the 2 oz and 0.5% margins;
  - kept in the log by the real `addFish` and read back from a save; none for a fish too light for its class, or for a speared one;
  - the board's line.
- **Two players** (`tools/two-players/records.mjs`, new), fish landed through the game's own landing, all 6 passed with no page errors:
  - Robin's 9 kg jack on her 8 lb line: her record on the 4 kg class, on her catch card, and the island's best for its class on both games' boards;
  - Sam's 20 kg jack: his record, in his log and not hers;
  - the island's best moving to Sam on both games;
  - one `'%'` key;
  - her Log tab listing it.
- `pnpm test` passes.
