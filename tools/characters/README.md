# Characters

The vendors (Joe at the fish stand, Marta at the chandlery, (M15) Pearl at the fish camp) are avatars
from the [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) library (MIT license,
`credits/LICENSE-Rocketbox.md`: `Wood_Male_01`, `Female_Adult_04`; Pearl is `Female_Party_02`'s head and
hair on `Sports_Female_02`'s body, below), converted offline to one GLB each
(`public/models/characters/joe.glb`, `marta.glb`, `pearl.glb`): mesh (~7-8k triangles, 80-bone Bip01
skin), 1024² textures and the clips below.

    tools/characters/build.sh [workdir]      # fetch -> textures -> Blender -> public/models/characters/
    ONLY=pearl tools/characters/build.sh     # one of them (BLENDER=…, MAGICK=convert for ImageMagick 6)

(bash, since M15: it was zsh. A file already fetched into the work directory isn't fetched again.)

- `fetch.sh`: one file from the Rocketbox repo (Git LFS media URL, raw fallback), not fetched again if it's there.
- (M15) A face whose avatar's dressed wrong for the island goes on another's body: an `AVATARS` entry with a
  donor (`body : prefix : clips : name : donor : donor's prefix`). `swap_head.py` (Blender) takes the body's
  head and hair off, puts the donor's on at the body's head bone (the library's skeletons are one), and
  bridges the neck between them with the body's skin (a clean patch of the upper arm's); `skin.py` moves the
  body map's skin to the donor's tone (found by its colour, moved in Lab: Reinhard's transfer). Pearl:
  `Female_Party_02` on `Sports_Female_02`.
- `textures.sh`: the 2048² TGA maps to 1024² JPEG / PNG (`-auto-orient`: the TGAs are stored bottom row
  first, which ImageMagick 6 doesn't undo by itself: everything built here with it before M15's Pearl was
  textured upside down, the other players' avatars too); the specular map becomes the roughness
  channel of an ORM texture (R 1, G roughness = 0.92 - 0.6 × specular, B metalness 0); the opacity
  map (hair, lashes) keeps its alpha.
- `convert.py` (Blender 3.4+, tested with 3.4 and 5.2, run in the background): imports the avatar, builds
  glTF-exportable materials (`body`, `head`, `opacity`), imports each clip FBX and retargets it by
  bone name in world space (the clips' skeleton rests with the arms down, the avatars in a T-pose,
  so local rotations can't be copied): every avatar bone copies its clip bone's world rotation
  (the pelvis also its position) and the result is baked, one NLA track per clip, exported as
  glTF animations.

Clips (the in-place `motextr_static` versions, `m_` for men and `f_` for women): `idle_neutral_01`,
`idle_breathe_01`, `idle_look_around_01`, `gestic_talk_neutral_01`, `gestic_talk_relaxed_01`,
`wave_01`, `gestic_shrug_01`.

Low-powered devices (All the Spaces' `low` tier) load copies with 512² textures, `joe-512.glb`,
`marta-512.glb` and `pearl-512.glb`. `build.sh` makes them itself now, its textures at 512² (Pearl's
were made so); Joe's and Marta's were made from their 1024² files with glTF-Transform:

    npx @gltf-transform/cli@4.2.1 resize joe.glb joe-512.glb --width 512 --height 512

The other players (`together/Avatar.js`) are four more Rocketbox avatars, `player-m1.glb` …
`player-f2.glb` (`Male_Adult_01`, `Sports_Male_04`, `Female_Party_01`, `Female_Adult_17`), at 512²
on every device (one download for all tiers):

    tools/characters/players.sh [workdir]    # needs Blender 3.4+ (BLENDER=…), MAGICK=convert for ImageMagick 6

Their clips: `idle_neutral_01`; `walk_neutral_01` and `run_slow_01` from `motextr_xy` (the forward
motion taken out: in place, with the bob); `umbrella_idle_01` (holding a rod up in front),
`trolley_idle` (both hands on the boat's wheel) and `cheer_01`, cut to their first seconds
(`clip@first-last`: the holds play back and forth); `wave_01`. Blender 3.4 (Debian's) runs the glTF
exporter on the system's Python and needs numpy there (or on `PYTHONPATH` with
`--python-use-system-env`); `convert.py` leaves out exporter options an older Blender doesn't know.

Runtime (Salt Life): three.js's GLTFLoader through the SDK's `gltfLoader()` (All the Spaces
compresses every `.glb` with meshopt when it builds the creation) and `game/Character.js` (an
AnimationMixer with clip crossfades); `App.loadCharacters()` loads them after the start and readies
their shaders and textures, and `game/Vendor.js` swaps the stand-in figure for the character once it
has loaded.
