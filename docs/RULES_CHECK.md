# RULES_CHECK – Abgleich BRIEF.md mit der aktuellen CrazyGames-Doku

Stand: **2026-11-04**. Bei Widerspruch gilt die aktuelle offizielle Doku (BRIEF 1.3).
Methode: Jede Seite per `curl` (HTTP 200) geladen und mit `pandoc` in Text umgewandelt. Zitate sind wörtlich aus diesem Text übernommen. Vier Seiten wurden zusätzlich per WebFetch gegengeprüft (intro, technical, gameplay, quality). Der WebFetch-Weg liefert nur Zusammenfassungen und keine wörtlichen Zitate. Für die Zitate gilt deshalb die curl-Fassung.

## 1. Geprüfte Seiten

| Seite | geladen? | Datum |
|---|---|---|
| https://docs.crazygames.com/requirements/intro/ | ja (curl + WebFetch) | 2026-11-04 |
| https://docs.crazygames.com/requirements/technical/ | ja (curl + WebFetch) | 2026-11-04 |
| https://docs.crazygames.com/requirements/gameplay/ | ja (curl + WebFetch) | 2026-11-04 |
| https://docs.crazygames.com/requirements/quality/ | ja (curl + WebFetch) | 2026-11-04 |
| https://docs.crazygames.com/requirements/ads/ | ja | 2026-11-04 |
| https://docs.crazygames.com/requirements/game-covers/ | ja | 2026-11-04 |
| https://docs.crazygames.com/requirements/account-integration/ | ja | 2026-11-04 |
| https://docs.crazygames.com/sdk/intro/ | ja | 2026-11-04 |
| https://docs.crazygames.com/sdk/game/ | ja | 2026-11-04 |
| https://docs.crazygames.com/sdk/data/ | ja | 2026-11-04 |
| https://docs.crazygames.com/sdk/video-ads/ | ja | 2026-11-04 |
| https://docs.crazygames.com/resources/basic-launch-metrics/ | ja | 2026-11-04 |
| https://docs.crazygames.com/resources/getting-to-the-first-frame/ | ja | 2026-11-04 |
| https://docs.crazygames.com/resources/monetizing-midcore-idle/ | ja | 2026-11-04 |
| https://docs.crazygames.com/resources/monetizing-clicker/ | ja | 2026-11-04 |
| https://docs.crazygames.com/resources/html5/common-fixes/ | ja | 2026-11-04 |
| https://docs.crazygames.com/resources/crazygames-app/ | ja | 2026-11-04 |
| https://docs.crazygames.com/resources/mouse-control/ | ja | 2026-11-04 |
| https://docs.crazygames.com/faq/ | ja | 2026-11-04 |
| https://pixijs.com/8.x/guides/migrations/v8 | ja → siehe `PIXI_V8_NOTES.md` | 2026-11-04 |
| *zusätzlich:* https://docs.crazygames.com/ (Root, Launch-Prozess) | ja | 2026-11-04 |
| *zusätzlich:* https://docs.crazygames.com/sdk/user/ (systemInfo) | ja | 2026-11-04 |
| *zusätzlich:* https://docs.crazygames.com/resources/html5/sitelock/ | ja | 2026-11-04 |

Keine Seite war blockiert.

---

## 2. Bestätigt

- **QA spielt jede Einreichung.** „We spend time playing each submission to check that it works smoothly, meets our quality standards, and is fun to play.“ (faq) → BRIEF 0.2 ✔
- **Sperre bei wiederholten Verstößen.** „Developers who repeatedly submit non-compliant games may face restrictions on future submissions.“ (requirements/gameplay) ✔
- **Neueinreichung als neues Spiel.** „If most metrics fall below benchmarks, your game unfortunately can’t proceed to Full Launch. If you wish to submit it again, you need to submit as a new game including significant improvements.“ (docs.crazygames.com/) ✔
- **KPIs.** 10+ min Spielzeit, 10–15 % Day-1-Retention, 80 %+ Conversion, „load in under 10 seconds, and have a build size below 20 MB“ (resources/basic-launch-metrics). Vergleichswerte: Simulation 14 min, Strategie 17 min, Plattformschnitt 6,7 % (resources/monetizing-midcore-idle) ✔
- **0/1 Klick.** „Games should land new users in gameplay immediately. If this is not feasible given the game specifics, a maximum of 1 click is allowed.“ (requirements/gameplay, Full Implementation) ✔
- **Die 10 Prüfgrößen bei DPR 1** sind exakt wie in BRIEF 11.3: 907×510, 1216×684, 1077×606, 821×462 (Desktop ohne Vollbild), 1366×768, 1920×1080, 1536×864, 1280×720 (Desktop im Vollbild), 800×450 (mobile), 1080×607 (tablet) (requirements/gameplay) ✔
- **Physik bei 144/165 Hz** identisch (requirements/gameplay) ✔
- **Sprache.** „The game must have English localization … should use the user's language based on locale info provided through the system info method in our SDK, and if not available/set fallback to English.“ (requirements/gameplay) ✔
- **Kein eigener Fullscreen-Button.** „Custom in-game fullscreen buttons are prohibited“ (requirements/gameplay) ✔
- **Keine Cross-Promotion, keine App-Store-Links.** „App Store links are never allowed in-game“ (requirements/gameplay) ✔
- **PEGI 12, Publikum 13+** (requirements/gameplay). Laut FAQ wird u. a. abgelehnt: „Content is targeted for kids“, „Unoriginal content (e.g. clones or asset flips)“, „Missing English-language support“ ✔
- **Kein Orientierungs-Lock.** „you don't need to implement any orientation lock logic“ (requirements/technical) ✔
- **`user-select: none`** mit Vendor-Präfixen auf `body` (requirements/technical) ✔
- **iOS-Audio:** `resume()` muss in einer Nutzergeste (`touchend`/`click`) aufgerufen werden. „Simply listening for a visibility change is insufficient“ (requirements/technical) ✔
- **Browser.** „We expect games to work on Chrome and Edge. Games that don't work well on Safari will be disabled on that browser.“ ✔
- **Chromebook.** „Games will be disabled on Chromium OS if they do not work smoothly on a 4GB RAM device.“ ✔
- **Nur relative Pfade.** „Never use absolute paths, as they will fail to load“. Dateilimit 1500 (requirements/technical) ✔
- **Messpunkt Initial-Download = erster `gameplayStart`** (requirements/technical, sdk/game, resources/getting-to-the-first-frame) ✔
- **Ads im Basic Launch aus.** „Ads are not allowed in Basic Launch, and will be disabled even if you would integrate them.“ (requirements/technical). Außerdem: „There should not be rewarded ad buttons without effect.“ (requirements/ads) ✔
- **Ads-Regeln:** Ton erst bei `adStarted` stummschalten, UI blockieren bis `adFinished`/`adError`, kein Midgame auf Navigations-Buttons, Rewarded-Button nicht auf aktiven Gameplay-Screens, gleich großer „ohne Ad“-Button, Video-Icon, Alternative mit Coins, keine Ad-Ketten, nicht Midgame **und** Rewarded zwischen zwei Levels, max. 1 Midgame pro 3 min (requirements/ads) ✔
- **Adblock:** Spieler dürfen nicht blockiert oder benachteiligt werden. Hinweis statt Popup. „Do not keep the rewarded ads clickable but without effect“ (requirements/ads) ✔
- **Keine externen Logins, Gäste spielen immer** (requirements/account-integration) ✔
- **`gameplayStop` nicht bei Fokusverlust.** „Don't call this event when the user switches focus or leaves the game area (we handle this on our side).“ (sdk/game) ✔
- **`happytime`-Zitat** wörtlich bestätigt, inkl. „Use this feature sparingly“ (sdk/game) ✔
- **`muteAudio`.** „A Full Implementation requires muteAudio support for HTML5, Unity, Cocos, and Construct games.“ und „be sure this doesn't enable the audio back if it is disabled in the SDK settings“ (sdk/game) ✔
- **`loadingStart/Stop` optional.** „(optional) Load start/stop events“ (requirements/technical) ✔
- **„SDK is unusable until initialized“** (sdk/intro). Das Data-Modul lädt alle Daten beim Init vor: „the SDK preloads all the game data when it is initialized. This may take some time“ (sdk/data) ✔
- **Data-Limit und Fehlername.** `dataLimitExcedeed` (sic, Tippfehler gehört zum Code) mit „Game data when converted to a JSON string cannot exceed 1048576 bytes. Data was not saved“ (sdk/data) ✔
- **Debounce.** „The SDK debounces data saving with 1 second … up to 30 seconds.“ (sdk/data) ✔
- **„Progress Save“-Schalter existiert.** „If you intend to use the data module, don't forget to select the appropriate Progress Save toggle in the submission flow. The data module will be disabled otherwise.“ (sdk/data) ✔ — siehe 3.7 zum genauen Wortlaut der Option.
- **„Fully rely“.** „You need to fully rely on the Data Module save (for both guest and logged-in users on CrazyGames) and avoid relying on local saves“ (sdk/data) ✔
- **`isOfflineMode`** existiert als `window.CrazyGames.SDK.game.isOfflineMode` (resources/crazygames-app) ✔
- **App startet im Vollbild, Safe Areas über `env(safe-area-inset-*)`** (resources/crazygames-app) ✔
- **Cover:** 1920×1080 (16:9), 800×1200 (2:3), 800×800 (1:1), einheitliche Optik. Kein Rahmen, kein Text außer dem Titel, keine Icons oder Store-Logos, nichts Unscharfes (requirements/game-covers) ✔
- **Video:** ohne Ton, ≤ 50 MB, erstes Frame = Cover, kein Vorspulen, keine schwarzen Balken, kein Standard-Mauszeiger, kein „Play Now“ (requirements/game-covers) ✔
- **Beschreibung und Steuerung sind Pflicht.** „you will also need to provide qualitative metadata (game description and controls)“ (requirements/intro) ✔
- **Onboarding laut Quality Guidelines:** im Gameplay, nur Kernfunktionen, „Make the onboarding phase skippable“, Bilder vor Text, Steuerung per Overlay (requirements/quality) ✔
- **Regelmäßige Updates.** „The game should be frequently maintained and updated.“ (requirements/quality) ✔
- **Esc / Strg+W meiden, AZERTY berücksichtigen** (requirements/quality, „Restricted Keys“) ✔
- **Sitelock:** `hostname === "crazygames.com" || hostname.endsWith(".crazygames.com")` ist wörtlich das Beispiel der Doku. „This check also works in our iOS and Android apps.“ (resources/html5/sitelock) ✔
- **Mouse Control:** Für Spiele, „where most actions are taken with mouse clicks on the UI … we do not require mouse confinement.“ (resources/mouse-control). Das passt zu „Kein Edge-Panning“ in BRIEF 6.3 ✔
- **Common Fixes:** `wheel` mit `passive:false`, Pfeiltasten, `contextmenu` (resources/html5/common-fixes) ✔ (Doku-Fehler bei der Leertaste: siehe 3.14)

---

## 3. Abweichungen / Neu

### 3.1 Größenlimits: „< 20 MB“ ist kein hartes Limit, sondern KPI und Mobile-Homepage-Schwelle
BRIEF 0.5 führt „Build-Größe < 20 MB“ als Fakt. Die harten Limits sind andere:
> „A maximum total file size of 250MB is allowed. There's a file count limit on 1500 files“
> „The game must have an initial download size ≤ 50MB. In order to be eligible for the mobile homepage, the initial download size needs to be ≤ 20MB.“ (requirements/technical)

Die 20 MB sind also (a) die Schwelle für die **mobile Startseite**, gemessen am **Initial-Download** bis zum ersten `gameplayStart`, und (b) die KPI-Empfehlung („Aim for less than 20 MB“, basic-launch-metrics).
Ergänzend: „This event should be triggered when the user enters in a playable state, so excludes menus and additional loading steps.“
→ **Keine Änderung nötig.** Unser Ziel (≤ 8 MB gesamt, ≤ 3 MB initial) liegt weit darunter. Nur die Fakt-Kennzeichnung in BRIEF 0.5 ist ungenau. Ein Ladebildschirm vor `gameplayStart` ist ausdrücklich nicht der Messpunkt. Der erste `gameplayStart` darf deshalb nicht vor der spielbaren Welt kommen, und das macht der Brief auch nicht.

### 3.2 SDK-Script: `<head>`, synchron; async ist nicht verboten, aber für HTML5 nicht dokumentiert
> „You can install the SDK by including the following script in the head of your game's index.html: `<!-- Load the SDK before your game code --> <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>`“ (sdk/intro)

- Für HTML5 steht weder `async` noch `defer`. Ein Verbot gibt es aber auch nicht.
- Für **Construct** zeigt die Doku selbst dynamisches Laden per `document.createElement("script")` mit `onload`/`onerror` (sdk/intro, sdk/game). Dynamisches Laden mit `onload`-Promise ist also ein von CrazyGames gezeigtes Muster.
- → Der BRIEF-Plan aus 9.2 bleibt: zuerst den blockierenden Tag nach dem Inline-Ladebildschirm-CSS. Fällt Test A1b durch, auf `async` + `onload`-Promise wechseln. Das Ergebnis wird hier nachgetragen.
- Vorsicht: Bei einem synchronen Tag im `<head>` blockiert ein hängender SDK-Request das Parsen des `<body>`. Das Ladebildschirm-Markup erscheint dann erst danach. Inline-CSS mit `body`-Hintergrund **vor** dem Tag reicht nur für die Farbe, nicht für Logo und Balken. Das ist eine **[Einschätzung]**, und Test A1b muss genau das prüfen.

### 3.3 `environment` hat drei Werte; im Zustand `disabled` wirft **jeder** Aufruf
> „On any other domains … the SDK has the `disabled` environment. All the calls to the SDK methods will throw an error.“
> Werte (laut Godot-Snippet, gilt analog): `"local"`, `"crazygames"` oder `"disabled"` (sdk/intro)

- **Neu gegenüber dem Brief:** `local` gilt für `localhost`/`127.0.0.1`. Dann loggt das SDK in die Konsole und zeigt statt Ads ein Overlay. Mit `?useLocalSdk=true` lässt sich `local` auch auf anderen Hosts erzwingen. In BRIEF 9.2 fehlt `local`. Empfehlung: Bei `local` das echte SDK nutzen, im Testbetrieb per Flag den eigenen Mock.
- `environment`, `user.systemInfo` und `user.isUserAccountAvailable` sind seit v3 **Properties**, keine async-Getter (sdk/intro).
- Fehlerformat in v3: `{code: string, message: string}` (sdk/intro).

### 3.4 `reportGameCompletedPercentage` gibt es – die Bezugsgröße im Brief passt aber nicht zur Doku-Empfehlung
- **Existiert:** `window.CrazyGames.SDK.game.reportGameCompletedPercentage(50)`, Wert 0–100, **nur HTML5** (alle anderen Engines 🟥) (sdk/game).
- Zitate:
  > „Progression should generally move forward over time, and 100% should only be reported when the player reaches a meaningful completion point in the game.“
  > „If you update your game with new content … report the correct percentage on game start to reflect the player's progress relative to the new content. For example, a player who previously reached 100% may now be at a lower percentage“
  > „For endless, sandbox, or highly replayable games, developers may define their own interpretation of what constitutes 100% completion, as long as it is applied consistently.“
- **Abweichung:** BRIEF 3.17 rechnet gegen 5 *geplante* Standorte, in v1 sind also höchstens 40 % möglich. Die Doku meint den Fortschritt **relativ zum aktuell vorhandenen Inhalt**: Nach einem Update darf der Wert ausdrücklich sinken. CrazyGames will 100 % u. a. nutzen, um „restart“-Angebote und Update-Hinweise auszulösen. Bei uns käme in v1 nie jemand dort an.
- **Empfehlung (Entscheidung des Auftraggebers):** Auf den v1-Inhalt normieren (z. B. 2 Standorte → je bestandener Inspektion +50 %, oder ein feineres Raster über Ruf-Stufen). Nach Updates beim Laden neu berechnen und melden. Mit dem aktuellen Brief bleibt der Wert bei 40 % hängen. Das ist erlaubt, aber nicht im Sinne der Doku.

### 3.5 `setGameContext` gibt es, dazu `clearGameContext()`
- `window.CrazyGames.SDK.game.setGameContext({ "level": 12 })` und `window.CrazyGames.SDK.game.clearGameContext()` (sdk/game).
- Zweck laut Doku: Der Kontext wird an **Spieler-Feedback** angehängt („Users can send feedback related to your game … you can use the setGameContext method to attach relevant in-game data“). Er dient also nicht der Analytik.
- Datentypen sind nicht spezifiziert. HTML5 zeigt eine Zahl, Unity eine `Dictionary<string,string>`. → Flache Objekte mit primitiven Werten, keine Arrays oder verschachtelten Objekte **[Einschätzung]**.
- Größenlimit und Ratenlimit stehen nicht in der Doku. Minütlich `{site, day, coins, rascals, ruf}` (BRIEF 11.1) ist plausibel. Empfehlung: nur bei Änderung senden, und `coins` gerundet.
- Nur HTML5, Unity, Construct und Cocos. Für HTML5 ok.

### 3.6 Data-Modul: synchrone localStorage-API; das Limit gilt für **alle** Keys zusammen; Fehler kommen per `throw`
- API wörtlich: `clear(): void; getItem(key: string): string | null; removeItem(key: string): void; setItem(key: string, value: string): void;` (sdk/data). **Kein Promise**. Die Doku sagt aber: „The data module can throw errors“. → Jeden Aufruf in try/catch packen und `err.code` auswerten.
- Fehlercodes: `dataLimitExcedeed`, `dataModuleDisabled`, `other`.
- Das Limit gilt für die gesamten Spieldaten („Game data when converted to a JSON string“). Beide Slots A/B zählen also zusammen, wie BRIEF 9.7 schon annimmt ✔.
- **Neu:** „If you are approaching it, you will see warnings in the browser console. The data won't be backed up anymore if it exceeds 1MB.“ Unser Ziel < 150 KB pro Slot reicht.
- **Neu:** Für Gäste schreibt das Data-Modul selbst in localStorage („If the user is not logged in, the data module will store the game data in LocalStorage“). Beim Login synchronisiert das SDK automatisch („you don't need to do anything“). → Auf CrazyGames darf **kein eigener** localStorage-Spiegel parallel laufen, sonst gibt es Konflikte nach Login/Logout (Logout: „the SDK will revert back to using the guest game data“).
- **Abweichung zum Brief (9.7 Fehlerfälle):** Beim Fallback auf localStorage nach `dataModuleDisabled` sagt die Doku nur „avoid relying on local saves“. Ein Not-Fallback ist nicht verboten, löst aber das Problem nicht: Der Fehler bedeutet, dass der Formularschalter falsch steht. → Fallback behalten, aber **laut** loggen und im QA-Tool prüfen. Wann der Fehler fliegt (bei `init` oder bei `setItem`), ist nicht dokumentiert. Also bei **jedem** Aufruf abfangen.
- Die Doku-Beispiele übergeben Zahlen (`setItem("gold", 100)`), die Signatur verlangt `string`. → Immer selbst serialisieren.
- „it's a good practice to always retrieve your data before setting data to ensure that the player's previous progress isn't lost“ (sdk/data). Das passt zur Speichersperre aus BRIEF 9.2 ✔.

### 3.7 „Progress Save“-Schalter: existiert; die Option hat einen konkreten Wortlaut, und es gibt die Alternative „APS“
- Der Fehlertext nennt die Option genau: „`dataModuleDisabled` – please be sure you selected the **"Yes, using the Data Module from the CrazyGames SDK"** option when submitting your game“ (sdk/data). → So in `docs/SUBMISSION.md` und in die Auftraggeber-Checkliste übernehmen.
- **Neu:** requirements/account-integration nennt neben dem Data-Modul ein „**Automatic Progress Save** system, which automatically syncs local progress to the cloud“ (APS). Das Formular hat also vermutlich mehrere Optionen. **Wir wählen das Data-Modul, nicht APS** (APS synchronisiert localStorage, und das wollen wir nicht doppelt) **[Einschätzung]**.
- „Progress save“ steht unter *Full Implementation*. Für Basic heißt es: „You can however use the Data module in our SDK to save user progress“. Im Basic Launch zu nutzen ist also erlaubt ✔.

### 3.8 `user.systemInfo`: Struktur und Werte von `applicationType`
Laut sdk/user (Beispielantwort):
```json
{ "countryCode": "US", "locale": "en-US",
  "device": { "type": "desktop" },          // "desktop" | "tablet" | "mobile"
  "os": { "name": "Windows", "version": "10" },
  "browser": { "name": "Chrome", "version": "107.0.0.0" },
  "applicationType": "web" }                // "google_play_store" | "apple_store" | "pwa" | "web"
```
- `locale` hat die Form `"en-US"`. Die Regel aus BRIEF 10 (`startsWith('de')` → DE) passt ✔. Groß- und Kleinschreibung sicherheitshalber normalisieren.
- **Neu:** `applicationType` kennt auch `"pwa"`. App-Erkennung laut Doku: `["google_play_store","apple_store"].includes(systemInfo.applicationType)` (resources/crazygames-app).

### 3.9 `isOfflineMode`: Ort, Zeitpunkt, und Rewarded-Ads sind offline offenbar **möglich**
- `window.CrazyGames.SDK.game.isOfflineMode` (auf `game`, nicht `user`). „The value is available once init() has resolved and does not change while the game is running.“ (resources/crazygames-app)
- Offline sollen nur Funktionen ausgeblendet werden, die eine Verbindung brauchen: „such as multiplayer, leaderboards or purchases“. **Ads sind dort nicht genannt.**
- sdk/video-ads, Fehlercode `adsDisabled`: „ads are not available for this session, for example during Basic Launch, in Kids mode, or in offline mode where only rewarded ads are available.“ → Offline gibt es offenbar **nur Rewarded**, Midgame liefert dann `adsDisabled`.
- **Abweichung zu BRIEF 11.1/11.2** („wenn true: Ad-Buttons ausblenden“): Das ist strenger als nötig und nur für FULL relevant. Empfehlung für FULL: Offline Midgame nicht anfordern. Rewarded-Buttons anzeigen und bei `adError` sauber reagieren, oder (konservativ) wie im Brief ausblenden. Entscheidung offen und für BASIC irrelevant.

### 3.10 Midgame-Cooldown: „still ignoriert“ vs. `adCooldown`-Fehler
- requirements/ads: „If the next midgame ad request is too early, it just gets ignored by the SDK and there is no impact for the user.“
- sdk/video-ads führt aber den Code `adCooldown` auf: „the ad was requested too soon, the usual midgame ad request interval is 3 minutes, taking rewarded and preroll ads into consideration.“
- → Bei einer zu frühen Anfrage kann `adError({code:'adCooldown'})` kommen. Der Wrapper muss dann sofort weiterspielen (UI entsperren, `gameplayStart`). Der Brief behandelt `adCooldown` in 11.2 bereits. Nur die Aussage „still“ ist ungenau, und auch Rewarded- und Preroll-Ads zählen in den Cooldown.
- **Neu:** „`adsDisabled` replaces the former `adsDisabledBasicLaunch` code.“
- `requestAd` hat laut HTML5-Doku Callbacks `{adStarted, adFinished, adError}`. Einen Rückgabewert dokumentiert sie nicht. → Nicht `await`en, nur Callbacks nutzen.

### 3.11 Preview-Video: Hochformat-Pixelmaß nicht angegeben, weitere Verbote
- Doku: „Full-screen size in landscape (1080p - 16:9 ratio) (mandatory)“ und „Full-screen size in portrait (1080p - 2:3 ratio) (mandatory)“. **Ein Pixelmaß wie 1080×1620 steht nicht in der Doku.** 1080×1620 ist eine plausible Auslegung **[Einschätzung]**. Die Fakt-Kennzeichnung in BRIEF 15.3 ist zu stark. Beide Formate sind **Pflicht**.
- Länge: „15-20 seconds maximum, longer videos will be cut to 20 seconds“.
- **Zusätzlich verboten** (fehlt in BRIEF 15.3): „"Play Now" text or promotional texts“ und „**App or social media icons**“.
- „No fast-forwarding: We automatically speed up the video slightly when processing it“ → in Echtzeit (1×) aufnehmen und nichts beschleunigen.
- Cover zusätzlich: „Don’t use copyrighted visuals that you don’t have the right to use“. Beispiele für verbotenen Text: „New, Updated, Play or Play now“.

### 3.12 Qualitäts-Wortlaut: Der Ablehnungssatz steht nirgends; die Quality Guidelines sind formal **optional**
- „The overall quality of the game does not yet meet the expectations of our platform.“ steht auf **keiner** der geprüften Seiten. Die Herkunft bleibt die Ablehnungsmail [Einschätzung wie im Brief].
- Die Doku sagt zu den Guidelines: „These are not mandatory but strongly recommended.“ (requirements/gameplay) und „Quality Guidelines … These are optional“ (requirements/intro). Pflicht ist die Gameplay-Seite: „Only games that prioritize quality and gameplay will be allowed on the platform.“
- Die FAQ nennt Ablehnungsgründe aus dem initialen QA-Check: „Bugs or broken mechanics; Missing English-language support; Unoriginal content (e.g. clones or asset flips); Inappropriate themes or content; Not meeting our Developer Requirements, Terms & Conditions, or ethical standards; Does not adhere to PEGI-12 guidelines; Content is targeted for kids“.
- Ästhetik-Wortlaut (requirements/quality): „Graphics should be of high quality. High resolution … consistent resolution throughout the game … free of graphical defects like compression artifacts“ und „The games aesthetic style should remain consistent and not switch between looks i.e. moving from realistic to cartoony“. Dazu: „The name and imagery presented on CrazyGames should reflect accurately the type of game“.
- Weitere Punkte aus den Guidelines, die im Brief nicht ausdrücklich stehen: „Buttons are not sized to encourage ads or other behaviors“ und „Buttons do not have delays“. Beides gehört in den UI-Kit-Check.

### 3.13 Basic Launch: Ablauf, Dauer, und **Updates während des Basic Launch sind möglich**
- Dauer: „Basic Launch ends once your game has been live for at least 7 days and has reached at least 500 plays. Both thresholds need to be met. If your game hasn't reached 500 plays, the period ends automatically after 21 days.“ (basic-launch-metrics, Root)
- **Neu und wichtig:** „You can update your game at any time. Updates are automatically approved, and their impact appears in your data with the daily dashboard refresh.“ (basic-launch-metrics). Und: „Game and art updates for games in Basic Launch go live instantly.“ (faq).
  → Der Satz aus BRIEF 0.2 („Es gibt keinen weiteren Entwurf“) gilt weiter für den **initialen QA-Check**. Nach bestandenem QA lassen sich KPI-Probleme aber im laufenden Basic Launch per Update beheben. Das gehört in den Update-Plan (15.7): P1-Fixes in der ersten Woche ausliefern.
- Drei Ausgänge (Root): alle Metriken gut → Einladung zum Full Launch. **„If some metrics meet benchmarks, you may be invited to improve your game and request another Basic Launch period.“** (neu). Die meisten schlecht → nur noch als neues Spiel.
- Basic heißt: „no CrazyGames-specific integration and only Basic QA review“, das SDK ist optional. Integriert man es, ist nur `gameplayStart` Pflicht (requirements/technical). Unsere volle Integration im BASIC-Build ist erlaubt. Ads bleiben dabei aus („If you choose to integrate the SDK during Basic Launch, ads remain disabled.“).
- „If you did integrate the Ads SDK, our team will check to make sure the game runs smoothly while ads are disabled.“ (requirements/ads). Unser BASIC-Build ohne Ad-UI erfüllt das ✔.

### 3.14 Common Fixes: Leertaste fehlt im offiziellen Snippet (Doku-Fehler)
- Das Snippet enthält wörtlich `["ArrowUp", "ArrowDown", ""].includes(event.key)`, also einen **leeren String** statt `" "`, obwohl der Kommentar „spacebar scrolling“ sagt (im HTML-Quelltext geprüft). → Wir verwenden `" "` (und `"Space"` per `event.code`), wie in BRIEF 6.3.
- Das `visibilitychange`-Snippet mit `application.publishEvent` ist Unity-spezifisch und für uns irrelevant.
- `wheel` → `preventDefault` global. Unser Zoom per Mausrad funktioniert trotzdem, weil der Listener im Spiel das Event selbst auswertet.

### 3.15 Monetarisierungs-Tipps widersprechen teils den Ads-Requirements
- monetizing-clicker empfiehlt Midgames „like opening a shop“. requirements/ads verbietet aber: „Do not show a midgame ad on a navigational button (e.g. … opening the shop)“. → Es gelten die **Requirements**. BRIEF 11.2 hält das schon richtig ein ✔.
- monetizing-clicker empfiehlt einen Warnhinweis von „3-to-5 second“ („Ad starting in 3...“). Der Brief hat 3 s ✔.
- Neue Vergleichswerte: Clicker im Schnitt 15 min Spielzeit und 6,6 % D1. Simulation 7,9 Impressions pro Play (3,3 davon rewarded). Die Doku empfiehlt Rewarded-Limits wie „up to 5 times per day“ für Premium-Währung.

### 3.16 App-Sitelock / CSP (nur falls wir je per iframe ausliefern)
- iOS-App-Origin `capacitor://app.crazygames.com`, Android `https://app.crazygames.com`. Wer per CSP `frame-ancestors` sperrt, muss beide Origins zulassen: `frame-ancestors 'self' *.crazygames.com capacitor://*.crazygames.com;`. Ein reiner Hostname-Check im Spiel funktioniert auch in den Apps. Wer den Embedder prüft (`document.referrer`, `ancestorOrigins`), soll nur den Host vergleichen (resources/html5/sitelock). Für unseren Upload-Build gibt es keinen Handlungsbedarf.

### 3.17 Kleinere Ergänzungen
- `game.settings` enthält neben `muteAudio` auch `disableChat`. Lokal testen: `?muteAudio=true` (sdk/game).
- `game.isInstantMultiplayer` und Room-APIs existieren, sind aber für uns irrelevant.
- `loadingStart/Stop` ist optional, aber „allow us to measure and report on in-game loading times and fail rates“. Laut Brief bleibt es weg. Ein späteres Nachrüsten würde uns Ladezeit- und Fehlerquoten im Dashboard liefern. Das ist eine Option für P1, kein Muss.
- Die FAQ nennt unter den Einreichungsunterlagen „SDK integration“ und „Game metadata (description, instructions, thumbnails)“. Für Basic ist das SDK aber laut Requirements optional. Wir integrieren es ohnehin.
- „User Consent“: Ein Privacy-Hinweis ist nur nötig, wenn das Spiel „additional personal data beyond the events in our SDK“ sammelt. BRIEF 7.5 (kein Privacy-Link) passt ✔.
- „CrazyGames has advanced device detection … We strongly recommend to rely on our system info to implement a device-specific experience.“ → `device.type` statt eigener UA-Erkennung.
- Eine Upload- oder Zip-Formatvorgabe steht weiterhin nicht in der Doku. Die FAQ sagt nur „upload the updated files“ und spricht von einem CDN („don't need to implement a cache invalidation mechanism“). → Wie im Brief: im Portal prüfen.

---

## 4. SDK-Cheatsheet (HTML5 SDK v3)

```html
<!-- index.html, im <head>, NACH dem Inline-Ladebildschirm-CSS, VOR dem Spielcode -->
<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
<!-- Fallback laut 3.2: <script src="…" async onload=… onerror=…> (Muster aus dem Construct-Beispiel) -->
```

```ts
// Zugriff: window.CrazyGames?.SDK  (undefined bei Adblock/Ladefehler → Mock)
type CGEnvironment = 'local' | 'crazygames' | 'disabled';
interface CGError { code: string; message: string }        // v3-Fehlerformat, überall

interface CGSettings { muteAudio: boolean; disableChat: boolean }

interface CGSystemInfo {
  countryCode: string;                                      // "US"
  locale: string;                                           // "en-US" → startsWith('de')
  device: { type: 'desktop' | 'tablet' | 'mobile' };
  os: { name: string; version: string };                    // ua-parser-js-Format
  browser: { name: string; version: string };
  applicationType: 'web' | 'pwa' | 'google_play_store' | 'apple_store';
}

interface CrazyGamesSDK {
  init(): Promise<void>;            // MUSS awaited werden; vorher ist das SDK unbenutzbar.
                                    // Lädt dabei alle Data-Modul-Daten vor (kann dauern).
  readonly environment: CGEnvironment; // Property (v3). 'disabled' → JEDER Aufruf wirft.
                                       // ?useLocalSdk=true erzwingt 'local'.
  game: {
    gameplayStart(): void;          // Spielstart/Fortsetzen; der 1. Aufruf = Messpunkt Initial-Download
    gameplayStop(): void;           // jede Spielpause (Menü, Pause, vor Midgame). NICHT bei Fokus-/Tabverlust.
    loadingStart(): void;           // optional (bei uns nicht genutzt)
    loadingStop(): void;            // optional
    happytime(): void;              // sparsam; nicht für Level-Ende/Items
    reportGameCompletedPercentage(percent: number): void; // 0..100, nur HTML5; beim Laden + bei Fortschritt
    setGameContext(ctx: Record<string, string | number | boolean>): void; // hängt an Spieler-Feedback
    clearGameContext(): void;
    readonly settings: CGSettings;  // muteAudio === true → Ton aus; eigener Schalter darf nicht übersteuern
    addSettingsChangeListener(fn: (s: CGSettings) => void): void;
    removeSettingsChangeListener(fn: (s: CGSettings) => void): void;
    readonly isOfflineMode: boolean; // erst nach init(); ändert sich während der Session nicht (App-Offline-Modus)
    // (isInstantMultiplayer, inviteParams, updateRoom, leftRoom … → nicht genutzt)
  };
  data: {                           // SYNCHRON, localStorage-API; kann werfen (CGError)
    getItem(key: string): string | null;
    setItem(key: string, value: string): void; // SDK debounced 1 s … 30 s
    removeItem(key: string): void;
    clear(): void;                  // irreversibel
    // Fehlercodes: 'dataLimitExcedeed' (alle Keys zusammen > 1 048 576 Bytes JSON; sic!),
    //              'dataModuleDisabled' (Formular: "Yes, using the Data Module from the CrazyGames SDK"),
    //              'other'
  };
  user: {
    readonly systemInfo: CGSystemInfo;      // Property (v3), nach init()
    readonly isUserAccountAvailable: boolean;
    // getUser(), getUserToken(), showAuthPrompt() … → v1 nicht genutzt
  };
  ad: {                             // nur FULL-Build
    requestAd(type: 'midgame' | 'rewarded', callbacks?: {
      adStarted?: () => void;       // HIER erst muten + pausieren
      adFinished?: () => void;      // rewarded: HIER belohnen; unmute, weiter
      adError?: (e: CGError) => void; // 'adsDisabled' | 'unfilled' | 'adblock' | 'adCooldown' | 'other'
                                    // → keine Belohnung, unmute, UI frei, weiterspielen
    }): void;                       // Rückgabe undokumentiert → nicht awaiten
    hasAdblock(): Promise<boolean>;
  };
}
```

**Hinweise für den Wrapper (`platform.ts`)**
1. `sdk = window.CrazyGames?.SDK`. Fehlt es → Mock. Jeder Aufruf geht über `safe(() => …)` mit try/catch, weil `disabled` und Data-Fehler werfen.
2. `await sdk.init()` mit Timeout (8 s auf `*.crazygames.com`, sonst 2 s, siehe BRIEF 9.2). Danach `environment` lesen: `'crazygames'` → echt, `'local'` → echt (Konsolen-Logs) oder Mock per Flag, `'disabled'` → Mock.
3. Erst nach `init()`: `systemInfo.locale`, `settings.muteAudio` plus Listener, `isOfflineMode`, Data-Lesen.
4. `gameplayStart/Stop` puffern und Doppelaufrufe unterdrücken. Den letzten Zustand nach `init()` nachfeuern.
5. Data: `setItem(key, JSON/lz-string)`. Bei `dataModuleDisabled` laut warnen, Fallback localStorage. Bei `dataLimitExcedeed` den alten Slot behalten und warnen. Nie einen eigenen localStorage-Spiegel neben dem Data-Modul.
6. `reportGameCompletedPercentage`: beim Laden und nach jeder Inspektion. Normierung siehe 3.4 (offen).
7. `setGameContext`: nur flache Primitive, nur bei Änderung.
8. Lokale Test-Query-Parameter: `?useLocalSdk=true`, `?muteAudio=true`, `?disableChat=true`.

## 5. Entscheidung: SDK-Tag asynchron (Brief 9.2 Schritt 1, Test A1b)

Ein synchroner `<script src=…>` im `<head>` blockiert das Parsen des `<body>`. Das Markup des Ladebildschirms steht aber im `<body>` und würde erst nach dem SDK-Download gemalt. Bei 5 s SDK-Verzögerung (A1b) bliebe der Bildschirm 5 s leer. Nach erneutem Lesen der Doku (§3.6 oben: `async` ist nicht verboten, das Construct-Beispiel lädt dynamisch mit `onload`/`onerror`) lädt `index.html` das SDK deshalb per dynamisch eingefügtem `<script async>` und stellt ein Promise `window.__cgSdkReady` bereit. `src/platform/crazygames.ts` wartet darauf, bevor es `window.CrazyGames.SDK` liest. A1/A1b sind damit grün (verzögert und abgebrochen).

## 6. Entscheidung: `reportGameCompletedPercentage` (Abweichung 2 oben)

Laut Doku bezieht sich der Wert auf den **aktuell vorhandenen** Inhalt. In v1 gibt es 2 Standorte, also **+50 % pro erstmals bestandener Inspektion** (statt +20 % gegen 5 geplante). Nach Content-Updates wird neu normiert und gemeldet. Der Wert darf dann sinken; das erlaubt die Doku ausdrücklich.

## 7. Entscheidung: Pixi `preference`

`app.init({ preference: ['webgl'], powerPreference: 'low-power' })` als Array, damit kein WebGPU-Fallback greift (siehe PIXI_V8_NOTES.md).
