# PROGRESS

**Aktueller Meilenstein:** M1 Art-Spike, fertig → **wartet auf Freigabe G1**
**Gates:** G1 **offen, Material liegt vor** · G2 offen · G3 offen

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

## Offen
- G1-Freigabe durch den Auftraggeber.
- Persistenz: Das Repo hat kein Remote (siehe Abweichung 5).

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
- `npm test`: 6/6 grün (H0, Upgrade-Mathe, Art-Palette/Platzhalter/kein Text) · `npm run qa`: 5/5 grün · Nacht-Luminanz 0,476

## Nächste 3 Schritte (nach G1-Freigabe)
1. G1-Rückmeldung einarbeiten.
2. M2: headless Simulation (`src/sim/`) mit Raster, Räumen, Distanzfeldern, Bedürfnissen, Ökonomie, Zeit, Fähre, Entlassung, Director, RNG und Uhr. Dazu die Balance-Bots v1.
3. M2-Abnahme: Vitest, C1a, C2, H1 (erste 10 min).
