#!/bin/bash
# Rebuild the other players' characters (together/: what you see of everyone else on the island) from
# Microsoft Rocketbox (MIT, https://github.com/microsoft/Microsoft-Rocketbox): four casual islanders,
# 512² textures, the clips below. Needs Blender 3.4+, ImageMagick (MAGICK=convert for version 6),
# curl and gh (GitHub CLI) for listing texture files.
#   tools/characters/players.sh [workdir]
set -e
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd); WORK=${1:-/tmp/rocketbox-players}
BLENDER=${BLENDER:-blender}
mkdir -p "$WORK" && cd "$WORK"
# avatar : texture prefix : clip set (m / f) : output name
AVATARS=( "Adults/Male_Adult_01:m002:m:player-m1" "Professions/Sports_Male_04:m026:m:player-m2"
	"Adults/Female_Party_01:f010:f:player-f1" "Adults/Female_Adult_17:f006:f:player-f2" )
# standing (in place): idle, the rod held up in front (an umbrella's handle), both hands on the wheel (a
# trolley's), a cheer for a catch, a wave; and walking and running (motextr_xy: they move forward,
# which convert.py takes out of the pelvis: they bob, but stay where they are)
# (@first-last: only those frames of a long take; the holds play back and forth, so no seam shows)
STATIC=( idle_neutral_01 umbrella_idle_01@1-241 trolley_idle@1-241 cheer_01@1-121 wave_01 )
MOVING=( walk_neutral_01 run_slow_01 )
A=Assets/Animations
: > files
for a in "${AVATARS[@]}"; do
	d=${a%%:*}; n=$(basename "$d")
	echo "Assets/Avatars/$d/Export/$n.fbx" >> files
	gh api "repos/microsoft/Microsoft-Rocketbox/contents/Assets/Avatars/$d/Textures" --jq '.[].name' | sed "s#^#Assets/Avatars/$d/Textures/#" >> files
done
for c in "${STATIC[@]}"; do for g in m f; do echo "$A/all_animations_max_motextr_static/${g}_${c%@*}.max.fbx"; done; done >> files
for c in "${MOVING[@]}"; do for g in m f; do echo "$A/all_animations_max_motextr_xy/${g}_$c.max.fbx"; done; done >> files
tr '\n' '\0' < files | xargs -0 -P 16 -n 1 "$HERE/fetch.sh"
mkdir -p "$ROOT/public/models/characters"
for a in "${AVATARS[@]}"; do
	d=${a%%:*}; r=${a#*:}; p=${r%%:*}; r=${r#*:}; g=${r%%:*}; out=${r#*:}; n=$(basename "$d")
	"$HERE/textures.sh" "Assets/Avatars/$d/Textures" "tex/$p" "$p" 512
	clips=()
	for c in "${STATIC[@]}"; do f=${c%@*}; r=${c#"$f"}; clips+=( "Assets/Animations/all_animations_max_motextr_static/${g}_$f.max.fbx$r" ); done
	for c in "${MOVING[@]}"; do clips+=( "Assets/Animations/all_animations_max_motextr_xy/${g}_$c.max.fbx" ); done
	"$BLENDER" -b --python "$HERE/convert.py" -- "Assets/Avatars/$d/Export/$n.fbx" "tex/$p" "$p" "$ROOT/public/models/characters/$out.glb" "${clips[@]}"
done
