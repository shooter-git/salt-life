# M16: your fleet and Marta

Stream 4 of [M16](../M16.md): what the fleet is and what it costs. [ARCHITECTURE.md](../ARCHITECTURE.md) (Your fleet) says where it sits in the code.

## Marta's list

Marta's panel has two tabs, **Gear** and **Boats** (`game/fleet/FleetPanel.js`, drawn by `GameHUD.renderShop`).

Gear lists what it always did, split into *your gear* (no `on`) and *for the boat you're in* (`on` that boat). Another boat's tracks wait until you're in her. A track added to `UPGRADES` by any stream shows up by itself.

Boats lists yours and those for sale. Each of yours says where she is, her tank, her wear and what she costs a month, with buttons to take her out, sell her, haul her out, repair her, and name and paint her. Each for sale has **Buy**, and one **Trade** button for each boat you own that's worth something. The sportfisher is a silhouette with her name, "Finish your upgrades to unlock it · 12 of 19", a bar and the next few things to get, until she's earned (`Gear.UNLOCK`, `unlockProgress`). Then she has her picture and her price. Once earned she stays earned (`state.earned`), so selling the lobster boat doesn't lock her again.

The unlock counts levels: the lobster boat's twelve ($3,050) and rod, reel and line's seven ($1,435), both as the doc gives them. A level past those (the new big-game rod) doesn't count, nor do the speargun, cast net, tickle stick or lobster traps.

The pictures are `public/boats/<id>.webp`, drawn from each model by `tools/boat-pictures.mjs`. They were drawn again from the real models once those landed ([opening.md](opening.md), The real boats); run the tool again after any change to a boat's look.

## Buying, trading in, selling

| | Of what you paid | Of her upgrades |
|---|---|---|
| Trade-in | 60% | 40% |
| Sold for cash | 50% | 30% |

Either way, less what she'd cost to repair. A trade-in pays better because Marta is making a sale too. These rates are my estimate: I found no source for them. A boat that came with the game has no price paid: a kept lobster boat counts at her list price, so someone who's played since before M16 isn't offered a fifth of what she sells for, and a free kayak counts as nothing but her gear.

A boat's tracks go with her: sell her and they reset, and buying one again starts bare. You can't sell the boat you're in, or your last. Trading in the boat you're in puts you in the new one, and a boat of yours out at sea comes home for the tow fee.

## Each boat's gear

From the doc's table, in `Gear.js` with `on`:

| Boat | Tracks | Stats they give (`state.stats`) |
|---|---|---|
| Kayak | `kayakCrate`, `kayakPaddle`, `kayakAnchor`, `kayakFinder`, `kayakHatch` | `holdKg`, `speedMul`, `anchorM`, `trolley`, `finder`, `dryHatch` |
| Center console | `consoleEngine`, `consoleTop`, `consoleWell`, `consoleLadder`, `consoleTanks` | `speedMul`, `twin`, `tTop`, `baitMax`, `livewell`, `diveLadder`, `tankRack` |
| Lobster boat | today's eight (lobster traps: stream 9) | as they were |
| Sportfisher | `sfOutriggers`, `sfTower`, `sfElectricReel`, `sfFishBox`, `sfIcemaker`, `sfGenerator`, `sfChair`, `sfUnderwaterLights` | `outriggers`, `tower`, `electricReel`, `holdKg`, `icemaker`, `iceMakesKgH`, `generator`, `chair`, `underwaterLights` |

The kayak's last track gives `dryHatch`. The fleet's first cut called it `jacketRoom`, after M16.md's "a life jacket's worth of room"; the opening stream renamed it when the idea turned out not to make sense ([opening.md](opening.md), The gear that did nothing). The models read these through `Vessel.fit( stats )`, which `Game.applyGear` calls whenever gear changes; each boat's model overrides it for what she has fitted.

The prices are the ones in `Gear.js`, tuned in [opening.md](opening.md) (The prices): the first guesses stand but for the console's boat, which went from about $2,500 to $1,800.

Navigation, the second finder, the deep-water anchor and the drift sock are days out's tracks (`Seaworthy.DAYS_TRACKS`, [days-out.md](days-out.md)). `on` names one boat, so a thing sold for each boat is a track per boat.

## Fuel

`Gear.FUELS`: diesel $1.50 a litre as it was, gasoline $1.60 (fuel-dock quotes in the Keys and pump prices in the Bahamas put gasoline about 6% over diesel). `fuelOf( boat )` is her fuel or null, `fuelPrice( boat, dieselAt )` her price, also at Pearl's dearer drums. A kayak has no fuel: no row at Marta's or Pearl's, no gauge, nothing burned.

Her burn is her own figure in `Seaworthy.ABLE` (`burn`: litres a second at idle and at full revs), read by `Gear.fuelBurn( rpm, boat )`. A kayak burns none. The console's twin outboards (`twin` in her stats) don't burn more than a single: `ABLE` has one figure for the console.

## Her hull

`Hull.HULLS`: each boat's figures, the lobster boat's being M10's constants, unchanged.

| | Reaches the engine (L) | Rain in (L/s) | Worn leak (L/s) | Full repair |
|---|---|---|---|---|
| Kayak | no bilge, no engine | 0 | 0 | $25 |
| Center console | 200 | 0.02 (self-bailing) | 0.3 | $90 |
| Lobster boat | 500 | 0.1 | 0.5 | $150 |
| Sportfisher | 1,500 | 0.05 (self-bailing cockpit) | 1 | $900 |

She takes slams, knocks and storms by her own figure too. A big boat is worked less and a light one pounded more. These are judgement, not sources. A kayak has `engine: false`: running while paddled, no cranks, no stalls, no fuel.

## Slips and upkeep

`Fleet.FLEET`. The island's month is 30 of its days, about 20 hours of play or 30 days away.

| | Slip | Upkeep | A month |
|---|---|---|---|
| Kayak | nothing, on the sand | nothing | $0 |
| Center console | $35 | $15 | $50 |
| Lobster boat | $40 | $50 | $90 |
| Sportfisher | $72 | $208 | $280 |

Upkeep is 10% of her price a year, the owners' rule of thumb: $15 a month on the console's $1,800, $50 on the lobster boat's $6,000, $208 on the sportfisher's $25,000. Real slips run $25 to $40 a foot a month in the Keys and South Florida. The game's boats are priced at about a fortieth of real ones, and its slips are scaled about as far: $1.50 a foot.

She bills every 30th day from the day you first play, at most 3 months at once (a long absence, or a room days ahead). She takes what you have down to your last $20, and the rest goes on her tab. You can't buy another boat until it's settled, and she never takes a boat for it. A clock behind yours, in a room on an earlier day, owes nothing.

## Where they're kept

`fleet/Berths.js`, `berthOf( id )`, `boatCtl.berth`:

- **Lobster boat:** east of the pier head, as ever.
- **Center console:** west of it, the same way round.
- **Sportfisher:** alongside the pier head's seaward face, bow east. It's the only 15 m of edge the pier has, with 4.5 m of water.
- **Kayak:** on the sand. Her berth is the water's edge on the open sand 11 m west of the pier, at x 44, z -38, and she lies up the sand from there, at an angle to the water (the kayak stream's `atHome`; `ashoreOf` for what's drawn of her). It was x 59.5, beside the pier, until a new game's view down the boardwalk turned out not to show her (barrels hid her: [opening.md](opening.md), The start). Nobody ties a kayak to a pier.

Only the boat you're in is built. Each other you own is drawn by `fleet/MooredBoats.js` from `fleet/MooredModels.js`: a few hundred triangles at her real size and shape, her paint in its vertices, showing what's fitted (T-top, twins, tower, outriggers, chair), riding the waves. Made after the start, so never in the loading frame. A box keeps you and the boat you're in off each.

Beside one at her berth, E takes her out, saying what it'd cost to fetch the other. `FleetDesk.takeOut` calls `App.setBoat` and charges the tow if the one you were in was out.

## Haul-out, for every boat

By the foot, as a yard bills it (real yards $10 to $15 a foot; scaled as the slips are): kayak $5, console $35, lobster boat $40 as it was, sportfisher $90.

The lobster boat keeps the village's cradle. The others have a spot each in Marta's yard (`StormPlaces.YARD`, `yardPose`): keel blocks along their length and stands under their bilges (`standsGeometry`), their height set from the ground under them. A boat you're not in can be hauled and put back from her row, and comes back in with the others when the hurricane's gone by and Marta's open.

A storm works the boats you're not in, at their berths, by their own figures, while you play and while you're away.

## Away, per boat

`saltlife.boat` says which boat she is (`boat`, `leftOf`; an old record is the lobster boat). The others lie at their berths or cradles from the same T, because one out at sea comes home when you get into another. `Away.othersAway` reckons each at her own berth, with her own haul fee and hull. `tellOthers` adds them to Marta's note by what you call them.

## Name and paint

`state.fleet[ id ].name` (free, 24 letters, no markup) and `.paint` (`Fleet.PAINTS`, eight colours, for the yard's price by her size).

`Vessel.setPaint( hex | null )` sets `materials.hull.color`. The lobster boat's topsides were a constant in her shader and are now a uniform, the same white by default. A model whose colour is elsewhere overrides it.

Her name goes on her transom (`fleet/BoatName.js`), gold on dark paint and black on pale, placed from `Vessel.transom` or her lines. It's made only once she's named, and adds one draw call.

Others see both: her paint goes in the pose with what's fitted on her (`f`), and her name every 50 poses ([together.md](together.md), What's on her, for everyone).

## What it costs

Worst case on low, three boats drawn at once (you own all four and you're in the kayak): 1,518 triangles and about 160 KB of geometry, three draw calls, one more once she's named, one each for those on blocks during a hurricane. The pictures are 26 KB on disk, from the real models ([opening.md](opening.md), Budget). Nothing's built before ready: the moored boats wait for the start, so they're not in the first compile.

## Where it joins the rest

- A hull's storm wear is `Hull.HULLS`' own figure: `Away.wearRate( w, boat )` and `awayOf`'s `env.boat` read it, and so does a storm while you play. `Seaworthy.ABLE` has no storm figure, so it is counted once.
- `GameHUD.renderShop`'s list is the `boats ?` choice: the Boats tab (`fleetRows`), or the Gear tab, where days out's rows, the traps' row and the track rows are. `Gear.js`' `UPGRADES` rows filter themselves by `on`, so `DAYS_TRACKS` and the traps track show under the boat's own heading.
- `together/Together.js` takes every boat's berth from `berthOf` (`mineBoat` and the away boats: [together.md](together.md), Every boat's berth), and `Away.awayOf` is given the dock as `env.dock`. `WORLD.boatDock` is still the pier head where `Chart.HOME` (the way home in the HUD's panel) and `Help.js` measure from.
- `App.setBoat` calls `lightUp( model.group )`, without which a boat you changed into had none of the world's local lights, wet or cloud shadows.

## Sources

- Slips: [Miami-Dade marina fees](https://www.miamidade.gov/parks/library/marina-fees.pdf) ($22 to $25.50 a foot a month, annual), [Key West dockage guide](https://www.oceansedgekeywest.com/blog/30560/guide-to-marina-dockage-in-key-west), [Florida marina costs](https://improvesailing.com/cost/cost-of-keeping-a-boat-in-a-marina-in-florida).
- Upkeep: the "10% rule", [TrawlerForum](https://trawlerforum.com/threads/the-10-rule-for-maintenance-how-close-are-you.32604), [7 to 10%](https://nextjournal.com/lakenwatersports/boat-ownership-costs-fuel-maintenance-and-more-explained). Anecdotal, as such rules are.
- Fuel: [Keys Fisheries Marina fuel prices](https://www.waterwayguide.com/marina/1-10877/keys-fisheries-marina) (diesel $5.40, 89 octane $5.55), [Bahamas pump prices](https://www.globalpetrolprices.com/Bahamas/).
- Haul-outs: [Port of Astoria](https://www.portofastoria.com/boatyard-rates) ($10 a foot under 50 ft, round trip), [Port of Friday Harbor](https://www.portfridayharbor.org/wp-content/uploads/2023/12/Boatyard-Rates-01-01-24.pdf) ($12 to $14 a foot).
