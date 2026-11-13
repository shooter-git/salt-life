# M19, stream FLY: fly rods, flies and fly casting on the flats

Stream FLY of [M19.md](../M19.md), built 2026-11-13 on `m19-fly` from `m19` (9a1a2b3). The user's decision: a fly rod for the flats with full fly casting. False casts lengthen the line and each can spook a fish; letting go shoots it; the fly is stripped back and the fish strip-set. There are 8, 10 and 12-weight rods for bonefish, permit and tarpon, and flies to buy. This reverses M17's "No fly rod". The stream also brings in the flats licence. Sources: [sources-fly.md](sources-fly.md).

## The rods and the flies

- **Three 9 ft rods** (`Gear.js`' `flyRod`; each one's figures in `FLY_RODS`, kept apart from the line's and the reel's). Each rod comes with its reel and line:

  | Rod | Price | Tippet | Reel's most drag | Line and backing | Line back a second |
  |---|---|---|---|---|---|
  | 8-weight | $500 | 12 lb | 4.0 kg | 210 m | 0.7 m |
  | 10-weight | $750 | 16 lb | 6.8 kg | 240 m | 0.7 m |
  | 12-weight | $1,000 | 20 lb, IGFA's most | 9.0 kg | 300 m | 0.8 m |

  - The prices are an outfit's at the shops' middle.
  - Each rod carries 14 m of line in the air (a weight-forward head and a little running line) and shoots 8 m more: 22 m at best, the Keys' 75 ft. A heavier line casts no further.
- **The flies**, a box of each, yours for good as the lures are (`flies`):

  | Fly | Pattern | Box | Tied for | Sink | Landing |
  |---|---|---|---|---|---|
  | Shrimp fly | Gotcha or Crazy Charlie, on bead-chain eyes | $30 | the 8-weight | 0.2 m/s, to the bottom of a 0.5 m flat in 2.5 s | the softest of anything, splash 0.4 |
  | Crab fly | Merkin, on lead eyes | $60 | the 10-weight | 0.35 m/s | as loud as a live bait, splash 1.0 |
  | Tarpon fly | Toad, on mono eyes | $50 | the 12-weight | 0.07 m/s | soft, 0.4; tied on a 60 lb bite tippet |

  The shrimp fly's sink is derived from the sources; the rest is judgement from the tiers' words.
- **Each fly is cast on the rod it's tied for**, or your heaviest if you don't have that one (`Gear.flyRodFor`).
- **The fly rig** (C) is there wherever you are: wading, in a kayak, aboard, riding along. It takes flies and nothing else.
- **The rod** (`rigs/FlyRod.js`):
  - A rubber fighting butt, an anodised reel seat and a full-wells cork grip.
  - A slate-blue blank with two ceramic stripping guides, eleven snake guides and a tip-top, the fly line through them all.
  - A large-arbour disc reel under the seat, with its handle on the left.
  - It's drawn by the spinning rod's own material, so it has no program of its own. It's built at 9 ft and drawn 7 ft along the blank, and the hand's matrix stretches it back (`FLY_K`), so the rod's bend runs its whole length. It's held by its cork. Nothing on the reel turns.
  - Other players see it in your hands too.

## Fly casting (`game/FlyCast.js`)

- **Hold the cast button to false cast.** The rod goes back and forward on the line's own rhythm. Each stroke is the rod's 0.3 s stroke plus the time the loop takes to unroll at 20 m/s: a false cast takes 2.4 s at 9 m of line and 3 s at 12 m, as the sources derive.
  - You start with 5 m out (the leader and a little line).
  - Each forward stroke carries 2 m more, up to the rod's 14 m.
  - So two false casts and a good shoot reach 17 m (a fair caster's 56 ft), and five reach 22 m.
- **Let go as the rod stops on the forward stroke.** The window is the first 60% of the loop's unrolling after the stop. Within it you shoot 60 to 100% of the 8 m, best 0.1 s after the stop.
  - **Too soon, before the stop:** a tailing loop. You get a third of the shoot, and it lands 1.8 times as loud.
  - **Too late, once the loop has unrolled:** a third of the shoot.
  - **On the back cast:** the line collapses in a heap, at under half its length, 2.5 times as loud.
  - You're told which one it was.
  - The big button's word follows the rhythm: "False cast", then "Let go · 17 m" through the window.
- **The wind along the cast:** into a 7 m/s wind it falls a quarter short, and with it it goes a sixth further. A wind across it sets it aside: 1.5 m at 20 m. A poor release lands up to 1.5 m off line.
- **The other button**, false casting, stops. With the fly on the water, it **picks the line up** into a back cast. Holding the cast button through it carries on false casting; otherwise it's laid straight back down at the same length, the best release of its forward stroke (a pick-up and lay-down).
- **The line in the air** is drawn as an unrolling loop (`rigs/FlyLine.js`). The rod's leg lies still from the tip after the stop while the fly's leg runs on, so the fly goes from the line's length behind you to as far in front, and the loop travels between them. Shot, it's laid down from its far end. It's six curves of the fishing line's own material, drawn wider and in a pale sand fly line's colour. That means no new program, and nothing is made before the start (`test/fly-line.mjs` holds the shader's code and cache key the same). On the water, the line from the tip is the rod's own line, as wide and the same colour.

## The fly on the water

- **It sinks** at its own pace to the bottom.
- **A tap strips it:** 0.6 m toward you in 0.35 s, lifted 10 cm off the bottom. Holding strips on, one every 0.45 s. Stripped all the way in, it goes on the hook keeper.
- **A fish that eats it:** the line comes tight (a fly's never nibbled), and you strip-set with the cast button: one long pull, the rod low.
  - **A tarpon** needs two strip-sets in its 1.9 s, for its bony mouth. Set once and the window lapses: "The hook didn't stick".
  - **Lifting the rod instead** (the other button: a trout set) pulls the fly out of its mouth seven times in ten, and jerks it 1.5 m away. The sources give no rate, so that's judgement.
- **Blind bites** (off the flats, or a fish you never saw): a fly draws them as it's worked. One left still for more than 4 s draws them at 15% of the pace (`FlyCast.working`).
- **Seen fish** come to it as to any bait (`FlatsFishing.watch`, `Bites.seenTake`, FishTable's `SIGHT.eats`: each fly a little under the bait it imitates; no source measures it, so judgement). How it's worked counts, as the guides describe each kind (`Bites.WORK`, `workedTake`; the chances are judgement):
  - **A bonefish** wants it moving. Left still for more than 2.5 s as it comes, it loses interest seven times in ten; stripped two or more times, a refusal turns to an eat three times in ten.
  - **A permit** wants one long strip and then the fly left dead. Moved once it's turned to the fly and is within 1.5 m, it's off, as from a crab that ran. Left still after a strip, a refusal turns a quarter of the time.
  - **A tarpon or a snook** wants steady strips. Stopped for more than 2 s, it loses interest.
  - **A barracuda** wants it stripped fast. Held strips turn a refusal; single taps lose half its eats.

## What spooks them (`Sight.js`, `FlatsFishing.js`)

- **A false cast's line over them** (`falseCastScare`, `FlatsFishing.falseCast`). As each stroke's line lies out (forward over the water, or behind you), each school near it may spook (`'falsecast'`).
  - The chance is certain right under the line and nothing at 4.6 m (Deneki's 15 ft) times the fish's wariness. It's squared in between, since each false cast is two strokes: a bonefish 2.3 m off the line is spooked a quarter of the time a stroke.
  - On the line's shadow side, away from the sun, the zone is half as wide again.
  - Picking the line up off the water counts as a stroke over them.
  - The guides: false cast to the side of them or short of them, and shoot the rest. The 15 ft is theirs; the curve and the sun's share are judgement.
  - A shark doesn't care.
- **A fly landing:** each fly's own splash, a bad cast's louder (`castScare`'s `hard`). The fly line laid within 0.75 m of a fish's back spooks it, where mono's 0.5 m did (`lineM`; judgement in the sources' 0.5 to 1 m).
- The Guide's tips: the fly rod on its first false cast; why a false cast spooked them.

## The flats licence

The flats need a licence, free to her as a resident (Gear's `flatsLicence`, $0 at Marta's). Without it nothing on the flats takes a bait or a fly, though what lands on them still spooks them (`FlatsFishing.licensed`, `Game.onBobberLanded`). You're told once a minute: "Nothing takes a bait on the flats without a flats licence · free at Marta's".

## The fight on a fly (`Rigs.fightTerms`' fly branch, `CatchMinigame`'s `bow`)

- **On the rod's tackle:** the tippet, the reel's drag (set at most half the tippet, so the reel's most never binds) and its backing.
- **The hold** is 5.7 kg, the rod low within 45 degrees of the fish (Andy Mill's 12.5 lb).
- **A tarpon's mouth** wears through a class tippet as a bill wears a leader. The tarpon fly's bite tippet stops it.
- **A barracuda's teeth** go through any tippet, unless you've tied on wire (X).
- **Bow to the king:** a fish that jumps on a fly, falling back on a tight line, parts the tippet six times in ten (judgement). Let go of the reel button as it jumps and it holds. Reeled through every jump, a 30 kg tarpon on the 12-weight is lost half the time; bowed to, never. The jump's message says so. Off a fly, nothing changes (`bow` 0).
- **The catch** goes into the log as taken on the fly (`addFish`'s `rig`), for Pearl's challenges and the line-class records to read.

**The sweep** (`tools/fight-sweep.mjs`' `F8`, `F10` and `F12`: each rod with the fly tied for it, played with care and bowing to the jumps), 20 fights a cell:

| | Bonefish to 4.9 kg | Permit to 17.7 kg | Tarpon 10 kg | Tarpon 26 kg | Tarpon 44 kg | Barracuda |
|---|---|---|---|---|---|---|
| F8 (shrimp fly) | 100%, 22 to 28 s | 100%, to 70 s | 80% | 5% | 0% | 15 to 45% |
| F10 (crab fly) | 100% | 100%, to 53 s | 90% | 45% | 0% | 15 to 45% |
| F12 (tarpon fly) | 100% | 100% | 100% | 100%, 64 s | 100%, 151 s | 20 to 45% |

The tarpon on the lighter rods are lost to a worn tippet, and the barracuda to their teeth. The game's fights are short against real ones (a bonefish is 5 to 10 minutes), as every fight in the game is.

## Playing together

- **Your false casts are sent in your pose** (`Together`'s ROD 7):
  - `fp`: how far through which stroke (−1 to 1, a back stroke negative);
  - `fl`: the line in the air;
  - `fw`: the fly rod's weight while it's in your hands.
- **Others' copies** draw your rod going back and forth, the loop unrolling from its tip, and the fly rod itself. Shot, it's ROD 3, as a cast is. A game from before M19 draws a held rod and no loop for 7.
- **What your false casts spook** is in your record as any spook is (`'flats.<id>'`).

## Tests

- `test/fly-line.mjs` (new):
  - the loop's shape (the fly from behind to in front, the line drawn as long as the line to within 0.5%, the loop no bigger than the line left, laid down from its far end);
  - the fishing line's own program;
  - the fly rod 9 ft from butt to tip in your hands; a new player's copy made with the spinning rod, whichever you hold.
- `test/fly.mjs` (new):
  - the rhythm, the release and the wind;
  - a whole cast through the real FishingRod: two false casts to 9 m in 3.6 s, shot 17 m where you looked, sinking, a strip of 0.6 m, held strips, stripped in;
  - a tailing loop, a heap, a pick-up laid back down, a panel stopping it;
  - into the wind;
  - the false cast's scare and FlatsFishing's own;
  - the worked fly;
  - the licence;
  - the rod each fly picks, the rig anywhere;
  - the tackle, bowing, the sweep's F combos.
- `pnpm test` passes.

## Seen

- **On each tier** (`tools/fly/look.mjs`, wading a flat on day 4 at 10:30): the rod in your hands (its cork, reel and guides), the back cast's loop behind you, the forward's unrolling ahead, the shot and the line laid on the water 16.6 m out, from your eye and from beside you. Low, mid and high are the same but for the world around them, with no errors. The line was first drawn near black against the sky, lit only from the side away from the sun, so it has its own glow by day (`FLY_LINE_GLOW`, the material's emissive colour: no new program). On the water it first sagged under the surface, as a float's line does, so a fly's line is drawn down from the tip and along the water.
- **With two players** (`tools/two-players/fly.mjs`, two real games on one machine, the button held and let go as a player does):
  - Sam false casts, and on Robin's game his copy false casts: the pose's 7, the 8-weight in his hands, the loop drawn no longer than his line, in the one fishing-line program. Let go, Sam's fly lands 22.8 m out; Robin sees his line out to it, the loop gone.
  - Facing a school 12 m off, three false casts (11 m in the air) spook it on Sam's game (`'falsecast'`), and on Robin's it bolts 0.4 s later, gone till the same hour, none of it his.
  - It found one bug, now fixed. The first press with the fly rig just picked is read while the line isn't yet a fly's, so the new false cast took the button as unread and stopped at once (`FlyCast.start` now counts it read; `test/fly.mjs` holds it).

## What's left

- **Judgement throughout**, flagged above:
  - the trout set's miss;
  - the fish's takes of a fly and how it's worked;
  - the false cast's curve and the sun's share;
  - the bow's chance;
  - the wind's effect;
  - the crab and tarpon flies' sinks and splashes.
- **Not modelled:** a fly line's stretch and the line in the stripping basket. Casting off the other shoulder in a crosswind isn't there either: the wind's set-aside is all.
- **Sounds:** the casts are the game's own whoosh and plop. No new sound.
