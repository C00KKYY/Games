# Verkehrsmeister

Ein Verkehrsmanagement-Spiel für den Browser. Du planst das Straßennetz einer wachsenden Stadt, regelst Kreuzungen und hältst den Verkehr am Fließen – mit einer echten Verkehrssimulation, in der jedes Auto seine eigene Route fährt, an Kreuzungen nach deutschen Regeln wartet und im Stau stehen bleibt.

Keine Installation, keine Abhängigkeiten: **`index.html` im Browser öffnen** und losspielen (funktioniert auch direkt per Doppelklick von der Festplatte).

## Spielmodi

- **Kampagne** – 8 Level mit steigender Schwierigkeit und neuen Werkzeugen, je bis zu drei Sterne:
  1. *Lindenau* – Tutorial: Häuser mit dem Büro verbinden
  2. *Brückenfeld* – ein Fluss teilt Wohnen und Arbeiten; Einbahnstraßen
  3. *Altstadt Kreuzberg* – vorgebautes Raster, überall rechts vor links; Ampeln und Vorfahrt
  4. *Hügelheim* – Felsen, Tunnel, Kreisverkehre
  5. *Hafen Nordstrand* – Fabriken, LKW-Lieferverkehr, Pendler von außerhalb, Schnellstraßen
  6. *Neustadt am Main* – Durchgangsverkehr, Stromausfälle, Brände
  7. *Seestadt* – Busse und Haltestellen rund um einen See
  8. *Metropole Rheinhafen* – alles zusammen, mit Stadion und Einkaufszentrum
- **Endlosmodus** – fünf Landschaften, die Stadt wächst und der Verkehr nimmt täglich zu. Rekorde werden gespeichert.
- **Freies Bauen** – unbegrenztes Geld, Gebäude selbst platzieren, Wachstum und Ereignisse schaltbar.

## Was simuliert wird

- **Fahrzeuge**: PKW, Lieferwagen, LKW, Linienbusse, Rettungswagen und Feuerwehr mit eigenem Beschleunigungs- und Folgeverhalten, Blinkern, Bremslichtern und Scheinwerfern bei Nacht.
- **Routenplanung**: A*-Suche über Kacheln und Fahrtrichtungen, berücksichtigt Tempolimits, Abbiegevorgänge, Wartezeiten an Kreuzungen und aktuelle Staus; Fahrzeuge suchen bei Stau neue Wege.
- **Kreuzungsregeln**:
  - *Rechts vor links* inklusive „Linksabbieger lässt Gegenverkehr durch“ und Auflösung von Patt-Situationen
  - *Vorfahrtsstraße* (auch abknickend) mit Haifischzähnen und Schildern
  - *Ampeln* mit frei programmierbaren Phasen (Pfeile pro Zufahrt anklicken), Gelb- und Räumzeiten, Vorlagen, Versatz für die **Grüne Welle** (inkl. Automatik zur Nachbarampel) und **adaptiver Steuerung**
  - *Kreisverkehr* – wer im Kreis fährt, hat Vorfahrt
  - *Linksabbiegeverbote* pro Zufahrt
  - „Kreuzung nicht blockieren“: Einfahrt nur, wenn hinter der Kreuzung Platz ist; Ketten direkt benachbarter Kreuzungen werden gemeinsam freigegeben
- **Stadtleben**: Pendler zur Arbeit und zurück, Einkäufe, Freizeit, Lieferverkehr, Durchgangsverkehr über Ortseingänge; Tagesgang mit Berufsverkehr und Wochenende; die Stadt wächst abhängig von der Zufriedenheit.
- **Ereignisse**: Unfälle (Kreuzung gesperrt, Rettungswagen, Abschleppdienst), Baustellen, Stromausfälle, Brände, Fußballspiele im Stadion, Regen, Nebel und Schnee.
- **Busse**: Haltestellen, Linien mit beliebig vielen Bussen, Fahrgäste mit Wartezeiten und Umstieg vom Auto.
- **Wirtschaft**: Baukosten (Brücken und Tunnel teurer), Unterhalt pro Tag, Einnahmen pro Fahrt, Steuern abhängig von der Zufriedenheit.

## Bedienung

| Eingabe | Aktion |
|---|---|
| Linke Maustaste ziehen | Straßen bauen / abreißen (je nach Werkzeug) |
| Klick | Auswählen, Ampel/Vorfahrt/Kreisverkehr setzen, Haltestellen |
| Rechte/mittlere Maustaste ziehen, W A S D, Pfeiltasten | Karte verschieben |
| Mausrad, + / − | Zoomen |
| Leertaste | Pause |
| 1 · 2 · 3 | Spieltempo |
| Strg + Z | Rückgängig |
| H | Verkehrsdichte (Stau-Heatmap) |
| S (kurz tippen) | Statistik |
| Q R E T X L V K B N | Werkzeuge |
| Enter | Buslinie abschließen |
| Esc | Abbrechen / Menü |

Auf Touch-Geräten: ein Finger baut bzw. verschiebt, zwei Finger zoomen und verschieben.

Spielstände (drei Plätze plus automatisches Speichern) liegen im Browser-Speicher (`localStorage`).

## Projektstruktur

```
index.html          Einstieg
css/style.css       Gestaltung (Verkehrsschild-Optik)
js/util.js          Helfer: Richtungen, Zufall, Heap, Formatierung
js/config.js        Balancing: Kosten, Tempo, Nachfragekurven, Fahrzeug- und Gebäudetypen
js/world.js         Gelände, Straßennetz, Gebäude
js/geometry.js      Fahrwege innerhalb einer Kachel, Konflikttabellen
js/pathfinding.js   A*-Routensuche
js/junction.js      Kreuzungssteuerung (Regeln, Ampeln, Kreisverkehr)
js/traffic.js       Fahrzeuge, Folgeverhalten, Spuren, Ausparken, Umleiten
js/city.js          Nachfrage, Rückfahrten, Wachstum, Ereignisse, Busse
js/mapgen.js        Level und Kartengenerator
js/game.js          Spielzustand, Geld, Zufriedenheit, Ziele, Bauaktionen, Speichern
js/render.js        Canvas-Darstellung (gecachte Chunks + dynamische Ebenen)
js/ui.js            Oberfläche, Menüs, Ampel-Editor, Statistik, Tutorial
js/input.js         Maus, Touch, Tastatur
js/audio.js         Synthetische Klänge (WebAudio)
js/main.js          Start
tools/simtest.js    Headless-Simulationstest (Node)
tools/bot.js        Bot, der Level automatisch spielt (Balance-Tests)
tools/build-single.js  bündelt alles in eine einzelne HTML-Datei
```

## Entwicklung

```bash
node tools/simtest.js demo 12000      # Simulation ohne Browser, prüft Spuren auf Überlappungen
node tools/bot.js all 3               # Bot spielt alle Kampagnen-Level je 3 Spieltage
node tools/build-single.js dist/verkehrsmeister.html   # Einzeldatei erzeugen
```
