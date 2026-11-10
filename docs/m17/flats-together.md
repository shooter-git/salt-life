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
- **When:** a school you see (its body, its shadow, its tail or its sign shown to you past half: `seen`; or a feeding school's mud, as plainly, the milky water guides call, plainest over dark grass where the fish hardly show), within your seeing range, near the middle of your view (12 degrees) for a second, with someone within 60 m of it to hear. It isn't called again, by anyone, for a minute (`CALL`).
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

**Two real games** (`tools/two-players/flats.mjs`, low tier, on the dev server; a9f0c04): Robin and Sam wading the west's flats with their glasses on, the clock nearly held. The fourth run passed whole: no failure, no page error, 12.1 minutes at a load of 23 to 30, Robin's game at 1.4 frames a second and Sam's at 1.7 (each game's own updates counted, not animation frames).

| Part | What it found |
|---|---|
| A spook | day 2, 11:30: two schools of bonefish cruising on the flat, `bone:3:1` (9) and `bone:3:3` (8), Robin and Sam in 0.44 m of water by the first, in sight on both games. Robin's cast lands on its heads (the game's own landing, `FlatsFishing.landed`): it bolts on his game, gone till island hour 36.10. On Sam's game 4.8 s later (3.6 and 4.9 s in the runs before) it bolts from where Robin's bait landed and is gone till the same 36.10, the Guide's tip his, none of it in his own record. It stays gone: back in none of Sam's 101 frames since (drawn there and not bolting, or in his game's schools), its group let go on both games |
| A hook | Sam's real cast (R, F held and let go, turned away from the school), in the water; one of `bone:3:3` comes to his bait and eats it (a seen fish's follow, staged to end in a take with the bait on its nose): a 2.81 kg bonefish, F strikes it, he's on. On Robin's game the hook was there by the time Sam's strike was done: the school bolts, one hooked from it, none of it Robin's. Robin sees Sam on: his rod bent (the pose's 5, tension 0.37), his line 14.5 m out to the fish, 1.3 m from where the school was (`flats-robin-sees-sam-on.png`). Sam lands it (the fight's end staged: tired, at his feet): in his log, none in Robin's. Back from its fright on Robin's game the school's 7 of 8 |
| Back | the clock set past both quiets (island hour 36.14): `bone:3:1` back on both games, 9 and 9; `bone:3:3` back on both one fewer, 7 and 7 of 8 |
| A call | `bone:5:0` (6) cruising over white sand at island hour 59.89; Robin 9 m off with the sun behind him sees it plainly (1.00), Sam 26 m off on its far side, looking away. Robin, looking at it a second, calls it once: "You call it: a school of bonefish, 12 o'clock, 30 ft, going away". Sam hears "Robin: a school of bonefish, 6 o'clock, 80 ft, moving left" (it's 85 ft from him, 179 degrees from where he's looking). He's told where to look: by his own game's reckoning its body 0 searched for, 0.31 knowing where, a ghost at 26 m, the light in his face (read in the frame the call came, before his game had drawn again: the script now waits two of his frames). He doesn't call it back. The call part again on its own (`flats.mjs … spot`, 2.1 minutes, Robin 3.3 and Sam 1.9 frames a second): `bone:7:0` at island hour 85.25, "You call it: a school of bonefish, 12 o'clock, 30 ft, going away", Sam hears "Robin: a school of bonefish, 6 o'clock, 80 ft, coming at you" (83 ft off, behind him), its body 0.96 searched for, 1 told, and his game draws it at 1 |
| A late joiner | Ann joins: she has the flat as Robin's game has it, from the room (`{"s":[],"h":{"bone:3:3":1}}`: the spooks over, Sam's hook still on), none of it hers. The room's records: Robin's 15 characters, Sam's 27 |

What the runs before it found (each a harness's fault, fixed in the script, none the game's):
- On a CPU the flats' fish come with the reef, the very last of the late stages; at one or two frames a second and a load of 20 they hadn't come in 25 minutes. The script brings the reef forward in each game, as a device with a graphics card has it at the load (`App.reefGrows` early, the chain's own call later handed the same promise).
- Robin's screenshot takes minutes on the CPU, and Sam's fish, with nobody reeling it, was off before it ended: the script holds Sam's fight while it's taken.
- Robin stood 6 m from a nine-fish school spooked it as he arrived (its fish spread a few metres about its middle), and then rightly called the next school he saw, 70 ft off. He stands 9 to 15 m off now, and the call's checked to be of the school he's looking at.
- By island hour 36 the two schools had gone from cruising to feeding over grass, where nothing of them showed past half to Robin. So a mudding school's mud now counts for a call (guides call muds, and over dark grass it's plainer than the fish), and the call's staged on a school cruising over white sand.

**All the Spaces' complete check** on a clean copy of a9f0c04 (`cli.ts check`, All the Spaces 57b4f25, four cores): every check passed, every screen played, no errors. Script memory 135.7 MB of 150 (by screen 135.7, 130.1, 132.6 and 133.5; `m17-flats`' last two read 142.7 and 142.3); 67 draw calls of 150; 188,333 triangles of 300k; 69.5 MB of textures; 101.0 MB of graphics memory; 14 sounds of 16; 7.1 MB before ready; 78.3 MB in all (as `m17-flats`). Its screens are as they were: the intro, Thunder Bank from the lobster boat, Marta's note of the hurricane. Ready 4.7 s phone upright, 13.0, 17.3 and 13.9 s on the others, and two notes of a pause while drawing (5.2 s on the tablet, 5.9 on the laptop): it began at a load of 6 and the other sessions' renders took it to 35 by its end, so its times read the load (the merge's ready was 4.4 to 4.6 s on a quiet machine). Nothing here is drawn or built before ready.

**`pnpm test`** passes on 7a65360's code before its last two changes (exit 0, 3,933 checks, at a load of 19 to 22; the flats' cut 700 ms on the 1 m bake, inside its 1,200). On a9f0c04, at a load of 32 to 39, the suite stopped on `test/flats.mjs`' timing alone (the 1 m cut 1,225 ms against its 1,200), as it does on the base at that load ([life-list.md](life-list.md)); everything before it passed, `flats-together.mjs` among them; `flats.mjs` passed alone at 21 (430 ms), and the 66 after it and the assets' lock one by one.

## Not verified

- **Two devices through All the Spaces' room.** `tools/two-players` stands in: two real games in one browser, the room a `BroadcastChannel`. The real room's values were read in its source (kept with the room, not with the player), not run.
- **The timing checks** (the ready A/B, one screen's whole play on one core, the two complete checks that judge the release): the M17 session's, on a quiet machine. Nothing here is in the loading frame.
- The call's numbers (12 degrees, a second, 60 m, a minute, 25 s) are my judgement of a guide's habits, not measured; the told threshold's 0.7 is set between the lab's cued thresholds and none, as above.
- A long-lived room collects one `'flats.<id>'` key for every player who's ever spooked a fish in it (as `'rest.<id>'` does for every rest asked for): 256 keys is the room's limit.
