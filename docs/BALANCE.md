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
| Schlüssel C | – | **2.000** (k = 1) | Lebenszeit-Coins bis ~30 min ≈ 69 K → 5 Basis-Schlüssel |
| Pflichtziele | Brief nennt Beispiele | Workshop, Classroom, Guard Post, Own 24 beds, Release 15, **Workshop Lv15**, Catch 3 | Mit den leichteren Zielen (Release 5, Canteen Lv5) wäre die Inspektion schon bei 13:20 möglich |

## 3. Widersprüche im Brief

1. **Lv15 im Kernraum:** §3.7 nennt „bis etwa Minute 12", die Pacing-Tabelle §4.2 „16:00–20:00". Es gilt die Pacing-Tabelle. Das Sheet erreicht Lv15 bei 21:42 (Ziel 20:00 + 20 %).
2. **Pacing-Tabelle 0:35–1:10:** Dort steht „+100 Coins" für Earls Entlassung. Mit der neuen Prämie sind es +294. Die Tabelle ist an dieser Stelle durch die Tuning-Regel überholt.
3. **Karren als Engpass:** Ab ~15 min begrenzt der Karren (6 Kisten / 20 s) den Kistenverkauf. Das ist beabsichtigt („Logistik-Engpass") und braucht in der Fluss-Leiste eine eigene Stufe „Cart". Das Modell rechnet mit Depot-Upgrades, der Logistik-Leitung ab 3★ und dem Projekt „Speedy Carts" bei ~18 min.

## 4. Offene Punkte für H1 (Agenten-Bots)
- Ist der Anteil von 62 % aktiver Zeit (Rest: Mahlzeiten, Dusche, Wege) realistisch? Er bestimmt Reform- und Kistentempo direkt.
- 3★ liegt früh, die Amortisation spät: beide nachmessen.
- Ab ~20 min fehlen dem Casual-Modell sinnvolle Käufe. Prüfen, ob nach dem Kauf von Parzelle 3 genug Ziele bleiben (Regel „nie 45 s ohne Ziel").
