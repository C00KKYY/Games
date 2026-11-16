#!/usr/bin/env bash
# Builds the place file for Roblox Studio: build/EmberNight.rbxlx
set -euo pipefail
cd "$(dirname "$0")/.."
ROJO="${ROJO:-$(command -v rojo || echo "$HOME/.cargo/bin/rojo")}"
mkdir -p build
"$ROJO" build default.project.json -o build/EmberNight.rbxlx
echo "built build/EmberNight.rbxlx"
