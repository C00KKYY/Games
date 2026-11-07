# G2-Rückmeldung: Plan und Umsetzung (Hook-Schritt M5)

## Was der Auftraggeber gesagt hat (wörtlich)

1. „anfang hat zwar das tutorial aber man weiss trotzdem nicht richtig was man machen soll so richtig"
2. „das spiel hat nicht einen grossen reiz, am anfang soll ncoh so wie ein bisschen was sein zum lust bekommen"

Dazu: „mach das ding jetzt noch fertig".

## Diagnose

Grundlage: zwei unabhängige Design-Analysen (Klarheit, Reiz) mit eigenen Spielläufen des M5-Builds, das Selbst-Review M4
(QA_REPORT.md) und eigene Läufe mit einem „Neuling", der nur tut, was das Spiel zeigt (`tools/selfreview/hook.spec.ts`).

**Warum man nicht weiß, was zu tun ist**
- Das Tutorial lehrt vier einzelne Taps, aber nie den Kreislauf „Schlingel kommen → versorgen → resozialisieren →
  entlassen → Münzen und Sterne". Resozialisierung war in der Welt unsichtbar.
- Schritt 3 war ~23 s Zuschauen („Earl macht sich fertig…"), ohne zu zeigen, worauf man wartet.
- Die Übergabe nach dem Tutorial war schlecht: Das Kantinen-Panel blieb offen, die Fluss-Leiste wurde nie erklärt (Brief
  §4.2 „wird einmal hervorgehoben" fehlte), die Zieh-Geste wurde nie vorgeführt (Brief §4.2 „per Animation").
- Danach kam für einen passiven Spieler genau ein Hinweis (0:56, 7 s), dann nichts bis zum Tunnel um 3:00.
- Ziele sagten WAS, nie WARUM („Besitze 12 Betten" sagt nicht einmal, wie). Die Räume-Karten zeigten nur Formeln, der
  Zweck stand nur im Tooltip (Touch sieht ihn nie). Bei 907×510 lag die Ziel-Karte abgeschnitten am Rand.
- Beim Sparen aufs Klassenzimmer (620) stand der Fortschritt 2 Minuten auf 0/1, ohne Sparanzeige.

**Warum der Reiz fehlt**
- Die Entlassung (USP 1, die einzige große Feier) kam einmal bei 0:28 und dann erst wieder bei ~5:20.
- Keine Figuren: Die Strafakten-Kärtchen bei der Ankunft (Brief §4.2, 0:04–0:15) waren nicht gebaut, Earl hatte keinen Satz.
- Sterne waren leer: Der Toast sagte nicht, was ein Stern bringt.
- Die erste Kistenlieferung („Münzregen", Brief §4.2 2:15–3:00) war nur eine kleine Zahl.
- Das Morgen-VIP-Schild sagte um 1:54 „Morgen", der nächste Spieltag begann 12 s später ohne Kater: wirkte wie ein Fehler.
- „Zu verkaufen"-Schilder standen auf den Parzellen, aber nichts in der UI konnte Land kaufen (tote Fläche, Geld lag ab Minute 6 ungenutzt).

## Was wir ändern und warum

### A. Man weiß immer, was als Nächstes kommt – und warum
1. **Klemmbrett sagt WARUM** (`src/ui/clipboard.ts`): eine Warum-Zeile unter jedem Ziel („Unterricht resozialisiert am
   schnellsten – mehr Entlassungen"), Handlungswortlaut („Baue Betten: 12 insgesamt") über eigene Keys
   `clipboard.goal.*` (die Basis-Keys bleiben), Belohnungszeile mit Freischaltung („· Neu: Klassenzimmer").
2. **Kreislauf in einer Zeile** oben im Klemmbrett, bis man ihn dreimal erlebt hat (bis zur 3. Entlassung):
   „Schlingel bessern → entlassen → Münzen & Sterne" (Tooltip erklärt den ganzen Kreislauf).
3. **Sparbalken** für ein Bau-Ziel, das man noch nicht bezahlen kann: „Sparen: 337/620 · ~1 Min." (Schätzung aus dem
   Einkommensring, reine Leseoperation), eigenes Element (D4-Probe liest weiter „n/m"). Dazu ein Just-in-time-Tipp
   „Kistenstapel antippen: schneller Münzen" (im 30-s-Budget). Kompakt: goldener Ring um das Chip-Icon.
4. **„Jetzt bauen"** im Klemmbrett, sobald das Ziel bezahlbar ist: öffnet direkt das Bauwerkzeug (gleicher Weg wie die Karte).
5. **Geführte erste Bauten** (`src/ui/guide.ts`, `src/ui/tutorial.ts`): nach dem Tutorial zeigt ein Ring mit Hand auf genau
   eine nächste Bedienung: Räume-Knopf → Ziel-Karte → gestrichelter Grundriss an einem guten, gültigen Platz → Personal →
   „Einstellen" für Vorarbeiter, Lehrer, Wache. Beim ersten Bau führt eine Hand die Zieh-Geste in Schleife vor (Brief §4.2).
   Beim Ziel „Kantine auf Stufe 5" zeigt sie auf die Kantine und dann auf „Ausbauen". Kein Schleier, kein Text-Pop-up,
   nie gleichzeitig mit einem Tipp-Chip. Endet nach „Kantine auf Stufe 5"; der Grundriss-Vorschlag hilft danach bei jedem
   Bau-Ziel weiter. Läuft auch nach „Tutorial überspringen".
6. **Räume-Menü erklärt sich** (`src/ui/buildMenu.ts`): Zweck-Zeile auf jeder Karte ohne Hover („Unterricht: bessert am
   schnellsten"), die Formel wandert in den Tooltip; die Karte des aktuellen Ziels trägt ein ZIEL-Schild und wird einmal
   pro Öffnen ins Bild gescrollt (behebt die abgeschnittene Karte bei 907×510).
7. **Tutorial-Schritt 3 gefüllt**: über Earl ein Schild Dusche → Balken → ✓, das sich füllt, sobald er geduscht hat; die
   Wartezeile sagt, was passiert („Eine Dusche bessert ihn", dann „Gebessert! Ab zum Tor"), und die Hand wartet schon am Tor.
   Text bleibt ≤ 8 Wörter (D1), die Brief-Schritttexte sind unverändert.
8. **Saubere Übergabe**: Am Tutorial-Ende schließt das Kantinen-Panel, die Fluss-Leiste leuchtet einmal auf mit „Fluss-Leiste:
   Rot zeigt deinen Engpass" (nicht blockierend, 6 s), erst danach zeigt die Führung auf den Räume-Knopf.

### B. Etwas, das Lust macht – alle ≤ 60 s ein Moment
1. **Strafakten-Kärtchen** (`src/ui/arrivalCards.ts`, Brief §4.2): Jeder Fahrgast der ersten Fähre und die ersten zwei
   jeder weiteren bekommen ein Papierkärtchen „Earl · Waschbär – Unerlaubte Kuchenentnahme – Akte 1024 · Strafmaß 20".
2. **Entlassungs-Sätze**: Wer durchs Tor geht, sagt einen Satz (Earl: „Danke für alles! Der Kuchen ist jetzt vor mir
   sicher."). Höchstens einer pro 20 s, Earl und der Bagatell-Täter immer.
3. **Zweite Entlassung früh – der Bagatell-Täter** (`src/sim/agents.ts`, `src/content/balance.ts`): Der zweite Fahrgast
   der ersten Fähre hat „Verspätete Rückgabe eines Schirms (11 Jahre)", Strafmaß 17 und einen roten BAGATELLE-Stempel. Er
   wird bei ~2:00–3:00 entlassen („Der Schirm geht heute zurück. Größtenteils.") statt der bisherigen Pause bis ~5:20.
   Bagatelle zahlt wenig (halbe Prämie, 5 Ruf), damit es eine Feier ist und kein Wirtschaftssprung. Ausgleich, damit die
   gemessenen Pacing-Zeilen im ±20-%-Fenster bleiben: übrige Fahrgäste der ersten Fähre 110–140, die ersten 12 78–108
   (statt 70–100). Belege in BALANCE.md §6.
4. **Sterne sagen, was sie bringen**: „1★ erreicht! Neu: Entlassungen bringen +5 %. Nächster: 2★ bei 140 Ruf – die Projekttafel".
5. **Erste Lieferung**: Münzfontäne von der Kiste ins Münz-Feld und „Erste Lieferung! … +120 Münzen".
6. **„Fast frei"-Sterne** über Schlingeln ab 80 % Resozialisierung: Man sieht die nächste Entlassung kommen (USP 3).
7. **VIP-Schild ehrlich**: Unterzeile „Komm morgen wieder – dann ist er da." (Brief-Satz bleibt wörtlich).
8. **Land kaufen** (Fertigstellung): eine Land-Karte im Räume-Menü mit Zwei-Tipp-Bestätigung; ein Tipp auf ein
   „Zu verkaufen"-Schild öffnet sie. Das Geld ab Minute 6 hat ein sichtbares Ziel (Parzelle 2, 1.500).

## Was wir bewusst nicht tun
- **Keine zusätzlichen Pflicht- oder Mini-Ziele** auf dem Klemmbrett (Brief §3.16: 10 Ziele, 7 Pflicht).
- **Kein Tippen-für-Münzen und keine Stempel-Kombos** (§3.18 Anti-Exploit); das Tor entlässt nach dem Tutorial selbst.
- **Kein Login-Bonus, keine Post-Pop-ups in den ersten Minuten** (§5: Sitzung 1 ruhig, Hooks ab Minute 12, nie Pop-up).
- **Keine Kamerafahrt am Anfang** (D2: erste Aktion ≤ 5 s) und **kein Text-Pop-up in den ersten 60 s** (D6).
- **Earl wird nicht schneller gemacht**: Er frühstückt weiter. Ein Probelauf („Earl duscht sofort") zog das Tutorial-Ende
  des Casual-Bots auf 52 s, unter die Zeile 70–90 s (−20 % = 56 s). Statt zu kürzen, füllen wir die Wartezeit (A.7).
- **Wachposten nicht an 1★ gebunden**: Er bliebe sonst unter seinem Fenster (Zeile 4:30–5:30).
- **Keine neuen Sprites, keine Änderung am Zeichenbudget**: „Fast frei" nutzt den vorhandenen Stern im gemeinsamen Need-Layer.
- **Brief-Schwellen bleiben**: Keine Pacing-Zeile wurde gelockert. Was nicht grün ist, steht in QA_REPORT.md „G2-Rückmeldung".
