# Ember Night – Prüfliste für Roblox Studio / Studio checklist

Nichts davon konnte ohne Studio geprüft werden. Bitte in dieser Reihenfolge durchgehen und Abweichungen notieren
(Ausgabe-Fenster: rote Zeilen kopieren). — None of this could be checked without Studio. Please go through it in
this order and note anything that differs (Output window: copy red lines).

## 1. Öffnen / Open

- [ ] `tools/build.sh` (oder `rojo build default.project.json -o build/EmberNight.rbxlx`), Datei in Studio öffnen
      (oder `rojo serve` + Rojo-Plugin). / Build, open the place (or `rojo serve` + Rojo plugin).
- [ ] F5 (Play): Ausgabe ohne Fehler. Erwartet: höchstens die Hinweise „sound effect ids are 0“ und „not saved“.
      / Output without errors; at most the notes about audio ids and "not saved".
- [ ] Game Settings → Security → „Enable Studio Access to API Services“ an; Places → Max Players = 4.
      / Turn on API access; max players 4.
- [ ] Workspace → StreamingEnabled = aus (kommt aus `default.project.json`; die Arena wird nur auf den Clients gebaut,
      Streaming wird nicht gebraucht). / Workspace.StreamingEnabled is off (set by the project file).

## 2. Hub

- [ ] Gruppenfeld links, Leiste unten; jedes Fenster öffnet sich, das Gruppenfeld verschwindet solange.
      / Party panel left, bar at the bottom; every window opens, the party panel hides meanwhile.
- [ ] Helden: 3D-Vorschau in jeder Karte (Farben, Hut, Waffe), gesperrte Helden blass. / Hero cards show a 3D preview.
- [ ] Sprache DE/EN umschalten (Einstellungen): alle Texte wechseln. / Switch language: every text changes.
- [ ] Schmiede kaufen/zurückgeben, Rückfrage erscheint. / Forge buy/refund with confirmation.

## 3. Lauf allein / Solo run

- [ ] Kamera schräg von oben, folgt weich; Boden, Flecken, Grasbüschel, Deko (Gräber, Kreuze, Steine …), Kohlebecken
      mit Glut. / Camera, ground detail, decor and braziers look right.
- [ ] Licht je Land: Friedhof (grün-blau, Nebel), Aschenwald (warm, Asche steigt), Eissee (blau, Schnee), Burgruine
      (staubig), Herz der Nacht (violett, Sternenstaub). Zu dunkel/zu hell? / Land lighting – too dark or too bright?
- [ ] Gegnermodelle: Fledermaus (Flügel schlagen), Schleim, Skelett, Geist (durchscheinend), Ghul, Spucker (Schnauze
      zuckt beim Ausholen), Aschenkessel (schaukelt), Motte, Glocke (schwingt), Irrlicht, Schläger, Golem. Elite mit
      Goldring. / Every enemy model and its wind-up animation; elites with a gold ring.
- [ ] Bosse mit Krone und Licht; Die Nacht mit kreisenden Splittern. / Bosses with crown and light.
- [ ] Warnzeichen gut lesbar (rote Füllung wächst, blinkt kurz vor dem Einschlag). Gegnerschüsse rot mit dunklem Ring.
      / Telegraphs readable; enemy shots red with a dark ring.
- [ ] Schadenszahlen steigen auf (Krit gold), Todeswolken in Gegnerfarbe, Explosionen. / Damage numbers, death puffs.
- [ ] HUD: EP-Leiste, Zeit, Besiegt/Gold, Waffenplätze mit Stufenpunkten, Bossleiste, Countdown/Ansturm-Leiste ab
      1:30, Lebensleiste unten, roter Blitz bei Treffern. / HUD elements.
- [ ] Aufstieg: Karten mit Symbol (Emoji sichtbar?), 1–4 / Klick, R/K/B. Truhe mit Weiter. Pause (P): Ausrüstung,
      Werte, Schnelleinstellungen, Aufgeben mit Rückfrage. / Cards (do the emoji icons render?), chest, pause.
- [ ] Pfeile am Bildschirmrand für Schüsse von außerhalb, Boss, Truhen. / Off-screen arrows.
- [ ] Tod → „Am Boden!“ bzw. „Letzte Chance“ → Ergebnisse mit Goldaufstellung und Schaden je Waffe → Zurück.
      / Down → last chance → results → back.

## 4. Koop / Co-op (Test → Clients and Servers, 2–4)

- [ ] Mitspieler mit Namen und Lebensleiste über dem Kopf, Mitspielerkarten rechts oben.
- [ ] Kartenleiste unten ohne Anhalten, Zeitgeber läuft; Glutschild (Kuppel). / Card tray, ward dome.
- [ ] Am Boden: grüner Ring füllt sich beim Wiederbeleben; grüner Pfeil zeigt auf Niedergeschlagene außerhalb.
- [ ] Menü (☰) öffnet die Pause ohne anzuhalten; Aufgeben = zuschauen. / Menu does not pause; give up = spectate.
- [ ] Sieg: Abstimmung mit Restzeit. / Victory vote with timer.

## 5. Geräte / Devices (Device Emulator)

- [ ] Telefon quer (z. B. iPhone 14): HUD in der sicheren Fläche, Knöpfe groß genug, Karten passen in eine Reihe,
      Fenster schrumpfen und scrollen. / Phone landscape: safe area, button sizes, cards fit, windows scroll.
- [ ] Tablet, Gamepad (Auswahl springt auf die erste Karte/den ersten Knopf). / Tablet, gamepad selection.
- [ ] Gamepad im Lauf: LB öffnet die Pause (Start gehört evtl. dem Roblox-Menü), Steuerkreuz wählt Karte 1–4 im Koop, ohne dass der Held stehen bleibt. / Gamepad in a run: LB pauses, D-pad picks cards 1–4 in co-op while the hero keeps moving.
- [ ] Gegnerschüsse auf dem Telefon gut sichtbar. / Enemy shots readable on a phone.

## 6. Leistung / Performance

- [ ] MicroProfiler (Strg+F6) in einem 4er-Test bei 10:00 im Herz der Nacht: Server-Schritt ≤ 6 ms, Client stabil;
      Shift+F3 Netzwerk: Empfang ≤ 45 KB/s. / Server step, client frame, network.
- [ ] Einstellung „Weniger Effekte“: Wetter aus, weniger Partikel. / "Fewer effects".

## 7. Klang / Audio

- [ ] `assets/audio/sfx/*.mp3` (34) und `assets/audio/music/*.mp3` (5) hochladen (Creator Hub → Creations → Audio oder
      Asset Manager → Bulk Import; Uploads müssen demselben Besitzer gehören wie das Spiel; nicht verifizierte Konten
      haben ein Monatslimit für Audio-Uploads). IDs in `src/shared/Config/AudioIds.luau` eintragen, neu bauen.
      / Upload, paste ids, rebuild.
- [ ] Effekte (Treffer, Edelsteine steigen in der Tonhöhe, Truhe, Aufstieg), Musik: Hub → Kampf (anfangs gedämpft) →
      Boss; Sieg/Niederlage-Abschluss. Lautstärken passend? / Effects, music changes, volumes.
- [ ] Einstellungen Klang/Musik aus: wirklich still. / Sound/music toggles.

## 8. Robux (siehe README „Robux-Käufe einrichten“)

- [ ] Produkte und Pässe anlegen, IDs in `src/shared/Config/Products.luau`, neu bauen; Testkäufe: Goldpakete,
      Zweite Glut in der letzten Chance, Heldenpass, Kosmetik (sichtbar im Lauf: Farben, Spur, Waffenfarbe),
      doppeltes Gold in den Ergebnissen; neu beitreten → alles da, nichts doppelt. / Purchases and rejoin.

## 9. Veröffentlichen / Publish

- [ ] Experience Questionnaire (erwartet „Mild“: Fantasy-Gewalt, leichte Angst), Beschreibung DE/EN, Symbolbild,
      privat veröffentlichen, auf einem echten Telefon testen. / Questionnaire, description, icon, private publish.
