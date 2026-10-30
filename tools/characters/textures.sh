#!/bin/bash
# textures.sh <Textures dir> <out dir> <prefix> [size]   (MAGICK=convert for ImageMagick 6)
# colour / normal -> JPEG, specular -> ORM (R 1, G roughness = 0.92 - 0.6 * spec, B metal 0), opacity cards -> PNG with alpha
# (-auto-orient: the TGAs are stored bottom row first; ImageMagick 6 reads them upside down without it)
src=$1; out=$2; p=$3; S=${4:-1024}
mkdir -p $out
for k in body head; do
  ${MAGICK:-magick} $src/${p}_${k}_color.tga -auto-orient -resize ${S}x${S} -quality 90 $out/${p}_${k}_color.jpg
  ${MAGICK:-magick} $src/${p}_${k}_normal.tga -auto-orient -resize ${S}x${S} -quality 92 $out/${p}_${k}_normal.jpg
  ${MAGICK:-magick} $src/${p}_${k}_specular.tga -auto-orient -resize ${S}x${S} -colorspace gray -fx '0.92-0.6*u' \
    \( +clone -fill white -colorize 100 \) \( +clone -fill black -colorize 100 \) \
    -swap 0,1 -combine -quality 92 $out/${p}_${k}_orm.jpg
done
[ -f $src/${p}_opacity_color.tga ] && ${MAGICK:-magick} $src/${p}_opacity_color.tga -auto-orient -resize ${S}x${S} $out/${p}_opacity.png
ls $out
