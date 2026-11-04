/**
 * D5 (Brief §12.5): every key the game handles is listed in the help overlay – and the help lists no key that does nothing
 * (docs/UI_DESIGN.md §4: "R … noch ohne Funktion → nicht anzeigen").
 *
 * Handled keys are extracted from the sources (src/**\/*.ts) with regexes:
 *   - `<e>.key === 'X'` / `!==` and `<e>.code === 'X'` / `!==` (e, ev, event)
 *   - `<e>.code.startsWith('Arrow')` → the four arrow keys
 *   - `keys.has('KeyA')`-style lookups of a pressed-code set (any `.has('<KeyboardEvent.code>')`)
 *   - `const k = <e>.key.toLowerCase()` → every `k === 'x'` and every `case 'x':` inside `switch (k) { … }`
 *   - a comparison on a line that also tests `e.ctrlKey` / `e.metaKey` WITHOUT negation is a combo (Ctrl+X / Cmd+X)
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
function handledKeys(): Found[] {
  const out: Found[] = [];
  const add = (key: string, file: string, line: string) => {
    const k = norm(key);
    const ctrl = /(?<!!)\b(?:e|ev|event)\.ctrlKey/.test(line), meta = /(?<!!)\b(?:e|ev|event)\.metaKey/.test(line);
    const where = `${file.replace(ROOT, '')}: ${line.trim().slice(0, 90)}`;
    if (ctrl) out.push({ key: `Ctrl+${k}`, where });
    if (meta) out.push({ key: `Cmd+${k}`, where });
    if (!ctrl && !meta) out.push({ key: k, where });
  };
  for (const f of files(SRC)) {
    const src = readFileSync(f, 'utf8');
    const lines = src.split('\n');
    lines.forEach(line => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      for (const m of line.matchAll(/\b(?:e|ev|event)\.(?:key|code)\s*[!=]==?\s*'([^']+)'/g)) add(m[1], f, line);
      for (const m of line.matchAll(/'([^']+)'\s*[!=]==?\s*(?:e|ev|event)\.(?:key|code)\b/g)) add(m[1], f, line);
      for (const m of line.matchAll(/\b(?:e|ev|event)\.(?:code|key)\.startsWith\('([^']+)'\)/g)) {
        if (m[1] === 'Arrow') for (const a of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) add(a, f, line);
        else add(m[1], f, line);
      }
      for (const m of line.matchAll(/\.has\('((?:Key[A-Z])|(?:Digit\d)|(?:Arrow\w+)|Space|Escape|Delete)'\)/g)) add(m[1], f, line);
    });
    // `const k = e.key.toLowerCase()`: comparisons with k and `case` labels of `switch (k)` – only inside the block
    // (function body) that declares k, so unrelated variables named k elsewhere in the file are not mistaken for keys
    for (const d of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:e|ev|event)\.key\.toLowerCase\(\)/g)) {
      const v = d[1];
      let depth = 0, start = d.index!;
      for (; start > 0; start--) { if (src[start] === '}') depth++; else if (src[start] === '{' && depth-- === 0) break; }
      depth = 0; let end = start;
      for (let i = start; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) { end = i; break; } }
      const body = src.slice(start, end + 1);
      for (const line of body.split('\n')) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        for (const m of line.matchAll(new RegExp(`\\b${v}\\s*[!=]==?\\s*'([^']+)'`, 'g'))) add(m[1], f, line);
      }
      for (const m of body.matchAll(new RegExp(`switch\\s*\\(\\s*${v}\\s*\\)\\s*\\{`, 'g'))) {
        let dd = 0, j = m.index! + m[0].length - 1, e2 = j;
        for (; j < body.length; j++) { if (body[j] === '{') dd++; else if (body[j] === '}' && --dd === 0) { e2 = j; break; } }
        for (const c of body.slice(m.index!, e2).matchAll(/case\s+'([^']+)'\s*:/g)) add(c[1], f, `switch (${v}) case '${c[1]}'`);
      }
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
