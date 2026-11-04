# PROGRESS

**Aktueller Meilenstein:** M2 headless Simulation – Abnahme fast komplett (Review-Workflow läuft)
**Gates:** G1 freigegeben? – Antwort "brides jq" als "beides ja" gelesen, **schriftliche Bestätigung ausstehend** · G2 offen · G3 offen

## Erledigt
- **M0** (siehe Commit): Brief, Rules-Check, Pixi-Notizen, Namensprüfung („Rascal Rock Lockup" frei, EUIPO/TMview nicht prüfbar), Wettbewerb inklusive Gameplay-Screenshots, GDD, Style Guide, Economy-Sheet (H0 grün), Setup, Plattform-Wrapper, Mock-SDK. Tests 0, A1, A1b, A7.
- **M1 Art-Spike:**
  - Art-Kit als Code (`tools/art/kit.ts`): 134 Atlas-Sprites und 29 UI-Icons.
  - `npm run art:build` (@1x/@2x WebP, Kacheln extrudiert), `npm run art:sheet` (Kontaktbogen).
  - Pixi-Renderer (`src/render/`): Meer, organische Inselküste (Graphics-Polygon + Maske), Bodenchunks mit Culling, Wände mit Südfront, Möbel-Layouts je Raumtyp und Stufe, Gebäude.
  - Charaktere aus 14 Schichten mit Tint-Varianten, Laufzyklus, Blinzeln und Idles.
  - Ambience-Pools: Wellen, Möwen, Blätter, Dampf, Wolkenschatten, Glühwürmchen.
  - Tag/Nacht: Container-Tint + additive Lichter.
  - Kamera mit Trägheit, Zoom zum Cursor, Pinch und WASD/Pfeiltasten (`event.code`).
  - HUD-Skizze EN/DE mit Fluss-Leiste, Klemmbrett, Bauleiste, Tutorial-Blase.
  - Capture-Modus `?capture=1` (deterministisch, 1/30 s), Cover-Generator.
  - Blindvergleich bestanden (1 von 3 billigsten ist eigenes Bild, mit Einschränkung, siehe ART_SPIKE.md).
- G1-Material: `qa/g1/` + `docs/ART_SPIKE.md`

- **M2 headless Simulation** (`src/sim/`):
  - Raster mit Kantenwänden, Dijkstra-Distanzfeldern (8 Nachbarn) und Komponenten.
  - Räume mit Platzierungsregeln, Türwahl nach Kapazität, Möbel-/Slot-Packer, Upgrades/Meilensteine, Abriss/Undo.
  - Schlingel mit Bedürfnissen, Laune, Aktivitätswahl, Warteschlangen und Watchdog.
  - Personal, Karren, Bautrupp, Fähre mit Horn-Regel und Dock-Schlange, Tor, Director (Tunnel, Essensschlacht, VIP-Ankündigung, Ruckus), Tutorial-Schritte, Klemmbrett (10 Ziele, 7 Pflicht), Freischaltungen.
  - Befehls-API, Stepper (µs-Akkumulator, 8-Tick-Cap), Nachtsprung in Sitzung 1, Invarianten, State-Hash.
  - Fluss-Leiste-Berechnung (`flow.ts`), Speicherformat (`src/save/serialize.ts`: lz-string, 2 Slots, CRC32, Migrationen).
  - i18n EN/DE (`src/i18n`), Strafakten-Gags.
  - Sim-Ansicht im Browser (`?sim&bot=casual&warp=300`).
- Startgelände-Layout v2 (Baustreifen über der vorgebauten Reihe). Möbel für Werkstatt, Klassenzimmer, Wachposten und Hof.
- Abnahme M2:
  - C1a: p95 0,46 ms bei 206 Agenten.
  - C2: Tick-Zahl bei 60/144/165 Hz gleich, Hash gleich.
  - H4: Hash nach Speichern/Laden gleich, auch 3000 Ticks später.
  - H0 grün.
  - **H1 (erste 10 min) grün auf 27 Seeds**, Ausnahmen siehe BALANCE.md §0.

## Offen
- Schriftliche Bestätigung G1 und Push-Erlaubnis (Push zweimal vom Auto-Mode blockiert).
- Review-Workflow über `src/sim` läuft, Befunde einarbeiten.
- Taktungsregel 10–15 min hängt an der Projekttafel (M5).

## Abweichungen vom Brief
1. Eltern-Repo enthält `verkehrsmeister/`, nicht `glutnacht/`. Ohne Auswirkung.
2. Balance-Startwerte angepasst (`BALANCE.md` §2), Pflichtziele geändert.
3. SDK wird asynchron geladen (RULES_CHECK §5).
4. `reportGameCompletedPercentage`: +50 % pro Standort in v1 (RULES_CHECK §6).
5. **Persistenz-Risiko:** `rascal-rock-lockup/` ist laut Brief ein eigenes Git-Repo ohne Remote. Der Container ist flüchtig. Ohne Push gehen die Commits verloren, wenn die Session endet.
6. Freiheitstor: Der Weg knickt am rechten Ende nach Süden ab, das Tor steht frontal. In der Seitenansicht war ein Tor im 3/4-Blick nicht lesbar. Die Leserichtung bleibt „Steg links → Tor rechts".
7. Ein Teil der Küste und die Insel-Silhouette sind ein einmalig erzeugtes Pixi-`Graphics`-Polygon (statische Geometrie, kein Canvas-2D pro Frame).

## Bekannte Bugs / Schwächen
- Profilköpfe wirken schnabelartig. Keine Cutaway-Wände. Topbar-Fluss-Leiste zu klein und zu leer (Blindvergleich). Video-Capture ist langsam (~1,8 s pro Frame unter SwiftShader).

## Letzte Testergebnisse
- `npm test`: 94/94 grün (H0, Pfadfindung, Layout, Kapazität, Sim-Smoke, C1a, C2, H4, i18n, Art) · ESLint/tsc sauber · `npm run balance -- --minutes 10`: alle Zeilen ✅

## Nächste 3 Schritte
1. Review-Befunde (Workflow) verifizieren und beheben.
2. M3: Bau-Werkzeuge (Rechteck ziehen, Geist mit Grund-Icon, Kanten-Drag), echtes HUD mit Fluss-Leiste aus `flow.ts`, Panels, Tooltips, Kompakt-HUD, Tastatur/Touch → B1–B7, D5, D7.
3. Spike-Szene ausmustern, Sim-Ansicht wird Standard.
