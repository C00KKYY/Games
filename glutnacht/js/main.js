'use strict';
// Einstieg: verbindet Spiel, Darstellung, Eingabe und Oberfläche und startet die Schleife.
//
// Ablauf: Der Ladebildschirm steht schon im HTML (ohne JS). Sofort danach läuft die Kulisse im Canvas.
// Dann wird höchstens 2,5 s auf Plattform-SDK, Grafiken und Klänge gewartet, erst danach der Spielstand
// geladen (die Plattform bestimmt, wo er liegt), die Sprache gesetzt und das Menü gezeigt.

(async function () {
  const canvas = document.getElementById('game');
  let booted = false;

  // 1. Sofort zeichnen: Boden, Deko und Glut als Kulisse hinter dem Ladebildschirm
  Game.state = 'menu';
  Render.init(canvas);
  window.addEventListener('resize', () => Render.resize());

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (booted) Input.update();
    if (Game.state === 'play') {
      const steps = dt > 1 / 45 ? 2 : 1;
      for (let i = 0; i < steps; i++) Game.update(dt / steps);
    }
    Render.draw(dt);
    if (booted) UI.updateHud();
    Platform.setPlaying(Game.state === 'play');
    const r = Game.run;
    Sfx.setIntensity(!r || Game.state === 'menu' ? 0 : r.bosses.some(b => !b.dead) || r.t > 600 ? 3 : r.t > 240 ? 2 : 1);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 2. Plattform (bestimmt den Speicherort), Grafiken und Klänge – nie länger als 2,5 s warten.
  //    Kommt das SDK später, stellt Platform.lateAttach() den Speicherort sicher um.
  await Promise.race([
    Promise.all([Platform.init(), Sprites.load(), FxArt.load(), Sfx.preload()]).catch(() => {}),
    new Promise(r => setTimeout(r, 2500)),
  ]);
  Platform.booted = true;

  // 3. Spielstand erst jetzt laden, denn erst jetzt steht fest, wo er liegt
  Store.load();
  // Sprache: gespeicherte Wahl, sonst Sprache der Plattform, sonst Browsersprache, sonst Englisch
  setLang(Store.data.settings.lang || detectLang(Platform.locale()));
  // Plattform kennt das Gerät: Handy/Tablet -> Touch-Hinweise (nie umgekehrt)
  const dev = Platform.deviceType();
  if (dev === 'mobile' || dev === 'tablet') Input.touch = true;

  // UI vor Input: Tastendrücke landen in UI.onKey und brauchen UI.el
  UI.init();
  Input.init(canvas);

  Hooks.sfx = (n, a) => Sfx.play(n, a);
  Hooks.shake = a => Render.addShake(a);
  // Stufenaufstieg: Lichtstoß um den Helden, 150 ms stehendes Bild (Treffer-Stopp), dann die Karten
  let lvlT = 0;
  Hooks.levelUp = () => {
    Render.levelUp();
    clearTimeout(lvlT);
    lvlT = setTimeout(() => { if (Game.state === 'levelup') UI.levelUp(Game.lastLevelOptions); }, 150);
  };
  Hooks.kill = e => Render.onKill(e);
  Hooks.chest = r => UI.chest(r);
  Hooks.victory = () => UI.victory();
  Hooks.gameOver = s => UI.gameOver(s);
  Hooks.banner = (t, k) => UI.banner(t, k);
  Hooks.achievement = a => UI.achievement(a);
  Hooks.happy = () => Platform.happy();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    UI.pause();
    // nur laufenden Fortschritt sichern – ein untätiger Tab soll nichts überschreiben
    if (Game.run && !Game.run.ended) Store.save();
  });
  // Ein anderer Tab hat gespeichert: im Menü dessen Stand übernehmen (nur beim Speicherort localStorage)
  window.addEventListener('storage', e => {
    if (Store.backend || e.key !== SAVE_KEY || (Game.run && !Game.run.ended)) return;
    Store.load();
    if (UI.cur && ['menu', 'map', 'shop', 'ach', 'chars', 'opts'].includes(UI.cur)) UI.show(UI.cur);
  });
  window.addEventListener('blur', () => UI.pause());

  // Audio darf erst nach einer Nutzeraktion starten.
  const unlock = () => {
    Sfx.init();
    if (Store.data.settings.music) Sfx.startMusic();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // 4. Menü zeigen (blendet den Ladebildschirm aus), Ladephase bei der Plattform beenden
  booted = true;
  UI.show('menu');
  Platform.loaded();

  // Für Tests und Werkzeuge im Browser erreichbar; ready = Menü steht, Spielstand geladen
  window.Glutnacht = { Game, Store, UI, Platform, I18N_MISSES, setLang, ready: true };
})();
