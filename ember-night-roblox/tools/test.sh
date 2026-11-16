#!/usr/bin/env bash
# Runs the Lune test suite. Usage: tools/test.sh [filter]
set -euo pipefail
cd "$(dirname "$0")/.."
LUNE="${LUNE:-$(command -v lune || echo "$HOME/.cargo/bin/lune")}"
exec "$LUNE" run tests/run.luau "$@"
