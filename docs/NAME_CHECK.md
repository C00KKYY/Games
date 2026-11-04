# Namensprüfung – Rascal Rock Lockup

Stand: 04.11.2026. Geprüft von Claude (automatisiert, ohne Login, ohne Umgehung von Bot-Schutz).

## Ergebnis (Kurzfassung)

**Erster freier Name: „Rascal Rock Lockup“.**

- Auf CrazyGames, itch.io, Steam, Google Play und im App Store (US) gibt es kein Spiel und keine App mit diesem Namen. Es gibt auch keinen verwechselbar ähnlichen Titel.
- In der USPTO-Markensuche gibt es keine Marke „RASCAL ROCK LOCKUP“, „RASCAL ROCK“ oder „RASCAL LOCKUP“. Die Einzelwörter „RASCAL“ und „LOCKUP“ sind dagegen mehrfach eingetragen (Details unten).
- **EUIPO (eSearch) und TMview: nicht geprüft – Auftraggeber prüft manuell.** EUIPO hat die automatisierte Anfrage mit „403 – Request blocked“ (CloudFront) abgewiesen. TMview hat im Headless-Browser keinen Inhalt geladen. Beides wurde nicht umgangen.
- Die drei Alternativen sind ebenfalls frei von identischen Spieltiteln. Sie bleiben Reserve, falls die manuelle Markenprüfung „Rascal Rock Lockup“ ausschließt.

> [Einschätzung] Das hier ist eine Recherche, kein Rechtsgutachten. Store-Suchen sind unscharf und zeigen nur die ersten Treffer. Eine Markenrecherche durch den Auftraggeber (EUIPO/TMview, DPMA, WIPO Global Brand Database, USPTO mit Klassenfilter 9/28/41) ist vor dem Launch nötig.

## Methode je Quelle

| Quelle | Geprüft wie | Hinweise |
|---|---|---|
| Websuche | WebSearch-Tool (US-Index), exakte Phrase in Anführungszeichen, dazu `site:`-Suchen | Das Tool sucht nur im US-Index. |
| CrazyGames | `https://www.crazygames.com/search?q=…` in Headless-Chromium (Playwright). Die Ergebnisse werden clientseitig geladen, per curl kommt nur eine leere Seite. | Gegenprobe: „Critters“ liefert Treffer (Combo Critters). Die Suche funktioniert also. |
| itch.io | `https://itch.io/search?q=…` per curl, Titel aus dem HTML ausgelesen (die ersten 22–54 Treffer) | Die Suche ist unscharf und liefert viele Teilwort-Treffer. |
| Steam | `https://store.steampowered.com/search/results/?term=…&cc=us` per curl, Titel ausgelesen | |
| Google Play | `https://play.google.com/store/search?q=…&c=apps&hl=en&gl=US` per curl, Titel ausgelesen (bis zu 30 Treffer) | Nur das US-Storefront |
| App Store | Offizielle iTunes Search API `https://itunes.apple.com/search?term=…&entity=software&country=us` | Nur das US-Storefront. Einzelne Anfragen bekamen zuerst HTTP 403 (Rate-Limit). Nach einer Pause kamen alle Pflicht-Anfragen durch, nur die Zusatzanfrage „Rascal“ blieb bei 403. |
| USPTO | `https://tmsearch.uspto.gov/search/search-information` in Headless-Chromium, Begriff ins Wordmark-Feld getippt, Enter. Ausgewertet wurde die erste Ergebnisseite (ca. 50 Treffer, nach Relevanz sortiert). | Die Suche verknüpft die Wörter mit ODER. Eine Kombinationsmarke stünde ganz oben. Es wurde nur die erste Seite geprüft. |
| EUIPO | `https://www.euipo.europa.eu/eSearch/…` in Headless-Chromium | **403 „Request blocked“ (CloudFront). Nicht geprüft – Auftraggeber prüft manuell.** |
| TMview (zusätzlich) | `https://www.tmdn.org/tmview/…` in Headless-Chromium | Die Seite blieb leer. **Nicht geprüft – Auftraggeber prüft manuell.** |

## 1. „Rascal Rock Lockup“ (Priorität 1)

| Quelle | Geprüft wie | Ergebnis | Link |
|---|---|---|---|
| Websuche | `"Rascal Rock Lockup"`, `"Rascal Rock" game`, `"Rascal Rock" OR "Rascal Lockup"` mit site:crazygames/itch/steam, `"Rascal Rock" trademark` | Kein Treffer für den Namen. Es gibt nur andere „Rascal“-Titel: Rascal (PS1, 1998), Rascal Racers (PS1, 2004), Rascal's Escape, Rollin' Rascal, RASCAL Zero. | – |
| CrazyGames | Suche nach „Rascal Rock Lockup“, „Rascal Rock“, „Rascal Lockup“, „Rascal“, „Lockup“ | **0 Treffer** bei allen fünf Begriffen („We did not find what you were looking for“) | https://www.crazygames.com/search?q=Rascal%20Rock%20Lockup |
| itch.io | Suche nach „Rascal Rock Lockup“, „Rascal Rock“, „Rascal Lockup“ | Kein Titel mit „Rascal Rock“ oder „Rascal … Lockup“. Es gibt viele andere „Rascal …“-Spiele, z. B. Rascal Guild, Rascal Rally, Rascal Rumble, Rascal Raccoon Demo, Rascal's Rummage. Keines davon hat ein Gefängnisthema. | https://itch.io/search?q=Rascal%20Rock%20Lockup |
| Steam | Suche nach „Rascal Rock Lockup“, „Rascal Lockup“, „Rascal Rock“ | „Rascal Rock Lockup“ und „Rascal Lockup“: 0 Treffer. „Rascal Rock“: 5 fremde Treffer, darunter **„Rascals“** (App 916120). Per Websuche bekannt sind außerdem **„Rascal's Escape“** (Koop-Abenteuer) und „Rollin' Rascal“. | https://store.steampowered.com/search/?term=Rascal%20Rock%20Lockup · https://store.steampowered.com/app/916120/Rascals/ |
| Google Play | Suche nach „Rascal Rock Lockup“, „Rascal Rock“, „Rascal Lockup“ | Kein identischer Titel. Ähnlich ist nur das Wort „Rascal“: **„Rascal's Escape“** (the Good Evil GmbH, Adventure, „Cheeky badger's wild journey across Europe“), „Rascal: Interactive Stories“, „RASCAL: Zero“. Dazu kommt „Lockup“ von Lockup Technologies, eine Handy-Sperr-App (Bildung), kein Spiel. | https://play.google.com/store/search?q=Rascal%20Rock%20Lockup&c=apps · https://play.google.com/store/apps/details?id=com.thegoodevil.mobile.rascalsescape |
| App Store (US) | iTunes Search API: „Rascal Rock Lockup“, „Rascal Rock“, „Rascal Lockup“ | Kein relevanter Treffer. Es kamen nur Rock-Radio-Apps und „MS Lock“. | https://itunes.apple.com/search?term=Rascal%20Rock%20Lockup&entity=software&country=us |
| USPTO | Wordmark-Suche `"RASCAL ROCK LOCKUP"`, `"RASCAL ROCK"`, `RASCAL ROCK LOCKUP`, `RASCAL LOCKUP` | **Keine Marke mit zwei oder mehr der Wörter.** Einzelwort-Marken: RASCAL (viele, meist tot). Lebend sind u. a. RASCAL Nr. 98569024 (Kl. 28, Angelköder) und RASCAL Nr. 79346247 (Kl. 9/16/41/42, Status pending, Inhaber nicht ausgelesen). LOCKUP: lebend Nr. 77370084 (Schlösser), Nr. 97625848 (Software, Digilock), Nr. 98771323 (elektronische Schlösser), STADIUM LOCKUP Nr. 99032623 (Kl. 41, A&E Networks, pending). WWE LOCKUP ist tot. | https://tmsearch.uspto.gov/search/search-information |
| EUIPO | – | **nicht geprüft – Auftraggeber prüft manuell** (403 Request blocked) | https://www.euipo.europa.eu/eSearch/ |

**Bewertung:** frei. [Einschätzung] „Rascal“ allein ist als Spielname verbreitet (Rascal's Escape, Rascals). Die Dreiwort-Kombination mit „Rock“ und „Lockup“ ist aber eindeutig unterscheidbar. „Lockup“ ist ein beschreibender Begriff (Gefängnis/Arrestzelle). Die Marken auf „LOCKUP“ betreffen Schlösser, Software und TV. Für Klasse 9/41 sollte der Auftraggeber besonders RASCAL Nr. 79346247 ansehen.

## 2. „Lockup Lagoon“ (Alternative 1)

| Quelle | Geprüft wie | Ergebnis | Link |
|---|---|---|---|
| Websuche | `"Lockup Lagoon"`, `"Lockup Lagoon" game app` | Kein Treffer für den Namen. Ähnlich sind „Lockup: A Roll Player Tale“ (Brettspiel), „Locked Up“ (iOS-Escape-Room) und die TV-Serie „Lockup“ (MSNBC). | – |
| CrazyGames | Suche „Lockup Lagoon“ und „Lockup“ | 0 Treffer | https://www.crazygames.com/search?q=Lockup%20Lagoon |
| itch.io | Suche „Lockup Lagoon“ | Kein „Lagoon“-Treffer in Kombination. Es gibt viele „Lockup“-Titel: LOGIC LOCKUP, The Lockup, Knightly Lockup, T.V. Lockup, Lock-Up Dungeon, Lock Up. | https://itch.io/search?q=Lockup%20Lagoon |
| Steam | Suche „Lockup Lagoon“ | 0 Treffer | https://store.steampowered.com/search/?term=Lockup%20Lagoon |
| Google Play | Suche „Lockup Lagoon“ | Kein identischer Titel. Gefunden: „Merge Lagoon“, „Lagoonveil: Reef Jewel Pop“, „Lands of Jail“ (Gefängnisspiel, anderer Name), „Lockup“ (Sperr-App) | https://play.google.com/store/search?q=Lockup%20Lagoon&c=apps |
| App Store (US) | iTunes Search API „Lockup Lagoon“ | Kein Spiel mit ähnlichem Namen (Schloss- und Marina-Apps) | https://itunes.apple.com/search?term=Lockup%20Lagoon&entity=software&country=us |
| USPTO | `"LOCKUP LAGOON"`, `LOCKUP LAGOON` | Keine Kombinationsmarke. Einzelwörter: LOCKUP (siehe oben), LAGOON lebend Nr. 98826357 (Kl. 3/28) | https://tmsearch.uspto.gov/search/search-information |
| EUIPO | – | **nicht geprüft – Auftraggeber prüft manuell** | https://www.euipo.europa.eu/eSearch/ |

**Bewertung:** frei, Reserve 1.

## 3. „Mischief Island Lockup“ (Alternative 2)

| Quelle | Geprüft wie | Ergebnis | Link |
|---|---|---|---|
| Websuche | `"Mischief Island" game` | Kein „Mischief Island“. Ähnlich sind „Mischief“ (Tavern Rat Studios, 2025, PC/Mac), „Mischief Makers“ (N64) und „Siren Isle“ (Figur namens Mischief). | – |
| CrazyGames | Suche „Mischief Island“ | 0 Treffer | https://www.crazygames.com/search?q=Mischief%20Island |
| itch.io | Suche „Mischief Island Lockup“ und „Mischief Island“ | Kein „Mischief Island“. Es gibt viele „Mischief …“-Titel: Mischief Castle, Mischief Kittens, Mischief Mage, Mischief Monkey, Mischief and Mayhem. | https://itch.io/search?q=Mischief%20Island%20Lockup |
| Steam | Suche „Mischief Island Lockup“ und „Mischief Island“ | „Mischief Island Lockup“: 0 Treffer. „Mischief Island“: 26 unscharfe Treffer, keiner mit „Mischief“ im Titel. | https://store.steampowered.com/search/?term=Mischief%20Island |
| Google Play | Suche „Mischief Island Lockup“ und „Mischief Island“ | Kein identischer Titel. Gefunden: „Mischief: AI Prank Photo/Video“ (App) und „Mischief To Couple !“ | https://play.google.com/store/search?q=Mischief%20Island%20Lockup&c=apps |
| App Store (US) | iTunes Search API, beide Begriffe | Kein „Mischief“-Titel unter den Treffern (Insel-Spiele) | https://itunes.apple.com/search?term=Mischief%20Island&entity=software&country=us |
| USPTO | `"MISCHIEF ISLAND LOCKUP"`, `"MISCHIEF ISLAND"`, ohne Anführungszeichen | Keine Kombinationsmarke. Lebende Einzelwort-Marken mit Spielebezug: MISCHIEF Nr. 88369006 (Kl. 9/16/41, Mischief Worldwide Ltd., UK), MISCHIEF Nr. 87910312 (Kl. 41, Mischief Management LLC), MISCHIEF WORKSHOP Nr. 98925993 (Kl. 9), MISCHIEF MAKER Nr. 90482655 (Kl. 28) | https://tmsearch.uspto.gov/search/search-information |
| EUIPO | – | **nicht geprüft – Auftraggeber prüft manuell** | https://www.euipo.europa.eu/eSearch/ |

**Bewertung:** frei, Reserve 2. [Einschätzung] Das Markenumfeld um „MISCHIEF“ in Klasse 9/41 ist dichter als bei „Rascal Rock“.

## 4. „Cellblock Critters“ (letzte Wahl)

| Quelle | Geprüft wie | Ergebnis | Link |
|---|---|---|---|
| Websuche | `"Cellblock Critters"` | Kein Treffer. Nur das Film-Franchise „Critters“. | – |
| CrazyGames | Suche „Cellblock Critters“ und „Critters“ (Gegenprobe) | „Cellblock Critters“: 0 Treffer. „Critters“: Combo Critters | https://www.crazygames.com/search?q=Cellblock%20Critters |
| itch.io | Suche „Cellblock Critters“ | Kein „Critters“-Titel. Es gibt Gefängnisspiele: „Cellblock A“, „Escape From Cellblock A“, „Escape from Cellblock 60“, „Cell Block I“. | https://itch.io/search?q=Cellblock%20Critters |
| Steam | Suche „Cellblock Critters“ | 0 Treffer | https://store.steampowered.com/search/?term=Cellblock%20Critters |
| Google Play | Suche „Cellblock Critters“ | Kein identischer Titel. Gefunden: „Clash of Critters“, „Combo Critters“, „Candy Critters: Idle Merge“ | https://play.google.com/store/search?q=Cellblock%20Critters&c=apps |
| App Store (US) | iTunes Search API | Kein identischer Titel. Gefunden: „Combo Critters“, „Merge Critters: Idle Tycoon“ | https://itunes.apple.com/search?term=Cellblock%20Critters&entity=software&country=us |
| USPTO | `"CELLBLOCK CRITTERS"`, ohne Anführungszeichen | Keine Kombinationsmarke. CELLBLOCK lebend Nr. 98354589 (Behälter), CELLBLOCK SMARTY PANTS Nr. 99655169 (Kl. 28, pending), CRITTERS Nr. 97641223 (Kl. 9, pending) | https://tmsearch.uspto.gov/search/search-information |
| EUIPO | – | **nicht geprüft – Auftraggeber prüft manuell** | https://www.euipo.europa.eu/eSearch/ |

**Bewertung:** frei, bleibt aber wegen der kindlichen Anmutung (BRIEF 2.1) die letzte Wahl.

## Was nicht geprüft wurde

- EUIPO eSearch und TMview (Bot-Schutz bzw. leere Seite): **Auftraggeber prüft manuell.**
- DPMA (DPMAregister) und WIPO Global Brand Database: nicht verlangt, nicht geprüft.
- USPTO nur erste Ergebnisseite und ohne Klassenfilter. Die Inhaberdetails zu RASCAL Nr. 79346247 wurden nicht ausgelesen.
- App Store und Google Play nur im US-Storefront. Andere Länder-Stores wurden nicht geprüft.
- Weitere Portale (Poki, Roblox, Newgrounds, Microsoft Store) und Domains/Social-Handles wurden nicht geprüft.
