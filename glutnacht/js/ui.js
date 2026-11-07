'use strict';
// DOM-Oberfläche: Menüs, HUD, Modale. Ruft Game-Funktionen auf, zeichnet nichts ins Canvas.

const TIPS = [
  'Jede Waffe auf Stufe 8 plus ihr passiver Partner – dann entwickelt sie sich in der nächsten Truhe.',
  'Elitegegner (goldener Schein) tragen Truhen. Bosse auch.',
  'Kohlebecken auf der Karte zerschlagen: Gold, Herzen, Magnete und Bomben.',
  'Gold bleibt nach dem Tod erhalten – in der Schmiede wirst du dauerhaft stärker.',
  'Rote Flächen am Boden: Der Boss holt zum Schlag oder Sturmangriff aus. Raus da!',
  'Der Magnet zieht alle Edelsteine auf der Karte zu dir.',
  'Bei „Umzingelt!“ nicht warten – brich früh durch eine Lücke.',
  'Glück erhöht die Chance auf eine vierte Karte und auf große Truhen.',
  'Verbannen entfernt eine neue Waffe oder ein Passiv für den Rest des Laufs.',
  'Siege schalten Nachtstufen frei: härter, aber deutlich mehr Gold.',
];

// Kurzfassung der Rahmengeschichte für den Kapitel-Banner im allerersten Lauf (eine Zeile)
const PREMISE_SHORT = 'Trag die letzte Glut durch die Nacht und hol den Morgen zurück.';

const UI = {
  el: {}, cur: null, selChar: null, banMode: false, hudSig: '', lastHud: {}, optsBack: 'menu',
  prevBest: 0, confirm: null, modalReady: 0, bannerT: null, kbNav: false,

  init() {
    const $ = id => document.getElementById(id);
    this.el = {
      hud: $('hud'), xpfill: $('xpfill'), xplvl: $('xplvl'), timer: $('timer'), kills: $('kills'), gold: $('goldc'), goldrow: $('goldrow'),
      wslots: $('wslots'), pslots: $('pslots'), bossbar: $('bossbar'), bossname: $('bossname'), bossfill: $('bossfill'),
      banner: $('banner'), toasts: $('toasts'), screen: $('screen'), pausebtn: $('pausebtn'),
      surge: $('surge'), surgeicon: $('surgeicon'), surgetxt: $('surgetxt'), surgefill: $('surgefill'),
    };
    document.querySelectorAll('img[data-icon]').forEach(img => { img.src = Sprites.iconURL(img.dataset.icon, 32); });
    this.el.pausebtn.addEventListener('click', () => { this.el.pausebtn.blur(); Sfx.init(); this.pause(); });
    // Tastaturnavigation (Tab) bis zum nächsten Klick merken
    window.addEventListener('pointerdown', () => { this.kbNav = false; }, true);
    this.el.screen.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      if (performance.now() < this.modalReady && ['pick', 'reroll', 'skip', 'banmode', 'chestok', 'endless', 'finish'].includes(b.dataset.act)) return;
      Sfx.init();
      this.act(b.dataset.act, b);
    });
    this.selChar = Store.data.lastChar;
  },

  icon(id, cls, size) { return '<img class="' + (cls || 'ic') + '" src="' + Sprites.iconURL(id, size) + '" alt="">'; },

  show(name, data) {
    this.releaseBoot();
    this.cur = name;
    Render.keyArtOn = name === 'menu';
    Render.dlgSince = Render.time; // neue Karten fahren herein: Boss-Bilder erst danach vorbauen (Render.prebuildStep)
    this.el.screen.className = 'show s-' + name;
    // Sieg und Rundenende listen neue Erfolge selbst auf: Meldungen dort nicht über die Knöpfe legen
    this.el.toasts.classList.toggle('mute', name === 'victory' || name === 'over');
    this.el.screen.innerHTML = this['tpl_' + name](data);
    this.el.screen.scrollTop = 0;
    this.modalReady = performance.now() + (['levelup', 'chest', 'victory'].includes(name) ? 380 : 0);
    if (name === 'levelup' || name === 'chest' || name === 'pause') Sfx.warmBoss();
  },

  // Ladebildschirm aus index.html (steckt bis zum ersten show() in #screen) sanft ausblenden
  releaseBoot() {
    const b = this.el.screen.querySelector('.boot');
    if (!b) return;
    b.classList.add('done');
    const f = document.createElement('div');
    f.id = 'bootfade';
    f.appendChild(b);
    this.el.screen.parentNode.appendChild(f);
    setTimeout(() => f.remove(), 600);
  },

  hide() {
    this.releaseBoot();
    const f = document.getElementById('bootfade');
    if (f) f.remove();
    this.cur = null;
    Render.keyArtOn = false;
    this.el.screen.className = '';
    this.el.toasts.classList.remove('mute');
    this.el.screen.innerHTML = '';
  },

  goldBox() {
    return '<div class="goldbox">' + this.icon('coin') + '<span>' + fmtNum(Store.data.gold) + '</span></div>';
  },

  // ---------- Bildschirme ----------
  // Titelbildschirm. Beim ersten Besuch nur Logo, Leitspruch und SPIELEN (plus Schmiede/Erfolge/Einstellungen):
  // kein Gold, kein Zähler, kein Tipp. Die Sprache steht in den Einstellungen. Das Bild dahinter malt Render.drawKeyArt.
  tpl_menu() {
    const s = Store.data, st = s.stats, first = !st.runs;
    const achN = Object.keys(s.achievements).length;
    return '<div class="menu' + (first ? ' first' : '') + '">' +
      '<div class="logo"><span>Ember</span><span>Night</span></div>' + // Name in allen Sprachen gleich (wie im Portal)
      '<div class="tag">' + tr('Fünf Länder. Eine Glut. Tausende Monster.') + '</div>' +
      '<button class="btn big primary pulse" data-act="play">' + tr('SPIELEN') + '</button>' +
      '<div class="row">' +
      '<button class="btn" data-act="shop">' + this.icon('armor') + tr('Schmiede') + '</button>' +
      '<button class="btn" data-act="ach">' + this.icon('trophy') + tr('Erfolge') + (first ? '' : ' <span class="pill">' + achN + '/' + ACHIEVEMENTS.length + '</span>') + '</button>' +
      '<button class="btn" data-act="opts">' + this.icon('clock') + tr('Einstellungen') + '</button>' +
      '</div>' +
      (first ? '' : this.goldBox() +
        '<div class="statsline">★ <b>' + totalStars(s) + '/' + STAGES.length * 3 + '</b> · ' + tr('Bestzeit {0} · Höchste Stufe {1} · Besiegt {2} · Siege {3}', '<b>' + fmtTime(st.bestTime) + '</b>', '<b>' + st.bestLevel + '</b>', '<b>' + fmtNum(st.kills) + '</b>', '<b>' + st.wins + '</b>') + '</div>' +
        '<div class="tip"><b>' + tr('Tipp:') + '</b> ' + tr(pick(TIPS)) + '</div>') +
      '</div>';
  },

  langSwitch() {
    let h = '<div class="langsw" role="group" aria-label="' + tr('Sprache') + '">';
    for (const l in LANGS) h += '<button class="chip' + (l === LANG ? ' sel' : '') + '" data-act="lang" data-l="' + l + '" lang="' + l + '">' + LANGS[l] + '</button>';
    return h + '</div>';
  },

  tpl_chars() {
    const s = Store.data;
    if (s.chars.indexOf(this.selChar) < 0) this.selChar = 'aron';
    let h = '<div class="panel wide"><div class="phead"><h2>' + tr('Wähle deinen Helden') + '</h2>' + this.goldBox() + '</div><div class="chars">';
    for (const id in CHARS) {
      const c = CHARS[id], locked = s.chars.indexOf(id) < 0;
      h += '<button class="char' + (locked ? ' locked' : '') + (id === this.selChar ? ' sel' : '') + '" data-act="char" data-id="' + id + '">' +
        '<img class="portrait" src="' + Sprites.playerURL(id, 64, locked) + '" alt="">' +
        (locked ? this.icon('lock', 'lockic') : '<img class="wpn" src="' + Sprites.iconURL(c.weapon, 32) + '" alt="">') +
        (locked ? '<small class="cu">' + tr((ACHIEVEMENTS.find(x => x.id === c.unlock) || {}).text || '') + '</small>' : '<div class="cn">' + c.name + '</div>') + '</button>';
    }
    h += '</div>';
    const c = CHARS[this.selChar];
    const w = WEAPONS[c.weapon];
    h += '<div class="chardetail"><img class="bigportrait" src="' + Sprites.playerURL(this.selChar, 96) + '" alt="">' +
      '<div><div class="cdname">' + c.name + ' <span>' + tr(c.title) + '</span></div>' +
      '<div class="cdline">' + this.icon(c.weapon) + '<div><b>' + tr(w.name) + '</b><br><small>' + tr(w.desc) + '</small></div></div>' +
      '<div class="cdbonus">' + tr(c.text) + '</div></div></div>';
    const st = this.selStage(), heat = this.selHeat();
    h += '<div class="stageline">' + tr('Land {0}: {1}', STAGES.indexOf(st) + 1, '<b>' + tr(st.name) + '</b>') +
      (heat ? ' · ' + tr('Nachtstufe') + ' ' + heat : '') + '</div>';
    h += '<div class="actions"><button class="btn" data-act="map">' + tr('Zurück') + '</button><button class="btn big primary" data-act="start">' + tr('LOS!') + '</button></div></div>';
    return h;
  },

  // Gewähltes Gebiet (nur freigeschaltete) und Nachtstufe (nur freigeschaltete)
  selStage() {
    const s = Store.data, i = STAGES.findIndex(x => x.id === s.stageSel);
    return i >= 0 && stageUnlocked(s, i) ? STAGES[i] : STAGES[0];
  },

  selHeat() {
    const s = Store.data, st = this.selStage();
    return Math.max(0, Math.min(s.stageHeat[st.id] || 0, stageMaxHeat(s, st.id)));
  },

  stars(n, cls) {
    let h = '<span class="stars' + (cls ? ' ' + cls : '') + '">';
    for (let i = 0; i < 3; i++) h += '<i class="' + (i < n ? 'on' : '') + '">★</i>';
    return h + '</span>';
  },

  tpl_map() {
    const s = Store.data, sel = this.selStage();
    let h = '<div class="panel wide"><div class="phead"><h2>' + tr('Weltkarte') + '</h2><div class="pill big">★ ' + totalStars(s) + ' / ' + STAGES.length * 3 + '</div></div>' +
      // Rahmengeschichte (kein Dialog mehr vor dem ersten Lauf): hier, bis das erste Land befreit ist
      (totalStars(s) ? '' : '<p class="mappremise">' + tr(STORY.premise) + '</p>') + '<div class="stages">';
    STAGES.forEach((st, i) => {
      const open = stageUnlocked(s, i);
      const bg = (st.ground && st.ground.base) || '#1d2a2b';
      h += '<button class="stage' + (open ? '' : ' locked') + (st === sel ? ' sel' : '') + '" data-act="stage" data-id="' + st.id + '" style="--g:' + bg + '">' +
        '<span class="snum">' + (i + 1) + '</span><span class="sname">' + (open ? tr(st.name) : '???') + '</span>' +
        (open ? this.stars(stageStars(s, st.id)) : this.icon('lock', 'tiny')) + '</button>';
    });
    h += '</div><div class="stagedetail"><div class="sdhead"><b>' + tr(sel.name) + '</b><span>' + tr('{0} Minuten', sel.minutes) + '</span>' + this.stars(stageStars(s, sel.id)) + '</div>' +
      '<p>' + tr(sel.intro) + '</p>';
    const maxH = stageMaxHeat(s, sel.id), heat = this.selHeat();
    h += '<div class="heat"><div class="hl">' + tr('Nachtstufe') + '</div>';
    for (let i = 0; i <= maxH; i++) {
      h += '<button class="chip' + (i === heat ? ' sel' : '') + '" data-act="heat" data-i="' + i + '">' + (i ? i : tr('Normal')) + '<small>' + tr('Gold ×{0}', fmtDec(HEAT[i].gold)) + '</small></button>';
    }
    if (maxH < HEAT.length - 1) h += '<span class="heatnote">' + (maxH ? tr('Schaffe Nachtstufe {0}, um Nachtstufe {1} freizuschalten.', maxH, maxH + 1) : tr('Befreie das Land, um Nachtstufe 1 freizuschalten.')) + '</span>';
    h += '</div></div>';
    // Gesperrtes nächstes Gebiet: sagen, was zu tun ist
    const ni = STAGES.findIndex((st, i) => !stageUnlocked(s, i));
    if (ni > 0) h += '<div class="heatnote">' + this.icon('lock', 'tiny') + tr('Befreie „{0}“, um „{1}“ freizuschalten.', tr(STAGES[ni - 1].name), '???') + '</div>';
    h += '<div class="actions"><button class="btn" data-act="menu">' + tr('Zurück') + '</button><button class="btn big primary" data-act="chars">' + tr('Weiter') + '</button></div></div>';
    return h;
  },

  tpl_story(data) {
    const st = data.stage, i = STAGES.indexOf(st);
    return '<div class="modal story"><div class="schap">' + tr('Land {0}', i + 1) + '</div><div class="vtitle">' + tr(st.name) + '</div>' +
      (data.premise ? '<p class="premise">' + tr(STORY.premise) + '</p>' : '') +
      '<p>' + tr(st.intro) + '</p>' +
      '<div class="actions"><button class="btn big primary" data-act="storyok">' + tr('Los geht’s!') + '</button></div></div>';
  },

  tpl_shop() {
    const s = Store.data;
    let h = '<div class="panel wide"><div class="phead"><h2>' + tr('Schmiede') + '</h2>' + this.goldBox() + '</div>' +
      '<p class="sub">' + tr('Dauerhafte Verbesserungen für alle Helden. Jeder Kauf macht alle weiteren Käufe etwas teurer.') + '</p><div class="shopgrid">';
    for (const it of SHOP) {
      const lvl = s.shop[it.id] || 0, max = lvl >= it.max, price = shopPrice(it, s);
      const can = !max && s.gold >= price;
      let pips = '';
      for (let i = 0; i < it.max; i++) pips += '<i class="' + (i < lvl ? 'on' : '') + '"></i>';
      h += '<button class="shopitem' + (max ? ' maxed' : '') + (can ? ' can' : '') + '" data-act="buy" data-id="' + it.id + '">' +
        this.icon(it.icon) + '<div class="sn">' + tr(it.name) + '</div><div class="pips">' + pips + '</div>' +
        '<div class="st">' + tr(it.text) + '</div>' +
        '<div class="price">' + (max ? tr('MAX') : this.icon('coin', 'tiny') + fmtNum(price)) + '</div></button>';
    }
    h += '</div><div class="actions">' + (Object.values(s.shop).some(v => v > 0) ? '<button class="btn small ghost" data-act="refund">' + tr(this.confirm === 'refund' ? 'Wirklich alles zurückerstatten?' : 'Alles zurückerstatten') + '</button>' : '') +
      '<button class="btn primary" data-act="menu">' + tr('Zurück') + '</button></div></div>';
    return h;
  },

  tpl_ach() {
    const s = Store.data;
    let h = '<div class="panel wide"><div class="phead"><h2>' + tr('Erfolge') + '</h2><div class="pill big">' + Object.keys(s.achievements).length + ' / ' + ACHIEVEMENTS.length + '</div></div><div class="achlist">';
    for (const a of ACHIEVEMENTS) {
      const done = !!s.achievements[a.id];
      h += '<div class="ach' + (done ? ' done' : '') + '">' + this.icon('trophy') +
        '<div class="an"><b>' + tr(a.name) + '</b><small>' + tr(a.text) + '</small></div>' +
        '<div class="ar">' + this.icon('coin', 'tiny') + a.gold + (a.unlock ? '<small>+ ' + tr(a.unlock) + '</small>' : '') + '</div></div>';
    }
    h += '</div><div class="evos"><h3>' + tr('Entdeckte Entwicklungen') + '</h3><div class="evogrid">';
    for (const id in WEAPONS) {
      const w = WEAPONS[id], known = s.evolved[id];
      h += '<div class="evo' + (known ? ' known' : '') + '">' + this.icon(id, 'tiny') + '+' + this.icon(w.evo.with, 'tiny') + '<span>' + (known ? tr(w.evo.name) : '???') + '</span></div>';
    }
    h += '</div></div><div class="actions"><button class="btn primary" data-act="menu">' + tr('Zurück') + '</button></div></div>';
    return h;
  },

  tpl_opts() {
    const st = Store.data.settings;
    const tg = (k, label) => '<button class="toggle' + (st[k] ? ' on' : '') + '" data-act="toggle" data-k="' + k + '"><span>' + tr(label) + '</span><i></i></button>';
    return '<div class="panel"><h2>' + tr('Einstellungen') + '</h2>' +
      '<div class="langrow"><span>' + tr('Sprache') + '</span>' + this.langSwitch() + '</div>' +
      tg('mute', 'Alles stumm (Taste M)') + tg('sfx', 'Klangeffekte') + tg('music', 'Musik') + tg('dmgNums', 'Schadenszahlen') + tg('shake', 'Bildschirmwackeln') +
      '<div class="controls"><b>' + tr('Steuerung') + '</b><br>' + tr('Laufen: WASD / Pfeiltasten oder irgendwo auf den Bildschirm tippen oder klicken und ziehen.') + '<br>' +
      tr('Angreifen passiert automatisch.') + '<br>' + tr('Pause: Esc / P · Karten wählen: 1–4 · Neu würfeln: R') + '<br>' + tr('Ton an/aus: M') + '</div>' +
      '<div class="actions"><button class="btn small danger" data-act="reset">' + tr(this.confirm === 'reset' ? 'Wirklich ALLES löschen?' : 'Spielstand löschen') + '</button>' +
      '<button class="btn primary" data-act="optsback">' + tr('Zurück') + '</button></div></div>';
  },

  optionText(o) {
    if (o.kind === 'gold') return { icon: 'coin', name: tr('{0} Gold', o.amount), desc: tr('Alles ist ausgebaut – nimm Gold mit.'), tag: '' };
    if (o.kind === 'heal') return { icon: 'heart', name: tr('Heiltrank'), desc: tr('Stellt {0} Leben wieder her.', o.amount), tag: '' };
    const r = Game.run;
    if (o.kind === 'weapon') {
      const d = WEAPONS[o.id];
      let hint = '';
      const has = Game.hasPassive(d.evo.with);
      hint = (has ? '✓ ' : '') + tr('Entwicklung mit {0}', tr(PASSIVES[d.evo.with].name));
      return { icon: o.id, name: tr(d.name), desc: tr(o.isNew ? d.desc : d.levels[o.level - 2].t), tag: o.isNew ? tr('NEU!') : tr('Stufe {0}', o.level), hint, ready: has && o.level === WEAPON_MAX };
    }
    const d = PASSIVES[o.id];
    let hint = '', ready = false;
    for (const w of r.weapons) {
      if (WEAPONS[w.id].evo.with === o.id && !w.evo) {
        ready = w.level >= WEAPON_MAX;
        hint = tr('Entwickelt {0}', tr(WEAPONS[w.id].name)) + tr(ready ? ' (bereit!)' : ' (ab Waffenstufe 8)');
      }
    }
    return { icon: o.id, name: tr(d.name), desc: tr(d.desc), tag: o.isNew ? tr('NEU!') : tr('Stufe {0}', o.level), hint, ready };
  },

  tpl_levelup(opts) {
    const r = Game.run;
    let h = '<div class="modal levelup' + (this.banMode ? ' banning' : '') + '"><div class="lvtitle">' + tr('Stufe {0}!', '<b>' + (r.level - r.pendingLevels + 1) + '</b>') + '</div>' +
      '<div class="lvsub">' + tr(this.banMode ? 'Welche NEUE Option verbannen?' : 'Wähle eine Verbesserung') + '</div><div class="cards">';
    opts.forEach((o, i) => {
      const t = this.optionText(o);
      h += '<button class="card' + (o.isNew ? ' new' : '') + (t.ready ? ' ready' : '') + (this.banMode && !o.isNew ? ' noban' : '') + '" data-act="pick" data-i="' + i + '" style="--d:' + (i * 70) + 'ms">' +
        '<div class="ctag">' + t.tag + '</div>' + this.icon(t.icon, 'cicon', 96) +
        '<div class="cname">' + t.name + '</div><div class="cdesc">' + t.desc + '</div>' +
        (t.hint ? '<div class="chint">' + t.hint + '</div>' : '') + '<kbd>' + (i + 1) + '</kbd></button>';
    });
    // Nur Knöpfe zeigen, die man auch benutzen kann
    const mb = (act, ic, label, n, cls) => n > 0 ? '<button class="btn small' + (cls || '') + '" data-act="' + act + '">' + this.icon(ic, 'tiny') + tr(label) + ' (' + n + ')</button>' : '';
    h += '</div><div class="lvactions">' + mb('reroll', 'dice', 'Neu würfeln', r.rerolls) + mb('skip', 'skip', 'Überspringen', r.skips) +
      mb('banmode', 'banish', 'Verbannen', r.banishes, this.banMode ? ' active' : '') +
      '</div>' + (r.rerolls + r.skips + r.banishes === 0 && Store.data.stats.runs <= 3 ? '<div class="lvnote">' + tr('Neu würfeln, Überspringen und Verbannen gibt es in der Schmiede.') + '</div>' : '') + '</div>';
    return h;
  },

  tpl_chest(res) {
    let h = '<div class="modal chestm' + (res.evolved ? ' evolved' : '') + '"><div class="chestimg">' + this.icon('chest', 'chestic') + '</div>';
    if (res.evolved) {
      const w = WEAPONS[res.evolved];
      h += '<div class="evotitle">' + tr('ENTWICKLUNG!') + '</div><div class="evocard">' + this.icon(res.evolved, 'cicon') +
        '<div><div class="cname">' + tr(w.name) + ' → <b>' + tr(w.evo.name) + '</b></div><div class="cdesc">' + tr(w.evo.desc) + '</div></div></div>';
    } else {
      h += '<div class="evotitle">' + tr('Truhe!') + '</div>';
    }
    h += '<div class="loot">';
    res.items.forEach((o, i) => {
      const t = this.optionText(o);
      h += '<div class="lootitem" style="--d:' + (500 + i * 220) + 'ms">' + this.icon(t.icon) + '<b>' + t.name + '</b><span>' + t.tag + '</span></div>';
    });
    h += '</div><div class="lootgold" style="--d:' + (600 + res.items.length * 220) + 'ms">' + this.icon('coin', 'tiny') + tr('+{0} Gold', res.gold) + '</div>' +
      '<button class="btn primary" data-act="chestok">' + tr('Weiter') + '</button></div>';
    return h;
  },

  tpl_pause() {
    const r = Game.run, s = r.stats;
    let h = '<div class="modal pause"><h2>' + tr('Pause') + '</h2><div class="build"><div class="bcol"><h3>' + tr('Waffen') + '</h3>';
    for (const w of r.weapons) {
      const d = WEAPONS[w.id];
      h += '<div class="brow">' + this.icon(w.id) + '<div><b>' + tr(w.evo ? d.evo.name : d.name) + '</b> <span class="lv' + (w.evo ? ' evo' : '') + '">' + (w.evo ? tr('ENTWICKELT') : tr('Stufe {0}/{1}', w.level, WEAPON_MAX)) + '</span>' +
        (w.evo ? '' : '<small>' + tr('Entwicklung: Stufe 8 + {0}{1}, dann Truhe', tr(PASSIVES[d.evo.with].name), Game.hasPassive(d.evo.with) ? ' ✓' : '') + '</small>') + '</div></div>';
    }
    h += '</div><div class="bcol"><h3>' + tr('Passive') + '</h3>';
    for (const p of r.passives) {
      const d = PASSIVES[p.id];
      h += '<div class="brow">' + this.icon(p.id) + '<div><b>' + tr(d.name) + '</b> <span class="lv">' + tr('Stufe {0}/{1}', p.level, d.max) + '</span><small>' + tr(d.desc) + '</small></div></div>';
    }
    if (!r.passives.length) h += '<div class="empty">' + tr('Noch keine') + '</div>';
    const ps = LANG === 'de' ? ' %' : '%';
    const pct = v => (v >= 0 ? '+' : '') + Math.round(v * 100) + ps;
    const row = (label, val) => '<div>' + tr(label) + '<b>' + val + '</b></div>';
    h += '</div></div><div class="statgrid">' +
      row('Leben', Math.ceil(r.p.hp) + '/' + s.maxHp) + row('Rüstung', s.armor) + row('Erholung', fmtDec(s.regen.toFixed(1)) + '/s') +
      row('Schaden', pct(s.might - 1)) + row('Fläche', pct(s.area - 1)) + row('Abklingzeit', pct(s.cooldown - 1)) +
      row('Geschosse', '+' + s.amount) + row('Lauftempo', pct(s.speedMul - 1)) + row('Glück', pct(s.luck - 1)) +
      row('Krit', Math.round(s.crit * 100) + ps) + row('Wachstum', pct(s.growth - 1)) + row('Gier', pct(s.greed - 1)) +
      '</div><div class="actions"><button class="btn danger small" data-act="quit">' + tr(this.confirm === 'quit' ? 'Wirklich aufgeben?' : 'Aufgeben') + '</button>' +
      '<button class="btn small" data-act="opts">' + tr('Einstellungen') + '</button><button class="btn primary" data-act="resume">' + tr('Weiter') + '</button></div></div>';
    return h;
  },

  tpl_victory() {
    const r = Game.run, c = r.clear || {};
    let h = '<div class="modal victory"><div class="vtitle">' + tr(c.last ? 'Die Nacht ist besiegt!' : 'Land befreit!') + '</div>' +
      '<p class="outro">' + tr(r.stage.outro) + '</p>' + this.stars(c.stars || 0, 'big') +
      (c.stars > c.starsBefore ? '<div class="unl">' + tr('Neuer Stern!') + '</div>' : '') +
      (c.newStage ? '<div class="unl">' + tr('Neues Land freigeschaltet: {0}', '<b>' + tr(c.newStage.name) + '</b>') + '</div>' : '') +
      (c.newHeat ? '<div class="unl">' + tr('Nachtstufe {0} freigeschaltet', c.newHeat) + '</div>' : '') +
      (c.last ? '<p>' + tr(STORY.ending) + '</p>' : '');
    return h + '<p class="small">' + tr('Im Endlosmodus wird es immer härter – Gold gibt es weiter.') + '</p>' +
      '<div class="actions"><button class="btn" data-act="finish">' + tr('Belohnung einsammeln') + '</button><button class="btn primary" data-act="endless">' + tr('Endlos weiter') + '</button></div></div>';
  },

  tpl_over(sum) {
    const r = Game.run, save = Store.data;
    const won = sum.won;
    const record = r.t > this.prevBest && this.prevBest > 0;
    let h = '<div class="panel wide over' + (won ? ' won' : '') + '"><div class="otitle">' + tr(won ? 'Sieg!' : 'Gefallen') + '</div>' +
      '<div class="stageline">' + tr('Land {0}: {1}', STAGES.indexOf(r.stage) + 1, '<b>' + tr(r.stage.name) + '</b>') +
      (r.heat ? ' · ' + tr('Nachtstufe') + ' ' + r.heat : '') + ' ' + this.stars(stageStars(save, r.stage.id)) + '</div>' +
      (record ? '<div class="record">' + tr('Neue Bestzeit!') + '</div>' : '') +
      '<div class="ostats"><div>' + this.icon('clock', 'tiny') + '<b>' + fmtTime(r.t) + '</b><small>' + tr('Zeit') + '</small></div>' +
      '<div><b>' + r.level + '</b><small>' + tr('Stufe') + '</small></div>' +
      '<div>' + this.icon('skull', 'tiny') + '<b>' + fmtNum(r.kills) + '</b><small>' + tr('Besiegt') + '</small></div>' +
      '<div><b>' + r.bossKills + '</b><small>' + tr('Bosse') + '</small></div></div>' +
      '<div class="goldcalc"><span>' + tr('Gesammelt') + ' <b>' + sum.collected + '</b></span><span>' + tr('Zeitbonus') + ' <b>' + sum.timeBonus + '</b></span><span>' + tr('Bossbonus') + ' <b>' + sum.bossBonus + '</b></span>' +
      (sum.gift ? '<span>' + tr('Startgeschenk') + ' <b>' + sum.gift + '</b></span>' : '') +
      (sum.heatMul > 1 ? '<span>' + tr('(inkl. Nachtstufe ×{0})', fmtDec(sum.heatMul)) + '</span>' : '') +
      '<span class="gtotal">' + this.icon('coin', 'tiny') + '+' + fmtNum(sum.total) + '</span></div>';
    const dmg = Object.entries(r.dmgBy).filter(([k]) => WEAPONS[k]).sort((a, b) => b[1] - a[1]);
    if (dmg.length) {
      const max = dmg[0][1];
      h += '<div class="dmgtable">';
      for (const [k, v] of dmg) {
        const w = r.weapons.find(x => x.id === k);
        h += '<div class="drow">' + this.icon(k, 'tiny') + '<span class="dn">' + tr(w && w.evo ? WEAPONS[k].evo.name : WEAPONS[k].name) + '</span>' +
          '<div class="dbar"><i style="width:' + (v / max * 100).toFixed(1) + '%"></i></div><span class="dv">' + fmtNum(v) + '</span></div>';
      }
      h += '</div>';
    }
    if (r.newAch.length) {
      h += '<div class="newach"><h3>' + tr('Neue Erfolge') + '</h3>' + r.newAch.map(a => '<div>' + this.icon('trophy', 'tiny') + '<b>' + tr(a.name) + '</b> ' + tr('+{0} Gold', a.gold) + (a.unlock ? ' · <em>' + tr('Freigeschaltet: {0}', tr(a.unlock)) + '</em>' : '') + '</div>').join('') + '</div>';
    }
    // Nächstes Ziel als Anreiz
    const next = ACHIEVEMENTS.find(a => !save.achievements[a.id]);
    const cheap = SHOP.filter(it => (save.shop[it.id] || 0) < it.max).map(it => ({ it, p: shopPrice(it, save) })).sort((a, b) => a.p - b.p)[0];
    h += '<div class="nextgoal">';
    const canBuy = cheap && save.gold >= cheap.p;
    if (canBuy) h += '<div>' + this.icon(cheap.it.icon, 'tiny') + tr('Du kannst dir {0} in der Schmiede leisten!', '<b>' + tr(cheap.it.name) + '</b>') + '</div>';
    else if (cheap) h += '<div>' + this.icon(cheap.it.icon, 'tiny') + tr('Noch {0} Gold bis {1} ({2})', '<b>' + fmtNum(cheap.p - save.gold) + '</b>', '<b>' + tr(cheap.it.name) + '</b>', tr(cheap.it.text)) + '</div>';
    if (next) h += '<div>' + this.icon('trophy', 'tiny') + tr('Nächstes Ziel: {0}', '<b>' + tr(next.text) + '</b>' + (next.unlock ? ' → ' + tr(next.unlock) : '')) + '</div>';
    h += '</div><div class="actions"><button class="btn" data-act="menu">' + tr('Menü') + '</button><button class="btn' + (canBuy ? ' pulse' : '') + '" data-act="shop">' + this.icon('armor', 'tiny') + tr('Schmiede') + '</button>' + (this.nextStage() ? '<button class="btn" data-act="again">' + tr('Nochmal!') + '</button><button class="btn big primary" data-act="next">' + tr('Nächstes Land') + '</button>' : '<button class="btn big primary" data-act="again">' + tr('Nochmal!') + '</button>') + '</div></div>';
    return h;
  },

  // Nach einem Sieg: das nächste Gebiet, falls es freigeschaltet ist und noch nicht geschafft wurde
  nextStage() {
    const r = Game.run, s = Store.data;
    if (!r || !r.won) return null;
    const i = STAGES.indexOf(r.stage) + 1;
    return i < STAGES.length && stageUnlocked(s, i) && stageBest(s, STAGES[i].id) < 0 ? STAGES[i] : null;
  },

  // ---------- Aktionen ----------
  act(a, b) {
    const s = Store.data;
    if (a !== 'refund' && a !== 'reset' && a !== 'quit') this.confirm = null;
    switch (a) {
      case 'play': Sfx.play('click'); if (!s.stats.runs) this.startRun(this.selChar || 'aron'); else { this.show('map'); Render.setStage(this.selStage()); } break;
      case 'map': Sfx.play('click'); this.show('map'); break;
      case 'chars': Sfx.play('click'); this.show('chars'); break;
      case 'stage': {
        const i = STAGES.findIndex(x => x.id === b.dataset.id);
        if (!stageUnlocked(s, i)) { Sfx.play('deny'); b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 400); return; }
        s.stageSel = b.dataset.id; Store.save(); Sfx.play('click'); Render.setStage(STAGES[i]); this.show('map'); break;
      }
      case 'storyok':
        s.storySeen[Game.run.stage.id] = true; s.storySeen.premise = true; Store.save();
        this.hide(); Game.state = 'play'; this.chapterBanner(); break;
      case 'next': { const n = this.nextStage(); if (n) { s.stageSel = n.id; s.stageHeat[n.id] = 0; this.startRun(Game.run.char); } break; }
      case 'menu': Sfx.play('click'); this.toMenu(); break;
      case 'shop': Sfx.play('click'); if (Game.state === 'over') this.toMenu(); this.show('shop'); break;
      case 'ach': Sfx.play('click'); this.show('ach'); break;
      case 'opts': Sfx.play('click'); this.optsBack = this.cur === 'pause' ? 'pause' : 'menu'; this.show('opts'); break;
      case 'optsback': Sfx.play('click'); this.show(this.optsBack); break;
      case 'char': {
        const id = b.dataset.id;
        if (s.chars.indexOf(id) < 0) { Sfx.play('deny'); b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 400); return; }
        this.selChar = id; Sfx.play('click'); this.show('chars'); break;
      }
      case 'lang':
        s.settings.lang = b.dataset.l; setLang(s.settings.lang); Store.save(); Sfx.play('click');
        this.hudSig = ''; this.lastHud = {};
        this.show(this.cur); break;
      case 'heat': s.stageHeat[this.selStage().id] = +b.dataset.i; Store.save(); Sfx.play('click'); this.show('map'); break;
      case 'start': this.startRun(this.selChar); break;
      case 'again': this.startRun(Game.run ? Game.run.char : this.selChar); break;
      case 'buy': {
        const it = SHOP.find(x => x.id === b.dataset.id);
        const lvl = s.shop[it.id] || 0, price = shopPrice(it, s);
        if (lvl >= it.max || s.gold < price) { Sfx.play('deny'); b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 400); return; }
        s.gold -= price; s.shop[it.id] = lvl + 1;
        s.shopSpent = (s.shopSpent || 0) + price;
        Store.save();
        Sfx.play('buy'); this.show('shop'); break;
      }
      case 'refund': {
        if (this.confirm !== 'refund') { this.confirm = 'refund'; this.show('shop'); return; }
        this.confirm = null;
        // Erstattet wird genau, was bezahlt wurde (Preise hängen von der Kaufreihenfolge ab).
        const back = typeof s.shopSpent === 'number' ? s.shopSpent : shopRefundValue(s.shop);
        s.gold += back; s.shop = {}; s.shopSpent = 0; Store.save(); Sfx.play('coin'); this.show('shop'); break;
      }
      case 'toggle': {
        const k = b.dataset.k;
        s.settings[k] = !s.settings[k]; Store.save(); Sfx.applySettings();
        if (k === 'music') { if (s.settings.music) Sfx.startMusic(); else Sfx.stopMusic(); }
        Sfx.play('click'); this.show('opts'); break;
      }
      case 'reset':
        if (this.confirm !== 'reset') { this.confirm = 'reset'; this.show('opts'); return; }
        this.confirm = null; Game.run = null; Game.state = 'menu'; Platform.attachPending(); Store.reset(); this.selChar = 'aron'; Sfx.applySettings(); this.toMenu(); break;
      case 'pick': {
        const o = Game.lastLevelOptions[+b.dataset.i];
        if (!o) return;
        if (this.banMode) {
          if (!o.isNew) { Sfx.play('deny'); return; }
          this.banMode = false;
          const opts = Game.banish(o);
          Sfx.play('click');
          if (opts) this.show('levelup', opts);
          return;
        }
        Sfx.play('item');
        this.hide();
        Game.chooseLevel(o);
        if (Game.state === 'play') this.resumeHud();
        break;
      }
      case 'reroll': { const o = Game.reroll(); if (o) { this.banMode = false; Sfx.play('click'); this.show('levelup', o); } break; }
      case 'skip': if (Game.skipLevel()) { this.banMode = false; this.hide(); if (Game.state === 'play') this.resumeHud(); } break;
      case 'banmode': this.banMode = !this.banMode; this.show('levelup', Game.lastLevelOptions); break;
      case 'chestok': this.hide(); Game.closeChest(); if (Game.state === 'play') this.resumeHud(); break;
      case 'resume': this.resume(); break;
      case 'quit':
        if (this.confirm !== 'quit') { this.confirm = 'quit'; this.show('pause'); return; }
        this.confirm = null; this.hide(); Game.endRun(false); break;
      case 'endless': this.hide(); Game.continueEndless(); this.resumeHud(); break;
      case 'finish': this.hide(); Game.endRun(true); break;
    }
  },

  startRun(charId) {
    const s = Store.data;
    s.lastChar = charId; this.selChar = charId;
    const stage = this.selStage(), heat = this.selHeat();
    s.stageSel = stage.id;
    this.prevBest = s.stats.bestTime;
    Store.save();
    Sfx.init();
    Sfx.play('levelup');
    this.hide();
    this.banMode = false;
    this.hudSig = ''; this.lastHud = {};
    Game.newRun(charId, heat, stage.id);
    Render.setStage(stage);
    Render.flushPrebuild(charId); // alle Gegner-Bilder des Landes jetzt, nicht beim ersten Erscheinen im Spiel
    this.el.hud.hidden = false;
    this.el.toasts.innerHTML = '';
    clearTimeout(this.bannerT);
    this.el.banner.className = '';
    if (s.settings.music) Sfx.startMusic();
    // Allererster Lauf: kein Dialog, sofort spielen – die Rahmengeschichte steht als eine Zeile im Kapitel-Banner
    // (ganz auf der Weltkarte). Neue Länder danach: erst die Geschichte des Landes.
    if (!s.storySeen.premise) {
      s.storySeen.premise = true; s.storySeen[stage.id] = true; Store.save();
      this.chapterBanner(true);
    } else if (!s.storySeen[stage.id]) {
      Game.state = 'story';
      this.show('story', { stage, premise: false });
    } else this.chapterBanner();
  },

  chapterBanner(premise) {
    const r = Game.run;
    if (r) this.banner(tr('Land {0}: {1}', STAGES.indexOf(r.stage) + 1, tr(r.stage.name)), 'event chapter', premise ? tr(PREMISE_SHORT) : '', premise ? 3.2 : 2.2);
  },

  toMenu() {
    if (Game.run && !Game.run.over && Game.state !== 'menu') Game.endRun(false);
    Game.state = 'menu';
    Game.run = null;
    this.el.hud.hidden = true;
    this.el.bossbar.hidden = true;
    this.el.surge.hidden = true;
    Platform.attachPending(); // SDK kam während des Laufs: Speicherort jetzt umstellen
    this.show('menu');
    if (Store.data.settings.music) Sfx.startMusic();
  },

  pause() {
    if (Game.state !== 'play') return;
    Game.state = 'paused';
    this.confirm = null;
    this.show('pause');
  },

  resume() {
    if (Game.state !== 'paused') return;
    this.hide();
    Game.state = 'play';
    this.resumeHud();
  },

  resumeHud() { Input.joy = null; },

  onKey(k, e) {
    if (e.repeat) return; // gehaltene Taste darf nicht durch mehrere Level-ups klicken
    if (k === 'm') { this.toggleSound(); return; }
    if (k === 'escape' || k === 'p') {
      if (Game.state === 'play') { this.pause(); return; }
      if (Game.state === 'paused' && (this.cur === 'pause' || this.cur === 'opts')) { this.cur === 'opts' ? this.show('pause') : this.resume(); return; }
    }
    if (this.cur === 'levelup' && performance.now() >= this.modalReady) {
      const n = parseInt(k, 10);
      if (n >= 1 && n <= Game.lastLevelOptions.length) {
        const b = this.el.screen.querySelector('[data-act="pick"][data-i="' + (n - 1) + '"]');
        if (b) this.act('pick', b);
      } else if (k === 'r') {
        const b = this.el.screen.querySelector('[data-act="reroll"]');
        if (b && !b.disabled) this.act('reroll', b);
      }
    }
    // Hat ein Knopf per Tastatur den Fokus, löst Enter/Leertaste ihn selbst aus
    if (k === 'tab') this.kbNav = true;
    const ae = document.activeElement;
    if ((k === 'enter' || k === ' ') && this.kbNav && ae && ae.tagName === 'BUTTON' && this.el.screen.contains(ae)) return;
    if ((k === 'enter' || k === ' ') && performance.now() >= this.modalReady) {
      // Vorrang nach Aktion, nicht nach Reihenfolge im DOM („Nächstes Land“ vor „Nochmal!“); auf der Weltkarte: Weiter
      if (['chest', 'story', 'over', 'chars', 'map'].includes(this.cur)) {
        for (const a of ['chestok', 'storyok', 'next', 'again', 'start', 'chars']) {
          const b = this.el.screen.querySelector('[data-act="' + a + '"]');
          if (b) { e.preventDefault(); this.act(a, b); break; }
        }
      }
    }
  },

  // ---------- Hooks aus dem Spiel ----------
  levelUp(opts) {
    this.banMode = false;
    this.show('levelup', opts);
  },

  chest(res) {
    this.show('chest', res);
    if (res.evolved) setTimeout(() => Sfx.play('evolve'), 450);
    res.items.forEach((o, i) => setTimeout(() => { if (this.cur === 'chest') Sfx.play('item'); }, 500 + i * 220));
  },

  victory() {
    Sfx.play('victory');
    this.show('victory');
  },

  gameOver(sum) {
    this.el.bossbar.hidden = true;
    this.el.surge.hidden = true;
    setTimeout(() => {
      if (Game.state !== 'over') return;
      this.el.hud.hidden = true;
      this.el.toasts.innerHTML = '';
      this.show('over', sum);
      Sfx.stopMusic();
      if (!sum.won) Sfx.sting('gameover'); // Sieg: der Abschluss lief schon bei UI.victory()
    }, sum.won ? 300 : 1100);
  },

  // Kurzer Banner im oberen Fünftel (über dem Helden); sub = optionale zweite, kleinere Zeile; dur in Sekunden
  banner(text, kind, sub, dur) {
    const b = this.el.banner;
    dur = dur || 1.9;
    b.textContent = text;
    if (sub) { const sm = document.createElement('small'); sm.textContent = sub; b.appendChild(sm); }
    b.className = '';
    b.style.setProperty('--bd', dur + 's');
    void b.offsetWidth;
    b.className = 'show ' + (kind || '');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { b.className = ''; }, dur * 1000);
  },

  // Taste M: Gesamt-Stummschaltung; die Schalter für Klang und Musik bleiben, wie sie sind
  toggleSound() {
    const st = Store.data.settings;
    let msg;
    if (Sfx.platformMuted) msg = 'Ton von der Plattform stummgeschaltet';
    else {
      st.mute = !st.mute;
      Store.save();
      Sfx.applySettings();
      if (!st.mute) Sfx.play('click');
      msg = st.mute ? 'Ton aus' : !st.sfx && !st.music ? 'Ton an (Klang und Musik sind in den Einstellungen aus)' : 'Ton an';
    }
    const d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = '<div><b>' + tr(msg) + '</b></div>';
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => d.classList.add('out'), 1400);
    setTimeout(() => d.remove(), 2000);
    if (this.cur === 'opts') this.show('opts');
  },

  achievement(a) {
    Sfx.play('achievement');
    const d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = this.icon('trophy', 'tiny') + '<div><b>' + tr(a.name) + '</b><small>' + tr(a.text) + ' · ' + tr('+{0} Gold', a.gold) + (a.unlock ? ' · ' + tr('Freigeschaltet: {0}', tr(a.unlock)) : '') + '</small></div>';
    this.el.toasts.appendChild(d);
    // höchstens drei Meldungen gleichzeitig, damit das Spielfeld frei bleibt
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => d.classList.add('out'), 3800);
    setTimeout(() => d.remove(), 4400);
  },

  // ---------- HUD ----------
  // Plätze (Waffen oder Passive) abgleichen: belegte Plätze plus ein „+“ für den nächsten freien. prev merkt sich
  // je Platz Kennung, Stufe und Entwicklung; nur was sich ändert, bekommt neues HTML.
  slotHtml(it) { return '<div class="slot' + (it.evo ? ' evo' : '') + '">' + this.icon(it.id) + '<span>' + (it.evo ? '★' : it.level) + '</span></div>'; },
  syncSlots(box, prev, list, max) {
    const n = list.length;
    if (prev.length !== n || box.children.length !== n + (n < max ? 1 : 0)) {
      let h = '';
      for (const it of list) h += this.slotHtml(it);
      if (n < max) h += '<div class="slot add">+</div>';
      box.innerHTML = h;
      prev.length = 0;
      for (const it of list) prev.push({ id: it.id, level: it.level, evo: !!it.evo });
      return;
    }
    for (let i = 0; i < n; i++) {
      const it = list[i], q = prev[i];
      if (q.id === it.id && q.level === it.level && q.evo === !!it.evo) continue;
      q.id = it.id; q.level = it.level; q.evo = !!it.evo;
      box.children[i].outerHTML = this.slotHtml(it);
    }
  },

  // Symbole (data:-URL) in Leerlaufzeit vorab kodieren, zuerst die der Stufenaufstiegs-Karten (96 px) und der
  // HUD-Plätze; sonst kodiert sie erst der Dialog im Spiel (je Symbol einige ms)
  warmIcons() {
    const have = new Set(Sprites.ICON_IDS), jobs = [];
    const run = Object.keys(WEAPONS).concat(Object.keys(PASSIVES), ['coin', 'heart', 'chest', 'dice', 'skip', 'banish']);
    for (const id of run) if (have.has(id)) jobs.push([id, 96], [id, 64]);
    for (const id of Sprites.ICON_IDS) jobs.push([id, 64]);
    let i = 0;
    const ric = typeof requestIdleCallback === 'function';
    const step = dl => {
      while (i < jobs.length) {
        // mit requestIdleCallback nur bei genug Leerlauf, sonst (älteres Safari) nur außerhalb des Spiels
        if (ric ? dl.timeRemaining() < 7 : Game.state === 'play') break;
        const [id, sz] = jobs[i++];
        Sprites.iconURL(id, sz);
        if (!ric) break;
      }
      if (i < jobs.length) { if (ric) requestIdleCallback(step); else setTimeout(step, 50); }
    };
    if (ric) requestIdleCallback(step); else setTimeout(step, 50);
  },

  updateHud() {
    const r = Game.run;
    if (!r || this.el.hud.hidden) return;
    const L = this.lastHud, el = this.el;
    const xpk = Math.min(1, r.xp / r.xpNext);
    // Leisten per transform statt width: kein Layout je Bild
    // Zähler und Erfahrungsleiste höchstens alle 0,1 s bzw. 0,25 s anfassen (Edelsteinregen und Massenkills änderten
    // sie sonst in jedem Bild; jede Textänderung kostet Stil und Layout). Die Leiste gleitet per Übergang.
    const now = performance.now(), slow = now - (L.tq || 0) >= 250, xpw = Math.round(xpk * 1000);
    if (L.xp !== xpw && (now - (L.tx || 0) >= 100 || L.level !== r.level)) { el.xpfill.style.transform = 'translateX(' + (xpw / 10 - 100) + '%)'; L.xp = xpw; L.tx = now; }
    if (L.level !== r.level) {
      // Stufenaufstieg: Erfahrungsleiste leuchtet kurz auf
      if (L.level && r.level > L.level) { const x = el.xplvl.parentNode; x.classList.remove('lvlglow'); void x.offsetWidth; x.classList.add('lvlglow'); }
      el.xplvl.textContent = tr('Stufe {0}', r.level); L.level = r.level;
    }
    const tt = Math.floor(r.t);
    if (L.t !== tt) {
      el.timer.textContent = fmtTime(r.t);
      el.timer.classList.toggle('endless', r.endless);
      L.t = tt;
    }
    if (L.kills !== r.kills && slow) { el.kills.textContent = fmtNum(r.kills); L.kills = r.kills; L.tq = now; }
    if (L.gold !== r.gold && (slow || !L.gold)) {
      L.tq = now;
      el.gold.textContent = fmtNum(r.gold); L.gold = r.gold;
      el.goldrow.hidden = !(r.gold > 0); // Goldzähler erst ab der ersten Münze
    }
    // Waffen- und Passiv-Plätze: nur ein geänderter Platz wird neu gesetzt (keine Zeichenkette je Bild)
    this.syncSlots(el.wslots, L.w || (L.w = []), r.weapons, MAX_WEAPONS);
    this.syncSlots(el.pslots, L.p || (L.p = []), r.passives, MAX_PASSIVES);
    let boss = null;
    for (const b of r.bosses) if (!b.dead && (!boss || b.maxHp > boss.maxHp)) boss = b;
    if (boss) {
      if (el.bossbar.hidden) el.bossbar.hidden = false;
      if (L.bossName !== boss.boss.name) { el.bossname.textContent = tr(boss.boss.name); L.bossName = boss.boss.name; }
      const bw = Math.round(Math.max(0, boss.hp / boss.maxHp) * 1000);
      if (L.boss !== bw) { el.bossfill.style.transform = 'translateX(' + (bw / 10 - 100) + '%)'; L.boss = bw; }
    } else if (!el.bossbar.hidden) el.bossbar.hidden = true;
    this.updateCountdown(boss);
  },

  // Countdown-Leiste (M10): Text nur beim Sekundenwechsel, Füllung per transform; bei lebendem Boss nie sichtbar
  // (der Zeitplan schließt das aus, die Regel ist nur die Absicherung)
  updateCountdown(boss) {
    const el = this.el, L = this.lastHud;
    const cs = boss ? null : Game.countdownState();
    if (!cs) {
      if (!el.surge.hidden) { el.surge.hidden = true; L.cdKey = L.cdTxt = null; }
      return;
    }
    const key = cs.kind + cs.phase + cs.icon;
    if (el.surge.hidden || L.cdKey !== key) {
      const appear = el.surge.hidden;
      el.surge.hidden = false;
      el.surge.className = cs.kind === 'boss' ? 'boss' : cs.phase;
      if (appear) { void el.surge.offsetWidth; el.surge.classList.add('pop'); }
      this.drawCountdownIcon(cs);
      L.cdKey = key; L.cdTxt = null; L.cdF = -1;
    }
    const sec = Math.ceil(cs.left), intro = cs.kind === 'surge' && cs.phase === 'warn' && cs.since < 3;
    const tk = sec * 2 + (intro ? 1 : 0);
    if (L.cdTxt !== tk) {
      L.cdTxt = tk;
      const tm = fmtTime(sec);
      el.surgetxt.textContent = cs.kind === 'boss' ? tr('{0} in {1}', tr(cs.label), tm)
        : cs.phase === 'on' ? tr('Ansturm! Noch {0}', tm) : intro ? tr('Starke Gegner kommen!') : tr('Ansturm in {0}', tm);
      el.surgetxt.classList.toggle('urgent', cs.kind === 'surge' && cs.phase === 'warn' && sec <= 5);
    }
    // Füllung in 0,5-%-Schritten (je 0,1–0,15 s), dazwischen gleitet sie per Übergang (Compositor); bei neuem
    // Abschnitt (Countdown → Ansturm) springt sie ohne Übergang
    const f = Math.round(cs.frac * 200);
    if (L.cdF !== f) {
      const jump = L.cdF === -1;
      el.surgefill.classList.toggle('jump', jump);
      el.surgefill.style.transform = 'scaleX(' + f / 200 + ')'; L.cdF = f;
    }
  },
  // Symbol des kommenden Gegners bzw. Bosses – nur aus schon gebauten Bildern, sonst ausgeblendet
  drawCountdownIcon(cs) {
    const cv = this.el.surgeicon, g = cv.getContext('2d'), r = Game.run;
    let sp = null;
    if (cs.kind === 'boss') {
      const b = r && r.bossList.find(x => x.name === cs.label);
      if (b) sp = Sprites.bossPeek(b.sprite, b.r, 0, b.tint || null, Sprites.bossLevel(b));
    } else sp = Sprites.enemyPeek(cs.icon, 0, cs.tint);
    cv.hidden = !sp;
    if (!sp) return;
    g.clearRect(0, 0, cv.width, cv.height);
    // Mitte des Bildes (der Körper füllt etwa 60 %), auf die Leinwand eingepasst
    const sw = sp.width, sh = sp.height, k = 0.62, cw = sw * k, ch = sh * k;
    g.imageSmoothingEnabled = true;
    g.drawImage(sp, (sw - cw) / 2, (sh - ch) / 2 - sh * 0.03, cw, ch, 0, 0, cv.width, cv.height);
  },
};
