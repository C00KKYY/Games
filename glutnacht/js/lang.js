'use strict';
// Sprachen. Deutsch ist die Quellsprache im Code; tr() schlägt im englischen Modus die Übersetzung nach.
// Platzhalter {0}, {1} … werden durch die weiteren Argumente ersetzt.

const LANGS = { en: 'English', de: 'Deutsch' };
let LANG = 'en';
const I18N_MISSES = new Set(); // fehlende Übersetzungen (für Tests)

function detectLang() {
  const nav = typeof navigator !== 'undefined' ? (navigator.languages && navigator.languages[0]) || navigator.language || '' : '';
  return /^de\b/i.test(nav) ? 'de' : 'en';
}

function setLang(l) {
  LANG = LANGS[l] ? l : 'en';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = LANG;
    document.title = tr('Glutnacht');
  }
}

function tr(key, ...args) {
  let s = key;
  if (LANG === 'en') {
    const v = LANG_EN[key];
    if (v === undefined) I18N_MISSES.add(key); else s = v;
  }
  if (args.length) s = s.replace(/\{(\d)\}/g, (m, i) => args[+i]);
  return s;
}

// Dezimalzahl in der aktuellen Sprache (1,3 / 1.3)
function fmtDec(v) {
  const s = String(v);
  return LANG === 'de' ? s.replace('.', ',') : s;
}

const LANG_EN = {
  // ---------- Name & Menü ----------
  'Glutnacht': 'Ember Night',
  'Glut': 'Ember',
  'nacht': 'Night',
  'Überlebe die Nacht. 15 Minuten. Tausende Monster.': 'Survive the night. 15 minutes. Thousands of monsters.',
  'SPIELEN': 'PLAY',
  'Schmiede': 'Forge',
  'Erfolge': 'Achievements',
  'Einstellungen': 'Settings',
  'Bestzeit {0} · Höchste Stufe {1} · {2} Monster besiegt · {3} Siege': 'Best time {0} · Highest level {1} · {2} monsters defeated · {3} wins',
  'Tipp:': 'Tip:',
  'Sprache': 'Language',
  'Du greifst automatisch an. Lauf, weich aus und sammle blaue Edelsteine – jede Stufe bringt eine neue Waffe oder Verbesserung.': 'You attack automatically. Move, dodge and collect blue gems. Every level brings a new weapon or upgrade.',
  'Jede Waffe auf Stufe 8 plus ihr passiver Partner – dann entwickelt sie sich in der nächsten Truhe.': 'Get a weapon to level 8 and own its passive partner, and the next chest evolves it.',
  'Elitegegner (goldener Schein) tragen Truhen. Bosse auch.': 'Elite enemies (golden glow) carry chests. So do bosses.',
  'Kohlebecken auf der Karte zerschlagen: Gold, Herzen, Magnete und Bomben.': 'Smash braziers on the map for gold, hearts, magnets and bombs.',
  'Gold bleibt nach dem Tod erhalten – in der Schmiede wirst du dauerhaft stärker.': 'You keep your gold when you die. Spend it in the Forge to grow stronger for good.',
  'Rote Flächen am Boden: Der Boss holt zum Schlag oder Sturmangriff aus. Raus da!': 'Red areas on the ground mean a boss slam or charge is coming. Get out!',
  'Der Magnet zieht alle Edelsteine auf der Karte zu dir.': 'The magnet pulls every gem on the map to you.',
  'Bei „Umzingelt!“ nicht warten – brich früh durch eine Lücke.': 'When you get "Surrounded!", don\'t wait. Break through a gap early.',
  'Glück erhöht die Chance auf eine vierte Karte und auf große Truhen.': 'Luck raises the chance of a fourth card and of bigger chests.',
  'Verbannen entfernt eine neue Waffe oder ein Passiv für den Rest des Laufs.': 'Banish removes a new weapon or passive for the rest of the run.',
  'Siege schalten Nachtstufen frei: härter, aber deutlich mehr Gold.': 'Wins unlock night levels: harder, but much more gold.',

  // ---------- Heldenwahl ----------
  'Wähle deinen Helden': 'Choose your hero',
  'Nachtstufe': 'Night level',
  'Normal': 'Normal',
  'Gold ×{0}': 'Gold ×{0}',
  'Zurück': 'Back',
  'LOS!': 'GO!',
  'der Wächter': 'the Warden',
  'die Magierin': 'the Mage',
  'der Jäger': 'the Hunter',
  'die Priesterin': 'the Priestess',
  'der Schmied': 'the Smith',
  'die Sturmhexe': 'the Storm Witch',
  'die Frostwächterin': 'the Frost Guardian',
  'der Glückspilz': 'the Lucky One',
  'der Brandstifter': 'the Firestarter',
  '+20 Leben, +1 Rüstung': '+20 health, +1 armor',
  '−10 % Abklingzeit': '−10% cooldown',
  '+15 % Lauftempo, +10 % Geschosstempo': '+15% move speed, +10% projectile speed',
  '+0,4 Leben/s, +10 Leben': '+0.4 health/s, +10 health',
  '+15 % Schaden, etwas langsamer': '+15% damage, slightly slower',
  '+10 % Fläche, +20 % Glück': '+10% area, +20% luck',
  '+1 Rüstung, +30 % Sammelradius': '+1 armor, +30% pickup radius',
  '+30 % Glück, +25 % Gold': '+30% luck, +25% gold',
  '+20 % Wirkdauer, +10 % Schaden': '+20% duration, +10% damage',
  'Aron': 'Aron', 'Mira': 'Mira', 'Kael': 'Kael', 'Sela': 'Sela', 'Brom': 'Brom', 'Nyx': 'Nyx', 'Eira': 'Eira', 'Lio': 'Lio', 'Ignis': 'Ignis',

  // ---------- Schmiede ----------
  'Dauerhafte Verbesserungen für alle Helden. Jeder Kauf macht alle weiteren Käufe etwas teurer.': 'Permanent upgrades for every hero. Each purchase makes all further purchases a bit more expensive.',
  'MAX': 'MAX',
  'Wirklich alles zurückerstatten?': 'Really refund everything?',
  'Alles zurückerstatten': 'Refund everything',
  'Macht': 'Power', '+5 % Schaden': '+5% damage',
  'Rüstung': 'Armor', '+1 Rüstung': '+1 armor',
  'Lebenskraft': 'Vitality', '+10 % max. Leben': '+10% max health',
  'Erholung': 'Recovery', '+0,1 Leben/s': '+0.1 health/s',
  'Tempo': 'Swiftness', '+5 % Lauftempo': '+5% move speed',
  'Anziehung': 'Attraction', '+25 % Sammelradius': '+25% pickup radius',
  'Wachstum': 'Growth', '+4 % Erfahrung': '+4% experience',
  'Gier': 'Greed', '+10 % Gold': '+10% gold',
  'Eile': 'Haste', '−3 % Abklingzeit': '−3% cooldown',
  'Reichweite': 'Reach', '+5 % Fläche': '+5% area',
  'Beständigkeit': 'Persistence', '+10 % Wirkdauer': '+10% duration',
  'Glück': 'Luck', '+10 % Glück': '+10% luck',
  'Neu würfeln': 'Reroll', '+1 Neuwurf pro Lauf': '+1 reroll per run',
  'Überspringen': 'Skip', '+1 Überspringen pro Lauf': '+1 skip per run',
  'Verbannen': 'Banish', '+1 Verbannen pro Lauf': '+1 banish per run',
  'Mehrfachschuss': 'Multishot',
  'Wiedergeburt': 'Revival', 'Einmal pro Lauf mit halbem Leben wiederauferstehen': 'Come back once per run with half health',

  // ---------- Erfolge ----------
  'Entdeckte Entwicklungen': 'Discovered evolutions',
  'Erste Nacht': 'First Night', 'Überlebe 1 Minute': 'Survive 1 minute',
  'Zähe Seele': 'Tough Soul', 'Überlebe 5 Minuten': 'Survive 5 minutes',
  'Nachtwache': 'Night Watch', 'Überlebe 10 Minuten': 'Survive 10 minutes',
  'Morgengrauen': 'Dawn', 'Besiege Die Nacht (15 Minuten)': 'Defeat The Night (15 minutes)', 'Ignis + Nachtstufe 1': 'Ignis + night level 1',
  'Lehrling': 'Apprentice', 'Erreiche Stufe 10': 'Reach level 10',
  'Geselle': 'Journeyman', 'Erreiche Stufe 20': 'Reach level 20',
  'Meister': 'Master', 'Erreiche Stufe 40': 'Reach level 40',
  'Legende': 'Legend', 'Erreiche Stufe 60': 'Reach level 60',
  'Aufräumer': 'Cleaner', 'Besiege 500 Gegner in einem Lauf': 'Defeat 500 enemies in one run',
  'Sturmflut': 'Storm Surge', 'Besiege 2000 Gegner in einem Lauf': 'Defeat 2,000 enemies in one run',
  'Vernichter': 'Annihilator', 'Besiege 5000 Gegner in einem Lauf': 'Defeat 5,000 enemies in one run',
  'Jäger der Nacht': 'Night Hunter', 'Besiege insgesamt 3000 Gegner': 'Defeat 3,000 enemies in total',
  'Plage': 'Plague', 'Besiege insgesamt 25 000 Gegner': 'Defeat 25,000 enemies in total',
  'Verwandlung': 'Transformation', 'Entwickle eine Waffe': 'Evolve a weapon',
  'Alchemist': 'Alchemist', 'Entdecke 3 Entwicklungen': 'Discover 3 evolutions',
  'Großmeister': 'Grandmaster', 'Entdecke alle 9 Entwicklungen': 'Discover all 9 evolutions',
  'Doppelschlag': 'Double Strike', '2 Entwicklungen in einem Lauf': '2 evolutions in one run',
  'Königsmord': 'Regicide', 'Besiege den Schleimkönig': 'Defeat the Slime King',
  'Knochenbrecher': 'Bonebreaker', 'Besiege den Knochenfürsten': 'Defeat the Bone Lord',
  'Pfählung': 'Stake Through the Heart', 'Besiege den Blutgrafen': 'Defeat the Blood Count',
  'Steinmetz': 'Stonemason', 'Besiege den Steinkoloss': 'Defeat the Stone Colossus',
  'Schatzsucher': 'Treasure Hunter', 'Öffne insgesamt 10 Truhen': 'Open 10 chests in total',
  'Goldrausch': 'Gold Rush', 'Verdiene insgesamt 2000 Gold': 'Earn 2,000 gold in total',
  'Unberührbar': 'Untouchable', 'Überlebe 3 Minuten ohne Treffer': 'Survive 3 minutes without getting hit',
  'Vollausstattung': 'Fully Loaded', 'Sammle 6 Waffen und 6 Passive in einem Lauf': 'Hold 6 weapons and 6 passives in one run',
  'Tiefe Nacht': 'Deep Night', 'Gewinne auf Nachtstufe 3 oder höher': 'Win on night level 3 or higher',
  'Ewige Finsternis': 'Eternal Darkness', 'Gewinne auf Nachtstufe 5': 'Win on night level 5',

  // ---------- Einstellungen ----------
  'Klangeffekte': 'Sound effects',
  'Musik': 'Music',
  'Schadenszahlen': 'Damage numbers',
  'Bildschirmwackeln': 'Screen shake',
  'Steuerung': 'Controls',
  'Laufen: WASD / Pfeiltasten oder irgendwo auf den Bildschirm tippen oder klicken und ziehen.': 'Move: WASD / arrow keys, or touch or click anywhere and drag.',
  'Angreifen passiert automatisch.': 'Attacks are automatic.',
  'Pause: Esc / P · Karten wählen: 1–4 · Neu würfeln: R': 'Pause: Esc / P · Pick a card: 1–4 · Reroll: R',
  'Wirklich ALLES löschen?': 'Really delete EVERYTHING?',
  'Spielstand löschen': 'Delete save data',

  // ---------- Karten ----------
  '{0} Gold': '{0} gold',
  'Alles ist ausgebaut – nimm Gold mit.': 'Everything is maxed out. Take some gold.',
  'Heiltrank': 'Healing potion',
  'Stellt {0} Leben wieder her.': 'Restores {0} health.',
  'Entwicklung mit {0}': 'Evolves with {0}',
  'NEU!': 'NEW!',
  'Stufe {0}': 'Level {0}',
  'Entwickelt {0}': 'Evolves {0}',
  ' (bereit!)': ' (ready!)',
  ' (ab Waffenstufe 8)': ' (at weapon level 8)',
  'Stufe {0}!': 'Level {0}!',
  'Welche NEUE Option verbannen?': 'Which NEW option should be banished?',
  'Wähle eine Verbesserung': 'Choose an upgrade',
  'Neu würfeln, Überspringen und Verbannen gibt es in der Schmiede.': 'Reroll, Skip and Banish can be bought in the Forge.',

  // ---------- Truhe ----------
  'ENTWICKLUNG!': 'EVOLUTION!',
  'Truhe!': 'Chest!',
  '+{0} Gold': '+{0} gold',
  'Weiter': 'Continue',

  // ---------- Pause ----------
  'Pause': 'Paused',
  'Waffen': 'Weapons',
  'Passive': 'Passives',
  'ENTWICKELT': 'EVOLVED',
  'Stufe {0}/{1}': 'Level {0}/{1}',
  'Entwicklung: Stufe 8 + {0}{1}, dann Truhe': 'Evolution: level 8 + {0}{1}, then a chest',
  'Noch keine': 'None yet',
  'Leben': 'Health',
  'Schaden': 'Damage',
  'Fläche': 'Area',
  'Abklingzeit': 'Cooldown',
  'Geschosse': 'Projectiles',
  'Lauftempo': 'Move speed',
  'Krit': 'Crit',
  'Wirklich aufgeben?': 'Really give up?',
  'Aufgeben': 'Give up',

  // ---------- Sieg & Ende ----------
  'Die Nacht ist besiegt!': 'The Night is defeated!',
  'Du hast 15 Minuten überlebt. Die Belohnung ist dir sicher.<br>Wie lange hältst du noch durch? Im Endlosmodus wird es immer härter – Gold gibt es weiter.': 'You survived 15 minutes and your reward is safe.<br>How much longer can you last? Endless mode keeps getting harder, and you keep earning gold.',
  'Belohnung einsammeln': 'Collect reward',
  'Endlos weiter': 'Keep going (endless)',
  'Sieg!': 'Victory!',
  'Gefallen': 'Defeated',
  'Neue Bestzeit!': 'New best time!',
  'Zeit': 'Time',
  'Stufe': 'Level',
  'Besiegt': 'Kills',
  'Bosse': 'Bosses',
  'Gesammelt': 'Collected',
  'Zeitbonus': 'Time bonus',
  'Bossbonus': 'Boss bonus',
  'Startgeschenk': 'Starter gift',
  '(inkl. Nachtstufe ×{0})': '(incl. night level ×{0})',
  'Neue Erfolge': 'New achievements',
  'Freigeschaltet: {0}': 'Unlocked: {0}',
  'Du kannst dir {0} in der Schmiede leisten!': 'You can afford {0} in the Forge!',
  'Noch {0} Gold bis {1} ({2})': '{0} more gold for {1} ({2})',
  'Nächstes Ziel: {0}': 'Next goal: {0}',
  'Menü': 'Menu',
  'Nochmal!': 'Play again!',

  // ---------- Im Spiel ----------
  'Ein Elitegegner taucht auf – er trägt eine Truhe!': 'An elite enemy appears. It carries a chest!',
  '{0} erscheint!': '{0} appears!',
  '{0} besiegt!': '{0} defeated!',
  'Wiedergeboren!': 'Revived!',
  'Gedrückt halten und ziehen zum Laufen': 'Hold and drag to move',
  'WASD / Pfeiltasten zum Laufen': 'WASD / arrow keys to move',
  'Sammle die blauen Edelsteine!': 'Collect the blue gems!',
  'Schleimkönig': 'Slime King',
  'Knochenfürst': 'Bone Lord',
  'Blutgraf': 'Blood Count',
  'Steinkoloss': 'Stone Colossus',
  'Die Nacht': 'The Night',
  'Fledermausschwarm!': 'Bat swarm!',
  'Umzingelt!': 'Surrounded!',
  'Geisterzug!': 'Ghost parade!',
  'Irrlichter!': 'Will-o\'-wisps!',
  'Die Oger kommen!': 'The ogres are coming!',
  'Die Nacht erwacht …': 'The Night awakens…',
  'Spielwelt': 'Game world',

  // ---------- Waffen ----------
  'Magiegeschoss': 'Magic Bolt', 'Schießt auf den nächsten Gegner.': 'Shoots at the nearest enemy.',
  'Arkansturm': 'Arcane Storm', 'Dauerfeuer, das mehr Gegner durchdringt.': 'Constant fire that pierces more enemies.',
  'Klinge': 'Blade', 'Schlägt nach dem nächsten Gegner.': 'Slashes at the nearest enemy.',
  'Blutklinge': 'Blood Blade', 'Riesige Schläge, jeder Treffer heilt.': 'Huge slashes, every hit heals you.',
  'Schutzkugeln': 'Guardian Orbs', 'Kugeln kreisen um dich.': 'Orbs circle around you.',
  'Sternenkranz': 'Star Halo', 'Die Kugeln verschwinden nie mehr.': 'The orbs never disappear.',
  'Glutaura': 'Ember Aura', 'Verbrennt alles in deiner Nähe.': 'Burns everything near you.',
  'Lebensquell': 'Wellspring', 'Größer, verlangsamt Gegner und heilt dich.': 'Bigger, slows enemies and heals you.',
  'Blitz': 'Lightning', 'Trifft zufällige Gegner in der Nähe.': 'Strikes random enemies nearby.',
  'Donnerkeil': 'Thunderbolt', 'Blitze springen auf weitere Gegner über.': 'Bolts chain to more enemies.',
  'Sichel': 'Sickle', 'Fliegt hinaus und kehrt zurück.': 'Flies out and comes back.',
  'Sturmsichel': 'Storm Sickle', 'Viele riesige Sicheln fliegen weit hinaus und kehren zurück.': 'Many huge sickles fly far out and come back.',
  'Feuerflasche': 'Fire Flask', 'Hinterlässt brennende Pfützen.': 'Leaves burning puddles.',
  'Höllenfeuer': 'Hellfire', 'Riesige Feuerfelder, die lange brennen.': 'Huge fire fields that burn for a long time.',
  'Frostnova': 'Frost Nova', 'Eisring, der Gegner verlangsamt.': 'A ring of ice that slows enemies.',
  'Ewiges Eis': 'Eternal Ice', 'Friert Gegner ein, Bosse werden stark verlangsamt.': 'Freezes enemies; bosses are heavily slowed.',
  'Dolche': 'Daggers', 'Schnelle Würfe auf den nächsten Gegner.': 'Fast throws at the nearest enemy.',
  'Tausend Klingen': 'Thousand Blades', 'Ein endloser Strom von Dolchen, die oft kritisch treffen.': 'An endless stream of daggers that often crit.',
  // Stufentexte
  '+1 Geschoss': '+1 projectile',
  '−0,2 s Abklingzeit': '−0.2 s cooldown',
  '−0,25 s Abklingzeit': '−0.25 s cooldown',
  '−0,4 s Abklingzeit': '−0.4 s cooldown',
  '−0,6 s Abklingzeit': '−0.6 s cooldown',
  '+3 Schaden': '+3 damage', '+5 Schaden': '+5 damage', '+6 Schaden': '+6 damage', '+8 Schaden': '+8 damage',
  '+10 Schaden': '+10 damage', '+12 Schaden': '+12 damage', '+15 Schaden': '+15 damage',
  'Durchdringt 1 Gegner mehr': 'Pierces 1 more enemy',
  'Schlägt auch nach hinten': 'Also slashes behind you',
  '+15 % Fläche': '+15% area',
  '+20 % Fläche': '+20% area',
  '+1 Kugel': '+1 orb',
  '+30 % Drehtempo, +15 % Fläche': '+30% spin speed, +15% area',
  '+0,5 s Wirkdauer, +8 Schaden': '+0.5 s duration, +8 damage',
  '+20 % Fläche, +2 Schaden': '+20% area, +2 damage',
  '−0,1 s Abklingzeit, +1 Schaden': '−0.1 s cooldown, +1 damage',
  '+20 % Fläche, −0,1 s Abklingzeit': '+20% area, −0.1 s cooldown',
  '+20 % Fläche, +3 Schaden': '+20% area, +3 damage',
  '+1 Blitz': '+1 bolt',
  '+10 Schaden, +20 % Fläche': '+10 damage, +20% area',
  '+1 Blitz, +20 % Fläche': '+1 bolt, +20% area',
  '+1 Sichel': '+1 sickle',
  'Fliegt schneller, +6 Schaden': 'Flies faster, +6 damage',
  '+1 Sichel, −0,3 s Abklingzeit': '+1 sickle, −0.3 s cooldown',
  '+1 Flasche': '+1 flask',
  '+3 Schaden, +15 % Fläche': '+3 damage, +15% area',
  '+0,6 s Brenndauer': '+0.6 s burn time',
  '+4 Schaden, +15 % Fläche': '+4 damage, +15% area',
  '+1 Flasche, +4 Schaden': '+1 flask, +4 damage',
  '+20 % Fläche, längere Kälte': '+20% area, longer chill',
  'Zweiter Ring': 'Second ring',
  '+1 Dolch': '+1 dagger',
  '+1 Dolch, +3 Schaden': '+1 dagger, +3 damage',
  'Durchdringt mehr, +5 Schaden': 'Pierces more, +5 damage',

  // ---------- Passive ----------
  'Kraft': 'Might', '+10 % Schaden': '+10% damage',
  'Panzer': 'Plating', '+1 Rüstung (weniger Schaden)': '+1 armor (less damage taken)',
  'Herz': 'Heart', '+20 % max. Leben': '+20% max health',
  'Stiefel': 'Boots', '+10 % Lauftempo': '+10% move speed',
  'Magnet': 'Magnet', '+40 % Sammelradius': '+40% pickup radius',
  'Sanduhr': 'Hourglass', '−8 % Abklingzeit': '−8% cooldown',
  'Linse': 'Lens', '+10 % Fläche': '+10% area',
  'Spiegel': 'Mirror', '+1 Geschoss für alle Waffen': '+1 projectile for all weapons',
  'Kleeblatt': 'Clover', '+10 % Glück, +3 % Krit': '+10% luck, +3% crit',
  'Elixier': 'Elixir', '+0,25 Leben/s': '+0.25 health/s',
  'Kerze': 'Candle', '+12 % Wirkdauer': '+12% duration',
  'Flügel': 'Wings', '+12 % Geschosstempo': '+12% projectile speed',
};
