'use strict';
// Einstieg: verbindet Spiel, Darstellung, Eingabe und Oberfläche und startet die Schleife.

(function () {
  Store.load();
  const canvas = document.getElementById('game');
  Render.init(canvas);
  Input.init(canvas);
  UI.init();

  Hooks.sfx = (n, a) => Sfx.play(n, a);
  Hooks.shake = a => Render.addShake(a);
  Hooks.levelUp = o => UI.levelUp(o);
  Hooks.chest = r => UI.chest(r);
  Hooks.victory = () => UI.victory();
  Hooks.gameOver = s => UI.gameOver(s);
  Hooks.banner = (t, k) => UI.banner(t, k);
  Hooks.achievement = a => UI.achievement(a);

  window.addEventListener('resize', () => Render.resize());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    UI.pause();
    // nur laufenden Fortschritt sichern – ein untätiger Tab soll nichts überschreiben
    if (Game.run && !Game.run.ended) Store.save();
  });
  // Ein anderer Tab hat gespeichert: im Menü dessen Stand übernehmen
  window.addEventListener('storage', e => {
    if (e.key !== SAVE_KEY || (Game.run && !Game.run.ended)) return;
    Store.load();
    if (UI.cur && ['menu', 'shop', 'ach', 'chars', 'opts'].includes(UI.cur)) UI.show(UI.cur);
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

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    Input.update();
    if (Game.state === 'play') {
      const steps = dt > 1 / 45 ? 2 : 1;
      for (let i = 0; i < steps; i++) Game.update(dt / steps);
    }
    Render.draw(dt);
    UI.updateHud();
    const r = Game.run;
    Sfx.setIntensity(!r || Game.state === 'menu' ? 0 : r.bosses.some(b => !b.dead) || r.t > 600 ? 3 : r.t > 240 ? 2 : 1);
    requestAnimationFrame(frame);
  }

  UI.show('menu');
  requestAnimationFrame(frame);

  // Für Tests im Browser erreichbar
  window.Glutnacht = { Game, Store, UI };
})();
