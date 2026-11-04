# UI_DESIGN – Vertrag für M3 (verbindlich für alle UI-Komponenten)

Grundlage: Brief §6 (UX), §7.5 (UI-Kit), §6.6 (Kompakt-HUD), §10 (Sprache), §11 (Plattform), STYLE_GUIDE §7. Code-Vertrag: `src/ui/ctx.ts`.

## 1. Architektur
- DOM-Overlay über dem Canvas. `ctx.root` ist der HUD-Layer (`.hud`, `pointer-events:none`). Interaktive Elemente setzen `pointer-events:auto`.
- Jede Komponente ist eine Datei unter `src/ui/` und exportiert `mountX(ctx): Component`. `update(dt)` wird jedes Frame aufgerufen. DOM-Schreibzugriffe drosselt die Komponente selbst auf höchstens 10× pro Sekunde und schreibt nur bei Änderung (Text-Memo).
- Animationen nur über `transform` und `opacity`. Keine DOM-Elemente pro Agent.
- Gelesen wird nur aus `ctx.w`, geschrieben nur über `ctx.cmd.*`. Fehlschläge gehen an `ctx.feedback(result)`.
- Texte kommen ausschließlich aus `ctx.t(key)`. Neue Keys stehen in **beiden** Dateien `src/i18n/en.json` und `de.json`. DE ist ~30 % länger, das Layout muss das fassen.
- Icons: `ctx.icon(name)` → `public/ui/<name>.svg` (vorhanden: coin, star, starEmpty, clock, sun, moon, mood, play, fast, pause, gear, help, clipboard, ferry, bed, meal, shower, yarn, book, gate, crate, rooms, staff, decor, projects, demolish, close, check, warden).
- CSS: `src/ui/hud.css` (Tokens auf `:root`). Neue Regeln kommen in eigene Dateien `src/ui/<komponente>.css`, importiert aus der Komponente. Maße in `rem`, Basis `--ui`.

## 2. Pflichtregeln (Tests B1–B7, D4, D5)
- **Jeder Button** hat ein Icon oder Label **und** `aria-label` **und** einen Tooltip über `ctx.tip(el, …)` mit Name, Effekt in Zahlen und Hotkey. Er trägt `data-tip`, damit D5 ihn findet.
- **Touch-Ziele** ≥ 44×44 CSS-px, wenn `ctx.touch` (B4). Auf Desktop ≥ 32 px.
- **Schrift** ≥ 12 px überall, Fließtext ≥ 14 px (B1).
- **Overlays** (Panels, Menüs, Modals, Toasts) tragen `data-overlay` (B1: Überlappungsprüfung ignoriert sie).
- **HUD-Budget bei 800×450** (B7):
  - Topbar inklusive Fluss-Leiste ≤ 40 px.
  - Bauleiste ≤ 64 px.
  - Klemmbrett als einklappbarer Chip ≤ 200×40 px.
  - Spielfläche ≥ 70 %.
- **Keine toten Buttons, kein „Coming soon“** (H6). Noch nicht freigeschaltete Dinge zeigen ein Schloss und den Grund („Unlocks with 2 stars“) oder sind ausgeblendet, wenn das System noch gar nicht existiert (Deko, Projekte bis M5).
- Kein Fullscreen-Button, keine externen Links (B5).
- `user-select:none` gilt global (B6).
- Ein Ziel-Widget ist immer sichtbar (D4): Klemmbrett, im Tutorial der Tutorialschritt „1/4“.
- Esc ist nie der einzige Weg. Jedes Panel hat ein ×. Rechtsklick bricht Werkzeuge ab.

## 3. Komponenten
| Datei | Inhalt |
|---|---|
| `topbar.ts` | **Münzen** (rollender Zähler), **Ruf-Sterne** + Fortschrittsbalken zum nächsten Stern (Tooltip „Ruf 95/140“), **Uhr** (Tag, hh:mm, Sonne/Mond), **Tempo** (Pause / 1× / 2× / 3×; 3× mit Schloss bis 3★), **Laune** (Ø %), **Fluss-Leiste** aus `flow(w)` (`src/sim/flow.ts`): Stufe = Icon + Kapazität/Tag, der Engpass pulsiert rot, ein Klick fliegt zum Raum der Stufe, Button „Where's my bottleneck?“, **Zahnrad** (Einstellungen). Kompakt: Fluss-Leiste nur Icons, Zahlen im Tooltip |
| `clipboard.ts` | Aktuelles Ziel aus `OBJECTIVES` (`src/sim/objectives.ts`) mit Fortschrittsbalken und „Show me“ (Kamera zum Ort). Aufklappbar zur Liste aller 10 Ziele (✓, Pflicht markiert). Im Tutorial der Schritt „1/4“ und dessen Text. Kompakt: Chip ≤ 200×40, Tipp klappt auf |
| `buildbar.ts` | Leiste unten: Räume, Personal, Abriss (+ Deko/Projekte erst, wenn ihr System existiert). Öffnet `buildMenu`/`staffMenu` als Overlay-Karte über der Leiste |
| `buildMenu.ts` | Raum-Karten: Icon, Name, Kosten („120 + 20/tile“), Mindestgröße, Kapazitätsregel, Schloss + Grund. Klick → `ctx.tool.set({kind:'build', type})` |
| `staffMenu.ts` | Rollen mit Anzahl, Lohn/Tag, „Hire +1 (Preis)“ → `cmd.hire` |
| `panels.ts` | **Raum-Panel** (Auswahl `room`): Name + Level, Durchsatz/h und „Limit: …“ aus `roomStats` (`src/sim/roomstats.ts`), Auslastung, Schlange, Ø Weg, Personal + Hire +1, Upgrade ×1/×10/Max mit Vorschau „12 → 13 / h“, nächster Meilenstein, Abriss (Bestätigung), Kanten-Drag-Hinweis. **Rascal-Panel** (Auswahl `agent`): Name, Spezies, Strafakte (Aktenzeichen, Delikt aus `content/gags.ts` nach `a.crime`, Strafmaß), 4 Bedürfnisbalken mit Icon (nie nur Farbe), Resozialisierungsbalken, Eigenschaften, „Follow“. Panels sind Overlays (`data-overlay`) und schließen sich beim Kamera-Drag |
| `toasts.ts` | Toast-Stapel oben Mitte unter der Topbar, max. 3, höchstens 2 Zeilen, nicht blockierend. Reagiert auf Sim-Events (`w.events`): ferryLeftWithRest, escaped, caught, objective, unlock, star, dayEnd (Tagesbilanz 3 s), nightSkip („Next morning…“), loan |
| `tooltips.ts` | Implementierung von `ctx.tip`: ein gemeinsames Tooltip-Element, Hover 300 ms, Long-Press 400 ms, Positionierung im Viewport |
| `modals.ts` | **Einstellungen**: Musik/SFX/Ambience-Regler, Sprache EN/DE, Screenshake, Credits/Lizenzen-Text, Spielstand zurücksetzen mit Bestätigung, keine externen Links. **Hilfe**: Steuerung für Maus, Tastatur und Touch, **jede Taste** gelistet (D5). Modals pausieren (`ctx.setPaused`) |
| `tools.ts` + `render/ghost.ts` | Canvas-Werkzeuge siehe §4 |

## 4. Canvas-Interaktion (`tools.ts`)
- **Auswahl** (kein Werkzeug): Klick auf einen Agenten (≤ 0,6 Kacheln Abstand zum Fußpunkt, vorne gewinnt) → `selection agent`; Klick in einen Raum → `selection room`; leer → `null`. Doppelklick/-tipp auf einen Raum zentriert ihn.
- **Bauen** (`tool build`):
  - Geist in Mindestgröße am Cursor (Kacheln gesnappt).
  - Maus gedrückt + ziehen → Rechteck; loslassen → `cmd.build`. Touch: 1 Finger zieht, danach erscheinen „✓ / ✕“ am Rechteck.
  - Geistfarbe: grün = gültig (`validatePlacement` aus `src/sim/rooms.ts`), rot = ungültig, mit Grund-Icon und Text (`place.*` Keys).
  - Label am Cursor: Preis (`roomCost`), Kapazität (`roomSlots` bzw. `packRoom`), Nachbarschafts-Boni und Lärm-Malus (`adjacencyBonuses`, `noisePenalty` aus `src/sim/layout.ts`).
  - Rechtsklick, × oder Esc bricht ab. Nach erfolgreichem Bau bleibt das Werkzeug aktiv (Shift) bzw. geht auf `none`.
- **Kanten-Drag**: Ist ein Raum gewählt, lassen sich seine Kanten greifen. Ziehen zeigt das neue Rechteck mit Differenzpreis, loslassen → `cmd.resize`.
- **Abriss** (`tool demolish`): Klick auf Raum → Bestätigungsblase mit Erstattung → `cmd.demolish`.
- **Kamera**: Links-Drag auf leerer Fläche schwenkt nur ohne Werkzeug. Rechts-/Mittel-Drag und Leertaste + Links-Drag schwenken immer. Touch: 1 Finger schwenkt ohne Werkzeug, 2 Finger immer.
  - Klick vs. Drag: Bewegung < 6 px und < 250 ms gilt als Klick.
- **Hotkeys**: `event.key` (lowercase) für B (Baumenü), O (Overlays: Wachradius), H (Hilfe), R (drehen – noch ohne Funktion → nicht anzeigen), Entf (Abriss-Werkzeug), P (Pause), 1/2/3 (Tempo), Strg/Cmd+Z (`cmd.undo`). WASD/Pfeile laufen über `event.code` (schon in `src/ui/input.ts`).
- **Welt-Overlays** in Pixi (`render/ghost.ts`): Geist-Rechteck, Auswahlrahmen, Kanten-Griffe, Wachradius, Nachbarschaftslinien (gestrichelt). Keine Allokation pro Frame: Graphics einmal anlegen, bei Änderung neu zeichnen.
