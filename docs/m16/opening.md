# M16: the opening

New players start in the kayak; those already playing keep the lobster boat and get the kayak. The Guide speaks to the boat you're in, Marta's list comes up in play, the prices are tuned against what the fish fetch, the real boats are re-measured, the gear that did nothing does something, and a gale's two figures follow each boat. To be folded into `docs/M16.md` at the end.

## The start

`Boats.START_BOAT` is `kayak`. A brand-new save has her and nothing else, no money and no fuel. A v1 save loads as it did: the lobster boat with her gear and tank, the kayak beside her, nothing paid for either. `reset()` starts in the kayak too. `test/opening.mjs` and `test/boats.mjs` check both.

## The Guide

`Guide.tipFor( id, device, state )` picks the words for the input in use and the boat you're in. `IN_KAYAK` is what's different in a kayak; a tip that's a function reads the state, so the boat tip says *Gasoline* in the console and *Diesel* in the lobster boat.

The three cards are hers: "A kayak, a rod and the island", then the fishing, then her own keys (no helm, radar or horn) with a live distance to her beside Joe's and Marta's. Her marker pulses on the map with theirs. When the cards close, a tip says where she lies.

| Only where it applies | When |
|---|---|
| Radio | At a helm, with a set |
| Hull worn | A boat with an engine: plastic doesn't leak or slow |
| Bilge | A boat with a bilge |
| Fuel: Marta, Pearl, the chart's plotter, the far grounds | A boat that burns it |
| What she can stand | The kayak has her own: past 3 ft or 20 knots she goes over, and how to right her |

### Marta's list, in play

Nobody's told about boats in the opening cards past "one day a boat with an engine". They come up as the game gets there:

| What you've done | What comes up |
|---|---|
| At her counter, in a kayak | Marta: "That kayak'll do for the flats. When you've saved for an engine, the console's on my list" |
| Five fish in your log, ashore | A tip: her **Boats** tab, the console and her price, and the shape with no picture under her |
| The console's price in your pocket | A tip, and Marta: "You could have the console now" |
| In your first boat with an engine | A tip: her fuel, the anchor, the tow, and watching the sky |
| The lobster boat, and 4 of the 19 | A tip: that silhouette, what she asks, and how far you are |
| All 19 | A tip, and Marta: "You've earned her" |
| Kept a lobster boat from before | One tip, the first time: the kayak's yours, and what's on the list |

The silhouette's own line says "The lobster boat first, for her gear" until you've bought her, since most of the 19 are only sold with her.

## The prices

`tools/earnings.mjs` plays the game's own bites, weights and fish prices as a steady hand would, for 400 hours at each stage: cast, wait, strike, fight, and when the cooler's full run in and sell to Joe, less fuel. It leaves out the wanted lists, the orders and the night box.

| Stage | Where | Line, box | Run in | A steady hand, an hour |
|---|---|---|---|---|
| Kayak, bare | Flats, pier, bay | 8 lb, 12 kg | Paddling | $690 |
| Kayak, line, reel and crate | And the creek | 15 lb, 25 kg | Paddling | $1,070 |
| Console, inshore gear | Reef, bay, creek | 15 lb, 60 kg | 1 min | $1,410 |
| Console, near offshore | Reef and shelf | 30 lb, 60 kg | 4 min | $2,430 |
| Lobster boat, bare | Reef and shelf | 30 lb, 30 kg | 6 min | $1,390 |
| Lobster boat, upgraded | And the edge | 60 lb, 160 kg | 8 min | $3,750 |
| Sportfisher | Edge and blue | 60 lb, 300 kg | 9 min | $6,890 |

A real player isn't a steady hand: they miss strikes, lose fish, walk about, look at things and fish at night when Joe's shut. Reckon half of it. That half is a judgement, not a measurement. The one real sample is the driven game below, which isn't a fair hour.

The money's generous against real boats on purpose: the boats are about a fortieth of real prices (fleet.md), and fish are at something like real prices per kilo.

| Step | Costs | At | Steady | Reckoned |
|---|---|---|---|---|
| The kayak's first gear (line, reel, rod, crate, paddle, jacket, hatch, anchor) | about $515 | $690 | 45 min | 1.5 h |
| The console | **$1,800** | $1,070 | 1.7 h | 3.5 h |
| Her gear | about $1,700 | $1,400 to $2,400 | 1 h | 2 h |
| The lobster boat, less a trade-in if you want one | **$6,000** | $2,430 | 2.5 h | 5 h |
| Your rod, reel and line, and her 12 levels | $4,485 less what you've bought | $1,390 to $3,750 | 2 h | 4 h |
| The sportfisher | **$25,000** | $3,750 | 6.7 h | 13 h |
| In all | | | about 15 h | about 30 h |

**Console $1,800, down from $2,500.** At $2,500 the first engine took 3 hours of a steady hand, 6 reckoned, in a boat you'd long since seen all of. At $1,800 it's about 2.5 and 5, the same as the next boat takes. I found no list price for a new 23 ft boat with a single 150. The nearest are a 24 to 28 ft Robalo with a single 300 at $66,275 and clean used boats with a single 150 or 200 at $48,000 to $66,000. So $72,000 for a new one is a fair guess, and a fortieth of that is $1,800. Her upkeep follows, a tenth of her price a year: $15 a month.

**Lobster boat $6,000, kept.** Her price is from my general knowledge of 27 ft diesel boats, about $240,000 at a fortieth, and I didn't check it against a source. Bare, she earns less than a console with gear: her 30 kg against the console's 60. That's a dip worth knowing about, and it's what makes her hold the first thing to buy.

**Sportfisher $25,000, kept.** A million-dollar boat at a fortieth, also unchecked, and earned rather than saved for first.

**Tracks kept.** Each of the kayak's is minutes of fishing, as they should be for a first stop; the console's and sportfisher's about an hour of her earnings together. The unlock's $3,050 and $1,435 are the doc's.

**Fees kept, and they don't bite.** A month is 20 hours of play. The sportfisher's $280 is about two and a half minutes of what she earns, and a run to the blue is about $166 in fuel on a catch of about $4,000. They're real figures, a fortieth of real costs, and they make a bill to read rather than a decision. Biting would mean about $10,000 a month. I left that alone: it isn't realistic against her price, and it would punish anyone who leaves her at the dock. Say if the big boat should cost more to keep.

## The real boats

`tools/boat-figures.mjs` on the real models. The lobster boat's 5% was from M15; the tool now also measures drift in the game's own fair-day sea, not only on flat water, since that's what `ABLE.drift` means, and it gives all four on the same footing.

| | Cruise | Draught | Drift, was | Drift, now |
|---|---|---|---|---|
| Kayak | 1.6 m/s, a steady paddle (kayak.md) | 0.12 m | 3% | 5.8% |
| Console | 12.1 m/s (was 11) | 0.53 m | 5% | 5.5% |
| Lobster boat | 7.1 m/s | 1 m (her skeg: her hull's 0.77) | 5% | 6.6% |
| Sportfisher | 13.1 m/s | 1.4 m | 6% | 7.2% |

So a boat left adrift while you're away goes about a third further than it did (`Away.DRIFT` follows). The console's drift sock went from 1.1 to 2 m²: at 1.1 it barely slowed her, 79% of her bare drift, and now it's 60%, against the 50% the sums use. That's a sock about 5 ft across on a 23 ft boat.

Marta's pictures are drawn again from the real models with `tools/boat-pictures.mjs`.

## The gear that did nothing

| Gear | What it does now | Why |
|---|---|---|
| Underwater lights | At night, lying still, within about 30 m of her stern: swordfish count 6 times over, and bites come sooner. A bite at 11 at night in the blue is a swordfish 21% of the time, against 4%. A green pool shows on the water about her stern | Swordfishermen drift at night with lights out, green the most cited, for the squid and bait they draw. How much is judgement: the one figure I found is an angler's "at least twice as many" squid and bait at a green light, and some anglers argue for no lights at all. Off under way, since a running boat draws nothing |
| Generator | Runs the icemaker away from her berth, at about a gallon an hour from her tank | An icemaker is AC: shore power at the dock, a generator at sea. So the icemaker now makes nothing at sea without one, and its label says so. A 21.5 kW Onan is quoted at 1.1 gallons an hour at half load |
| Livewell | On the console, the lobster boat's top level and the sportfisher: live bait on the hook bites 15% sooner, fishing from that boat. Its `baitMax` was already doing what the label said | A pumped well keeps bait lively, and lively bait draws strikes. The 15% is a judgement |
| Dry hatch | Half as much of your catch goes when she turns over | The doc's "a life jacket's worth of room" made no sense: a life jacket's worn, not stowed, and it already works without one. So the stat's `dryHatch` now, and the label's changed |

## A gale, boat by boat

`tools/gale-figures.mjs`: each real model, head to a southerly gale.

| | Worn a minute, flat out | At a third | Was, flat out | A breaking sea | Knock |
|---|---|---|---|---|---|
| Console | 8.2% | 2.0% | 35% | 15 L of her 200 | 0.7 rad/s |
| Lobster boat | 5.6% | 2.7% | 22 to 26% | 60 L of her 500 | 0.5 rad/s |
| Sportfisher | 2.6% | 0.7% | 11% | 30 L of her 1,500 | 0.25 rad/s |

M10 meant "about a quarter in five minutes" flat out, and the true seas took that to a quarter in one. `Hull.HULLS`' `slam` brings each back, with the console's light hull pounded harder and the sportfisher's less. This is judgement on the size of the numbers. It lowers every slam's wear, so a rough day's wear is lighter than it was too.

The console's deck and the sportfisher's cockpit clear by their scuppers, so little of a breaking sea reaches the bilge, where the lobster boat's open cockpit lets it down round her engine box: her 60 L stays. The console's green water also came down, from 12 to 6 L a slam, for the same reason. The kayak has no bilge: a breaking sea knocks her, 1 rad/s, and that's a capsize. The points a sea can come aboard follow her length. Four minutes at 0.7 head to it, one run each: the console 4 seas and 208 L, the lobster boat 9 and 911 L, the sportfisher 3 and 211 L. It varies, so the seas aboard aren't a ranking.

## What isn't verified

See the stream's report for this round's readings. Prices and the half-a-steady-hand figure want a real player. The GPU and phone look of the green pool are unverified.

## Sources

- Console: [BoatTest's 24 to 28 ft comparison](https://boattest.com/view-news/5380_we-compare-24%27-28%27-center-consoles--which-center-console-is-best) (Robalo, single 300, $66,275, undated), [Pulse on used boats](https://pulserevops.com/knowledge/bt0283) ($48,000 to $66,000). The lobster boat's and sportfisher's prices aren't sourced. The fortieth is fleet.md's.
- Generator: [owners quoting Onan's manuals on TrawlerForum](https://www.trawlerforum.com/threads/generator-fuel-use-rate.79786/post-1340843) (21.5 kW: 1.1 gallons an hour at half load, 1.9 at full). A forum's quotes, not the maker's sheet.
- Lights: [boats.com, Sword Fight](https://www.boats.com/on-the-water/sword-fight), [BoatUS, Creatures of the Night](https://boatus.geico.com/expert-advice/expert-advice-archive/2024/august/creatures-of-the-night), [Florida Sportsman](https://www.floridasportsman.com/editorial/slightly-easier-sword-rigs/400224), [Texas Saltwater Fishing](https://www.texassaltwaterfishingmagazine.com/fishing/by-type/offshore-fishing/strangers-night). Anglers' accounts, no controlled figures. The 30 m reach and the factor of 5 in `FishTable` are judgement.
