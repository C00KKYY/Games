# PROGRESS

**Aktueller Meilenstein:** M1 – Art-Spike (M0 abgeschlossen)
**Gates:** G1 offen · G2 offen · G3 offen

## Erledigt
- M0: Brief gesichert (`docs/BRIEF.md`, wörtlich aus der Session extrahiert). Rules-Check (`RULES_CHECK.md`, 20/20 Seiten geladen) und Pixi-Notizen (`PIXI_V8_NOTES.md`). GDD, STYLE_GUIDE, Palette (`art/palette.ts`).
- Setup: Vite 7.3.6, TypeScript 5.9.3, pixi.js 8.22.0, Vitest 4.1.12, Playwright 1.63.0 (passend zum vorinstallierten Chromium). Alles exakt gepinnt, `.npmrc` mit `legacy-peer-deps` (npm-10-Bug bei Vitest-Peers). ESLint-Regel: `src/sim/**` ohne Pixi und ohne DOM-Globals. Lizenz-Plugin mit Allowlist.
- `src/content/balance.ts` ist die einzige Quelle aller Zahlen. `tools/economy-sheet.ts` → **H0 grün**, Abweichungen in `BALANCE.md`.
- Plattform-Wrapper `src/platform/crazygames.ts` (Init-Timeout, Start/Stop-Puffer, Speichersperre vor Init) und SDK-Mock `tests/fixtures/sdk-mock.js` (zeichnet alle Aufrufe auf).
- Inline-Ladebildschirm, SDK asynchron geladen.
- Tests: Test 0, A7, A1, A1b (verzögert und abgebrochen) grün. Vitest: H0 + Upgrade-Mathematik grün.

## Offen (M0-Rest)
- `NAME_CHECK.md` und Wettbewerbsbilder: Recherche-Agent läuft.

## Abweichungen vom Brief
1. Eltern-Repo enthält `verkehrsmeister/`, nicht `glutnacht/`. Ohne Auswirkung.
2. Balance-Startwerte angepasst (siehe `BALANCE.md` §2), Pflichtziele geändert (GDD E10 → BALANCE.md).
3. SDK wird asynchron geladen (RULES_CHECK §5).
4. `reportGameCompletedPercentage`: +50 % pro Standort in v1 (RULES_CHECK §6).
5. **Persistenz-Risiko:** `rascal-rock-lockup/` ist laut Brief ein eigenes Git-Repo ohne Remote. Der Container ist flüchtig. Ohne Push gehen die Commits verloren, wenn die Session endet. → Frage an den Auftraggeber bei G1.

## Bekannte Bugs
- keine

## Letzte Testergebnisse
- `npm test`: 3/3 grün · `npm run qa` (m0-infra): 5/5 grün · `npm run economy`: H0 OK

## Nächste 3 Schritte
1. Art-Generator (`tools/art-gen.ts`): SVGs aus Palette und Formregeln, Atlas-Build @1x/@2x, Kontaktbogen.
2. Pixi-Szene: Insel, Böden, Wände mit Südfront, Kantine, Zellentrakt, Steg, Fähre, 2 animierte Rascals und Koch, Tag/Nacht, HUD-Skizze.
3. G1-Material: Screenshots 1280×720 und 907×510, 20-s-Video, Cover-Entwurf, Blindvergleich, `ART_SPIKE.md`.
