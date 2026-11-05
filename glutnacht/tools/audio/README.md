# Audio-Werkzeuge

- `audition.html`: Probehör-Seite (direkt im Browser öffnen, auch über file://). Spielt jedes Klangereignis und jedes
  Musikstück über die Spiel-Engine `js/audio.js` (mit Verstimmung, Hall, Überblendung, Abschlüssen), dazu zum
  Vergleich den alten Synthesizer, und hat Regler für die Lautstärke je Effekt und Stück (Tabelle zum Übernehmen
  in `js/audio.js`, `VOL` / `TRACK_VOL`).
- `../build-audio.js`: schreibt `assets/audio.js` (base64 aller mp3 aus `assets/audio/`, dazu Encoder-Verzögerung und
  Auffüllung der Musik aus dem LAME-Kopf für exakte Schleifen). Nach jedem Austausch einer Datei ausführen.
- `sfxmap.tsv`: Ereignis → Quelldatei, Start, Länge (Sekunden) der 34 Effekte in `assets/audio/sfx/`.
- `musicmap.tsv`: Musikstück → Quelldatei, Start, Länge, Ausblendung für `assets/audio/music/`.
- `xfade_loop.py in out.wav ms`: backt eine Überblendung ein, damit ein Stück ohne Knacken schleift (braucht ffmpeg;
  die Bossmusik ist dadurch 63,96 s statt 64 s lang).

Formate: Effekte mp3 mono 64 kbit/s, Musik mp3 mono 48 kbit/s (mp3 dekodiert in jedem Browser, auch altem Safari).
Alle Aufnahmen CC0, Herkunft in `assets/CREDITS-audio.txt`; der Einzeldatei-Build bettet sie mit ein.
Ausgewählt wurde nur nach Name, Pegel und Spektrogramm – vor der Veröffentlichung einmal anhören.
