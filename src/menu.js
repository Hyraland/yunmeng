// The menu: three dots at the top right, and in them all there is to know or change.

const MODELS = [
  ['马骨架', 'Horse Skeleton', 'https://sketchfab.com/3d-models/eaca504567604e879b8ab2cf2763025e', 'Diego Luján García', 'CC BY 4.0', true],
  ['原牛头骨', 'Auroch Skull version b', 'https://sketchfab.com/3d-models/8b52ece8d024428192d2681e0dd9cfa5', 'robin.m.patel', 'CC BY 4.0', true],
  ['日本鹿头骨', 'Japanese Deer Skull, C. nippon', 'https://sketchfab.com/3d-models/d371123af19442a5a98430e500192964', 'ffish.asia / floraZia', 'CC0', false],
  ['对马鹿头骨', 'Tsushima Deer, C. nippon pulchellus', 'https://sketchfab.com/3d-models/0f6e3c14e2c1406fa892a6c289902080', 'ffish.asia / floraZia', 'CC0', false],
];

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// weathers: [[name to show, key]]. sound and music: { get, set }. weather: { get, set }.
export function createMenu({ weathers, weather, sound, music }) {
  const root = el('div', 'menu');
  const dots = el('button', 'menu-dots');
  dots.type = 'button';
  dots.setAttribute('aria-label', '菜单');
  dots.setAttribute('aria-expanded', 'false');
  for (let i = 0; i < 3; i++) dots.append(el('span'));
  const panel = el('div', 'menu-panel');
  panel.hidden = true;

  const section = (title) => {
    const s = el('section');
    s.append(el('h2', '', title));
    panel.append(s);
    return s;
  };

  const how = section('操作');
  for (const [keys, what] of [['W A S D', '行走'], ['双击 W 或按住 Shift', '跑'], ['拖动画面', '转头']]) {
    const row = el('div', 'menu-row');
    row.append(el('span', '', what), el('span', 'menu-keys', keys));
    how.append(row);
  }

  const sky = section('天气');
  const choices = el('div', 'menu-choices');
  const skyButtons = weathers.map(([name, key]) => {
    const b = el('button', '', name);
    b.type = 'button';
    b.addEventListener('click', () => {
      weather.set(key);
      refresh();
    });
    choices.append(b);
    return [b, key];
  });
  sky.append(choices);

  const heard = section('声音');
  const switches = [['音乐', music], ['音效', sound]].map(([name, state]) => {
    const row = el('label', 'menu-row menu-switch');
    const box = el('input');
    box.type = 'checkbox';
    box.addEventListener('change', () => state.set(box.checked));
    row.append(el('span', '', name), box);
    heard.append(row);
    return [box, state];
  });

  const about = section('模型来源');
  for (const [name, title, url, author, licence, changed] of MODELS) {
    const p = el('p', 'menu-credit');
    p.append(`${name}：`);
    const a = el('a', '', title);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    const terms = el('a', '', licence);
    terms.href = licence === 'CC0' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'https://creativecommons.org/licenses/by/4.0/';
    terms.target = '_blank';
    terms.rel = 'noopener';
    p.append(a, `，${author}，`, terms, changed ? '，有改动（减面、拆分）' : '');
    about.append(p);
  }

  function refresh() {
    const now = weather.get();
    root.dataset.sky = now;
    for (const [b, key] of skyButtons) b.setAttribute('aria-pressed', key === now ? 'true' : 'false');
    for (const [box, state] of switches) box.checked = state.get();
  }
  function show(open) {
    panel.hidden = !open;
    dots.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) refresh();
  }
  dots.addEventListener('click', () => show(panel.hidden));
  // (and away, on anything else or Esc: the keys keep walking as ever)
  addEventListener('pointerdown', (e) => { if (!(e.target instanceof Node && root.contains(e.target))) show(false); });
  addEventListener('keydown', (e) => { if (e.code === 'Escape') show(false); });
  // a button keeps the keyboard's attention after a click, and a space or enter would press it again
  root.addEventListener('click', (e) => { if (e.target.closest('button')) e.target.closest('button').blur(); });

  root.append(dots, panel);
  document.body.append(root);
  refresh();
  return { refresh };
}
