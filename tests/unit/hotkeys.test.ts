/**
 * D5 (Brief §12.5): every key the game handles is listed in the help overlay – and the help lists no key that does nothing
 * (docs/UI_DESIGN.md §4: "R … noch ohne Funktion → nicht anzeigen").
 *
 * Handled keys are extracted from the sources (src/**\/*.ts) with regexes (any receiver name: e, ev, evt, event, …):
 *   - `<x>.key === 'X'` / `!==`, `<x>.code === 'X'`, also case-folded (`<x>.key.toLowerCase() === 'x'`) and reversed
 *   - `<x>.code.startsWith('Arrow')` → the four arrow keys; `['a', 'b'].includes(<x>.key)`
 *   - `keys.has('KeyA')`-style lookups of a pressed-code set (any `.has('<KeyboardEvent.code>')`)
 *   - `switch (<x>.key) { case 'x': … }` (also case-folded)
 *   - `const k = <x>.key[.toLowerCase()]` / `const { key } = <x>` → every `k === 'x'` and `case 'x':` of `switch (k)`
 *   - a comparison on a line that also tests `<x>.ctrlKey` / `<x>.metaKey` WITHOUT negation is a combo (Ctrl+X / Cmd+X)
 * Fail-safe: every keydown/keyup/keypress listener in src/ must yield at least one extracted key from its handler body,
 * so a handler written in a form the regexes do not know turns the test red instead of silently passing.
 * Keys of the help overlay come from the help key table in src/ui/modals.ts (`helpRow(…, [[caps]], …)`): string caps and
 * `{ k: 'overlays.key.<name>' }` caps (resolved by key name, so the check is language independent; both languages must
 * have the text). Everything is normalised to one spelling: letters upper case, Esc, Del, Space, Shift, ↑ ← ↓ →, Ctrl+Z, Cmd+Z.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tableOf } from '../../src/i18n/i18n';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(ROOT, 'src');

/** Tab only moves the keyboard focus (the help modal keeps it inside the dialog): browser navigation, not a game hotkey */
const BROWSER_NATIVE = new Set(['Tab']);

const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
});

const ARROWS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Up: '↑', Down: '↓', Left: '←', Right: '→' };
/** one spelling for KeyboardEvent.key, KeyboardEvent.code and help caps */
function norm(raw: string): string {
  const s = raw.trim();
  if (ARROWS[s]) return ARROWS[s];
  if (/^[↑↓←→]$/.test(s)) return s;
  if (/^Key[A-Z]$/.test(s)) return s.slice(3);
  if (/^(Digit|Numpad)\d$/.test(s)) return s.slice(-1);
  const l = s.toLowerCase();
  if (l === 'escape' || l === 'esc') return 'Esc';
  if (l === 'delete' || l === 'del') return 'Del';
  if (l === ' ' || l === 'space' || l === 'spacebar') return 'Space';
  if (l === 'shift' || l === 'shiftleft' || l === 'shiftright') return 'Shift';
  if (l === 'control' || l === 'ctrl') return 'Ctrl';
  if (l === 'meta' || l === 'cmd') return 'Cmd';
  if (l === 'tab') return 'Tab';
  if (l === 'enter') return 'Enter';
  if (l === 'backspace') return 'Backspace';
  if (s.length === 1) return s.toUpperCase();
  return s;
}

interface Found { key: string; where: string }
/** any receiver: e, ev, evt, event, ke, ev?.… */
const RX = String.raw`\b[A-Za-z_$][\w$]*\??`;
/** `.key` / `.code`, optionally case-folded */
const KC = String.raw`\.(?:key|code)(?:\.to(?:Lower|Upper)Case\(\))?`;
/** text of the `{ … }` block that starts at `open` (index of the opening brace) */
function blockAt(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1); }
  return src.slice(open);
}
/** keys compared / switched on in `src` (a whole file or one handler body) */
function extractKeys(src: string, file: string): Found[] {
  const out: Found[] = [];
  const add = (key: string, line: string) => {
    const k = norm(key);
    const ctrl = new RegExp(String.raw`(?<!!)${RX}\.ctrlKey`).test(line), meta = new RegExp(String.raw`(?<!!)${RX}\.metaKey`).test(line);
    const where = `${file.replace(ROOT, '')}: ${line.trim().slice(0, 90)}`;
    if (ctrl) out.push({ key: `Ctrl+${k}`, where });
    if (meta) out.push({ key: `Cmd+${k}`, where });
    if (!ctrl && !meta) out.push({ key: k, where });
  };
  const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);
  /** `case 'x':` labels of every `switch (<subject>) { … }` whose subject matches `subj` */
  const cases = (text: string, subj: string) => {
    for (const m of text.matchAll(new RegExp(String.raw`switch\s*\(\s*${subj}\s*\)\s*\{`, 'g'))) {
      const body = blockAt(text, m.index! + m[0].length - 1);
      for (const c of body.matchAll(/case\s+'([^']+)'\s*:/g)) add(c[1], `switch (${m[0].slice(0, 40)}) case '${c[1]}'`);
    }
  };
  for (const line of src.split('\n')) {
    if (isComment(line)) continue;
    for (const m of line.matchAll(new RegExp(String.raw`${RX}${KC}\s*[!=]==?\s*'([^']+)'`, 'g'))) add(m[1], line);
    for (const m of line.matchAll(new RegExp(String.raw`'([^']+)'\s*[!=]==?\s*${RX}${KC}\b`, 'g'))) add(m[1], line);
    for (const m of line.matchAll(new RegExp(String.raw`${RX}${KC}\.startsWith\('([^']+)'\)`, 'g'))) {
      if (m[1] === 'Arrow') for (const a of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) add(a, line);
      else add(m[1], line);
    }
    // ['a', 'b'].includes(e.key)
    for (const m of line.matchAll(new RegExp(String.raw`\[([^\]]*)\]\.includes\(\s*${RX}${KC}\s*\)`, 'g'))) for (const q of m[1].matchAll(/'([^']+)'/g)) add(q[1], line);
    for (const m of line.matchAll(/\.has\('((?:Key[A-Z])|(?:Digit\d)|(?:Arrow\w+)|Space|Escape|Delete)'\)/g)) add(m[1], line);
  }
  // switch (e.key) / switch (evt.code.toLowerCase())
  cases(src, `${RX}${KC}`);
  // `const k = e.key.toLowerCase()` / `const { key } = e`: comparisons with the variable and `case` labels of
  // `switch (k)` – only inside the block (function body) that declares it, so unrelated variables with the same name
  // elsewhere in the file are not mistaken for keys
  const decls = [
    ...[...src.matchAll(new RegExp(String.raw`(?:const|let|var)\s+(\w+)\s*=\s*${RX}${KC}\s*[;\n]`, 'g'))].map(d => ({ v: d[1], at: d.index! })),
    ...[...src.matchAll(new RegExp(String.raw`(?:const|let|var)\s*\{([^}]*)\}\s*=\s*${RX}\s*[;\n]`, 'g'))].flatMap(d =>
      [...d[1].matchAll(/\b(key|code)\b(?:\s*:\s*(\w+))?/g)].map(x => ({ v: x[2] ?? x[1], at: d.index! }))),
  ];
  for (const { v, at } of decls) {
    let depth = 0, start = at;
    for (; start > 0; start--) { if (src[start] === '}') depth++; else if (src[start] === '{' && depth-- === 0) break; }
    const body = blockAt(src, start);
    for (const line of body.split('\n')) {
      if (isComment(line)) continue;
      for (const m of line.matchAll(new RegExp(String.raw`\b${v}\s*[!=]==?\s*'([^']+)'`, 'g'))) add(m[1], line);
      for (const m of line.matchAll(new RegExp(String.raw`'([^']+)'\s*[!=]==?\s*${v}\b`, 'g'))) add(m[1], line);
    }
    cases(body, v);
  }
  return out;
}
function handledKeys(): Found[] {
  return files(SRC).flatMap(f => extractKeys(readFileSync(f, 'utf8'), f));
}

/**
 * Every keyboard listener in src/ (addEventListener('keydown' | 'keyup' | 'keypress', …) and on…= assignments) with
 * the body of its handler (inline arrow / function, or the named const / function it refers to).
 */
function keyListeners(): { file: string; what: string; body: string | null }[] {
  const out: { file: string; what: string; body: string | null }[] = [];
  for (const f of files(SRC)) {
    const src = readFileSync(f, 'utf8');
    // the handler text is a lookahead, so two listeners on adjacent lines are both matched
    const re = /(?:addEventListener\(\s*'(key(?:down|up|press))'\s*,\s*|\.on(key(?:down|up|press))\s*=\s*)(?=([\s\S]{0,200}))/g;
    for (const m of src.matchAll(re)) {
      const rest = m[3];
      const what = `${f.replace(ROOT, '')}: ${(m[0] + rest).slice(0, 80).replace(/\s+/g, ' ')}`;
      let body: string | null = null;
      const inline = rest.match(/^(?:async\s*)?(?:function\s*\w*\s*\([^)]*\)|\([^)]*\)|\w+)\s*(?::\s*[\w<>]+\s*)?(?:=>)?\s*\{/);
      if (inline) body = blockAt(src, m.index! + m[0].length + inline[0].length - 1);
      else {
        const inlineExpr = rest.match(/^(?:\([^)]*\)|\w+)\s*=>\s*([^,)][^\n]*)/);
        const name = rest.match(/^([A-Za-z_$][\w$]*)\s*[,)]/);
        if (name) {
          const def = new RegExp(String.raw`(?:function\s+${name[1]}\s*\([^)]*\)\s*(?::\s*\w+\s*)?\{|(?:const|let)\s+${name[1]}\s*=\s*(?:\([^)]*\)|\w+)\s*(?::\s*\w+\s*)?=>\s*\{)`).exec(src);
          if (def) body = blockAt(src, def.index + def[0].length - 1);
        } else if (inlineExpr) body = inlineExpr[1];
      }
      out.push({ file: f, what, body });
    }
  }
  return out;
}

interface HelpCap { key: string; via: string }
const IS_KEY = /^(?:[A-Z0-9]|F\d{1,2}|Esc|Del|Space|Shift|Ctrl|Cmd|Tab|Enter|Backspace|[↑↓←→])$/;
/** keys listed in the help key table (modals.ts helpRow calls) */
function helpKeys(): HelpCap[] {
  const src = readFileSync(join(SRC, 'ui/modals.ts'), 'utf8');
  const out: HelpCap[] = [];
  const en = tableOf('en'), de = tableOf('de');
  const KEYNAME: Record<string, string> = { esc: 'Esc', del: 'Del', ctrl: 'Ctrl', shift: 'Shift', space: 'Space', cmd: 'Cmd', tab: 'Tab', enter: 'Enter' };
  for (const m of src.matchAll(/helpRow\(\s*\w+\s*,\s*(\[[\s\S]*?\])\s*,\s*'(overlays\.help\.\w+)'/g)) {
    // the caps argument is a literal: Cap[][] – a list of alternatives, each a combo of caps; a cap is 'X',
    // { k: 'overlays.key.x' } or a set ['W','A','S','D'] (each key of a set counts on its own). Parse it as JSON.
    const json = m[1].replace(/\{\s*k:\s*'overlays\.key\.(\w+)'\s*\}/g, '"@$1"').replace(/'([^']*)'/g, (_, x: string) => JSON.stringify(x));
    let alts: unknown;
    try { alts = JSON.parse(json); } catch { throw new Error(`cannot parse help caps ${m[1]} (${m[2]})`); }
    for (const combo of alts as unknown[][]) {
      const items: string[] = [];
      for (const cap of combo) {
        if (Array.isArray(cap)) { for (const s of cap as string[]) if (IS_KEY.test(norm(s))) out.push({ key: norm(s), via: m[2] }); continue; }
        const c = String(cap);
        if (c.startsWith('@')) {
          const name = c.slice(1);
          expect(en[`overlays.key.${name}`], `EN text for overlays.key.${name}`).toBeTruthy();
          expect(de[`overlays.key.${name}`], `DE text for overlays.key.${name}`).toBeTruthy();
          items.push(KEYNAME[name] ?? `~${name}`); // other overlays.key.* are mouse/touch gestures
        } else items.push(norm(c));
      }
      // gestures (~name) and on-screen symbols such as the touch ✓ / ✕ buttons are not keys
      const real = items.filter(x => IS_KEY.test(x));
      if (!real.length) continue;
      out.push({ key: real.join('+'), via: m[2] }); // a combo counts as the combo (Ctrl+Z), Space + drag as Space

    }
  }
  return out;
}

describe('D5 hotkeys ↔ help overlay', () => {
  const handled = handledKeys();
  const help = helpKeys();
  const handledSet = new Set(handled.map(h => h.key).filter(k => !BROWSER_NATIVE.has(k)));
  const helpSet = new Set(help.map(h => h.key));

  it('the extraction finds the documented hotkeys (sanity)', () => {
    for (const k of ['B', 'O', 'H', 'P', '1', '2', '3', 'Del', 'Esc', 'Ctrl+Z', 'W', 'A', 'S', 'D', '↑', 'Space']) expect(handledSet.has(k), `handled: ${k}  (found: ${[...handledSet].sort().join(' ')})`).toBe(true);
    expect(helpSet.size, `help keys: ${[...helpSet].join(' ')}`).toBeGreaterThan(10);
  });

  it('the extraction recognises the common handler spellings (self-check on planted source)', () => {
    const planted = [
      "window.addEventListener('keydown', evt => { if (evt.key === 'q') go(); });",
      "function onKey(e: KeyboardEvent) { switch (e.key) { case 'g': a(); break; case 'Enter': b(); } }",
      "const f = (ev: KeyboardEvent) => { if (ev.key.toLowerCase() === 'x') c(); if ('j' === ev.code) d(); };",
      "const h2 = (ke: KeyboardEvent) => { const { key } = ke; if (key === 'n') e1(); };",
      "const h3 = (e: KeyboardEvent) => { const kk = e.code; switch (kk) { case 'KeyT': t1(); } if (['KeyU', 'KeyV'].includes(e.code)) u(); };",
      "const h4 = (e: KeyboardEvent) => { if (e.key === 'm' && e.ctrlKey) m1(); };",
    ].join('\n');
    const got = new Set(extractKeys(planted, 'planted.ts').map(k => k.key));
    for (const k of ['Q', 'G', 'Enter', 'X', 'J', 'N', 'T', 'U', 'V', 'Ctrl+M']) expect(got.has(k), `planted ${k} found (got ${[...got].join(' ')})`).toBe(true);
  });

  it('every keyboard listener in src/ yields at least one extracted key (fail-safe for the extraction)', () => {
    const ls = keyListeners();
    expect(ls.length, 'keyboard listeners found').toBeGreaterThanOrEqual(5);
    const bad = ls.filter(l => !l.body || extractKeys(l.body, l.file).length === 0).map(l => `${l.what}${l.body ? '' : '  (handler body not found)'}`);
    expect(bad, 'keyboard listeners whose keys the extraction cannot see – extend extractKeys() so D5 checks them').toEqual([]);
  });

  it('every key the game handles is listed in the help overlay', () => {
    const missing = [...handledSet].filter(k => !helpSet.has(k)).sort();
    const detail = missing.map(k => `${k}  ←  ${handled.filter(h => h.key === k).map(h => h.where).slice(0, 2).join(' | ')}`);
    expect(detail, `keys handled in src/ but missing from the help key table in src/ui/modals.ts:\n${detail.join('\n')}`).toEqual([]);
  });

  it('the help overlay lists no key without a handler', () => {
    const extra = [...helpSet].filter(k => !handledSet.has(k) && !BROWSER_NATIVE.has(k)).sort();
    expect(extra.map(k => `${k} (${help.find(h => h.key === k)!.via})`), 'help lists keys the game does not handle').toEqual([]);
  });

  it('every hotkey named in a tooltip is a handled key', () => {
    const bad: string[] = [];
    for (const f of files(join(SRC, 'ui'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/hotkey:\s*'([^']+)'/g)) if (!handledSet.has(norm(m[1])) && !handledSet.has(m[1])) bad.push(`${f.replace(ROOT, '')}: ${m[1]}`);
      const sk = src.match(/SPEED_KEY\s*(?::[^=]*)?=\s*\[([^\]]*)\]/);
      if (sk) for (const s of sk[1].matchAll(/'([^']+)'/g)) if (!handledSet.has(norm(s[1]))) bad.push(`${f.replace(ROOT, '')}: SPEED_KEY ${s[1]}`);
    }
    expect(bad).toEqual([]);
  });
});
