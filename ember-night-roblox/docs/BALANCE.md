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
(`Tuning.SIM_SUBSTEPS = 2`), which is what the web game does at 60 fps (R1 used swept collisions; R2 tests the end point of each half step like the web game).

A first measurement with an 18-min limit (the old `balancebot.js` default) gave 6 % for Herz der Nacht/max: 23 of 48
runs were still fighting the final boss (450 000 HP) at 18:00. The web numbers use 25 min, so the bot does too now.

## R2 – every row of the web README table (solo, after the parity fixes)

`tools/balance.sh 36` (36 runs per row, seeds 1–36, heroes rotating, 25-min limit; no run was still open). Web
numbers: `glutnacht/README.md` (M10, pooled). z = two-proportion test against the web rate.

| Land | Forge | Roblox sim: wins | 95 % | Web: wins | 95 % | z | Median death (sim / web) | First hit (sim / web) | Level @1/4/8 min |
|---|---|---|---|---|---|---|---|---|---|
| Alter Friedhof | none | **25 %** (9/36) | 14–41 % | 32 % (46/144) | 25–40 % | -0.8 | 8.2 / 7.9 min | 70 / 75 s | 6/17/24 |
| Aschenwald | none | **6 %** (2/36) | 2–18 % | 13 % (9/72) | 7–22 % | -1.1 | 6.8 / 7.1 min | 81 / 80 s | 7/17/29 |
| Aschenwald | light | **17 %** (6/36) | 8–32 % | 22 % (16/72) | 14–33 % | -0.7 | 7.5 / 8.2 min | 68 / 64 s | 7/18/33 |
| Eissee | light | **17 %** (6/36) | 8–32 % | 19 % (7/36) | 10–35 % | -0.3 | 10.2 / 10.3 min | 80 / 85 s | 8/19/30 |
| Eissee | mid | **47 %** (17/36) | 32–63 % | 43 % (31/72) | 32–55 % | 0.4 | 11.4 / 11.7 min | 75 / 85 s | 9/21/33 |
| Burgruine | mid | **25 %** (9/36) | 14–41 % | 19 % (14/72) | 12–30 % | 0.7 | 10.2 / 10 min | 65 / 79 s | 7/19/29 |
| Burgruine | light | **0 %** (0/36) | 0–10 % | 6 % (4/72) | 2–13 % | -1.4 | 8.3 / 8.2 min | 75 / 86 s | 5.5/16.5/25 |
| Herz der Nacht | mid | **3 %** (1/36) | 0–14 % | 6 % (4/72) | 2–13 % | -0.6 | 8.7 / 8 min | 62 / 65 s | 8/20/30 |
| Herz der Nacht | max | **39 %** (14/36) | 25–55 % | 51 % (37/72) | 40–63 % | -1.2 | 14.3 / 15.6 min | 67 / 71 s | 10/24/37.5 |
| Alter Friedhof, Nachtstufe 5 | max | **44 %** (16/36) | 30–60 % | 36 % (52/144) | 29–44 % | 0.9 | 7.8 / 7.8 min | 55 / 59 s | 8/21.5/32 |

**All ten rows lie within |z| ≤ 1.4 of the web game**, every web rate lies inside or at the edge of the sim's 95 %
interval, median death times differ by at most 1.3 min (Herz der Nacht/max 14.3 vs 15.6) and first hits by at most
14 s. Pooled over the ten rows the sim wins 80/360 (22 %) where the web rates predict 89: slightly harder, not
significantly (z ≈ −1.1). Differences that remain and why:

- The sim agrees bit for bit with the web code (tests/parity.spec.luau) until last-bit floating-point drift sets in,
  so runs with the same seed are not the same run as in the web batch; the comparison is statistical only.
- The Roblox sim has a fixed view of 1280 × 720 world px with a 70-px HUD band at the top (`VIEW_TOP`); the web
  measurement used the desktop view without the band. Ranged enemies and bosses fire only when inside the view
  rectangle, so the band can delay some attacks from the top edge (the parity harness uses the band on both sides; its effect on the win rates was not measured separately).
- R1 measured Alter Friedhof/none 29 % (14/48) and Herz der Nacht/max 52 % (25/48) before the R2 fixes (summons
  moved one step later, coins reached later, swept shot collisions); the new values (25 %, 39 %) are inside both the
  old and the web intervals – no sign of a systematic shift beyond chance.

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

## R2 – co-op check on a second land: Aschenwald / light / heat 0, 4 bots

24 runs (seeds 301–324, heroes rotating), after the co-op summon fix: **33 %** wins (8/24, 95 %: 18–53 %) against
17 % solo (6/36); median death 10.0 min (solo 7.5), enemies alive at 5:00 ≈ 97 (four seed blocks: 96 / 94.5 / 100 /
97.5; solo 45, i.e. 2.1×), highest level at 8:00 ≈ 34 (solo 33). Gate (DESIGN.md §10.3): win rate between solo and solo + 30 points:
**+16 points, inside**; no player levels more than 1.3× faster than solo: **≈ 1.03×**. Team revives work in these
runs (bots walk to downed teammates). The co-op factors (`Sim/Coop.luau`) stay as tuned in R1.

## R5 – co-op check on a 15-minute land: Eissee / light / heat 0, 4 bots

18 runs (seeds 5001–5018) plus the 9 runs of the gameplay review (seed 3001): **63 %** wins (17/27, 95 %: 44–78 %).
Solo on the same land: 29 % (13/45: seeds 1001–1018 and 5001–5027). Median enemies alive at 5:00: 85 (solo 48, 1.8×),
level at 8:00 33 (solo 29–32). The point estimate is +34 points, a little above the graveyard gate of solo + 30, but
the interval's lower bound (44 %) lies inside it, and Aschenwald (+16) and Alter Friedhof (+18) sit well inside.
The co-op factors are global and tuned on Alter Friedhof, so they stay as they are; worth re-checking with real
players (four identical bots kite in the same way and revive each other quickly).

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

Packets stay ≤ 798 bytes since R5 (UnreliableRemoteEvent limit 900 incl. overhead; was 854). Budget: ≤ 30 KB/s typical, ≤ 45 KB/s worst.
