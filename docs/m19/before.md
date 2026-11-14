# M19, step 0: before any code

Step 0 for [M19.md](../M19.md), 2026-11-13, on `m19` cut from v2.4.1 (`58d20c7`). Two parts:
- **The sources** for each new thing and each figure, in three pages: [sources-fly.md](sources-fly.md) (the fly rods, the casting, the flies, the copper lenses, the booties); [sources-big-game.md](sources-big-game.md) (130-class tackle, IGFA's classes, line capacity, backing down, the mate, teasers, the gyro, the blue-water speargun and the Bahamas' spearfishing law, rubber nets, the sportfisher's whips); [sources-boats-bait.md](sources-boats-bait.md) (the Pescador Pilot, the stake-out pole, the trolling motor, the Power-Pole, the radar dome, the bigger hauler, the baits, conch and hermit crabs, the Bahamas' crawfish rules).
- **The code's survey**, below: what the streams will find where they start.

## The code's survey

**Where the console's radar shows.** She has two screens, on the upright panel over her wheel (`world/boat/console/ConsoleHelm.js:138-147`): the chart ahead of the wheel and the sounder beside it, each mapped into the instruments' one atlas (`world/boat/Instruments.js:38-52`, `RECTS`). The atlas already has the radar's screen (`RECTS.radar`, the lobster boat's third, drawn by `Radar.js`). A third screen won't fit her panel as the Regulator 23's photographs have it, so the radar shows on her plotter, split with the chart, as a small boat's multifunction display does: no new atlas space, the chart's screen showing the radar's half when she has one. The dome goes on her T-top (BOATS).

**The far fish, and a breath-hold dive.** The far water's groups (`world/Fish.js:110`, `FAR`) swim within a breath's reach: mahi 0.6 to 3.5 m down (`mahiFar`, `under`), tuna 1 to 7 m (`tunaFar`), wahoo 1 to 8 m (`wahoo`), yellowfin and the billfish likewise near the top. A held breath is 50 s, 80 with the long fins (`Gear.js:85-88`, `breathS`). So the blue-water speargun's fish are there to be dived on, out where the finds are (3 km and more off, `Finds.js`); nothing needs moving for GEAR. Whether the law allows it is in the sources ([sources-big-game.md](sources-big-game.md), the Bahamas' spearfishing law).

**`BreakingSeas` and roll.** A sea coming aboard knocks her: a roller's hit adds to her angular velocity across her (`game/BreakingSeas.js:94-95`, `boat.angular.x`, `.z`) and fills her bilge. It doesn't read how she's rolling. So the gyro damps her roll (`BoatController`, her roll's damping) and doesn't stop a sea coming aboard, which is right: a gyro takes out the roll, not the breaking sea. Its effect is on her motion at rest and slow, and on fishing from her (a steadier cockpit), not on `BreakingSeas`. BIG's long seas (M18's item) are the change to `BreakingSeas`.

**The kayak's hands.** With the rod or the net out the paddle's laid along her gunwale and she drifts (`world/boat/kayak/Seat.js:5-8`, `full = p.handsFull || p.busy`, line 26); `Game.canFish` (`game/Game.js:438-444`) lets you fish sat in her. The pedal drive is what changes that: with it, W and S drive her with the rod out (the Pilot's real use), and A and D steer her by the drive's rudder. That's `Seat.js` (BOATS).

**The flats' fish, drawn.** `world/fish/FlatsPool.js:22-26`: each tier draws them within `range` (32, 40, 50 m) and a triangle budget a frame (9,500, 26,000, 60,000), nearest first (`FlatsBudget`), at its finest level (`minLod`: 1 on low, 0 above). Low's budget sits in the room the checks' camera leaves (about 13k, M17's "Room on low"). So raising low's range costs nothing where nothing's drawn, but every fish further out spends the same budget: SEE measures the triangles at the new ranges on each tier before raising any, and if low's can't go to the roof's 35 m, it says so.

**Others.**
- The console's fit bits are all used (`together/BoatCopies.js:51-59`), so her new fittings go at bit 12 and up (the foundation).
- The kayak's anchor (step 1) is done: see [M19.md](../M19.md), step 1, and `test/back.mjs`.
