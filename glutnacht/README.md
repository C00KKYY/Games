# Glutnacht (englisch: Ember Night)

Ein Survivor-Roguelite für den Browser: Du läufst, deine Waffen greifen automatisch an, und die Nacht schickt immer mehr Monster. Trag die letzte Glut durch **fünf Länder** und besiege am Ende **Die Nacht**.

Keine Installation: **`index.html` im Browser öffnen** (auch direkt von der Festplatte). Läuft mit Tastatur oder per Touch auf Handy und Tablet.

Sprachen: **Englisch** und **Deutsch**. Ohne gespeicherte Wahl richtet sich das Spiel nach der Sprache der Plattform (CrazyGames-SDK, `user.systemInfo.locale`), sonst nach der Browsersprache (Deutsch bei deutschem Browser, sonst Englisch); umschaltbar in den Einstellungen.

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

- Reines JavaScript ohne Build-Schritt und ohne Abhängigkeiten, Canvas 2D. Figuren, Gegner, Böden und Symbole werden beim Start prozedural gezeichnet, alle Klänge und die Musik live per WebAudio erzeugt. Effekt-Sprites (Funken, Ringe, Hieb, Blitz, Flammen, Explosion) stammen aus Kenneys Particle Pack und Smoke Particles (CC0): Quellen und Lizenz in `assets/src/kenney/`, `node tools/build-fx.js` verkleinert sie und schreibt `assets/fx.js` (data:-URIs, per `<script>` geladen, also auch über file://); `js/fx.js` färbt sie zur Laufzeit ein. Keine Anfragen an fremde Server; die Schriften (Lilita One, Nunito, SIL Open Font License) liegen in `fonts/`.
- Texte: Deutsch ist die Quellsprache im Code, `tr()` in `js/lang.js` liefert die englische Übersetzung.
- `js/platform.js` bindet das CrazyGames-SDK v3 an (Ladephase, Spielstart/-pause, Stummschaltung durch die Plattform, Glücksmomente, Sprache, Spielstand im Data Module). Ohne SDK tut es nichts.
- Start: Der Ladebildschirm steht im HTML und erscheint ohne JavaScript; dahinter läuft sofort die Kulisse. Das SDK lädt asynchron, gewartet wird höchstens 2,5 s, dann kommt das Menü. Kommt das SDK später, wird der Spielstand erst danach (im Menü, nie mitten im Lauf) in die Cloud übernommen; es gewinnt der Stand mit mehr Spielzeit. `window.Glutnacht.ready` meldet Werkzeugen, dass das Menü steht.
- Einstieg: Beim ersten Besuch zeigt das Menü nur Logo, Leitspruch, SPIELEN und drei Knöpfe vor einem im Canvas gemalten Titelbild (Held mit Glut, Monster-Schattenrisse). Ein Klick auf SPIELEN startet sofort das erste Land; die Rahmengeschichte steht als eine Zeile im Kapitel-Banner und ausführlich auf der Weltkarte, bis das erste Land befreit ist. Neue Länder danach beginnen mit ihrer kurzen Geschichte. Statt Text zeigt ein Tasten- bzw. Daumen-Bild unter dem Helden, wie man läuft; es verblasst nach dem ersten Schritt.
- `assets/`: CC0-Aufnahmen für Effekte und Musik (Herkunft in `assets/CREDITS-audio.txt`), noch nicht eingebunden; Effektgrafiken (`assets/fx.js`, Herkunft in `assets/CREDITS-art.txt`). Der Einzeldatei-Build bettet `assets/*.js` ein und legt Herkunft und Lizenzen als `<script type="text/plain" id="asset-credits">` dazu. `tools/qa/`: Playwright-Prüfungen mit Ausgangswerten in `tools/qa/baseline/`.
- Licht (`js/render.js`): eine Lichtkarte in halber Auflösung, gefüllt mit dem Umgebungslicht des Landes, darauf additiv die Lichtquellen (Glut des Helden, Kohlebecken, Truhen, Edelsteine, Geschosse, Feuer, Blitze, Elitegegner); sie wird mit der Szene multipliziert und enthält zugleich die Vignette. Leuchtendes (Flammen, Geschosse, Partikel, Edelsteine, Zahlen) liegt darüber. Dazu: Lichtstoß beim Stufenaufstieg (150 ms Standbild, dann die Karten), Edelsteine springen auf und ziehen Schweife, Besiegte werden gestaucht und blitzen weiß, Elitegegner haben goldenen Umriss, Bodenring und Schild „ELITE“.
- Leistung: fällt die Bildrate im Spiel unter 42 fps, schaltet die Darstellung probeweise eine Stufe herunter (6 Stufen: zuerst Lichtkarte, Edelstein-Lichter und Gegnerschatten, dann Auflösung des Canvas, Partikel als einfache Quadrate). Bringt eine billige Stufe (ohne Auflösungsschritt) keine 10 % Gewinn, wird gleich die nächste Stufe mit kleinerem Canvas probiert; erst wenn auch die nichts bringt – etwa weil die Anzeige im Stromsparmodus auf 30 fps begrenzt ist –, geht es zurück auf die Stufe vor der Probe, und dieser Takt wird als Obergrenze gemerkt. `Render.setQuality(stufe, true)` hält eine Stufe fest; `Render.perf.log` zeigt die letzten Messungen. `node tools/qa/perf.js` misst die Bildrate mit 300 Gegnern und ~700 Partikeln, `--cap=30` prüft die 30-fps-Obergrenze.
- Die Spiellogik (`js/game.js`, `js/weapons.js`) kennt kein DOM; Darstellung, Klang und Oberfläche hängen sich über `Hooks` an.
- Kollisionen über ein räumliches Hash-Raster, flüssig mit mehreren hundert Gegnern.
- Spielstand in `localStorage` (`glutnacht.v1`).

```
node tools/simtest.js aron 0 3 ashwood   # 3 Läufe headless mit einfachem Bot (Held, Nachtstufe, Anzahl, Land)
node tools/balance-batch.js 12 ashwood:none:0 ashwood:light:0   # starker Bot: Siegquote je Land/Schmiede/Nachtstufe
node tools/build-single.js out.html # alles in eine HTML-Datei bündeln
node tools/build-single.js --crazygames  # dist/crazygames/index.html zum Hochladen bei CrazyGames
node tools/qa/sdkdelay.js                 # Start mit langsamem/hängendem SDK, Sprache, Cloud-Spielstand prüfen
node tools/qa/qa.js iphone-land          # frisches Profil: Klicks/Wörter bis zum Spiel, Heldengröße, Schadenszahlen, HUD, 60 s Spiel
node tools/build-single.js dist/itch/index.html   # ohne CrazyGames-SDK, z. B. für itch.io (als ZIP hochladen)
node tools/promo/covers.js            # Titelbilder inkl. itch.io (630×500) nach dist/promo/
```
