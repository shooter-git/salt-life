# Ways to fish, and your own gear (stream 7)

The rod used to do one thing: one float, tethered where it landed, biting only while it floated, with no depth to its hook. Now what's on the line is a rig (`game/rigs/`), the hook is as deep as it really is, and there are three new ways to fish past the float.

## How it plays

`C` (LB on a gamepad, the Rig button on touch) changes the rig with the rod out, `B` the bait, as before. The chip by the purse says which, and how far down the hook is.

- **Float.** As it was, the hook hanging at most 5 m under it. It fishes everything near the top and the reefs, and no longer the bottom of deep water: a float in 80 m of water doesn't reach the snappers.
- **Sinker.** Cast, and a lead takes the hook down at 1.5 m/s until it's on the bottom, or 250 m, as much line as you can work by hand, or your spool's end. No float: you watch the rod's tip nod. It's free, and it's how you fish the deep shelf and the ledges now.
- **Troll.** One press of the cast button lets a line out to a rod in its holder: two flat lines off the stern on any boat with an engine, and with the sportfisher's outriggers (`stats.outriggers`) two more off their tips and a shotgun up the middle, five in all. A paddled or seated boat has one. Then you go to the helm and run. Strikes come by speed. When a rod goes off its reel screams and you've 40 s to get to it (`R`, within 3.6 m of its holder) before the fish throws the hook. The right button brings the rest in. Leaving the helm with lines out doesn't drop the anchor.
- **Kite.** Off the stern in 5 to 25 knots of wind, needing the stand-up rod and a live bait. The kite flies downwind with the fishing line through a clip on its line, so the bait splashes on the surface about 60 m off with no line in the water to be seen. The bait goes nervous, then it's taken: strike as on a float. Mostly sailfish.
- **Deep drop.** With the sportfisher's electric reel (`stats.electricReel`), a heavy lead straight down to 900 m at 2.5 m/s, a long wait, and a long way back at 4.5 m/s. The motor stalls at its drag, so it can't break the line on a run. By day it's the swordfish's way.
- **Chum.** Pick it with `B` and press: it goes over the side, and a slick drifts downwind for 5 minutes. Fish up the slick bite sooner, as they do under a boat's floodlights.

At the helm with lines out, holding the throttle holds her at the speed the slowest bait swims (a trolling valve), the prompt says the speed and whether the baits are swimming, and Shift runs her flat out. A line let out goes back even with her stopped, so it's never left under the hull.

## The fight

With a real drag (the conventional reel and up, `dragKg`) a fish pulling past what the drag holds strips line from the reel instead of breaking it, so a fish far over the line can be fought. What it beats you with is your spool (`spoolM`), and running out is "Spooled". Lean into a run on the reel and the line can still go. A fish within the drag fights exactly as it did; the spinning reels have no drag to speak of, and their fights are unchanged.

What you can lean back against is the other limit (`HOLD_KG`): 10 kg by hand, 18 in the stand-up rod's harness, 40 in the fighting chair (`Vessel.chair`, `stats.chair`; `E` near it during a fight). Your arms tire against the load, hardly at all in the chair, and when they go you hold less and reel slower. A boat running from the fish takes line out; a helm backing down on it gets it back.

A careful player lands a 200 kg blue marlin from the chair on 60 lb braid and the two-speed reel 29 times in 30 (`test/tackle.mjs`), in about ten minutes, having been up to 600 m out. Standing on the same tackle it spools them every time, and so it does on 30 lb and the conventional reel.

Billfish and mahi jump in the fight (`leaps`): the fish's own model comes out of the water at the end of the line.

## Your gear (`Gear.js`, no `on`)

- **Rod 4, stand-up trolling rod** ($600): modelled on its own (`rigs/BigRod.js`), its reel on top, roller guides, a gimbal butt. Shorter cast, and the harness's hold.
- **Reel 4, two-speed lever drag** ($900): 24 kg of drag, 600 m of line, and low gear gets line back from a fish that's over the drag.
- **Leader:** the right one of those you've bought is tied on for what you're doing (`leaderFor`). Teeth (`teeth`) go through anything but wire, a bill (`bill`) wears through all but wire and 200 lb mono, and shy fish (`shy`) keep away from wire, less so 200 lb, and come more to fluorocarbon.
- **Lures:** jigs on a sinker, plugs cast with no float or trolled slowly, skirts towed. Never used up.
- **Landing:** by hand you lift 12 kg for sure, and past that more and more shake off at the boat. A gaff lifts anything. The dehooker and tag kit are `stats.dehooker` and `stats.tagKit`, for the fish stream's release bonus. A fish that's let go only needs holding by the leader, so it never shakes off.
- **Polarized glasses:** cut the sea's reflection, most at Brewster's angle and about half along the surface (`glareLeft`), and show dark shapes of fish under the weed, debris and birds (`fishSeen`). They show by the angle you're looking down at, so from a deck's 3 m only about 40 m off, from a tower's 14 m past 100 m.
- **Dive kit:** swims 1.45 then 1.65 times as fast; a breath of 80 s against 50; a tank of 6800 s at the surface's rate, which runs down one atmosphere faster every 10 m, so about 45 minutes at 15 m. It's fresh each time you're out of the water.
- **Safety:** `stats.lifeJacket` for the kayak's capsize, `stats.flares` and `stats.epirb` for `DaysOut`.

New bait from Marta by the trip: frozen ballyhoo ($20 a dozen), frozen squid ($12 for six), chum ($15 a block).

## The fish's side

As agreed with the fish stream (`docs/m16/fish.md`): `Game.habitat()` hands Bites a habitat scaled to where the hook is (`atHook`), with `habitat.hook` on it (`way`, `depth`, `lure`, and for this side `kind`, `floorM`, `knots`, `lines`, `leader`). The fish table's `ways`, `at` and `eats` say who takes what. Round Bites, `pickOnRig` adds what speed and which leader do by turning away that share of what it offers, and `waitOnRig` the rig's wait. A fish's entry can also say `knots`, `teeth`, `bill`, `shy` and `leaps`; `Presentation.js` has them otherwise. With no hook, as in every older test, nothing changes.

## From real ones

| What | Real | Here | Source |
|---|---|---|---|
| Rigged ballyhoo | 8 to 10 knots usual, washes out at 16 to 18 | swims best 5 to 10, torn off past 15 | [The Tackle Room](https://thetackleroom.com/blogs/news/wahoo-fishing-at-high-speed-the-14-knot-spread) |
| Wahoo at speed | 12 to 16 knots, 14 the sweet spot, on weighted lures; 2 to 4 lines | strikes best at 9 to 17 on skirts, which run to 24 | [The Tackle Room](https://thetackleroom.com/blogs/news/how-to-set-up-a-wahoo-trolling-spread-lures-speed-and-positions), [Marlin](https://www.marlinmag.com/high-speed-wahoo-trolling-spread-how-to/) |
| Wahoo cut mono | wire or a shock leader | teeth go through all but wire | [The Tackle Room](https://thetackleroom.com/blogs/news/how-to-catch-wahoo-on-the-troll-the-complete-system) |
| Kite's wind | 10 to 18 knots ideal; light kites in 5, heavy to 25 | 5 to 25 knots | [The Tackle Room](https://thetackleroom.com/blogs/news/kite-fishing-guide), [Marlin](https://www.marlinmag.com/selecting-a-kite-fishing-sailfish-how-to/) |
| Kite's bait | live, splashing at the surface, leader out of the water | live only, at the surface about 60 m off | [Florida Sportsman](https://floridasportsman.com/editorial/beginner-guide-kite-fishing/494546) |
| Daytime swordfish | 1,200 to 2,500 ft down, on 8 to 16 lb of lead | 250 to 750 m by day, 5 to 150 m by night | [The Tackle Room](https://thetackleroom.com/blogs/news/swordfish-fishing-guide-deep-drop-tactics-gear-rigging), [Salt Water Sportsman](https://www.saltwatersportsman.com/species/fish-species/top-five-swordfish-tips) |
| Electric reel | hand-cranking from 1,500 ft isn't on; about 300 ft/min down; over 10 min back from 1,800 ft | a lead down at 2.5 m/s and 4.5 m/s back: real time would be a 5 and a 10 minute wait, each cut to about 2 for play | [Florida Sportsman](https://www.floridasportsman.com/editorial/features_0710_florida_swordfish_daytime/397335), [Salt Water Sportsman](https://www.saltwatersportsman.com/species/fish-species/top-five-swordfish-tips) |
| Drag | 25 to 30% of the line's strength; 20 to 25% on braid | the 60 lb braid's 50 kg holds 24 kg in the chair, 18 in the harness | [Sport Fishing](https://www.sportfishingmag.com/?p=48677), [The Fisherman](https://www.thefisherman.com/article/what-a-drag-reel-time-maintenance/) |

Compressed for play, and said so: a real strike offshore can be hours apart, here minutes (`rigDelay`); a real fight on a 200 kg marlin is an hour or more, here about ten minutes. The harness's and the chair's holds (18 and 40 kg) and the arms' time are my own judgment, not from a source.

## Not done

- Others don't see a spread or a kite: `Together` still sends one rod and its line's end. Theirs shows as a float on the line where a rig has none. It's the together stream's to add.
- The electric reel's own sound, for the sound stream: a rod going off and the drag use today's reel sound.

## For the merge

- `Bites.js`: take stream 6's. All this stream adds is `hook: true` in `NOT_WATER`.
- `Game.habitat`: `atHook` sets `h.hook` after stream 6's line, so keep both.
- `docs/m16/fish.md` is stream 6's.
- `test/cast-net.mjs`: "every bait can be stolen" now leaves out lures and chum, which can't be.
