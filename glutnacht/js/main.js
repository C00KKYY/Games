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

  // Gleichmäßige Schritte: Die Zeitstempel von requestAnimationFrame schwanken um den Takt der Anzeige (Zeitgeber,
  // Planung des Browsers). Liegt ein Abstand nahe am geglätteten Takt (sdt), läuft das Spiel genau einen Takt
  // weiter; die Abweichung wird gesammelt (debt) und in kleinen Raten (höchstens 10 % je Bild) nachgeholt, so geht
  // keine Zeit verloren. Echte Aussetzer (ab dem 1,6-Fachen) laufen unverändert durch, gedeckelt auf 50 ms.
  let last = performance.now(), sdt = 1 / 60, debt = 0;
  // Nach einem Dialog (Stufenaufstieg, Truhe, Pause) läuft das Spiel 0,45 s lang von 30 % auf volles Tempo an, wenn
  // gerade Gegnergeschosse fliegen oder Warnzeichen stehen: Zeit, sich zu orientieren (der Daumen liegt noch nicht
  // wieder auf dem Stick). Held und Gegner werden gleich gebremst – leichter wird dadurch nichts.
  const RESUME = 0.45;
  let prevSt = Game.state, resume = 0;
  function frame(now) {
    const raw = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    let dt = raw;
    if (raw > 0) sdt = clamp(sdt + (clamp(raw, sdt * 0.5, sdt * 1.5) - sdt) * 0.05, 1 / 250, 0.05); // folgt auch 30-, 120-, 144-Hz-Anzeigen
    if (raw > sdt * 0.6 && raw < sdt * 1.6) {
      dt = sdt;
      debt = clamp(debt + raw - dt, -0.1, 0.1);
      const pay = clamp(debt, -dt * 0.1, dt * 0.1);
      dt += pay; debt -= pay;
    } else if (raw >= sdt * 1.6) { dt = clamp(raw + debt, 0, 0.05); debt = 0; }
    if (booted) Input.update();
    const st = Game.state, r0 = Game.run;
    if (st === 'play' && st !== prevSt && (prevSt === 'levelup' || prevSt === 'chest' || prevSt === 'paused') &&
      r0 && (r0.eshots.length || r0.tele.length)) resume = RESUME;
    prevSt = st;
    if (st === 'play') {
      let gdt = dt;
      if (resume > 0) { gdt = dt * (0.3 + 0.7 * (1 - resume / RESUME)); resume = Math.max(0, resume - dt); }
      const steps = gdt > 1 / 45 ? 2 : 1;
      for (let i = 0; i < steps; i++) Game.update(gdt / steps);
    } else resume = 0;
    Render.rafNow = now;
    Render.draw(dt);
    if (booted) UI.updateHud();
    Platform.setPlaying(Game.state === 'play');
    const r = Game.run;
    let boss = false;
    if (r) for (const b of r.bosses) if (!b.dead) { boss = true; break; }
    // Ansturm (M10): Kampfmusik eine Stufe höher, solange er läuft
    const cs = r && Game.state !== 'menu' ? Game.countdownState() : null, surge = !!cs && cs.kind === 'surge' && cs.phase === 'on';
    Sfx.setIntensity(!r || Game.state === 'menu' ? 0 : boss || r.t > 600 ? 3 : r.t > 240 || surge ? 2 : 1);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 2. Plattform (bestimmt den Speicherort), Grafiken und Klänge – nie länger als 2,5 s warten.
  //    Kommt das SDK später, stellt Platform.lateAttach() den Speicherort sicher um.
  await Promise.race([
    Promise.all([Platform.init(), Sprites.load(), FxArt.load().then(() => FxArt.warm()), Sfx.preload()]).catch(() => {}),
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

  // Optional mit Weltposition x: leicht nach links/rechts im Stereobild (relativ zur Kamera)
  Hooks.sfx = (n, a, x) => Sfx.play(n, a, x === undefined || !Game.view.hw ? 0 : clamp((x - Render.cam.x) / Game.view.hw, -1, 1) * 0.6);
  Hooks.shake = a => Render.addShake(a);
  // Stufenaufstieg: Lichtstoß um den Helden, 150 ms stehendes Bild (Treffer-Stopp), dann die Karten. Folgt der
  // Dialog direkt auf einen anderen (mehrere Aufstiege, Truhe), steht das Bild schon: kein neuer Lichtstoß – er
  // müsste die ganze Szene erneut zeichnen (bei 450 Gegnern 5 Bilder à 50–80 ms), die Karten kämen ruckelnd.
  let lvlT = 0;
  Hooks.levelUp = () => {
    const chained = Render.still;
    if (!chained) Render.levelUp();
    clearTimeout(lvlT);
    lvlT = setTimeout(() => { if (Game.state === 'levelup') UI.levelUp(Game.lastLevelOptions); }, chained ? 60 : 150);
  };
  Hooks.kill = e => Render.onKill(e);
  Hooks.chest = r => UI.chest(r);
  Hooks.victory = () => UI.victory();
  Hooks.gameOver = s => UI.gameOver(s);
  Hooks.banner = (t, k, sub, dur) => UI.banner(t, k, sub, dur);
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

  // Audio darf erst nach einer Nutzeraktion starten (iOS: touchend/click; Sfx hört zu, bis der Kontext läuft).
  // Beim ersten Freischalten die Musik starten – außer auf dem Ergebnis-Bildschirm (dort schweigt sie).
  Sfx.unlock(() => { if (Store.data.settings.music && Game.state !== 'over') Sfx.startMusic(); });

  // 4. Menü zeigen (blendet den Ladebildschirm aus), Ladephase bei der Plattform beenden
  booted = true;
  UI.show('menu');
  Platform.loaded();
  UI.warmIcons();

  // Für Tests und Werkzeuge im Browser erreichbar; ready = Menü steht, Spielstand geladen
  window.Glutnacht = { Game, Store, UI, Platform, I18N_MISSES, setLang, ready: true };
})();
