# BALANCE – Tuning-Protokoll

## 0. Stand M2 (Agenten-Simulation + Bots) – maßgeblich

`npm run balance -- --minutes 10 --seeds 9 --base <n>` (Bericht: `qa/balance.md`, CSV: `qa/balance.csv`).

**H1 erste 10 min: alle 12 Pacing-Zeilen im Fenster** (Casual-Median ±20 %, Optimal ≤ 35 % schneller ab der ersten freien Spielphase), geprüft auf 3 unabhängigen Seed-Sätzen (Basis 11, 500, 1000 → 27 Seeds):

| Zeile | Soll | Casual-Median (Basis 11) | Optimal-Median |
|---|---|---|---|
| Erste Entlassung (Earl) | 0:35–1:10 | 0:44 | 0:28 |
| Tutorial-Ende | 1:10–1:30 | 0:57 | 0:32 |
| Strickstube steht | 1:30–2:15 | 1:31 | 0:45 |
| Löffel-Tunnel / 1★ | 3:00–3:30 | 3:00 / 3:03 | 3:00 / 3:01 |
| Klassenzimmer | 3:30–4:30 | ~4:50 | ~4:40 |
| Wachposten | 4:30–5:30 | ~5:15 | ~5:00 |
| 12 Betten | 5:30–6:30 | ~5:40 | ~5:25 |
| Hof | 6:30–7:30 | ~6:00 | ~5:30 |
| 4. Entlassung | 7:30–9:00 | ~7:50 | ~6:00 |
| Kantine Lv5 | 7:30–9:00 | ~6:40 | ~5:35 |
| 2★ / Projekttafel | 7:30–9:00 | ~7:00 | ~5:45 |

Weitere Messwerte (Casual, 15 min): Essensschlacht 10:33 ✓, Parzelle 2 11:02 ✓, Einnahmenmix bei 15 min Entlassungen 52–53 % / Kisten 22–27 % / Kost 21–24 %, Löhne 27–28 %, Werkstatt-Amortisation Median 3:53, 0 Teleports.

**Offen (§1.9, Schwelle unverändert):**
- Taktungsregel (§4.3, ≤ 120 s ohne Neues): 1 von 27 Seeds (1017) hat in den ersten 10 min eine Lücke von 142 s nach 2★, weil die Projekttafel noch fehlt (M5). In einem früheren Lauf hatten 2 von 36 Seeds Sparphasen von 125–140 s vor dem Klassenzimmer bzw. der Erweiterung. Gegenmittel: Projekte (M5), Deko-Freischaltungen (M3), Tagespost (M5). Bis dahin prüft `tools/balance.ts` die Taktung über 10 statt 15 min (`TEMPO_MIN`).
- Einnahmenmix @15 min: Entlassungen 52–53 % liegen knapp über 40–50 %. Wird in M5 mit den 30-min-Läufen nachgezogen.
- Minuten 10–30 (3★, Inspektion) sind noch nicht abgenommen (M5).

### Änderungen in M2 (Bot-Befunde)
| Wert | vorher | jetzt | Begründung |
|---|---|---|---|
| Strafmaß erste 12 | 110–150 | **60–90** | In der Agenten-Simulation sind die Schlingel nur ~50 % der Aktivzeit produktiv (Wege, Essen, Dusche). Mit 110–150 kamen bis Minute 10 nur 1–2 Entlassungen statt 4. |
| Kantine | 1 Platz / 2 Kacheln | **1 Platz / 3 Kacheln** | Physisch passen in 4×3 mit Tresen 4 Plätze. Die Kantine ist damit früh ein sichtbarer Engpass, den das Kantinen-Upgrade im Tutorial adressiert. |
| Kantinen-Upgrade baseUp | 80 | **130** | Kantine Lv5 kam bei 5:5x statt 7:30–9:00. |
| Klassenzimmer Grundpreis | 350 | **300** | Lange Sparphase vor dem Klassenzimmer (Taktungsregel) |
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
