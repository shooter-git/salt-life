#!/bin/bash
# Rebuild the vendor characters from Microsoft Rocketbox (MIT, https://github.com/microsoft/Microsoft-Rocketbox):
# Joe, Marta and (M15) Pearl at the fish camp, 1024² textures and the clips below, and each one's low-tier copy
# with 512² textures. Needs Blender 3.4+ (tested with 3.4 and 5.2), ImageMagick (MAGICK=convert for version 6),
# Python 3 with Pillow and numpy (skin.py), curl and gh (GitHub CLI) for listing texture files. Blender's glTF
# exporter needs numpy in its own Python too (PYTHONPATH: for Blender alone, skin.py runs without it).
#   tools/characters/build.sh [workdir]      (ONLY=pearl: that one alone)
set -e
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd); WORK=${1:-/tmp/rocketbox}
BLENDER=${BLENDER:-blender}
mkdir -p "$WORK" && cd "$WORK"
# avatar : texture prefix : clip set (m / f) : output name [ : head donor : its texture prefix ]
# (with a donor, its head and hair on the avatar's body, the body's skin made the donor's: swap_head.py, skin.py.
# Pearl: Female_Party_02's face and hair, dressed for a fish camp in Sports_Female_02's tank top and cargo trousers)
AVATARS=( "Professions/Wood_Male_01:m110:m:joe" "Adults/Female_Adult_04:f004:f:marta" "Professions/Sports_Female_02:f013:f:pearl:Adults/Female_Party_02:f022" )
if [ -n "$ONLY" ]; then

	sel=()
	for a in "${AVATARS[@]}"; do IFS=: read -r _ _ _ out _ _ <<< "$a"; [ "$out" = "$ONLY" ] && sel+=( "$a" ); done
	AVATARS=( "${sel[@]}" )

fi
CLIPS=( idle_neutral_01 idle_breathe_01 idle_look_around_01 gestic_talk_neutral_01 gestic_talk_relaxed_01 wave_01 gestic_shrug_01 )
: > files
sets=""
for a in "${AVATARS[@]}"; do
	IFS=: read -r d p g out dd dp <<< "$a"
	sets="$sets $g"
	for x in $d $dd; do
		n=$(basename "$x")
		echo "Assets/Avatars/$x/Export/$n.fbx" >> files
		gh api "repos/microsoft/Microsoft-Rocketbox/contents/Assets/Avatars/$x/Textures" --jq '.[].name' | sed "s#^#Assets/Avatars/$x/Textures/#" >> files
	done
done
for c in "${CLIPS[@]}"; do for g in $( echo $sets | tr ' ' '\n' | sort -u ); do echo "Assets/Animations/all_animations_max_motextr_static/${g}_$c.max.fbx"; done; done >> files
echo LICENSE.md >> files
tr '\n' '\0' < files | xargs -0 -P 16 -n 1 "$HERE/fetch.sh"
mkdir -p "$ROOT/public/models/characters"
cp LICENSE.md "$ROOT/credits/LICENSE-Rocketbox.md"
for a in "${AVATARS[@]}"; do
	IFS=: read -r d p g out dd dp <<< "$a"
	n=$(basename "$d"); avatar="Assets/Avatars/$d/Export/$n.fbx"
	if [ -n "$dd" ]; then
		"$BLENDER" -b --python "$HERE/swap_head.py" -- "$avatar" "Assets/Avatars/$dd/Export/$(basename "$dd").fbx" "$out" "$WORK/$out.blend"
		avatar="$WORK/$out.blend"
	fi
	for S in 1024 512; do
		suffix=""; [ $S = 512 ] && suffix="-512"
		"$HERE/textures.sh" "Assets/Avatars/$d/Textures" "tex$S/$p" "$p" $S
		tex="tex$S/$p"; prefix=$p
		if [ -n "$dd" ]; then
			# (the body's maps, its skin the donor's; the donor's head and hair)
			"$HERE/textures.sh" "Assets/Avatars/$dd/Textures" "tex$S/$dp" "$dp" $S
			tex="tex$S/$out"; prefix=$out; mkdir -p "$tex"
			env -u PYTHONPATH python3 "$HERE/skin.py" "tex$S/$p/${p}_body_color.jpg" "tex$S/$dp/${dp}_body_color.jpg" "$tex/${out}_body_color.jpg"
			for k in body_normal body_orm; do cp "tex$S/$p/${p}_$k.jpg" "$tex/${out}_$k.jpg"; done
			for k in head_color head_normal head_orm; do cp "tex$S/$dp/${dp}_$k.jpg" "$tex/${out}_$k.jpg"; done
			cp "tex$S/$dp/${dp}_opacity.png" "$tex/${out}_opacity.png"
		fi
		"$BLENDER" -b --python "$HERE/convert.py" -- "$avatar" "$tex" "$prefix" "$ROOT/public/models/characters/$out$suffix.glb" Assets/Animations/all_animations_max_motextr_static/${g}_*.fbx
	done
done
