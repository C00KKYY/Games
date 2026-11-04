# Rascal Rock Lockup – Game Design Document (verdichtet)

Stand: 2026-11-04 · Quelle: `docs/BRIEF.md` (verbindlich). Dieses Dokument hält nur fest, **was** gebaut wird und welche Entscheidungen der Brief offen lässt. Bei Widerspruch gilt der Brief, außer eine Abweichung ist hier ausdrücklich begründet und in `PROGRESS.md` unter „Abweichungen" gelistet.

## 1. Kern in einem Satz
Insel-Gefängnis für Schlingel mit absurden Bagatelldelikten: Räume aufziehen, Bedürfnisse decken, Schlingel resozialisieren und am Freiheitstor abstempeln. Jede Entlassung bringt Coins und Ruf. Der Spieler fängt mit Handgriffen an und automatisiert sie später.

**Haken (USPs):** (1) Entlassung als Produkt und Feiermoment, (2) Layout zählt (Wege, Nachbarschaft, Lärm), (3) sichtbare Pipeline mit Fluss-Leiste, (4) Schabernack-Ereignisse statt Gewalt.

**Ton:** trockene Bürokratie-Satire: Formulare, Stempel, Aktenzeichen, pedantische Vermerke. Nicht niedlich, nicht grausam.

## 2. Entscheidungen, die der Brief offen lässt

| # | Thema | Entscheidung | Grund |
|---|---|---|---|
| E1 | Einstellungsgebühr Personal | Einmalig = 1 Tageslohn, danach Tageslohn um Mitternacht | Brief nennt nur Löhne; eine Gebühr macht „Hire +1" zu einer echten Entscheidung |
| E2 | Vorgebautes Personal | 1 Koch, 1 Karrenfahrer. Bautrupp (Biber) ist kostenlos und kein Personal im Sinne des Limits | Tutorial braucht laufende Kantine und Karren |
| E3 | Werkstatt-Durchsatz | `aktive Stationen = min(Stationen, Vorarbeiter×4, anwesende Schlingel)`. Ohne Vorarbeiter läuft die Werkstatt mit 50 % (Selbstorganisation) | Formel im Brief zählt die Schlingel nicht. Ohne Vorarbeiter-Notlösung wäre der erste Bau bei 900 Startkapital zu knapp |
| E4 | Klassenzimmer ohne Lehrer | 0 Durchsatz, Raum-Panel zeigt „Limit: Teacher" | Lehrer ist der Grund, das Klassenzimmer zu bauen |
| E5 | Nutzung von Hof/Werkstatt/Unterricht | Schlingel bleiben in einer Aktivität 1–3 Spielstunden (Block), solange kein Bedürfnis < 35 fällt | Vermeidet Hin- und Herlaufen jede Stunde |
| E6 | Fähren-Größe | `2 + floor(ruf/60)`, max. 6 (+Projekt +2, +Perk +1). Ohne Horn-Tap: −50 % (abgerundet, min. 1) | Skaliert mit Ruf wie gefordert |
| E7 | Ausbruchs-Ereignis ohne Wachposten | Der Spieler muss tippen. Ab Wachposten fängt eine Wache im Radius automatisch | wie Brief |
| E8 | Raumbezogene Laune („Kantinen-Laune") | Ø-Laune der Schlingel, die den Raum heute genutzt haben | Brief nennt den Begriff ohne Definition |
| E9 | 12 Projekte Standort 1 | 7 aus dem Brief + Polished Brass (Tor-Tempo +25 %, Messingtor), Herb Garden (Laune +4 global, Kräuterbeete), Shower Heaters (Dusche +30 % Hygiene, Dampf), Form 27b Express (Entlassungsprämie +15 %, Rohrpost am Tor), Hammock Hour (Hof-Spaß +30 %, Hängematten) | Jedes ist im Bild sichtbar |
| E10 | Klemmbrett Standort 1 (10 Ziele, ★ = Pflicht) | ★Build a Workshop · ★Build a Classroom · ★Build a Guard Post · ★Own 12 beds · ★Release 5 rascals · ★Canteen level 5 · Build a Yard · ★Catch 3 escapees · Buy parcel 2 · Own 24 beds | Reihenfolge = Pacing-Tabelle. 7 Pflichtziele erreichbar bis ~22 min |
| E11 | Tagespost-Aufgaben | Pool: „Release N", „Sell N crates", „Keep mood ≥ X% until 18:00", „Upgrade any room N times", „Catch an escapee", „Build a decoration" | ausschließlich Dinge, die ohnehin passieren |
| E12 | Schlüssel-Formel | `keys = floor(k·sqrt(L/C))`, Start k = 1, C = 6.000 (Kalibrierung in BALANCE.md) | Casual-Bot ≈ 25–35 K Lebenszeit-Coins → 4–6 Schlüssel |
| E13 | Hausmeister vor Freischaltung | Waschhaus kann ab Bau einen Hausmeister einstellen; Verdreckung beginnt erst nach dem Tutorial | wie Brief |
| E14 | Speichern bei Nacht-Skip | Nacht-Skip in Sitzung 1 springt die Sim deterministisch auf 06:00 (Bedürfnisse wie bei 8 h Schlaf nachgerechnet) | Determinismus, Save/Load identisch |

## 3. Spielerlebnis-Bogen Standort 1 (Kurzfassung der Pacing-Tabelle)
0:00 lebende Insel → 0:04 Fährhorn → 0:15 Waschhaus per Tap → 0:35 Earl stempeln (erste Entlassung, `happytime`) → 1:10 Kantine upgraden → Tutorial-Ende, Klemmbrett → 1:30 Werkstatt ziehen → 2:15 Kisten antippen → 3:00 Löffel-Tunnel → 1★ → Klassenzimmer, Wachposten, Zellen vergrößern, Hof → 2★ (Projekttafel) → 10:00 Essensschlacht → 12:00 Parzelle 2 → 3★ (Logistik-Leitung) → Lv15 → Parzelle 3 → 22–28 min Inspektion → Standort 2 frei.

## 4. Systeme (Verweis auf den Brief)
- Zeit, Ressourcen, Räume, Layout, Bauregeln, Level, Ökonomie, Schlingel, Personal, Automation, Director, Projekte, Offline, Ziele, Standorte/Inspektion/Versetzung: Brief §3.2–3.18. **Zahlenwerte stehen nur an einer Stelle: `src/content/balance.ts`.** Economy-Sheet, Simulation und Bots lesen von dort.
- Pacing und Bots: Brief §4. Retention: §5. UX: §6. Visuell: §7 + `STYLE_GUIDE.md`. Audio: §8. Technik: §9.

## 5. Prioritäten
P0 → G2 → P0b (Standort 2) → P1 (Hausregeln, Überraschungsinspektion). Feature-Freeze bis G2. Siehe Brief §1.7.

## 6. Nicht-Ziele v1
Keine Ads im Build (BASIC), kein Login, kein Hochformat-Layout, keine Standorte 3–5, kein Schmuggel, kein Wetter außer Flut (Standort 2).
