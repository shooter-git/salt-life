#!/bin/sh
# (M16) Runs a command holding one of three slots: several sessions share this machine's 8 cores, and a headless render
# draws on them all. tools/render-slot.sh node tools/far-sea.mjs ...  A render's stopped past RENDER_MINUTES (25), so one
# that's stuck can't hold its slot.
SLOTS="${RENDER_SLOTS:-3}"
DIR="${TMPDIR:-/tmp}/salt-life-render-slots"
mkdir -p "$DIR"
while :; do
	i=0
	while [ "$i" -lt "$SLOTS" ]; do
		flock -n -E 75 "$DIR/$i" timeout "${RENDER_MINUTES:-25}m" "$@"
		code=$?
		[ "$code" -ne 75 ] && exit "$code"
		i=$((i + 1))
	done
	sleep 5
done
