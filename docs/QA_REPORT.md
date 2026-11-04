# QA_REPORT

## Gates

### G1 – Art-Spike
- Material: `docs/ART_SPIKE.md`, `qa/g1/` (Screenshots Tag/Nacht 1280/907/800, Kantine Stufe 1/2, Charaktere 4 Richtungen, Kontaktbogen, Cover-Entwurf, 20-s-Video), Playtest-Zip.
- **Freigabe: ja** (Auftraggeber, 2026-11-04; zuerst als „brides jq“ = „beides ja“, danach ausdrücklich bestätigt). Keine Änderungswünsche genannt.
- Selbst festgestellte Schwächen, die im Art-Pass (M3/M7) bearbeitet werden: Profilköpfe, Figurengröße bei 800×450, Wand-Cutaway, Bodenvariation, Wasser, Cover (Risiko: extern), Fenster-Lichtkegel.
- Blindvergleich: bestanden mit Einschränkung (siehe ART_SPIKE.md). Daraus abgeleitet: Fluss-Leiste lesbarer machen, Bürokratie-Satire sichtbarer machen (Altersanmutung).

### G2 – erste 10 Minuten
- offen (nach M4)

### G3 – fertiger Build
- offen (nach M7)

## Automatisierte Tests (Stand M2)
| Bereich | Test | Status |
|---|---|---|
| A | Test 0, A1, A1b (verzögert/abgebrochen), A7 | grün |
| C | C1a (p95 0,46 ms @ 206 Agenten), C2 (60/144/165 Hz, Hash) | grün |
| F | Palette, Platzhalter, kein Text in SVG, Nacht-Luminanz 0,476 | grün |
| D | D7 (Keys EN=DE), D1 (≤ 8 Wörter) | grün |
| H | H0 (Economy-Sheet), H1 erste 10 min (27 Seeds), H4 (Save/Load-Hash) | grün, Ausnahmen siehe BALANCE.md §0 |
