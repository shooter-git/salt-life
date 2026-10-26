# Salt Life

An island fishing game for [All the Spaces](https://github.com/shooter-git/all-the-spaces). Cast from
the pier, the beach or your own boat, or dive with a speargun; fight the fish, sell your catch to Joe
at the fish stand and spend it on better gear at Marta's chandlery. Other people in the space can
drop in: you'll see them walking, swimming and out on their boats, and the group keeps a board of
record catches.

Salt Life is based on [Tidewater](https://github.com/dgreenheck/tidewater) by Dan Greenheck (MIT).
It is not Tidewater and not made by its author. Tidewater runs on its own WebGPU engine and needs a
strong graphics card. Salt Life rebuilds it on [three.js](https://threejs.org) with WebGL 2, so that
it runs on phones too, inside All the Spaces' sealed creation frame.

## Status

This repository started as a fork of Tidewater. Every system Salt Life keeps is now ported, and
Tidewater's WebGPU engine is gone (its history is still in the repository).

You can walk, swim and take the boat around the island. You can fish from the pier, the beach or the
boat, or dive and spear a fish, sell your catch to Joe and buy better gear from Marta. It plays with a
mouse and keyboard, a gamepad or a touch screen.

Done, M0 to M12:
- the sea and its shore, spray, gusts and slicks, and the haze;
- the whole world: the village, the pier, the reef and its fish, the birds and crabs, the beach's
  debris, the whale and the lights at night;
- the fishing game;
- spearfishing:
  - a speargun to dive with, three of them at Marta's; it fires only under water;
  - the law: protected fish are let go, and nobody spears the reef's aquarium fish or one too small;
  - the spearfisher's fish: hogfish, black groupers, mutton snappers, lionfish, and red snappers, mahi
    and tuna offshore;
  - fish that notice you: stalk them slowly;
  - a held breath;
- the weather (M8):
  - each day brings its own, the same for everyone on the island: calm, fair, breezy, cloudy,
    blustery, now and then a gale;
  - the wind bends the palms, turns about the trades' direction and drives the sea: whitecaps, a
    bigger swell, bigger surf (it builds a few hours ahead of a blow, long and clean, then short and
    steep in it), and you hear it;
  - cloud comes over, the light dims, the haze closes in and the horizon greys;
  - the wind pushes your boat: left without her anchor she drifts, anchored she swings to it, and
    Marta tows her home if she gets away from you;
  - the clock's menu says what it is and what's coming; on your own you can choose it;
- rain and thunderstorms (M9):
  - showers pass over now and then, more under a grey sky and in a blow; the heaviest, in unsettled
    air, are thunderstorms; their cloud comes over before the rain, and a front's bank darkens the
    horizon up the trades before it arrives;
  - rain falls around you, slanting in the wind, rings the water where it lands and leaves the sand,
    the village and the boat dark and shining, drying slowly after; none falls under the wheelhouse
    roof;
  - lightning lights the clouds from inside and the island with them, a third of the strikes come down
    as bolts, and everyone sees the same strike at the same moment; its thunder comes its distance
    later, a crack near by, a rumble far off;
  - you hear the rain: a shower's patter, a downpour's roar, and aboard, rain drumming on the boat;
  - rain's deck hangs lower and darker, the cirrus goes, and under it the caustics fade from the
    seabed and the sea goes dim below;
  - the boat and the wind's sound feel the same gusts you see coming over the sea, stronger in
    squalls;
  - the fish feel it: they feed hard ahead of a blow, the predators hunt under a grey sky as at dusk,
    a downpour puts them down, a big surf stirs up the shallows; mahi and tuna come up on the wind
    lines, tarpon roll in the rain, bonefish leave the flats in a blow;
  - Joe and Marta shut for a gale or a thunderstorm (the night box and the diesel stay out), and
    Joe chalks the forecast on a slate beside his wanted list;
- what the weather costs (M10), mildly:
  - your boat's hull wears in a big sea, on the piles and aground: she gets slower and she leaks, and
    Marta repairs her at her dock (as far as your money goes);
  - the rain, the leak and green water fill the bilge: bail with the bucket (hold E on deck) or buy
    Marta's pump; the water reaching the engine stalls her, and so can a hard slam in a worn boat;
    she cranks every time you take the helm, and a stalled one takes a try or two;
  - you hear it: the starter, the hull knocking and creaking, the keel scraping, the bucket, the
    pump and the water sloshing below;
  - in a blow the wind carries your cast and drifts your float, carries the cast net off, and gusts
    snap a line you reel on through them;
  - after a blow the water's murky for a day: you see less under water, and Joe's slate says so;
  - the breakers follow the surf, the bait inside them with them, fewer of them in a big surf;
  - rain splashes on the sand and the deck, the sea reflects the lightning, a downpour flattens the
    sea's ripples, and in a blow leaves and sand stream by and the village's shutters bang;
- the rain where you stand (M11):
  - the rain stops on the pier, the boardwalks, the roofs and the stalls, and splashes on them; under
    them, and under the wheelhouse roof, nothing gets wet;
  - drips fall off the eaves, the wheelhouse roof and the palms, in the rain and for a minute or two
    after, and you hear the ones near you land on tin, on wood and on the boat;
  - you hear the rain on what it falls on around you: the sea, wood, the ground; right by you, a
    downpour hissing on the sea and drops slapping on the wood under you; under a roof it's muffled;
  - showers come down the trades with the weather: you see them in the distance as curtains of rain,
    each the rain that's coming or the rain that went;
  - the sea reflects the sky as a mirror does, more toward the horizon;
  - in a big surf the water inside the breakers is milkier, further out; in the murk after a blow
    the fish notice you later;
  - whoever rides along hears the owner's bilge, pump and creaks;
  - the boat's dash shows what it reads: the engine's revs, her speed, the fuel, the engine's
    temperature and the battery; a depth sounder (and the fish, with Marta's fish finder) and a
    chart plotter;
- storms from other directions (M12):
  - each blow comes its own way: most still down the trades, some from the south or the west, and
    now and then a front that brings a line of showers, swings the wind from the south through the
    west to the north as it passes, and clears behind it;
  - the wind, the rain's slant, a front's bank on the horizon, the showers you see coming and the
    lightning all come from up the blow's track: from the pier you see a southerly's showers coming;
  - thunderstorms out to sea flash on the horizon, lighting their own towering cloud, before they get
    here and after they've gone; their thunder rumbles in from up to 20 km or so, and farther off
    they're silent;
  - a westerly's swell comes in from the west, wraps round the bay's western arm and piles onto its
    eastern shore, crossing the island's own swell from the south as one dies down and the other
    builds; the slate and the clock's menu say where the swell's from;
  - rip currents run out to sea through the gaps in the bar, milky past the breakers, fed by
    currents along the beach: a few tenths of a metre a second on a fair day, near a metre a second
    in a big surf's sets; swim along the beach to get out of one;
  - a big breaker tumbles a swimmer it breaks on: rolled under and carried in, short of breath; dive
    under it and it passes over;
  - the rain splashes on the rocks about you, and on the boat's wheelhouse roof, foredeck and gear;
  - riding along in someone's boat, her dash shows her skipper's readings;
- playing together:
  - you see the others on the island, walking, swimming, fishing and out in their boats;
  - you pick your islander: two men and two women;
  - you can ride along in someone else's boat, and hear it;
  - at night their boats show their lamps and searchlights, and you hear their horns;
  - you see their catches, and hear about the records and the big ones;
  - the group keeps a board of the island's records at the fish stand;
  - everyone shares one time of day.

The island's day:
- the day runs on its own, about half an hour from dawn to dawn, and quickly through the dark;
- on your own you can hold the clock or rest until dawn, noon, dusk or night (T, or tap the time);
  with others, time runs for everyone and you rest once you all choose the same;
- Joe and Marta keep hours; when they've gone home, Joe's night box takes your catch and Marta's
  honesty box has diesel;
- each morning Joe chalks the fish he's after on his counter and pays over the odds for them, and
  Marta buys one kind of bait fish;
- each week a restaurant on the mainland orders one kind of fish through Joe, and the group fills it
  together and shares the bonus;
- a "Closed" board is out at each stall while its trader's away, and after dark the tarpon gather
  under the pier lights.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the game is put together.

| Milestone | What it brings |
|---|---|
| M0 | The creation skeleton: All the Spaces' SDK, the checks, CI |
| M1 | A playable island: terrain, sky and time of day, the sea, walking, swimming, the boat, touch controls, saves |
| M2 | The sea and the shore: water, breaking waves and foam, underwater, caustics, wake and spray |
| M3 | The world: village, pier, stalls, rocks, plants, reef and fish, wildlife, the whale, night lights |
| M4 | The fishing game: the rod and the fight, the cooler and log, Joe and Marta, upgrades, the guide, sound |
| M5 | Device tiers and budgets: richer on laptops, smooth on phones; the checks play the fishing too |
| M6 | Drop-in multiplayer: others in the space, catch announcements, a shared records board |
| M7 | Spearfishing: the speargun, the law, the spearfisher's fish, fish that notice you, a held breath |
| M8 | Weather: the day's wind, sea, surf, cloud and light; the boat in the wind, and Marta's tow |
| M9 | Rain and thunderstorms: showers, lightning and thunder, wet surfaces, storm skies and fronts, gusts, fishing by the weather |
| M10 | What the weather costs: the hull, the bilge and the engine, fishing in a blow, murky water, splashes, the lightning on the sea, shutters and debris in a blow, the weather in the checks |
| M11 | The rain where you stand: the rain on the pier and the roofs and dry under them, drips, the rain heard on what it falls on, showers' curtains in the distance, the sea mirroring the sky, the milkier surf, the fish in the murk, the hull heard riding along, the boat's instruments |
| M12 | Storms from other directions: each blow its own track, fronts, thunderstorms on the horizon, the swell from the west crossing the island's own, rip currents and being tumbled, splashes on the rocks and the boat, the skipper's dash for riders |
| M13 | For consideration ([docs/M13.md](docs/M13.md)): the hurricane, cumulonimbus, the open sea breaking, the clouds aloft turning with a front |

## How it fits All the Spaces

The repository is a creation project, which All the Spaces builds and checks itself:

- `ats.json`: the title, how people join (`shared`: drop in), and the least capable devices it must
  run smoothly on (`low`).
- `assets.lock.json`: every picture, model, sound and font, with its licence. It's written by
  `tools/update-lock.mjs` from `CREDITS.md` and `credits/`; run `pnpm lock` after adding an asset.
- `qa/script.json`: what the checks do while playing it on a phone, a tablet and a laptop.

It draws with `WebGLRenderer` through the SDK's `createStage`, saves through `portal.save` (a
creation's frame has no browser storage), and reads `portal.tier` to choose its detail.

## Running it

The All the Spaces SDK isn't published on npm: it's linked from a checkout of All the Spaces next to
this one.

```sh
git clone https://github.com/shooter-git/all-the-spaces.git
git clone https://github.com/shooter-git/salt-life.git
cd salt-life
pnpm install
pnpm dev        # http://127.0.0.1:5189, standing in for All the Spaces
pnpm test       # game logic and the asset list
```

### Play it on GitHub Pages

Each release is also published on its own at <https://shooter-git.github.io/salt-life/> (GitHub
Pages, by `.github/workflows/pages.yml`; or by hand from the Actions tab). There the SDK stands in
for All the Spaces: you play solo, your progress is saved in that browser, the page shows its own
loading screen, and the detail is chosen from the device as All the Spaces would (`?tier=low|mid|high`
overrides it). Set **Settings → Pages → Source** to **GitHub Actions**, and in **Settings →
Environments → github-pages** add a deployment tag rule `v*` (releases deploy from their tag).

To run All the Spaces' publishing checks, from the All the Spaces checkout (after `pnpm install`
there):

```sh
node packages/qa-browser/src/cli.ts check ../salt-life
```

## Credits and license

The code is under the MIT license (see [LICENSE](LICENSE)), as Tidewater's is. The third-party
assets are CC0 recordings from Freesound, CC0 scans and textures from Poly Haven, MIT characters
from Microsoft Rocketbox, and OFL and Apache fonts. Each is listed in [CREDITS.md](CREDITS.md) and in
`assets.lock.json`.
