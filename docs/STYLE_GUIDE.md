# STYLE GUIDE – Rascal Rock Lockup (verbindlich)

**Ein Satz:** flache, geometrische Vektorformen mit kräftigen Silhouetten. Jede Form hat zwei Töne (Grundton plus Schattenton) und genau eine helle Kante. Licht kommt von oben links. Konturen sind dunkle Eigenfarbe, nie Schwarz. Jedes Weltobjekt steht auf einem weichen Kontaktschatten. Die Stimmung ist warm, aufgeräumt und erwachsen: eine Inselbehörde mit Holz, Ziegel und Messing, keine Kinderzimmer-Optik.

## 1. Palette (31 Farben, mittlere Sättigung)

Die Quelle der Hex-Werte ist `art/palette.ts`. Code und Tests lesen nur dort.

| Rampe | 900 (Kontur/tiefster Schatten) | 700 (Schatten) | 500 (Grundton) | 300 (Licht) | 100 (Highlight) |
|---|---|---|---|---|---|
| **wood** | `#4a3022` | `#7a4e33` | `#a8713f` | `#d39c63` | – |
| **teal** (Teich) | `#14424a` | `#226b6e` | `#33908a` | `#66b9a8` | – |
| **sage** (Gras) | `#33502f` | `#52763f` | `#779a52` | `#a3bf75` | – |
| **brick** (Ziegel) | `#5e2b23` | `#8f4030` | `#b85d40` | – | – |
| **stone** (Beton, Fell grau) | `#3e3c42` | `#6b6771` | `#9b96a1` | `#c6c0c7` | – |
| **cream** (UI, Papier) | – | `#e3d3b2` | `#efe3c8` | `#f8f0de` | – |
| **ink** (Text, Nacht) | `#1f2b3e` | `#36485f` | `#5b6e89` | – | – |
| **gold** (Coins, Messing) | – | `#b37f1d` | `#e8b13a` | – | – |
| **coral** (Alarm, Akzent) | – | `#a93e34` | `#df6450` | – | – |
| **mint** (gut, Erfolg) | – | `#2f8a68` | `#5fc39a` | – | – |

**Regeln**
- Höchstens 20 % des Bildes in einer reinen Primär- oder Akzentfarbe. Gold, Koralle und Mint sind nur Akzente.
- Keine Pastell-Babytöne, kein reines Weiß (`#fff`) in der Welt, kein reines Schwarz (`#000`) irgendwo.
- Overall-Streifen nach Sicherheitsstufe: **niedrig** = cream-500 auf gold-700-Basis (Senf), **mittel** = teal-300/teal-700, **hoch** = coral-500/brick-700.
- Fell: Waschbär = stone-Rampe mit ink-900-Maske. Wiesel = wood-Rampe mit cream-500-Bauch. Personal: Bulldogge = brick/wood, Bär = wood-700/wood-900, Biber = wood-500 mit gold-700. Dachs = stone-900/cream. Gans = cream/stone-300 mit gold-500-Schnabel. Kater = ink-700.

## 2. Licht, Kontur, Schatten
- **Licht oben links.** Schattenton auf der Seite unten rechts, Highlight-Kante oben links (eine Linie oder Sichel, 1–2 px bei 1×).
- **Kontur:** 2 px bei Zoom 1 / DPR 1 (in den SVGs 2 Einheiten auf das 1×-Raster). Farbe ist die 900-Stufe der Eigenrampe. Bei Farben ohne 900-Stufe (cream, gold, coral, mint) wird die dunkelste Stufe der passenden Nachbarrampe genommen (cream → wood-700, gold → wood-900, coral → brick-900, mint → sage-900).
- **Kontaktschatten:** Ellipse ink-900 mit 22 % Deckkraft, Breite ≈ 0,9 × Objektbreite, Höhe ≈ 0,3 × Breite, leicht nach rechts unten versetzt (+2/+2).
- **Wandschatten:** Wände werfen einen Schattenkeil nach Südosten (ink-900, 18 %, 0,4 Kacheln). Am Wandfuß innen liegt ein AO-Streifen (ink-900, 0→20 %, 6 px).

## 3. Perspektive und Raster
- Top-down 3/4 (oblique). Böden sind reine Draufsicht. Wände zeigen eine Oberkante (Draufsicht, 8 Einheiten) und eine **Südfront von 16 Einheiten** (= 0,5 Kacheln). Möbel zeigen Draufsicht plus Front.
- 1 Kachel = 32 Welteinheiten. Atlas @1x = 32 px/Kachel, @2x = 64 px/Kachel.
- Sortierung nach Fuß-y. Wände in der Nähe des Cursors oder vor ausgewählten Agenten werden auf 35 % Deckkraft geblendet (Cutaway).

## 4. Formen
- Eckenradius: Möbel 3–5 Einheiten, Räume und Wände 2, Charaktere stark gerundet (Kapseln).
- Oberflächen: Grundton plus ein linearer Verlauf zur Schattenstufe (nur zwischen benachbarten Rampenstufen) plus genau eine Highlight-Kante. Keine Radialverläufe außer bei Licht-Sprites.
- Böden: je Raumtyp eine Bodenart mit 3–4 Kachelvarianten (Index, Rotation, leichter Tint ±4 %). Bodenarten: Gras (draußen), Pflaster (Wege), Holzdielen (Kantine, Werkstatt), Fliesen (Waschhaus, teal/cream), Beton (Zellen, stone), Teppich (Klassenzimmer, brick-700), Sand (Hof).
- **Kein Text in SVGs.** Text gibt es nur im DOM-UI und als BitmapText.

## 5. Charaktere
- Kopf zu Körper 1:2 bis 1:2,5. Körper als abgerundete Kapsel, Kopf als Grundform. Spezies unterscheiden sich durch Ohren und Schnauze.
- Augen ≤ 25 % der Kopfhöhe, schmale Ovale mit **halb geschlossenen Lidern** (Lidlinie in der Fellkontur-Farbe). Keine Glanzpunkte, keine Kulleraugen. Mimik: Schmunzeln, eine hochgezogene Braue.
- Schichten: Schatten, Beine (2), Körper/Overall, Arme (2), Kopf, Accessoire. Graustufen-Schichten (Fell, Overall-Grund) werden per `tint` eingefärbt. Feste Farben (Augen, Nase, Streifen) liegen auf eigenen Schichten.
- 4 Richtungen: S, N, E (W = E gespiegelt). Bewegung entsteht im Code: Bob ±1,5, Beinschwung ±3, Squash & Stretch 4 %, Blinzeln alle 2–6 s, Idles (Kratzen, Gähnen, Strecken).
- Personal trägt Uniformfarbe (Wache ink-700, Koch cream-500, Lehrer brick-700, Biber gold-700) und eine Kopfbedeckung je Rolle.

## 6. Welt und Licht
- Wasser: teal-Rampe, animierte Wellen-Sprites (heller Strich teal-300), Schaum am Ufer. Sand-Ufer wood-300.
- Ambience: Möwen, Blätter, Dampf (cream-300, 40 %), nachts Glühwürmchen (gold-500 additiv).
- **Nacht:** Container-Tint der Welt höchstens 25 % dunkler und bläulich (`#b4bfd8`-artig). Laternen und Fenster sind additive Licht-Sprites. Mittlere Luminanz ≥ 0,45. Kein Vollbild-Multiply, kein ColorMatrix-Filter auf der ganzen Welt.

## 7. UI
- DOM über dem Canvas. Panels cream-300 mit Rahmen in wood-500 (2 px) und Innenlinie cream-700. Optik: Aktenmappe mit Reiter, Stempel-Akzente in coral-500 mit 85 % Deckkraft und leicht gedreht.
- Radius 10 px, 8-px-Raster, geschichtete Schatten (`0 1px 0 wood-700`, `0 6px 16px rgba(31,43,62,.25)`).
- Schriften: **Fredoka 600/700** für Zahlen und Titel, **Inter 400/600** für Fließtext. Text ink-900 auf cream (Kontrast > 10:1).
- Icons: eigene SVGs in diesem Stil (2-Ton, Kontur), 24×24 Basisraster.
- Welt-Icons (Bedürfnisse, „+Coins") sitzen immer auf einer cream-300-Plakette mit wood-700-Kontur. Ihre Bildschirmgröße ist konstant, mindestens 14 px hoch.

## 8. Verboten
Runde Köpfe mit Punktaugen, Blueprint-Optik, 3D-Stickmen, Booster-Optik von Leek Factory, Kenney- oder andere Fremdgrafik im Spielbild, gemischte Auflösungen, Kulleraugen, Pastell, reines Schwarz.
