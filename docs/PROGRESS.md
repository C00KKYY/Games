# PROGRESS

**Aktueller Meilenstein:** M5 abgeschlossen mit offenen Punkten (Rest von Standort 1 + G2-Rückmeldung + Closer-Pass; Abnahme siehe QA_REPORT.md „Stand M5“ und „Closer-Pass M5“) → **M6 (Standort 2, P0b)**
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

- **M5 Rest von Standort 1 + G2-Rückmeldung** (Vertrag `docs/M5_DESIGN.md`, Abnahme QA_REPORT.md „Stand M5“):
  - Sim (`src/sim/`): Projekttafel (12 Projekte, eins zur Zeit, Timer laufen offline weiter), Abteilungsleitungen (Olli/Horn, Becca/Karren, Plätze ab 3★/4★), Inspektionstag (Gans läuft 45 s echte Wege, Noten A–F über 48 Stunden-Eimer, Sterne, Tipp, Wiederholung ab nächstem Spieltag), Versetzung mit Goldenen Schlüsseln und 6 Perks, Offline-Ertrag in 3 Stufen (still < 60 s, Nachspielen 60 s–5 min in ≤ 3000er-Blöcken, Formel + Rückkehr-Panel ab 5 min, Deckel 2 h + Perks), Tagespost (3 Aufgaben, Reset 00:00 Ortszeit, 1 Schlüssel je 3 Tage), Morgen-VIP (Teaser am Tagesende 1, beide Bedingungen), Director (Essensschlacht gescriptet ~10:00, nie zwei Ereignisse gleichzeitig), Wanduhr/`Clock`. SAVE_VERSION 2 mit Migration 1 → 2.
  - UI (`src/ui/`): Projekttafel, Leitungen, Tagespost, Inspektion (Prognose, Rundgang-Chip mit Folgen, pausierendes Ergebnis), Versetzung + Perk-Laden, Rückkehr-Panel + „Aufholen“-Chip, Speicher-Häkchen, Randpfeile, Ereignis-Banner, Folgeziele auf dem Klemmbrett, Land-Karte.
  - Welt (`src/render/`, `art/svg`): Katzen-Einbrecher mit Zylinder, Gans-Inspektorin, Biber-Leitungen, alle 12 Projekte sichtbar, VIP-Tafel am Steg, Standort-2-Silhouette (Leuchtturm), Schlägerei-Wolken, Parzellen mit Schildern. 9 Draw Calls pro Frame.
  - G2-Rückmeldung (`docs/G2_FEEDBACK.md`): Klemmbrett mit Warum/Sparbalken/„Jetzt bauen“, geführte erste Ziele, Strafakten-Kärtchen, früher 2. Entlassung, Land kaufen.
  - Balance-Pass (BALANCE.md §7–§8): alle 22 Pacing-Zeilen im Fenster, H1b/H2/H3/Schlüssel grün, H0 grün.
  - Closer-Pass (QA_REPORT.md „Closer-Pass M5“): Uhr-Umstellungs-Exploit geschlossen (Hochwassermarke `wall.maxSeenMs`,
    SAVE_VERSION 3 mit Migration 2 → 3), Tagespost nach falscher Zukunftsuhr nicht mehr gesperrt (Neuverankerung, Schlüssel nur
    an neuen Tagen), Tipp in den gestrichelten Bauplatz baut genau dort (Maus und Touch), Zahltag-Rücklage für Führung und
    „Jetzt bauen", Strafakten-Kärtchen mit vier Ankerplätzen, Profit zählt geschuldete Löhne, Klemmbrett erklärt „erst
    Personal", ehrlicheres Balance-Werkzeug (jede Zeile ≥ 90 % der Seeds, Optimal-Regel ohne Ausnahme, H1b/H2 brauchen
    endliche Vergleichszeiten, H2-Druck ohne die gescripteten Ereignisse), `npm run balance`, neue Tests
    `tests/unit/m5-closer.test.ts` und `tests/e2e/m5-closer.spec.ts`. Playtest-Zip und Single-File neu (`qa/g2/`).
  - Integration: Querschnitts-Fixes (Earl nur einmal, Horn-Tap einmal je Fähre, `happytime`/`reportGameCompletedPercentage`, Inspektionsmusik, Aufholen verlängert statt verworfen), Entlassungsziel 20 (H3), C = 600, Toasts warten hinter pausierenden Karten und dem Rückkehr-Panel, Hauptknöpfe der Karten bleiben beim Scrollen sichtbar, Rail weicht offenen Menü-Blättern, „Aufgeholt – N min“-Chip. Durchgespielt im Browser: `tools/selfreview/m5flow.spec.ts`, Bilder `qa/m5/flow/`.

## Offen
- **G2:** Rückmeldung des Auftraggebers ist eingearbeitet (QA_REPORT.md „G2-Rückmeldung“, „Closer-Pass M5“). Stand nach dem
  Frischtest des Prüfers und dem Closer-Pass: Punkt 1 („man weiß nicht, was man tun soll“) **weitgehend behoben** – an 22 von 24
  Prüfpunkten war der nächste Schritt samt Grund klar; die zwei Lücken (Hand auf „Personal“ ohne Grund, Bauplatz-Tipp baute
  woanders) sind behoben, die Führung treibt nicht mehr in unbezahlte Löhne. Punkt 2 („kein Reiz am Anfang“) **teilweise
  behoben** – klare Momente bei 0:47, 1:06, 1:21, ~2:35, ~2:45, 4:45, Strafakten-Kärtchen jetzt wirklich sichtbar; offen
  bleiben zwei ruhige Strecken (~1:35–2:35 Sparen aufs Klassenzimmer, ~3:00–3:55 nach dem Tunnel; Taktung 4/27 Seeds). Ein
  menschlicher Playtest mit dem neuen Build (`qa/g2/`) steht aus. Musikwahl steht weiter aus.
- M5-Abnahme offen (QA_REPORT.md „Stand M5“ + „Closer-Pass M5“, BALANCE.md §9; Messung jetzt mit Seed-Quote ≥ 90 % und
  Optimal-Regel für jede Zeile): **6/22 Pacing-Zeilen ❌** (Tutorial-Ende 16/27 Seeds und Optimal 40 % schneller; Strickstube
  Optimal 49 % schneller; 4. Entlassung 18/27, Kantine Lv5 20/27, erstes Projekt 22/27, erste Leitung 24/27 – alle Mediane im
  Fenster), **H1b ❌** (gutes Layout nur 12 % schneller als Zufallslayout), **H2-Naiv ❌** (Ziel-folgender Naiv-Bot +3 %;
  der wörtliche Gierig-Bot erreicht die Inspektion nie), Taktungsregel §4.3 in 4/27 Seeds (122–137 s nach dem Tunnel),
  Einnahmenmix bei 30:00 (Kisten 48 %, Entlassungen 34 %). H1-Teil „30 min Standort 2“ kommt mit M6.
- C4: Ein echter Browser-Freeze (CDP `frozen`) wirkt im Headless-Chromium nicht. Prüfung mit sichtbarem Browser (Xvfb) in M7.
- M8-Lizenzpass: `CREDITS.txt` (§15.5) fehlt noch, über die CC-BY-3.0-Pfeife ist noch zu entscheiden. Die OFL-Texte der Schriften stehen seit M4 in THIRD_PARTY_NOTICES.
- Ad-Mute im FULL-Build (adStarted → stumm, adFinished/adError → laut) wird mit dem FULL-Build gebaut und getestet (P2). Der BASIC-Build ruft keine Ad-API auf.
- Abweichung 15 (Steuerungs-Overlay bei kompakten Größen links unter dem Klemmbrett) bei G2 bestätigen lassen.
- Aufräumen außerhalb des Projekts (von Hand, Sicherheitsprüfung verweigert): `/dist` und `/layers.log` im Wurzelverzeichnis.
- Kosmetik: Scroll-Hinweis in Einstellungen/Hilfe fehlt; „Folgen“-Button im Rascal-Panel bei 907×510 DE ragt 5 px unter die Kante; Platzierungs-Icons in `tools.ts` noch als Inline-SVG.
- Bei 844×390 liegen Toasts kurz über der Kopfzeile eines offenen Bau-Menü-Blatts (flüchtiges Overlay, bewusst gelassen).

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

17. G2-Rückmeldung (docs/G2_FEEDBACK.md): Die Pacing-Tabelle §4.2 nennt „7:30–9:00 2. bis 4. Entlassung". Die 2. Entlassung
    kommt jetzt bewusst früh (Bagatell-Täter, ~2:40 beim Casual-Bot), damit die Lücke 0:28–5:20 einen Moment bekommt. Die
    gemessene Zeile „4. Entlassung" bleibt im ±20-%-Fenster (7:13). Strafmaß der ersten 12: 78–108 statt 70–100, übrige
    Fahrgäste der ersten Fähre 110–140 (BALANCE.md §6). Bitte bei G3 bestätigen.
18. Brief §4.2 „Strafakten-Kärtchen ploppen kurz auf" ist ab M5 gebaut (`src/ui/arrivalCards.ts`): alle Fahrgäste der ersten
    Fähre, danach die ersten zwei jeder Fähre und der VIP – nicht jeder Neuankömmling (sonst bei 6er-Fähren zu viel Text).

19. `happytime()` nur bei der ersten Entlassung und bei **bestandenen** Inspektionen (§11.1 „jeder bestandenen Inspektion“);
    §12.10 schreibt „jeder Inspektion“. Wir folgen der sparsameren Regel aus §11.1 und der SDK-Doku („sparingly“).
20. Pflichtziel „Entlasse 20 Schlingel“ statt 15 (Ziele sind Beispiele im Brief, §3.16): Mit 15 war die Inspektion beim
    Casual-Bot schon bei 19:48 möglich, H3 verlangt 22–30 min (jetzt 25:04). Schlüsselkonstante C = 600 (BALANCE.md §8).
21. Toasts zu Sim-Ereignissen (Tagesbilanz, Fähre, Ziele) warten, solange eine pausierende Karte (Inspektionsergebnis,
    Versetzung, Einstellungen) oder das Rückkehr-Panel offen ist; Antworten auf eigene Taps erscheinen sofort.
22. Fluchtscore (§3.12) mit **binärer Abdeckung am Standort des Schlingels** (0,85 im Radius einer Wache, sonst 0) statt
    „Anteil der Kacheln der Räume, die ein Rascal heute nutzt" (§3.10). Der Kachelanteil wurde im Closer-Pass gebaut und auf
    27 Seeds gemessen: H3 je Seed fiel von 24/27 auf 20/27 streng in 22–30 min, ein Unit-Test-Seed rutschte auf 30:24, ohne
    für Spielende sichtbaren Unterschied. Die Kalibrierung bleibt auf der binären Lesart (BALANCE.md §9). Bei G3 bestätigen.
23. Tagespost-Uhrschutz: Liegt der Ortstag mehr als 3 Tage vor dem Post-Tag (Uhr war weit vorgestellt), springt der
    Post-Tag auf heute (Aufgaben geschlossen, ohne Belohnung); Schlüssel-Streaks zählen nur Post-Tage ab dem höchsten je
    gerollten Tag. Der Brief regelt Uhr-Rücksprünge nicht im Einzelnen (§3.16, §3.18).

## Bekannte Bugs / Schwächen
- Profilköpfe wirken schnabelartig. Keine Cutaway-Wände. Video-Capture ist langsam (~1,8 s pro Frame unter SwiftShader).
- Bei 800×450 verdeckt das Raum-Panel als Bottom-Sheet fast die ganze Welt.

## Letzte Testergebnisse
- **Stand Closer-Pass M5 (2026-11-07):** `tsc --noEmit` und `eslint src tests` sauber · `vitest run`: 25 Dateien, **342/342** ·
  `npx playwright test --workers=1` (Produktions-Build): **133/134**, 0 übersprungen, 62 min; rot nur B5 DOM am 120-s-Testlimit
  (~115 s für 44 Zustände). Nach einer Änderung in `tools.ts` Nachlauf der betroffenen Dateien 49/50 (wieder nur B5 am Limit),
  B5-Testlimit auf 300 s → B5 2/2 · A2 464–633 ms, D3 2,6–3,7 s, D8 25,5 s, A4 5,03 MB/101 Dateien, initial 0,55 MB, A6 600 s
  ohne Fehler · Single-File von file:// 2/2 · `npm run balance` (27 Seeds): 16/22 Pacing-Zeilen, H2-Zufall/H2-Druck/H3/Schlüssel/H0
  ✅, H1b/H2-Naiv ❌, Taktung 4/27, Mix 30:00 0/27 (BALANCE.md §9)
- **Stand M5-Integration (2026-11-07):** `tsc --noEmit` und `eslint src tests` sauber · `vitest run`: 24 Dateien, **328/328** · `npx playwright test --workers=1` (Produktions-Build): **132/132 bestanden, 0 übersprungen**, 56,5 min (B1 mit den 4 M5-Screens, B4/D5 über alle M5-Zustände, H6) · A2 424 ms, D3 3,9 s, D8 25,5 s, A4 5,03 MB/101 Dateien, initial 0,54 MB, A6 600 s ohne Fehler · Browser-Durchlauf `m5flow` 6/6 (EN/DE × 1280×720/907×510/844×390 Touch), 0 Fehler · Balance 27 Seeds: 22/22 Pacing-Zeilen, H1b/H2/H3/Schlüssel/H0 grün; offen Taktung 4/27 und Mix 30:00
- Stand nach den Prüfer-Befunden M4 (2026-11-05): `tsc --noEmit` und `eslint src tests` sauber · `vitest run`: 16 Dateien, **196/196** grün · `npx playwright test --workers=1` (Produktions-Build): 107 Tests, **106 bestanden, 0 fehlgeschlagen, 1 übersprungen** (ausstehende B1-Screens M5/M6), 40,4 min · A2 496 ms, D2 315 ms, D3 2,8 s, D8 28,5 s, D9 Entlassung 26,5 s, A4 4,73 MB/94 Dateien, initial 1,10 MB, A6 601 s/676 s ohne Fehler · Balance unverändert: alle H1-Zeilen ✅, Taktung 6/27 offen
- Single-File-Build von file://: 2/2 (offline und mit SDK-Mock) · G2-Video neu aufgenommen (1800 Frames, 0 Fehler) · Selbst-Review: 4 × 600 s ohne pageerror, console.error oder Warnung (vor diesen Fixes)

**M4 abgeschlossen.** Offen bleiben nur Punkte außerhalb von M4: FULL-Ad-Mute (P2), C4 im sichtbaren Browser (M7), Lizenzpass mit `CREDITS.txt` (M8) und die G2-Rückmeldung.

## Nächste 3 Schritte
1. **M6 Standort 2** (P0b, Gullrock Lighthouse): aus der Silhouette ein echtes Versetzungsziel machen (`SITES[1].available`),
   H1 „30 min Standort 2 mit Perks“, B1-Screens für Standort 2. Vorher den Playtest-Build (`qa/g2/`) an den Auftraggeber.
2. Balance-Rest Standort 1 (BALANCE.md §9): Layout stärker in den Durchsatz (H1b), Streuung der frühen Strafmaße (Seed-Quote
   4. Entlassung/Kantine Lv5/Projekt/Leitung), Mix 30:00, Taktung nach dem Tunnel; jedes Mal `npm run balance` (27 Seeds, ~11 min).
3. G3 vorbereiten: menschlicher Playtest Inspektion/Versetzung, Entscheidungen zu Abweichung 4 (+50 %/+20 %), 17, 19, 20, 22,
   zur Lesart von H2-Naiv (Ziel-folgend vs. wörtlich gierig) und zum Tutorial-Ende 0:57 (G2-Kürzung vs. 1:10–1:30).
