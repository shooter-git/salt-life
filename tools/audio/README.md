# Audio build (fishing sounds)

Rebuilds the fishing sounds in `public/audio/` from CC0 Freesound previews. Needs node and ffmpeg
(libopus). Nothing is synthesised: every sound is a real recording (sources and licences in
`credits/audio.md`).

```sh
cd tools/audio
node search.mjs "fishing reel"          # CC0-only Freesound search: id:user duration downloads title
node dl.mjs 509902:tosha73 507070:paulprit 450849:kyles 371313:Mrthenoronha 725426:mwchristian95 \
  523282:MrFossy 464697:BranndyBottle 849752:JoelMcDaniel 537084:khenshom 507094:paulprit \
  507093:paulprit 649003:ramattahatta 570208:RatBird 336585:Anthousai
                                         # -> raw/<id>.ogg + raw/<id>.json (prints each licence; check CC0)
node build-fishing.mjs                   # -> out/*.ogg + fishing-bank.json
cp out/*.ogg ../../public/audio/         # then copy the entries of fishing-bank.json into src/audio/soundBank.js
```

- Loops (`reel_wind`, `reel_drag`, `line_strain`): excerpt, equal-power crossfade at the wrap, loudness-normalised
  to -23 LUFS integrated; `lufs` in the bank is the median momentary loudness.
- Sprites (all others): slices peak-normalised to -1 dBFS; `lufs` is each slice's maximum momentary loudness.
- The mixer (`src/audio/SoundScape.js`, `MIX`) turns target loudness into gains with those measurements.

`raw/`, `work/` and `out/` are build scratch (not committed).

The weather's sounds (M9: the rain's beds and the thunder) are built the same way: `node dl.mjs 400178:Sassaby
200272:jmbphilmes 567027:johndynaudio 717909:TRP 652690:AyaDrevis 243782:bastipictures 778374:BlondPanda`, then
`node build-weather.mjs` (its bank entries in `weather-bank.json`), then `tame.mjs`.

The boat's horn is built the same way: `node dl.mjs 162350:felix.blume`, then `node build-horn.mjs` (three
blasts in one sprite), then `tame.mjs`.

The weather's cost (M10: the boat's starter, hull knocks and creaks, the keel's scrape, the bucket, the
bilge pump and slosh, and the shutters in a blow) is built the same way: `node dl.mjs 398416:bone666138
506688:magzlurban 623692:launchsite 418417:wormer2 146347:colinpoh 388014:supersplat1
31574:Walter_Odington 829588:DJKaren`, then `node build-hull.mjs` (its bank entries in `hull-bank.json`),
then `tame.mjs`. The starter's recording cranks for only 0.4 s before the engine fires, so the build lays
that stretch end to end into a crank that doesn't catch and one that does, firing as the game's crank
ends (`Hull.CRANK_S`). Keep the scratch folders empty afterwards (or move them out):
All the Spaces' checks read the folder on disk and ask for a licence entry for every sound in it.

The rain on what it falls on and the drips (M11) are built the same way: `node dl.mjs 683778:Elements-Library
824671:buzkill 51813:kyles 572429:TRP 399281:Mjeno`, then `node build-surfaces.mjs` (its bank entries in
`surfaces-bank.json`), then `tame.mjs`. `node build-surfaces.mjs --try` writes each loop and each drop on its own
to `tools/sounds/try/` instead, for the listening page. The rain on a lake modulates from light to medium and
back over its six minutes: its three loops are cut from its light, medium and heavier stretches.

The rain on a tin roof heard from beneath it and the hurricane shelter's radio (M14) are built the same way:
`node dl.mjs 771981:Sassaby 397088:relwin`, then `node build-shelter.mjs` (its bank entries in
`shelter-bank.json`), then `tame.mjs`. The radio's words are made out by nobody: it's low-passed twice at 300 Hz.

## All the Spaces' loudness rule, and the AAC copies

All the Spaces' build turns a sound down when it's louder than -14 LUFS integrated or peaks above -1 dBFS.
That would quietly change the mix, since the bank's `lufs` would no longer be true. `tame.mjs` keeps every
file inside that rule, with 0.3 dB to spare, and moves the file's `lufs` in `src/audio/soundBank.js` by the
same gain. It also writes an `.m4a` (AAC) copy of each `.ogg` for browsers that can't decode Ogg Opus
(older Safari). The soundscape picks the format with `canPlayType`, and falls back to the copy when an Ogg
decode fails.

```sh
node tools/audio/tame.mjs           # after adding or rebuilding sounds (needs ffmpeg)
node tools/audio/tame.mjs --check   # fails if a file is outside the rule or has no .m4a
```
