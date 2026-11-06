# Bricklash

- **Genre:** Arcade-Roguelite (Brick-Breaker mit Upgrade-Auswahl)
- **Pitch:** Zertrümmere Ziegel mit Kettenexplosionen, wähle nach jedem Level 1 von 3 Upgrades und bau dir einen absurd starken Run, bis der Ziegel-Golem fällt.

## Steuerung
- Maus/Touch: Schläger folgt dem Zeiger, Klick/Tipp schießt den Ball ab (sonst nach ein paar Sekunden automatisch)
- Tastatur: ← → oder A / D, Leertaste/↑ zum Abschießen, 1/2/3 für Upgrade-Karten, Enter = nochmal
- 🔊-Knopf oben rechts schaltet den Ton stumm

## Kern-Loop
Level räumen → Upgrade-Karte wählen (9 Upgrades, stapelbar) → nächstes Level mit neuem Muster.
Alle 5 Level ein Boss (Ziegel-Golem, bewegt sich, schießt Betäubungs-Kugeln). 3 Leben, Game Over → Shards → permanente Upgrades.

## Abwechslung im Run
- 9 Level-Muster (Pyramide, Raute, Wellen, Invader, gespiegelt-zufällig …), nie zweimal dasselbe hintereinander
- Ziegeltypen: normal (mehr HP mit steigendem Level), Bombe (Kettenexplosion), Gold (Punkte + garantierte Kapsel), Stahl (nur durch Feuer/Laser/Explosion), Wanderziegel
- Upgrades: Multiball, Wide Paddle, Heavy Ball, Fireball (durchschlagen), Paddle-Laser, Shockwave, Floor Shield, Chain Zap, Extra Life
- Kapseln: Split ×3, großer Schläger, Zeitlupe, Laser, Extraleben
- Combo-Multiplikator (Treffer ohne Schlägerkontakt) mit steigender Tonhöhe

## Progression
- Shards pro Run (Score + Level, täglicher x2-Bonus) → 4 permanente Upgrades (Leben, Schlägerbreite, Kapselglück, Head Start)
- Highscore und bestes Level gespeichert

## Bewegung/Juice (Fokus nach Feedback zu Drillbit Plunge)
Geglätteter Schläger mit Neigung und Squash, Ball mit Stretch nach Richtung und Schweif, Hit-Stop bei Explosionen,
Screenshake, Partikel, Schockwellen-Ringe, Blitze, wackelnde Ziegel bei Treffern, Boss-Augen folgen dem Schläger.

## Warum CrazyGames
Sofort spielbar, bekanntes Genre mit Roguelite-Twist, Runs von 3–10 Minuten, „noch ein Run“-Meta-Shop, Midgame-Werbung nur zwischen Runs.

## Bekannte Schwächen
- Brick-Breaker ist ein sehr verbreitetes Genre; der Twist steckt in Upgrades und Bossen, nicht in der Grundmechanik
- Nur ein Boss-Typ (skaliert mit Level), keine Musik
- Balancing nur per Bot geprüft (der Bot verliert nie, echte Schwierigkeit unklar)
- Späte Level mit vielen HP-Ziegeln können sich ohne Upgrades ziehen

## Nächste Schritte bei „ausbauen“
- Mehrere Bosse mit eigenen Mustern, Welten mit eigener Optik
- Seltene „legendäre“ Upgrades und Synergien (z. B. Feuer + Shockwave = Inferno)
- Daily Challenge mit festem Seed und Bestenliste
- Musik-Loop, Ball-Skins als Belohnung

## Änderungen

### 2026-11-06 (Abendlauf, Feedback #2: 4/5, „noch nicht verfeinert“)
- **Musik:** synthetisierter Loop (Bass, Arpeggio, Kick, Hi-Hat), im Boss-Level schneller, in Menüs gedämpft; respektiert Mute/SDK
- **Level-Intro:** Ziegel fallen gestaffelt mit Überschwinger ins Feld
- **Ziegel zerbrechen:** rotierende Splitter in Ziegelfarbe plus weißer Aufprall-Rahmen statt nur Pixel-Partikel
- **Letzter Treffer:** Zeitlupe mit leichtem Zoom auf den letzten Ziegel
- **Score:** zählt hoch und „poppt“ bei Punkten
- **Anti-Stau:** nach 7 s ohne Treffer lenken Bälle sanft zum nächsten Ziegel; bei ≤ 3 Restziegeln pulsiert ihr Rahmen
- **Zweiter Boss „Warden“** (Level 10, 20, …): 10 Orbit-Ziegel kreisen um ihn, drehen schneller je weniger übrig sind, Fächerschuss; Golem bleibt auf 5, 15, 25
- **Feinschliff:** Abschuss-Ring, Absturz-Effekt an der Stelle des verlorenen Balls, Upgrade-Karten vergrößern sich mit Glow beim Hover
