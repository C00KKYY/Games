# Glutnacht

Ein Survivor-Roguelite für den Browser: Du läufst, deine Waffen greifen automatisch an, und die Nacht schickt immer mehr Monster. Überlebe 15 Minuten und besiege **Die Nacht**.

Keine Installation: **`index.html` im Browser öffnen** (auch direkt von der Festplatte). Läuft mit Tastatur oder per Touch auf Handy und Tablet.

## Spielprinzip

- **Laufen** ist alles, was du tust – angreifen passiert automatisch.
- Besiegte Monster lassen **Edelsteine** fallen. Jede neue Stufe bietet **3 Karten** zur Wahl: neue Waffe, Waffen-Stufe oder Passiv. Bis zu 6 Waffen und 6 Passive.
- **Entwicklungen:** Waffe auf Stufe 8 + der passende Passiv-Gegenstand → die nächste **Truhe** verwandelt sie in eine deutlich stärkere Form (z. B. Klinge + Herz → Blutklinge).
- **Truhen** tragen Elitegegner (goldener Schein, etwa jede Minute) und Bosse (3, 6, 9, 12 Minuten). Nach 15 Minuten kommt der Endboss.
- **Ereignisse:** Fledermausschwärme, „Umzingelt!“-Ringe, Geisterzüge.
- **Kohlebecken** auf der Karte zerschlagen: Gold, Herzen, Magnete (zieht alle Edelsteine an), Bomben.

## Zwischen den Läufen

- **Gold** bleibt erhalten. In der **Schmiede** gibt es 17 dauerhafte Verbesserungen (Schaden, Rüstung, Leben, Neu würfeln, Überspringen, Verbannen, Wiedergeburt …).
- **9 Helden** mit eigener Startwaffe und Bonus – sieben davon werden durch Erfolge freigeschaltet.
- **27 Erfolge** mit Gold-Belohnung, eine Übersicht der entdeckten Entwicklungen.
- Ein Sieg schaltet die nächste **Nachtstufe** frei (bis 5): stärkere Monster, mehr Gold.
- Nach dem Sieg geht es auf Wunsch **endlos** weiter.

## Waffen

| Waffe | Verhalten | Entwicklung mit | → |
|---|---|---|---|
| Magiegeschoss | zielt auf den nächsten Gegner | Sanduhr | Arkansturm |
| Klinge | Hieb zum nächsten Gegner | Herz | Blutklinge (heilt) |
| Schutzkugeln | kreisen um dich | Kerze | Sternenkranz (dauerhaft) |
| Glutaura | Schaden um dich herum | Elixier | Lebensquell (heilt, bremst) |
| Blitz | trifft zufällige Gegner | Linse | Donnerkeil (springt über) |
| Sichel | fliegt hinaus und zurück | Flügel | Sturmsichel |
| Feuerflasche | brennende Pfützen | Kraft | Höllenfeuer |
| Frostnova | Eisring, verlangsamt | Panzer | Ewiges Eis (friert ein) |
| Dolche | schnelle Würfe | Kleeblatt | Tausend Klingen |

## Bedienung

| Eingabe | Aktion |
|---|---|
| WASD / Pfeiltasten | laufen |
| Touch / Maus gedrückt halten und ziehen | laufen (virtueller Stick) |
| 1–4, R | Karte wählen, neu würfeln |
| Esc / P | Pause |

## Technik

- Reines JavaScript ohne Build-Schritt und ohne Abhängigkeiten, Canvas 2D. Alle Grafiken werden beim Start prozedural gezeichnet, alle Klänge und die Musik live per WebAudio erzeugt.
- Die Spiellogik (`js/game.js`, `js/weapons.js`) kennt kein DOM; Darstellung, Klang und Oberfläche hängen sich über `Hooks` an.
- Kollisionen über ein räumliches Hash-Raster, flüssig mit mehreren hundert Gegnern.
- Spielstand in `localStorage` (`glutnacht.v1`).

```
node tools/simtest.js aron 0 3      # 3 Läufe headless mit Ausweich-Bot (Held, Nachtstufe, Anzahl)
node tools/build-single.js out.html # alles in eine HTML-Datei bündeln
```
