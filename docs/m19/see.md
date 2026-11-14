# M19, stream SEE: the polarized glasses checked, copper lenses and flats booties

Stream SEE of [M19.md](../M19.md), built 2026-11-13 on `m19-see` from `m19` (8416069). The glasses were audited against everything the pages promised (M19.md, "The glasses": B1 to B10 and two bugs beside them); this page has what each came to, what was added (the copper lenses and the booties), the figures, and what was seen.

## The audit, fixed

| | Found | Done |
|---|---|---|
| B1 | Everything reckoned from the camera. At a helm the camera's 13 m back by default (up to 40) in third person, and a kayak's chase camera about 2.5 m up, so a kayaker in third person spotted fish as from 2.5 m | `Player.eyeAt`: at a helm or a kayak's seat the helm's eye (`atHelm.eye`, the model's `helmEye`), carried with the boat, whatever the camera does; walking, wading, swimming and about a deck, the camera (it's your eye there). The flats (`FlatsFishing.eye`: `_look`, `_observer`, the schools about you, a bolt's way) and the glasses' fish (`Glasses._fish`) reckon from it. The sea's reflection is still cut by where the camera looks: that's what's on screen |
| B2 | `Sight.fresnel` took the angle's size, so looking 37 degrees up read as Brewster's and the glare was cut; and one angle, the camera's pitch, stood for the whole view | `fresnel` clamps: looking up is grazing. The glasses cut the glare by the sea in view (`seaGlareLeft`): the angle halfway through the sea's part of the view, the horizon down to its foot; none at all with no sea in view |
| B3 | The tower's eye is 8.62 m (`SportfisherModel`), not the 12 to 14 m a comment, `docs/m16/tackle.md` and `test/tackle.mjs` had | Made true. At the real heights the angle decides the reach (the tower plainly to 40 m, half to 57, some past 100); `SEE`'s far fade, 150 to 260 m, only caps an eye higher than any the game has, and stays |
| B4 | `tools/flats/sight.mjs` and `tools/gpu-limits.mjs` set `state.stats.polarized`, a getter's throwaway: their "through the glasses" renders were bare and the glasses' program never counted | Both put them on as buying them does (`upgrades.glasses`, `applyGear`). The difference shows: the high cruising bonefish below reads 0.35 bare (`m19`'s tool) and 0.58 through them |
| B5 | The flats' fish drawn within 32, 40 and 50 m, nearer than the roof's documented 35 m and a called fish's 44 and 56 m | 36, 46 and 58 m (`FLATS_POOL`). It costs no triangles: the pool and the budget are spent nearest first, the fish further off drawn coarser. Low's worst is still 69 fish and 9,460 triangles (`test/sight.mjs`); with the fish placed, 7,660 of its 9,500 (`test/sight-fish.mjs`) |
| B6 | The plain sea drawn until the whole one's made (`WaterSurface.plainMaterial`) was never cut | Cut with the other (a material's figure, no shader changed) |
| B7 | A weedline's stand-in fish slid along it with you and jumped every twelfth of its length | A school at fixed stations every 45 m along it (`STATION`), the near ones shown |
| B8 | Docs said "about half along the surface" and "dark shapes" | `docs/m16/tackle.md` and ARCHITECTURE say what the code does: Fresnel's since M17, pale blue-green |
| B9 | Offshore, nothing read the light or the weather | `Sight.seenOffshore`: by day, the sun up (the flats' own `day`), less under a grey sky, none in heavy rain (the flats' rain), whitecaps past a moderate breeze, a blow's murk (`G.murk`) |
| B10 | The offshore fish were stand-ins about the finds, not tied to the fish | Shown where `world/Fish.js`' far groups are (placed about you on the debris, the weed, the bait and the open water's cells: `setFinds`), as many as each has (to 9) and as long as its kind, the nearest first; none for a group near enough to be drawn as itself (`active`); stand-ins about the finds only until the fish have come (with the reef: minutes after the start on a CPU's WebGL) |
| | A spotter in the tower could never call a weedline: `Crew.spotted` read `f.x`, which a weedline hasn't got, and the test used a weed shaped so it passed | `Finds.nearestOnWeed`: the part of it nearest; the test's weedline is one as `Finds.js` makes them (two ends) |
| | Riding someone else's boat, the flats read your own moored boat's engine and paddle | The boat you're aboard (`p.boat`), her engine from her owner's pose (`cur.rpm`); `Vessel.noise` read first if she says how quiet she is (stream BOATS' trolling motor and pole) |

## What's bought

- **Copper lenses** (the glasses' second level, $250): a fish's contrast against the flats' sand and grass times `SIGHT.lens.copper`, 1.2, through `seenOnFlats` (`q.lens`). No measurement found: flats guides wear copper and amber for the contrast over sand, makers claim it, and the one lab study's nearest finding is a yellow lens raising contrast against blue (Wolffsohn 2000, abstract only: [sources-fly.md](sources-fly.md)). **Judgement.** Near the edge of seeing it counts most: a bonefish 18 m off over sand, wading, reads 0.58 through copper against 0.25 through grey.
- **Flats booties** ($90): wading, each step a chance of being heard (`Sight.wadeNoise`, the `'wade'` spook and its Guide card): more the faster you go (from a slow 0.4 m/s to 1.4), more off the soft flat (rock and rubble, three times), booties 0.4 of it; heard to 14 m (`WADE`). Guides say wade slow and quiet and wear booties on sand; nothing measures a step. **Judgement.**
- Both prices as such things sell for (glass copper lenses about $250; flats booties $60 to $100), as the rest of your own gear's are.

## Readings

**How far a bonefish shows**, cruising over white sand in half a metre of water, the sun high behind you, a 4 m/s breeze (`seenOnFlats`, the distance it's half seen at):

| Eye | | Bare | Grey | Copper |
|---|---|---|---|---|
| A kayak's seat | 0.81 m | 6 m | 7 m | 10 m |
| Wading | 1.62 m | 12 | 14 | 19 |
| A console's bow | 2.5 | 17.5 | 20 | 27 |
| The lobster boat's roof | 4.03 | 25 | 28 | 37 |

Before M19, a kayaker in third person was reckoned from the chase camera's 2.5 m: 20 m through grey, where her own eye sees 7.

**Offshore, by eye** (`fishSeen`): a deck's 3 m plainly to about 15 m and nothing past 40; the bridge's 4.7 m to about 25 m; the tower's 8.62 m plainly to 40 m, half to 57 m, some past 100.

**Renders** (`tools/flats/sight.mjs`, through the glasses, low, mid and high, the views M18 said were never looked at on mid and high; `qa-output/flats/sight/`, not kept in the repository):
- **Tails** (a tailing school from the kayak's seat, 7 m): on mid, a few blue-grey forked tails standing out of the shallows near the beach's edge, rings about them: the same seen figures on every tier (body 0.37, tail 1, sign 0.89).
- **Muds**: the milky silt plain on all three (mud 1).
- **Cruise** (12 m, wading): 0.59 on low and mid. High's first run read 0: it came 414 s in, and the flats' cloud-shadow field had a cloud over the school then (the field doesn't match high's drawn clouds: on M18's list). Run alone at 303 s it read 0.58 on this branch and 0.35 on `m19`'s, whose tool never put the glasses on (B4).
- **A laid-up tarpon**: plain on all three (body 1).

## Tests

- `test/glasses.mjs` (new): worn and not; the glare cut by the sea in view (3% left looking 37 degrees down, all of it looking up, about half looking level), the plain sea's too; the far fish where their groups are, the nearest first, none drawn as themselves or not yet placed; none from a kayak's seat 25 m off with the camera behind and above; none by night or in heavy rain; a weedline's stand-ins at the same places wherever you are; the reach by height; copper over grey; booties and the `'wade'` spook.
- `test/tackle.mjs` (the tower's 8.62 m), `test/together-boats.mjs` (a weedline called, where it's nearest).
- `pnpm test` passes (below, in M19.md).

## What's left

- High's cloud-shadow field against the drawn clouds (M18's), which the cruising render ran into.
- The lens's gain, the wading figures and the offshore fades are judgement: no measurement of any was found.
- The offshore fish shown are the far groups' places with their fish swirling about them as before, not each fish where it swims: the groups aren't simulated that far off.
