# Ember Night (Roblox)

Roblox-Fassung von **Ember Night** („Glutnacht“, Web-Spiel in `../glutnacht`): Survivor-Roguelite in 3D von schräg oben,
**Koop für 1–4 Spieler** pro Server, fünf Länder, neun Helden, Schmiede, Nachtstufen, Erfolge, Endlosmodus.
Käufe mit Robux: Wiederbelebung, Helden, Goldpakete, doppeltes Gold, Kosmetik. Deutsch und Englisch.

**Stand: R2 – Kampfinhalte vollständig und gegen das Web-Spiel geprüft** (auf R1: Simulationskern, Server, einfacher
Client). Das ganze Spiel läuft als reine Luau-Simulation (auch headless unter Lune, mit Balance-Bot für 1–4 Spieler);
Bosse, Fernkämpfer, Waffen, Spawner, Countdown und Ansturm und ganze Solo-Läufe werden Schritt für Schritt mit dem Code
des Web-Spiels verglichen (`tools/ref-sim.js`, `tests/parity.spec.luau`). Der Server rechnet im festen 1/30-s-Takt und schickt
Momentaufnahmen und Ereignisse an die Clients, die mit Platzhalter-Grafik (Kugeln, Klötze) darstellen. Noch nicht
enthalten: Speichern im DataStore (Profile gelten bis zum Verlassen), endgültige Modelle, Oberfläche und Klang (R3),
Robux-Käufe (R4). In Roblox Studio ist noch nichts ausprobiert. Der verbindliche Entwurf mit Meilensteinen R1–R4 und dem
Umsetzungsstand steht in [`docs/DESIGN.md`](docs/DESIGN.md), Bot-Messungen in [`docs/BALANCE.md`](docs/BALANCE.md).

## Aufbau

| Pfad | Roblox | Inhalt |
|---|---|---|
| `src/shared` | `ReplicatedStorage.Shared` | reine Luau-Module: Simulation (`Sim/`), Daten, Sprache, Netzformat, Konfiguration |
| `src/server` | `ServerScriptService.Server` | Server: Spielschleife, Lobby, Speichern (DataStore), Käufe |
| `src/client` | `StarterPlayer.StarterPlayerScripts.Client` | Client: Darstellung, Oberfläche, Eingabe, Kamera, Klang |
| `tests` | – | Lune-Tests (`*.spec.luau`), Balance-Bot `bot.luau`, Leistungsmessung `bench.luau` |
| `tools` | – | `port-data.js` (Daten und Texte aus dem Web-Spiel übernehmen), `ref-sim.js` (Vergleichsläufe mit dem Web-Code), `balance.sh` (Bot-Tabelle aller Länder), `build.sh`, `test.sh` |
| `assets/audio` | – | Klänge und Musik zum Hochladen (ab R3) |
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
- Prüfen: `selene src` (mit dem festen Minimal-Standard `roblox.yml`), `stylua --check src tests`.

## In Roblox Studio

Ausführliche Prüfliste folgt mit R4 in `docs/STUDIO-CHECKLIST.md` (Kurzfassung: Anhang D in `docs/DESIGN.md`).
Kurz: Spielwelt öffnen, unter Game Settings → Security „Studio Access to API Services“ einschalten (sonst wird nicht
gespeichert), Places → Max Players = 4, Produkte und Game Passes anlegen und ihre IDs in
`src/shared/Config/Products.luau` eintragen, Klänge hochladen und in `src/shared/Config/AudioIds.luau` eintragen.

## Spielen in Studio (Stand R1)

Spielwelt öffnen, F5: Man steht im Hub (Lagerfeuer). Links das Gruppenfenster: Held wählen, als Anführer Land und
Nachtstufe wählen, „Starten“. Laufen mit WASD/Pfeiltasten, Stick oder Daumen-Stick; Karten mit Klick/Tippen oder 1–4,
Neu würfeln R, Überspringen K, Verbannen B, Pause P (allein). Mit „Test → Clients and Servers“ (2–4 Spieler) läuft die
Gruppe gemeinsam; Karten erscheinen dann unten als Leiste, ohne dass die Welt anhält.
