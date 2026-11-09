# M17, stream 7: the life list and the slams

What [M17.md](../M17.md) asked in "The life list and the slams" (the user's addition of 2026-11-07, goals set by the fishing rather than by money): the cooler's Log tab as a life list, every kind caught or still to catch; Joe's line of where to look for each kind; where and when your best was caught, and your first; the super grand slam and the billfish grand slam beside stream 1's grand slam; and a line on the group's records board. Built 2026-11-09 on `m17-flats` 7495f79, on branch `claude/m17-life-721c43`.

## The life list

`game/LifeList.js` (pure) and the Log tab (`GameHUD.renderInventory`):

- **How far along you are:** "23 of 39 kinds" over a bar, counted from `FISH` (`KINDS`, 39). Beside it, a button, "16 still to catch", that takes the list down to them.
- **A protected kind let go counts as caught** (`caught`): it's logged as it's let go (`GameState.addFish` logs every catch), and the billfish trophies count too.
- **The slams:** those you've had, each a row with its days and place (stream 1's `slamRows`), and those you haven't, dimmed, with today's tally toward each ("today 2 of 4").
- **The billfish let go**, with "See it" (M16's trophies). Their weight is in their line now, so on a 320 px phone it isn't squeezed beside the weight and the button.
- **Caught:** each kind in the table's order, how many, your first and your best with their island day and place ("2 caught · first day 3, the bay · best day 6, the windward reef"; one caught once told once), its weight and length.
- **Still to catch:** each kind's name, dimmed, and Joe's line of where to look under it.
- Then the places you've fished and the far places found, as before.

The tab's count is `lifeCount`, the hint at its foot "Your bests, and where to look for the rest". The catch card's note for a new kind says how many you've had: "First one in your fish log: 24 of 39 kinds".

### The save

The log is still `GameState.log`, species to entry. An entry gains three fields:

```
{ count, bestKg, bestCm,
  bestDay, bestAt,          // (M17) your best's island day (Orders.tradeDay, as the places' list's) and place (Places.js)
  first: [ day, place ] }   // (M17) the first one's
```

`logFish( species, kg, cm, day, place )` writes them (from `addFish` and `addHaul`). `cleanLog` reads them back in `fromJSON`: a day that isn't a whole number from 0, or a place `PLACES` doesn't have, comes back null; a kind the table doesn't have now is kept as it was. A save from before M17 has none of them, so its kinds show no day or place; the next best fills in `bestDay` and `bestAt`, and its first stays unknown (blank). Nothing else in the save changed: the slams are in `trophies`, as stream 1 kept the grand slam.

## Joe's lines of where to look

Every kind has a `hint` now (`FishTable.js`' `HINTS`, below the table so its rows stay as they are; the trout's and the swordfish's are in their rows, unchanged). Each is from where the fish really is and when, and where the game's bites have it: its habitat's heaviest waters, its hours (`time`), its ways (`ways`, `eats`). They're also Joe's slate's line for the day's asks (`Orders.biteHint`, which used the hint first already), so the slate's kinds keep to 40 characters, the slate's line at its chalk size; `test/life-list.mjs` checks it.

| Kind | Line | The game | Real |
|---|---|---|---|
| Hardhead silverside | schooling in the shallows and by the pier: throw the net | shallows, pier; net | |
| Striped mullet | in the shallows by day: throw the net | shallows; day; net | rarely on a hook |
| Houndfish | cruising the top of the shallows by day | shallows, bay; day; trolled | |
| Sergeant major | round the piles and the reef by day | pier, reef; day | |
| Bluestriped grunt | in the pier's shade, and on the reef | pier, reef | schools in shade by day |
| Yellowtail snapper | up in a chum slick over the reef at dusk | reef; dawn and dusk; a slick brings fish up | chummed up over the reef; lights a mixed bet (Florida Sportsman, Saltwater Sportsman) |
| Blue chromis | in clouds over the reef tops, by day | reef; day | plankton pickers above the reef |
| Blue tang | grazing the reef in schools, by day | reef; day | |
| Hogfish | rooting by the reef: best speared | reef; day; rarely bites | under 1% of hook-and-line trips, most often speared (SEDAR 37-WP03; Florida Sportsman) |
| Stoplight parrotfish | grazing the coral on the reef by day | reef; day; protected | |
| Queen angelfish | among the reef's sponges, by day | reef; day | eats sponges |
| Crevalle jack | busting bait in the bay, dawn and dusk | bay, pier; dawn and dusk; trolled | |
| Great barracuda | trolled in the bay, or seen on the flats | bay, reef, deep; trolled; a seen fish on the flats (stream 1) | |
| Nassau grouper | a bait on the bottom by the reef and offshore | reef, deep; deep-dropped; protected | |
| Red snapper | on the bottom offshore, deep-dropped | deep, ledge | |
| Blackfin tuna | under the birds on the drop-off at dawn | edge, birds; dawn and dusk | |
| Mahi-mahi | under weedlines and anything afloat | blue, weed, debris | under floating things (FishBase, after FAO: [m16/fish.md](../m16/fish.md)) |
| Wahoo | trolled on the drop-off at dawn, on wire | edge; dawn and dusk; trolled; teeth | ([m16/fish.md](../m16/fish.md)) |
| Yellowfin tuna | under the birds past the drop-off, early | edge, blue, birds; dawn and dusk | |
| Sailfish | a kite bait on the drop-off, best after a front | edge, birds; kite; `weather.front` | the bite right after a cold front, kites (Sport Fishing, Florida Sportsman) |
| White marlin | ballyhoo trolled on the drop-off and the hump | edge (the hump's flanks are edge); trolled; ballyhoo | edges, seamounts and canyons, trolled ballyhoo (Power & Motoryacht, The Fisherman) |
| Blue marlin | a big lure trolled out in the blue | blue; trolled; skirts | |
| Swordfish | (unchanged) | | ([m16/fish.md](../m16/fish.md)) |
| Tarpon | in the creek and under the pier lights after dark, or laid up on the flats in the sun | creek, bay, pier; night; lights; laid up (stream 1) | ([sources-tide-fish.md](sources-tide-fish.md)) |
| Black grouper | a bait on the bottom, deep off the reef | deep, reef; deep-dropped | |
| Mutton snapper | on the sand by the reef, dawn and dusk | reef, bay; dawn and dusk | |
| Red lionfish | under the reef's ledges: spear every one | reef; spear; bounty | |
| Silk snapper | deep-dropped on the north ledge | ledge, deep | |
| Cubera snapper | a big live bait deep off the reef at dusk | deep, reef; dawn and dusk; deep-dropped | |
| Mangrove snapper | under the pier and the mangroves at dusk | pier, creek; dawn and dusk | |
| Bonefish | tailing on the flats on the flood, on a calm day | shallows; day; off in a blow; the flats' tide (stream 1) | ([sources-tide-fish.md](sources-tide-fish.md)) |
| Goliath grouper | under the pier, on a big bait | pier; protected | |
| White mullet | in the shallows and by the pier: the net | shallows, pier; net | |
| Florida pompano | in the north beach's surf, best on a surf day | wash | troughs of the surf ([M15](../M15.md)) |
| Permit | in the north beach's surf, and on the flats' edge | wash, shallows; flats edge (stream 1) | ([sources-tide-fish.md](sources-tide-fish.md)) |
| Common snook | in the mangrove creek and the surf, at dawn and dusk | creek, wash; dawn and dusk | ([sources-tide-fish.md](sources-tide-fish.md)) |
| Redfish | tailing in the shallows at dawn and dusk | shallows, creek; dawn and dusk | ([sources-tide-fish.md](sources-tide-fish.md)) |
| Spotted seatrout | (unchanged) | | |
| Spiny lobster | in the reef's ledges, by hand, after dark | by hand; night | the same as Joe's slate had it (`biteHint`'s own line for a kind taken by hand) |

Where the last column is blank, the line is the game's own habitat and hours, and the fish's habit is common knowledge of it that wasn't looked up separately.

Two older tests pinned Joe's generated wording for five kinds (`far-bites.mjs`: mahi, tuna, silk snapper; `island-sides.mjs`: pompano, snook). They now check what the lines say (the weedlines, the birds at dawn, the ledge; the surf, the mangrove creek at dawn and dusk).

## The slams

Two entries beside the grand slam in `Trophies.js`' `SLAMS`, counted as stream 1 built it (`slamCatch`):

- **The super grand slam:** a bonefish, a permit, a tarpon and a snook in one day (`superGrand`, `over: 'grand'`). The IGFA's inshore club began with those four, and guides call the four a super grand slam ([sources-tide-fish.md](sources-tide-fish.md), The grand slam). A snook first and the tarpon last makes both at once; the biggest is the one told (`slamTold`).
- **The billfish grand slam:** a sailfish, a white marlin and a blue marlin in one day (`billfish`). The IGFA's Billfish Grand Slam Club (its Offshore Slam Club until 2013) is three billfish kinds in a day ([IGFA, Grand Slam Clubs](https://igfa.org/?p=2556); [Tackle Village](https://tacklevillage.com/?p=2026380)), and these three are the Atlantic's.
- **One island day**, sunrise (5.8) to sunrise (`slamDay`), and a sleep ends it (`slamSlept`: a jump of the clock past an island hour and a half). The clock's now watched before `FlatsFishing.update` asks for the flats' fish, so a sleep ends the day before those fish are made and far from them: the billfish slam's offshore.
- **A guest's fish counts for the guest**, aboard anyone's boat: the catch is on the guest's own game (Rigs' `takeLine` and `Game.strike` there), into the guest's log and trophies, a fish too big for their cooler in her hold (stream 4) still theirs.
- **Kept** as a trophy row with its days (`slam:<id>`: how many, the first day and the last, the place, each fish's weight), through `cleanTrophies`. **Told on the catch card** of its last fish: the slam's name is the badge, and its line, in gold, over the catch's own ("Super grand slam! A bonefish, a permit, a tarpon and a snook in one day · it's a trophy in your log"). "All let go" only where every kind of it is (a snook may be kept). On a phone on its side (500 px tall or less) the card hides its notes, as it always has, so there the badge alone says it. With no card (no HUD), a toast as before.
- **It pays nothing.**
- **The Guide's grand slam tip** is only for the grand slam's kinds now (a snook or a billfish set it once the other slams' kinds counted), and says a snook the same day makes it a super grand slam.
- `FlatsFishing.caught` returns the slams' ids (it returned the toast's text); `Game.updateFight` puts them on the catch (`info.slams`) and tells Together. `test/sight-play.mjs` checks the ids now.

## The records board's line

Each player's life list is in the group's shared `records` beside the weights (`together/Together.js`): under `'#'` and their id, `{ who, k: how many kinds, sl: the slams they've had }` (`LifeList.lifeOf`).

- **Written when it changes:** a new kind in your log (`GameState.onChange`, by the log's size), a slam (`lifeChanged( slams )`), and once when the group's records are first read. 400 ms after, so a catch's new kind and its slam go as one `update`.
- **The others told:** a `'life'` message, `1`, or `{ sl: [ ids ] }` for the slams just had, so they toast it ("Robin has had a super grand slam: …"). They read the records again, as they do for a record. A slam had again sends the message only.
- **On the board** (`RecordsBoard.lifeLines`): under the weights, after a chalked rule, "Most kinds: Robin, 5 of 39" (ties named, "and 2 more" past three), and "Slams: Robin's super grand · Sam's billfish" (each player's biggest, three at most). With the line there the board lists seven weights, not eight.
- **The cooler's Records tab** lists everyone's: their kinds of 39, and their slams.
- Older games keep the `'#'` entries when they update the records (`{ ...cur }`), and ignore them.

## Readings

| Check | Result |
|---|---|
| `test/life-list.mjs` (in `pnpm test`) | 42 checks: the count (39), a line for every kind, the slate's kinds' lines 41 characters or fewer and Joe's; a kind's first and best, its day and place, through a save; a protected kind let go counted; a net's bait fish; an old save's log loading with no place or day, blank until its next best, its first unknown; the super grand slam and the billfish grand slam in one day, once a day, the snook first, the note; not across sunrise, nor a sleep with no flats' fish made (`FlatsFishing.update`), but time going on is no sleep; a guest's billfish slam and kinds aboard Robin's boat, his yellowfin in her hold, none of it hers, and no grand slam tip; the board's line, a tie, none |
| `pnpm test` | passes |
| The Log tab at a phone's width, all 39 kinds (`tools/life-list.mjs`, headless on SwiftShader) | see below |
| Two players (`tools/two-players/life.mjs`) | see below |
| Complete check on a clean copy | see below |

## Not verified

- **The timing checks** (the ready A/B, one screen's whole play on one core, the two complete checks that judge the release): the M17 session's, on a quiet machine. Nothing here is in the loading frame: no shader, no texture, no program; the records board's canvas draws as it did, with two more lines.
- **Two devices through All the Spaces:** `tools/two-players` stands in, two real games on one machine, its shared save the browser's.
- **The restaurant order that asks for a slam** (M17.md: "one a restaurant's order may ask for"): not built. An order pays, and the brief for this stream was that a slam pays nothing; whether one should pay is left with the prices to `tools/earnings.mjs` and the user (M18).
- **A real catch's fight to a slam**: the slams were counted from the catch on (`addFish`, `FlatsFishing.caught`, `lifeChanged`, as `Game.updateFight` calls them), not by fighting each fish in a game.
- The real habits in the hints table's blank rows weren't looked up one by one.
