/** M1 HUD sketch (static numbers) – the real HUD arrives in M3. */
import './hud.css';

const ic = (n: string) => `ui/${n}.svg`;
export function mountHudSketch(root: HTMLElement, params: URLSearchParams) {
  const de = params.get('lang') === 'de';
  const L = de
    ? { day: 'Tag 1', clip: 'Klemmbrett', goal: 'Baue eine Strickstube', show: 'Zeig mir', rooms: 'Räume', staff: 'Personal', decor: 'Deko', proj: 'Projekte', demo: 'Abriss', tut: 'Begrüße die Schlingel!', skip: 'Tutorial überspringen', new: 'NEU' }
    : { day: 'Day 1', clip: "Warden's Clipboard", goal: 'Build a Knitting Nook', show: 'Show me', rooms: 'Rooms', staff: 'Staff', decor: 'Decor', proj: 'Projects', demo: 'Demolish', tut: 'Welcome the rascals!', skip: 'Skip tutorial', new: 'NEW' };
  const hud = document.createElement('div');
  hud.className = 'hud';
  const flow = [['ferry', '4'], ['bed', '6'], ['meal', '24'], ['shower', '0'], ['yarn', '–'], ['book', '–'], ['gate', '6']];
  hud.innerHTML = `
  <div class="topbar">
    <div class="pill coins" title="Coins"><img src="${ic('coin')}" alt=""><span class="num" id="h-coins">1,240</span></div>
    <div class="pill stars" title="Reputation"><img src="${ic('star')}" alt=""><img src="${ic('starEmpty')}" alt=""><img src="${ic('starEmpty')}" alt=""><div class="bar"><i></i></div></div>
    <div class="pill clock"><img id="h-sun" src="${ic('sun')}" alt=""><span class="day">${L.day}</span><span class="num" id="h-time">07:00</span></div>
    <div class="pill speed"><button title="Pause (P)"><img src="${ic('pause')}" alt=""></button><button class="on" title="1× (1)"><img src="${ic('play')}" alt=""></button><button title="2× (2)"><img src="${ic('fast')}" alt=""></button></div>
    <div class="pill flow" title="Flow Bar">${flow.map(([i, n], k) => `${k ? '<span class="arrow"></span>' : ''}<span class="st${i === 'shower' ? ' bad' : ''}"><img src="${ic(i)}" alt=""><span class="num">${n}</span></span>`).join('')}</div>
    <div class="pill mood" title="Mood"><img src="${ic('mood')}" alt=""><span class="num">64%</span></div>
    <button class="iconbtn" title="Settings"><img src="${ic('gear')}" alt=""></button>
  </div>
  <div class="clip"><span class="stamp">${L.new}</span><h3><img src="${ic('clipboard')}" alt="">${L.clip}</h3><div class="goal">${L.goal}</div><div class="prog"><div class="bar"><i></i></div><span class="num">0/1</span></div><button class="show">${L.show} ›</button></div>
  <div class="buildbar">
    <button class="main" title="Build rooms (B)"><img src="${ic('rooms')}" alt="">${L.rooms}</button>
    <button title="Hire staff"><img src="${ic('staff')}" alt="">${L.staff}</button>
    <button title="Decorations"><img src="${ic('decor')}" alt="">${L.decor}</button>
    <button title="Project Board"><img src="${ic('projects')}" alt="">${L.proj}</button>
    <button title="Demolish (Del)"><img src="${ic('demolish')}" alt="">${L.demo}</button>
  </div>`;
  if (params.get('tut')) {
    hud.insertAdjacentHTML('beforeend', `<div class="tut" style="left:22%;top:34%"><img class="warden" src="${ic('warden')}" alt=""><div class="bubble">${L.tut}</div><button class="skip">${L.skip}</button></div>`);
  }
  if (params.has('nohud')) hud.style.display = 'none';
  root.appendChild(hud);
  const time = hud.querySelector('#h-time') as HTMLElement, sun = hud.querySelector('#h-sun') as HTMLImageElement;
  let last = '';
  return {
    insets() {
      if (params.has('nohud')) return { top: 0, bottom: 0, left: 0, right: 0 };
      const top = (hud.querySelector('.topbar') as HTMLElement).getBoundingClientRect().bottom + 2;
      const bb = (hud.querySelector('.buildbar') as HTMLElement).getBoundingClientRect();
      return { top, bottom: window.innerHeight - bb.top + 2, left: 0, right: 0 };
    },
    update(hour: number) {
      const h = Math.floor(hour), m = Math.floor((hour - h) * 6) * 10;
      const s = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if (s !== last) { last = s; time.textContent = s; const night = hour >= 21 || hour < 6; const want = ic(night ? 'moon' : 'sun'); if (!sun.src.endsWith(want)) sun.src = want; }
    },
  };
}
