# SIM_DESIGN – Vertrag der headless Simulation (M2)

Verbindlich für alle Module unter `src/sim/`. Ergänzt Brief §3, §9.4 und §9.5. Bei Widerspruch gilt der Brief. Zahlen stehen nur in `src/content/balance.ts`.

## 0. Grundregeln
- `src/sim/**` importiert nie `pixi.js`, DOM-Globals oder `performance`. ESLint erzwingt das.
- **Determinismus:** gleicher Seed, gleiche Befehlsfolge (Tick-genau) und gleiche Tick-Zahl ergeben den gleichen State-Hash. Zufall kommt nur aus `world.rng` (mulberry32, State im Save). Iteration nur über Arrays in fester Reihenfolge (nach `id`), nie über `Map`/`Set` mit unsortierten Schlüsseln, wenn die Reihenfolge das Ergebnis beeinflusst.
- **Zeit:** 1 Tick = 1/75 Spielstunde (0,8 Spielminuten). Tag (06–22): 10 Ticks pro Echtzeit-Sekunde bei 1×. Nacht (22–06): 20 Ticks pro Sekunde. Pro Tick bleibt der Spielzeit-Schritt gleich, nur die Tick-Zahl pro Frame ändert sich. `world.t` zählt Ticks seit Tag 0 um 00:00. Ein neues Spiel beginnt bei `t = 7·75`.
- **Echtzeit-Äquivalent:** `world.rtMs` (Integer) wächst pro Tick um 100 (Tag) oder 50 (Nacht). Alle Brief-Timer in „Echtzeit-Sekunden bei 1×“ (Director, Projekte, Cooldowns, Tunnel-Sprint, Bauzeit, Tor 10 s, Karren 20 s, Fähre 20 s Wartezeit) laufen über `rtMs`.
- **Raten:** pro Spielstunde. Pro Tick wird `rate / 75` addiert.
- Positionen sind Kachel-Koordinaten als Float. Kachel (x, y) hat ihr Zentrum bei (x + 0,5, y + 0,5). Ein Agent „steht auf“ Kachel `floor(x), floor(y)`.

## 1. Raster (`grid.ts`)
- `W = 32, H = 30`, Index `i = y·W + x`.
- `ground: Uint8Array` (Ground-Enum aus `content/site1.ts`): Water = nicht begehbar, Sand/Grass/Path/Dock = begehbar.
- `owned: Uint8Array`: 1 = Kachel liegt in einer gekauften Parzelle (bebaubar, falls Grass/Path).
- `roomAt: Int16Array`: Raum-Index + 1 für Innenkacheln, sonst 0.
- **Wände liegen auf Kanten:** `wallE[i]` = Wand zwischen (x, y) und (x+1, y). `wallS[i]` = Wand zwischen (x, y) und (x, y+1). Eine Tür ist eine fehlende Wand.
- `blocked: Uint8Array`: 1 = Kachel nicht betretbar, z. B. Baustelle im Bau oder große Deko (in v1 ungenutzt, immer 0).

## 2. Pfadfindung (`pathfield.ts`)
- **Distanzfelder:** Dijkstra mit 8 Nachbarn auf dem Raster. Kosten: gerade 10, diagonal 14. Diagonal nur, wenn beide orthogonalen Teilschritte erlaubt sind (keine Ecke durch eine Wand). Ein Schritt auf eine Path- oder Dock-Kachel kostet ×0,8, also 8 bzw. 11 (Agenten bevorzugen Wege). Ergebnis `Uint16Array`, `0xFFFF` = unerreichbar.
- `distanceField(grid, targets: number[], out?)`. Ziele haben Distanz 0.
- `nextStep(grid, field, i)`: Nachbar mit minimaler Distanz. Bei Gleichstand gilt die feste Reihenfolge N, E, S, W, NE, SE, SW, NW. Liefert −1, wenn `i` Ziel oder unerreichbar ist.
- `components(grid)`: Zusammenhangs-Labels für „erreichbar?“.
- Neuberechnung **komplett** bei jeder Bauänderung (kein inkrementelles Patchen, kein A*).
- Budget: ein Feld < 0,2 ms in Node, alle Felder zusammen < 5 ms.

## 3. Räume und Layout (`layout.ts`, `rooms.ts`)
- `Room`: `{ id, type, x, y, w, h, level, stage, door: {x, y, side}, slots: Slot[], queue: Tile[], built: boolean, buildEndMs, clean: 0..100, staffIds, ... }`. `x, y, w, h` beschreiben das Innenrechteck. Die Wände liegen auf dem Rand.
- **Tür:** `door.x, door.y` ist die Innenkachel an der Öffnung, `side` die Wandseite. Standard: Mitte der Seite, deren Außenkachel die kleinste Weg-Distanz zum Hauptweg hat. Ein Klick versetzt die Tür.
- **Berührende Räume** teilen sich die Kantenwand. In der Mitte der gemeinsamen Kante entsteht automatisch eine Verbindungstür (Brief §3.6).
- **Platzierungsregeln** (`validatePlacement`), Rückgabe ist ein Grund-Code:
  - `tooSmall`: unter der Mindestgröße.
  - `outside`: nicht vollständig in eigenen, bebaubaren Kacheln (Grass oder Path).
  - `overlap`: überschneidet einen anderen Raum, das Tor, den Steg, das Depot oder das Büro.
  - `blocksPath`: Danach ist Steg ↔ Tor nicht mehr verbunden, oder die Tür eines anderen Raums ist unerreichbar.
  - `onRoad`: überschneidet die Freiheitsstraße (fest vorgebaut, nie bebaubar).
  - `ok`.
- **Möbel-Packer** (deterministisch je Raumtyp): Er liefert `slots` (Nutzpunkte mit Blickrichtung) und `furniture` (Sprite-Name + Position in Welteinheiten für den Renderer). Regeln:
  - Die Türkachel und die Kachel davor bleiben frei.
  - Gänge sind 1 Kachel breit.
  - Kapazität = `roomSlots(type, w, h)` aus `balance.ts`, höchstens so viele, wie physisch passen.
  - Warteschlangen-Kacheln liegen an der Innenwand neben der Tür und blockieren den Gang nicht.
- **Nachbarschafts-Boni** (Tür-zu-Tür-Weglänge ≤ 4 Kacheln) und **Lärm-Malus** (Werkstatt oder Hof < 3 Kacheln Rechteck-Abstand zu einem Zellentrakt) berechnet `layout.ts` als reine Funktion des Raumbestands. Siehe Brief §3.5.

## 4. Agenten (`agents.ts`, `needs.ts`)
- Gemeinsame Felder: `id, kind ('rascal' | 'staff' | 'crew' | 'visitor'), x, y, dir, state, target, timer, speed`.
- **Laufen:** 0,25 Kacheln pro Tick bei Schlingeln, 0,28 bei Personal, 0,35 bei Ausbrechern. Außerhalb von Räumen folgt der Agent dem Distanzfeld seines Ziels von Kachelzentrum zu Kachelzentrum. Innerhalb des Zielraums geht er gerade zum Slot (Räume sind konvex).
- **Tür-Reservierung:** Pro Tick darf ein Agent eine Türkachel betreten (innen oder außen). Wer keine Reservierung bekommt, wartet einen Tick. Ausweichen (Separation) gibt es nicht auf Türkacheln.
- **Watchdog:** 8 s (rtMs) ohne Fortschritt zum Ziel → neu pfaden. 15 s → Teleport auf die nächste erreichbare Kachel. Der Zähler `world.stats.teleports` zählt mit.
- **Schlingel-Zustände:** `arriving` (Fähre → Steg) → `idle` → `walking` → `queued` → `using` → `idle` … → `toGate` → `atGate` → `released` (läuft die Freiheitsstraße hinaus und wird entfernt). Sonderzustände: `escaping`, `dazed` (3 s), `waitingDock`, `brawling`.
- **Aktivitätswahl** (in `idle`, deterministisch):
  1. 22–06 → Bett (`sleep`). Energie +12/h × Raum-Level-Faktor bis 06:00.
  2. Mahlzeitfenster (07–08, 12–13, 18–19) und Hunger < 85 → Kantine.
  3. Dringendstes freigeschaltetes Bedürfnis < 50 (Hunger nur im Fenster) → passender Raum.
  4. 08–20: Unterricht (freier Pult, Lehrer da) → Werkstatt (freie Station) → Hof (Spaß < 90) → Herumlungern auf dem Hof bzw. vor dem Zellentrakt.
  5. 20–22: Hof oder Dusche nach Bedarf, sonst vor dem Zellentrakt warten.
  - Die Slot-Wahl nimmt den nächstgelegenen freien Slot. Ist keiner frei, stellt sich der Schlingel in die Warteschlange, falls ein Platz frei ist, sonst wählt er neu.
- **Nutzungsdauer** (Spielzeit) und Wirkung:
  - Mahlzeit: 0,5 h / Durchsatzfaktor → Hunger +60.
  - Dusche: 0,5 h / Durchsatzfaktor → Hygiene +70.
  - Unterricht: Block 2 h, Resozialisierung +6/h × LvFaktor × Laune-Faktor.
  - Werkstatt: Block 2 h, Kisten 0,5/h × LvFaktor × Laune-Faktor, Resozialisierung +2/h × Laune-Faktor.
  - Hof: Block 1,5 h, Spaß +20/h.
  - Ein Block wird abgebrochen, sobald ein Bedürfnis < 15 fällt **und es sich gerade decken lässt** (Kantine im Mahlzeitfenster mit freiem Platz, freie Dusche, Hof vorhanden). Sonst würde der Schlingel in einer Schleife hin- und herlaufen (Bot-Messung M2).
- **Durchsatzfaktor eines Raums** = `levelMult(lvl)` × Personalfaktor. Beispiel Kantine: Bedient werden nur `min(Plätze, Köche × 8)` Plätze, die übrigen Plätze bleiben gesperrt. Personal-Level: +5 % je Level.
- **Bedürfnisse** nach Brief §3.9, inklusive Freischalt-Regel: Ein Bedürfnis ist fest 80, bis sein Raumtyp freigeschaltet ist. Nachts sinkt alles außer Energie nur halb so schnell. Ankunft mit Hygiene 25.
- **Laune** = gewichteter Schnitt + Deko-Aura + Modifikatoren, auf 0–100 begrenzt. Laune-Faktor = 0,5 + Laune/100.
- **Eigenschaften** nach Brief §3.9.

## 5. Personal (`staff.ts`)
- **Koch:** steht am Tresen. **Lehrer:** an der Tafel. **Vorarbeiter:** geht zwischen den Stationen.
- **Hausmeister:** geht zum Raum mit der niedrigsten Sauberkeit und reinigt ihn mit +30 pro Spielstunde.
- **Wache:** patrouilliert zwischen Wachposten und Hof bzw. Patrouillenpunkt. Ausbrecher im Radius fängt sie automatisch.
- **Sachbearbeiter:** sitzt im Schalter am Tor.
- **Karrenfahrer:** fährt den Karren. Ab 6 Kisten im Werkstattstapel (oder per Tap) fährt der Karren vom Depot zur Werkstatttür und wieder zurück. Die Kisten werden am Steg verkauft. Die Fahrzeit ergibt sich aus der Wegstrecke, so wirkt der Nachbarschaftsbonus von selbst.
- **Bautrupp** (2 Biber, kostenlos): läuft zur Baustelle. Die Bauzeit beträgt 2–6 s Echtzeit, skaliert mit der Fläche.

## 6. Ökonomie (`economy.ts`)
- Alle Einnahmen und Ausgaben laufen über `earn(kind, amount)` bzw. `spend(kind, amount)` und werden in `world.stats.income[kind]` und `stats.spend[kind]` mitgezählt.
- **Kostgeld:** wird jede Spielstunde für zugewiesene Betten fällig und erscheint in Echtzeit etwa alle 10 s als Coin-Pop-Event.
- **Löhne:** um Mitternacht. Reicht das Geld nicht, arbeitet das Personal am Folgetag 30 % langsamer.
- Coins fallen nie unter 0.
- Darlehen nach Brief §3.8.

## 7. Fähre, Tor, Ereignisse
- **Fähre:** legt um 07:00 und 15:00 an. Ohne Horn-Tap wartet sie 20 s (rtMs) und bringt dann 50 % weniger Schlingel.
- **Aufnahme:** nur mit freiem Bett. Höchstens 6 Schlingel warten am Steg. Die Fähre fährt 15 s nach dem Anlegen mit dem Rest weiter (Event `ferryLeftWithRest`).
- **Tor:** Schlingel mit 100 % stellen sich an. Verarbeitet wird 1 Schlingel pro 10 s (rtMs). Prämie und Ruf nach `balance.ts`. Ausnahme Tutorial: Earl wartet auf den Stempel-Tap.
- **Director und Ereignisse** nach Brief §3.12:
  - Tunnel und Essensschlacht sind P0, VIP ist P0.
  - Gescriptete Termine: Tunnel bei rtMs ≈ 180 000, Essensschlacht bei ≈ 600 000.

## 8. Befehle (`commands.ts`)
UI und Bots nutzen dieselben Befehle. Sie werden zu Beginn des nächsten Ticks angewendet und liefern `{ ok, reason?, cost? }`:
- **Bauen und Räume:** `build(type, x, y, w, h)`, `resize(roomId, x, y, w, h)`, `moveDoor(roomId, side, offset)`, `upgrade(roomId, n)`, `demolish(roomId)`, `undoLastBuild()`.
- **Personal und Parzellen:** `hire(role, roomId?)`, `fire(staffId)`, `buyParcel(id)`.
- **Handgriffe:** `tapHorn()`, `tapCrates(roomId)`, `tapEscapee(agentId)`, `tapRangler(agentId)`, `stamp(agentId)`.
- **Geschwindigkeit:** `setSpeed(n)`.

## 9. Ereignis-Log (`world.events`)
Ein Ringpuffer aus `{ t, rtMs, type, ...data }` für Renderer, Audio, Tests (E, D10) und Bots. Typen:
- `arrive`, `release`, `coins`, `ruf`, `star`
- `build`, `built`, `upgrade`, `milestone`, `hire`
- `ferryDock`, `ferryLeave`, `crateSold`, `cartDepart`
- `tunnel`, `caught`, `escaped`, `foodFight`, `calmed`, `ruckus`
- `objective`, `unlock`, `dayEnd`, `loan`, `teleport`, `stuck`

## 10. Invarianten (`invariants.ts`, im Debug-Modus jeden Tick)
- Anzahl Schlingel = zugewiesene Betten + Wartende am Steg + Schlingel auf dem Weg hinaus (released, noch sichtbar).
- Kein Agent steht auf einer Wasserkachel.
- Kein Agent kreuzt eine Wandkante. Geprüft beim Schritt: Bewegung von Kachel a nach Kachel b nur, wenn `canStep`.
- Alle Räume sind erreichbar oder als `unreachable` markiert.
- Keine NaN- oder Infinity-Werte in Agentenpositionen, Bedürfnissen, Coins oder Ruf. Coins ≥ 0.

## 11. State-Hash (`hash.ts`)
FNV-1a über eine kanonische Serialisierung von Welt-State, Agenten und RNG-State. Abgeleitete Caches (Distanzfelder, Render-Interpolation) bleiben außen vor.
