# M5_DESIGN – Vertrag „Rest von Standort 1“ (verbindlich für M5)

Grundlage: Brief §2.2, §3.2, §3.3, §3.8, §3.11–§3.13, §3.15–§3.18, §4, §5, §6, §9.7, §11.1, §12 (A–J), §12.3 (B1-Screens Projekttafel, Rückkehr-Panel, Inspektionsergebnis, Versetzung). Ergänzt `SIM_DESIGN.md` (Sim-Regeln gelten weiter) und `UI_DESIGN.md` (UI-Pflichtregeln gelten weiter). Bei Widerspruch gilt der Brief, außer bei den dokumentierten Abweichungen (PROGRESS.md „Abweichungen“).

Außerhalb von M5: Standort 2 (P0b, M6), Hausregeln und Überraschungsinspektion (P1). Nichts davon bauen, nichts davon verbauen: Standort 2 ist als `SITES[1]` mit `available: false` angelegt, Leitungs-Plätze und Leitungen sind pro Standort tabelliert, die Versetzung nimmt ein Ziel-`site`.

Dieses Dokument ist der Vertrag zwischen vier parallelen Buildern (`sim-progress`, `sim-retention`, `ui-m5`, `art-m5`). **Wem eine Datei gehört, der allein ändert sie** (Abschnitt 14). Gelesen wird über die hier genannten APIs.

---

## 0. Grundregeln (zusätzlich zu SIM_DESIGN §0)

1. **Determinismus.** Alle neuen Systeme laufen im Tick oder in geloggten Befehlen (`cmd.*`). Zufall nur über `rngNext/rngInt(w)`. Ausnahme Wanduhr: `src/sim/wall.ts` (`syncWall`, `beginSession`, `resumeSession`, `markSessionEnd`) bekommt Wanduhr-Zeit als Argument von der App (`Clock`). Das sind externe Eingaben, deterministisch in ihren Argumenten; sie verbrauchen **nie** den Sim-RNG (Tagespost wählt per eigenem Hash aus Seed und Tag). `Date`/`Date.now()`/`performance` sind in `src/sim/**` verboten (ESLint).
2. **Echtzeit-Timer** (Projekte, Gans-Rundgang, Tumult-Meter, Director-Abstände) laufen über `w.rtMs` bzw. `tickMs()`: 1× normiert, 2× halbiert sie in Wanduhr-Zeit, Pause stoppt sie. Offline laufen nur Projekt-Timer weiter (§7).
3. **Neutral im frischen Spiel.** Alle Effekt-Helfer in `src/sim/effects.ts` liefern ×1 bzw. +0, solange nichts gekauft ist. Die M2–M4-Balance bleibt dadurch unberührt, bis ein Projekt, eine Leitung oder ein Perk greift.
4. **Zahlen** stehen nur in `src/content/balance.ts` (Kernökonomie, Director, Offline, Inspektion, Prestige-Formel), `src/content/progress.ts` (Projekte, Leitungen, Perks, Standorte, Folgeziele) und `src/content/retention.ts` (Tagespost, Morgen-VIP, neue Director-Feinwerte). Mit `(brief)` markierte Werte sind bindend; der Rest sind Startwerte für den Balance-Pass (Begründung in `BALANCE.md`).
5. **Hash und Save.** Jeder neue State liegt in `World`, ist serialisierbar (nur JSON-Werte, keine Maps/Sets/Typed Arrays) und wird damit automatisch vom State-Hash (`hash.ts`, überspringt nur `cache`, `events`, `eventSeq`, `debug`) und vom Save erfasst. Abgeleitetes gehört in `w.cache` oder wird bei Bedarf berechnet.
6. **Keine toten Buttons (H6), kein „Coming soon“.** Was noch nicht geht, zeigt Schloss + Grund (z. B. „Unlocks at 2★“) oder ist ausgeblendet, bis das System existiert. Standort 2 erscheint nur als Silhouette/Info, nie als klickbarer Knopf ohne Wirkung.
7. **Ruhe in Sitzung 1** (Brief §5, §6.2, D6): keine blockierenden Pop-ups. Retention-Hooks sind ruhige HUD-Icons mit Punkt-Badge, frühestens ab Minute 12 der ersten Sitzung. Pausierende Modals nur auf Spieleraktion (Inspektionsergebnis, Versetzung).

---

## 1. Datenmodell

### 1.1 Neue Felder in `World` (`src/sim/types.ts`)

| Feld | Typ | Zweck | Bei Versetzung |
|---|---|---|---|
| `keys` | `number` | Goldene Schlüssel (Kontostand, permanent) | bleibt (+ neue) |
| `projects` | `ProjectsState` `{ done: Partial<Record<ProjectId, boolean>>, running: {id, leftMs, totalMs} \| null }` | Projekttafel | Reset |
| `leads` | `LeadsState` `{ slots: (LeadId\|null)[], hiredMs }` | Abteilungsleitungen | Reset |
| `taps` | `TapCounts` `{ horn, crates, hornTotal, cratesTotal }` | Handgriff-Zähler; `horn/crates` = heute (Reset 00:00 Ortszeit über `wall.ts`) | bleibt |
| `inspection` | `InspectionState` (Phase, Rundgang, Route, Messfenster, letztes Ergebnis, `best`, `count`, `retryDay`, `mark`) | Inspektionstag | Reset |
| `prestige` | `PrestigeState` `{ perks, lifetimeCoins, completedSites, bestStars, transfers, keysEarned }` | Meta-Fortschritt | bleibt |
| `mail` | `MailState` `{ day, tasks[3], streak, daysCompleted, seenDay, visible, count }` | Tagespost | bleibt |
| `vip` | `VipState` `{ phase, sessionEndMs, sessionEndDay, boardPermanent, arrivals }` | Morgen-VIP | bleibt |
| `wall` | `WallState` `{ nowMs, tzMin, sessionStartMs, sessions }` | Wanduhr-Buchhaltung | bleibt |
| `offline` | `OfflineState` `{ ring[≤5], ringLife, ringMs, pending, collected }` | Einkommensfenster + Offline-Ertrag | Ring-Reset, `collected` egal |

Freie Zahlen-Flags für Director-Erweiterungen: `w.director.data` (`Record<string, number>`, bereits im Save/Hash). Neue Director-Schlüssel tragen das Präfix ihres Systems (`food*`, `vip*`, `ruckus*`).

### 1.2 Defaults und Save

- `m5Defaults(site)` in `src/sim/world.ts` liefert alle M5-Felder. `createWorld` und die Migration nutzen dieselbe Funktion, ein migrierter M4-Spielstand und ein neues Spiel haben also dieselbe Form.
- `SAVE_VERSION = 2` (`src/save/serialize.ts`). Migration `1 → 2`: `fillDefaults(world, m5Defaults(site))` (tiefes Auffüllen fehlender Schlüssel), danach `inspection.mark` = aktuelle kumulierte Zähler (das Messfenster startet beim Laden, nicht mit der ganzen M4-Historie).
- `plainToWorld` füllt zusätzlich idempotent auf. Ein Builder, der ein Feld ergänzen **muss**, meldet es dem Integrator (Abschnitt 14); `types.ts`, `world.ts`, `serialize.ts` gehören dem Architekten.
- Brief §9.7 nennt die Save-Felder `keys, perks, projects, supervisors, objectives, daily, vip, lastSeen, incomeAvg` – sie heißen hier `keys, prestige.perks, projects, leads, obj, mail, vip, savedAt (SaveDoc) + wall, offline.ring`.

### 1.3 Effekte (`src/sim/effects.ts`, frei lesbar für alle)

Die **einzige** Stelle, die M5-State in Zahlen übersetzt. Aufrufstellen sind bereits verdrahtet (agents, staff, ferry, director, rooms, tools):

| Helfer | Wert | Wirkt in |
|---|---|---|
| `energyRefillMult` | 1 + Σ energyRefill | Schlafen (`agents.ts useTick`) |
| `mealRefillMult` | 1 + Σ mealRefill | Mahlzeit (`agents.ts finish`) |
| `hygieneRefillMult` | 1 + Σ hygieneRefill | Dusche |
| `yardFunMult` | 1 + Σ yardFun | Hof |
| `reformMult` | 1 + Σ reform | Klassenzimmer + Werkstatt |
| `guardRadiusBonus` | Σ guardRadius (Kacheln) | `director.guardRadius`, Abdeckungs-Overlay |
| `crateValueMult` | 1 + Σ crateValue | Kistenverkauf |
| `cartSpeedMult` | 1 + Σ cartSpeed | Karren |
| `releaseBountyMult` | 1 + Σ releaseBounty | Entlassungsprämie |
| `moodFlatBonus` | Σ moodFlat (Prozentpunkte) | Laune vor dem Clamp |
| `dirtPerUseMult` | max(0, 1 − Σ dirtPerUse) | Verschmutzung pro Nutzung |
| `ferrySeatBonus` | Projekt + Perk | Fährengröße und -Deckel |
| `workshopMult` | 1 + 0,1 × Perk-Stufe | Kisten pro Station |
| `buildCostMult` | 1 − 0,05 × Perk-Stufe | `priceBuild/priceResize` (auch Abriss-Erstattung) |
| `startCapitalBonus` | 1000 × Stufe × Standortfaktor | Startkapital einer Versetzung |
| `mailRewardMult` | 1 + 0,25 × Perk | Tagespost-Belohnung |
| `offlineEff` | min(1, 0,4 + 0,1 × Leitungen) | Offline (§7) |
| `offlineCapMs` | (2 + Perk-Stufe) h | Offline (§7) |

`effects.ts` ist eingefroren (Architekt). Neue Effektarten → Integrator.

---

## 2. Projekttafel (Brief §3.13) – Besitzer `sim-progress`, Datei `src/sim/projects.ts`

**Regeln (brief):** Freischaltung bei Ruf **2★** (`PROJECT_UNLOCK_STARS`). Es läuft **genau ein** Projekt gleichzeitig. Timer **60–300 s Echtzeit** bei 1×, **läuft offline weiter**. Bezahlt mit Coins. **12 Projekte** pro Standort, jedes **im Bild sichtbar**.

**Inhalt** (`content/progress.ts PROJECTS`, Reihenfolge = Tafelreihenfolge; die ersten 7 Wirkungen sind Brief-Werte):

| # | id | EN / DE | Kosten | s | Wirkung | braucht | Sichtbar als (art-m5) |
|---|---|---|---|---|---|---|---|
| 1 | mattresses | Comfy Mattresses / Bequeme Matratzen | 400 | 90 | Energie-Auffüllung +25 % (brief) | bunk | dickere Matratzen auf jedem Bett |
| 2 | recipeBook | Recipe Book / Rezeptbuch | 500 | 90 | Mahlzeit +25 % (brief) | canteen | Kochbuch auf der Theke + Dampf |
| 3 | form27b | Form 27-B / Formular 27-B | 600 | 120 | Entlassungsprämie +15 % | – | goldener Stempel + Formularablage am Tor, Gold-Blitz beim Stempeln |
| 4 | whistle | Whistle Training / Pfeifen-Training | 700 | 120 | Wachradius +2 (brief) | guard | goldene Pfeife an jeder Wache, Radius-Overlay wächst |
| 5 | bubbleBath | Bubble Bath / Schaumbad | 800 | 150 | Hygiene-Auffüllung +25 % | wash | Seifenblasen über jedem Waschhaus |
| 6 | assembly | Assembly Knitting / Fließband-Stricken | 1 200 | 180 | Kistenwert +25 % (brief) | workshop | Förderband in jeder Strickstube |
| 7 | speedyCarts | Speedy Carts / Flinke Karren | 1 500 | 180 | Karren-Tempo +30 % (brief) | – | Rennstreifen am Karren |
| 8 | nightSchool | Night School / Abendschule | 1 800 | 210 | Resozialisierung +20 % (brief) | classroom | Schreibtischlampen im Klassenzimmer |
| 9 | tetherball | Tetherball / Wirbelball | 2 000 | 210 | Hof-Spaß +30 % | yard | Wirbelball-Mast mit schwingendem Ball |
| 10 | suggestionBox | Suggestion Box / Kummerkasten | 2 500 | 240 | Laune +5 Pp | – | Kasten am Direktionsbüro, kleine Herz-Pops |
| 11 | squeakyMops | Squeaky Mops / Quietsch-Mopps | 3 000 | 240 | Verschmutzung −30 % | – | Mopp + Eimer am Waschhaus, Hausmeister trägt Mopp |
| 12 | biggerFerry | Bigger Ferry / Größere Fähre | 4 000 | 300 | Fähre +2 Plätze (brief) | – | größere Fähre (Zusatzdeck) |

Brief-Pacing: „9:00–10:00 erstes Projekt (90 s), Möbel erscheint“ → die zwei ersten Projekte haben 90 s.

**Tick:** `projectsTick(w)` zieht pro Tick `tickMs(w.t − 1)` von `running.leftMs` ab; bei ≤ 0 → `done[id] = true`, `running = null`, Event `projectDone`. **Offline:** `advanceProjects(w, ms)` (vom Offline-Formelpfad, §7); Nachsimulationspfade ticken normal.

**API (lesen):** `projectsUnlocked(w)`, `projectCard(w, id)` → `done | running{leftMs, progress01} | available{affordable} | busy | locked{stars} | needsRoom{room}`; `projectDef(id)`.

**Befehl:** `cmd.startProject(w, id)` → Gründe `invalid | locked | done | busy | noRoom | coins`.

**Events:** `projectStart {id, cost, sec}`, `projectDone {id}`.

**Zu tun (sim-progress):** Inhalt ist fertig; Builder prüft nur Balance (Kosten gegen Coins ab Minute 6, QA-Befund 6 „Geld liegt ungenutzt“) und schreibt Verhaltenstests (Timer, Offline-Fortschritt, jede Wirkung messbar).

---

## 3. Abteilungsleitungen (Brief §3.11) – Besitzer `sim-progress`, Datei `src/sim/leads.ts`

**Regeln (brief):** Direktionsbüro Standort 1: **2 Plätze**, Platz 1 ab **3★**, Platz 2 ab **4★** (`LEAD_SLOT_STARS[1] = [3, 4]`). Handgriffe Standort 1: Fährhorn → **Aufnahme-Leitung** (`intake`, Olli, Biber), Kistenstapel → **Logistik-Leitung** (`logistics`, Becca, Biber mit Klemmbrett). Jede Leitung **+10 Pp Offline-Effizienz**. Einstellungsdialog: „You tapped 34 times today. From now on, Olli handles it.“

**Inhalt:** `LEADS` (fee 1 200, Lohn 60/Spieltag, mit den Personal-Löhnen um Mitternacht über `leadWages`), `LEAD_HORN_DELAY_MS = 1500` (sichtbarer Auto-Tap-Moment), `LEAD_CART_MIN_CRATES = 2` (Karren fährt bei 2 statt 6 Kisten).

**Tick:** `leadsTick(w)`: honkt die Fähre (`ferry.state === 'arriving'`, nicht getappt) und ist `intake` eingestellt, tappt die Leitung nach 1,5 s → Event `leadAutoTap {id:'intake', grip:'horn'}`. Logistik wirkt über `w.unlocked.supLogistics` in `staff.ts cartTick` (Bots lesen dasselbe Flag).

**API:** `slotStars(w,k)`, `slotOpen(w,k)`, `leadsForSite(w)`, `hireInfo(w,id)` → `{name, grip, fee, wage, tapsToday, tapsTotal, hired}`; `leadHired/leadCount` (effects.ts).

**Befehl:** `cmd.hireLead(w, id)` → `invalid | done | noSlot | coins`. **Events:** `leadHired {id, slot, taps}`, `leadAutoTap {id, grip}`.

**Pacing (brief §4.2):** 14:00–16:00 Ruf 3★ und erste Leitung (Logistik), „Kisten verschwinden von selbst“.

**Zu tun:** Verhaltenstests; Bots stellen ein (§11). Der Puls-Hinweis am Horn/Stapel verschwindet für automatisierte Handgriffe (ui-m5/art-m5 lesen `leadHired`).

---

## 4. Ziele und Schabernack

### 4.1 Klemmbrett (Brief §3.16) – Tabelle gehört dem späteren Schritt „hook“, `currentGoal` dem Architekten

- `src/sim/objectives.ts OBJECTIVES`: 10 Ziele pro Standort (+ das Waschhaus-Ziel nur nach übersprungenem Tutorial), davon **7 Pflicht** (`mandatory`). Belohnung `objectiveReward(k) = 100 + 40·k` Coins (skaliert mit der Position) **+10 Ruf** (brief). Freischaltungen über `unlocks`.
- **Immer ein aktuelles Ziel (brief):** `currentGoal(w)` liefert das erste offene Ziel, danach Folgeziele aus `FOLLOWUPS`: `callInspection` → `stars2` → `stars3` → `transfer` (Text `progress.followup.*`). `null` nur im Tutorial (dann ist der Tutorialschritt das Ziel-Widget, D4).
- `mandatoryDone(w)` schaltet `w.unlocked.inspection` frei.
- **M5-Builder ändern `objectives.ts` nicht** (Reihenfolge, Belohnungen, Texte, Tutorial ändert der Hook-Schritt, siehe §15). ui-m5 zeigt Folgeziele über `currentGoal` an.

### 4.2 Director (Brief §3.12) – Besitzer `sim-retention`, Datei `src/sim/director.ts`

Grundregeln (brief): nie zwei gleichzeitig, keine im Tutorial, Essensschlacht und Ruckus **bis 5 min nach Tutorial-Ende gesperrt** (`DIRECTOR.lockAfterTutorialSec = 300`, Referenz `director.data.tutorialEndMs`), Abstand **150–240 s**, Gewichte Tunnel ∝ Σ Ausbruchs-Score, Essensschlacht ∝ max(0, 50 − Kantinen-Laune), **gescriptete Beats ersetzen den Slot**: Tunnel ~3:00 (`scriptedTunnelSec 180`), Essensschlacht ~10:00 (`scriptedFoodFightSec 600`, startet in der nächsten Mahlzeit ab 10:00), **leere Slots ab Minute 15 mit 20 %** (`emptySlotsFromSec 900`, `emptyWeight 0.2`).

**Essensschlacht – voller Ablauf (P0):**
1. Start: ≥ 3 Rascals essen in der Kantine → 2–4 werden `brawling` (Staubwolke mit Sternchen, Comic-Sound; kein Blut, keine Waffen). Event `foodFight {roomId, ids}`.
2. **Tumult-Meter** füllt sich in **20 s** (`foodFightMeter01(w)`, 0..1).
3. Spieler tippt Rangelnde an → `cmd.tapRangler(w, id)` → `calm` → 3 s benommen. Event `calmed {id, by:'tap'}`.
4. **Wachen helfen:** deckt eine Wache die Kantine ab, beruhigt sie alle 3 s einen (`calmed {by:'guard'}`).
5. **Gelöst** (keiner mehr `brawling`): +5 Ruf (`eventSolved`), +Laune (Spaß +5 der Kantinengäste), Event `foodSolved`; zählt für die Tagespost.
6. **Ungelöst** (Meter voll): Kantine **30 s blockiert**, **Sauberkeit −50**, alle Gäste stehen auf, `stats.unsolved++` (Safety-Note!), Event `foodLost {roomId}`. „Bauchweh“ erst ab Standort 2 (M6).
7. Ein Hausmeister-Hinweis (JIT-Tipp „Hausmeister räumt auf“) folgt nach dem Ereignis (Brief §4.2 ~10:00) – UI.

**VIP Cat Burglar (P0):** Kater mit Zylinder, **Strafmaß 150** (`SENTENCE.vip`), **hohes Ausbruchsrisiko** (Trait `sneaky` → Score ×2; sim-retention darf einen eigenen VIP-Faktor in `content/retention.ts` ergänzen), Entlassung **×5 Prämie** (`ECON.vipMult`). Quellen: Director-Slot `vip` (ab 8 min, Event `vipAnnounced`) und Morgen-VIP (§9). Beide setzen `director.data.vipNext = 1`; `ferry.ts` setzt ihn als letzten Passagier ab (`spawnRascal({vip:true})`).

**Ruckus:** Ø-Laune < 20 für 30 s → 30 s Arbeitsstopp in Werkstatt/Klassenzimmer, Räume verdrecken, Event `ruckus`. Gesperrt wie die Essensschlacht.

**Zu tun (sim-retention):** Lücken prüfen und schließen, ohne Brief-Zahlen zu lockern:
- Gescriptete Essensschlacht muss **verlässlich** im Pacing-Fenster 10:00–10:30 (±20 %) kommen, auch wenn zur Mahlzeit < 3 Rascals essen (Fallback: nächste Mahlzeit; H2 verlangt ≥ 1 Essensschlacht in 30 min).
- VIP-Ausbruchsrisiko „hoch“ sichtbar machen (Faktor in `content/retention.ts`), Morgen-VIP-Markierung (§9).
- Ruckus-Sperre über dieselbe `tutorialEndMs`-Regel (bereits so) – Test.
- Neue Zahlen nur in `content/retention.ts` (balance.ts gehört sim-progress).

---

## 5. Inspektionstag (Brief §3.17) – Besitzer `sim-progress`, Datei `src/sim/inspection.ts`

**Ablauf:**
1. **Ausrufbar**, sobald die 7 Pflichtziele erledigt sind (`inspectionBlock(w)` → `null | tutorial | notReady | busy | tooSoon`).
2. Vorher zeigt die **Prognose** `forecast(w)` die erwarteten Noten, Sterne, schlechteste Kategorie und Schlüssel-Vorschau.
3. `cmd.callInspection` → Phase `walking`, `retryDay = heute + 1`, Event `inspectionCalled {day}`. Die **Gans-Inspektorin läuft 45 s** (`INSPECTION.walkSec`) entlang `inspection.route` (Steg → jede gebaute Raumtür → Tor; `walker {x, y, dir, moving, wp}` – kein Agent, der Renderer zeichnet sie; Kamera folgt optional). Pro Raum Event `inspectorAt {roomId}` (Klemmbrett-Häkchen, Stempelgeräusch).
4. Nach 45 s: Ergebnis = `forecast` im Moment des Endes → `inspection.last`, Phase `result`, Event `inspectionResult {stars, passed, firstPass, grades, worst}`.
5. Ergebnis-Screen (pausierend, §12): Stempel-Animation, Noten, Sterne, Tipp der Inspektorin zur schlechtesten Kategorie (`progress.tip.<cat>`), Schlüssel-Vorschau, bei ≥ 1★ „Gullrock Lighthouse freigeschaltet“ (Teaser). Schließen → `cmd.closeInspection` (`none`), Event `inspectionClosed`.
6. **Wiederholung** ab dem nächsten Spieltag (`tooSoon` bis dahin).

**Notenformeln (brief),** gemessen über die **letzten 2 Spieltage** = 48 Stunden-Buckets (`inspectionHour` an jeder Spielstunden-Grenze, auch für die 8 verrechneten Stunden einer übersprungenen Nacht):

| Kategorie | Formel |
|---|---|
| Comfort | Ø-Laune in % (Σ Laune der Bewohner / Σ Stichproben) |
| Safety | max(0, 100 − 25 × gelungene Ausbrüche − 10 × ungelöste Ereignisse) |
| Reform | min(100, Entlassungen pro Tag pro 10 Betten × 50) |
| Profit | min(100, Netto-Einkommen pro Tag ÷ `SITES[site].profitTarget` × 100); Netto = Einnahmen ohne `OFFLINE.nonIncomeKinds` − Löhne |

Tage im Fenster = Buckets / 24. **Noten:** A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, E ≥ 25, F darunter. **Sterne:** 1★ keine Note unter D; 2★ zusätzlich ≥ 3 Noten B+; 3★ alle B+ und ≥ 1 A; sonst 0 (nicht bestanden). Implementiert: `gradeOf`, `starsFor`, `worstOf`, `scoresOf`, `forecast`, `inspectionCounters`, `inspectionHour`.

**Wirkung:** ≥ 1★ → `onInspectionPassed` (prestige.ts): `completedSites`, `bestStars`, Event `siteCompleted {site, stars, next}` beim ersten Bestehen, Event `completion {percent}`, Event `happytime {reason:'inspection'}` (jede bestandene Inspektion, §11.1). 2★/3★ geben die Bonus-Schlüssel über die Versetzungsformel (§6). `inspection.best` = beste Sterne auf diesem Lauf.

**Standort 2 in M5:** `SITES[1].available = false`. Nach 1★ gilt der Zustand „Standort 2 freigeschaltet“ (`prestige.completedSites` enthält 1); die UI zeigt den Teaser und die Silhouette, **kein toter Knopf**. Der Spieler kann **weiter optimieren** (Folgeziele 2★/3★, Wiederholung) oder **versetzen** (neuer Lauf auf Standort 1 mit Schlüsseln und Perks, §6). M6 schaltet `available` um.

**Pacing (brief):** 22:00–28:00 Pflichtziele → „Call Inspection Day“; bis 30:00 Inspektion → Noten → Sterne → Schlüssel-Vorschau; H3: beim Casual-Bot nach 22–30 min möglich.

**Zu tun (sim-progress):** Route und Gang (`callInspection` füllt `route`, `inspectionTick` bewegt `walker` mit konstanter Geschwindigkeit so, dass die Route in ≤ 45 s abgelaufen ist, Event `inspectorAt`), `profitTarget` kalibrieren (Casual-Bot erreicht 1★ zuverlässig, 3★ braucht echte Optimierung, H1b), Verhaltenstests.

---

## 6. Versetzung, Schlüssel, Perks, Abschluss (Brief §3.17) – Besitzer `sim-progress`, Datei `src/sim/prestige.ts`

**Schlüssel (brief):** `keys = floor(k × sqrt(L / C)) + Sternbonus` mit L = Lebenszeit-Coins des Standortlaufs (`stats.lifetimeCoins`), Sternbonus 2★ +2, 3★ +4 (`PRESTIGE.starBonus`). **k und C** sind benannte Konstanten in `balance.ts PRESTIGE` und werden so kalibriert, dass der **Casual-Bot bei der ersten Inspektion 4–6 Basis-Schlüssel** erhält und **mit 2★ genau 2 Perks** kaufen kann (Nachweis in `BALANCE.md`). Startwert k = 1, C = 2 000.

**Versetzung:** `cmd.transfer(w, toSite)` → `notPassed | busy | locked`. Setzt Coins, Räume, Personal, Projekte, Leitungen, Inspektion, Ziele des Standorts zurück (frischer `newGame` mit abgeleitetem Seed), behält `keys` (+ neue), `prestige` (+ transfers, keysEarned, lifetimeCoins), `mail`, `vip`, `wall`, `taps`, Event-Ring. Startkapital + `startCapitalBonus`. Tutorial gilt als erledigt. Events `keysEarned {n, source:'transfer'}`, `transfer {fromSite, toSite, keys, transfers}`. Die App baut nach `transfer` die Ansicht neu auf (Cross-Fade, `replaceWorld`).

**Ziele:** `transferTargets(w)` = verfügbare und freigeschaltete Standorte; in M5 nur `[1]`.

**Perks (brief: 6 Perks, Kosten 2–6 Schlüssel)** – `content/progress.ts PERKS`:

| id | Wirkung | max | Kosten je Stufe |
|---|---|---|---|
| startCapital | +1 000 Coins × Standortfaktor pro Stufe | 3 (brief) | 3 / 5 / 6 |
| workshop | Werkstatt +10 % pro Stufe | 3 | 4 / 5 / 6 |
| offlineCap | Offline-Cap +1 h pro Stufe | 3 (brief) | 3 / 5 / 6 |
| ferry | Fähre +1 Platz | 1 | 4 |
| buildCost | Baukosten −5 % pro Stufe | 3 | 4 / 5 / 6 |
| mail | Tagespost-Belohnung +25 % | 1 | 3 |

Die zwei billigsten Stufe-1-Perks kosten 6, die drei billigsten 9 → 6–8 Schlüssel kaufen genau 2. `cmd.buyPerk(w, id)` → `invalid | max | keys`; Event `perkBought {id, level, cost}`. Perks sind jederzeit kaufbar (Perk-Menü im Versetzungsdialog und erreichbar, sobald `keys > 0` oder ein Perk existiert).

**reportGameCompletedPercentage:** `completionPercent(w) = min(100, completedSites × COMPLETION.percentPerSite)`. **Abweichung vom Brief (PROGRESS.md Nr. 4, RULES_CHECK §6):** +50 % pro erstmals bestandenem Standort gegen die 2 Standorte von v1 statt +20 % gegen 5 geplante. Eine Konstante; `20` stellt den Brief-Wortlaut her. Gemeldet nach jeder bestandenen Inspektion (Event `completion` → `platform.reportProgress`) und beim Laden (`app.ts startSession`, late init). Der Mock zeichnet `reportGameCompletedPercentage` auf.

**Zu tun (sim-progress):** gescriptete Beats eines Versetzungslaufs festlegen (kein zweiter Earl, kein Tutorial-Tunnel bei 3:00 – stattdessen normaler Director; Essensschlacht-Sperre ab Laufstart), k/C kalibrieren, Tests.

---

## 7. Offline-Ertrag und Hintergrund-Tab (Brief §3.15, §5.1, H4) – Besitzer `sim-retention`, Datei `src/sim/offline.ts`

**Einkommensfenster:** `offlineTick` schließt alle 60 000 `rtMs` (1×-normierte **aktive** Spielzeit) eine Minute ab: Ring der letzten **5** Minuten mit dem Einkommen (`incomeCounter`: alle `earn`-Arten außer `offline`, `mail`, `objective`, `loan`). `incomePerMin1x(w)` = Ø des Rings.

**Formel (brief):** `Einkommen/min × min(abwesend, Cap) × Effizienz`. Effizienz `offlineEff` = 40 % + 10 Pp pro Leitung (+ Perks, in v1 keiner), max. 100 %. Cap `offlineCapMs` = 2 h + 1 h pro `offlineCap`-Stufe. **Nur der aktive Standort.** **Projekt-Timer laufen weiter** (`advanceProjects(w, min(abwesend, Cap))`). Zeitdelta aus `SaveDoc.savedAt` bzw. Tab-Versteckzeit, **negativ → 0, absurd → geklemmt** (`awayMs` in `store.ts`, `AWAY_MAX_MS` in app.ts, dann `planAway`).

**Stufen (brief):**

| Abwesenheit | `planAway(w, ms).mode` | Verhalten |
|---|---|---|
| < 1 s | `none` | nichts |
| < 60 s | `silent` | still nachsimulieren (`CatchUp`, Ticks über Frames, kein UI) |
| 60 s – 5 min | `catchup` | Nachsimulation in Blöcken, **höchstens 3 000 Ticks** pro Block, verteilt auf Frames (≤ 300 Ticks/Frame), Mini-Toast „Catching up…“ (`ctx.catchUp`) |
| ≥ 5 min | `formula` | `applyOfflineFormula` → `offline.pending {coins, awayMs, effPct, capMs, capped}` → **Rückkehr-Panel** |

**Rückkehr-Panel:** „While you were away / Während du weg warst“, hochzählende Zahl, **nicht pausierendes Overlay** über der laufenden Welt, Button „Collect / Einsammeln“ → `cmd.collectOffline` (`none`) → `earn('offline')`, Event `offlineCollected {coins}`. **Kein ×2 im BASIC-Build** (nur FULL, M6+). Pause-Panel-Hinweis „Your lockup earns while you're away“ (`progress.awayHint`).

**Events:** `offlinePending {coins, awayMs, effPct, capped}`, `offlineCollected {coins}`.

**Verdrahtung (fertig, app.ts):** Laden → `startSession(savedAt)` → `handleAway` → `beginSession`. Tab versteckt → Save + `hiddenAt`; Tab zurück → `resumeSession` + `handleAway`. Während eines `CatchUp` wartet der normale Stepper.

**Zu tun (sim-retention):** `planAway` exakte Tick-Zahl über Tag/Nacht (Ticks bis `Σ tickMs ≥ awayMs`, max. 5 min ≈ 3 000 Tag- bzw. 6 000 Nacht-Ticks → zwei Blöcke), Begrenzung auf `maxCatchupTicks` pro Block, H4-Tests (Cap, negative und +10-Jahre-Sprünge, Projekt-Timer offline), Verhalten bei laufender Inspektion (Gang ist Spielzeit: bei `formula` nicht vorspulen).

---

## 8. Tagespost des Bürgermeisters (Brief §3.16, §5.3) – Besitzer `sim-retention`, Datei `src/sim/mail.ts`

- **3 Aufgaben** pro **lokalem Kalendertag**, **Reset 00:00 Ortszeit** über `syncWall` (Clock + `tzOffsetMin`). Auswahl per Hash(Seed, Tag) aus `MAIL_POOL` – nie der Sim-RNG.
- Fortschritt = Ereigniszähler (`mail.count`, gefüttert in `mailOnEvent` aus `flushEvents`) minus Basis beim Tagesbeginn.
- **Belohnung:** Coins, skaliert am aktuellen Einkommen: `max(150 × Standortfaktor, 3 × Einkommen/min) × mailRewardMult`, beim Tagesbeginn fixiert. `cmd.claimMail(w, i)` → `locked | invalid | claimed | notDone`. Einkommensart `mail` (zählt nicht ins Fenster).
- **Alle 3 erledigten Tage 1 Goldener Schlüssel** (brief, keine Splitter-Währung): `streak`, `daysCompleted`, Event `keysEarned {n:1, source:'mail'}`.
- **Ruhiges HUD-Icon mit Punkt-Badge**, **nie ein Pop-up**, in Sitzung 1 **frühestens ab Minute 12** (`MAIL.firstSessionFromMs`), nach Tutorial-Ende. `mailBadge(w)`: neuer Tag ungesehen oder abholbare Aufgabe. `cmd.seeMail` setzt `seenDay`. Alles abgeholt → Teaser „New mail tomorrow“ (`mailAllClaimed`).
- **Events:** `mailNewDay {day}`, `mailVisible`, `mailTaskDone {i, id}`, `mailClaimed {i, reward}`, `mailDayComplete {daysCompleted, streak, key}`.
- **Pacing (brief):** 12:00–14:00 „Tagespost erscheint als ruhiges HUD-Icon“.

**Zu tun:** Wiederholungen vom Vortag vermeiden, Ziele am Fortschritt skalieren (Tag 1 erreichbar in ~10 min aktiven Spiels), Tests mit `FakeClock` (H5: Reset um 00:00 lokal, Zeitzonen, Schlüssel nach 3 Tagen, Uhr zurückgedreht → kein Doppel-Reset-Missbrauch: ein früherer Tag als `mail.day` rollt nicht neu).

---

## 9. Morgen-VIP (Brief §5.4) – Besitzer `sim-retention`, Datei `src/sim/vip.ts`

- **Teaser:** Nach dem **ersten Spieltag** (Ende von Tag-Index 0; HUD zeigt „Tag 1“) kündigt die Tafel am Steg an: *„Tomorrow: the infamous Cat Burglar arrives!“* (`vip.phase = 'teased'`, Event `vipTeased`). Bei Nachtsprung in Sitzung 1 also ab ~1:55.
- **Verfügbar** (`vipAvailable`, rein, H5): (a) neuer lokaler Kalendertag **und** ≥ 4 h seit Sitzungsende, **oder** (b) ≥ 8 h seit Sitzungsende – was zuerst eintritt. Sitzungsende = letzter Save / Tab versteckt (`markSessionEnd`, das Web kennt kein verlässliches Ende).
- Geprüft bei `beginSession` und `resumeSession` → `phase = 'ready'`, `director.data.vipNext = 1`, Event `vipReady`; die nächste Fähre bringt den Cat Burglar → `phase = 'arrived'`, `arrivals++`, Event `vipArrived {id}`; das nächste Tagesende teasert erneut.
- **Ab Spieltag 3** ist die Tafel dauerhaft sichtbar (`boardPermanent`). `vipBoard(w)` → `hidden | teaser | ready` für Renderer/UI.

**Zu tun:** Morgen-VIP von Director-VIP unterscheiden (`director.data.vipMorning = 1` beim Setzen, `vipOnEvent('admit'/'arrive')` eines `AF.vip`-Agenten mit diesem Flag → `arrived`), Tests mit FakeClock für (a) und (b).

---

## 10. Wanduhr, Sitzungen, Speicher-Häkchen (Brief §5, §5.6) – Besitzer `sim-retention` (`wall.ts`, `clock.ts`)

- `Clock { now(); tzOffsetMin?(ms) }`; App: `systemClock`, Tests: `FakeClock`; E2E: `?clock=<epoch ms>&tz=<min östlich UTC>`, `window.__clock.advance(ms)`.
- `localDayOf(ms, tz)` = Kalendertag lokal.
- `syncWall(w, now, tz)` etwa 1×/s aus der App: Tageswechsel → `taps.horn/crates = 0`, neue Tagespost.
- `beginSession(w, now, tz, returning)` beim Start: `returning` (Spielstand geladen) beendet die Sitzung-1-Ruheregeln (`firstSession = false`), `sessions++`, Morgen-VIP-Prüfung. `resumeSession` beim Tab-Zurück. `markSessionEnd` vor jedem Save.
- In Sandboxes (`?bot`, `?warp`, `?capture`, `?nosave`) läuft die Wanduhr nur mit `?clock`.
- **Speicher-Häkchen (brief §5.6):** dezentes Häkchen-Icon in einer Ecke nach jedem erfolgreichen Save: `ctx.saved` (performance.now() des letzten Saves) → `src/ui/saveIndicator.ts`.

---

## 11. Befehle, Gründe, Events (Übersicht)

Alle neuen Befehle in `src/sim/sim.ts cmd` (geloggt, danach `flushEvents`):

| Befehl | Gründe bei Fehlschlag |
|---|---|
| `startProject(id)` | invalid, locked, done, busy, noRoom, coins |
| `hireLead(id)` | invalid, done, noSlot, coins |
| `callInspection()` | tutorial, notReady, busy, tooSoon |
| `closeInspection()` | none |
| `transfer(toSite)` | notPassed, busy, locked |
| `buyPerk(id)` | invalid, max, keys |
| `seeMail()` | locked |
| `claimMail(i)` | locked, invalid, claimed, notDone |
| `collectOffline()` | none |
| bestehend: `tapRangler(id)` | none |

Jeder Grund hat einen Text (`app.ts REASON_KEY` → `progress.reason.*` bzw. vorhandene Keys). **Neue Gründe nur über den Integrator** (sonst fehlt der Text).

**Neue Events** (Payload): `projectStart {id,cost,sec}` · `projectDone {id}` · `leadHired {id,slot,taps}` · `leadAutoTap {id,grip}` · `inspectionCalled {day}` · `inspectorAt {roomId}` · `inspectionResult {stars,passed,firstPass,grades,worst}` · `inspectionClosed` · `siteCompleted {site,stars,next}` · `completion {percent}` · `happytime {reason:'firstRelease'|'inspection'}` · `keysEarned {n,source:'transfer'|'mail'}` · `transfer {fromSite,toSite,keys,transfers}` · `perkBought {id,level,cost}` · `mailNewDay {day}` · `mailVisible` · `mailTaskDone {i,id}` · `mailClaimed {i,reward}` · `mailDayComplete {daysCompleted,streak,key}` · `vipTeased` · `vipReady` · `vipArrived {id}` · `offlinePending {coins,awayMs,effPct,capped}` · `offlineCollected {coins}`. Bestehend, jetzt Teil von M5: `foodFight {roomId,ids}` · `calmed {id,by}` · `foodSolved` · `foodLost {roomId}` · `vipAnnounced` · `ruckus`.

Speichern nach wichtigen Aktionen (`app.ts SAVE_EVENTS`): projectStart, projectDone, leadHired, inspectionCalled, inspectionResult, transfer, perkBought, mailClaimed, offlineCollected.

Audio (`audio/events.ts`, Besitzer art-m5): projectDone (Fanfare klein), leadAutoTap (Horn), inspectionCalled (Musikwechsel „Spannung“), inspectionResult (Stempel), keysEarned (Schlüssel-Klimpern), foodFight (Tumult), vipArrived (Jingle).

---

## 12. UI (Besitzer `ui-m5`) – liest nur `ctx.w` + die APIs oben, schreibt nur `ctx.cmd.*`

Alle Regeln aus `UI_DESIGN.md` gelten: `data-hud`/`data-overlay`, jeder Button Icon/Label + `aria-label` + `data-tip`-Tooltip (Name, Effekt in Zahlen, Hotkey), DOM-Schreibzugriffe ≤ 10/s mit Text-Memo, Schrift ≥ 12 px (Fließtext ≥ 14 px), Touch ≥ 44 px, EN/DE-Parität in `src/i18n/parts/*.{en,de}.json`, Kompakt-Layout ≤ 900 px, Esc nie einziger Weg (× überall), Esc-Routing: Modals (`modals.ts`) gewinnen, dann M5-Panels, dann Werkzeuge (`tools.ts`). Kein Pop-up in den ersten 60 s (D6), Ziel-Widget 100 % sichtbar (D4).

**`ctx`-Erweiterungen (fertig):** `clock`, `panel: Store<M5Panel|null>` (`'projects'|'leads'|'mail'|'forecast'|'inspection'|'transfer'`, höchstens eins offen, Öffnen schließt `ctx.menu`), `catchUp: Store<CatchUpState|null>`, `saved: Store<number>`. Pausierend (ruft `ctx.setPaused(true)` beim Öffnen, stellt beim Schließen wieder her → `gameplayStop/Start`): Inspektionsergebnis, Versetzung (inkl. Perk-Menü). Nicht pausierend: Projekttafel, Leitungen, Post, Prognose, Rückkehr-Panel, Banner.

| § | Datei (Stub vorhanden, in app.ts gemountet) | Inhalt |
|---|---|---|
| 12.1 | `projectBoard.ts` | Eintrag in der Bauleiste (`buildbar.ts`, Icon `projects`) – vor 2★ mit Schloss + „Unlocks at 2★“, ab 2★ mit Punkt bis zum ersten Öffnen. 12 Karten aus `projectCard` (Name, Wirkung in Zahlen `progress.projectFx.*`, Kosten, Dauer, Zustand/Grund), laufender Timer mit Balken (auch als kleiner Chip im HUD, solange ein Projekt läuft), Start → `startProject`. **B1-Screen „Projekttafel“.** |
| 12.2 | `leads.ts` | Direktionsbüro antippen (und Staff-Menü-Eintrag): 2 Plätze mit Schloss 3★/4★, Kandidaten aus `hireInfo`, Dialog „You tapped {n} times today. From now on, {name} handles it.“, Einstellen → `hireLead`. Kein Pop-up von selbst; beim Erreichen von 3★ nur ein Punkt-Badge + Toast. |
| 12.3 | `mail.ts` | Ruhiges HUD-Icon (Topbar-Bereich, Kompakt: im Überlauf) ab `w.mail.visible`, Punkt-Badge aus `mailBadge`, Panel mit 3 Aufgaben (Fortschritt `taskProgress`, Belohnung, „Claim“), Schlüssel-Streak 0–3, „New mail tomorrow“ (`progress.mailTomorrow`) mit Countdown aus `ctx.clock`. Öffnen → `seeMail`. Nie automatisch öffnen. |
| 12.4 | `inspection.ts` | Prognose-Panel (`forecast`, 4 Kategorien mit Note + Balken, Sterne, schlechteste Kategorie, Schlüssel-Vorschau) + „Call Inspection Day“ (gesperrt mit Grund aus `inspectionBlock`), erreichbar über das Klemmbrett-Folgeziel und einen HUD-Knopf ab `w.unlocked.inspection`. Während des Gangs: Fortschrittschip (45 s), optional „Follow“ (Kamera folgt `walker`). Ergebnis-Screen pausierend: Stempel, Noten, Sterne, Tipp, Schlüssel-Vorschau, „Gullrock Lighthouse unlocked!“ bei ≥ 1★ (Info, kein Knopf), Knöpfe „Keep optimising“ (`closeInspection`) und „Transfer…“ (öffnet `transfer`). **B1-Screen „Inspektionsergebnis“.** |
| 12.5 | `transfer.ts` | Versetzungsdialog pausierend: was zurückgesetzt wird / was bleibt, Schlüssel-Vorschau (`transferKeys`), Ziel aus `transferTargets` (in M5: „Fresh start at Puddlebrook“ mit Schlüsseln und Perks). Standort 2 erscheint nur als Silhouette mit „Unlocked“-Häkchen, **ohne** Knopf und **ohne** Versprechen wie „Coming soon“ (H6); M6 macht daraus ein echtes Ziel. Perk-Menü (6 Perks, Stufe, Kosten, Wirkung, Kaufen → `buyPerk`), auch erreichbar über das Schlüssel-Symbol in der Topbar, sobald `keys > 0` oder ein Perk gekauft ist. **B1-Screen „Versetzung“.** |
| 12.6 | `returnPanel.ts` | Rückkehr-Panel (nicht pausierend, `data-overlay`) aus `w.offline.pending`: Titel, hochzählende Coins, Abwesenheit, Effizienz %, Cap-Hinweis, „Collect“ → `collectOffline`. Kein ×2 im BASIC-Build. Mini-Toast „Catching up…“ bei `ctx.catchUp.mode === 'catchup'`. **B1-Screen „Rückkehr-Panel“.** Pause-Panel-Hinweis `progress.awayHint` in `modals.ts`. |
| 12.7 | `saveIndicator.ts` | Häkchen-Icon (`check`) in einer Ecke, blendet ~1,5 s nach `ctx.saved` ein, `aria-hidden`, kein Button. |
| 12.8 | `eventBanner.ts` | Nicht blockierender Chip unter der Topbar, solange ein Director-Ereignis läuft: Essensschlacht (Tumult-Meter `foodFightMeter01`, „Tap the brawlers!“, verbleibende Rangler), Löffel-Tunnel („Catch the escapee!“), VIP angekündigt/unterwegs. Tipp fliegt die Kamera hin. |
| 12.9 | `edgeHints.ts` | Pfeil/Chip am Bildrand zu Ausbrecher (`state 'escaping'`), Essensschlacht, Inspektorin, wenn außerhalb des Bildes (QA-Befund 2); Tipp → `focusTile`. |
| 12.10 | `clipboard.ts` (Ergänzung) | Folgeziele aus `currentGoal` (Text `progress.followup.*`, „Show me“ → Inspektionsknopf/Prognose). Nur diese Ergänzung; Umbau macht der Hook-Schritt. |
| 12.11 | `topbar.ts`/`buildbar.ts`/`staffMenu.ts`/`modals.ts` (Ergänzungen) | Schlüssel-Zähler (ab erstem Schlüssel), Post-Icon, Projekt-Chip, Leitungs-Eintrag, Pause-Hinweis. HUD-Budget 800×450 einhalten (B7). |

Neue Icons (Besitzer art-m5, `public/ui/*.svg` über die Art-Pipeline): `key`, `mail`, `inspect` (Gans/Stempel), `lead`, `perk`, `transfer`, `timer`. Bis sie da sind, verwendet ui-m5 vorhandene (`clipboard`, `projects`, `star`, `check`, `warden`).

Neue i18n-Keys in eigenen Parts (`projectBoard`, `leads`, `mail`, `inspection`, `transfer`, `returnPanel`, `eventBanner`, `edgeHints`) oder in `progress.*` (vorhanden: Gründe, Projekte, Leitungen, Perks, Post-Aufgaben, Kategorien, Tipps, Folgeziele, VIP, Standorte, catchingUp, awayTitle, mailTomorrow, awayHint). D7: EN und DE immer gleichzeitig.

---

## 13. Welt-Darstellung (Besitzer `art-m5`)

Eingang: `src/render/progressView.ts` (in `SimView` gemountet: `onRooms()` nach jedem Raum-Rebuild, `update(dt)` jedes Frame, keine Allokation pro Frame), Atlas-Pipeline `art/svg` + `tools/art-build.ts`, Charakter-Teile `src/render/charLayout.ts`/`agentsView.ts`, Juice `src/render/juice.ts`, Audio-Zuordnung `src/audio/events.ts`.

- **Projekt-Requisiten** laut Tabelle §2 (Spalte „Sichtbar als“), gelesen aus `w.projects.done`; beim Event `projectDone` ein Pop/Staub-Moment am Ort.
- **Leitungen:** Olli (Biber, Klemmbrett) am Steg/Horn, Becca am Karren-Depot; `leadAutoTap` → sichtbarer Tipp-Moment (Arm hebt, Horn-Ring).
- **Gans-Inspektorin** (neue Spezies `goose`, Klemmbrett, Brille): zeichnet `w.inspection.walker` während `phase === 'walking'`, Stempel-Puff bei `inspectorAt`.
- **Cat Burglar** (Kater `cat` mit Zylinder, `a.kind === 'vip'`; Kopfteile fehlen bisher im Atlas).
- **Steg-Tafel** für den Morgen-VIP (`vipBoard(w)`: hidden | teaser | ready); Text über DOM-Plakette oder Welt-Label ≥ 14 px.
- **Essensschlacht:** Staubwolke mit Sternchen über den `brawling`-Rascals, Comic-Sound, optional ein Welt-Meter über der Kantine.
- **Silhouette von Standort 2** am Kartenrand (Brief §5.5), ab `prestige.completedSites.includes(1)` mit Leuchtturm-Licht.
- **Größere Fähre** (`biggerFerry`), Rennstreifen am Karren (`speedyCarts`).
- Palette, Strichstärken und Perspektive nach `STYLE_GUIDE.md`; PEGI 12 (kein Blut, keine Waffen, keine Drogen/Alkohol/Tabak).

---

## 14. Besitz-Karte (wer ändert welche Datei)

| Builder | Dateien (nur diese ändern) | Liest |
|---|---|---|
| **sim-progress** | `src/sim/projects.ts`, `src/sim/leads.ts`, `src/sim/inspection.ts`, `src/sim/prestige.ts`, `src/content/progress.ts`, `src/content/balance.ts` (Kalibrierung PRESTIGE k/C, INSPECTION, STARS 4★/5★, Projektkosten), `tools/bots.ts`, `tools/balance.ts`, `docs/BALANCE.md`, neue Tests `tests/unit/m5-progress*.test.ts` | effects.ts, objectives.ts (`mandatoryDone`, `currentGoal`, `OBJECTIVES`), offline.ts (`incomeCounter`), director.ts (`tapRangler` für Bots) |
| **sim-retention** | `src/sim/offline.ts`, `src/sim/mail.ts`, `src/sim/vip.ts`, `src/sim/wall.ts`, `src/sim/clock.ts`, `src/sim/director.ts`, `src/content/retention.ts`, neue Tests `tests/unit/m5-retention*.test.ts` | effects.ts, projects.ts (`advanceProjects`), balance.ts (DIRECTOR/OFFLINE lesen; neue Werte in retention.ts) |
| **ui-m5** | `src/ui/projectBoard.ts`, `leads.ts`, `mail.ts`, `inspection.ts`, `transfer.ts`, `returnPanel.ts`, `saveIndicator.ts`, `edgeHints.ts`, `eventBanner.ts` + eigene `.css`; Ergänzungen in `src/ui/topbar.ts`, `buildbar.ts`, `staffMenu.ts`, `modals.ts`, `clipboard.ts` (nur Folgeziele), `src/app.ts` (nur UI-Verdrahtung), alle `src/i18n/parts/*.json` und `src/i18n/{en,de}.json`; Tests `tests/e2e/m5-ui*.spec.ts`, B1-Screens in `tests/e2e/states.ts`/`accept-kit.ts` | alle sim-APIs oben (nur lesen), `ctx.*` |
| **art-m5** | `art/svg/*` (neu), `art/palette.ts` (nur ergänzen), `tools/art/*`, `tools/art-build.ts`, `public/atlas*` (generiert), `public/ui/*.svg` (neue Icons), `src/render/progressView.ts`, `src/render/charLayout.ts`, `src/render/agentsView.ts`, `src/render/simView.ts` (nur Fähre/Karren-Varianten), `src/render/juice.ts`, `src/audio/events.ts` (Zuordnung vorhandener Sounds) | `w.projects`, `w.leads`, `w.inspection.walker/route`, `vipBoard`, `foodFightMeter01`, Events §11 |
| **Architekt / Integrator** (eingefroren für Builder) | `src/sim/types.ts`, `src/sim/world.ts`, `src/sim/sim.ts`, `src/sim/effects.ts`, `src/sim/hash.ts`, `src/save/*`, `src/ui/ctx.ts`, `src/platform/*`, `docs/M5_DESIGN.md` | – |
| **Hook-Schritt (nach den Buildern)** | `src/sim/objectives.ts`, `src/ui/tutorial.ts`, `src/ui/clipboard.ts`, `src/content/site1.ts`, Director-Scriptzeiten, frühes Pacing | – |

Braucht ein Builder eine Änderung an einer fremden Datei (neues Feld, neuer Grund, neues Event in sim.ts), meldet er sie in `notesForOthers`; der Integrator baut sie ein. Rein lesende Imports fremder Module sind erlaubt.

---

## 15. Schnittstellen für den Hook-Schritt (G2-Feedback)

Rückmeldung G2: (1) „Man weiß trotzdem nicht richtig, was man machen soll.“ (2) „Am Anfang soll noch etwas sein, um Lust zu bekommen.“ Eigene Befunde: Wartezeit im Tutorialschritt 3, zweite Entlassung erst ~5:20, Leerlauf 1:05–3:00 und 3:33–6:18, ungenutzte Coins ab Minute 6, kein Randhinweis zum Ausbrecher.

M5 liefert dafür Bausteine, ohne das Onboarding selbst umzubauen:
- `currentGoal(w)` – ein Ziel ist immer da, auch nach dem Klemmbrett.
- Ereignis-Banner und Randhinweise (§12.8, §12.9) – der Spieler sieht, wo gerade etwas passiert.
- Morgen-VIP-Teaser ab ~1:55 (§9) und Projekttafel-Vorschau mit Schloss „2★“ – etwas, worauf man hinspielt.
- Projekte als Coin-Senke ab 2★ (QA-Befund 6).
- Alle Onboarding-Hebel bleiben in wenigen Dateien: `objectives.ts` (Tabelle, Belohnungen, Reihenfolge), `tutorial.ts`/`clipboard.ts` (UI), `balance.ts DIRECTOR` (gescriptete Zeiten), `content/site1.ts` (Startgefängnis). M5-Builder ändern davon nur, was §14 erlaubt.

---

## 16. Abnahme M5 (Brief §14: H1–H6 für Standort 1, Pacing ±20 %)

- **H1:** Casual- und Optimal-Bot 30 min Standort 1; alle Zeilen der Pacing-Tabelle inkl. Projekttafel (9:00–10:00), Essensschlacht (~10:00), Parzelle 2, 3★ + erste Leitung (14–16 min), Lv15, Inspektion möglich (22–30 min) im ±20-%-Fenster; Taktungsregeln §4.3 über 15 min (`TEMPO_MIN = 15`); Einnahmenmix und Lohnanteil bei 15 und 30 min.
- **H1b:** Optimal-Bot mit gutem Layout ≥ 25 % schneller zur Inspektion als mit Zufallslayout.
- **H2:** Naiv-Bot ≥ 30 % langsamer; Zufalls-Bot < 2★ in 30 min; ≥ 1 Ausbruch und ≥ 1 Essensschlacht in 30 min.
- **H3:** erste Inspektion beim Casual-Bot nach 22–30 min möglich; danach geht die Progression weiter (Folgeziele, Versetzung, Perks).
- **H4:** Save/Load-Hash identisch mit M5-State; Offline gedeckelt; Zeitsprünge geklemmt; altes M4-Save lädt.
- **H5:** Tagespost und Morgen-VIP (a) und (b) mit injizierter Uhr.
- **H6:** kein toter Button, kein „Coming soon“ (E2E über alle neuen Screens).
- **B1:** Screens Projekttafel, Rückkehr-Panel, Inspektionsergebnis, Versetzung in allen 10 Größen, EN/DE.
- **I:** `happytime` nur erste Entlassung + jede bestandene Inspektion; `reportGameCompletedPercentage` nach Inspektion und beim Laden; Start/Stop gepaart bei Inspektionsergebnis und Versetzung.
