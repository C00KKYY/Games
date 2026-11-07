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
- **Countdown und Ansturm:** Bei 1:30 erscheint unter der Zeit eine Leiste „Starke Gegner kommen!“ mit dem Bild des
  kommenden Gegners, dann „Ansturm in 0:27 …“ (Warnhorn, 10 s vorher „Mach dich bereit!“ mit einem Hinweis wie „Ghule: zäh
  und langsam“, in den letzten 5 s Ticks). Zeit, Erfahrung zu sammeln und den nächsten Ausbau gezielt zu wählen. Um 2:00
  bricht der Ansturm los (je Land ein eigener Auftakt, z. B. ein Ring aus Ghulen): 20–25 s lang mehr und zähere Gegner,
  dafür etwas weniger Erfahrung je Gegner. Wer durchhält, bekommt 15 Gold (wie ein Goldbeutel ×Gier ×Nachtstufe), ohne Treffer das Doppelte; um
  2:30 folgt der Elitegegner mit Truhe. Danach steigen die Gegner gleichmäßig weiter an statt erst bei Minute 4 sprunghaft,
  und 20 s vor dem ersten Boss zählt eine schlichte Leiste herunter. Pause, Aufstieg und Truhen halten Countdown und Banner an.
- **Kohlebecken** auf der Karte zerschlagen: Gold, Herzen, Magnete (ziehen alle Edelsteine und Münzen an), Bomben.

## Länder, Sterne, Nachtstufen

Die Weltkarte zeigt fünf Länder, jedes mit eigenen Gegnern, Bossen, Ereignissen, Boden und kurzer Geschichte:

| Land | Dauer | Eigenart | Fernkämpfer (ab) | Endboss |
|---|---|---|---|---|
| Alter Friedhof | 10 min | Einstieg | Spucker (0:34), Totenglocke (Minute 4) | Blutgraf |
| Aschenwald | 15 min | schnelle Schwärme | Aschenkessel (0:42), Nadelmotte (Minute 3) | Kohlenherz |
| Eissee | 15 min | langsam, aber zäh | Nadelmotte (0:45), Spucker, Totenglocke (Minute 5) | Der Ertrunkene König |
| Burgruine | 15 min | Spucker, Kreuzfeuer | Spucker (0:36), Aschenkessel, Nadelmotte | Steinkoloss |
| Herz der Nacht | 15 min | alles zusammen | alle vier (ab 0:40) | Die Nacht |

### Fernkämpfer

Vier Gegner schießen, jeder mit eigenem Ausweich-Kniff. Jeder Angriff wird angekündigt: Der Schütze holt sichtbar aus
(mindestens 0,45 s, mit Keil, Ziellinie oder Ladekreis), Flächen sind mindestens 0,75 s vorher markiert. Gegnergeschosse
sind rot mit hellem Kern und dunklem Ring (kein eigenes Geschoss hat diesen Ring); kommt etwas von außerhalb des Bildes,
warnt ein roter Pfeil am Rand (bis 2 s vor der Ankunft). Geschossen wird nur aus dem Bild heraus, auf Handys nur unterhalb
von Zeit, Bossleiste und Bossname. Nach einem Dialog (Stufenaufstieg, Truhe, Pause) läuft das Spiel, wenn gerade etwas
fliegt oder markiert ist, 0,45 s lang von 30 % auf volles Tempo an – Zeit, sich zu orientieren; Held und Gegner werden
gleich gebremst.

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
- **Die erste Minute:** Schon beim Start stehen ein paar Gegner im Bild. Die Stufen 1–10 kosten weniger Erfahrung (ab Stufe 11 gilt die alte Kurve), so bringt die erste Minute 4–5 Aufstiege. Nach 30 Sekunden erscheint der erste Elitegegner sichtbar im Bild (schnell, aber schwächer als spätere) und lässt eine Truhe fallen. Nach 34–45 Sekunden (je Land) gehen die ersten Fernkämpfer sichtbar im Bild in Stellung, kurz danach folgt das erste große Ereignis. Damit es nicht zu leicht wird, kommen in den ersten drei Wellen jedes Landes mehr Gegner, und langsame Gegner sind in den ersten drei Minuten bis zu 20 % schneller.
- Ab Minute 3–4 ziehen Gegner-Lebenspunkte und Schaden deutlich an; Stufenaufstiege werden ab Stufe 20 langsamer. Abgestimmt mit einem Bot (`tools/balancebot.js`, Sammelauswertung `tools/balance-batch.js`, die auch Stufe nach 60 s, ersten Treffer, Schaden je Minute und Gegner im Bild nach 2/10/30/60 s meldet).

Siegquoten des starken Bots (Stand M10, Countdown und Ansturm): alle 9 Helden reihum, Nachtstufe 0 (außer der letzten
Zeile); „Schmiede“: none = nichts gekauft, light/mid/max = Voreinstellungen in `tools/balancebot.js`. Der Bot nimmt Fernkampf
wie ein geübter Mensch wahr (siehe Technik), den Countdown aber nicht – für Menschen, die sich auf den Ansturm vorbereiten,
sind die Werte eher eine untere Grenze. Gezählt sind alle Läufe auf dem M10-Spielcode (keine Auswahl einzelner Messreihen):
die Messung der Umsetzung und die unabhängige Nachmessung zusammen (Spielcode a3789cc; die späteren Änderungen an Oberfläche,
Klang und Gold ändern den Spielverlauf nachweislich nicht – gleiche Zufallszahlen, gleicher Zustand bis 7:00), für den Eissee
nur Läufe nach der Erfahrungskorrektur (4cc158f). Dahinter das 95-%-Vertrauensintervall (Wilson) und zum Vergleich der Stand
vor M10 (gepoolt: frühere Messung auf 158d72b plus Nachmessung desselben Tages auf 419d30a, spielgleich).
Läufe enden nach 25 min Spielzeit (`TMAX`); wer dann noch gegen den Endboss kämpft, zählt als „offen“ (kam diesmal nicht vor).
Der Zufall ist groß: Messreihen mit n = 12 auf gleichem Code lagen bis zu 40 Punkte auseinander.

| Land | Schmiede | Siege M10 | 95-%-Intervall | vor M10 | Tod im Median | erster Treffer (Median) |
|---|---|---|---|---|---|---|
| Alter Friedhof | none | **32 %** (46/144) | 25–40 % | 34 % (49/144) | 7,9 min | 75 s |
| Aschenwald | none | 13 % (9/72) | 7–22 % | 13 % (13/102) | 7,1 min | 80 s |
| Aschenwald | light | 22 % (16/72) | 14–33 % | 20 % (23/114) | 8,2 min | 64 s |
| Eissee | light | 19 % (7/36) | 10–35 % | 21 % (28/132) | 10,3 min | 85 s |
| Eissee | mid | 43 % (31/72) | 32–55 % | 35 % (61/174) | 11,7 min | 85 s |
| Burgruine | mid | 19 % (14/72) | 12–30 % | 15 % (11/72) | 10,0 min | 79 s |
| Burgruine | light | 6 % (4/72) | 2–13 % | 7 % (5/72) | 8,2 min | 86 s |
| Herz der Nacht | mid | 6 % (4/72) | 2–13 % | 8 % (6/72) | 8,0 min | 65 s |
| Herz der Nacht | max | 51 % (37/72) | 40–63 % | 44 % (32/72) | 15,6 min | 71 s |
| Alter Friedhof, Nachtstufe 5 | max | 36 % (52/144) | 29–44 % | 44 % (63/144) | 7,8 min | 59 s |

Keine Konfiguration ist signifikant leichter geworden; die größten Ausschläge nach oben sind Eissee mid (+8 Punkte, z ≈ 1,2)
und Herz der Nacht max (+7, z ≈ 0,8). Im Eissee wuchs der Held anfangs durch die zusätzlichen Gegner von 2:00–3:59 voraus
(Erfahrung bei 4:00 +8 %, Stufe bei 5:00 +1,6); seit diese Gegner weniger Erfahrung bringen (`xp` an Welle 3/4 und am
Nebelzug bei 3:00), liegt er bei +3 % bzw. +0,6 Stufen (je 24 Läufe). Der Alte Friedhof bleibt mit 32 % klar über der
Untergrenze von 20 % für das erste Land. Nachtstufe 5 liegt mit 36 % knapp unter dem geplanten Boden (37 %); der Unterschied
zum alten Code (44 %) ist nicht signifikant (z ≈ 1,3). Ab Nachtstufe 3 entfallen deshalb HP-Brücke und Erfahrungsabzug im
Ansturm (vorher 25 %: dem Helden fehlten bei 3:00 zwei Stufen, weil er bei dreifachen Lebenspunkten langsamer tötet, als
Nachschub kommt).

**Spannungsverlauf (M10).** Vorher war Minute 2 die ruhigste des Spiels: Gegner starben in 0,2 s, bevor sie ankamen, bis die
Gegner-Lebenspunkte an der 4:00-Grenze sprunghaft auf das Doppelte stiegen. Jetzt (Alter Friedhof, Mediane aus je 24 Läufen
auf altem und neuem Code, `node tools/curve.js 24 graveyard:none:0`; TTK = Lebenspunkte eines neuen Gegners / Waffen-DPS,
Last = Lebenspunkte des Nachschubs je s / Waffen-DPS):

| Abschnitt | 1:00 | 1:30 | 2:00 (Ansturm) | 2:30 | 3:00 | 3:30 | 4:00 | 5:00 |
|---|---|---|---|---|---|---|---|---|
| TTK vorher / nachher (s) | 0,18 / 0,17 | 0,17 / 0,16 | 0,23 / **0,33** | 0,21 / 0,24 | 0,19 / 0,26 | 0,17 / 0,24 | 0,35 / 0,35 | 0,40 / 0,37 |
| Last vorher / nachher | 0,66 / 0,65 | 0,67 / 0,63 | 0,91 / **1,93** | 1,04 / 1,15 | 0,89 / 1,09 | 0,83 / 1,02 | 1,66 / 1,60 | 2,36 / 2,24 |
| Gegner in 150 px vorher / nachher | 1,5 / 1,7 | 1,6 / 1,5 | 1,5 / **3,1** | 2,0 / 2,7 | 1,6 / 2,0 | 1,3 / 1,7 | 1,4 / 1,6 | 1,6 / 1,9 |

Bis 1:30 ist der Code unverändert; die kleinen Unterschiede dort sind Zufall (gleicher Code streut je Abschnitt um bis zu
±30 %). Nachschub, der im selben Bild nach einer Abschnittsgrenze erscheint, zählt zum neuen Abschnitt – frühere Fassungen
dieser Tabelle buchten die Ansturm-Eröffnung (bei genau 2:00) und alte Ringe (bei 2:30) in den Abschnitt davor. Der Ansturm
erreicht 0,8 × die Last von Minute 5, danach liegt alles über dem alten Plateau, und der Sprung bei 4:00 (TTK ×2,1) ist auf
×1,5 geglättet. Ab Minute 4 ist nichts leichter: Je Abschnitt schwanken die Werte bei 24 Läufen um ±10 %; über 72 gegen 72
Läufe liegt die TTK ab 4:00 bei 1,07 × vorher (95 %: 0,90–1,28), die Last bei 1,01 ×, und der Held ist gleich stark oder
etwas schwächer (Stufe bei 4:00 18,3 statt 18,8). Die anderen Länder folgen demselben Muster, schwächer in Burgruine und Herz
der Nacht, die schon vorher ab 2:00–3:00 anzogen (in der Burgruine bleibt die halbe Minute nach dem Ansturm, 2:25–2:59, so
ruhig wie vorher; der Anstieg beginnt dort wie bisher bei 3:00).

Schon die erste Minute tut weh: In allen Konfigurationen trifft den starken Bot der erste Schaden im Median nach 59–86 s (M10,
gepoolt; vorher 58–89 s). Vor 2:00 ist der Spielcode gleich geblieben – einzelne Messreihen streuen hier um ±15 s (54–98 s),
das ist Zufall, keine Wirkung von M10. Der erste Schaden kommt zu 90–100 % durch Fernkampf (Schaden in den Minuten 1–3).
Erste Minute sonst (Mittel je Konfiguration): Stufe 6–10 nach 60 s, 10–13 Gegner im Bild nach 2 s, eine Truhe vor 60 s in
86–96 % der Läufe (Ausnahmen: Burgruine 67–78 %, Herz der Nacht mid 61 %).

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

- Reines JavaScript ohne Build-Schritt und ohne Abhängigkeiten, Canvas 2D. Figuren, Gegner, Böden und Symbole werden beim Start prozedural gezeichnet, nach festen Stilregeln (`STYLE` in `js/sprites.js`: Licht von oben links, gemeinsame Palette mit dreistufigen Farbrampen, dunkler Umriss und Glanzkante um jede Silhouette, die `finish()` einheitlich setzt). Jeder der 9 Helden hat eine eigene Silhouette (Kapuze mit Rundschild, Zauberhut, Federmütze mit Köcher, Heiligenschein, Helm mit Bart und Hammer, Blitzkrone, Eiskrone mit Pelzkragen, Fliegenpilz-Hut, Flammenkapuze); Bosse sind Gegner-Bilder mit Tönung, Größe und Krone (Endbosse größer), scharf gerechnet. Alle Bilder eines Landes (Gegner mit Lauf-, Ausholbild, Treffer- und Frostfassung, gespiegelt, goldener Elite-Umriss, Deko, Aufsammelbares, Edelsteine) entstehen vor dem Spiel – nach und nach in Menü und Karte, der Rest beim Start des Laufs; Boss-Bilder in Leerlaufzeit (`Render.prebuildStage`), unter Dialogen erst, wenn die Karten hereingefahren sind; ihr Umriss entsteht in halber Auflösung und wird geschärft vergrößert (Endboss auf 2-facher Pixeldichte etwa 45 statt 200 ms je Bild). Im laufenden Spiel wird so nichts mehr gezeichnet, was ruckeln könnte. Die Böden sind 512er-Kacheln mit eigener Struktur je Land (Wiese mit Trittsteinen, rissige Erde mit Glutspalten, Eisschollen mit Schneewehen, Kopfsteinpflaster, Kristallplatten mit leuchtenden Adern; Voronoi-Zellen auf dem Torus, nahtlos); Deko trägt je Land Schnee, Glut, Moos oder Kristallschimmer auf der Oberkante. `node tools/qa/contact.js` legt einen Kontaktbogen aller Sprites an. Effekt-Sprites (Funken, Ringe, Hieb, Blitz, Flammen, Explosion) stammen aus Kenneys Particle Pack und Smoke Particles (CC0): Quellen und Lizenz in `assets/src/kenney/`, `node tools/build-fx.js` verkleinert sie und schreibt `assets/fx.js` (data:-URIs, per `<script>` geladen, also auch über file://); `js/fx.js` färbt sie zur Laufzeit ein. Keine Anfragen an fremde Server; die Schriften (Lilita One, Nunito, SIL Open Font License) liegen in `fonts/`.
- Texte: Deutsch ist die Quellsprache im Code, `tr()` in `js/lang.js` liefert die englische Übersetzung.
- `js/platform.js` bindet das CrazyGames-SDK v3 an (Ladephase, Spielstart/-pause, Stummschaltung durch die Plattform, Glücksmomente, Sprache, Spielstand im Data Module). Ohne SDK tut es nichts.
- Start: Der Ladebildschirm steht im HTML und erscheint ohne JavaScript; dahinter läuft sofort die Kulisse. Das SDK lädt asynchron, gewartet wird höchstens 2,5 s, dann kommt das Menü. Kommt das SDK später, wird der Spielstand erst danach (im Menü, nie mitten im Lauf) in die Cloud übernommen; es gewinnt der Stand mit mehr Spielzeit. `window.Glutnacht.ready` meldet Werkzeugen, dass das Menü steht.
- Einstieg: Beim ersten Besuch zeigt das Menü nur Logo, Leitspruch, SPIELEN und drei Knöpfe vor einem im Canvas gemalten Titelbild (Held mit Glut, Monster-Schattenrisse). Ein Klick auf SPIELEN startet sofort das erste Land; die Rahmengeschichte steht als eine Zeile im Kapitel-Banner und ausführlich auf der Weltkarte, bis das erste Land befreit ist. Neue Länder danach beginnen mit ihrer kurzen Geschichte. Statt Text zeigt ein Tasten- bzw. Daumen-Bild unter dem Helden, wie man läuft; es verblasst nach dem ersten Schritt.
- Ton (`js/audio.js`, WebAudio): 34 CC0-Effekte und 5 Musikstücke aus `assets/audio/` (Herkunft in `assets/CREDITS-audio.txt`), von `node tools/build-audio.js` als base64 nach `assets/audio.js` geschrieben (per `<script>` geladen, auch über file://; 2,08 MB). Beim Start werden die Effekte in einem OfflineAudioContext dekodiert, die Musik erst bei Bedarf (höchstens zwei Schleifen im Speicher). Jeder Effekt klingt leicht anders (±8 % Lautstärke, Treffer und Kills ±40 Cent), höchstens 6 Kopien je Effekt, ein kurzer Hall liegt darunter, Treffer und Kills sind nach ihrer Position im Stereobild verteilt. Musik nach Intensität mit 1,5 s Überblendung: Menü, Kampf (die ersten 4 Minuten gedämpft), Boss; Sieg und Niederlage spielen einen kurzen Abschluss. Der Ton startet bei der ersten Berührung, dem ersten Klick oder Tastendruck (iOS: stiller Puffer, erneutes Anwerfen nach Unterbrechungen). Die Stummschaltung der Plattform und `?muteAudio=true` haben Vorrang vor den eigenen Schaltern (Einstellungen, Taste M); stumm oder im Hintergrund wird der Ton angehalten. Fehlt eine Aufnahme, spielt der frühere Synthesizer. Probehören: `tools/audio/audition.html` (jedes Ereignis und Stück, mit Lautstärke-Reglern).
- `assets/`: Effektgrafiken (`assets/fx.js`, Herkunft in `assets/CREDITS-art.txt`). Der Einzeldatei-Build bettet `assets/*.js` ein und legt Herkunft und Lizenzen als `<script type="text/plain" id="asset-credits">` dazu. `tools/qa/`: Playwright-Prüfungen mit Ausgangswerten in `tools/qa/baseline/`.
- Licht (`js/render.js`): eine Lichtkarte in halber Auflösung, gefüllt mit dem Umgebungslicht des Landes, darauf additiv die Lichtquellen (Glut des Helden, Kohlebecken, Truhen, Edelsteine, Geschosse, Feuer, Blitze, Elitegegner); sie wird mit der Szene multipliziert und enthält zugleich die Vignette. Leuchtendes (Flammen, Geschosse, Partikel, Edelsteine, Zahlen) liegt darüber. Dazu: Lichtstoß beim Stufenaufstieg (150 ms Standbild, dann die Karten), Edelsteine springen auf und ziehen Schweife, Besiegte werden gestaucht und blitzen weiß, Elitegegner haben goldenen Umriss, Bodenring und Schild „ELITE“.
- Leistung: Gemessen wird an den Zeitstempeln von `requestAnimationFrame`. Ist der Takt der Anzeige (20-%-Quantil der Bildabstände) langsamer als 42 fps oder ruckeln mehr als 12 % der Bilder (länger als das 1,5-Fache des Takts), schaltet die Darstellung probeweise eine Stufe herunter (6 Stufen: zuerst Lichtkarte, Edelstein-Lichter und Gegnerschatten, auf hochauflösenden Anzeigen mit großem Fenster dazu eine Obergrenze von 4,2 Mio. Canvas-Bildpunkten, dann Auflösung des Canvas, Partikel als einfache Quadrate). Auflösungswechsel geschehen unter dem nächsten Dialog (Stufenaufstieg, Truhe, Pause), wo das Bild ohnehin steht – nur wenn es deutlich zu langsam bleibt, schon nach 1–2 weiteren Messfenstern. Eine Stufe, die zweimal kurz nach dem Hochschalten wieder aufgegeben werden musste, wird nicht mehr probiert. Unter Dialogen wird das Spielbild nur einmal gezeichnet (fester dunkler Schleier statt Weichzeichner). Sprite-Zwischenbilder liegen im Hauptspeicher (`willReadFrequently`, kein Warten auf die GPU beim Bauen), das Bodenmuster auf einem normalen Canvas (sonst liest Chrome mit Grafikkarte es in jedem Bild zurück). Der Boden ist eine einmal auf Bildschirmmaßstab gebrachte Kachel, die um ganze Bildpunkte verschoben gelegt wird (nur das Muster wird gerundet; Welt und Kamera behalten Bruchteile, so steht der Held ruhig in der Mitte und die Welt gleitet gleichmäßig, der Boden weicht höchstens 0,5 Bildpunkte ab); die Lichtkarte hat 1/2 bis 1/4 der Canvas-Auflösung und wird ganzzahlig vergrößert, auf Stufe 0 geglättet, ab Stufe 1 ohne Glätten (ohne Grafikkarte etwa 3 ms je Bild weniger, dafür bei hochauflösenden Anzeigen leichte Stufen an hellen Lichthöfen). Die zuletzt 20 s lang stabile Stufe wird je Bildschirm und Pixeldichte gemerkt (`localStorage`, `glutnacht.q.…`) und ist die Startstufe der nächsten Sitzung; gescheiterte Hochschalt-Versuche gelten nur bis zum nächsten Lauf. Folgt ein Dialog direkt auf einen anderen (mehrere Stufenaufstiege, Truhe), gibt es keinen neuen Lichtstoß – das Bild steht schon. Das Canvas ist deckend (`alpha: false`). Partikel und Schadenszahlen kommen aus einem Vorrat (weniger Speicherbereinigung), Kill-, Gold- und Erfahrungsanzeige werden höchstens alle 0,1–0,25 s angefasst. Symbole für die Dialoge werden in Leerlaufzeit vorab kodiert, die Bossmusik unter dem ersten Dialog im Kampf dekodiert; die Schrittweite des Spiels wird geglättet (Abweichungen werden nachgeholt, es geht keine Zeit verloren). Bringt eine billige Stufe (ohne Auflösungsschritt) keine 10 % Gewinn, wird gleich die nächste Stufe mit kleinerem Canvas probiert; erst wenn auch die nichts bringt – etwa weil die Anzeige im Stromsparmodus auf 30 fps begrenzt ist –, geht es zurück auf die Stufe vor der Probe, und dieser Takt wird als Obergrenze gemerkt. `Render.setQuality(stufe, true)` hält eine Stufe fest; `Render.perf.log` zeigt die letzten Messungen. `node tools/qa/perf.js` misst die Bildrate mit 300 Gegnern und ~700 Partikeln, `--cap=30` prüft die 30-fps-Obergrenze. `--surge` misst einen echten Lauf im Alten Friedhof von 1:52 bis 2:30 (Countdown, Ansturm), `--nosurge` dasselbe ohne Ansturm als Vergleich; die Countdown-Leiste zeichnet nicht je Bild neu (Füllung und Pulsieren nur per `transform`). `node tools/qa/countdown.js` prüft Leiste, Banner und Pfeile in allen Countdown-Zuständen auf 320×568, 844×390 und 1280×720 (DE/EN) auf Überlappung.
- Die Spiellogik (`js/game.js`, `js/weapons.js`) kennt kein DOM; Darstellung, Klang und Oberfläche hängen sich über `Hooks` an.
- Kollisionen über ein räumliches Hash-Raster, flüssig mit mehreren hundert Gegnern.
- Fernkampf (M9): Gegnergeschosse, Warnzeichen (`run.tele`: Kreise, Bahnen, Ziellinien, Ladekreise) und Pfützen (`run.haz`) haben feste Obergrenzen (120 Geschosse, bei Bossen 160; 32 Warnzeichen; 8 Pfützen). Eine Salve, die nicht mehr passt, wird gar nicht erst angekündigt. Eine Salven-Regie begrenzt, wie viele Schützen gleichzeitig ausholen (3 in den ersten zwei Minuten, später 5 und 7), und `rangedFrom` je Land, ab wann Fernkämpfer im Nachschub kommen. `hurtPlayer(dmg, src)` merkt sich die Quelle jedes Treffers.
- Balance-Bot (`tools/balancebot.js`): Er weicht Nahkämpfern wie bisher aus, nimmt aber alles Fernkämpferische wie ein geübter Mensch wahr – erst wenn es im Bild war, mit 0,20–0,35 s Reaktionszeit, mit Aussetzern (je voller das Bild, desto öfter zu spät oder gar nicht gesehen) und kleinen Schätzfehlern, und nur die 10 nächsten Geschosse und 6 nächsten Flächen auf einmal. Nahkampf-Bauten jagen Schützen. `tools/dodgetest.js` prüft die Trefferquoten je Geschossart in einer Arena (Kalibrierung im Kopf von `balancebot.js`).
- Spielstand in `localStorage` (`glutnacht.v1`).

```
node tools/simtest.js aron 0 3 ashwood   # 3 Läufe headless mit einfachem Bot (Held, Nachtstufe, Anzahl, Land)
node tools/balance-batch.js 12 ashwood:none:0 ashwood:light:0   # starker Bot: Siegquote je Land/Schmiede/Nachtstufe (TMAX=1500: Läufe enden nach 25 min Spielzeit, wer dann noch lebt, zählt als „offen“)
node tools/build-single.js out.html # alles in eine HTML-Datei bündeln
node tools/build-single.js --crazygames  # dist/crazygames/index.html zum Hochladen bei CrazyGames
node tools/qa/sdkdelay.js                 # Start mit langsamem/hängendem SDK, Sprache, Cloud-Spielstand prüfen
node tools/qa/qa.js iphone-land          # frisches Profil: Klicks/Wörter bis zum Spiel, Heldengröße, Schadenszahlen, HUD, 60 s Spiel
node tools/build-single.js dist/itch/index.html   # ohne CrazyGames-SDK, z. B. für itch.io (als ZIP hochladen)
node tools/promo/covers.js            # Titelbilder inkl. itch.io (630×500) nach dist/promo/
```
