# Wettbewerb – Notizen

Stand: 04.11.2026. Die Daten stammen aus dem `__NEXT_DATA__`-JSON der CrazyGames-Seiten (per curl), aus og:image und aus eigenen Screenshots (Playwright, Headless-Chromium mit SwiftShader, 1280×720, ausgeloggt, Sprache EN).

**Zweck:** Die Bilder dienen nur als Qualitätsmaßstab. **Nichts davon wird kopiert**, weder Motive noch Logos, Figuren, Farben oder UI-Elemente.

## Dateien in diesem Ordner

| Datei | Inhalt |
|---|---|
| `<slug>_cover.jpg` | 16:9-Cover, 1200×675, von `imgs.crazygames.com` (og:image-Pfad) |
| `<slug>_page.png` | Spielseite bei 1280×720, ca. 6 s nach dem Laden |
| `<slug>_gameplay.png` | Ausschnitt des Spiel-iframes nach 50–135 s Wartezeit (beim zweiten Durchlauf mit einem normalen Klick ins Spiel) |
| `tycoon-tag_page.png` | Tag-Seite „Tycoon“ bei 1280×720 |
| `tycoon-tag/NN_<slug>_cover.jpg` | Cover der Top 15 der Tag-Seite (640×360) |

**Live-Gameplay:** Alle 5 Spiele haben headless gerendert, auch die 3 Unity-WebGL-Spiele (WebGL 2.0 über SwiftShader). Unity braucht dafür 60–120 s Ladezeit. Die Gameplay-Bilder zeigen jeweils den Anfang (Tutorial bzw. Tag 1). Späte Spielstände sind nicht zu sehen. Cookie-Banner sind ausgeloggt in diesem Lauf nicht erschienen. Geklickt wurde nichts außer einmal ins Spiel. Die Seiten-Screenshots enthalten Fremdwerbung (Amazon u. a.). Sie gehört nicht zum Spiel.

---

## 1. Prison Life

- **URL:** https://www.crazygames.com/game/prison-life-aur
- **Entwickler:** Supercent · **Technik:** Unity 2022 · hinzugefügt 07.10.2025, letztes großes Update 19.11.2025
- **Bewertung:** 9,0 / 10 · 56.209 👍 / 5.645 👎 · ca. 2,23 Mio. Plays (laut Tag-Seite)
- **Kategorie / Tags:** Simulation · Mobile, Tycoon, Management, Stickman, Casual
- **Beschreibung (EN, gekürzt):** „Detailed prison management simulation … From intake and infrastructure upgrades to staff oversight and resource management … turn a basic prison into a thriving empire." Features: Gefangene versorgen (Essen, Hygiene, Freizeit), Einrichtungen (Gym, Mine, Küche, Besuchsraum), Rang-Aufstiege
- **Steuerung:** Linke Maustaste für die UI, WASD oder Pfeiltasten zum Laufen
- **Plattformen:** Desktop + Android (androidFriendly), nicht iOS-friendly · Ausrichtung PORTRAIT · Cloud-Save
- **Cover:** https://imgs.crazygames.com/prison-life-aur_16x9/20250904093733/prison-life-aur_16x9-cover (auch 1x1/2x3)

**Visueller Stil**
- *Perspektive:* 3D, Low-Poly, feste schräge Draufsicht (ca. 50°). Die Figur läuft frei herum, typisches „Arcade-Idle“ mit Stapeln tragen und auf Felder treten.
- *Palette:* Lachs/Pfirsich-Wände, Mint-Rasen, graue Straßen, Gelb-Grün-Bäume. Hell, freundlich, niedriger Kontrast. Das Cover hat dagegen ein knalliges Blau mit Strahlenkranz.
- *UI:* sehr wenig. Oben ein Sterne-Fortschrittsbalken, rechts oben eine Geld-Pille mit Icon, dazu eine Tutorial-Hand mit Wisch-Geste (∞). Weiße Pillen mit dunklem Text.
- *Lesbarkeit:* gut durch große, ruhige Flächen. Die Figuren sind sehr klein (gesichtslose Stickmen), Rollen erkennt man nur an der Uniformfarbe. Im Spiel steht das Schild „Alcatraz Prison“.
- *Cover:* zwei gesichtslose 3D-Stickmen (blauer Polizist, Häftling in Orange mit gestreifter Mütze und Handschellen) neben einem dicken gelb-blauen Logo mit schwarzer Kontur. Wirkt clean und mobile-typisch.

## 2. Prison Break: Architect Tycoon

- **URL:** https://www.crazygames.com/game/prison-break-architect-tycoon
- **Entwickler:** Square Dino · **Technik:** Unity 2022 · hinzugefügt 23.07.2024, Update 12.12.2024
- **Bewertung:** 8,6 / 10 · 15.912 👍 / 1.906 👎
- **Kategorie / Tags:** Action · Mobile, 3D, Battle, Defense, Survival, Stickman
- **Beschreibung (EN, gekürzt):** „You are the main prison guard tasked with securing the prison … Build inmate cells, reinforce doors, install surveillance cameras, and recruit additional guards." Ablauf in „Tagen“. Jeder Tag endet mit einer Ausbruchs-„Battle“.
- **Steuerung:** WASD oder Pfeiltasten, alternativ linke Maustaste halten und ziehen
- **Plattformen:** Desktop + Android, nicht iOS-friendly · PORTRAIT · Google-Play-Version vorhanden (`prisonbreak.action.police`)
- **Cover:** https://imgs.crazygames.com/prison-break-architect-tycoon_16x9/20260220034430/prison-break-architect-tycoon_16x9-cover

**Visueller Stil**
- *Perspektive:* 3D, Low-Poly, steile Draufsicht. Es gibt Bodenmarkierungen („BATTLE AREA“ gestrichelt).
- *Palette:* Rosa/Lachs-Böden, blaue Gitter, weißblauer „Schnee“-Hintergrund. Pastellig und wenig Hierarchie.
- *UI:* „Day 1“-Fortschrittsbalken oben, kleine Icon-Buttons links (LVL, „Knock Prisoner“), Zahnrad oben links. Die Schrift ist klein, die Elemente wirken verstreut.
- *Lesbarkeit:* mäßig. Die Figur ist winzig und die Flächen sind gleichförmig.
- *Cover:* 2D-Illustration im Roblox-artigen Blockfiguren-Stil. Ein brüllender Häftling in Schwarz-Weiß-Streifen mit Mütze rennt, ein Wärter mit Schlagstock folgt, alles in rot-orangem Alarmlicht. Diagonale Komposition, dicke Konturen, starke Mimik. Das Cover hat **kein Logo**. Es ist stilistisch deutlich hochwertiger als das Spiel selbst.

## 3. Cop Simulator: My Prison 3D

- **URL:** https://www.crazygames.com/game/cop-simulator-my-prison-3d
- **Entwickler:** PRIME · **Technik:** Unity 2022 · hinzugefügt 26.08.2026
- **Bewertung:** 9,0 / 10 · 3.551 👍 / 383 👎
- **Kategorie / Tags:** Simulation · Mobile, Tycoon, Management, Police, Mission
- **Beschreibung (EN, gekürzt):** „Take charge of your own correctional facility … Build new prison blocks, hire staff, maintain order, and grow your income." Features: Wärter einstellen, Gefängnis-Industrie, Zellen, Kantine, Werkstätten
- **Steuerung:** PC mit WASD laufen und Mausklick auf Gebäude, Insassen und Menüs. Mobile mit On-Screen-Joystick unten links und Tippen.
- **Plattformen:** Desktop + Android, nicht iOS-friendly · PORTRAIT · Google-Play-Version vorhanden (`com.amazegames.police.department`)
- **Cover:** https://imgs.crazygames.com/cop-simulator-my-prison-3d_16x9/20260622053715/cop-simulator-my-prison-3d_16x9-cover

**Visueller Stil**
- *Perspektive:* 3D, schräge Draufsicht, Arcade-Idle (Figur läuft und kauft Felder).
- *Palette:* gelb-cremefarbenes Schachbrett-Boden, kräftiges Blau an Wänden und Spinden. Grelle Primärfarben-Flächen.
- *UI:* großes Banner „BUY BUS“ in dunkler Leiste, Fortschritt „0/9“ mit Abzeichen, Geldzähler rechts oben, Musik-Icon. Wirkt funktional und eher roh.
- *Lesbarkeit:* Die Texte sind groß und klar. Die Szene ist am Anfang leer und wirkt wie ein Platzhalter.
- *Cover:* glänzender 3D-Render im Ton/Spielzeug-Look. Ein maskierter Räuber in Orange wird von einem blauen Polizisten abgeführt, dahinter Zellengitter. Das Logo unten links hat Polizeiabzeichen, Handschellen und Schlüssel als Ornamente. Das Cover ist sehr poliert, das Spiel deutlich weniger.

## 4. Leek Factory Tycoon

- **URL:** https://www.crazygames.com/game/leek-factory-tycoon
- **Entwickler:** Leek & Ribs Games · **Technik:** HTML5 · hinzugefügt 28.09.2023, Update 22.08.2025 · Label „Originals“
- **Bewertung:** 9,4 / 10 · 220.969 👍 / 18.421 👎
- **Kategorie / Tags:** Clicker · Food, Top-Down, Deep progress, Business, Restaurant, 2D, Incremental, Mouse, Management, Idle
- **Beschreibung (EN, gekürzt):** „Idle game where you will be managing your dream Leek Factory … Build an extensive conveyor belt system to transport and process your leeks … Even when you're offline, your restaurant stays open." Mit globalem Leaderboard
- **Steuerung:** Linke Maustaste
- **Plattformen:** Auf CrazyGames weder android- noch iOS-friendly, nur Desktop und Chromebook. Eigene Apps gibt es bei Google Play und im App Store.
- **Cover:** https://imgs.crazygames.com/leek-factory-tycoon_16x9/20260330040926/leek-factory-tycoon_16x9-cover

**Visueller Stil**
- *Perspektive:* 2D, streng top-down. Fabrikflächen sind mit Förderbändern verbunden, daneben eine Restaurant-/Straßenfläche.
- *Palette:* dunkles Navy und Waldgrün in Holzrahmen-Panels, gelbe Gestrichelt-Kanten an Bändern, Gold-Coins. Gesättigt, aber dunkel gerahmt.
- *UI:* sehr dicht. Kopfzeile mit „Revenue / World Rank / Tips“, Preislisten mit Coin-Icons, große Zahlen mit Einheiten (K, M, B, a, b), Prestige-Button, Maskottchen-Koch mit Schnurrbart in einer Sprechblase. Weiße Ziffern mit dunkler Kontur sind gut lesbar.
- *Lesbarkeit:* Die Zahlen sind sehr gut lesbar. Die Spielfläche ist bei Spielstart voll und wirkt unruhig.
- *Cover:* weichgezeichnete Spielszene im Hintergrund, dreifarbiges gestapeltes Logo (Chrom-Silber, Blau, Orange-Gold) mit starker Abschrägung, dicker Kontur und Glanz. Das ist die typische „Booster“-Optik.

## 5. Bunker Empire

- **URL:** https://www.crazygames.com/game/bunker-empire
- **Entwickler:** phillystudios · **Technik:** HTML5 · hinzugefügt 27.10.2026, Update 02.11.2026 · Label „updated“
- **Bewertung:** 9,0 / 10 · 423 👍 / 47 👎 (sehr neu)
- **Kategorie / Tags:** Clicker · Mobile, Incremental, Mouse, Casual, Robot, Idle
- **Beschreibung (EN):** „Idle factory game where you turn a single scrap crusher into an underground production network. Work your first machine by hand, hire robots to keep it running, and dig down to iron, copper, silver, and gold." Dazu Workshops, Aufzüge und der Prestige-Reset „Core Reboot“
- **Steuerung:** Desktop: linke Maustaste zum Auswählen und Kaufen, „Work“-Button halten, Ziehen zum Bewegen, Mausrad zum Zoomen. Mobile: Tippen, Halten, Ziehen, Pinch-Zoom.
- **Plattformen:** Desktop + Android + iOS · Ausrichtung BOTH
- **Cover:** https://imgs.crazygames.com/bunker-empire_16x9/20261013024255/bunker-empire_16x9-cover.png

**Visueller Stil**
- *Perspektive:* 2D-Seitenschnitt (Querschnitt) einer Bunkeranlage unter einer zerstörten Stadt. Das Genre erinnert an Idle-Miner/Fallout-Shelter-artige Ansichten.
- *Palette:* gedeckt, Rost, Braun und Oliv, dazu ein Abendrot-Himmel als einziger Farbakzent. Akzente in Gold („GOT IT“) und Türkis (Auswahlrahmen). Sehr kohärent.
- *UI:* schmale, kondensierte Schablonen-Schrift, Warnstreifen-Leiste, Vorarbeiter-Porträt mit Dialogtext, dunkle Metall-Panels, „BUILD ROOM $900“-Plakette in der Welt. Die UI ist thematisch voll integriert.
- *Lesbarkeit:* gut. Klare Hierarchie, und das Tutorial zeigt genau eine Aktion.
- *Cover:* sehr reduziert. Dunkler Oliv-Grund, große cremefarbene, verwitterte Kondensschrift, ein rostiger Roboter mit Brecher vor einem Mond-Kreis. Plakatartig und hebt sich von den lauten Covern ab.

---

## Tag-Seite „Tycoon“ – Top 15

Quelle: `topGames` im Seiten-JSON von https://www.crazygames.com/t/tycoon (Sortierung „Top games“, ausgeloggt, 04.11.2026). Plays und Likes laut Seitendaten. Die Reihenfolge im gerenderten Grid weicht leicht ab (siehe `tycoon-tag_page.png`), weil CrazyGames personalisiert oder rotiert.

| # | Titel | Plays / Likes | Cover-Stil (eine Zeile) |
|---|---|---|---|
| 1 | Papa's Cheeseria | 3,91 Mio. / 127 k | 2D-Flash-Vektor: riesiges rot-rosa Schreibschrift-Logo mit Cremerand auf Gelb, Toast-Sandwiches als Held |
| 2 | Hay Factory Tycoon | 24 k / 474 | Gemalte Illustration: Fabrikhalle mit Heuberg und Roboterarmen, Blau-Orange-Kontrast, gelbes Konturlogo oben rechts |
| 3 | Idle Inventor | 2,50 Mio. / 45 k | 3D-Low-Poly-Spielszene (Stadt mit Autos), 3D-Logo mit Figuren oben rechts |
| 4 | Papa's Bakeria | 2,93 Mio. / 83 k | 2D-Vektor: rotes Karomuster, Kuchenstück als Held, braun-rosa Schreibschrift-Logo |
| 5 | Gas Station | 1,60 Mio. / 29 k | Glänzender 3D-Spielzeug-Render: Tankwart betankt ein grünes Auto, rot-weißes Logo mit blauer Kontur, sonnig |
| 6 | Papa's Freezeria | 5,35 Mio. / 137 k | 2D-Vektor: Strandszene mit Laden, rotes Schreibschrift-Logo mit Kirsche, pastellig |
| 7 | Papa's Hot Doggeria | 1,67 Mio. / 50 k | 2D-Vektor: Stadion-Hintergrund, rot-gelbes Logo mit Würstchen-Schnörkel |
| 8 | Trash Tycoon | 20 k / 460 | Pixel-Art: Müllberg, Müllwagen, Pixel-Figur, goldenes Pixelschrift-Logo |
| 9 | Car Seller: Life Simulator | 170 k / 3,3 k | Glatte, halbrealistische Cartoon-Illustration als Vorher/Nachher-Split (Rostauto „$500“ → rotes Auto), Pfeil, Geld-Logo |
| 10 | Sunrise Mall Tycoon | 9 k / 233 | Glatte Illustration: grinsender Anzugträger mit Geldfächer vor einer Mall, buntes Logo |
| 11 | Canteen Rush | 14 k / 381 | Echte Spielszene in Pixel-Art top-down mit vielen Mini-Figuren, kleines Logo oben |
| 12 | Prison Life | 2,23 Mio. / 56 k | 3D-Stickmen (Polizist und Häftling) auf blauem Strahlenkranz, dickes gelb-blaues Logo |
| 13 | Little Sushi Port | 9 k / 285 | Illustriertes Otter-Maskottchen mit Fischstapel, Meer, Holzschild-Logo |
| 14 | Papa's Pancakeria | 1,86 Mio. / 44 k | 2D-Vektor: Waldlandschaft, Pfannkuchenstapel, kleines Logo |
| 15 | Trash Master | 861 k / 13 k | 3D-Spielzeug-Render: Müllwagen und Arbeiter, grün-violettes Konturlogo unten rechts |

Mobile-Top-10 der Seite: Prison Life, Canteen Rush, Trash Tycoon, Car Seller, Trash Master, Busy Bites Tycoon, Hay Factory Tycoon, My Perfect Theme Park, Papa's Freezeria, Little Sushi Port.

---

## Was die Top-Tycoons „professionell“ aussehen lässt

1. **Ein Fokus pro Cover.** Ein Held (Figur mit starker Mimik) oder ein Held-Objekt (Sandwich, Heuberg, Müllwagen) füllt 40–60 % des Bildes. Daneben steht ein großes Logo mit 25–40 % der Bildbreite. Beides ist bei Thumbnail-Größe (ca. 200 px breit, siehe `tycoon-tag_page.png`) noch lesbar.
2. **Logo-Handwerk.** Dicke dunkle Außenkontur, innen ein Verlauf oder eine Abschrägung, ein Schlagschatten und oft ein thematisches Ornament (Kirsche, Abzeichen, Handschellen). Es gibt nie dünne Schrift ohne Kontur.
3. **Einheitlicher Stil je Bild.** Jedes gute Cover bleibt in einer Technik: nur Vektor, nur 3D-Render, nur Pixel oder nur Malerei. Gemischte Auflösungen oder Stile kommen bei den Top 15 nicht vor.
4. **Kontrast über Komplementärfarben.** Blau gegen Orange (Hay Factory, Prison Life, Cop Sim), Rot gegen Gelb (Papa's). Der Hintergrund ist ruhiger oder unscharf, damit Figur und Logo vorne stehen.
5. **Ein eigenes Thema statt Generik.** Die Top-Cover ohne Riesen-Reichweite (Bunker Empire, Little Sushi Port, Canteen Rush) fallen durch einen eigenen, klaren Look auf: gedeckte Plakat-Ästhetik, Maskottchen oder ehrliche Spielszene.
6. **Ruhiges Gameplay-HUD.** Bei den Spielen gibt es wenige Elemente, meist eine Geld-Pille oben rechts und Fortschritt oben mittig. Ziffern sind groß und haben eine Kontur. Das Tutorial zeigt genau eine Aktion (Hand-Zeiger oder Dialog mit Porträt). Bunker Empire zeigt am besten, wie eine UI das Thema trägt (Schrift, Warnstreifen, Metall-Panels).
7. **Klare Figur-Boden-Trennung.** Böden sind hell und ruhig, Figuren und Interaktionsziele sind dunkler oder gesättigter. Kaufbare Felder und Zonen sind deutlich markiert.
8. [Einschätzung] **Cover und Spiel klaffen oft auseinander.** Bei den drei Unity-Gefängnisspielen ist das Cover viel polierter als das Spiel. Das ist eine Chance für uns: Ein Spiel, das so gut aussieht wie sein Cover, hebt sich ab. Auch die CrazyGames-Regel „Name und Bild müssen zum Spiel passen“ spricht dafür.

## Was wir NICHT nachahmen dürfen

- **3D-Stickmen, gesichtslose Kapselfiguren** (Prison Life, Prison Break: Architect Tycoon) und Roblox-artige Blockfiguren (Prison-Break-Cover)
- **Das Standardmotiv der Gefängnisspiele:** blauer Polizist führt einen Häftling in Orange mit Handschellen ab (Prison Life **und** Cop Simulator). Dazu kommt der Ausbrecher in Schwarz-Weiß-Streifen mit Wollmütze oder Augenmaske (Prison Break, Cop Sim). Alle drei Prison-Cover nutzen diese Tropen. Wir brauchen ein eigenes Motiv, z. B. Bürokratie-Stempel, Insel und Rascals.
- **„Alcatraz“-Bezüge** und Torbögen mit Schriftzug (Prison Life)
- **Arcade-Idle-Muster:** Figur läuft über Kauf-Felder („BUY BUS“-Banner, Schachbrett-Boden in Gelb und Blau wie bei Cop Sim)
- **Booster-Logo und Optik von Leek Factory:** gestapeltes Chrom-, Blau- und Gold-Logo mit Abschrägung, leuchtende Förderbänder, Holzrahmen-Preislisten, Schnurrbart-Koch als Maskottchen
- **Plakatstil von Bunker Empire:** cremefarbene, verwitterte Kondensschrift auf dunklem Oliv, Warnstreifen und Vorarbeiter-Dialogbox in genau dieser Form
- **Papa's-Look:** Schreibschrift-Logo mit Cremerand und Bannerform, Flash-Vektor-Food-Shots
- **Grelle Primärfarben-Flächen und Pastell-Babytöne** (Cop Sim, Prison Break im Spiel). Das widerspricht auch BRIEF 2.1 (Anti-Kinderspiel).
- [Einschätzung] **Glatter, hyperdetaillierter Illustrations-Look** wie bei Car Seller, Sunrise Mall und Hay Factory. Er wirkt austauschbar und passt nicht zu unserem SVG-Flachstil.
- Allgemein, laut BRIEF 7.3: Prison-Architect-Look (runde Köpfe, Punktaugen), Blueprint-Optik und Fremdgrafiken
