# Ember Night (Roblox)

Roblox-Fassung von **Ember Night** („Glutnacht“, Web-Spiel in `../glutnacht`): Survivor-Roguelite in 3D von schräg oben,
**Koop für 1–4 Spieler** pro Server, fünf Länder, neun Helden, Schmiede, Nachtstufen, Erfolge, Endlosmodus.
Käufe mit Robux: Wiederbelebung, Helden, Goldpakete, doppeltes Gold, Kosmetik. Deutsch und Englisch.

**Stand: R4 – Darstellung, Klang und Oberfläche** (auf R3: Fortschritt und Robux-Käufe; R2: Kampfinhalte vollständig
und gegen das Web-Spiel geprüft; R1: Simulationskern, Server, einfacher Client). Neu in R4: Modelle aus Grundkörpern
für alle Gegner, Bosse, Helden, Truhen und Gegenstände, Licht, Atmosphäre, Wetter und Deko je Land, Warnzeichen mit
wachsender Füllung, Partikel und Schadenszahlen mit Budget, Klang und Musik (Aufnahmen des Web-Spiels in
`assets/audio`, IDs noch 0), die ganze Lauf-Oberfläche (HUD, Karten, Truhe, Pause, Am Boden, Sieg, Ergebnisse, Pfeile am
Rand) für PC, Telefon und Gamepad. Der ganze Client wird unter Lune gegen die echten Server-Dienste gespielt. Das ganze Spiel läuft als reine Luau-Simulation (auch headless unter Lune,
mit Balance-Bot für 1–4 Spieler) und wird Schritt für Schritt mit dem Code des Web-Spiels verglichen. Neu in R3: Profile
im DataStore (Sitzungssperre, automatisches Speichern, Quittungsbuch), Hub mit Helden, Weltkarte, Schmiede, Aussehen,
Erfolgen, Statistik, Shop und Einstellungen, Robux-Käufe aller Arten (Wiederbelebung, Goldpakete, Helden, doppeltes
Gold, Kosmetik) mit Live-Preisen. Server-Dienste und Hub-Oberfläche werden unter Lune auf einer nachgebauten
Roblox-Laufzeit getestet. In Roblox Studio ist noch nichts ausprobiert – die Prüfliste dafür steht in
[`docs/STUDIO-CHECKLIST.md`](docs/STUDIO-CHECKLIST.md). Der verbindliche Entwurf mit Meilensteinen und dem
Umsetzungsstand steht in [`docs/DESIGN.md`](docs/DESIGN.md), Bot-Messungen in [`docs/BALANCE.md`](docs/BALANCE.md).

## Aufbau

| Pfad | Roblox | Inhalt |
|---|---|---|
| `src/shared` | `ReplicatedStorage.Shared` | reine Luau-Module: Simulation (`Sim/`), Daten, Sprache, Netzformat, Konfiguration |
| `src/server` | `ServerScriptService.Server` | Server: Spielschleife, Lobby, Speichern (DataStore), Käufe |
| `src/client` | `StarterPlayer.StarterPlayerScripts.Client` | Client: Darstellung, Oberfläche, Eingabe, Kamera, Klang |
| `tests` | – | Lune-Tests (`*.spec.luau`), Balance-Bot `bot.luau`, Leistungsmessung `bench.luau`, nachgebaute Roblox-Laufzeit `lib/Roblox.luau` für Server- und Oberflächentests |
| `tools` | – | `port-data.js` (Daten und Texte aus dem Web-Spiel übernehmen), `ref-sim.js` (Vergleichsläufe mit dem Web-Code), `balance.sh` (Bot-Tabelle aller Länder), `export-audio.sh` (Klänge aus dem Web-Spiel kopieren), `snapshot.luau` (Client als PNG zeichnen), `build.sh`, `test.sh` |
| `assets/audio` | – | 34 Klänge und 5 Musikstücke (CC0, Quellen in `CREDITS-audio.txt`) zum Hochladen |
| `build` | – | gebaute Spielwelt `EmberNight.rbxlx` (zum Öffnen in Roblox Studio) |

## Werkzeuge

- [Rojo](https://rojo.space) 7.7 (`cargo install rojo --locked`) und [Lune](https://lune-org.github.io/docs) 0.11
  (`cargo install lune --locked`); optional selene und StyLua.
- Bauen: `tools/build.sh` → `build/EmberNight.rbxlx`, in Roblox Studio öffnen (oder `rojo serve` mit dem Rojo-Plugin).
- Testen: `tools/test.sh` (alle Specs) oder `tools/test.sh coop` (Filter).
- Bot: `lune run tests/bot.luau -- --land graveyard --forge none --heat 0 --players 1 --runs 24 --seed 1`
  (Siegquote mit 95-%-Intervall, Tod im Median, erster Treffer, Stufe nach 1/4/8 min).
- Alle Zeilen der Siegquoten-Tabelle des Web-Spiels: `tools/balance.sh 36` (4 Läufe parallel, Ergebnis als Tabelle).
- Vergleich mit dem Web-Code: `node tools/ref-sim.js` (schreibt `tests/ref/parity.json`), dann `tools/test.sh parity`;
  Unterschiede einzeln: `lune run tests/parity.luau`.
- Leistung: `lune run tests/bench.luau` (4 Spieler, 300 Gegner: Zeit je Schritt, Größe der Momentaufnahmen).
- Daten neu übernehmen, wenn sich das Web-Spiel ändert: `node tools/port-data.js` (schreibt `src/shared/Sim/Data/*`,
  `src/shared/Lang/En.luau` und die Vergleichswerte `tests/ref/*.json`).
- Prüfen: `selene src` (mit dem festen Minimal-Standard `roblox.yml`), `stylua --check src tests tools` (StyLua mit
  Luau-Unterstützung bauen: `cargo install stylua --locked --features luau`).
- Ansehen ohne Studio: `lune run tools/snapshot.luau -- run bild.png` zeichnet den Client als PNG (Szenen: `hub`, `run`,
  `land:<id>`, `enemies`, `boss:<id>`, `levelup`, `chest`, `pause`, `downed`, `results`, `phone`, `screen:<fenster>`);
  nur für Anordnung und Aufbau, ohne Licht.

## In Roblox Studio

Ausführliche Prüfliste: [`docs/STUDIO-CHECKLIST.md`](docs/STUDIO-CHECKLIST.md) (Kurzfassung: Anhang D in `docs/DESIGN.md`).
Kurz: Spielwelt öffnen, veröffentlichen (File → Publish to Roblox), unter Game Settings → Security „Enable Studio
Access to API Services“ einschalten (sonst wird nur im Arbeitsspeicher gespeichert; oben rechts steht dann gelb
„Nicht gespeichert“), Places → Max Players = 4, Klänge hochladen und in `src/shared/Config/AudioIds.luau` eintragen.

## Klang einrichten

1. Die Dateien liegen schon in `assets/audio/sfx` (34) und `assets/audio/music` (5); `tools/export-audio.sh` kopiert sie
   erneut aus `../glutnacht` (mit `--reencode` als 44,1-kHz-mp3, falls Roblox einen Upload ablehnt).
2. Hochladen: Creator Hub → Creations → Audio, oder in Studio Asset Manager → Bulk Import. Die Uploads müssen demselben
   Besitzer (Konto oder Gruppe) gehören wie das Spiel. Nicht verifizierte Konten dürfen nur wenige Audios im Monat
   hochladen.
3. Die IDs in `src/shared/Config/AudioIds.luau` beim Dateinamen eintragen, `tools/build.sh`. Eine ID 0 bleibt still
   (kein Fehler); Studio meldet einmal, wie viele IDs fehlen.

## Robux-Käufe einrichten

1. Im Creator Hub (Creations → das Spiel → Monetization) anlegen:
   - **Developer Products:** `revive` (Zweite Glut), `gold_s`, `gold_m`, `gold_l` (Goldpakete) und die Kosmetik
     `skin_ashen`, `skin_frost`, `skin_nightbloom`, `fx_emerald`, `fx_azure`, `fx_solar`, `fx_prism`, `trail_frost`,
     `trail_star`, `trail_shadow`.
   - **Game Passes:** `pass_gold2x` (doppeltes Gold), `pass_hero_kael` … `pass_hero_ignis` (7 Helden), `pass_heroes_all`,
     `pass_cosmetics` (alle käuflichen Kosmetika).
   Namen, Beschreibungen und Preisvorschläge stehen in `src/shared/Config/Products.luau` und `docs/DESIGN.md` §7.1.
2. Die IDs dort beim jeweiligen Schlüssel unter `id` eintragen, `tools/build.sh` ausführen, Spielwelt neu öffnen.
3. Was die ID 0 behält, ist überall unsichtbar und kann weder angeboten noch gutgeschrieben werden. Der Shop zeigt
   immer den echten Preis aus Roblox; Artikel ohne abrufbaren Preis werden ausgeblendet.
4. Testkäufe in Studio sind kostenlos. Gutschriften werden erst gespeichert und dann bestätigt; doppelt zugestellte
   Quittungen werden über das Quittungsbuch im Profil erkannt.

## Spielen in Studio (Stand R4)

Spielwelt öffnen, F5: Man steht im Hub (Lagerfeuer). Links das Gruppenfenster (Held ändern, Land wählen, Bereit,
Starten), unten die Leiste mit Helden, Weltkarte, Schmiede, Aussehen, Erfolgen, Statistik, Shop und Einstellungen.
Laufen mit WASD/Pfeiltasten, Stick oder Daumen-Stick; Karten mit Klick/Tippen oder 1–4, Neu würfeln R, Überspringen K,
Verbannen B, Pause P (allein; im Koop öffnet ☰ das Menü, ohne anzuhalten). Am Boden erscheint „Zweite Glut“ (Kauf oder vorhandene Marke, einmal pro Lauf). Mit „Test → Clients and Servers“ (2–4 Spieler) läuft die
Gruppe gemeinsam; Karten erscheinen dann unten als Leiste, ohne dass die Welt anhält.
