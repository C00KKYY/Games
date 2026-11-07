# Glutnacht (englisch: Ember Night)

Ein Survivor-Roguelite für den Browser: Du läufst, deine Waffen greifen automatisch an, und die Nacht schickt immer mehr Monster. Trag die letzte Glut durch **fünf Länder** und besiege am Ende **Die Nacht**.

Keine Installation: **`index.html` im Browser öffnen** (auch direkt von der Festplatte). Läuft mit Tastatur oder per Touch auf Handy und Tablet.

Sprachen: **Englisch** und **Deutsch**. Ohne gespeicherte Wahl richtet sich das Spiel nach der Sprache der Plattform (CrazyGames-SDK, `user.systemInfo.locale`), sonst nach der Browsersprache (Deutsch bei deutschem Browser, sonst Englisch); umschaltbar in den Einstellungen.

## Spielprinzip

- **Laufen** ist alles, was du tust – angreifen passiert automatisch.
- Besiegte Monster lassen **Edelsteine** fallen. Jede neue Stufe bietet **3 Karten** zur Wahl: neue Waffe, Waffenstufe oder Passiv. Bis zu 6 Waffen und 6 Passive.
- **Entwicklungen:** Waffe auf Stufe 8 + der passende Passiv-Gegenstand → die nächste **Truhe** verwandelt sie in eine deutlich stärkere Form (z. B. Klinge + Herz → Blutklinge).
- **Truhen** lassen Elitegegner (goldener Schein, der erste nach 30 Sekunden, danach etwa jede Minute) und Bosse fallen. Am Ende jedes Landes wartet ein Endboss.
- **Ereignisse:** Fledermausschwärme, „Umzingelt!“-Ringe, Geisterzüge, Kreuzfeuer – je nach Land andere.
- **Kohlebecken** auf der Karte zerschlagen: Gold, Herzen, Magnete (ziehen alle Edelsteine und Münzen an), Bomben.

## Länder, Sterne, Nachtstufen

Die Weltkarte zeigt fünf Länder, jedes mit eigenen Gegnern, Bossen, Ereignissen, Boden und kurzer Geschichte:

| Land | Dauer | Eigenart | Fernkämpfer (ab) | Endboss |
|---|---|---|---|---|
| Alter Friedhof | 10 min | Einstieg | Spucker (0:40), Totenglocke (Minute 4) | Blutgraf |
| Aschenwald | 15 min | schnelle Schwärme | Aschenkessel (0:42), Nadelmotte (Minute 3) | Kohlenherz |
| Eissee | 15 min | langsam, aber zäh | Nadelmotte (0:45), Spucker, Totenglocke (Minute 5) | Der Ertrunkene König |
| Burgruine | 15 min | Spucker, Kreuzfeuer | Spucker (0:40), Aschenkessel, Nadelmotte | Steinkoloss |
| Herz der Nacht | 15 min | alles zusammen | alle vier (ab 0:40) | Die Nacht |

### Fernkämpfer

Vier Gegner schießen, jeder mit eigenem Ausweich-Kniff. Jeder Angriff wird angekündigt: Der Schütze holt sichtbar aus
(mindestens 0,45 s, mit Keil, Ziellinie oder Ladekreis), Flächen sind mindestens 0,75 s vorher markiert. Gegnergeschosse
sind rot mit hellem Kern und dunklem Ring (kein eigenes Geschoss hat diesen Ring); kommt etwas von außerhalb des Bildes,
warnt ein roter Pfeil am Rand. Geschossen wird nur aus dem Bild heraus.

| Gegner | Angriff | Ausweichen |
|---|---|---|
| Spucker | zielt mit einem Keil, spuckt eine Kugel (ab Minute 4 einen Fächer aus drei) | seitlich weg |
| Aschenkessel | wirft eine Kohle im Bogen auf einen markierten Kreis, dort bleibt kurz eine Glutpfütze | den Kreis verlassen, Pfütze meiden |
| Nadelmotte | Ziellinie mit Vorhalt, 0,3 s vor dem Schuss gesperrt, dann eine sehr schnelle Nadel | beim Sperren die Richtung wechseln |
| Totenglocke | Ladekreis zeigt die Austrittspunkte, dann zwei versetzte Ringe aus je zehn Kugeln | durch die Lücken des Gitters |

Ab Minute 3 ist jeder zweite Elitegegner ein Fernkämpfer (Fächer aus fünf, drei Kohlen, drei Nadeln, drei Ringe aus zwölf).
Jeder Boss hat mindestens einen angekündigten Fernangriff (Endbosse zwei): Fächer, Lanzen (drei Ziellinien), Regen aus
Kreisen (gestreut, in einer Reihe, als Sternensturz oder als nachführende Finsternis, beim Schleimkönig mit bremsender
Schleimpfütze), Spirale oder Bahnen über das ganze Bild; die Nova lädt jetzt 0,6 s mit sichtbaren Austrittspunkten.

- Ein befreites Land schaltet das nächste frei und dort die nächste **Nachtstufe** (bis 5): mehr Lebenspunkte, Tempo und Schaden der Gegner, mehr Gold.
- **Sterne:** ★ befreit, ★★ auf Nachtstufe 1+, ★★★ auf Nachtstufe 3+ – insgesamt 15.
- **Die erste Minute:** Schon beim Start stehen ein paar Gegner im Bild. Die Stufen 1–10 kosten weniger Erfahrung (ab Stufe 11 gilt die alte Kurve), so bringt die erste Minute 4–5 Aufstiege. Nach 30 Sekunden erscheint der erste Elitegegner sichtbar im Bild (schnell, aber schwächer als spätere) und lässt eine Truhe fallen. Nach 40–45 Sekunden (je Land) gehen die ersten Fernkämpfer sichtbar im Bild in Stellung, kurz danach folgt das erste große Ereignis. Damit es nicht zu leicht wird, kommen in den ersten drei Wellen jedes Landes mehr Gegner, und langsame Gegner sind in den ersten drei Minuten bis zu 20 % schneller.
- Ab Minute 3–4 ziehen Gegner-Lebenspunkte und Schaden deutlich an; Stufenaufstiege werden ab Stufe 20 langsamer. Abgestimmt mit einem Bot (`tools/balancebot.js`, Sammelauswertung `tools/balance-batch.js`, die auch Stufe nach 60 s, ersten Treffer, Schaden je Minute und Gegner im Bild nach 2/10/30/60 s meldet).

Siegquoten des starken Bots (alle 9 Helden reihum, Nachtstufe 0; „Schmiede“: none = nichts gekauft, light/mid/max = Voreinstellungen in `tools/balancebot.js`). Die Quoten schwanken stark; bei n = 24 beträgt der Zufallsfehler etwa ±10 Prozentpunkte:

| Land | Schmiede | Ziel | Siege (n) | Tod im Median |
|---|---|---|---|---|
| Alter Friedhof | none | 65–75 % | 73 % (48) | 9,7 min (meist Endboss) |
| Aschenwald | none / light | ~25 / ~40 % | 42 % / 21 % (je 24) | 8,9 / 10,1 min |
| Eissee | light / mid | ~33 / ~50 % | 50 % / 33 % (je 24) | 13,6 / 14,7 min |
| Burgruine | mid | ~33 % | 22 % (36) | 14,4 min |
| Herz der Nacht | mid / max | ~17 / ~67 % | 33 % / 67 % (je 24) | 11,5 / 16,7 min |

Erste Minute mit dem starken Bot: Stufe 6–10 nach 60 s (vorher 5–8), 10–13 Gegner im Bild nach 2 s (vorher 3–5), Truhe vor 60 s in 48 von 48 Läufen auf dem Friedhof (vorher 1 von 12).

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
| M | Ton an/aus (alles stumm; die Schalter für Klang und Musik bleiben, wie sie sind) |

## Technik

- Reines JavaScript ohne Build-Schritt und ohne Abhängigkeiten, Canvas 2D. Figuren, Gegner, Böden und Symbole werden beim Start prozedural gezeichnet, nach festen Stilregeln (`STYLE` in `js/sprites.js`: Licht von oben links, gemeinsame Palette mit dreistufigen Farbrampen, dunkler Umriss und Glanzkante um jede Silhouette, die `finish()` einheitlich setzt). Jeder der 9 Helden hat eine eigene Silhouette (Kapuze mit Rundschild, Zauberhut, Federmütze mit Köcher, Heiligenschein, Helm mit Bart und Hammer, Blitzkrone, Eiskrone mit Pelzkragen, Fliegenpilz-Hut, Flammenkapuze); Bosse sind Gegner-Bilder mit Tönung, Größe und Krone (Endbosse größer), scharf gerechnet. Alle Bilder eines Landes (Gegner mit Lauf-, Ausholbild, Treffer- und Frostfassung, gespiegelt, goldener Elite-Umriss, Deko, Aufsammelbares, Edelsteine) entstehen vor dem Spiel – nach und nach in Menü und Karte, der Rest beim Start des Laufs; Boss-Bilder in Leerlaufzeit (`Render.prebuildStage`). Im laufenden Spiel wird so nichts mehr gezeichnet, was ruckeln könnte. Die Böden sind 512er-Kacheln mit eigener Struktur je Land (Wiese mit Trittsteinen, rissige Erde mit Glutspalten, Eisschollen mit Schneewehen, Kopfsteinpflaster, Kristallplatten mit leuchtenden Adern; Voronoi-Zellen auf dem Torus, nahtlos); Deko trägt je Land Schnee, Glut, Moos oder Kristallschimmer auf der Oberkante. `node tools/qa/contact.js` legt einen Kontaktbogen aller Sprites an. Effekt-Sprites (Funken, Ringe, Hieb, Blitz, Flammen, Explosion) stammen aus Kenneys Particle Pack und Smoke Particles (CC0): Quellen und Lizenz in `assets/src/kenney/`, `node tools/build-fx.js` verkleinert sie und schreibt `assets/fx.js` (data:-URIs, per `<script>` geladen, also auch über file://); `js/fx.js` färbt sie zur Laufzeit ein. Keine Anfragen an fremde Server; die Schriften (Lilita One, Nunito, SIL Open Font License) liegen in `fonts/`.
- Texte: Deutsch ist die Quellsprache im Code, `tr()` in `js/lang.js` liefert die englische Übersetzung.
- `js/platform.js` bindet das CrazyGames-SDK v3 an (Ladephase, Spielstart/-pause, Stummschaltung durch die Plattform, Glücksmomente, Sprache, Spielstand im Data Module). Ohne SDK tut es nichts.
- Start: Der Ladebildschirm steht im HTML und erscheint ohne JavaScript; dahinter läuft sofort die Kulisse. Das SDK lädt asynchron, gewartet wird höchstens 2,5 s, dann kommt das Menü. Kommt das SDK später, wird der Spielstand erst danach (im Menü, nie mitten im Lauf) in die Cloud übernommen; es gewinnt der Stand mit mehr Spielzeit. `window.Glutnacht.ready` meldet Werkzeugen, dass das Menü steht.
- Einstieg: Beim ersten Besuch zeigt das Menü nur Logo, Leitspruch, SPIELEN und drei Knöpfe vor einem im Canvas gemalten Titelbild (Held mit Glut, Monster-Schattenrisse). Ein Klick auf SPIELEN startet sofort das erste Land; die Rahmengeschichte steht als eine Zeile im Kapitel-Banner und ausführlich auf der Weltkarte, bis das erste Land befreit ist. Neue Länder danach beginnen mit ihrer kurzen Geschichte. Statt Text zeigt ein Tasten- bzw. Daumen-Bild unter dem Helden, wie man läuft; es verblasst nach dem ersten Schritt.
- Ton (`js/audio.js`, WebAudio): 34 CC0-Effekte und 5 Musikstücke aus `assets/audio/` (Herkunft in `assets/CREDITS-audio.txt`), von `node tools/build-audio.js` als base64 nach `assets/audio.js` geschrieben (per `<script>` geladen, auch über file://; 2,08 MB). Beim Start werden die Effekte in einem OfflineAudioContext dekodiert, die Musik erst bei Bedarf (höchstens zwei Schleifen im Speicher). Jeder Effekt klingt leicht anders (±8 % Lautstärke, Treffer und Kills ±40 Cent), höchstens 6 Kopien je Effekt, ein kurzer Hall liegt darunter, Treffer und Kills sind nach ihrer Position im Stereobild verteilt. Musik nach Intensität mit 1,5 s Überblendung: Menü, Kampf (die ersten 4 Minuten gedämpft), Boss; Sieg und Niederlage spielen einen kurzen Abschluss. Der Ton startet bei der ersten Berührung, dem ersten Klick oder Tastendruck (iOS: stiller Puffer, erneutes Anwerfen nach Unterbrechungen). Die Stummschaltung der Plattform und `?muteAudio=true` haben Vorrang vor den eigenen Schaltern (Einstellungen, Taste M); stumm oder im Hintergrund wird der Ton angehalten. Fehlt eine Aufnahme, spielt der frühere Synthesizer. Probehören: `tools/audio/audition.html` (jedes Ereignis und Stück, mit Lautstärke-Reglern).
- `assets/`: Effektgrafiken (`assets/fx.js`, Herkunft in `assets/CREDITS-art.txt`). Der Einzeldatei-Build bettet `assets/*.js` ein und legt Herkunft und Lizenzen als `<script type="text/plain" id="asset-credits">` dazu. `tools/qa/`: Playwright-Prüfungen mit Ausgangswerten in `tools/qa/baseline/`.
- Licht (`js/render.js`): eine Lichtkarte in halber Auflösung, gefüllt mit dem Umgebungslicht des Landes, darauf additiv die Lichtquellen (Glut des Helden, Kohlebecken, Truhen, Edelsteine, Geschosse, Feuer, Blitze, Elitegegner); sie wird mit der Szene multipliziert und enthält zugleich die Vignette. Leuchtendes (Flammen, Geschosse, Partikel, Edelsteine, Zahlen) liegt darüber. Dazu: Lichtstoß beim Stufenaufstieg (150 ms Standbild, dann die Karten), Edelsteine springen auf und ziehen Schweife, Besiegte werden gestaucht und blitzen weiß, Elitegegner haben goldenen Umriss, Bodenring und Schild „ELITE“.
- Leistung: Gemessen wird an den Zeitstempeln von `requestAnimationFrame`. Ist der Takt der Anzeige (20-%-Quantil der Bildabstände) langsamer als 42 fps oder ruckeln mehr als 12 % der Bilder (länger als das 1,5-Fache des Takts), schaltet die Darstellung probeweise eine Stufe herunter (6 Stufen: zuerst Lichtkarte, Edelstein-Lichter und Gegnerschatten, auf hochauflösenden Anzeigen mit großem Fenster dazu eine Obergrenze von 4,2 Mio. Canvas-Bildpunkten, dann Auflösung des Canvas, Partikel als einfache Quadrate). Auflösungswechsel geschehen unter dem nächsten Dialog (Stufenaufstieg, Truhe, Pause), wo das Bild ohnehin steht – nur wenn es deutlich zu langsam bleibt, schon nach 1–2 weiteren Messfenstern. Eine Stufe, die zweimal kurz nach dem Hochschalten wieder aufgegeben werden musste, wird nicht mehr probiert. Unter Dialogen wird das Spielbild nur einmal gezeichnet (fester dunkler Schleier statt Weichzeichner). Sprite-Zwischenbilder liegen im Hauptspeicher (`willReadFrequently`, kein Warten auf die GPU beim Bauen), das Bodenmuster auf einem normalen Canvas (sonst liest Chrome mit Grafikkarte es in jedem Bild zurück). Der Boden ist eine einmal auf Bildschirmmaßstab gebrachte Kachel, die um ganze Bildpunkte verschoben gelegt wird (der Weltursprung liegt auf ganzen Bildpunkten); die Lichtkarte hat 1/2 bis 1/4 der Canvas-Auflösung und wird ohne Glätten ganzzahlig vergrößert – beides ohne sichtbaren Unterschied, aber ohne Grafikkarte zusammen 6–7 ms je Bild weniger (Rastern von 13,5 auf etwa 7–9 ms bei 1280×720). Das Canvas ist deckend (`alpha: false`). Partikel und Schadenszahlen kommen aus einem Vorrat (weniger Speicherbereinigung), Kill-, Gold- und Erfahrungsanzeige werden höchstens alle 0,1–0,25 s angefasst. Symbole für die Dialoge werden in Leerlaufzeit vorab kodiert, die Bossmusik unter dem ersten Dialog im Kampf dekodiert; die Schrittweite des Spiels wird geglättet (Abweichungen werden nachgeholt, es geht keine Zeit verloren). Bringt eine billige Stufe (ohne Auflösungsschritt) keine 10 % Gewinn, wird gleich die nächste Stufe mit kleinerem Canvas probiert; erst wenn auch die nichts bringt – etwa weil die Anzeige im Stromsparmodus auf 30 fps begrenzt ist –, geht es zurück auf die Stufe vor der Probe, und dieser Takt wird als Obergrenze gemerkt. `Render.setQuality(stufe, true)` hält eine Stufe fest; `Render.perf.log` zeigt die letzten Messungen. `node tools/qa/perf.js` misst die Bildrate mit 300 Gegnern und ~700 Partikeln, `--cap=30` prüft die 30-fps-Obergrenze.
- Die Spiellogik (`js/game.js`, `js/weapons.js`) kennt kein DOM; Darstellung, Klang und Oberfläche hängen sich über `Hooks` an.
- Kollisionen über ein räumliches Hash-Raster, flüssig mit mehreren hundert Gegnern.
- Fernkampf (M9): Gegnergeschosse, Warnzeichen (`run.tele`: Kreise, Bahnen, Ziellinien, Ladekreise) und Pfützen (`run.haz`) haben feste Obergrenzen (120 Geschosse, bei Bossen 160; 32 Warnzeichen; 8 Pfützen). Eine Salve, die nicht mehr passt, wird gar nicht erst angekündigt. Eine Salven-Regie begrenzt, wie viele Schützen gleichzeitig ausholen (3 in den ersten zwei Minuten, später 5 und 7), und `rangedFrom` je Land, ab wann Fernkämpfer im Nachschub kommen. `hurtPlayer(dmg, src)` merkt sich die Quelle jedes Treffers.
- Balance-Bot (`tools/balancebot.js`): Er weicht Nahkämpfern wie bisher aus, nimmt aber alles Fernkämpferische wie ein geübter Mensch wahr – erst wenn es im Bild war, mit 0,20–0,35 s Reaktionszeit, mit Aussetzern (je voller das Bild, desto öfter zu spät oder gar nicht gesehen) und kleinen Schätzfehlern, und nur die 10 nächsten Geschosse und 6 nächsten Flächen auf einmal. Nahkampf-Bauten jagen Schützen. `tools/dodgetest.js` prüft die Trefferquoten je Geschossart in einer Arena (Kalibrierung im Kopf von `balancebot.js`).
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
