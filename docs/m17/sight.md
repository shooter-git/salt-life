# M17, stream 1: sight-fishing on the flats

What [M17.md](../M17.md) asked of "Sight-fishing on the flats" and "The record": the flats' fish drawn, each as it's seen; seeing them, through the glasses and not, from each eye's height; stalking them; casting to a seen fish, which takes it or doesn't by what it is and what it's shown; the grand slam; and the Guide's tips. Built 2026-11-08 on `m17-flats` 3f1367b (the foundation: [foundation.md](foundation.md)), on branch `claude/m17-sight-eb5327`. The sources are [sources-tide-fish.md](sources-tide-fish.md).

## The fish drawn

`game/Flats.js` (the foundation's) says where each school is by the clock, the tide and the moon. `game/FlatsFishing.js` asks it twice a second for those within 90 m of you, and `world/Fish.js` gives each a group of its own kind from a pool (`world/fish/FlatsPool.js`), parked well off until then: its anchor moves at the island's pace, and its fish swim about it in real time, each in its place in the school (along its way and across it). A school that's gone (spooked, out of reach, off the flat) has its group parked again once any run it's on is over; one given its group, or back from a fright, comes into sight over a couple of seconds. A kind too big for the water at its anchor (a tarpon laid up on the edge at a spring low, a barracuda on a bar bared at low water, a snook at the mangroves' foot) keeps to the nearest water deep enough for it within 36 m. A spooked school runs for deeper water, at its burst at once (a bonefish at 5 to 6 m/s). Each keeps to its height in the water as it goes (on the sand to root, up through the surface to roll).

**How a bonefish tails.** Head down, as steeply as the water lets it: in a foot of water at about 40 degrees with a hand's breadth (0.11 to 0.15 m) of tail out, in deeper water at 52 degrees with the tail under. Each turns its own way to root, so a school's tails point every way. Out of the water its tail is wet and silver-white in the sun, as tailing bonefish are photographed; a permit's sickles and a shark's fin keep their own dark. A rolling tarpon's flank through the surface is a glossier mirror of the sky (wet), its back its own dark.

**Tails are rarer than they'd be on a real flat.** The bonefish's feeding grounds (`game/Flats.js`' homes, the foundation's) are in 0.5 to 1.25 m of water while they feed (median 0.8 m), the top of the tide, and a bonefish's tail is out only in about 0.45 m or less. Up on the shallowest sand within reach, about one tailing school in seven by day has tailing water (45 of 550 under 0.32 m: `test/sight-fish.mjs`); the rest root head down with their tails under. Homes on the bars' tops would show many more ([the note for the M17 session](#not-verified)).

| Kind | Pool (low / mid / high) | Drawn as |
|---|---|---|
| Bonefish | 3 / 4 / 5 schools of 12 / 16 / 19 | tailing: up on the shallowest sand within 25 m of the school's anchor (nearest a foot deep), each head down its own way, the tail out where the water's shallow enough for it, a ring where it breaks the surface; mudding: head down, puffs of silt left behind (plain over grass, hardly there on white sand); cruising: a loose school going on, nervous water over it in a foot or two of water, each fish's shadow on the sand; milling at a creek's mouth |
| Spawning bonefish | 1 school of 16 / 28 / 48 of the hundreds | milling off the edge at dusk about new and full moon |
| Permit | 2 of 1 or 2 | cruising the edge; one in under 0.7 m of water stops now and then to tail on a crab (guides' lore), its black tail out where it's under about half a metre. `game/Flats.js` keeps them 0.74 m deep and more by day, so that's seldom seen (`test/sight-fish.mjs` shows it on a bar) |
| Tarpon | 3 | laid up just under the surface, still, in calm sun; rolling: half a metre or so under the top between rolls (0.4 m and a tenth of its length), then up through the surface and over, gulping air, its head, back and dorsal out (a ring and a splash), then down |
| Snook | 3 | lying still at the mangroves' edge and the creeks' heads, facing into the ebb |
| Barracuda | 2 | hanging still over the grass |
| Blacktips | a pack of 4 | cruising, fins out over the flat |
| Lemon shark | 1 | cruising alone (a new model: below) |

**Looked at beside photographs** (`tools/flats/sight.mjs` draws each on low; `tools/flats/compare.mjs` sets each render beside the photographs, hot-linked from where they're published, not kept). Judged by eye, and what didn't match fixed:

| View | Photographs | Judged |
|---|---|---|
| Tails, from the kayak's seat and through a long lens | Florida Museum (Kenneth Krysko) | Tails were dark sticks and the fish stood on their heads, half out of the water, floating at the top of it. Now they sit on the sand, tip down as far as the water lets them, and the wet tails are silver. The bodies under the water were too plain at the edge of seeing; one seen half the time is now a ghost of itself |
| One fish and its shadow, from above | Deneki (Louis Cahill) | The shadows were soft blobs; now a crisp fish's outline beside each fish, as his is |
| A cruising school, from a bow | Deneki (Peter Viau), Florida Museum | The dark elongated shadows over the sand read as his. The nervous water over them had been a speckled oval twice the school's width, nearly hiding the fish (its wavelets finer than a pixel at 12 m and a low angle, aliased); now a faint dulling of the sheen the school's size, its wavelets drawn only where they're bigger than a pixel |
| A mud, wading | Florida Sportsman (2023) | Too small and faint against the photograph's wide milky band; now puffs that grow to metres, a school come upon mudding with a band of older silt behind it. Plain over grass, hardly there on white sand |
| Permit, from a poling platform | Nick Price (a permit tailing) | Two deep-bodied grey-blue fish with their dark sickles and their shadows over sand. His is tailing, its black sickle and dorsal out; that's shown in Node only (Flats.js keeps permit 0.74 m deep and more). The view first found its permit over grass from 9 m off a bow, where by the sight model it hardly shows (seen 0.06), and drew nothing: it now looks for one over sand from a platform's height |
| A laid-up tarpon | Salt Water Sportsman (Alex Suescun) | A dark fish plain in clear shallow water, its shadow under it; the sea's own blue where his is a green flat |
| A rolling tarpon | Flylords (2025) | Rolled too deep to reach the surface in its roll's time, and then its rise was held to the slow drift's vertical speed: its back stopped a quarter metre under. Now it rises at its own pace from half a metre or more under, and comes up through the surface and over: its head, back and dorsal out side on, rings about it (`test/sight-fish.mjs`). Theirs show the backs and dorsals of a few in a calm far off, and a flank silver-gold with its scales; out of the water its flank is the mirror it is under it, glossier (wet), its back dark. A try at a wet silver painted on came out flat white plastic beside theirs, and was taken out |
| A barracuda | Commons (James St. John, San Salvador) | Long, grey, even its reddish fin tips, with its shadow under it |
| Snook, from its side | Commons (Robertson) | Grey-olive, its yellow fins, its shadow crisp under it. The view had been shot from its group's centre, the fish itself far off and end on; it's now followed from its side through a longer lens |
| A lemon shark | Commons (USFWS, young ones on a Key West flat) | A small brownish shape, as theirs; over grass its water darker than their white sand |
| Blacktips | Commons (two at depth, underwater) | The model's grey back and pale belly only; no photograph of blacktips on a flat from above was found. Over grass and in the glare at 7 m they hardly show |

**The marks' ovals.** Large soft pale and dark ovals about the fish in the views from above were the nervous water's: its patch had been sized by the school's whole spread (8 to 11 m) with its wavelets laid out in the patch's own units, so they came out as swells metres across. The ripples are now in metres, the patch the school's size; laid out on a lattice they still came out as rows of even dots, so they're now two drifting noises crossed (irregular wavelets a hand's breadth to a foot across), and where those are finer than a pixel a faint dulling instead. **The small pale ovals on low's bottom** near the camera in the views from the water are the bottom's own: drawn again with every mark and fish hidden (`SIGHT_HIDE=marks,fish`), they're all still there. So are the other shapes that might be taken for marks: the dark round head beside the permit, the bright oval past the lemon shark, the white sand with dark blotches beside the school from above (each drawn again with the marks hidden, `SIGHT_HIDE=marks`).

**The lemon shark** (`FishSpecies`' `lemonShark`, its skin's own row): stocky, the snout short and broad (shorter than the mouth is wide, as its name says), small eyes, the first dorsal set back behind the pectorals and the second nearly as big as the first (the kind's mark, FLMNH), broad sickle-shaped pectorals, a plain yellow-brown back over a pale yellowish belly. `tools/fish-look/compare.mjs lemonShark` sets it beside Duane Raver's drawing and photographs from Commons. Its triangles by level of detail: 3322, 806, 226, 76.

**The marks** (`world/fish/FlatsMarks.js`): two instanced quads with a program each, made the first time a school's in sight of you, so nobody else pays for them.
- On the bottom, drawn before the sea (so its glare is over them as it is over the fish): each fish's shadow, along the sun's light bent into the water; a mud's silt, spreading and settling over a minute.
- On the water, after the sea: nervous water over a school cruising under a calm surface, short irregular wavelets (a hand's breadth to a foot, two drifting noises crossed) flickering against the sky's sheen over the school, and where they're finer than a pixel (far off, at a low angle) the patch's sheen dulled instead; a wake (a bulge at a fish's head, a V spreading back) from one pushing water or bolting; a ring where a tail broke the surface or a tarpon rolled.

**Within low's triangles.** The flats' fish are drawn last, nearest first, through a budget (`FlatsBudget`): a level finer than their size says (their fins and tails are what's seen of them), on low no finer than the second level of detail, and 9,500 triangles a frame at most, the coarser levels taking over as it's spent (`test/sight.mjs`: every pooled fish as near as can be draws 9,460; `test/sight-fish.mjs`: a school of 12 from the kayak, 9,192). On low, where nothing's cross-faded, a fish is drawn or not (a dithered one there is specks). That's inside the room the checks' camera leaves on low (about 13k). The flats are 500 m and more from where the checks' camera stands, so nothing of this is drawn in the checks at all.

## Seeing them

`game/Sight.js`, pure. A fish under the water is seen by the light coming up from the bottom past it against the sky's glare off the surface, and both go by the angle you look down:
- the glare is Fresnel's for seawater (n 1.34), the sources' table to within a hundredth (`test/sight.mjs`);
- polarized glasses take its s-polarized part: nearly all of it at Brewster's angle (37 degrees down), little along the surface (`glareLeft`, which the glasses now use for the sea's reflection too: M16 had half of it left along the surface and a twelfth at Brewster's, where Fresnel has nearly all and none);
- the bottom: white sand sends back about 0.55 of the light and shows a fish and its shadow; turtle grass (0.1) hides them, its blades and patches a clutter the eye has to see through;
- the sun: high and behind you; low in your face its glitter's in the way; under a cloud's shadow the bottom has the sky's diffuse light alone (a tenth of a clear day's, AMS) and the surface reflects the bright cloud;
- a ripple blurs the image, and rain on the water shows nothing;
- a fish's back against the sand (`FishTable`'s `sight.back`: the bonefish is the grey ghost, a tarpon's big dark back plain), its tail out of the water against the water's sheen, its school's sign on the water;
- the eye's threshold: a few times the lab's contrast (it's searching, not told where to look), more for something small and far.

No study has measured spotting range by eye height (the sources: none found), so the model's two constants are set to guides' ranges. A bonefish on white sand, the sun high behind you, a light air (3 m/s), shows to:

| Eye | Height | With the glasses | Without |
|---|---|---|---|
| The kayak's seat | 0.81 m | 9.8 m | 8.5 m |
| Wading, standing | 1.62 m | 18 m | 16 m |
| A bow, a casting deck | 2.5 m | 26 m | |
| The lobster boat's roof | 3.8 m | 35 m | |

and under a cloud's shadow 2 m from the kayak, 4.5 wading; over turtle grass under 1 m; in rain nothing. A tail on glassy water shows to 35 m from the kayak, gone in a 8 m/s breeze; nervous water to 40 m on a calm, gone by 5 m/s. The glasses help least where you're lowest, as the physics has it: from the kayak's seat at 10 m you look down 4.6 degrees, where they take only a sixth of the glare.

Each school's group is drawn as plainly as it shows (`Fish.sightFade`: its body, or its tail where one's out), its shadow and its sign with it; a cloud's shadow over it is worked out on the CPU from the clouds' cover, drifting on the wind (`FlatsFishing.shadeAt`), since there's no CPU copy of the sky's clouds (on high it isn't the drawn shadows' own pattern). Under the water everything's drawn as it is.

## Stalking

What tells a school you're there (`Sight.scareOf`, each frame for each school in reach):
- **your speed**, as the speargun's fish notice it: a bonefish notices someone keeping still 3.7 m off (wading, a light air), coming slowly 4.8, splashing along at 2 m/s 16; further from a taller eye (Snell's window), in glassy water, and in a foot of water than in a metre and a half; a permit the warier (1.25 times), a barracuda hardly (0.45);
- **the push of water** ahead of a hull moving through shallow water: a few seconds' travel ahead of her (9.5 m at 1.5 m/s over a flat), none past a metre and a half of water or drifting;
- **your shadow** over them: long early and late (5 m standing in the evening), short at noon, none under a cloud;
- **a paddle knocking the hull**: a careful stroke hardly ever (1.5%), a hard one now and then (13%), heard 22 m off through the water; **an engine running**, 120 m off (guides: an idling engine spooks them for hundreds of yards);
- **a cast**: a bait landing on a fish's head (inside its `head`, further for a plug's splash), or the line laid over its back.

A spooked school bolts, each fish off at its burst with a wake where it's shallow, and it's gone from the flat for 0.6 island hours (Flats' `spook`, kept in its small record for the second wave to send to a guest).

## The cast and the take

A seen fish's own take, beside the bites' habitat roll (`Bites.seenTake`, read by `FlatsFishing.watch` from `Game.updateBite`). Once the bait's in the water near a school, the first of its fish whose way it's in looks at it (once a cast):
- put ahead of its nose, on its way (`sight.lead`: a cruising bonefish 0.6 to 2.4 m; one tailing or lying still only `sight.close`, a tailing bonefish 0.25 to 1 m), it sees it, turns and comes to it;
- on its head, it spooks; behind it or off to the side, it doesn't see it, unless it's loud enough to hear (a plug brings a barracuda, a snook or a tarpon round from any side);
- at it, it eats or refuses by what it is and what it's shown (`sight.eats`), keenest tailing, least milling, best shown in the middle of its window; some refusals spook it as it turns off (`sight.picky`).

| Shown well | Eats | Refuses | Spooks |
|---|---|---|---|
| A cruising bonefish, a shrimp 1.4 m ahead | 53% | 35% | 12% |
| A tailing bonefish, a shrimp 0.6 m ahead | 75% | 19% | 6% |
| A permit, a shrimp 1 m ahead | 14% | 50% | 36% |
| A laid-up tarpon, a plug 0.6 m ahead | 31% | 58% | 11% |

The fish you see comes to the bait as it's drawn. If it eats, the bite's the one you strike, as any other: its kind, and its weight from its own length by its kind's relation (as the speargun's fish are), and the rest of the school bolts. A shark that eats it bites through the line. Reeling it away ends a follow. The bites' own roll goes on beside it on the flats as everywhere: a blind cast there still takes what the water has.

The rods you have, no fly rod: the frozen shrimp, jigs and plugs, and live and cut bait. What each kind takes is guides' lore (FishTable's `SIGHT`, docs below): no study of flats fish's takes or flight distances was found.

## The grand slam

A bonefish, a permit and a tarpon in one island day, each let go: a trophy in `Trophies.js`, beside the billfish.
- `SLAMS` is the list: an entry's kinds and its name. Stream 7 adds the super grand slam and the billfish grand slam as two more entries.
- The day is the island's, sunrise (5.8) to sunrise (`slamDay`), and a sleep ends it: a jump of the clock past an island hour and a half (a rest, a night aboard; the tow's jump too) clears the day's tally (`slamSlept`).
- Kept in `state.trophies` (`slam:grand`: how many, the first day and the last, the place, each fish's weight; `today`: the day's tally), through the save by `cleanTrophies`, so the save itself isn't touched.
- In the log's trophies, first (`trophyRows`, with no picture button: `GameHUD` draws none for a slam). Told by a toast as its last fish comes in. It pays nothing.

## Teaching it

The Guide's one-time tips (`Guide.js`): on the flats (worded for the kayak's low seat in her), the first fish seen, the first tails, each kind of spooking (speed, the push, your shadow, a knock, an engine, a cast on their heads), the first refusal, and the slam's first fish.

## Readings

On this machine (8 cores), shared with three other streams' sessions and their headless renders: the load ran 45 to 70 through all of it, where the foundation's readings were taken at 6 to 17.

| Check | The foundation (3f1367b) | Sight-fishing |
|---|---|---|
| `pnpm test` (with `sight.mjs`, `sight-fish.mjs`, `sight-play.mjs`), the bake's check and the lock | passes | passes |
| Programs built before ready (`tools/heap/programs.mjs`, phone upright, low) | 16 | the same 16, by name and number |
| Ready, phone upright, 4 CPUs, four rounds alternating, load 46 to 72 | 26.4, 15.9, 18.8, 21.9 s (median 20.4) | 19.5, 14.8, 18.5, 24.2 s (median 19.0) |

**All the Spaces' complete check** on a clean copy (`cli.ts check`, 4 cores), first: every check passed. 66 draw calls of 150, 225,175 triangles of 300k, 69.1 MB of textures, 99.7 MB of graphics memory, 11 sounds, **131.4 MB of script memory** (18.6 under 150; the foundation read 140.8 and 141.1), 7.1 MB before ready, 78.3 MB in all (the foundation's 78.2). The second, the ready A/B again and the other timing checks are the M17 session's, run for all four streams one after another on a quiet machine. That first check ran before the later fixes below (the views' looks); none of those is drawn in the checks (the flats are far from the checks' camera), and the fish's own program gained only a bonefish's and a tarpon's out-of-water lines (no textures).

**`tools/gpu-limits.mjs`** (it now ends on the flats, where it waits for their fish and marks: on a CPU the fish come last of all). All within what a graphics card allows on every tier:

| Tier | Shaders | Fullest | The flats' marks |
|---|---|---|---|
| High | 164 | the sea, 16 of 16 fragment textures | FlatsUnder built and linked, no textures |
| Mid | 98 | the sea, 14 of 16 | FlatsUnder, no textures |
| Low | 84 | the village wood, 16 of 16 (as at the foundation) | FlatsUnder, no textures |

FlatsSurface wasn't built in the run (no school made a sign on the water at that stop at that moment); it has no textures either, and it's built and drawn in the views (rings, wakes, nervous water).

Ready can't be told apart from the foundation's at this load (each reading's 4 to 5 times the foundation's own 4.50 s, and they swing 10 s round to round). Nothing of this is built before ready on a CPU (the reef's fish, the flats' among them, come after the start), and the programs before ready are the same.

## Not verified

- **The timing checks** (the second complete check, the ready A/B again, one screen's whole play): the M17 session's, on a quiet machine.
- **A permit tailing, drawn**: it isn't where `game/Flats.js` puts permit (0.74 m deep and more); shown in Node only.
- The views are drawn on low only (the CPU's tier); mid's and high's fish and marks are the same programs, their budgets and pools larger.

- A phone's frame rate with the flats' fish, their marks and their programs: none run, by the user's decision. On the CPU, see Readings.
- A cloud's shadow over a school is the CPU's own field, not the drawn shadows' pattern on high.
- Two players: a spooked school and a hooked fish stay in `Flats`' state record for the second wave to send.
- The restaurant order that asks for a slam: not built (M17.md names it; stream 7's slams and orders).
