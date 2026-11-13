# M19, stream STALLS: the bait and the ice at Joe's, Pearl's bait and challenges

Stream STALLS of [M19.md](../M19.md), built 2026-11-13 on `m19-stalls` from `m19` (cc34d98). It covers decisions 4 and 5 (the bait and the ice moved from Marta to Joe; Pearl's bait and her day's challenges) and the bait items of decision 6.

## Joe's: the bait and the ice

**What moved from Marta to Joe:**
- **Ice:** $4 a 10 lb bag, as it was (`DaysOut.iceRow`).
- **Frozen bait:** ballyhoo ($20 for 12), squid ($12 for 6), chum ($15 a block).
- **Trap bait:** the fish heads and cowhide, once you have traps.
- **The day's live-bait order:** his bait tank takes the day's kind from your bait bucket, up to 4 at the order's price.
  - It's `{ id: 'bait', who: 'joe' }` in the day's orders now (`Orders.ordersFor`); it was Marta's, `id: 'marta'`.
  - He takes them only while he's open. His night box is a box, not a tank, so `ordersOf`'s `open` leaves the bait order out after hours, and `GameState.quoteBait` quotes nothing. His night box's list leaves it out too (`wantedBlock`'s `box`).
  - **A fix:** it asks only for a kind a bait bucket holds (silverside, sergeant major, grunt or mullet). Since v2.4.1 it had also asked for needlefish and white mullet, which never go in the bucket (`Bait.baitOf`), so on those days it couldn't be filled. Only the day's bait kind (and, on a day it changed, the second fish Joe wants, picked from the others) differs from before.

**Joe's new baits:** live shrimp ($10 a dozen) and frozen sardines ($5 for 8).

**His panel:** a "Bait and ice" block heads his orders column (`GameHUD.joeBait`), with the bucket's sale, the ice, the lots and the trap bait.

**Out of hours:** his night box has "His ice chest" beside it. You take a bag on trust and pay into the box, at the same price.
- The prompt says so: "Joe's night box and ice chest".
- So does his "Closed" board, whose second line reads "Night box · ice chest" (it was "Fish in the night box").

## Marta's

Marta keeps:
- the stores ($16 a day);
- what your boat can stand;
- the gear and the boats;
- fuel;
- her tag-and-release asks for the fisheries office.

Her shop no longer shows ice, frozen bait, the bucket's sale or trap bait (`GameHUD.renderShop`, `DaysOut.shopRows`).

## Pearl's

**Her bait:**
- Cut conch: $6 for 6.
  - Step 0 found no rule against conch as bait in the Bahamas. Locals use it, and its slop, for bonefish and mutton snapper.
  - The conch must be legal, with a flared lip ([sources-boats-bait.md](sources-boats-bait.md), item 8).
- Live hermit crabs: $8 for 6. They're permit's best bait and good for bonefish.

Her board reads "fish bought · bait · diesel". It's 0.16 m higher than it was, clear of the lean-to's roof: from the beach its lower line had been under the roof since M15.

**Her day's challenges** (`Challenges.js`, the slate in `GameHUD.renderCamp`): one each for the rod, the speargun and the cast net.
- **The same for everyone on the island's clock:** `challengesFor` is seeded by the trading day, as the day's orders are, and the day turns at 5 am.
- **What's asked** comes from lists chosen by hand:
  - **The rod:** a kind over a weight, a kind from a place, one caught and let go (bonefish, tarpon, permit), or one on the fly (bonefish, barracuda).
  - **The speargun:** a kind a diver reaches. Never a protected one, and the gun won't fire at one under its legal size, so every speared fish counts.
  - **The cast net:** a keeper mullet (a pound and over), 12 live baits in one throw, or a white mullet or a sergeant major.
- **How a catch counts:** it's done by the catch itself.
  - Each way of catching tells `GameState.onCatch`: a fish by rod, by spear or by hand, and a throw of the net.
  - Only its own way does it: a speared bonefish isn't the rod's.
  - A protected fish's ask is done by letting it go, as it must be.
- **Being paid:**
  - Done, a toast says what she owes you. She pays in cash the next time you're at her camp with her there (`GameState.collectChallenges`), and her panel says so the once (cleared as you leave it: `closeStand`).
  - What's owed is kept across days. A new day's list starts afresh.
- **The save:** `challenges: { day, done, owed }`, from the foundation.

**What she pays is judgement:** $40 to $150, about an hour's fishing at a kayak's $40 to $90 an hour (`tools/earnings.mjs`), more for the rarer ask.

## An old save

A day's bait order that was filled for Marta (`orders.filled.marta`) is carried over as Joe's (`filled.bait`) on load.

## The signs

**High and mid** (`public/models/props/signs.png`, re-baked by `node tools/props/build.mjs --signs` with no downloads, then `pnpm lock`):
- Joe's board reads "JOE'S FRESH FISH" with "BAIT · ICE" under it, the size of Marta's line (72 pt; his name 136 pt, from 150).
- Marta's reads "MARTA'S CHANDLERY" over "TACKLE · FUEL · BOATS" (it was "BAIT · TACKLE · FUEL").
- `build.mjs` falls back to ImageMagick 6's `convert` where there's no `magick`.

**Low** has the plain stalls and no baked signs, so each now has a hand-painted board where the scanned stall's hangs (`Signpost.paintedBoard`, as Pearl's is):
- Joe's: "Joe's fresh fish" over "bait · ice". The plain stall's floats now hang 0.25 m lower, below its words: they hung across them.
- Marta's: "Marta's chandlery" over "tackle · fuel · boats".

**Rendered** by `tools/props/signs-look.mjs` on each tier: Joe's and Marta's from in front, behind and close, and Pearl's board.
- On low, every board reads plainly.
- On mid and high, the baked boards read in the paint and the style they had, but dark. That's how they were before M19:
  - Joe's hangs in his stall's shade;
  - Marta's faces away from the morning sun.

  Their light is unchanged.

## The words

The Guide's ice tip is now Joe's. The wanted board's bait line now says "live bait, for his tank". Trolling's "needs" line now names Joe for frozen ballyhoo and squid, and Marta for plugs and skirts. The bucket sale's toast and the traps' "no bait" note now name Joe.

## For the user

- **Hermit crabs as bait:** sold at Pearl's, as you chose them. Step 0 found them permit's best bait, but no Bahamian rule either way, and a visitors' guide saying live shells with an animal in them may not be taken from the sea. Keep them, or swap them for another bait at Pearl's?
- **What she pays for each challenge** ($40 to $150): judgement.

## Tests

- `test/stalls-m19.mjs` (new):
  - the bait order is Joe's every day, and his tank takes from the bucket only while he's open;
  - who sells which bait, and an old save's order carried over;
  - the challenges the same on the day and different most days;
  - every ask can be done by its own catch and no other;
  - one done once, a new day's list keeping what's owed, and paid once;
  - the signs' words.
- `test/days-out.mjs`: the ice is Joe's, and his ice chest's on trust out of hours.
- `pnpm test` passes.
- **Two players** (`tools/two-players/stalls.mjs`), with Robin and Sam on one clock; all 10 checks passed, with no page errors:
  - the same challenges on both games;
  - Robin's catch, through the real `addFish`, does the rod's on her game and not Sam's;
  - Pearl's panel: her challenges and bait, and the $70 paid as Robin comes by, said the once and paid once;
  - Joe's by day: his bait and ice, and 3 grunts from the bucket sold to his tank ("Sold Joe 3 live bait for his tank · $30");
  - Marta's: her stores and none of the bait;
  - the clock moved to 22 h for both: Joe's night box with his ice chest on trust, no bait tank or its order, and Sam's challenges unchanged till 5 am.
