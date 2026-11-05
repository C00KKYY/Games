# PROGRESS

**Aktueller Meilenstein:** M3 abgeschlossen (inkl. Review und Abnahmetests) → M4 Feel/Juice, Audio, Speichern, Tutorial-UI
**Gates:** G1 **freigegeben** (2026-11-04) · G2 offen · G3 offen

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
  - **H1 (erste 10 min): alle 12 Pacing-Zeilen grün auf 27 Seeds**. Taktungsregel offen (6/27), siehe BALANCE.md §0.
- **Review-Workflow** über `src/sim` (adversarial verifiziert). Behoben u. a.:
  - Essensschlacht gibt Sitzplätze frei.
  - Tutorial bleibt nicht hängen, wenn das Waschhaus vor dem Horn steht (zustandsbasiert).
  - Verkleinerte Zellen crashen nicht mehr.
  - Speichern verliert keine ungerouteten Ereignisse (`flushEvents`).
  - Skript-Ereignisse verbrauchen den Director-Slot.
  - Blöcke enden zur Schließzeit.
  - passive Resozialisierung.
  - Stepper-Rest-µs, Hash mit NaN-Token.
  - Upgrade-/Abriss-Validierung, Erstattung zählt nicht als Einnahme.
  - Regressionstests in `tests/unit/regressions.test.ts`.
- App-Modus ist Standard (`?spike` für die G1-Szene). Die Insel rendert wieder: Statische Szenen-Imports, weil Pixi seine Graphics-/Masken-Pipes als Modul-Seiteneffekt registriert.

- **M3 UI & Bauen:**
  - Echtes HUD aus sechs Komponenten (`src/ui/`): Topbar mit Fluss-Leiste aus `flow.ts` (stufenweises Einklappen nach Messung, „Wo hakt es?“), Klemmbrett mit Tutorial-Schritt und Ziel-Liste, Bauleiste mit Raum- und Personalmenü, Raum-/Rascal-Panels (Desktop-Karte, Kompakt-Bottom-Sheet), Tooltips/Toasts/Modals (Einstellungen, Hilfe), Bauwerkzeuge mit Geist (`src/render/ghost.ts`), Kanten-Drag, Abriss-Blase und Touch-✓/✕.
  - Esc-Reihenfolge: Modal > Stufen-Liste > Ziel-Liste > Werkzeug/Menü > Auswahl, ein Schritt pro Druck.
  - Fehlermeldungen je Grund statt allgemeinem Text; ein zentraler Einstellungs-Toast; Sprache zur Laufzeit umschaltbar.
  - Cross-Component-Review (1 schwer, 4 mittel, 11 leicht) behoben, danach zwei adversariale Prüfer (Test-Ehrlichkeit mit Mutationstests, Produktverhalten); deren Befunde ebenfalls behoben.
  - Abnahme M3: B1–B7, D5, D7 grün (Details QA_REPORT.md). B1-Screens für M5/M6 ausstehend.

## Offen
- B1-Screens Projekttafel, Rückkehr-Panel, Inspektionsergebnis, Versetzung (kommen mit M5/M6).
- Kosmetik: Scroll-Hinweis in Einstellungen/Hilfe fehlt; „Folgen“-Button im Rascal-Panel bei 907×510 DE ragt 5 px unter die Kante; Platzierungs-Icons in `tools.ts` noch als Inline-SVG.
- Taktungsregel §4.3 in 6/27 Seeds verletzt (Spar-Phase vor dem Klassenzimmer, siehe BALANCE.md §0). Der Bereich 10–15 min hängt an der Projekttafel (M5).
- Casual-Tempo bei 6–7 min eher an der unteren Toleranzgrenze.

## Abweichungen vom Brief
1. Eltern-Repo enthält `verkehrsmeister/`, nicht `glutnacht/`. Ohne Auswirkung.
2. Balance-Startwerte angepasst (`BALANCE.md` §2), Pflichtziele geändert.
3. SDK wird asynchron geladen (RULES_CHECK §5).
4. `reportGameCompletedPercentage`: +50 % pro Standort in v1 (RULES_CHECK §6).
5. Persistenz: Das eigene Repo wird über das Eltern-Repo auf den Branch `claude/rascal-rock-lockup` in C00KKYY/Games gepusht (vom Auftraggeber erlaubt): `cd /home/user/Games && git fetch ./rascal-rock-lockup main:claude/rascal-rock-lockup && git push -u origin claude/rascal-rock-lockup`.
6. Freiheitstor: Der Weg knickt am rechten Ende nach Süden ab, das Tor steht frontal. In der Seitenansicht war ein Tor im 3/4-Blick nicht lesbar. Die Leserichtung bleibt „Steg links → Tor rechts".
7. Ein Teil der Küste und die Insel-Silhouette sind ein einmalig erzeugtes Pixi-`Graphics`-Polygon (statische Geometrie, kein Canvas-2D pro Frame).

## Bekannte Bugs / Schwächen
- Profilköpfe wirken schnabelartig. Keine Cutaway-Wände. Video-Capture ist langsam (~1,8 s pro Frame unter SwiftShader).
- Bei 800×450 verdeckt das Raum-Panel als Bottom-Sheet fast die ganze Welt.

## Letzte Testergebnisse
- `npm test`: 112/112 grün · `npx playwright test`: 65 bestanden, 1 übersprungen (ausstehende B1-Screens) · tsc und eslint sauber · Balance unverändert: alle H1-Zeilen ✅, Taktung 6/27 offen

## Nächste 3 Schritte
1. M4: Tutorial-UI und Welt-Taps (Horn, Stempel, Kisten), Juice (Floating-Coins, Bau-Animation, Freischaltungs-Feier), Audio (ZzFX-SFX, Musik, Mute über SDK), Speichern/Laden mit Einstellungen.
2. Abnahme M4 (D1–D4, D6, D8–D10, E, G, A3/A5/A5b/A6) und Selbst-Review der ersten 10 Minuten.
3. G2: Material zusammenstellen und auf Freigabe warten.
