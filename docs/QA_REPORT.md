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
