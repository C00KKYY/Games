#!/usr/bin/env bash
# Solo bot batch for every row of the web README's win-rate table (4 configs in parallel), then the comparison table.
#   tools/balance.sh [runs=72] [outdir=build/balance] [players=1]
set -euo pipefail
cd "$(dirname "$0")/.."
RUNS="${1:-72}"; OUT="${2:-build/balance}"; PLAYERS="${3:-1}"
LUNE="${LUNE:-$(command -v lune || echo "$HOME/.cargo/bin/lune")}"
mkdir -p "$OUT"
node tools/balance-table.js --rows | xargs -P 4 -L 1 sh -c \
  '"'"$LUNE"'" run tests/bot.luau -- --land $0 --forge $1 --heat $2 --players '"$PLAYERS"' --runs '"$RUNS"' --seed 1 > '"$OUT"'/$0-$1-$2-p'"$PLAYERS"'.txt 2>&1'
node tools/balance-table.js "$OUT" "$PLAYERS"
