# Ember Night M10: Countdown and tension curve (final implementation spec)

Source feedback (verbatim): "1 Minute ist super, dann Min 2 ist ein bisschen langweilig weil die waffen so
stark sind und die gegner nicht so, aber dann ab min 5 oder so wirds echt schwierig. Also am besten bei
min 1:30 so ein countdown bis die nächsten starken gegner kommen und dass man sich vorbereiten soll.
sonst alles flüssig." The user confirmed the game stays hard ("grundsätzlich ja").

Repo: /home/user/Games/glutnacht, branch claude/gifted-hypatia-p10tnj. Commit there and do not push.
Code base for all line numbers: 92f91fb. Measurement: scratchpad m10/curve.md and curve.json (108 runs).

---------------------------------------------------------------------------------------------------
## 0. Verdict on the proposals

**Base: Proposal B (systems).** It plugs into the existing director instead of adding a second spawner:
the surge multiplies `rate` and `cap` and swaps the melee part of the wave pool. As a result:
- `rangedCap`, `canWind`, the projectile cap and all M9 telegraph rules stay untouched;
- spawns keep coming from `spawnPos()` (off-screen), so fairness rules hold;
- B adds no new enemy fields (hidden class stays stable);
- the HP bridge is monotone and identical to today before 75 s and from 240 s on;
- `xp: 0.7` stops the surge from making minutes 3–4 easier;
- B measured the HUD rects in all three viewports.

**Grafted from Proposal A (pacing):**
1. The countdown shows **what** is coming: an icon of the main surge enemy in the bar, and a T-10 banner
   with a one-line trait hint ("Ghule: zäh und langsam"). This is the "prepare" the user asked for.
2. The second elite (150 s) serves as the **finale** of the surge. The surge is shortened to 25 s
   (120–145 s), so the end banner and the elite banner never collide. A wanted 20 s and B wanted 35 s.
3. **Stragglers.** In graveyard, waves 3 and 4 get `ghoul: 1`, so TTK climbs step by step instead of
   jumping at 4:00.
4. A **light countdown before the first boss** of each land (bar only, no banner, ticks only in the
   last 3 s). The cliff at 4:00 is where "ab Minute 5 echt schwierig" starts. Only one light countdown
   per land, so the countdown cannot become background noise.
5. **Sprite prewarm** and a **perf scenario** that covers the surge window.
6. **Heat damping** of the surge multiplier at Nachtstufe ≥ 3.

**Rejected or deferred (with reason):**
- **A's direction reveal** (edge glow at T-10, markers at T-3, side-restricted spawns). Rejected: it
  needs a new spawn function, a new screen-edge layer, and a new marker type that sits next to the M9
  chevrons. That brings real risk of confusing it with projectile warnings and of frame cost, for a
  benefit that the icon and timing already deliver. Deferred.
- **A's gem vacuum on surge end.** Rejected: it speeds up leveling exactly where the dip comes from.
- **A's no-hit bonus.** Kept in a small form, as gold only (meta currency, no in-run power).
- **A's info line in the level-up modal.** Rejected: the 844×390 level-up modal is already full. The
  frozen bar stays visible under the dimmed overlay instead.
- **A's `UI.banner` queue.** Not needed: the schedule rules (§4.4, checked in simtest) keep all
  countdown-related banners ≥ 2.5 s away from other banners.
- **B's compact chip for "bar and boss bar at the same time"**. Not needed: such an overlap is
  impossible by construction (§5.5). A defensive hide rule is enough.
- **Endless-mode countdowns and later boss countdowns.** Deferred (M11 candidate).

---------------------------------------------------------------------------------------------------
## 1. Goal curve (every land)

| Phase | Time | What happens | Target |
|---|---|---|---|
| Opening | 0:00–1:15 | unchanged | identical code path (hpMul, waves, events unchanged before 75 s) |
| Warning | 1:30–2:00 | bar "Starke Gegner kommen!" → "Ansturm in 0:27…", warn sound, T-10 banner with hint, ticks T-5…T-1 | tension, time to collect XP and pick upgrades on purpose |
| Surge | 2:00–2:25 | opening event (ghoul ring etc.), director ×rate/×cap with tough melee pool | Last ≈ 0.7–1.0 × window B (5:00–5:59) |
| Payoff | 2:25–2:30 | "Ansturm überstanden!", gold, then the elite at 2:30 with its chest | relief |
| Climb | 2:30–4:00 | tougher waves 3/4, HP bridge, stragglers, light countdown before the first boss | TTK and Last rise steadily; no 4:00 step ×2–3 |
| Minute 5+ | from 4:00 | unchanged data and hpMul | not easier (bins ≥ 0.9 × baseline) |

---------------------------------------------------------------------------------------------------
## 2. Data model (js/data.js)

Each stage gets a `surges` array (M10: exactly one entry per land) and an `hpBridge` flag:

```js
surges: [{
  t: 120,            // start of the surge (s, game time r.t)
  lead: 30,          // countdown length: the bar appears at t - lead = 90 s
  dur: 25,           // surge length: 120–145 s
  rate: 1.4,         // multiplier on the director rate during the surge
  cap: 1.3,          // multiplier on the wave cap during the surge
  xp: 0.7,           // XP factor for every enemy spawned during the surge (director + opener)
  speed: 1,          // speed factor for surge spawns (frostlake 1.15)
  pool: { ghoul: 2, skel: 3, ghost: 2 },   // replaces the MELEE entries of the current wave pool
  open: { kind: 'ring', type: 'ghoul', n: 14 }, // runEvent() at t, quiet (no 'alarm' sfx)
  icon: 'ghoul',     // enemy type drawn in the bar (land tint applied)
  text: 'Die Ghule erheben sich!',          // T-0 banner (via runEvent)
  hint: 'Ghule: zäh und langsam',           // sub-line of the T-10 banner
  gold: 15,          // gold on survival (× HEAT.gold); +15 more if the hero took no hit
}],
hpBridge: true,      // false = old hpMul unchanged
```

- `Render.stageTypes(stage)` (render.js:94) must also collect `surges[].pool`, `surges[].open.type` and
  `surges[].icon`. Today every surge type already appears in the land's waves, but this keeps the
  prebuild correct if the data changes.
- The **light boss countdown is not data**. It is generated at run start from the earliest boss with
  `!final`, with `lead: 20`. That boss is never the final one in the current data.

---------------------------------------------------------------------------------------------------
## 3. Game logic (js/game.js)

### 3.1 Run state (game.js:56–61, newRun)
Add `cdIdx: 0, cd: null, surgeHits: 0, cdList: []`. `cdList` is built once per run, sorted by start time:
- one `{kind:'surge', s, start: s.t - s.lead, at: s.t, end: s.t + s.dur}` per `stage.surges` entry;
- one `{kind:'boss', b, start: b.t - 20, at: b.t, end: b.t}` for the first non-final boss.

Endless mode: `cdList` contains only entries with `start < r.length`. All current entries are below 4:30,
so when endless starts nothing is pending; nothing is ever added in endless.

### 3.2 `countdownTick(dt)`, called at the top of `director()` (game.js:224)
Advance `r.cdIdx` while the current entry is finished. The phase of the current entry is:
- `warn` while `start ≤ r.t < at`;
- `on` while `at ≤ r.t < end` (surge only);
- `done` afterwards.

On phase transitions:
- **enter warn (surge):** `Hooks.sfx('warn')`, then `Hooks.countdown(entry)`; the UI draws the icon once.
- **enter warn (boss):** no sound.
- **r.t crosses at − 10 (surge only):** `Hooks.banner(tr('Mach dich bereit!'), 'event', tr(s.hint))`.
- **Ticks:** `Hooks.sfx('tick')` each time `ceil(at − r.t)` drops to 5, 4, 3, 2, 1 (surge), or to 3, 2, 1 (boss).
- **enter on (surge):**
  - `this.runEvent(Object.assign({ text: s.text, quiet: true, surge: true }, s.open))`;
  - `Hooks.sfx('surge')`, `Hooks.shake(6)`, set `r.surgeHits = 0`;
  - in `runEvent` (game.js:403): `if (!ev.quiet) Hooks.sfx('alarm')`; when `ev.surge`, apply
    `e.xp *= s.xp; e.speed *= s.speed` to each spawned enemy.
- **boss entry reaches at:** nothing. The existing `spawnBoss` banner and sound are the T-0 moment.
- **end of the surge (hero alive, not over):**
  - `g = round(s.gold * HEAT[r.heat].gold) * (r.surgeHits ? 1 : 2)`, added to the run gold the same way
    a gold bag is picked up (game.js collect path, counts into `r.gold`);
  - `Hooks.banner(tr('Ansturm überstanden!'), 'win', r.surgeHits ? tr('+{0} Gold', g) : tr('Ohne Treffer! +{0} Gold', g))`;
  - `Hooks.sfx('achievement')` (existing bright chime; not `bossdown`, which belongs to bosses).
- `r.surgeHits++` wherever the hero takes damage (same spot that sets `r.firstHit`).

`countdownTick` runs on `r.t`, which advances only in state `play`. Pause, level-up, chest, revive and
any modal therefore freeze the countdown, the ticks and the surge. The post-modal resume ramp
(main.js:40) applies unchanged.

### 3.3 Effect of the surge on the director (game.js:224–243)
While the current entry is a surge in phase `on`:
```js
const k = r.heat >= 3 ? 0.7 : 1;                       // heat damping
rate *= 1 + (s.rate - 1) * k;
cap  = Math.round(cap * (1 + (s.cap - 1) * k));       // before the 35 % refill check
wvUse = r.surgeWave;                                    // cached merged pool, see below
```
- `r.surgeWave` is built once when the surge starts: `{ pool: { ...s.pool, ...rangedEntriesOf(wv.pool) },
  rate: wv.rate, cap: wv.cap }`, where `rangedEntriesOf` keeps only `ENEMIES[k].ranged` entries.
  `pickType(r.surgeWave)` therefore still respects `rangedFrom`/`rangedCap`.
- Director spawns in phase `on` get `e.xp *= s.xp; e.speed *= s.speed` after `spawnEnemy` (field
  values only, no new fields).
- The final-boss rate damping (×0.6) and the endless `extra` factor stay as they are.
- The refill threshold (`alive < cap * 0.35`) uses the raised cap. That is intended: the field fills up
  faster. It is also the first balance knob, see §7.3.

### 3.4 HP bridge (`hpMul`, game.js:212)
Keep `old(m)` as the current formula. When `stage.hpBridge` is set and 1.25 < m < 4:
```
hpMul = max(old(m), old(1.25) * (old(4) / old(1.25)) ** ((m - 1.25) / 2.75))
```
Otherwise `hpMul = old(m)`. HEAT and stage multipliers are applied as before. The resulting factor over
the old curve:

| t (s) | 75 | 90 | 120 | 150 | 180 | 210 | 240+ |
|---|---|---|---|---|---|---|---|
| × old | 1.00 | 1.02 | 1.05 | 1.09 | 1.13 | 1.07 | 1.00 |

Elites inherit this through `e.maxHp`. Boss HP is unaffected.

### 3.5 Read API for UI and tools
`Game.countdownState()` returns `null` or `{ kind, phase, left, frac, icon, tint, label }`:
- `left`: seconds until `at` (warn) or until `end` (on);
- `frac`: the remaining fraction of `lead` or `dur`;
- `label`: the boss name for `kind: 'boss'`.

ui.js polls it in `updateHud`, just as it polls the boss bar. The headless bot and simtest need no DOM.

---------------------------------------------------------------------------------------------------
## 4. Per-land schedule and numbers

### 4.1 Surge per land (all: countdown 1:30, surge 2:00–2:25, payoff 2:25, elite 2:30)

| Land | dur | rate | cap | speed | pool (replaces melee) | opener at 120 s | icon | text (T-0) | hint (T-10) | hpBridge |
|---|---|---|---|---|---|---|---|---|---|---|
| Friedhof | 25 | 1.4 | 1.3 | 1 | ghoul 2, skel 3, ghost 2 | ring ghoul ×14 | ghoul | Die Ghule erheben sich! | Ghule: zäh und langsam | on |
| Aschenwald | 25 | 1.3 | 1.3 | 1 | ghost 3, skel 2, wraith 1, ghoul 1 | swarm ghost ×30 | wraith | Der Wald fängt Feuer! | Irrlichter: schnell und zäh | on |
| Eissee | 25 | 1.5 | 1.3 | 1.15 | ghost 3, skel 3, ghoul 1 | ring skel ×24 | skel | Das Eis bricht! *(existing key)* | Skelette: zäh, sie kesseln dich ein | on |
| Burgruine | 25 | 1.3 | 1.2 | 1 | skel 3, ghoul 1, slime 2 | ring skel ×20 | skel | Die Wache rückt an! *(existing key)* | Die Wache: zäh, von allen Seiten | off |
| Herz der Nacht | 20 | 1.15 | 1.1 | 1 | ghoul 2, skel 2, ghost 2 | ring ghoul ×10 | ghoul | Die Nacht greift an! | Ghule: zäh und langsam | off |

All lands: `t 120, lead 30, xp 0.7, gold 15`.

Notes on individual lands:
- **Herz der Nacht:** the surge ends at 140 s. Its cliff already starts at 2:00, so the surge mostly
  *announces* wave 3 and adds only a little. `nightheart mid` (11 %) must not become a wall.
- **Burgruine and Herz der Nacht:** keep the bridge off, because both already climb from 3:00 and 2:00.

**Load sizing check (Friedhof):**
- pool HP ≈ 27 base × hpMul(2:00, with bridge) 1.29 ≈ 35;
- rate 3.4 × 1.4 = 4.8/s, with partial refill 5–6/s;
- nDPS ≈ 107, so Last ≈ 1.6–2.0;
- the opener adds 14 ghouls × ≈ 62 HP ≈ 860 HP at once;
- window B is 2.01, so the surge reaches 0.8–1.0 × B, which is on target.

### 4.2 Wave and event changes, 2:00–3:59 (waves from 4:00 on are untouched everywhere)

| Land | Wave 3 (2:00–2:59) | Wave 4 (3:00–3:59) | Events |
|---|---|---|---|
| Friedhof | `{slime 2, skel 3, ghost 2, spitter 2, ghoul 1}`, rate 3.4 → **3.8** | `{skel 3, ghost 2, ghoul 1, bat 1, spitter 1}`, rate 3.4 → **3.8** | ring skel ×28: 150 → **170** (the elite at 150 stays alone, as the surge finale) |
| Aschenwald | `{bat 2, ghost 3, skel 2, cinder 1}` (bat 3→2, skel 1→2) | `+wraith 1`, rate 3.8 → **4.0** | unchanged. The unsorted pair at 42/50 s stays exactly as it is: both fire at 50 s, inside the protected first minute |
| Eissee | rate 3.0 → **3.3** | rate 3.0 → **3.4** | **new** `{t: 180, kind:'swarm', type:'ghost', n: 30, text:'Nebel zieht auf!'}` (fills the 85 → 210 s gap) |
| Burgruine | unchanged | unchanged | unchanged |
| Herz der Nacht | unchanged | unchanged | unchanged |

### 4.3 Light boss countdown (first boss of each land, bar only)

| Land | Boss | Bar visible | Ticks |
|---|---|---|---|
| Friedhof | Schleimkönig 180 s | 160–180 | 177, 178, 179 |
| Aschenwald | Der Schwelende 240 s | 220–240 | last 3 s |
| Eissee | Raureif 270 s | 250–270 | last 3 s |
| Burgruine | Der Burgvogt 240 s | 220–240 | last 3 s |
| Herz der Nacht | Der Nachtmahr 210 s | 190–210 | last 3 s |

The light countdown has no banner and no `warn` sound. The existing boss banner and sound at T-0 are
its finish.

### 4.4 Schedule rules (asserted in tools/simtest.js for every stage)
1. **First minute untouched:** each surge countdown starts ≥ 85 s, and the bridge starts > 75 s.
2. **Banner spacing:** surge start, surge end and the T-10 banner moment are each ≥ 2.5 s away from:
   - every event time, using the *effective* firing time for unsorted lists (Aschenwald: 50 s);
   - every boss time;
   - every elite time (30 + 60k).
3. **Order:** each surge ends ≥ 10 s before the start of the light boss countdown. The light countdown
   window contains no surge phase.
4. **No overlap with a living boss:** before the first boss no boss can be alive, and surges and light
   countdowns all lie before the first boss. Simtest checks that `surge.t + surge.dur < firstBoss.t − 20`.

Check against the data: Friedhof T-10 = 110 s (the bat swarm banner at 105 s ends at 106.9 s), surge end
145 s, elite 150 s, ring 170 s, so all rules pass. The other lands have no events between 95 s and 165 s.

---------------------------------------------------------------------------------------------------
## 5. UI

### 5.1 Markup (index.html, inside the HUD)
Insert this **after `#bossbar`, before `#pausebtn`/`#banner`**, so the sibling selectors work:
```html
<div id="surge" hidden><div id="surgehead"><canvas id="surgeicon" width="28" height="28"></canvas><span id="surgetxt"></span></div><div class="bar"><div id="surgefill"></div></div></div>
```

### 5.2 Geometry (css/style.css)
`#surge` copies `#bossbar` (css:70–72 and the portrait rule at css:347), with the same width
`min(460px, 70vw)`:

| Viewport | Bar position | Banner while the bar is shown |
|---|---|---|
| Desktop 1280×720 | top `calc(74px + safe)`, x 410–870, y 74–≈110 | add `#surge:not([hidden]) ~ #banner:not(.chapter)` to the rule at css:440 → `max(18%, 120px + safe)` |
| Landscape 844×390 | same top, x 192–652, clear of the slots (≤ 225) and counters (≥ 758) | add to css:447 → `118px + safe` (banner 118–158, hero at ≈ 195) |
| Portrait 320×568 | top `calc(146px + safe)` (the slots end at y 133), 146–182 | add to css:443 → `max(23%, 192px + safe)` |

Further layout rules:
- **Head row:** a 28 px canvas icon followed by text, centered. Font is the same as `#bossname`.
- **Fill:** `#surgefill` moves via `transform: scaleX(frac)`, `transform-origin: left`, so there is no
  layout work per frame.
- **Colors:** ember orange `#ffb46a` in warn phase, red `#ff3d5a` in on phase. The boss light countdown
  uses the boss-bar crimson.
- **Defensive rule:** if any boss is alive, `#surge` is hidden (ui.js). §4.4 makes this unreachable
  today.
- **Pause button, timer, toasts, chapter banner:** not affected (the bar is centered below the timer).

### 5.3 Content and update rule
| Phase | Text (DE) | Text (EN) | Fill |
|---|---|---|---|
| warn, first 3 s | Starke Gegner kommen! | Strong foes incoming! | drains over `lead` |
| warn | Ansturm in {0} | Surge in {0} | drains over `lead` |
| on | Ansturm! Noch {0} | Surge! {0} left | drains over `dur` |
| boss warn | {0} in {1} (boss name, time) | {0} in {1} | drains over 20 s |

- `{0}` uses `fmtTime(ceil(left))`, e.g. "0:27".
- The DOM text is written only when the whole second changes.
- **Icon:** drawn once at warn start with `Sprites.enemy(icon, 0, 0, tint)` (already prebuilt) via
  `drawImage` into `#surgeicon`. For the boss countdown it is the boss sprite at small scale, or the
  icon is hidden if the boss sprite is not yet built. Never build a sprite on demand here.
- **Animation:** pop-in on appear (scale 0.6 → 1 over 0.35 s); in the last 5 s the text pulses red.
  With `prefers-reduced-motion`, neither happens.

### 5.4 `Render.hudTop()` (render.js:451)
- Use the lowest **visible** element of `#timer`, `#bossbar` and `#surge`.
- Add `el.surge.hidden` to the cache key next to `hudBV`.

This keeps `Game.view.top` correct on phones, so shooters and casting bosses stay below the bar.

### 5.5 Offscreen chevrons and markers (render.js:1437)
Today the top clamp is `m + 40`. When the bar or the boss bar is visible and
`|ex − W/2| < barHalfWidth + 30`, clamp to `ey ≥ hudBottom + 22` instead, where `hudBottom` is the
bottom edge of the visible bar in canvas pixels. Chevrons elsewhere are unchanged.

### 5.6 Modals
- Level-up, chest, pause and revive dialogs freeze the countdown, because it follows `r.t`.
- The bar stays visible, unchanged, under the dimmed overlay. There is no extra text in the modals.
- After resume, the bar continues from where it stopped.

---------------------------------------------------------------------------------------------------
## 6. Audio (js/audio.js) and music

New effects: `warn`, `tick`, `surge`. Register each in `VOL` (:41), `GATE` (:49, `tick: 500`) and `EVENTS` (:615):

| Effect | Sampled (SAMPLED, :263) | Synth fallback (next to `alarm`, :335) | VOL |
|---|---|---|---|
| warn | `voice('summon', { rate: .7 })` | two low horn tones via `tone()`, 0.25 s each | 0.5 |
| tick | `voice('click', { rate: cents(-700), vol: .5 })` | short square blip 880 Hz, 40 ms | 0.35 |
| surge | `voice('slam')` + `voice('alarm', { delay: .05 })` | `alarm` + low noise thump | 0.7 |

The surge-end chime reuses `achievement`. The light boss countdown uses only `tick` (last 3 s).

Music: main.js:56 returns intensity **2** while `countdownState()` is a surge in phase `on`. Otherwise
the existing rule applies. No new track.

---------------------------------------------------------------------------------------------------
## 7. Heat, endless, telemetry, balance

### 7.1 Heat
- The surge multipliers are damped by k = 0.7 at heat ≥ 3 (§3.3).
- The opener `n` does not scale with heat.
- Gold scales with `HEAT.gold`.

### 7.2 Endless
- No countdowns and no surges.
- `cdList` is exhausted long before `r.length`. If a later data change adds a surge past the land
  length, it is skipped (start ≥ r.length is filtered out).

### 7.3 Balance knobs, in this order, if a gate fails
If **graveyard none** falls below 20 %:
1. surge `rate` 1.4 → 1.25 and `cap` 1.3 → 1.2;
2. refill threshold during the surge uses the base cap;
3. W4 rate 3.8 → 3.6;
4. remove `ghoul: 1` from W4;
5. set `hpBridge: false` for the Friedhof.

If **ashwood none** or **nightheart mid** falls below the floor:
1. that land's surge `rate` → 1.15;
2. then ashwood W4 rate back to 3.8.

If a rate **rises** beyond noise (something got easier):
1. surge `xp` 0.7 → 0.6;
2. then raise that land's W3/W4 rate by +0.2.

### 7.4 Telemetry
- **balancebot.js:** with `TELEM` set, add the field `cd` to each bin (fraction of time in surge `on`).
  The bot does **not** perceive the countdown (conservative: humans benefit more from the warning than
  the bot does).
- **curve.js:** print `120s ANSTURM` and `160s Countdown <boss>` in the event column.

---------------------------------------------------------------------------------------------------
## 8. i18n (all through `tr()`, all in LANG_EN, `I18N_MISSES` stays empty)

| DE | EN |
|---|---|
| Starke Gegner kommen! | Strong foes incoming! |
| Ansturm in {0} | Surge in {0} |
| Ansturm! Noch {0} | Surge! {0} left |
| {0} in {1} | {0} in {1} |
| Mach dich bereit! | Get ready! |
| Ansturm überstanden! | Surge survived! |
| Ohne Treffer! +{0} Gold | Untouched! +{0} gold |
| Die Ghule erheben sich! | The ghouls rise! |
| Der Wald fängt Feuer! | The forest catches fire! |
| Die Nacht greift an! | The night attacks! |
| Ghule: zäh und langsam | Ghouls: tough and slow |
| Irrlichter: schnell und zäh | Wisps: fast and tough |
| Skelette: zäh, sie kesseln dich ein | Skeletons: tough, they surround you |
| Die Wache: zäh, von allen Seiten | The guard: tough, from all sides |

The keys 'Das Eis bricht!', 'Die Wache rückt an!', 'Nebel zieht auf!' and '+{0} Gold' already exist;
check each and add any that is missing. Boss names already exist. The longest bar text,
"The Castellan in 0:20" or "Strong foes incoming!", must fit in 224 px at 320 px width (measured in the
layout QA).

---------------------------------------------------------------------------------------------------
## 9. Acceptance criteria

### 9.1 Intensity curve
Measure with `node tools/curve.js 12 <land>:<preset>:0` (graveyard 24 runs) for the same 8
configurations as the baseline, and compare with scratchpad m10/curve.json.

| # | Criterion | Target |
|---|---|---|
| C1 | Bins 0:00 and 0:30; median first hit | within noise (Last, TTK, Sch/min ±15 %); first hit 58–89 s (±10 s of baseline) |
| C2 | Surge bin 2:00–2:29: Last | 0.7–1.1 × baseline window B of the same config |
| C3 | Surge bin: damage/min and "nah%" | ≥ 1.5× and ≥ 1.3× the baseline 2:00 bin |
| C4 | Bins 2:30–3:59, mean TTK and Last (Friedhof, Aschenwald, Eissee) | ≥ 1.25× and ≥ 1.2× baseline; Burgruine and Herz ≥ 1.0× |
| C5 | Ramp: Last(3:30) / Last(1:30) (Friedhof, Aschenwald, Eissee) | ≥ 1.4 |
| C6 | Cliff: TTK(4:00) / TTK(3:30) | ≤ baseline ratio (smoother step) |
| C7 | Bins from 4:00 on (TTK, Last, Sch/min) | ≥ 0.9 × baseline (noise) |
| C8 | Hero level at 4:00 | ≤ baseline + 1.0 (the surge must not hand out power) |

### 9.2 Balance gate (pooled, 95 % Wilson CI, n as in the README baseline, graveyard none n ≥ 72)

| Config | Baseline | Must hold |
|---|---|---|
| graveyard none | 31 % | **≥ 20 %** (expected 22–28 %) |
| ashwood none | 11 % | ≥ 5 % |
| ashwood light | 21 % | ≥ 11 % |
| frostlake light | 22 % | ≥ 12 % |
| frostlake mid | 35 % | ≥ 25 % |
| ruins mid | 19 % | ≥ 9 % |
| ruins light | 11 % | ≥ 5 % |
| nightheart mid | 11 % | ≥ 5 % |
| nightheart max | 42 % | ≥ 32 % |
| graveyard max heat5 | 47 % | ≥ 37 % |

Additional rules:
- **No config may get easier:** a config fails if its point estimate is more than 5 pp above baseline
  **and** its CI does not overlap the baseline CI.
- **Order:** run graveyard none first, as the gate. Run batches strictly one after another (4 CPUs).
- **README:** update the balance table with the new pooled values and CIs.

### 9.3 Performance
- Extend tools/qa/perf.js with `--surge`:
  - start a graveyard run, set `r.t = 112` with the normal director active (no enemy-count hold);
  - keep the hero invulnerable with the start weapon plus `--weapons=all`;
  - measure frame times from 112 s to 150 s.
- Compare against the same scenario with `stage.surges = []` on the same build.
- Targets: p95 and p99 ≤ 1.05 × the reference, and no single frame > 2 × reference p99 at the surge
  start (120 s, the opener spawn).
- Run CPU throttle 6 at 907×510 and 844×390.
- The existing `perf.js 6 300` and `--hostile` results must not regress (±5 %).

### 9.4 Layout and readability
Use getBoundingClientRect, comparing #surge, #bossbar, #banner, #timer, #pausebtn, #counters and every
child of #slots, with 6+6 slots filled.
- **Viewports:** 320×568, 844×390, 1280×720.
- **Languages:** DE and EN.
- **States:**
  1. 90.5 s: countdown plus elite banner;
  2. 110.5 s: T-10 banner with hint;
  3. 120.3 s: surge banner;
  4. 130 s: during the surge;
  5. 145.3 s: end banner;
  6. 151 s: elite banner while the bar is hidden;
  7. 170 s: light boss countdown plus ring banner;
  8. pause during the countdown;
  9. level-up during the countdown;
  10. a chest placed directly above the hero during the countdown (chevron clamp).

Pass rules:
- No pair overlaps (> 1 px), and the bar text does not overflow.
- The banner bottom edge stays above the hero's top edge.
- Screenshots of every state go to scratchpad m10/shots for a visual check.
- tools/qa/qa.js and modals.js stay green, and `I18N_MISSES` is empty.

### 9.5 Simtest
`node tools/simtest.js` must stay green, plus:
- the schedule rules from §4.4;
- `hpMul` is identical to the old curve for t ≤ 75 s and t ≥ 240 s in every land;
- `countdownState()` phases at 89, 90, 119.9, 120, 144.9, 145 s;
- pausing for 10 s real time does not advance the countdown;
- endless mode never enters a countdown.

---------------------------------------------------------------------------------------------------
## 10. Implementation order (commit each verified step: "Ember Night M10: …")

1. Data model plus game logic (§2, §3), with simtest assertions (§9.5). No data entries yet, so
   behavior is identical; simtest stays green.
2. Surge data for all lands, plus wave/event changes and `hpBridge` (§4). Run curve.js for the Friedhof
   only as a smoke test.
3. UI (bar, CSS, hudTop, chevron clamp), audio and music (§5, §6), i18n (§8). Then layout QA (§9.4).
4. perf.js `--surge` and the perf comparison (§9.3).
5. Full curve measurement (§9.1), then the balance gate (§9.2) sequentially, turning knobs (§7.3) if
   needed. README update.
6. Builds: `node tools/build-single.js dist/itch/index.html`,
   `node tools/build-single.js dist/crazygames/index.html --crazygames`, the itch zip, and the final QA
   pass (see scratchpad finalqa/NOTES.md).

---------------------------------------------------------------------------------------------------
## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Graveyard none falls below 20 % | gate first; knob order in §7.3; surge is only 25 s |
| Surge XP makes 3:00+ easier | `xp 0.7`; checks C8 and C7 |
| Banner collisions after future data changes | simtest schedule rules (§4.4) |
| Frame spike at the opener | ghoul sprites are prebuilt (they are in the waves); stageTypes includes surges; perf `--surge` |
| Phone readability | bar in the boss-bar slot, which is already QA'd; hudTop includes the bar; chevron clamp |
| Bot cannot use the warning | accepted. The measured difficulty is an upper bound for humans |
| Heat 5 too dense | k = 0.7 damping; graveyard max heat5 floor 37 % |
| Herz der Nacht becomes a wall | weakest surge (1.15, 20 s), no bridge, floor 5 % |

---------------------------------------------------------------------------------------------------
## 12. As built (deviations from the numbers above; code a3789cc)

Measurement: `tools/curve.js 24 <config>` (all 8 configs, 24 runs each), compared against the pre-M10 curve
(m10/curve.json raw runs, plus 24 extra pre-M10 frostlake light runs) with medians of TTK/Last per bin (one run
with nDPS 3 distorted the means). Balance gate: m10/gate1 (heat 0) and m10/gate2 (heat 5), 36–72 runs each.

| Change | Spec | As built | Why |
|---|---|---|---|
| Friedhof surge `speed` | 1 | **1.1** | damage in the surge was 0.6× the old 2:00 bin (melee never arrived); now 2.1× |
| Aschenwald surge `rate` / `cap` | 1.3 / 1.3 | **1.5 / 1.4** | surge Last was 0.6× window B; now 0.7× |
| Eissee surge `rate`, pool | 1.5, ghoul 1 | **1.6, ghoul 2** | surge Last 0.65× B; light preset still 0.63× |
| Eissee W3 / W4 pool | rate only | **+ghoul 1 / ghoul 1 → 2** | TTK 2:30–3:59 was only 1.03× (bridge alone gives ≤1.13×); now 1.13× (light) / 1.37× (mid) |
| Burgruine surge `rate` / `cap` | 1.3 / 1.2 | **1.5 / 1.3** | surge Last 0.42× B; now 0.49–0.68× |
| Heat ≥ 3 | k = 0.7 on rate/cap | **plus: no hpBridge, surge `xp` 1, speed bonus ×0.7** | graveyard max heat 5 fell to 25 % (hero 2 levels behind at 3:00: at triple HP the hero is DPS-bound, so tougher pools cost XP) |
| T-10 banner | kind `event` | **`event ready`, 2.6 s, smaller font** | 844×390: two-line banner reached the hero's head |
| Bar width at max-height 400 px | min(460, 70vw) | **also ≤ 100vw − 446 px − 2·safe-left (boss bar too)** | with 6+6 slots the second slot row ends at x 215 and overlapped both bars (boss bar: pre-existing) |
| Portrait banner (no bar) | 23 % | **max(23 %, 142 px)** | elite/end banner touched the second slot row on 320×568 (pre-existing for elites) |
| Banner fade-out drift | −20 px | **−2 px** | the fading banner slid into the bar |
| Chevron clamp | bottom + 22 | **bottom + 28** | arrow tip is 24 px above the circle centre |
| Fill / pulse | scaleX per frame, colour pulse | **0.5 % steps + 0.2 s transition, pulse via transform** | the per-frame repaint cost ~20 % fps at CPU ×6 in the countdown |
| `Hooks.countdown` | UI draws the icon on warn start | **not added**: ui.js draws the icon when the bar (re)appears or its kind/phase changes | same effect, no extra hook |

Results against §9 (details: scratchpad m10/compare.md):
- C2 met for Friedhof (0.93), Aschenwald (0.70/0.72), Eissee mid (0.75); not met for Eissee light (0.63), Burgruine
  (0.49/0.68), Herz der Nacht (0.41, intended weakest surge, §4.1). C4 met for Friedhof, Aschenwald light, Eissee mid,
  Burgruine; Aschenwald none 1.10/1.15, Eissee light 1.13/1.23, Herz 0.93/0.97. C6 met everywhere except Eissee mid and
  Burgruine mid (within 0.07). C7/C8 met except Herz der Nacht TTK 0.76 (n = 12 baseline; its win rate did not rise).
- C1 cannot be resolved at this n: the first minute is code-identical, yet bins differ by up to ±30 % between run sets.
  C5 is distorted by the opener (spawned in the frame that crosses 120 s, so it lands in the 1:30 bin); cmp.js also
  prints C5 without it (1.52–1.90, all ≥ 1.4).
- Gate: all heat-0 configs within their floors and none easier; graveyard none 29 % (21/72). Heat 5: 35 % (25/72) vs
  floor 37 %; old code re-measured the same day 42 % (15/36), difference not significant (z ≈ 1.1).
- Perf (CPU ×6, `perf.js --surge` vs `--nosurge`, 112–150 s): whole-window p95/p99 equal at 907×510 (33.4/50 ms) and in
  one of two runs at 844×390 (the other 50/66.6 vs 33.4/50: the surge phase has ~35 % more enemies, 43 vs 32, which
  costs ~0.3 ms update and ~0.8 ms draw per frame); opener frame ≤ 50–83 ms vs reference max 83–100 ms. `perf.js 6 300`
  and `--hostile` unchanged (26.4/27.9 vs 25.9/27.7 fps; 21.2/19.8 vs 21.7/20.3 fps).

### 12.1 Fixes after the independent verification

| Finding | Change |
|---|---|
| Eissee mid: hero pulled ahead from 3:00 (XP from the extra 2:00–3:59 enemies is not covered by the surge `xp`) | `xp` factor on waves and events (heat < 3 only): Eissee W3/W4 `xp: 0.88`, 180 s fog swarm `xp: 0.4`. XP at 4:00 old/before/after 1934/2085/1995, level at 5:00 25.0/26.6/25.6 (24 runs each); gate mid 31/72 = 43 %, light 7/36 = 19 % |
| Telemetry booked spawns of the frame that crosses a bin edge (surge opener at 120.0 s, old rings at 150 s) into the previous bin | `tools/balancebot.js` carries them over to the next bin; README curve re-measured on old and new code (24 runs each) |
| Countdown ticks barely audible in combat | tick gain 0.35 → 1.4, pitch +3 semitones instead of −7 (peak alone 0.025 → 0.075, now above hit/kill/gem; in a live surge 0.08–0.11 vs a median 0.03–0.09 before each tick) |
| Countdown at 1:30 starts together with the elite banner | the elite banner is held until 3.2 s after the bar appears (after „Starke Gegner kommen!“); gameplay unchanged |
| Bar and boss bar reappeared after death / quit (frozen phase) | `updateHud` treats `r.over` as "no boss, no countdown" |
| Surge gold ignored greed | `gold × greed × heat gold`, as for a gold bag |
| Phase tracked twice (state machine vs. time) | `countdownState()` reads the phase from `c.ph` only; time only gives the rest |
| Peek cache keys copied | `enemyKey()` / `bossKey()` shared by `enemy()`, `bossSprite()` and the peeks |
| Banners firing under a modal were never seen | banner animation and its remaining time pause during level-up, chest and pause (`UI.tickBanner`) |
| Bar text hard to read over bright effects | faint dark pill behind `#surgehead` (static, no per-frame repaint) |

Left as is: the offscreen chest/boss marker can sit under a banner for ≤ 2.6 s while the bar is shown (between bar bottom
and banner top there are 5 px on 844×390, below the banner is the hero; before M10 such markers were hidden under the boss
bar for the whole fight). Surge strength below C2/C4 in Burgruine, Eissee light and Herz der Nacht, and the modest
contact/damage increase for the bot (it dodges melee almost perfectly), as already listed above. The surge costs some frame
rate because it has more enemies (no spikes); the countdown phase alone is within 2 %.
