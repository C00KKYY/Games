# QA-Skripte (Playwright)

Laufen aus dem Repo, ohne Server (file:// bzw. Playwright-Routen). Ausgabe nach `tools/qa/out/` (nicht im Git).

| Skript | Zweck |
|---|---|
| `qa.js <profil> [cpu] [sek]` | frisches Profil: Startzeiten, Klicks/Wörter bis zum Spiel, HUD-Maße, Heldengröße (Spritekasten und sichtbare Figur), gemessene Größe der Schadenszahlen, Passform des ersten Level-ups, 60 s Spiel mit Bildern alle 3 s. Profile: `d907 d1280 iphone-land iphone-port d907-long d907-de` |
| `sdkdelay.js` | CrazyGames-Build mit gefälschtem SDK: Ladebildschirm ≤ 300 ms, Menü ≤ 2,8 s auch bei hängendem SDK, `loadingStart/Stop` paarweise, Sprache aus dem SDK, später Wechsel auf den Cloud-Spielstand (Varianten T, A, B, C, N, LDE, LEN, LSAVE, LATEMENU, LATERUN, LATELOCAL) |
| `modals.js` | Dialoge im Ruhezustand, Kapitel-Banner, deutsche Browsersprache |
| `perf.js [cpu] [gegner]` | Leistungsprobe: unverwundbarer Held, Gegnerzahl fest (Standard 300, unsterblich), Partikel auf ~700 gehalten, 6 s Bildzeiten nach dem Einschwingen; Anteile Spiellogik/Zeichnen, erreichte Darstellungsstufe. `--quality=auto\|0..5` (Standard auto), `--weapons=start\|all`, `--shot=bild.png`, `--cap=30` (Anzeige auf 30 fps begrenzt wie im Stromsparmodus; nach einer kurzen Probe, ca. 4,5 s, muss die Stufe wieder oben sein, `qLog` zeigt den Verlauf) |
| `lum.js [länder] [T]` | Helligkeit aller fünf Länder bei Spielzeit T (Standard 30 s), unverwundbarer Held: mittlere Luminanz und Anteil heller Pixel gegen das M3-Ziel (55–80, ≥ 5 %); Bilder nach `out/lum/` |

`qa.js` misst außerdem je Spielbild die mittlere Helligkeit (Luminanz wie PIL „L“) und den Anteil der Pixel über 128 (`samples[].lum`, `lum30` = Bild bei 30 s) sowie die Bildzeiten im Spiel (`fps`).

Optionen: `--target=datei.html` (Standard: `index.html` bzw. frisch gebauter CrazyGames-Build), `--out=ordner`.

`baseline/`: Messwerte vor der Überarbeitung (Stand dbddb47, Einzeldatei-Build): `qa.js` für d907, d1280,
iphone-land, iphone-port und d907 mit 6-facher CPU-Drossel, dazu `sdkdelay.js` gegen den alten CrazyGames-Build
(alle Varianten außer LSAVE schlagen dort fehl; Variante N – SDK-Skript kommt nie an – startet gar nicht).
