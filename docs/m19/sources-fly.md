# M19 sources: fly casting on the flats

Gathered 2026-11-13 on the `m19` branch (58d20c7), for M19's fly rods. Research only; nothing in the project was changed. Paths are relative to the repo root. This builds on [docs/m17/sources-tide-fish.md](../m17/sources-tide-fish.md) and doesn't repeat it: Chico Fernández's 45 to 65 ft casts and the bonefish's window, Suescun's fly 24 in ahead of a laid-up tarpon, and Salt Water Sportsman's "minimise false casts" are all there.

"Derived" means I worked a number out from a sourced figure; the working is given, and it isn't a measurement. "Judgement" means no source gave it. Sources are summarised, with at most one short quote each. Where a page wouldn't open (several fly shops returned HTTP 429, Costa returned 403), I say so, and figures seen only in a search engine's summary of a page are marked "search summary, page not opened".

| # | Figure | What the sources say | Recommendation for the game |
|---|---|---|---|
| 1 | Rod weights, rod length | Orvis: 8 wt bonefish, 10 wt permit, small tarpon and barracuda, 12 wt tarpon; 9 ft the all-round length. Kreh: 10 wt for tarpon under 70 lb (32 kg). Keys guides have moved to the 11 wt | 8, 10 and 12 wt, all 9 ft (2.74 m). The 10 wt for permit, barracuda and tarpon under about 30 kg; the 12 wt for bigger tarpon |
| 2 | Leader and tippet | Bonefish 9-10 ft, 12 lb (Bahamas 16 lb). Permit 10-12 ft, 16 lb. Tarpon 10 ft, 16-20 lb class with 60 lb (Keys) or 80 lb bite tippet. IGFA: class at least 15 in, bite at most 12 in, class at most 20 lb | `lineKg` 5.44 (12 lb), 7.26 (16 lb), 9.07 (20 lb). Leaders 2.9, 3.4 and 3.0 m. The tarpon's 60 lb bite tippet, 30 cm |
| 3 | Fly reels: drag, backing, line, runs | Makers' drags: 8 lb (7/8 size) to 15-20 lb (11/12). Measured: 9.7 and 10.5 lb on two 10 wt reels, over 20 lb on the best big-game reels. Backing 200 yd of 20 lb (8 wt) to 250-300 yd of 30 lb (12 wt). Lines 90-100 ft. No bonefish in Chico Fernández's year-long test took 100 yd | `dragKg` 4 / 6.8 / 9 kg; `spoolM` 210 / 240 / 300 m; `reelSpeed` about 0.7 m/s. The drag as set (at most half the tippet) never reaches any reel's most: the tippet and the spool are what count |
| 4 | Casting: carry, shoot, false casts, rhythm, wind | 9 m (30 ft) at Andros to 23 m (75 ft) in the Keys; 18 m (60 ft) the usual longest tarpon shot. 12 m (40 ft) needs no false cast. Most guides: two false casts at most. A tarpon shot is about 5 s from first false cast to the fly down. Carry is about the head, 12-14 m (40-45 ft) | Carry 7 / 11 / 14 m and shoot up to 4 / 6 / 8 m by skill (judgement within those). Each false cast takes about 2 × (0.3 + 2L/v) s (derived): 2.4 s at 9 m of line, 3 s at 12 m |
| 5 | False casts spooking fish | Deneki: keep false casts at least 15 ft (4.6 m) to either side of a bonefish, or don't false cast. The line's shadow, the leader's flash and spray from the line look like a bird overhead. No measured distance found | A false cast whose line passes within 4.6 m of a fish spooks it (bonefish; scaled by `wary`). Lining a fish: the game's 0.5 m (`castScare`) stands |
| 6 | Stripping and the take | Bonefish: a 2 ft (0.6 m) strip by default, short quick strips to change it up, stop when it's close. Permit: one long slow strip, then let the crab sit; stop when it reacts. Tarpon: long, slow, steady strips (cruisers); a couple of inches and a pause (laid up). Strip-set: one long pull with the rod low; tarpon two or three. The trout set pulls the fly out of the mouth. Bow when it jumps | Strips 0.6 m (bonefish), 0.6-0.9 m slow then still (permit), 0.4-0.6 m steady (tarpon, judgement). A lifted rod at the take misses. A tarpon's jump on a tight line breaks the tippet unless you bow |
| 7 | The flies | Bonefish flies sink to the bottom in 2-3 s on a 0.3-0.75 m flat (bead chain eyes, 0.26 g a pair). Crab flies carry lead eyes (0.45-1.35 g a pair) and sink fast. Tarpon flies are light and slow-sinking. Prices: $2.59-4.95 (bonefish), $8.95-12.50 (crabs), $4.80-5.95 (tarpon) | Shrimp fly about 0.2 m/s sink, splash 0.4; crab 0.35 m/s, splash 1.0; tarpon 0.07 m/s, splash 0.4 (sink derived for the shrimp, the rest judgement). Sell at about $4, $10 and $6 each |
| 8 | Copper and amber lenses | No measurement of any lens colour on the flats found. One lab study (Wolffsohn 2000): yellow lenses raise contrast for bright objects against blue, and lower it against black. Orvis, guides: grey doesn't add contrast; copper or amber for the flats. Makers' claims are unmeasured | Flag any copper gain as judgement. If used: a small one (e.g. the contrast threshold ×0.9) over sand, nothing over grass |
| 9 | Wading booties | Guides: go slow, land on the ball of the foot, slide the foot under the water ("lift your toes"); shell and limestone crunch, sand and soft grass are quiet. Booties for sand and grass; hard-soled boots for rock and coral. One writer: heavy wading boots "kill any sort of stealth" | Wading should push water like a slow hull. Booties would cut the noise of a step on hard bottom, not the push (judgement) |
| 10 | Prices | 8 wt outfit $449-646 (Orvis Clearwater). Mid-range: rod $400, reel $150, line $100-130. Top: rod $1,235-1,750, reel $735-965, line $100-130 | 8 wt $500, 10 wt $750, 12 wt $1,000 at the shop's middle; flies a few dollars each |

---

## 1. Rod weights per species, and rod length

**The game now.**
- `src/game/FishTable.js:155`: "No fly rod (the user's, M17): shrimp, jigs, plugs and live bait".
- `src/game/Gear.js:52-57`: four spinning and casting rods, each with a `castM` (22, 32, 45 and 30 m).
- The game's fish: bonefish 0.8-5 kg, permit 3-18 kg, tarpon 10-45 kg (`FishTable.js:121,130,109`).

**Sources.**
- **Orvis, "Fly rod selector"** ([link](https://www.orvis.com/fly-fishing/featured/fly-rod-selector)): an 8 wt for bonefish (also "an 8- or 9-weight rod is a perfect match"), "a 10-weight rod for permit, small tarpon, and barracuda", and "a 12-weight rod for tarpon". The 9 ft rod is the most versatile all-round length.
- **Lefty Kreh's Q&A, Salt Water Sportsman, "Beginner Needs a Flyrod"** (2006; [link](https://www.saltwatersportsman.com/?p=51629)): an 8 wt for bonefish; a 10 wt is ideal for permit, and for tarpon under 70 lb (32 kg). A 9 wt "is a little overgunned for bonefish but a bit light for tarpon and permit, especially when you need to throw weighted crab flies."
- **Ben Freeman, Trident Fly Fishing, "10 vs 11 vs 12 weight"** ([link](https://www.tridentflyfishing.com/blogs/all/10-vs-11-vs-12-weight-how-to-choose-a-fly-rod-for-tarpon/)): for adult tarpon over 100 lb (45 kg). The 10 wt is for experienced anglers in clear, pressured water; the 11 is the Keys guides' choice; the 12 is "the traditional tarpon rod", worth it for very big fish (150 lb plus) outside the US. Quoting Capt. Eric Wallace: "The 11 has become the rod of choice in the keys."
- **Alex Suescun** (Salt Water Sportsman, laid-up tarpon; [link](https://www.saltwatersportsman.com/fly-anglers-guide-to-laid-up-tarpon)): a 10 or 11 wt rather than a 12 for laid-up fish, since the casts are short.
- **Lefty Kreh, "Big Tarpon"** (*Fly Fisherman*, May/June 1972, reposted 2022; [link](https://www.flyfisherman.com/editorial/big-tarpon/467121)): usually a WF12 line, rarely lighter than an 11.
- **Fishwest, "Fly Fishing for Permit: A 101 Guide"** ([link](https://blog.fishwest.com/fly-fishing-for-permit/)): a 9 wt for permit, an 8 also works.

**For the game.**
- **8 wt (9 ft):** bonefish; also fine for snook (judgement: the game's snook are 1.5-12 kg).
- **10 wt (9 ft):** permit and barracuda, and tarpon under about 30 kg (Kreh's 70 lb), which is most of the game's 10-45 kg tarpon.
- **12 wt (9 ft):** tarpon, above all the bigger ones.
- All three 2.74 m long. No source gives a different standard length for the flats.

---

## 2. Leader and tippet

**The game now.**
- `src/game/Gear.js:31-37`: lines by their labels, `lineKg` = pounds × 0.4536 (M17's correction).
- `Gear.js:63-68`: leaders: light mono, fluorocarbon, wire (wahoo and barracuda), 200 lb mono (billfish).
- `src/game/rigs/Presentation.js:93,175-181`: teeth cut a leader (wahoo, barracuda), a bill wears it; tarpon are in `LEAPS` (`:96`) but nothing wears the leader on a tarpon's mouth.

**Sources.**
- **Yellow Dog Flyfishing, "Saltwater leader and tippet guide"** ([link](https://www.yellowdogflyfishing.com/blogs/back-stage-pass/fly-fishing-saltwater-leader-tippet-guide)), starting leaders:
  - Bonefish, Mexico, Belize, Honduras: 9-10 ft, 12 lb; tippet 10, 12, 16 lb.
  - Bonefish, **Bahamas**: 9-10 ft, **16 lb**; tippet 12, 16, 20 lb.
  - Permit, Caribbean: 10-12 ft, 16 lb; tippet 10 to 20 lb.
  - Tarpon, juvenile: 16-20 lb with 30 lb shock. Adult: about 16 lb class with 60 lb shock (the recipe was cut off in what I could read).
  - Barracuda and sharks: 6-8 ft of 30 lb plus 1.5 ft (0.46 m) of 40 lb wire.
  - Quote: "A heavy butt transfers energy from the fly line to the leader more efficiently and helps turn over the fly."
- **IGFA International Angling Rules, fly section** ([link](https://igfa.org/international-angling-rules/)): the class tippet "must be at least 38.10 centimeters (15 inches) long" and "may not exceed 10-kilograms (20 pounds)". A shock (bite) tippet may not exceed 30.48 cm (12 in), of any material and strength. Butt and taper sections are free.
- **RIO Tarpon Pro and Umpqua Linville tarpon leaders** (search summaries of retailer pages; RIO's own page redirected to farbank.com, which returned 429): 10 ft; 16, 20 or 30 lb class; 60 or 80 lb fluorocarbon bite tippet.
- **Mike Conner, Florida Sportsman, "Best leaders for inshore fishing"** ([link](https://www.floridasportsman.com/editorial/best-leaders-for-inshore-fishing/515824)), spinning tackle but it covers the fly: tarpon over the 25-50 lb class need a 60-80 lb bite leader; Keys fly anglers have settled on 60 lb for stealth in clear water, replacing the old 80-100 lb. Bonefish 10-12 lb; permit 15-20 lb. "Tarpon require a bite leader, period."
- **Kreh 1972** (above): 60-100 lb shock tippet; most tarpon fought on about 15 lb.
- **Fishwest permit guide** (above): a 16 lb tapered leader with 18 in of 15 lb; permit "aren't leader shy".

**Derived.** In kg, as M17 converts: 10 lb 4.54, 12 lb 5.44, 16 lb 7.26, 20 lb 9.07, 60 lb 27.2, 80 lb 36.3.

**For the game.**
- **Bonefish (8 wt):** 12 lb tippet, `lineKg` 5.44, on a 2.9 m (9½ ft) leader. Bahamas guides would tie 16 lb; 12 lb is the lighter, commoner figure.
- **Permit (10 wt):** 16 lb, `lineKg` 7.26, on a 3.4 m (11 ft) leader.
- **Tarpon (12 wt):** 20 lb class, `lineKg` 9.07 (IGFA's most), with 30 cm (12 in) of 60 lb bite tippet, on a 3.0 m (10 ft) leader.
- **Barracuda on the 10 wt:** wire, as the game already does for its teeth.
- The bite tippet is the tarpon's equivalent of the game's `wear` (its mouth is abrasive, as a bill is). That's judgement: no source gives a rate.

---

## 3. Fly reels: drag, backing, the fly line, and how far the fish run

**The game now.**
- `src/game/CatchMinigame.js:54`: the fight takes `lineKg`, `reelSpeed`, `dragKg`, `holdKg` and `spoolM`. `:14` `DRAG_SET`: the drag set at 27.5%, 37.5% then 52.5% of the line (Caputi, big game). `:103-108` `_give`: what slips is the least of the reel's most, the set share of the line, and what you can hold.
- `src/game/Gear.js:45-50`: the spinning reels have no drag figure and 180-220 m of line; the conventional reels 15-24 kg and 350-868 m.
- `src/game/FishingRod.js:69`: a spinning reel takes in 0.8 m a crank turn; `CatchMinigame.js:179` reels in `reelSpeed` m/s.

**Sources: drag.**
- **Makers' figures** (search summaries of retailer pages, not opened):
  - Sage Enforcer: 8 lb (7/8 size), 15 lb (9/10), 17 lb (11/12), "at the arbor".
  - Hardy Fortuna Regent: 10 lb (8000), 15 lb (10000), 20 lb or 18 lb (12000; sellers disagree).
  - Nautilus CCF-X2: "20+ lbs" for the line; Orvis Hydros 10-12: 15 lb.
- **Measured** (Trident's bench tests, opened):
  - Stephen D'Angelo, Hardy Fortuna Regent 10000 review (2023; [link](https://www.tridentflyfishing.com/blogs/all/hardy-fortuna-regent-10000-fly-reel-review)): 9.7 lb measured against 15 lb claimed. "The 9.7 pounds of maximum stopping power was the second worst in the shootout, besting only the Orvis Hydros."
  - Hatch Iconic 9 Plus review ([link](https://tridentflyfishing.com/blogs/all/hatch-iconic-9-plus-fly-reel-review)): tops out at about 10.5 lb; just under 300 yd of 30 lb backing; about 11 in a turn; $919.
  - Ben Freeman, 2023 tarpon and big-game reel mini-shootout, 13 reels ([link](https://www.tridentflyfishing.com/blogs/all/2022-tarpon-big-game-reel-mini-shootout-best-gt-11-weight-reel/)): wanted "AT LEAST 12 lbs of drag"; the top reels had over 20 lb; a Redington Grande reached 41 lb. The per-reel table is an image I couldn't read.
  - Trident's Ross Evolution R Salt 9/10 review: a steady 20-22 lb (search summary, not opened).
- **How it's set.**
  - Marshall Cutchin, MidCurrent, "Fly Reels: Big Fish Drag Settings" (2005; [link](https://midcurrent.com/?p=547)): "even with 4-5 pounds of drag (on 20-lb. tippet), bowing to the fish gives you plenty of 'leeway'".
  - Capt. Carter Andrews in MidCurrent, "How to Set Fly Reel Drags" ([link](https://midcurrent.com/?p=10363)): one third of the tippet for the strike, then a half and two thirds in the fight.
  - Capt. Bouncer Smith in Salt Water Sportsman (Ric Burnley, [link](https://www.saltwatersportsman.com/?p=58503)): about 20%; others go to 33% (not fly-specific).
  - Lefty Kreh: about 15% of the leader (search summary only).
- **What a fly rod can pull.**
  - Ross Purnell, *Fly Fisherman*, "How To Fight Fish" (2016; [link](https://www.flyfisherman.com/editorial/how-to-fight-fish/151710)), Stu Apte's demonstration with a spring scale 80 ft away on a 12 wt: about 4 lb (bursts to 5) with the rod high; 16-18 lb pointing the rod at the scale and stepping back. "A smooth, high-performance reel can exert 12 or 14 pounds of smooth pressure on the fish."
  - Terry Gibson, Florida Sportsman, "Fighting Tarpon on Fly" (2012; [link](https://www.floridasportsman.com/editorial/tarpon-on-fly/396114)): Andy Mill tests a 16 lb leader with 12.5 lb of sand on a pulley, and 12.5 lb is impossible with the tip much above the knees or more than 45° off the fish.

**Sources: backing, line, and the reel's turn.**
- **Backing.**
  - John Frazier, Salt Water Sportsman, "Bonefish Fly Reel Choices" (2013; [link](https://www.saltwatersportsman.com/?p=50420)): a WF line plus 200 yd of 20 lb Dacron does now; the old advice was 300 yd. Gel-spun holds up to 40% more.
  - Conway Bowman, MidCurrent, "Backing: Weight and Quantity Demands" ([link](https://midcurrent.com/?p=9115)): at least 175 yd of 20 lb for inshore fish, which "often make initial runs of 75 to 100 yards". Tuna and marlin want 300 yd of 30 lb.
  - Kreh 1972 (above), for tarpon: "a minimum of 250 yards of 30-pound-test Dacron backing, plus fly line."
  - Reels' capacities (search summaries): Sage Enforcer WF8 + 200 yd 20 lb, WF10 + 200 yd 30 lb, WF12 + 300 yd 30 lb; Nautilus CCF-X2 8/10 WF10 + 200 yd 30 lb; Hardy Fortuna Regent 12000 WF12 + 250 yd 30 lb; Tibor Riptide WF10 + 200 yd 30 lb.
- **The fly line.**
  - AFTMA/AFFTA weights, "first 30 feet of line minus level tip" ([Wikipedia, "Fly line"](https://en.wikipedia.org/wiki/Fly_line)): 8 wt 210 gr (13.6 g), 10 wt 280 gr (18.15 g), 12 wt 380 gr (24.6 g).
  - Modern lines run heavy: *Fly Fisherman*, "Why are fly lines getting heavier?" ([link](https://www.flyfisherman.com/editorial/why-are-fly-lines-getting-heavier/453085)): "The majority of fly lines on the market today no longer conform to industry line weight standards." Its old letter codes give a fly line's belly at 0.045 to 0.060 in (1.1 to 1.5 mm).
  - Lengths (search summaries of RIO's spec tables; RIO's pages redirect to farbank.com, which returned 429): RIO Elite Bonefish 100 ft (30.5 m) in WF7-9 (90 ft in WF6), $129.95. RIO Elite Tarpon WF12F 100 ft, head 40.5 ft (12.3 m), first 30 ft 428 gr (27.7 g), whole head 510 gr.
- **The reel's turn:** Hatch Iconic 9 Plus, about 11 in (0.28 m) a turn (Trident, above). A fly reel is 1:1, with no gearing.

**Sources: the runs.**
- **Bonefish.**
  - Chico Fernández's test, in Pete Barrett, On The Water, "Fish Runs, Reel And Imagined" (2020; [link](https://onthewater.com/fish-runs-reel-and-imagined)). He dyed the last 10 of 100 yd of backing red and fished the reel for a year and a half: "All those bonefish, big dolphin and mid-size tarpon had never gotten to the red mark, and never took 100 yards of line." A big shark he guessed at 200 yd had taken about 100.
  - Chico Fernández, MidCurrent, "Bonefish: The Retrieve, Hookup, and Fight" ([link](https://midcurrent.com/?p=4494)): when the run stops the fish "might be 50 or more than 100 yards away, if he happens to be a large fish."
  - Frazier (above): never saw a bonefish run more than 100 yd, fish to 10½ lb.
  - Deneki, "Backing for bonefish" (2012; [link](https://deneki.com/2012/01/backing-for-bonefish/)), a reader comment: the average bonefish runs 20 to 30 yd into the backing on its first run.
- **Permit.** Fishwest (above): "a 15 lbs permit will probably take you well into your backing at least 2 or 3 times". No distance found.
- **Tarpon.** No sourced first-run distance found. Only the backing advice (Kreh's 250 yd minimum) and fights that "can go on for hours" (Kreh 1972).

**Derived.**
- **Line plus backing on the reel:** fly line 27-30 m plus backing.
  - 8 wt: 30 + 183 (200 yd) = **213 m**.
  - 10 wt: 30 + 183 = 213 m (Enforcer, CCF-X2) to 30 + about 270 = 300 m (Hatch 9 Plus).
  - 12 wt: 30 + 229 (250 yd) = 259 m to 30 + 274 (300 yd) = **304 m**.
- **A bonefish's first run:** fly line plus 18-27 m (20-30 yd) of backing = **45-57 m** from the reel; a big one 46 to over 91 m (50 to 100+ yd). "100+ m into the backing" is too much: no source has a bonefish take 100 yd.
- **The drag as set, against the reel's most:** the game's full share, 52.5%, gives 2.9 kg on 12 lb, 3.8 kg on 16 lb and 4.8 kg on 20 lb. Every reel figure above, makers' or measured, is higher, except Trident's weakest 10 wt reel (4.4 kg measured), which would fall just short of the 20 lb tippet's 4.8 kg. Cutchin's 4-5 lb on 20 lb is 20-25%; Andrews's two thirds is 6.0 kg. So on fly tackle **the tippet sets the fight, not the reel's drag**.
- **What the rod lets you hold** (Apte, Mill): about 1.8-2.3 kg (4-5 lb) with the rod high; 5.7 kg (12.5 lb) needs the rod low and within 45° of the fish; 7.3-8.2 kg (16-18 lb) pointing it at the fish.
- **Reel speed:** 0.28 m a turn × 2 to 3 turns a second (judgement) = **0.56-0.84 m/s**. The game's old spinning reel is 1.1.

**For the game.**
- **`lineKg`:** as section 2 (5.44, 7.26, 9.07).
- **`dragKg`** (the reel's most, between makers' and Trident's measurements): 8 wt **4.0 kg**, 10 wt **6.8 kg**, 12 wt **9.0 kg**. It rarely binds.
- **`DRAG_SET`:** the existing 0.375 to 0.525 sits inside the fly sources' range (Andrews's 1/3 to 2/3, Cutchin's 20-25%). It can stay.
- **`holdKg`:** about 2 kg fighting with the rod up, 5.7 kg with it low. The rod angle could be the player's choice (judgement).
- **`spoolM`:** 8 wt **210 m**, 10 wt **240 m**, 12 wt **300 m**.
- **`reelSpeed`:** **0.7 m/s** (8 and 10 wt) and **0.8 m/s** (12 wt, a bigger arbor), judgement within the derived range.
- **Runs (judgement, bounded by the above):** bonefish 45-60 m, a big one to 90 m; permit 60-120 m, more than once; tarpon 70-150 m with jumps.
- **A 45 kg tarpon on 20 lb tippet** is 5 times its class, so it's fought on the drag and lost by spooling, as the game's big-game fish are (derived from `CatchMinigame.js:19,65`).

---

## 4. Casting distances, false casts, rhythm and wind

**The game now.**
- `src/game/FishingRod.js:595-601`: one flick. The bait leaves at `v0` = 7 + 13 × power × sqrt(castM / 22) m/s, aimed at `castM` × (0.35 + 0.65 × power).
- `:636`: the flight is capped at `castM`; `:75` `LINE_WIND`: a wind past a fair day's carries it on or holds it short.
- There are no false casts.

**Sources: distance.**
- **Deneki, "How far do you have to cast to catch bonefish?"** (2013; [link](https://deneki.com/2013/07/how-far-do-you-have-to-cast-to-catch-bonefish/)): about 30 ft (9 m) at Andros South, where "they'll swim up to within 10 feet". An accurate 75 ft (23 m) in the Florida Keys. Its chart is "completely made up, based on our best guess".
- **Coastal Angler, "Casting the Distance"** (2015; [link](https://coastalanglermag.com/?p=18951)): "The distance to home plate is 60', which is usually the maximum distance of the average tarpon shot." The writer's tarpon were mostly hooked within 50 ft (15 m). A shot lasts about 10 s: about 5 to see the fish and 5 to get the fly to it.
- **Gink & Gasoline, "Better Casting for Bonefish"** ([link](https://www.ginkandgasoline.com/fly-fishing-tips-technique/better-casting-for-bonefish/)), quoting a guide: "You only need to cast about fifty feet most of the time."
- **Scott Heywood, *Fly Paper*, "Bonefish lessons from Water Cay"** (2012; [link](https://scottsheywood.blogspot.com/2012/05/bonefish-lessons-from-water-cay-part.html?m=1)): consistent 30-45 ft casts, and an accurate 40 ft into the wind.
- M17's Chico Fernández: 45 ft novice to 65 ft skilled.

**Sources: false casts, carry and shoot.**
- **Deneki, "False casts and bonefishing"** (2011; [link](https://deneki.com/2011/03/false-casts-bonefishing/)): with 40 ft (12 m) you can probably cast with no false cast. "False casts are the enemy of quick presentation."
- **Heywood** (above): "Try to use a maximum of 2 false casts before delivery." More raise the risk of a bad cast and of spooking fish.
- **Coastal Angler** (above): false cast on a count, and at five stop and present.
- **Carry is about the head.** A weight-forward head is about 40-45 ft (12-14 m); a typical caster can carry the head and a little running line, and beyond that the overhang hinges and the loop dies (forum and sexyloops.com advice in a search summary, pages not opened). The heads above: RIO Elite Tarpon 40.5 ft; RIO Elite Bonefish WF6 46.5 ft (14.2 m).
- **Shoot.** Deneki, "False cast short of your target" (2016; [link](http://deneki.com/2016/10/false-cast-short-of-your-target/)): false cast short and shoot "the remaining last few feet". No source gives a shoot length by skill.

**Sources: rhythm.**
- **Grunde Løvoll and Jason Borger, "The Rod & The Cast"** (sexyloops.com; [link](https://www.sexyloops.com/articles/rodcast.shtml)), high-speed video of 9 ft 5 wt rods with about 10 m of line out: the line reached about 24 m/s (54 mph) at rod straight. "the stop" begins 0.10 to 0.15 s before that.
- The pause grows with the line: instructors say the longer the line the longer the pause (search summary). John Juracek (Flylab, [link](https://flylab.substack.com/p/killing-the-clock); paywalled preview, no numbers): "The length of the casting stroke is a function of the length of the line being cast." One forum caster guessed about 1 s of pause at 30 ft (search summary). No measured cycle time found.

**Sources: wind.**
- **Bruce Chard, in Deneki** (2009; [link](https://deneki.com/2009/02/bruce-chard-on-casting-in-the-wind/)): into the wind keep a tight, low loop and high line speed, and don't shoot on the delivery. "A tight loop gives the wind less fly line surface area to effect."
- A headwind mostly eats distance; past 10-15 mph, cast off the other shoulder (search summary of guides' articles).
- No measured loss of distance with wind found.

**Derived: how long a false cast takes.**
- The rod leg of the line stops at the tip while the fly leg goes on at the line speed v. So the fly travels from about L behind the tip to L in front, about 2L, at roughly v. Each stroke takes about t = s + 2L/v, where s is the stroke itself (judgement 0.3 s) and L is the line and leader out past the tip.
- With v = 20 m/s (judgement: a fishing cast, a little under Løvoll and Borger's expert 24 m/s):

  | Line out (L) | One stroke | One false cast (back and forward) |
  |---|---|---|
  | 6 m (20 ft) | 0.9 s | 1.8 s |
  | 9 m (30 ft) | 1.2 s | 2.4 s |
  | 12 m (40 ft) | 1.5 s | 3.0 s |
  | 15 m (50 ft) | 1.8 s | 3.6 s |

- At 15 m/s every figure grows by about a third.
- The forum's 1 s pause at 30 ft fits 2L/v = 0.9 s.
- Coastal Angler's 5 s budget holds one or two false casts at 9-12 m before the delivery, which is what the guides allow.

**For the game.**
- **Carry (most line kept in the air, past the tip), by skill (judgement within the 12-14 m head):** a novice about 7 m, a fair caster 11 m, a good one 14 m.
- **Shoot on the delivery:** up to 4 / 6 / 8 m.
- **Distances that result:** about 11 m (36 ft) for a novice, 17 m (56 ft) fair and 22 m (72 ft) good. That spans Chico's 45-65 ft and reaches the Keys' 75 ft for a good caster.
- **The same by weight:** a heavier line carries the same; no source says the 12 wt casts further. It tires the arm sooner (judgement).
- **False casts:**
  - each adds line, about 1.5-2 m slipped through the fingers (judgement);
  - each takes the derived time above;
  - none needed out to about 12 m (Deneki);
  - more than two raises the risk of a botched cast (Heywood).
- **A presentation:** about 5 s from first false cast to the fly down (Coastal Angler).
- **Wind (judgement):** into a 7 m/s (15 mph) wind, cut carry and shoot by about a quarter; downwind add about a sixth; a crosswind on the casting side sets the fly off line, and casting off the other shoulder avoids it. The existing `LINE_WIND` push can carry the line once it's shot.

---

## 5. False casts spooking fish

**The game now.**
- `src/game/Sight.js:271-279` `castScare`: a cast spooks a fish if it lands within `head` × sqrt(splash / 0.6) of it (`FishTable.js:157-166`: bonefish 0.45 m, permit 0.7, tarpon 0.3). It also spooks if the line on the water passes within 0.5 m of a fish more than 1.2 m from the bait ("the line laid over its back").
- Nothing models the line in the air.

**Sources.**
- **Deneki, "Spooking bonefish: how not to"** (2013; [link](https://deneki.com/2013/05/spooking-bonefish-how-not-to/)): "Keep your false casts at least 15 feet to either side of the fish – or just stop false casting!" Overhead false casts throw a shadow and spray water on the flat. Casting too long and landing line on the fish frightens it.
- **Deneki, "False cast short of your target"** (2016; above): bonefish watch for predators above; the leader's flash, the line's shadow and spray off a wet line and leader can look like a bird. False cast short "to keep the fly line and leader from flying over head, placing only the fly in the fish's field of view."
- **Jason Whiting, Deneki, "Don't cast a shadow"** (2016; [link](https://deneki.com/2016/11/dont-cast-a-shadow/)): the line's shadow over a fish looks like a bird. Guide Charlie Sweeting: "we must always check where the sun is first, then watch the fish." Cast from the side away from the sun.
- **Heywood** (above): more false casts, more spooked fish.
- Deneki's "Don't false cast on top of your target" (2019) returned 404.
- **"Lining" a fish**, meaning the fly line landing on or across it: no source defined it. The substance is Deneki's "landing line on the fish".
- **No measured spooking distance** for false casts, line flash or shadow was found.

**Derived: how dark the line's shadow is.**
- The sun's disc is about 0.53° wide (0.0093 rad, textbook). A line 1.1-1.5 mm thick casts a full shadow only within about 1.3 mm / 0.0093 = **0.14 m** of itself.
- A line in the air 2-4 m over the bottom throws only a soft grey band. That band is about 0.0093 × 3 m = 3 cm wide, and darkened by about 1.3 / 28 = **5%** at its middle.
- So the aerial line's own shadow on the sand is faint. What a fish more plausibly sees is the moving line and leader against the bright sky through its window, the flash, and the spray, all of which the guides also name.
- The window doesn't explain the 15 ft either: a line 4.6 m to the side and 2.5 m up is 28° above the fish's horizon, well inside the sky it sees.
- So the 15 ft is guides' experience, not optics.

**For the game.**
- **A false cast spooks** a fish when the line in the air passes within **4.6 m (15 ft)** of it, scaled by its `wary` (bonefish 1, permit 1.25, tarpon 0.7). That's Deneki's figure, for bonefish.
- **The chance per false cast** is judgement: e.g. certain if the line passes over it, falling to nothing at 4.6 m × `wary`.
- **Sun behind the caster and the line between sun and fish:** a larger zone (Whiting), e.g. ×1.5 (judgement).
- **False casts short of the fish, shooting the rest:** no spook from the line in the air.
- **Lining** (line landing over the fish): keep the existing 0.5 m `castScare`. A fly line lands heavier than mono, so 0.5-1 m is reasonable (judgement).

---

## 6. Stripping, the take, and the set

**The game now.**
- `src/game/FlatsFishing.js:370-375`: a fish that will eat turns and comes on at its `speed`.
- `:418`: the take's window to strike is `bite.t` = 2.4 - 0.5 × fight s (1.9 s for a tarpon).
- There's no retrieve: the bait sits where it lands.

**Sources: the retrieve.**
- **Bonefish.**
  - Deneki, "Strip to your pocket" (2018; [link](https://deneki.com/2018/03/strip-to-your-pocket/)): from the rod hand out in front to the pocket, "a strip length of approximately two feet." It imitates prey jumping off or diving to the bottom, and leaves room to set.
  - Chico Fernández, MidCurrent (above): very short strips in shallow water, long slow ones for a following fish, faster in deeper water. Pause with the fly on the bottom when a fish is within a few feet.
  - Florida Sportsman, "Know how to work your fly correctly" ([link](https://www.floridasportsman.com/editorial/know-how-to-work-your-fly-correctly/398672)): for a crab fly, "one rapid strip about 2 feet in length", then let it sit. Shrimp flies: fast strips about 1 ft long, with short pauses.
- **Permit.**
  - Chad Shmukler, Hatch Magazine, "3 Tips for Presenting Flies to Permit" (2014; [link](https://www.hatchmag.com/node/1205)): very slow, very long strips, not a bonefish's short sharp ones. Stop the fly dead once a permit turns or rushes it, as a crab freezes or digs in. "The key to stripping a permit crab fly is doing so slowly."
  - Carter Lyles for Yellow Dog, "Sixteen rules: how to feed permit" (guides Justin Rea and Greg Vincent; [link](https://www.yellowdogflyfishing.com/blogs/back-stage-pass/sixteen-rules-how-to-feed-permit)): strip long, stop, watch its body language. Leave the fly still on a mudding fish. When its tail quivers, make one long strip until tight. "don't be watching . . . be setting!"
  - Fishwest (above): drop the crab close to the permit's face; slow, steady strips on the bottom.
  - There's no single "permit strip" in the sources; they agree on long and slow, then still.
- **Tarpon.**
  - Andy Mill in MidCurrent, "Two-Handed Strips for Tarpon" ([link](https://midcurrent.com/techniques/two-handed-strips-for-tarpon-with-andy-mill/)): keep the fly moving with no pauses, steady and fairly slow, adjusted to the fish (worm flies, tracking fish).
  - Alex Suescun, laid-up tarpon (above): a long steady strip to take up slack, then a couple of inches and a brief pause, repeated. A little faster once it tracks, but still a couple of inches at a time. If it backs off, let the fly sink a few inches.
  - Suescun, Salt Water Sportsman, "Tarpon Fly-Fishing Tutorial" (2017; [link](https://www.saltwatersportsman.com/tarpon-fly-fishing-how-to/)): strip fast as the boat drifts toward the fly, little when it drifts away.
  - No source gives a strip length in feet for cruising tarpon.

**Sources: the set.**
- **Deneki, "Don't trout set, mon"** (2024; [link](https://deneki.com/2024/12/bonefish-tips-dont-trout-set-mon/)): the rod tip in the water, pointed at the fish; one long firm strip when the fish tips down or you feel it. Lifting the rod gives a smooth gradual pull and "if you raise the tip of your rod, it will be dragged straight out of the fish's mouth." A missed trout set also jerks the fly away from the fish.
- **Deneki, "Setting the hook: strip long, not hard"** (2018; [link](https://deneki.com/2018/03/setting-the-hook-strip-long-not-hard/)): the last strip longer, not harder; too hard pops the fly out or breaks off.
- **MidCurrent, "How to Strip-Set in Saltwater"** ([link](https://midcurrent.com/v2/how-to-strip-set-in-saltwater-breaking-the-trout-set-habit/), with Jon Cave's RIO video):
  - big hooks (2 to 4/0) need direct force;
  - a bending rod absorbs it;
  - hard mouths often take while still coming at you;
  - tarpon want two or three forceful low pulls.
  
  "The line hand sets the hook, not the rod."
- **Chico Fernández** (above): bonefish often take softly; watch for the fish to stop or wiggle. Strip faster and harder than the retrieve, and lift the rod only a little. Strip longer if you only saw the take.
- **Suescun 2017** (above): tarpon often turn after eating, so set on the turn; they may take a fly two or three times before it sticks.
- **Bowing to the king.**
  - Suescun 2017 (above): drop the rod tip toward a jumping fish so it doesn't land on a tight line and part the tippet.
  - Flylords, "When and Why to Bow to the King" ([link](https://flylordsmag.com/when-and-why-to-bow-to-the-king/)): "Bowing reduces tension on the hook when a fish jumps, which results in more fish landed." Jumps come most early in the fight. A tarpon's bony mouth gives a weak hookset, and fluorocarbon bite tippet has little stretch.

**For the game.**
- **Strip lengths:**
  - Bonefish: a **0.6 m** strip by default; short quick 0.15-0.3 m strips as a change-up (judgement); a pause with the fly on the bottom when it's close.
  - Permit: a **0.6-0.9 m** slow strip, then **still**; moving it after the permit has turned to it spooks it (Shmukler).
  - Tarpon: steady **0.4-0.6 m** strips for a cruiser (judgement: "long, slow"); 5 cm twitches with pauses for a laid-up fish (Suescun's "couple of inches").
- **Stripping pace** (judgement): about one strip a second for bonefish, one every 2 s for permit, a continuous 0.3-0.5 m/s for tarpon. Stripping also takes up line, the same 0.6 m a strip.
- **The take:** the strike window stands (`FlatsFishing.js:418`).
  - A strip-set (one long pull, the rod low) hooks.
  - A rod lifted instead (a trout set) misses most times and pulls the fly away from the fish (judgement: e.g. 70% miss; no source gives a rate).
  - A tarpon needs two or three strip-sets before it's on (MidCurrent; Suescun's "two or three times").
- **Bowing:** a tarpon jumps (it's already in `LEAPS`). A jump on a tight line breaks the tippet or throws the hook unless you bow, which drops the tension to near nothing for the jump (about a second, judgement).

---

## 7. The flies

**The game now.**
- `src/game/Sight.js:234-235`: `SPLASH` by bait: shrimp 0.6, live 1.0, jig 1.2, plug 2.2. That's how far off it's heard, and it scales `castScare`'s "on its head".
- `FishTable.js:157-166` `eats`: by bait id. There are no flies.

**Sources.**
- **Gotcha** (MidCurrent, "How to Tie a Gotcha" ([link](https://midcurrent.com/v2/how-to-tie-a-gotcha-bonefish-fly-the-pattern-sizes-and-steps-that-work/))):
  - by Jim McVay; sizes 2 to 8 (size 2 at South Andros, 4-8 in Belize and Yucatán);
  - bead chain eyes are standard, with "minimal splash on entry";
  - no eyes or mono eyes for tailing fish in 6-10 in (15-25 cm);
  - brass dumbbells for deeper water or wind, louder in.
  
  It "should reach bottom in roughly two to three seconds on a typical one-to-two-and-a-half-foot flat."
- **Yellow Dog, "The best bonefish flies"** ([link](https://www.yellowdogflyfishing.com/blogs/back-stage-pass/the-best-bonefish-flies)): bead chain for flats of 8-20 in (20-50 cm); brass or lead dumbbells deeper. "Stainless steel bead chain eyes are the most commonly used weight on bonefish flies."
- **Deneki, "Spooking bonefish"** (above): under about 18 in (46 cm) of water, bead chain or small lead eyes, because heavy flies land loud.
- **Crazy Charlie:** the first bonefish fly with bead chain eyes, riding hook point up. Credited to Bob Nauheim, 1977 (Wikipedia via search summary). Sizes 4-6.
- **Merkin** (search summaries of tying pages, not opened): Del Brown and Capt. Steve Huff, mid-1980s; #1 or 1/0 hooks and large lead barbell eyes. Sold in 1/0 to 6 (Orvis 2, 4, 6). It "sinks rapidly" and rides point up.
- **Raghead crab:** Umpqua's, also used small for bonefish (Fishwest listing, search summary).
- **Tarpon Toad** (MidCurrent, "Tying the Tarpon Toad", [link](https://midcurrent.com/?p=2689)): by Gary Merriman, early 1990s Keys; 2/0 hook, mono eyes. "The toad is a light-weight, slow-sinking fly designed for sight-casting".
- **Cockroach, Black Death:** 1/0 to 4/0 (search summaries of pattern recipes and Mustad's tarpon hook). These are unweighted streamers.
- **Weights of the eyes:**
  - Murray's Fly Shop's weighed averages ([link](https://murraysflyshop.com/pages/fly-tying-weight-chart)), Wapsi lead dumbbells, a pair: XS 0.45 g (1/60 oz), S 0.68 g, M 0.94 g, L 1.35 g (1/20 oz).
  - Bead chain, 5/32 in: 0.26 g a pair (Dirty Water Fly Co listing, search summary).
  - A European shop's Wapsi table ([adh-fishing](https://www.adh-fishing.com/wapsi-presentation-lead-eyes-dumbbell)) gives two inconsistent weight sets, so I didn't use it.
- **Prices** (search summaries of fly-shop listings; shops returned 429 when opened):
  - Gotcha $3.50 (Fishwest, Blue Quill); Crazy Charlie $2.59-3.89 (Trident, Yellow Dog), $4.95 for a #6 (The Fly Shop).
  - Improved Merkin $8.95 (Blue Quill), Strong Arm Merkin $9.95-12.50; Rag Head Crab $9.10 (Fishwest).
  - Tarpon Toad $4.80 (Fish4Flies); Black Death 3/0 $5.95 (The Fly Shop).

**Derived.**
- **A bonefish fly's sink:** 0.3-0.76 m in 2-3 s = 0.10-0.38 m/s; the middle case, 0.5 m in 2.5 s, is **0.2 m/s**.
- **Eye weights:** a crab's medium to large lead eyes (0.94-1.35 g) are 3.6 to 5 times a Gotcha's bead chain (0.26 g).

**For the game.**
- **Shrimp fly** (the Gotcha; size 4; bead chain):
  - sinks at **0.2 m/s** (derived);
  - splash **0.4**, softer than the frozen shrimp's 0.6 (judgement from "minimal splash");
  - **$4** (the shops' $2.59-4.95).
- **Crab fly** (the Merkin; 1/0; lead eyes):
  - sinks at **0.35 m/s** (judgement: "sinks rapidly");
  - splash **1.0**, like live bait (judgement from "heavy flies land loud");
  - so within about 0.9 m of a bonefish it's on its head, by the existing `castScare` scaling;
  - **$10** ($8.95-12.50).
- **Tarpon fly** (the Toad; 2/0; mono eyes):
  - sinks at **0.07 m/s** (judgement: "slow-sinking");
  - splash **0.4**;
  - **$6** ($4.80-5.95).
- **In water under 0.46 m** (18 in), the crab fly's splash spooks bonefish (Deneki); for permit, which "aren't leader shy" and eat crabs, the plop is part of it (Fishwest: drop it close so it sees it land). Splash counts against bonefish more than permit (judgement).

---

## 8. Copper and amber polarized lenses

**The game now.**
- `src/game/Gear.js:80-83`: one pair of polarized glasses, $120.
- `src/game/Sight.js:7-21` and `src/game/rigs/Glasses.js`: they remove the glare's s-polarized part by Fresnel's equations; no lens colour.
- `Sight.js` `SIGHT.c0`: the eye's contrast threshold.

**Sources.**
- **No measurement of lens colour against contrast on the flats, or over sand, was found.**
- **Lab: Wolffsohn, Cochrane, Khoo, Yoshimitsu et al. (2000)**, "Contrast is enhanced by yellow lenses because of selective reduction of short-wavelength light", *Optometry and Vision Science* 77(2):73-81 ([PubMed](https://pubmed.ncbi.nlm.nih.gov/10701805/); the page wouldn't render here; abstract via a search summary of Aston University's portal, [link](https://research.aston.ac.uk/en/publications/contrast-is-enhanced-by-yellow-lenses-because-of-selective-reduct/)).
  - 20 young subjects; clear, yellow (450 nm cut-off), dark yellow and orange lenses.
  - Only the 450 nm yellow raised perceived brightness significantly.
  - Contrast sensitivity rose at low to mid spatial frequencies for white-on-blue gratings and fell for white-on-black.
  - The authors put it down to the lenses cutting short-wavelength (blue) light.
- **Later lab work on blue-blocking lenses** found no clinically significant contrast effect in long-term wear (*Frontiers in Neuroscience* 2022, [link](https://www.frontiersin.org/articles/10.3389/fnins.2022.898489/pdf); search summary only).
- **Guides and outfitters.**
  - Orvis, "Choosing the best sunglasses for sight fishing" ([link](https://www.orvis.com/choosing-the-best-sunglasses-for-sight-fishing.html)): "Everyone agrees gray sunglasses lenses are not ideal for shallow water and flats fishing, where sight fishing is crucial." Grey keeps true colour but adds no contrast; brown, copper or amber for the flats. No data.
  - MidCurrent, "Polarized Glasses for Flats Sight-Fishing" ([link](https://midcurrent.com/v2/polarized-glasses-for-flats-sight-fishing-lens-color-frame-and-the-80-pair-that-works/); mostly paywalled): one tint for full sun and a second for flat midday light; copper named. Pairs at about $80 (Hobie), $110 (Suncloud) and $200 (Costa). No measurements.
  - A *Field & Stream* column on lens colour (2013) returned 404.
- **Makers' claims (claims, not measurements).**
  - Costa: the 580 lens blocks "harsh yellow light" at 580 nm, which "boosts" reds, greens and blues and so contrast. Costa's own page returned 403; the wording is from retailers' copies. MidCurrent's 2009 review ([link](https://midcurrent.com/?p=7361)) repeats it, and its writer is "not engineer enough to evaluate those claims beyond their face value".
  - Smith: ChromaPop filters where blue and green, and green and red, cross over (search summary of Smith's pages).
  - Maui Jim and Oakley: no lens claim found in what I read.

**For the game.**
- **Any contrast gain from copper over grey is judgement.**
- **What physics suggests:** the blue light scattered in the water and reflected from the sky is a veil over the bottom. An amber lens cuts that veil more than the fish's light coming up off white sand. The lab result (gain against blue backgrounds) points the same way.
- **If the game adds a copper lens:**
  - a modest gain over sand, e.g. `SIGHT.c0` × 0.9 (judgement);
  - nothing over turtle grass, which reflects little blue anyway;
  - a little less light overall (no figure).
- **Price it** at the MidCurrent range: $80-200.

---

## 9. Wading, and booties

**The game now.**
- `src/player/Player.js:424-430`: wading slows the walk (3.0 m/s down to 0.42 of it at 1.2 m deep).
- `src/game/Sight.js:242,253`: the push of water ahead is a hull's only, "not someone wading". Wading counts through the notice range (speed, eye 1.6 m: `Sight.js:22,170-182`).

**Sources.**
- **Deneki, "Wading in shallow water"** (2010; [link](https://deneki.com/2010/08/wading-in-shallow-water/)):
  - walk slowly to keep down splashing and foot noise;
  - land on the balls of the feet, not the heels;
  - shell and limestone bottoms are crunchy and loud, sand and soft grass quiet;
  - let a fish come to you over a crunchy patch.
  
  "Approaching a bonefish on the far side of a shallow, calm flat might take 15 minutes or more."
- **Andrew Bennett, MidCurrent, "Tips for Saltwater Wading"** ([link](https://midcurrent.com/?p=3663)): the same. "Landing hard on your heels can make a lot of noise, especially if you're walking on a "crunchy" bottom."
- **Deneki, "Wading for bonefish: lift your toes"** (2017; [link](https://deneki.com/2017/01/wading-for-bonefish-lift-your-toes/)): in a foot (0.3 m) of water or more, lift the toes and slide each foot forward under the surface, "pushing less water that might otherwise spook fish". It also keeps the foot from slapping through the surface.
- **Louis Cahill, Gink & Gasoline, "6 Tips for Catching Spooky Bonefish"** ([link](https://www.ginkandgasoline.com/fly-fishing-tips-technique/6-tips-for-catching-spooky-bonefish-2/)): "Take special care that your steps do not push water." Bonefish are sensitive to "the sound of your legs pushing water"; lead moving fish by as much as 40 ft (12 m) in skinny water.
- **M17's sources** (sources-tide-fish.md): shuffle, don't lift the feet (Salt Water Sportsman); on glassy days the push from footsteps can send fish off (unverified).
- **Footwear.**
  - Chad Shmukler, Hatch Magazine, "Flats wading shoes: how to choose" (2015; [link](https://hatchmag.com/node/2870)): full flats boots for protection and ankle support on coral and rock (Turneffe). Lightweight booties ("ZipIt") are the norm on firm sand (Ascension Bay). Nothing on noise.
  - Deneki, "Wear good boots" (2015; [link](http://deneki.com/2015/12/wear-good-boots/)), for Andros's rocky flats with grass and conch: "We're talking hard soled, closed toed, ankle supporting, boots." The reason is the feet, not noise.
  - Austin Kane, Flylords, bonefish on foot ([link](https://flylordsmag.com/mastering-bonefish-fly-fishing-top-5-tips-for-on-foot-anglers/)): "Regular wading boots are overkill for typical bonefish flats and kill any sort of stealth approach"; flats booties instead.
- **Mud:** marl and mud can be too soft to wade; you sink to the knees in places (search summaries of Florida Sportsman, not opened).
- **No source measured** how far a wader's push or step carries. A claim of ripples reaching 50 ft from a normal stride appeared in a search summary, but I couldn't find it on any page I opened.

**For the game.**
- **Wading should push water like a slow hull:** give the wader `pushAhead` at their speed, in water over about 0.3 m (Deneki's "a foot or deeper"). Halve it when walking slowly (judgement).
- **A step on hard bottom** (shell, limestone, the reef flat) should be heard like a light knock, inside `KNOCK_HEARD` × 0.5 (judgement). On sand and grass, not at all.
- **Booties versus boots:** sources say heavy boots are loud and booties suit sand. Nothing measures it, and nothing says footwear changes the push.
  - If booties are sold: they quiet the hard-bottom step, e.g. halve its range (judgement), and leave the push alone.
  - Bare feet on rock, coral or the reef flat would hurt (the guides' reason for boots), but that's outside the fishing.
- **Mud:** slower still, and it clouds the water (judgement; the game's mangrove mud).

---

## 10. Fly tackle prices

**The game now.** Gear's prices are about real dollars: a 9 ft surf rod $260, the two-speed reel $900, the 80-class reel $1,200, the glasses $120 (`src/game/Gear.js:45-57,82`).

**Sources** (outfit and rod prices from retailers; some pages opened, most search summaries):
- **Entry outfit (rod, reel, line, backing):**
  - Orvis Clearwater 9 ft 8 wt saltwater outfit: $646 on Orvis's page (opened, [link](https://www.orvis.com/product/clearwater--8-weight-9-fly-rod-saltwater-outfit/2S7R5751.html)), with a Battenkill Disc IV reel, Hydros Saltwater line and 200 yd of 20 lb.
  - Other shops: $449-540. Orvis offers it only up to 9 wt.
- **Mid-range, bought apart:** Redington Predator Salt 9 ft 10 wt rod $399.99; Redington Behemoth reel $149.99; RIO Elite Bonefish line $129.95; SA Amplitude Grand Slam $99.95.
- **Top end:**
  - Rods: G. Loomis Asquith $1,235 (first generation) to $1,570-1,750 (second, 4 to 12 wt); Orvis Helios F from $1,098.
  - Reels: Hatch Iconic 9 Plus $919 (Trident); Tibor Riptide $735-1,020 (several shops; Trident warns of a three-year wait).

**Derived.**
- Entry 8 wt: about $450-650.
- Mid 10 wt: 400 + 150 + 115 = about $665.
- Top: 1,235-1,750 + 735-965 + 100-130 = about $2,100-2,850.
- A 12 wt costs a little more than a 10 at each level (heavier reels); no single source priced one.

**For the game** (judgement within those figures; the shop's other gear is priced near real):
- **8 wt outfit $500, 10 wt $750, 12 wt $1,000.** Each is rod, reel, line and backing, mid-range.
- If one top-end tier is wanted: about $2,000-2,500.
- **Flies** about $4 (shrimp), $10 (crab), $6 (tarpon) each, or in a box of a dozen.

---

## Numbers for the game

Rod and line:
- Rods: 8, 10 and 12 wt, each 9 ft (2.74 m). 8 wt bonefish; 10 wt permit, barracuda and tarpon under about 30 kg; 12 wt tarpon.
- Line weights (AFFTA, first 30 ft): 13.6, 18.15 and 24.6 g. Fly line 30 m (100 ft); head 12-14 m (40-45 ft).

Leaders and tippet:
- `lineKg`: 5.44 (12 lb, 8 wt), 7.26 (16 lb, 10 wt), 9.07 (20 lb, 12 wt).
- Leader 2.9 m (bonefish), 3.4 m (permit), 3.0 m (tarpon). Tarpon bite tippet 60 lb, 30 cm. Barracuda: wire.

Reels and the fight:
- `dragKg`: 4.0, 6.8 and 9.0 kg (seldom reached).
- `DRAG_SET` as it is.
- `holdKg`: about 2 kg with the rod high, 5.7 kg with it low.
- `spoolM`: 210, 240 and 300 m.
- `reelSpeed`: 0.7, 0.7 and 0.8 m/s.
- First runs: bonefish 45-57 m, a big one to 90 m. Permit and tarpon by judgement (60-120 and 70-150 m).

Casting:
- Carry 7 / 11 / 14 m and shoot up to 4 / 6 / 8 m, novice / fair / good.
- Total about 11 / 17 / 22 m. Bonefish shots 9-23 m; tarpon at most about 18 m.
- False casts: none needed to about 12 m; two at most is the guides' rule. Each adds 1.5-2 m.
- A false cast takes 2 × (0.3 + 2L / 20) s: 1.8 s at 6 m, 2.4 at 9, 3.0 at 12, 3.6 at 15. A presentation is about 5 s.
- Wind: into 7 m/s, carry and shoot about a quarter shorter; downwind about a sixth longer.

Spooking:
- A false cast spooks a fish within 4.6 m × `wary` of the line in the air; more with the sun behind and the line between sun and fish.
- Lining: 0.5-1 m.

The retrieve and the set:
- Strips: bonefish 0.6 m, about one a second, pause when close. Permit 0.6-0.9 m slow, then still. Tarpon 0.4-0.6 m steady, or 5 cm twitches for a laid-up fish.
- Strip-set to hook; a trout set mostly misses. Tarpon: two or three sets. Bow on every jump.

Flies:
- Shrimp fly: sink 0.2 m/s, splash 0.4, $4.
- Crab fly: sink 0.35 m/s, splash 1.0, $10.
- Tarpon fly: sink 0.07 m/s, splash 0.4, $6.
- Eyes: bead chain 0.26 g a pair; lead dumbbells 0.45-1.35 g.

Glasses, wading and prices:
- Copper lens: `c0` × 0.9 over sand, judgement; $80-200.
- Wading: a push like a slow hull's in water over 0.3 m; a step on hard bottom heard at about half `KNOCK_HEARD`; booties halve that.
- Outfits: $500 / $750 / $1,000.

## Unsourced, judgement

- **Rod and arm:** the false cast's stroke time (0.3 s) and fishing line speed (20 m/s) in the rhythm formula; carry and shoot by skill (only bounded by the head length and the guides' distances); line slipped on each false cast; no source says a heavier rod casts further, and its tiring the arm sooner is a guess.
- **Wind:** the distance it costs; none measured.
- **Reel:** the fly reel's cranking rate (2-3 turns a second) and so `reelSpeed`; the 12 wt's slightly larger arbor.
- **Rod angle:** which `holdKg` the game uses, and whether rod angle is the player's choice.
- **Runs:** permit and tarpon run lengths; no source gives one.
- **False casts:** the chance a false cast spooks a fish inside 4.6 m, and the sun-behind multiplier. Deneki's 15 ft itself is guide lore, for bonefish only, and the optics don't explain it.
- **Lining:** widening the zone for a fly line to 1 m.
- **The retrieve:** tarpon strip length (sources say only "long, slow"); stripping pace for each fish; the trout set's miss rate; how long a bow lasts.
- **Flies:** sink rates of the crab and tarpon flies; all three splash values; that splash matters less to permit.
- **Glasses:** any contrast gain from copper or amber lenses on the flats (no measurement exists); the ×0.9.
- **Wading:** the wader's push, the hard-bottom step's range, and what booties change; nothing measured.
- **Prices:** the game's fly-tackle prices (the real ranges are sourced; the picks within them are not).
- **Leader wear:** the tarpon bite tippet as a wear rate.
