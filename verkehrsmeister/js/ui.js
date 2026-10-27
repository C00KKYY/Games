'use strict';
// ---------------------------------------------------------------------------
// Oberfläche: HUD, Werkzeugleiste, Hinweise, Wochenbilanz mit Kartenwahl,
// Stau-Report, Menü, Tutorial, Stau-Lupe
// ---------------------------------------------------------------------------

const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
const HOUSE_ADJ = ['gelben', 'roten', 'blauen', 'grünen', 'lila', 'orangen'];

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

class UI {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.targeting = null;
    this.modalOpen = false;
    this.toastList = [];
    this.lastScore = -1;
    this.shownScore = 0;
    this.tut = null;
    this.build();
  }

  // ---- Aufbau -----------------------------------------------------------------------
  build() {
    const R = this.root;
    R.innerHTML = '';
    const hud = el('div', 'hud');
    this.hud = hud;
    // Punkte
    const tl = el('div', 'hud-tl card');
    tl.innerHTML = `<div class="city-name"></div><div class="score"><span class="odo">0</span><span class="unit">Punkte</span></div><div class="medal"><div class="medal-bar"><i></i></div><span class="medal-next"></span></div><div class="save-line" title="Jede Straße, die am Wochenende noch im Inventar liegt, bringt ${CFG.savingsBonus} Punkte."></div>`;
    hud.appendChild(tl);
    this.elSave = tl.querySelector('.save-line');
    this.elCity = tl.querySelector('.city-name'); this.elScore = tl.querySelector('.odo'); this.elMedalBar = tl.querySelector('.medal-bar i'); this.elMedalNext = tl.querySelector('.medal-next');
    // Uhr
    const tc = el('div', 'hud-tc card');
    tc.innerHTML = `<svg class="dial" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" class="dial-bg"/><path class="dial-wave m"/><path class="dial-wave e"/><circle cx="20" cy="20" r="12.5" class="dial-face"/><line x1="20" y1="20" x2="20" y2="9" class="dial-hand"/><circle cx="20" cy="20" r="2" class="dial-dot"/></svg><div class="clock-txt"><div class="clock-day"></div><div class="clock-phase"></div></div>`;
    hud.appendChild(tc);
    this.elDay = tc.querySelector('.clock-day'); this.elPhase = tc.querySelector('.clock-phase'); this.elHand = tc.querySelector('.dial-hand');
    const arc = (h0, h1, r) => {
      const a = h => (-90 + (h - 6) / 16 * 300) * Math.PI / 180;
      const p = h => [20 + Math.cos(a(h)) * r, 20 + Math.sin(a(h)) * r];
      const [x0, y0] = p(h0), [x1, y1] = p(h1);
      return `M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`;
    };
    tc.querySelector('.dial-wave.m').setAttribute('d', arc(7, 9.5, 15));
    tc.querySelector('.dial-wave.e').setAttribute('d', arc(16, 19, 15));
    // Steuerung oben rechts
    const tr = el('div', 'hud-tr');
    tr.innerHTML = `<button class="hbtn" data-a="pause" title="Pause (Leertaste)">${ICON.pause}</button><button class="hbtn speed" data-a="speed" title="Tempo (Tab)">${ICON.play}</button><button class="hbtn" data-a="sound" title="Ton an/aus">${ICON.sound}</button><button class="hbtn" data-a="menu" title="Menü">${ICON.menu}</button>`;
    tr.addEventListener('click', e => { const b = e.target.closest('button'); if (b) this.app.hudAction(b.dataset.a); });
    hud.appendChild(tr);
    this.btnPause = tr.querySelector('[data-a=pause]'); this.btnSpeed = tr.querySelector('[data-a=speed]'); this.btnSound = tr.querySelector('[data-a=sound]');
    // Werkzeugleiste
    const tb = el('div', 'toolbar card');
    const tools = [
      { id: 'road', icon: 'road', label: 'Straße', key: '1', inv: 'roads' },
      { id: 'erase', icon: 'erase', label: 'Abriss', key: 'X / Rechtsklick' },
      { id: 'light', icon: 'light', label: 'Ampel', key: '2', inv: 'lights' },
      { id: 'round', icon: 'round', label: 'Kreisel', key: '3', inv: 'rounds' },
      { id: 'highway', icon: 'highway', label: 'Autobahn', key: '4', inv: 'highways' },
      { id: 'police', icon: 'police', label: 'Polizei', key: 'P', inv: 'police' },
      { id: 'stop', icon: 'stop', label: 'Feierabend', key: 'F', inv: 'stops', action: true },
      { id: 'undo', icon: 'undo', label: 'Zurück', key: 'Strg+Z', action: true },
    ];
    this.toolBtns = {};
    for (const t of tools) {
      const b = el('button', 'tool' + (t.action ? ' act' : ''));
      b.dataset.t = t.id;
      b.title = t.label + ' (' + t.key + ')';
      b.innerHTML = `<span class="ic">${ICON[t.icon]}</span><span class="lbl">${t.label}</span>` + (t.inv ? `<span class="cnt" data-inv="${t.inv}">0</span>` : '');
      tb.appendChild(b);
      this.toolBtns[t.id] = b;
      if (t.id === 'road') {
        const chips = el('span', 'chips');
        chips.innerHTML = `<span class="chip" title="Brücken (über Wasser, bis 4 Felder)">${ICON.bridge}<b data-inv="bridges">0</b></span><span class="chip" title="Tunnel (durch Berge, bis 5 Felder)">${ICON.tunnel}<b data-inv="tunnels">0</b></span>`;
        b.appendChild(chips);
      }
    }
    tb.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const t = b.dataset.t;
      if (t === 'undo') { if (this.app.game && !this.app.blocked() && this.app.game.undo()) AUDIO.play('undo'); return; }
      if (t === 'stop') { this.app.useStop(); return; }
      this.app.input.setTool(t);
    });
    hud.appendChild(tb);
    this.toolbar = tb;
    // diverse Ebenen
    this.toasts = el('div', 'toasts'); hud.appendChild(this.toasts);
    this.vignette = el('div', 'vignette'); hud.appendChild(this.vignette);
    this.hint = el('div', 'costhint'); hud.appendChild(this.hint);
    this.inspectEl = el('div', 'inspect card'); hud.appendChild(this.inspectEl);
    this.inspectEl.addEventListener('click', e => { if (e.target.closest('[data-a=ins-close]')) { this.showInspect(null); if (this.app.scene) this.app.scene.selected = null; } });
    this.big = el('div', 'bigtext'); hud.appendChild(this.big);
    this.tutEl = el('div', 'tutorial card'); hud.appendChild(this.tutEl);
    this.banner = el('div', 'banner'); hud.appendChild(this.banner);
    this.tooltip = el('div', 'tooltip'); hud.appendChild(this.tooltip);
    R.appendChild(hud);
    this.modal = el('div', 'modal-wrap');
    R.appendChild(this.modal);
    this.modal.addEventListener('click', e => this.modalClick(e));
  }

  onGameStart(game) {
    this.elCity.textContent = game.def.name + (game.opts.daily ? ' · Tageschallenge' : '');
    this.lastScore = -1; this.shownScore = 0;
    this.closeModal();
    this.showInspect(null);
    this.targeting = null; this.banner.classList.remove('show');
    this.tut = null; this.tutEl.classList.remove('show'); this.app.overlay.hint = null;
    clearTimeout(this._weekT);
    this.hud.classList.add('on');
    this.onTool('road');
  }

  get touch() { return matchMedia('(pointer: coarse)').matches; }

  // Wochenbilanz zeigen, sobald nichts anderes offen ist
  queueWeek(S, ms) {
    clearTimeout(this._weekT);
    const g = this.app.game;
    this._weekT = setTimeout(() => {
      if (this.app.game !== g || this.app.attract || g.phase !== 'week' || g.pendingWeek !== S || this.targeting) return;
      if (this.modalOpen) return;   // Menü offen: wird beim Schließen nachgeholt
      this.showWeek(S);
    }, ms);
  }

  // nach dem Schließen des Menüs: offene Wochenbilanz wieder zeigen
  afterMenu() {
    const g = this.app.game;
    if (g && g.phase === 'week' && g.pendingWeek && !this.targeting && !this.app.attract) this.showWeek(g.pendingWeek);
  }

  onTool(t) {
    for (const k in this.toolBtns) this.toolBtns[k].classList.toggle('on', k === t);
    this.root.classList.toggle('tool-erase', t === 'erase');
    const H = { light: 'Ampel: Kreuzung antippen', round: 'Kreisel: Kreuzung antippen', police: 'Polizei: Kreuzung antippen (15 s)', highway: 'Autobahn: gerade ziehen, 4–10 Felder', erase: 'Abriss: über Straßen ziehen', road: '' };
    if (this.touch && H[t] && this._lastTool !== t) this.toast(H[t], t === 'round' ? 'round' : t, { ms: 2200 });
    this._lastTool = t;
  }

  // ---- jedes Bild ---------------------------------------------------------------------
  update(dt) {
    const g = this.app.game;
    if (!g) return;
    // Punkte rollen
    if (this.shownScore < g.score) this.shownScore = Math.min(g.score, this.shownScore + Math.max(1, (g.score - this.shownScore) * dt * 8));
    const s = Math.floor(this.shownScore);
    if (s !== this.lastScore) {
      this.elScore.textContent = fmtInt(s);
      if (this.lastScore >= 0) { this.elScore.classList.remove('bump'); void this.elScore.offsetWidth; this.elScore.classList.add('bump'); }
      this.lastScore = s;
      const m = g.def.medals, k = g.medal();
      const prev = k >= 0 ? m[k] : 0, next = k + 1 < m.length ? m[k + 1] : null;
      this.elMedalBar.style.width = next ? clamp((g.score - prev) / (next - prev), 0, 1) * 100 + '%' : '100%';
      this.elMedalBar.className = 'm' + (k + 1);
      this.elMedalNext.innerHTML = next ? `${MEDAL_NAMES[k + 1]} bei ${fmtInt(next)}` : `${ICON.star} Gold erreicht`;
    }
    // Uhr
    const h = g.phase === 'night' ? 22 : clamp(g.hour, 6, 22);
    const ang = -90 + (h - 6) / 16 * 300;
    this.elHand.setAttribute('transform', `rotate(${ang + 90} 20 20)`);
    this.elDay.textContent = `Woche ${g.week} · ${DAYS[Math.min(4, g.day - 1)]}`;
    let ph;
    if (g.phase === 'week') ph = 'Wochenende';
    else if (g.phase === 'night') ph = 'Nacht';
    else if (g.hour >= 7 && g.hour < 9.5) ph = 'Morgenwelle';
    else if (g.hour >= 16 && g.hour < 19) ph = 'Feierabendwelle';
    else if (g.hour >= 19) ph = 'Abend';
    else ph = pad2(Math.floor(g.hour)) + ':' + pad2(Math.floor((g.hour % 1) * 60 / 15) * 15) + ' Uhr';
    if (g.stopT > 0) ph = 'Feierabend-Stopp ' + Math.ceil(g.stopT) + ' s';
    this.elPhase.textContent = ph;
    this.elPhase.classList.toggle('wave', ph.indexOf('welle') >= 0);
    // Sparprämie live
    const sp = Math.max(0, g.inv.roads) * CFG.savingsBonus;
    const spTxt = sp ? `Sparprämie am Wochenende: <b>+${fmtInt(sp)}</b>` : 'Sparprämie: alle Straßen verbaut';
    if (spTxt !== this._spTxt) { this.elSave.innerHTML = spTxt; this._spTxt = spTxt; this.elSave.classList.toggle('zero', !sp); }
    // Inventar
    for (const c of this.toolbar.querySelectorAll('[data-inv]')) {
      const v = g.inv[c.dataset.inv] || 0;
      if (c.textContent !== String(v)) { c.textContent = v; c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
    }
    this.toolBtns.light.classList.toggle('empty', !g.inv.lights);
    this.toolBtns.round.classList.toggle('empty', !g.inv.rounds);
    this.toolBtns.highway.classList.toggle('empty', !g.inv.highways);
    this.toolBtns.police.classList.toggle('empty', !g.inv.police);
    this.toolBtns.stop.classList.toggle('hidden', !g.inv.stops && g.stopT <= 0);
    this.toolBtns.road.classList.toggle('low', g.inv.roads <= 5);
    this.toolBtns.undo.classList.toggle('empty', !g.undoStack.length);
    // Gefahr
    let worst = 0;
    for (const d of g.city.dests) worst = Math.max(worst, d.ring);
    this.vignette.style.opacity = g.over ? 0.85 : clamp((worst - 0.45) / 0.5, 0, 1) * 0.8;
    AUDIO.danger = clamp((worst - 0.3) / 0.6, 0, 1);
    // Toasts altern
    const now = performance.now();
    for (const t of this.toastList) if (!t.gone && now > t.until) { t.gone = true; t.el.classList.add('out'); setTimeout(() => t.el.remove(), 400); }
    this.toastList = this.toastList.filter(t => !t.gone || t.el.isConnected);
    // Stau-Lupe aktualisieren
    if (this.inspectData) this.renderInspect();
    this.updateTutorial(dt);
    // sicherer Bereich für Randpfeile
    this._safeT = (this._safeT || 0) - dt;
    if (this._safeT <= 0) {
      this._safeT = 0.5;
      let top = 0;
      for (const sel of ['.hud-tl', '.hud-tc', '.hud-tr']) { const e = this.hud.querySelector(sel); if (e) top = Math.max(top, e.getBoundingClientRect().bottom); }
      const tb = this.toolbar.getBoundingClientRect();
      const r = this.root.getBoundingClientRect();
      this.app.overlay.safe = { top: top - r.top + 22, bottom: tb.top - r.top - 22 };
    }
  }

  setPaused(p) { this.btnPause.innerHTML = p ? ICON.play : ICON.pause; this.btnPause.classList.toggle('on', p); }
  setSpeed(s) { this.btnSpeed.innerHTML = s === 1 ? ICON.play : s === 2 ? ICON.ff : ICON.fff; this.btnSpeed.dataset.s = s + '×'; }
  setSound(on) { this.btnSound.innerHTML = on ? ICON.sound : ICON.mute; }

  toast(text, icon, opt = {}) {
    const t = el('div', 'toast' + (opt.cls ? ' ' + opt.cls : ''), `${icon && ICON[icon] ? '<span class="ic">' + ICON[icon] + '</span>' : ''}<span>${esc(text)}</span>`);
    this.toasts.appendChild(t);
    const rec = { el: t, until: performance.now() + (opt.ms || 3600) };
    if (opt.at !== undefined) { t.classList.add('click'); t.addEventListener('click', () => this.app.focusTile(opt.at)); }
    this.toastList.push(rec);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
  }

  bigText(text, cls, ms = 1600) {
    this.big.className = 'bigtext show ' + (cls || '');
    this.big.textContent = text;
    clearTimeout(this._bigT);
    this._bigT = setTimeout(() => { this.big.className = 'bigtext'; }, ms);
  }

  // Kosten-Anzeige beim Ziehen
  costHint(plan, mouse) {
    const H = this.hint;
    if (!plan) { H.classList.remove('show'); return; }
    let html = '';
    if (plan.erase) html = `<b class="neg">Abreißen</b> ${plan.n ? plan.n + ' Felder' : ''}`;
    else if (plan.highway) html = plan.ok ? `<b>Autobahn</b> ${plan.n} Felder Hochstraße` : `<b class="neg">${esc(plan.reason || '')}</b>`;
    else if (plan.swipeShort) html = `<b class="prio">Vorfahrt?</b> Weiter über die Kreuzung ziehen`;
    else if (plan.exists) html = 'Straße besteht schon';
    else if (plan.swipe) html = plan.swipeBlocked ? `<b class="neg">${esc(plan.swipeBlocked)}</b>` : `<b class="prio">Vorfahrt</b> entlang dieser Straße`;
    else {
      const parts = [];
      if (plan.roads) parts.push(`${ICON.road}<b>−${plan.roads}</b>`);
      if (plan.bridges) parts.push(`${ICON.bridge}<b>−${plan.bridges}</b>`);
      if (plan.tunnels) parts.push(`${ICON.tunnel}<b>−${plan.tunnels}</b>`);
      html = parts.join(' ');
      if (!plan.ok && plan.reason) html += (html ? ' · ' : '') + `<b class="neg">${esc(plan.reason)}</b>`;
      if (!html) html = 'Verbinden';
    }
    H.innerHTML = html;
    H.classList.add('show');
    if (mouse) this.place(H, mouse);
  }

  // Schwebende Hinweise neben dem Zeiger, bei Touch über dem Finger, nie über den Rand
  place(el, mouse) {
    const w = el.offsetWidth, h = el.offsetHeight, W = this.root.clientWidth, H = this.root.clientHeight;
    const x = this.touch ? mouse.x - w / 2 : mouse.x + 18, y = this.touch ? mouse.y - h - 56 : mouse.y + 14;
    el.style.left = clamp(x, 8, Math.max(8, W - w - 8)) + 'px';
    el.style.top = clamp(y, 8, Math.max(8, H - h - 8)) + 'px';
  }

  hoverInfo(t, mouse) {
    const g = this.app.game;
    if (!g || t < 0 || this.modalOpen) { this.tooltip.classList.remove('show'); return; }
    const w = g.world;
    let txt = null;
    const b = w.bld[t] >= 0 ? w.buildings[w.bld[t]] : null;
    if (b && b.kind === 'dest') txt = `<b style="color:${PALETTE[b.pi].hex}">${PALETTE[b.pi].name}</b> · ${b.pins} Aufträge${b.cause ? ' · ' + CAUSES[b.cause].title : ''}`;
    else if (b) txt = `Haus · <b style="color:${PALETTE[b.pi].hex}">${PALETTE[b.pi].name}</b> · ${b.home}/${b.cars} Autos daheim${b.conn ? '' : ' · <span class="neg">nicht angeschlossen</span>'}`;
    else if (w.jc[t]) { const J = w.jc[t]; txt = `<b>${J.police > 0 ? 'Polizei regelt' : JTYPE_NAME[J.type]}</b>`; }
    if (!txt) { this.tooltip.classList.remove('show'); return; }
    this.tooltip.innerHTML = txt;
    this.tooltip.classList.add('show');
    this.place(this.tooltip, mouse);
  }

  // ---- Stau-Lupe ---------------------------------------------------------------------
  showInspect(data, mouse) {
    this.inspectData = data;
    if (!data) { this.inspectEl.classList.remove('show'); this.tutEl.style.visibility = ''; return; }
    this.inspectEl.classList.add('show');
    this.renderInspect();
    // Tipp-Box nur verstecken, wenn sie sich mit der Lupe überdeckt (schmale Fenster)
    const a = this.inspectEl.getBoundingClientRect(), b = this.tutEl.getBoundingClientRect();
    this.tutEl.style.visibility = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom ? 'hidden' : '';
  }

  renderInspect() {
    const D = this.inspectData, g = this.app.game;
    if (!D || !g) return;
    let html = '';
    if (D.v) {
      const v = D.v;
      if (v.dead) { this.showInspect(null); this.app.scene.selected = null; return; }
      const to = v.emergency ? 'Notfall-Einsatz' : v.leg === 'out' ? 'unterwegs zu ' + PALETTE[v.dest.pi].name : 'fährt heim';
      let st = 'fährt flüssig';
      if (v.v < 0.06) {
        if (v.cause === 1) { const J = v.waitJ; st = `wartet an Kreuzung (${J ? (J.police > 0 ? 'Polizei' : JTYPE_NAME[J.type]) : '?'})`; }
        else if (v.cause === 4) st = 'wartet an Schranke/Klappbrücke';
        else if (v.cause === 3) st = 'wartet auf Platz am Ziel';
        else st = 'steht im Stau';
      } else if (v.v < v.vlim * 0.5) st = 'zähfließend';
      html = `<div class="ins-h"><i class="dot" style="background:${v.color === '#ffffff' ? '#e5484d' : v.color}"></i><b>${esc(to)}</b><button class="x" data-a="ins-close">${ICON.close}</button></div>
        <div class="ins-row">${st}${v.wait > 2 ? ` · insgesamt ${Math.round(v.wait)} s gewartet` : ''}</div>
        <div class="ins-row dim">Halte: ${v.stops} · unterwegs seit ${Math.round(g.time - v.t0)} s</div>`;
    } else if (D.d) {
      const d = D.d;
      const c = d.cause ? CAUSES[d.cause] : null;
      html = `<div class="ins-h"><i class="dot" style="background:${PALETTE[d.pi].hex}"></i><b>${PALETTE[d.pi].name}</b><button class="x" data-a="ins-close">${ICON.close}</button></div>
        <div class="ins-row">${d.pins} offene Aufträge (Grenze ${d.cap}) · ${d.assigned} Autos unterwegs</div>
        <div class="ins-row dim">${d.nhc || 0} von ${d.nh || 0} Häusern angeschlossen · ${d.delivered} geliefert${d.outQ.length ? ' · ' + d.outQ.length + ' warten auf Ausfahrt' : ''}</div>
        ${c ? `<div class="ins-cause"><b>${c.title}</b><br>${c.tip}</div>` : ''}`;
    } else if (D.h) {
      const h = D.h, P = PALETTE[h.pi], d = h.near;
      const where = d ? `${P.article === 'der' ? 'zur' : 'zum'} <b>${P.name}</b>` : `zu ${P.article} <b>${P.name}</b>`;
      html = `<div class="ins-h"><i class="dot" style="background:${P.hex}"></i><b>Haus · ${P.name}</b><button class="x" data-a="ins-close">${ICON.close}</button></div>
        <div class="ins-row">${h.home} von ${h.cars} Autos daheim</div>
        ${h.conn ? `<div class="ins-row dim">Angeschlossen – die Autos holen Aufträge ${where} ab.</div>`
          : `<div class="ins-cause"><b>Nicht angeschlossen</b><br>Zieh eine Straße von hier ${where}${d ? ' (' + (Math.abs(d.cx - h.x - 0.5) + Math.abs(d.cy - h.y - 0.5)).toFixed(0) + ' Felder)' : ''}. Auch ohne Straße bringt das Haus Aufträge – nur seine ${h.cars} Autos fehlen dann.</div>`}`;
    } else if (D.J) {
      const J = D.J;
      if (!g.world.jc[J.i]) { this.showInspect(null); return; }
      const c = J.cause && J.score > 5 ? CAUSES[J.cause] : null;
      let wait = 0; for (let h = 0; h < 4; h++) wait += J.waitEma[h];
      html = `<div class="ins-h"><b>${J.police > 0 ? 'Polizei regelt (' + Math.ceil(J.police) + ' s)' : JTYPE_NAME[J.type]}</b><button class="x" data-a="ins-close">${ICON.close}</button></div>
        <div class="ins-row">${J.pass} Durchfahrten · Ø Wartezeit ${wait.toFixed(1)} s</div>
        ${c ? `<div class="ins-cause"><b>${c.title}</b><br>${c.tip}</div>` : `<div class="ins-row dim">${this.touch ? 'Tipp: Entlang der Straße über die Kreuzung wischen = Vorfahrt. Oder unten Ampel, Kreisel bzw. Polizei wählen und die Kreuzung antippen.' : 'Tipp: Entlang der Straße über die Kreuzung ziehen = Vorfahrt. Taste 2 Ampel, 3 Kreisel, P Polizei.'}</div>`}`;
    }
    if (html !== this._insHtml) { this.inspectEl.innerHTML = html; this._insHtml = html; }
  }

  // ---- Modals ---------------------------------------------------------------------------
  openModal(html, cls) {
    this.modal.innerHTML = `<div class="modal ${cls || ''}">${html}</div>`;
    this.modal.classList.add('show');
    this.modalOpen = true;
    this.tooltip.classList.remove('show');
  }
  closeModal() { this.modal.classList.remove('show'); this.modal.innerHTML = ''; this.modalOpen = false; }

  onEscape() {
    if (this.targeting) { this.targeting = null; this.banner.classList.remove('show'); this.showWeek(this.app.game.pendingWeek); return true; }
    if (this.inspectData) { this.showInspect(null); this.app.scene.selected = null; return true; }
    if (this.modalOpen && this.modalKind === 'menu' && this.app.game && !this.app.game.over && !this.app.attract) { this.closeModal(); this.app.setPaused(false); this.afterMenu(); return true; }
    return false;
  }

  modalClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    const app = this.app;
    AUDIO.play('click');
    if (a === 'card') this.chooseCard(+b.dataset.k);
    else if (a === 'skip') { this.closeModal(); app.game.chooseCard(null); app.setPaused(false); }
    else if (a === 'focus') { this.closeModal(); app.focusTile(+b.dataset.i); this.queueWeek(app.game.pendingWeek, 1600); }
    else if (a === 'again') { if (app.game.opts.dailyKey) app.startDaily(); else app.startCity(app.game.def.id); }
    else if (a === 'menu') this.showMenu();
    else if (a === 'city') app.startCity(b.dataset.id);
    else if (a === 'daily') app.startDaily();
    else if (a === 'resume') { this.closeModal(); app.setPaused(false); this.afterMenu(); }
    else if (a === 'help') this.showHelp();
    else if (a === 'toggle-sound') { app.toggleSound(); this.showMenu(); }
    else if (a === 'toggle-music') { AUDIO.setMusic(!AUDIO.musicOn); app.saveSettings(); this.showMenu(); }
    else if (a === 'toggle-quality') { app.toggleQuality(); this.showMenu(); }
    else if (a === 'back') this.showMenu();
  }

  // Wochenbilanz + Kartenwahl
  showWeek(S) {
    if (!S) return;
    const g = this.app.game;
    this.modalKind = 'week';
    const worst = S.worst ? `<div class="wk-worst"><span>Größte Engstelle: <b>${CAUSES[S.worst.cause] ? CAUSES[S.worst.cause].title : 'Kreuzung'}</b> (${Math.round(S.worst.wait)} s Wartezeit)</span><button class="btn small" data-a="focus" data-i="${S.worst.i}">${ICON.eye} Zeigen</button></div>` : '<div class="wk-worst good">Keine großen Engstellen diese Woche.</div>';
    const cards = S.cards.map((c, k) => `<button class="pcard${c.pact ? ' pact' : ''}" data-a="card" data-k="${k}"><span class="pc-ic">${ICON[c.icon] || ICON.star}</span><b>${esc(c.name)}</b><span>${esc(c.desc)}</span>${c.target ? '<em>Ziel wählen</em>' : ''}${c.pact ? '<em class="pact">Pakt</em>' : ''}</button>`).join('');
    const bonus = `+${g.mods.lowWeek === g.week + 1 ? 5 : g.mods.daily === 'sparsam' ? 8 : CFG.weekRoads} Straßen · +1 Polizei · die Ortsgrenze wächst`;
    this.openModal(`
      <div class="wk-head"><div class="wk-title">Woche ${S.week} geschafft!</div><div class="wk-sub">${fmtInt(S.trips)} Fahrten diese Woche · ${fmtInt(S.total)} Punkte insgesamt</div></div>
      <div class="wk-save${S.bonus ? '' : ' none'}">${ICON.road}<span>${S.bonus ? `<b>Sparprämie +${fmtInt(S.bonus)}</b> für ${S.saved} übrige Straßen` : 'Keine Sparprämie – alle Straßen verbaut. Übrige Straßen bringen am Wochenende je ' + CFG.savingsBonus + ' Punkte.'}</span></div>
      <div class="wk-stats"><span>${ICON.house}${S.houses} Häuser</span><span>${ICON.flag}${S.dests} Ziele</span></div>
      ${worst}
      <div class="wk-bonus">${bonus}</div>
      ${S.cards.length ? `<div class="wk-pick">Wähle eine Karte</div><div class="pcards">${cards}</div>` : `<div class="wk-pick">Sparhaushalt: diese Woche keine Karte</div><button class="btn primary" data-a="skip">Weiter</button>`}
    `, 'week');
  }

  chooseCard(k) {
    const g = this.app.game;
    if (!g || !g.pendingWeek) { this.closeModal(); return; }
    const c = g.pendingWeek.cards[k];
    AUDIO.play('card');
    if (c.target) {
      this.closeModal();
      this.targeting = c;
      this.banner.innerHTML = `${ICON.target}<span><b>${esc(c.name)}:</b> ${this.touch ? 'Tippe' : 'Klicke'} auf ein Ziel</span><button class="x" data-tgt="cancel" title="Andere Karte wählen">${ICON.close}</button>`;
      this.banner.querySelector('[data-tgt=cancel]').onclick = () => this.onEscape();
      this.banner.classList.add('show');
      return;
    }
    this.closeModal();
    g.chooseCard(c);
    this.app.setPaused(false);
  }

  pickTarget(t) {
    const g = this.app.game, w = g.world;
    const b = w.bld[t] >= 0 ? w.buildings[w.bld[t]] : null;
    if (!g.pendingWeek || g.phase !== 'week') { this.targeting = null; this.banner.classList.remove('show'); return; }
    if (!b || b.kind !== 'dest') { this.toast('Bitte auf ein Ziel (großes Gebäude) ' + (this.touch ? 'tippen.' : 'klicken.'), 'target'); AUDIO.play('deny'); return; }
    const c = this.targeting;
    this.targeting = null;
    this.banner.classList.remove('show');
    g.chooseCard(c, b);
    this.app.setPaused(false);
  }

  // Stau-Report nach dem Stillstand
  showReport(R, prog) {
    const app = this.app, g = app.game;
    this.modalKind = 'report';
    const def = R.city;
    const k = g.medal();
    const medal = k >= 0 ? `<span class="medal-chip m${k + 1}">${ICON.trophy}${MEDAL_NAMES[k]}</span>` : `<span class="medal-chip m0">Bronze bei ${fmtInt(def.medals[0])}</span>`;
    const cause = CAUSES[R.cause] || CAUSES.nocar;
    const top = R.top.length ? R.top.map((t, n) => `<li><b>${n + 1}. ${CAUSES[t.cause] ? CAUSES[t.cause].title : 'Kreuzung'}</b> – ${Math.round(t.wait)} s Wartezeit<br><span>${CAUSES[t.cause] ? CAUSES[t.cause].tip : ''}</span></li>`).join('') : '<li>Keine Kreuzung war ein größeres Problem.</li>';
    const board = (prog.board || []).slice(0, 10).map((e, n) => `<tr class="${e.cur ? 'cur' : ''}"><td>${n + 1}.</td><td>${fmtInt(e.score)}</td><td>Woche ${e.week}</td><td>${esc(e.date)}</td></tr>`).join('');
    this.openModal(`
      <div class="rep-head"><div class="rep-title">Stillstand in ${esc(def.name)}!</div><div class="rep-sub">${esc(PALETTE[R.dest.pi].name)} konnte nicht mehr beliefert werden · Woche ${R.week}, ${DAYS[Math.min(4, R.day - 1)]}</div></div>
      <div class="rep-score"><span class="big">${fmtInt(R.score)}</span><span>Punkte</span>${medal}${prog.newBest ? '<span class="newbest">Neuer Rekord!</span>' : ''}</div>
      <div class="rep-btns"><button class="btn primary" data-a="again">Nochmal ${esc(def.name)}</button>${prog.unlockedId ? `<button class="btn" data-a="city" data-id="${prog.unlockedId}">Neu: ${esc(prog.unlocked)}</button>` : ''}<button class="btn" data-a="menu">Andere Stadt</button></div>
      <div class="rep-grid">
        <div class="rep-col">
          <h4>Woran es lag</h4>
          <div class="rep-cause"><b>${cause.title}</b><br>${cause.tip}</div>
          <h4>Die drei größten Engstellen</h4>
          <ol class="rep-top">${top}</ol>
        </div>
        <div class="rep-col">
          <h4>Wo am meisten gewartet wurde</h4>
          <canvas class="heat" width="200" height="200"></canvas>
          ${board ? `<h4>Bestenliste ${esc(def.name)}${g.opts.daily ? ' (heute)' : ''}</h4><table class="board">${board}</table>` : ''}
        </div>
      </div>
      ${prog.rankUp ? `<div class="rankup">${ICON.rank} Neuer Rang: <b>${esc(prog.rankUp.name)}</b>${prog.rankUp.unlock ? ' – freigeschaltet: ' + esc(prog.rankUp.unlock) : ''}</div>` : ''}
      ${prog.unlocked ? `<div class="rankup">${ICON.lock} Neue Stadt freigeschaltet: <b>${esc(prog.unlocked)}</b></div>` : ''}
    `, 'report');
    this.drawHeat(this.modal.querySelector('canvas.heat'), g);
  }

  drawHeat(cv, g) {
    if (!cv) return;
    const w = g.world, ctx = cv.getContext('2d');
    const b = w.bounds;
    const sw = b.x1 - b.x0, sh = b.y1 - b.y0, s = Math.min(cv.width / sw, cv.height / sh);
    ctx.fillStyle = '#eef1ea'; ctx.fillRect(0, 0, cv.width, cv.height);
    let max = 1;
    for (let i = 0; i < w.n; i++) max = Math.max(max, w.waitAcc[i]);
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
      const i = w.idx(x, y);
      let c = null;
      if (w.terrain[i] === T_WATER) c = '#bfe0ee';
      if (w.road[i]) {
        const f = Math.sqrt(w.waitAcc[i] / max);
        c = f > 0.02 ? `hsl(${50 - f * 50}, 95%, ${60 - f * 18}%)` : '#9aa0a6';
      }
      if (w.bld[i] >= 0) c = PALETTE[w.buildings[w.bld[i]].pi].hex;
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect((x - b.x0) * s, (y - b.y0) * s, s + 0.5, s + 0.5);
    }
  }

  // Hauptmenü
  showMenu() {
    const app = this.app, prog = app.progress;
    this.modalKind = 'menu';
    const inGame = app.game && !app.game.over && !app.attract;
    if (inGame) app.setPaused(true);
    const cities = CITIES.map(c => {
      const p = prog.cities[c.id] || {};
      const open = app.cityUnlocked(c);
      const medals = [0, 1, 2].map(k => `<i class="${(p.medal === undefined ? -1 : p.medal) >= k ? 'm' + (k + 1) : ''}">${ICON.star}</i>`).join('');
      return `<button class="city${open ? '' : ' locked'}" data-a="${open ? 'city' : ''}" data-id="${c.id}">
        <span class="c-name">${esc(c.name)}</span><span class="c-sub">${esc(c.sub)}</span>
        <span class="c-best">${open ? (p.plays ? 'Rekord ' + fmtInt(p.best || 0) : 'Noch nicht gespielt') : ICON.lock + ' ' + esc(app.unlockText(c))}</span>
        <span class="c-medals">${medals}</span></button>`;
    }).join('');
    const daily = app.dailyInfo();
    const rank = app.rankInfo();
    this.openModal(`
      <div class="menu-head"><div class="logo">Verkehrs<span>meister</span></div><div class="tag">Halte die Stadt in Bewegung.</div></div>
      ${inGame ? `<button class="btn primary wide" data-a="resume">Weiterspielen</button>` : ''}
      <div class="cities">${cities}</div>
      <button class="daily" data-a="daily"><span class="d-ic">${ICON.calendar}</span><span><b>Tageschallenge</b> · ${esc(daily.city.name)}<br><span class="dim">${esc(daily.mod.name)}: ${esc(daily.mod.desc)}${daily.best ? ' · heute bester: ' + fmtInt(daily.best) : ''}</span></span></button>
      <div class="rank">${ICON.rank}<span>Rang: <b>${esc(rank.name)}</b> · ${fmtInt(rank.total)} Punkte insgesamt${rank.next ? ` · nächster Rang bei ${fmtInt(rank.next.at)}` : ''}</span></div>
      <div class="menu-foot">
        <button class="btn small" data-a="help">${ICON.help} Anleitung</button>
        <button class="btn small" data-a="toggle-sound">${AUDIO.enabled ? ICON.sound + ' Ton an' : ICON.mute + ' Ton aus'}</button>
        <button class="btn small" data-a="toggle-music">${ICON.music} Musik ${AUDIO.musicOn ? 'an' : 'aus'}</button>
        <button class="btn small" data-a="toggle-quality">${ICON.gear} Grafik: ${app.quality === 2 ? 'hoch' : app.quality === 1 ? 'mittel' : 'niedrig'}</button>
      </div>
    `, 'menu');
  }

  showHelp() {
    this.modalKind = 'help';
    const t = this.touch;
    this.openModal(`
      <div class="wk-title">So geht's</div>
      <div class="help">
        <p><b>Ziel:</b> Häuser schicken ihre Autos zu Zielen derselben Farbe. Jede erledigte Fahrt zählt. Hat ein Ziel mehr als 6 offene Aufträge, füllt sich ein roter Ring – ist er voll, steht die Stadt still. Jedes Haus erzeugt Aufträge, auch wenn es noch nicht angeschlossen ist – liefern kann es aber erst mit Straße.</p>
        <p><b>Straßen</b> ${t ? 'ziehst du mit einem Finger' : 'ziehst du mit gedrückter linker Maustaste'}. Über Wasser entstehen Brücken (bis 4 Felder), durch Berge Tunnel (bis 5 Felder) – beide brauchen ein Bauteil aus dem Inventar. <b>Abreißen:</b> ${t ? 'unten den Abriss-Knopf (Radiergummi) wählen und über die Straße ziehen' : 'mit der rechten Maustaste ziehen'} – das gibt die Teile zurück.</p>
        <p><b>Vorfahrt:</b> ${t ? 'Wisch' : 'Zieh'} entlang einer bestehenden Straße über eine Kreuzung – diese Richtung wird Hauptstraße. Ohne Regel gilt rechts vor links: Bei Querverkehr muss dort jeder fast anhalten.</p>
        <p><b>Ampeln</b> schalten selbst nach Bedarf, <b>Kreisel</b> sind flüssig bei Verkehr aus allen Richtungen, die <b>Autobahn</b> ist eine gerade Hochstraße über Straßen, Wasser und Gleise hinweg. Die <b>Polizei</b> regelt eine Kreuzung 15 Sekunden lang von Hand. ${t ? 'Werkzeug unten wählen und die Kreuzung antippen.' : 'Tasten 2, 3, 4 und P.'}</p>
        <p><b>Stau-Lupe:</b> ${t ? 'Tipp' : 'Klick'} auf ein Auto, eine Kreuzung oder ein Ziel zeigt, was los ist. Dunkle Schilder markieren die größten Engstellen samt Ursache.</p>
        <p><b>Kamera:</b> ${t ? 'Mit zwei Fingern schieben, zoomen und drehen.' : 'Mausrad zoomen, mittlere Maustaste oder Umschalt+Ziehen bzw. WASD verschieben, Q/E drehen. Leertaste Pause, Tab Tempo, Strg+Z rückgängig.'}</p>
        <p><b>Sparsam bauen lohnt sich:</b> Straßen sind knapp, und jede Straße, die am Wochenende noch im Inventar liegt, bringt ${CFG.savingsBonus} Punkte Sparprämie. Autos parken kurz am Ziel, bevor sie heimfahren – ein Ziel braucht deshalb mehrere angeschlossene Häuser.</p>
        <p><b>Wochen:</b> Nach fünf Tagen gibt es ${CFG.weekRoads} neue Straßen und du wählst eine von drei Karten.</p>
      </div>
      <button class="btn primary" data-a="back">Zurück</button>
    `, 'help');
  }

  // ---- Tutorial -----------------------------------------------------------------------
  // Kleine Lektionen, ausgelöst von dem, was gerade in der Stadt passiert
  startTutorial() {
    this.tut = { t: 0, done: {}, cur: null, curT: 0, unconT: new Map() };
    this.lesson('build', (this.touch ? 'Zieh mit dem Finger' : 'Zieh mit gedrückter Maustaste') + ' eine Straße von einem <b>Haus</b> zur <b>Bäckerei</b>.');
  }

  lesson(key, html) {
    const T = this.tut;
    T.done[key] = true; T.cur = key; T.curT = 0;
    this.showTut(html);
  }

  showTut(html) {
    this.tutEl.innerHTML = `<span class="tut-ic">${ICON.help}</span><span>${html}</span><button class="x" data-tut="skip" title="Tutorial beenden">${ICON.close}</button>`;
    this.tutEl.classList.add('show');
    const x = this.tutEl.querySelector('[data-tut=skip]');
    x.onclick = () => { this.endTutorial(); };
  }

  hideTut() { this.tut.cur = null; this.tutEl.classList.remove('show'); }

  endTutorial() {
    this.tut = null;
    this.tutEl.classList.remove('show');
    this.app.overlay.hint = null;
    this.app.progress.tutDone = true;
    this.app.saveProgress();
  }

  updateTutorial(dt) {
    const T = this.tut, g = this.app.game;
    if (!T || !g) return;
    // solange die Tipp-Box nicht zu sehen ist, läuft nichts weiter (sonst verpasst man Lektionen)
    if (this.tutEl.style.visibility === 'hidden' || this.modalOpen || g.phase === 'week') return;
    T.t += dt; T.curT += dt;
    const ov = this.app.overlay, D = T.done, city = g.city;
    const conn = city.houses.filter(h => h.conn);
    // wie lange ist jedes Haus schon ohne Anschluss?
    for (const h of city.houses) { if (h.conn) T.unconT.delete(h); else T.unconT.set(h, (T.unconT.get(h) || 0) + dt); }
    let hint = null;
    if (T.cur === 'build') {
      const h = city.houses.find(x => !x.conn);
      if (h) hint = { x: h.x + 0.5, y: h.y + 0.5, z: 0.6 };
      if (conn.length) this.lesson('wait', 'Prima! Gleich fährt das erste Auto los und holt einen <b>Auftrag</b> bei der Bäckerei ab.');
    } else if (T.cur === 'wait') {
      if (g.score >= 1) this.lesson('orders', 'Jede Lieferung bringt einen Punkt. Mehr als <b>6 offene Aufträge</b> an einem Ziel lassen den <b>roten Ring</b> laufen – ist er voll, steht die Stadt still.');
    } else if (T.cur === 'orders' && T.curT > 9) this.hideTut();
    else if (T.cur === 'houses') {
      const h = T.houseFocus;
      if (h && !h.conn) hint = { x: h.x + 0.5, y: h.y + 0.5, z: 0.6 };
      if (!h || h.conn || T.curT > 14) this.hideTut();
    } else if (T.cur === 'newdest') {
      const d = T.destFocus;
      if (d) hint = { x: d.cx, y: d.cy, z: 1.3 };
      if (!d || d.nhc > 0 || T.curT > 16) this.hideTut();
    } else if ((T.cur === 'junction' && (T.curT > 12 || [...g.world.junctions].some(J => J.type !== 'auto'))) || (T.cur === 'roads' && T.curT > 11)) this.hideTut();
    // nächste Lektion, wenn gerade keine läuft
    if (!T.cur && D.orders) {
      const newDest = city.dests.find(d => d !== city.dests[0] && city.dests.slice(0, city.dests.indexOf(d)).every(o => o.pi !== d.pi) && !d.nhc);
      let oldest = null, ot = 8;
      for (const [h, t] of T.unconT) if (t > ot && city.dests.some(d => d.pi === h.pi)) { ot = t; oldest = h; }
      if (newDest && !D.newdest) {
        T.destFocus = newDest;
        const P = PALETTE[newDest.pi];
        this.lesson('newdest', `Neue Farbe! Verbinde die <b style="color:${P.hex}">${HOUSE_ADJ[newDest.pi]} Häuser</b> mit ${P.article} <b>${P.name}</b>.`);
      } else if (oldest && !D.houses) {
        T.houseFocus = oldest;
        this.lesson('houses', 'Es kommen immer neue Häuser dazu. Jedes will Aufträge erledigen – liefern kann es aber nur mit Straße. <b>Verbinde es</b>, aber bau sparsam.');
      } else if (!D.junction && g.world.junctions.size > 0) {
        this.lesson('junction', 'Kreuzungen bremsen: ' + (this.touch ? 'Wisch' : 'Zieh') + ' <b>entlang der Straße über die Kreuzung hinweg</b>, um Vorfahrt zu geben – oder setz einen <b>Kreisel</b> ' + (this.touch ? '(unten wählen, Kreuzung antippen).' : '(Taste 3).'));
      } else if (!D.roads && g.inv.roads <= 12) {
        this.lesson('roads', 'Straßen sind knapp: Nachschub gibt es erst am Wochenende – und jede <b>übrige Straße</b> bringt dann ' + CFG.savingsBonus + ' Punkte <b>Sparprämie</b>. ' + (this.touch ? 'Der <b>Abriss</b>-Knopf' : '<b>Rechtsklick-Ziehen</b>') + ' gibt Straßen zurück.');
      }
    }
    // in Woche 1 zeigt der Pfeil auf das am längsten unverbundene Haus
    if (!hint && g.week === 1 && T.cur !== 'orders') {
      let oldest = null, ot = 10;
      for (const [h, t] of T.unconT) if (t > ot && city.dests.some(d => d.pi === h.pi)) { ot = t; oldest = h; }
      if (oldest) hint = { x: oldest.x + 0.5, y: oldest.y + 0.5, z: 0.6 };
    }
    ov.hint = hint;
    if (g.week >= 2 && !T.cur && D.junction && D.roads) this.endTutorial();
    else if (g.week >= 3 && !T.cur) this.endTutorial();
  }

}
