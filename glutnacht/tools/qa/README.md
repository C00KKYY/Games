# QA-Skripte (Playwright)

Laufen aus dem Repo, ohne Server (file:// bzw. Playwright-Routen). Ausgabe nach `tools/qa/out/` (nicht im Git).

| Skript | Zweck |
|---|---|
| `qa.js <profil> [cpu] [sek]` | frisches Profil: Startzeiten, Klicks/Wörter bis zum Spiel, HUD-Maße, 60 s Spiel mit Bildern alle 3 s. Profile: `d907 d1280 iphone-land iphone-port d907-long d907-de` |
| `sdkdelay.js` | CrazyGames-Build mit gefälschtem SDK: Ladebildschirm ≤ 300 ms, Menü ≤ 2,8 s auch bei hängendem SDK, `loadingStart/Stop` paarweise, Sprache aus dem SDK, später Wechsel auf den Cloud-Spielstand (Varianten T, A, B, C, N, LDE, LEN, LSAVE, LATEMENU, LATERUN, LATELOCAL) |
| `modals.js` | Dialoge im Ruhezustand, Kapitel-Banner, deutsche Browsersprache |

Optionen: `--target=datei.html` (Standard: `index.html` bzw. frisch gebauter CrazyGames-Build), `--out=ordner`.

`baseline/`: Messwerte vor der Überarbeitung (Stand dbddb47, Einzeldatei-Build): `qa.js` für d907, d1280,
iphone-land, iphone-port und d907 mit 6-facher CPU-Drossel, dazu `sdkdelay.js` gegen den alten CrazyGames-Build
(alle Varianten außer LSAVE schlagen dort fehl; Variante N – SDK-Skript kommt nie an – startet gar nicht).
