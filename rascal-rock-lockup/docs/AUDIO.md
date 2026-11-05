# Audio – sources, processing, measurements (Brief §8, §12.8)

All 36 ids of `src/audio/manifest.ts` (28 SFX, 5 ambience loops, 3 music loops) ship as `public/audio/<id>.mp3`,
plus `public/audio/loops.json` (`{ id: { loopStart, loopEnd } }` in seconds for every loop and music id).
Every file comes from a **recorded/pre-made sample** under CC0 (or CC BY 3.0 with credit). ZzFX is not used for any shipped file.

## Rebuild

```bash
npm run audio:build      # = tsx tools/audio/build.ts && tsx tools/audio/measure.ts
npx tsx tools/audio/build.ts --candidates   # also re-encode the music candidates (qa/audio/candidates/)
npx tsx tools/audio/build.ts --only=coin1,coin2   # rebuild a few ids (report keeps the rest)
npx tsx tools/audio/measure.ts              # re-measure only → qa/audio/levels.json
npx vitest run tests/unit/audio-assets.test.ts
```

- Inputs: `vendor_raw/audio/<pack>/` (gitignored). Each download was unzipped into its own new folder and is only ever
  read as ffmpeg input – nothing from a download is executed. The download URLs are listed per pack in
  `tools/audio/sources.ts` (`PACKS[*].download`) and in `qa/audio/license-proof/*.txt`.
- Outputs: `public/audio/*.mp3`, `public/audio/loops.json`, `qa/audio/build.json` (what was done to every id),
  `qa/audio/levels.json` (measurements), `licenses/AUDIO_CREDITS.md` and the table below (both generated).
- The unit test reads `qa/audio/levels.json` and re-hashes every shipped file (sha1 + size). If a file changes without
  re-running the build/measure step the test fails – so the asserted numbers are always those of the real files.
- Tools: `/usr/bin/ffmpeg` 6.1.1 (libmp3lame, ebur128). Encoding uses `-fflags +bitexact -flags:a +bitexact`, no ID3 tags.

## Licence policy (§8.1)

- Allowed: CC0 1.0, CC BY 3.0/4.0 (with credit). Rejected on sight: CC BY-SA, GPL, OGA-BY (also when only one of several
  listed licences was acceptable, the page was skipped unless an allowed licence was among them).
- The "License(s)" field was read on every source page; copies with page URL, author, licence field, licence links
  and offered files are in `qa/audio/license-proof/`. Kenney's own `License.txt` files are reproduced in
  `licenses/AUDIO_CREDITS.md`.
- kenney.nl was not contacted (it answers bots with 403). All Kenney packs come from opengameart.org.
- Rejected candidates (licence): `gull-sounds` (CC BY-SA 3.0), `free-general-ambience-sounds` (CC BY-SA 4.0),
  `cricket-chirping-loopable` (CC BY-SA 4.0), `whoosh-1`/`whoosh-2` (GPL/CC BY-SA), `plates-movement-and-sorting-with-a-clatter`,
  `utensils-drawer-rummaging-and-searching`, `pub-glass-washing-rinsing` (GPL 3.0), `rolling-0` (CC BY-SA 4.0),
  `inventory-sound-effects` (mixed incl. GPL), `farm-animals` (CC BY-SA). Packs shipped only as `.7z` were skipped (no extractor installed; not worth adding a tool).
- Not used for content reasons: `foghorn-kinda-gross` (the page says it is a recreation of a "disgusting food" gag),
  `children-voices` (children in a prison game), `happy-halloween-group` (spoken words).

## Processing (§8.3) – what the numbers mean

| | rule (Brief) | how it is built | how it is measured (`measure.ts`) |
|---|---|---|---|
| SFX format | mono MP3 ~64 kbps | libmp3lame CBR 64 kbps, 44.1 kHz mono | ffprobe stream bit rate, channels |
| SFX peak | −3 dBFS ±1 | normalised, then encode → decode → gain corrected until the **decoded** MP3 peak is within ±0.25 dB | sample peak of the decoded MP3 |
| SFX RMS | within ±3 dB of each other | whole-clip RMS. Centre = music median + 7 dB; each sound gets a crest-dependent offset of at most ±2.2 dB (transients slightly lower, tones slightly higher) so attacks are not squashed flat. Too quiet → tighter silence trim (−40/−30/−24 dB) → look-ahead limiter on the attack (1.5 ms look-ahead, 12 ms release) → if still short, gentle tanh rounding. Too loud (sustained tones) → exponential decay envelope over the body. The loop is closed on the **encoded** RMS (LAME's low-pass removes up to ~2 dB of crackle energy). | RMS of the whole decoded file; test: every SFX within ±3 dB of the SFX median **and** max − min ≤ 6 dB |
| SFX vs music | SFX RMS 6–10 dB above music | see above | median SFX RMS − median music RMS (music RMS over one loop period) |
| Music / ambience | mono 64–80 kbps, −20 LUFS ±2, ≤ 0.9 MB per music loop | 64 kbps CBR (72 is not a valid MP3 bit rate – LAME would silently use 64), integrated loudness set to −21.0 LUFS (inside the window; leaves room for the SFX), closed on the encoded file (±0.1 LU); a peak limiter acts only if the decoded MP3 peak would pass −1 dBFS (musicEvening 1.7 dB, clatter 6 dB + 6.5 dB – its peak still ends at −0.4 dBFS because of MP3 overshoot on fork clinks, no clipping) | ffmpeg `ebur128` integrated loudness over two loop periods |
| Seamless loops | no click at the loop point (RMS jump < 6 dB) | see next section | RMS of 20 ms before `loopEnd` vs 20 ms after `loopStart` in the decoded file; also the sample step across the seam relative to the typical step (`seamStepRatio`) |
| Initial bundle | ≤ 12 sounds, ≤ 250 KB (§8.4) | `INITIAL` in the manifest | sum of file sizes |

### Seamless loops and the MP3 encoder delay

1. The loop **period** is made seamless before encoding:
   - `segment` (murmur, crickets, music): a section of one recording, the following 1.2–2.5 s cross-faded into its head
     (equal-power for uncorrelated material, linear when head and tail correlate). For music the period length is searched
     in 80–96 s for the end frame whose band spectrum best matches the start frame (3 s window, then sample-accurate by
     waveform correlation), so the seam lands on a musically matching beat.
   - `circular` (waves, gulls, clatter): recorded events mixed into a circular buffer – seamless by construction.
2. The file is the period plus **0.25 s of periodic padding on both sides** (tail before, head after).
3. libmp3lame writes the encoder delay (1105 samples = 25 ms at 44.1 kHz) into the LAME/Xing header. The build decodes its
   own MP3 again, locates the period by cross-correlation and writes `loopStart`/`loopEnd` from that. ffmpeg honours the
   header, so `loopStart` = 0.25 s exactly.
4. Verified in the Playwright Chromium: `decodeAudioData` returns the identical sample count and sample values as ffmpeg
   (e.g. `ambWaves` 604 170 samples, `musicInspection` 3 702 873 samples), and the seam RMS measured inside Chromium is
   1.41 dB (`ambWaves`) and 0.01 dB (`musicInspection`).
5. A decoder that ignored the header would shift everything by 25 ms – still inside the periodic padding, so the loop stays seamless.

## Measured results (qa/audio/levels.json, 2026-11-05)

- SFX: peaks −3.25 … −2.87 dBFS; RMS median −13.7 dBFS, range −15.7 … −11.2 (max deviation from the median 2.4 dB, spread 4.5 dB).
- Music RMS median −20.6 dBFS → SFX sit **+7.0 dB** above the music.
- Music & ambience: −21.0 / −21.1 LUFS; music loops 672–734 KB (periods 87.5 s, 91.1 s, 83.5 s).
- Loop seams: max RMS jump 1.11 dB (limit 6 dB); seam step ratio ≤ 1.6 (no click).
- Initial bundle: 12 files, 52 852 B (limit 250 KB). All audio: 2 879 815 B.
- `npx vite build` into a scratch dir: whole dist 4 462 306 B (limit 8 MB), of which audio 2.88 MB.
- The build is deterministic: two full runs produced byte-identical files (same sha1 for all 36).

## Music (§8.1.3) – CC0 candidates for the G2 listening choice

All by **HoliznaCC0** on the Free Music Archive. Every track page states: *"licensed under a CC0 1.0 Universal License"*
with the link https://creativecommons.org/publicdomain/zero/1.0/ (copies: `qa/audio/license-proof/fma-*.txt`).
Downloads use the public "download" link of each track page (no login). FMA's download overlay adds the usual note that
a CC0 recording may not be recognised as public domain in every jurisdiction – noted, no further restriction.

| mood | track (page) | default | preview (not shipped) |
|---|---|---|---|
| cosy day | Ocean Breeze ( LoFi , Ukulele , Peaceful ) – https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/ocean-breeze-lofi-ukulele-peaceful-mp3/ | ✅ `musicDay` | `qa/audio/candidates/day-default-ocean-breeze-lofi-ukulele-peaceful.mp3` |
| cosy day | Doodles ( LoFi , Happy ) – https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/doodles-lofi-happy-mp3/ | | `qa/audio/candidates/day-doodles-lofi-happy.mp3` |
| calm evening | Ease into Night ( Lofi , Relax , Chill ) – https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/ease-into-night-lofi-relax-chill/ | ✅ `musicEvening` | `qa/audio/candidates/evening-default-ease-into-night-lofi-relax-chill.mp3` |
| tense-but-fun inspection | Extra Life I Never Used – https://freemusicarchive.org/music/holiznacc0/we-drove-all-night-game-soundtrack/extra-life-i-never-used/ | ✅ `musicInspection` | `qa/audio/candidates/inspection-default-extra-life-i-never-used.mp3` |
| tense-but-fun inspection | Side Quest to Nowhere – https://freemusicarchive.org/music/holiznacc0/we-drove-all-night-game-soundtrack/side-quest-to-nowhere/ | | `qa/audio/candidates/inspection-side-quest-to-nowhere.mp3` |

Previews are 75 s excerpts (from 0:15), −21 LUFS, mono 64 kbps. To switch a default: change the `file`/`start` of
`musicDay|musicEvening|musicInspection` in `tools/audio/sources.ts` and run `npm run audio:build`.
The moods were chosen from the track titles/tags and a spectral look at structure and tempo – nobody has listened to them yet; the G2 choice by ear is still open.

## Fallbacks in use (open)

Two primary sources are known and licence-checked but could not be downloaded: `upload.wikimedia.org` answered every
request from this network with **HTTP 429 (too many requests)**. That was not worked around. The build automatically
uses the primary file as soon as it is present:

| id | intended primary (licence) | put the file here | fallback shipped now |
|---|---|---|---|
| `kazoo` | "NoiseCollector KazooA.wav", NoiseCollector via Wikimedia Commons, **CC BY 3.0** – https://commons.wikimedia.org/wiki/File:NoiseCollector_KazooA.wav (recipe: kazoo note + the same note a minor third lower, "wee-woo wee-woo", ~1.85 s) | `vendor_raw/audio/wm-kazoo/NoiseCollector_KazooA.wav` | CC0 "Game over trumpet SFX" by 0new4y (comedic "wah-wah-wah-waaah" muted trumpet, made in Bosca Ceoil) |
| `whistle` | "218318 splicesound referee-whistle-blow-gymnasium.wav", SpliceSound via Wikimedia Commons, **CC0** | `vendor_raw/audio/wm-referee-whistle/218318_splicesound_referee-whistle-blow-gymnasium.wav` | "Whistles" by dklon, **CC BY 3.0** (two short "fweet" blows) – credit required |

If the kazoo primary is used, its CC BY credit is added to `licenses/AUDIO_CREDITS.md` automatically; if the whistle
primary is used, the dklon credit disappears from it automatically.

## Per sound

Generated from `qa/audio/build.json` by the build (`npx tsx tools/audio/build.ts --docs` regenerates only this part).

<!-- audio-table:start -->
| id | kind | source page | licence | original file(s) | processing |
|---|---|---|---|---|---|
| `musicDay` | music | <https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/ocean-breeze-lofi-ukulele-peaceful-mp3/> | CC0-1.0 | `fma-holiznacc0/ocean-breeze-lofi-ukulele-peaceful-mp3.mp3` | cosy day: "Ocean Breeze (LoFi, Ukulele, Peaceful)"; segment 20.00–107.52s of the source; equal-power cross-fade 1.50s of the continuation into the head (seamless period); integrated loudness → -21 LUFS; ±0.25s periodic padding, mono MP3 64 kbps CBR; loop points from re-decode: start 0.25s, end 87.767279s (encoder delay 1105 samples) |
| `musicEvening` | music | <https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/ease-into-night-lofi-relax-chill/> | CC0-1.0 | `fma-holiznacc0/ease-into-night-lofi-relax-chill.mp3` | calm evening: "Ease into Night (Lofi, Relax, Chill)"; segment 10.00–101.15s of the source; equal-power cross-fade 1.50s of the continuation into the head (seamless period); peak limiter 1.7 dB (aiming at a decoded MP3 peak ≤ −1 dBFS); integrated loudness → -21 LUFS; ±0.25s periodic padding, mono MP3 64 kbps CBR; loop points from re-decode: start 0.25s, end 91.399932s (encoder delay 1105 samples) |
| `musicInspection` | music | <https://freemusicarchive.org/music/holiznacc0/we-drove-all-night-game-soundtrack/extra-life-i-never-used/> | CC0-1.0 | `fma-holiznacc0/extra-life-i-never-used.mp3` | tense-but-fun inspection: "Extra Life I Never Used" (game soundtrack); segment 15.00–98.47s of the source; equal-power cross-fade 1.50s of the continuation into the head (seamless period); integrated loudness → -21 LUFS; ±0.25s periodic padding, mono MP3 64 kbps CBR; loop points from re-decode: start 0.25s, end 83.715374s (encoder delay 1105 samples) |
| `ambWaves` | loop | <https://opengameart.org/content/beach-ocean-waves> | CC0-1.0 | `beach-ocean-waves/wave_01_cc0-18363__jasinski__alkaibeach.flac`<br>`beach-ocean-waves/wave_03_cc0-18363__jasinski__alkaibeach.flac`<br>`beach-ocean-waves/wave_04_cc0-18363__jasinski__alkaibeach.flac`<br>`beach-ocean-waves/wave_02_cc0-18363__jasinski__alkaibeach.flac` | gentle beach wash: five recorded waves, faded and overlapped in a circular 13.2 s buffer (no gap, no audible repeat point); 5 recorded events mixed into a circular 13.2s buffer; integrated loudness → -21 LUFS; ±0.25s periodic padding, mono MP3 64 kbps CBR; loop points from re-decode: start 0.25s, end 13.45s (encoder delay 1105 samples) |
| `ambGulls` | loop | <https://opengameart.org/content/solo-seagull-sound-effects> | CC0-1.0 | `solo-seagull-sound-effects/Seagull Ambient 1.wav`<br>`solo-seagull-sound-effects/Seagull Ambient 4.wav`<br>`solo-seagull-sound-effects/Seagull Ambient 6.wav`<br>`solo-seagull-sound-effects/Seagull Ambient 5.wav`<br>`solo-seagull-sound-effects/Seagull Big Ambient.wav` | distant gulls, sparse calls spread over 23 s; 5 recorded events mixed into a circular 23s buffer; integrated loudness → -21 LUFS; ±0.25s periodic padding, mono MP3 64 kbps CBR; loop points from re-decode: start 0.25s, end 23.25s (encoder delay 1105 samples) |
| `ambMurmur` | loop | <https://opengameart.org/content/crowd-shoutingspeaking-ambience> | CC0-1.0 | `crowd-shoutingspeaking-ambience/crowd_shouting_0.ogg` | crowd babble low-passed at 900 Hz → indistinct murmur (no intelligible words); segment 3.00–21.00s of the source; equal-power cross-fade 2.50s of the continuation into the head (seamless period); filter highpass=f=120,lowpass=f=900,lowpass=f=900; integrated loudness → -21 LUFS; ±0.25s periodic padding, mono MP3 64 kbps CBR; loop points from re-decode: start 0.25s, end 18.25s (encoder delay 1105 samples) |
| `ambClatter` | loop | <https://opengameart.org/content/cutlery-sounds><br><https://opengameart.org/content/100-cc0-sfx> | CC0-1.0 | `cutlery-sounds/fork_on_dish_01.ogg`<br>`100-CC0-SFX_0/dishes_01.ogg`<br>`cutlery-sounds/fork_on_dish_02.ogg`<br>`cutlery-sounds/cup_on_table_01.ogg`<br>`cutlery-sounds/pick_cutlery_01.ogg`<br>`cutlery-sounds/fork_on_dish_03.ogg`<br>`100-CC0-SFX_0/dishes_03.ogg`<br>`100-CC0-SFX_0/pot_01.ogg`<br>`cutlery-sounds/drop_cutlery_01.ogg`<br>`100-CC0-SFX_0/dishes_04.ogg` | canteen clatter: forks, cups and plates scattered over 14 s; 12 recorded events mixed into a circular 14s buffer; transient limiter 6 dB; peak limiter 6.5 dB (aiming at a decoded MP3 peak ≤ −1 dBFS); integrated loudness → -21 LUFS; ±0.25s periodic padding, mono MP3 64 kbps CBR; loop points from re-decode: start 0.25s, end 14.25s (encoder delay 1105 samples) |
| `ambCrickets` | loop | <https://opengameart.org/content/crickets-ambient-noise-loopable> | CC0-1.0 | `crickets-ambient-noise-loopable/crickets_1.mp3` | night crickets, cross-faded into a 9.5 s seamless bed; segment 0.50–10.00s of the source; equal-power cross-fade 1.20s of the continuation into the head (seamless period); integrated loudness → -21 LUFS; ±0.25s periodic padding, mono MP3 64 kbps CBR; loop points from re-decode: start 0.25s, end 9.75s (encoder delay 1105 samples) |
| `click` | sfx | <https://opengameart.org/content/interface-sounds> | CC0-1.0 | `kenney_interfaceSounds/Audio/toggle_002.ogg` | soft toggle click; RMS target -11.4 dBFS (natural crest 9.6 dB); silence trim at -24 dB; look-ahead limiter 6.3 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `hover` | sfx | <https://opengameart.org/content/interface-sounds> | CC0-1.0 | `kenney_interfaceSounds/Audio/select_007.ogg` | tiny select tick, the quietest UI cue (runtime plays it low); RMS target -12.7 dBFS (natural crest 12.5 dB); silence trim at -24 dB; look-ahead limiter 15.0 dB on the attack; soft saturation k=0.8; peak −3 dBFS; mono MP3 64 kbps CBR |
| `panelOpen` | sfx | <https://opengameart.org/content/interface-sounds> | CC0-1.0 | `kenney_interfaceSounds/Audio/maximize_001.ogg` | rising glide; RMS target -12.4 dBFS (natural crest 12.0 dB); silence trim at -30 dB; peak −3 dBFS; mono MP3 64 kbps CBR |
| `panelClose` | sfx | <https://opengameart.org/content/interface-sounds> | CC0-1.0 | `kenney_interfaceSounds/Audio/minimize_001.ogg` | falling glide (pair of panelOpen); RMS target -12.4 dBFS (natural crest 12.0 dB); silence trim at -40 dB; look-ahead limiter 4.3 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `deny` | sfx | <https://opengameart.org/content/interface-sounds> | CC0-1.0 | `kenney_interfaceSounds/Audio/error_006.ogg` | wobbly low "nuh-uh", not harsh; RMS target -13.1 dBFS (natural crest 13.3 dB); silence trim at -30 dB; look-ahead limiter 2.8 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `buildStart` | sfx | <https://opengameart.org/content/100-cc0-metal-and-wood-sfx> | CC0-1.0 | `100-CC0-wood-metal-SFX/wood_hammer_01.ogg` | single wooden mallet thunk; RMS target -14.7 dBFS (natural crest 16.5 dB); silence trim at -30 dB; look-ahead limiter 8.3 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `hammerLoop` | sfx | <https://opengameart.org/content/100-cc0-metal-and-wood-sfx> | CC0-1.0 | `100-CC0-wood-metal-SFX/wood_hammer_01.ogg` | "tok-tok-tok": three recorded mallet hits, 0.22 s apart; replays as a hammering rhythm; RMS target -15.0 dBFS (natural crest 17.1 dB); silence trim at -40 dB; look-ahead limiter 10.3 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `buildDone` | sfx | <https://opengameart.org/content/pop-sounds><br><https://opengameart.org/content/interface-sounds> | CC0-1.0 | `pop-sounds/pop3.ogg`<br>`kenney_interfaceSounds/Audio/confirmation_001.ogg` | "done" pop + small chime; RMS target -14.2 dBFS (natural crest 15.5 dB); silence trim at -24 dB; look-ahead limiter 5.8 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `demolish` | sfx | <https://opengameart.org/content/100-cc0-metal-and-wood-sfx> | CC0-1.0 | `100-CC0-wood-metal-SFX/wood_misc_07.ogg`<br>`100-CC0-wood-metal-SFX/wood_breaking_02.ogg` | wood planks coming apart and clattering down (no debris crash); RMS target -14.2 dBFS (natural crest 15.5 dB); silence trim at -30 dB; look-ahead limiter 7.3 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `upgrade` | sfx | <https://opengameart.org/content/85-short-music-jingles> | CC0-1.0 | `jingleSounds_Kenney/OGG/jingles_STEEL/jingles_STEEL13.ogg` | steel-drum upward leap (island flavour); RMS target -13.8 dBFS (natural crest 14.8 dB); silence trim at -24 dB; look-ahead limiter 5.0 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `milestone` | sfx | <https://opengameart.org/content/85-short-music-jingles> | CC0-1.0 | `jingleSounds_Kenney/OGG/jingles_STEEL/jingles_STEEL02.ogg` | steel-drum rising run – milestone fanfare; RMS target -13.8 dBFS (natural crest 14.7 dB); silence trim at -30 dB; look-ahead limiter 3.8 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `coin1` | sfx | <https://opengameart.org/content/pop-sounds><br><https://opengameart.org/content/interface-sounds><br><https://opengameart.org/content/80-cc0-rpg-sfx> | CC0-1.0 | `pop-sounds/pop4.ogg`<br>`kenney_interfaceSounds/Audio/glass_006.ogg`<br>`80-CC0-RPG-SFX_0/item_coins_01.ogg` | coin pop 1: pop + glassy ting + a hint of real coins; RMS target -13.7 dBFS (natural crest 14.5 dB); silence trim at -24 dB; look-ahead limiter 0.3 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `coin2` | sfx | <https://opengameart.org/content/pop-sounds><br><https://opengameart.org/content/interface-sounds><br><https://opengameart.org/content/80-cc0-rpg-sfx> | CC0-1.0 | `pop-sounds/pop9.ogg`<br>`kenney_interfaceSounds/Audio/glass_003.ogg`<br>`80-CC0-RPG-SFX_0/item_coins_03.ogg` | coin pop 2: pop + glassy ting + a hint of real coins; RMS target -12.7 dBFS (natural crest 12.5 dB); silence trim at -30 dB; look-ahead limiter 4.0 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `coin3` | sfx | <https://opengameart.org/content/pop-sounds><br><https://opengameart.org/content/interface-sounds> | CC0-1.0 | `pop-sounds/pop10.ogg`<br>`kenney_interfaceSounds/Audio/glass_005.ogg` | coin pop 3: pop + glassy ting; RMS target -12.3 dBFS (natural crest 11.6 dB); silence trim at -30 dB; look-ahead limiter 1.3 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `crateStack` | sfx | <https://opengameart.org/content/100-cc0-metal-and-wood-sfx> | CC0-1.0 | `100-CC0-wood-metal-SFX/wood_misc_06.ogg` | wooden crate set down on a stack; RMS target -13.5 dBFS (natural crest 14.2 dB); silence trim at -24 dB; look-ahead limiter 5.3 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `cartRoll` | sfx | <https://opengameart.org/content/30-cc0-sfx-loops> | CC0-1.0 | `sfx_loops/rolling.ogg` | wooden cart rolling off (two passes of a rolling loop, faded); RMS target -13.7 dBFS (natural crest 14.5 dB); cut to 1.9s; silence trim at -40 dB; look-ahead limiter 4.5 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `hire` | sfx | <https://opengameart.org/content/85-short-music-jingles> | CC0-1.0 | `jingleSounds_Kenney/OGG/jingles_STEEL/jingles_STEEL10.ogg` | short friendly steel-drum rise; RMS target -13.5 dBFS (natural crest 14.1 dB); silence trim at -24 dB; look-ahead limiter 4.5 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `objective` | sfx | <https://opengameart.org/content/interface-sounds> | CC0-1.0 | `kenney_interfaceSounds/Audio/confirmation_002.ogg` | ascending 4-note chime; RMS target -13.3 dBFS (natural crest 13.7 dB); silence trim at -24 dB; look-ahead limiter 2.3 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `ferryHorn` | sfx | <https://opengameart.org/content/steam-whistle> | CC0-1.0 | `steam-whistle/steamwhistle_0.wav` | friendly three-tone steam-ferry whistle "tooot" with a natural decay; RMS target -11.8 dBFS (natural crest 10.7 dB); decay tail 0.45s; silence trim at -40 dB; look-ahead limiter 14.0 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `stamp` | sfx | <https://opengameart.org/content/50-rpg-sound-effects> | CC0-1.0 | `RPGsounds_Kenney/OGG/bookPlace1.ogg` | rubber stamp thump on paper; RMS target -14.8 dBFS (natural crest 16.8 dB); silence trim at -24 dB; look-ahead limiter 15.0 dB on the attack; soft saturation k=0.5; peak −3 dBFS; mono MP3 64 kbps CBR |
| `releaseFanfare` | sfx | <https://opengameart.org/content/classic-fanfare-lick><br><https://opengameart.org/content/applause-in-a-large-hall-or-church> | CC0-1.0 | `classic-fanfare-lick/fanfare_3.ogg`<br>`applause-in-a-large-hall-or-church/applause-clapping-church-crowd-immersive.wav` | trumpet fanfare lick with applause & cheering underneath; RMS target -15.4 dBFS (natural crest 17.9 dB); decay tail 0.6s; silence trim at -24 dB; look-ahead limiter 7.0 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `tunnelPop` | sfx | <https://opengameart.org/content/pop><br><https://opengameart.org/content/3-pop-sounds> | CC0-1.0 | `pop/pop_.wav`<br>`3pops/3pops/pop1.ogg` | cork-like plop when a tunnel breaks through; RMS target -15.5 dBFS (natural crest 18.1 dB); silence trim at -24 dB; look-ahead limiter 10.0 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `kazoo` | sfx (fallback) | <https://opengameart.org/content/game-over-trumpet-sfx> | CC0-1.0 | `game-over-trumpet-sfx/losetrumpet.wav` | FALLBACK (kazoo recording unavailable): comedic "wah-wah-wah-waaah" muted trumpet; RMS target -11.4 dBFS (natural crest 7.4 dB); decay tail 0.3s; silence trim at -40 dB; peak −3 dBFS; mono MP3 64 kbps CBR |
| `netSwoosh` | sfx | <https://opengameart.org/content/swishes-sound-pack> | CC0-1.0 | `swishes/swishes/swish-7.wav`<br>`swishes/swishes/swish-3.wav` | butterfly-net swoosh (two light swishes); RMS target -12.1 dBFS (natural crest 11.3 dB); silence trim at -24 dB; look-ahead limiter 1.8 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `foodSplat` | sfx | <https://opengameart.org/content/squish-sounds-effects><br><https://opengameart.org/content/25-cc0-mud-sfx> | CC0-1.0 | `squish-sounds-effects/squish_04.mp3`<br>`25-CC0-mud-sfx/mud_08.ogg` | custard-pie splat (wet squish + soft mud slap); RMS target -14.4 dBFS (natural crest 15.9 dB); silence trim at -30 dB; look-ahead limiter 11.5 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `whistle` | sfx (fallback) | <https://opengameart.org/content/whistles> | CC-BY-3.0 | `whistles/whistle_1.wav`<br>`whistles/whistle_3.wav` | FALLBACK (referee whistle unavailable): two short whistle blows "fweet-fweet"; RMS target -11.4 dBFS (natural crest 4.4 dB); silence trim at -40 dB; decay envelope −11.0 dB over the body; peak −3 dBFS; mono MP3 64 kbps CBR |
| `inspectStamp` | sfx | <https://opengameart.org/content/50-rpg-sound-effects><br><https://opengameart.org/content/100-cc0-metal-and-wood-sfx> | CC0-1.0 | `RPGsounds_Kenney/OGG/bookClose.ogg`<br>`100-CC0-wood-metal-SFX/wood_slam_04.ogg` | heavier official stamp (book slam + desk thud); RMS target -15.8 dBFS (natural crest 19.5 dB); silence trim at -24 dB; look-ahead limiter 6.5 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
| `ledgerRegister` | sfx | <https://opengameart.org/content/80-cc0-rpg-sfx><br><https://opengameart.org/content/interface-sounds> | CC0-1.0 | `80-CC0-RPG-SFX_0/item_coins_02.ogg`<br>`kenney_interfaceSounds/Audio/confirmation_003.ogg`<br>`kenney_interfaceSounds/Audio/glass_004.ogg` | cash-register coin rattle + bright "ka-ching" chime; RMS target -14.7 dBFS (natural crest 16.6 dB); silence trim at -30 dB; look-ahead limiter 8.5 dB on the attack; peak −3 dBFS; mono MP3 64 kbps CBR |
<!-- audio-table:end -->
