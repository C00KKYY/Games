# Ember Night auf Roblox – Anleitung

Diese Anleitung führt dich ohne Programmierkenntnisse vom fertigen Spiel bis zur Veröffentlichung auf Roblox mit
Robux-Käufen. Rechne für alles zusammen mit einem Nachmittag bis zu einem Wochenende.

**Wichtig vorab:**

- **Die Roblox-Version ist ein eigenes Spiel.** Sie hat denselben Inhalt wie das Browser-Spiel „Glutnacht“ (5 Länder,
  9 Helden, alle Waffen, Bosse und Erfolge), ist aber in 3D, für bis zu 4 Spieler gemeinsam, und speichert auf
  Roblox. Fortschritt aus dem Browser-Spiel wird nicht übernommen, und Änderungen an einem der beiden Spiele wirken
  nicht auf das andere.
- **Das Spiel ist noch nie in Roblox Studio gelaufen.** Es wurde ohne Roblox gebaut und mit sehr vielen automatischen
  Tests geprüft (siehe Abschnitt 14). Beim ersten Öffnen können trotzdem Fehler auftauchen. Das ist normal. Abschnitt 13
  sagt, was du dann tun und schicken sollst.
- Die Roblox-Oberflächen werden oft umbenannt. Wenn ein Knopf bei dir etwas anders heißt, such nach dem ähnlichsten
  Begriff. Die englischen Namen stehen in Klammern, weil Studio meist auf Englisch ist.

---

## 1. Was du brauchst

- Einen Windows-PC oder Mac (Roblox Studio gibt es nicht für Telefone oder Linux).
- Ein Roblox-Konto, am besten mit bestätigter E-Mail-Adresse. Für mehr Audio-Uploads und später für Auszahlungen
  brauchst du auch eine Ausweis-Bestätigung (ID Verification) in den Roblox-Kontoeinstellungen.
- Die Datei **`dist/EmberNight.rbxlx`** aus diesem Ordner (das ist das ganze Spiel in einer Datei).
- Die Klangdateien aus **`assets/audio`** (34 Effekte in `sfx`, 5 Musikstücke in `music`).

## 2. Roblox Studio installieren

1. Im Browser <https://create.roblox.com> öffnen und anmelden.
2. „Studio herunterladen“ bzw. „Start Creating“ klicken, die Datei ausführen und installieren.
3. Roblox Studio starten und mit deinem Roblox-Konto anmelden.

## 3. Das Spiel öffnen und zum ersten Mal ausprobieren

1. In Studio: **Datei → Aus Datei öffnen** (File → Open from File…), dann `EmberNight.rbxlx` auswählen.
2. Fenster einblenden, die du brauchst: oben im Reiter **Ansicht** (View) **Explorer**, **Eigenschaften** (Properties)
   und **Ausgabe** (Output) anklicken. Das Ausgabe-Fenster ist wichtig: Dort stehen Fehlermeldungen in Rot.
3. **Spielen** (Play, Taste F5). Du erscheinst am Lagerfeuer im Hub. Links ist das Gruppenfenster (Held, Land,
   Bereit, Starten), unten die Leiste mit Helden, Weltkarte, Schmiede, Aussehen, Erfolgen, Statistik, Shop und
   Einstellungen.
4. **Stopp** (Shift+F5) beendet den Test.

Was beim ersten Test normal ist:

- Es ist still: Die Klänge sind noch nicht hochgeladen (Abschnitt 7). In der Ausgabe steht dazu ein Hinweis.
- Oben rechts steht gelb „Nicht gespeichert“, solange das Spiel nicht veröffentlicht ist und der API-Zugriff aus ist
  (Abschnitt 4).
- Im Shop ist fast nichts zu sehen: Robux-Artikel erscheinen erst, wenn ihre IDs eingetragen sind (Abschnitt 6).

Steuerung: WASD oder Pfeiltasten zum Laufen, Waffen feuern von selbst. Aufstiegskarten mit Klick oder 1–4, neu würfeln
R, überspringen K, verbannen B, Pause P (im Koop öffnet ☰ das Menü, ohne das Spiel anzuhalten).

## 4. Veröffentlichen und Spieleinstellungen

Erst veröffentlichen, dann einstellen: Viele Einstellungen und das Speichern funktionieren nur bei einem
veröffentlichten Spiel.

### 4.1 Erstes Veröffentlichen (noch privat)

1. **Datei → Auf Roblox veröffentlichen** (File → Publish to Roblox, Alt+P).
2. „Neues Erlebnis erstellen“ (Create new experience) wählen.
3. Name: z. B. **Ember Night**. Beschreibung: siehe Vorschlag unten. Geräte: siehe 4.2.
4. **Erstellen** (Create). Das Spiel ist jetzt auf Roblox, aber noch **privat**: Nur du kannst es öffnen.

Vorschlag für die Beschreibung:

> Überlebe die Nacht! Allein oder mit bis zu 3 Freunden kämpfst du dich durch Horden aus Fledermäusen, Skeletten und
> Geistern. Deine Waffen feuern von selbst – du entscheidest, wohin du läufst und welche Verbesserungen du wählst.
> 5 Länder, 9 Helden, 16 Bosse, Waffen-Entwicklungen und eine Schmiede für dauerhafte Verbesserungen.
>
> Survive the night! Alone or with up to 3 friends, fight through hordes of bats, skeletons and ghosts. Your weapons
> fire on their own – you choose where to move and which upgrades to take. 5 lands, 9 heroes, 16 bosses, weapon
> evolutions and a forge for permanent upgrades.

### 4.2 Spieleinstellungen in Studio

Im Reiter **Start** (Home) auf **Spieleinstellungen** (Game Settings) klicken.

| Bereich | Einstellung | Wert |
|---|---|---|
| Grundinfos (Basic Info) | Geräte (Playable Devices) | Computer, Telefon (Phone), Tablet, Konsole (Console) anhaken; VR nicht |
| Grundinfos | Genre | „Action“ oder „Survival“ (je nachdem, was die Liste anbietet) |
| Sicherheit (Security) | **Enable Studio Access to API Services** | **an**: Sonst speichert Studio nur im Arbeitsspeicher und zeigt „Nicht gespeichert“ |
| Orte (Places) bzw. Creator Hub → Orte → Ort bearbeiten | **Max Players / Server Size** | **4** |

Danach **Speichern** (Save). Die Spielerzahl findest du je nach Studio-Version unter „Places“ (beim Ort auf „…“ →
Bearbeiten) oder im Creator Hub (Abschnitt 5) unter deinem Spiel → **Orte** (Places) → den Ort anklicken → Einstellungen
zu Zugang/Servergröße. **4 ist wichtig:** Das Spiel ist für höchstens 4 Spieler je Server gebaut.

Ebenfalls im Creator Hub unter deinem Spiel ausfüllen:

- **Fragebogen zur Altersfreigabe** (Maturity & Compliance Questionnaire). Ehrlich beantworten: Fantasy-Gewalt
  gegen Monster, kein Blut, keine echten Waffen. Erwartet wird die Einstufung „Mild“. Ohne Fragebogen darf das Spiel
  nicht öffentlich werden.
- **Symbolbild** (Icon, quadratisch, 512×512) und **Vorschaubilder** (Thumbnails, 1920×1080). Am besten
  Bildschirmfotos aus Studio während eines Laufs. Die Bilder müssen das Roblox-Spiel zeigen, nicht das Browser-Spiel.

## 5. Robux-Artikel im Creator Hub anlegen

Öffne <https://create.roblox.com> → **Kreationen** (Creations) → dein Spiel **Ember Night** → links
**Monetarisierung** (Monetization). Dort gibt es **Pässe** (Passes) und **Entwicklerprodukte** (Developer Products).

- **Entwicklerprodukt** = kann mehrmals gekauft werden (Gold, Wiederbelebung) oder wird im Spiel gespeichert
  (Kosmetik). Anlegen: „Entwicklerprodukt erstellen“ → Name, Beschreibung, Bild, Preis → Speichern.
- **Pass** (Game Pass) = einmal kaufen, für immer besitzen. Anlegen: „Pass erstellen“ → Bild, Name, Beschreibung →
  Erstellen. Danach den Pass öffnen → **Verkauf** (Sales) → „Zum Verkauf“ (Item for Sale) einschalten → Preis →
  Speichern. **Ohne diesen Schritt ist der Pass nicht käuflich.**
- **Die ID kopieren:** In der Liste beim Artikel auf „…“ → „ID kopieren“ (Copy Asset ID / Copy Product ID). Die ID
  ist eine lange Zahl. Schreib jede ID mit dem zugehörigen **Schlüssel** (erste Spalte unten) auf, z. B. in eine
  Textdatei.

Roblox behält von jedem Verkauf einen Anteil ein (bei Pässen und Entwicklerprodukten bisher 30 %); du bekommst den
Rest. Die Preise unten sind Vorschläge. Du kannst sie im Creator Hub jederzeit ändern, das Spiel zeigt immer den
aktuellen Preis aus Roblox an.

### 5.1 Entwicklerprodukte (14 Stück)

| Schlüssel | Name (DE / EN) | Beschreibung (Vorschlag) | Preis |
|---|---|---|---|
| `revive` | Zweite Glut / Second Ember | Steh mit halber Kraft wieder auf (einmal pro Lauf). / Get back up with half health (once per run). | 25 R$ |
| `gold_s` | Goldbeutel / Gold Pouch | +1.000 Gold für die Schmiede. / +1,000 gold for the forge. | 49 R$ |
| `gold_m` | Goldtruhe / Gold Chest | +3.500 Gold für die Schmiede. / +3,500 gold. | 129 R$ |
| `gold_l` | Goldschatz / Gold Hoard | +10.000 Gold für die Schmiede. / +10,000 gold. | 299 R$ |
| `skin_ashen` | Aussehen: Aschgrau / Hero colours: Ash Grey | Neue Farben für alle Helden. / New colours for all heroes. | 79 R$ |
| `skin_frost` | Aussehen: Frostglanz / Hero colours: Frost Gleam | Neue Farben für alle Helden. | 79 R$ |
| `skin_nightbloom` | Aussehen: Nachtblüte / Hero colours: Nightbloom | Neue Farben für alle Helden. | 79 R$ |
| `fx_emerald` | Waffenfarbe: Smaragd / Weapon colour: Emerald | Färbt deine Waffeneffekte grün. | 59 R$ |
| `fx_azure` | Waffenfarbe: Azur / Weapon colour: Azure | Färbt deine Waffeneffekte blau. | 59 R$ |
| `fx_solar` | Waffenfarbe: Sonnenglanz / Weapon colour: Sunshine | Färbt deine Waffeneffekte gelb. | 59 R$ |
| `fx_prism` | Waffenfarbe: Prisma / Weapon colour: Prism | Wechselnde Farben für deine Waffeneffekte. | 99 R$ |
| `trail_frost` | Spur: Raureif / Trail: Hoarfrost | Eine eisblaue Spur hinter deinem Helden. | 49 R$ |
| `trail_star` | Spur: Sternenstaub / Trail: Stardust | Eine goldene Spur hinter deinem Helden. | 49 R$ |
| `trail_shadow` | Spur: Schatten / Trail: Shadow | Eine violette Spur hinter deinem Helden. | 49 R$ |

Die Kosmetik ist ein Entwicklerprodukt, wird aber im Spielstand gespeichert: einmal gekauft, für immer im Besitz. Das
Spiel bietet Gekauftes kein zweites Mal an.

### 5.2 Pässe (10 Stück)

| Schlüssel | Name (DE / EN) | Beschreibung (Vorschlag) | Preis |
|---|---|---|---|
| `pass_gold2x` | Doppeltes Gold / Double Gold | Doppeltes Gold aus jedem Lauf (nicht für Erfolge und gekauftes Gold). | 199 R$ |
| `pass_heroes_all` | Alle Helden / All Heroes | Schaltet alle sieben freischaltbaren Helden sofort frei. | 399 R$ |
| `pass_cosmetics` | Sammlung / Collection | Alle käuflichen Aussehen, Waffenfarben und Spuren, auch künftige. | 349 R$ |
| `kael` | Kael der Jäger / Kael the Hunter | Schaltet Kael sofort frei (auch durch seinen Erfolg erreichbar). | 99 R$ |
| `sela` | Sela die Priesterin / Sela the Priestess | Schaltet Sela sofort frei. | 99 R$ |
| `brom` | Brom der Schmied / Brom the Smith | Schaltet Brom sofort frei. | 99 R$ |
| `nyx` | Nyx die Sturmhexe / Nyx the Storm Witch | Schaltet Nyx sofort frei. | 99 R$ |
| `eira` | Eira die Frostwächterin / Eira the Frost Warden | Schaltet Eira sofort frei. | 99 R$ |
| `lio` | Lio der Glückspilz / Lio the Lucky One | Schaltet Lio sofort frei. | 99 R$ |
| `ignis` | Ignis der Brandstifter / Ignis the Firestarter | Schaltet Ignis sofort frei. | 99 R$ |

Aron und Mira sind immer frei. Alle anderen Helden kann man auch ohne Robux durch Erfolge freispielen, und alles in der
Schmiede lässt sich mit erspieltem Gold kaufen. Das ist Absicht und steht so auch im Shop. Roblox-Spieler reagieren
empfindlich auf „Pay to win“, und es gibt keine Zufallskäufe (Lootboxen), für die besondere Regeln gelten würden.

### 5.3 Woher die Bilder für die Artikel kommen

Jeder Pass braucht ein Bild, bei Entwicklerprodukten ist es freiwillig, aber empfehlenswert. Quadratisch, am besten
512×512 Pixel, PNG oder JPG. Alle Bilder prüft Roblox vor der Freigabe (Moderation). Das kann etwas dauern.

- **Am einfachsten:** In Studio ein Bildschirmfoto machen (z. B. die Heldenkarte mit der 3D-Vorschau im Heldenfenster,
  den Helden mit der neuen Spur im Lauf, einen Goldhaufen) und quadratisch zuschneiden, z. B. mit Paint, der
  Windows-Fotoanzeige oder Vorschau auf dem Mac.
- **Selbst gestalten** mit einem einfachen Bildprogramm (z. B. Canva): Hintergrund in Nachtblau, ein großes Symbol und
  ein Wort („x2“, „+1000“). Die Funken-, Flammen- und Sternbilder aus dem Browser-Spiel
  (`../glutnacht/assets/src/kenney`) sind frei verwendbar (CC0) und eignen sich als Grundlage.
- **Nicht verwenden:** Bilder aus anderen Spielen, Logos oder Figuren anderer Firmen, Bilder aus der Google-Suche.

## 6. Die IDs ins Spiel eintragen

Das geht direkt in Studio:

1. `EmberNight.rbxlx` in Studio öffnen (bzw. das veröffentlichte Spiel: Datei → Öffnen → „Meine Spiele“).
2. Im **Explorer** aufklappen: **ReplicatedStorage → Shared → Config → Products**. Doppelklick öffnet das Skript.
3. **Die sieben Heldenpässe** stehen ganz oben in **Zeile 34 bis 40**:

   ```lua
   local HERO_PASS_IDS: { [string]: number } = {
   	kael = 0,      -- Zeile 34
   	sela = 0,
   	brom = 0,
   	nyx = 0,
   	eira = 0,
   	lio = 0,
   	ignis = 0,     -- Zeile 40
   }
   ```

   Ersetze jeweils die `0` durch die ID des Passes, z. B. `kael = 1234567890,`. Komma am Ende stehen lassen.
4. **Alle anderen Artikel** stehen in **Zeile 45 bis 77**, je ein Artikel pro Zeilenpaar, z. B. Zeile 45:

   ```lua
   { key = "revive", kind = "product", id = 0, price = 25, ...
   ```

   Ersetze dort nur die Zahl hinter `id =`, also `id = 0` durch `id = 1234567890`. Den Schlüssel erkennst du an
   `key = "…"`. Die Zahl hinter `price =` ändert nichts im Spiel (der Preis kommt immer aus dem Creator Hub).
5. Wichtig: **Pass-IDs zu Pässen, Produkt-IDs zu Produkten.** Vertauschte IDs funktionieren nicht.
6. Speichern: **Datei → Auf Roblox veröffentlichen** (bzw. Strg+S und danach veröffentlichen).

Was die ID `0` behält, ist im Shop unsichtbar und kann nicht gekauft werden. Du kannst also mit wenigen Artikeln
anfangen und später weitere eintragen.

**Bitte schick mir die Liste „Schlüssel = ID“** (und die Audio-IDs aus Abschnitt 7). Dann trage ich sie auch in die
Quelldateien ein (`src/shared/Config/Products.luau` und `src/shared/Config/AudioIds.luau`). Sonst wären sie bei der
nächsten Version, die ich dir baue, wieder weg.

## 7. Klänge und Musik hochladen

1. Hochladen, entweder im Creator Hub → **Kreationen → Entwicklungsobjekte → Audio** (Development Items → Audio) →
   Hochladen, oder in Studio über **Ansicht → Asset-Manager** (Asset Manager) → **Massenimport** (Bulk Import), dort
   alle Dateien aus `assets/audio/sfx` und `assets/audio/music` auf einmal auswählen.
2. Die Uploads müssen **demselben Besitzer gehören wie das Spiel** (deinem Konto), sonst spielt Roblox sie nicht ab.
3. Roblox begrenzt Audio-Uploads pro Monat. Mit bestätigtem Ausweis ist das Limit deutlich höher (zuletzt 100 statt 10
   in 30 Tagen; prüf die aktuelle Zahl auf der Upload-Seite). Es sind 39 Dateien. Ohne Ausweis-Bestätigung zuerst die
   wichtigsten hochladen: `music/battle`, `music/menu`, `sfx/hit`, `sfx/gem`, `sfx/levelup`, `sfx/kill`, `sfx/hurt`,
   `sfx/chest`, `sfx/boss`, `sfx/click`.
4. Jede Datei bekommt eine ID (im Asset-Manager: Rechtsklick → „Asset-ID kopieren“).
5. In Studio öffnen: **ReplicatedStorage → Shared → Config → AudioIds**. Jede Zeile heißt wie die Datei, z. B. Zeile 8
   `achievement = 0,` für `sfx/achievement.mp3`. Die Klangeffekte stehen in **Zeile 8 bis 41**, die Musik in **Zeile 44
   bis 48** (`menu`, `battle`, `boss`, `victory`, `gameover`). Die `0` durch die ID ersetzen. Fehlende IDs bleiben
   einfach still, es gibt dabei keinen Fehler.
6. Veröffentlichen.

Die Klänge stammen aus dem Browser-Spiel und sind frei verwendbar (Quellen in `assets/audio/CREDITS-audio.txt`).

## 8. Käufe in Studio testen (kostenlos)

Testkäufe in Studio kosten **keine Robux**. Das Kauffenster sagt dann ausdrücklich, dass es ein Testkauf ist.

1. API-Zugriff muss an sein (Abschnitt 4.2), die IDs müssen eingetragen und das Spiel veröffentlicht sein.
2. F5 → **Shop** in der Leiste unten. Prüfe:
   - **Goldpaket kaufen** → das Gold oben steigt sofort.
   - **Heldenpass** → der Held ist im Heldenfenster frei.
   - **Kosmetik** → im Fenster „Aussehen“ auswählbar und im Lauf sichtbar (Heldenfarben, Spur, Waffenfarbe).
   - **Doppeltes Gold** → in den Ergebnissen nach einem Lauf erscheint eine Zeile „Doppeltes Gold“.
   - **Zweite Glut:** einen Lauf starten, absichtlich sterben, in der „Letzten Chance“ auf **Zweite Glut** drücken
     → der Held steht mit halber Kraft wieder auf.
3. **Stopp und erneut F5:** Alles Gekaufte muss noch da sein, und nichts darf doppelt gutgeschrieben sein.

Hinweis: Pässe, die du in Studio „gekauft“ hast, gelten nur in diesem Test. Im echten Spiel besitzt du sie erst nach
einem echten Kauf. Als Besitzer des Spiels zahlst du auch im echten Spiel; die Robux kommen abzüglich des Roblox-Anteils
zu dir zurück.

## 9. Mit 2–4 Spielern testen

1. In Studio den Reiter **Test** öffnen.
2. Im Bereich **Clients und Server** (Clients and Servers): „Lokaler Server“ (Local Server) und **2**, **3** oder
   **4** Spieler wählen → **Start**.
3. Es öffnen sich ein Server-Fenster und ein Fenster je Spieler. In einem Spieler-Fenster (der Gruppenleiter, meist
   Player1) Land wählen; in den anderen „Bereit“ drücken; dann im Leiter-Fenster **Starten**.
4. Prüfen: Alle sehen dieselben Gegner, Mitspieler mit Namen und Lebensleiste, Aufstiegskarten erscheinen unten, ohne
   dass das Spiel anhält. Wer am Boden liegt, kann von anderen wiederbelebt werden (in der Nähe stehen bleiben, der
   grüne Ring füllt sich).
5. **Aufräumen** (Cleanup) schließt alle Testfenster.

Später mit Freunden im echten Spiel: Das Spiel muss dafür veröffentlicht und für sie zugänglich sein (Abschnitt 11,
oder vorher in den Spieleinstellungen unter Berechtigungen (Permissions) einzelne Freunde zulassen).

## 10. Auf dem Telefon testen

1. **In Studio:** Reiter **Test** → **Gerät** (Device) → ein Telefon wählen (z. B. iPhone 14, **quer**). Dann F5.
   Prüfen: Alles passt auf den Bildschirm, Knöpfe sind groß genug, der Daumen-Stick zum Laufen funktioniert,
   Gegnerschüsse sind gut zu sehen.
2. **Auf dem echten Telefon:** Die Roblox-App installieren, mit **demselben Konto** anmelden, unter „Meine Spiele“
   bzw. über den Link des Spiels Ember Night öffnen. Solange das Spiel privat ist, kannst nur du es öffnen.
   Achte besonders darauf, ob das Spiel flüssig läuft, wenn viele Gegner auf dem Bildschirm sind (ab etwa Minute 10),
   und ob das Telefon heiß wird. Darauf konnte ich nichts testen.
3. **Gamepad/Konsole:** Wenn du einen Controller hast, am PC anschließen und in Studio testen. Pause liegt auf LB.

## 11. Öffentlich machen

Wenn die Tests oben gut aussehen:

1. Creator Hub → dein Spiel → **Konfigurieren** (Configure) bzw. in Studio Spieleinstellungen → **Berechtigungen**
   (Permissions) → **Öffentlich** (Public). Alternativ auf der Übersichtsseite des Spiels „Öffentlich machen“.
2. Vorher prüfen: Fragebogen zur Altersfreigabe ausgefüllt, Symbolbild und Vorschaubilder freigegeben, Beschreibung
   da, Max Players = 4.
3. Nach dem Veröffentlichen ein paar Tage die **Analytics** im Creator Hub beobachten (Fehler, Spielzeit, Käufe) und
   mir Fehler aus der Konsole schicken (Abschnitt 13).

Neue Spiele werden auf Roblox kaum von selbst gefunden. Freunde einladen, das Spiel in Gruppen oder sozialen Netzen
teilen und später eventuell Werbung im Creator Hub (Sponsoring, kostet Robux) helfen am meisten.

## 12. Geld verdienen und auszahlen lassen (DevEx)

Was ich sicher weiß:

- Robux aus Käufen landen auf deinem Roblox-Konto, nach einer **Wartezeit** (Robux werden erst einige Tage als
  „ausstehend“ geführt).
- Zusätzlich zahlt Roblox an Spiele mit vielen Premium-Spielern eine **Premium-Vergütung** nach Spielzeit. Bei einem
  neuen Spiel ist das anfangs wenig.
- Echtes Geld gibt es nur über das **Developer Exchange (DevEx)**-Programm von Roblox. Dafür verlangt Roblox
  (Stand meines Wissens, bitte prüfen):
  - mindestens 13 Jahre alt, ein Konto in gutem Zustand ohne Regelverstöße,
  - bestätigte E-Mail-Adresse und Ausweis-Bestätigung,
  - eine Mindestmenge **verdienter** Robux (gekaufte Robux zählen nicht); zuletzt 30.000 Robux,
  - ein DevEx-Konto mit Steuer- und Auszahlungsdaten (für Deutschland ein Steuerformular für Nicht-US-Bürger).
- Der Kurs lag zuletzt bei etwa **0,0038 US-Dollar je Robux** (also rund 114 US-Dollar für 30.000 Robux).

Wo ich mir **nicht sicher** bin, weil Roblox das öfter ändert: die genaue Mindestmenge, der aktuelle Kurs, die
Altersregeln für Auszahlungen an Minderjährige und welche Steuerformulare genau verlangt werden. Bitte auf der
offiziellen Seite nachlesen: <https://create.roblox.com/docs/production/earning-on-roblox> und den DevEx-Bedingungen.

**Steuern:** Einnahmen aus Roblox sind in Deutschland Einkommen und müssen angegeben werden; bei regelmäßigen
Einnahmen kann ein Gewerbe nötig sein. Das kann ich nicht verbindlich beurteilen. Frag im Zweifel eine
Steuerberatung.

Realistisch: Die meisten Roblox-Spiele verdienen wenig. Ob Ember Night Geld einbringt, hängt vor allem davon ab, ob
genug Leute es finden und wiederkommen.

## 13. Wenn ein Fehler auftaucht

1. **In Studio:** Im **Ausgabe**-Fenster (Ansicht → Ausgabe) stehen Fehler in **Rot**, Warnungen in Orange.
   Rechtsklick → **Alles kopieren** (Copy All) oder die roten Zeilen markieren und Strg+C.
2. **Im echten Spiel (auch auf dem Telefon):** **F9** drückt die Entwicklerkonsole auf; auf dem Telefon im
   Roblox-Menü unter Einstellungen „Entwicklerkonsole“ bzw. im Chat `/console` eingeben. Dort gibt es „Client“ und
   „Server“: beide ansehen.
3. **Bitte schick mir:**
   - den kopierten **Text** aus der Ausgabe oder Konsole (vollständig, besonders die erste rote Zeile und die
     Zeilen darunter mit „Script …, Line …“),
   - was du gerade gemacht hast (z. B. „Lauf im Eissee gestartet, bei 2:00 kam der Fehler“),
   - ob es allein oder mit mehreren Spielern war, am PC oder auf dem Telefon,
   - bei Darstellungsproblemen ein Bildschirmfoto.
4. Bitte nichts im Code selbst „reparieren“ außer den IDs: Dann kann ich deine Änderungen später nicht übernehmen.

Dinge, die mir zurückgemeldet besonders helfen, weil ich sie ohne Studio nicht prüfen konnte:

- Ist die Ansicht im Lauf zu dunkel oder zu hell? Sind Gegner, Warnzeichen und Gegnerschüsse gut zu erkennen?
- Ruckelt es, und ab wann? (Studio: Strg+F6 öffnet den MicroProfiler.)
- Funktioniert das Laufen mit dem Daumen-Stick auf dem Telefon und mit dem Controller?
- Erscheinen die Symbole (Emoji) auf den Aufstiegskarten, oder nur leere Kästchen?
- Kommen Testkäufe an, und ist nach erneutem Beitreten alles noch da?

Eine ausführliche Prüfliste für Studio steht in [`docs/STUDIO-CHECKLIST.md`](docs/STUDIO-CHECKLIST.md).

## 14. Was hier schon geprüft wurde

- Die ganze Spiellogik (Gegner, Wellen, Bosse, Waffen, Aufstiege, Truhen, Gold, Erfolge) läuft ohne Roblox in einer
  Testumgebung und wurde Schritt für Schritt mit dem Code des Browser-Spiels verglichen. Ein Testspieler-Programm hat
  Hunderte Läufe gespielt; die Siegquoten liegen nahe am Browser-Spiel.
- Server, Speichern, Käufe und die Oberfläche wurden gegen eine nachgebaute Roblox-Umgebung getestet, einschließlich
  doppelt zugestellter Kaufbelege, Verbindungsabbrüchen und Wiederbeitritt.
- **Nicht** geprüft werden konnte alles, was nur die echte Roblox-Engine zeigt: wie es aussieht, wie flüssig es läuft
  (vor allem auf Telefonen), das echte Netzwerk mit mehreren Spielern, echte Käufe und das echte Speichern.
