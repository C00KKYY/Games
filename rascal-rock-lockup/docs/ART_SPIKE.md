# ART SPIKE (M1) – Material für Gate G1

Alle Dateien liegen in `qa/g1/`. Die Spielszene ist echt in Pixi gerendert (WebGL unter SwiftShader), keine Montage.

| Datei | Inhalt |
|---|---|
| `day_1280.png`, `day_907.png`, `day_800.png` | Key-Art-Szene Tag: Start-Gefängnis mit Kantine (Stufe 1), Zellentrakt, Steg mit Fähre, Büro, Karrendepot, Freiheitstor mit Schalter. 4 laufende Schlingel, Koch, Wache, Biber. HUD-Skizze |
| `night_1280.png`, `night_907.png` | dieselbe Szene nachts (Container-Tint + additive Lichter, Glühwürmchen) |
| `canteen_stage1.png`, `canteen_stage2.png` | ein Raum in zwei Meilenstein-Stufen (Holzbänke → Bistrotische, Holztresen → Kupfertöpfe auf Steintresen) |
| `tutorial_de_907.png` | Tutorial-Sprechblase der Dachs-Leitung, deutsche UI |
| `characters_4dirs.png` | Waschbär, Wiesel, Koch (Bär) und weitere Personal-Spezies in S / E / N / W |
| `contact_sheet.png` | Kontaktbogen aller 134 Atlas-Sprites (`npm run art:sheet`) |
| `cover_1920x1080.png` (+ 800×1200, 800×800) | Cover-Entwurf |
| `spike_20s.mp4` | 20-s-Video, deterministisch im Capture-Modus aufgenommen (30 fps, x264, ohne Ton) |
| `docs/competition/*` | Wettbewerbs-Cover und Gameplay-Screenshots als Vergleich |

## Wie die Grafik entsteht
- **Stil als Code:** `tools/art/kit.ts` setzt den Style Guide in eine Funktion `shape()` um. Sie zeichnet Kontur in der 900er-Stufe, Grundton, einen Schattenkeil unten rechts und genau eine Highlight-Kante oben links. Alle 134 Sprites und 29 UI-Icons nutzen nur diese Funktion und die Palette (`art/palette.ts`). Dadurch ist der Stil zwangsläufig einheitlich.
- **Build:** `npm run art:build` rastert die SVGs per Chromium in einen Atlas @1x (2048×256) und @2x (2048×1024), verlustfrei als WebP (87 KB und 205 KB). Kachelränder werden extrudiert, damit keine Nähte entstehen.
- **Figuren:** bestehen aus 14 Schichten (Füße, Beine, Körper, Streifen, Arme, Pfoten, Kopf, Blinzel-Overlay, Schwanz, Accessoire). Overall und Streifen sind Graustufen und werden per `tint` in den Sicherheitsfarben eingefärbt. Bewegung entsteht im Code: Laufzyklus, Bob, Squash & Stretch, Blinzeln, Idles (Kratzen, Gähnen, Strecken).
- **Tests:** `tests/unit/art.test.ts` prüft, dass es für jeden Entity-Typ ein eigenes Sprite gibt, dass nur Palettenfarben (plus dokumentierte Ableitungen) vorkommen, dass kein Text und kein reines Schwarz in den Sprites steckt.

## Messwerte
- Nacht: mittlere wahrgenommene Luminanz 0,476 (Tag 0,564). Schwelle ≥ 0,45 → bestanden.
- Atlas: 134 Sprites, @1x 87 KB / @2x 205 KB (WebP verlustfrei), je 1 Seite. Budget: ≤ 3 Seiten.
- Rascal-Höhe: 800×450 ≈ 30 px (Soll ≥ 22), 907×510 ≈ 33 px (Soll ≥ 24).
- Atlas-Palettentest: grün (`npm test`).

## Ehrliche Selbstkritik

**Was meiner Meinung nach trägt**
- Einheitlicher Stil ohne Ausreißer: gleiche Kontur, gleiche Lichtrichtung, Kontaktschatten überall.
- Die Szene ist sofort lesbar: Kantine, Zellen, Steg, Tor und Büro sind ohne Text unterscheidbar.
- Die Figuren sind eigenständig und nicht kindlich. Kleine, halb geschlossene Augen, Schmunzeln, eine hochgezogene Braue. Die Streifen sind farbige Sicherheitsstufen statt Schwarz-Weiß.
- Die Nacht bleibt hell genug und wirkt gemütlich statt düster.

**Schwächen, die ich selbst sehe**
1. **Figuren in der Seitenansicht:** Die Profilköpfe wirken etwas schnabelartig, Wiesel und Bulldogge sind im Profil schwer zu unterscheiden.
2. **Figurengröße:** Bei 800×450 sind Schlingel ~30 px hoch. Gesichter sind dann nur als Augenpunkte lesbar, die Mimik trägt erst ab Zoom 1,2.
3. **Wände:** Die seitlichen Wände sind nur graue Kappen ohne Struktur. Die Südwand verdeckt ~40 % der untersten Raumreihe, und Cutaway gibt es noch nicht.
4. **Boden:** Die Grasfläche ist großflächig gleichförmig. Mehr Variation (Erdflecken, Pfade-Abnutzung) würde helfen.
5. **Wasser:** Die Wellen sind sehr dezent, das Meer wirkt dadurch etwas flach.
6. **Cover:** Es ist ein erster Entwurf aus Spiel-Vektoren. Die Komposition stimmt, aber den Figuren fehlt die Detailtiefe echter Key Art. Hier ist das Risiko am größten. Option (b) aus Brief §13.3 (Cover extern) halte ich für realistisch.
7. **Licht:** Die Nachtlichter sind große weiche Kreise ohne Fenster-Lichtkegel.

## Blindvergleich (Brief §13.2)
Ein frischer Sub-Agent bekam 6 unbeschriftete Bilder (824×425): 3 eigene (Tag 1280, Nacht 1280, Kantinen-Zoom Stufe 2) und 3 Gameplay-Bilder vom Wettbewerb (Bunker Empire, Leek Factory, Prison Life). Die Plattform-Leiste war abgeschnitten. Dateien: `qa/blind/`. Der Schlüssel liegt nicht im Repo, um spätere Läufe nicht zu verfälschen.

| Rang (poliert → billig) | Bild | tatsächlich |
|---|---|---|
| 1 | F | Bunker Empire |
| 2 | C | **unsere Nacht** |
| 3 | B | **unser Tag** |
| 4 | A | **unser Kantinen-Zoom** |
| 5 | D | Prison Life |
| 6 | E | Leek Factory |

**Die drei billigsten laut Gutachter: E, D, A.** Darunter ist 1 eigenes Bild, also bestanden (Schwelle: ≥ 2 eigene = nicht bestanden).

**Einschränkung:** A wurde laut Gutachter nur wegen des Bildausschnitts genannt („bottom toolbar is cut off … its art is as good as B and C"). Den Ausschnitt habe ich beim Skalieren erzeugt. Das ist also kein reiner Grafikbefund, aber auch kein Freispruch. Gezoomt sieht man, wie einfach die Sprites sind.

**Konkrete Kritik aus dem Vergleich, übernommen für M3:**
- Die Topbar ist eine lange, fast leere Pille mit sehr kleinen, unbeschrifteten Icons. Das ist verschwendeter Platz und schwer lesbar. → Fluss-Leiste in M3 kompakter, mit Zahlen und einem Titel-Label, gezielt hervorgehobenem Engpass und größeren Icons.
- Die Karte wirkt außerhalb der Gebäude „sparse and flat". → mehr Bodenvariation und Deko-Cluster.
- **Altersanmutung:** Der Gutachter liest unseren Look als „borderline … all ages rather than strictly under 12". Das ist das größte Risiko gegenüber dem Kriterium „nicht kindlich" (Brief §2.1). Gegenmittel ab M3: Bürokratie-Satire sichtbar machen (Aktenvermerke, Stempel, Formulare im UI), etwas gedecktere Gras- und Holztöne, UI-Typografie stärker Inter statt Fredoka.
