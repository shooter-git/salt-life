# M16: your fleet and Marta

Stream 4. To be folded into `docs/M16.md` and `docs/ARCHITECTURE.md` at the end.

## Marta's list

Marta's panel has two tabs, **Gear** and **Boats** (`game/fleet/FleetPanel.js`, drawn by `GameHUD.renderShop`).

Gear lists what it always did, split into *your gear* (no `on`) and *for the boat you're in* (`on` that boat). Another boat's tracks wait until you're in her. A track added to `UPGRADES` by any stream shows up by itself.

Boats lists yours and those for sale. Each of yours says where she is, her tank, her wear and what she costs a month, with buttons to take her out, sell her, haul her out, repair her, and name and paint her. Each for sale has **Buy**, and one **Trade** button for each boat you own that's worth something. The sportfisher is a silhouette with her name, "Finish your upgrades to unlock it · 12 of 19", a bar and the next few things to get, until she's earned (`Gear.UNLOCK`, `unlockProgress`). Then she has her picture and her price. Once earned she stays earned (`state.earned`), so selling the lobster boat doesn't lock her again.

The unlock counts levels: the lobster boat's twelve ($3,050) and rod, reel and line's seven ($1,435), both as the doc gives them. A level past those (the new big-game rod) doesn't count, nor do the speargun, cast net, tickle stick or lobster traps.

The pictures are `public/boats/<id>.webp`, drawn from each model by `tools/boat-pictures.mjs`. **Run it again when the kayak, console and sportfisher models land**; until then three of the four are the stand-ins.

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
| Kayak | `kayakCrate`, `kayakPaddle`, `kayakAnchor`, `kayakFinder`, `kayakHatch` | `holdKg`, `speedMul`, `anchorM`, `trolley`, `finder`, `jacketRoom` |
| Center console | `consoleEngine`, `consoleTop`, `consoleWell`, `consoleLadder`, `consoleTanks` | `speedMul`, `twin`, `tTop`, `baitMax`, `livewell`, `diveLadder`, `tankRack` |
| Lobster boat | today's eight (lobster traps: stream 9) | as they were |
| Sportfisher | `sfOutriggers`, `sfTower`, `sfElectricReel`, `sfFishBox`, `sfIcemaker`, `sfGenerator`, `sfChair`, `sfUnderwaterLights` | `outriggers`, `tower`, `electricReel`, `holdKg`, `icemaker`, `iceMakesKgH`, `generator`, `fightingChair`, `underwaterLights` |

The models read these through `Vessel.fit( stats )`, which `Game.applyGear` calls whenever gear changes. It does nothing until a boat overrides it. The prices are proposed; `m16/opening` tunes them.

Navigation, the second finder and the deep-water anchor are stream 8's tracks. `on` names one boat, so a thing sold for each boat is a track per boat.

## Fuel

`Gear.FUELS`: diesel $1.50 a litre as it was, gasoline $1.60 (fuel-dock quotes in the Keys and pump prices in the Bahamas put gasoline about 6% over diesel). `fuelOf( boat )` is her fuel or null, `fuelPrice( boat, dieselAt )` her price, also at Pearl's dearer drums. A kayak has no fuel: no row at Marta's or Pearl's, no gauge, nothing burned.

Her burn is stream 8's (`Seaworthy.ABLE`, `fuelBurn( rpm, boat )`). On this branch alone, every engine burns as the lobster boat's. A kayak burns none. Twin outboards are in the console's stats (`twin`), for `ABLE` to take up if a twin's to burn more than a single.

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
| Center console | $35 | $21 | $56 |
| Lobster boat | $40 | $50 | $90 |
| Sportfisher | $72 | $208 | $280 |

Upkeep is 10% of her price a year, the owners' rule of thumb. Real slips run $25 to $40 a foot a month in the Keys and South Florida. The game's boats are priced at about a fortieth of real ones, and its slips are scaled about as far: $1.50 a foot.

She bills every 30th day from the day you first play, at most 3 months at once (a long absence, or a room days ahead). She takes what you have down to your last $20, and the rest goes on her tab. You can't buy another boat until it's settled, and she never takes a boat for it. A clock behind yours, in a room on an earlier day, owes nothing.

## Where they're kept

`fleet/Berths.js`, `berthOf( id )`, `boatCtl.berth`:

- **Lobster boat:** east of the pier head, as ever.
- **Center console:** west of it, the same way round.
- **Sportfisher:** alongside the pier head's seaward face, bow east. It's the only 15 m of edge the pier has, with 4.5 m of water.
- **Kayak:** on the sand. Her berth is the water's edge beside the pier's foot, and she lies up the sand from there (the kayak stream's `atHome`; `ashoreOf` for what's drawn of her). Nobody ties a kayak to a pier.

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

Others don't see your name or paint yet: `together/` would need them in the pose.

## Other streams

- **For the merge (stream 8):** `Away.wearRate( w, boat )` and `awayOf`'s `env.boat` already use each hull's own storm figure (`Hull.HULLS`). `Seaworthy.ABLE`'s `storm` through `env.wearMul` would count it twice: keep one. `HULLS` is the one to keep, because it also covers a storm while you're playing.
- `.gm-list`'s line in `renderShop` is one that streams 7, 8 and 9 all add to. Theirs go in the Gear half of the `boats ?` choice.
- `Gear.js`' `UPGRADES`: rows filter themselves, so `DAYS_TRACKS` and the traps track show under the boat's own heading.
- `Together.mineBoat`'s berth is `berthOf`. The rest of `Together.js` still means the lobster boat's berth by `WORLD.boatDock`: stream 5's "Marta's dock holding more than yours".
- `App.setBoat` now also calls `lightUp( model.group )`, without which a boat you changed into had none of the world's local lights, wet or cloud shadows.

## Sources

- Slips: [Miami-Dade marina fees](https://www.miamidade.gov/parks/library/marina-fees.pdf) ($22 to $25.50 a foot a month, annual), [Key West dockage guide](https://www.oceansedgekeywest.com/blog/30560/guide-to-marina-dockage-in-key-west), [Florida marina costs](https://improvesailing.com/cost/cost-of-keeping-a-boat-in-a-marina-in-florida).
- Upkeep: the "10% rule", [TrawlerForum](https://trawlerforum.com/threads/the-10-rule-for-maintenance-how-close-are-you.32604), [7 to 10%](https://nextjournal.com/lakenwatersports/boat-ownership-costs-fuel-maintenance-and-more-explained). Anecdotal, as such rules are.
- Fuel: [Keys Fisheries Marina fuel prices](https://www.waterwayguide.com/marina/1-10877/keys-fisheries-marina) (diesel $5.40, 89 octane $5.55), [Bahamas pump prices](https://www.globalpetrolprices.com/Bahamas/).
- Haul-outs: [Port of Astoria](https://www.portofastoria.com/boatyard-rates) ($10 a foot under 50 ft, round trip), [Port of Friday Harbor](https://www.portfridayharbor.org/wp-content/uploads/2023/12/Boatyard-Rates-01-01-24.pdf) ($12 to $14 a foot).
