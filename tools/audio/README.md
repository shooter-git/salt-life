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
