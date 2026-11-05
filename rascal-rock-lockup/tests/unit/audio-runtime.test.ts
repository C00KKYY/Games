import { describe, it, expect, beforeEach } from 'vitest';
import { Mixer, DEDUPE_MS, RATE_MS, PITCH_VARY, busOf, resolveId, type CtxLike, type GainLike, type ParamLike, type SourceLike } from '../../src/audio/mixer';
import { cueFor } from '../../src/audio/events';
import { INITIAL, SFX, LOOPS, MUSIC, ALIAS } from '../../src/audio/manifest';
import type { SimEvent } from '../../src/sim/types';

// ------------------------------------------------------------------ fake WebAudio
class FParam implements ParamLike {
  value: number;
  target: number;
  constructor(v = 1) { this.value = v; this.target = v; }
  setTargetAtTime(v: number) { this.target = v; return this; }
  cancelScheduledValues() { return this; }
  setValueAtTime(v: number) { this.value = v; return this; }
}
class FNode { out: unknown[] = []; connect(d: unknown) { this.out.push(d); return d; } disconnect() { this.out = []; } }
class FGain extends FNode implements GainLike { gain = new FParam(1); }
class FSource extends FNode implements SourceLike {
  buffer: { duration: number } | null = null; loop = false; loopStart = 0; loopEnd = 0; playbackRate = new FParam(1);
  onended: (() => void) | null = null; started = -1; offset = 0; stopped = false;
  start(when = 0, offset = 0) { this.started = when; this.offset = offset; }
  stop() { this.stopped = true; }
}
class FCtx implements CtxLike {
  state = 'suspended'; currentTime = 0; destination = new FNode();
  gains: FGain[] = []; sources: FSource[] = []; resumes = 0;
  createGain() { const g = new FGain(); this.gains.push(g); return g; }
  createBufferSource() { const s = new FSource(); this.sources.push(s); return s; }
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
}
const buf = (d = 1) => ({ duration: d });

let t = 0;
let fc: FCtx;
let created = 0;
const mk = (rnd = () => 0.5) => {
  created = 0;
  return new Mixer({ now: () => t, random: rnd, create: () => { created++; fc = new FCtx(); return fc; } });
};
/** the bus a source plays into: source → voice gain → bus */
const busFor = (m: Mixer, s: FSource) => { const g = s.out[0] as FGain; const b = g.out[0]; return (Object.entries(m.buses).find(([, v]) => v === b) ?? [])[0]; };

beforeEach(() => { t = 1000; });

describe('audio runtime: manifest + routing', () => {
  it('initial bundle ≤ 12 sounds, all known ids, aliases resolve', () => {
    expect(INITIAL.length).toBeLessThanOrEqual(12);
    for (const id of INITIAL) expect(resolveId(id)).toBe(id);
    for (const [a, id] of Object.entries(ALIAS)) expect(resolveId(a)).toBe(id);
    expect(resolveId('nope')).toBeNull();
  });
  it('bus of every id', () => {
    for (const id of SFX) expect(busOf(id)).toBe('sfx');
    for (const id of LOOPS) expect(busOf(id)).toBe('ambience');
    for (const id of MUSIC) expect(busOf(id)).toBe('music');
  });
  it('master → destination, buses → master, voices → bus of their id', () => {
    const m = mk();
    m.unlock();
    expect(created).toBe(1);
    expect(m.master!.connect).toBeDefined();
    expect((m.master as unknown as FGain).out).toContain(fc.destination);
    for (const b of ['music', 'sfx', 'ambience'] as const) expect((m.buses[b] as unknown as FGain).out).toContain(m.master);
    m.setBuffer('stamp', buf()); m.setBuffer('musicDay', buf(30)); m.setBuffer('ambWaves', buf(20)); m.setBuffer('hammerLoop', buf(2));
    expect(m.play('stamp')).toBe(true);
    m.setLoop('musicDay', 1); m.setLoop('ambWaves', 0.8); m.setLoop('hammerLoop', 0.5);
    const [s1, s2, s3, s4] = fc.sources;
    expect(busFor(m, s1)).toBe('sfx');
    expect(busFor(m, s2)).toBe('music');
    expect(busFor(m, s3)).toBe('ambience');
    expect(busFor(m, s4)).toBe('sfx');
    expect(s2.loop && s3.loop && s4.loop).toBe(true);
  });
  it('loop points from loops.json are applied', () => {
    const m = mk(); m.unlock();
    m.setBuffer('ambGulls', buf(10), { loopStart: 0.05, loopEnd: 9.9 });
    m.setLoop('ambGulls', 0.5);
    const s = fc.sources[0];
    expect([s.loopStart, s.loopEnd, s.offset]).toEqual([0.05, 9.9, 0.05]);
  });
});

describe('audio runtime: unlock', () => {
  it('no AudioContext before the first gesture; created + resumed on unlock', () => {
    const m = mk();
    m.setBuffer('click', buf());
    expect(m.play('click')).toBe(false);
    expect(created).toBe(0);
    expect(m.log.at(-1)).toMatchObject({ id: 'click', ctxState: 'none', skip: 'locked' });
    m.unlock();
    expect(created).toBe(1);
    expect(fc.resumes).toBe(1);
    expect(fc.state).toBe('running');
    m.unlock();
    expect(created).toBe(1);
    expect(fc.resumes).toBe(1);
  });
  it('music/ambience never start before unlock, start on unlock', () => {
    const m = mk();
    m.setBuffer('musicDay', buf(30)); m.setBuffer('ambWaves', buf(20));
    m.setLoop('musicDay', 1); m.setLoop('ambWaves', 0.8);
    expect(m.loopPlaying('musicDay')).toBe(false);
    let fired = 0;
    m.onUnlock(() => { fired++; m.setLoop('musicDay', 1); m.setLoop('ambWaves', 0.8); });
    m.unlock();
    expect(fired).toBe(1);
    expect(m.loopPlaying('musicDay')).toBe(true);
    expect(m.loopPlaying('ambWaves')).toBe(true);
    m.unlock();
    expect(fired).toBe(1);
  });
  it('play() of a still-decoding buffer is honoured when it arrives in time', () => {
    const m = mk(); m.unlock();
    m.loading.add('ferryHorn');
    expect(m.play('horn')).toBe(false);
    expect(m.log.at(-1)!.skip).toBe('pending');
    t += 100;
    m.setBuffer('ferryHorn', buf());
    expect(fc.sources.length).toBe(1);
    // too late → dropped
    m.loading.add('stamp');
    m.play('stamp');
    t += 1000;
    m.setBuffer('stamp', buf());
    expect(fc.sources.length).toBe(1);
  });
  it('missing files are ignored without throwing', () => {
    const m = mk(); m.unlock();
    expect(m.play('kazoo')).toBe(false);
    expect(m.log.at(-1)!.skip).toBe('missing');
    m.setLoop('musicEvening', 1);
    expect(m.loopPlaying('musicEvening')).toBe(false);
  });
});

describe('audio runtime: mute precedence (SDK > settings.mute > volumes)', () => {
  it('volumes drive bus gains', () => {
    const m = mk(); m.unlock();
    m.setVolumes({ music: 0.5, sfx: 0.25, ambience: 1, mute: false });
    const tg = m.targets();
    expect(tg.master).toBe(1);
    expect((m.buses.sfx as unknown as FGain).gain.target).toBeCloseTo(tg.sfx);
    expect(tg.sfx).toBeCloseTo(0.25);
    expect(tg.music).toBeLessThan(tg.ambience);
  });
  it('settings.mute silences master but keeps volumes', () => {
    const m = mk(); m.unlock();
    m.setVolumes({ music: 1, sfx: 1, ambience: 1, mute: true });
    expect(m.targets().master).toBe(0);
    expect((m.master as unknown as FGain).gain.target).toBe(0);
    expect(m.targets().sfx).toBeGreaterThan(0);
  });
  it('SDK mute cannot be lifted by the in-game toggle', () => {
    const m = mk(); m.unlock();
    m.setReason('sdk', true);
    m.setVolumes({ music: 1, sfx: 1, ambience: 1, mute: false });
    expect(m.muted()).toBe(true);
    expect((m.master as unknown as FGain).gain.target).toBe(0);
    m.setBuffer('click', buf());
    expect(m.play('click')).toBe(false);
    expect(m.log.at(-1)!.skip).toBe('muted');
    m.setReason('sdk', false);
    expect(m.muted()).toBe(false);
    m.setVolumes({ music: 1, sfx: 1, ambience: 1, mute: true });
    expect(m.muted()).toBe(true);
  });
  it('hidden tab and ad are independent hard reasons', () => {
    const m = mk(); m.unlock();
    m.setReason('hidden', true, true);
    m.setReason('ad', true, true);
    m.setReason('hidden', false);
    expect(m.muted()).toBe(true);
    m.setReason('ad', false);
    expect(m.muted()).toBe(false);
    expect((m.master as unknown as FGain).gain.target).toBe(1);
  });
  it('mute state set before unlock applies to the new context', () => {
    const m = mk();
    m.setReason('sdk', true);
    m.unlock();
    expect((m.master as unknown as FGain).gain.value).toBe(0);
  });
});

describe('audio runtime: dedupe, rate limit, pitch', () => {
  it('same id within DEDUPE_MS plays once (component + event for one action)', () => {
    const m = mk(); m.unlock();
    m.setBuffer('upgrade', buf());
    expect(m.play('upgrade', { src: 'ui' })).toBe(true);
    t += 16;
    expect(m.play('upgrade', { src: 'event' })).toBe(false);
    expect(m.log.at(-1)!.skip).toBe('dedupe');
    t += DEDUPE_MS;
    expect(m.play('upgrade')).toBe(true);
  });
  it('alias and id dedupe together (horn ↔ ferryHorn, build ↔ buildStart)', () => {
    const m = mk(); m.unlock();
    m.setBuffer('ferryHorn', buf()); m.setBuffer('buildStart', buf());
    expect(m.play('horn')).toBe(true);
    expect(m.play('ferryHorn')).toBe(false);
    expect(m.play('build')).toBe(true);
    expect(m.play('buildStart')).toBe(false);
  });
  it('coins are rate limited as one group and pick a random variant', () => {
    let r = 0;
    const m = mk(() => r); m.unlock();
    for (const c of ['coin1', 'coin2', 'coin3']) m.setBuffer(c, buf());
    let played = 0;
    for (let i = 0; i < 100; i++) { r = (i * 0.37) % 1; if (m.play('coin')) played++; t += 10; } // 100 requests over 1 s
    expect(played).toBeLessThanOrEqual(Math.ceil(1000 / RATE_MS.coin) + 1);
    expect(played).toBeGreaterThan(3);
    const ids = new Set(m.log.filter(e => !e.skip).map(e => e.id));
    expect(ids.size).toBeGreaterThan(1);
    for (const id of ids) expect(['coin1', 'coin2', 'coin3']).toContain(id);
  });
  it('frequent sounds vary pitch within ±5 %, others keep their rate', () => {
    let r = 0;
    const m = mk(() => r); m.unlock();
    m.setBuffer('click', buf()); m.setBuffer('releaseFanfare', buf());
    const rates: number[] = [];
    for (const v of [0, 0.25, 0.5, 0.75, 0.999]) { r = v; m.play('click'); rates.push(fc.sources.at(-1)!.playbackRate.value); t += 200; }
    for (const x of rates) { expect(x).toBeGreaterThanOrEqual(1 - PITCH_VARY - 1e-9); expect(x).toBeLessThanOrEqual(1 + PITCH_VARY + 1e-9); }
    expect(Math.max(...rates) - Math.min(...rates)).toBeGreaterThan(0.05);
    r = 0;
    m.play('releaseFanfare');
    expect(fc.sources.at(-1)!.playbackRate.value).toBe(1);
  });
  it('log is capped at 200 and records ctx state + last input time', () => {
    const m = mk(); m.unlock();
    m.inputT = 999;
    for (let i = 0; i < 300; i++) { m.play('click'); t += 100; }
    expect(m.log.length).toBe(200);
    expect(m.log.at(-1)).toMatchObject({ ctxState: 'running', inputT: 999 });
  });
});

describe('audio runtime: loops', () => {
  it('crossfade day → evening and reap the silent loop', () => {
    const m = mk(); m.unlock();
    m.setBuffer('musicDay', buf(60)); m.setBuffer('musicEvening', buf(60));
    m.setLoop('musicDay', 1, 3); m.setLoop('musicEvening', 0, 3);
    expect(m.loopPlaying('musicDay')).toBe(true);
    m.setLoop('musicDay', 0, 3); m.setLoop('musicEvening', 1, 3);
    expect(m.loopPlaying('musicEvening')).toBe(true);
    const day = fc.sources[0];
    expect(day.stopped).toBe(false);
    t += 5000;
    m.reapLoops();
    expect(day.stopped).toBe(true);
    expect(m.loopPlaying('musicDay')).toBe(false);
  });
});

describe('audio runtime: sim event mapping', () => {
  const ev = (type: string, extra: Record<string, unknown> = {}): SimEvent => ({ t: 0, rtMs: 0, type, ...extra });
  it('maps the brief events to manifest ids', () => {
    const want: Record<string, string> = {
      ferryHorn: 'ferryHorn', hornTap: 'ferryHorn', release: 'releaseFanfare', coins: 'coin', built: 'buildDone', build: 'buildStart',
      upgrade: 'upgrade', milestone: 'milestone', objective: 'objective', tunnel: 'tunnelPop', escaped: 'kazoo', caught: 'netSwoosh',
      foodFight: 'foodSplat', ruckus: 'whistle', calmed: 'whistle', hire: 'hire', demolish: 'demolish', dayEnd: 'ledgerRegister', cartDepart: 'cartRoll',
    };
    for (const [type, id] of Object.entries(want)) expect(cueFor(ev(type))?.id, type).toBe(id);
    for (const c of Object.keys(want).map(k => cueFor(ev(k))!)) expect(resolveId(c.id)).not.toBeNull();
    expect(cueFor(ev('stuck'))).toBeNull();
    expect(cueFor(ev('teleport'))).toBeNull();
  });
  it('passive board income is quieter than a release bounty', () => {
    expect(cueFor(ev('coins', { kind: 'board' }))!.opts!.vol!).toBeLessThan(cueFor(ev('coins', { kind: 'release' }))!.opts!.vol!);
  });
});
