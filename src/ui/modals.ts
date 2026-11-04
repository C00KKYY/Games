/**
 * Modals (docs/UI_DESIGN.md §3, Brief §7.5, §11.1): Settings and Help on a dimmed backdrop.
 * × button, backdrop click and Escape close. Opening pauses the game, closing restores the pause state from before.
 * While a modal is open, game hotkeys are held back (the keydown is stopped in the capture phase).
 */
import './overlays.css';
import type { UICtx, Component } from './ctx';
import type { Key, Lang } from '../i18n/i18n';
import type { Settings } from '../save/serialize';
import { SLOT_KEYS } from '../save/serialize';
import { version } from '../../package.json';

type Name = 'settings' | 'help';
const SAVE_PREFIX = 'rrl';

export function mountModals(ctx: UICtx): Component & { open(name: Name): void; close(): void; isOpen(): boolean } {
  const { t } = ctx;

  // ------------------------------------------------------------------ helpers
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', parent?: HTMLElement, text?: string) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    parent?.appendChild(el);
    return el;
  };
  const img = (src: string, parent: HTMLElement, className = '') => { const i = h('img', className, parent); i.src = src; i.alt = ''; i.draggable = false; return i; };
  const button = (className: string, parent: HTMLElement, fid: string, label: string, tip: () => { title: string; body?: string; hotkey?: string }, onClick: () => void) => {
    const b = h('button', className, parent);
    b.type = 'button';
    b.dataset.fid = fid;
    b.setAttribute('aria-label', label);
    b.dataset.tip = '1';
    ctx.tip(b, tip);
    b.addEventListener('click', e => { e.stopPropagation(); ctx.sound('click'); onClick(); });
    return b;
  };
  const pct = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100);
  const setSetting = (patch: Partial<Settings>) => ctx.settings.set({ ...ctx.settings.get(), ...patch });

  // ------------------------------------------------------------------ skeleton
  const back = h('div', 'ov-modal');
  back.dataset.overlay = '1';
  back.hidden = true;
  if (ctx.touch) back.classList.add('touch');
  const card = h('div', 'ov-card', back);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'ov-modal-title');
  card.tabIndex = -1;
  const head = h('div', 'ov-head', card);
  const headIcon = img(ctx.icon('gear'), head, 'ov-head-ic');
  const title = h('h2', 'ov-title', head);
  title.id = 'ov-modal-title';
  const xBtn = button('ov-x', head, 'x', '', () => ({ title: t('overlays.close'), body: t('overlays.closeBody'), hotkey: t('overlays.key.esc') }), () => close());
  img(ctx.icon('close'), xBtn);
  const body = h('div', 'ov-body', card);
  ctx.root.appendChild(back);
  back.addEventListener('pointerdown', e => { if (e.target === back) downOnBack = true; });
  back.addEventListener('click', e => { if (e.target === back && downOnBack) close(); downOnBack = false; });
  let downOnBack = false;

  // ------------------------------------------------------------------ state
  let current: Name | null = null;
  let pausedBefore = false;
  let focusBefore: Element | null = null;
  let renderedLang: Lang | null = null;
  let resetStep = 0;
  let acc = 0;
  /** elements refreshed from settings in update() */
  let sync: (() => void)[] = [];
  const memo = new WeakMap<Element, Map<string, string>>();
  const put = (el: Element, k: string, v: string, apply: () => void) => {
    let m = memo.get(el); if (!m) { m = new Map(); memo.set(el, m); }
    if (m.get(k) === v) return; m.set(k, v); apply();
  };

  // ------------------------------------------------------------------ settings
  const section = (parent: HTMLElement, key: Key) => { const s = h('section', 'ov-sec', parent); h('h3', 'ov-h3', s, t(key)); return s; };

  const slider = (parent: HTMLElement, k: 'music' | 'sfx' | 'ambience', label: Key, body: Key) => {
    const row = h('label', 'ov-slider', parent);
    h('span', 'ov-lbl', row, t(label));
    const input = h('input', 'ov-range', row);
    input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '5';
    input.dataset.fid = `sl-${k}`;
    input.setAttribute('aria-label', t(label));
    input.value = String(pct(ctx.settings.get()[k]));
    const val = h('span', 'ov-val num', row);
    ctx.tip(input, () => ({ title: t(label), body: t(body, { n: pct(ctx.settings.get()[k]) }) }));
    input.addEventListener('input', () => setSetting({ [k]: Number(input.value) / 100 } as Partial<Settings>));
    sync.push(() => {
      const v = pct(ctx.settings.get()[k]);
      put(val, 'text', String(v), () => { val.textContent = t('overlays.pct', { n: v }); });
      put(input, 'value', String(v), () => { if (document.activeElement !== input) input.value = String(v); input.setAttribute('aria-valuetext', t('overlays.pct', { n: v })); });
      put(input, 'fill', String(v), () => { input.style.setProperty('--fill', `${v}%`); });
      const muted = ctx.settings.get().mute;
      put(row, 'muted', String(muted), () => row.classList.toggle('muted', muted));
    });
  };

  const toggle = (parent: HTMLElement, k: 'mute' | 'shake', label: Key, onBody: Key, offBody: Key) => {
    const b = button('ov-switch', parent, `sw-${k}`, t(label), () => ({ title: t(label), body: t(ctx.settings.get()[k] ? onBody : offBody) }), () => setSetting({ [k]: !ctx.settings.get()[k] } as Partial<Settings>));
    b.setAttribute('role', 'switch');
    h('span', 'ov-lbl', b, t(label));
    const st = h('span', 'ov-state', b);
    const track = h('span', 'ov-track', b); h('i', '', track);
    sync.push(() => {
      const on = ctx.settings.get()[k];
      put(b, 'on', String(on), () => { b.setAttribute('aria-checked', String(on)); b.classList.toggle('on', on); st.textContent = t(on ? 'overlays.on' : 'overlays.off'); });
    });
  };

  const renderSettings = () => {
    headIcon.src = ctx.icon('gear');
    title.textContent = t('hud.settings');
    const snd = section(body, 'overlays.sound');
    slider(snd, 'music', 'settings.music', 'overlays.musicBody');
    slider(snd, 'sfx', 'settings.sfx', 'overlays.sfxBody');
    slider(snd, 'ambience', 'settings.ambience', 'overlays.ambienceBody');
    toggle(snd, 'mute', 'overlays.mute', 'overlays.muteOnBody', 'overlays.muteOffBody');

    const gen = section(body, 'overlays.general');
    const langRow = h('div', 'ov-langrow', gen);
    h('span', 'ov-lbl', langRow, t('settings.language'));
    const seg = h('div', 'ov-seg', langRow);
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', t('settings.language'));
    for (const l of ['en', 'de'] as Lang[]) {
      const name = t(l === 'en' ? 'overlays.lang.en' : 'overlays.lang.de');
      const b = button('ov-segbtn', seg, `lang-${l}`, name, () => ({ title: name, body: t(l === 'en' ? 'overlays.lang.enBody' : 'overlays.lang.deBody') }), () => { if (ctx.lang() !== l) ctx.setLang(l); });
      h('span', 'ov-code', b, l.toUpperCase());
      h('span', 'ov-segname', b, name);
      sync.push(() => { const on = ctx.lang() === l; put(b, 'on', String(on), () => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); });
    }
    toggle(gen, 'shake', 'settings.shake', 'overlays.shakeOnBody', 'overlays.shakeOffBody');

    // reset with a two-step confirmation
    const rs = section(body, 'overlays.progress');
    const resetWrap = h('div', 'ov-reset', rs);
    const renderReset = () => {
      resetWrap.replaceChildren();
      if (resetStep === 0) {
        const b = button('ov-btn ov-danger-soft', resetWrap, 'reset', t('settings.reset'), () => ({ title: t('settings.reset'), body: t('overlays.resetBody') }), () => { resetStep = 1; renderReset(); focusFid('reset-no'); });
        b.textContent = t('settings.reset');
      } else {
        const box = h('div', 'ov-confirm', resetWrap);
        box.dataset.overlay = '1';
        h('p', 'ov-p', box, t('settings.resetConfirm'));
        const row = h('div', 'ov-btnrow', box);
        const no = button('ov-btn', row, 'reset-no', t('overlays.resetNo'), () => ({ title: t('overlays.resetNo'), body: t('overlays.resetNoBody'), hotkey: t('overlays.key.esc') }), () => { resetStep = 0; renderReset(); focusFid('reset'); });
        no.textContent = t('overlays.resetNo');
        const yes = button('ov-btn ov-danger', row, 'reset-yes', t('overlays.resetYes'), () => ({ title: t('overlays.resetYes'), body: t('overlays.resetYesBody') }), () => resetSave());
        yes.textContent = t('overlays.resetYes');
      }
    };
    renderReset();

    const cr = section(body, 'settings.credits');
    for (const k of ['overlays.credits.made', 'overlays.credits.fonts', 'overlays.credits.libs', 'overlays.credits.sound', 'overlays.credits.thanks'] as Key[]) h('p', 'ov-p', cr, t(k));
    h('p', 'ov-version', body, t('overlays.version', { v: version, build: typeof __BUILD__ === 'string' ? __BUILD__ : 'BASIC' }));
  };

  const resetSave = () => {
    try {
      const keys: string[] = [...SLOT_KEYS];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(SAVE_PREFIX)) keys.push(k); }
      for (const k of keys) localStorage.removeItem(k);
    } catch { /* storage blocked – nothing to clear */ }
    location.reload();
  };

  // ------------------------------------------------------------------ help
  /** a key cap: literal text, a translated key name, or a group of single keys shown side by side (W A S D) */
  type Cap = string | { k: Key } | string[];
  const caps = (parent: HTMLElement, list: Cap[][]) => {
    const w = h('span', 'ov-caps', parent);
    list.forEach((combo, i) => {
      if (i) h('span', 'ov-or', w, t('overlays.or'));
      const g = h('span', 'ov-combo', w);
      combo.forEach((c, j) => {
        if (j) h('span', 'ov-plus', g, '+');
        if (Array.isArray(c)) { const set = h('span', 'ov-set', g); for (const s of c) h('kbd', 'ov-key', set, s); }
        else h('kbd', 'ov-key', g, typeof c === 'string' ? c : t(c.k));
      });
    });
  };
  const helpRow = (parent: HTMLElement, list: Cap[][], desc: Key, vars?: Record<string, string | number>) => {
    const r = h('div', 'ov-hrow', parent);
    caps(r, list);
    h('span', 'ov-desc', r, t(desc, vars));
  };
  const renderHelp = () => {
    headIcon.src = ctx.icon('help');
    title.textContent = t('help.title');
    const mouse = () => {
      const s = section(body, 'overlays.help.mouse');
      helpRow(s, [[{ k: 'overlays.key.click' }]], 'overlays.help.click');
      helpRow(s, [[{ k: 'overlays.key.drag' }]], 'overlays.help.dragBuild');
      helpRow(s, [[{ k: 'overlays.key.edge' }]], 'overlays.help.edge');
      helpRow(s, [[{ k: 'overlays.key.rdrag' }], [{ k: 'overlays.key.mdrag' }]], 'overlays.help.pan');
      helpRow(s, [[{ k: 'overlays.key.space' }, { k: 'overlays.key.drag' }]], 'overlays.help.pan');
      helpRow(s, [[{ k: 'overlays.key.wheel' }]], 'overlays.help.zoom');
      helpRow(s, [[{ k: 'overlays.key.rclick' }]], 'overlays.help.rclick');
      helpRow(s, [[{ k: 'overlays.key.dblclick' }]], 'overlays.help.dbl');
      helpRow(s, [[{ k: 'overlays.key.hover' }]], 'overlays.help.hover');
    };
    const keyboard = () => {
      const s = section(body, 'overlays.help.keyboard');
      helpRow(s, [[['W', 'A', 'S', 'D']], [['↑', '←', '↓', '→']]], 'overlays.help.keysPan');
      helpRow(s, [['B']], 'overlays.help.b');
      helpRow(s, [[{ k: 'overlays.key.del' }]], 'overlays.help.del');
      helpRow(s, [['O']], 'overlays.help.o');
      helpRow(s, [['P']], 'overlays.help.p');
      helpRow(s, [['1'], ['2'], ['3']], 'overlays.help.speed');
      helpRow(s, [[{ k: 'overlays.key.ctrl' }, 'Z'], ['Cmd', 'Z']], 'overlays.help.undo');
      helpRow(s, [[{ k: 'overlays.key.shift' }]], 'overlays.help.shift');
      helpRow(s, [[{ k: 'overlays.key.esc' }]], 'overlays.help.esc');
      helpRow(s, [['H']], 'overlays.help.h');
    };
    const touch = () => {
      const s = section(body, 'overlays.help.touch');
      helpRow(s, [[{ k: 'overlays.key.tap' }]], 'overlays.help.tap');
      helpRow(s, [[{ k: 'overlays.key.oneFinger' }]], 'overlays.help.oneFinger');
      helpRow(s, [[{ k: 'overlays.key.twoFingers' }]], 'overlays.help.twoFingers');
      helpRow(s, [[{ k: 'overlays.key.long' }]], 'overlays.help.long');
      helpRow(s, [['✓'], ['✕']], 'overlays.help.confirm');
      helpRow(s, [[{ k: 'overlays.key.dbltap' }]], 'overlays.help.dbl');
    };
    if (ctx.touch) { touch(); mouse(); keyboard(); } else { mouse(); keyboard(); touch(); }
  };

  // ------------------------------------------------------------------ render / open / close
  const focusFid = (fid: string) => { const el = card.querySelector<HTMLElement>(`[data-fid="${fid}"]`); el?.focus({ preventScroll: true }); };
  const render = () => {
    if (!current) return;
    const fid = (document.activeElement as HTMLElement | null)?.dataset?.fid;
    const scroll = body.scrollTop;
    sync = [];
    body.replaceChildren();
    card.classList.toggle('help', current === 'help');
    xBtn.setAttribute('aria-label', t('overlays.close'));
    if (current === 'settings') renderSettings(); else renderHelp();
    renderedLang = ctx.lang();
    for (const f of sync) f();
    body.scrollTop = scroll;
    if (fid) focusFid(fid);
  };

  const open = (name: Name) => {
    if (current === name) return;
    if (!current) {
      pausedBefore = ctx.paused();
      ctx.setPaused(true);
      focusBefore = document.activeElement;
      back.hidden = false;
      requestAnimationFrame(() => back.classList.add('in'));
    }
    current = name; resetStep = 0;
    body.scrollTop = 0;
    render();
    body.scrollTop = 0;
    // focus the dialog itself (not the × button: that would pop its tooltip on every open)
    card.focus({ preventScroll: true });
  };
  const close = () => {
    if (!current) return;
    current = null; resetStep = 0;
    back.classList.remove('in');
    back.hidden = true;
    sync = [];
    body.replaceChildren();
    ctx.setPaused(pausedBefore);
    if (focusBefore instanceof HTMLElement && focusBefore.isConnected) focusBefore.focus({ preventScroll: true });
    focusBefore = null;
  };

  // keys: Escape closes (or steps back from the reset confirmation), H closes help, Tab stays inside, hotkeys held back
  const onKey = (e: KeyboardEvent) => {
    if (!current) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      e.preventDefault();
      if (resetStep) { resetStep = 0; render(); focusFid('reset'); } else close();
    } else if (k === 'h' && current === 'help' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); close();
    } else if (k === 'tab') {
      const f = [...card.querySelectorAll<HTMLElement>('button, input')].filter(el => !el.hidden && el.offsetParent !== null);
      if (f.length) {
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
      }
    }
    e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', onKey, true);

  return {
    open, close,
    isOpen: () => current !== null,
    update(dt) {
      if (!current) return;
      acc += dt;
      if (acc < 0.1) return; // ≤ 10 DOM passes per second
      acc = 0;
      if (renderedLang !== ctx.lang()) { render(); return; }
      const c = ctx.compact.get();
      put(card, 'compact', String(c), () => back.classList.toggle('compact', c));
      for (const f of sync) f();
    },
    destroy() { window.removeEventListener('keydown', onKey, true); back.remove(); },
  };
}
