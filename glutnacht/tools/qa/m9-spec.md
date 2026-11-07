# Ember Night M9: Fernkämpfer und echte Härte (final implementation spec)

Source feedback: "Es braucht mehr Fernkämpfer und es muss wirklich schwieriger werden."
The goal is more ranged enemies and a game that is really harder. Nothing gets easier.
Repo: /home/user/Games/glutnacht, branch claude/gifted-hypatia-p10tnj. Commit there and do not push.

---------------------------------------------------------------------------------------------------
## 0. Verdict on the proposals

Only one proposal reached me complete: "3 new ranged types, spitter rework, one telegraphed ranged attack
per boss, ranged in every land from 40-58 s, bot with human-like perception". The second entry of the
PROPOSALS array was cut off, and so was the tail of the first proposal's `risks` field. So the "graft"
below means grafting fixes from my own review, checked against the current code (game.js, data.js,
render.js, balancebot.js). It does not mean grafting from a second written design.

The proposal is a strong base. I keep it:
- The enemy roster fits the scope (spitter rework plus cinder pot, needle moth and knell bell, so 3 new
  types). Each type has a distinct dodge verb: sidestep an aimed orb, leave a marked circle, break a
  locked line, thread a lattice.
- `rangedFrom` per land, the `arc` event that brings early shooters into view, a volley director and a
  ranged-alive cap.
- The bot perception layer (visibility, reaction delay, estimate noise, attention) and a scripted
  dodge-test to calibrate it.
- The calibration procedure: bot-only run first, then content, then a fixed lever order.
- The nova telegraph fix, an existing fairness gap: boss nova fires instantly today (game.js `sk === 'nova'`).

I change or cut the following:
1. **Boss skill zoo: 11 skills become 5 primitives.** glob, icicle, starfall and eclipse become
   parameter variants of one `rain` primitive. cross and quake become one `lanes` primitive. `tide` is
   cut: its moving-wall preview is the riskiest item in the proposal. The Drowned King gets `lances`
   ("Dreizack", 3 aim lines) instead. Result: fan, lances, rain, spiral, lanes. This halves the code
   and bot work and loses almost no variety.
2. **Hostile colour: red, not magenta.** Mira's evolved bolt is `#ff7cf5` (pink) and the Heart of the
   Night ground is violet. A magenta hostile language would collide with both. Enemy threats keep the
   existing red family (`#ff3d5a` glow, `#fff1c4` core, already the `eshot` look). They also get a
   **2 px ink ring that no player effect has**. The ember puddle uses a dark ink base with a red rim,
   not dark violet, so it stays readable on the violet night ground.
3. **Bot perception applies to ALL enemy projectiles and telegraphs**, old ones included (spitter
   orbs, boss nova, slam circles, dash lines), not only to new threats. A bot that is omniscient for
   old shots and human for new ones produces numbers that cannot be compared. Step (a) of the
   calibration measures exactly this change. Melee perception stays unchanged.
4. **Lapse means "noticed late", not "never seen".** A human in a crowd usually sees a shot late, not
   never. Lapse adds +0.3-0.4 s to the reaction delay. Only a quarter of lapses are full misses.
5. **The bot hunts shooters a little.** Otherwise melee heroes (Aron, Sela, Eira, Lio) show
   "unreachable kiter" deaths that a human avoids by chasing shooters. There is a small goal term
   toward the nearest visible ranged enemy (section 8).
6. **Ranged elites do not retreat.** With 14x hp and a retreating AI they would be unkillable for
   melee heroes.
7. **Puddles are smaller and shorter** (cap 8, life 2.6 s, not 12 and 3.0 s). This keeps phone
   portrait (hw ~244 world px) from being paved over.
8. **Global stat levers stay in reserve.** Proposal levers 1-4 (dmg growth 0.08, fewer hearts, stage
   mult.dmg) are not switched on by default. They are rungs on a per-land ladder (section 10). The
   reason: the proposal itself expects content plus bot to put ashwood none already in band, and a
   global lever would push it below 5 %. Exception: graveyard mult.dmg goes from 0.9 to 1.0 from the
   start, because graveyard has the largest gap (75 % to 40-55 %).
9. **Event timing is moved so banners do not collide** with the existing M8 first-minute events.
   Example: graveyard has its ring at 50 s, so the spitter arc moves to 40 s.
10. **Shot caps are enforced before a wind-up starts, not by dropping shots.** A volley that would
    exceed the cap is never telegraphed. Silent skipping would make a telegraph lie. Exception: a
    boss spiral already in progress may skip arms over the hard cap.

---------------------------------------------------------------------------------------------------
## 1. Hostile visual language and fairness rules (apply to everything below)

**Palette:** add to `STYLE` in js/sprites.js:
`STYLE.hostile = { core: '#fff1c4', glow: '#ff3d5a', ink: '#120a18', rim: '#ff8a96', fillRGB: '255,61,90' }`.

**Look of every enemy threat:**
- Every enemy projectile, landing marker, lane, aim line and puddle has a 2 px `STYLE.ink` outline or
  ring. Player effects never get one.
- Every threat is drawn in render layer (3), above the light map. This is already the case for
  `eshots` and `tele` (render.js ~389 and ~598). Keep new kinds there too.
- **Orb:** a new pre-rendered sprite `spr.eorb`. Ink disc at r+2, then the glow ramp, then the core.
  Draw size is `s.r*3.2`. It replaces `spr.eshot`, which has no ink ring today.
- **Needle:** a new sprite `spr.eneedle`, 30x8 world px, rotated to its velocity. Ink outline, white
  core, red glow, and a 3-segment fading tail.
- **Coal (mortar):** a 10 px ink-ringed coal with a magenta-violet ember centre. It flies on a
  parabolic arc (height 0.35*flight distance) and casts a dark ground shadow ellipse at its true
  ground position.

**Telegraph minimums. These are fairness floors. The balancing must never shorten them.**

| Threat | Visible cue | Minimum time |
|---|---|---|
| Any enemy projectile volley | Wind-up frame on the caster plus a shape cue (wedge, ring or aim line) | 0.35 s; actual values are 0.45-0.9 s |
| Circle and lane area hits | Marker fully visible | 0.6 s; actual values are 0.75-1.6 s |
| Boss nova (fix) | Charge ring with spawn dots | 0.6 s |
| Puddle | Exists only where a marker stood for at least 1.0 s | Visible from impact |

**No offscreen damage:**
- A caster may START a wind-up only while it is inside the view rect inset by 24 px. Bosses use an
  inset of 30 px and also need d > 140.
- Area markers (rain, mortar) are clamped so that their centre lies inside the view inset by 20 px.
- **Edge warning:** pick each off-screen enemy projectile whose predicted closest approach to the
  player within the next 1.2 s is under 60 px. Also pick each caster that winds up while outside the
  view (possible if the player moves away during the wind-up). For each, draw a hostile chevron at the
  screen edge in its direction. The chevron is 16 css px, with ink outline, pulsing alpha 0.6-1.0.
  At most 6 chevrons. Implement in render.js layer (3) after HUD-independent world drawing,
  in screen space.

**Wind-up behaviour:**
- Wind-up timers tick with `dt * e.slowF`. Slow makes them longer, never shorter.
- `freezeT > 0` cancels a running wind-up. The enemy gets `shootT = 1.0`.
- Knockback does not cancel a wind-up. The aim locks at the lock time.

**Sound:** new gated aliases in js/audio.js. They map to existing samples at lower gain and add GATE
entries:

| Alias | Source sample | Gain | Gate |
|---|---|---|---|
| `ewind` | 'zap', detune -300 c | 0.30 | 90 ms |
| `efire` | 'throw' | 0.40 | 80 ms |
| `eimpact` | 'slam' | 0.45 | 120 ms |

Pan by x as `Hooks.sfx(name, 0, x)` already does. If `voice()` has no gain option, add one (default 1).

---------------------------------------------------------------------------------------------------
## 2. Engine framework (js/game.js)

### 2.1 New run fields
Add to newRun:
- `haz: []` holds puddles. Entries look like `{kind:'ember'|'slow', x, y, rad, t, life, dmg}`.
- `vol: { active: 0, lastStart: -9, bells: 0 }` is the volley director.
- `rangedAlive` is counted each frame in updateEnemies.

### 2.2 Caps

| Constant | Value | Meaning |
|---|---|---|
| `ESHOT_CAP` | 120 | Shot cap for normal enemies |
| `ESHOT_CAP_BOSS` | 160 | Shot cap for bosses |
| `TELE_CAP` | 32 | Telegraph cap |
| `HAZ_CAP` | 8 | Puddle cap; when full, the oldest puddle gets `life = t + 0.3`, so it fades instead of popping |

- A normal enemy may start a wind-up only if `eshots.length + volleySize <= ESHOT_CAP` and
  `tele.length < TELE_CAP`. If the check fails, retry after 0.3 s.
- A boss skill whose full volley does not fit under `ESHOT_CAP_BOSS` is replaced by `dash`.
  Exception: spiral may skip single shots above 160 while it runs. These shots never had their own
  telegraph.

### 2.3 Volley director (`canWind(e)`)

| Minute | Max concurrent wind-ups | Min gap between wind-up starts |
|---|---|---|
| 0-1 | 3 | 0.30 s |
| 2-5 | 5 | 0.20 s |
| 6+ | 7 | 0.14 s |

- At heat >= 3, add +1 to the max concurrent wind-ups.
- Bells: at most 2 winding up at the same time.
- Bosses are exempt but count toward `active`.
- A blocked enemy sets `shootT = 0.3` and retries.

### 2.4 Ranged-alive cap
`rangedCap = round(min(4 + 1.5*minute, 20) * heat.rate)`. If the director (normal spawning) picks a
ranged key while `rangedAlive >= rangedCap`, it rerolls once from the melee keys of the wave. Events
and elites ignore the cap but count toward it.

### 2.5 Ranged cooldown and speed scaling
- `cdMul = max(0.75, 1 - 0.025*minute) * (1 - 0.04*heat)`. It applies to every ranged cooldown
  roll, not to wind-ups or telegraphs.
- Projectile speed is `base * HEAT[heat].speed`, capped: orbs/bell/fan at 210, needle at 520,
  boss lances at 560.

### 2.6 `rangedFrom` (per land, seconds)

| Land | rangedFrom |
|---|---|
| graveyard | 40 |
| ashwood | 58 |
| frostlake | 45 |
| ruins | 40 |
| nightheart | 40 |

Before `rangedFrom`, weightedPick in director() and openingGroup() filters out `ENEMIES[k].ranged`
keys. openingGroup always filters them out. The first elite stays the fastest melee type
(existing rule).

### 2.7 Event kind `arc`
`{ t, kind:'arc', type|mix, n, text }`. `mix` is `{type:count}` and also becomes allowed on `ring`.
- n enemies spawn **on screen**. Each one spawns at distance `0.8*edgeDist(angle)`, spread over a
  120° arc centred on the player's movement direction. If the player stands still, the centre is a
  random angle.
- Spawn FX: a 0.4 s ember-ink puff (`burst`, ink plus red) and a fade-in alpha.
- Each spawned enemy gets `shootT = rand(1.6, 2.4)`, so it never fires in the first 1.6 s.

`edgeDist(angle)` is the distance from the player to the view-rect border along that angle:
`min(hw/|cos|, hh/|sin|)`.

### 2.8 Generic ranged AI (replaces the `if (e.ranged)` block, ~game.js:374)
Each type has `ranged: 'spit'|'mortar'|'needle'|'ring'` and data fields
`band: [min, max]`, `cd: [a, b]`, `wind`, `retreat` (speed factor) and `strafe`.

**Preferred distance:** `D = min(band[1]-30, kEdge*edgeDist(angle from player to enemy))`, with
kEdge 0.8 (spit, mortar, ring) or 0.85 (needle). The game uses `Game.view.hw/hh`, so on a portrait
phone shooters stay inside the screen.

**Movement:**
- Below D-40: retreat at `retreat*speed`. Bells have retreat 0, and elites always have retreat 0.
- Above D+40: approach at full speed.
- In between: strafe at `strafe*speed`.
- Moths add a flit: every 1.2 s, a 0.25 s tangential burst at 1.4x speed with a random side.

**Firing:** count down `shootT`. When it reaches 0, d < band[1]+120, the enemy is in view (inset 24)
and `canWind()` passes, the enemy enters `e.windT = wind` and runs its type's wind-up. When `windT`
reaches 0, it releases the attack and gets `shootT = rand(cd)*cdMul`.

**Render:** while `windT > 0`, drawEnemy uses `frame = 2`. Sprites.enemy caches frame 2 like the
other frames.

### 2.9 hurtPlayer source tag
- Change the signature to `hurtPlayer(dmg, src)`. The game only stores `r.lastHitSrc = src`. Game
  rules are unchanged.
- Sources: 'contact', 'shot' (orb), 'needle', 'mortar', 'puddle', 'ring', 'bossShot', 'area'
  (boss circles), 'lane'.
- This replaces the fragile string patching in balancebot.js lines 21-24 for every new path. Update
  those `rep()` calls to the new call strings.

### 2.10 Puddle update (updateFx)
- Each puddle ages.
- **Ember puddle:** if the player overlaps it (`rad + p.r - 4`), call `hurtPlayer(dmg, 'puddle')`.
  The existing 0.5 s iframe caps the damage rate.
- **Slow puddle:** if the player overlaps it, set `p.slowT = 0.15`, so the player has
  `stats.speed*0.55` inside. Add `p.slowT` to the movement code (game.js ~158). Slow puddles do no
  damage.

---------------------------------------------------------------------------------------------------
## 3. Ranged enemies (js/data.js ENEMIES)

German names are the data keys. English names go in LANG_EN.

### 3.1 Spucker / Spitter (rework). Role: teaches the aimed sidestep.
`spitter: { name:'Spucker', hp:28, speed:62, dmg:9, xp:3, r:14, kb:0.8, ranged:'spit', band:[190,260], cd:[3.0,3.8], wind:0.45, retreat:0.6, strafe:0.35 }`

**Wind-up (0.45 s):**
- Frame 2: the body is 1.12x, the mouth is wide open with a `#b6ff4f` glow.
- A hostile wedge outline points at the player: 90 px long, ink-edged, alpha 0.35. It is a fan
  outline when the release is a fan.
- The direction tracks the player until 0.15 s before release, then locks. `ewind` plays at the
  start.

**Release:** `efire`.
- Before 4:00, it fires 1 orb: speed 170, r 7, dmg 1.0*e.dmg, life 3.5 s.
- From 4:00, it fires a 3-orb fan, 16° apart, 0.8*e.dmg each.
- An elite spitter fires a 5-orb fan, 14° apart.

**Art:** keep the M6 sprite. Add only frame 2: swollen body, wide mouth, bright glow, and two small
spark dots.

### 3.2 Aschenkessel / Ash Cauldron (new). Role: mortar area denial.
`cinder: { name:'Aschenkessel', hp:40, speed:44, dmg:10, xp:4, r:15, kb:0.6, ranged:'mortar', band:[260,340], cd:[4.6,5.6], wind:0.55, retreat:0.6, strafe:0 }`

**Targeting:** `T = player + playerVel * 0.6 * flight`, plus a scatter of rand(0,30) px. T is
clamped into the view inset by 20 px.

**Wind-up (0.55 s):**
- Frame 2: the rim tilts up, the coals flare and sparks rise. `ewind` plays.

**Launch:**
- `efire` plays.
- A tele `circle` is created at T with `rad 40`, `life 1.1` (the flight time), `dmg 1.1*e.dmg`,
  `src 'mortar'` and `onImpact 'ember'`.
- A coal visibly flies from the cauldron to T over the same 1.1 s.
- The marker is drawn as: hostile fill at alpha 0.18, an inner fill that grows to the full radius,
  a 3 px `rim` colour stroke, then a 2 px ink outer ring.

**Impact:**
- Damage to the player if they overlap (`rad + p.r`). `eimpact` plays, with shake 3.
- An ember puddle spawns: `rad 32`, `life 2.6 s`, `dmg 0.45*e.dmg`.
- Puddle look: ink base at alpha 0.5, a 3 px hostile-red rim with an ink outer ring, and 3-5
  flickering pink-white cold flames. It is clearly unlike Ignis' orange fire pool, which has no ink
  and an orange centre.

**Elite:** 3 shells in a triangle with 70 px spacing, centred on T. All three markers are visible
at once.

**Art (style B):**
- Body: a squat iron cauldron (`R_.iron` sphere ramp, light from top left, rim highlight) with a
  jagged notched rim and a band of rivets.
- Legs: three thin charred stilt legs (`R_.wood` dark).
- Two small yellow glow eyes (`STYLE.eye.yellow`) peek over the rim.
- Inside: magenta-violet cold coals with a soft glow.
- Frames 0/1: alternating leg pairs. Frame 2: the charge pose described above.
- Silhouette: a wide flat top on stilts. No other enemy has it.
- `ENEMY_COLORS.cinder = '#c04cff'`.

### 3.3 Nadelmotte / Needle Moth (new). Role: line sniper. Dodge by changing direction at the lock.
`moth: { name:'Nadelmotte', hp:22, speed:96, dmg:12, xp:3, r:13, kb:1.2, ranged:'needle', band:[280,380], cd:[3.8,4.6], wind:0.9, retreat:0.6, strafe:0.3 }`

**Wind-up (0.9 s):**
- The moth stops moving.
- 0.0-0.6 s: an aim line tracks `player + vel*0.5*travelTime` (50 % lead). It is drawn 2 px, dashed,
  hostile glow at alpha 0.35, 700 px long, with an ink under-stroke.
- 0.6-0.9 s: the line is locked, solid, 3 px, alpha 0.8, with a 2 px ink edge. A quiet `ewind` tick
  plays at the lock.
- Implement it as a tele `aim` attached to the moth (`follow: e`).

**Release:**
- One needle: speed 460 (heat-scaled, cap 520), hit radius 6, dmg 1.0*e.dmg, life 1.6 s.
- It passes through enemies (enemy shots never collide with enemies anyway).
- A player standing still is hit. A player who turns at the lock is safe. A player who keeps the same
  heading is hit about half the time, because of the 50 % lead.

**Elite:** 3 needles at ±10°, each with its own line.

**Art (style B):**
- Wings: broad rounded forewings in `R_.bone` (pale ash/cream) with gold-dust speckles and two large
  eyespots (ink ring, red-pink pupil `STYLE.eye.red`).
- Body: a fuzzy dark thorax (`R_.wood` dark) with feathered antennae and a long thin proboscis that
  points forward.
- Frames 0/1: wing beat (wings up/down). Frame 2: wings fully spread, eyespots glowing.
- It is distinct from the bat: the bat is violet, has a jagged membrane and ears, and a dark
  silhouette. The moth is pale and round-winged.
- Tints: frostlake gets an ice tint `#eef6ff`. Other lands stay untinted. Do not add the moth to the
  nightheart tints: pale-on-violet is the readable choice.
- `ENEMY_COLORS.moth = '#e8d8b0'`.

### 3.4 Totenglocke / Knell Bell (new). Role: crossfire lattice and tank shooter.
`bell: { name:'Totenglocke', hp:80, speed:34, dmg:11, xp:6, r:17, kb:0.4, ranged:'ring', band:[220,320], cd:[5.0,6.0], wind:0.7, retreat:0, strafe:0.2 }`

**Wind-up (0.7 s):**
- Frame 2: the bell swings to 15°.
- A tele `charge` ring appears around the bell at r+18. It shows 10 bright dots exactly where the
  orbs will spawn, and an ink ring that fills clockwise over 0.7 s. `ewind` plays.
- At most 2 bells may wind up at the same time.

**Release:** `efire`.
- 2 rings, 0.3 s apart. Each ring has 10 orbs: speed 110, r 8, dmg 0.7*e.dmg, life 4.0 s.
- Ring B is rotated by half a step (18°), so the result is a moving lattice. At 250 px the gaps are
  about 78 px, wide enough to walk through.

**Elite:** 3 rings of 12 orbs. The second ring's dot preview is shown during the charge too: two dot
rings.

**Art (style B):**
- Body: a floating cracked bronze bell (`R_.gold` dark ramp plus `R_.orange` shade, light from top
  left, one glint) with a frayed rope and chain stub on top.
- A grinning skull clapper (`R_.bone`) hangs below the rim. Cyan-green glow (`STYLE.eye.green`) runs
  along the cracks.
- A soft contact shadow sits 6 px below, so the bell reads as floating.
- Frames 0/1: ±4° sway. Frame 2: tilted 15° with a glow ring.
- `ENEMY_COLORS.bell = '#d0a040'`.

All three new sprites go into `drawEnemyBody`, `BASE_R` (if needed) and `CROWN_AT` (crown anchor for
safety). Show frames 0/1/2 in the contact sheet tools/qa/contact.js.

### 3.5 Ranged elites
- From minute 3, every second elite is drawn from the wave's ranged keys, if the wave has any. The
  hp formula is unchanged.
- Ranged elites have `retreat = 0` and keep their band by approaching only.
- They use the elite patterns above: 5-fan, triple mortar, triple needle, 3x12 rings.
- They obey the volley director.

---------------------------------------------------------------------------------------------------
## 4. Wave pools (all 5 lands)

Rules for the tables below:
- Existing weights are kept. Ranged keys are added. Rates and caps are unchanged.
- Ranged keys in w0 only spawn after `rangedFrom`.
- "%" is the ranged share of the pool weight.
- Existing events stay as they are. New events are marked **NEW**, changed events **CHG**.
- Check the alive share in m3-m10 with the bot metric. Target: 20-35 % in graveyard, ashwood,
  frostlake and nightheart, and 35-45 % in ruins.

### GRAVEYARD (signature: spitter, bell from minute 4)
`mult: { hp:0.95, dmg:1.0, rate:1 }` (dmg was 0.9)

| Wave | Pool | Ranged |
|---|---|---|
| w0 | {bat:2, slime:3, spitter:1} | 17 % |
| w1 | {bat:3, slime:2, skel:2, spitter:2} | 22 % |
| w2 | {slime:2, skel:3, ghost:2, spitter:2} | 22 % |
| w3 | {skel:3, ghost:2, bat:2, spitter:2} | 22 % |
| w4 | {ghost:2, ghoul:2, skel:2, spitter:2, bell:1} | 33 % |
| w5 | {ghoul:3, spitter:2, bat:3, bell:1} | 33 % |
| w6 | {ghoul:2, wraith:1, skel:3, spitter:2, bell:1} | 33 % |
| w7 | {wraith:2, ghoul:2, brute:1, spitter:1, bell:1} | 29 % |
| w8 | {brute:1, ghost:3, wraith:2, spitter:2, bell:1} | 33 % |
| w9 | {brute:2, ghoul:3, wraith:2, bell:2} | 22 % |

Events:
- **NEW** {t:40, arc, type:'spitter', n:2, 'Spucker in Stellung!'}
- **NEW** {t:85, arc, type:'spitter', n:4, 'Spucker in Stellung!'}
- **NEW** {t:270, arc, type:'bell', n:4, 'Die Glocken läuten!'}

### ASHWOOD (signature: ash cauldron from 58 s, moth from minute 3)
mult unchanged.

| Wave | Pool | Ranged |
|---|---|---|
| w0 | {bat:4, slime:1, cinder:1} | 17 % |
| w1 | {bat:3, ghost:2, slime:1, cinder:2} | 25 % |
| w2 | {bat:3, ghost:3, skel:1, cinder:2} | 22 % |
| w3 | {ghost:3, skel:2, bat:3, cinder:2, moth:1} | 27 % |
| w4 | {ghost:3, wraith:1, bat:3, skel:1, cinder:2, moth:1} | 27 % |
| w5 | {wraith:2, ghost:3, ghoul:1, bat:2, cinder:2, moth:2} | 33 % |
| w6 | {wraith:2, ghoul:2, bat:4, cinder:2, moth:2} | 33 % |
| w7 | {wraith:3, ghost:3, brute:1, cinder:2, moth:1} | 30 % |
| w8 | {wraith:3, bat:4, ghoul:2, spitter:1, moth:2, cinder:1} | 31 % |
| w9 | {wraith:4, ghost:2, brute:1, ghoul:2, cinder:2, moth:1} | 25 % |
| w10 | {wraith:4, bat:4, brute:2, moth:2, cinder:2} | 29 % |
| w11 | {wraith:4, ghost:3, ghoul:2, brute:1, spitter:1, cinder:2, moth:1} | 29 % |
| w12 | {wraith:5, brute:2, bat:3, golem:1, cinder:2, moth:2} | 27 % |
| w13 | {wraith:5, ghost:3, brute:2, golem:1, cinder:2, moth:2} | 27 % |
| w14 | {wraith:6, bat:4, brute:3, golem:1, cinder:3, moth:2} | 26 % |

Events:
- **NEW** {t:58, arc, type:'cinder', n:2, 'Die Aschenkessel brodeln!'}
- **NEW** {t:95, arc, type:'cinder', n:3, same text}
- **NEW** {t:210, arc, type:'moth', n:5, 'Nadelmotten schwärmen aus!'}

### FROSTLAKE (signature: moth from 45 s, ice tint; bell from minute 5)
- `mods: { all:{hp:1.4, speed:0.85, xp:1.3}, moth:{hp:0.75}, bell:{hp:0.8} }`
- `tints.moth = '#eef6ff'`, `tints.bell = '#dff3ff'`
- mult unchanged.

| Wave | Pool | Ranged |
|---|---|---|
| w0 | {slime:3, ghost:2, moth:1} | 17 % |
| w1 | {slime:3, ghost:2, skel:1, moth:2} | 25 % |
| w2 | {ghost:3, skel:2, slime:2, moth:2} | 22 % |
| w3 | {ghost:3, ghoul:1, skel:2, moth:2, spitter:1} | 33 % |
| w4 | {ghoul:2, ghost:3, wraith:1, moth:2, spitter:1} | 33 % |
| w5 | {ghoul:3, wraith:1, skel:2, spitter:1, moth:1, bell:1} | 33 % |
| w6 | {wraith:2, ghoul:3, brute:1, moth:2, bell:1} | 33 % |
| w7 | {wraith:2, ghost:3, brute:1, ghoul:2, bell:1, moth:2} | 27 % |
| w8 | {brute:2, wraith:2, ghoul:2, spitter:1, bell:1, moth:1} | 33 % |
| w9 | {brute:2, wraith:3, ghost:2, golem:1, bell:1, moth:2} | 27 % |
| w10 | {brute:3, wraith:3, ghoul:2, golem:1, bell:2, moth:2} | 31 % |
| w11 | {golem:1, brute:2, wraith:4, ghost:2, moth:2, bell:1} | 25 % |
| w12 | {golem:2, brute:3, wraith:3, spitter:1, bell:2, moth:1} | 33 % |
| w13 | {golem:2, brute:3, wraith:4, ghoul:2, moth:2, bell:2} | 27 % |
| w14 | {golem:3, brute:3, wraith:5, ghost:2, moth:2, bell:2} | 24 % |

Events:
- **NEW** {t:45, arc, type:'moth', n:2, 'Nadelmotten schwärmen aus!'}
- **NEW** {t:85, arc, type:'moth', n:4, same text}
- **NEW** {t:400, arc, type:'bell', n:3, 'Die Glocken läuten!'}

### RUINS (the ranged land; spitter is the main shooter, plus cauldron and moth)
`mods.spitter.hp 1.2` stays. mult unchanged.

| Wave | Pool | Ranged |
|---|---|---|
| w0 | {skel:3, slime:2, spitter:1} | 17 % |
| w1 | {skel:3, spitter:2, bat:2} | 29 % |
| w2 | {skel:3, spitter:2, slime:2, cinder:1} | 37 % |
| w3 | {skel:3, spitter:2, ghoul:2, cinder:1} | 37 % |
| w4 | {spitter:2, ghoul:2, brute:1, skel:3, cinder:1} | 33 % |
| w5 | {spitter:2, brute:1, skel:3, bat:2, cinder:1, moth:1} | 40 % |
| w6 | {spitter:2, ghoul:3, golem:1, skel:2, cinder:1, moth:1} | 40 % |
| w7 | {spitter:2, brute:2, skel:4, cinder:1, moth:1} | 40 % |
| w8 | {golem:1, spitter:2, ghoul:3, wraith:1, cinder:1, moth:1} | 44 % |
| w9 | {golem:1, brute:2, spitter:2, skel:3, cinder:1, moth:1} | 40 % |
| w10 | {golem:2, spitter:2, wraith:2, skel:2, cinder:1, moth:1} | 40 % |
| w11 | {golem:2, brute:2, spitter:2, ghoul:3, cinder:2, moth:1} | 42 % |
| w12 | {golem:2, brute:3, spitter:2, wraith:2, cinder:1, moth:1} | 36 % |
| w13 | {golem:3, brute:2, spitter:3, wraith:3, cinder:1, moth:1} | 38 % |
| w14 | {golem:3, brute:3, spitter:3, wraith:3, skel:2, cinder:1, moth:1} | 31 % |

Events:
- **NEW** {t:40, arc, type:'spitter', n:3, 'Spucker auf der Mauer!'}
- **NEW** {t:80, arc, type:'spitter', n:5, same text}
- **CHG** t:300 'Kreuzfeuer!' becomes a ring with mix {spitter:12, moth:6}
- **CHG** t:600 'Kreuzfeuer!' becomes a ring with mix {spitter:16, cinder:6, moth:6}
- Ring radius for mixed rings: each enemy spawns at `0.95*edgeDist(a)`, so it is just inside the
  screen. Firing stays gated by the view and the volley director.

### NIGHTHEART (all four shooters)
`mult: { hp:1.1, dmg:1.0, rate:1.05 }` (unchanged; dmg 1.05 is ladder rung 3)

| Wave | Pool | Ranged |
|---|---|---|
| w0 | {bat:3, ghost:2, skel:1, moth:1} | 14 % |
| w1 | {ghost:3, skel:2, bat:2, moth:1, spitter:1} | 22 % |
| w2 | {skel:3, ghost:2, ghoul:1, spitter:1, moth:1} | 25 % |
| w3 | {ghoul:2, wraith:1, skel:2, bat:3, bell:1, moth:1, spitter:1} | 27 % |
| w4 | {wraith:2, ghoul:2, spitter:1, ghost:2, bell:1, moth:1} | 33 % |
| w5 | {wraith:2, brute:1, ghoul:2, bat:3, cinder:1, moth:1, bell:1} | 27 % |
| w6 | {wraith:3, brute:1, spitter:1, skel:3, cinder:1, bell:1} | 30 % |
| w7 | {wraith:3, ghoul:3, brute:2, moth:2, cinder:1} | 27 % |
| w8 | {golem:1, wraith:3, ghost:3, spitter:1, bell:1, moth:1} | 30 % |
| w9 | {golem:1, brute:2, wraith:3, ghoul:3, cinder:1, moth:1, bell:1} | 25 % |
| w10 | {golem:1, brute:2, wraith:4, spitter:2, cinder:1, moth:1} | 36 % |
| w11 | {golem:2, brute:2, wraith:4, bat:4, bell:2, moth:1} | 20 % |
| w12 | {golem:2, brute:3, wraith:4, ghoul:2, spitter:1, cinder:1, moth:1, bell:1} | 27 % |
| w13 | {golem:2, brute:3, wraith:5, ghost:3, moth:2, cinder:1, bell:1} | 24 % |
| w14 | {golem:3, brute:3, wraith:5, spitter:2, bat:3, moth:2, bell:1} | 26 % |

Events:
- **NEW** {t:40, arc, type:'moth', n:2, 'Nadelmotten schwärmen aus!'}
- **NEW** {t:85, arc, mix:{moth:3, spitter:2}, 'Die Nacht zielt auf dich!'}
- **CHG** t:375 'Kreuzfeuer!' becomes a ring with mix {spitter:10, moth:8, bell:6} at 0.95*edgeDist.

**README:** in glutnacht/README.md, add the shooters per land to the land table.

---------------------------------------------------------------------------------------------------
## 5. Boss ranged attacks (5 primitives plus the nova fix)

### 5.1 Framework (bossAI)
- Add mode `'cast'` next to chase, windup and dash. `e.cast = { k, t, wind, dur, p }`, where `p` is
  the parameter object from `def.cast[k]`.
- During `cast` the boss moves at 0.3x speed. For `spiral` it stands still.
- A ranged skill starts only if the boss is inside the view inset by 30 and d > 140, and the caps
  allow it. Otherwise it is replaced by `dash`. Bosses never shoot from offscreen.
- `skillT` stays at 3.6 s (2.6 s for finals), counted from the end of the cast.
- Boss defs keep `skills: [string]` and gain `cast: { fan:{…}, rain:{…}, … }`.
- Damage is a multiple of the boss's `e.dmg`. Heat, stage mult and endless scaling are already in
  `e.dmg`.

### 5.2 New `tele` kinds (drawn in the hostile palette with ink rings)
All tele kinds count toward `TELE_CAP`.

| Kind | Fields / behaviour | Damage |
|---|---|---|
| `circle` (exists) | Add `src`, `onImpact: 'ember'\|'slow'`, `track: {spd, until}` | Yes |
| `aim` | `{x, y, a, len, follow, lockAt}` | None |
| `charge` | Ring with spawn dots or a wedge around the caster | None |
| `lane` | `{x, y, a, len, w, life, dmg}`. Fill alpha 0.14 grows to 0.35. Ink edges are always drawn. At expiry: instant hit if the player's perpendicular distance is < w/2 + p.r, then a burst FX along the lane | Yes |

### 5.3 Primitives

| Primitive | Wind-up / telegraph | Release | Damage (x boss dmg) |
|---|---|---|---|
| **nova (fix)** | 0.6 s `charge`: the boss pulses, and a ring of dots marks the n spawn angles. The offset is fixed at charge start | Existing n orbs (16, or 22 for finals), speed 165, r 9 | 0.6 |
| **fan** | 0.6 s `charge` wedge, cone outline 140 px, aim locks 0.15 s before release | n orbs over `spread`, speed `spd`, r 8 | 0.6 |
| **lances** | 0.85 s: 3 `aim` lines 22° apart, tracking for 0.5 s (50 % lead), then locked for 0.35 s | 3 bolts, speed 520 (heat cap 560), r 9, life 1.6 | 0.8 |
| **rain** | Circle markers, each with `life`; see the variants below | Impact per marker | Per variant |
| **spiral** | 0.6 s `charge` ring with A dot arms | 2.4 s: one shot per arm every 0.14 s, rotating 120°/s, speed 135, r 8; the boss stands still | 0.5 |
| **lanes** | Lane markers, life 1.0-1.1 s | Instant along the lane at expiry | 1.0-1.1 |

**rain variants:**

| Variant | k | rad | life | Stagger | Placement | Damage | Extra |
|---|---|---|---|---|---|---|---|
| `scatter` | 5-7 | 46-60 | 1.0 | 0.15 s | First marker on the player, the rest 90-240 px around | 1.0 | |
| `flank` (glob) | 3 | 48 | 1.0 | 0 | One on the player, two ±70 px perpendicular to the player's motion | 0.8 | `onImpact 'slow'` (3.0 s, x0.55, no damage) |
| `walk` (icicle) | 7 | 36 | marker i lasts 0.75+0.12*i | | Along the boss->player line, from 120 px, 70 px apart | 0.9 | |
| `stars` (starfall) | 9 | 32 | 0.8 each | Spawned every 0.2 s | Within 260 px; half at the predicted position (vel*0.8 s) | 0.7 | |
| `track` (eclipse) | 1 | 80 | 1.6 total | | Follows the player at 85 % of player speed for 0.9 s, then locks for 0.7 s (the rim turns solid and bright) | 1.4 | The locked part is >= 0.6 s |

All marker centres are clamped into the view inset by 20.

**lanes patterns:**
- `x`: 2 lanes crossing at the player position with a random rotation, w 44, len 1000, life 1.1,
  dmg 1.0.
- `fan3`: 3 lanes from the boss at -30°/0/+30° toward the player, w 50, len 800, life 1.0, dmg 1.1.

### 5.4 Assignment (one new ranged attack per boss, two for finals)
Names are for documentation and the README. There is no banner for attacks, which keeps the scope down.

| Land | Boss | Skills | New attack(s) |
|---|---|---|---|
| graveyard | Schleimkönig | ['dash','glob','dash','glob'] | glob (rain flank) "Schleimklumpen / Slime globs" |
| graveyard | Knochenfürst | ['summon','fan','dash','fan'] | fan 7 shots / 60° / 190 "Knochensplitter / Bone shards" |
| graveyard | Blutgraf (final) | ['nova','dash','fan','summon','lances','dash'] | fan 9 / 80° / 200, and lances "Blutlanzen / Blood lances" |
| ashwood | Der Schwelende | ['dash','rain','dash','summon','rain'] | rain scatter k5, rad 46 "Ascheregen / Ash rain" |
| ashwood | Lauffeuer | ['dash','spiral','dash','nova'] | spiral A=2 "Feuerwirbel / Fire whirl" |
| ashwood | Kohlenherz (final) | ['slam','rain','dash','summon','lanes','nova'] | rain scatter k7, rad 54, and lanes x "Glutrisse / Ember rifts" |
| frostlake | Raureif | ['slam','icicle','dash','icicle'] | rain walk "Eiszapfen / Icicles" |
| frostlake | Die Weiße Frau | ['nova','summon','fan','dash','nova'] | fan 9 / 70° / 150 "Frostfächer / Frost fan" |
| frostlake | Der Ertrunkene König (final) | ['summon','lances','slam','nova','icicle','dash'] | lances "Dreizack / Trident" and rain walk |
| ruins | Der Burgvogt | ['summon','lances','dash','lances'] | lances "Armbrustbolzen / Crossbow bolts" |
| ruins | Die Turmhexe | ['nova','spiral','dash','nova'] | spiral A=3 "Hexenspirale / Witch spiral" |
| ruins | Steinkoloss (final) | ['slam','rain','summon','lanes','nova'] | rain scatter k5, rad 60 "Felsbrocken / Boulders", and lanes fan3 "Erdspalten / Fissures" |
| nightheart | Der Nachtmahr | ['dash','fan','dash','nova'] | fan 5 / 40° / 220 "Albtraumdornen / Nightmare thorns" |
| nightheart | Mondfresser | ['slam','eclipse','summon','eclipse'] | rain track "Finsternis / Eclipse" |
| nightheart | Der Sternlose | ['summon','starfall','nova','dash'] | rain stars "Sternensturz / Starfall" |
| nightheart | Die Nacht (final) | ['dash','spiral','slam','lanes','summon','nova'] | spiral A=3 and lanes x (nach der Prüfung: A=4, 450 000 LP, Schaden 75) |

Endless mode picks from the non-final bosses, so it inherits these skills automatically.

---------------------------------------------------------------------------------------------------
## 6. Global difficulty: start values

Content and bot perception are the main lever. Contact damage of melee enemies stays as it is.

Initial state for the first measurement (step b), switched ON:
1. All content in sections 2-5. This includes ranged elites from minute 3 and cd/speed scaling by
   minute and heat.
2. graveyard mult.dmg 0.9 -> 1.0.

Kept as fairness floors (never touched by tuning):
- Player iframe 0.5 s.
- All telegraph durations.
- Volley director limits.
- Caps.
- Heart heal 30 and chest heal 40.

The reserve ladder is in section 10.

---------------------------------------------------------------------------------------------------
## 7. Performance

Requirements:
- perf.js with `2 300` must stay >= ~45 fps.
- Add a scenario to perf (or a scratch copy) that forces 120 enemy shots, 8 puddles and 10 tele
  objects, and check it too.

Rules:
- Hostile sprites are pre-rendered once (orb, needle, coal, puddle base). No per-frame gradients.
- Lights for enemy shots (render.js ~763 draws one light per eshot today): light at most 40 eshots,
  the nearest to the camera centre first, or every eshot when there are <= 40. Lower quality levels
  skip eshot lights entirely.
- Aim lines and lanes are plain strokes. The dashed aim line uses `setLineDash` once per frame batch,
  not per line.
- Edge chevrons: max 6, computed with one pass over eshots.

---------------------------------------------------------------------------------------------------
## 8. Balance bot: human-like perception (tools/balancebot.js)

The bot is omniscient for shots today. It reads exact velocities, has zero delay, scans 460 px,
uses a 700 px centroid against a 640x360 half-view, and evaluates every shot. The new perception
layer covers **all** eshots, tele objects, haz puddles and ranged wind-ups (old and new). Melee
perception, the 20 Hz decision rate and the build choices stay unchanged and are documented as known
omniscience.

1. **Visibility.** A threat exists for the bot only after its first frame inside the view rect
   (`Game.view.hw/hh`). The sim default is 640x360. `VIEW=phone` sets 244x527 for portrait tests.
2. **Reaction delay.** Per object, kept in a host-side WeakMap: `react = U(0.20, 0.30) s` from the
   first visible frame. Before that, the bot ignores the object.
3. **Lapse.**
   - With `pLate = min(0.25, 0.03 + 0.004 * enemiesOnScreen)`, the reaction is late: +U(0.30, 0.40) s.
   - With `pLate/4` the threat is missed entirely.
   - Both are rolled once per object.
4. **Imperfect estimate (fixed per object):**
   - projectile heading: N(0, 4°), clipped to ±8°
   - speed: x U(0.92, 1.08)
   - circle and marker centres: ±U(0, 8) px
   - lane and aim angles: ±2°
   - remaining life of markers: ±0.05 s
5. **Attention.** Per decision, only the 10 most imminent projectiles (smallest time to closest
   approach) and the 6 most imminent area objects (tele circles/lanes, puddles) enter the danger
   score.
6. **New hazard handling:**

   | Hazard | How the bot treats it |
   |---|---|
   | Puddle | Static circle; ember puddles are full danger, slow puddles get weight 0.4 |
   | `aim` while tracking | Soft line hazard, weight 0.3 |
   | `aim` once locked | Full line hazard |
   | `lane` | Like the dash line but static, with exact width |
   | Tracking circle | Danger at its current position plus a short follow prediction |
   | `charge` ring and dots | Danger from the expected orb rays (seen after the delay) |
   | Ranged wind-up | Seen after the delay; adds soft danger along the caster->player line |

7. **Shooter hunt (new goal term).** If the build has a melee weapon (whip, aura, orbit, nova as the
   bot already counts it), `hpFrac > 0.5` and a visible ranged enemy is within 320 px: add goal
   weight 0.4 toward the nearest one. This models a human who chases shooters.
8. **Instrumentation:**
   - Use the `hurtPlayer(dmg, src)` tag from 2.9. Update the `rep()` lines.
   - Add per minute: `aliveByType`, `rangedShare` (alive) and `shotsMax` (peak eshots).
   - balance-batch.js additionally prints:
     - "Fernschaden-Anteil m1-m3" (share of damage from ranged sources: shot, needle, mortar, puddle,
       ring, bossShot, area, lane)
     - median first hit (exists)
     - damage per minute m1/m2/m3
     - alive ranged share m3-m10
9. **Validation tool `tools/dodgetest.js`.**
   - A scripted arena with no melee. The player has no weapons that kill. The tool must make
     enemies invulnerable, for example `hp=1e9`, or patch damage.
   - 6 scenarios of 120 s each: 1 spitter (orb), 1 spitter after 4:00 (fan), 1 moth, 3 ash cauldrons,
     2 bells, and all of these mixed.
   - Each scenario runs again with 40 slow melee fillers (slime, speed 40).
   - It reports hits per projectile or marker fired.
   - Target hit rates for a skilled human, without fillers:

     | Threat | Target hit rate |
     |---|---|
     | Orb | 2-6 % |
     | Fan | 5-12 % |
     | Needle | 8-18 % |
     | Mortar | 6-15 % |
     | Bell lattice | 5-12 % |

     With fillers, the rates should be about 1.5-2.5x these.
   - Tuning order if the bot is better than this: raise the lapse first, then the reaction band (max
     0.20-0.35). If it is worse: lower the estimate noise. Never change game telegraphs to fit the bot.
   - Run it with the default view and with `VIEW=phone`.
10. **Documentation.**
    - Put all of this in the balancebot.js header.
    - Add a short "Balance-Bot" paragraph in the Technik section of glutnacht/README.md.
    - Mention it in the commit message.

---------------------------------------------------------------------------------------------------
## 9. Texts (German key -> LANG_EN)

| German | English |
|---|---|
| Aschenkessel | Ash Cauldron |
| Nadelmotte | Needle Moth |
| Totenglocke | Knell Bell |
| Spucker in Stellung! | Spitters take aim! |
| Spucker auf der Mauer! | Spitters on the wall! |
| Die Aschenkessel brodeln! | The ash cauldrons are boiling! |
| Nadelmotten schwärmen aus! | Needle moths take flight! |
| Die Glocken läuten! | The bells are tolling! |
| Die Nacht zielt auf dich! | The Night takes aim! |

- Enemy names are not shown in the UI today. Add them anyway for future-proofing, and so that no
  `tr()` miss appears if they ever are.
- 'Kreuzfeuer!' already exists. 'Spucker' and 'Fledermaus' etc.: check whether ENEMIES names are
  translated. If they are not, add only the three new ones.
- Optional intro tweaks are out of scope. Do not change land intro texts.
- `I18N_MISSES` must stay empty. Check this with stages.js, lands.js, enter.js and itchcheck.js.

---------------------------------------------------------------------------------------------------
## 10. Calibration procedure and targets

Machine limits:
- 4 CPUs. Run one balance batch at a time with `PAR=4`.
- Start batches with `run_in_background` and no other heavy work. No Playwright runs during a batch.
- n=18 means 2 runs per hero.

**(a) Bot-only.** Run the new perception bot on the OLD content: git stash or a worktree of HEAD
with only balancebot.js changed. Configs: graveyard none, ashwood none, frostlake light, ruins mid
and nightheart mid, n=18 each. Record the numbers in the commit message of the bot commit.

**(b) Content plus the section 6 start values.** Run all target configs at n=18.

**(c) Per-land ladder.** Apply only as far as needed, re-measuring the affected land at n=18 after
each rung.

| Rung | If the land is too easy |
|---|---|
| 1 | Ranged weight +1 on that land's ranged key with the highest weight in w1-w9 (about +5 pp share) |
| 2 | That land's `rangedFrom` -10 s, and one more `arc` event at about 150 s |
| 3 | That land's ranged cd base -10 % (land field `rangedCd: 0.9`) |
| 4 | That land's `mult.dmg` +0.05 |
| 5 | Global (only if 3 or more lands are still too easy after rung 4): dmg growth `(1 + t/60*0.07)` -> 0.08, and heart drop 0.0025 -> 0.0020 |
| 6 | That land's `mult.hp` +5 % (last resort) |

- If a land is too hard: undo the rungs in reverse order. Then lower that land's ranged weights.
- Never shorten telegraphs, never raise caps beyond section 2.2, and never touch the iframe.
- **Heat 5 guard:** if graveyard max at heat 5 reaches 0 %, change only heat-specific knobs. First the
  heat cd factor 0.04 -> 0.02, then the heat projectile speed (use `HEAT.speed` only up to 1.15).
  Heat-0 numbers stay unaffected.

**(d) Final verification on the final code only, n=27 (3 per hero).**

| Config | Target |
|---|---|
| graveyard none | 40-55 % |
| ashwood none | 5-15 % |
| ashwood light | 20-35 % |
| frostlake light | 20-30 % |
| frostlake mid | 35-50 % |
| ruins mid | 15-25 % |
| ruins light | <= 10 % |
| nightheart mid | 5-15 % |
| nightheart max | 35-55 % |
| graveyard max at heat 5 | > 0 % (n=18 is enough) |

Early metrics in every land:
- median first hit < 90 s
- damage per minute in m1, m2 and m3 > 0
- at least 50 % of m1-m3 damage from ranged sources
- alive ranged share m3-m10 within the band from section 4

The binomial noise is about ±9 pp at n=27. A result within 1 pp of a band edge counts as on target
only if the matching n=18 run agrees.

Rough expectation, a guess to be measured:
- The bot change alone costs 5-15 pp in ruins and nightheart, where there are existing spitters and
  novas.
- Content plus the bot puts graveyard at about 50-60 % and ashwood none at about 10-15 %.
- Frostlake and nightheart likely need rung 1-3.

---------------------------------------------------------------------------------------------------
## 11. Build order and commits (German messages, the two required trailer lines)

1. **M9a framework plus bot.** Includes:
   - `hurtPlayer(dmg, src)`
   - the generic ranged AI with the spitter rework
   - volley director, caps, `rangedFrom`, `arc` and `mix`
   - edge chevrons, hostile sprites (orb), nova charge fix
   - the bot perception layer, dodgetest.js and the bot-only numbers from (a)
2. **M9b new enemies.** cinder, moth and bell: data, AI, sprites (frames 0/1/2) and contact sheet,
   puddles, sounds, texts, wave pools, events, ranged elites.
3. **M9c boss attacks.** The 5 primitives, the new tele kinds and the boss tables.
4. **M9d balance.** The ladder results, final n=27 numbers (in the commit message) and the README
   (land table, Balance-Bot paragraph).

Before each commit, run these checks and keep them green:
- `node --check` on all js
- `node tools/simtest.js aron 0 1 graveyard`
- Playwright scratch scripts: stages.js (plus 'mobile'), lands.js, enter.js (plus 'mobile'),
  itchcheck.js after `node tools/build-single.js dist/itch/index.html`
- the crazygames single build: `node tools/build-single.js --crazygames`
- tools/qa/qa.js, sdkdelay.js, modals.js and perf.js (plus the 120-shot scenario)

All scripts must print "keine Fehler" and no missing translations. If a scratch script has to change
because behaviour changed on purpose, say so.

**Visual QA.** Take screenshots and Read every PNG yourself before claiming any visual result:
- Each land, at minute 1 and minute 5, plus one boss cast per land.
- Viewports desktop, iphone-port and iphone-land.
- Check that orbs, needles, markers, lanes and puddles read clearly on all 5 grounds (especially the
  violet nightheart and the pale frostlake), and that they look distinct from Mira's (pink) and
  Ignis' (orange) effects.
- Check that the edge chevrons appear.
- Check the contact sheet for the 3 new enemies in style B (one top-left light, ink outline, rim
  light, ramps from `STYLE.ramp`).

---------------------------------------------------------------------------------------------------
## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Melee heroes cannot reach kiters | Retreat 0.6x is well below hero speed 150; low hp (22-40, bell 80); bells and elites never retreat; the bot hunt term. Check the per-hero win spread in the batch output. If melee heroes lose 2x more often than ranged heroes, lower `retreat` to 0.45 |
| Bullet clutter on phones | Preferred distance adapts to edgeDist; volley director; shot cap 120; puddle cap 8; portrait screenshots and a dodgetest `VIEW=phone` run |
| Hostile vs. player confusion | Red plus ink ring for enemies; no ink ring on player effects; magenta avoided because of Mira's evo bolt and the night ground |
| Offscreen damage | Wind-ups gated to the view, markers clamped, edge chevrons as a backstop |
| Bot numbers meaningless | Perception covers all ranged threats; dodgetest calibrates against human hit rates; step (a) isolates the bot effect |
| Over-tuning through global levers | Global levers only at rung 5; ladder per land |
| String-patch instrumentation breaks | Source tag parameter instead of string patches for every new path |
| Single-file builds | No new files loaded at runtime; sprites are procedural in sprites.js; sounds are aliases of existing samples. Rebuild dist/itch and the crazygames build and run itchcheck.js |
