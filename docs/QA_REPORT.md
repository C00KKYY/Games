# QA_REPORT

## Gates

### G1 – Art-Spike
- Material: `docs/ART_SPIKE.md`, `qa/g1/` (Screenshots Tag/Nacht 1280/907/800, Kantine Stufe 1/2, Charaktere 4 Richtungen, Kontaktbogen, Cover-Entwurf, 20-s-Video), Playtest-Zip.
- **Freigabe: ja** (Auftraggeber, 2026-11-04; zuerst als „brides jq“ = „beides ja“, danach ausdrücklich bestätigt). Keine Änderungswünsche genannt.
- Selbst festgestellte Schwächen, die im Art-Pass (M3/M7) bearbeitet werden: Profilköpfe, Figurengröße bei 800×450, Wand-Cutaway, Bodenvariation, Wasser, Cover (Risiko: extern), Fenster-Lichtkegel.
- Blindvergleich: bestanden mit Einschränkung (siehe ART_SPIKE.md). Daraus abgeleitet: Fluss-Leiste lesbarer machen, Bürokratie-Satire sichtbarer machen (Altersanmutung).

### G2 – erste 10 Minuten
- offen (nach M4)

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
