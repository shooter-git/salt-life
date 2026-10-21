# Characters

The vendors (Joe at the fish stand, Marta at the chandlery) are avatars from the
[Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) library (MIT license,
`credits/LICENSE-Rocketbox.md`), converted offline to one GLB each
(`public/models/characters/joe.glb`, `marta.glb`): mesh (~7.5k triangles, 80-bone Bip01 skin),
1024² textures and the clips below.

    tools/characters/build.sh [workdir]      # fetch -> textures -> Blender -> public/models/characters/

- `fetch.sh`: one file from the Rocketbox repo (Git LFS media URL, raw fallback).
- `textures.sh`: the 2048² TGA maps to 1024² JPEG / PNG; the specular map becomes the roughness
  channel of an ORM texture (R 1, G roughness = 0.92 - 0.6 × specular, B metalness 0); the opacity
  map (hair, lashes) keeps its alpha.
- `convert.py` (Blender 4.2+, tested with 5.2, run in the background): imports the avatar, builds
  glTF-exportable materials (`body`, `head`, `opacity`), imports each clip FBX and retargets it by
  bone name in world space (the clips' skeleton rests with the arms down, the avatars in a T-pose,
  so local rotations can't be copied): every avatar bone copies its clip bone's world rotation
  (the pelvis also its position) and the result is baked, one NLA track per clip, exported as
  glTF animations.

Clips (the in-place `motextr_static` versions, `m_` for men and `f_` for women): `idle_neutral_01`,
`idle_breathe_01`, `idle_look_around_01`, `gestic_talk_neutral_01`, `gestic_talk_relaxed_01`,
`wave_01`, `gestic_shrug_01`.

Low-powered devices (All the Spaces' `low` tier) load copies with 512² textures, `joe-512.glb` and
`marta-512.glb`, made from the 1024² files with glTF-Transform:

    npx @gltf-transform/cli@4.2.1 resize joe.glb joe-512.glb --width 512 --height 512

Runtime (Salt Life): three.js's GLTFLoader through the SDK's `gltfLoader()` (All the Spaces
compresses every `.glb` with meshopt when it builds the creation) and `game/Character.js` (an
AnimationMixer with clip crossfades); `App.loadCharacters()` loads them after the start and readies
their shaders and textures, and `game/Vendor.js` swaps the stand-in figure for the character once it
has loaded.
