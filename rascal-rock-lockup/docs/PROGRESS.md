# PROGRESS

**Aktueller Meilenstein:** M4 abgeschlossen (Tutorial, Audio, Juice, Speichern; Review, Abnahmetests, Selbst-Review) → G2 → M5
**Gates:** G1 **freigegeben** (2026-11-04) · G2: Material bereit; Auftraggeber hat mit "mach fertig" das Weiterarbeiten freigegeben, Musikwahl und eigener Playtest stehen aus · G3 offen

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

- **M4 Feel, Audio, Speichern, Tutorial:**
  - Tutorial-UI (`src/ui/tutorial.ts`): Ring/Hand auf das Ziel, Wärter-Blase ≤ 8 Wörter mit Skip (aria-label + Tooltip), Ein-Tipp-Geist fürs Waschhaus, Steuerungshinweis, JIT-Tipps (höchstens 1 pro 30 s), die verschwinden, sobald ihr Anlass weg ist. Die Blase weicht Panels, Toasts, Menüs und Ziel aus.
  - Audio (`src/audio/`): 36 MP3s aus CC0/CC-BY-Quellen (`docs/AUDIO.md`), Mixer mit Bussen, Dedupe, Rate-Limit, Jingle-Priorität. Start-Bundle 12 SFX + `musicDayLo` (16 kbps), Überblendung auf `musicDay` phasengleich. Mute über SDK, Tab, Ad und Einstellungen.
  - Juice (`src/render/juice.ts`): Münzen und Plaketten (zusammengefasst), Bau-Animation, Konfetti, Meilenstein-Sterne, Fluchtmarker (Ring + „!“) am Ausbrecher, Zähler-Tweens, Freischaltungs-Feier.
  - Speichern (`src/save/`): 2 Slots über SDK-Data bzw. localStorage, Einstellungen im Spielstand, „Spielstand zurücksetzen“.
  - Review-Fixes (7 UI-, 5 Juice/Audio-Punkte) und Abnahme: `tests/e2e/m4-onboarding.spec.ts`, `m4-accept.spec.ts`, `m4-save.spec.ts`, `m4-fixes-ui.spec.ts` (A2–A4, A6, D1–D4, D6, D8–D10, E, G1–G3, C4). D8 erste Entlassung bei 28,5 s, D9 Skip bei 3 s, A4 4,73 MB/94 Dateien, initial 1,10 MB.
  - Selbst-Review der ersten 10 Minuten (4 Läufe EN/DE × 1280/907): `docs/QA_REPORT.md`, Bilder `qa/m4/`. Werkzeuge `tools/selfreview/`.
  - Prüfer-Befunde nach der Abnahme behoben (QA_REPORT.md „Stand M4“): Skip bleibt im Tutorial auch bei offenem Menü auf Handy-Größen sichtbar (Skip-Knopf als letzte Blasen-Form). Bau-Menüs verdecken den Klemmbrett-Chip nicht mehr (D4). `musicDay` lädt erst nach `gameplayStart` (§8.4). Das Klemmbrett springt bei neuem Ziel an Ort und Stelle auf, statt aus dem Bild zu gleiten. Der Fluchtmarker springt nicht mehr bei ≥ 3 Ausbrechern. OFL-Texte der Schriften stehen in THIRD_PARTY_NOTICES.
  - G2-Material `qa/g2/`: Playtest-Zip mit ANLEITUNG.txt und Musik-Hörproben, Single-File-Build (läuft per Doppelklick von file://, geprüft mit `tools/selfreview/singlefile.spec.ts`), 60-s-Video, `MUSIK.md`. Beides markiert als „nur Playtest, nicht einreichen“.

## Offen
- **G2:** Musikwahl und eigener Playtest des Auftraggebers stehen aus. Die Rückmeldungen kommen in QA_REPORT.md und werden vor P0b/P1 abgearbeitet.
- Befunde aus dem Selbst-Review (QA_REPORT.md): zweite Entlassung erst bei ~5:20, Leerlauf 1:05–3:00 und 3:33–6:18. Kein Randhinweis bei einem Ausbrecher außerhalb des Bildes. ~23 s Warten im Tutorial-Schritt 3. Viel ungenutztes Geld ab Minute 6.
- C4: Ein echter Browser-Freeze (CDP `frozen`) wirkt im Headless-Chromium nicht. Prüfung mit sichtbarem Browser (Xvfb) in M7.
- M8-Lizenzpass: `CREDITS.txt` (§15.5) fehlt noch, über die CC-BY-3.0-Pfeife ist noch zu entscheiden. Die OFL-Texte der Schriften stehen seit M4 in THIRD_PARTY_NOTICES.
- Ad-Mute im FULL-Build (adStarted → stumm, adFinished/adError → laut) wird mit dem FULL-Build gebaut und getestet (P2). Der BASIC-Build ruft keine Ad-API auf.
- Abweichung 15 (Steuerungs-Overlay bei kompakten Größen links unter dem Klemmbrett) bei G2 bestätigen lassen.
- Aufräumen außerhalb des Projekts (von Hand, Sicherheitsprüfung verweigert): `/dist` und `/layers.log` im Wurzelverzeichnis.
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

8. Musik-Platzhalter `musicDayLo` liegt in `INITIAL_MUSIC`, nicht in `INITIAL` (sonst 13 statt ≤ 12 Sounds). Er hat 16 statt 24–32 kbps, sonst wären < 200 KB nicht erreichbar. Die 250-KB-Grenze gilt für SFX plus Platzhalter zusammen.
9. Fluchttipp (JIT) hält die 30-s-Sperre ein (Brief §6.2 ohne Ausnahme). Er verschwindet aber, sobald der Ausbrecher gefangen ist.
10. A4: Die CrazyGames-SDK-URL in index.html ist die einzige fremde URL (Pflicht laut §11.1). MB wird dezimal gezählt.
11. A6 deckt beide Lesarten ab: 10 min Echtzeit bei 2× und ≥ 10 min Spielzeit.
12. Single-File-Playtest-Build: `vite.config.ts` bettet mit `SINGLEFILE=1` die Laufzeit-Dateien aus `public/` (UI-Icons, Atlas, Audio) als data:-URLs ein (`src/platform/assets.ts`). Sonst liefe er von file:// nicht. Der normale Build ist unverändert (leere Tabelle).
13. Selbst-Review-Montagen sind mit ImageMagick `montage` gebaut (mit Zeitlabel je Kachel) und mit ffmpeg nach WebP gewandelt. Das ist kein reines ffmpeg-`tile`.
14. G2-Video: Headless-Chromium nimmt keinen Ton auf. Der Ton in `qa/g2/first-60s.mp4` ist aus dem Mixer-Log des Spiels mit den ausgelieferten MP3s nachgemischt (`tools/selfreview/mix-audio.ts`), also eine Annäherung.
15. Steuerungs-Overlay (Brief §6.2 „unten links“): Bei den Kompaktgrößen (≤ 900 px Breite, z. B. 800×450, 844×390) liegt die Fähre, also das Ziel von Tutorial-Schritt 1, in der Ecke unten links. Dort hat das Overlay keinen freien Platz, ohne Fähre und Zeigehand zu verdecken. Es steht dann links unter dem Klemmbrett-Chip (Slot `lc`). Bei den breiten Größen steht es unten links (`bl`). Der Test `m4-fixes-ui` lässt `lc` nur bei ≤ 900 px zu. Entscheidung bei G2 bestätigen lassen.
16. Bau-Menüs auf kurzen Handy-Bildschirmen (844×390, 667×375, 800×450 Touch): Das Menü-Blatt beginnt rechts vom Klemmbrett-Chip und ist dafür schmaler (horizontal scrollbar wie bisher). So bleibt das Ziel-Widget sichtbar (D4). Findet die Tutorial-Blase dann keinen Platz, bleibt als letzte Form der Skip-Knopf allein stehen, auch neben der Bauleiste (§6.2 „dauerhaft sichtbar“).

## Bekannte Bugs / Schwächen
- Profilköpfe wirken schnabelartig. Keine Cutaway-Wände. Video-Capture ist langsam (~1,8 s pro Frame unter SwiftShader).
- Bei 800×450 verdeckt das Raum-Panel als Bottom-Sheet fast die ganze Welt.

## Letzte Testergebnisse
- Stand nach den Prüfer-Befunden M4 (2026-11-05): `tsc --noEmit` und `eslint src tests` sauber · `vitest run`: 16 Dateien, **196/196** grün · `npx playwright test --workers=1` (Produktions-Build): 107 Tests, **106 bestanden, 0 fehlgeschlagen, 1 übersprungen** (ausstehende B1-Screens M5/M6), 40,4 min · A2 496 ms, D2 315 ms, D3 2,8 s, D8 28,5 s, D9 Entlassung 26,5 s, A4 4,73 MB/94 Dateien, initial 1,10 MB, A6 601 s/676 s ohne Fehler · Balance unverändert: alle H1-Zeilen ✅, Taktung 6/27 offen
- Single-File-Build von file://: 2/2 (offline und mit SDK-Mock) · G2-Video neu aufgenommen (1800 Frames, 0 Fehler) · Selbst-Review: 4 × 600 s ohne pageerror, console.error oder Warnung (vor diesen Fixes)

**M4 abgeschlossen.** Offen bleiben nur Punkte außerhalb von M4: FULL-Ad-Mute (P2), C4 im sichtbaren Browser (M7), Lizenzpass mit `CREDITS.txt` (M8) und die G2-Rückmeldung.

## Nächste 3 Schritte
1. M5 (freigegeben mit „mach fertig“): Projekttafel, Rückkehr-Panel, Inspektion. Dabei die Pacing-Befunde aus dem Selbst-Review (zweite Entlassung, Leerlauf 1–3 min) angehen.
2. G2-Rückmeldung einarbeiten, sobald sie kommt: Musikwahl (`qa/g2/MUSIK.md`, `npm run audio:build`) und Notizen aus dem Playtest.
3. Kleine UX-Befunde: Randhinweis für Ausbrecher, Wartezeit im Tutorial-Schritt 3, Scroll-Hinweis im Räume-Menü bei 907×510.
