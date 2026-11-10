# M17, step 4: the flats' sounds and Pearl's outboard

What [M17.md](../M17.md) asked under [Looks and sounds](../M17.md#looks-and-sounds): the flats' sounds (a tail's splash, a school bolting, the push of the kayak through still water) from Freesound (CC0), each pick and download the user's; and Pearl's outboard, its level judged by ear. Built 2026-11-09 on branch `claude/m17-sounds-b3bd82`, cut from `m17-flats` at 53ffb1c. Everything was chosen by ear on the listening page (`tools/sounds/`, local, kept out of git) by the user; nothing was run on the user's devices.

## What each really sounds like

- **A tail.** A bonefish head down in a foot of water, rooting: its tail breaks the top and waves, and now and then slaps it, the water running off. Tailing fish "can create quite a ruckus in shallow water", and on a calm flat they're often heard before they're seen ([Deneki, "listen while you walk"](https://deneki.com/2017/09/listen-while-you-walk/); [Deneki, tailing bonefish](https://deneki.com/2010/03/tailing-bonefish/)). Small, close, now and then.
- **A school bolting.** "Bonefish pushing through skinny water can be loud" (Deneki, the same): the whole school off at once for deep water ([Orvis, bonefish are spooky](https://howtoflyfish.orvis.com/video-lessons/advanced-intermediate-fly-fishing-lessons/8-bonefish/1494-6-bonefish-are-spooky)), a bonefish at 5 to 6 m/s through a foot of water. A sudden rush and spray, gone in a second or two.
- **The kayak's push.** Paddlers describe the water at a kayak's bow on flat water as a gurgle that grows with speed, more of it from a blunter bow, almost none going very slowly ([paddling.com, "bow noise"](https://forums.paddling.com/t/bow-noise/40085)).
- **Pearl's outboard.** At the helm of a center console with one outboard: about 69 dBA idling and 91 at full throttle ([BoatTest, Yamaha 242 Limited S](https://boattest.com/review/yamaha/3211_242-limited-s)); "idle in the 60s, cruising in the 80s and wide-open throttle in the 90s" ([Boating, noise levels](https://www.boatingmag.com/?p=71886)). Going by 50 ft (15 m) off flat out, a small boat is at most 86 dBA, the states' limit by SAE J34's pass-by test ([boat-ed, Nevada](https://boat-ed.com/nevada/studyGuide/Mufflers-and-Noise-Level-Limits/10103402_39595)), and usually several dB under. So 12 m off she'd be about 7 to 14 dB under your own console flat out at its helm. M16 had her level with it. An estimate, not a measurement.

## The shortlist and the picks (the user's, 2026-11-09)

Shortlisted from Freesound's CC0 search (`tools/audio/search.mjs`) and set out on `tools/sounds/m17.html`, each streamed from Freesound's own preview with its spectrogram, so nothing was downloaded before the user's word. A first look for voices and hums came from each one's spectrogram image (a flat line a hum, a wandering one a voice).

| | Candidate | Downloaded | Built |
|---|---|---|---|
| T1 | [Fish Splashing Pond.wav](https://freesound.org/people/kylecutsfilms/sounds/443380/), kylecutsfilms: koi at a temple pond's top | yes | yes, a bonefish's tail |
| T2 | [water movements arm slaps splashes small](https://freesound.org/people/kyles/sounds/637949/), kyles | | |
| T3 | [Water - Shallow, splash](https://freesound.org/people/Vrymaa/sounds/770033/), Vrymaa | | |
| T4 | [Fish Jumping Splash 1.wav](https://freesound.org/people/paulprit/sounds/507092/), paulprit | yes | yes, a permit's tail |
| B1 | [Asp attacks riverside and underwater](https://freesound.org/people/darthbaul/sounds/273725/), darthbaul: an asp charging bleak at a river's top | yes | yes, the river taken down |
| B2 | [Fish Being Netted on River.wav](https://freesound.org/people/paulprit/sounds/581580/), paulprit | | |
| B3 | [running through a puddle](https://freesound.org/people/launemax/sounds/249930/), launemax | | |
| B4 | [water movements swimming around small splashes random](https://freesound.org/people/kyles/sounds/637957/), kyles | yes | no |
| K1 | [Sailing boat, bow wave (close perspective)](https://freesound.org/people/Pfannkuchn/sounds/360631/), Pfannkuchn | | |
| K2 | [rowing boat rear wave.wav](https://freesound.org/people/Fenodyrie/sounds/588308/), Fenodyrie | | |
| K3 | [Kayaking in calm weather](https://freesound.org/people/AugustSandberg/sounds/509323/), AugustSandberg (the paddle's own) | yes | no |
| K4 | [Kayak or Canoe, Paddling on Lake](https://freesound.org/people/CHallSmith/sounds/870597/), CHallSmith | yes | yes |
| P1 | [outboard motor boat idle or slow, from shore](https://freesound.org/people/kyles/sounds/637743/), kyles (optional, for Pearl) | | |

All CC0, each one's licence read off its page as it was downloaded (`tools/audio/dl.mjs`). Then, from the cuts on the listening page beside the game's own sounds at the game's levels:
- **Tail:** the koi's slaps for a bonefish's tail, the jump's landing for a permit's, at -33. The user noted T1 opens with the words "koi pond": they're at 1.2 to 1.9 s, and the first cut is at 4.86 s.
- **Bolt:** the asp's charges with the river taken down, at -26 for a school of 12, 15 m off.
- **Push:** K4's glides, at -40 at her hull speed.
- **Pearl:** 9 dB under M16's level, the estimate above. Her recording stays the console's (no P1).

## How they were cut

`tools/audio/build-flats.mjs` (`--try` writes every candidate cut to `tools/sounds/try/` for the page). Each recording was mapped first: its level in three bands, its events over a running floor, and voiced pitch (80 to 400 Hz autocorrelation) for a voice or a hum.
- **`tail_splash.ogg`**, 10 slices. Eight slaps of the koi, each with its trickle (0.6 to 0.85 s), high-passed at 350 Hz (four poles) over the pond's rumble. The pond has a voice in its first 2 s ("koi pond") and a steady hum in places, near 340 Hz; the cuts are after the voice, and the seventh ends before a faint pitched line at 25.75 s. Then the jump's landing and its second splash (0.9 and 0.72 s), high-passed at 250 Hz. Slices 0 to 7 are a bonefish's, 8 and 9 a permit's.
- **`school_bolt.ogg`**, 5 slices of 1.3 to 1.5 s. The first 25 s of the asp's recording are from the bank, five charges whose spray stands 8 to 10 dB over the river in the highs (the rest is from under the water). The river is taken down by its own noise profile: `afftdn` sampling 3.6 to 6.6 s, between two charges (`nr=20, nf=-30`), about 13 dB off the river and nothing off the charges (a first setting, `nf=-60`, did nothing). Then high-passed at 500 Hz.
- **`kayak_push.ogg`**, a loop of 8.4 s. K4's strokes come every 1.3 s. Between each pair the quietest steady 0.35 s (the least spread in level) is her water alone; 24 of them, each as loud as their median, joined end to end with equal-power crossfades of 0.1 s, high-passed at 200 Hz. K3 was cut the same way (20 glides of 0.45 s); the user chose K4.

`tools/audio/tame.mjs` then kept each inside All the Spaces' loudness rule (school_bolt turned down 1.2 dB, kayak_push 0.8, their `lufs` with them) and wrote the AAC copies. The sources are in `credits/audio.md` and `assets.lock.json`.

| File | .ogg | .m4a |
|---|---|---|
| `tail_splash` | 74.6 KB | 75.5 KB |
| `school_bolt` | 64.9 KB | 62.5 KB |
| `kayak_push` | 63.8 KB | 69.8 KB |

411 KB in all (0.41 MB), of M17's 1 MB.

## Where they're heard

The rules are numbers in `audio/FlatsSound.js` (pure), shared by the mixer, its test and the listening page. The levels are `MIX`'s `tailSplash` (-33 LUFS 10 m off), `schoolBolt` (-26 LUFS 15 m off) and `kayakPush` (-40 LUFS at her seat at hull speed).

- **A tail** (`SoundScape.tailSplash`). `world/Fish.js` calls `onTail( x, y, z, out, permit )` where a tailing fish's ring is drawn (`updateMarks`: each fish with its tail out, every 0.8 to 2.6 s, a fish head down only, not a laid-up tarpon's back or a fin cruising, none while its school bolts). One ring in 2.5 is heard (`TAIL.chance`), none sooner than 0.25 s after another, within 30 m. A tail barely out is up to 4 dB quieter, a permit's 3 dB louder and a little slower. Three at once, one on low (`LIMITS.tail`).
- **A bolt** (`SoundScape.schoolBolt`). `Fish.sightBolt` calls `onBolt( x, y, z, n )` the moment a school bolts, whatever spooked it: you, a cast, or one of it hooked. A spook sent from a guest's game (the flats together, built beside this) is heard too if it's applied through `sightBolt`. It's played where the school is, within 120 m, louder or quieter by its count as power (a school of 12 at the level, a lone fish 6 dB under, 2 dB over at most). Two at once, one on low. `FlatsFishing.spooked` no longer plays the hooked fish's splash at a quarter strength for it.
- **The push** (the `kayak_push` bed). Under your own kayak (`boat.sound === 'kayak'`), at her seat or within a few metres of her. Nothing drifting, from 0.2 m/s rising as the bow's water does (its power about as the speed cubed): 5 dB under its level at 3 knots, 10 at 2, all of it at her hull speed (`Paddle.js`' 4.4 knots), and a little brighter faster. It's on still water only, gone between 3 and 8 m/s of wind, where the chop's slaps are her water, and none under the water. On still water her running slaps (`hull_slap` from 1.2 m/s) are given up for it, by the same share.
- **Loading.** The tails and bolts load once you're on or near the flats (App's `state.flats`, `FlatsFishing.near`); the push once you're aboard the kayak. Nothing at the start.
- **Pearl's outboard** (`PASSING.db`): -36 LUFS 12 m off idling, -30 flat out (M16's -27 and -21), 9 dB under the console flat out at her helm.

App wires the hooks (`fish.onTail`, `fish.onBolt`) and passes `flats`. The changes outside `audio/` are those lines, the two calls in `Fish.js`, and one line taken out of `FlatsFishing.spooked`.

## The listening page

Local (`tools/sounds/`, excluded from git; served by the dev server at `/tools/sounds/`, with the trailing slash). `m17.html` is the shortlist, streamed from Freesound. The main page's first cards are the three flats sounds as built (each slice, a tailing school, a school tailing then spooked, the push with her speed and the wind, her strokes over it), and Pearl's pass at her level with the level either side, beside your console's engine and the sea. It imports the game's `MIX`, `PASSING`, `ENGINES` and `FlatsSound.js`, so it follows the game.

## Checks

- **`test/flats-sounds.mjs`** (39 checks) runs the real mixer on a stand-in audio context. It covers: the push's law by speed and wind; which slices are a bonefish's and a permit's; a bolt's level by count; nothing loaded off the flats and out of the kayak; a tail within reach, now and then, never two at once, none past 30 m or under the water; a bolt at its level, quieter for fewer, none past 120 m; the hooks where the fish call them; the push at -45 LUFS at 3 knots and -40 at hull speed, none drifting, in a breeze, under the water or in another boat; no slaps at 3 knots on still water (18 in a 10 m/s breeze); low's one tail and one rush; Pearl at -30 flat out 12 m off.
- `pnpm test`, the asset lock and `tame.mjs --check`: below.

## Not verified

- **By ear in the game itself.** The user listened on the page, which places sounds roughly (a stereo pan and the game's distance law), not with the game's HRTF and its other sounds about the flat.
- **A real tailing school's rate.** How many rings come at once depends on how many tails are out, which the fish decide; one in 2.5 heard is a guess from the page's tailing school.
- **The push for others.** Another player's kayak going by isn't heard pushing (their boats' sound is their engine's, `Together`), nor is a guest's own kayak on yours.
- Any device: none was run, by the user's decision.
