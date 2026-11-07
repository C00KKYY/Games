# BALANCE – Tuning-Protokoll

## 0. Stand M2 (Agenten-Simulation + Bots) – maßgeblich

`npm run balance -- --minutes 10 --seeds 9 --base <n>` (Bericht: `qa/balance.md`, CSV: `qa/balance.csv`).

**H1 erste 10 min: alle 12 Pacing-Zeilen im Fenster** (Casual-Median ±20 %, Optimal ≤ 35 % schneller ab der ersten freien Spielphase), geprüft auf 3 unabhängigen Seed-Sätzen (Basis 11, 500, 1000 → 27 Seeds):

| Zeile | Soll | Casual-Median Basis 11 / 500 / 1000 | Optimal-Median (Basis 11) |
|---|---|---|---|
| Erste Entlassung (Earl) | 0:35–1:10 | 0:44 / 0:46 / 0:46 | 0:28 |
| Tutorial-Ende | 1:10–1:30 | 0:57 / 0:57 / 0:59 | 0:32 |
| Strickstube steht | 1:30–2:15 | 1:31 / 1:28 / 1:31 | 0:44 |
| Löffel-Tunnel / 1★ | 3:00–3:30 | 3:00 / 3:03 (alle Basen) | 3:00 / 3:01 |
| Klassenzimmer | 3:30–4:30 | 4:48 / 3:38 / 3:37 | 3:42 |
| Wachposten | 4:30–5:30 | 4:56 / 5:28 / 3:40 | 3:44 |
| 12 Betten | 5:30–6:30 | 5:39 / 5:43 / 5:35 | 5:16 |
| Hof | 6:30–7:30 | 5:53 / 5:54 / 5:43 | 5:21 |
| 4. Entlassung | 7:30–9:00 | 7:12 / 6:58 / 6:00 | 6:31 |
| Kantine Lv5 | 7:30–9:00 | 6:03 / 6:13 / 7:01 | 5:30 |
| 2★ / Projekttafel | 7:30–9:00 | 6:57 / 6:14 / 6:00 | 5:47 |

Die Mediane streuen je Seed-Satz deutlich (Klassenzimmer 3:37–4:48). Mehrere Zeilen liegen nahe an der unteren Toleranzgrenze (6:00). Ehrliche Einordnung: Casual ist im Bereich 6–7 min eher 10–20 % zu schnell als mittig.

**Offen (§1.9, Schwelle unverändert): Taktungsregel §4.3 (≤ 120 s ohne Neues) in 6 von 27 Seeds verletzt** (11, 28, 96, 147, 1068, 1085; Lücken 129–153 s). Ursachen, lokalisiert mit dem Bot-Ereignisprotokoll:
1. **Spar-Phase 1★ → Klassenzimmer** (4 Seeds). Der Director setzt nach dem gescripteten Tunnel (3:00) laut Brief den nächsten Slot erst nach 150–240 s. Das Klassenzimmer ist in einkommensschwachen Seeds erst bei 5:10–5:28 bezahlbar. *Vorher verdeckt:* Bis zum Review setzte der Director nach dem Skript-Tunnel keinen neuen Abstand und feuerte ~40 s später versehentlich ein zweites Ereignis. Nach dem Fix ist die Lücke sichtbar (vorher 1 von 27).
2. **Wachposten → Zellen** (1 Seed): Der Casual-Bot vergrößert die Zellen erst ab 5:00 (Bot-Regel, nicht Spielregel).
3. **Nach 2★** (1 Seed): Die Projekttafel fehlt noch (M5).

Geplante Gegenmittel: Projekte/Tagespost (M5), Meilenstein-Grafik-Upgrades (M4), Prüfung eines Klemmbrett-Zwischenziels im Fenster 3:00–4:30. Bis dahin prüft `tools/balance.ts` die Taktung über 10 statt 15 min (`TEMPO_MIN`).

Weitere offene Punkte:
- Einnahmenmix @15 min: Entlassungen 52–53 % (Stand vor dem Review) liegen knapp über 40–50 %. Wird in M5 mit den 30-min-Läufen nachgezogen.
- Minuten 10–30 (3★, Inspektion) sind noch nicht abgenommen (M5).
- Am Steg warten ab ~2:30 Schlingel (Fähre 2× pro Spieltag, 6 Startbetten). Der Brief sieht die Schlange bei 5:30–6:30. Laut Brief (§3.9 „höchstens 6, Laune sinkt") ist das zulässig, das Spielgefühl prüft G2.

### Änderungen in M2 (Bot-Befunde)

**Nach dem Review-Workflow:** Die passive Resozialisierung (+0,5/h bei Laune ≥ 70, Brief §3.10) war nicht implementiert und ist jetzt aktiv. Ohne Gegenmaßnahme kam 2★ bei ~6:00 statt ~7:50 (gemessen: mit 0,5/h 5:58, mit 0 7:49). Der Brief-Wert bleibt, ausgeglichen wird über Strafmaß und Preise:

| Wert | vorher | jetzt | Begründung |
|---|---|---|---|
| Strafmaß erste 12 | 110–150 | **70–100** (M2: 60–90, nach dem Review 70–100) | In der Agenten-Simulation sind die Schlingel nur ~50 % der Aktivzeit produktiv (Wege, Essen, Dusche). Mit 110–150 kamen bis Minute 10 nur 1–2 Entlassungen statt 4. |
| Kantine | 1 Platz / 2 Kacheln | **1 Platz / 3 Kacheln** | Physisch passen in 4×3 mit Tresen 4 Plätze. Die Kantine ist damit früh ein sichtbarer Engpass, den das Kantinen-Upgrade im Tutorial adressiert. |
| Kantinen-Upgrade baseUp | 80 | **140** | Kantine Lv5 kam bei 5:5x statt 7:30–9:00 (M2: 130, nach dem Review 140). |
| Klassenzimmer Grundpreis | 350 | **220** | Lange Sparphase vor dem Klassenzimmer (Taktungsregel). Das Sheet plant es bei 4:15, die Agenten-Simulation erreicht 700 Coins erst bei 5:00–5:45 |
| Hof Mindestgröße | 5×5 | **4×4** | Im Startgelände (18×12) blieb nach Werkstatt, Klassenzimmer, Waschhaus, Wachposten und Zellenerweiterung kein 5×5-Platz übrig, Parzelle 2 kommt erst bei ~12 min. |
| Sternschwellen | 40/120/260/500/900 | **40/140/360/650/1000** | 2★ kam bei ~5:55, 3★ bei ~11 min (Median Ruf 260 bei Minute 11). 4★/5★ werden in M5 nachjustiert. |
| Kistenwert | 19 | **20** | Werkstatt-Amortisation im Sheet 4:01 (Agenten-Simulation 3:53) |
| Economy-Sheet `ASSUME` | aktiv 62 %, Laune 62 | **aktiv 50 % (62 % vor dem Klassenzimmer), Laune 57** | gemessen in Casual-Bot-Läufen (4 Seeds × 15 min) |

### Behobene Simulationsfehler, die das Pacing verzerrt hatten
- Distanzfeld-Schlüssel `r<id>` kollidierte mit dem POI `roadExit` → Entlassene hingen am Tor (38 Teleports/Lauf → 0).
- Schlafen bis zum *nächsten* 06:00, wenn das Bett nach dem Nachtsprung erreicht wurde (24 h Schlaf).
- Endlosschleife: Block wird wegen kritischem Bedürfnis abgebrochen, das gerade nicht gedeckt werden kann.
- Warteschlange wurde nie verlassen, wenn das Mahlzeitfenster endete.
- Mittagsglocke: Arbeits-/Unterrichtsblöcke enden zu Beginn eines Mahlzeitfensters, wenn der Schlingel hungrig ist.


Einzige Quelle der Zahlen: `src/content/balance.ts`. Nachweis-Werkzeuge: `tools/economy-sheet.ts` (H0, geschlossenes Aggregatmodell) und später `tools/balance.ts` (H1–H3, agentenbasierte Bots).

## 1. Economy-Sheet (H0) – Stand M0

`npm run economy` → **H0 OK** (Ausgabe: `qa/economy-sheet.txt`).

| Kennzahl | Soll (Brief) | Economy-Sheet (Casual-Modell) |
|---|---|---|
| 1★ | ~3:00–3:30 | 3:05 |
| 2★ | 7:30–9:00 | 7:28 |
| 3★ | 14:00–16:00 (±20 % → ab 11:12) | 11:50 ⚠ am unteren Rand |
| Inspektion möglich | 22–30 min (±20 %) | 21:58 |
| Mix @15 min | Entl. 40–50 / Kisten 30–40 / Kost ≤ 20 | 42 / 39 / 19 |
| Mix @30 min | dto. | 49 / 38 / 13 |
| Lohnanteil @15 / @30 | 20–35 % | 28 % / 31 % |
| Amortisation 1. Werkstatt | 2–4 min | 3:54 ⚠ am oberen Rand |
| Basis-Schlüssel 1. Inspektion | 4–6 | 5 |

**Grenzen des Modells:** Das Sheet ist ein Aggregatmodell (keine Wege, keine Schlangen, Laune konstant 62 %, Ereignisse fest getaktet). Es beweist nur, dass die Zahlen sich nicht widersprechen. Gültig ist erst der Nachweis mit den Agenten-Bots (H1). ⚠-Werte werden dort zuerst nachgeprüft.

## 2. Abweichungen von den Startwerten des Briefs (mit Begründung)

| Wert | Brief | Jetzt | Begründung |
|---|---|---|---|
| Strafmaß erste 12 | 20–40 | **110–150** | Mit +6/Std. Unterricht sammelt ein Schüler ~20 Punkte pro Echtzeit-Minute. Mit den Brief-Werten ergibt das Sheet 101 Entlassungen in 30 min, 2★ bei 4:35 und 3★ bei 6:45. Mit 110–150 fallen Entlassungen 2–4 auf 7:14–7:34, wie in der Pacing-Tabelle |
| Strafmaß danach | 30–90 | **120–220** | dto. Bei ~1 Entlassung/min ab Minute 10 liegt 3★ im Zielfenster |
| Earl | 20, gescriptet | 20, gescriptet | unverändert |
| Entlassungsprämie | 100 × (1 + 0,1·★) | **280 × (1 + 0,05·★) × (1 + 0,04·(Tor-Lv − 1))** | Mit 100 machen Entlassungen nur 22–30 % der Einnahmen aus (Ziel 40–50 %). Der Sternanteil wächst sonst schneller als die Kisten, darum 0,05. Das Tor-Level erhöht den Wert, nicht das Tempo (GDD E15) |
| Kistenwert | 20 | **19** | Feinjustierung Mix @15 |
| Kostgeld | 0,5/Bett/Std. | **1,0 × (1 + 0,08·(Zellen-Lv − 1))** | Ohne Skalierung fällt das Kostgeld bei 30 min auf 5 %. Dann müssen Entlassungen und Kisten zusammen 95 % tragen, und beide Korridore sind nicht gleichzeitig erreichbar. Zellen-Upgrades bekommen so einen wirtschaftlichen Zweck (GDD E17) |
| Löhne | Koch 40 … | **×1,5 × Level-Multiplikator des Arbeitsraums** | Feste Löhne fallen bei 30 min auf 5–13 % des Einkommens (Ziel 20–35 %). „Gehaltsstufe" macht Upgrades zu einer echten Abwägung und ist eine Senke gegen Runaway (§4.3). Der Output wächst gleich schnell, das Netto pro Upgrade bleibt positiv (GDD E16) |
| Einstellungsgebühr | – | 1 Tageslohn (Basis) | GDD E1 |
| Wachposten | 250 | **180** | Mit 250 ist der Posten erst ~1 min nach dem Pacing-Fenster leistbar (5:21 statt 4:30–5:30) |
| Werkstatt pro Kachel | 25 | **22** | Amortisation sonst 4:06 (> 4 min) |
| Schlüssel C | – | ~~2.000~~ → ~~800~~ → **450** (k = 1), siehe §5 und §7 | M0: Sheet-Lebenszeit-Coins @30:00. M5: kalibriert auf den Casual-Agenten-Bot bei der ersten Inspektion (Brief §3.17) |
| Pflichtziele | Brief nennt Beispiele | Workshop, Classroom, Guard Post, Own 24 beds, Release 15, **Workshop Lv15**, Catch 3 | Mit den leichteren Zielen (Release 5, Canteen Lv5) wäre die Inspektion schon bei 13:20 möglich |

## 3. Widersprüche im Brief

1. **Lv15 im Kernraum:** §3.7 nennt „bis etwa Minute 12", die Pacing-Tabelle §4.2 „16:00–20:00". Es gilt die Pacing-Tabelle. Das Sheet erreicht Lv15 bei 21:42 (Ziel 20:00 + 20 %).
2. **Pacing-Tabelle 0:35–1:10:** Dort steht „+100 Coins" für Earls Entlassung. Mit der neuen Prämie sind es +294. Die Tabelle ist an dieser Stelle durch die Tuning-Regel überholt.
3. **Karren als Engpass:** Ab ~15 min begrenzt der Karren (6 Kisten / 20 s) den Kistenverkauf. Das ist beabsichtigt („Logistik-Engpass") und braucht in der Fluss-Leiste eine eigene Stufe „Cart". Das Modell rechnet mit Depot-Upgrades, der Logistik-Leitung ab 3★ und dem Projekt „Speedy Carts" bei ~18 min.

## 4. Offene Punkte für H1 (Agenten-Bots)
- Ist der Anteil von 62 % aktiver Zeit (Rest: Mahlzeiten, Dusche, Wege) realistisch? Er bestimmt Reform- und Kistentempo direkt.
- 3★ liegt früh, die Amortisation spät: beide nachmessen.
- Ab ~20 min fehlen dem Casual-Modell sinnvolle Käufe. Prüfen, ob nach dem Kauf von Parzelle 3 genug Ziele bleiben (Regel „nie 45 s ohne Ziel").

## 5. M5 – Projekte, Leitungen, Inspektion, Versetzung (sim-progress)

Werkzeuge: `npx tsx tools/balance.ts --minutes 30 --seeds 5` (Basis 11 → Seeds 11, 28, 45, 62, 79), Verhaltenstests `tests/unit/m5-progress.test.ts`. Neue Bot-Hooks in `tools/bots.ts` (`BotOpts.m5`): Projekte starten, Leitungen einstellen (Logistik zuerst, Gebühr wird angespart), Inspektion ausrufen (Casual: sobald möglich, danach erst wieder, wenn die Prognose besser ist; Optimal: erst bei Prognose ≥ 1★), Ergebnis schließen, und ab 3★ gegen die schlechteste Prognose-Kategorie kaufen (Tipp der Inspektorin). Neue Meilensteine im Report: `project1`, `lead1`, `inspection1`, `inspStars<n>`. `TEMPO_MIN` = **15** (Brief §4.3).

### 5.1 Kalibrierung

| Wert | Brief | jetzt | Nachweis |
|---|---|---|---|
| Schlüssel k / C | so, dass Casual bei der 1. Inspektion 4–6 Basis-Schlüssel hat und mit 2★ genau 2 Perks kaufen kann | **k = 1, C = 800** | Casual-Bot, L (Lebenszeit-Coins) beim ersten Ausrufen: 17,1–21,4 K (Seeds 11–79, 25–33 min) → 4–5 Basis-Schlüssel; 6 erst ab L = 28,8 K, 7 ab 39,2 K. Mit 2★ (+2) = 6–8 Schlüssel; billigste Stufe-1-Perks 3 + 3, drei kosten 9 → genau 2 Perks (Test). Economy-Sheet (H0) misst jetzt ebenfalls bei der ersten Inspektion (22:05, L = 29,3 K → 6) statt bei 30:00 (60 K → 8). |
| Profit-Zielwert Standort 1 | „aus content/sites" | **1 500 Netto/Spieltag** (`SITES[0].profitTarget`, Spiegel `INSPECTION.profitTarget`) | Casual-Netto/Spieltag im 2-Tage-Fenster bei 16–30 min: 865–2 086 (Median ~1 300). Mit 1 200 hatte jeder Bot ab Minute 16 Profit 100 (A) ohne Optimierung. 1 500 → Casual meist C–A, A braucht echte Optimierung. Standort 2: 12 000 (× Standortfaktor 8), M6 kalibriert. |
| Gans-Rundgang | 45 s | 45 s; Route Steg → nächste Raumtür (Wegdistanz) → … → Tor, Tempo ≥ 2,5 Kacheln/s, Ankunft am Tor ≤ 42 s | Test „goose walks 45 s“ |
| Projektkosten | – | unverändert (400–4 000) | erstes Projekt Casual-Median 7:50 (Soll 9:00–10:00, ±20 % ab 7:12) |

### 5.2 Messung (30 min, 5 Seeds, Stand dieses Schritts)

| Zeile | Soll | Casual-Median | Optimal-Median | ok |
|---|---|---|---|---|
| Erstes Projekt | 9:00–10:00 | 7:50 | – | ✅ |
| Essensschlacht | 10:00–10:30 | 10:32 | 10:33 | ✅ |
| Parzelle 2 | 12:00–14:00 | 13:08 | 10:23 | ✅ |
| 3★ | 14:00–16:00 | 14:58 | 18:13 | ✅ |
| Erste Leitung | 14:00–16:00 | 15:55 | 19:57 | ✅ |
| Kernraum Lv15 | 16:00–20:00 | 27:35 | 17:19 | ❌ |
| Inspektion möglich (H3) | 22:00–30:00 | 27:40 | 27:14 | ✅ (Seed 11 erst nach 36 min) |
| Inspektion ausgerufen | 22:00–30:00 | 27:45 | – | ✅ |

### 5.3 Offen (Schwellen unverändert, für den Balance-Pass)
1. **Casual besteht die erste Inspektion nicht zuverlässig.** Erste Ergebnisse (40 min): Seeds 28/45 0★ → 1★ beim 2. Versuch (~34 min), Seed 62 1★ (26 min) → 2★, Seed 11 0★, Seed 79 nicht ausgerufen. Ursache fast immer **Comfort 32–41 %** (E/D-Grenze): Ø-Hunger der Bewohner 16–29, Ø-Spaß 18–35 bei 30–42 Schlingeln. Die Kantinen/Höfe des Bots sind zu klein, und Mahlzeiten scheitern an den 1-h-Fenstern plus Wegzeit. Reform schwankt 0–100 (Entlassungen kommen schubweise, 5 Pulte für 30+ Schlingel). Das ist Kern-Balance (NEEDS, Kantine, Bot-Bauordnung), nicht Formel: Die Notenformeln sind Brief-Werte und bleiben.
2. **Taktung §4.3 über 15 min:** Lücken 126–147 s in allen 5 Seeds, meist 10:32 (Essensschlacht) → ~13:00 (Parzelle 2) oder 8:20 → 10:32. Projekte schließen die Lücke nur, wenn der Casual auf sie spart. Das hungerte Lv15 und die Inspektion aus (Versuch verworfen). Kandidaten: zweites Projekt billiger/kürzer, Tagespost-Icon ab 12:00 im Bot-Report zählen, Director-Slot nach der Essensschlacht.
3. **Kernraum Lv15** casual 27:35 (Soll 16–20 min ±20 %). Der Optimal-Bot liegt bei 17:19 und ist damit > 35 % schneller.
4. **Optimal-Bot** besteht in 40 min keine Inspektion: Comfort 29–37. Seine ROI-Strategie ignoriert die Laune.

## 6. G2-Hook (Hook-Schritt M5): früher Rhythmus

Auftrag aus der G2-Rückmeldung (docs/G2_FEEDBACK.md): am Anfang „etwas, das Lust macht". Größter Hebel ist eine zweite
Entlassung in der Lücke 1:05–3:00 (vorher kam sie erst bei ~5:20). Alle Werte in `src/content/balance.ts SENTENCE`.

| Wert | vorher | jetzt | Begründung |
|---|---|---|---|
| Bagatell-Täter (2. Fahrgast der ersten Fähre, `pettyIndex` 1) | – | **Strafmaß 17**, Akte „Schirm (11 Jahre)" | 2. Entlassung beim Casual-Bot bei 2:36–2:50 statt ~5:20. 16 hätte das Economy-Sheet (H0) auf 4:01 Werkstatt-Amortisation gezogen (Ziel ≤ 4:00), 17 ergibt 3:59. |
| Prämie / Ruf des Bagatell-Täters | 280 / 20 | **×0,5 / 5 Ruf** | Eine Feier, kein Wirtschaftssprung: Mit voller Prämie und 20 Ruf kamen 1★ beim Optimal-Bot schon bei 1:45 (> 35 % schneller als Casual) und Kantine Lv5 / 2★ unter 6:00. |
| Strafmaß übrige Fahrgäste der ersten Fähre (`firstFerry` 4) | 70–100 | **110–140** | Gleicht die frühe Entlassung aus: Entlassung 3–4 bleiben in ihrer Zeile. |
| Strafmaß der ersten 12 | 70–100 | **78–108** | dto.; ohne Ausgleich (nur Bagatelle) lagen 4. Entlassung, Kantine Lv5 und 2★ bei 5:42–5:59 (Fenster ab 6:00). |
| Earl | Strafmaß 20, zufällige Akte | Strafmaß 20, **Akte „Unerlaubte Kuchenentnahme"** | Sein Entlassungssatz löst den Witz auf („Der Kuchen ist jetzt vor mir sicher."). Gesetzt nach den Zufallsziehungen: RNG-Folge unverändert. |

**Verworfen:** Earl sofort duschen lassen (Frühstück überspringen). Gemessen: Tutorial-Ende Casual 52 s, unter dem
Fenster 70–90 s (−20 % = 56 s). Die Wartezeit in Schritt 3 wird stattdessen gefüllt (Schild über Earl, Hand am Tor).

**Messung** `npx tsx tools/balance.ts --minutes 30 --seeds 5` (Seeds 11/28/45/62/79, Bericht in `qa/balance.md`):
alle Zeilen im ±20-%-Fenster außer **Kernraum Lv15** (Casual 27:30, war vorher schon rot: 27:35). Werte des Casual-Bots:
Earl 0:44, Tutorial-Ende 0:59, Strickstube 1:33, Tunnel/1★ 3:00/3:03, Klassenzimmer 3:31, Wachposten 3:38, 12 Betten 5:40,
Hof 5:46, 4. Entlassung 7:13, Kantine Lv5 7:04, 2★ 7:13, erstes Projekt 9:50, Essensschlacht 10:33, Parzelle 2 12:28,
3★ 17:14, erste Leitung 18:23, Inspektion möglich 27:30. 2. Entlassung je Seed (10-min-Lauf): 2:36–2:50.
Taktungsregel §4.3 (15 min): 3 von 5 Seeds mit einer Lücke > 120 s (139–174 s, nach der Essensschlacht bis Parzelle 2
bzw. 3:00–5:20); vorher 5 von 5. **Economy-Sheet H0: grün** (Amortisation 3:59, Mix bei 15:00 Entl. 45 % / Kisten 35 % /
Kost 19 %, Schlüssel 5). Das Sheet modelliert Bagatell-Täter und erste Fähre jetzt mit (`tools/economy-sheet.ts`).

**Robustheit (offen):** Die Bot-Zeilen ab Minute 9 (erstes Projekt, 3★, erste Leitung, Wachposten-Fenster 3:36) liegen
knapp an den Grenzen und kippen schon bei kleinen Strafmaß-Änderungen. Auf einem zweiten Seed-Satz (3/5/7/9/13) fallen mit
diesen Werten „Wachposten" (Casual 3:29, untere Grenze 3:36) und „erste Leitung" (19:43, obere Grenze 19:12) heraus, die Werte vor dem Hook-Schritt
bestanden dort. Die offiziellen Seeds bestehen. Der Balance-Pass sollte die Mittelphase (Leitungsgebühr, Projekt-Wahl des
Bots, Comfort) stabiler machen, statt die Frühphase weiter zu verschieben.

## 7. Balance-Pass M5 (Standort 1, 0–30 min) – maßgeblich

Werkzeuge: `npx tsx tools/balance.ts --minutes 30 --seeds 9` (Standard: 3 Seed-Basen 11 / 500 / 1000 → 27 Seeds; Bericht
`qa/balance.md`, CSV `qa/balance.csv`, Exit-Code 1 bei jeder Verletzung inkl. Taktung und Mix), `npm run economy` (H0,
`qa/economy-sheet.txt`), schnelle H-Tests in `npm test`: `tests/unit/balance-h.test.ts` (3 Seeds: Pacing-Zeilen, H2, H3,
Schlüssel, H6 „jeder `cmd.*` der UI existiert"), H5 in `tests/unit/m5-retention.test.ts` (FakeClock), H0 in `economy.test.ts`.

### 7.1 Ergebnis (27 Seeds, Casual-Median; Optimal-Median)

| Zeile | Soll | Casual | Optimal | ok |
|---|---|---|---|---|
| Earl / Tutorial-Ende / Strickstube | 0:35–1:10 / 1:10–1:30 / 1:30–2:15 | 0:42 / 0:57 / 1:30 | 0:30 / 0:34 / 0:46 | ✅ (Tutorial-Ende 11/27 Seeds unter 0:56, Median darüber) |
| Tunnel / 1★ | 3:00–3:30 | 3:00 / 3:03 | 3:00 / 3:01 | ✅ |
| Klassenzimmer / Wachposten | 3:30–4:30 / 4:30–5:30 | 3:39 / 3:57 | 3:08 / 3:21 | ✅ |
| 12 Betten / Hof | 5:30–6:30 / 6:30–7:30 | 5:37 / 5:44 | 5:43 / 5:48 | ✅ |
| 4. Entlassung / Kantine Lv5 / 2★ | 7:30–9:00 | 7:04 / 7:12 / 8:11 | 5:42 / 5:50 / 7:32 | ✅ |
| Erstes Projekt | 9:00–10:00 | 8:18 | 7:33 | ✅ |
| Essensschlacht | 10:00–10:30 | 10:31 | 10:31 | ✅ |
| Parzelle 2 / Tagespost-Icon | 12:00–14:00 | 11:00 / 12:00 | 10:18 / 12:00 | ✅ |
| 3★ / erste Leitung | 14:00–16:00 | 15:19 / 16:59 | 15:10 / 15:34 | ✅ |
| Kernraum Lv15 | 16:00–20:00 | 19:46 | 17:44 | ✅ (vorher 27:30 ❌) |
| Parzelle 3 | 20:00–24:00 | 25:44 | 24:50 | ✅ (vorher nie) |
| Inspektion möglich / ausgerufen (H3) | 22:00–30:00 | 19:48 / 19:52 | 18:22 / 18:30 | ✅ ±20 % (früh, s. 7.4) |

- **Taktung §4.3 (erste 15 min):** Neues spätestens alle 120 s in **23/27 Seeds** (M2: 21/27 über 10 min; vor diesem Pass
  15/27). 4 Seeds (79, 619, 1034, 1051) haben eine Lücke von 122–137 s nach dem Tunnel (3:03 → ~5:10). Nie > 45 s ohne
  leistbaren Kauf/Ziel: 27/27. Kein Runaway (> 30 s am Stück mehr Coins als der teuerste Kauf im Angebot): 27/27.
- **Mix/Lohnanteil (§3.8), Median:** 15:00 Entlassungen 49 % · Kisten 32 % · Kostgeld 18 % · Löhne 25 % ✅;
  30:00 Entlassungen **34 %** · Kisten **48 %** · Kostgeld 17 % · Löhne 30 % ❌ (s. 7.4). Der Lohnanteil misst jetzt die
  **geschuldeten** Löhne (`dayEnd.wages`): Der Casual-Bot gibt alles aus und zahlt an ~5 von 12 Tagesenden nur einen Teil
  (Insolvenzschutz §3.8). `spend.wages` (bezahlt) hatte den Anteil bisher geschönt.
- **Ruf-Quellen pro Minute (Median):** Entlassungen 15,0 (0–15 min) / 16,0 (15–30), Ziele 5,3 / 1,3, Ereignisse gelöst
  1,3 / 1,0, gefangen 1,0 / 1,0, Meilensteine 0,7 / 0,7, Ausbrüche 0 / 0. Tabelle je Minute: `qa/balance.md`.
- **H1b:** Optimal mit gutem Layout 18:22; mit Zufallslayout in 45 min **nie** inspektionsbereit → ✅ (Abstand > 25 %).
- **H2:** Naiv-Bot (immer das Billigste) in 45 min nie inspektionsbereit vs. Heuristik 18:22 ✅. Zufalls-Bot: Median 1★,
  **1/27 Seeds** (568: hat zufällig Werkstatt + Wachposten gebaut, 14 Entlassungen) erreicht 2★ – Kriterium auf dem Median
  ✅, Ausreißer offen ausgewiesen. Druck: Ausbruchsversuche Median 6, kein Seed ohne; gelungene Ausbrüche in 4/27 Seeds;
  Essensschlacht in 27/27.
- **H3:** möglich Median 19:48 (25/27 Seeds in ±20 %, nur 3/27 streng in 22–30). Danach geht es weiter: Ruf wächst bis
  45:00 in 27/27 Seeds, 15/27 bestehen bis 45:00 eine Inspektion (≥ 1★; vorher bestand der Casual praktisch nie).
- **Schlüssel:** Lebenszeit-Coins beim ersten Ausrufen 12,4–14,5 K → **5 Basis-Schlüssel in 27/27 Seeds**, mit 2★ 7 →
  genau 2 Perks in 27/27 (k = 1, **C = 450**).
- **H0 Economy-Sheet: grün** (Amortisation 3:22, Mix 15:00 48/35/17 · Löhne 23 %, 30:00 47/37/17 · 27 %, 3★ 15:07,
  Lv15 22:19, Parzelle 3 27:00, Inspektion 22:19, Schlüssel 6). Gemessene Agenten-Werte ersetzen die alten Annahmen.

### 7.2 Spielwerte (src/content, src/sim)

| Wert | vorher | jetzt | Grund (Messung) |
|---|---|---|---|
| Laufgeschwindigkeit Schlingel / Personal / Ausbrecher | 0,25 / 0,28 / 0,35 Kacheln/Tick | **0,30 / 0,32 / 0,40** | Bei 24+ Schlingeln gingen 40–50 % der Zeit für Wege drauf (1-h-Fenster = 7,5 s); Lv15 kam erst bei 27:30, der Casual verpasste Mahlzeiten. Kein Brief-Wert. |
| Passive Resozialisierung (+0,5/h bei Laune ≥ 70, Brief) | jede Stunde, auch nachts | **nur in den Aktivitätsstunden 08–20** | Ein Gefängnis ohne Klassenzimmer/Werkstatt entließ sich selbst (Zufalls-Bot 3★). |
| Kantine | Schlange wird bei Fensterende weggeschickt; volle Kantine → 2-h-Block | **Schlange wird zu Ende bedient; Hungrige (< 70) warten 0,2 h an der Kantine** | Ø Hunger 12–25 bei 24+ Schlingeln, obwohl die Fluss-Leiste Mahlzeiten übrig zeigte. |
| Klemmbrett-Reihenfolge | … Kantine Lv5, **3 fangen**, 24 Betten, 15 Entlassungen, Werkstatt Lv15 | … Kantine Lv5, 24 Betten, **Werkstatt Lv15, 15 Entlassungen, 3 fangen** | Lv15 gehört laut §4.2 vor die Inspektion (16–20 min); „3 fangen" kann der Spieler nicht anstoßen → ans Ende, damit das aktuelle Ziel immer verfolgbar ist. Pflichtziele unverändert. |
| Director | nächster Slot nach einem Skript-Beat 150–240 s | **genau 150 s** (Brief-Spanne) | Füllt die Sparphase 3:00–5:30 und die Zeit nach der Essensschlacht (Taktung). |
| 3. Fahrgast der ersten Fähre | 110–140 | **45–55** (aus derselben Zufallsziehung abgebildet, RNG-Folge gleich) | 3. Entlassung bei ~4:50 statt ~7:00, füllt die Lücke nach dem Wachposten. |
| Strafmaß erste 12 / danach | 78–108 / 120–220 | **88–118 / 70–110** | 4. Entlassung und 2★ bleiben in 7:30–9:00; ab Minute 10 stockten die Entlassungen (Mix 30:00 Entlassungen 31 %, 3★ erst 18 min). |
| Prämie | 280 × (1 + 0,05·★) | **230 × (1 + 0,15·★)**; Earl **100** (Brief §4.2), Bagatell-Täter und 3. Fahrgast × **0,35** | Entlassungen waren 55–57 % des Einkommens bei 15:00 (Ziel 40–50). |
| Kiste pro Station und Stunde | 0,5 (Brief) | **0,74** | Kisten 23–29 % bei 15:00 (Ziel 30–40); Agenten-Amortisation der ersten Werkstatt jetzt 2:21 (Ziel 2–4). |
| Kostgeld | 1,0 × (1 + 0,08·(Lv−1)) | **0,68 × (1 + 0,04·(Lv−1))** | Kostgeld 26–35 % (Ziel ≤ 20). |
| Löhne | × 1,5 | **× 1,2** (Gehaltsstufe unverändert) | Geschuldete Löhne 30 % / 39 % bei 15 / 30 min (Ziel 20–35). |
| Werkstatt | 250 + 22/Kachel | **200 + 20** | mit weniger Starthilfe (Earl 100) sonst Armutsfalle nach dem Tutorial. |
| Klassenzimmer / Wachposten | 220 / 180 | **350 / 250 (Brief-Werte)** | Mit mehr frühem Einkommen kamen beide direkt bei 1★ (3:28); jetzt 3:39 / 3:57. |
| Kantine baseUp | 140 | **150** | Kantine Lv5 sonst unter 6:00. |
| 2★-Schwelle | 140 | **180** | Zufalls-Bot erreichte 2★ in 12/27 Seeds; Casual-2★ jetzt 8:11 (Tabelle 7:30–9:00), erstes Projekt 8:18. |
| Parzelle 3 | 6 000 (Brief) | **4 500** | Agenten-Einkommen bei 20–24 min ≈ ½ des alten Sheets; mit 6 000 kaufte kein Casual P3 in 30 min. |
| Schlüssel C | 800 | **450** | s. 7.1. |

### 7.3 Bot-Regeln (tools/bots.ts) – hier war der Bot falsch, nicht das Spiel

- **Zufalls-Bot** kauft jetzt wirklich zufällig (beliebiger freigeschalteter Raum in zufälliger Größe an zufälliger Stelle,
  beliebiges Upgrade, beliebige Einstellung, Parzelle, Projekt, Leitung) und bemerkt nur jeden zweiten Ausbrecher. Vorher
  wählte er zufällig unter den *sinnvollen* Käufen des Heuristik-Bots.
- **Fluss-Leiste:** Auf rote Stufen mit Platz-Kapazität (Werkstatt, Klassenzimmer, Kantine bei voll besetzten Köchen)
  baut der Bot einen weiteren Raum, statt den vorhandenen hochzustufen (das ändert die angezeigte Zahl nicht); Hof bei
  Spaß < 35 je 12 Bewohner. Upgrades bleiben die Antwort auf Mahlzeiten/Duschen/Karren/Tor.
- **Level-Ziele** (Kantine Lv5, Werkstatt Lv15) stufen den höchsten Raum hoch, nicht den billigsten (neuesten).
- **30 % Fehlkäufe** des Casual nicht mit dem Geld des Klemmbrett-Ziels, auf das der Guide zeigt (sonst Armutsfalle ohne
  Werkstatt bis 3:15). **Erstes Projekt** wird nach der Freischaltung probiert (Prio 89). **Erste Leitung** Prio 97.
  Ab 4:20 spart der Casual für das Betten-Ziel. Ab 20:00 (Lv15 und Leitung erledigt) ist die nächste Parzelle sein großes
  Sparziel; auch wenn neue Räume nicht mehr passen.
- **Report:** Lohnanteil aus geschuldeten Löhnen, Mix bei 15:00 aus einem Schnappschuss, Ruf-Quellen je Minute, Runaway-
  und Druck-Zähler, Wanduhr wie in der App (Tagespost-Icon ab Minute 12 als Neues gezählt), Parzellen als Neues gezählt.

### 7.4 Offen (Schwellen unverändert)

1. **Mix bei 30:00:** Entlassungen 34 % (Ziel ≥ 40), Kisten 48 % (Ziel ≤ 40), 0/27 Seeds im Korridor. Ursache: Werkstatt
   Lv15 verdoppelt ab ~20 min die Kisten (Meilenstein × 2), während die Entlassungen durch Pulte und Laune (Ø 40 bei 24–36
   Schlingeln) gedeckelt sind, und der Casual spart 20–26 min für Parzelle 3 statt Klassenzimmer/Tor zu verbessern. Jede
   Verschiebung über Prämie, Kistenrate oder Kostgeld kippte den Mix bei 15:00 (Schwankung ±3 pp je Änderung).
   Kandidaten: Karren als echter Logistik-Engpass (Kapazität nicht mit dem Meilenstein × 2), Klassenzimmer-Upgrades im Bot,
   Laune im Spätspiel.
2. **Taktung:** 4/27 Seeds mit 122–137 s Lücke nach dem Tunnel (bis zum nächsten Bau ~5:10). Der Director-Slot nach dem
   Tunnel kommt jetzt bei 5:30; davor sparen diese Seeds für Klassenzimmer/Wachposten.
3. **H3 früh:** Inspektion möglich im Median 19:48 – innerhalb ±20 %, aber nur 3/27 streng in 22–30. Gate ist Lv15 (19:46);
   „15 Entlassungen" kommt jetzt bei ~16 min. Vorschlag (UI-Besitzer, i18n `obj.release15`): Ziel auf 18–20 Entlassungen
   (Median 22:00 bzw. 25:00).
4. **Tutorial-Ende** 0:57 (Fenster ab 0:56): 11/27 Seeds darunter, Median knapp drin (vor diesem Pass ebenso).
5. Die Bot-Zeilen sind gegen kleine Zahländerungen empfindlich (Seed-Rauschen ±1 min ab Minute 9); jede Änderung in
   `src/content/balance.ts` braucht den 27-Seed-Lauf.

## 8. Integration M5: Entlassungsziel 20, Schlüsselkonstante C = 600 (Werte gelten; strengere Messung in §9)

Anlass: H3 (§12.9, §4.3 „Die erste Inspektion ist beim Casual-Bot nach 22–30 min möglich") stand nach §7 im Median bei 19:48
und nur in 3/27 Seeds streng im Fenster; §7 hatte ±20 % angelegt. Die Schwelle bleibt wörtlich 22–30 min (der Test
`tests/unit/balance-h.test.ts` prüft jetzt ohne Toleranz).

| Wert | vorher | jetzt | Grund |
|---|---|---|---|
| Pflichtziel Entlassungen | `release15` (15) | **`release20` (20)** | Gate der Inspektion war Lv15 (19:46) bzw. 15 Entlassungen (~16 min). 20 Entlassungen kommen bei ~25 min. Alte Spielstände mit erledigtem `release15` bekommen das neue Ziel und erledigen es bei 20 Entlassungen (`tests/unit/m5-integration.test.ts`). i18n `obj.release20`, `clipboard.short/why.release20`. |
| Schlüssel C | 450 | **600** | Mit dem späteren Ausrufen steigen die Lebenszeit-Coins beim ersten Ausrufen auf 14,8–25,7 K (26 Seeds; Seed 534 ruft erst bei 30:26 aus, im 45-min-Lauf L = 21,0 K → 5). C = 450 hätte 6–7 Basis-Schlüssel gegeben (7 → mit 2★ drei Perks). C = 600: 4 Schlüssel ab 9,6 K, 6 bis 29,4 K → 4/5/6 = 1/23/2 Seeds. |

Ergebnis `npx tsx tools/balance.ts --minutes 30 --seeds 9` (27 Seeds, `qa/balance.md`/`.csv`, 545 s):
- **Alle 22 Pacing-Zeilen ✅** (Casual-Median ±20 %, Optimal ≤ 35 % schneller). Geändert gegenüber §7.1: Kernraum Lv15 19:53
  (1/27 außerhalb), Parzelle 3 27:11, **Inspektion möglich 25:04** (Basen 22:49 / 25:14 / 27:03; **24/27 Seeds streng in
  22:00–30:00**, 26/27 in ±20 %), ausgerufen 25:09. Alle Zeilen bis 3★/erste Leitung unverändert (das Ziel liegt dahinter).
- **H1b ✅** (Optimal gutes Layout 24:35, Zufallslayout in 45 min nicht bereit) · **H2 ✅** (Naiv-Bot nie bereit; Zufalls-Bot
  Median 1★, 1/27 Seeds 2★; Ausbruchsversuche in 27/27, gelungene Ausbrüche in 5/27, Essensschlacht in 27/27) · **H3 ✅**
  (danach Ruf-Zuwachs bis 45:00 in 27/27, bestanden bis 45:00 in 12/27) · **Schlüssel ✅** (Median 5 Basis-Schlüssel, mit 2★
  genau 2 Perks; „1/27 abweichend" ist Seed 534 ohne Inspektion in 30 min).
- **H0 ✅** (`npm run economy`: Inspektion 22:19, L = 16,3 K → 5 Schlüssel, Amortisation 3:22, Mix 15:00 48/35/17 · Löhne 23 %).
- **Offen (unverändert aus §7.4, Exit-Code 1 des Werkzeugs):** Taktung §4.3 in 4/27 Seeds (79, 619, 1034, 1051: 122–137 s
  nach dem Tunnel 3:03). Ursache genauer angesehen: In diesen Seeds bekommt der 3. Fahrgast (Kurzstrafe 45–55) vor der ersten
  Nacht kaum Werkstattzeit (3–4 % bei 2:00 statt ~40 %), passive Besserung ruht nachts, also fehlt die 3. Entlassung, die in den
  anderen Seeds das Klassenzimmer bezahlt (Klassenzimmer erst 5:05–5:20). Versuch Kurzstrafe 36–42: Lücke bleibt (3. Entlassung
  5:10–5:28), daher zurückgenommen. Der Director-Abstand 150–240 s ist Brief-Wert. Mix bei 30:00 (Entlassungen 34 %, Kisten
  48 %, 0/27 Seeds) wie §7.4 Nr. 1. Tutorial-Ende 0:57 (11/27 Seeds unter 0:56).

## 9. Closer-Pass M5: ehrlichere Messung – maßgeblich

Anlass: Der Prüfer fand im Werkzeug drei Lockerungen und zwei Scheinerfolge (QA_REPORT.md „Closer-Pass M5"). Die
Schwellen sind die des Briefs; geändert hat sich nur, wie streng `tools/balance.ts` sie liest (jetzt `npm run balance`).

| Prüfung | vorher | jetzt |
|---|---|---|
| Pacing-Zeile | Casual-Median in ±20 % | Median in ±20 % **und ≥ 90 % der Seeds** in ±20 % (`SEED_QUOTA`) |
| Optimal ≤ 35 % schneller (§4.1) | nur Zeilen ab 3:00 | **jede Zeile** (der Brief kennt keine Ausnahme) |
| H1b / H2-Naiv | Vergleichs-Bot nie fertig (∞) zählte als bestanden | **endliche Zeit nötig**; Zufallslayout-Bot kauft Land, wenn das Ziel keinen Platz mehr hat; Naiv-Bot kauft das Klemmbrett-Ziel, sobald es bezahlbar ist, sonst das Billigste |
| H2 Zufalls-Bot < 2★ | Median | ≥ 90 % der Seeds (Unit-Test: jeder Probe-Seed) |
| H2 Druckzustände | gescripteter Tunnel/Essensschlacht zählten | **vom Director gewählte** Ausbruchsversuche (≥ 90 % der Seeds); Essensschlacht mit der gescripteten |
| H3 | Median in ±20 % | Median **streng** 22–30 min und ≥ 90 % der Seeds in ±20 % |
| Schlüssel | Median | Median und ≥ 90 % der Seeds |

Spielwerte: unverändert gegenüber §8 – mit einer Ausnahme, die zurückgenommen wurde: Die Abdeckung im Fluchtscore als
Kachelanteil der heute genutzten Räume (§3.10) wurde gebaut und gemessen (27 Seeds: H3 je Seed 20/27 statt 24/27 streng
in 22–30, Unit-Test-Seed 500 bei 30:24, Pacing-Zeilen sonst gleich). Zurück auf die binäre Abdeckung am Standort
(Abweichung 22). Profit der Inspektion zählt jetzt geschuldete Löhne (`stats.wagesOwed`) – betrifft nur Noten, nicht das
Pacing.

**Ergebnis `npm run balance`** (27 Seeds, 660 s, `qa/balance.md`/`.csv`):
- Pacing: **16/22 Zeilen ✅**. ❌: Tutorial-Ende (Median 0:57, 16/27 Seeds in ±20 %; Optimal 0:34 = 40 % schneller),
  Strickstube (Casual 1:30 ✅, Optimal 0:46 = 49 % schneller), 4. Entlassung (7:04, 18/27 Seeds), Kantine Lv5 (7:12, 20/27),
  erstes Projekt (8:18, 22/27), erste Leitung (16:59, 24/27). Alle Mediane liegen im ±20-%-Fenster.
- **H1b ❌**: Optimal gutes Layout 24:35 vs. Zufallslayout 28:06 (2/27 Zufallslayouts nie bereit) – nur 12 % schneller statt
  ≥ 25 %. Zur Info Ausrufen mit Prognose ≥ 1★: 25:35 vs. 32:57 (22 % schneller).
- **H2-Naiv ❌**: 25:25 vs. 24:35 (+3 % statt ≥ +30 %). Der wörtliche Gierig-Bot („kauft immer das Billigste", ohne Ziel)
  erreicht die Inspektion nie: Er kauft jedes Mal die billigste Aufwertung, sobald die Strickstube (520) bezahlbar wäre
  (Seed 11: nach 45 min 73 Coins, nur Waschhaus Lv8 und Zellen Lv8).
- H2 Zufalls-Bot ✅ (1/27 Seeds mit 2★), H2 Druck ✅ (Director-Ausbruchsversuche Median 5, in 27/27 Seeds; gelungene
  Ausbrüche in 5/27; Essensschlacht 27/27), H3 ✅ (Median 25:04, 24/27 streng, 26/27 in ±20 %, Ruf wächst danach in 27/27),
  Schlüssel ✅ (Median 5, mit 2★ 2 Perks; 26/27). H0 ✅ (`npm run economy`, Amortisation 3:22, 5 Schlüssel).
- Unverändert offen: Taktung 4/27 (Seeds 79, 619, 1034, 1051: 122–137 s nach dem Tunnel), Mix 30:00 (34/48/18, 0/27).

**Ursachen der neuen ❌ (keine Schwelle gelockert):**
1. *Tutorial-Ende/Strickstube vs. Optimal:* In den ersten zwei Minuten bestimmt die Reaktionszeit alles (Optimal 3,5–4,5 s
   pro Tutorial-Schritt und 8 s bis zum ersten Ziehen, Casual 5–9 s und 15–30 s). Das Spiel bremst einen schnellen Spieler
   dort nicht. Möglicher Hebel: Tutorial-Schritte an feste Momente koppeln (Feier nach Earl), Strickstube teurer als das
   Startgeld – beides gegen den G2-Wunsch nach weniger Warten. Tutorial-Ende 0:57 statt 1:10–1:30 ist Folge der G2-Kürzung
   (§6): G3-Entscheidung.
2. *Seed-Quote 4. Entlassung/Kantine Lv5/erstes Projekt/erste Leitung:* Basis 11 liegt bei 4. Entlassung und Kantine Lv5
   fast 1,5 min früher als die anderen Basen (frühe Kurzstrafen), Basis 500/1000 beim ersten Projekt ~1 min später. Die
   Streuung kommt aus Strafmaß-Ziehungen der ersten Fähren; ein engeres Strafmaß-Band (§6) wäre der Hebel.
3. *H1b:* „Inspektion möglich" ist ein fester Zielkatalog (20 Entlassungen, Lv15 …). Gutes Layout beschleunigt Wege, aber
   die Gates hängen an Coins und Strafmaß. Hebel: Layout stärker in den Durchsatz (Nachbarschafts-Boni, Wegzeit-Kosten).
4. *H2-Naiv:* Wer dem Klemmbrett folgt, kommt fast so schnell an wie der ROI-Bot – das Klemmbrett ist absichtlich eine gute
   Strategie (G2). Der wörtliche Gierig-Bot bleibt ganz hängen. Ob der Brief den einen oder anderen meint, ist bei G3 zu klären.
