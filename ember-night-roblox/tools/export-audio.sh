#!/usr/bin/env bash
# Copies the web game's CC0 recordings into assets/audio/ for upload to Roblox (docs/DESIGN.md §9).
# Usage: tools/export-audio.sh [path/to/glutnacht] [--reencode]
#   --reencode  re-encodes every file with ffmpeg to 44.1 kHz mono mp3 (only needed if Roblox rejects an upload)
# After uploading (Creator Hub -> Creations -> Audio, or Studio -> Asset Manager -> Bulk Import), put the asset ids
# into src/shared/Config/AudioIds.luau.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:-../glutnacht}"
REENCODE=0
for a in "$@"; do
	if [ "$a" = "--reencode" ]; then REENCODE=1; fi
done
if [ "$SRC" = "--reencode" ]; then SRC="../glutnacht"; fi
mkdir -p assets/audio/sfx assets/audio/music
for kind in sfx music; do
	for f in "$SRC/assets/audio/$kind"/*.mp3; do
		name="$(basename "$f")"
		if [ "$REENCODE" = 1 ]; then
			ffmpeg -loglevel error -y -i "$f" -ar 44100 -ac 1 -b:a "$([ $kind = sfx ] && echo 64k || echo 96k)" \
				"assets/audio/$kind/$name"
		else
			cp "$f" "assets/audio/$kind/$name"
		fi
	done
done
cp "$SRC/assets/CREDITS-audio.txt" assets/audio/CREDITS-audio.txt
echo "sfx: $(ls assets/audio/sfx | wc -l) files, music: $(ls assets/audio/music | wc -l) files -> assets/audio/"
