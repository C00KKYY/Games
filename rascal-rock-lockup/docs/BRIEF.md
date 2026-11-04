# Master-Prompt: Gefängnis-Bau-Tycoon für CrazyGames („Rascal Rock Lockup“)

> **So benutzt du diesen Prompt:** Kopiere alles ab der nächsten Linie in eine neue Claude-Code-Session. Die Session läuft in einem Cloud-Container (Linux, Node, Playwright + Chromium, Webzugang über einen Proxy). Der Prompt richtet sich an den Agenten. Der Auftraggeber ist der Mensch, der die Session gestartet hat. An drei Stellen (G1, G2, G3) musst du anhalten und auf seine Freigabe warten.

---

## 0. Rolle, Ziel und Qualitätsanspruch

Du bist ein Indie-Studio in einer Person: Game Designer, Technical Artist, Engine- und Frontend-Entwickler, Sounddesigner und QA.

**Deine Aufgabe:** ein vollständiges, einreichungsfertiges HTML5-Spiel für CrazyGames, und zwar einen Gefängnis-Bau- und Management-Tycoon.

- **Genre-Referenzen:**
  - Idle-Factory-Tycoons wie *Leek Factory Tycoon*: erst selbst Hand anlegen, dann automatisieren, dann skalieren.
  - Bau- und Management-Sims wie *Prison Architect*: Das Layout zählt.
- **Originalität:** Das Spiel ist eigenständig. Name, Grafik, Begriffe, UI und die Kombination der Mechaniken sind eigene Arbeit. Es ist kein Klon.

### 0.1 Kennzeichnung in diesem Prompt

| Kennzeichen | Bedeutung |
|---|---|
| **[Fakt]** | Steht in offizieller CrazyGames-, PEGI- oder Bibliotheks-Doku. Die URL ist angegeben. |
| **[Einschätzung]** | Schlussfolgerung aus Recherche oder Erfahrung. Plausibel, aber nicht offiziell belegt. |
| **[Vorgabe]** | Designentscheidung des Auftraggebers. Halte dich daran. |

Zahlen sind Startwerte. Du tunst sie nach den Regeln in Abschnitt 4 und begründest jede Abweichung in `docs/BALANCE.md`.

### 0.2 Warum der Anspruch so hoch ist

- **Ablehnung von Ember Night.** Das letzte Spiel des Auftraggebers war ein Survivors-like in Plain JS mit Canvas 2D. CrazyGames hat es abgelehnt mit: *„The overall quality of the game does not yet meet the expectations of our platform."*
- **[Einschätzung]** Das ist mit hoher Wahrscheinlichkeit die allgemeine Ablehnung aus dem manuellen QA-Check vor dem Basic Launch. Andere Entwickler zitieren denselben Wortlaut ohne weitere Details.
  - itch.io-Thread: https://itch.io/t/7212067/help-crazygames-rejected-my-web-physics-puzzle-quality-does-not-meet-expectations-looking-for-brutal-honest-feedback-on-what-im-missing
- **[Fakt]** Das QA-Team spielt jede Einreichung und prüft, ob sie flüssig läuft, die Qualitätsstandards erfüllt und Spaß macht (https://docs.crazygames.com/faq/).
- **[Fakt]** Wer wiederholt nicht konforme Spiele einreicht, kann für künftige Einreichungen eingeschränkt werden (https://docs.crazygames.com/requirements/gameplay/).
- **[Fakt]** Fallen die meisten Basic-Launch-Metriken unter den Benchmark, lässt sich das Spiel nur als neues Spiel mit deutlichen Verbesserungen erneut einreichen (https://docs.crazygames.com/).

**Es gibt keinen weiteren „Entwurf". Was eingereicht wird, muss fertig, poliert und hochwertig wirken.**

### 0.3 Was bei Ember Night schiefging

Diese Punkte dürfen sich nicht wiederholen. Die ersten fünf wurden am Build beobachtet. Die Reihenfolge der Gewichtung ist eine [Einschätzung].

1. **Schwarzer Bildschirm (~4,5 s).** Es gab keine Ladeanzeige, weil vor dem ersten Rendern auf das SDK gewartet wurde.
2. **Zwei Klicks und eine Textwand bis zum Spiel.** Der Weg war: Menü → PLAY → Story-Modal mit zwei Absätzen → „Let's go!".
3. **Leerer Einstieg.** Die ersten 30 Sekunden waren leer, dunkel und klein. Die „Wow"-Momente kamen erst nach Minuten.
4. **Programmer-Art.** Kreise, Radialverläufe und Blob-Gegner ohne Stil-Guide, ohne Lichtrichtung und ohne Kontaktschatten.
5. **Dünnes Audio.** Oszillator-Sounds, die nach Piepsen klangen.
6. **Klon-Eindruck.** Das Genre ist gesättigt, und das Spiel hatte keinen eigenen Haken.
7. **Falsche Sprachquelle.** Die Sprache kam aus `navigator.language` statt aus dem SDK-Locale.
8. **[Einschätzung] Unkontrollierte Qualität.** Der Agent hat seine Arbeit selbst abgenommen, und es gab kein menschliches Qualitäts-Gate. Das ändert sich jetzt (Abschnitt 13).

### 0.4 Definition von „fertig"

Alle vier Bedingungen müssen erfüllt sein:

1. Alle automatisierten Checks aus Abschnitt 12 sind grün, oder sie sind ehrlich als „offen" mit Ursache gemeldet.
2. Die drei menschlichen Gates G1, G2 und G3 (Abschnitt 13) hat der Auftraggeber schriftlich freigegeben.
3. Ein Reviewer, der 3 Minuten spielt, versteht das Spiel ohne zu lesen, hat Spaß und hält es für ein professionelles Produkt.
4. Nichts wirkt wie ein Platzhalter oder Prototyp.

### 0.5 Ziel-KPIs für den Basic Launch

**[Fakt]** Quellen: https://docs.crazygames.com/resources/basic-launch-metrics/ und https://docs.crazygames.com/resources/monetizing-midcore-idle/

| KPI | Zielwert | Vergleichswerte |
|---|---|---|
| Ø Spielzeit pro Sitzung | **10+ min** | Simulation 14 min, Strategie 17 min |
| Day-1-Retention | **10–15 %** | Plattformschnitt 6,7 % |
| Conversion (Anteil, der ≥ 1 min spielt) | **80 %+** | – |
| Ladezeit | **< 10 s** | – |
| Build-Größe | **< 20 MB** | Dein Ziel: **≤ 8 MB gesamt, ≤ 3 MB bis zum ersten `gameplayStart`** |

---

## 1. Arbeitsweise, Startschritte und Prioritäten

### 1.1 Schritt 0: Prompt sichern und Fortschritt führen

- **Prompt sichern.** Speichere diesen Prompt wörtlich als `docs/BRIEF.md`. Lies vor jedem Meilenstein den passenden Abschnitt neu.
- **`docs/PROGRESS.md` führen.** Die Datei enthält:
  - aktueller Meilenstein
  - erledigte und offene Punkte
  - bekannte Bugs
  - offene Abweichungen vom Brief
  - letzte Testergebnisse
  - die nächsten 3 konkreten Schritte
  - Status der Gates (G1/G2/G3)
- **Aktualisieren** vor jedem Commit.
- **Neue Session:** Lies zuerst `docs/PROGRESS.md`, `docs/GDD.md` und die betroffenen Abschnitte von `docs/BRIEF.md` und setze dort fort. Lies nie den gesamten Code auf einmal ein.

### 1.2 Arbeitsordner und Git

- Lege `/home/user/Games/rascal-rock-lockup/` neu an. Falls sich der Titel ändert, wird der Ordner entsprechend benannt.
- **Eigenes Repository:** Führe `git init` in diesem Ordner aus. Lege keinen Branch im Eltern-Repository an.
- `/home/user/Games` ist bereits ein Git-Repository mit `glutnacht/`. Verändere nichts außerhalb deines Projektordners: kein `git add -A` im Eltern-Ordner und kein Push ohne ausdrücklichen Auftrag.
- Committe nach jedem Meilenstein und nach jedem größeren Zwischenschritt.

### 1.3 Regeln neu prüfen

CrazyGames ändert seine Dokumentation. Lies zu Beginn diese Seiten per WebFetch und halte Abweichungen zu diesem Prompt in `docs/RULES_CHECK.md` fest. Bei Widerspruch gilt die aktuelle offizielle Doku.

- https://docs.crazygames.com/requirements/intro/
- https://docs.crazygames.com/requirements/technical/
- https://docs.crazygames.com/requirements/gameplay/
- https://docs.crazygames.com/requirements/quality/
- https://docs.crazygames.com/requirements/ads/
- https://docs.crazygames.com/requirements/game-covers/
- https://docs.crazygames.com/requirements/account-integration/
- https://docs.crazygames.com/sdk/intro/
- https://docs.crazygames.com/sdk/game/
- https://docs.crazygames.com/sdk/data/
- https://docs.crazygames.com/sdk/video-ads/
- https://docs.crazygames.com/resources/basic-launch-metrics/
- https://docs.crazygames.com/resources/getting-to-the-first-frame/
- https://docs.crazygames.com/resources/monetizing-midcore-idle/
- https://docs.crazygames.com/resources/monetizing-clicker/
- https://docs.crazygames.com/resources/html5/common-fixes/
- https://docs.crazygames.com/resources/crazygames-app/
- https://docs.crazygames.com/resources/mouse-control/
- https://docs.crazygames.com/faq/
- PixiJS-v8-Migrationsleitfaden: https://pixijs.com/8.x/guides/migrations/v8 (siehe 9.6)

### 1.4 Namensprüfung

- Prüfe den Titel und die Alternativen aus 2.1 per Websuche:
  - CrazyGames-Suche
  - itch.io
  - Steam
  - Google Play und App Store
  - EUIPO und USPTO
- Die Markenregister sind JavaScript-lastig und wahrscheinlich nicht per WebFetch erreichbar. Was du nicht prüfen kannst, markierst du in `docs/NAME_CHECK.md` als „nicht geprüft – Auftraggeber prüft manuell".
- Ist ein Name belegt, nimm die nächste freie Alternative.

### 1.5 Wettbewerb ansehen

Lege nach `docs/competition/` Bilder und Notizen ab. Sie dienen nur als Qualitätsmaßstab: **Nichts davon wird kopiert.**

- **Spielseiten:**
  - https://www.crazygames.com/game/prison-life-aur
  - https://www.crazygames.com/game/prison-break-architect-tycoon
  - https://www.crazygames.com/game/cop-simulator-my-prison-3d
  - https://www.crazygames.com/game/leek-factory-tycoon
  - https://www.crazygames.com/game/bunker-empire
  - https://www.crazygames.com/t/tycoon
- **Live-Screenshots:** Unity-WebGL-Spiele rendern unter Headless-SwiftShader oft nicht. Nutze dann die Cover- und Seitenbilder der Spielseiten als Vergleichsstandard und notiere das.

### 1.6 Dokumente vor Code

Schreibe zuerst `docs/GDD.md`, eine verdichtete Fassung dieses Prompts mit deinen Entscheidungen. Danach folgen:
- `docs/STYLE_GUIDE.md` (Abschnitt 7)
- `tools/economy-sheet.ts`: eine geschlossene Rechnung, die Pacing-Tabelle, Einnahmenmix und Ruf-Quellen **vor** dem Bau der Simulation nachrechnet (Abschnitt 4)

### 1.7 Prioritäten (verbindlich)

| Stufe | Inhalt |
|---|---|
| **P0: ohne das keine Einreichung** | Standort 1 komplett poliert. Bauen mit Layout-Regeln. 4 Bedürfnisse mit Freischalt-Regel. Entlassung. Fluss-Leiste. Handarbeit → Automation mit 2 Abteilungsleitungen. Ereignisse Löffel-Tunnel und Essensschlacht. Klemmbrett. Projekttafel (12 Projekte). Inspektion. Versetzung. 6 Perks. Offline-Ertrag. Tagespost. Morgen-VIP. Speichern. EN und DE. Querformat für Desktop, Tablet und Mobil inkl. 800×450. BASIC-Build. |
| **P0b: zweites Kapitel, erst nach Freigabe G2** | Standort 2 als vollwertiges zweites Kapitel: neue Rascal-Spezies, Besuchsraum mit Besuchstag, Krankenzimmer, Flut-Modifikator, 2 weitere Abteilungsleitungen, 12 Projekte. |
| **P1: nur wenn alle P0-Tests grün sind und G2 freigegeben ist** | Hausregeln (4 Karten), Überraschungsinspektion. |
| **P2: Updates nach dem Launch** | Standorte 3–5, Spürnase und Schmuggel, weiteres Wetter, Talent-Show, Renovierungsmodus, Challenge-Tage, 7-Tage-Login-Kalender, Versorgungskiste, Hochformat-Layout, Banner. FULL-Build mit Ads (siehe 11.2). |

- **Feature-Freeze:** Du beginnst nichts aus P0b oder P1, bevor G2 freigegeben ist.
- **Lieber weniger Systeme mit mehr Juice.** [Fakt] Regelmäßige Updates gelten laut den Quality Guidelines als Pluspunkt (https://docs.crazygames.com/requirements/quality/). Das spätere Nachliefern ist also kein Nachteil.

### 1.8 Menschliche Gates

Du hältst dreimal an, lieferst Material und **wartest auf die schriftliche Freigabe** des Auftraggebers:

| Gate | Zeitpunkt | Was geprüft wird |
|---|---|---|
| **G1** | Art-Spike | Grafik |
| **G2** | erste 10 Minuten | Einstieg und Spielgefühl |
| **G3** | fertiger Build | Gesamtabnahme |

Details stehen in Abschnitt 13. Ohne Freigabe arbeitest du nicht am nächsten Meilenstein weiter.

### 1.9 Schwellenwerte nie lockern

- Die Schwellen in diesem Prompt dürfen **nicht** gelockert werden.
- Ist ein Test nach drei ernsthaften Versuchen nicht grün, meldest du ihn in `docs/QA_REPORT.md` als „offen" mit Ursache und fragst den Auftraggeber.
- Ein gefälschter oder abgeschwächter Test ist schlimmer als ein offener.

### 1.10 Sicherheit

- Entpacke Downloads in eigene, leere Ordner unter `vendor_raw/`.
- Führe niemals Skripte aus heruntergeladenen Paketen aus.
- Umgehe keine Bot-Sperren. Ein Beispiel: kenney.nl liefert 403.

---

## 2. Spielkonzept

### 2.1 Titel, Pitch, Ton, Zielgruppe, Rating

**Titel**
- **Arbeitstitel: Rascal Rock Lockup.**
- Alternativen:
  - *Lockup Lagoon*
  - *Mischief Island Lockup*
  - *Cellblock Critters*: Für diesen Namen fand eine Websuche keinen Treffer. [Einschätzung] Wegen „Critters" wirkt er aber kindlicher, deshalb ist er nur die letzte Wahl.
- **Verboten** sind:
  - „Prison Tycoon" (generisch, außerdem gibt es bereits eine Serie: https://www.mobygames.com/game/182406/)
  - jedes Namensmuster „Idle ___ Tycoon". [Fakt] Kolibri Games hält Marken auf mehrere „IDLE … TYCOON"-Namen, etwa IDLE FACTORY TYCOON (https://trademark.justia.com/owners/kolibri-games-gmbh-4099420). [Einschätzung, Sekundärquelle] Berichten zufolge ging Kolibri gegen das Muster vor. Deshalb meiden wir es ganz.
  - alles mit „Prison Architect", „Prison Life", „Prison Empire" oder „Prison Break"
- [Fakt] Generische Namen sind unzulässig. Die Doku nennt „Super Chess" als gutes und „Chess" als schlechtes Beispiel (https://docs.crazygames.com/requirements/quality/).

**Pitch (EN)**
> *„Build and run an island lockup for rascals jailed for absurd misdemeanours. Drag out rooms, untangle the paperwork, keep everyone fed, clean and busy, and reform your inmates until they're stamped out through the Parole Gate. Every release makes your lockup famous."*

**Ton: eine einzige Linie, trockene Bürokratie-Satire**
- Der Witz zielt auf Formulare, Stempel, Dienstvorschriften, absurde Inspektionen und pedantische Aktenvermerke.
- Kein Tollpatsch-Slapstick, keine Babysprache.
- Warm, nie grausam, nie zynisch gegenüber echten Gefängnissen.
- Zielgruppe: 13–35 Jahre.

**Anti-Kinderspiel-Kriterien (prüfbar)**

[Fakt] „Content is targeted for kids" ist ein Ablehnungsgrund (https://docs.crazygames.com/faq/). Kinderspiele landen auf kids.crazygames.com, dort ohne Monetarisierung (https://docs.crazygames.com/requirements/gameplay/). Deshalb gilt:

1. Der Humor ist Erwachsenen-Bürokratie, siehe oben.
2. Die Palette ist mittel gesättigt. Keine Primärfarb-Flächen über 20 % des Bildes, keine Pastell-Babytöne.
3. Die Augen sind höchstens 25 % der Kopfhöhe groß, keine Kulleraugen. Das Kopf-Körper-Verhältnis liegt bei 1:2 bis 1:2,5, die Gliedmaßen sind schlanker, die Mimik ist erwachsen: halb geschlossene Lider, Schmunzeln, hochgezogene Braue.
4. Die UI-Typografie ist erwachsen: Inter für Fließtext, Fredoka nur für Zahlen und Titel.
5. Keine Tags „Animal", „Kids" oder „Cute". Stattdessen: Tycoon, Management, Building, Simulation, Strategy.
6. Die Frage „Würde ein 16-Jähriger das vor Freunden spielen?" muss bei G1 und G3 mit Ja beantwortet werden. Außerdem fragt der Auftraggeber bei G3 möglichst 5 Personen zwischen 13 und 35 anhand des Covers: „Für welches Alter ist das?" Liegen die Antworten unter 12, werden Name oder Cover geändert.

**Rating**
- [Fakt] Das Spiel muss PEGI 12 erfüllen, die Zielgruppe ist 13+ (https://docs.crazygames.com/requirements/gameplay/).
- Inhaltlich bleiben wir deutlich darunter, damit kein Grenzfall entsteht.

**„Straftaten" sind harmlose Gags**
- Beispiele: Kuchen-Diebstahl, Hupen nach der Sperrstunde, Socken-Schmuggel, Käsefälschung, Schlafen in der Hängematte des Bürgermeisters, Formular 27b in falscher Farbe ausgefüllt.
- Jeder Rascal bekommt eine prozedural erzeugte Strafakte in Aktenvermerk-Optik: Spezies + Adjektiv + Gag-Delikt + Aktenzeichen, in EN und DE.

### 2.2 Die vier Alleinstellungsmerkmale

USP 1 bis 3 müssen in den ersten 2 Minuten sichtbar sein, USP 4 bis 3:30.

1. **Resozialisieren und Entlassen als Kern-Ökonomie.**
   - Das „Produkt" der Fabrik ist ein resozialisierter Rascal. Entlassungen sind die größte Einnahme- und Ruf-Quelle (Ziel: 40–50 % der Einnahmen) und der große Feiermoment: Stempel, Konfetti, Fanfare, der Rascal winkt beim Abfahren mit der Fähre.
   - Die erste Entlassung passiert im Tutorial nach etwa 60 s.
2. **Bauen, bei dem das Layout zählt.**
   - Der Spieler zieht ein Rechteck. Ein Bautrupp rennt hin und errichtet Wände, Boden und Möbel in einer animierten Sequenz von 2–6 s.
   - Wege kosten echte Zeit, Nachbarschaften geben Boni, Lärm gibt Mali (Abschnitt 3.5).
   - So entsteht das Layout-Denken von Prison Architect, aber ohne Freihand-Wände und ohne dessen Komplexität.
3. **Sichtbare Pipeline.**
   - Die Insel hat eine feste Grundachse: Steg links, Freiheitstor rechts, ein vorgebauter Weg dazwischen. Der Fluss liest sich von links nach rechts.
   - Darüber liegt die immer sichtbare **Fluss-Leiste** im HUD: Fähre → Betten → Mahlzeiten → Duschen → Werkstatt → Unterricht → Tor. Jede Stufe zeigt ihre Kapazität pro Tag. Der Engpass leuchtet rot, ein Klick springt zum Raum.
   - [Fakt aus der Recherche] Das ist die Lektion von Kolibri (Idle Miner): die ganze Schleife auf einem Bildschirm, mit sichtbaren Engpässen (https://www.gamedeveloper.com/… siehe Recherche; Primärquelle: https://www.gameanalytics.com/blog/making-a-hit-idle-game-eight-lessons-from-kolibri-games).
4. **Schabernack statt Gewalt.** Kurze, aktive, komische Ereignisse, die der Spieler per Tap löst, etwa Löffel-Tunnel-Ausbruch und Essensschlacht.

**Dazu kommen:**
- der Bogen **Handarbeit → Automation** (Abschnitt 3.11; die DNA von Leek Factory, Bunker Empire und Hay Factory)
- der **Inspektionstag** mit Benotung
- die **Versetzung** als Prestige

### 2.3 Glossar

Alle Spielbegriffe sind eigene Begriffe. Nutze **niemals** Vokabular aus Prison Architect: Regime, Grants, Bureaucracy, Intelligence, Deployment, Reports-Tabs.

| Konzept | EN (Default) | DE |
|---|---|---|
| Insasse | Rascal | Schlingel |
| Spielerrolle | Warden | Leitung |
| Zielliste | Warden's Clipboard | Klemmbrett |
| Durchsatz-Anzeige | Flow Bar | Fluss-Leiste |
| Entlassung | Parole Gate / Release | Freiheitstor / Entlassung |
| Ereignisse | Shenanigans | Schabernack |
| Forschung | Project Board | Projekttafel |
| Automation | Supervisors | Abteilungsleitungen |
| Ruf | Reputation (Stars) | Ruf (Sterne) |
| Meta-Währung | Golden Keys | Goldene Schlüssel |
| Prestige | Transfer | Versetzung |
| Standort-Finale | Inspection Day | Inspektionstag |
| Tagesabrechnung | Daily Ledger | Tagesbilanz |
| Strategie-Karten (P1) | House Rules | Hausregeln |

### 2.4 Inhaltliche Leitplanken (PEGI und Terms)

**[Fakt] Grundlagen**
- PEGI 12 erlaubt unter anderem „non-realistic violence towards human-like characters" (https://pegi.info/what-do-the-labels-mean).
- Darstellung oder Erwähnung von Drogen, Alkohol oder Tabak führt laut PEGI immer zu 16 oder 18, Diskriminierung zu 18 (gleiche Quelle).
- Die CrazyGames Developer Terms §4.4 verbieten Inhalte, die „threatening, harassing, degrading, hateful", obszön oder anstößig gewalttätig sind (https://files.crazygames.com/documents/developer_terms_20250818.pdf).

**[Vorgabe] Daraus folgt:**
- **Schmuggelkram:** Löffel, Kazoos, Gummienten, Kuchen mit Feile. **Nie** Drogen, Alkohol, Zigaretten oder Waffen.
- **Ausgeschlossen:** Blut, realistische Waffen, Taser, Hinrichtung, Todestrakt, Einzelhaft, Folter und jede Bestrafungsmechanik.
- **Sicherheit ist nicht-tödlich:** Wachen haben Trillerpfeife und Kescher.
- **Rangeleien:** eine Staubwolke mit Sternchen und einem Comic-Geräusch. Danach sitzt der Rascal 3 s benommen da.
- **Keine echten** Länder, Ethnien, Gangs, Religionen, Politiker, Marken, Personen oder Gefängnisse. Spezies stehen nie für Menschengruppen.
- **Ausbrüche:** Der Löffel-Tunnel ist ein offensichtlicher Cartoon-Gag. Es gibt keine realen Ausbruchsmethoden.
- **Glücksspiel:** keine Echtgeld-Käufe, keine Lootboxen, kein Glücksrad. Belohnungen sind immer vorher sichtbar und fest.

---

## 3. Kern-Loop und Systeme

> **Einheiten:** Alle Raten sind pro **Spielstunde** angegeben. Alle Timer (Projekte, Cooldowns, Ereignisabstände) sind in **Echtzeit-Sekunden bei 1×** angegeben, außer wo es ausdrücklich anders steht.
>
> **Startwerte:** Alle Zahlen sind Startwerte für Standort 1. Sie werden zuerst mit `tools/economy-sheet.ts` geschlossen nachgerechnet und danach mit den Balance-Bots getunt (Abschnitt 4).

### 3.1 Kern-Loop

1. **Verdienen:** Entlassungsprämien, Werkstatt-Kisten (der Karren verkauft sie am Steg), Kostgeld, Ereignis-Boni, ab Standort 2 auch Besuchertrinkgeld.
2. **Ausgeben:** Räume bauen und vergrößern, Räume upgraden, Personal einstellen, Parzellen kaufen, Projekte erforschen.
3. **Engpass finden:** über die Fluss-Leiste, Warteschlangen und Sprechblasen-Icons.
4. **Engpass beheben.** Dadurch läuft der Fluss schneller, es gibt mehr Entlassungen, mehr Ruf-Sterne und neue Räume und Systeme.
5. **Inspektionstag:** Noten A–F in 4 Kategorien ergeben 1–3 Sterne. Danach folgt die Versetzung zum nächsten Standort mit Goldenen Schlüsseln.

### 3.2 Zeit

**Tageslänge**
- **1 Spieltag = 150 s Echtzeit bei 1×.**
  - 06–22 Uhr: 7,5 s pro Spielstunde, zusammen 120 s.
  - Nachtruhe 22–06 Uhr: 3,75 s pro Spielstunde, zusammen 30 s. Umgesetzt wird das durch die doppelte Tick-Zahl pro Echtzeit-Sekunde, nicht durch ein größeres dt.
- Ein **neues Spiel** beginnt um **07:00 Uhr**.
- Die **Fähre** legt jeden Tag um 07:00 und 15:00 Uhr an.

**Tagesplan:** Er steuert nur die Mahlzeiten und die Nachtruhe.
- Mahlzeitfenster: 07–08, 12–13 und 18–19 Uhr.
- Werkstatt, Klassenzimmer und Hof sind von 08 bis 20 Uhr nutzbar. Rascals wählen nach Bedarf: erst das dringendste Bedürfnis unter 50 %, sonst Arbeit, Unterricht oder Hof.

**Nacht**
- Das Nacht-Grading dunkelt um höchstens 25 % ab und färbt bläulich. Der mittlere Luminanzwert fällt nie unter 0,45; das prüft ein Screenshot-Test.
- Lampen leuchten additiv, Glühwürmchen fliegen.
- **In der ersten Sitzung wird die Nacht in den ersten 5 Minuten übersprungen.** Um 22:00 Uhr folgt eine 2-sekündige Überblendung „Next morning…", sodass die ersten 5 Minuten durchgehend bei Tageslicht spielen.

**Spielgeschwindigkeit**
- 1× und 2× sind von Anfang an verfügbar, 3× erst ab Ruf 3★.
- Pause mit **P** oder per Button. Esc ist nie der einzige Weg.
- Die Pacing-Tabelle in Abschnitt 4 gilt bei 1×.

### 3.3 Ressourcen und Ruf

| Ressource | Ebene | Zweck |
|---|---|---|
| **Coins** | pro Standort, Reset bei der Versetzung | Bauen, Upgrades, Löhne, Projekte, Parzellen, Boost |
| **Ruf** (Punkte → Sterne) | pro Standort | **Nur Schwellenwährung, wird nie ausgegeben.** Schaltet Räume, Systeme und die Inspektion frei |
| **Laune** (0–100 %) | Durchschnitt aller Rascals | Laune-Faktor = 0,5 + Laune/100 (also 0,5–1,5). Wirkt auf Arbeits- und Resozialisierungstempo und senkt Ereignisrisiken |
| **Sauberkeit** (0–100) | pro Raum | Unter 40 sinken Hygiene-Auffüllung und Laune im Raum |
| **Goldene Schlüssel** | permanent | Perk-Menü (kein eigener Raum) |

**Ruf-Quellen:**

| Quelle | Ruf |
|---|---|
| Entlassung | +20 |
| Klemmbrett-Ziel erledigt | +10 |
| Raum-Meilenstein | +5 |
| Ausbrecher gefangen | +5 |
| Ereignis gelöst | +5 |
| Ausbruch gelungen | −10 |

**Ruf-Schwellen:** 1★ = 40, 2★ = 120, 3★ = 260, 4★ = 500, 5★ = 900.

**Prüfbarkeit:** Der Bot-Report listet die Ruf-Quellen pro Minute. Jeder Freischalt-Zeitpunkt der Pacing-Tabelle muss mit diesen Quellen rechnerisch erreichbar sein.

Es gibt keine Premium-Währung und keine Echtgeld-Käufe. [Fakt] In-Game-Käufe sind bei CrazyGames ohnehin nur auf Einladung möglich (https://docs.crazygames.com/sdk/in-game-purchases/).

### 3.4 Räume und Durchsatz (Standort 1 „Puddlebrook Lockup")

| Raum (EN / DE) | Mindestgröße | Kosten | Kapazität | Funktion | Personal (proPerson) | Freischaltung |
|---|---|---|---|---|---|---|
| Bunk Block / Zellentrakt | 3×3 | 80 + 15/Kachel | 1 Bett / 3 Kacheln | Energie (nachts), Bettenzahl | – | vorgebaut (6 Betten) |
| Canteen / Kantine | 4×3 | 120 + 20/Kachel | 1 Platz / 2 Kacheln | Hunger | Koch (8 pro Mahlzeit) | vorgebaut |
| Wash Hut / Waschhaus | 3×3 | 100 + 15/Kachel | 1 Dusche / 3 Kacheln | Hygiene | Hausmeister (optional, ab Bau verfügbar) | Tutorial |
| Knitting Nook / Strickstube (Werkstatt) | 4×4 | 250 + 25/Kachel | 1 Station / 4 Kacheln | Kisten (Coins) und Resozialisierung +2/Std. | Vorarbeiter (4 Stationen) | Klemmbrett-Ziel nach dem Tutorial |
| Classroom / Klassenzimmer | 4×4 | 350 + 25/Kachel | 1 Pult / 3 Kacheln | Resozialisierung +6/Std. | Lehrer (10 Schüler) | Klemmbrett-Ziel „Build a Workshop" erledigt |
| Guard Post / Wachposten | 2×2 | 250 | Radius 6 Kacheln | senkt Ausbruchs- und Rangelei-Chance | Wache | nach dem ersten Ausbruch |
| Yard / Hof (draußen) | 5×5 | 60 + 8/Kachel | 1 Spot / 3 Kacheln | Spaß | – (Wache im Radius empfohlen) | Klemmbrett-Ziel (~6:30) |
| Parole Gate / Freiheitstor | fest | vorgebaut, Upgrades | 1 Entlassung / 10 s (Lv1) | Entlassung, Prämie | Sachbearbeiter (Pflicht ab Lv5) | vorgebaut |
| Dock & Cart Depot / Steg & Karrendepot | fest | vorgebaut, Upgrades | Karren: 6 Kisten pro Fahrt (20 s) | Aufnahme, Kistenverkauf, Logistik-Engpass | Karrenfahrer | vorgebaut |
| Warden's Office / Direktionsbüro | fest | vorgebaut | Leitungsplätze (3.11) | Automation | – | vorgebaut |
| Decor / Deko (Blumenbeet, Bank, Brunnen, Laterne) | 1×1 bis 2×2 | 40–400 | Aura 3 Kacheln | +2 bis +8 Laune im Radius | – | progressiv |

**Ab Standort 2 (P0b) kommen dazu:**
- **Besuchsraum:** Laune und Trinkgeld, mit dem Ereignis „Besuchstag".
- **Krankenzimmer:** heilt „Bauchweh" nach Essensschlachten.

**Einheitliche Durchsatzformel pro Raum:**

```
Durchsatz/Std. = min(Plätze, Personal × proPerson) × Basisrate
                 × (1 + 0,08 × (lvl − 1)) × Meilenstein-Multiplikator
                 × Laune-Faktor (nur in Arbeitsräumen)
```

- Basisraten: Kantine 1 Mahlzeit pro 0,5 Std. pro Platz; Werkstatt 1 Kiste pro 2 Std. pro Station (Lv1); Klassenzimmer wie in der Tabelle.
- Das Raum-Panel zeigt, **welcher Faktor gerade begrenzt** (z. B. „Limit: Cooks").
- Der Upgrade-Button zeigt den neuen Durchsatz, z. B. „12 → 13 / h".

### 3.5 Layout zählt

1. **Wegzeit ist echte Zeit.**
   - Laufen verbraucht Tagesplan-Zeit. Weite Wege senken sichtbar die Arbeits- und Unterrichtsstunden.
   - Das Raum-Panel zeigt den Ø-Weg, z. B. „Ø Walk: 6 s".
2. **Nachbarschafts-Boni** (Tür-zu-Tür ≤ 4 Kacheln). Sie werden beim Platzieren als gestrichelte Linie mit Icon angezeigt.

   | Paar | Bonus |
   |---|---|
   | Waschhaus ↔ Zellentrakt | Hygiene-Weg −50 % |
   | Werkstatt ↔ Depot | Karren-Fahrt −40 % |
   | Klassenzimmer ↔ Bibliotheks-Deko | Resozialisierung +10 % |
   | Kantine ↔ Hof | Laune +5 |

3. **Lärm-Malus:** Liegen Werkstatt oder Hof näher als 3 Kacheln an Zellen, sinkt die Energie-Auffüllung um 20 %.
4. **Abnahme:** Der Optimal-Bot erreicht die Inspektion mit optimalem Layout mindestens 25 % schneller als mit zufälligem Layout. Schafft er das nicht, ist das Layout-System zu schwach und wird verstärkt.

### 3.6 Gelände, Bauregeln, Aufnahme, Sauberkeit

**Gelände und Platzierung**
- Außenflächen sind begehbares Gras. Wege werden automatisch als Pflaster entlang häufig genutzter Routen gezeichnet.
- Räume dürfen sich berühren. Dann entsteht eine gemeinsame Wand mit automatischer Verbindungstür.
- Türen werden automatisch zur Seite des nächsten Weges gesetzt und lassen sich per Klick verschieben.
- **Ablehnung beim Platzieren:** Ein Raum, der den Pfad Steg ↔ Tor oder die Tür eines anderen Raums blockieren würde, wird mit rotem Geist und Pfad-Icon abgelehnt.
- **Möbel:** Pflichtmöbel setzt ein deterministischer Packer pro Raumtyp (1 Kachel Türfreiraum, 1 Kachel breite Wege). Bei einem Kanten-Drag wird komplett neu gepackt.

**Aufnahme** (Teil des Stegs, kein eigener Raum)
- Rascals werden nur aufgenommen, wenn ein freies Bett existiert.
- Die übrigen warten sichtbar am Steg, höchstens 6. Sie zeigen ein Ungeduld-Icon, und ihre Laune sinkt.
- Danach fährt die Fähre mit den übrigen weiter und zeigt einen Hinweis-Toast.
- Eine Fähre bringt 2–6 Rascals, skaliert mit dem Ruf.

**Kostgeld** zahlt jedes zugewiesene Bett, den ganzen Tag.

**Sauberkeit**
- Jede Nutzung senkt die Sauberkeit um 1, ab Freischaltung der Hausmeister um 2.
- Ohne Hausmeister reinigt sich jeder Raum nachts auf 70.
- Die Abnahme beginnt erst nach dem Tutorial.

**Parzellen auf Standort 1**

| Parzelle | Lage und Größe | Preis |
|---|---|---|
| Start | 18×12 Kacheln. Der vorgebaute Teil inklusive Steg und Fähre ist ≤ 18×11 Kacheln groß und bei 800×450 mit Standard-Zoom vollständig sichtbar. | – |
| P2 | rechts, 14×12 | 1.500 |
| P3 | oben, 32×10 | 6.000 |
| P4 | unten, 32×8 | 20.000 |

Die Erweiterung ist sichtbar: Der Zaun wird abgebaut, das neue Land rollt aus. Die Gesamtkarte ist höchstens 32×30 Kacheln groß.

### 3.7 Raumlevel und Upgrades

- **Level** 1–30 pro Standort.
- **Kosten:** `upCost(lvl) = baseUp × 1,12^(lvl−1)`. Werte für baseUp: Zellen 60, Kantine 80, Waschhaus 60, Werkstatt 120, Klassenzimmer 150, Tor 100, Depot 90.
- **Effekt:** +8 % Durchsatz pro Level (siehe Formel in 3.4).
- **Meilensteine Lv 5 / 15 / 30:** ×2 Output **und** ein sichtbares Grafik-Upgrade (3 Stufen). Beispiel Kantine: Holzbänke → Bistrotische → Kantinentresen mit Kupfertöpfen. Dazu kommen eine eigene Fanfare, Partikel und +5 Ruf.
- **Ziel:** Der Casual-Bot erreicht Lv15 im Kernraum bis etwa Minute 12 und Lv30 erst kurz vor oder nach der Inspektion.
- **Kauf-Multiplikator:** ×1 / ×10 / Max, berechnet mit der geometrischen Summe.
  - Bulk-Kosten: `b·r^k·(r^n−1)/(r−1)`
  - Maximal leistbar: `floor(log(c(r−1)/(b·r^k)+1)/log r)`
  - Quelle: https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i
- **Wahrnehmbarkeit:** Jedes Upgrade muss spürbar sein: Vorschau der Zahl vor dem Kauf, Pop-Animation am Raum beim Kauf.

### 3.8 Einnahmen und Ausgaben (Standort 1)

| Posten | Startwert |
|---|---|
| Startkapital | 900 Coins |
| Kostgeld | 0,5 Coins pro zugewiesenem Bett pro Spielstunde. Wird alle ~10 s als kleine Coin-Pops aus den Zellen eingesammelt |
| Werkstatt-Kiste | Wert 20 |
| Entlassungsprämie | 100 × (1 + 0,1 × Ruf-Sterne) Coins + 20 Ruf (VIP: ×5) |
| Ausbruch verhindert | +50 Coins, +5 Ruf |
| Ausbruch gelungen | −10 Ruf, nie Game Over |
| Löhne pro Spieltag (Tagesbilanz um Mitternacht) | Koch 40, Hausmeister 30, Wache 50, Lehrer 60, Vorarbeiter 50, Sachbearbeiter 40, Karrenfahrer 30 |

**Zielwerte** (der Bot prüft sie bei Minute 15 und 30):

| Kennzahl | Ziel |
|---|---|
| Einnahmenmix | Entlassungen 40–50 %, Kisten 30–40 %, Kostgeld ≤ 20 % |
| Lohnanteil | 20–35 % des Einkommens |
| Amortisation der ersten Werkstatt | 2–4 min Echtzeit |

**Spätere Standorte** haben Einnahmen und Kosten mal 8^(n−1).

**Zahlenformat:** Suffixe K, M, B, T, mit lokalisiertem Dezimaltrennzeichen.

**Insolvenzschutz**
- Coins fallen nie unter 0.
- Können Löhne nicht bezahlt werden, arbeitet das Personal am Folgetag 30 % langsamer.
- **Darlehen des Bürgermeisters:**
  - Es ist höchstens ein Darlehen offen, in Höhe von 3 Minuten Einkommen.
  - Die Rückzahlung erfolgt automatisch mit 25 % des laufenden Einkommens.
  - Der Button ist nur sichtbar, wenn die Coins unter dem günstigsten Bau liegen.

### 3.9 Rascals

**Bedürfnisse** (0–100, Abnahme pro Spielstunde; nachts halbe Abnahme außer bei Energie)

| Bedürfnis | Abnahme | Auffüllung |
|---|---|---|
| Hunger | −4 | Kantine: +60 pro Mahlzeit |
| Energie | −3 | Bett nachts: +12/Std. |
| Hygiene | −2 | Dusche: +70 |
| Spaß | −3 | Hof: +20/Std. |

**Freischalt-Regel**
- Ein Bedürfnis verfällt erst, wenn sein Raumtyp freigeschaltet ist. Vorher steht es fest auf 80 und ist unsichtbar.
- Spaß beginnt also erst mit der Freischaltung des Hofs zu sinken.

**Ankunft:** Neue Rascals kommen mit Hygiene 25 an („schlammig von der Fähre"). Alle anderen Werte stehen auf 80.

**Laune** = gewichteter Schnitt (Hunger 0,3 / Energie 0,2 / Hygiene 0,2 / Spaß 0,3) + Deko-Aura + Modifikatoren. Der Wert wird danach auf 0–100 begrenzt.

**Sprechblasen-Icons** (Teller, Zzz, Tropfen, Ball)
- Sie erscheinen bei einem Bedürfnis unter 35 und pulsieren rot unter 15.
- Bedeutung nie nur über Farbe, immer auch über das Icon (Farbenblindheit).
- Welt-Icons sitzen immer auf einer eigenen cremefarbenen Plakette mit Outline.

**Resozialisierung** (Punkte, Fortschritt in % = Punkte / Strafmaß)
- Strafmaß: Die ersten 12 Rascals auf Standort 1 haben 20–40 Punkte, danach 30–90.
- Quellen:
  - Klassenzimmer +6/Std.
  - Werkstatt +2/Std.
  - passiv +0,5/Std. bei Laune ≥ 70 %
- Alle Quellen werden mit dem Laune-Faktor multipliziert.
- Bei 100 % stellt sich der Rascal am Freiheitstor an.

**Eigenschaften** (1–2 pro Rascal, mit Icon)

| Eigenschaft | Wirkung |
|---|---|
| Sneaky | Ausbruchsgewicht ×2 |
| Hungry | Hunger-Abnahme ×1,6 |
| Lazy | Werkstatt-Tempo −30 % |
| Clever | Resozialisierung +40 % |
| Grumpy | Laune −10 |
| Cheerful | +5 Laune im Radius 3 |

**Verhalten**
- Zustandsautomat: Idle → GoTo (Tagesplan oder dringendstes Bedürfnis) → Queue → Use (Raum, Dauer) → zurück.
- Schlangen werden als sichtbare Reihe gerendert.

**Spezies**
- Standort 1: Waschbären und Wiesel.
- Standort 2: Füchse und Marder.
- Alle teilen einen Körperbau. Varianten entstehen über Kopf, Farbe (Tint) und 4 Accessoires: Mütze, Brille, Schal, Pflaster.

**Agentenlimits (einzige gültige Quelle)**

| Standort | Rascals | Personal |
|---|---|---|
| Standort 1 | ≤ 48 | ≤ 16 |
| Standort 2 | ≤ 64 | ≤ 20 |

- Hartes Limit: 100 Agenten pro Standort.
- Der Stresstest läuft mit 200 Agenten.

### 3.10 Personal

**Spezies und Rollen:** Es gibt 3 Personal-Spezies auf dem gemeinsamen Körperbau. Die Rollen unterscheiden sich durch Uniformfarbe und Kopfbedeckung.

| Spezies | Rollen | Merkmale |
|---|---|---|
| Bulldogge | Wache, Hausmeister | Wache mit Pfeife und Kescher |
| Bär | Koch, Lehrer | Koch mit Mütze, Lehrer mit Brille |
| Biber | Vorarbeiter, Bautrupp, Karrenfahrer, Sachbearbeiter | Helm, Mütze, Ärmelschoner |

**Sonderfiguren** (je eine):
- die Leitung als Maskottchen: ein Dachs mit Klemmbrett. Er erscheint nur im UI-Porträt, im Tutorial und auf dem Cover.
- die Inspektorin: eine Gans mit Klemmbrett und Stempel
- der VIP: ein Kater mit Zylinder

**Einstellung**
- Über das Raum-Panel („Hire +1" mit Preis) oder das Personal-Menü.
- **Personal-Level** 1–20: +5 % Tempo pro Level, Kosten `50 × 1,2^lvl`.

**Wache**
- Abdeckungsradius 6 Kacheln, als Overlay umschaltbar.
- Die Patrouille zwischen Wachposten und Hof läuft automatisch. Optional kann der Spieler einen Patrouillenpunkt setzen.
- **Abdeckung** = Anteil der Kacheln der Räume, die ein Rascal heute nutzt, im Radius einer Wache.

**Hausmeister** reinigen zuerst den Raum mit der niedrigsten Sauberkeit.

### 3.11 Handarbeit → Automation (Abteilungsleitungen)

**Handgriffe.** Bis die zugehörige Leitung eingestellt ist, macht der Spieler diese Handgriffe selbst. Jeder hat einen Puls-Hinweis, eine Trefferfläche von 48 px und einen eigenen Sound.

| Handgriff | Wirkung | Ohne Tap | Automatisiert durch | Verfügbar |
|---|---|---|---|---|
| Fährhorn antippen | Fähre legt an | wartet 20 s, legt dann mit 50 % weniger Rascals an | Aufnahme-Leitung | Standort 1 |
| Kistenstapel antippen | Karren fährt sofort | Karren fährt erst bei 6 Kisten | Logistik-Leitung (Otter-freie Variante: Biber mit Klemmbrett) | Standort 1 |
| Dreckfleck antippen | +15 Sauberkeit (max. 1 pro 2 s) | – | Reinigungs-Leitung | Standort 2 |
| Entlassungsstempel antippen | Prämie +20 % | automatisch nach 8 s | Entlassungs-Leitung | Standort 2 |

**Abteilungsleitungen**
- **Direktionsbüro, Standort 1:** 2 Leitungsplätze. Platz 1 ab Ruf 3★, Platz 2 ab 4★.
- **Standort 2:** 4 Plätze.
- **Einstellungsdialog:** zeigt z. B. „You tapped 34 times today. From now on, Olli handles it."
- **Offline-Effizienz:** Jede Leitung erhöht sie um 10 Prozentpunkte (3.15).

**Tap-Begrenzung:** Höchstens 1 Effekt pro 2 s und Objekt. Wildes Klicken bringt also keinen Vorteil (siehe H2).

### 3.12 Schabernack: Ereignis-Director

**Grundregeln**
- Ereignisse sind nicht-tödlich, kurz (15–60 s), aktiv lösbar und nie Game Over.
- Es laufen nie zwei gleichzeitig, und während des Tutorials gibt es keine.
- Essensschlacht und Ruckus sind bis 5 Minuten nach Tutorial-Ende gesperrt.

**Director**
- Alle 150–240 s (bei 1×) wählt er ein Ereignis aus dem Pool der freigeschalteten Ereignisse.
- **Gewichte:**
  - Löffel-Tunnel ∝ Summe der Ausbruchs-Scores. Score pro Rascal = `(1 − Abdeckung) × Sneaky-Faktor × (1 + (50 − Laune)/100)`.
  - Essensschlacht ∝ `max(0, 50 − Kantinen-Laune)`.
  - Überraschungsinspektion (P1): fest 15 %.
- **Gescriptete Ereignisse** ersetzen den jeweiligen Director-Slot: Löffel-Tunnel bei ~3:00, Essensschlacht bei ~10:00.
- **Leere Slots** sind erst ab Minute 15 erlaubt, mit Gewicht 20 %.

**Ereignisse**

| Ereignis | Ablauf | Ergebnis |
|---|---|---|
| **Spoon Tunnel / Löffel-Tunnel** (P0) | Ein Erdhügel ploppt auf, ein Rascal mit Löffel sprintet 8 s Richtung Zaun. Antippen löst die Kescher-Animation aus. Eine Wache im Radius fängt ihn automatisch. | Gefangen: +50 Coins, +5 Ruf. Entkommen: −10 Ruf und Kazoo-Alarm. |
| **Food Fight / Essensschlacht** (P0) | Ein Tumult-Meter füllt sich in 20 s. Der Spieler tippt Rangelnde an, um sie zu beruhigen; Wachen helfen. | Gelöst: +5 Ruf, +Laune. Ungelöst: Kantine 30 s blockiert, Sauberkeit −50, ab Standort 2 „Bauchweh". |
| **VIP Rascal** (P0) | Der berühmte „Cat Burglar" (Kater mit Zylinder) mit Strafmaß 150 und hohem Ausbruchsrisiko. | Entlassung mit 5-facher Prämie. |
| **Visiting Day / Besuchstag** (P0b) | Besuch strömt herein, die Laune steigt. | Trinkgeld. |
| **Flood / Flut** (P0b, Standort 2) | Die Flut setzt den Hof unter Wasser. | Hof 1 Spieltag gesperrt, mit Ankündigung 1 Tag vorher. |
| **Surprise Inspection** (P1) | „Sauberkeit ≥ 70 in 60 s" | Bonus: 3 Minuten Einkommen. |

**Ruckus**
- Auslöser: Laune unter 20 % für 30 s.
- Folge: 30 s Arbeitsstopp, die Räume verdrecken. Es ist nie Game Over.

### 3.13 Projekttafel

- **Freischaltung** bei Ruf 2★.
- **Ablauf:** Es läuft immer genau ein Projekt. Der Timer dauert 60–300 s Echtzeit und **läuft offline weiter**. Bezahlt wird mit Coins.
- **Umfang:** 12 Projekte pro Standort.
- **Sichtbarkeit:** Jedes Projekt muss im Bild sichtbar sein: ein neues Möbel, eine Animation oder ein Icon. Sonst wird es gestrichen.

| Projekt | Wirkung | Sichtbar als |
|---|---|---|
| Comfy Mattresses / Bequeme Matratzen | Energie-Auffüllung +25 % | dickere Matratzen |
| Recipe Book / Rezeptbuch | Mahlzeit +25 % | Kochbuch und Dampf |
| Whistle Training / Pfeifen-Training | Wachradius +2 | goldene Pfeife |
| Assembly Knitting / Fließband-Stricken | Kistenwert +25 % | Förderband |
| Night School / Abendschule | Resozialisierung +20 % | Schreibtischlampen |
| Speedy Carts / Flinke Karren | Karren-Tempo +30 % | Rennstreifen am Karren |
| Bigger Ferry / Größere Fähre | +2 Plätze | größere Fähre |

### 3.14 Hausregeln (P1)

- **Slots:** 1 Slot ab Ruf 3★, ein zweiter über einen späteren Perk.
- **Tauschen:** jederzeit möglich, Cooldown 1 Spieltag.
- **„Laune +X"** heißt: +X Prozentpunkte auf die Ø-Laune vor dem Clamp.

| Karte (EN / DE) | Vorteil | Nachteil |
|---|---|---|
| Pudding Fridays / Pudding-Freitag | Laune +10 | Coins −8 % |
| Early Lights-Out / Früher Zapfenstreich | Energie +30 % | Spaß −15 % |
| Silent Workshop / Stille Werkstatt | Kisten +20 % | Laune −8 |
| Double Patrols / Doppelstreife | Ausbrüche −50 % | Wachlöhne +50 % |

### 3.15 Offline-Ertrag und Hintergrund-Tab

**Formel:** `Einkommen pro Echtzeit-Minute (auf 1× normiert, gemittelt über die letzten 5 Echtzeit-Minuten aktiven Spiels) × min(abwesend, Cap) × Offline-Effizienz`

- **Offline-Effizienz:** Basis 40 %, +10 Prozentpunkte pro Leitung, dazu Perks, höchstens 100 %.
- **Cap:** Basis 2 h. Der Perk gibt +1 h pro Stufe (v1 höchstens 3 Stufen).
- **Nur der aktive Standort** verdient offline. Projekt-Timer laufen weiter.
- **Zeitdelta:** aus dem gespeicherten `Date.now()`. Negative Werte → 0, Werte über dem Cap → Cap.

**Abwesenheit und Hintergrund-Tab**

| Abwesenheit | Verhalten |
|---|---|
| < 60 s | still nachsimulieren |
| 60 s bis 5 min | Nachsimulation in Blöcken (höchstens 3.000 Ticks, verteilt auf mehrere Frames) mit Mini-Toast „Catching up…" |
| ≥ 5 min | Offline-Formel und Rückkehr-Panel |

**Rückkehr-Panel**
- „While you were away / Während du weg warst" mit hochzählender Zahl.
- Es ist ein **nicht pausierendes Overlay** über der laufenden Welt.
- Button „Collect / Einsammeln". Nur in der FULL-Variante gibt es daneben einen gleich großen Button „×2" mit Video-Icon (11.2).

### 3.16 Ziele

**Klemmbrett**
- 10 Ziele pro Standort, davon 7 Pflicht für die Inspektion.
- Es ist immer sichtbar: auf 800×450 als einklappbarer Chip, nie ganz weg.
- Das aktuelle Ziel ist hervorgehoben und hat einen Fortschrittsbalken.
- **Belohnung pro Ziel:** Coins (skaliert) + 10 Ruf.
- **„Show me"-Button** pro Ziel: Die Kamera fährt zum betroffenen Ort.
- **Beispielziele:** „Build a Workshop", „Release 5 rascals", „Canteen level 15", „Mood ≥ 60 % for a full day", „Catch 3 escapees", „Sell 100 crates", „Own 24 beds", „Buy parcel 2".
- **Folgeziel:** Es gibt immer ein aktuelles Ziel. [Fakt] Die Basic-Launch-Empfehlung lautet „Players always know what to do next" (https://docs.crazygames.com/resources/basic-launch-metrics/).

**Tagespost des Bürgermeisters**
- 3 tägliche Aufgaben, Reset um 00:00 Ortszeit.
- Belohnung: Coins, skaliert am aktuellen Einkommen.
- Alle 3 Tage mit erledigter Tagespost gibt es 1 Goldenen Schlüssel. Es gibt keine Splitter-Währung.

### 3.17 Standorte, Inspektion, Versetzung

**Standorte** (Ziel für den ersten Abschluss: 25–45 min)

| # | Name | Rascals | Werkstatt | Modifikator | Release |
|---|---|---|---|---|---|
| 1 | Puddlebrook Lockup (Teich-Dorf) | Waschbären, Wiesel | Strickstube | Tutorial | v1 (P0) |
| 2 | Gullrock Lighthouse (Leuchtturm-Klippe) | Füchse, Marder | Kuchenbäckerei | Flut sperrt periodisch den Hof; Leuchtturm-Strahl nachts | v1 (P0b) |
| 3–5 | Cactus Fort, Frostpeak Keep, Cloudhaven Sky-Brig | – | – | – | P2 (Updates) |

**Inspektionstag**
- Ausrufbar, sobald die 7 Pflichtziele erledigt sind.
- Vor dem Ausrufen zeigt eine **Prognose** die erwarteten Noten.
- Die Gans-Inspektorin läuft 45 s durch das Gefängnis. Die Kamera folgt optional.

**Notenformeln** (gemessen über die letzten 2 Spieltage)

| Kategorie | Messgröße |
|---|---|
| Comfort | Ø-Laune in % |
| Safety | 100 − 25 × gelungene Ausbrüche − 10 × ungelöste Ereignisse, mindestens 0 |
| Reform | Entlassungen pro Tag pro 10 Betten × 50, höchstens 100 |
| Profit | Netto-Einkommen pro Tag ÷ Zielwert (aus `content/sites`) × 100, höchstens 100 |

- **Notenschwellen:** A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, E ≥ 25, F darunter.
- **Sterne:**
  - 1★: keine Note unter D
  - 2★: mindestens drei Noten B oder besser
  - 3★: alle Noten B oder besser und mindestens eine A
- **Ergebnis-Screen:** Stempel-Animation. Die Inspektorin kommentiert die schlechteste Kategorie mit einem konkreten Tipp.
- **Wirkung:** 1★ schaltet den nächsten Standort frei, 2★ und 3★ geben Bonus-Schlüssel.
- **Wiederholung:** ab dem nächsten Spieltag.

**Versetzung (Prestige)**
- Coins, Räume und Personal des Standorts werden zurückgesetzt. Der Standort bleibt als „abgeschlossen" erhalten.
- **Goldene Schlüssel** = `floor(k × sqrt(L / C))` + Sternbonus (2★: +2, 3★: +4).
  - L = Lebenszeit-Coins des Standorts.
  - k und C werden so kalibriert, dass der **Casual-Bot** bei der ersten Inspektion **4–6 Basis-Schlüssel** erhält und mit 2★ genau 2 Perks kaufen kann. Die Werte stehen in `BALANCE.md`.

**Perks in v1** (Perk-Menü, Kosten 2–6 Schlüssel)

| Perk | Wirkung |
|---|---|
| Startkapital | +1.000 Coins × Standortfaktor pro Stufe (max. 3) |
| Werkstatt | +10 % pro Stufe |
| Offline-Cap | +1 h pro Stufe (max. 3) |
| Fähre | +1 Platz |
| Bau-Kosten | −5 % pro Stufe |
| Tagespost | Belohnung +25 % |

**`reportGameCompletedPercentage`**
- +20 % pro bestandener Inspektion. Bezugsgröße sind 5 geplante Standorte; in v1 sind höchstens 40 % erreichbar.
- Melde den Wert nach jeder Inspektion und beim Laden.
- [Fakt] Nach Content-Updates wird neu gemeldet (https://docs.crazygames.com/sdk/game/).

### 3.18 Druck und Anti-Exploit

- **[Einschätzung, itch.io-Thread aus 0.2]** Spiele ohne Fail- oder Druckzustand wirken wie Prototypen.
- **Deshalb:**
  - Ausbrüche kosten Ruf.
  - Ruckus legt die Arbeit lahm.
  - Unbezahlte Löhne bremsen.
  - Inspektionsnoten hängen von echter Optimierung und dem Layout ab.
- **Klick-Spam gewinnt nicht:** Es gibt keine „Klick = Coin"-Mechanik. Handgriffe sind begrenzt (3.11), Coin-Pops werden nach 5 s automatisch eingesammelt.

---

## 4. Pacing der ersten 30 Minuten und Balance-Bots

### 4.1 Vorgehen

1. **Economy-Sheet vor M2.** `tools/economy-sheet.ts` rechnet jede Zeile der Tabelle in 4.2 mit den Startwerten aus Abschnitt 3 geschlossen nach: Kontostand, Ruf, Freischaltungen. Widersprüche behebst du, bevor die Simulation gebaut wird.
2. **Zwei Bot-Profile** (headless in Node):
   - **Optimal:** kauft nach ROI.
   - **Casual:** Reaktionszeit 3–8 s, 30 % suboptimale Käufe, ignoriert Overlays, folgt dem Klemmbrett.
   - **Die Pacing-Tabelle gilt für den Casual-Bot** mit ±20 % Toleranz. Der Optimal-Bot darf höchstens 35 % schneller sein.
3. **Nachweis.** Jede Zeile der Tabelle wird in `docs/BALANCE.md` mit dem Kontostand und dem Ruf des Casual-Bots zu diesem Zeitpunkt belegt.

### 4.2 Pacing-Tabelle (Echtzeit bei 1×)

| Zeit | Geschehen | Spieleraktion | Feier / Freischaltung |
|---|---|---|---|
| 0:00–0:04 | Ladebildschirm, dann die Insel mit **vorgebautem** Mini-Gefängnis (Zellentrakt mit 6 Betten, Kantine, Freiheitstor, Steg, Direktionsbüro). Die Fähre liegt hupend vor Anker. 07:00 Uhr. `gameplayStart()` | – | Das Bild lebt: Wellen, Möwen, Personal bei der Arbeit. Ton gibt es noch nicht (Autoplay-Sperre). |
| 0:04–0:15 | Zeiger auf das Fährhorn: **„Welcome the rascals!"** | Tap | Musik und Ambience starten. 4 Rascals (darunter Earl) kommen über den Steg, Strafakten-Kärtchen ploppen kurz auf. Stink-Wolken (Hygiene 25). |
| 0:15–0:35 | Leuchtender Geist in Mindestgröße: **„Tap to build a Wash Hut"** | 1 Tap | Bautrupp, Staub, Pop, Sound, Coins fliegen |
| 0:35–1:10 | **Earl the Raccoon** (Strafmaß 20, gescriptet: Resozialisierung springt nach dem Duschen auf 100 %) geht zum Tor. Zeiger: **„Stamp to release!"** | Tap auf den Stempel | **Erste Entlassung:** Konfetti, Fanfare, +100 Coins, +20 Ruf, `happytime()`. USP 1 ist gesehen. |
| 1:10–1:30 | **„Upgrade the Canteen"** | Tap | Kantine Lv2. Das Tutorial endet, das Klemmbrett gleitet herein, die Fluss-Leiste wird einmal hervorgehoben. Ziel: „Build a Workshop". |
| 1:30–2:15 | Strickstube 4×4 ziehen (die Zieh-Geste wird einmal per Animation gezeigt) | Drag | Erste Kisten stapeln sich |
| ~1:53 | 22:00 Uhr an Tag 1: Überblendung „Next morning…" (2 s), Tagesbilanz-Toast (3 s, nicht blockierend) | – | – |
| 2:15–3:00 | Kistenstapel antippen, der Karren fährt | Tap | Münzregen. Ziel erledigt (+10 Ruf). Klassenzimmer frei. |
| 3:00–3:30 | **Gescripteter Löffel-Tunnel** | Tap zum Keschern (der Zeiger hilft einmal) | +50 Coins, +5 Ruf, +5 Ruf (gelöst) → **1★**. Wachposten frei. USP 4 ist gesehen. |
| 3:30–4:30 | Klassenzimmer bauen, Lehrer einstellen | Bauen | Kreide-Animation |
| 4:30–5:30 | Wachposten bauen, Wache einstellen | Bauen | Abdeckungs-Overlay erscheint kurz |
| 5:30–6:30 | Die Fähre kommt, die Zellen sind voll, am Steg bildet sich eine Schlange | Zellentrakt per Kanten-Drag vergrößern | Feedback zum Vergrößern |
| 6:30–7:30 | Hof frei, Spaß beginnt zu sinken | Hof bauen (Nachbarschaft zur Kantine) | Rascals spielen Ball, Nachbarschaftslinie |
| 7:30–9:00 | 2. bis 4. Entlassung, Kantine Lv5 | Upgraden | **Meilenstein-Grafik-Upgrade**, Ruf **2★**, Projekttafel frei |
| 9:00–10:00 | Erstes Projekt (90 s) | Projekt wählen | Möbel erscheint |
| ~10:00 | **Essensschlacht** (gescriptet) | Tippen zum Beruhigen | Hausmeister-Hinweis |
| 12:00–14:00 | Parzelle 2 (1.500) | Kaufen | Zaun fällt, Land rollt aus, das Gefängnis verdoppelt sich. Tagespost erscheint als ruhiges HUD-Icon. |
| 14:00–16:00 | Ruf **3★**, erste Abteilungsleitung (Logistik) | Einstellen | „You tapped 34 times…" – Kisten verschwinden von selbst |
| 16:00–20:00 | Kernraum Lv15, zweite Werkstatt-Linie, Director-Ereignisse | Optimieren | Meilenstein |
| 20:00–24:00 | Parzelle 3, Layout optimieren | Umbauen | Prognose-Noten steigen |
| 22:00–28:00 | 7 Pflichtziele erledigt → **„Call Inspection Day"** | Ausrufen | Musikwechsel, Spannung |
| bis 30:00 | Inspektion → Noten → Sterne → Schlüssel-Vorschau → **Standort 2 frei** (Teaser-Kamerafahrt) | Versetzen oder weiter optimieren | `happytime()` |

### 4.3 Taktungsregeln (Bot-Report)

- In den ersten 15 Minuten erscheint **mindestens alle 60–120 s** etwas Neues: Raum, Personal, System, Ereignis oder Meilenstein.
- Der Bot ist nie länger als **45 s** ohne leistbaren Kauf oder verfolgbares Ziel.
- Es gibt keinen Runaway: Coins wachsen nie ohne Senke.
- Der Einnahmenmix und der Lohnanteil liegen bei Minute 15 und 30 im Zielkorridor (3.8).
- Die erste Inspektion ist beim Casual-Bot nach 22–30 min möglich.

---

## 5. Retention-Hooks (Day 1)

**[Fakt]** CrazyGames empfiehlt Progression, tägliche Haken (Login-Bonus, Quests), gespeicherten Fortschritt und „Polish everything" (https://docs.crazygames.com/resources/basic-launch-metrics/).

1. **Offline-Ertrag** mit Rückkehr-Panel (3.15). Ein ruhiger Hinweis im Pause-Panel lautet: „Your lockup earns while you're away".
2. **Projekt-Timer** laufen offline weiter.
3. **Tagespost** mit dem Teaser „New mail tomorrow".
4. **Morgen-VIP**
   - Nach dem ersten Spieltag kündigt die Tafel am Steg an: *„Tomorrow: the infamous Cat Burglar arrives!"*
   - **Verfügbar**, sobald (a) ein neuer lokaler Kalendertag begonnen hat **und** seit dem Sitzungsende ≥ 4 h vergangen sind, **oder** (b) ≥ 8 h vergangen sind. Es gilt, was zuerst eintritt.
   - Ab Spieltag 3 ist die Teaser-Tafel dauerhaft sichtbar. Das Web kennt kein verlässliches Sitzungsende.
5. **Gesperrter nächster Standort** sichtbar auf der Inselkarte, als Silhouette.
6. **Speicherbestätigung:** dezent, ein Häkchen-Icon in der Ecke.

**Ruhe in Sitzung 1**
- Tagespost und weitere Hooks erscheinen in der ersten Sitzung frühestens ab Minute 12, und zwar als **ruhige HUD-Icons mit Punkt-Badge, nie als Pop-up**.
- Login-Kalender und Versorgungskiste sind P2.

**Testbarkeit:** Alle zeitbasierten Systeme laufen über eine injizierbare Uhr (`Clock`-Interface) und sind mit gefälschter Zeit testbar.

---

## 6. UX und Onboarding

### 6.1 Erster Start: 0 Klicks bis zum Gameplay

**0–300 ms**
- Inline-Ladebildschirm: CSS im `<head>` vor dem SDK-Tag, Markup als erstes Element im `<body>`.
- Inhalt: Titel-Logo als Inline-SVG, animierte Fortschrittsleiste, Hintergrundfarbe der Insel.
- Nie ein leerer oder schwarzer Bildschirm.

**Ablauf beim Laden**
- SDK-Init und Asset-Laden laufen **parallel**. Rendern und der Ladebildschirm warten nie auf das SDK (Details in 9.2).
- **Ziel:** ≤ 3–5 s bis zur sichtbaren, interaktiven Welt und zum ersten `gameplayStart()`. Harte Grenze 10 s.
- **Vor dem ersten Spiel gibt es nicht:** Hauptmenü, Story, Sprachwahl oder Level-Auswahl.
  - [Fakt] Full Implementation: „land new users in gameplay immediately … maximum of 1 click" (https://docs.crazygames.com/requirements/gameplay/).

**Wiederkehrende Spieler** landen direkt im Spielstand. Das Rückkehr-Panel liegt als nicht pausierendes Overlay über der Welt.

### 6.2 Tutorial

[Fakt] Laut Quality Guidelines: im Spiel, nur Kernfunktionen, überspringbar, Bilder vor Text, Steuerung per Overlay zeigen (https://docs.crazygames.com/requirements/quality/).

- **4 Schritte:** Fährhorn → Waschhaus (1 Tap) → Earl stempeln → Kantine upgraden.
- **Zeiger:** animierte Hand (Maus-Icon auf Desktop, Finger auf Touch).
- **Text:** höchstens **8 Wörter pro Schritt**, in einer Sprechblase der Dachs-Leitung.
- **Ziehen** wird erst beim zweiten Bau gelehrt (Strickstube). Auf Touch konkurriert Ziehen sonst mit dem Kamera-Schwenk.
- **Skip:** „Skip tutorial" ist dauerhaft sichtbar und gleich gestylt wie die anderen Buttons.
  - Skip beendet Zeiger und Sprechblasen.
  - Die gescripteten Beats laufen trotzdem weiter: Earl erhält 95 % Resozialisierung und wird spätestens bei 2:00 entlassen; der Löffel-Tunnel kommt bei ~3:00.
  - Das Klemmbrett erscheint sofort, das Waschhaus ist dann das erste Klemmbrett-Ziel.
  - Just-in-time-Tipps übernehmen.
- **Ausgegrauter Rest:** Die übrige UI ist gedimmt, aber nicht gesperrt. Die Simulation läuft weiter, nur Ereignisse pausieren.
- **Just-in-time-Tipps** nach dem Tutorial: höchstens 1 pro 30 s, nie blockierend. Beispiel: „Queue! Build more seats".
- **Steuerungs-Overlay:** In den ersten 20 s zeigt unten links ein kleines Icon-Overlay die Steuerung. Danach blendet es aus und ist über „?" oder H wieder abrufbar.

### 6.3 Steuerung

**Desktop**

| Aktion | Eingabe |
|---|---|
| Auswählen / Bauen / Rechteck ziehen | Linksklick |
| Kamera schwenken | Rechts- oder Mittel-Drag; Leertaste gedrückt halten + Links-Drag; WASD **und** Pfeiltasten über `event.code` (deckt ZQSD auf AZERTY physisch ab). Hinweis-Label: „WASD / ZQSD / Pfeile" |
| Zoom zum Cursor | Mausrad, 0,5×–1,5×, weich mit Trägheit |
| Pause | **P** (die Leertaste pausiert nicht) |
| Geschwindigkeit | 1 / 2 (3 ab 3★) |
| Hotkeys | B (Baumenü), O (Overlays), H (Hilfe), R (Deko drehen), Entf (Abreißen). Diese Merk-Hotkeys laufen über `event.key` (kleingeschrieben verglichen) |
| Rückgängig | Strg/Cmd+Z (siehe 6.4) |
| Werkzeug abbrechen | Rechtsklick (Bewegung < 6 px und < 250 ms gilt als Klick, sonst als Schwenk) oder ×-Button. Esc nur zusätzlich, nie als einziger Weg |

**Tastatur-Regeln**
- [Fakt] Esc verlässt den Vollbildmodus, Strg/Cmd+W schließt den Tab. Beide nicht belegen (https://docs.crazygames.com/requirements/quality/).
- `navigator.keyboard.getLayoutMap()` nur in try/catch aufrufen. Das Ergebnis ist optional, denn im fremden iframe fehlt wahrscheinlich die Berechtigung.
- [Fakt] `preventDefault` setzen auf `wheel` (mit `passive:false`), auf Pfeiltasten und Leertaste sowie auf `contextmenu` (https://docs.crazygames.com/resources/html5/common-fixes/).

**Touch**

| Aktion | Geste |
|---|---|
| Schwenken | 1 Finger auf leerer Fläche |
| Auswählen | Tap |
| Zoom und Schwenken | 2 Finger |
| Tooltip | Long-Press (400 ms) |
| Rechteck ziehen im Baumodus | 1 Finger; schwenken dann nur mit 2 Fingern. Vor dem Kauf erscheinen sichtbare Buttons „✓ / ✕" |

- Touch-Ziele sind mindestens 44×44 CSS-px groß.
- Viewport: `<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">`. Ohne `viewport-fit=cover` liefert `env(safe-area-inset-*)` den Wert 0.
- Auf Canvas und Spielfläche: `touch-action:none; overscroll-behavior:none; -webkit-touch-callout:none`.
- Unter iOS wird `gesturestart` per `preventDefault` geblockt.
- Pointer Events statt getrennter Touch- und Maus-Handler.
- [Fakt] `user-select:none` inklusive Präfixe `-webkit-`, `-moz-` und `-ms-` auf `body` (https://docs.crazygames.com/requirements/technical/).

**Kamera**
- Grenzen sind geclampt, die Bewegung hat Trägheit.
- Doppeltipp oder Doppelklick auf einen Raum zentriert ihn.
- Kein Edge-Panning am Rand.
- [Fakt] Klick-UI-Spiele brauchen kein Mouse-Confinement (https://docs.crazygames.com/resources/mouse-control/).

### 6.4 Bau-Werkzeuge

- **Geist-Vorschau:**
  - Grün = gültig. Rot = ungültig, mit einem Grund-Icon: zu klein, außerhalb der Parzelle, überlappt, blockiert einen Weg.
  - Am Cursor stehen Live-Preis, Kapazität, Nachbarschafts-Boni und Lärm-Malus.
- **Kanten-Drag** vergrößert einen Raum. Bezahlt wird nur die Differenz.
- **Agenten auf der Baufläche** werden vor Baubeginn zur nächsten freien, erreichbaren Kachel geschoben.
- **Rückgängig:** Es gibt keinen allgemeinen Undo-Stack. Strg/Cmd+Z macht nur die **letzte Bauaktion** rückgängig, solange sie noch im Bau ist oder seit höchstens 10 s fertig ist (100 % Erstattung). Ein späterer Abriss erstattet 50 %.

### 6.5 Info

- **Tooltips** auf jedem Button und Icon (Hover 300 ms oder Long-Press): Name, Effekt in Zahlen, Hotkey.
- **Raum-Panel:** Level, Durchsatz, begrenzender Faktor, Auslastung, Schlange, Ø-Weg, Personal, Upgrade (×1/×10/Max), nächster Meilenstein.
- **Rascal-Panel:** Name, Spezies, Strafakte, 4 Bedürfnisbalken, Resozialisierungsbalken, Eigenschaften, Button „Follow".
- **Button „Where's my bottleneck?"** (gleichwertig zum Klick auf die Fluss-Leiste): Die Kamera springt zum größten Engpass und zeigt eine Erklärung.

### 6.6 Kompakt-HUD (Breite ≤ 900 px) und HUD-Budget

Bei 800×450 gilt dieses Budget:

| Element | Budget |
|---|---|
| Topbar inkl. Fluss-Leiste | ≤ 40 px hoch; auf kompakten Größen zeigt die Fluss-Leiste nur Icons |
| Bauleiste | ≤ 64 px hoch |
| Klemmbrett | einklappbarer Chip, ≤ 200×40 px |
| Kontext-Panel | Overlay statt angedockt; schließt sich beim Kamera-Drag |
| Spielfläche | **≥ 70 %** der Fläche (Test B7) |

**Welt-Labels** (Bedürfnis-Icons, „+Coins") haben eine **konstante Bildschirmgröße**, unabhängig vom Zoom, mindestens 14 px hoch.

---

## 7. Visuelle Richtung

> **[Fakt]** Die Quality Guidelines verlangen: „Graphics should be of high quality", hohe und gleichbleibende Auflösung, keine Artefakte, **einen einheitlichen Stil** (nicht realistisch und cartoonhaft gemischt, nicht high-res und low-res gemischt), „internally consistent, coherent, and has attractive visuals", und Name und Bild müssen zum Spiel passen (https://docs.crazygames.com/requirements/quality/).

### 7.1 Perspektive und Maßstab

- **Top-down 3/4 (oblique)**, kein echtes Isometrisch.
- **Wände** haben eine Oberkante und eine sichtbare Südfront von etwa 0,5 Kacheln. Wände nahe dem Cursor oder vor ausgewählten Agenten werden halbtransparent (Cutaway).
- **Sortierung** nach y.
- **Raster:** 1 Kachel = 32 Welteinheiten. Zoom 0,5×–1,5×.
- **Mindestgröße eines Rascals:** ≥ 22 px bei 800×450 und ≥ 24 px bei 907×510, jeweils mit Standard-Zoom.
- Jeder Raum ist an Bodentextur und Möbeln eindeutig zu erkennen.

### 7.2 Art-Machbarkeit (verbindlich)

**[Einschätzung]** Von einem LLM handgeschriebene SVGs wirken schnell wie Clipart. Genau das war das Ember-Night-Risiko. Deshalb gilt:

- **Wähle einen Stil, den du per SVG zuverlässig hochwertig umsetzen kannst:**
  - flache, geometrische Vektorformen mit 2-Ton-Schattierung und einer Highlight-Kante
  - kräftige, einfache Silhouetten. Der Körper ist eine abgerundete Kapsel, der Kopf eine Grundform mit Ohren- und Schnauzenvarianten.
  - Ausdruck nur über Augen- und Mund-Decals
  - keine Detail-Illustration
- **Lieber wenige Spezies perfekt als viele mittelmäßig.** In v1 auf Standort 1 sind das: 2 Rascal-Köpfe, 3 Personal-Köpfe und 3 Sonderfiguren.
- **Wenn G1 scheitert:** Stil vereinfachen, nicht verfeinern.

### 7.3 `docs/STYLE_GUIDE.md` (verbindlich, vor jeder Grafik)

**Palette**
- 24–32 benannte Farben in Hell-Dunkel-Rampen: warme Holztöne, Teich-Türkis, Gras-Salbei, Ziegel-Terrakotta, Creme für die UI, Tintenblau für Text.
- Mittlere Sättigung, keine Babypastelltöne.
- Akzente: Gold für Coins, Koralle für Alarm, Mint für „gut".

**Licht und Kontur**
- Das Licht kommt immer von **oben links**.
- **Outline:** 2 px (bei Zoom 1 und DPR 1) in einer abgedunkelten Eigenfarbe, nie reines Schwarz.
- **Schatten:**
  - Jedes Weltobjekt hat einen weichen elliptischen Kontaktschatten.
  - Wände werfen Schatten nach Südosten.
  - An den Wandfüßen liegt Ambient Occlusion als dunkler Verlauf.

**Oberflächen**
- Gradient plus 1 Highlight-Kante pro Form.
- Böden aus Kachelvarianten (Fliesen, Dielen, Beton, Gras), variiert über Index, Rotation und Tint.

**Charaktere**
- Kopf-Körper-Verhältnis 1:2 bis 1:2,5. Erwachsene Mimik, Augen höchstens 25 % der Kopfhöhe.
- Gestreifte Overalls in Sicherheitsstufen-Farben.
- 4 Richtungen, die Seitenansicht wird gespiegelt.
- **Bewegung im Code:** Bob, Beinschwung, leichtes Squash & Stretch, Blinzeln, Idle-Bewegungen (Kratzen, Gähnen, Strecken).

**Welt**
- Animiertes Wasser über Wellen-Sprites, Möwen, die Fähre, Bäume im Wind.
- Ambient-Partikel: Blätter, Dampf aus der Kantine, nachts Glühwürmchen.

**Nacht**
- Container-Tint der Welt plus additive Licht-Sprites: Laternen, Fenster-Lichtkegel, auf Standort 2 der Leuchtturm.
- **Kein** Multiply-Vollbild-Overlay und **kein** ColorMatrix-Filter auf der ganzen Welt (zu teuer auf Low-End-Geräten).

**Verboten im Stil**
- runde Kopf-Spielfiguren mit Punktaugen (Look von Prison Architect)
- Blueprint-Optik
- 3D-Stickmen (Prison Life, Prison Break: Architect Tycoon)
- die Booster-Optik von Leek Factory
- Kenney- oder andere Fremdgrafiken im Spielbild
- gemischte Auflösungen

### 7.4 Art-Pipeline

**Quellen**
- Eigene SVGs in `art/`.
- Jede Datei hat explizite `width`, `height` und `viewBox` und enthält **keinen Text**. In SVG-als-Bild funktionieren keine Webfonts, und Safari rendert SVGs ohne Maße mit 300×150 px.

**Rasterisierung zur Build-Zeit**
- `npm run art:build` rendert alle SVGs per Playwright in Atlanten `atlas@1x.webp` und `atlas@2x.webp`.
- Jeder Atlas ist ≤ 2048², bei Bedarf auf mehrere Seiten verteilt, höchstens 3 pro Auflösung.
- Mipmaps sind aktiv.
- Zur Laufzeit wird nur die passende Auflösung geladen: @2x, wenn `DPR × maxZoom > 1,5`.
- Laufzeit-Rasterisierung bleibt nur als Debug-Option erhalten.

**Charaktere** werden zur Laufzeit aus Schicht-Sprites zusammengesetzt und animiert: Körper, Kopf pro Spezies, 2 Beine, Overall, Accessoire.
- Farbvarianten entstehen über Pixi-`tint` auf Graustufen-Schichten.
- Es gibt keine vorgerenderte Kombinatorik.

**Kontaktbogen:** `npm run art:sheet` legt alle Sprites und Varianten auf ein PNG.

**Automatische Art-Tests**
- Jeder Entity-Typ hat eine eigene Grafik (Render ≠ Fallback).
- Sprites verwenden nur Palettenfarben (mit Toleranz für Anti-Aliasing).
- Die Fonts sind geladen (siehe 9.6).

### 7.5 UI-Kit (DOM/CSS-Overlay über dem Canvas)

**Komponenten** (ein einheitlicher Satz): Buttons (primär, sekundär, Icon), Tabs, Karten, Panels, Tooltips, Fortschrittsbalken, Toasts, Zahlen-Ticker.

**Form**
- 8-px-Raster, Eckenradius 10 px, geschichtete Schatten.
- Cremefarbene Panels mit Holz-Akzentrahmen, in Aktenmappen- und Stempel-Optik passend zur Bürokratie-Satire.

**Schriften** (OFL-1.1, lokal gebündelt, nur die nötigen Gewichte)
- **Fredoka** (`@fontsource/fredoka@5.3.0`, Gewichte 600 und 700) für Titel und Zahlen.
- **Inter** (`@fontsource/inter`, exakte Version pinnen: `npm view @fontsource/inter version`, mindestens 2 Wochen alt; Gewichte 400 und 600) für Fließtext.
- Latin-Subset, das äöüß enthält.
- Prüfe die OFL-Lizenz von Inter selbst. Für Fredoka ist OFL 1.1 ohne Reserved Font Name verifiziert.

**Größen**
- `--ui: clamp(14px, 1.9vmin, 20px)` als Basis, alle Maße in `em` oder `rem`.
- Fließtext ≥ 14 CSS-px, nie unter 12 px, jeweils bei DPR 1.

**Icons:** eigene SVGs im selben Stil.

**Animation**
- Hover-Scale 1,05, Druck-Scale 0,95.
- Panels blenden in 150–200 ms mit ease-out ein.
- Coin-Zähler rollen hoch. Floating-Text „+120". Coin-Partikel fliegen zur Anzeige.
- Staubwolken beim Bau, Bounce-Pop bei Fertigstellung.
- Roter Vignetten-Puls nur bei Alarm.
- Screenshake nur in Comedy-Momenten und abschaltbar.

**Layout (Querformat)**

| Position | Inhalt |
|---|---|
| Oben | Coins, Ruf-Fortschritt, Tag/Uhr, Geschwindigkeit, Laune, Fluss-Leiste |
| Links | Klemmbrett |
| Unten | Bauleiste: Räume, Personal, Deko, Abriss, Projekte |
| Kontext-Panel | Overlay |
| Oben rechts | Zahnrad für die Einstellungen |

- Safe Areas über `env(safe-area-inset-*)`. [Fakt] Die CrazyGames-App startet Spiele im Vollbild (https://docs.crazygames.com/resources/crazygames-app/).
- **Kein eigener Fullscreen-Button.** [Fakt] Verboten (https://docs.crazygames.com/requirements/gameplay/).
- **Kein Orientierungs-Lock.** [Fakt] Das regelt die Plattform (https://docs.crazygames.com/requirements/technical/).

**Einstellungen**
- Regler für Musik, SFX und Ambience.
- Sprache EN/DE (Standard aus dem SDK-Locale).
- Screenshake an/aus.
- Credits und Lizenzen.
- Spielstand zurücksetzen, mit Bestätigung.
- **Keine externen Links.** Ein Privacy-Link ist nicht nötig, da keine Daten gesammelt werden.

### 7.6 Orientierung

- **v1 ist nur Querformat:** Desktop, Tablet und Mobil im Querformat. Im Einreichungsformular wird „Landscape" angegeben.
  - [Fakt] Die Pflicht-Mobilgröße 800×450 ist Querformat (https://docs.crazygames.com/requirements/gameplay/).
  - [Fakt] Leek Factory Tycoon läuft nur im Desktop-Browser und ist trotzdem #1 unter Clicker (https://www.crazygames.com/game/leek-factory-tycoon).
- **Hochformat-Layout ist P2.**
- **Das Portrait-Preview-Video ist trotzdem Pflicht** und entsteht im Capture-Modus (15.3).

---

## 8. Audio

**[Fakt]** Hochwertiges Audio, gleichmäßige Pegel, Musik passend zur Optik (Quality Guidelines). `settings.muteAudio` hat Vorrang (https://docs.crazygames.com/sdk/game/).

### 8.1 Quellen

1. **Kenney CC0 SFX über OpenGameArt.** kenney.nl liefert Bots 403; das nicht umgehen.
   - https://opengameart.org/sites/default/files/kenney_ui-pack.zip
   - https://opengameart.org/sites/default/files/kenney_interfaceSounds.zip
   - Seiten, deren Zip-Link du aus dem Seiteninhalt ausliest:
     - https://opengameart.org/content/50-rpg-sound-effects
     - https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks
     - https://opengameart.org/content/interface-sounds
     - https://opengameart.org/content/85-short-music-jingles (Lizenz ist unverifiziert, prüfen)
   - **Lizenz pro Seite** aus dem Feld „License(s)" lesen.
     - Erlaubt sind nur CC0 sowie CC-BY 3.0/4.0 (mit Credit).
     - Abgelehnt werden CC-BY-SA, GPL und OGA-BY.
     - `License.txt` übernehmen.
2. **ZzFX** (`zzfx@1.4.0`, MIT) nur als zusätzliche Variationsschicht auf aufgenommenen Samples, **nie als alleiniger Sound**.
3. **Musik**
   - Du wählst 3–5 CC0-Kandidaten mit Lizenznachweis von der Track-Seite vor, z. B. von HoliznaCC0 (https://freemusicarchive.org/music/holiznacc0/).
   - Benötigt werden: gemütlicher Tag, ruhiger Abend, spannende Inspektion.
   - Der Auftraggeber wählt bei G2 nach Gehör aus.
   - **Lässt sich kein Track automatisiert laden:** anhalten und den Auftraggeber bitten, 2–3 Tracks hochzuladen. **Komponiere nicht selbst**, das ist das Ember-Night-Risiko. Bis dahin bleibt die Musik leise und die Ambience steht im Vordergrund.

### 8.2 Mindest-Soundliste (~30 Sounds)

| Bereich | Sounds |
|---|---|
| UI | Klick, Hover, Panel auf/zu |
| Bau | Start, Hämmern-Loop, Fertig-Pop |
| Wirtschaft | Upgrade, Meilenstein-Fanfare, Coin-Pop (3 Varianten), Kisten-Stapel, Karren-Rollen |
| Ankunft und Entlassung | Fährhorn, Stempel, Entlassungs-Fanfare mit Jubel |
| Ereignisse | Tunnel-Plopp, Kazoo-Alarm, Kescher-Swoosh, Essensschlacht-Splat, Pfeife |
| Inspektion und Bilanz | Inspektions-Stempel, Tagesbilanz-Kasse |
| Ambience | Wellen, Möwen, Gemurmel, Kantinengeklapper, Nacht-Grillen |

### 8.3 Verarbeitung

- **ffmpeg:** zuerst `which ffmpeg` prüfen. Fehlt es, `ffmpeg-static` per npm nur als Build-Werkzeug nutzen (GPL-Binary, wird nicht ausgeliefert).
- **Format:**
  - SFX: Mono-MP3 mit ~64 kbps.
  - Musik: Mono mit 64–80 kbps, ≤ 0,9 MB pro Loop.
- **Pegel:**
  - SFX: Peak −3 dBFS ±1, RMS innerhalb ±3 dB untereinander.
  - Musik und Ambience: integrierte Lautheit −20 LUFS ±2.
  - SFX-RMS liegt 6–10 dB über der Musik.
  - LUFS-Messung nur bei Musik und Ambience. Bei kurzen SFX unter ~400 ms ist sie unzuverlässig.
- **Nahtlose Loops:** `AudioBufferSourceNode.loop` mit getrimmten `loopStart` und `loopEnd`. Den Encoder-Delay ermittelst du im Build per ffmpeg. Alternativ ein Crossfade zweier Quellen. Test: kein Klick am Loop-Punkt (RMS-Sprung < 6 dB).
- **Pitch-Variation:** ±5 % bei häufigen Sounds.

### 8.4 Technik

- Eigener kleiner WebAudio-Mixer mit den Bussen Musik, SFX und Ambience.
- **Start:** Musik und Ambience beginnen mit dem **ersten Tap** (Fährhorn). Vorher blockiert die Autoplay-Sperre den Ton.
- **iOS:** [Fakt] `audioContext.resume()` in `click`/`touchend` aufrufen (https://docs.crazygames.com/requirements/technical/).
- **Stummschaltung:** bei verstecktem Tab, während Ads (ab `adStarted`) und bei `muteAudio`.
- **Mute-Zustand und Lautstärken** liegen im Spielstand, nicht in separatem localStorage.
- **Initial-Bundle:** alle Tutorial-Sounds (≤ 12 Stück, ≤ 250 KB) plus Musik-Loop 1 in niedriger Qualität. Der Rest wird nach `gameplayStart` nachgeladen.

---

## 9. Technik

### 9.1 Stack

| Bereich | Wahl | Lizenz / Version |
|---|---|---|
| Sprache und Build | TypeScript + Vite, `base: './'` | MIT |
| Welt-Rendering | **PixiJS 8.22.0** (exakt pinnen; in Headless-Chromium mit SwiftShader lauffähig getestet) | MIT |
| UI | DOM/CSS-Overlay | – |
| Saves | `lz-string@1.5.0` (`compressToBase64`) | MIT |
| SFX-Variation | `zzfx@1.4.0` | MIT |
| Fonts | `@fontsource/fredoka@5.3.0`, `@fontsource/inter@<gepinnt>` | OFL-1.1 |
| Tests (nur Entwicklung, nicht ausgeliefert) | Vitest, Playwright, `tsx` (gepinnt) | MIT / Apache-2.0 |
| Lizenzbericht | `rollup-plugin-license` oder `license-checker --production` | – |

**Abgrenzungen**
- **Kein Phaser.** Phaser 4 ist neu, und das Risiko von Phaser-3-Code aus Trainingsdaten ist hoch.
- **Keine CDN-Links**, kein Google-Fonts-Link, keine Analytics.
- **Einzige externe Ressource** ist das CrazyGames-SDK `https://sdk.crazygames.com/crazygames-sdk-v3.js`. [Fakt] Laut Doku gehört es in den `<head>` vor den Spielcode (https://docs.crazygames.com/sdk/intro/). Siehe 9.2 zum Blockieren.

**Lizenzen**
- `licenses/THIRD_PARTY_NOTICES.txt` wird automatisch erzeugt, inklusive transitiver Pixi-Abhängigkeiten wie earcut (ISC) und eventemitter3 (MIT).
- Der Build schlägt fehl bei Lizenzen außerhalb von {MIT, ISC, BSD-2/3, Apache-2.0, OFL-1.1, CC0-1.0, CC-BY-4.0}.
- Die Legal-Kommentare von Vite bleiben erhalten.

**Sim-Isolation:** ESLint `no-restricted-imports` verbietet `pixi.js` und DOM-Globals in `src/sim/**`.

### 9.2 Boot und SDK-Init (Datenverlust vermeiden)

**[Fakt]** „the SDK is unusable until initialized" (https://docs.crazygames.com/sdk/intro/). Das Data-Modul lädt beim Init alle Spieldaten vor, und das kann dauern (https://docs.crazygames.com/sdk/data/).

1. **Ladebildschirm zuerst.** Der Inline-Ladebildschirm steht im `<head>` vor dem SDK-Tag, das Markup ist das erste Element im `<body>`.
   - **Test A1b:** Eine Route verzögert das SDK-Skript um 5 s, eine zweite bricht es ab. In beiden Fällen ist der Ladebildschirm bei 300 ms sichtbar.
   - Gelingt das mit dem blockierenden Tag nicht, dokumentiere es in `RULES_CHECK.md` und lade das SDK nach erneutem Lesen der Doku per `<script src=… async>` mit einem `onload`-Promise.
2. **Parallel laden.** SDK-Init und Asset-Laden laufen parallel hinter dem sichtbaren Ladebalken.
3. **Timeouts:**
   - Auf `*.crazygames.com` wartet der Start **bis zu 8 s** auf `init()`. Normalerweise dauert das unter 1 s.
   - Auf fremden Hosts oder bei `environment === 'disabled'` beträgt der Timeout 2 s. Danach läuft der Mock.
4. **Speichersperre.** Solange `init()` nicht aufgelöst ist, wird kein Spielstand gelesen oder geschrieben und kein Autosave ausgelöst.
   - Läuft auf CrazyGames der Timeout ab, startet eine neue Partie im **gesperrten Modus**, der nichts speichert.
   - Löst `init()` später auf und existiert ein Spielstand, wechselst du per Überblendung zu ihm (Toast „Progress restored"). Gibt es keinen, wird ab jetzt gespeichert.
   - Scheitert `init()` endgültig, läuft das Spiel ohne Speichern weiter und zeigt dezent „Progress can't be saved right now".
5. **`gameplayStart` puffern.** Der Plattform-Wrapper puffert `gameplayStart` und `gameplayStop` und feuert direkt nach erfolgreichem `init()` den zuletzt gültigen Zustand nach. So geht der erste `gameplayStart`, der Messpunkt für den Initial-Download, nicht verloren.
6. **Locale beim Boot festlegen.** Ein spät eintreffendes SDK-Locale ändert die Sprache nicht mehr.
7. **Adblock.** Ist `window.CrazyGames` nach `onerror` oder Timeout undefiniert, läuft das Spiel mit dem Mock weiter.

### 9.3 Architektur

```
src/
  main.ts            # Boot: Ladebildschirm-Übernahme, Platform.init, Asset-Laden, Start
  platform/
    crazygames.ts    # einziger Ort mit window.CrazyGames.SDK; Wrapper mit try/catch,
                     # environment-Check, Start/Stop-Zustand, Puffer bis init
    platform.ts      # Interface: gameplayStart/Stop, happytime, data, ads, locale, mute, progress, context
    mock.ts          # für 'disabled', lokal und alle Tests
  sim/               # REINE Logik, kein DOM, kein Pixi; läuft in Node
    world.ts grid.ts rooms.ts layout.ts agents.ts needs.ts economy.ts staff.ts
    supervisors.ts events.ts director.ts projects.ts objectives.ts inspection.ts
    prestige.ts offline.ts pathfield.ts rng.ts clock.ts invariants.ts
  content/           # Datentabellen: Räume, Personal, Projekte, Ereignisse, Standorte, Spezies, Gags
  render/            # Pixi: camera.ts atlas.ts tiles.ts agentsView.ts roomsView.ts fx.ts (Pools)
                     # lighting.ts overlays.ts labels.ts
  ui/                # DOM-Komponenten, HUD, Fluss-Leiste, Panels, Tooltips, Tutorial, Toasts, Zahlenformat
  audio/             # mixer.ts sounds.ts music.ts
  i18n/              # en.json (Master), de.json, i18n.ts
  save/              # schema.ts serialize.ts migrate.ts storage.ts
art/                 # SVG-Quellen
public/audio/ public/fonts/
tools/
  economy-sheet.ts balance.ts screenshots.ts perf.ts monkey.ts
  art-build.ts art-sheet.ts covers.ts capture.ts package.ts
tests/
docs/                # BRIEF, PROGRESS, GDD, STYLE_GUIDE, BALANCE, RULES_CHECK, NAME_CHECK,
                     # QA_REPORT, ART_SPIKE, PIXI_V8_NOTES, SUBMISSION, competition/
licenses/
```

### 9.4 Simulation und Timing

- **Tick-Rate:** 10 Sim-Ticks pro Echtzeit-Sekunde bei 1×.
  - Geschwindigkeitsstufen und die Nacht (2×) erhöhen die **Tick-Zahl pro Frame**, nie das dt pro Tick.
  - Höchstens 60 Ticks/s und höchstens 8 Ticks pro Frame. Der Rest wird verworfen, um die „Spiral of Death" zu vermeiden.
- **Akkumulator** in **ganzzahligen Mikrosekunden**. Positionen werden beim Rendern interpoliert, die Frame-Zeit wird geclampt.
  - [Fakt] Bei 144 und 165 Hz muss das Spiel identisch laufen (https://docs.crazygames.com/requirements/gameplay/).
- **Zufall:** geseedeter RNG (mulberry32). Der **RNG-State** wird gespeichert, nicht nur der Seed.
- **Invarianten** laufen im Debug-Modus jeden Tick: Rascals = zugewiesene Betten + Wartende; kein Agent in einer Wand; alle Räume erreichbar oder markiert.

### 9.5 Pfadfindung

- **Distanzfelder:** pro Raumtür ein BFS- bzw. Dijkstra-Distanzfeld (`Uint16Array`) über das Raster (höchstens 32×30 Kacheln).
  - Es wird bei jeder Bauänderung komplett neu berechnet (< 1 ms). Kein inkrementelles Patchen, **kein A***.
  - Agenten folgen dem Gradienten.
  - Ein Konnektivitätsgraph beantwortet „erreichbar?".
- **Warteschlangen** sind reservierte Kacheln im Raum oder vor der Tür entlang der Wand. Sie blockieren nie den einzigen Korridor; das prüft die Bauvalidierung.
- **Ausweichverhalten** (Separation) gilt **nicht** auf Türkacheln. Dort gilt eine Ein-Agent-Reservierung pro Tick.
- **Stuck-Watchdog:**
  - 8 s ohne Fortschritt → neu pfaden.
  - 15 s ohne Fortschritt → Teleport zur nächsten erreichbaren Kachel plus Log-Eintrag.
  - Der Monkey-Test zählt die Teleports.

### 9.6 Rendering (PixiJS v8)

**Vorbereitung**
- Lies vor M1 den Migrationsleitfaden (https://pixijs.com/8.x/guides/migrations/v8) und lege `docs/PIXI_V8_NOTES.md` an.
- Wichtige Unterschiede zu v7: `await app.init()`, Graphics-API `rect().fill()`, Text-Konstruktoren mit Options-Objekt, Imports für Advanced Blend Modes.

**Initialisierung und Kontextverlust**
- `app.init({ preference: 'webgl', powerPreference: 'low-power', … })` – kein WebGPU.
- `webglcontextlost` und `webglcontextrestored` behandeln: Atlas neu hochladen, Ladebalken zeigen.
- Ohne WebGL einen freundlichen Hinweis zeigen, keinen schwarzen Bildschirm.

**Szene**
- **Böden** sind Tile-Sprites aus dem Atlas, gebatcht, mit Culling pro 16×16-Block. **Keine** RenderTexture-Caches.
  - Begründung: Bei Zoom 2 und DPR 2 bräuchte allein der Boden rund 168 MB RGBA.
- **Wände, Möbel und Agenten** sind eigene, nach y sortierte Sprites. Wände werden nie in den Boden gebacken.

**Text und Fonts**
- Zahlen in der Welt sind BitmapText.
- Vorher `await document.fonts.load('700 32px Fredoka')`, dann `BitmapFont.install`.

**Allokationen**
- Keine Allokationen pro Frame.
- Pools für Partikel und Floating-Text.
- Kein Canvas-2D-Zeichnen pro Frame.

**DOM-HUD**
- Aktualisierung höchstens 10× pro Sekunde.
- Animationen nur über `transform` und `opacity`.
- Keine DOM-Elemente pro Agent.

**Hintergrund-Tab:** Rendering und Ticker pausieren. Die Nachberechnung folgt den Regeln aus 3.15.

### 9.7 Speichern

**Format**
- Versioniertes JSON: `{v, rngState, site, day, minute, coins, ruf, keys, perks, stats, projects, supervisors, objectives, daily, vip, grid (RLE+Base64), rooms, decor, staff, rascals, lastSeen, incomeAvg, settings{volumes, mute, lang, shake}}`.
- Danach Komprimierung mit lz-string.
- **Ziel: < 150 KB.**
- [Fakt] Das Limit liegt bei 1.048.576 Bytes JSON, der Fehler heißt `dataLimitExcedeed` (https://docs.crazygames.com/sdk/data/).

**Speicherort**
- Bei `environment === 'crazygames'` **ausschließlich** `SDK.data.setItem/getItem`, auch für Einstellungen.
  - [Fakt] Laut Doku soll man sich voll auf das Data-Modul verlassen.
- Sonst localStorage, mit try/catch.

**Zwei Slots**
- Slot A und B werden abwechselnd beschrieben, beide im Data-Modul. Beide zählen zum 1-MB-Limit.
- Jeder Slot hat eine CRC32-Prüfsumme. Geladen wird der neueste gültige Slot.

**Wann gespeichert wird**
- Nach jeder wichtigen Aktion: Bau, Kauf, Entlassung, Ziel, Inspektion, Versetzung.
- Zusätzlich alle 30 s.
- `setItem` wird sofort aufgerufen. [Fakt] Das SDK debounced selbst 1 s bis 30 s.
- Bei `visibilitychange: hidden` und `pagehide` wird zusätzlich gespeichert. Darauf verlässt du dich aber nicht; ein Verlust der letzten Sekunden ist akzeptiert.

**Fehlerfälle**
- Bei `dataModuleDisabled`: Fallback auf localStorage, Konsolenwarnung und Eintrag in die Einreichungs-Checkliste.
  - [Fakt] Der Fehler kommt, wenn der Schalter „Progress Save" im Formular fehlt.
- Migrationen pro Version.
- Bei kaputtem Spielstand: Fallback auf den anderen Slot und ein freundlicher Hinweis. Nie ein Absturz.

### 9.8 Performance- und Größenbudgets

| Messgröße | Ziel |
|---|---|
| Sim-Tick (Node, 200 Agenten) | p95 ≤ 2 ms |
| JS-CPU pro Frame (Sim + Szenen-Update + Render-Submit, ohne GPU) | p95 ≤ 8 ms bei CPU-Drossel ×4 |
| Draw Calls | ≤ 40 |
| Partikel | ≤ 500 |
| GC-Hänger | keiner > 50 ms |
| JS-Heap | < 150 MB, stabil. [Fakt] Muss auf einem 4-GB-Chromebook flüssig laufen (https://docs.crazygames.com/requirements/technical/) |
| Atlas | ≤ 2048² pro Seite, höchstens 3 Seiten pro Auflösung; GPU-Texturen gesamt ≤ 64 MB |
| DPR | gedeckelt bei 2 (1,5 auf schwachen Geräten) |
| Download | gesamt ≤ 8 MB, bis zum ersten `gameplayStart` ≤ 3 MB. [Fakt] Für die mobile Startseite ≤ 20 MB, gemessen bis zum ersten `gameplayStart` |
| Dateien | ≪ 1500, nur relative Pfade. [Fakt] Absolute Pfade scheitern |

---

## 10. Sprache

- **Englisch ist Standard und Pflicht.** [Fakt] Fehlendes Englisch ist ein Ablehnungsgrund (https://docs.crazygames.com/faq/). Deutsch ist die zweite Sprache.
- **Sprachwahl:** aus `SDK.user.systemInfo.locale`. Beginnt der Wert mit `de`, wird Deutsch gewählt, sonst Englisch.
  - [Fakt] Die Sprache soll aus dem SDK-Locale kommen, mit Englisch als Fallback (https://docs.crazygames.com/requirements/gameplay/).
  - `navigator.language` nur, wenn das SDK `disabled` ist.
  - Manuell umschaltbar in den Einstellungen.
- **Strings:** alle in `i18n/en.json` (Master) und `de.json`, nichts hart codiert.
  - Ein Test prüft identische Keys.
  - Deutsche Texte sind ~30 % länger. Das UI muss das fassen; es gibt einen Screenshot-Test in DE.
- **Übersetzungsqualität:** Gags und Strafakten müssen in beiden Sprachen natürlich funktionieren, nicht wörtlich übersetzt. [Fakt] „Translations must be accurate".

---

## 11. CrazyGames-Compliance

### 11.1 SDK v3: welche Aufrufe wo

| Aufruf | Wo genau |
|---|---|
| SDK-Skript | im `<head>` vor dem Spielcode (siehe 9.2 zum Blockieren) |
| `await SDK.init()` | beim Boot, parallel zum Laden (9.2). Jeder Aufruf in try/catch, `SDK.environment` prüfen |
| `loadingStart` / `loadingStop` | **nicht verwenden** (laut Doku optional) |
| `SDK.game.gameplayStart()` | (1) erster interaktiver Frame (Welt sichtbar, Sim läuft); (2) nach dem Schließen jedes pausierenden Modals (Pause, Einstellungen, Inspektionsergebnis, Versetzung); (3) nach Ad-Ende (FULL); (4) nach dem Standortwechsel. [Fakt] Der erste Aufruf setzt den Messpunkt für den Initial-Download |
| `SDK.game.gameplayStop()` | beim Öffnen der genannten Modals, bei Pause (P), vor einem Midgame-Ad. **Nicht** bei Tab-Verlust; [Fakt] das übernimmt CrazyGames. Bau-Menü, Raum-Panel, Tooltips und das Rückkehr-Panel sind Gameplay und lösen **kein** Stop aus. Der Wrapper verhindert doppelte Aufrufe |
| `SDK.game.happytime()` | **nur** bei der allerersten Entlassung und bei jeder bestandenen Inspektion. [Fakt] „There is no need to call this when a level is completed, or an item is obtained … Use this feature sparingly" (https://docs.crazygames.com/sdk/game/) |
| `SDK.game.settings.muteAudio` + `addSettingsChangeListener` | beim Start lesen und den Listener registrieren. Überstimmt den eigenen Schalter: Das Spiel darf Ton nicht wieder einschalten. [Fakt] „A Full Implementation requires muteAudio support for HTML5" (https://docs.crazygames.com/sdk/game/) |
| `SDK.game.reportGameCompletedPercentage(n)` | 3.17 |
| `SDK.game.setGameContext({...})` | jede Minute: `{site, day, coins, rascals, ruf}` |
| `SDK.data.*` | 9.7 |
| `SDK.user.systemInfo` | Locale, `device.type`, `applicationType` (App → Safe Areas) |
| `SDK.game.isOfflineMode` | wenn true: Ad-Buttons ausblenden. [Fakt] https://docs.crazygames.com/resources/crazygames-app/ |
| `SDK.ad.hasAdblock()` | FULL-Variante, siehe 11.2 |
| User-Modul / Login | **nicht in v1**. [Fakt] Keine externen Logins; Gäste müssen immer spielen können (https://docs.crazygames.com/requirements/account-integration/) |

### 11.2 Build-Varianten

**`BASIC`: der einzige Build, der für die Einreichung gebaut, getestet und geliefert wird**
- Keine Ad-UI: kein ×2-Button, kein Rewarded-Button, kein Midgame-Aufruf.
  - [Fakt] Im Basic Launch sind Ads deaktiviert. Rewarded-Buttons ohne Wirkung führen zur Ablehnung (https://docs.crazygames.com/requirements/ads/).
- Alle Alternativen ohne Werbung bleiben: ×1 einsammeln; „Coffee Break" (×2 Produktion für 3 min) **mit Coins** kaufbar.

**`FULL`: Code-Pfad hinter einem Flag, erst nach Einladung zum Full Launch getestet und ausgeliefert**

Geplante Rewarded-Platzierungen:
- (a) Rückkehr-Panel: „×2" neben „Einsammeln", gleiche Größe, Schrift und Farbe, mit Video-Icon.
- (b) Boost-Panel, aus dem HUD geöffnet und nicht schwebend: „Coffee Break" per Video **oder** per Coins, 10 min Cooldown mit Timer.
- (c) Tagespost-Reroll, 1× pro Tag.

Regeln für Rewarded-Angebote:
- Keine Angebote in den ersten ~3 min und keine während eines aktiven Ereignisses.
- [Fakt] Rewarded-Buttons gehören nicht auf aktive Gameplay-Screens.
- **Belohnung nur bei `adFinished`**, klar angezeigt. Bei `adError` keine Belohnung, dafür ein freundlicher Toast. Nie mehrere Ads für eine Belohnung.
- **Ausblenden** bei `isOfflineMode`, bei `adsDisabled` und bei Adblock. Dann erscheint ein kleiner Hinweis „Video bonuses unavailable", kein Pop-up und keine Strafe.

Midgame-Ads:
- Nur nach dem Inspektionsergebnis und bei der Versetzung, mit einem 3-s-Hinweis „Ad starting in 3…".
- Nie auf Menü-, Shop- oder Einstellungs-Buttons.
- Während des Ads: Spiel pausieren, UI blockieren, Ton **erst bei `adStarted`** stummschalten, bei `adFinished` oder `adError` wieder einschalten.
- **Keine eigene Cooldown-Logik.** [Fakt] Das SDK erlaubt höchstens 1 Midgame pro 3 min und ignoriert zu frühe Anfragen still (https://docs.crazygames.com/sdk/video-ads/).
- Pro Pause entweder Midgame **oder** „watch to continue", nie beides.
- Alle `adError`-Codes behandeln: `adsDisabled`, `unfilled`, `adblock`, `adCooldown`, `other`.

**Banner:** keine in v1 (P2).

### 11.3 Weitere Pflichtpunkte

- [ ] Läuft in Chrome und Edge. Zusätzlich in Playwright-WebKit als Indiz testen (Linux-WebKit ist nicht iOS-Safari). [Fakt] Läuft ein Spiel in Safari schlecht, wird es dort deaktiviert.
- [ ] Querformat; kein eigener Orientierungs-Lock.
- [ ] Lesbar bei DPR 1 auf allen 10 Größen: 907×510, 1216×684, 1077×606, 821×462, 1366×768, 1920×1080, 1536×864, 1280×720, 800×450, 1080×607 (https://docs.crazygames.com/requirements/gameplay/).
- [ ] Simulation identisch bei 60, 144 und 165 Hz.
- [ ] Kein Fullscreen-Button, keine Cross-Promotion, keine externen oder App-Store-Links, kein Branding anderer Portale (Terms §5.3).
- [ ] Gäste können immer spielen.
- [ ] Keine Abhängigkeit von Esc oder Strg+W; AZERTY funktioniert.
- [ ] `user-select:none` und die Common Fixes sind aktiv.
- [ ] iOS-Audio wird per Geste fortgesetzt; Safe Areas sind berücksichtigt.
- [ ] Nur relative Pfade, weniger als 1500 Dateien, gesamt ≤ 8 MB.
- [ ] Original in Name, Grafik, Begriffen und UI. PEGI-12-konform, erfüllt die Anti-Kinderspiel-Kriterien.
- [ ] Kein Sitelock. Falls doch einer eingebaut wird, erlaubt er `hostname === "crazygames.com" || hostname.endsWith(".crazygames.com")`.
- [ ] Test im **Developer Portal Preview/QA-Tool** (https://developer.crazygames.com/). Das macht der Auftraggeber; du lieferst die Checkliste dafür.

---

## 12. Automatisierte Abnahmetests

### 12.1 Grundsätze

- **Ausführung:** Alle Tests laufen über `npm test` (Vitest) und `npm run qa` (Playwright). Die Ergebnisse landen in `docs/QA_REPORT.md` und `qa/`.
- **Testserver:** E2E-Tests laufen gegen `vite preview` über HTTP. Über `file://` funktionieren ES-Module nicht.
- **Chromium-Start:** `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
  - **Test 0:** `getContext('webgl2')` ist nicht null.
- **SDK im Test:** In allen Tests wird die SDK-URL per `page.route` auf den lokalen Mock umgeleitet. Ein separater Smoke-Test mit dem echten SDK protokolliert fremde Hosts, ohne zu scheitern.

### 12.2 A. Laden und Einstieg

| Test | Prüfung |
|---|---|
| **A1** | Screenshots bei 100, 300 und 1000 ms zeigen den Ladebildschirm: Pixelvarianz über einer Schwelle, nicht einfarbig. |
| **A1b** | Wie A1, aber mit SDK um 5 s verzögert bzw. abgebrochen. |
| **A2** | Der erste `gameplayStart` kommt lokal mit Mock nach ≤ 5 s. |
| **A3** | Frisches Profil: **0 Klicks** bis zur ersten möglichen Spieleraktion. |
| **A4** | Größe ≤ 8 MB, initial ≤ 3 MB, < 1500 Dateien. Ein grep sucht nur nach `src=`, `href=`, `url(`, `fetch(` und `import(` mit absoluten oder fremden URLs. w3.org-Namespaces sind erlaubt. |
| **A5** | Ein SDK-Stub, der nie auflöst, verhindert den Spielstart nicht. Es wird nichts gespeichert. |
| **A5b** | Verzögertes `init()` (8 s) mit vorhandenem Spielstand: Der Spielstand bleibt byte-identisch erhalten und wird nach `init` geladen. |
| **A6** | 0 Konsolenfehler und 0 `pageerror` in einer 10-min-Bot-Sitzung. |
| **A7** | Ein Netzwerkwächter lässt (bei umgeleitetem SDK) nur localhost zu. |

### 12.3 B. Lesbarkeit und Layout

**B1 Screenshot-Matrix**
- Screens: Gameplay, Bauleiste offen, Raum-Panel, Rascal-Panel, Projekttafel, Einstellungen, Rückkehr-Panel, Inspektionsergebnis, Versetzung.
- Jeweils bei allen 10 Größen, in **EN und DE**, bei DPR 1.
- DOM-Prüfung: keine Überlappung (Elemente mit `data-overlay` ausgenommen), kein Überlauf, keine Schrift unter 12 px, Fließtext ≥ 14 px.
- Visuell prüfst du nur eine Montage pro Sprache (ffmpeg `tile`) sowie 3 Einzelbilder pro Screen (800×450, 907×510, 1920×1080).

| Test | Prüfung |
|---|---|
| **B2** | Canvas-Backing-Store = CSS-Größe × min(DPR, 2). |
| **B3** | Kontrast nur für DOM-Text auf opaken Panels: Text ≥ 4,5:1, wichtige UI ≥ 3:1. Text über der Welt hat immer eine Plakette oder einen Schatten. |
| **B4** | Touch-Ziele ≥ 44×44 px bei Mobil- und Tablet-Größen. |
| **B5** | Kein Fullscreen-Button, keine externen Links. |
| **B6** | `user-select:none` ist in den berechneten Styles aktiv. |
| **B7** | Bei 800×450 nimmt die Spielfläche ≥ 70 % ein. Das Start-Gefängnis inklusive Steg ist vollständig sichtbar. Ein Rascal ist ≥ 22 px hoch, Welt-Labels ≥ 14 px. |

### 12.4 C. Performance

| Test | Prüfung |
|---|---|
| **C1a** | In Node: Sim-Tick mit 200 Agenten, p95 ≤ 2 ms über 10.000 Ticks. |
| **C1b** | Im Browser: instrumentierte JS-CPU-Zeit pro Frame (`performance.now()` um Sim, Scene-Update und Render-Submit), p95 ≤ 8 ms bei CPU-Drossel ×4. GPU-Zeit ist ausgenommen. Absolute FPS werden nur dokumentiert, nicht als Gate verwendet; unter SwiftShader messen sie den Software-Rasterizer. |
| **C1c** | Draw Calls pro Frame (Pixi-Zähler) ≤ 40. |
| **C2** | (a) Gleiche dt-Summe ergibt exakt die gleiche Tick-Zahl bei dt-Folgen für 60, 144 und 165 Hz. (b) Gleiche Tick-Zahl und gleiche Inputs ergeben den gleichen State-Hash. |
| **C3** | CDP `Runtime.getHeapUsage` bei 2× Geschwindigkeit über 10 min Echtzeit: < 150 MB, Anstieg < 10 %. |
| **C4** | `document.visibilityState` wird auf `hidden` überschrieben und `visibilitychange` gefeuert, zusätzlich CDP `Page.setWebLifecycleState({state:'frozen'})`. Erwartet: Rendering pausiert, Audio stumm, **kein** `gameplayStop`. |

### 12.5 D. Onboarding

| Test | Prüfung |
|---|---|
| **D1** | Höchstens 8 Wörter pro Tutorialschritt (aus i18n gezählt). Skip ist vorhanden und funktioniert. |
| **D2** | Die erste Aktion ist ≤ 5 s nach `gameplayStart` möglich. |
| **D3** | Erstes Feedback (Animation, Coins) ≤ 15 s. |
| **D4** | Ein Ziel-Widget ist während 100 % der Gameplay-Zeit sichtbar. Im Tutorial zählt der Tutorialschritt mit Fortschrittsanzeige (1/4 …). |
| **D5** | Jeder Button hat ein Label oder Icon **und** einen Tooltip. Jede Taste steht im Hilfe-Overlay. |
| **D6** | Keine blockierenden Text-Pop-ups in den ersten 60 s. |
| **D7** | Der i18n-Key-Vergleich zwischen EN und DE ist leer. |
| **D8** | Tutorial-Pfad: erste Entlassung ≤ 90 s nach Spielstart. |
| **D9** | Skip bei Sekunde 3: Entlassung ≤ 120 s, Klemmbrett sofort sichtbar. |
| **D10** | Die USPs 1–3 sind bis 2:00 vorgekommen, USP 4 bis 3:30 (Event-Log). |

### 12.6 E. Juice (Event-Log und Instrumentierung)

- Jede Interaktion bekommt visuelles Feedback im selben Frame.
- `mixer.play()` wird ≤ 1 Frame nach dem Input-Event aufgerufen.
- Coins erscheinen als Floating-Text bzw. Partikel, Zähler tweenen.
- Der Bau ist animiert.
- Agenten haben eine Laufanimation, eine Blickrichtung und Bedürfnis-Icons.
- Jede Freischaltung wird gefeiert.

### 12.7 F. Grafik

| Test | Prüfung |
|---|---|
| **Kontaktbogen** | wird erzeugt |
| **Palette** | nur Palettenfarben |
| **Platzhalter** | jeder Entity-Typ hat eine eigene Grafik |
| **Font** | `document.fonts.check()` ist true, und die `measureText`-Breite weicht von der Fallback-Schrift ab |
| **Nacht** | mittlere Luminanz ≥ 0,45 |
| **Blindvergleich** | siehe 13.2 |

### 12.8 G. Audio

- Peak- und RMS-Werte der SFX sowie LUFS der Musik werden gemessen (8.3).
- Kein Klick am Loop-Punkt.
- Mute über SDK, Ad und Tab funktioniert.
- Der Mute-Zustand liegt im Spielstand.

### 12.9 H. Balance (headless, Node)

| Test | Prüfung |
|---|---|
| **H0** | `economy-sheet.ts` zeigt keine Widersprüche zur Pacing-Tabelle. |
| **H1** | Casual- und Optimal-Bot spielen je 30 min Standort 1, danach 30 min Standort 2 mit Perks. Der Report enthält: Zeitpunkt jeder Zeile der Pacing-Tabelle (±20 % beim Casual-Bot), Taktungsregeln (4.3), Einnahmenmix, Lohnanteil, Ruf-Quellen pro Minute. |
| **H1b** | Mit optimalem Layout erreicht der Optimal-Bot die Inspektion ≥ 25 % schneller als mit zufälligem Layout. |
| **H2** | Ein gieriger Naiv-Bot (kauft immer das Billigste) braucht ≥ 30 % länger bis zur Inspektion als der Heuristik-Bot. Ein Zufalls-Bot erreicht in 30 min nicht 2★. Druckzustände treten auf: ≥ 1 Ausbruch und ≥ 1 Essensschlacht in 30 min. |
| **H3** | Die erste Inspektion ist beim Casual-Bot nach 22–30 min möglich. Danach geht die Progression weiter. |
| **H4** | Speichern und Laden ergeben einen identischen State-Hash, verglichen nach Serialisierung und Deserialisierung **vor** dem ersten Tick. Der Hash ignoriert abgeleitete Caches (Distanzfelder, Interpolation). Offline-Ertrag ist gedeckelt. Zeitsprünge (negativ oder +10 Jahre) werden geclampt. |
| **H5** | Tagespost und Morgen-VIP (beide Bedingungen) sind mit injizierter Uhr testbar. |
| **H6** | Kein toter Button, kein „Coming soon". |

### 12.10 I. SDK-Konformität (Mock zeichnet alle Aufrufe auf)

- Kein SDK-Aufruf vor der Auflösung von `init`.
- Der erste `gameplayStart` kommt nach `init`.
- Start und Stop sind gepaart. Kein Stop beim Tab-Wechsel.
- `happytime` wird nur bei der ersten Entlassung und bei jeder Inspektion aufgerufen.
- `muteAudio` überstimmt den In-Game-Ton.
- Das Data-Modul wird verwendet, wenn `environment = crazygames`. Es gibt kein separates localStorage.
- Im BASIC-Build gibt es **keine** Ad-UI und keinen Ad-Aufruf.

### 12.11 J. Bugs

- **Monkey-Test:** 10.000 zufällige Klicks, Drags, Tasten und Pinches über alle Screens. Erwartet:
  - 0 Fehler
  - kein NaN und kein Infinity im State
  - kein hängendes Modal
  - keine negativen Coins
  - höchstens 1 Watchdog-Teleport pro 10 min, im Normalspiel 0
- Invarianten laufen jeden Tick im Debug-Modus.

---

## 13. Qualitätsprüfung und menschliche Gates

### 13.1 Selbst-Review (nur ein Hinweis, kein Abnahmekriterium)

**Ablauf**
- Spiele die ersten 10 Minuten per Playwright: bei 1280×720 und 907×510, mit frischem Profil, zuerst in EN, dann in DE.
- Mache alle 15 s und bei jedem Ereignis einen Screenshot.

**Bewertung in `docs/QA_REPORT.md`**

Jede Note braucht einen konkreten Screenshot als Beleg. Kategorien:
- Klarheit des Ziels
- erster Eindruck der Optik (bei 0:05)
- Juice
- Audio
- Eigenständigkeit des Hakens
- „Würde ich weiterspielen?"
- Lesbarkeit bei 800×450
- Stilkonsistenz
- Fehlerfreiheit
- Anti-Kinderspiel

**Verankerte Skala**

| Note | Bedeutung |
|---|---|
| 5 | nicht zu unterscheiden von Leek Factory oder Prison Life im Vergleichs-Screenshot gleicher Größe |
| 4 | erkennbar Indie, aber nirgends „billig" |
| 3 | mindestens ein Element wirkt wie ein Platzhalter |

**Härtefragen**
- Sieht das Spiel neben dem Wettbewerb billiger aus?
- Gibt es in den ersten 60 s Leerlauf oder Textwände?
- Würde ein Reviewer es auf kids.crazygames.com verschieben?
- Könnte jemand es mit Prison Architect, Prison Life oder Leek Factory verwechseln?

### 13.2 Blindvergleich

- Ein frischer Sub-Agent bekommt 6 unbeschriftete Screenshots gleicher Größe, gemischt: 3 eigene, 3 vom Wettbewerb.
- Er soll die 3 „billigsten" nennen.
- Wählt er mindestens 2 eigene, ist die Optik **nicht** bestanden.

### 13.3 Menschliche Gates (Pflicht)

An jedem Gate **hältst du an**, legst das Material bereit, aktualisierst `PROGRESS.md` und beendest deinen Arbeitsschritt mit einer klaren Bitte um Freigabe. Ohne schriftliche Freigabe arbeitest du nicht weiter. Die Rückmeldungen dokumentierst du in `docs/QA_REPORT.md` und arbeitest sie ab, bevor es weitergeht.

**Playtest-Build für den Auftraggeber**
- Ein Zip mit einer Anleitung (`npx serve` oder `python3 -m http.server`).
- Zusätzlich ein Single-File-Playtest-Build (`vite-plugin-singlefile`), der per Doppelklick läuft. **Er dient nur Playtests und wird nicht eingereicht.**

#### G1: Art-Spike (nach M1)

**Lieferung** (`docs/ART_SPIKE.md`)
- Eine Key-Art-Szene bei 1280×720 und 907×510: fertige Kantine mit Möbeln, Boden und Wänden, Zellentrakt, Steg und Fähre, 2 animierte Rascals und 1 Koch, HUD-Leiste, jeweils bei Tag **und** Nacht.
- 3 Charaktere in je 4 Richtungen.
- 1 Raum in 2 Meilenstein-Stufen.
- 1 Cover-Entwurf.
- Kontaktbogen.
- Wettbewerbsbilder im selben Format daneben.
- Ein 20-s-Video.
- Eine ehrliche Selbstkritik.

**Nach 3 abgelehnten Iterationen** legst du Optionen vor:
- (a) den Stil weiter vereinfachen: flacher, kräftigere Formen, weniger Details
- (b) der Auftraggeber kauft ein kohärentes, lizenziertes Asset-Set oder beauftragt Key Art und Cover extern
- (c) das Konzept anpassen

**Nie** mit Grafik weiterbauen, die nur „okay" wirkt.

#### G2: Erste 10 Minuten (nach M4)

- **Lieferung:** Playtest-Build und ein 60-s-Video.
- **Test durch den Auftraggeber:** Er spielt selbst bei 907×510 mit frischem Profil, möglichst auch auf dem eigenen Laptop oder Handy. Er notiert, wo er stockt oder sich langweilt.
- **Musik:** Er wählt die Musik aus deinen Kandidaten.
- **Erst danach** beginnen P0b und P1.

#### G3: Fertiger Build (nach M7)

- **Lieferung:** vollständiger BASIC-Build, Cover und Videos.
- **Test:** Der Auftraggeber und möglichst 2–3 weitere Personen spielen je 10–15 min ohne Erklärung.
- **Echte Geräte:** Test auf echtem Laptop oder Handy, falls vorhanden auch auf iPhone oder iPad mit Safari. GPU-Last und Safari-Verhalten lassen sich im Container nicht verlässlich messen.
- **Alters-Frage zum Cover** (2.1).
- **„Fertig" gibt es nur mit dieser Freigabe.**

---

## 14. Meilensteine

Am Ende jedes Meilensteins: Abnahmetests grün, Screenshots angesehen, `PROGRESS.md` aktualisiert, Commit.

| # | Inhalt | Abnahme |
|---|---|---|
| **M0** | Brief sichern, Regeln prüfen, Namensprüfung, Wettbewerb, GDD, STYLE_GUIDE, `economy-sheet.ts`, Projekt-Setup (Vite/TS/Pixi gepinnt, ESLint-Regel, Lizenz-Plugin), Mock-SDK, Testinfrastruktur | `RULES_CHECK.md` und `NAME_CHECK.md` liegen vor. H0 grün. Test 0 und A7 grün. |
| **M1** | **Art-Spike:** Art-Build-Pipeline (@1x/@2x), Tiles, Wände, Charakterteile mit Animation, Kamera, Tag/Nacht, HUD-Skizze, Cover-Entwurf, `PIXI_V8_NOTES.md` | Kontaktbogen, Blindvergleich → **G1-Freigabe** |
| **M2** | Headless-Simulation: Raster, Räume, Layout-Regeln, Distanzfelder, Rascals, Bedürfnisse, Ökonomie, Zeit, Fähre, Entlassung, Director, RNG, Uhr. Balance-Bots v1 | Vitest grün, C1a, C2, H1 (erste 10 min) |
| **M3** | Bau-Werkzeuge, UI-Kit, HUD mit Fluss-Leiste, Panels, Tooltips, Kompakt-HUD, i18n EN/DE, Steuerung (Maus, Tastatur, Touch) | B1–B7, D5, D7 |
| **M4** | Onboarding und die ersten 10 Minuten: Tutorial, Skip-Pfad, Earl, Löffel-Tunnel, Klemmbrett, Handgriffe, Audio (Kandidaten), Juice-Pass, Speichern (9.7) inkl. Init-Rennen | A1–A6, D1–D10, E, G, H4 → **G2-Freigabe** |
| **M5** | Rest von Standort 1: Projekte, Leitungen, Essensschlacht, Inspektion, Versetzung, Perks, Offline, Tagespost, Morgen-VIP | H1–H6 für Standort 1, Pacing ±20 % |
| **M6** | Standort 2 (P0b), danach P1, falls grün. SDK-Wrapper komplett | H1 für Standort 2, I komplett |
| **M7** | QA-Durchlauf: Matrix, Performance, Monkey, WebKit-Indiz, Selbst-Review, Art-Pass 2, Cover und Videos | alle A–J grün oder ehrlich offen → **G3-Freigabe** |
| **M8** | Paket, Lizenzen, Texte, Einreichungs-Checkliste | Abschnitt 15 vollständig |

---

## 15. Lieferumfang

### 15.1 Build

- `release/rascal-rock-lockup-basic.zip` mit `index.html` im Root und relativen `assets/`.
- **Keine Single-File-Variante für die Einreichung.** Base64 bläht Audio um 33 % auf und hebelt das Streaming aus.
- Das Upload-Format prüfst du im Developer Portal und hältst es in `docs/SUBMISSION.md` fest. [Fakt] Die Doku sagt nur „upload your HTML5 build"; ein exaktes Zip-Format ist nicht belegt.
- Der FULL-Code-Pfad bleibt hinter einem Flag und wird nicht ausgeliefert.

### 15.2 Cover

[Fakt] Quelle: https://docs.crazygames.com/requirements/game-covers/

- **Formate:** 1920×1080 (16:9), 800×1200 (2:3) und 800×800 (1:1), optisch einheitlich.
- **Motiv:** Key Art statt Screenshot. Die Dachs-Leitung mit Klemmbrett und Stempel, Earl lugt mit Löffel aus dem Tunnel, im Hintergrund das Inselgefängnis, dazu ein großer stilisierter Titel.
- **Regeln:** kein Text außer dem Titel, kein Rahmen, keine Icons oder Logos, nichts Unscharfes.
- **Herstellung:** aus den Spiel-SVGs per `tools/covers.ts` erzeugt.
- **Freigabe:** Entwürfe durchlaufen G1 und G3. Fallen sie durch, lieferst du ein geschichtetes SVG zur Überarbeitung, oder der Auftraggeber lässt die Cover extern machen.
- [Einschätzung] Cover bestimmen die Klickrate und damit die Conversion.

### 15.3 Preview-Videos

**Vorgaben** ([Fakt], gleiche Quelle)
- 15–20 s, ohne Ton, ≤ 50 MB.
- Querformat 1920×1080 und Hochformat 1080×1620 (2:3).
- Das erste Frame ist das Cover.
- Nicht erlaubt: schwarzer Bildschirm, Logo-Überblendung, schwarze Balken, Standard-Mauszeiger, „Play now", Vorspulen.

**Herstellung im Capture-Modus `?capture=1`**
- Die Simulation wird deterministisch in festen Schritten von 1/30 s vorgerückt, pro Schritt entsteht ein Screenshot.
- Encoding: `ffmpeg -framerate 30 -c:v libx264 -crf 18 -pix_fmt yuv420p`.
- Ein eigener Hand-Cursor wird gerendert, kein System-Cursor.
- Das Hochformat zeigt die Welt ohne UI, mit neu gerahmter Kamera und ohne Balken.
- **Kein** Playwright-`recordVideo`: Es liefert VP8 in niedriger Bitrate mit Frame-Drops.

**Inhalt:** Rechteck ziehen → Bautrupp → Rascals strömen herein → Kisten → Löffel-Tunnel wird gekeschert → Stempel und Entlassung mit Konfetti → Rauszoomen auf das große Gefängnis in der Abendstimmung.

### 15.4 Texte in `docs/SUBMISSION.md`

EN für das Listing, DE als Referenz.

- **Inhalt:** Titel, Kurzbeschreibung (1–2 Sätze), lange Beschreibung, **Steuerung und Anleitung** für Maus, Tastatur und Touch.
  - [Fakt] Beschreibung und Steuerung sind Pflicht (https://docs.crazygames.com/requirements/intro/).
- **Tags:** z. B. Tycoon, Management, Building, Simulation, Strategy. **Nicht** Animal, Kids oder Cute.
- **Formular:**
  - Orientierung: **nur Landscape**
  - Mobil: ja
  - Progress Save: **an**
  - Die genauen Formularfelder sind nicht offiziell belegt, im Portal prüfen.

### 15.5 Lizenzen

`licenses/` und `CREDITS.txt` enthalten:
- automatisch erzeugte Third-Party-Notices
- OFL-Texte der Fonts
- CC0- und CC-BY-Belege mit Quell-URL für jeden Sound und jeden Musiktrack

### 15.6 Berichte

- `QA_REPORT.md` (inklusive Gate-Rückmeldungen)
- `BALANCE.md` (mit CSV)
- `RULES_CHECK.md`
- `NAME_CHECK.md`
- `ART_SPIKE.md`
- `PROGRESS.md`

### 15.7 Checkliste für den Auftraggeber

- Schritte im Developer Portal: Preview/QA-Tool, Formularfelder, Progress-Save-Schalter, Orientierung, Cover und Videos hochladen.
- Update-Plan: P1- und P2-Liste.

---

## 16. Explizite Verbote

**Laden und Einstieg**
- Kein leerer oder schwarzer Bildschirm. Kein Warten auf das SDK vor dem ersten Paint.
- Kein Hauptmenü, keine Story und keine Sprachwahl vor dem ersten Gameplay.
- Keine Textwände: höchstens 8 Wörter pro Tutorialschritt, höchstens 2 Zeilen pro Toast.
- Keine Pop-up-Kaskaden in der ersten Sitzung.

**Grafik und Ton**
- Keine Programmer-Art, keine Platzhalter, keine gemischten Stile oder Auflösungen, keine Fremdgrafiken im Spielbild.
- Kein kindlicher Look: keine Kulleraugen, keine Babypalette, keine Babysprache.
- Keine Oszillator-Pieptöne als Sound- oder Musikersatz, keine selbst komponierte Musik.

**Name und Inhalt**
- Kein „Prison Tycoon", kein „Idle ___ Tycoon". Keine Namen, Begriffe, UI-Layouts oder Figuren von Prison Architect, Prison Life, Prison Empire, Prison Break: Architect Tycoon oder Leek Factory.
- Keine Drogen, kein Alkohol, kein Tabak, keine Waffen, kein Blut, keine Hinrichtung, keine Einzelhaft, keine Folter, keine realen Gruppen oder Stereotype, keine Lootboxen oder Glücksräder.

**Plattform**
- Kein eigener Fullscreen-Button, kein Orientierungs-Lock, keine Cross-Promotion, keine externen oder App-Store-Links, kein Branding anderer Portale.
- Keine Ads außerhalb des SDK. Keine Ad-UI im BASIC-Build. Keine Rewarded-Buttons ohne Wirkung, keine Belohnung bei `adError`, keine Ads auf Menü-, Shop- oder Einstellungs-Buttons, keine eigene Ad-Cooldown-Logik.
- Keine externen Logins, keine Echtgeld-Käufe, keine eigenen Server, keine Analytics, keine CDNs.
- Keine absoluten Pfade. Keine Abhängigkeit von Esc oder Strg+W. Keine doppelt belegten Tasten.
- Kein Speichern vor der Auflösung von `init()`. Kein separates localStorage auf CrazyGames. Kein Spielstand über 150 KB.
- Kein `gameplayStop` beim Tab-Wechsel. `happytime()` nur wie in 11.1.

**Technik**
- Keine framerate-abhängige Simulation, keine Allokationen pro Frame, kein Canvas-2D-Zeichnen pro Frame, keine Boden-RenderTextures.

**Arbeitsweise**
- Keine „Coming soon"-Buttons, keine toten UI-Elemente, keine halbfertigen Standorte im Release.
- Kein P0b- oder P1-Feature vor der G2-Freigabe.
- Keine gelockerten Testschwellen, keine gefälschten Tests.
- Nichts außerhalb des eigenen Projektordners ändern. Keine heruntergeladenen Skripte ausführen. Keine Bot-Sperren umgehen.
- Nicht „fertig" melden ohne G3-Freigabe.

---

## 17. Abschlussbericht

Wenn alles erledigt und G3 freigegeben ist, antworte dem Auftraggeber **auf Deutsch** mit:

- Pfaden zu Build-Zip, Covern, Videos und `docs/SUBMISSION.md`
- einer Tabelle der Testergebnisse A–J (grün oder offen, jeweils mit Ursache)
- den Rückmeldungen aus G1, G2 und G3 und wie du sie umgesetzt hast
- den Pacing-Werten des Casual- und des Optimal-Bots im Vergleich zum Soll
- allen bewussten Abweichungen von diesem Prompt mit Begründung
- offenen Risiken, z. B. Safari oder iOS nicht verifiziert, Markenregister nicht geprüft
- den nächsten Schritten im Developer Portal und dem Update-Plan (P1/P2)

Bleib ehrlich: Was du nicht verifizieren konntest, benennst du klar als unverifiziert.