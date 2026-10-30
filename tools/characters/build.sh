#!/bin/bash
# Rebuild the vendor characters from Microsoft Rocketbox (MIT, https://github.com/microsoft/Microsoft-Rocketbox):
# Joe, Marta and (M15) Errol at the fish camp, 1024² textures and the clips below, and each one's low-tier copy
# with 512² textures. Needs Blender 3.4+ (tested with 3.4 and 5.2), ImageMagick (MAGICK=convert for version 6),
# curl and gh (GitHub CLI) for listing texture files.
#   tools/characters/build.sh [workdir]      (ONLY=errol: that one alone)
set -e
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd); WORK=${1:-/tmp/rocketbox}
BLENDER=${BLENDER:-blender}
mkdir -p "$WORK" && cd "$WORK"
# avatar : texture prefix : clip set (m / f) : output name
AVATARS=( "Professions/Wood_Male_01:m110:m:joe" "Adults/Female_Adult_04:f004:f:marta" "Adults/Male_Adult_18:m023:m:errol" )
if [ -n "$ONLY" ]; then

	sel=()
	for a in "${AVATARS[@]}"; do [ "${a##*:}" = "$ONLY" ] && sel+=( "$a" ); done
	AVATARS=( "${sel[@]}" )

fi
CLIPS=( idle_neutral_01 idle_breathe_01 idle_look_around_01 gestic_talk_neutral_01 gestic_talk_relaxed_01 wave_01 gestic_shrug_01 )
: > files
sets=""
for a in "${AVATARS[@]}"; do
	d=${a%%:*}; n=$(basename "$d"); r=${a#*:}; r=${r#*:}; sets="$sets ${r%%:*}"
	echo "Assets/Avatars/$d/Export/$n.fbx" >> files
	gh api "repos/microsoft/Microsoft-Rocketbox/contents/Assets/Avatars/$d/Textures" --jq '.[].name' | sed "s#^#Assets/Avatars/$d/Textures/#" >> files
done
for c in "${CLIPS[@]}"; do for g in $( echo $sets | tr ' ' '\n' | sort -u ); do echo "Assets/Animations/all_animations_max_motextr_static/${g}_$c.max.fbx"; done; done >> files
echo LICENSE.md >> files
tr '\n' '\0' < files | xargs -0 -P 16 -n 1 "$HERE/fetch.sh"
mkdir -p "$ROOT/public/models/characters"
cp LICENSE.md "$ROOT/credits/LICENSE-Rocketbox.md"
for a in "${AVATARS[@]}"; do
	d=${a%%:*}; r=${a#*:}; p=${r%%:*}; r=${r#*:}; g=${r%%:*}; out=${r#*:}; n=$(basename "$d")
	for S in 1024 512; do
		suffix=""; [ $S = 512 ] && suffix="-512"
		"$HERE/textures.sh" "Assets/Avatars/$d/Textures" "tex$S/$p" "$p" $S
		"$BLENDER" -b --python "$HERE/convert.py" -- "Assets/Avatars/$d/Export/$n.fbx" "tex$S/$p" "$p" "$ROOT/public/models/characters/$out$suffix.glb" Assets/Animations/all_animations_max_motextr_static/${g}_*.fbx
	done
done
