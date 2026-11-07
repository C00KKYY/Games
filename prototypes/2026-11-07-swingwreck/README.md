# Swingwreck

- **Genre:** Physik-Arcade (Abriss) + Upgrade-Loop
- **Pitch:** Schwing eine Abrissbirne am Kran durch Gebäude aus Holz, Glas, Beton und Stahl, zünde Fässer für Kettenexplosionen und reiß jedes Level für drei Sterne komplett ab.

## Steuerung
- Maus: Laufkatze folgt dem Zeiger horizontal, die Zeigerhöhe bestimmt die Kettenlänge. Hin- und herbewegen pumpt den Schwung auf.
- Touch: ziehen (gleiches Prinzip)
- Tastatur: ← → fahren, ↑ ↓ Kette kürzer/länger; im Ergebnis-Panel Leertaste/Enter
- Timer startet erst bei der ersten Bewegung

## Kern-Loop
Level (40 s) → so viel wie möglich abreißen (zerstört, umgekippt oder vom Feld geworfen zählt) → 60 / 80 / 95 % = 1–3 Sterne,
ab 1 Stern geht es weiter → Geld in 8 Upgrades stecken → nächstes Level oder Wiederholung für mehr Sterne.

## Abwechslung
- Materialien: Holz (splittert), Glas (zerspringt), Beton (staubt, robust), Stahl (nur mit Diamant-Spikes knackbar, aber umwerfbar), Fässer (explodieren mit Druckwelle)
- 5 handgebaute Level (Türme, Häuser mit Fenstern, Glas-Hochhäuser, Betonmauer, Stahl-Festung), danach zufällig zusammengesetzte Baustellen, die mit dem Level wachsen
- Upgrades: Heavy Ball, Bigger Ball, Crane Motor, Long Chain, Overtime, Blast Core (harte Treffer explodieren), Salvage, Diamond Spikes

## Progression
Geld pro Teil (je Material), Combo-Anzeige „CRASH xN“, Zeitbonus bei 100 %, Sterne pro Level gespeichert, täglicher x2-Geldbonus.

## Juice
Echte Pendelphysik (Matter.js), Kette aus einzelnen Gliedern, Bewegungsschleier am Ball, Hit-Stop bei harten Treffern,
Zeitlupe bei Fass-Explosionen, Screenshake, Splitter je Material (Glas-Dreiecke, Holzlatten, Betonstaub), Schockwellen-Ringe, materialabhängige Geräusche.

## Warum CrazyGames
Zerstörung macht vom ersten Schwung an Spaß, Ein-Finger-Steuerung, kurze Level mit Sternen und Upgrades („noch ein Versuch“), 268 KB inkl. Physik-Engine.

## Technik
Matter.js 0.20.0 lokal in `vendor/` (MIT-Lizenz in `vendor/LICENSE-matter-js.txt`). Gebäude setzen sich vor dem Start in einer kurzen Vorsimulation.

## Bekannte Schwächen
- Balancing: mit ein paar „Heavy Ball“-Upgrades werden die Level sehr leicht (Bot erreicht ab Level 3 100 %)
- Keine Musik
- Zufallslevel ab Level 6 können sich überlappen oder schief setzen
- Abrissbirne ist starr (Stange statt echter Kette), wirkt bei schnellen Richtungswechseln etwas steif

## Nächste Schritte bei „ausbauen“
- Ziele pro Level (z. B. „nur das rote Haus“, „Glas verschonen“), Bonusobjekte
- Echte Kette aus Gliedern (Matter-Composite), Abrissbirnen-Skins
- Weitere Werkzeuge: Bagger-Schaufel, Abrisskugel mit Magnet, Sprengladungen setzen
- Musik, schwierigere Kurve, Weltkarte mit Stadtvierteln
