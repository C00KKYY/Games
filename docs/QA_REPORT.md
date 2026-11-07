# QA_REPORT

## Gates

### G1 – Art-Spike
- Material: `docs/ART_SPIKE.md`, `qa/g1/` (Screenshots Tag/Nacht 1280/907/800, Kantine Stufe 1/2, Charaktere 4 Richtungen, Kontaktbogen, Cover-Entwurf, 20-s-Video), Playtest-Zip.
- **Freigabe: ja** (Auftraggeber, 2026-11-04; zuerst als „brides jq“ = „beides ja“, danach ausdrücklich bestätigt). Keine Änderungswünsche genannt.
- Selbst festgestellte Schwächen, die im Art-Pass (M3/M7) bearbeitet werden: Profilköpfe, Figurengröße bei 800×450, Wand-Cutaway, Bodenvariation, Wasser, Cover (Risiko: extern), Fenster-Lichtkegel.
- Blindvergleich: bestanden mit Einschränkung (siehe ART_SPIKE.md). Daraus abgeleitet: Fluss-Leiste lesbarer machen, Bürokratie-Satire sichtbarer machen (Altersanmutung).

### G2 – erste 10 Minuten
- **Material bereit** (2026-11-05), in `qa/g2/`: Playtest-Zip mit `ANLEITUNG.txt` und Musik-Hörproben, Single-File-Build,
  60-s-Video `first-60s.mp4`, `MUSIK.md`. Beides ist als „nur Playtest, nicht einreichen“ markiert.
- Der Auftraggeber hat mit „mach fertig“ das Weiterarbeiten freigegeben. **Ausstehend:** Musikwahl und eigener Playtest
  bei 907×510 mit frischem Profil. Seine Rückmeldungen werden hier eingetragen und abgearbeitet.

### G3 – fertiger Build
- offen (nach M7)

## Automatisierte Tests (Stand M3)
| Bereich | Test | Status |
|---|---|---|
| A | Test 0, A1, A1b (verzögert/abgebrochen), A7 | grün |
| C | C1a (p95 0,46 ms @ 206 Agenten), C2 (60/144/165 Hz, Hash) | grün |
| F | Palette, Platzhalter, kein Text in SVG, Nacht-Luminanz 0,476 | grün |
| D | D7 (Keys + Platzhalter EN=DE inkl. Parts-Tabellen), D1 (≤ 8 Wörter) | grün |
| D | D5: jeder sichtbare Button hat Label/Icon **und** einen gebundenen Tooltip mit Titel (über `__tipOf`); jede Taste aus dem Quelltext steht im Hilfe-Overlay (`tests/unit/hotkeys.test.ts`) | grün |
| H | H0 (Economy-Sheet), H1 erste 10 min (27 Seeds, 12 Zeilen), H4 (Save/Load-Hash) | grün |
| H | §4.3 Taktung (≤ 120 s ohne Neues) | **offen**: 6/27 Seeds, Lücke 129–153 s in der Spar-Phase vor dem Klassenzimmer (BALANCE.md §0) |
| – | Review-Regressionen (8 Tests) | grün |
| B | B1 Screenshot-Matrix: 7 Screens (Gameplay Start/Mitte, Bauleiste, Personal, Raum-Panel, Rascal-Panel, Einstellungen, Hilfe) × 10 Größen × EN/DE, dazu 844×390 Touch. DOM-Prüfung: Überlappung zwischen und innerhalb der Blöcke, Textüberlauf auch bei `overflow:visible`, Schrift ≥ 12 px, Fließtext ≥ 14 px. Zusätzlich Bestätigungen und Übergangsebenen (Ziel-Liste, Stufen-Liste, Cursor-Label, ✓/✕, Abriss-Blase, Tooltips, Toasts) | grün |
| B | B1 Screens Projekttafel, Rückkehr-Panel, Inspektionsergebnis, Versetzung | **ausstehend** (Systeme kommen in M5/M6; als `pending` annotiert, nicht als bestanden gezählt) |
| B | B2 Backing-Store = CSS × min(DPR,2) bei DPR 1/1,5/2/3 | grün |
| B | B3 Kontrast (Text ≥ 4,5:1, wichtige UI ≥ 3:1, Welt-Text mit Plakette oder Schatten), auch Tutorial-Zustand und Bestätigungen | grün |
| B | B4 Touch-Ziele ≥ 44 px bei 667×375, 800×450, 844×390, 1024×768, 1180×820 | grün |
| B | B5 kein Fullscreen, keine externen Links (DOM + Bundle-Scan) · B6 `user-select:none` | grün |
| B | B7 800×450: Spielfläche ≥ 70 %, Startgefängnis inkl. Steg sichtbar, Rascal ≥ 22 px, weltverankerte Labels ≥ 14 px | grün |

Stand 2026-11-05: `vitest` 112/112, `playwright` 65 bestanden, 1 übersprungen (die ausstehenden B1-Screens), tsc und eslint sauber. Die Tests wurden per Mutationstest geprüft: absichtlich eingebaute Fehler (10-px-Schrift, Überlappung, fehlender Tooltip, 30-px-Touch-Ziel, externer Link, schwacher Kontrast) lassen die jeweilige Prüfung scheitern.

### Visuelle Prüfung M3 (Montage `qa/m3/montage-{en,de}.png`, Einzelbilder 800×450 / 907×510 / 1920×1080 in `qa/m3/b1/`)
- Keine Überlappung, kein abgeschnittener Text, keine Schrift unter 12 px. Lange deutsche Wörter passen („Resozialisierungspunkte“, „+1 einstellen (40)“).
- Bei 800×450 nimmt das Raum-Panel als Bottom-Sheet fast die ganze Höhe ein (`qa/m3/b1/de/room-panel-800x450.png`). Es ist lesbar, verdeckt aber die Welt; für G2 beobachten.
- Kosmetisch offen: Einstellungen/Hilfe bei 800×450 und 907×510 schneiden die letzte Zeile am Scroll-Rand ohne Verlaufshinweis ab. Im Rascal-Panel bei 907×510 DE liegt der Rahmen des „Folgen“-Buttons ca. 5 px unter der Kante (scrollbar).
- Desktop: Das Raum-Panel bleibt offen, während ein Werkzeug aktiv ist (Werkzeug-UI liegt darüber, verdeckt aber rechts einen Teil der Karte).

## Stand M4 (2026-11-05, nach den Prüfer-Befunden)

### Abnahmetests M4 (Brief §12.2–§12.8; Meilenstein M4: A1–A6, D1–D10, E, G, H4)
Spec-Dateien unter `tests/e2e/` bzw. `tests/unit/`. Zahlen aus dem letzten vollen Lauf (`playwright --workers=1`, Produktions-Build).

| Test | Prüfung (Brief) | Ergebnis | Beleg |
|---|---|---|---|
| A1 / A1b | Ladebildschirm bei 100/300 ms, auch mit verzögertem/abgebrochenem SDK | grün | `m0-infra.spec.ts` |
| A2 | `gameplayStart` ≤ 5 s nach dem Laden | grün (496 ms) | `m4-onboarding.spec.ts` „A2 … D3“ |
| A3 | 0 Klicks bis zur ersten Spieleraktion | grün (0 Eingaben vor der ersten Aktion) | `m4-onboarding.spec.ts` „A2 … D3“ |
| A4 | ≤ 8 MB, initial ≤ 3 MB, < 1500 Dateien, grep auf fremde URLs | grün (dist 4,73 MB / 94 Dateien, 0 fremde URLs außer dem SDK-Tag, initial 1,10 MB) | `m4-accept.spec.ts` „A4 dist …“, „A4 initial …“ |
| A4 / §8.4 | vor `gameplayStart` nur Tutorial-Sounds + Musik-Loop 1 in niedriger Qualität; `musicDay` erst danach | grün (neu) | `m4-accept.spec.ts` „A4 initial …“ |
| A5 / A5b | SDK-Init hängt / 8 s verzögert mit Spielstand | grün | `m4-save.spec.ts` |
| A6 | 0 console errors / pageerrors in 10 min Bot-Sitzung | grün (601 s Echtzeit, 676 s Spielzeit, 0 Fehler, 0 Warnungen) | `m4-accept.spec.ts` „A6 …“ |
| A7 | nur localhost-Requests | grün | `m0-infra.spec.ts` |
| D1 | ≤ 8 Wörter pro Schritt, Skip vorhanden und wirksam | grün | `m4-onboarding.spec.ts` (Tutorial-Pfad, D9), `tests/unit/tutorial-ui.test.ts` |
| D2 | erste Aktion ≤ 5 s nach `gameplayStart` | grün (315 ms) | `m4-onboarding.spec.ts` „A2 … D3“ |
| D3 | erstes Feedback ≤ 15 s | grün (2,8 s) | `m4-onboarding.spec.ts` „A2 … D3“ |
| D4 | Ziel-Widget 100 % sichtbar (Tutorial: Schritt mit n/4) | grün: Tutorial-Pfad 1280 EN und 844×390 DE, Skip-Pfad, **neu** jede Frame mit offenem Räume-/Personal-Menü bei 844×390, 667×375, 800×450 (Touch und Maus); die Probe misst das Widget jetzt auch während seiner Animation (kein `finish()` mehr, Deckkraft ≥ 0,6) | `m4-onboarding.spec.ts` (Pfad, D9, „menu open @ …“) |
| D5 | Label/Icon + Tooltip je Button, jede Taste im Hilfe-Overlay | grün | `m3-ui.spec.ts`, `tests/unit/hotkeys.test.ts` |
| D6 | keine blockierenden Pop-ups in 60 s | grün | `m4-onboarding.spec.ts` (Tutorial-Pfad) |
| D7 | i18n-Keys EN = DE | grün | `tests/unit/i18n.test.ts` |
| D8 | erste Entlassung ≤ 90 s | grün (28,5 s) | `m4-onboarding.spec.ts` (Tutorial-Pfad) |
| D9 | Skip bei 3 s: Entlassung ≤ 120 s, Klemmbrett sofort | grün (Wash-Hut-Ziel im selben Frame, Entlassung ohne Eingabe bei 26,5 s) | `m4-onboarding.spec.ts` „D9 …“ |
| D10 | USP 1–3 bis 2:00, USP 4 bis 3:30 | grün (USP 1 28,5 s, USP 2 Bau 2,5 s, USP 3 Steg 1,3 s, USP 4 Tunnel 180 s) | `m4-onboarding.spec.ts` (Tutorial-Pfad) |
| E | Feedback im selben Frame, `mixer.play` ≤ 1 Frame, Coins/Tweens, Bau, Laufanimation, Feier | grün | `m4-onboarding.spec.ts` (Tutorial-Pfad), `tests/unit/juice.test.ts` |
| G | Mute über SDK / Ad-Grund / verstecktes Tab, Mute im Spielstand, Pegel, klickfreie Loops | grün | `m4-accept.spec.ts` (G …), `tests/unit/audio-assets.test.ts`, `tests/unit/audio-runtime.test.ts` |
| G (FULL) | adStarted → stumm, adFinished/adError → laut | **offen** (nicht anwendbar): Der BASIC-Build ruft keine Ad-API auf (geprüft); die Ad-Verdrahtung entsteht mit dem FULL-Build (P2, §11.2) und wird dort getestet | – |
| C4 | verstecktes Tab + CDP frozen: Rendering pausiert, stumm, kein `gameplayStop` | grün; der echte CDP-Freeze wirkt im Headless-Chromium nicht (Pausieren über `ticker.stop()`), Prüfung im sichtbaren Browser in M7 | `m4-accept.spec.ts` „G/C4 …“ |
| H4 | Hash nach Speichern/Laden vor dem ersten Tick, Offline-Deckel, Zeitsprünge | grün | `tests/unit/save.test.ts`, `tests/unit/save-store.test.ts` |
| §6.2 Skip | „Skip tutorial ist dauerhaft sichtbar“: in jeder Tutorial-Frame ein klickbarer Skip | grün (neu) | `m4-fixes-ui.spec.ts` (Ebenen-Sampler, 4 Größen), `m4-onboarding.spec.ts` „menu open @ …“ |

Gesamt: `tsc --noEmit` und `eslint src tests` sauber · `vitest run` 16 Dateien, **196/196** · `playwright test --workers=1` 107 Tests: **106 bestanden, 0 fehlgeschlagen, 1 übersprungen** (B1-Screens M5/M6, als `pending` annotiert), 40,4 min. **Offen** ist nur der FULL-Ad-Mute (gehört zum FULL-Build). Kein M4-Abnahmetest schlägt fehl.

### Prüfer-Befunde nach M4 und was daraus wurde
- **MITTEL, behoben:** Bei 844×390 (auch 667×375 und 800×450 Touch) war im Tutorial bei offenem Räume-/Personal-Menü kein Skip
  zu sehen. Die Blase hat jetzt eine vierte, letzte Form: nur der Skip-Knopf, der auch neben der Bauleiste stehen darf.
  Zusätzlich bleibt links neben dem Menü Platz für das Klemmbrett (nächster Punkt); dort passt dann meist schon die kleine Blase mit Punkten + Skip.
  Neue Prüfung in jeder Frame: ein sichtbarer Skip, der an seinem Mittelpunkt oben liegt. Gegenprobe: Ohne die neue Form scheitert der Test
  (800×450 Touch: 160 Frames ohne Skip).
- **NIEDRIG-MITTEL, behoben:** D4 bei offenem Menü auf kurzen Handy-Bildschirmen. Das Menü-Blatt beginnt dort rechts vom
  Klemmbrett-Chip (`--bb-res`, `src/ui/buildbar.ts`). Gegenprobe: Ohne die Reservierung meldet die neue D4-Probe 360 verdeckte Frames.
  Im Tutorial wird die Waschhaus-Karte im schmaleren Menü einmal ins Bild gescrollt.
- **NIEDRIG, behoben:** `musicDay` wurde mit dem Start-Bundle geladen. Es lädt jetzt als erstes in Phase 2 (nach `gameplayStart`).
  Der A4-Test prüft das mit einer Probe ab dem Start der Audio-Laufzeit.
- **NIEDRIG, als Abweichung 15 dokumentiert:** Das Steuerungs-Overlay steht bei ≤ 900 px Breite links unter dem Klemmbrett statt unten
  links, weil dort die Fähre (Ziel von Schritt 1) liegt. Der Test lässt `lc` nur noch bei kompakten Größen zu.
- **NIEDRIG, behoben:** Das Klemmbrett schob ein neues Ziel von außerhalb des Bildes mit Deckkraft 0 herein. Jetzt springt es an Ort und Stelle
  auf (Skalierung 0,9 → 1, Deckkraft ≥ 0,7). Die D4-Probe beendet keine Animationen mehr, die erfundene „≤ 500 ms“-Prüfung ist entfernt.
- **NIEDRIG, behoben:** Bei mehr Ausbrechern als Markern (2) sprang der Marker bei jedem Scan zwischen den Figuren. Nur ein neues Fluchtereignis darf jetzt
  einen belegten Marker übernehmen, der Scan nicht mehr (`escSlot` in `src/render/juiceMath.ts`, Unit-Test).
- **NIEDRIG, behoben:** `layout.test.ts` „every door position …“ hat ein eigenes Zeitlimit von 20 s (lief knapp über die 5 s von vitest, wenn die Kerne ausgelastet waren). Keine Schwelle betroffen.
- **NIEDRIG, offen (nicht anwendbar in M4):** Ad-Mute im FULL-Build (siehe Tabelle).
- **INFO:** Die OFL-Texte von Fredoka und Inter stehen jetzt in `licenses/THIRD_PARTY_NOTICES.txt`. Sie werden beim Build aus den LICENSE-Dateien der Pakete erzeugt.
  `CREDITS.txt` (§15.5) und die Entscheidung zur CC-BY-3.0-Pfeife kommen mit dem Lizenzpass in M8.
  `/dist` und `/layers.log` im Wurzelverzeichnis liegen außerhalb des Projekts und müssen von Hand gelöscht werden.
- Selbst-Review „Toasts überlappen beim Nachtsprung“: Das ist kein Fehler. Toasts liegen in einer Flex-Spalte und können sich nicht überlappen.
  Im Beleg-Bild (`qa/m4/selfreview/de-1280x720/016-115s-nightSkip.webp`) schneiden sich die Kästen nicht. Die Transparenz kommt vom Ein- bzw. Ausblenden. Der B1-Toast-Stapel-Audit bleibt grün.
  „Tor/Steg nicht per Klick wählbar“ ist ebenfalls kein Fehler: Ein Tipp aufs Tor stempelt, das Tor hat kein Panel.

G2-Material nach diesen Änderungen neu erzeugt: Playtest-Zip und Single-File-Build (`tools/selfreview/singlefile.spec.ts` 2/2), 60-s-Video.

## Selbst-Review M4 (erste 10 Minuten)

Nur ein Hinweis für den Auftraggeber, kein Abnahmekriterium (Brief §13.1). Ich bewerte bewusst streng.

**Ablauf.** Produktions-Build über `vite preview`, frisches Profil je Lauf. Vier Läufe: EN 1280×720, EN 907×510, DE 1280×720,
DE 907×510, je 600 s Spielzeit. Die Spielzeit läuft über `?capture=1` und `__step` (deterministisch, 1/30 s pro Schritt).
Werkzeug: `tools/selfreview/selfreview.spec.ts`. Der „Spieler“ tippt nach 1 s Reaktionszeit mit echten Mausklicks dorthin,
wo der Tutorial-Ring hinzeigt. Danach reagiert er auf Horn, Stempel, Kisten, Ausbrecher und Raufereien. Etwa alle 4–8 s
entscheidet das Gehirn des Casual-Balance-Bots (`tools/bots.ts`), was gebaut, eingestellt oder ausgebaut wird. Ausgeführt
wird das mit echter UI: Räume-Menü → Karte → Ziehen auf der Karte, Personal → Einstellen, Raum anklicken → Ausbauen.
Die Kamera bewegt sich nur über `ctx.focusTile`, also wie mit „Zeig mir“.
Screenshots (DPR 1, WebP) gibt es alle 15 s Spielzeit, bei 0:05 und bei jedem wichtigen Sim-Ereignis. Sie liegen in
`qa/m4/selfreview/<lang>-<größe>/NNN-<t>s-<label>.webp` (272 Bilder, je Lauf eine `log.json` mit Aktionen, Ereignissen und
Endzustand). Montagen mit Zeitlabel: `qa/m4/montage-<lang>-<größe>.webp`. Ich habe alle vier Montagen und gut 20
Einzelbilder angesehen.

**Einschränkungen.** Der Spieler ist ein Skript. Es baut nie einen zweiten Zellentrakt, obwohl das Ziel „Besitze 12 Betten“
ab ca. 5:30 dasteht und die Toasts „Fähre fuhr mit N Schlingeln ab. Keine Betten.“ wiederholt kommen. Ein Mensch hätte das
wohl getan. Die zweite Hälfte wirkt deshalb dünner, als sie für einen Menschen wäre. Die Kamerasprünge in den Bildern
stammen vom Skript (focusTile), nicht vom Spiel. Gehört hat niemand etwas: Audio bewerte ich über das Mixer-Log, die
Pegelmessungen (`qa/audio/levels.json`) und den nachgemischten Ton im G2-Video. In den 1280er-Läufen scheiterten 9 bzw. 12
von ca. 80 Aktionen am Skript (Tor/Steg ließen sich nicht per Klick wählen). Das betrifft nur das Skript.

**Kennzahlen der vier Läufe (600 s)**

| Lauf | Entlassungen | Räume | Ausbrecher gefangen | Sterne | Münzen am Ende | Fehler (pageerror/console.error/warn) |
|---|---|---|---|---|---|---|
| EN 1280×720 | 10 | 9 | 2/2 | 2 | 1.937 | 0/0/0 |
| EN 907×510 | 10 | 9 | 2/2 | 2 | 1.772 | 0/0/0 |
| DE 1280×720 | 11 | 9 | 3/3 | 2 | 2.801 | 0/0/0 |
| DE 907×510 | 10 | 9 | 3/3 | 2 | 2.257 | 0/0/0 |

Zeitachse (in allen Läufen fast gleich): Tutorial fertig bei 0:31 mit erster Entlassung bei 0:28. Strickstube ca. 1:00, dann
Sparen. Klassenzimmer und Wachposten bei 3:20–3:30, erster Löffeltunnel bei 3:00. **Die zweite Entlassung kommt erst bei
5:19–5:20.** Danach Entlassungen etwa alle 10–60 s, ab ca. 5:30 meist nur noch Ausbauten.

**Noten** (verankerte Skala: 5 = nicht von Leek Factory/Prison Life zu unterscheiden, 4 = erkennbar Indie, aber nirgends
billig, 3 = mindestens ein Element wirkt wie ein Platzhalter)

| Kategorie | Note | Beleg | Begründung |
|---|---|---|---|
| Klarheit des Ziels | **4** | `qa/m4/selfreview/en-1280x720/004-015s-t.webp`, `qa/m4/selfreview/en-907x510/044-332s-release.webp` | Das Klemmbrett zeigt immer Ziel, Fortschritt und Belohnung (D4: 100 % der Sekunden). Die Tutorial-Blase hat ≤ 8 Wörter, der Ring zeigt auf das Ziel. Die Fluss-Leiste färbt den Engpass rot, ein Toast nennt den Grund („Keine Betten.“). Abzug: Nach dem Tutorial erklärt nichts, *warum* die Strickstube das nächste Ziel ist. Dass Entlassungen Resozialisierung brauchen, sieht man erst nach Minuten. |
| Erster Eindruck der Optik (0:05) | **4** | `qa/m4/selfreview/en-1280x720/002-005s-first-impression.webp`, `qa/m4/selfreview/de-907x510/002-005s-first-impression.webp` | Stimmige, warme 3/4-Ansicht. Fähre, Steg, Baugerüst mit Bautrupp, Koch und Tutorial-Wärter lesen sich auf einen Blick. Die UI-Plaketten passen zur Welt. Abzug: rechts viel leere Wiese, und die Figuren sind bei 907×510 klein (Profilköpfe weiter „schnabelartig“, bekannt seit G1). |
| Juice | **4** | `qa/m4/selfreview/en-1280x720/005-029s-release.webp`, `qa/m4/selfreview/en-907x510/058-512s-milestone.webp`, `qa/m4/selfreview/de-1280x720/009-059s-build-workshop.webp` | Konfetti, fliegende Münzen und „+280“-Plakette bei der Entlassung, Baustaub und Gerüst, Sterne bei Meilenstein und Fang, Nacht-Lichtkegel. Zähler laufen hoch. E-Test: Tap-Effekt im selben Frame wie die Eingabe. Abzug: Kosten-Plaketten mit krummen Zahlen („−602“) wirken technisch, und die Toasts oben stapeln sich halb transparent übereinander (siehe Stilkonsistenz). |
| Audio | **3 (vorläufig)** | `qa/g2/first-60s.mp4` (Ton nachgemischt), `qa/m4/selfreview/en-1280x720/log.json` (`end.plays`) | Technisch sauber: jede Aktion hat einen Ton, Pegel nach Messung im Rahmen, Musik-Loops nahtlos, Jingle-Priorität greift. Gehört hat aber niemand, und die Musik ist noch nicht gewählt (G2). Risiko Ermüdung: in 10 min rund 125 Münz-Töne (alle ~5 s), 39 Stempel, 18 Fährhörner. Note 3, bis ein Mensch zugehört hat. |
| Eigenständigkeit des Hakens | **4** | `qa/m4/selfreview/en-1280x720/024-183s-star.webp`, `qa/m4/selfreview/de-907x510/048-378s-tunnel.webp` | Fluss-Leiste mit „Wo hakt es?“, Stempel am Freiheitstor, Löffeltunnel mit rotem Ring und „!“ statt Gewalt: das gibt es so bei keinem der Wettbewerber. Abzug: Der Kern-USP „Entlassen als Wirtschaft“ ist zwischen 0:28 und 5:20 unsichtbar (keine zweite Entlassung). |
| „Würde ich weiterspielen?“ | **3** | `qa/m4/selfreview/en-1280x720/065-600s-end.webp`, `qa/m4/montage-en-1280x720.webp` (Zeilen 2–5) | Die ersten 3½ Minuten tragen: Tutorial, erster Bau, Tunnel, Klassenzimmer. Danach zwei lange Strecken ohne Neues (1:05–3:00 Sparen aufs Klassenzimmer, 3:33–6:18 nur Entlassungen und Ausbauten). Am Ende liegen 1,8–2,8 k Münzen ungenutzt. Mir fehlt ein Ziel, auf das ich mit dem Geld hinarbeite. Das hängt teils am Skript (kein zweiter Zellentrakt), teils an der Projekttafel, die erst mit M5 kommt. |
| Lesbarkeit bei 800×450 | **4** | `qa/m3/b1/de/gameplay-800x450.png`, `qa/m3/b1/de/gameplay-start-800x450.png` | Kompakt-HUD mit Klemmbrett-Chip, Steuerungshinweis als eine Zeile, alle Texte ≥ 12 px (B1, B7 grün). Abzug: Schlingel nur ~22 px hoch. Das Raum-Panel als Bottom-Sheet verdeckt fast die ganze Welt (bekannt). |
| Stilkonsistenz | **4** | `qa/m4/selfreview/de-1280x720/016-115s-nightSkip.webp`, `qa/m4/selfreview/en-907x510/058-512s-milestone.webp` | Palette, Konturen, Holz/Creme-UI und Nachtlicht sind durchgehend gleich. Abzug: Zwei Toasts liegen beim Nachtsprung halb übereinander („Tagesbilanz Tag 1 …“ bricht um und läuft in „Am nächsten Morgen …“). |
| Fehlerfreiheit | **4** | `qa/m4/selfreview/en-1280x720/023-180s-t.webp`, `qa/m3/b1/en/buildbar-rooms-907x510.png` | 0 pageerrors, 0 console errors, 0 Warnungen in allen vier Läufen (und in A6, 10 min). Gefunden: (1) Beim Löffeltunnel gibt es keinen Hinweis am Bildrand, wenn der Ausbrecher außerhalb des Bildes ist. Bei 3:00 sieht man nichts davon, das Skript musste per focusTile hinfliegen. (2) Bei 907×510 liegen „Wachposten“ und „Hof“ im Räume-Menü außerhalb des Bildes. Hinweise sind die angeschnittene Karte und ein Verlauf rechts, das Mausrad scrollt seitwärts. Das funktioniert, ist aber leicht zu übersehen (eher kosmetisch). (3) Toast-Überlappung (oben). |
| Anti-Kinderspiel | **4** | `qa/m4/selfreview/de-1280x720/016-115s-nightSkip.webp`, `qa/m4/selfreview/en-907x510/006-030s-t.webp` | Bürokratie-Satire liest sich: Tagesbilanz mit Löhnen, Klemmbrett mit „Pflicht“-Stempel, Panels mit Zahlen („8 Mahlzeiten/h“, „Limit: geschlossen“, Warteschlange, Gehzeit). Gedämpfte Palette. Restrisiko: niedliche Tierfiguren in Sträflingsstreifen. Die Alters-Frage zum Cover bleibt bei G3. |

**Härtefragen**
- *Sieht das Spiel neben dem Wettbewerb billiger aus?* Nein, im Vergleich gleicher Größe (`docs/competition/leek-factory-tycoon_gameplay.png`,
  `docs/competition/prison-life-aur_gameplay.png`) wirkt es detaillierter und geschlossener als Leek Factory. Gegenüber
  den 3D-Titeln (Prison Life, Cop Simulator) fehlt etwas Glanz und Tiefe, billig wirkt es aber nicht. Schwächste Stellen:
  die kleinen Figuren bei 800×450 und 907×510 und die leere Wiese rechts.
- *Gibt es in den ersten 60 s Leerlauf oder Textwände?* Textwände: nein (D1, höchstens 8 Wörter pro Schritt).
  **Leerlauf: ja, kurz.** Im Tutorial-Schritt 3 wartet man von 0:05 bis 0:28 (~23 s), bis Earl geduscht hat
  (Blase: „Earl macht sich fertig…“, `qa/m4/selfreview/en-1280x720/004-015s-t.webp`). Man sieht zwar Schlingel duschen,
  hat aber nichts zu tun. Zwischen 0:31 und 0:60 entscheidet der Spieler selbst. Das Klemmbrett zeigt „Baue eine Strickstube“, und
  nach einigen Sekunden erscheint der Tipp „Genug Münzen! Baue: Strickstube“ (im Probelauf ohne Bauaktion bei ~0:46 zu sehen).
- *Würde ein Reviewer es auf kids.crazygames.com verschieben?* Eher nein: Wirtschafts-Zahlen, Bürokratie-Witz, Gefängnis-Thema.
  Restrisiko sind die niedlichen Tierfiguren und die bunte Palette. Klären beim Cover-Check (G3).
- *Könnte jemand es mit Prison Architect, Prison Life oder Leek Factory verwechseln?* Nein. Anderer Name, 3/4-Seitenansicht statt
  Draufsicht (Prison Architect) bzw. 3D (Prison Life), Tier-Schlingel, Insel mit Fähre und Freiheitstor. Gemeinsam ist nur
  das Genre (Räume bauen).

**Befunde für die Weiterarbeit** (nicht in diesem Schritt behoben, Vorschlag für M5)
1. Pacing: zweite Entlassung erst bei ~5:20 und zwei lange Strecken ohne Neues (1:05–3:00, 3:33–6:18). Passt zur offenen
   Taktungsregel §4.3 (BALANCE.md §0) und sollte vor oder mit der Projekttafel angegangen werden. Ideen: früher eine
   Entlassung über das Klassenzimmer, oder ein kleiner Zwischenauftrag.
2. Löffeltunnel: Pfeil am Bildrand oder Tipp-Chip, solange der Ausbrecher nicht im Bild ist.
3. Räume-Menü bei 907×510: deutlicherer Scroll-Hinweis (z. B. ein Pfeil zusätzlich zum Verlauf), im G2-Playtest beobachten.
4. ~~Toasts beim Nachtsprung nicht überlappen lassen.~~ Nachgeprüft: keine Überlappung, nur Ein- und Ausblenden (siehe „Stand M4“). Die Tagesbilanz kürzer zu fassen bleibt eine Stilfrage.
5. Tutorial-Schritt 3: Wartezeit verkürzen oder mit einer Mini-Aufgabe füllen (z. B. „Tippe auf Earl“).
6. Viel ungenutztes Geld ab Minute 6: Kosten oder Ziele der Ausbauten prüfen, sobald die Projekttafel (M5) da ist.

## G2-Rückmeldung (Hook-Schritt M5, 2026-11-07)

**Rückmeldung des Auftraggebers** (wörtlich): (1) „anfang hat zwar das tutorial aber man weiss trotzdem nicht richtig was man
machen soll so richtig" (2) „das spiel hat nicht einen grossen reiz, am anfang soll ncoh so wie ein bisschen was sein zum lust
bekommen". Plan, Diagnose und was wir bewusst nicht tun: `docs/G2_FEEDBACK.md`. Balance-Belege: `docs/BALANCE.md` §6.

### Was geändert wurde
| Punkt | Änderung | Dateien |
|---|---|---|
| (1) Was tun? | Klemmbrett mit Warum-Zeile, Handlungswortlaut („Baue Betten: 12 insgesamt"), Freischaltung in der Belohnung, Kreislauf-Zeile bis zur 3. Entlassung, Sparbalken mit Zeitschätzung, „Jetzt bauen" | `src/ui/clipboard.ts`, `clipboard.css`, `src/i18n/parts/clipboard.*` |
| (1) | Geführte erste Ziele: Ring + Hand auf genau eine nächste Bedienung (Räume → Ziel-Karte → Grundriss an gutem Platz mit Zieh-Vorführung → Personal → Einstellen; bei „Kantine auf Stufe 5": Raum → Ausbauen), endet nach „Kantine Stufe 5"; Grundriss-Vorschlag danach für jedes Bau-Ziel | `src/ui/guide.ts` (neu), `src/ui/tutorial.ts`, `tutorial.css` |
| (1) | Räume-Menü: Zweck-Zeile je Karte, ZIEL-Schild, Ziel-Karte wird ins Bild gescrollt (907×510 schnitt sie ab) | `src/ui/buildMenu.ts`, `buildbar.css`, `src/i18n/parts/buildbar.*` |
| (1) | Tutorial-Schritt 3: Schild über Earl (Dusche → Balken → ✓), Wartezeilen „Eine Dusche bessert ihn" / „Gebessert! Ab zum Tor", Hand wartet am Tor | `src/ui/tutorial.ts`, `src/i18n/parts/tutorial.*` |
| (1) | Übergabe: Kantinen-Panel schließt, Fluss-Leiste leuchtet einmal mit Erklärung (Brief §4.2), dann erst die Führung | `src/ui/tutorial.ts` |
| (1) | Tipp „Kistenstapel antippen: schneller Münzen" beim Sparen; „Genug Münzen!" schweigt, solange die Führung zeigt | `src/ui/tutorial.ts` |
| (2) Reiz | Strafakten-Kärtchen bei der Ankunft (Brief §4.2), Entlassungs-Sätze (Earl: Kuchen) | `src/ui/arrivalCards.ts` (neu), `arrivalCards.css`, `src/content/gags.ts`, `src/app.ts` (Mount) |
| (2) | Bagatell-Täter: 2. Entlassung bei ~2:00–3:00 statt ~5:20 (halbe Prämie, 5 Ruf), Ausgleich im Strafmaß | `src/sim/agents.ts`, `src/sim/ferry.ts`, `src/content/balance.ts`, `tools/economy-sheet.ts` |
| (2) | Stern-Toast nennt, was der Stern bringt und was der nächste bringt; „Erste Lieferung!" mit Münzfontäne | `src/ui/toasts.ts`, `src/render/juice.ts` |
| (2) | „Fast frei"-Sterne über Schlingeln ab 80 % (vorhandenes Sprite im Need-Layer, kein neuer Draw-Call-Container) | `src/render/juice.ts` |
| (2) | VIP-Schild-Unterzeile „Komm morgen wieder – dann ist er da." | `src/ui/eventBanner.ts`, `src/i18n/parts/progress.*` |
| Fertig machen | Land kaufen: Land-Karte im Räume-Menü (Zwei-Tipp-Bestätigung), Tipp auf ein „Zu verkaufen"-Schild öffnet sie | `src/ui/buildMenu.ts`, `src/ui/tools.ts`, `src/content/site1.ts` |

### Nachweis: als neuer Spieler gespielt
`tools/selfreview/hook.spec.ts`: frisches Profil, `?capture=1`, 6 Minuten. Der „Neuling" tippt nur, was das Spiel zeigt
(Tutorial-Ring, danach Führungsring/-hand, „Jetzt bauen", Fähre, Ausbrecher) und entscheidet nichts selbst. Bilder alle 15 s
(+ 0:05, Übergabe 0:34): `qa/m5/hook/<lang>-<größe>/`, je Lauf `log.json` mit Aktionen, Führungsschritten und Ereignissen.

| Lauf | Entlassungen (s) | Ziele erledigt (s) | längste Strecke ohne Moment | Fehler |
|---|---|---|---|---|
| EN 1280×720 | 28 · 111 · 307 | 39 · 177 · 191 · 226 · 234 · 316 (7 von 10 inkl. Kantine Stufe 5) | 59 s (ab 4:08) | 0 |
| EN 907×510 | 28 · 111 · 307 | dto. | 59 s | 0 |
| DE 1280×720 | 28 · 110 · 304 | 39 · 177 · 191 · 290 · 298 · 316 | 51 s (ab 2:06) | 0 |
| DE 907×510 | 28 · 110 · 304 | dto. | 51 s | 0 |

„Moment" = Bau fertig, Entlassung, Ziel, Freischaltung, Stern, Ausbrecher, Einstellung, Ankunft (mit Kärtchen), Meilenstein.
Vorher (Selbst-Review M4, Bot-Gehirn statt Neuling): 117 s ohne Neues (1:03–3:00) und 2. Entlassung bei 5:12–5:20; ein
passiver Spieler bekam nach dem Tutorial genau einen Hinweis bis 3:00.

**Kritischer Blick auf die Bilder** (ich habe alle Übergabe-Bilder, 0:05–1:00, 3:00 und 5:00–6:00 der vier Läufe angesehen):
- Gut: Die Kärtchen lesen sich auf einen Blick, der BAGATELLE-Stempel macht neugierig; das Schild über Earl erklärt die
  Wartezeit; nach dem Tutorial steht immer genau ein Ring auf dem nächsten Knopf; die Ziel-Karte ist auch bei 907×510 im Bild;
  Sparbalken und „Jetzt bauen" nehmen die Sparphase vor dem Klassenzimmer die Leere.
- Behoben während der Läufe: Ziel-Karte und Vorarbeiter-Karte lagen bei 907×510 außerhalb der schmalen Leiste (die Leiste wird
  erst nach dem Rendern schmaler) → Einblenden nach `fit()` bzw. in der Führung; ZIEL-Schild quetschte „Strickstube" →
  in die Preiszeile; die Führung zeigte schon während der Tutorial-Feier → wartet jetzt das Fluss-Leisten-Intro ab; das
  Fluss-Leisten-Kärtchen lag über dem Grundriss-Vorschlag → weicht, sobald ein Werkzeug oder Menü offen ist; die Vorführhand
  zog von der Ecke aus, das Werkzeug zentriert aber auf dem ersten Feld → Hand startet dort, wo der Mindestraum passt.
- Schwächen, die bleiben: Das VIP-Schild ist bei 907×510 groß und steht ab Tag 2 dauerhaft über dem Büro. Der Klemmbrett-Kasten
  ist mit Warum-Zeile bei 907×510 höher (bis ~320 px), verdeckt aber kein Ziel und kein Menü. Bei der Übergabe kommen
  Freischalt-Toast, „NEU"-Stempel, Fluss-Leiste und „Jetzt bauen"-Puls gleichzeitig – das ist ein bewusster Feier-Moment,
  wirkt aber dicht.

### Tests
Produktions-Build im eigenen Scratch-Ordner, `vite preview` auf Port 5380 (`--strictPort`, danach gestoppt), `--workers=1`,
`--reporter=list` (qa/playwright-results.json unverändert):
- `tsc --noEmit -p .` und `eslint src tests` sauber; `vitest run` **22 Dateien, 303/303** (neu: `tests/unit/g2-hook.test.ts`, 7 Tests:
  Bagatell-Täter und Earls Akte deterministisch, Bagatell-Prämie/-Ruf, Führungskette Räume → Karte → Platz → Personal → Einstellen,
  Platz gültig und `suggestSpot` ändert den State-Hash nicht, Sparbalken-ETA, Kistenstapel-Tipp nur beim Sparen, Stufen-Ziel
  Kantine → Ausbauen, Entlassungs-Sätze EN/DE). D1 (≤ 8 Wörter) prüft jetzt Schritttext + längste Wartezeile.
- `m4-onboarding.spec.ts` 8/8 (D8 erste Entlassung 28,5 s, D1 je Schritt ≤ 8 Wörter, z. B. „Stamp to release! Reformed! Off to the
  gate" = 8, D4 0 schlechte Proben, D6 kein Modal, D9 Skip 26,5 s, D10 USP 4 bei 180 s), `m4-fixes-ui.spec.ts` 17/17,
  `m3-ui.spec.ts` 23/23 (B3 brauchte einen Fix: der rote „Kaufen"-Knopf der Land-Karte hatte Deckkraft 0,8 → 3,76:1; jetzt ohne),
  `m4-accept.spec.ts` 6/6 (A6 ohne Fehler), `m3-layout.spec.ts` 45/45 (B1 brauchte einen Fix: Warum-Zeile, Kreislauf-Zeile,
  Belohnungszeile mit Freischaltung und VIP-Unterzeile sind Fließtext ≥ 6 Wörter → 1rem = 14 px; die Sperr-Zeile im Räume-Menü
  nutzt wieder den kurzen Basis-Text), `m5-ui.spec.ts` 17/17. Die B1-PNGs in `qa/m3/b1` wurden dabei neu geschrieben.
- Balance: `tools/balance.ts --minutes 30 --seeds 5` alle Zeilen grün außer Kernraum Lv15 (vorher schon rot), Economy-Sheet H0 grün
  (Details BALANCE.md §6).

### Offen (Ursache, keine Schwelle gelockert)
- **Taktungsregel §4.3** (≤ 120 s ohne Neues, 15 min, Casual-Bot): 3 von 5 Seeds verletzt (139–174 s; vorher 5 von 5). Die Lücken
  liegen nach der Essensschlacht (~10:33) bis Parzelle 2 und bei zwei Seeds zwischen Tunnel (3:00) und Klassenzimmer. Ursache ist die
  Mittelphase des Bots (spart auf Parzelle 2, keine Entlassungen bei vollen Betten), nicht der Anfang. Beim Neuling mit Führung ist die
  längste Strecke ohne Moment in den ersten 6 min 51–59 s.
- **Kernraum Lv15** (Casual 27:30 statt 16:00–20:00) war schon vor diesem Schritt rot (Balance-Pass).
- **Robustheit**: auf einem zweiten Seed-Satz (3/5/7/9/13) fallen „Wachposten" (3:29 < 3:36) und „erste Leitung" (19:43 > 19:12)
  heraus; vor dem Hook-Schritt bestanden sie dort. Die offiziellen Seeds bestehen (BALANCE.md §6).
- Ein menschlicher Playtest (G-artig) steht aus; der „Neuling" ist ein Skript, gehört hat niemand etwas.
- Nicht gebaut: Stern-Tooltip in der Topbar mit nächster Belohnung (die Info steht im Stern-Toast), „Nächste Entlassung in ~40 s"
  an der Tor-Stufe der Fluss-Leiste (ersetzt durch die „Fast frei"-Sterne).

## Stand M5 (Integration, 2026-11-07)

Umfang (Brief §14 M5): Rest von Standort 1 – Projekte, Leitungen, Essensschlacht, Inspektion, Versetzung, Perks, Offline,
Tagespost, Morgen-VIP – plus die G2-Rückmeldung (Abschnitt oben). Vertrag: `docs/M5_DESIGN.md`. Standort 2 (P0b) und P1
(Hausregeln, Überraschungsinspektion) sind nicht gebaut und nicht verbaut (Versetzung zeigt Standort 2 nur als Silhouette mit
„Freigeschaltet“, ohne Knopf und ohne Versprechen).

### Abnahme H0–H6 für Standort 1 (Brief §12.9; Messung `tools/balance.ts --minutes 30 --seeds 9`, 27 Seeds, `qa/balance.md`)

| Test | Schwelle (Brief) | Ergebnis | Status | Beleg |
|---|---|---|---|---|
| H0 | Economy-Sheet ohne Widerspruch zur Pacing-Tabelle | Inspektion 22:19, 5 Basis-Schlüssel, Amortisation 3:22, Mix 15:00 48/35/17 · Löhne 23 % | ✅ | `qa/economy-sheet.txt`, `tests/unit/economy.test.ts` |
| H1 Pacing | jede Zeile ±20 % (Casual), Optimal nicht > 35 % schneller | Closer-Lesart (Median **und** ≥ 90 % der Seeds in ±20 %, Optimal-Regel für jede Zeile): **16/22 Zeilen ✅**; alle 22 Mediane im Fenster (u. a. 2★ 8:11, Essensschlacht 10:31, Parzelle 2 11:00, 3★ 15:19, Lv15 19:53, Parzelle 3 27:11, Inspektion möglich 25:04). ❌ Tutorial-Ende (16/27 Seeds; Optimal 40 % schneller), Strickstube (Optimal 49 % schneller), 4. Entlassung 18/27, Kantine Lv5 20/27, erstes Projekt 22/27, erste Leitung 24/27 | ❌ offen (6 Zeilen) | `qa/balance.md`, BALANCE.md §9 |
| H1 Taktung §4.3 | ≤ 120 s ohne Neues (15 min), ≤ 45 s ohne Kauf/Ziel, kein Runaway | 23/27 Seeds ≤ 120 s (4 Seeds 122–137 s nach dem Tunnel 3:03), 27/27 nie > 45 s ohne Kauf/Ziel, 27/27 ohne Runaway | ❌ offen (4/27) | `qa/balance.md` „Taktung“, BALANCE.md §8 |
| H1 Mix/Löhne §3.8 | 15:00 und 30:00 im Korridor | 15:00 49/32/18 · Löhne 25 % (Median im Korridor, 8/27 Seeds); **30:00 34/48/18** · Löhne 31 % (0/27) | ❌ offen (30:00) | BALANCE.md §7.4 Nr. 1 |
| H1 Ruf-Quellen | Report | Entlassungen 15–16/min, Ziele 5,3 → 1,3, Ereignisse ~1, Fangen 1, Meilensteine 0,7 | ✅ berichtet | `qa/balance.md` |
| H1 Standort 2 | 30 min Standort 2 mit Perks | nicht Teil von M5 (P0b) | – (M6) | |
| H1b | gutes Layout ≥ 25 % schneller als Zufallslayout | Vorher ✅ nur, weil der Zufallslayout-Bot festhing (∞). Mit landkaufendem Vergleichs-Bot: gut 24:35 vs. zufällig 28:06 (12 %; 2/27 nie bereit) | ❌ offen | `qa/balance.md`, BALANCE.md §9 Nr. 3 |
| H2 | Naiv ≥ 30 % langsamer; Zufalls-Bot < 2★ in 30 min; ≥ 1 Ausbruch und ≥ 1 Essensschlacht | Naiv (folgt dem Ziel, sonst das Billigste) 25:25 vs. 24:35 (+3 %) ❌ – der wörtliche Gierig-Bot erreicht nie die Inspektion; Zufalls-Bot 1/27 Seeds 2★ ✅ (≥ 90 %); vom Director gewählte Ausbruchsversuche in 27/27 Seeds (Median 5, gelungen in 5/27), Essensschlacht 27/27 ✅ | ❌ offen (Naiv) | `qa/balance.md`, `balance-h.test.ts`, BALANCE.md §9 Nr. 4 |
| H3 | erste Inspektion beim Casual nach 22–30 min möglich, danach Progression | **Median 25:04** (streng im Fenster), 24/27 Seeds streng in 22–30, 26/27 in ±20 % (≥ 90 %); Ruf wächst danach bis 45:00 in 27/27, Folgeziele/Versetzung/Perks | ✅ | BALANCE.md §8–§9, `balance-h.test.ts`, `m5-integration.test.ts` |
| Schlüssel §3.17 | Casual 4–6 Basis-Schlüssel, mit 2★ genau 2 Perks | Median 5 (4/5/6 = 1/23/2 Seeds; Seed 534 ruft erst bei 30:26 aus, dann 5), mit 2★ 2 Perks | ✅ | BALANCE.md §8 |
| H4 | Save/Load-Hash gleich, Offline gedeckelt, Zeitsprünge geklemmt; M4-Saves laden | Hash vor dem ersten Tick gleich (auch mitten im Inspektionsgang, nach Nachspielen, nach Versetzung); Deckel 2 h + Perks; −∞/NaN/negativ → 0, +10 Jahre/∞ → Deckel; **Uhr hin und her zahlt den Deckel nur einmal** (Hochwassermarke, Closer); v1- und v2-Saves laden (SAVE_VERSION 3, `m5-migration.spec.ts`) | ✅ | `m5-retention.test.ts`, `m5-closer.test.ts`, `m5-contract.test.ts`, `save.test.ts` |
| H5 | Tagespost + Morgen-VIP (a) und (b) mit injizierter Uhr | 00:00 Ortszeit inkl. Zeitzone, Uhr zurück, keine Wiederholung über 30 Tage, (a) neuer Tag + 4 h, (b) 8 h | ✅ | `m5-retention.test.ts` (FakeClock) |
| H6 | kein toter Button, kein „Coming soon“ | E2E „every button does something“ über alle M5-Screens; jeder `cmd.*` der UI existiert; kein „coming soon“ in i18n | ✅ | `m5-ui.spec.ts`, `balance-h.test.ts`, `m5-ui.test.ts` |
| I (§12.10) | `happytime` nur erste Entlassung + Inspektion; Completion nach Inspektion und beim Laden; Start/Stop gepaart | Browser-Lauf, SDK-Mock: `init → report → start → stop (Ergebnis) → report → happytime → start (Versetzung) → stop/start (Perk-Laden)`; nach Reload `init → report → start`; keine zweite `happytime` auf dem Versetzungslauf | ✅ | `qa/m5/flow/*/log.json`, `m5-ui.spec.ts` |

### Im Browser durchgespielt (`tools/selfreview/m5flow.spec.ts`, Bilder `qa/m5/flow/<lang>-<größe>/`)
Frisches Profil, EN und DE bei 1280×720, 907×510 und 844×390 (Touch). Der Casual-Bot spielt die ersten 30 Spielminuten
im Seiteninneren (`?bot=casual&warp=1800&botoff&noleads`), danach ausschließlich **echte Klicks/Taps** auf jeden neuen
Knopf: Projekttafel → Projekt starten → Personal → Büro-Karte → Leitung einstellen (Bestätigung) → Räume → Land-Karte
(Zwei-Tipp, Grund bei zu wenig Coins) → Tagespost → Inspektions-Knopf → Prognose → „Inspektionstag ausrufen“ → Folgen →
Ergebnis (pausiert) → „Versetzen…“ → zweimal „Versetzen“ → Schlüssel-Knopf → Perk kaufen → × → 2,5 min neuer Lauf →
Speichern → Reload nach 30 min (FakeClock) → Rückkehr-Panel „Einsammeln“ → Tab 2 min versteckt (Aufholen) → Tab 12 min
versteckt (Rückkehr-Panel). Jeder Klick prüft, dass nichts über dem Knopf liegt; jedes Bild prüft Überlappungen der HUD-Teile.

Ergebnis des letzten Laufs (6/6 grün, 8,6 min): **0 Konsolenfehler, 0 pageerror, 0 verdeckte und 0 fehlende Knöpfe** in allen
sechs Läufen; Inspektion 2★ (Comfort C, Safety B, Reform A, Profit A), Versetzung, Perk „Startkapital“ gekauft, Rückkehr-Panel
nach Reload (+279 bei 40 %) und nach Tab-Rückkehr, „Aufgeholt – 2 min nachgespielt“-Chip.

Gefunden und behoben (alle Bilder angesehen):
- Tagesbilanz-/Fähren-Toasts lagen auf der pausierenden Ergebnis-Karte (844×390: über Stempel und Sternen) → Sim-Ereignis-Toasts
  warten mit angehaltener Uhr hinter pausierenden Karten und dem Rückkehr-Panel; Antworten auf eigene Taps erscheinen sofort
  (`src/ui/toasts.ts`).
- Bei 844×390 lagen „Inspektionstag ausrufen“, „Weiter optimieren/Versetzen…“ und „Versetzen“ unter dem Falz → Hauptknopfzeile
  bleibt beim Scrollen sichtbar (`m5-sticky`, `src/ui/m5.css`).
- Rail (Inspektion, Projekt-Timer, Post, Schlüssel) ragte halb unter offenen Menü-Blättern hervor → weicht, solange ein Blatt sie
  bedeckt (`m5kit.ts syncRail`).
- Projekttafel/Leitungen überdeckten den Projekt-Chip der Rail → Layout-Pass 5×/s statt 2×/s.
- VIP-Tafeltext ragte bei 907×510 unter Seitenpanels, Toasts und Kärtchen → Kollisionsprüfung mit der zuletzt gemessenen Größe
  (vorher 160×40 geraten) und gegen Toasts/Kärtchen (`eventBanner.ts`).
- Rückkehr-Panel unter einer zweizeiligen Banner-Leiste → rückt darunter (`returnPanel.ts`).
- „Aufholen…“ dauerte nur wenige Frames und war nie zu sehen → Chip bleibt 1,8 s und sagt „Aufgeholt – N min nachgespielt“.
- Ein späterer Schlingel (und auf dem Versetzungslauf ein Wiesel) hieß „Earl“ → der Name gehört nur dem Tutorial-Waschbären.
- Ein M4-Spielstand bekam nach Abwesenheit kein Rückkehr-Panel (leerer Einnahmen-Ring nach der Migration → 0 Coins) → die
  Offline-Formel nutzt dann den Schnitt des Spielstands (`offline.ts offlineRatePerMin`).
- B1-Audit (Übergangszustände, 800×450/907×510): Die Führungshand auf der Bauleiste ragte 2–5 px über den unteren Rand und
  ließ die Tutorial-Ebene (mit Text) „scrollen“ → Führungsring, -hand, Grundriss und Zieh-Vorführung liegen in einer eigenen
  textfreien Clip-Box (`tu-gbox`, wie der Schleier).
- Bekannt, bewusst gelassen: Bei 844×390 liegen Toasts (`data-overlay`, 1,8–3,5 s) kurz über der Kopfzeile eines offenen
  Bau-Menü-Blatts; Strafakten-Kärtchen und Toasts können sich kurz überschneiden (beides flüchtige Overlays). Unter `?capture`
  laufen CSS-Animationen nur mit gemalten Frames; das Werkzeug wartet darauf (in DE 1280 blieb die Land-Karte im zweiten Lauf
  dadurch kurz unsichtbar – kein Spielfehler, im Probe-Lauf ohne Werkzeug sichtbar).

### Automatisierte Tests
Produktions-Build im Scratch-Ordner, `vite preview` auf Port 5375 (`--strictPort`, danach gestoppt), Chromium mit SwiftShader.
- `tsc --noEmit -p .` und `eslint src tests` sauber. `vitest run`: **24 Dateien, 328/328** (neu `tests/unit/m5-integration.test.ts`:
  Entlassungsziel 20 + alter `release15`-Stand, C = 600, „Earl“ nur einmal, Offline-Formel mit leerem Ring; `balance-h.test.ts` H3
  jetzt ohne Toleranz).
- **`npx playwright test --workers=1`: 132/132 bestanden, 0 übersprungen, 56,5 min** (`qa/playwright-results.json`): m0-infra 5,
  m3-layout 45 (B1-Matrix mit den vier M5-Screens Projekttafel, Rückkehr-Panel, Inspektionsergebnis, Versetzung in EN/DE × 10
  Größen + Touch, Montage, B2, B7, Übergangszustände inkl. Post, Leitungs-Dialog, Prognose, Banner + Randpfeil), m3-ui 23 (B3, **B4**
  und **D5 über alle Zustände inkl. der 8 M5-Zustände**, B5, B6), m4-accept 6 (A4 101 Dateien/5,03 MB, initial 0,54 MB; A6 600 s
  Spielzeit ohne Fehler/Warnung), m4-fixes-ui 17, m4-onboarding 8 (A2 424 ms, D3 3,9 s, D8 erste Entlassung 25,5 s, D9 Skip bei
  3 s), m4-save 10, m5-migration 1 (M4-Spielstand → v2, Rückkehr-Panel, Completion beim Laden), m5-ui 17 (alle Screens EN/DE bei
  1280×720/800×450/844×390 Touch, Esc-Reihenfolge, Pause-Paarung, **H6**). **D7** (EN/DE-Schlüsselgleichheit) in
  `tests/unit/i18n.test.ts`.
- Zwischenläufe: Lauf 1 fand 2 Fehler (Aufholen-Chip-Test erwartete das alte Sofort-Verschwinden → Test auf „Aufgeholt“ angepasst;
  M4-Spielstand ohne Rückkehr-Panel → Spielfehler in `offline.ts` behoben, Testspielstand hat jetzt 6 min Spielzeit, damit es
  überhaupt Einnahmen gibt), Lauf 2 fand 3 (Führungshand, s. o. → behoben). Keine Schwelle gelockert, kein Test übersprungen.
- Balance: `tools/balance.ts --minutes 30 --seeds 9` (27 Seeds, 545 s) – Exit 1 nur wegen Taktung (4/27) und Mix 30:00; H0 grün.

### Offen (Ursache, keine Schwelle gelockert)
- **Taktung §4.3:** 4/27 Seeds mit 122–137 s ohne Neues nach dem Tunnel (Ursache und verworfener Versuch: BALANCE.md §8).
- **Einnahmenmix 30:00:** Kisten 48 % statt ≤ 40 %, Entlassungen 34 % statt ≥ 40 % (BALANCE.md §7.4 Nr. 1).
- **Tutorial-Ende** 0:57 im Median an der Unterkante (0:56), 11/27 Seeds darunter.
- `reportGameCompletedPercentage` +50 % je erstmals bestandenem Standort statt +20 % (Abweichung 4, RULES_CHECK §6) – bitte
  bei G3 bestätigen; `COMPLETION.percentPerSite = 20` stellt den Brief-Wortlaut her.
- `happytime` kommt nur bei **bestandenen** Inspektionen (§11.1 „jeder bestandenen Inspektion“); §12.10 sagt „jeder
  Inspektion“. Wir folgen der strengeren Regel aus §11.1 (Abweichung 19).
- Ein menschlicher Playtest von Inspektion/Versetzung steht aus (G3).

### Closer-Pass M5 (2026-11-07): Prüfer-Befunde und was daraus wurde

Der Prüfer hat den Integrationsstand frisch gespielt (907×510, 6:10 Spielzeit), Formeln gegen den Brief gelesen,
Mutationstests auf den M5-Tests gefahren (52/54 getötet) und Exploits gesucht. Jeder Befund ist behoben oder mit Ursache
offen; keine Schwelle gelockert, kein Test übersprungen. Wo die ehrlichere Messung jetzt ❌ zeigt, steht es unten als offen.

| Befund | Schwere | Was jetzt gilt | Beleg |
|---|---|---|---|
| Unbegrenzte Offline-Coins durch Hin- und Herstellen der Systemuhr (145 → 183.270 Coins in 5 Umstellungen) | HOCH | `wall.maxSeenMs` ist eine Hochwassermarke, die nie sinkt (`syncWall`, `markSessionEnd`). Abwesenheit beim Laden und bei Tab-Rückkehr misst ab `max(Speicherzeit, Marke)` (`awayBaseMs`), ebenso das Sitzungsende für den Morgen-VIP. Uhr zurück → 0, bis die echte Zeit die Marke überholt. SAVE_VERSION **3** mit Migration 2 → 3 (Marke = max(Speicherzeit, letzte Wanduhr, VIP-Sitzungsende)). | `tests/unit/m5-closer.test.ts` (5 Umstellungen zahlen den Deckel genau einmal; Tab-Pfad; VIP; Hash) |
| Tagespost nach Uhr weit in der Zukunft monatelang gesperrt; Post-Tage per Uhr vorwärts farmbar | MITTEL | Liegt der Ortstag mehr als 3 Tage vor dem Post-Tag (`MAIL.reanchorAfterDays`), springt der Post-Tag auf heute (Aufgaben geschlossen, ohne Belohnung), der nächste echte Tag bringt neue Post. `mail.hiDay` (höchster je gerollter Tag) – nur Post-Tage ab diesem Tag zählen für den Schlüssel-Streak. Kleine Rücksprünge (≤ 3 Tage, Zeitzonen) rollen nie neu (bestehender H5-Test grün). | `m5-closer.test.ts` (+400 d → korrigiert → nächster Tag neue Post; 6 nachgerollte Tage ohne Schlüssel) |
| Tipp in den gestrichelten Bauplatz baut woanders / „Außerhalb deines Landes" | MITTEL | Ein Tipp (ohne Ziehen) irgendwo im Grundriss baut genau diesen Grundriss (`ctx.guideSpot`, `tools.ts`). Touch: das erste ✓-Rechteck des Ziel-Werkzeugs liegt auf dem Vorschlag, ein Tipp in den Grundriss setzt es dorthin. | `tests/e2e/m5-closer.spec.ts` (Ecke antippen, Maus 907×510 und Touch 844×390) |
| Führung und „Jetzt bauen" geben das letzte Geld vor Mitternacht aus → „Löhne nicht voll bezahlt" | MITTEL | `paydayReserve` = Lohnsumme der nächsten Mitternacht minus das, was die gemessene Einnahme bis 22:00 noch bringt. Die Führung startet und „Jetzt bauen" erscheint erst bei Kosten + Rücklage; das Klemmbrett sagt „Bald Zahltag: N für Löhne behalten". Wer das Werkzeug selbst öffnet, sieht den Bauplatz weiter. Neuer Frischlauf: 0 unbezahlte Tage (vorher 4:13). | `qa/m5/closer/hook-en-907x510/` (log.json: `unpaid` leer) |
| Strafakten-Kärtchen bei 907×510 fast nie sichtbar | MITTEL | Vier Ankerplätze um den Schlingel (über, unter, rechts, links; der zuletzt benutzte zuerst), am Bildrand eingeschoben; nur wenn alle vier verdeckt sind, wartet das Kärtchen unsichtbar mit angehaltener Uhr (≤ 8 s). Zeigehand, Ring, Steuerungs-Overlay und Earl-Schild gelten als Hindernis. | Stichprobe 1/3 s, siehe unten |
| H1b und H2-Naiv bestanden nur, weil die Vergleichs-Bots festhingen (∞) | MITTEL | Zufallslayout-Bot kauft Land, wenn das Ziel keinen gültigen Platz mehr hat; Naiv-Bot kauft das Klemmbrett-Ziel, sobald es bezahlbar ist, sonst immer das Billigste (der wörtliche Gierig-Bot bleibt vor der Strickstube hängen, Seed 11: 73 Coins, nur Waschhaus). Ein nie erreichter Vergleich zählt als ❌. **Ergebnis: beide ❌** (siehe offen). | `qa/balance.md` |
| H2-Druck war eine Tautologie (gescripteter Tunnel/Essensschlacht) | MITTEL | Gezählt werden vom Director gewählte Ausbruchsversuche (Lesart „Ausbruch" = Ausbruchsversuch, gefangen oder nicht); Essensschlacht zählt mit der gescripteten. Unit-Test prüft `tunnelsRandom ≥ 1`. | `balance-h.test.ts`, `qa/balance.md` |
| „Optimal ≤ 35 % schneller" nur ab 3:00 geprüft | MITTEL | Gilt jetzt für jede Zeile. Tutorial-Ende und Strickstube sind dadurch ❌ (offen). | `tools/balance.ts` |
| Median versteckte Seeds außerhalb; 2★-Zufalls-Bot am Median | MITTEL | Jede Zeile braucht zusätzlich ≥ 90 % der Seeds in ±20 %; Zufalls-Bot ≥ 90 % der Seeds < 2★; H3 Median streng 22–30 und ≥ 90 % der Seeds in ±20 %; Schlüssel ≥ 90 % der Seeds. Unit-Test: Zufalls-Bot jeder Seed < 2★. | `qa/balance.md` |
| Fluchtscore: Abdeckung nicht als Kachelanteil | NIEDRIG | Kachelanteil gebaut und gemessen (27 Seeds): H3 je Seed fiel von 24/27 auf 20/27 streng im Fenster, ein Unit-Test-Seed rutschte auf 30:24, ohne sichtbaren Unterschied fürs Spielen. Zurückgenommen und als **Abweichung 22** dokumentiert (binäre Abdeckung am Standort, 0,85). | `director.ts escapeScore`, PROGRESS.md |
| Profit zählte nur gezahlte Löhne | NIEDRIG | `stats.wagesOwed` (alle fälligen Löhne, Save v3, Migration = bisher gezahlt); Profit = Einnahmen − geschuldete Löhne. | `m5-closer.test.ts` (Pleite-Tag, bekannte Lohnsumme 100 → 75) |
| Überlebende Mutanten (Horn-Tap, Director-Abstände, leere Slots, Completion) | NIEDRIG | Tests: zweiter Horn-Tap = cooldown ohne Zählung; Director-Abstände 150–240 s, kein leerer Slot vor 900 s (2 Seeds, 22 min); Completion 50 % je Standort, zweiter Pass +0. | `m5-closer.test.ts` |
| Hand zeigt auf „Personal", ohne Grund | NIEDRIG | Fehlt einem gebauten Raum sein Personal und reicht das Geld, sagt die Warum-Zeile des Klemmbretts „Erst Vorarbeiter einstellen: die Strickstube läuft voll" (bzw. Lehrer/Wache), EN/DE. | `clipboard.ts`, i18n `clipboard.first.*` |
| Stille Strecke 1:35–2:35 (Sparen auf das Klassenzimmer) | INFO | Nicht geändert (Taktung offen, s. u.). Die Zahltag-Rücklage verlängert das Sparen dort um bis zu ~1 min, verhindert aber den Lohnstrafe-Tag. | |

**Nachweise im Browser (Produktions-Build, `vite preview` Port 5377):**
- Strafakten-Kärtchen der ersten Fähre, Stichprobe alle 10 Frames (1/3 s) über 50 s: bei **907×510** waren Earl 10, Gus 10,
  Juno 10 und Olive 9 Stichproben sichtbar (= ihre vollen 3,2 s; vorher Earl 0/10, Gus 2/11, Juno 1/11, Olive 2/10), dazu
  3/13/18/8 Stichproben wartend (verdeckt, Uhr angehalten); bei 1280×720 9/10/10/9 sichtbar. Bilder `qa/m5/closer/cards-*.png`.
- Neuling-Selbstspiel (`tools/selfreview/hook.spec.ts`, EN 907×510, 6:00 Spielzeit, Bilder alle 15 s in
  `qa/m5/closer/hook-en-907x510/`): 7/7 geführte Ziele bis Kantine Lv5 (5:55), Entlassungen 0:25 / 1:41 / 4:28 / 5:10,
  längste Strecke ohne Ereignis 54 s (ab 2:06), **0 unbezahlte Lohntage** (vorher „Löhne nicht voll bezahlt" um 4:13),
  „Bald Zahltag: 181 für Löhne behalten" um 3:45 sichtbar (`016-225s-t.jpg`), 0 Fehler.
- Tipp in eine Ecke des gestrichelten Bauplatzes: baut genau den Grundriss, Maus 907×510 und Touch 844×390
  (`tests/e2e/m5-closer.spec.ts`, 2/2).

**Offen nach dem Closer-Pass (Ursache, keine Schwelle gelockert, BALANCE.md §9):**
- Pacing mit Seed-Quote und Optimal-Regel für jede Zeile: 6/22 Zeilen ❌ (Tutorial-Ende, Strickstube, 4. Entlassung, Kantine
  Lv5, erstes Projekt, erste Leitung). Alle Mediane liegen im ±20-%-Fenster.
- H1b ❌ (gutes Layout 24:35 vs. Zufallslayout 28:06, 12 % statt ≥ 25 %) und H2-Naiv ❌ (+3 % statt ≥ +30 %; der wörtliche
  Gierig-Bot erreicht die Inspektion nie). Lesart und Hebel bei G3.
- Taktung §4.3 4/27 Seeds, Mix 30:00 0/27 (unverändert).
- Stille Strecken der ersten 5 Minuten (~1:35–2:35, ~3:00–3:55); die Zahltag-Rücklage kann das Sparen aufs Klassenzimmer um
  bis zu ~1 min verlängern (dafür kein Lohnstrafe-Tag).
- Abweichung 22 (binäre Abdeckung) und 23 (Tagespost-Neuverankerung) bei G3 bestätigen. Wer seine Uhr weit vorstellt und
  zurückdreht, bekommt bis zum Erreichen der Hochwassermarke keinen Offline-Ertrag (gewollt, Anti-Exploit).
- Kein menschlicher Playtest des neuen Builds; der Neuling-Lauf ist ein Skript.

**Tests nach dem Closer-Pass** (Produktions-Build im Scratch-Ordner, `vite preview` Port 5377 `--strictPort`, danach gestoppt):
- `tsc --noEmit -p .` und `eslint src tests` sauber; `vitest run`: **25 Dateien, 342/342** (neu `m5-closer.test.ts` 14 Tests;
  `balance-h.test.ts` prüft jetzt Director-Ausbruchsversuche und jeden Zufalls-Bot-Seed; `m5-contract` SAVE_VERSION 3).
- `npx playwright test --workers=1` (voller Lauf, 62 min, `qa/playwright-results.json`): **133/134**, 0 übersprungen. Rot nur
  „B5 DOM: kein fremder Link/keine Vollbild-Steuerung in allen Zuständen" – kein Befund, sondern das 120-s-Testlimit: 2 Sprachen
  × 22 Zustände brauchen unter SwiftShader ~115 s (gemessen je Zustand; `touchConfirm` 5–11 s, `m5Projects` 5,5 s). Danach
  in `tools.ts` die Regel „Tipp ins wartende Touch-Rechteck behält es" zurückgenommen (ein ungültiges, rotes Rechteck ließ
  sich so nicht mehr durch einen Tipp knapp daneben verschieben; der Bauplatz-Tipp bleibt) und neu gebaut; Nachlauf m3-ui + m5-closer + m4-fixes-ui + m4-onboarding: **49/50**, wieder nur
  B5 DOM am 120-s-Limit (`qa/playwright-results-closer-rerun.json`). Das Testlimit von B5 DOM ist jetzt 300 s (Infrastruktur,
  keine B5-Schwelle): **B5 2/2** (1,9 min). Kennzahlen: A2 464–633 ms, D3 2,6–3,7 s, D8 erste Entlassung 25,5 s, A4 101 Dateien
  / 5,03 MB, initial 0,55 MB, A6 600 s Spielzeit (741 s Wanduhr), 0 Fehler, 0 Warnungen.
- Single-File (`SINGLEFILE=1 npx vite build` → `qa/g2/rascal-rock-lockup-singlefile.html`, 6,37 MB) von file://:
  `tools/selfreview/singlefile.spec.ts` **2/2** (offline und mit SDK-Mock; Start 0,7–0,85 s, 309 Icons, 36/37 Klänge, die
  Inspektionsmusik lädt erst beim Inspektionstag). Playtest-Zip `qa/g2/rascal-rock-lockup-playtest.zip` (116 Dateien) mit
  neuer `ANLEITUNG.txt` (Stand M5, was neu ist, wie testen, offene G3-Entscheidungen).
- `npm run balance` (27 Seeds, 660 s): Exit 1 – Ergebnis und Ursachen BALANCE.md §9. `npm run economy`: H0 OK.
