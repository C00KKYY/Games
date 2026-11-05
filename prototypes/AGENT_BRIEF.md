# Briefing: Täglicher CrazyGames-Prototyp

Diese Datei ist die feste Arbeitsanweisung für den täglichen Agenten-Lauf.
Pro Lauf entsteht **genau ein neues, spielbares Spiel**. Die Besitzerin oder der
Besitzer des Repos schaut es sich an, bewertet es und sortiert aus.

## Ziel

Ein Prototyp, der realistische Chancen hat, von CrazyGames angenommen zu werden,
und der Spaß macht. Er ist kein Release, aber er muss:

- sofort spielbar sein (≤ 1 Klick bis zum Gameplay),
- die Kernmechanik in den ersten 30 Sekunden verständlich machen,
- einen Grund zum Weiterspielen haben (Progression, Highscore, Upgrades),
- ohne Fehler im Browser laufen (Desktop **und** Mobil/Touch).

Qualität geht vor Umfang. Eine Mechanik, gut umgesetzt und mit Juice
(Screenshake, Partikel, Sound, Feedback), schlägt fünf halbe Features.

## Genre-Vorgaben

- **Bevorzugt:** Arcade, Idle/Incremental. Hybride sind ausdrücklich erwünscht
  (z. B. Arcade-Runde → Upgrades → nächste Runde, Idle mit aktiver Komponente).
- **Gern auch:** physikbasierte Spiele (Stapeln, Schleudern, Zerstören, Seile, Fahrzeuge).
- **Vermeiden:** Genres, die auf CrazyGames schwach laufen oder als Prototyp nicht
  tragen: textlastige Spiele, reine Story-Spiele, komplexe Strategie mit langer
  Einarbeitung, Multiplayer (Server nötig), Spiele mit langen Ladezeiten.
- Variiere über die Läufe: nicht zweimal hintereinander dieselbe Kernmechanik.
  Lies dafür `prototypes/catalog.json`.

Was auf CrazyGames gut läuft (aus deren Basic-Launch-KPIs):
Sitzungen von 10+ Minuten, Day-1-Retention 10–15 %, über 80 % der Spieler
spielen mindestens 1 Minute, Ladezeit unter 10 s, Build unter 20 MB.
Daraus folgt: schneller Einstieg, klarer Fortschritt, gespeicherter Fortschritt,
„noch eine Runde“-Gefühl, tägliche Anreize.

## Ablauf eines Laufs

1. **Branch:** Arbeite auf dem Branch `prototypes`
   (`git fetch origin prototypes && git checkout prototypes`). Committe und pushe
   dorthin. Nur dieser Branch wird über GitHub Pages veröffentlicht.
2. **Feedback lesen:** Hole alle Issues mit dem Label `prototyp`, inklusive Kommentaren.
   Bewertungen haben die Form `Note: X/5` und optional
   `Status: ausbauen | verwerfen | egal` plus Freitext. Fasse die Erkenntnisse in
   `prototypes/RATINGS.md` zusammen: Tabelle mit allen Spielen und Noten plus
   Abschnitt „Geschmacksprofil“, also was gut ankommt und was nicht. Das
   Geschmacksprofil hat Vorrang vor den allgemeinen Genre-Vorgaben oben.
3. **Konzept wählen:** Prüfe 3 Ideen kurz gegen Geschmacksprofil, Katalog und
   CrazyGames-Tauglichkeit und nimm die beste. Name: originell, englisch, keine
   bestehende Marke und kein bekanntes Spiel nachbauen.
4. **Bauen:** Kopiere `prototypes/_template/` nach `prototypes/<JJJJ-MM-TT>-<slug>/`
   und baue darauf auf. Regeln:
   - Reines HTML/JS/CSS **ohne Build-Schritt** (GitHub Pages liefert nur statische
     Dateien aus). Bibliotheken nur lokal in `vendor/` des Spiels (z. B. Matter.js
     für Physik), mit Lizenzhinweis.
   - Nur relative Pfade. Ordner komplett eigenständig, damit er als ZIP zu
     CrazyGames hochgeladen werden kann.
   - Grafik prozedural (Canvas/SVG) oder selbst erzeugt; Sound per WebAudio
     synthetisiert. Keine fremden Assets ohne klare freie Lizenz.
   - Komplette Checkliste in `prototypes/CRAZYGAMES_CHECKLIST.md` einhalten.
5. **Testen** mit Playwright (vorinstalliert, `require('playwright')`):
   - keine Konsolenfehler, kein Absturz bei 3 Minuten automatisiertem Spielen,
   - Viewports 1216×684, 907×510 und 800×450 (Touch-Emulation): UI lesbar, nichts abgeschnitten,
   - `gameplayStart` wird aufgerufen (Wrapper loggt das),
   - Screenshots: `prototypes/<ordner>/screenshot.png` (1216×684, Gameplay, nicht das Menü).
   Gefundene Fehler beheben und erneut testen.
6. **Steckbrief** `prototypes/<ordner>/README.md`: Name, Genre, Pitch in einem Satz,
   Steuerung, Kern-Loop, Progression, warum es zu CrazyGames passt, bekannte
   Schwächen, nächste Schritte bei „ausbauen“.
7. **Katalog** `prototypes/catalog.json` ergänzen (Felder siehe vorhandene Einträge:
   `id, name, date, genre, pitch, path, screenshot, issue`).
8. **Commit und Push** auf `prototypes`.
9. **Issue anlegen** im Repo `C00KKYY/Games` mit Label `prototyp`:
   - Titel: `🎮 <Name> (<JJJJ-MM-TT>) – <Genre>`
   - Body: Spiel-Link `https://c00kkyy.github.io/Games/prototypes/<ordner>/`,
     Screenshot (raw-Link vom Branch `prototypes`), Pitch, Steuerung und diesen Block:
     ```
     **Bewerten:** Kommentar schreiben, z. B.
     Note: 4/5
     Status: ausbauen   (oder: verwerfen / egal)
     Was gut / schlecht war: …
     ```
   - Danach die Issue-Nummer in `catalog.json` eintragen, committen, pushen.
   - Falls das Anlegen scheitert, Link und Hinweis in `catalog.json` lassen und im
     Abschlussbericht melden.

## Was ein Lauf **nicht** tut

- Keine bestehenden Spiele umbauen (auch nicht welche mit „ausbauen“). Das
  passiert in separaten Sessions auf Anfrage.
- Nichts auf anderen Branches pushen, keine Pull Requests, keine Issues schließen.
- Keine Spiele bekannter Marken oder Nachbauten bestehender Spiele.

## Abschlussbericht

Kurz: Name, Link, Issue-Link, was gut gelungen ist, was schwach ist, Testergebnis.
