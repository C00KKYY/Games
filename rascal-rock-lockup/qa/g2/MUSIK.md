# Musikwahl für G2 (Brief §8.1, §13.3 G2)

**Nur Playtest-Material, nicht einreichen.** Du wählst hier die Musik nach Gehör. Ich kann Musik nicht anhören. Die
Vorauswahl stützt sich nur auf Titel, Tags und eine Analyse von Aufbau und Tempo. Bisher hat niemand die Stücke gehört.

Alle Stücke sind von **HoliznaCC0** (Free Music Archive) und stehen unter **CC0 1.0**. Jede Track-Seite nennt die
Lizenz, Kopien liegen in `qa/audio/license-proof/fma-*.txt`. Eine Nennung ist nicht nötig, steht aber trotzdem in den Credits.

## Hörproben

Jede Probe ist ein 75-s-Ausschnitt ab 0:15, auf −21 LUFS angeglichen (so laut wie im Spiel), mono, 64 kbps. Die Dateien
liegen in `qa/audio/candidates/` und zusätzlich im Playtest-Zip unter `musik-kandidaten/`.

| Stimmung | Wo im Spiel | Standard (jetzt im Spiel) | Alternative |
|---|---|---|---|
| gemütlicher Tag | tagsüber bis 18:00 Spielzeit. In den ersten 10 Minuten vergehen etwa 4 Spieltage, du hörst beide Stücke also mehrmals | **Ocean Breeze** (LoFi, Ukulele, Peaceful) – `day-default-ocean-breeze-lofi-ukulele-peaceful.mp3` | **Doodles** (LoFi, Happy) – `day-doodles-lofi-happy.mp3` |
| ruhiger Abend | ab 18:00 Spielzeit und nachts | **Ease into Night** (Lofi, Relax, Chill) – `evening-default-ease-into-night-lofi-relax-chill.mp3` | – (kein zweiter Kandidat; bei Bedarf suche ich weitere CC0-Stücke) |
| Inspektion (spannend, aber lustig) | kommt erst mit M5 | **Extra Life I Never Used** – `inspection-default-extra-life-i-never-used.mp3` | **Side Quest to Nowhere** – `inspection-side-quest-to-nowhere.mp3` |

Quellen:
- Ocean Breeze: https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/ocean-breeze-lofi-ukulele-peaceful-mp3/
- Doodles: https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/doodles-lofi-happy-mp3/
- Ease into Night: https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/ease-into-night-lofi-relax-chill/
- Extra Life I Never Used: https://freemusicarchive.org/music/holiznacc0/we-drove-all-night-game-soundtrack/extra-life-i-never-used/
- Side Quest to Nowhere: https://freemusicarchive.org/music/holiznacc0/we-drove-all-night-game-soundtrack/side-quest-to-nowhere/

**Antwort genügt so:** „Tag: Doodles, Abend: Standard, Inspektion: Side Quest“. Du kannst auch „keins davon, eher
fröhlicher/ruhiger …“ schreiben. Dann suche ich neue CC0-Kandidaten.

## So wird getauscht (erledige ich nach deiner Wahl)

1. In `tools/audio/sources.ts`, Objekt `RECIPES`, bei der gewählten Stimmung `layers[0].file` (und `page`) auf das neue
   Stück setzen. Mit `start` legst du fest, wo im Original der Loop beginnt (in Sekunden).
   - Tag: Das ist die Konstante `MUSIC_DAY`. Sie gilt für `musicDay` **und** für den 16-kbps-Platzhalter `musicDayLo`,
     der im Start-Bundle steckt. Beide bleiben so automatisch gleich lang, und die Überblendung bleibt phasengleich.
   - Abend: `musicEvening`. Inspektion: `musicInspection`.
   - Das Flag `isDefault` in `MUSIC_CANDIDATES` umsetzen (nur für die Hörproben-Dateinamen).
2. `npm run audio:build` (= `tsx tools/audio/build.ts && tsx tools/audio/measure.ts`, ca. 1,5 min). Das baut
   `public/audio/*.mp3` und `loops.json` neu und sucht die Loop-Länge (80–96 s, nahtlos mit 1,5 s Überblendung). Außerdem
   werden `licenses/AUDIO_CREDITS.md`, die Tabelle in `docs/AUDIO.md` und die Messwerte in `qa/audio/levels.json` neu erzeugt.
3. `npx vitest run tests/unit/audio-assets.test.ts` prüft die Grenzen, die dabei nicht gelockert werden: Musik 64–80 kbps,
   ≤ 0,9 MB, −20 LUFS ± 2, Loop-Naht < 6 dB, `musicDayLo` < 200 KB mit gleicher Periode wie `musicDay`, Start-Bundle
   ≤ 250 KB. Danach `npm run build`.

Die Rohdateien liegen in `vendor_raw/audio/fma-holiznacc0/` (nicht im Git, nur auf dem Build-Rechner). Doodles und
Side Quest sind schon heruntergeladen.
