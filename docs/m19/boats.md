# M19, stream BOATS: the Pilot's pedals and pole, the console's trolling motor, Power-Poles and radar, the bow anchors, and the crawfish rules

Stream BOATS of [M19.md](../M19.md), built 2026-11-13 on `m19-boats` from `m19` (231c6e7). It covers:
- the kayak's pole and pedal drive, and standing in the Pilot;
- the console's trolling motor, Power-Poles and radar;
- the console's and the sportfisher's bow anchors (M18's);
- the lobster boat's bigger hauler;
- the traps' `most` and the Bahamas' crawfish rules, as the user decided them.

Sources: [sources-boats-bait.md](sources-boats-bait.md).

## The kayak as the Pescador Pilot 12

**The pedal drive** (the Paddle track's third level, `pedal`: Gear's label calls her the Pilot):
- **Speed:** W pedals her at 3.0 knots and Shift at 3.6, an owner's figures (`kayak/Pedal.js`' `pedalling`, `PEDAL`). The prop's thrust is fitted to her own resistance, so it goes as the effort's 2.5th power and falls off toward its pitch speed. Astern at 60%.
- **Hands free:** the rod's out as you pedal, with the paddle laid by.
- **Steering:** A and D work her hand rudder, a lifting surface at her stern; she turns as she goes.
- **Depth:** in less than the drive's 18 in of water its prop's on the bottom and gives nothing.

**Stood up** (the Pilot only; owners and reviewers stand in her with care):
- Space stands you up when she's nearly still (under 0.6 m/s), and sits you down. Your eye is 1.7 m over the water (judgement), so you see further into the flat and stand taller to the fish.
- With her pole, W and S pole her in water it reaches the bottom in, up to 1.6 m (`poling`, `POLE`): 45 N at rest, nothing from 1 m/s (judgement). A and D turn her about it. Poled, she's silent: there's no paddle to knock her hull.
- Sat, the pole only stakes her out.

**The stake-out pole** (`kayakPole`, 8 ft running out to 12, $110):
- K drives it down through the scupper at her stern in up to 2.9 m (the sources' derived), and she swings about it (`BoatController.stake`, one pole); K again pulls it.
- **Drawn:** stowed in its clips along her starboard side, or standing in the scupper, staked (`KayakHull.js`' `pole` and `staked`).
- **Copies:** others see her staked (her fit's `staked`).
- **Saves:** a save made while she's staked keeps her held there, as at anchor.

**Drawn:** her drive in its well ahead of the seat (the crank, its pedals, the leg down through her and its prop), the rudder's lever and its blade, each folded away until it's bought, as her crate and cooler are. Her hull is still the Pescador 12.0's, with the Pilot's drive.

## The console's trolling motor, Power-Poles and radar

**The trolling motor** (`consoleTrolling`: a Riptide Terrova 112, 498 N, 72 in shaft):
- M at her helm puts it down over her bow, in place of her outboards. Her engines' revs run down to nothing (`BoatController.trolling`, `_troll`).
- **Driving:** the lever drives it ahead or astern, and the wheel turns the motor itself, so she turns from rest.
- **Speed:** flat out she makes 3.94 knots, the sources' 4. Its thrust falls from 498 N to 314 N there: a pitch speed of 5.5 m/s, judgement.
- **Quiet:** to the fish there's no engine on it, only her hull's push (`ConsoleModel.noise`, through SEE's `Vessel.noise`).
- **Depth:** it won't go down in under 0.75 m of water.
- **Not modelled:** its batteries (1.9 h flat out, by the sources) and Spot-Lock (the user's: none).

**The Power-Poles** (`consolePole`: a pair of Blades, 8 ft):
- K aboard her runs them down: 4 s on, she's held where they went in, her heading too (`stake`, two poles). K again brings them up.
- **Depth:** only in up to 2.4 m of water.
- **Saves:** a save made while she's staked keeps her held, as at anchor.

**The radar** (`consoleRadar`, needs the T-top: an 18 in dome):
- Her plotter's split: the chart in its left half, the radar's picture in its right. A small boat's one display does that, and her panel has room for only two screens (`Instruments`' `split`, App's reading).
- The dome turns at 24 rpm (`radarBearing`).
- A guest riding in her sees it split too.

**Drawn** (`console/ConsoleFittings.js`), each in her one fittings mesh under its own fitting, the state that isn't so left undrawn:
- the motor stowed along her foredeck, or down over her bow with its pod 0.6 m under the water;
- the two Power-Poles' housings on her transom's corners, their blades standing up or run down behind her;
- the dome on her T-top.

**Copies** draw each as she is (her fit's `trolling`, `powerPole` and `radar`, and how she is now: `motorDown`, `poleDown`).

**Triangles:** 764 more on her model (33,499 of her 35,000), 304 more on the kayak's (6,390 of 7,000).

**The wheel and the Guide:** the actions wheel has "Trolling motor" or "Outboards", and "Power-Poles", "Poles up", "Stake out" or "Pull the pole", each with its own picture; "Stand up" or "Sit down" in the Pilot. The Guide tells each the first time you're at it with it bought.

## The bow anchors (M18's)

- **The console:** her anchor's let go and got up on her foredeck by the locker and the stem's roller, as the lobster boat's is (her `bowAnchor`, `Game.updateBow`). Her anchor isn't drawn on her roller while it's down (her fitting `anchorStowed`, `setAnchorStowed`).
- **The sportfisher:** her foredeck isn't walked, so hers is worked by the windlass switch at her bridge console's starboard end. Only on the bridge: her `bowAnchor`'s `y`, read against where you stand. The prompt says "Windlass: let go the anchor" and "Windlass: get the anchor up".

## The lobster boat and the crawfish

- **The bigger hauler** (`hauler`'s second level, $600): 1.9 m/s, a Hydro-Slave 12 in head on an 11 gpm pump, derived (`Traps.haulS`). A trap comes up from 20 m in 10.5 s, not 16.7.
- **The traps' catch** (`SOAK.most`): 3.85 lobsters a haul on the best ground, the user's.
- **The Bahamas' crawfish rules, a resident's** (the user's: [M19.md](../M19.md)):
  - the gauge's 3¼ in of carapace (8.26 cm: `minCm` 24.3), not Florida's 3 in;
  - no bag a day;
  - no more than 250 lb aboard (`aboardKg`). The next is let go, and the card and the toasts say why: "That's 250 lb of them aboard, the most she may carry".
  - **A trap's set only with the crawfish trap permit** ($50 at Marta's: Gear's `trapPermit`), at your own hauler or when a guest asks your game to. Traps already set can still be hauled.
  - The closed season waits for the island to have seasons.
- **What the gauge does:** the same lobsters, fewer of them legal. On the reef's edge 36% of a haul is legal, where M16 had a little over half at 3 in. With `most` at 3.85, a trap brings in about a third less to sell than it did.

## The moored bakes

- **Re-baked:** the console's and the kayak's (`tools/moored-bake.mjs`), so that a boat you own and aren't in shows what's fitted to her: the console's motor stowed, her poles up and her dome; the kayak's pedal drive and her pole in its clips (MooredLooks' `LOOK_PARTS`).
- **Her anchor on her roller** is always there as she's left: a part that's on in every way she's fitted (`always`), not a way to fit her. That keeps the bake's ways to fit her (two to each part) from doubling again.
- **Each moving fitting is one part:** each state carries its own mount.

## Tests

- **`test/boats-m19.mjs` (new), on the real boats in Node:**
  - the Pilot pedalled at 2.95 and 3.58 knots, turned by her rudder, astern; nothing in 0.3 m;
  - poled stood up at 0.86 m/s in a metre of water, nothing in 3 m;
  - staked out at 1.2 m/s, her stern straying 0.23 m;
  - the console on her trolling motor at 3.94 knots with her revs gone, turned by the wheel from rest, quiet to the fish;
  - on her Power-Poles, held and her heading kept;
  - her fittings drawn, and on copies;
  - her radar's sweep; her bow anchor and the anchor off her roller; the sportfisher's windlass; the hauler.
- **`test/traps.mjs`:** the gauge's 3¼ in, no bag, 250 lb aboard (75 kept in a day, then the next goes back); about a third legal on the reef's edge.
- **`test/game-logic.mjs`:** the gauge's rule.
- **`test/moored-looks.mjs`:** the new parts, and the anchor always on.
- `pnpm test` passes.

## What's left

- **Judgement:**
  - the pedal drive's figures past the owner's speeds;
  - poling's push;
  - the standing eye;
  - the trolling motor's pitch speed;
  - the rudder's area.
- **Not modelled:**
  - the trolling motor's batteries;
  - a Power-Pole not holding on rock or coral;
  - a splashing anchor spooking the flats' fish;
  - the Pilot less steady stood up;
  - the Pilot's own hull and frame seat.
