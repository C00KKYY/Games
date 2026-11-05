'use strict';
// Ausweich-Probe für den Balance-Bot (M9): Wie oft trifft ihn welches Fernkampf-Geschoss?
//   node tools/dodgetest.js [sekunden=120] [wiederholungen=1]      VIEW=phone für das Handy-Sichtfeld (Hochformat)
// Arena ohne Nachschub, Ereignisse, Elite und Bosse; der Held hat keine Waffe und kann nicht sterben, die Schützen
// sind unverwundbar (hp 1e9). 6 Szenarien: 1 Spucker (Einzelschuss), 1 Spucker nach 4:00 (Fächer), 1 Nadelmotte,
// 3 Aschenkessel, 2 Totenglocken, alle gemischt – jedes ohne und mit 40 langsamen Schleimen (Tempo 40) als Füllung.
// Gemessen: Treffer je abgefeuertem Geschoss bzw. je Markierung (Mörser). Zielwerte für einen geübten Menschen ohne
// Füllung: Kugel 2–6 %, Fächer 5–12 % (je Kugel), Nadel 8–18 %, Mörser 6–15 %, Glockengitter 5–12 % (je Salve aus
// 2 × 10 Kugeln); mit Füllung etwa das
// 1,5- bis 2,5-Fache.
const { load, strongBot } = require('./balancebot.js');

const SEC = +(process.argv[2] || 120), REP = +(process.argv[3] || 1);
const SCEN = [
  { id: 'orb', name: 'Spucker (Kugel)', spawn: { spitter: 1 } },
  { id: 'fan', name: 'Spucker ab 4:00 (Fächer)', spawn: { spitter: 1 }, t0: 240 },
  { id: 'needle', name: 'Nadelmotte', spawn: { moth: 1 } },
  { id: 'mortar', name: '3 Aschenkessel', spawn: { cinder: 3 } },
  { id: 'ring', name: '2 Totenglocken', spawn: { bell: 2 } },
  { id: 'mix', name: 'alle gemischt', spawn: { spitter: 1, moth: 1, cinder: 3, bell: 2 } },
];

const api = load();
const { Game, Hooks, Store } = api;
if (process.env.VIEW === 'phone') Game.view = { hw: 244, hh: 527 };

function runScenario(sc, fillers) {
  Store.load(); Store.data.shop = {};
  Hooks.levelUp = () => {}; Hooks.chest = () => {}; Hooks.victory = () => {}; Hooks.gameOver = () => {};
  const r = Game.newRun('aron', 0, 'graveyard');
  r.enemies.length = 0; r.weapons.length = 0;
  r.t = sc.t0 || 0;
  r.stats.maxHp = r.p.hp = 1e9;
  r.propList = []; r.props = new Map();
  r.bossIdx = 1e9; r.eventIdx = 1e9;
  const director = Game.director, updateProps = Game.updateProps, gainXp = Game.gainXp;
  Game.director = () => {}; Game.updateProps = () => {}; Game.gainXp = () => {};
  const fired = {}, hits = {};
  const enemyShot = Game.enemyShot, hurt = Game.hurtPlayer;
  Game.enemyShot = function (x, y, dx, dy, sp, dmg, rad, o) { const k = (o && o.src) || 'shot'; fired[k] = (fired[k] || 0) + 1; return enemyShot.apply(this, arguments); };
  Game.hurtPlayer = function (dmg, src) {
    // Pfützen und Kontakt schaden je Bild: nur zählen, wenn sie wirklich treffen (nicht in der Schonzeit)
    if ((src !== 'puddle' && src !== 'contact') || r.p.iframe <= 0) hits[src] = (hits[src] || 0) + 1;
    return hurt.apply(this, arguments);
  };
  const tpush = r.tele.push.bind(r.tele);
  r.tele.push = (...a) => { for (const t of a) if (t.src === 'mortar') fired.mortar = (fired.mortar || 0) + 1; return tpush(...a); };
  const put = (type, n, d) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Game.spawnEnemy(type, r.p.x + Math.cos(a) * d, r.p.y + Math.sin(a) * d);
      e.hp = e.maxHp = 1e9; e.kb = 0;
      if (type === 'slime') e.speed = 40;
    }
  };
  for (const [k, n] of Object.entries(sc.spawn)) put(k, n, 260);
  if (fillers) put('slime', 40, 300);
  const dt = 1 / 60, T1 = r.t + SEC;
  let frame = 0;
  while (r.t < T1 && Game.state === 'play') {
    if (frame % 3 === 0) strongBot(api);
    frame++;
    Game.update(dt);
    for (const e of r.enemies) if (!e.dead && e.hp < 1e8) e.hp = 1e9;
  }
  Game.director = director; Game.updateProps = updateProps; Game.gainXp = gainXp;
  Game.enemyShot = enemyShot; Game.hurtPlayer = hurt;
  return { fired, hits };
}

const tot = {};
for (let rep = 0; rep < REP; rep++) {
  for (const sc of SCEN) for (const fill of [false, true]) {
    const { fired, hits } = runScenario(sc, fill);
    const key = sc.id + (fill ? '+füll' : '');
    const T = tot[key] || (tot[key] = { name: sc.name + (fill ? ' + 40 Schleime' : ''), fired: {}, hits: {} });
    for (const k in fired) T.fired[k] = (T.fired[k] || 0) + fired[k];
    for (const k in hits) T.hits[k] = (T.hits[k] || 0) + hits[k];
  }
}
const pct = (h, f) => (f ? (h / f * 100).toFixed(1) + ' %' : '-');
console.log('Ausweich-Probe: ' + SEC + ' s je Szenario, ' + REP + ' Wiederholung(en), Sichtfeld ' + Game.view.hw + '×' + Game.view.hh + ' (Halbmaße)');
for (const [key, T] of Object.entries(tot)) {
  const parts = [];
  for (const k of ['shot', 'needle', 'mortar']) if (T.fired[k]) parts.push(k + ' ' + (T.hits[k] || 0) + '/' + T.fired[k] + ' = ' + pct(T.hits[k] || 0, T.fired[k]));
  // Glocke: je Gitter (2 Ringe à 10 Kugeln = eine Salve), nicht je Kugel
  if (T.fired.ring) parts.push('Gitter ' + (T.hits.ring || 0) + '/' + Math.round(T.fired.ring / 20) + ' = ' + pct(T.hits.ring || 0, T.fired.ring / 20));
  if (T.hits.puddle) parts.push('Pfütze ' + T.hits.puddle);
  if (T.hits.contact) parts.push('Kontakt ' + T.hits.contact);
  console.log(('  ' + T.name).padEnd(42) + parts.join('  '));
}
console.log(JSON.stringify(tot));
