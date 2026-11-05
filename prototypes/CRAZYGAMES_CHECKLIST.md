# CrazyGames-Checkliste für HTML5-Prototypen

Quelle: docs.crazygames.com/requirements (intro, technical, gameplay, ads, quality)
und docs.crazygames.com/sdk, Stand 2026-11. Vor einer echten Einreichung auf
Aktualität prüfen.

## Launch-Stufen
- **Basic Launch:** SDK optional, keine Werbung/Monetarisierung. Nur `gameplayStart` ist Pflicht, wenn das SDK eingebunden ist.
- **Full Launch:** nach Auswahl durch CrazyGames (bei guten KPIs). Dann gelten SDK-Pflicht, gameplayStart/Stop, muteAudio und die Werbe-Regeln.
- Prototypen werden so gebaut, dass sie **beides** schon erfüllen (die Vorlage erledigt das).

## Technisch
- [ ] Initialer Download ≤ 20 MB (Mobil-Startseite), auf jeden Fall ≤ 50 MB; gesamt ≤ 250 MB; ≤ 1500 Dateien.
- [ ] Nur relative Pfade.
- [ ] Läuft in Chrome, Edge und Safari; auch auf schwachen Chromebooks (4 GB RAM) flüssig.
- [ ] Maus und Tastatur, dazu Touch für Mobil.
- [ ] Querformat für Desktop; auf Mobil sauber skalieren (keine Orientierungssperre im Code).
- [ ] `user-select: none` auf `body` (in der Vorlage).
- [ ] Audio-Unlock: `audioContext.resume()` in einem click- oder touchend-Handler (in der Vorlage).
- [ ] `muteAudio`-Einstellung des SDK respektieren (in der Vorlage).
- [ ] Physik und Bewegung unabhängig von der Bildwiederholrate (fester Zeitschritt, in der Vorlage); bei 60, 144 und 165 Hz gleich schnell.

## SDK
- [ ] `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>` im `<head>`.
- [ ] `await CrazyGames.SDK.init()` vor der Nutzung. Außerhalb von crazygames.com ist die Umgebung `disabled` und Aufrufe werfen Fehler. Der Wrapper `cg.js` fängt das ab.
- [ ] `gameplayStart()` bei Spielbeginn, Fortsetzen, Wiederbeleben und nächstem Level.
- [ ] `gameplayStop()` bei jeder Pause, jedem Menü und jedem Levelende (nicht bei Tab-Wechsel).
- [ ] `loadingStart()`/`loadingStop()` um den Ladevorgang.
- [ ] `happytime()` nur sparsam bei echten Höhepunkten (Boss, neuer Highscore).
- [ ] Werbung nur über das SDK: Midgame zwischen Runden, nie während des Spiels und nie auf einem Navigationsbutton; Rewarded nur optional, immer mit Alternative ohne Werbung, Belohnung nur bei `adFinished`. Spiel bei `adStarted` pausieren und stummschalten, bei `adFinished`/`adError` fortsetzen. Ein Fehler (unfilled, adblock) darf das Spiel nie blockieren.

## Gameplay und Inhalt
- [ ] Englisch Pflicht (weitere Sprachen nur, wenn sauber übersetzt).
- [ ] Lesbar bei devicePixelRatio 1 in 907×510, 821×462, 1216×684, 1920×1080, 800×450 (Mobil), 1080×607 (Tablet).
- [ ] Neue Spieler landen direkt im Gameplay (höchstens 1 Klick).
- [ ] **Kein** eigener Vollbild-Button (CrazyGames stellt einen bereit).
- [ ] Keine Links zu anderen Seiten, keine Cross-Promotion, keine App-Store-Links.
- [ ] PEGI-12-tauglich (Zielgruppe ab 13).
- [ ] Originaler Name und eigene Assets; keine Marken.
- [ ] Escape und Strg/Cmd+W nicht belegen; Tastenbelegung möglichst layoutunabhängig (`event.code` oder zusätzliche Pfeiltasten).
- [ ] Einführung im Spiel, kurz, überspringbar, eher visuell als Text.
- [ ] Fortschritt wird gespeichert (localStorage, in der Vorlage mit try/catch abgesichert).

## Einreichung (später, manuell)
- Spielordner als ZIP, Beschreibung, Steuerung, Cover-Bilder und -Videos im Developer Portal.
