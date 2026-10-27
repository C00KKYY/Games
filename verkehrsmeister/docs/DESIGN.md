<!-- Ergebnis eines Design-Panels (3 unabhängige Entwürfe + Jury). Grundlage der 3D-Neuauflage. -->

# Verkehrsmeister 3D – Stau oder Stadt

## 1. Pitch
Eine deutsche Kleinstadt wächst als schwebendes 3D-Diorama. Du verbindest farbige Wohnhäuser per Fingerzug mit ihren gleichfarbigen Zielen (Bäckerei, Werk, Klinik, Schule, Stadion), bevor sich dort die Aufträge stapeln. Du wählst den Kreuzungstyp:
- rechts vor links
- Vorfahrtsstraße
- Ampel
- Kreisel

In der Feierabendwelle schickst du den Polizisten an die heißeste Kreuzung. Es gibt kein Geld, keine Menüs und keinen Ampel-Editor. Du hast knappe Bauteile, eine Kartenwahl pro Woche und eine Stadt, die schneller wächst als dein Netz.

## 2. Kern-Spielschleife
**Sekunden:**
- Ein Ziel bekommt einen Auftragsstecker. Ein freies Auto der passenden Farbe fährt los und kommt an: „Pling“, „+1“, das Gebäude federt.
- Ankünfte kurz hintereinander lassen die Tonhöhe pentatonisch steigen.
- 10 Ankünfte ohne Halt lösen das Banner „GRÜNE WELLE!“ aus.
- Nebenbei ziehst du Straßen, wischst eine Vorfahrt oder löschst eine Sackgasse.

**Minuten:**
- Ein Tag läuft von 06:00 bis 22:00 Uhr in 40 s, die Nacht wird in 1 s überblendet.
- Morgenwelle von 7 bis 9 Uhr (5 s), Feierabendwelle von 16 bis 19 Uhr (7,5 s). Beide sind als orange Segmente auf der Tagesuhr markiert.
- Nach 5 Werktagen (200 s) friert am Wochenende die Zeit ein:
  - die Kamera fährt zurück
  - die Wochenbilanz zeigt Fahrten und die schlimmste Kreuzung
  - 1 von 3 Karten wird gewählt
  - das Ortsschild rückt nach außen und die Karte wächst
- Runde: Neulinge 10–14 min (Woche 3–4), Könner 20–25 min (Woche 6–7).

## 3. Ziel, Druck und Niederlage
**Ziel:** Die Punktzahl ist die Zahl der abgeschlossenen Fahrten. Ein großer, rollender Zähler steht oben in der Mitte. Pro Stadt gibt es Medaillen.

**Druck ist lokal:**
- Jedes Ziel trägt bis zu 6 Stecker, die als Symbole sichtbar über dem Dach liegen.
- Ab dem 7. Stecker füllt sich ein roter Ring um das Gebäude in 35 s. Das Gebäude pulsiert und tickt.
- Fallen die Stecker wieder unter 7, leert sich der Ring doppelt so schnell. Erholung ist also immer möglich.
- Liegt ein Problem außerhalb des Bildes, zeigt ein Pfeil am Rand hin.
- Ab 70 % Ring wird der Rand des Bildes rot und die Musik schneller.

**Ursache immer sichtbar:**
- **Stau-Färbung:** Fahrbahnabschnitte mit mittlerem Tempo unter 30 % färben sich rot. Autos, die länger als 4 s warten, hupen.
- **Flaschenhals-Schilder:** Die 3 Kreuzungen mit der meisten Wartezeit (gleitend über 20 s) tragen ein pulsierendes Schild mit Zähler und Ursachen-Symbol:
  - Rechts vor links überlastet
  - Nebenstraße verhungert
  - Rückstau vom Ziel
  - Umweg (länger als das 1,8-Fache der direkten Strecke)
  - Keine Verbindung
  - Kein passendes Haus angeschlossen
- **Stau-Lupe:** Ein Tipp auf ein Auto oder ein rotes Ziel zeigt die Route und den Engpass, mit einem Satz als Lösung, z. B. „Vorfahrt oder Kreisel?“.

**Niederlage:** Ist ein Ring voll, kommt „Stillstand in Kleinbüttel!“:
- Die Kamera fährt auf das Ziel, das Bild wird entsättigt, ein Hupkonzert setzt ein.
- Danach folgt der **Stau-Report**:
  - Heatmap der Wartezeit auf der Karte
  - die 3 häufigsten Ursachen mit Tipp
  - Fahrten, Medaille, Bestenliste
- Ein großer Knopf **„Noch eine Stadt“** startet die neue Runde in unter 2 s.

## 4. Steuerung und Bauregeln
| Aktion | Maus/Tastatur | Touch |
|---|---|---|
| Straße ziehen | Linke Maustaste ziehen | Ein Finger ziehen |
| Abreißen | Rechte Maustaste ziehen | Radierer-Knopf, dann ziehen |
| Kreuzung: Vorfahrt | Über die Kreuzung ziehen (Hauptrichtung) | Wischen |
| Kreuzung: Ampel oder Kreisel | Teil in der Leiste (1–4), dann klicken | Teil antippen, dann Kreuzung antippen |
| Polizist (Ladung) | Taste P, dann klicken | Knopf, dann tippen |
| Stau-Lupe | Klick auf Auto oder Ziel | Tippen |
| Kamera | Rad zoomen, WASD oder mittlere Maustaste, Q/E dreht um 90° | Zwei Finger: schieben, zoomen, drehen |
| Pause / Tempo | Leertaste / Tab (1x, 2x, 3x) | Knöpfe |
| Rückgängig | Strg+Z (10 Schritte) | Knopf |

**Bauregeln:**
- 1 Kachel ist 1 Straßenstück. Beim Ziehen gibt es eine Vorschau, und Kurven und Kreuzungen entstehen automatisch.
- Das Einrasten ist großzügig: Touch-Trefferzone 48 px.
- Abreißen ist kostenlos und gibt die Teile sofort zurück. Bauen geht auch in der Pause.
- Jedes Gebäude hat eine feste Einfahrt, markiert durch einen Pfeil am Boden.
- Wasser braucht eine Brücke (bis 4 Kacheln), ein Berg braucht einen Tunnel.
- Die Ampel schaltet adaptiv (4–12 s Grün). Die Hauptrichtung bekommt per Wisch doppelte Grünzeit. Einen Phasen-Editor gibt es nicht.
- Die Autobahn ist ein gerades Spezialteil mit bis zu 8 Kacheln und überbrückt Kreuzungen. An beiden Enden entsteht automatisch eine Auffahrt mit blauem Schild.
- Jede Entscheidung braucht höchstens 2 Gesten.

## 5. Ressourcen und Progression
**In der Runde (Inventar statt Geld):**
- Start: 30 Kacheln, 1 Ampel, 1 Brücke, Polizist mit 2 Ladungen.
- Jede Woche: +15 Kacheln, +1 Polizist-Ladung (höchstens 3), dazu 1 von 3 Karten.

**Kartenpool (16 Karten):**
- **Bauteile:**
  - Straßenpaket (+25)
  - 2 Ampeln
  - Kreisel
  - Autobahn (8)
  - Tunnel
  - 2 Brücken
- **Passiv:**
  - *Grüne Welle* (Ampeln +25 % Durchsatz)
  - *Parkhaus* (ein Ziel trägt 9 Stecker)
  - *Tempo 60* (Stadt +15 %)
  - *Gleitzeit* (die Welle eines Ziels verteilt sich über +1 h)
  - *Zweitwagen* (ein Viertel bekommt 3 Autos pro Haus)
- **Joker:** *Feierabend-Stopp* (8 s lang keine neuen Aufträge, einmal einsetzbar)
- **Pakt-Karten mit Haken (ab Rang 2):**
  - „Bürgerfest: +2 Kreisel, nächste Woche +25 % Aufträge“
  - „Sparhaushalt: +40 Kacheln, keine Karte nächste Woche“

**Ereignisse (höchstens 1 aktiv, immer angekündigt):**
- **Baustelle:** Pylonen stehen einen Tag vorher, das Stück ist 1 Tag gesperrt.
- **Krankenwagen (ab Woche 2):** Die Route erscheint 5 s vorher als blaue Linie. Die Autos weichen automatisch aus, eine Rettungsgasse muss nicht gebaut werden. Pünktlich (1,8-fache Idealzeit) ergibt +25 Fahrten, 0,4 s Zeitlupe und „GERETTET!“. Zu spät füllt 25 % Ring am Ziel Klinik.
- **Neue Gebäude:** werfen 5 s vorher einen Schatten.

**Über Runden hinweg:**

| Stadt | Mechanik | Freischaltung |
|---|---|---|
| Kleinbüttel | Bach, Tutorial | sofort |
| Hafenstadt | Kanäle, Klappbrücke (alle 30 s für 5 s offen) | Bronze in Kleinbüttel |
| Ruhrstadt | 2 Bahnübergänge (alle 20 s für 4 s zu, Glocke 3 s vorher) | Bronze in Hafenstadt |
| Alpendorf | Hänge und Tunnel, Schnee-Tage −20 % Tempo | Bronze in Ruhrstadt |
| Messestadt | Messe-Ereignis: 25 Aufträge auf einmal an einem Ziel | Bronze in Alpendorf |
| Hauptstadt | Autobahnring vorgegeben, 5 Farben | Silber in 3 Städten |

- **Medaillen:** Kleinbüttel Bronze 300, Silber 700, Gold 1200 Fahrten. Spätere Städte haben ±15 % angepasste Schwellen.
- **Tageschallenge:** Die Karte entsteht aus dem Datum als Seed, mit einem Modifikator (z. B. „nur rechts vor links“ oder „Dauerbaustelle“). Ein gewerteter Versuch, lokale Top 10.
- **Rang:** Gesamtfahrten zählen als Erfahrung. Rang 1–10 schaltet Pakt-Karten, Herausforderungen und Kosmetik frei: Käfer, Trabi, Taxi, Fachwerk, Nachtmodus.
- **Herausforderungen:** z. B. „Gold ohne Ampel“ oder „Woche 5 ohne Polizist“.
- **Speicherung:** localStorage für Bestenlisten, Medaillen, Rang und Einstellungen.

## 6. Simulation
**Sichtbar und relevant:**
- **Autos und Aufträge:**
  - Jedes Haus hat 2 Autos. Ein Auto fährt zum Ziel, verschwindet kurz darin und fährt zurück.
  - Ein Auftrag wird dem nächsten freien Auto seiner Farbe zugeteilt, gemessen in Fahrzeit.
- **Routing:**
  - Dijkstra auf dem Kachelgraphen. Die Kantenkosten sind Fahrzeit plus Stauzuschlag, alle 2 s neu gewichtet.
  - Neue Route bei Änderung des Netzes und an jeder Kreuzung.
- **Fahren:** Eine Spur pro Richtung mit 1D-Abstandsmodell (Wunschtempo, Mindestabstand 0,35 Kacheln, weiches Bremsen).
- **Kreuzungen per Reservierung:** Ein Auto fährt nur ein, wenn die Ausfahrt frei ist.

| Kreuzungstyp | Durchsatz (Autos/s) | Sichtbares Verhalten |
|---|---|---|
| Rechts vor links | 0,8 gesamt | kurzes Zögern, Patt nach 1,5 s per Handzeichen gelöst |
| Vorfahrt | Hauptachse 1,6 / Nebenstraße 0,4 | gelbe Raute, Nebenstraße wartet sichtbar |
| Ampel | 1,6 | adaptive Phasen, Lampen leuchten |
| Kreisel | 2,2 bei ausgeglichenem Verkehr, 1,4 bei einseitigem | Lückensuche |
| Polizist | 2,5 für 15 s | winkende Figur, Pfiff |

- **Gegen Verklemmungen:** Warten mindestens 3 Autos länger als 3 s im Kreis aufeinander, fährt das mit der längsten Wartezeit zuerst („Nach Ihnen!“-Blase).
- **Ziel-Einfahrt:** nimmt 1 Auto pro 0,8 s auf. Sonst entsteht ein Rückstau, das Ursachen-Symbol „Rückstau vom Ziel“.
- **Takt:** Simulation fest mit 20 Hz, Darstellung interpoliert.

**Bewusst weggelassen:** Geld, Spurwechsel, Linksabbieger-Logik mit Gegenverkehr, Unfälle, Fußgänger-KI (nur Deko), Parkplätze, Ampelphasen-Editor, Statistikfenster.

## 7. 3D-Darstellung und Juice
**Look:**
- Eine Erdscholle mit sichtbaren Schichten am Rand schwebt über einem weichen Hintergrund.
- Low-Poly mit Pastellfarben: Fachwerk, rote Dächer, Kirchturm, gelbe Ortsschilder, blaue Autobahnschilder.
- Gebäudeschilder kommen als Canvas-Textur („Bäckerei Schmidt“).

**Kamera:**
- Perspektive mit 30° Sichtfeld und 50° Neigung, sanftes Nachgleiten, Drehung in 90°-Schritten.
- Zoom von „ganze Insel“ bis „Stoßstange“, leichter Nebel und Vignette.

**Farbe plus Symbol:** Jedes Ziel und jedes Autodach trägt Farbe und Symbol (Brezel, Zahnrad, Kreuz, Buch, Ball), damit auch Farbenblinde alles lesen können.

**Animationen:**
- **Kachel:** wächst von Größe 0 über 1,15 auf 1 (120 ms), als Welle entlang des Ziehpfads. Dazu 6 Staubpartikel und ein „Klack“, dessen Tonhöhe pro Kachel steigt. Abreißen spielt dasselbe rückwärts.
- **Gebäude:** fallen mit Stauchen und Strecken vom Himmel. Eine neue Farbe wird mit Banner und hochklappendem Ortsschild angekündigt.
- **Autos:** Beim Bremsen kippen sie 4° nach vorn, im Stand leuchten die Bremslichter, sauer gewordene Autos dampfen. Nachts gibt es Scheinwerfer und leuchtende Fenster als additive Sprites, ohne echte Punktlichter.
- **Ankunft:** Das Gebäude federt, „+1“ steigt in der Zielfarbe auf, Konfetti bei Kombo 10.

**Sound (WebAudio, synthetisch):**

| Klang | Umsetzung |
|---|---|
| Klack | Tonleiter beim Bauen |
| Pling | pentatonisch, steigt mit der Kombo |
| Hupe | Rechteckwellen 400 und 500 Hz, 150 ms, höchstens 3 pro Sekunde |
| Ring | Ticken |
| Martinshorn | Tatütata, Wechsel alle 0,5 s |
| Bahnübergang | Glocke |
| Polizist | Pfiff |
| Musik | generativer Loop, 90 bis 140 BPM je nach höchstem Ringstand, in Moll ab 70 % |

**Technik:**
- Ein InstancedMesh pro Fahrzeugtyp (5 Typen), Farbe über instanceColor.
- Statische Geometrie in Blöcken von 8×8 Kacheln zusammengeführt.
- Eine Schattenkarte mit 1024 px nur für statische Objekte. Autos bekommen Schattenscheiben.
- Pixeldichte höchstens 1,5. Fällt die Bildrate unter 50 FPS, gehen zuerst die Schatten aus, dann sinkt die Pixeldichte auf 1, dann die Fahrzeuggrenze.

## 8. Balancing (Startwerte)
| Wert | Zahl |
|---|---|
| Tag / Woche (1x) | 40 s / 200 s (5 Werktage) |
| Start | 1 Ziel (gelb), 2 Häuser, Karte 14×14, erster Auftrag liegt schon bereit |
| Kartenwachstum | +2 Kacheln je Seite und Woche, höchstens 34×34 |
| Neues Haus | alle 10 s in Woche 1, danach −12 % pro Woche, höchstens alle 5 s |
| Neues Ziel | Tag 3, 7, 11, 15 … (alle 4 Tage), jedes zweite mit neuer Farbe (höchstens 5) |
| Auftragsrate pro Ziel | 1 alle 6 s, +8 % pro Woche |
| Wellen-Faktor | Morgen ×1,8, Feierabend ×2,0, Abend ×0,6 |
| Überlauf | ab 7 Steckern, Ring 35 s, Abbau doppelt so schnell |
| Tempo | Stadt 2 Kacheln/s, Autobahn 5 Kacheln/s |
| Fahrzeuggrenze | 450 (Handy 300) |
| Polizist | 15 s, 2 Ladungen zu Beginn, +1 pro Woche, höchstens 3 |
| Krankenwagen | ab Woche 2, jede zweite Woche |
| Zielkurve | Neuling ca. 450 Fahrten (Woche 3–4), Könner ca. 1200 (Woche 6–7) |

**Einstieg ohne Hauptmenü:**
- Nach dem Laden liegen Haus und Bäckerei 3 Kacheln auseinander, ein Pfeil sagt „Zieh eine Straße“.
- Das erste Auto fährt los, sobald die Verbindung steht, typischerweise nach 5–8 s.
- Kontext-Tutorial in 3 Schritten:
  1. Straße ziehen
  2. „Wisch über die Kreuzung“, sobald die erste Kreuzung staut
  3. „Tippe das rote Gebäude“ beim ersten Ring

## 9. Feature-Liste
**MUSS** (spielbarer Kern, ca. 4500 Zeilen):
- Raster, Ziehen zum Bauen und Abreißen, Rückgängig, Pause, 1x/2x
- 3D-Diorama mit Instancing, Kamera für Maus und Touch
- Häuser, Ziele, Aufträge, Stecker, Überlaufring, Niederlage
- Routing, Abstandsmodell, Reservierung an Kreuzungen, Lösung für Verklemmungen
- Rechts vor links, Vorfahrt per Wisch, Ampel, Kreisel, Brücke
- Tageslauf mit zwei Wellen, Wochenkarten (10 Karten), Polizist
- Stau-Färbung, Flaschenhals-Schilder mit Ursachen, Randpfeile, Stau-Report
- Kernsounds, Bau- und Ankunfts-Effekte, Kombo-Pling
- Kleinbüttel, Medaillen, Bestenliste (localStorage)
- Farbe plus Symbol, Kontext-Tutorial, Neustart in unter 2 s

**SOLL:**
- Stau-Lupe mit Lösungssatz, Schatten-Ankündigung, Wochenbilanz
- Autobahn, Tunnel, alle 16 Karten, Feierabend-Stopp
- Krankenwagen, Baustelle
- 5 weitere Städte (Klappbrücke, Bahnübergang, Schnee, Messe, Autobahnring)
- Tageschallenge, Rang, generative Musik, Nachtbeleuchtung, 3x-Tempo

**KANN:**
- Pakt-Karten, Herausforderungen, Kosmetik
- Zeitraffer der letzten 20 s (Ringpuffer mit 5 Hz)
- Kleine Geschichten (Enten, Trecker), Wetter
- Fotomodus, Endlos-Sandbox, Buslinien

## 10. Risiken und Gegenmittel
1. **Wirkt wie ein Klon von Mini Motorways.**
   - Kreuzungstypen als echte Durchsatz-Entscheidung, der Polizist als Live-Eingriff.
   - Spielrelevante deutsche Mechaniken (rechts vor links, Vorfahrtsraute, Bahnübergang, Autobahn-Auffahrt) im 3D-Diorama.
2. **Verklemmungen und gefühlte Unfairness.**
   - Reservierung an Kreuzungen und Auflösung nach 3 s.
   - Bot-Test mit 1000 Zufallsnetzen: Kein Auto darf länger als 10 s stehen, ohne dass eine Ursache angezeigt wird.
3. **Unklare Niederlage (Kernproblem von V1).**
   - Lokaler Ring, Ursachen-Schilder während des Spiels, Report danach.
   - Jede Niederlage muss ein Ziel und eine Ursache benennen.
4. **Hektik oder Mikromanagement.**
   - Polizist nur als Ladung, Ampeln schalten selbst.
   - Bauen in der Pause, Erholung des Rings ist immer möglich.
5. **Touch in 3D fummelig.**
   - 90°-Drehung, große Trefferzonen, Vorschau, Rückgängig.
   - Ein Finger baut, zwei Finger bewegen die Kamera.
6. **Leistung auf dem Handy.** Instancing, Chunk-Merging, Simulation mit 20 Hz, automatische Qualitätsstufen.
7. **Der Umfang wächst wieder.** Geld, Editor, Unfälle und Statistikfenster sind gestrichen. Neue Inhalte kommen nur als Karte, Ereignis oder Stadt (reine Datenobjekte).

---

# Teil 4: Die 8 wichtigsten Akzeptanzkriterien

1. **Schneller Einstieg:** Von der fertig geladenen Seite bis zur ersten Ankunft eines Autos vergehen ohne Menü und ohne Textwand höchstens 20 s. 5 von 5 Erstspielern schaffen das ohne Hilfe.
2. **Sichtbarer Druck:** Spielt man in Kleinbüttel passiv (nur die erste Straße), beginnt der erste Überlaufring spätestens in Woche 2 und die Runde endet vor Woche 3. Ab 70 % Ring sind roter Bildrand, Musikwechsel und Randpfeil gleichzeitig zu sehen und zu hören.
3. **Lesbare Niederlage:** Jeder Stau-Report nennt das gescheiterte Ziel und mindestens eine konkrete Ursache mit Ort. Mindestens 4 von 5 Testspielern können direkt nach dem Aus in einem Satz sagen, warum sie verloren haben und was sie anders machen würden.
4. **Rundenlänge:** Der Median liegt bei Neulingen in Kleinbüttel bei 10–15 min, bei geübten Spielern (ab der 5. Runde) bei 20–25 min. Keine Runde ist vor Woche 2 verloren, wenn der Spieler aktiv baut.
5. **„Noch eine Runde“:** Der Neustart dauert unter 2 s. Mindestens 3 von 5 Testspielern starten freiwillig eine zweite Runde, und mindestens 2 von 5 schalten in der ersten Sitzung eine zweite Stadt frei.
6. **Echte Entscheidungen:** Gute Runden nutzen nachweislich alle 4 Kreuzungstypen. Ein Umbau von rechts vor links auf Vorfahrt oder Kreisel an einem Flaschenhals senkt dort die Wartezeit innerhalb von 10 s sichtbar, und das Schild verschwindet.
7. **Feedback und Bedienung:** Jede Spieleraktion hat innerhalb von 100 ms eine visuelle und eine akustische Rückmeldung. Jede Entscheidung braucht höchstens 2 Gesten. Das Spiel ist mit Touch allein vollständig spielbar, ohne Fehlbauten beim Kamera-Schwenken.
8. **Leistung und Stabilität:**
   - 60 FPS auf dem Desktop mit 450 Autos, mindestens 45 FPS auf einem Mittelklasse-Handy mit 300 Autos.
   - Keine dauerhafte Verklemmung im Bot-Test mit 1000 Zufallsnetzen: Jedes Auto bewegt sich innerhalb von 10 s wieder.
