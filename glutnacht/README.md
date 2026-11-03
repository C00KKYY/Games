# Glutnacht (englisch: Ember Night)

Ein Survivor-Roguelite für den Browser: Du läufst, deine Waffen greifen automatisch an, und die Nacht schickt immer mehr Monster. Trag die letzte Glut durch **fünf Länder** und besiege am Ende **Die Nacht**.

Keine Installation: **`index.html` im Browser öffnen** (auch direkt von der Festplatte). Läuft mit Tastatur oder per Touch auf Handy und Tablet.

Sprachen: **Englisch** und **Deutsch**. Ohne gespeicherte Wahl richtet sich das Spiel nach der Browsersprache (Deutsch bei deutschem Browser, sonst Englisch); umschaltbar im Hauptmenü und in den Einstellungen.

## Spielprinzip

- **Laufen** ist alles, was du tust – angreifen passiert automatisch.
- Besiegte Monster lassen **Edelsteine** fallen. Jede neue Stufe bietet **3 Karten** zur Wahl: neue Waffe, Waffenstufe oder Passiv. Bis zu 6 Waffen und 6 Passive.
- **Entwicklungen:** Waffe auf Stufe 8 + der passende Passiv-Gegenstand → die nächste **Truhe** verwandelt sie in eine deutlich stärkere Form (z. B. Klinge + Herz → Blutklinge).
- **Truhen** lassen Elitegegner (goldener Schein, etwa jede Minute) und Bosse fallen. Am Ende jedes Landes wartet ein Endboss.
- **Ereignisse:** Fledermausschwärme, „Umzingelt!“-Ringe, Geisterzüge, Kreuzfeuer – je nach Land andere.
- **Kohlebecken** auf der Karte zerschlagen: Gold, Herzen, Magnete (ziehen alle Edelsteine und Münzen an), Bomben.

## Länder, Sterne, Nachtstufen

Die Weltkarte zeigt fünf Länder, jedes mit eigenen Gegnern, Bossen, Ereignissen, Boden und kurzer Geschichte:

| Land | Dauer | Eigenart | Endboss |
|---|---|---|---|
| Alter Friedhof | 10 min | Einstieg | Blutgraf |
| Aschenwald | 15 min | schnelle Schwärme | Kohlenherz |
| Eissee | 15 min | langsam, aber zäh | Der Ertrunkene König |
| Burgruine | 15 min | Spucker, Kreuzfeuer | Steinkoloss |
| Herz der Nacht | 15 min | alles zusammen | Die Nacht |

- Ein befreites Land schaltet das nächste frei und dort die nächste **Nachtstufe** (bis 5): mehr Lebenspunkte, Tempo und Schaden der Gegner, mehr Gold.
- **Sterne:** ★ befreit, ★★ auf Nachtstufe 1+, ★★★ auf Nachtstufe 3+ – insgesamt 15.
- Ab Minute 3–4 ziehen Gegner-Lebenspunkte und Schaden deutlich an; Stufenaufstiege werden ab Stufe 20 langsamer. Abgestimmt mit einem Bot (`tools/balancebot.js`, Sammelauswertung `tools/balance-batch.js`).

## Zwischen den Läufen

- **Gold** bleibt erhalten. In der **Schmiede** gibt es 17 dauerhafte Verbesserungen (Schaden, Rüstung, Leben, Neu würfeln, Überspringen, Verbannen, Wiedergeburt …). Der erste Lauf bringt immer genug Gold für eine erste Verbesserung.
- **9 Helden** mit eigener Startwaffe und Bonus – sieben davon werden durch Erfolge freigeschaltet.
- **31 Erfolge** mit Gold-Belohnung, eine Übersicht der entdeckten Entwicklungen.
- Nach einem Sieg geht es auf Wunsch **endlos** weiter.

## Waffen

| Waffe | Verhalten | Entwicklung mit | → |
|---|---|---|---|
| Magiegeschoss | zielt auf den nächsten Gegner | Sanduhr | Arkansturm |
| Klinge | Hieb zum nächsten Gegner | Herz | Blutklinge (heilt) |
| Schutzkugeln | kreisen um dich | Kerze | Sternenkranz (dauerhaft) |
| Glutaura | Schaden um dich herum | Elixier | Lebensquell (heilt, bremst) |
| Blitz | trifft zufällige Gegner | Linse | Donnerkeil (springt über) |
| Sichel | fliegt hinaus und zurück | Flügel | Sturmsichel (mehr, größer, weiter) |
| Feuerflasche | brennende Pfützen | Kraft | Höllenfeuer |
| Frostnova | Eisring, verlangsamt | Panzer | Ewiges Eis (friert ein) |
| Dolche | schnelle Würfe | Kleeblatt | Tausend Klingen |

## Bedienung

| Eingabe | Aktion |
|---|---|
| WASD / Pfeiltasten | laufen |
| Touch / Maus gedrückt halten und ziehen | laufen (virtueller Stick) |
| 1–4, R | Karte wählen, neu würfeln |
| Enter / Leertaste | bestätigen (Truhe, Start, Nochmal) |
| Esc / P | Pause |

## Technik

- Reines JavaScript ohne Build-Schritt und ohne Abhängigkeiten, Canvas 2D. Alle Grafiken werden beim Start prozedural gezeichnet, alle Klänge und die Musik live per WebAudio erzeugt. Keine Anfragen an fremde Server; die Schriften (Lilita One, Nunito, SIL Open Font License) liegen in `fonts/`.
- Texte: Deutsch ist die Quellsprache im Code, `tr()` in `js/lang.js` liefert die englische Übersetzung.
- `js/platform.js` bindet das CrazyGames-SDK v3 an (Spielstart/-pause, Stummschaltung durch die Plattform, Glücksmomente). Ohne SDK tut es nichts.
- Die Spiellogik (`js/game.js`, `js/weapons.js`) kennt kein DOM; Darstellung, Klang und Oberfläche hängen sich über `Hooks` an.
- Kollisionen über ein räumliches Hash-Raster, flüssig mit mehreren hundert Gegnern.
- Spielstand in `localStorage` (`glutnacht.v1`).

```
node tools/simtest.js aron 0 3 ashwood   # 3 Läufe headless mit einfachem Bot (Held, Nachtstufe, Anzahl, Land)
node tools/balance-batch.js 12 ashwood:none:0 ashwood:light:0   # starker Bot: Siegquote je Land/Schmiede/Nachtstufe
node tools/build-single.js out.html # alles in eine HTML-Datei bündeln
node tools/build-single.js --crazygames  # dist/crazygames/index.html zum Hochladen bei CrazyGames
```
