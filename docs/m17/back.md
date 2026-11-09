# M17, stream 5: coming back, the boats and the small things

What [M17.md](../M17.md) asked under [Coming back](../M17.md#coming-back), [The boats](../M17.md#the-boats) (the lobster boat's foredeck and roof, and the small things; the wakes were stream 6's) and [Aboard together](../M17.md#aboard-together) for a guest coming back. Built 2026-11-09 on branch `claude/m17-back-1e4698`, cut from `m17-flats` at 7495f79. Node tests (`test/back.mjs`) and real loads of the page, alone and with two players (`tools/two-players/resume.mjs`, `resume-together.mjs`), check it. **All the Spaces itself, two real devices through its room, is untried**: the user runs nothing on their own devices.

## Coming back

**The save.** The personal save's `'boat'` record (`Away.boatLeft`, read back by `leftOf`) keeps where you were, each field only when it's so. Older saves have none of them and load as before.

| Field | When | What |
|---|---|---|
| `on: [ x, y, z, look ]` | `aboard: 'deck'` | where you stood on her deck, in her frame (m, to the cm), and which way you looked on her (rad) |
| `helm: 'upper'` | `aboard: 'helm'` | her upper helm, the sportfisher's tower's |
| `swim: [ dx, dz ]` | not aboard | in the water, this far from her (m, the world's), she out on the water and you within 300 m of her |
| `ride: { o, b, x, z, on?, helm?, swim? }` | not aboard | aboard someone else's (`o` her owner's id, `b` which she is, `x z` where she was): where you stood on her, at her helm, or in the water by her |

**Where you stood** (`stoodOf`, `standBack`). Saved from where your feet are: the deck, the bridge, the tower, a cabin, the lobster boat's side decks, foredeck and roof. Part way up a ladder, its foot or its head, whichever's nearer. Strapped in the fighting chair, its spot: you come back standing beside it, since there's no fish on when you're back. Put back on her as she is now: on what's under you there within a step, else where she's boarded (a place she hasn't got any more). At her upper helm, at it again.

**In the water far out** (`swimBy`, `besideHer`, `intoWater`). In the water within 300 m of her, she not at her berth, on the sand or on her cradle: you come back in the water by her if she's not been fetched (towed or hauled), wherever she's drifted to. Where you were by her if that was within 25 m, else 3.2 m off her side, to climb aboard. If she's gone ashore, you're on the shore by her. Further off, or she at her berth, or fetched: ashore, as before.

**The kayak at anchor with you in her.** Put back in her seat or at a wheel isn't taking the helm: `App.pickUp` sets `Game._wasDriven` as it puts you there, so `updateAnchor` doesn't take her anchor up. (The kayak anchors with you in her after a rest in her, `DaysOut.passed`; a deck boat's at her helm only with it up.)

**Together** (`Together.rideLeft`, `rejoin`). Aboard someone else's boat, or swimming by one, your record says whose, which she is, where she was and where you were on her (at her helm, beside it: it's hers to give). Coming back, you're put in the water where she was, so the world's made about her, until she's here and built: her owner aboard her in the room, or her record on everyone's sea at anchor, her owner gone. Then you're aboard her where you stood, told "Back aboard Robin's boat", or in the water by her. If she's not out there 4 s after the first frame once the room's known, you're ashore and told "Robin's boat isn't out there now". While she's known to be coming (her owner's here with her, or her record's on the sea), up to 3 minutes for her copy to be built. In company in your own boat it's as alone: your boat's yours to put back.

## The lobster boat's way forward and up

**What real ones have.** A Downeast lobster boat's wheelhouse has narrow side decks either side of it, on the washboards: the Jarvis Newman 32's are 9 3/4 in, and ours are 8 in (her house is her sheer less 0.2 m). They're walked with a hand on the grab rails along the house's roof. Her foredeck has a forward-opening hatch over the cuddy: the Holland 32's listings have one, and the Camden boat below has one on its cuddy's top. Her anchor's on a roller at the stem head. Sources: a 1976 Jarvis Newman 32's listing (Brewer Yacht Sales), a 2015 Holland 32's (YachtSalesInternational), and the photographs below.

**What she has now** (`world/boat/DeckGear.js`' `WAY_UP`, colliders in `BoatModel`):
- **Two teak steps** at the house's aft corner, to port, the hauler being to starboard: 0.64 and 0.93 m, up to her washboard at 1.12 m. Her bait barrel's 0.32 m further aft to make room.
- **Her side decks** past the house, both sides, rising with her sheer from 1.13 to 1.25 m, to her foredeck. On them a walker's kept in by her sheer and presses close to the house (a collider's own radius, `r`, and `clampToDeck`), since a walker's 0.48 m across and the deck's 0.2 m.
- **Her foredeck**, as it was, now reached: the forward-opening hatch on its centreline at 2.45 m, a smoked lid in an aluminium frame, hinged at its forward edge.
- **Her anchor at the bow.** By her roller, E lets it go where she lies or gets it up, and her drift sock in (`Game.updateBow`). Her stowed plow anchor isn't drawn on the roller while it's down. That's her fittings' draw range, the anchor's triangles last in them; her copies for others get a view of their own.
- **Her roof**, as a place to look from: up two fold-down stainless steps on the house's port side by the grab rail's aft post, climbed as the sportfisher's ladders are (`LadderClimb`, "Climb onto her roof"). Your eye up there is 4.03 m over her waterline (`roofEye`). The glasses and the flats' seeing (`Glasses.js`, `Sight.js`) read the camera's own height, so the roof needs nothing added there. Stream 1's guide for a roof was 3.8 m, from about 30 m.
- Her life ring's moved from the house side (where you walk now) to the inside of her transom, between the trap stacks.
- Triangles: 47,053 to 47,857 (+804) on every tier; no new mesh, material or draw.

**Not from a photograph.** No photograph was found of a lobster boat's way onto her roof. On real ones a lobsterman climbs from the washboard by the roof's grab rail. The fold-down steps are a stock stainless fitting (Sea-Dog's 328025, Whitecap's), sold as a boarding aid, put there as the plainest way up a game can climb: **chosen**.

**Beside photographs** (`tools/lobster/look.mjs` renders her alone, `tools/lobster/compare.mjs` sets each render beside the photographs, hot-linked from Commons, not kept):
- [Lobster boat in marina](https://commons.wikimedia.org/wiki/File:Lobster_boat_in_marina.jpg) (Bd2media, 2019, CC BY-SA 4.0): from above, the house's roof with its rails and the narrow side decks either side of it to the foredeck.
- [Lobster boat in Camden, Maine](https://commons.wikimedia.org/wiki/File:Lobster_boat_in_Camden,_Maine.jpg) (Ryssby, 2005, CC BY-SA 3.0): the side deck along the house, a hatch forward.
- [Portland harbour lobster boat](https://commons.wikimedia.org/wiki/File:Portland_harbour_lobster_boat_08.07.2012.jpg) (Dirk Ingo Franke, 2012, CC BY 3.0): wide washboards beside the house.

Judged by eye: her side decks are as narrow as the marina boat's, and her hatch sits on a flush foredeck where the Camden boat's is on a raised cuddy top, as the Holland 32's is flush. Her steps can hardly be seen from outside, behind the barrel and her bulwark, as a real one's would be.

## The small things

**A twin console burns as twins do.** `Seaworthy.ABLE.console` had one burn, about a twin's, on her single 150. Now her single's and, with `stats.twin`, her twins' (`burnOf`, `Gear.fuelBurn( rpm, boat, twin )`, `Chart.fuelFor`'s `twin`, the plotter's and the HUD's fuel home). Fitted to Yamaha's own performance bulletins, at her lever as the engine's revs over 6,000:

| | 1,000 rpm | 4,000 rpm | 5,900 rpm (flat out) | `[ idle, k ]` L/s |
|---|---|---|---|---|
| One F150, a 21 ft center console ([Sportsman Open 212, 2018](https://www.sportsmanboatsmfg.com/s3/performance/2019-open-212-center-console-f150xb.pdf)) | 0.8 gph (fit 1.2) | 6.5 (fit 7.3) | 16.1 (fit 15.0) | 0.00084, 0.0154 |
| Two F150s, the Regulator 23 herself ([Yamaha, 2018](https://yamahaoutboards.com/getmedia/c46dc372-8902-46ff-a807-468a0a96d85f/pb_reg_23cc_t_f150xca_07-09-2018_occ)) | 1.6 (fit 2.4) | 13.9 (fit 14.8) | 31.4 (fit 30.3) | 0.00168, 0.0312 |

Two burn 2.02 times one at the same revs; home from 10 km at her cruise takes 6.9 L on one and 11.2 on two (quicker on two). No single-F150 bulletin for a 23 ft boat was found, so one's from a 21 ft boat; she's heavier, so a single on her burns a little more at the same revs. `tools/earnings.mjs` takes `st.twin`.

**A key for the plotter's range.** Z at the helm, with a plotter: a step out each press through its ranges (0.35 to 24 NM across) and back to its own pick, said in a toast ("Plotter range: 1.5 NM across", "Plotter range: auto") and "AUTO" or "RANGE" on its screen (`Instruments.stepRange`). In the actions wheel as "Plotter range", with its picture (`ui/Actions.js`, `ActionWheel`'s `ORDER`, `ActionIcons`), and in the Guide's keys.

**A toast when a sea comes aboard** (`BreakingSeas.seaAboardSaid`): where it came and what it left in her bilge. "A sea came over her rail · 17 gal of it in her bilge" (the lobster boat), "A sea came over her bow · her scuppers cleared it" (the console), "into her cockpit" (the sportfisher), "A sea broke over you" (a kayak, whose bilge is the sea).

**Trap bait** (`Traps.BAIT`, `TrapWork.buyBait`, Marta's row). Fish heads and cowhide, $8 for 4 traps. One trap's worth goes as each is set; set with none, it's said ("no bait in it: it'll fish about a third as well. Marta sells it") and saved `bait: false`. A deckhand setting her owner's traps uses her owner's bait.
- **What bait does.** Live shorts, the best bait, catch about three times an unbaited trap's (Heatwole et al. 1988, Butler et al. 2022, as [Marine Ecology Progress Series 696: 43](https://int-res.com/articles/meps_oa/m696p043.pdf) cites them). Dead bait less. So an unbaited trap fishes **0.35** of a baited one's (`BAIT.bare`).
- **How long it lasts.** It's eaten and goes off in days: a dead lobster in a trap kept it fishing worse for about 5 days (MEPS 696: 43). So a trap's bait draws them for **5 nights** of its soak (`BAIT.nights`), and after that it fishes as an unbaited one.
- Both figures are **chosen** to fit those sources. No figure was found for cowhide or fish heads.
- M16's 3.6 lobsters at the asymptote is a baited trap's, as Florida's were. A fortnight's soak baited now comes to 3.15 of it on the best bottom, and three nights baited 2.28 against 0.80 unbaited.
- Said as it comes up: "the bait's long gone", "no bait in it".
- A trap set before bait was sold is reckoned baited, as M16 had it.
- The save: `traps.bait` (how many traps' worth you have) and a set trap's `bait: false`.

## Checked

**Node** (`test/back.mjs`, real Player, boats and save):
- Where you stood, through a save and a load: the lobster boat's cockpit, bench, side deck, foredeck, bow and roof; the sportfisher's cockpit, salon, guest cabin, bridge and tower; the console's deck. All back to the centimetre, the look kept.
- Part way up a ladder: at its nearer end. The chair: on her sole 0.54 m from its seat, not in it. A place she hasn't: where she's boarded. The upper helm.
- An old save, and nonsense in one.
- In the water by her, through the save: back where you were by her after her drift; past 25 m, at her side; ashore if she's aground; past 300 m, or she at her berth, ashore.
- A rider's record and a swimmer's by someone else's boat, through the save.
- The kayak at anchor with you in her: her anchor stays down; without the fix, "Anchor up".
- The lobster boat walked at 60 and at 10 fps: up her steps, along her side deck, to her bow, back, up onto her roof (eye 4.03 to 4.04 m), about it, down and back to her cockpit. Her copy's walked view keeps her side decks and her climb, traps stacked or not. Her wheelhouse's hops (`test/lobster-decks.mjs`) still pass.
- Her anchor at the bow: let go, got up, under way, none bought, aboard someone else's. Her stowed anchor's 540 indices undrawn while it's down.
- The twin's burn against the bulletins. The plotter's range and its offer.
- A sea aboard, said for each boat and told as it comes.
- Trap bait: baited against not, used up after 5 nights, 400 traps' hauls (1,024 lobsters baited, 325 not), the sale, the set, the save, a save from before.

**Two players and real loads**: see the readings below.

## Readings

(filled in from the runs)

## For the M17 session's timing checks

Nothing new before ready: no new shader, material or program. The lobster boat's 804 more triangles are in her existing merged buckets (`wood`, `fittings`), her colliders (from 20 to 54 boxes) walked only while someone's aboard her. Still to run, on a quiet machine: the ready A/B (phone upright, 4 CPUs) and one screen's whole play on one core, and the two complete checks that judge the release.

## Not done, and not verified

- Two real devices through All the Spaces' room.
- A guest's rejoin while her owner's in the room but not aboard her (swimming, ashore): you're put ashore, as riding needs her owner aboard her.
- Others' copies of an anchored lobster boat still show her anchor on its roller, as before (the copy has no anchor state of its own).
- The sportfisher's and the console's bows don't have the anchor handled at them: only the lobster boat has `bowAnchor`.
