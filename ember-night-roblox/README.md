# Ember Night (Roblox)

Roblox-Fassung von **Ember Night** („Glutnacht“, Web-Spiel in `../glutnacht`): Survivor-Roguelite in 3D von schräg oben,
**Koop für 1–4 Spieler** pro Server, fünf Länder, neun Helden, Schmiede, Nachtstufen, Erfolge, Endlosmodus.
Käufe mit Robux: Wiederbelebung, Helden, Goldpakete, doppeltes Gold, Kosmetik. Deutsch und Englisch.

**Stand: Projektgerüst.** Der verbindliche Entwurf mit Meilensteinen R1–R4 steht in [`docs/DESIGN.md`](docs/DESIGN.md).

## Aufbau

| Pfad | Roblox | Inhalt |
|---|---|---|
| `src/shared` | `ReplicatedStorage.Shared` | reine Luau-Module: Simulation (`Sim/`), Daten, Sprache, Netzformat, Konfiguration |
| `src/server` | `ServerScriptService.Server` | Server: Spielschleife, Lobby, Speichern (DataStore), Käufe |
| `src/client` | `StarterPlayer.StarterPlayerScripts.Client` | Client: Darstellung, Oberfläche, Eingabe, Kamera, Klang |
| `tests` | – | Lune-Tests der Simulation (`*.spec.luau`), später Balance-Bot und Messungen |
| `assets/audio` | – | Klänge und Musik zum Hochladen (ab R3) |
| `build` | – | gebaute Spielwelt `EmberNight.rbxlx` (zum Öffnen in Roblox Studio) |

## Werkzeuge

- [Rojo](https://rojo.space) 7.7 (`cargo install rojo --locked`) und [Lune](https://lune-org.github.io/docs) 0.11
  (`cargo install lune --locked`); optional selene und StyLua.
- Bauen: `tools/build.sh` → `build/EmberNight.rbxlx`, in Roblox Studio öffnen (oder `rojo serve` mit dem Rojo-Plugin).
- Testen: `tools/test.sh` (alle Specs) oder `tools/test.sh smoke` (Filter).
- Prüfen: `selene src` (mit dem festen Minimal-Standard `roblox.yml`), `stylua --check src tests`.

## In Roblox Studio

Ausführliche Prüfliste folgt mit R4 in `docs/STUDIO-CHECKLIST.md` (Kurzfassung: Anhang D in `docs/DESIGN.md`).
Kurz: Spielwelt öffnen, unter Game Settings → Security „Studio Access to API Services“ einschalten (sonst wird nicht
gespeichert), Places → Max Players = 4, Produkte und Game Passes anlegen und ihre IDs in
`src/shared/Config/Products.luau` eintragen, Klänge hochladen und in `src/shared/Config/AudioIds.luau` eintragen.
