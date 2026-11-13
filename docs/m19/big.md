# M19, stream BIG: the biggest blue marlin landed alone, a line for each rod, and the sportfisher's mate, teasers and gyro

Stream BIG of [M19.md](../M19.md), built 2026-11-13 on `m19-big` from `m19` (bde7cbc). The user's decision: the biggest blue marlin, 400 to 450 kg, landable by one player, by 130-class tackle and by a hired mate backing her down, the sweep to set the figures. With it, M18's fight-and-tackle fixes, and the sportfisher's teasers, gyro and VHF whips. Sources: [sources-big-game.md](sources-big-game.md).

## The biggest blue marlin

A blue marlin from the chair, 20 fights each (`tools/fight-sweep.mjs`), landed and the mean time of those landed:

| | 80 lb, 80-class | 80 lb, 80-class, the mate | 130 lb, 130-class | 130 lb, 130-class, the mate |
|---|---|---|---|---|
| 250 kg | 100%, 9 min | 100%, 4 min | 100%, 5 min | 100%, 3 min |
| 300 kg | 100%, 12 | 100%, 4 | 100%, 7 | 100%, 3 |
| 350 kg | 100%, 17 | 100%, 5 | 100%, 9 | 100%, 4 |
| 400 kg | 0% | 100%, 6 | 100%, 10 | 100%, 4 |
| 450 kg | 0% | 100%, 6 | 100%, 13 | 100%, 5 |

So the 80-class alone stops where M17 left it (it holds 869 m; a 400 kg fish runs it out), and either of the user's two answers lands the biggest: the heavier line, half as hard on the fish's pull and on a 914 m spool, or the mate taking the line back as she closes on it. Both together are the quickest. 60 lb on the 50-class with the mate lands a 450 kg one three times in ten. `test/lines.mjs` holds these: the 80-class alone still none at 400 kg; 450 kg landed at least four times in five on 130 lb alone, on 80 lb with the mate, and quickest with both.

## The 130-class tackle

- **The line's sixth level:** 130 lb mono, IGFA's 60 kg class, $1,000 on the line's own price ladder.
- **The reel's sixth:** a 130-class two-speed (Shimano's Tiagra 130, Penn's International 130: 914 m of 130 lb, 40 kg and more of drag) with its bent-butt chair rod, $2,000 (the reel $1,470 to $1,520, the rod $470 to $800).

## A line for each rod, and the spool by the line (M18's)

- **What you cast** (the float, the sinker) is on your light tackle: your best casting rod (to the 9 ft surf rod), a reel up to the conventional, the heaviest line you have up to 30 lb. **What you troll, fly a kite on or drop, and fight off a holder or from the chair**, is on your heavy tackle: the best of everything (`Gear.tackleOf`, `gearStats`' `light`; `Rigs.tackle` and `rodGear` by the rig, the rod in your hands swapped as you pick one). So with 130 lb bought, a bonefish isn't fought on it, and the stand-up rod no longer casts a float (30 m where the surf rod casts 45).
- **Each reel takes the heaviest line you have up to its class**, as anglers match them (`REEL_LB`: the spinning reels 15 and 30 lb, the conventional 30, the 50-class 60, the 80-class 80, the 130-class 130). A 50-class reel with 80 lb bought still takes the 60, which it holds more of.
- **A reel holds more of a thinner line**: metres × diameter² is one figure for a spool (every maker's chart, to within 1% on the big reels). `SPOOL_V`, the reels' (the sources'), over `LINE_D`, each line's diameter: so the 50-class two-speed holds 684 m of 60 lb and 499 of 80 (it had 600 of either), the conventional 302 m of 30 lb (350); the old spinning reel's 180, the smooth one's 220, the 80-class's 869 and the 130-class's 914 stand.
- **Braid is counted as mono of its strength, not at its own thinness. Judgement.** At its own diameter (a third of mono's area) a 50-class reel holds two kilometres of 60 lb braid, and in the sweep a 367 kg blue marlin was landed on it from the chair every time: the heavier tackle and the mate would mean nothing. A big-game reel is filled with mono, or mono over braid backing, for its stretch and against the bill. Counting braid's own thinness is a choice for the user if they want it.
- **What it moves against M17's sweep** (`test/lines.mjs`): 60 lb on the 50-class from the chair lands more (a 232 kg blue marlin, a 225 kg swordfish: 684 m against 600); the 80 lb chair-and-harness checks moved to the 80-class reel (on the 50-class, 499 m of 80 lb now runs out first). Nothing else that landed got harder.
- **The sinker's and the troll's reach** follow: a sinker's cast on your light spool, a trolled line and a fish off its holder on the heavy.

## The mate (`game/rigs/Mate.js`)

- **When:** on the sportfisher with him hired (`sfMate`, nothing to hire), a fish on (yours, or a guest's aboard her: Together's crew, their line's end), you off her helm on her deck or in her chair, no one else at it, her engine running and fuel in her: he takes her helm (`BoatController.helmsman`) and says so. When the fish is off, or you take her helm, she's yours again, stopped, her anchor not let go for it.
- **How:** her stern brought round to the line on her twin screws, stopped (the wheel swings her as going ahead), then astern toward the fish, the wheel holding her stern on it (astern at speed it's the other way round). The closing speed he wants (`mateTarget`): 3 m/s in a calm sea, down to 1 m/s in 3 m of it, easing off from 60 m to nothing at 15. Boat tests back a sportfisher down at 3.3 to 4.6 m/s with no water over her transom; the taper by sea is judgement.
- **On the real sportfisher in Node** (`test/mate.mjs`): a fish astern, her stern on it at once, held within 13 degrees, closing at 3.1 m/s; abeam, on it in 10 s and within 33 degrees, 3.05 m/s; ahead, 17 s, 12 degrees, 3.3 m/s; on her quarter, 5 s, 12 degrees, 3.3 m/s; in 3 m of sea, 0.7 m/s.
- **The fight** isn't changed: the boat's closing speed already took line back (`CatchMinigame`, up to 3 m/s). **The rider's fix:** riding someone else's, your fight took your own moored boat's velocity, so her owner's backing down never reached it; it's hers now (`Game._riddenVelocity`, from how she moves on your screen).
- **The sweep** models him (`fightOnce`'s `mate`: his speed with her lag, 3 s, once he's had her helm and her stern round, 12 s; `+mate` cells for every reel with a drag) and a second player at her helm (`backing`).
- **His pay:** $200 for each day of a trip she's out with him (the first as she leaves her berth, then each 24 hours out: DaysOut's `out`; the days paid kept in the save, `days.mate`, a new trip a new day), on your money or Marta's tab. A private boat's mate gets $200 for a fishing day.
- **Seen:** a stand-in figure at her helm (`Figure.js`, one mesh, made the first time he takes it), on your game and on others' copies (her pose's `Mt`).

## Teasers, the gyro, long seas, the whips

- **Teasers** (`sfTeasers`, $500): with her spread out, billfish raised to the baits 1.3 times as often (`Presentation.TEASE`). No study measures it: judgement. Drawn: a line each side from her bridge's after corners to a daisy chain of squids some 14 m astern (`RigMesh.teasers`), on your boat and on her copies (her fit's fourth bit).
- **The gyro** (`sfGyro`, $3,000, needs the generator): on, out at sea with her generator and fuel, spinning up over 35 s of play (a Seakeeper's 21 minutes at the island's 36 times), burning the generator's 3.8 L an hour with the icemaker or without. Modelled as precession against her roll, a damping of her roll's inertia (`BoatController`'s `GYRO`). On the real sportfisher in Node, knocked over at rest she rolls half as far with it (5.5 degrees, 2.8). **Short of a Seakeeper's 82 to 95%**, which is for rolling in a sea: her hull rights her slowly from a heel, and a damper slows a roll without changing the heel she settles at. Judgement.
- **Long seas aboard** (M18's): a long sea's own breaking heads (Whitecaps' third carrier) come aboard now as the short seas' rollers do (`foamAt`'s `long`); before, one could go through her. Still at most one a 6 s.
- **The whips:** two 8 ft fibreglass VHF whips on steel mounts at her hardtop's after corners, raked a little aft (Shakespeare's 5225-XT, Digital Antenna's 529-VW), where her radio's reach was worked out from. Her moored bake made again (139.2 KB, 137.7 before).
- **Prices:** her fittings at about a tenth to a fortieth of real ones, as she is (real teasers about $1,000; a Seakeeper 6 fitted about $92,000).

## Tests

- `test/mate.mjs` (new): how fast he wants it; backing down from every bearing on the real sportfisher; slower in a big sea.
- `test/lines.mjs`: the biggest blue marlin (above); the M17 sweep against what moved.
- `test/foundation-m19.mjs`: the gyro (now precession), the fly rods' line with a conventional reel.
- `pnpm test` passes (M19.md).

## What's left

- The teasers' raise, the gyro's figure, the mate's taper by sea, and counting braid as mono: judgement.
- The two-player run of the mate (`tools/two-players/crew.mjs`, a guest in her chair with her owner's mate) wasn't run: the mate and the rider's fix are tested in Node.
