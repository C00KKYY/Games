# Verkehrsmeister 3D

Ein Verkehrs-Puzzlespiel in 3D für den Browser. Farbige Häuser schicken ihre Autos zu Zielen derselben Farbe – du baust die Straßen dazwischen und hältst die Kreuzungen frei. Jede erledigte Fahrt zählt. Staut es sich so sehr, dass ein Ziel nicht mehr beliefert wird, steht die Stadt still.

Keine Installation: **`index.html` im Browser öffnen** (auch direkt von der Festplatte). Läuft mit Maus und Tastatur oder per Touch auf Tablet und Handy.

## Spielprinzip

- **Häuser** (je 2 Autos) und **Ziele** (Bäckerei, Klinik, Büro, Gärtnerei, Kino, Fabrik) haben Farben. Ein Auto fährt zum Ziel seiner Farbe, erledigt dort einen Auftrag und fährt wieder heim.
- **Aufträge** sammeln sich als Punkte unter dem Ziel. Ab dem 7. offenen Auftrag läuft ein **roter Ring** – ist er nach 35 Sekunden voll, ist das Spiel vorbei. Sinkt die Zahl wieder, baut sich der Ring doppelt so schnell ab.
- Jedes angeschlossene Haus erzeugt zusätzliche Nachfrage. Die Stadt wächst ständig: alle paar Sekunden kündigt sich ein neues Haus mit seinem Schatten an, alle vier Tage ein neues Ziel – oft in einer neuen Farbe.
- Ein Tag dauert 40 Sekunden mit **Morgen- und Feierabendwelle**. Nach fünf Tagen ist Wochenende: +20 Straßen, +1 Polizei, die Ortsgrenze wächst, und du wählst **eine von drei Karten** (Ampeln, Kreisel, Autobahn, Brücken, Tunnel, Grüne Welle, Parkhaus, Tempo 60, Gleitzeit, Zweitwagen, Feierabend-Stopp, Pakt-Karten …).
- Es gibt kein Geld, sondern ein **Inventar**: Straßenkacheln, Brücken (bis 4 Felder über Wasser), Tunnel (bis 5 Felder durch Berge), Ampeln, Kreisel, Autobahnen und Polizei-Einsätze. Abreißen gibt Bauteile zurück.

## Kreuzungen

- Ohne Regel gilt **rechts vor links**.
- **Vorfahrt per Wisch:** entlang einer bestehenden Straße über eine Kreuzung ziehen – diese Richtung wird Hauptstraße (kostet nichts).
- **Ampel:** schaltet selbst nach Bedarf (4–12 s Grün), die per Wisch gewählte Hauptachse bekommt doppelt so lange Grün.
- **Kreisel:** wer im Kreis fährt, hat Vorfahrt – flüssig bei Verkehr aus allen Richtungen.
- **Autobahn:** gerade Hochstraße mit zwei Rampen, überquert Straßen, Wasser und Gleise, Tempo 130.
- **Polizei:** regelt eine Kreuzung 15 Sekunden lang von Hand und lässt alles durch, was sich nicht kreuzt.

Gelbe Schilder zeigen die drei größten Engstellen samt Ursache. Ein Klick auf ein Auto, eine Kreuzung oder ein Ziel öffnet die **Stau-Lupe** mit Erklärung und Tipp. Nach dem Stillstand gibt es einen **Stau-Report** mit Wartezeit-Karte, den drei schlimmsten Kreuzungen und Bestenliste.

## Städte

| Stadt | Besonderheit |
|---|---|
| Kleinbüttel | Dorf am Bach, mit Tutorial |
| Hafenstadt | Kanäle; die Klappbrücke öffnet alle 30 s für ein Schiff |
| Ruhrstadt | zwei Bahnstrecken, Schranken schließen alle 20 s |
| Alpendorf | Berge und Tunnel, Schneetage machen alle langsamer |
| Messestadt | Messe-Ansturm mit 20 Aufträgen auf einmal |
| Hauptstadt | vorgebauter schneller Ring, bis zu sechs Farben |

Jede Stadt hat Bronze/Silber/Gold-Marken und eine lokale Bestenliste. Die **Tageschallenge** kombiniert jeden Tag eine Stadt mit einer Sonderregel. Gesammelte Fahrten bringen **Ränge** (ab Rang 2 gibt es Pakt-Karten).

## Bedienung

| Eingabe | Aktion |
|---|---|
| Linke Maustaste ziehen | Straße bauen / per Wisch Vorfahrt setzen |
| Rechte Maustaste ziehen | Abreißen |
| Klick | Stau-Lupe (Auto, Kreuzung, Ziel) |
| Mausrad / Pinch | Zoomen |
| Mittlere Maustaste, Umschalt+Ziehen, WASD | Kamera verschieben |
| Q / E | Kamera drehen |
| 1 / 2 / 3 / 4 | Straße / Ampel / Kreisel / Autobahn |
| P, X, F | Polizei, Radierer, Feierabend-Stopp |
| Leertaste, Tab | Pause, Tempo 1×/2×/3× |
| Strg+Z | Rückgängig (10 Schritte) |
| Touch | ein Finger baut, zwei Finger verschieben/zoomen/drehen |

## Technik

- Reines JavaScript ohne Build-Schritt, 3D mit [Three.js](https://threejs.org/) r128 (liegt in `vendor/`).
- Kachelbasierte Mikrosimulation: jedes Auto fährt auf Bézier-Bahnen durch die Kacheln, hält Abstand, wartet an Kreuzungen nach Konflikttabellen, plant per A* und weicht Staus aus. Kreuzungsketten werden gemeinsam freigegeben, Patt-Situationen löst ein „Nach Ihnen!“-Ventil.
- Hochstraßen liegen auf einer eigenen Kachelebene; Rampen verbinden sie mit dem Boden.
- Alle Klänge und die Musik werden live per WebAudio erzeugt.

```
node tools/simtest.js kleinbuettel 6      # Simulation headless mit Bau-Bot testen
node tools/build-single.js out.html        # alles in eine HTML-Datei bündeln (--cdn: Three.js vom CDN)
```

Das Spieldesign ist in [`docs/DESIGN.md`](docs/DESIGN.md) beschrieben.
