# Ember Night (Roblox) – Bot measurements

Headless runs of the Roblox sim under Lune with the port of the web game's strong bot (`tests/lib/Bot.luau`: same
direction scoring, same perception model with reaction time and lapses, same upgrade priorities). Heroes rotate through
all 9 per run, as in the web batch. Runs end at 25 min (`--tmax 1500`, like `glutnacht/tools/balance-batch.js`); a run
still alive then is "open". Interval: Wilson 95 %. Command:

```
lune run tests/bot.luau -- --land <id> --forge <none|light|mid|max> --heat <0-5> --players <1-4> --runs <n> --seed <s>
```

The sim is deterministic: the same command gives the same numbers (graveyard/none/0 gave 14/48 with both 18-min and
25-min limits, run for run identical).

## R1 – solo parity with the web game (DESIGN.md §10.3 gate)

| Land | Forge | Runs | Roblox sim: wins | 95 % | Web (README, M10) | Median death | First hit (median) | Level @1/4/8 min |
|---|---|---|---|---|---|---|---|---|
| Alter Friedhof | none | 48 (seeds 1–48) | **29 %** (14/48) | 18–43 % | 32 % (46/144), 25–40 % | 8.0 min (web 7.9) | 68 s (web 75 s) | 6 / 17 / 25 |
| Herz der Nacht | max | 48 (seeds 1–48) | **52 %** (25/48) | 38–66 % | 51 % (37/72), 40–63 % | 15.3 min (web 15.6) | 65 s (web 71 s) | 10 / 24 / 40 |

Both lie inside the web game's interval: **gate passed**. The fixed 1/30-s server step runs as two 1/60-s half steps
(`Tuning.SIM_SUBSTEPS = 2`), which is what the web game does at 60 fps; projectiles are swept, so nothing tunnels.

A first measurement with an 18-min limit (the old `balancebot.js` default) gave 6 % for Herz der Nacht/max: 23 of 48
runs were still fighting the final boss (450 000 HP) at 18:00. The web numbers use 25 min, so the bot does too now.

## R1 – co-op (4 bots, independent inputs), Alter Friedhof / none / heat 0

| Players | Runs | Wins | 95 % | Median death | Alive at 5:00 (median) | Highest level @1/4/8 min | Kills/min |
|---|---|---|---|---|---|---|---|
| 1 | 48 | 29 % | 18–43 % | 8.0 min | 46.5 | 6 / 17 / 25 | 252 |
| 2 | 24 (seeds 201–224) | 58 % | 39–76 % | 7.8 min | 67 | 6 / 18 / 29 | 465 |
| 4 (start values) | 24 (seeds 101–124) | 58 % | 39–76 % | 9.7 min | 90 | 6 / 18 / 29.5 | 806 |
| 4 (tuned) | 24 (seeds 101–124) | 58 % | 39–76 % | 8.2 min | 96.5 | 6 / 19 / 32 | 894 |

Gates (DESIGN.md §10.3) with 4 players: win rate between the solo rate and solo + 30 points (29–59 %): **58 %**, inside
(at the upper end); enemies alive at 5:00 ≥ 2 × solo: **96.5 vs 46.5 = 2.08×** after tuning (1.94× with the start
values); no player levels more than 1.3× faster than solo: **32 / 25 = 1.28** at 8:00 (highest level of the team).

Tuning applied (only `Sim/Coop.luau`): `spawnCap` 1 / 1.5 / 1.9 / 2.2 → **1 / 1.55 / 2.0 / 2.35**. The 2-player row was
measured with the tuned values. Co-op is clearly easier than solo at the same land (teammates revive each other and
share the pressure); the next tuning step, if wanted, is `enemyHp` / `spawnRate` for N = 2–4 (more samples needed: the
intervals with n = 24 are ±18 points).

## Performance (Lune on this machine, interpreted; Roblox servers run `--!native`)

| Scenario | Median step | p99 | Notes |
|---|---|---|---|
| 4 players, exactly 300 enemies, all weapons level 8, max forge (`tests/bench.luau`) | 1.16 ms | 1.93 ms | per 1/30-s step (2 half steps) |
| 4 bots, Herz der Nacht, heat 5, 0:00–12:00 (`tests/bench.luau -- --full`) | 0.81 ms | 2.92 ms | up to 451 enemies alive |
| 1 bot, Herz der Nacht, max forge (bot batch) | 0.41 ms | – | |

Budget (DESIGN.md §3.4): median ≤ 6 ms, p99 ≤ 12 ms – met with a wide margin.

## Network (encoder output, `tests/net_budget.spec.luau`, `tests/bench.luau`)

| Scenario | Snapshot per client | Downstream per client |
|---|---|---|
| 4 bots, Herz der Nacht heat 3, 0:00–5:00 | 978 B average (max 2.0 KB in 3 packets) | 16.0 KB/s average (snapshots 14.3), worst second 31 KB |
| 4 players, 300 enemies around them | 1416 B median, 2171 B max (3 packets) | ≈ 21 KB/s for snapshots at 15 Hz |

Packets stay ≤ 854 bytes (UnreliableRemoteEvent limit 900 incl. overhead). Budget: ≤ 30 KB/s typical, ≤ 45 KB/s worst.
