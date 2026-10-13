'use strict';
// ---------------------------------------------------------------------------
// Benutzeroberfläche: HUD, Werkzeuge, Info-Fenster, Menüs, Statistik, Tutorial
// ---------------------------------------------------------------------------

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(3)) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
function icon(name, cls) { return h('span', { class: 'ic ' + (cls || ''), html: ICON[name] || '' }); }

const PURPOSE_DE = { commute: 'Weg zur Arbeit', shop: 'Einkauf', leisure: 'Freizeit', delivery: 'Lieferung', through: 'Durchgangsverkehr', home: 'Heimweg', event: 'Stadionbesuch', emergency: 'Einsatzfahrt' };
const ARM_DE = ['Nord', 'Ost', 'Süd', 'West'];

class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.tool = 'inspect';
    this.placeType = 'house'; this.placeDir = 2;
    this.lineDraft = [];
    this.settings = Object.assign({ sound: true, volume: 0.55, grid: false, autosave: true }, Store.get('vm_settings', {}));
    this.hudT = 0; this.inspT = 0; this.miniT = 0;
    this.inspHold = false;
    this.game = null;
    this.feedItems = [];
    this.build();
  }

  saveSettings() { Store.set('vm_settings', this.settings); }

  build() {
    const r = this.root;
    r.innerHTML = '';
    this.hud = h('header', { class: 'hud', hidden: true });
    this.toolbar = h('nav', { class: 'toolbar', hidden: true, 'aria-label': 'Werkzeuge' });
    this.goalsEl = h('section', { class: 'goals', hidden: true });
    this.insp = h('aside', { class: 'inspector', hidden: true });
    this.feed = h('div', { class: 'feed', hidden: true, 'aria-live': 'polite' });
    this.miniWrap = h('div', { class: 'minimap', hidden: true });
    this.mini = h('canvas', { width: 200, height: 130 });
    this.miniWrap.append(this.mini);
    this.tip = h('div', { class: 'tip', hidden: true });
    this.toasts = h('div', { class: 'toasts' });
    this.modalRoot = h('div', { class: 'modal-root' });
    this.tut = h('div', { class: 'tutorial', hidden: true });
    this.menu = h('div', { class: 'menu', hidden: true });
    this.toolTip = h('div', { class: 'tooltip', hidden: true });
    r.append(this.hud, this.toolbar, this.goalsEl, this.insp, this.feed, this.miniWrap, this.tip, this.tut, this.toasts, this.menu, this.modalRoot, this.toolTip);
    this.insp.addEventListener('pointerdown', () => { this.inspHold = true; });
    window.addEventListener('pointerup', () => { this.inspHold = false; });
    this.bindMinimap();
  }

  // ======================================================================
  // Spiel betreten / verlassen
  // ======================================================================
  enterGame(game) {
    this.game = game;
    game.ui = this;
    this.tool = 'inspect';
    this.lineDraft = [];
    this.feedItems = [];
    this.feed.innerHTML = '';
    this.closeModals();
    this.menu.hidden = true;
    for (const el of [this.hud, this.toolbar, this.goalsEl, this.feed, this.miniWrap]) el.hidden = false;
    this.insp.hidden = true;
    this.buildHUD();
    this.buildToolbar();
    this.renderGoals();
    this.miniDirty = true;
    this.app.renderer.showGrid = this.settings.grid;
    this.tutStep = -1;
    this.tut.hidden = true;
  }

  leaveGame() {
    this.game = null;
    for (const el of [this.hud, this.toolbar, this.goalsEl, this.insp, this.feed, this.miniWrap, this.tip, this.tut]) el.hidden = true;
  }

  // ======================================================================
  // HUD
  // ======================================================================
  buildHUD() {
    const g = this.game;
    const hud = this.hud;
    hud.innerHTML = '';
    const el = {};
    this.hudEl = el;
    const brand = h('div', { class: 'brand' },
      h('div', { class: 'brand-name', text: 'Verkehrsmeister' }),
      h('div', { class: 'brand-level', text: g.level.name + (g.level.sub ? ' · ' + g.level.sub : '') }));
    el.money = h('span', { class: 'v' });
    el.moneyChip = h('div', { class: 'chip plate', title: 'Stadtkasse' }, h('span', { class: 'k', text: 'Kasse' }), el.money);
    el.clock = h('span', { class: 'v mono' });
    el.day = h('span', { class: 'k' });
    el.weather = h('span', { class: 'wx' });
    const clockChip = h('div', { class: 'chip clock', title: 'Spielzeit' }, el.day, el.clock, el.weather);
    el.satBar = h('i');
    el.satVal = h('span', { class: 'v' });
    el.satChip = h('div', { class: 'chip sat', title: 'Zufriedenheit der Bürger: hängt von Fahrzeiten, Staus, Unfällen und angeschlossenen Gebäuden ab' },
      h('span', { class: 'k', text: 'Zufriedenheit' }), h('span', { class: 'meter' }, el.satBar), el.satVal);
    el.trips = h('span', { class: 'v' });
    el.veh = h('span', { class: 'v' });
    el.pop = h('span', { class: 'v' });
    const stats = h('div', { class: 'chip stats' },
      h('span', { class: 'st', title: 'Erfolgreiche Fahrten' }, icon('flag'), el.trips),
      h('span', { class: 'st', title: 'Fahrzeuge unterwegs' }, icon('car'), el.veh),
      h('span', { class: 'st', title: 'Einwohner' }, h('span', { class: 'ic', html: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4" fill="currentColor"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8z" fill="currentColor"/></svg>' }), el.pop));
    const speeds = h('div', { class: 'speeds', role: 'group', 'aria-label': 'Spieltempo' });
    el.speedBtns = [];
    const sp = [[0, 'pause', 'Pause (Leertaste)'], [1, 'play', 'Normal (1)'], [2, 'ff', 'Schnell (2)'], [4, 'fff', 'Sehr schnell (3)']];
    for (const [v, ic, title] of sp) {
      const b = h('button', { class: 'sbtn', title, 'aria-label': title, onclick: () => { this.setSpeed(v); AUDIO.play('click'); } }, icon(ic));
      b.dataset.v = v;
      el.speedBtns.push(b);
      speeds.append(b);
    }
    el.heatBtn = h('button', { class: 'hbtn', title: 'Verkehrsdichte anzeigen (H)', onclick: () => this.toggleOverlay() }, icon('heat'), h('span', { text: 'Verkehr' }));
    const undo = h('button', { class: 'hbtn', title: 'Rückgängig (Strg+Z)', onclick: () => this.game.undo() }, icon('undo'));
    const statsB = h('button', { class: 'hbtn', title: 'Statistik (S)', onclick: () => this.showStats() }, icon('stats'));
    el.soundBtn = h('button', { class: 'hbtn', title: 'Ton an/aus (M)', onclick: () => this.toggleSound() }, icon(this.settings.sound ? 'sound' : 'mute'));
    const menuB = h('button', { class: 'hbtn', title: 'Menü (Esc)', onclick: () => this.showPause() }, icon('menu'));
    hud.append(brand, h('div', { class: 'hud-mid' }, el.moneyChip, clockChip, el.satChip, stats), h('div', { class: 'hud-right' }, speeds, el.heatBtn, undo, statsB, el.soundBtn, menuB));
    this.updateHUD();
  }

  updateHUD() {
    const g = this.game, el = this.hudEl;
    if (!g || !el) return;
    el.money.textContent = g.sandbox ? '∞' : fmtMoney(g.money);
    el.moneyChip.classList.toggle('neg', g.money < 0);
    el.clock.textContent = fmtClock(g.minutes);
    el.day.textContent = WEEKDAYS_SHORT[g.weekday] + ' · Tag ' + (g.dayIndex + 1);
    const wx = g.city.weather;
    if (el.weather.dataset.w !== wx) { el.weather.dataset.w = wx; el.weather.innerHTML = ICON[WEATHER[wx].icon]; el.weather.title = WEATHER[wx].name; }
    const s = g.satisfaction;
    el.satBar.style.width = s + '%';
    el.satChip.dataset.lvl = s >= 60 ? 'good' : s >= 35 ? 'warn' : 'bad';
    el.satVal.textContent = Math.round(s) + ' %';
    el.trips.textContent = fmtInt(g.stats.trips);
    el.veh.textContent = fmtInt(g.traffic.vehicles.length);
    el.pop.textContent = fmtInt(g.population());
    const cur = g.paused ? 0 : g.speed;
    for (const b of el.speedBtns) b.classList.toggle('on', +b.dataset.v === cur);
    el.heatBtn.classList.toggle('on', this.app.renderer.overlay === 'traffic');
  }

  setSpeed(v) {
    const g = this.game;
    if (!g || g.over) return;
    if (v === 0) g.paused = true; else { g.paused = false; g.speed = v; }
    this.updateHUD();
  }
  togglePause() { const g = this.game; if (!g) return; g.paused = !g.paused; this.updateHUD(); }
  toggleOverlay() {
    const r = this.app.renderer;
    r.overlay = r.overlay === 'traffic' ? 'none' : 'traffic';
    AUDIO.play('click');
    this.updateHUD();
  }
  toggleSound() {
    this.settings.sound = !this.settings.sound;
    AUDIO.setEnabled(this.settings.sound);
    this.saveSettings();
    if (this.hudEl) this.hudEl.soundBtn.innerHTML = ICON[this.settings.sound ? 'sound' : 'mute'];
  }

  // ======================================================================
  // Werkzeugleiste
  // ======================================================================
  buildToolbar() {
    const g = this.game;
    const tb = this.toolbar;
    tb.innerHTML = '';
    this.toolBtns = {};
    const allowed = g.level.tools || [];
    for (const t of TOOLS) {
      if (!allowed.includes(t.id)) continue;
      const cost = this.toolCost(t.id);
      const b = h('button', { class: 'tool', 'aria-label': t.name + ' (' + t.key + ')', onclick: () => this.setTool(t.id) },
        icon(t.id), h('span', { class: 'key', text: t.key }), h('span', { class: 'lbl', text: t.name }));
      b.addEventListener('pointerenter', () => this.showToolTip(b, t, cost));
      b.addEventListener('pointerleave', () => { this.toolTip.hidden = true; });
      this.toolBtns[t.id] = b;
      tb.append(b);
      if (t.id === 'inspect' || t.id === 'bulldoze') tb.append(h('div', { class: 'tsep' }));
    }
    if (allowed.includes('place')) {
      const sel = h('select', { class: 'place-sel', id: 'place-type', 'aria-label': 'Gebäudetyp', onchange: e => { this.placeType = e.target.value; this.setTool('place'); } },
        Object.keys(BT).map(k => h('option', { value: k, selected: k === this.placeType ? true : null, text: BT[k].name })));
      tb.append(sel);
    }
    this.setTool('inspect', true);
  }

  toolCost(id) {
    const c = CFG.cost;
    return { road: c.road + ' €/Feld', oneway: c.oneway + ' €/Feld', highway: c.highway + ' €/Feld', light: fmtMoney(c.light), priority: fmtMoney(c.priority), roundabout: fmtMoney(c.roundabout), stop: fmtMoney(c.stop), busline: fmtMoney(c.bus) + '/Bus', bulldoze: '35 % zurück' }[id] || '';
  }

  showToolTip(btn, t, cost) {
    const tt = this.toolTip;
    tt.innerHTML = '';
    tt.append(h('div', { class: 'tt-head' }, h('b', { text: t.name }), h('kbd', { text: t.key })), cost ? h('div', { class: 'tt-cost', text: cost }) : null, h('p', { text: t.desc }));
    if (t.id === 'road' || t.id === 'highway') tt.append(h('p', { class: 'tt-small', text: 'Brücke +' + fmtMoney(CFG.cost.bridge) + ' · Tunnel +' + fmtMoney(CFG.cost.tunnel) + ' je Feld' }));
    tt.hidden = false;
    const r = btn.getBoundingClientRect();
    const narrow = window.innerWidth < 760;
    if (narrow) { tt.style.left = Math.max(8, Math.min(window.innerWidth - 268, r.left)) + 'px'; tt.style.top = ''; tt.style.bottom = (window.innerHeight - r.top + 8) + 'px'; }
    else { tt.style.left = (r.right + 10) + 'px'; tt.style.top = Math.max(8, r.top - 4) + 'px'; tt.style.bottom = ''; }
  }

  setTool(id, silent) {
    if (this.tool === 'busline' && id !== 'busline') this.lineDraft = [];
    this.tool = id;
    for (const k in this.toolBtns) this.toolBtns[k].classList.toggle('on', k === id);
    this.app.renderer.preview = null;
    this.tip.hidden = true;
    if (!silent) AUDIO.play('tool');
    if (id === 'busline') this.flashHint('Klicke Haltestellen der Reihe nach an. Enter oder Klick auf die erste Haltestelle schließt die Linie ab. Esc bricht ab.');
    else if (id === 'place') this.flashHint('Gebäude: ' + BT[this.placeType].name + '. Rechtsklick dreht die Einfahrt.');
    if (this.tutStep >= 0) this.tutCheck();
  }

  flashHint(text) {
    const n = h('div', { class: 'hint', text });
    this.toasts.append(n);
    setTimeout(() => n.classList.add('out'), 4200);
    setTimeout(() => n.remove(), 4800);
  }

  // Kostenanzeige am Mauszeiger
  showCostTip(x, y, text, bad) {
    const t = this.tip;
    t.hidden = false;
    t.textContent = text;
    t.classList.toggle('bad', !!bad);
    t.style.left = (x + 16) + 'px';
    t.style.top = (y + 14) + 'px';
  }
  hideCostTip() { this.tip.hidden = true; }

  // ======================================================================
  // Ziele
  // ======================================================================
  renderGoals() {
    const g = this.game, el = this.goalsEl;
    if (!g) return;
    el.innerHTML = '';
    if (g.mode === 'campaign') {
      const gs = g.goalStatus();
      el.append(h('div', { class: 'goals-head' }, icon('target'), h('span', { text: 'Ziele' })));
      for (const s of gs) {
        let f;
        if (s.type === 'sat') f = s.cur / s.target;
        else f = s.cur / s.target;
        const row = h('div', { class: 'goal' + (s.done ? ' done' : '') },
          h('div', { class: 'goal-top' }, h('span', { text: s.label }), h('b', { text: s.type === 'sat' ? fmtPct(s.cur) : s.fmt(Math.min(s.cur, s.target)) + ' / ' + s.fmt(s.target) })),
          h('div', { class: 'bar' }, h('i', { style: { width: clamp(f, 0, 1) * 100 + '%' } })));
        el.append(row);
      }
    } else if (g.mode === 'endless') {
      el.append(h('div', { class: 'goals-head' }, icon('flag'), h('span', { text: 'Endlos · ' + g.level.name })),
        h('div', { class: 'goal' }, h('div', { class: 'goal-top' }, h('span', { text: 'Überstandene Tage' }), h('b', { text: String(g.dayIndex) }))),
        h('div', { class: 'goal' }, h('div', { class: 'goal-top' }, h('span', { text: 'Verkehrsaufkommen' }), h('b', { text: '×' + fmtDec(g.demandRamp * (g.level.demand || 1), 2) }))));
    } else if (g.mode === 'sandbox') {
      const growth = h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'sb-growth', checked: g.level.growth > 0 ? true : null, onchange: e => { g.level.growth = e.target.checked ? 50 : 0; } }), ' Stadt wächst');
      const ev = h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'sb-events', checked: g.level.events.accidents ? true : null, onchange: e => { const on = e.target.checked; g.level.events = on ? { accidents: true, works: true, outage: true, fire: true, ambulance: true, stadium: true } : {}; } }), ' Ereignisse');
      const dem = h('label', { class: 'rng' }, 'Verkehr', h('input', { type: 'range', id: 'sb-demand', min: 0.3, max: 3, step: 0.1, value: g.level.demand, oninput: e => { g.level.demand = +e.target.value; } }));
      el.append(h('div', { class: 'goals-head' }, icon('place'), h('span', { text: 'Freies Bauen' })), growth, ev, dem);
    } else el.hidden = true;
  }

  // ======================================================================
  // Meldungen
  // ======================================================================
  addNote(n) {
    if (!this.game) return;
    const kindIcon = { danger: 'help', warn: 'help', good: 'star', money: 'save', event: 'flag', weather: 'cloud', new: 'place', info: 'eye' };
    const el = h('button', { class: 'note k-' + n.kind, onclick: () => { if (n.tile >= 0) this.jumpTo(n.tile); } },
      h('span', { class: 'note-time mono', text: fmtClock(n.min) }), h('span', { class: 'note-text', text: n.text }));
    this.feed.prepend(el);
    this.feedItems.unshift({ el, t: performance.now() });
    while (this.feedItems.length > 5) { const o = this.feedItems.pop(); o.el.remove(); }
    if (n.kind === 'danger') AUDIO.play('warn');
    else if (n.kind === 'event' || n.kind === 'good') AUDIO.play('note');
    if (n.kind === 'danger' && this.settings.pauseOnDanger && this.game) this.game.paused = true;
  }

  updateFeed() {
    const now = performance.now();
    for (let k = this.feedItems.length - 1; k >= 0; k--) {
      const it = this.feedItems[k];
      const age = now - it.t;
      if (age > 14000) { it.el.remove(); this.feedItems.splice(k, 1); }
      else if (age > 11000) it.el.classList.add('fade');
    }
  }

  jumpTo(tile) {
    const w = this.game.world;
    const r = this.app.renderer;
    r.centerOn(w.tx(tile) + 0.5, w.ty(tile) + 0.5, Math.max(r.cam.z, 34));
    if (this.tool === 'inspect') this.select({ kind: 'tile', i: tile });
  }

  toast(title, text, cls) {
    const n = h('div', { class: 'toast ' + (cls || '') }, h('div', { class: 'toast-k', text: title }), h('div', { class: 'toast-t', text }));
    this.toasts.append(n);
    setTimeout(() => n.classList.add('out'), 4500);
    setTimeout(() => n.remove(), 5200);
  }

  // ======================================================================
  // Auswahl & Info-Fenster
  // ======================================================================
  select(sel) {
    const r = this.app.renderer;
    r.selected = sel;
    this.app.follow = null;
    if (!sel) { this.insp.hidden = true; return; }
    this.insp.hidden = false;
    this.renderInspector();
  }

  renderInspector() {
    const sel = this.app.renderer.selected, g = this.game;
    if (!sel || !g) { this.insp.hidden = true; return; }
    const ins = this.insp;
    const scroll = ins.querySelector('.insp-body') ? ins.querySelector('.insp-body').scrollTop : 0;
    ins.innerHTML = '';
    let content = null;
    if (sel.kind === 'tile') {
      const w = g.world;
      if (!w.road[sel.i]) { this.select(null); return; }
      content = w.isJ[sel.i] && w.jc[sel.i] ? this.junctionPanel(w.jc[sel.i]) : this.roadPanel(sel.i);
    } else if (sel.kind === 'building') content = this.buildingPanel(sel.b);
    else if (sel.kind === 'vehicle') content = this.vehiclePanel(sel.id);
    else if (sel.kind === 'line') content = this.linePanel(sel.line);
    if (!content) { this.select(null); return; }
    ins.append(content);
    const body = ins.querySelector('.insp-body');
    if (body) body.scrollTop = scroll;
  }

  panel(title, sub, accent, ...body) {
    return h('div', { class: 'panel' },
      h('div', { class: 'insp-head', style: accent ? { background: accent } : null },
        h('div', {}, h('div', { class: 'insp-title', text: title }), sub ? h('div', { class: 'insp-sub', text: sub }) : null),
        h('button', { class: 'xbtn', 'aria-label': 'Schließen', onclick: () => this.select(null) }, icon('close'))),
      h('div', { class: 'insp-body' }, ...body));
  }

  kv(k, v, cls) { return h('div', { class: 'kv ' + (cls || '') }, h('span', { text: k }), h('b', { text: v })); }

  roadPanel(i) {
    const g = this.game, w = g.world;
    const cls = w.road[i];
    const one = w.link[i] !== w.two[i];
    const name = (cls === 2 ? 'Schnellstraße' : 'Stadtstraße') + (one ? ' (Einbahn)' : '');
    const parts = [];
    if (w.flags[i] & F_BRIDGE) parts.push('Brücke');
    if (w.flags[i] & F_TUNNEL) parts.push('Tunnel');
    const c = w.cong[i];
    const state = c < 1.4 ? 'frei' : c < 2.5 ? 'zähfließend' : 'Stau';
    const body = [
      this.kv('Tempolimit', cls === 2 ? '90 km/h' : '50 km/h'),
      this.kv('Verkehr', Math.round(w.flow[i]) + ' Fz/Std'),
      this.kv('Verkehrsfluss', state, c < 1.4 ? 'ok' : c < 2.5 ? 'warn' : 'bad'),
    ];
    if (w.works[i] > 0) {
      body.push(h('div', { class: 'banner warn' }, h('b', { text: 'Baustelle' }), h('span', { text: ' noch ca. ' + fmtDuration(w.works[i] * CFG.minPerSec) }),
        h('button', { class: 'btn small', onclick: () => { if (g.city.rushWorks(i)) this.renderInspector(); } }, 'Beschleunigen (' + fmtMoney(CFG.worksRushCost) + ')')));
    }
    const st = g.city.stops.get(i);
    if (st) {
      const lines = g.city.lines.filter(l => l.stops.includes(i));
      body.push(h('div', { class: 'sec' }, h('div', { class: 'sec-h', text: 'Haltestelle „' + st.name + '“' }),
        this.kv('Wartende Fahrgäste', String(st.waiting.length)),
        this.kv('Eingestiegen gesamt', fmtInt(st.served)),
        lines.length ? h('div', { class: 'chips' }, lines.map(l => h('button', { class: 'line-chip', style: { background: l.color }, onclick: () => this.select({ kind: 'line', line: l }) }, l.name))) : h('p', { class: 'muted', text: 'Noch keine Linie hält hier. Nutze das Buslinien-Werkzeug (N).' }),
        h('button', { class: 'btn small ghost', onclick: () => { g.city.removeStop(i); if (!g.sandbox) g.addMoney(Math.round(CFG.cost.stop * CFG.refund)); g.onWorldEdit([i]); this.renderInspector(); } }, 'Haltestelle entfernen')));
    }
    return this.panel(name, parts.join(' · ') || 'Straßenabschnitt', null, ...body);
  }

  junctionPanel(J) {
    const g = this.game, w = g.world, i = J.i;
    const body = [];
    // Typauswahl
    const types = [['auto', 'Rechts vor links', 0], ['priority', 'Vorfahrt', CFG.cost.priority], ['light', 'Ampel', CFG.cost.light], ['roundabout', 'Kreisverkehr', CFG.cost.roundabout]];
    const allowed = g.level.tools || [];
    const seg = h('div', { class: 'seg' });
    for (const [t, name, cost] of types) {
      const toolId = t === 'auto' ? null : t;
      if (toolId && !allowed.includes(toolId)) continue;
      const b = h('button', { class: 'seg-b' + (J.type === t ? ' on' : ''), onclick: () => {
        if (J.type === t) return;
        if (t === 'auto') g.removeControl(i); else g.setControl(i, t);
        this.renderInspector();
      } }, h('span', { text: name }), cost && J.type !== t ? h('small', { text: fmtMoney(cost) }) : null);
      seg.append(b);
    }
    if (seg.children.length > 1) body.push(seg);
    // Unfälle / Stromausfall
    const acc = g.city.accidents.find(a => a.tile === i);
    if (acc) body.push(h('div', { class: 'banner bad' }, h('b', { text: 'Unfall! ' }), h('span', { text: 'Gesperrt für ca. ' + fmtDuration(acc.t * CFG.minPerSec) + '. ' }),
      h('button', { class: 'btn small', onclick: () => { g.city.towAccident(acc); this.renderInspector(); } }, 'Abschleppen (' + fmtMoney(CFG.towCost) + ')')));
    const out = g.city.outageAt(i);
    if (out) body.push(h('div', { class: 'banner warn' }, h('b', { text: 'Stromausfall. ' }), h('span', { text: 'Ampel ist aus – es gilt rechts vor links. ' }),
      h('button', { class: 'btn small', onclick: () => { g.city.fixOutage(out); this.renderInspector(); } }, 'Notstrom (' + fmtMoney(CFG.powerFixCost) + ')')));
    // Statistik je Zufahrt
    const q = g.traffic.queueAt(J);
    const tbl = h('table', { class: 'arms' }, h('thead', {}, h('tr', {}, h('th', { text: 'Zufahrt' }), h('th', { text: 'Wartend' }), h('th', { text: 'Ø Wartezeit' }))));
    const tb = h('tbody');
    for (let s = 0; s < 4; s++) {
      const hd = OPP[s];
      if (!((J.inMask >> hd) & 1)) continue;
      const wt = J.waitEma[hd];
      tb.append(h('tr', {}, h('td', { text: 'von ' + ARM_DE[s] }), h('td', { class: 'num', text: String(q[hd]) }),
        h('td', { class: 'num ' + (wt > 10 ? 'bad' : wt > 5 ? 'warn' : ''), text: fmtDec(wt * CFG.minPerSec, 1) + ' Min' })));
    }
    tbl.append(tb);
    body.push(h('div', { class: 'sec' }, h('div', { class: 'sec-h', text: 'Verkehr an dieser Kreuzung' }), this.kv('Durchfahrten', Math.round(J.flowHr) + ' pro Stunde'), tbl,
      J.accidents ? this.kv('Unfälle bisher', String(J.accidents), 'bad') : null));
    // Typ-spezifisch
    if (J.type === 'auto') body.push(h('p', { class: 'muted', text: 'Ohne Schilder gilt rechts vor links: Wer von rechts kommt, fährt zuerst. Linksabbieger lassen den Gegenverkehr durch. Sicher bei wenig Verkehr, bei Stau schnell überfordert.' }));
    if (J.type === 'priority') body.push(this.priorityEditor(J));
    if (J.type === 'roundabout') body.push(h('p', { class: 'muted', text: 'Im Kreisverkehr hat Vorfahrt, wer schon im Kreis fährt. Einfahrende warten auf eine Lücke. Wenig Unfälle, geringer Unterhalt.' }));
    if (J.type === 'light') body.push(this.lightEditor(J));
    return this.panel('Kreuzung', JTYPE_NAME[J.type] + (J.type === 'light' && J.light && J.light.smart ? ' · adaptiv' : ''), null, ...body);
  }

  armsDiagram(J, size, draw) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.classList.add('jdia');
    const add = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.append(e); return e; };
    add('rect', { x: 32, y: 32, width: 36, height: 36, fill: '#6b7078' });
    for (let s = 0; s < 4; s++) {
      if (!((J.arms >> s) & 1)) continue;
      const r = [[32, 0, 36, 34], [66, 32, 34, 36], [32, 66, 36, 34], [0, 32, 34, 36]][s];
      add('rect', { x: r[0], y: r[1], width: r[2], height: r[3], fill: '#6b7078' });
    }
    if (draw) draw(add, svg);
    return svg;
  }

  priorityEditor(J) {
    const g = this.game;
    const dia = this.armsDiagram(J, 92, add => {
      for (let s = 0; s < 4; s++) {
        if (!((J.mainArms >> s) & 1)) continue;
        const r = [[46, 0, 8, 50], [50, 46, 50, 8], [46, 50, 8, 50], [0, 46, 50, 8]][s];
        add('rect', { x: r[0], y: r[1], width: r[2], height: r[3], fill: '#f2c200' });
      }
    });
    return h('div', { class: 'sec' }, h('div', { class: 'sec-h', text: 'Hauptstraße' }),
      h('div', { class: 'row' }, dia, h('div', {},
        h('p', { class: 'muted', text: 'Gelb markierte Arme haben Vorfahrt. Alle anderen müssen warten.' }),
        h('button', { class: 'btn small', onclick: () => { J.cycleMain(); g.world.markDirty(J.i); g.onWorldEdit([J.i]); this.renderInspector(); AUDIO.play('click'); } }, 'Hauptrichtung wechseln'))));
  }

  phaseDiagram(J, ph, k, editable) {
    const ns = 'http://www.w3.org/2000/svg';
    const g = this.game;
    return this.armsDiagram(J, 84, (add, svg) => {
      for (let hd = 0; hd < 4; hd++) {
        if (!((J.inMask >> hd) & 1)) continue;
        const grp = document.createElementNS(ns, 'g');
        grp.setAttribute('transform', `rotate(${hd * 90} 50 50)`);
        svg.append(grp);
        const arrows = [
          [TT_STRAIGHT, 'M58 96 L58 66', 'M53 70 L58 62 L63 70'],
          [TT_RIGHT, 'M58 96 L58 84 Q58 76 66 76 L80 76', 'M76 71 L84 76 L76 81'],
          [TT_LEFT, 'M58 96 L58 82 Q58 66 44 66 L24 66', 'M28 61 L20 66 L28 71'],
        ];
        for (const [tt, d, head] of arrows) {
          // existiert der Ausgang?
          const ex = (hd + tt) & 3;
          if (!((J.arms >> ex) & 1)) continue;
          const on = (ph.allow[hd] >> tt) & 1;
          const col = on ? '#16a34a' : '#cbd5e1';
          const p = document.createElementNS(ns, 'path');
          p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', col); p.setAttribute('stroke-width', on ? 5 : 3.5); p.setAttribute('stroke-linecap', 'round');
          const hp = document.createElementNS(ns, 'path');
          hp.setAttribute('d', head); hp.setAttribute('fill', 'none'); hp.setAttribute('stroke', col); hp.setAttribute('stroke-width', on ? 5 : 3.5); hp.setAttribute('stroke-linecap', 'round'); hp.setAttribute('stroke-linejoin', 'round');
          grp.append(p, hp);
          if (editable) {
            const hit = document.createElementNS(ns, 'path');
            hit.setAttribute('d', d); hit.setAttribute('fill', 'none'); hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', 14);
            hit.style.cursor = 'pointer';
            const title = document.createElementNS(ns, 'title');
            title.textContent = 'Von ' + ARM_DE[OPP[hd]] + ' ' + TT_NAME[tt] + ': ' + (on ? 'grün' : 'rot') + ' (klicken zum Umschalten)';
            hit.append(title);
            hit.addEventListener('click', () => {
              ph.allow[hd] ^= (1 << tt);
              if (tt === TT_LEFT) ph.allow[hd] = (ph.allow[hd] & ~(1 << TT_UTURN)) | (((ph.allow[hd] >> TT_LEFT) & 1) << TT_UTURN);
              AUDIO.play('click');
              this.renderInspector();
            });
            grp.append(hit);
          }
        }
      }
    });
  }

  lightEditor(J) {
    const g = this.game, L = J.light;
    const box = h('div', { class: 'sec light-ed' });
    box.append(h('div', { class: 'sec-h', text: 'Ampelprogramm' }));
    // Modus
    const smartCost = L.paid ? 0 : CFG.cost.smart;
    const allowedSmart = true;
    const mode = h('div', { class: 'seg small' },
      h('button', { class: 'seg-b' + (!L.smart ? ' on' : ''), onclick: () => { L.smart = false; this.renderInspector(); } }, 'Festzeit'),
      allowedSmart ? h('button', { class: 'seg-b' + (L.smart ? ' on' : ''), onclick: () => {
        if (L.smart) return;
        if (!L.paid) { if (!g.spend(CFG.cost.smart, 'Adaptive Ampel')) return; L.paid = true; }
        L.smart = true; L.t = 0; L.stage = 0; this.renderInspector(); AUDIO.play('build');
      } }, h('span', { text: 'Adaptiv' }), smartCost ? h('small', { text: fmtMoney(smartCost) }) : null) : null);
    box.append(mode);
    box.append(h('p', { class: 'muted small', text: L.smart ? 'Adaptiv: Sensoren verlängern Grün, solange Autos kommen, und überspringen leere Phasen. Die Grünzeit gilt als Richtwert.' : 'Festzeit: Phasen laufen im festen Takt. Mit dem Versatz stimmst du benachbarte Ampeln zu einer Grünen Welle ab.' }));
    // Vorlagen
    box.append(h('div', { class: 'presets' }, h('span', { class: 'muted small', text: 'Vorlage:' }),
      [['axis', '2 Phasen'], ['left', 'Mit Linksabbiegern'], ['each', 'Rundum']].map(([p, n]) => h('button', { class: 'btn tiny ghost', onclick: () => { L.phases = J.presetPhases(p); L.idx = 0; L.t = 0; this.renderInspector(); AUDIO.play('click'); } }, n))));
    // Phasen
    const list = h('div', { class: 'phases' });
    L.phases.forEach((ph, k) => {
      const active = L.idx === k;
      const prog = active ? (L.stage === 0 ? (L.smart ? 'grün' : 'grün · noch ' + Math.ceil(L.rem) + ' s') : L.stage === 1 ? 'gelb' : 'rot (Räumzeit)') : '';
      const slider = h('input', { type: 'range', id: 'ph-g-' + k, min: 4, max: 60, step: 1, value: ph.g, 'aria-label': 'Grünzeit Phase ' + (k + 1), oninput: e => { ph.g = +e.target.value; val.textContent = ph.g + ' s'; } });
      const val = h('b', { class: 'mono', text: ph.g + ' s' });
      list.append(h('div', { class: 'phase' + (active ? ' active s' + L.stage : '') },
        this.phaseDiagram(J, ph, k, true),
        h('div', { class: 'ph-side' },
          h('div', { class: 'ph-top' }, h('b', { text: 'Phase ' + (k + 1) }), active ? h('span', { class: 'ph-now', text: prog }) : null),
          h('label', { class: 'ph-g' }, h('span', { text: 'Grün' }), slider, val),
          h('div', { class: 'ph-btns' },
            h('button', { class: 'ib', title: 'Nach oben', disabled: k === 0 ? true : null, onclick: () => { L.phases.splice(k - 1, 0, L.phases.splice(k, 1)[0]); this.renderInspector(); } }, icon('up')),
            h('button', { class: 'ib', title: 'Nach unten', disabled: k === L.phases.length - 1 ? true : null, onclick: () => { L.phases.splice(k + 1, 0, L.phases.splice(k, 1)[0]); this.renderInspector(); } }, icon('down')),
            h('button', { class: 'ib', title: 'Phase löschen', disabled: L.phases.length <= 1 ? true : null, onclick: () => { L.phases.splice(k, 1); L.idx = 0; this.renderInspector(); } }, icon('trash'))))));
    });
    box.append(list);
    box.append(h('button', { class: 'btn small ghost', disabled: L.phases.length >= 6 ? true : null, onclick: () => { L.phases.push({ g: 10, allow: [0, 0, 0, 0] }); this.renderInspector(); } }, icon('plus'), ' Phase hinzufügen'));
    box.append(h('p', { class: 'muted small', text: 'Tipp: Klicke auf die Pfeile, um Fahrtrichtungen grün oder rot zu schalten.' }));
    if (!L.smart) {
      const cyc = J.cycleLen();
      const off = h('input', { type: 'range', id: 'ph-off', min: 0, max: Math.round(cyc), step: 1, value: Math.round(L.offset % cyc), 'aria-label': 'Versatz', oninput: e => { L.offset = +e.target.value; offv.textContent = L.offset + ' s'; } });
      const offv = h('b', { class: 'mono', text: Math.round(L.offset % cyc) + ' s' });
      box.append(h('div', { class: 'kv' }, h('span', { text: 'Umlaufzeit' }), h('b', { class: 'mono', text: Math.round(cyc) + ' s' })));
      box.append(h('label', { class: 'ph-g wide' }, h('span', { text: 'Versatz' }), off, offv));
    }
    return box;
  }

  buildingPanel(b) {
    const g = this.game, w = g.world;
    if (b.dead) return null;
    const bt = BT[b.type];
    const body = [];
    if (b.cat === 'gate') {
      body.push(h('p', { class: 'muted', text: 'Hier fahren Autos in die Stadt hinein und wieder hinaus: Durchgangsverkehr und Pendler aus dem Umland.' }));
    }
    if (bt.pop) body.push(this.kv('Einwohner', String(bt.pop)));
    if (bt.jobs) body.push(this.kv('Arbeitsplätze', String(bt.jobs)));
    if (b.cat !== 'res' && b.cat !== 'gate') body.push(this.kv('Gerade anwesend', String(b.present)));
    body.push(this.kv('Abfahrten', fmtInt(b.sent)), this.kv('Ankünfte', fmtInt(b.recv)));
    if (b.rateN) { const r = b.rateSum / b.rateN; body.push(this.kv('Ø Bewertung der Fahrten', Math.round(r) + ' / 100', r >= 65 ? 'ok' : r >= 40 ? 'warn' : 'bad')); }
    if (b.queue.length) body.push(this.kv('Warten auf Ausfahrt', String(b.queue.length), b.queue.length > 5 ? 'bad' : 'warn'));
    if (!w.road[b.acc]) body.push(h('div', { class: 'banner ' + (b.unconnected > (g.level.grace || 80) ? 'bad' : 'warn') }, h('b', { text: 'Nicht angeschlossen. ' }), h('span', { text: 'Baue eine Straße auf das markierte Feld vor der Einfahrt.' })));
    else if (b.noRoute > 0) body.push(h('div', { class: 'banner bad' }, h('b', { text: 'Keine Route. ' }), h('span', { text: 'Ziele sind von hier nicht erreichbar – prüfe Einbahnstraßen und Lücken im Netz.' })));
    if (b.fire) body.push(h('div', { class: 'banner bad' }, h('b', { text: 'Es brennt! ' }), h('span', { text: 'Die Feuerwehr ist alarmiert.' })));
    const sub = b.name || (b.cat === 'res' ? 'Wohngebäude' : b.cat === 'gate' ? 'Stadtgrenze' : '');
    if (g.sandbox) body.push(h('button', { class: 'btn small ghost', onclick: () => { w.removeBuilding(b); g.buildVersion++; g.onWorldEdit([b.acc]); this.select(null); } }, 'Gebäude abreißen'));
    return this.panel(bt.name, sub, null, ...body);
  }

  vehiclePanel(id) {
    const g = this.game;
    const v = g.traffic.byId.get(id);
    if (!v) return null;
    const body = [];
    const kmh = Math.round(v.v / CFG.roadSpeed[1] * 50);
    body.push(this.kv('Tempo', kmh + ' km/h'));
    if (v.bus) {
      const line = g.city.lines.find(l => l.id === v.bus.line);
      body.push(this.kv('Linie', line ? line.name : '–'), this.kv('Fahrgäste', v.pax + ' / 40'));
      const st = g.city.stops.get(v.bus.stopTile);
      body.push(this.kv('Nächster Halt', st ? st.name : '–'));
    } else {
      body.push(this.kv('Zweck', PURPOSE_DE[v.purpose] || v.purpose || '–'));
      if (v.from) body.push(this.kv('Von', BT[v.from.type].name + (v.from.name ? ' (' + v.from.name + ')' : '')));
      if (v.to) body.push(this.kv('Nach', BT[v.to.type].name + (v.to.name ? ' (' + v.to.name + ')' : '')));
      const dur = (g.time - v.t0) * CFG.minPerSec;
      const ideal = v.ideal * CFG.minPerSec;
      body.push(this.kv('Unterwegs seit', fmtDuration(dur), dur > ideal * 2 ? 'bad' : dur > ideal * 1.4 ? 'warn' : 'ok'));
      body.push(this.kv('Erwartet', 'ca. ' + fmtDuration(ideal)));
    }
    if (v.stuck > 5) body.push(this.kv('Steht seit', fmtDuration(v.stuck * CFG.minPerSec), 'bad'));
    const follow = this.app.follow === id;
    body.push(h('button', { class: 'btn small' + (follow ? '' : ' ghost'), onclick: () => { this.app.follow = follow ? null : id; this.renderInspector(); } }, icon('eye'), follow ? ' Verfolgen beenden' : ' Kamera folgt'));
    return this.panel(VT[v.type].name, v.emergency ? 'Einsatz mit Blaulicht' : '', null, ...body);
  }

  linePanel(line) {
    const g = this.game, city = g.city;
    if (!city.lines.includes(line)) return null;
    const pending = city.pendingBuses.filter(p => p.line === line.id).length;
    let waiting = 0;
    for (const t of line.stops) { const s = city.stops.get(t); if (s) waiting += s.waiting.filter(p => p.line === line.id).length; }
    const body = [
      h('div', { class: 'row gap' }, h('span', { class: 'muted', text: 'Busse' }),
        h('button', { class: 'ib', title: 'Bus verkaufen', onclick: () => { city.removeBus(line); this.renderInspector(); } }, icon('minus')),
        h('b', { class: 'big mono', text: String(line.buses.size + pending) }),
        h('button', { class: 'ib', title: 'Bus kaufen (' + fmtMoney(CFG.cost.bus) + ')', onclick: () => { if (city.addBus(line)) AUDIO.play('cash'); this.renderInspector(); } }, icon('plus')),
        h('small', { class: 'muted', text: fmtMoney(CFG.cost.bus) + ' je Bus' })),
      this.kv('Fahrgäste heute', fmtInt(line.paxDay)),
      this.kv('Fahrgäste gesamt', fmtInt(line.pax)),
      this.kv('Wartende an den Haltestellen', fmtInt(waiting)),
      h('div', { class: 'sec' }, h('div', { class: 'sec-h', text: 'Haltestellen' }),
        h('ol', { class: 'stops' }, line.stops.map(t => h('li', {}, h('button', { class: 'linkish', onclick: () => this.jumpTo(t) }, (city.stops.get(t) || {}).name || '?'))))),
      h('button', { class: 'btn small ghost', onclick: () => this.confirm('Linie löschen?', 'Busse werden zum halben Preis verkauft.', () => { city.deleteLine(line); this.select(null); }) }, icon('trash'), ' Linie löschen'),
    ];
    return this.panel(line.name, line.stops.length + ' Haltestellen', line.color, ...body);
  }

  // ======================================================================
  // Bild pro Frame
  // ======================================================================
  update(dt) {
    const g = this.game;
    if (!g) return;
    this.hudT += dt; this.inspT += dt; this.miniT += dt;
    if (this.hudT > 0.25) { this.hudT = 0; this.updateHUD(); this.updateFeed(); if (g.mode !== 'sandbox') this.renderGoalsLight(); }
    if (this.inspT > 0.5 && !this.insp.hidden && !this.inspHold) { this.inspT = 0; this.renderInspector(); }
    if (this.miniT > 0.1) { this.miniT = 0; this.drawMinimap(); }
    if (this.tutStep >= 0) { this.tutT = (this.tutT || 0) + dt; if (this.tutT > 0.5) { this.tutT = 0; this.tutCheck(); } }
  }

  renderGoalsLight() {
    // Ziele nur neu zeichnen, wenn sich Werte ändern
    const g = this.game;
    const key = g.mode === 'campaign' ? g.goalStatus().map(s => Math.floor(s.type === 'sat' ? s.cur : s.cur)).join('|') : g.dayIndex + ':' + g.demandRamp.toFixed(2);
    if (key !== this._goalKey) { this._goalKey = key; this.renderGoals(); }
  }

  // ======================================================================
  // Minikarte
  // ======================================================================
  bindMinimap() {
    const mv = e => {
      if (!this.game) return;
      const r = this.mini.getBoundingClientRect();
      const w = this.game.world;
      const x = (e.clientX - r.left) / r.width * w.w, y = (e.clientY - r.top) / r.height * w.h;
      this.app.renderer.centerOn(x, y);
    };
    let down = false;
    this.mini.addEventListener('pointerdown', e => { down = true; this.mini.setPointerCapture(e.pointerId); mv(e); });
    this.mini.addEventListener('pointermove', e => { if (down) mv(e); });
    this.mini.addEventListener('pointerup', () => { down = false; });
  }

  drawMinimap() {
    const g = this.game;
    if (!g || this.miniWrap.hidden) return;
    const w = g.world, cv = this.mini;
    const sc = Math.max(1, Math.floor(Math.min(200 / w.w, 140 / w.h)));
    if (cv.width !== w.w * sc || cv.height !== w.h * sc) { cv.width = w.w * sc; cv.height = w.h * sc; this.miniDirty = true; }
    const ctx = cv.getContext('2d');
    if (this.miniDirty || !this.miniBase || this.miniVer !== w.version) {
      this.miniDirty = false; this.miniVer = w.version;
      const img = ctx.createImageData(w.w, w.h);
      const col = { [T_GRASS]: [196, 216, 150], [T_WATER]: [120, 186, 216], [T_FOREST]: [120, 165, 100], [T_ROCK]: [180, 170, 152], [T_SAND]: [235, 222, 180], [T_FIELD]: [228, 214, 150] };
      for (let i = 0; i < w.n; i++) {
        let c = col[w.terrain[i]];
        if (w.road[i]) c = w.road[i] === 2 ? [60, 64, 72] : [92, 97, 105];
        else if (w.bld[i] >= 0) { const b = w.buildings[w.bld[i]]; c = b.cat === 'res' ? [231, 111, 81] : b.cat === 'gate' ? [242, 194, 0] : b.cat === 'shop' ? [224, 122, 95] : [74, 111, 165]; }
        img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
      }
      const tmp = this.miniTmp || (this.miniTmp = document.createElement('canvas'));
      tmp.width = w.w; tmp.height = w.h;
      tmp.getContext('2d').putImageData(img, 0, 0);
      this.miniBase = tmp;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.miniBase, 0, 0, cv.width, cv.height);
    // Unfälle
    for (const a of g.city.accidents) { ctx.fillStyle = '#dc2626'; ctx.fillRect(w.tx(a.tile) * sc - 2, w.ty(a.tile) * sc - 2, sc + 4, sc + 4); }
    // Sichtfenster
    const r = this.app.renderer;
    const tl = r.toWorld(0, 0), br = r.toWorld(r.W, r.H);
    ctx.strokeStyle = '#0b4f9c'; ctx.lineWidth = 2;
    ctx.strokeRect(tl.x * sc, tl.y * sc, (br.x - tl.x) * sc, (br.y - tl.y) * sc);
  }

  // ======================================================================
  // Modale Fenster
  // ======================================================================
  modal(opts) {
    const wrap = h('div', { class: 'modal-wrap' + (opts.cls ? ' ' + opts.cls : '') });
    const card = h('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Dialog' });
    if (opts.head !== false) {
      card.append(h('div', { class: 'modal-head' + (opts.headCls ? ' ' + opts.headCls : '') }, h('h2', { text: opts.title || '' }),
        opts.closable !== false ? h('button', { class: 'xbtn', 'aria-label': 'Schließen', onclick: () => close() }, icon('close')) : null));
    }
    const body = h('div', { class: 'modal-body' });
    if (opts.body) body.append(opts.body);
    card.append(body);
    if (opts.buttons && opts.buttons.length) {
      const foot = h('div', { class: 'modal-foot' });
      for (const b of opts.buttons) foot.append(h('button', { class: 'btn' + (b.primary ? '' : ' ghost') + (b.danger ? ' danger' : ''), onclick: () => { if (b.onClick && b.onClick() === false) return; if (!b.keep) close(); } }, b.label));
      card.append(foot);
    }
    wrap.append(card);
    this.modalRoot.append(wrap);
    const close = () => { wrap.remove(); if (opts.onClose) opts.onClose(); };
    wrap.addEventListener('pointerdown', e => { if (e.target === wrap && opts.closable !== false) close(); });
    wrap._close = close;
    const first = card.querySelector('.modal-foot .btn:not(.ghost)') || card.querySelector('button');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
    return { close, body, card };
  }
  closeModals() { for (const m of [...this.modalRoot.children]) { if (m._close) m._close(); else m.remove(); } }
  hasModal() { return this.modalRoot.children.length > 0; }
  topModalClose() { const m = this.modalRoot.lastElementChild; if (m && m._close) { m._close(); return true; } return false; }

  confirm(title, text, onYes, yesLabel) {
    this.modal({ title, body: h('p', { text }), buttons: [{ label: 'Abbrechen' }, { label: yesLabel || 'Ja', primary: true, onClick: onYes }] });
  }

  // ---- Pause ---------------------------------------------------------------------------
  showPause() {
    const g = this.game;
    if (!g) return;
    const wasPaused = g.paused;
    g.paused = true;
    const item = (ic, label, fn) => h('button', { class: 'menu-row', onclick: fn }, icon(ic, 'mrow-ic'), h('span', { text: label }), icon('arrow', 'mrow-arrow'));
    const body = h('div', { class: 'menu-list' },
      item('play', 'Weiterspielen', () => m.close()),
      g.mode !== 'demo' ? item('save', 'Spiel speichern', () => { m.close(); this.showSaveDialog(); }) : null,
      item('stats', 'Statistik', () => { m.close(); this.showStats(); }),
      item('help', 'Anleitung', () => { m.close(); this.showHelp(); }),
      item('grid', 'Einstellungen', () => { m.close(); this.showSettings(); }),
      g.mode === 'campaign' ? item('undo', 'Level neu starten', () => { m.close(); this.confirm('Level neu starten?', 'Der aktuelle Fortschritt geht verloren.', () => this.app.startLevel(g.level)); }) : null,
      item('flag', 'Zum Hauptmenü', () => { m.close(); this.confirm('Zum Hauptmenü?', 'Nicht gespeicherter Fortschritt geht verloren. Ein automatischer Spielstand wird alle drei Spielstunden angelegt.', () => this.app.toMenu(), 'Zum Menü'); }));
    const m = this.modal({ title: 'Pause', body, onClose: () => { if (this.game === g && !g.over) g.paused = wasPaused; this.updateHUD(); } });
  }

  // ---- Speichern / Laden --------------------------------------------------------------
  slotInfo(key) {
    const o = Store.get(key);
    if (!o) return null;
    const lv = o.level || LEVELS.find(l => l.id === o.levelId);
    const min = o.startMin + o.time * CFG.minPerSec;
    return { name: lv ? lv.name : '?', sub: lv ? lv.sub : '', day: Math.floor(min / 1440) + 1, clock: fmtClock(min), savedAt: o.savedAt, trips: o.stats ? o.stats.trips : 0 };
  }

  showSaveDialog() {
    const g = this.game;
    const list = h('div', { class: 'slots' });
    const m = this.modal({ title: 'Spiel speichern', body: list });
    const render = () => {
      list.innerHTML = '';
      for (const k of [1, 2, 3]) {
        const key = 'vm_save_' + k;
        const inf = this.slotInfo(key);
        list.append(h('button', { class: 'slot', onclick: () => {
          const ok = Store.set(key, g.serialize());
          if (ok) { this.toast('Gespeichert', 'Spielstand ' + k + ' wurde gesichert.'); m.close(); }
          else this.toast('Fehler', 'Speichern nicht möglich (Browser-Speicher nicht verfügbar).', 'bad');
        } }, h('b', { text: 'Platz ' + k }), h('span', { text: inf ? inf.name + ' · Tag ' + inf.day + ' ' + inf.clock + ' · ' + new Date(inf.savedAt).toLocaleString('de-DE') : 'leer' })));
      }
    };
    render();
  }

  // ---- Einstellungen -------------------------------------------------------------------
  showSettings(back) {
    const s = this.settings;
    const body = h('div', { class: 'settings' },
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'set-sound', checked: s.sound ? true : null, onchange: e => { s.sound = e.target.checked; AUDIO.setEnabled(s.sound); this.saveSettings(); if (this.hudEl) this.hudEl.soundBtn.innerHTML = ICON[s.sound ? 'sound' : 'mute']; } }), ' Ton'),
      h('label', { class: 'rng' }, 'Lautstärke', h('input', { type: 'range', id: 'set-vol', min: 0, max: 1, step: 0.05, value: s.volume, oninput: e => { s.volume = +e.target.value; AUDIO.setVolume(s.volume); this.saveSettings(); } })),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'set-grid', checked: s.grid ? true : null, onchange: e => { s.grid = e.target.checked; this.app.renderer.showGrid = s.grid; this.saveSettings(); } }), ' Raster anzeigen'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'set-auto', checked: s.autosave ? true : null, onchange: e => { s.autosave = e.target.checked; this.saveSettings(); } }), ' Automatisch speichern (alle 3 Spielstunden)'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'set-pause', checked: s.pauseOnDanger ? true : null, onchange: e => { s.pauseOnDanger = e.target.checked; this.saveSettings(); } }), ' Bei Unfällen und Bränden automatisch pausieren'),
      h('button', { class: 'btn small danger ghost', onclick: () => this.confirm('Fortschritt zurücksetzen?', 'Sterne, Erfolge und alle Spielstände werden gelöscht.', () => {
        for (const k of ['vm_progress', 'vm_ach', 'vm_save_1', 'vm_save_2', 'vm_save_3', 'vm_save_auto']) Store.del(k);
        if (this.game) this.game.achieved = new Set();
        this.toast('Zurückgesetzt', 'Der Spielfortschritt wurde gelöscht.');
      }, 'Löschen') }, 'Fortschritt zurücksetzen'));
    this.modal({ title: 'Einstellungen', body, buttons: [{ label: 'Fertig', primary: true, onClick: back }] });
  }

  // ---- Anleitung -------------------------------------------------------------------------
  showHelp() {
    const sec = (t, ...p) => h('section', {}, h('h3', { text: t }), ...p.map(x => typeof x === 'string' ? h('p', { text: x }) : x));
    const keys = [['Linke Maustaste', 'Bauen / Auswählen'], ['Rechte oder mittlere Maustaste ziehen', 'Karte verschieben'], ['Mausrad', 'Zoomen'], ['W A S D / Pfeiltasten', 'Karte verschieben'], ['Leertaste', 'Pause'], ['1 2 3', 'Spieltempo'], ['Strg + Z', 'Rückgängig'], ['H', 'Verkehrsdichte'], ['S', 'Statistik'], ['Q R E T X L V K B N', 'Werkzeuge'], ['Esc', 'Abbrechen / Menü']];
    const body = h('div', { class: 'help' },
      sec('Deine Aufgabe', 'Die Stadt wächst. Wohnhäuser, Büros, Geschäfte und Fabriken wollen verbunden werden. Du planst das Straßennetz und regelst die Kreuzungen so, dass alle schnell ans Ziel kommen. Gute Fahrten machen die Bürger zufrieden und bringen Geld in die Kasse. Sinkt die Zufriedenheit zu lange unter die kritische Marke, wirst du abgewählt.'),
      sec('Straßen bauen', 'Ziehe mit gedrückter Maustaste von Feld zu Feld. Nur Felder, die du nacheinander ziehst, werden verbunden – parallele Straßen bleiben getrennt. Über Wasser entstehen Brücken, durch Felsen Tunnel. Jedes Gebäude hat eine Einfahrt: Das Feld davor (gestrichelt markiert) muss eine Straße bekommen.',
        'Einbahnstraßen haben nur eine Spur in Zugrichtung. Schnellstraßen sind fast doppelt so schnell, Gebäude können dort aber schlecht anschließen. Ziehe ein Werkzeug über bestehende Straßen, um sie umzubauen.'),
      sec('Kreuzungen', h('ul', {},
        h('li', {}, h('b', { text: 'Rechts vor links' }), ' – Standard. Wer von rechts kommt, hat Vorrang; Linksabbieger warten auf den Gegenverkehr. Bei viel Verkehr staut es und kracht öfter.'),
        h('li', {}, h('b', { text: 'Vorfahrtsstraße' }), ' – Eine Achse fährt durch, Nebenstraßen warten. Ideal für eine Hauptstraße mit wenig Querverkehr.'),
        h('li', {}, h('b', { text: 'Ampel' }), ' – Regelt Phasen. Im Info-Fenster stellst du Grünzeiten, eigene Linksabbiegerphasen und den Versatz für eine Grüne Welle ein. Die adaptive Ampel reagiert auf den Verkehr.'),
        h('li', {}, h('b', { text: 'Kreisverkehr' }), ' – Wer im Kreis fährt, hat Vorfahrt. Flüssig und sicher bei mittlerem Verkehr.'))),
      sec('Busse', 'Setze Haltestellen auf gerade Straßenstücke. Mit dem Buslinien-Werkzeug klickst du Haltestellen der Reihe nach an. Häuser und Ziele im Umkreis von vier Feldern nutzen die Linie. Mehr Busse bedeuten kürzere Wartezeiten und mehr Fahrgäste.'),
      sec('Ereignisse', 'Unfälle sperren Kreuzungen, bis ein Rettungswagen da war oder du abschleppen lässt. Baustellen bremsen den Verkehr. Bei Stromausfall fallen Ampeln aus. Brände brauchen die Feuerwehr – halte ihr den Weg frei. Am Spieltag strömen Fans zum Stadion. Regen, Nebel und Schnee machen alle langsamer.'),
      sec('Geld', 'Jede erfolgreiche Fahrt bringt Steuereinnahmen, Busfahrgäste zahlen Fahrgeld. Um Mitternacht kommen Steuern hinzu – je zufriedener die Stadt, desto mehr – und der Unterhalt für Straßen, Ampeln und Busse wird abgezogen.'),
      sec('Tipps', h('ul', {},
        h('li', { text: 'Schalte mit H die Verkehrsdichte ein: Rot heißt Stau, Kreise zeigen lange Wartezeiten an Kreuzungen.' }),
        h('li', { text: 'Klicke ein Auto an, um seine Route zu sehen.' }),
        h('li', { text: 'Direkt benachbarte Kreuzungen behindern sich gegenseitig. Lass Platz zwischen Kreuzungen.' }),
        h('li', { text: 'Einbahnstraßen-Paare entlasten Kreuzungen enorm – aber Achtung vor Sackgassen ohne Ausweg.' }),
        h('li', { text: 'Wird es eng, pausiere und plane in Ruhe.' }))),
      sec('Steuerung', h('table', { class: 'keys' }, h('tbody', {}, keys.map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', { text: k })), h('td', { text: v })))))));
    this.modal({ title: 'Anleitung', body, wide: true, buttons: [{ label: 'Verstanden', primary: true }] });
  }

  // ---- Statistik --------------------------------------------------------------------------
  showStats() {
    const g = this.game;
    if (!g) return;
    const tabs = [['verlauf', 'Verlauf'], ['kreuzungen', 'Kreuzungen'], ['finanzen', 'Finanzen'], ['meldungen', 'Meldungen']];
    const tabBar = h('div', { class: 'tabs', role: 'tablist' });
    const content = h('div', { class: 'tab-content' });
    const show = id => {
      for (const b of tabBar.children) b.classList.toggle('on', b.dataset.id === id);
      content.innerHTML = '';
      if (id === 'verlauf') content.append(this.statsHistory());
      else if (id === 'kreuzungen') content.append(this.statsJunctions(m));
      else if (id === 'finanzen') content.append(this.statsFinance());
      else content.append(this.statsNotes(m));
    };
    for (const [id, n] of tabs) { const b = h('button', { class: 'tab', role: 'tab', text: n, onclick: () => show(id) }); b.dataset.id = id; tabBar.append(b); }
    const s = g.stats;
    const avgR = s.trips ? s.ratingSum / s.trips : 0;
    const avgDur = s.trips ? s.durSum / s.trips * CFG.minPerSec : 0;
    const kpis = h('div', { class: 'kpis' },
      this.kpi('Fahrten', fmtInt(s.trips)), this.kpi('Ø Bewertung', Math.round(avgR) + ' / 100'), this.kpi('Ø Fahrzeit', fmtDec(avgDur, 1) + ' Min'),
      this.kpi('Abgebrochen', fmtInt(s.failed + g.traffic.stats.gaveUp)), this.kpi('Unfälle', fmtInt(s.accidents)), this.kpi('Busfahrgäste', fmtInt(s.busPax)));
    const body = h('div', {}, kpis, tabBar, content);
    const m = this.modal({ title: 'Statistik', body, wide: true });
    show('verlauf');
  }

  kpi(k, v) { return h('div', { class: 'kpi' }, h('span', { text: k }), h('b', { text: v })); }

  statsHistory() {
    const g = this.game;
    const H = g.history.slice(-48);
    const wrap = h('div', { class: 'charts' });
    if (H.length < 2) { wrap.append(h('p', { class: 'muted', text: 'Noch zu wenig Daten – die Verlaufskurven füllen sich mit jeder Spielstunde.' })); return wrap; }
    const lab = x => WEEKDAYS_SHORT[Math.floor(x.h / 24) % 7] + ' ' + pad2(x.h % 24) + ':00';
    const mk = (title, key, fmt, opts = {}) => {
      const cv = h('canvas', { class: 'chart', width: 460, height: 170, role: 'img', 'aria-label': title });
      const box = h('figure', { class: 'chart-box' }, h('figcaption', { text: title }), cv);
      wrap.append(box);
      requestAnimationFrame(() => lineChart(cv, H.map(x => x[key]), H.map(lab), fmt, opts));
    };
    mk('Fahrten pro Stunde', 'trips', v => fmtInt(v), { bars: true, min0: true });
    mk('Zufriedenheit', 'sat', v => Math.round(v) + ' %', { min: 0, max: 100 });
    mk('Ø Fahrzeit', 'dur', v => fmtDec(v, 1) + ' Min', { min0: true, axis: v => Math.round(v) + ' Min' });
    mk('Fahrzeuge unterwegs', 'veh', v => fmtInt(v), { min0: true });
    if (!g.sandbox) mk('Stadtkasse', 'money', v => fmtMoney(v), { axis: v => fmtMoneyShort(v) });
    return wrap;
  }

  statsJunctions(m) {
    const g = this.game, w = g.world;
    const js = [...(w.junctions || [])].map(J => ({ J, wait: Math.max(...J.waitEma), flow: J.flowHr }));
    js.sort((a, b) => b.wait - a.wait);
    if (!js.length) return h('p', { class: 'muted', text: 'Noch keine Kreuzungen gebaut.' });
    const tbl = h('table', { class: 'data' }, h('thead', {}, h('tr', {}, h('th', { text: 'Kreuzung' }), h('th', { text: 'Regelung' }), h('th', { class: 'num', text: 'Durchfahrten/Std' }), h('th', { class: 'num', text: 'Längste Ø Wartezeit' }), h('th', { class: 'num', text: 'Unfälle' }), h('th', {}))));
    const tb = h('tbody');
    for (const r of js.slice(0, 12)) {
      tb.append(h('tr', {}, h('td', { class: 'mono', text: w.tx(r.J.i) + ' / ' + w.ty(r.J.i) }), h('td', { text: JTYPE_NAME[r.J.type] }), h('td', { class: 'num', text: Math.round(r.flow) + '' }),
        h('td', { class: 'num ' + (r.wait > 10 ? 'bad' : r.wait > 5 ? 'warn' : ''), text: fmtDec(r.wait * CFG.minPerSec, 1) + ' Min' }), h('td', { class: 'num', text: r.J.accidents + '' }),
        h('td', {}, h('button', { class: 'btn tiny ghost', onclick: () => { m.close(); this.setTool('inspect'); this.jumpTo(r.J.i); } }, 'Zeigen'))));
    }
    tbl.append(tb);
    return h('div', {}, h('p', { class: 'muted', text: 'Die Kreuzungen mit den längsten Wartezeiten zuerst.' }), h('div', { class: 'tbl-wrap' }, tbl));
  }

  statsFinance() {
    const g = this.game;
    const c = g.world.countRoads();
    let lights = 0, smart = 0, round = 0, prio = 0, buses = 0;
    for (const J of g.world.junctions || []) { if (J.type === 'light') { if (J.light && J.light.smart) smart++; else lights++; } if (J.type === 'roundabout') round++; if (J.type === 'priority') prio++; }
    for (const l of g.city.lines) buses += l.buses.size;
    const U = CFG.upkeep;
    const rows = [['Stadtstraßen', c.road, U.road], ['Schnellstraßen', c.hw, U.highway], ['Brückenfelder', c.bridge, U.bridge], ['Tunnelfelder', c.tunnel, U.tunnel], ['Ampeln', lights, U.light], ['Adaptive Ampeln', smart, U.smart], ['Kreisverkehre', round, U.roundabout], ['Vorfahrtsregelungen', prio, U.priority], ['Haltestellen', c.stops, U.stop], ['Busse', buses, U.bus]].filter(r => r[1]);
    const up = h('table', { class: 'data' }, h('thead', {}, h('tr', {}, h('th', { text: 'Unterhalt pro Tag' }), h('th', { class: 'num', text: 'Anzahl' }), h('th', { class: 'num', text: 'je Stück' }), h('th', { class: 'num', text: 'Summe' }))),
      h('tbody', {}, rows.map(r => h('tr', {}, h('td', { text: r[0] }), h('td', { class: 'num', text: fmtInt(r[1]) }), h('td', { class: 'num', text: fmtMoney(r[2]) }), h('td', { class: 'num', text: fmtMoney(r[1] * r[2]) })))),
      h('tfoot', {}, h('tr', {}, h('td', { text: 'Gesamt' }), h('td'), h('td'), h('td', { class: 'num', text: fmtMoney(g.upkeep()) }))));
    const days = h('table', { class: 'data' }, h('thead', {}, h('tr', {}, h('th', { text: 'Tag' }), h('th', { class: 'num', text: 'Fahrten' }), h('th', { class: 'num', text: 'Ø Bewertung' }), h('th', { class: 'num', text: 'Fahrt-Einnahmen' }), h('th', { class: 'num', text: 'Steuern' }), h('th', { class: 'num', text: 'Unterhalt' }), h('th', { class: 'num', text: 'Unfälle' }))),
      h('tbody', {}, g.days.slice(-10).reverse().map(d => h('tr', {}, h('td', { text: WEEKDAYS[d.day % 7] + ' (Tag ' + (d.day + 1) + ')' }), h('td', { class: 'num', text: fmtInt(d.trips) }), h('td', { class: 'num', text: Math.round(d.rating) + '' }), h('td', { class: 'num', text: fmtMoney(d.income) }), h('td', { class: 'num', text: fmtMoney(d.tax) }), h('td', { class: 'num', text: '−' + fmtMoney(d.upkeep) }), h('td', { class: 'num', text: d.accidents + '' })))));
    return h('div', {},
      h('div', { class: 'kpis' }, this.kpi('Erwartete Steuern heute Nacht', fmtMoney(g.taxes())), this.kpi('Unterhalt pro Tag', fmtMoney(g.upkeep())), this.kpi('Einnahmen heute (Fahrten)', fmtMoney(g.statsDay.income))),
      h('div', { class: 'tbl-wrap' }, up), g.days.length ? h('div', { class: 'tbl-wrap' }, days) : h('p', { class: 'muted', text: 'Der erste Tagesabschluss erfolgt um Mitternacht.' }));
  }

  statsNotes(m) {
    const g = this.game;
    const list = h('div', { class: 'notes-all' });
    for (const n of g.notes.slice().reverse()) {
      list.append(h('button', { class: 'note k-' + n.kind, onclick: () => { if (n.tile >= 0) { m.close(); this.jumpTo(n.tile); } } }, h('span', { class: 'note-time mono', text: 'Tag ' + (Math.floor(n.min / 1440) + 1) + ' ' + fmtClock(n.min) }), h('span', { class: 'note-text', text: n.text })));
    }
    if (!g.notes.length) list.append(h('p', { class: 'muted', text: 'Noch keine Meldungen.' }));
    return list;
  }

  // ---- Levelstart, Ende, Erfolge -----------------------------------------------------------
  showIntro(game, onGo) {
    const lv = game.level;
    const goals = game.goalStatus();
    const newTools = (lv.tools || []).map(t => TOOLS.find(x => x.id === t)).filter(Boolean);
    const idx = LEVELS.indexOf(lv);
    const body = h('div', { class: 'intro' },
      h('div', { class: 'ortstafel' }, h('div', { class: 'ot-in' }, h('div', { class: 'ot-name', text: lv.name }), h('div', { class: 'ot-sub', text: 'Level ' + (idx + 1) + ' · ' + lv.sub }))),
      h('p', { class: 'lead', text: lv.intro }),
      goals.length ? h('div', { class: 'sec' }, h('div', { class: 'sec-h', text: 'Ziele' }), h('ul', { class: 'goal-list' }, goals.map(s => h('li', {}, icon('target'), h('span', { text: s.type === 'sat' ? s.label + ' (beim Erreichen der übrigen Ziele)' : s.label + ': ' + s.fmt(s.target) }))))) : null,
      h('div', { class: 'sec' }, h('div', { class: 'sec-h', text: 'Werkzeuge' }), h('div', { class: 'tool-chips' }, newTools.map(t => h('span', { class: 'tchip' }, icon(t.id), t.name)))),
      h('p', { class: 'muted small', text: 'Startkapital ' + fmtMoney(lv.money) + '. Die Simulation startet, sobald du loslegst.' }));
    this.modal({ title: 'Neuer Auftrag', body, closable: false, buttons: [{ label: "Los geht's", primary: true, onClick: onGo }] });
  }

  showEnd(info) {
    const g = this.game;
    const s = g.stats;
    const avgR = s.trips ? Math.round(s.ratingSum / s.trips) : 0;
    let body;
    const kpis = h('div', { class: 'kpis' }, this.kpi('Fahrten', fmtInt(s.trips)), this.kpi('Ø Bewertung', avgR + ' / 100'), this.kpi('Zufriedenheit', Math.round(g.satisfaction) + ' %'), this.kpi('Tage', String(g.dayIndex + 1)), this.kpi('Einwohner', fmtInt(g.population())), this.kpi('Unfälle', fmtInt(s.accidents)));
    const buttons = [];
    if (info.won) {
      const stars = h('div', { class: 'stars big' }, [0, 1, 2].map(k => icon('star', k < info.stars ? 'on' : 'off')));
      const idx = LEVELS.indexOf(g.level);
      const next = LEVELS[idx + 1];
      body = h('div', { class: 'end win' }, h('div', { class: 'sign-blue' }, h('div', { class: 'sb-title', text: 'Auftrag erfüllt' }), h('div', { class: 'sb-sub', text: g.level.name })), stars,
        h('p', { class: 'lead', text: info.stars === 3 ? 'Vorbildlich! Die Stadt fließt.' : info.stars === 2 ? 'Gute Arbeit. Mit noch zufriedeneren Bürgern gibt es drei Sterne (ab 85 %).' : 'Geschafft! Für mehr Sterne braucht es höhere Zufriedenheit (2 Sterne ab 70 %, 3 ab 85 %).' }), kpis);
      buttons.push({ label: 'Weiterspielen', onClick: () => { g.over = false; g.mode = 'endless'; g.level = Object.assign({}, g.level, { goals: [], endless: true }); this.renderGoals(); } });
      if (next) buttons.push({ label: 'Nächstes Level', primary: true, onClick: () => this.app.startLevel(next) });
      else buttons.push({ label: 'Zum Hauptmenü', primary: true, onClick: () => this.app.toMenu() });
    } else {
      const reason = info.reason === 'money' ? 'Die Stadt ist pleite. Der Rat hat dir die Verantwortung entzogen.' : 'Die Bürger haben genug vom Dauerstau – du wurdest abgewählt.';
      body = h('div', { class: 'end lose' }, h('div', { class: 'ortstafel ende' }, h('div', { class: 'ot-in' }, h('div', { class: 'ot-name', text: g.level.name }), h('div', { class: 'ot-sub', text: g.mode === 'endless' ? 'Endlos-Runde beendet' : 'Auftrag gescheitert' })), h('i', { class: 'ot-strike' })),
        h('p', { class: 'lead', text: reason }), kpis);
      if (g.mode === 'campaign') buttons.push({ label: 'Nochmal versuchen', primary: true, onClick: () => this.app.startLevel(g.level) });
      buttons.push({ label: 'Zum Hauptmenü', onClick: () => this.app.toMenu() });
    }
    this.modal({ title: info.won ? 'Level geschafft' : 'Spielende', body, closable: false, buttons });
  }

  achievementToast(a) { this.toast('Erfolg freigeschaltet', a.name + ' – ' + a.desc, 'ach'); }

  // ======================================================================
  // Tutorial (Level 1)
  // ======================================================================
  startTutorial() {
    this.tutStep = 0;
    this.tutT = 0;
    this.renderTut();
  }

  tutSteps() {
    const g = this.game;
    const anyConnected = () => {
      if (!g) return false;
      const w = g.world;
      w.ensureComponents();
      const houses = w.buildings.filter(b => b.cat === 'res' && !b.dead && w.road[b.acc]);
      const offices = w.buildings.filter(b => b.cat !== 'res' && !b.dead && w.road[b.acc]);
      return houses.some(hh => offices.some(o => w.comp[hh.acc] === w.comp[o.acc]));
    };
    return [
      { text: 'Willkommen! Wähle das Straßen-Werkzeug (Taste R).', done: () => this.tool === 'road' },
      { text: 'Die gestrichelten Felder vor den Einfahrten brauchen Anschluss. Ziehe mit gedrückter Maustaste eine Straße von einer Hauseinfahrt bis zur Einfahrt des Bürogebäudes.', done: anyConnected },
      { text: 'Die ersten Pendler fahren los! Oben siehst du Kasse, Uhrzeit und Zufriedenheit. Leertaste pausiert, 1–3 ändert das Tempo.', next: true },
      { text: 'Verbinde jetzt alle Häuser. Wird ein Rahmen rot, werden die Bewohner ungeduldig und die Zufriedenheit sinkt.', done: () => g && g.city.unconnectedCount(-1) === 0 },
      { text: 'Treffen drei Straßen aufeinander, entsteht eine Kreuzung. Ohne Schilder gilt rechts vor links. Mit dem Auswahl-Werkzeug (Q) siehst du Wartezeiten an Kreuzungen und Details zu Autos.', next: true },
      { text: 'Strg+Z macht den letzten Bauschritt rückgängig, Abriss (X) erstattet 35 % der Kosten. Neue Gebäude entstehen laufend – halte alles angeschlossen. Viel Erfolg!', next: true, last: true },
    ];
  }

  renderTut() {
    const steps = this.tutSteps();
    const st = steps[this.tutStep];
    if (!st) { this.tut.hidden = true; this.tutStep = -1; return; }
    this.tut.hidden = false;
    this.tut.innerHTML = '';
    this.tut.append(h('div', { class: 'tut-dots' }, steps.map((_, k) => h('i', { class: k === this.tutStep ? 'on' : k < this.tutStep ? 'done' : '' }))),
      h('p', { text: st.text }),
      h('div', { class: 'tut-btns' },
        h('button', { class: 'btn tiny ghost', onclick: () => { this.tutStep = -1; this.tut.hidden = true; } }, 'Tutorial beenden'),
        st.next ? h('button', { class: 'btn tiny', onclick: () => { this.tutStep++; this.renderTut(); } }, st.last ? 'Fertig' : 'Weiter') : h('span', { class: 'muted small', text: 'Wird automatisch fortgesetzt…' })));
  }

  tutCheck() {
    if (this.tutStep < 0) return;
    const st = this.tutSteps()[this.tutStep];
    if (st && st.done && st.done()) { this.tutStep++; AUDIO.play('good'); this.renderTut(); }
  }

  // ======================================================================
  // Hauptmenü
  // ======================================================================
  showMenu() {
    this.closeModals();
    this.leaveGame();
    this.menu.hidden = false;
    this.menuMain();
  }

  menuFrame(...content) {
    this.menu.innerHTML = '';
    const sign = h('div', { class: 'menu-sign' }, ...content);
    this.menu.append(sign);
    return sign;
  }

  menuHeader(sub) {
    return h('div', { class: 'menu-brand' },
      h('div', { class: 'mb-arrow', html: '<svg viewBox="0 0 64 64"><path d="M14 54V30c0-6 4-10 10-10h18" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><path d="M36 8l14 12-14 12z" fill="currentColor"/><path d="M50 54V36" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/></svg>' }),
      h('div', {}, h('h1', { text: 'Verkehrsmeister' }), h('div', { class: 'mb-sub', text: sub || 'Stadt im Fluss' })));
  }

  menuRow(ic, label, sub, fn, extra) {
    return h('button', { class: 'menu-row', onclick: () => { AUDIO.init(); AUDIO.resume(); AUDIO.play('click'); fn(); } }, icon(ic, 'mrow-ic'), h('span', { class: 'mrow-t' }, h('span', { text: label }), sub ? h('small', { text: sub }) : null), extra || null, icon('arrow', 'mrow-arrow'));
  }

  menuMain() {
    const prog = Store.get('vm_progress', {});
    const done = LEVELS.filter(l => prog[l.id]).length;
    const hasAuto = !!Store.get('vm_save_auto');
    this.menuFrame(this.menuHeader(),
      h('div', { class: 'menu-list' },
        hasAuto ? this.menuRow('play', 'Weiterspielen', 'Automatischer Spielstand', () => this.app.loadSlot('vm_save_auto')) : null,
        this.menuRow('flag', 'Kampagne', done + ' von ' + LEVELS.length + ' Leveln geschafft', () => this.menuLevels()),
        this.menuRow('fff', 'Endlosmodus', 'Wie lange hält deine Stadt durch?', () => this.menuEndless(false)),
        this.menuRow('place', 'Freies Bauen', 'Unbegrenztes Geld, alles freigeschaltet', () => this.menuEndless(true)),
        this.menuRow('save', 'Spiel laden', null, () => this.menuLoad()),
        this.menuRow('star', 'Erfolge', this.achCount() + ' von ' + ACHIEVEMENTS.length, () => this.menuAchievements()),
        this.menuRow('help', 'Anleitung', null, () => this.showHelp()),
        this.menuRow('grid', 'Einstellungen', null, () => this.showSettings())),
      h('div', { class: 'menu-foot', text: 'Rechts vor links · Vorfahrt · Ampelphasen · Kreisverkehr · Busse' }));
  }

  achCount() { return (Store.get('vm_ach', []) || []).length; }

  backRow() { return h('button', { class: 'menu-back', onclick: () => { AUDIO.play('click'); this.menuMain(); } }, '‹ Zurück'); }

  menuLevels() {
    const prog = Store.get('vm_progress', {});
    const grid = h('div', { class: 'levels' });
    LEVELS.forEach((lv, k) => {
      const unlocked = k === 0 || prog[LEVELS[k - 1].id] || prog[lv.id];
      const stars = prog[lv.id] || 0;
      const card = h('button', { class: 'ortstafel lvl' + (unlocked ? '' : ' locked'), disabled: unlocked ? null : true, 'aria-label': 'Level ' + (k + 1) + ': ' + lv.name + (unlocked ? '' : ' (gesperrt)'), onclick: () => { AUDIO.init(); AUDIO.resume(); this.app.startLevel(lv); } },
        h('div', { class: 'ot-in' },
          h('div', { class: 'ot-top', text: 'Level ' + (k + 1) }),
          h('div', { class: 'ot-name', text: lv.name }),
          h('div', { class: 'ot-sub', text: lv.sub }),
          unlocked ? h('div', { class: 'stars' }, [0, 1, 2].map(q => icon('star', q < stars ? 'on' : 'off'))) : h('div', { class: 'lock' }, icon('lock'), 'Vorheriges Level abschließen')));
      grid.append(card);
    });
    this.menuFrame(this.menuHeader('Kampagne'), this.backRow(), grid);
  }

  menuEndless(sandbox) {
    let mapId = ENDLESS_MAPS[0].id;
    let seed = Math.floor(Math.random() * 1e6);
    const maps = h('div', { class: 'map-pick' });
    const render = () => {
      maps.innerHTML = '';
      for (const m of ENDLESS_MAPS) maps.append(h('button', { class: 'map-opt' + (m.id === mapId ? ' on' : ''), onclick: () => { mapId = m.id; render(); } }, m.name));
    };
    render();
    const seedIn = h('input', { type: 'number', id: 'seed-in', value: seed, min: 0, max: 999999, oninput: e => { seed = +e.target.value || 0; } });
    this.menuFrame(this.menuHeader(sandbox ? 'Freies Bauen' : 'Endlosmodus'), this.backRow(),
      h('div', { class: 'menu-form' },
        h('p', { class: 'lead light', text: sandbox ? 'Baue ohne Geldsorgen. Wachstum und Ereignisse kannst du im Spiel an- und ausschalten. Gebäude lassen sich selbst platzieren.' : 'Die Stadt wächst ohne Ende, der Verkehr nimmt jeden Tag zu. Halte die Zufriedenheit über der kritischen Marke, so lange du kannst.' }),
        h('div', { class: 'f-label', text: 'Landschaft' }), maps,
        h('label', { class: 'f-label' }, 'Kartennummer', seedIn),
        h('button', { class: 'btn big', onclick: () => { AUDIO.init(); AUDIO.resume(); this.app.startEndless(mapId, seed, sandbox); } }, 'Stadt gründen')));
  }

  menuLoad() {
    const list = h('div', { class: 'slots' });
    const render = () => {
      list.innerHTML = '';
      for (const [key, label] of [['vm_save_auto', 'Automatisch'], ['vm_save_1', 'Platz 1'], ['vm_save_2', 'Platz 2'], ['vm_save_3', 'Platz 3']]) {
        const inf = this.slotInfo(key);
        list.append(h('div', { class: 'slot' + (inf ? '' : ' empty') },
          h('div', { class: 'slot-t' }, h('b', { text: label }), h('span', { text: inf ? inf.name + ' · Tag ' + inf.day + ', ' + inf.clock + ' · ' + fmtInt(inf.trips) + ' Fahrten' : 'leer' }), inf ? h('small', { text: new Date(inf.savedAt).toLocaleString('de-DE') }) : null),
          inf ? h('div', { class: 'slot-b' }, h('button', { class: 'btn small', onclick: () => this.app.loadSlot(key) }, 'Laden'), h('button', { class: 'ib', title: 'Löschen', onclick: () => this.confirm('Spielstand löschen?', label + ' wird endgültig gelöscht.', () => { Store.del(key); render(); }, 'Löschen') }, icon('trash'))) : null));
      }
    };
    render();
    this.menuFrame(this.menuHeader('Spiel laden'), this.backRow(), list);
  }

  menuAchievements() {
    const got = new Set(Store.get('vm_ach', []));
    const grid = h('div', { class: 'achs' }, ACHIEVEMENTS.map(a => h('div', { class: 'ach' + (got.has(a.id) ? ' got' : '') }, icon(got.has(a.id) ? 'star' : 'lock'), h('div', {}, h('b', { text: a.name }), h('span', { text: a.desc })))));
    this.menuFrame(this.menuHeader('Erfolge'), this.backRow(), grid);
  }
}

// ---------------------------------------------------------------------------
// Liniendiagramm (eine Serie) mit Hover-Fadenkreuz
// ---------------------------------------------------------------------------
function lineChart(cv, vals, labels, fmt, opts) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = cv.clientWidth || 460, cssH = cv.clientHeight || 170;
  cv.width = cssW * dpr; cv.height = cssH * dpr;
  const ctx = cv.getContext('2d');
  const pad = { l: 52, r: 12, t: 10, b: 24 };
  const pts = vals.map(v => (v === null || v === undefined || isNaN(v)) ? null : v);
  const real = pts.filter(v => v !== null);
  let lo = opts.min !== undefined ? opts.min : Math.min(...real), hi = opts.max !== undefined ? opts.max : Math.max(...real);
  if (opts.min0) lo = Math.min(0, lo);
  if (hi - lo < 1e-6) { hi = lo + 1; }
  // schöne Achsenwerte
  const span = hi - lo;
  const stepRaw = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(stepRaw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= stepRaw) || stepRaw;
  if (opts.min === undefined) lo = Math.floor(lo / step) * step;
  if (opts.max === undefined) hi = Math.ceil(hi / step) * step;
  const W = cssW - pad.l - pad.r, Hh = cssH - pad.t - pad.b;
  const n = pts.length;
  const X = opts.bars ? (k => pad.l + (k + 0.5) * W / n) : (k => pad.l + (n === 1 ? W / 2 : k / (n - 1) * W));
  const Y = v => pad.t + Hh - (v - lo) / (hi - lo) * Hh;
  const css = getComputedStyle(cv);
  const ink = css.getPropertyValue('--chart-ink').trim() || '#5b6472';
  const grid = css.getPropertyValue('--chart-grid').trim() || '#e7e3d8';
  const accent = css.getPropertyValue('--chart-accent').trim() || '#0b4f9c';
  const surface = css.getPropertyValue('--chart-surface').trim() || '#ffffff';
  const draw = hover => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.font = '500 11px Barlow, system-ui, sans-serif';
    ctx.fillStyle = ink; ctx.strokeStyle = grid; ctx.lineWidth = 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const afmt = opts.axis || fmt;
    for (let v = lo; v <= hi + step * 0.01; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(cssW - pad.r, y); ctx.stroke();
      ctx.fillText(afmt(v), pad.l - 6, y);
    }
    ctx.textBaseline = 'top';
    const every = Math.max(1, Math.ceil(n / 6));
    for (let k = 0; k < n; k += every) {
      const t = labels[k].split(' ')[1] || labels[k];
      const x = X(k), tw = ctx.measureText(t).width;
      ctx.textAlign = x + tw / 2 > cssW - 2 ? 'right' : (x - tw / 2 < pad.l - 4 ? 'left' : 'center');
      ctx.fillText(t, ctx.textAlign === 'right' ? cssW - 2 : x, cssH - pad.b + 6);
    }
    ctx.textAlign = 'center';
    if (opts.bars) {
      const bw = Math.max(2, Math.min(28, W / n - 3));
      ctx.fillStyle = accent;
      pts.forEach((v, k) => {
        if (v === null) return;
        const x = X(k) - bw / 2, y = Y(v), y0 = Y(Math.max(lo, 0));
        const hgt = Math.max(0, y0 - y);
        ctx.globalAlpha = hover === k ? 1 : 0.82;
        ctx.beginPath(); roundRectTop(ctx, x, y, bw, hgt, Math.min(4, bw / 2)); ctx.fill();
      });
      ctx.globalAlpha = 1;
    } else {
      ctx.beginPath();
      let started = false;
      pts.forEach((v, k) => { if (v === null) { started = false; return; } if (!started) { ctx.moveTo(X(k), Y(v)); started = true; } else ctx.lineTo(X(k), Y(v)); });
      ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      // Fläche
      ctx.globalAlpha = 0.1; ctx.fillStyle = accent;
      ctx.beginPath();
      let first = -1, last = -1;
      pts.forEach((v, k) => { if (v === null) return; if (first < 0) { first = k; ctx.moveTo(X(k), Y(v)); } else ctx.lineTo(X(k), Y(v)); last = k; });
      if (first >= 0) { ctx.lineTo(X(last), Y(lo)); ctx.lineTo(X(first), Y(lo)); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 1;
      // Endpunkt
      if (last >= 0) { ctx.fillStyle = accent; ctx.strokeStyle = surface; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(last), Y(pts[last]), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
    if (hover !== null && hover >= 0 && pts[hover] !== null) {
      const x = X(hover);
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + Hh); ctx.stroke();
      ctx.globalAlpha = 1;
      if (!opts.bars) { ctx.fillStyle = accent; ctx.strokeStyle = surface; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, Y(pts[hover]), 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      const txt = labels[hover] + ': ' + fmt(pts[hover]);
      ctx.font = '600 12px Barlow, system-ui, sans-serif';
      const tw = ctx.measureText(txt).width + 14;
      let tx = x + 10; if (tx + tw > cssW - 4) tx = x - tw - 10;
      ctx.fillStyle = 'rgba(17,24,39,0.92)';
      ctx.beginPath(); roundRectPath(ctx, tx, pad.t + 2, tw, 22, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, tx + 7, pad.t + 13);
    }
  };
  draw(null);
  const pick = e => {
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left;
    let k = opts.bars ? Math.floor((x - pad.l) / W * n) : Math.round((x - pad.l) / W * (n - 1));
    k = clamp(k, 0, pts.length - 1);
    draw(k);
  };
  cv.onpointermove = pick;
  cv.onpointerdown = pick;
  cv.onpointerleave = () => draw(null);
}

function roundRectTop(ctx, x, y, w, hgt, r) {
  r = Math.min(r, hgt);
  ctx.moveTo(x, y + hgt);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + hgt);
  ctx.closePath();
}
