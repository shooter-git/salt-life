# M16: the fish

## What bites, and how it's fished: the interface with `m16/tackle`

Stream 6 owns what bites, where and on what (`FishTable.js`, `Bites.js`). Stream 7 owns how it's fished (`src/game/rigs/*`, `FishingRod.js`, `CatchMinigame.js`, `Bait.js`'s new baits). They meet in one small object, the hook, and three table fields.

**The hook.** `Game.habitat()` puts it on the spot's habitat, as it does `flood` and `weather`; `pickSpecies` and `biteDelay` read it from there, and it isn't a water type.

```js
h.hook = {
	way: 'float' | 'troll' | 'kite' | 'drop',  // how the bait's fished
	depth: 8,          // m under the surface the bait is at, now (hook depth)
	lure: 'skirt',     // a lure's id, in place of a bait (null: bait: pickSpecies' `bait` argument)
};
```

`h.hook` missing is today's rig: a float, six metres down (`Bites.FLOAT`). Stream 7 sets `game.hook` (a getter or a plain object) and adds one line to `Game.habitat()`: `h.hook = this.hook || null`. Until then everything bites on the float.

**The table** (`FishTable.js`):

| Field | What it says | Missing |
|---|---|---|
| `ways` | `{ float, troll, kite, drop }`: its bite weight fished each way | float 1; drop 1 for a bottom fish of the deep or the ledge (`habitat.deep`, `habitat.ledge`), else 0; troll and kite 0 |
| `at` | `{ day: [ m, m ], night: [ m, m ] }`: the depths under the surface it feeds at. A hook outside them gets nothing from it (`hookWeight`: fading over 30% past each end) | anywhere the hook is: bottom fish, whose water already says a bait reaches them |
| `eats` | bait or lure id -> its bite weight on that, ahead of `Bait.js`' `likes` (`baitWeight`). Names baits and lures that don't exist yet: `ballyhoo`, `squid`, `skirt`, `plug`, `jig` | `Bait.js`' `likes`, and 1 |
| `teeth` | it cuts mono: a rig's chance of a bite-off without the wire leader is stream 7's to set | no |

So stream 7's job on a bite: set the hook, call `pickSpecies( habitat, hour, rng, bait )` and `rollWeight` as `Game.updateBite` does. A trolled skirt off the outriggers is `{ way: 'troll', depth: 2, lure: 'skirt' }`; a kite's live bait `{ way: 'kite', depth: 1 }`; a deep drop `{ way: 'drop', depth: 500 }` as the reel takes it down; the float `{ way: 'float', depth: 6 }`. How soon a bite comes on each way (`biteDelay`, times what covering water's worth) is stream 7's, and how big the bait is (`BAITS[ id ].skew`, `Bites.rollWeight`) is `Bait.js`' as it is today.

Billfish are `protected` and `cr`: `addFish` lets them go, and `Game` pays the release bonus (`FishTable.releaseBonus`). The `landing` track's dehooker and tag kit pays more: `releaseBonus( id, kg, tagged )`, `tagged` true when the kit's aboard (`upgrades.landing >= 2`).
