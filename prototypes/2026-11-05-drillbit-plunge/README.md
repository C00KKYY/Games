# Drillbit Plunge

- **Genre:** Arcade + Upgrade-Loop (Run → Shop → Run)
- **Pitch:** Steuere einen Bohrer immer tiefer in die Erde, schnapp dir Edelsteine, weiche Bomben und Hartgestein aus und rüste zwischen den Runden auf, bevor der Tank leer ist.

## Steuerung
- Maus/Touch: gedrückt halten und ziehen, der Bohrer folgt dem Finger horizontal
- Tastatur: ← → oder A / D
- Shop: Klick auf Upgrades, „DIG AGAIN“ oder Leertaste/Enter

## Kern-Loop
Der Bohrer fällt automatisch und bohrt sich durch Erde (schnell), Stein (mittel) und Hartgestein (langsam, kostet Sprit).
Edelsteine geben Münzen, Kombos (schnell hintereinander) steigern Tonhöhe und Wert, grüne Kanister füllen den Tank,
rote „!“-Bomben explodieren (3×3) und kosten Hülle. Runde endet bei leerem Tank oder zerstörter Hülle.

## Progression
- 6 Upgrades: Tank, Bohrkraft, Hülle, Edelstein-Magnet, Lenkung, Effizienz (Kosten ×1,65 pro Stufe)
- Tiefenbonus (0,5 Münzen/m), 6 Edelsteinstufen, die mit der Tiefe freigeschaltet werden
- 7 Biome alle 60 m mit Banner, Rekordlinie im Schacht, „NEW RECORD“-Moment (happytime)
- Täglicher Bonus: erste Runde des Tages doppelte Münzen
- Speicherstand in localStorage

## Warum CrazyGames
Sofort im Gameplay, Ein-Finger-Steuerung, Runden von 30–60 s mit klarem „noch eine Runde“-Shop dazwischen,
Midgame-Werbung natürlich zwischen den Runden (jede 3.), kein Build, < 100 KB.

## Bekannte Schwächen
- Wenig Abwechslung in der Mechanik jenseits ~200 m (keine neuen Hindernisarten pro Biom)
- Balancing nur per Bot geprüft; Late-Game-Kosten vermutlich zu steil oder zu flach
- Seitenflächen neben dem Schacht sind leer (Platz für Deko/Statistiken)
- Kein Ziel/Ende (z. B. „Erreiche den Kern“)

## Nächste Schritte bei „ausbauen“
- Biom-spezifische Gefahren (Lava, Gas, Wasser, Kristalle, die zurückprallen)
- Kurzer Boost (Doppeltipp) mit Abklingzeit, Prestige-System („neuer Bohrer“)
- Missionen/Daily-Challenges, Bohrer-Skins als Belohnung
- Musik-Loop und mehr Bildschirm-Juice (Zoom bei Explosionen, Treffer-Freeze)
