# M17, step 4: the flats together

What [M17.md](../M17.md) asked in "Together" (under [The life list and the slams](../M17.md#the-life-list-and-the-slams)) and step 4's first part: a guest and her host fishing the same flat see the same fish and the same happenings. Each school is already placed from the clock, the tide and its patch of flat, the same on every game (`game/Flats.js`, as the far water's finds are); only what changes is shared: a school spooked, a fish hooked, and the fish one of you has spotted. Built 2026-11-09 on `m17-flats` 53ffb1c, on branch `claude/m17-flats-together-b0b832`, beside the flats' sounds and the looks, which run in parallel.

## What's shared, and where

`together/FlatsShare.js`, one module made by `Together` (`Together.flats`, updated in `Together.update`, alone too). Nothing in `App.js` changed.

**Each player's own record.** What you've done to the flats' fish is kept in a record of your own (FlatsFishing's `mine`, the same shape as Flats' state: the schools you've spooked, till when and from where; how many you've hooked from each). It's a shared value of the room's that only you write, `'flats.<your id>'`, as the SDK's own scores are kept ("so changes never clash"). Every game runs on all of them together: FlatsFishing's `state`, which `flatsSchools` reads, is your record and everyone else's merged (`Flats.mergeFlats`):
- a school is gone till the latest anyone's spooked it till, and bolts from where that spook was;
- it's one fewer for each fish anyone's hooked from it.

**Why the room's values, one each.** The room's `session.set` has no compare-and-swap: two players setting one value at once, the later stands. The group's save does compare (`portal.save.shared.update`), but stream 7 found it loses writes when more than three cross ([life-list.md](life-list.md)). A value per player can't clash at all, and the room keeps it after its player's gone (All the Spaces' `creation-room.ts`: values are dropped only with the room; 32 KB a value, 256 KB and 256 keys a room). So a late joiner, or someone coming back after a reload, reads the flat as it stands from the room, and their own record is theirs again. Why not the group's save: what's shared lives a minute (a spook's quiet, 0.6 island hours) to a few hours of island time (a school's visit), and alone a player's flats state isn't saved either (a load starts it fresh). A room that's emptied has a new clock from its first player's save anyway.

**Written** 0.3 s after a change, so a hook and the spook of its school go as one; tried again 5 s after a write that fails; not at all in a solo room. Read as each changes (`onAnyChange`) and as you join (`entries`), cleaned (`Flats.cleanFlats`: only the schools' own ids, a number for each time and count, no more than 120 entries) and let go of what's long past. A spook's time is kept to a hundredth of an island hour (a second of play by day) where it's made, as it's sent, so a school's back at the same moment on every game; where from, to a tenth of a metre. A record's about 60 characters a school (`{"s":{"bone:18:0":[227.85,-496.7,-36]},"h":{}}`).

**What's long past let go** (`Flats.forgetFlats`, every 20 s here, and on every record read): a spook once its quiet's over, a hook once its school's visit is. Your own record's rewritten to the room when that changes it, so the room's copy empties too. **Fixed on the way:** `forgetFlats` read every school's id as a high water's, so a barracuda's or a tarpon's (by its island day) and the spawning school's (by its lunation) were let go the first time it ran: a tarpon hooked from a school of one came back within a minute or two (it runs on a 2% chance each half second). Each is now let go when its own visit is over: a high water's school two high waters on (as before), a day's the next day, the spawning school's the next lunation.

## A school spooked

On the game it's spooked on, as stream 1 built it ([sight.md](sight.md#stalking)), and into the spooker's record with the island time and where from (`Flats.spook( state, id, T, x, z )`: where the cast landed, the bobber, where they stood). On everyone else's, the record comes in, the school's in `state` till the same island time, and if it's in sight there it bolts from the same place (`FlatsFishing.theirSpook`: a fish coming to that player's bait goes with them), then it's gone, its group parked once its run's over, until its quiet's over on every game at once. If the spook came with no place (a record from before this), it bolts from the spooker as their pose has them.

The Guide's tip the first time: "Someone else spooked that school. A flat's fish are everyone's…" (`spookTheirs`).

## A fish hooked

A seen fish's take (stream 1's) puts one more hooked from its school in the angler's record, and spooks the rest (as it always did). On everyone else's game it's the same as a spook, and the school is one fewer once it's back, for the rest of its visit. While the fish is fought, the others see it as a guest's fight is seen now: the angler's rod bent toward the line, and the line taut out to the fish (the pose's rod, tension and bobber), from where the school was. Landed, it's the angler's catch, in their log alone.

**A guest's slam is the guest's.** A seen fish's take is always on the angler's own rod, in their own game (`FlatsFishing.watch` watches the rod in your hands, never a rod in a boat's holder), so a guest's bonefish, permit and tarpon go through `FlatsFishing.caught` on the guest's game, into the guest's trophies, aboard anyone's boat, as stream 7's rule has it.

## The fish you've spotted: the call

On a flat, the guide on the platform calls fish to the angler on the bow by the clock. A call carries three things ([Gink & Gasoline, the bow clock](https://www.ginkandgasoline.com/fly-fishing-tips-technique/the-bow-clock/)): a clock time, where to look, with twelve the bow and the clock the boat's, not where you're looking ([Deneki](https://deneki.com/2013/11/getting-on-the-same-page-as-your-guide/), [Saltwater Sportsman](https://www.saltwatersportsman.com/video-how-to-use-clock-system)); a distance in feet, how far to look; and which way the fish is going: left, right, toward or away. A typical call: "Bonefish, 11 o'clock, forty feet".

In the game you're seldom on one skiff, so each hears it from where they are:
- **When:** a school you see (its body, its shadow, its tail or its sign shown to you past half: `seen`), within your seeing range, near the middle of your view (12 degrees) for a second, with someone within 60 m of it to hear. It isn't called again, by anyone, for a minute (`CALL`).
- **What's sent:** the school, its kind, what it's doing, how many, where it is and its way (`'flats'`, about 100 characters).
- **What they hear**, by the clock from their bow if they're aboard, or ahead of them on foot or in the water; in feet to the nearest ten, as guides estimate it; what it's doing, as guides say it (tailing, mudding, laid-up, rolling, milling; "a school of bonefish", "two permit"), and for one going somewhere its way from where they are: "coming at you", "going away", "moving left", "moving right" (`callText`). A toast: "Robin: a school of bonefish, 6 o'clock, 80 ft, coming at you". You hear your own as "You call it: …". Past 60 m of it, the others don't hear it at all: it would be no use to them.
- **Told where to look, you see it better.** Stream 1's eye searches with a threshold a few times the lab's (`Sight.SIGHT.c0`, 0.046: not knowing where to look). In the lab a cued location's contrast threshold is about half to two-thirds of an uncued one's ([a display study](https://mdanderson.elsevierpure.com/en/publications/trend-of-contrast-detection-threshold-with-and-without-localizati): 2 grey levels against 3; [collinear facilitation](https://www.ski.org/publications/collinear-facilitation-largely-uncertainty-reduction), up to a factor of 2, is mostly uncertainty taken away). A call is a sector and a distance, not a point, so the threshold's taken to 0.7 of the search's (`SIGHT.told`), for 25 s after the call, fading over its last 8 (FlatsFishing's `called`, `toldOf`). Since contrast falls only slowly with distance at a low look, that goes a long way:

| A bonefish over white sand, the sun behind, a light air, the glasses | Searching | Told where |
|---|---|---|
| The kayak's seat (0.81 m) | 11.0 m | 18.5 m |
| Wading (1.62 m) | 20.5 m | 33.0 m |
| A bow (2.5 m) | 29.0 m | 44.3 m |
| The lobster boat's roof (3.8 m) | 38.5 m | 56.3 m |

The Guide's tip, the first call you hear: how the clock goes (`flatsCalled`).

## For the merge

- `game/Flats.js`: `newFlatsState` gains `at`; `spook` takes ( x, z ) and keeps the later time; `forgetFlats` by each school's own visit; `flatsId`, `mergeFlats`, `flatsWire`, `cleanFlats`, `FLATS_WIRE`. Nothing that places a school changed.
- `game/FlatsFishing.js`: the three lines where a spook or a hook is kept now call `_spook( id, x, z )` / `_hook( id )` (in `spooked`, `_take` and `_endFollow`); the constructor's `mine`, `onMine`, `called`; `_look` sets `told` 0, and the update's look sets it from `toldOf` (two lines where `seenOnFlats` was called); the new methods `_spook`, `_hook`, `theirSpook` and `toldOf` before `caught`. **The sounds session's bolt sound** goes in `theirSpook` too (it has the same `fishSplash` line as `spooked`), so a school bolting for someone else's spook is heard as one bolting for yours.
- `game/Sight.js`: `SIGHT.told`, and `seenOnFlats` reads `q.told` (the threshold's clutter factor for the body and shadow, `detect`'s for the tail and sign).
- `game/Guide.js`: `SPOOK_TIP.theirs`, the tips `spookTheirs` and `flatsCalled`, `E.called`.
- `together/Together.js`: the import, `this.flats = new FlatsShare( this )` at the end of the constructor, `this.flats.update( dt )` after `_keepBoats`, a header line.
- No shader, material, texture or program; nothing drawn that wasn't (a toast); nothing before ready. Nothing in the save.

## Checked

On this machine (8 cores), shared with the sounds' and the looks' sessions and their renders: the load ran 14 to 33 through this work.

**`test/flats-together.mjs`** (in `pnpm test`): two real games' sight-fishing in plain Node (`FlatsFishing` on `FishSchools` and the island's ground, the low tier), each with its `FlatsShare`, joined by a stand-in room (its values kept for whoever comes and each change sent to everyone, its messages to the others). 41 checks pass:

| Part | What it found |
|---|---|
| The record | merged: gone till the latest spook, from where that one was; one fewer for each fish anyone hooked. Sent and read back the same, a school's spook and hook 60 characters (`{"s":{"bone:80:1":[1000.6,-600,-120.1]},"h":{"bone:80:1":1}}`); what's malformed dropped; no more than 120 entries |
| Let go | at island hour 1000.5 a tarpon and a barracuda hooked that day kept, the last two high waters' kept, older let go; a spook let go with its quiet, with where it was from |
| A call's words | "a school of bonefish, 12 o'clock, 40 ft, coming at you"; "tailing bonefish, 9 o'clock, 40 ft"; "two permit, 2 o'clock, 40 ft, moving left"; "laid-up tarpon, 6 o'clock, 50 ft"; "bonefish, 12 o'clock, 70 ft, going away" |
| A spook | two schools of bonefish on the flat (day 10, 11:15); Robin's cast on the first's heads: it bolts on his game, in his record till island hour 227.85, not written for 0.3 s; on Sam's game it bolts from where Robin's bait landed and is gone till the same 227.85, the Guide's tip his, nothing in his own record; five seconds on (its run over) gone from both, and back on both at the end of its quiet, 60 s of play later |
| A hook | one of the second school comes to Sam's bait and eats it: a 1.13 kg bonefish on, the rest bolting, in his record. On Robin's game the school bolts and is one fewer (10 to 9), none of it his; back from its fright, 9 of 10 |
| A late joiner | Ann, joining, has Robin's spook and Sam's hook from the room, none of them hers, and the same fish as Robin and Sam at three island times; Sam, reloading, has his own record back from the room |
| A guest's slam | Sam's bonefish (hooked from the flat they share), his permit and his tarpon: the grand slam on his game, nothing on Robin's |
| A call | Robin sees a school 6 m off, the sun behind him; Sam's 26 m off on its far side, looking away. Looked at for 0.4 s, not called; for a second, called: Sam hears "Robin: a school of bonefish, 6 o'clock, 80 ft, coming at you" (he's 84 ft from it, and it's behind him), Robin "You call it: a school of bonefish, 12 o'clock, 20 ft, going away". Sam's told where to look (and the Guide's tip): at the edge of his seeing, 10 m off over its water, its body 0.24 searched for, 0.91 told, as his game draws it. Sam doesn't call it back; with nobody within 60 m, it isn't called |
| Long past | two days on, nothing in anyone's record, the room's copies written empty; someone joining with a stale record left in the room lets it go |

The fish in it aren't the same run to run (`FishSchools` places each fish of a school with `Math.random`), so the checks find their places from what each game reckons (the call's check looks for where told matters to Sam), and three runs in a row passed.

**`pnpm test`** passes (exit 0, 3,933 checks, at a load of 19 to 22; the flats' cut 700 ms on the 1 m bake, inside its 1,200). After it, a spook's time was rounded where it's made; `test/flats-together.mjs`, `test/flats.mjs`, `test/sight-play.mjs` and `test/sight.mjs` pass again on that.

## Not verified

- **Two devices through All the Spaces' room.** `tools/two-players` stands in: two real games in one browser, the room a `BroadcastChannel`. The real room's values were read in its source (kept with the room, not with the player), not run.
- **The timing checks** (the ready A/B, one screen's whole play on one core, the two complete checks that judge the release): the M17 session's, on a quiet machine. Nothing here is in the loading frame.
- The call's numbers (12 degrees, a second, 60 m, a minute, 25 s) are my judgement of a guide's habits, not measured; the told threshold's 0.7 is set between the lab's cued thresholds and none, as above.
- A long-lived room collects one `'flats.<id>'` key for every player who's ever spooked a fish in it (as `'rest.<id>'` does for every rest asked for): 256 keys is the room's limit.
