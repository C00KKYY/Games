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

const UI = {
  el: {}, cur: null, selChar: null, banMode: false, hudSig: '', lastHud: {}, optsBack: 'menu',
  prevBest: 0, confirm: null, modalReady: 0, bannerT: null,

  init() {
    const $ = id => document.getElementById(id);
    this.el = {
      hud: $('hud'), xpfill: $('xpfill'), xplvl: $('xplvl'), timer: $('timer'), kills: $('kills'), gold: $('goldc'),
      wslots: $('wslots'), pslots: $('pslots'), bossbar: $('bossbar'), bossname: $('bossname'), bossfill: $('bossfill'),
      banner: $('banner'), toasts: $('toasts'), screen: $('screen'), pausebtn: $('pausebtn'),
    };
    document.querySelectorAll('img[data-icon]').forEach(img => { img.src = Sprites.iconURL(img.dataset.icon, 32); });
    this.el.pausebtn.addEventListener('click', () => { this.el.pausebtn.blur(); Sfx.init(); this.pause(); });
    this.el.screen.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      if (performance.now() < this.modalReady && ['pick', 'reroll', 'skip', 'banmode', 'chestok', 'endless', 'finish'].includes(b.dataset.act)) return;
      Sfx.init();
      this.act(b.dataset.act, b);
    });
    this.selChar = Store.data.lastChar;
  },

  icon(id, cls) { return '<img class="' + (cls || 'ic') + '" src="' + Sprites.iconURL(id) + '" alt="">'; },

  show(name, data) {
    this.cur = name;
    this.el.screen.className = 'show s-' + name;
    this.el.screen.innerHTML = this['tpl_' + name](data);
    this.el.screen.scrollTop = 0;
    this.modalReady = performance.now() + (['levelup', 'chest', 'victory'].includes(name) ? 380 : 0);
  },

  hide() {
    this.cur = null;
    this.el.screen.className = '';
    this.el.screen.innerHTML = '';
  },

  goldBox() {
    return '<div class="goldbox">' + this.icon('coin') + '<span>' + fmtNum(Store.data.gold) + '</span></div>';
  },

  // ---------- Bildschirme ----------
  tpl_menu() {
    const s = Store.data, st = s.stats;
    const achN = Object.keys(s.achievements).length;
    const tip = st.runs ? pick(TIPS) : 'Du greifst automatisch an. Lauf, weich aus und sammle blaue Edelsteine – jede Stufe bringt eine neue Waffe oder Verbesserung.';
    return '<div class="menu">' +
      '<div class="logo"><span>Glut</span><span>nacht</span></div>' +
      '<div class="tag">Überlebe die Nacht. 15 Minuten. Tausende Monster.</div>' +
      '<button class="btn big primary pulse" data-act="play">SPIELEN</button>' +
      '<div class="row">' +
      '<button class="btn" data-act="shop">' + this.icon('armor') + 'Schmiede</button>' +
      '<button class="btn" data-act="ach">' + this.icon('trophy') + 'Erfolge <span class="pill">' + achN + '/' + ACHIEVEMENTS.length + '</span></button>' +
      '<button class="btn" data-act="opts">' + this.icon('clock') + 'Einstellungen</button>' +
      '</div>' +
      this.goldBox() +
      (st.runs ? '<div class="statsline">Bestzeit <b>' + fmtTime(st.bestTime) + '</b> · Höchste Stufe <b>' + st.bestLevel + '</b> · <b>' + fmtNum(st.kills) + '</b> Monster besiegt · <b>' + st.wins + '</b> Siege</div>' : '') +
      '<div class="tip"><b>Tipp:</b> ' + tip + '</div>' +
      '</div>';
  },

  tpl_chars() {
    const s = Store.data;
    if (s.chars.indexOf(this.selChar) < 0) this.selChar = 'aron';
    let h = '<div class="panel wide"><div class="phead"><h2>Wähle deinen Helden</h2>' + this.goldBox() + '</div><div class="chars">';
    for (const id in CHARS) {
      const c = CHARS[id], locked = s.chars.indexOf(id) < 0;
      h += '<button class="char' + (locked ? ' locked' : '') + (id === this.selChar ? ' sel' : '') + '" data-act="char" data-id="' + id + '">' +
        '<img class="portrait" src="' + Sprites.playerURL(locked ? '#2a2638' : c.color, 64) + '" alt="">' +
        (locked ? this.icon('lock', 'lockic') : '<img class="wpn" src="' + Sprites.iconURL(c.weapon, 32) + '" alt="">') +
        (locked ? '<small class="cu">' + ((ACHIEVEMENTS.find(x => x.id === c.unlock) || {}).text || '') + '</small>' : '<div class="cn">' + c.name + '</div>') + '</button>';
    }
    h += '</div>';
    const c = CHARS[this.selChar];
    const w = WEAPONS[c.weapon];
    h += '<div class="chardetail"><img class="bigportrait" src="' + Sprites.playerURL(c.color, 96) + '" alt="">' +
      '<div><div class="cdname">' + c.name + ' <span>' + c.title + '</span></div>' +
      '<div class="cdline">' + this.icon(c.weapon) + '<div><b>' + w.name + '</b><br><small>' + w.desc + '</small></div></div>' +
      '<div class="cdbonus">' + c.text + '</div></div></div>';
    if (s.heatUnlocked > 0) {
      h += '<div class="heat"><div class="hl">Nachtstufe</div>';
      for (let i = 0; i <= s.heatUnlocked; i++) {
        h += '<button class="chip' + (i === s.heat ? ' sel' : '') + '" data-act="heat" data-i="' + i + '">' + (i ? i : 'Normal') + '<small>Gold ×' + String(HEAT[i].gold).replace('.', ',') + '</small></button>';
      }
      h += '</div>';
    }
    h += '<div class="actions"><button class="btn" data-act="menu">Zurück</button><button class="btn big primary" data-act="start">LOS!</button></div></div>';
    return h;
  },

  tpl_shop() {
    const s = Store.data;
    let h = '<div class="panel wide"><div class="phead"><h2>Schmiede</h2>' + this.goldBox() + '</div>' +
      '<p class="sub">Dauerhafte Verbesserungen für alle Helden. Jeder Kauf macht alle weiteren Käufe etwas teurer.</p><div class="shopgrid">';
    for (const it of SHOP) {
      const lvl = s.shop[it.id] || 0, max = lvl >= it.max, price = shopPrice(it, s);
      const can = !max && s.gold >= price;
      let pips = '';
      for (let i = 0; i < it.max; i++) pips += '<i class="' + (i < lvl ? 'on' : '') + '"></i>';
      h += '<button class="shopitem' + (max ? ' maxed' : '') + (can ? ' can' : '') + '" data-act="buy" data-id="' + it.id + '">' +
        this.icon(it.icon) + '<div class="sn">' + it.name + '</div><div class="pips">' + pips + '</div>' +
        '<div class="st">' + it.text + '</div>' +
        '<div class="price">' + (max ? 'MAX' : this.icon('coin', 'tiny') + fmtNum(price)) + '</div></button>';
    }
    h += '</div><div class="actions">' + (s.shopSpent > 0 ? '<button class="btn small ghost" data-act="refund">' + (this.confirm === 'refund' ? 'Wirklich alles zurückerstatten?' : 'Alles zurückerstatten') + '</button>' : '') +
      '<button class="btn primary" data-act="menu">Zurück</button></div></div>';
    return h;
  },

  tpl_ach() {
    const s = Store.data;
    let h = '<div class="panel wide"><div class="phead"><h2>Erfolge</h2><div class="pill big">' + Object.keys(s.achievements).length + ' / ' + ACHIEVEMENTS.length + '</div></div><div class="achlist">';
    for (const a of ACHIEVEMENTS) {
      const done = !!s.achievements[a.id];
      h += '<div class="ach' + (done ? ' done' : '') + '">' + this.icon('trophy') +
        '<div class="an"><b>' + a.name + '</b><small>' + a.text + '</small></div>' +
        '<div class="ar">' + this.icon('coin', 'tiny') + a.gold + (a.unlock ? '<small>+ ' + a.unlock + '</small>' : '') + '</div></div>';
    }
    h += '</div><div class="evos"><h3>Entdeckte Entwicklungen</h3><div class="evogrid">';
    for (const id in WEAPONS) {
      const w = WEAPONS[id], known = s.evolved[id];
      h += '<div class="evo' + (known ? ' known' : '') + '">' + this.icon(id, 'tiny') + '+' + this.icon(w.evo.with, 'tiny') + '<span>' + (known ? w.evo.name : '???') + '</span></div>';
    }
    h += '</div></div><div class="actions"><button class="btn primary" data-act="menu">Zurück</button></div></div>';
    return h;
  },

  tpl_opts() {
    const st = Store.data.settings;
    const tg = (k, label) => '<button class="toggle' + (st[k] ? ' on' : '') + '" data-act="toggle" data-k="' + k + '"><span>' + label + '</span><i></i></button>';
    return '<div class="panel"><h2>Einstellungen</h2>' +
      tg('sfx', 'Klangeffekte') + tg('music', 'Musik') + tg('dmgNums', 'Schadenszahlen') + tg('shake', 'Bildschirmwackeln') +
      '<div class="controls"><b>Steuerung</b><br>Laufen: WASD / Pfeiltasten oder irgendwo auf den Bildschirm tippen oder klicken und ziehen.<br>Angreifen passiert automatisch.<br>Pause: Esc / P · Karten wählen: 1–4 · Neu würfeln: R</div>' +
      '<div class="actions"><button class="btn small danger" data-act="reset">' + (this.confirm === 'reset' ? 'Wirklich ALLES löschen?' : 'Spielstand löschen') + '</button>' +
      '<button class="btn primary" data-act="optsback">Zurück</button></div></div>';
  },

  optionText(o) {
    if (o.kind === 'gold') return { icon: 'coin', name: o.amount + ' Gold', desc: 'Alles ist ausgebaut – nimm Gold mit.', tag: '' };
    if (o.kind === 'heal') return { icon: 'heart', name: 'Heiltrank', desc: 'Stellt ' + o.amount + ' Leben wieder her.', tag: '' };
    const r = Game.run;
    if (o.kind === 'weapon') {
      const d = WEAPONS[o.id];
      let hint = '';
      const has = Game.hasPassive(d.evo.with);
      hint = (has ? '✓ ' : '') + 'Entwicklung mit ' + PASSIVES[d.evo.with].name;
      return { icon: o.id, name: d.name, desc: o.isNew ? d.desc : d.levels[o.level - 2].t, tag: o.isNew ? 'NEU!' : 'Stufe ' + o.level, hint, ready: has && o.level === WEAPON_MAX };
    }
    const d = PASSIVES[o.id];
    let hint = '';
    for (const w of r.weapons) {
      if (WEAPONS[w.id].evo.with === o.id && !w.evo) hint = 'Entwickelt ' + WEAPONS[w.id].name + (w.level >= WEAPON_MAX ? ' (bereit!)' : ' (ab Waffenstufe 8)');
    }
    return { icon: o.id, name: d.name, desc: d.desc, tag: o.isNew ? 'NEU!' : 'Stufe ' + o.level, hint, ready: hint.indexOf('bereit') >= 0 };
  },

  tpl_levelup(opts) {
    const r = Game.run;
    let h = '<div class="modal levelup' + (this.banMode ? ' banning' : '') + '"><div class="lvtitle">Stufe <b>' + (r.level - r.pendingLevels + 1) + '</b>!</div>' +
      '<div class="lvsub">' + (this.banMode ? 'Welche NEUE Option verbannen?' : 'Wähle eine Verbesserung') + '</div><div class="cards">';
    opts.forEach((o, i) => {
      const t = this.optionText(o);
      h += '<button class="card' + (o.isNew ? ' new' : '') + (t.ready ? ' ready' : '') + (this.banMode && !o.isNew ? ' noban' : '') + '" data-act="pick" data-i="' + i + '" style="--d:' + (i * 70) + 'ms">' +
        '<div class="ctag">' + t.tag + '</div>' + this.icon(t.icon, 'cicon') +
        '<div class="cname">' + t.name + '</div><div class="cdesc">' + t.desc + '</div>' +
        (t.hint ? '<div class="chint">' + t.hint + '</div>' : '') + '<kbd>' + (i + 1) + '</kbd></button>';
    });
    // Nur Knöpfe zeigen, die man auch benutzen kann
    const mb = (act, ic, label, n, cls) => n > 0 ? '<button class="btn small' + (cls || '') + '" data-act="' + act + '">' + this.icon(ic, 'tiny') + label + ' (' + n + ')</button>' : '';
    h += '</div><div class="lvactions">' + mb('reroll', 'dice', 'Neu würfeln', r.rerolls) + mb('skip', 'skip', 'Überspringen', r.skips) +
      mb('banmode', 'banish', 'Verbannen', r.banishes, this.banMode ? ' active' : '') +
      '</div>' + (r.rerolls + r.skips + r.banishes === 0 && Store.data.stats.runs <= 3 ? '<div class="lvnote">Neu würfeln, Überspringen und Verbannen gibt es in der Schmiede.</div>' : '') + '</div>';
    return h;
  },

  tpl_chest(res) {
    let h = '<div class="modal chestm' + (res.evolved ? ' evolved' : '') + '"><div class="chestimg">' + this.icon('chest', 'chestic') + '</div>';
    if (res.evolved) {
      const w = WEAPONS[res.evolved];
      h += '<div class="evotitle">ENTWICKLUNG!</div><div class="evocard">' + this.icon(res.evolved, 'cicon') +
        '<div><div class="cname">' + w.name + ' → <b>' + w.evo.name + '</b></div><div class="cdesc">' + w.evo.desc + '</div></div></div>';
    } else {
      h += '<div class="evotitle">Truhe!</div>';
    }
    h += '<div class="loot">';
    res.items.forEach((o, i) => {
      const t = this.optionText(o);
      h += '<div class="lootitem" style="--d:' + (500 + i * 220) + 'ms">' + this.icon(t.icon) + '<b>' + t.name + '</b><span>' + t.tag + '</span></div>';
    });
    h += '</div><div class="lootgold" style="--d:' + (600 + res.items.length * 220) + 'ms">' + this.icon('coin', 'tiny') + '+' + res.gold + ' Gold</div>' +
      '<button class="btn primary" data-act="chestok">Weiter</button></div>';
    return h;
  },

  tpl_pause() {
    const r = Game.run, s = r.stats;
    let h = '<div class="modal pause"><h2>Pause</h2><div class="build"><div class="bcol"><h3>Waffen</h3>';
    for (const w of r.weapons) {
      const d = WEAPONS[w.id];
      h += '<div class="brow">' + this.icon(w.id) + '<div><b>' + (w.evo ? d.evo.name : d.name) + '</b> <span class="lv' + (w.evo ? ' evo' : '') + '">' + (w.evo ? 'ENTWICKELT' : 'Stufe ' + w.level + '/8') + '</span>' +
        (w.evo ? '' : '<small>Entwicklung: Stufe 8 + ' + PASSIVES[d.evo.with].name + (Game.hasPassive(d.evo.with) ? ' ✓' : '') + ', dann Truhe</small>') + '</div></div>';
    }
    h += '</div><div class="bcol"><h3>Passive</h3>';
    for (const p of r.passives) {
      const d = PASSIVES[p.id];
      h += '<div class="brow">' + this.icon(p.id) + '<div><b>' + d.name + '</b> <span class="lv">Stufe ' + p.level + '/' + d.max + '</span><small>' + d.desc + '</small></div></div>';
    }
    if (!r.passives.length) h += '<div class="empty">Noch keine</div>';
    const pct = v => (v >= 0 ? '+' : '') + Math.round(v * 100) + ' %';
    h += '</div></div><div class="statgrid">' +
      '<div>Leben<b>' + Math.ceil(r.p.hp) + '/' + s.maxHp + '</b></div><div>Rüstung<b>' + s.armor + '</b></div><div>Erholung<b>' + s.regen.toFixed(1).replace('.', ',') + '/s</b></div>' +
      '<div>Schaden<b>' + pct(s.might - 1) + '</b></div><div>Fläche<b>' + pct(s.area - 1) + '</b></div><div>Abklingzeit<b>' + pct(s.cooldown - 1) + '</b></div>' +
      '<div>Geschosse<b>+' + s.amount + '</b></div><div>Lauftempo<b>' + pct(s.speedMul - 1) + '</b></div><div>Glück<b>' + pct(s.luck - 1) + '</b></div>' +
      '<div>Krit<b>' + Math.round(s.crit * 100) + ' %</b></div><div>Wachstum<b>' + pct(s.growth - 1) + '</b></div><div>Gier<b>' + pct(s.greed - 1) + '</b></div>' +
      '</div><div class="actions"><button class="btn danger small" data-act="quit">' + (this.confirm === 'quit' ? 'Wirklich aufgeben?' : 'Aufgeben') + '</button>' +
      '<button class="btn small" data-act="opts">Einstellungen</button><button class="btn primary" data-act="resume">Weiter</button></div></div>';
    return h;
  },

  tpl_victory() {
    return '<div class="modal victory"><div class="vtitle">Die Nacht ist besiegt!</div>' +
      '<p>Du hast 15 Minuten überlebt. Die Belohnung ist dir sicher.<br>Wie lange hältst du noch durch? Im Endlosmodus wird es immer härter – Gold gibt es weiter.</p>' +
      '<div class="actions"><button class="btn" data-act="finish">Belohnung einsammeln</button><button class="btn primary" data-act="endless">Endlos weiter</button></div></div>';
  },

  tpl_over(sum) {
    const r = Game.run, save = Store.data;
    const won = sum.won;
    const record = r.t > this.prevBest && this.prevBest > 0;
    let h = '<div class="panel wide over' + (won ? ' won' : '') + '"><div class="otitle">' + (won ? 'Sieg!' : 'Gefallen') + '</div>' +
      (record ? '<div class="record">Neue Bestzeit!</div>' : '') +
      '<div class="ostats"><div>' + this.icon('clock', 'tiny') + '<b>' + fmtTime(r.t) + '</b><small>Zeit</small></div>' +
      '<div><b>' + r.level + '</b><small>Stufe</small></div>' +
      '<div>' + this.icon('skull', 'tiny') + '<b>' + fmtNum(r.kills) + '</b><small>Besiegt</small></div>' +
      '<div><b>' + r.bossKills + '</b><small>Bosse</small></div></div>' +
      '<div class="goldcalc"><span>Gesammelt <b>' + sum.collected + '</b></span><span>Zeitbonus <b>' + sum.timeBonus + '</b></span><span>Bossbonus <b>' + sum.bossBonus + '</b></span>' +
      (sum.gift ? '<span>Startgeschenk <b>' + sum.gift + '</b></span>' : '') +
      (sum.heatMul > 1 ? '<span>(inkl. Nachtstufe ×' + String(sum.heatMul).replace('.', ',') + ')</span>' : '') +
      '<span class="gtotal">' + this.icon('coin', 'tiny') + '+' + fmtNum(sum.total) + '</span></div>';
    const dmg = Object.entries(r.dmgBy).filter(([k]) => WEAPONS[k]).sort((a, b) => b[1] - a[1]);
    if (dmg.length) {
      const max = dmg[0][1];
      h += '<div class="dmgtable">';
      for (const [k, v] of dmg) {
        const w = r.weapons.find(x => x.id === k);
        h += '<div class="drow">' + this.icon(k, 'tiny') + '<span class="dn">' + (w && w.evo ? WEAPONS[k].evo.name : WEAPONS[k].name) + '</span>' +
          '<div class="dbar"><i style="width:' + (v / max * 100).toFixed(1) + '%"></i></div><span class="dv">' + fmtNum(v) + '</span></div>';
      }
      h += '</div>';
    }
    if (r.newAch.length) {
      h += '<div class="newach"><h3>Neue Erfolge</h3>' + r.newAch.map(a => '<div>' + this.icon('trophy', 'tiny') + '<b>' + a.name + '</b> +' + a.gold + ' Gold' + (a.unlock ? ' · <em>Freigeschaltet: ' + a.unlock + '</em>' : '') + '</div>').join('') + '</div>';
    }
    // Nächstes Ziel als Anreiz
    const next = ACHIEVEMENTS.find(a => !save.achievements[a.id]);
    const cheap = SHOP.filter(it => (save.shop[it.id] || 0) < it.max).map(it => ({ it, p: shopPrice(it, save) })).sort((a, b) => a.p - b.p)[0];
    h += '<div class="nextgoal">';
    const canBuy = cheap && save.gold >= cheap.p;
    if (canBuy) h += '<div>' + this.icon(cheap.it.icon, 'tiny') + 'Du kannst dir <b>' + cheap.it.name + '</b> in der Schmiede leisten!</div>';
    else if (cheap) h += '<div>' + this.icon(cheap.it.icon, 'tiny') + 'Noch <b>' + fmtNum(cheap.p - save.gold) + ' Gold</b> bis ' + cheap.it.name + ' (' + cheap.it.text + ')</div>';
    if (next) h += '<div>' + this.icon('trophy', 'tiny') + 'Nächstes Ziel: <b>' + next.text + '</b>' + (next.unlock ? ' → ' + next.unlock : '') + '</div>';
    h += '</div><div class="actions"><button class="btn" data-act="menu">Menü</button><button class="btn' + (canBuy ? ' pulse' : '') + '" data-act="shop">' + this.icon('armor', 'tiny') + 'Schmiede</button><button class="btn big primary" data-act="again">Nochmal!</button></div></div>';
    return h;
  },

  // ---------- Aktionen ----------
  act(a, b) {
    const s = Store.data;
    if (a !== 'refund' && a !== 'reset' && a !== 'quit') this.confirm = null;
    switch (a) {
      case 'play': Sfx.play('click'); if (!s.stats.runs) this.startRun(this.selChar || 'aron'); else this.show('chars'); break;
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
      case 'heat': s.heat = +b.dataset.i; Store.save(); Sfx.play('click'); this.show('chars'); break;
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
        this.confirm = null; Game.run = null; Game.state = 'menu'; Store.reset(); this.selChar = 'aron'; Sfx.applySettings(); this.toMenu(); break;
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
    if (s.heat > s.heatUnlocked) s.heat = 0;
    this.prevBest = s.stats.bestTime;
    Store.save();
    Sfx.init();
    Sfx.play('levelup');
    this.hide();
    this.banMode = false;
    this.hudSig = '';
    Game.newRun(charId, s.heat);
    this.el.hud.hidden = false;
    this.el.toasts.innerHTML = '';
    clearTimeout(this.bannerT);
    this.el.banner.className = '';
    if (s.settings.music) Sfx.startMusic();
  },

  toMenu() {
    if (Game.run && !Game.run.over && Game.state !== 'menu') Game.endRun(false);
    Game.state = 'menu';
    Game.run = null;
    this.el.hud.hidden = true;
    this.el.bossbar.hidden = true;
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
    const ae = document.activeElement;
    if ((k === 'enter' || k === ' ') && ae && ae.tagName === 'BUTTON' && this.el.screen.contains(ae) && ae.matches(':focus-visible')) return;
    if ((k === 'enter' || k === ' ') && performance.now() >= this.modalReady) {
      const b = this.el.screen.querySelector('[data-act="chestok"],[data-act="again"],[data-act="start"]');
      if (b && (this.cur === 'chest' || this.cur === 'over' || this.cur === 'chars')) { e.preventDefault(); this.act(b.dataset.act, b); }
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
    setTimeout(() => {
      if (Game.state !== 'over') return;
      this.el.hud.hidden = true;
      this.el.toasts.innerHTML = '';
      this.show('over', sum);
      Sfx.stopMusic();
    }, sum.won ? 300 : 1100);
  },

  banner(text, kind) {
    const b = this.el.banner;
    b.textContent = text;
    b.className = '';
    void b.offsetWidth;
    b.className = 'show ' + (kind || '');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { b.className = ''; }, 2600);
  },

  achievement(a) {
    Sfx.play('achievement');
    const d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = this.icon('trophy', 'tiny') + '<div><b>' + a.name + '</b><small>' + a.text + ' · +' + a.gold + ' Gold' + (a.unlock ? ' · Freigeschaltet: ' + a.unlock : '') + '</small></div>';
    this.el.toasts.appendChild(d);
    setTimeout(() => d.classList.add('out'), 3800);
    setTimeout(() => d.remove(), 4400);
  },

  // ---------- HUD ----------
  updateHud() {
    const r = Game.run;
    if (!r || this.el.hud.hidden) return;
    const L = this.lastHud, el = this.el;
    const xpk = Math.min(1, r.xp / r.xpNext);
    const xpw = (xpk * 100).toFixed(1);
    if (L.xp !== xpw) { el.xpfill.style.width = xpw + '%'; L.xp = xpw; }
    if (L.level !== r.level) { el.xplvl.textContent = 'Stufe ' + r.level; L.level = r.level; }
    const tt = Math.floor(r.t);
    if (L.t !== tt) {
      el.timer.textContent = fmtTime(r.t);
      el.timer.classList.toggle('endless', r.endless);
      L.t = tt;
    }
    if (L.kills !== r.kills) { el.kills.textContent = fmtNum(r.kills); L.kills = r.kills; }
    if (L.gold !== r.gold) { el.gold.textContent = fmtNum(r.gold); L.gold = r.gold; }
    const sig = r.weapons.map(w => w.id + w.level + (w.evo ? 'e' : '')).join() + '|' + r.passives.map(p => p.id + p.level).join();
    if (sig !== this.hudSig) {
      this.hudSig = sig;
      const slot = (id, lvl, max, evo) => '<div class="slot' + (evo ? ' evo' : '') + '">' + this.icon(id) + '<span>' + (evo ? '★' : lvl) + '</span></div>';
      let wh = '', ph = '';
      for (let i = 0; i < MAX_WEAPONS; i++) { const w = r.weapons[i]; wh += w ? slot(w.id, w.level, WEAPON_MAX, w.evo) : '<div class="slot empty"></div>'; }
      for (let i = 0; i < MAX_PASSIVES; i++) { const p = r.passives[i]; ph += p ? slot(p.id, p.level, PASSIVES[p.id].max) : '<div class="slot empty"></div>'; }
      el.wslots.innerHTML = wh; el.pslots.innerHTML = ph;
    }
    let boss = null;
    for (const b of r.bosses) if (!b.dead && (!boss || b.maxHp > boss.maxHp)) boss = b;
    if (boss) {
      if (el.bossbar.hidden) el.bossbar.hidden = false;
      if (L.bossName !== boss.boss.name) { el.bossname.textContent = boss.boss.name; L.bossName = boss.boss.name; }
      el.bossfill.style.width = (Math.max(0, boss.hp / boss.maxHp) * 100).toFixed(1) + '%';
    } else if (!el.bossbar.hidden) el.bossbar.hidden = true;
  },
};
