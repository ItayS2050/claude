/* דלתות במקום — אב-טיפוס: הדמיית דלת על תמונת הפתח של הלקוח והפקת הצעת מחיר במקום. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const CAT = window.CATALOG, EX = window.EXTRAS;
  const ALL = [...CAT.interior, ...CAT.entry];
  const byId = Object.fromEntries(ALL.map(m => [m.id, m]));
  const fmt = n => '₪' + Math.round(n).toLocaleString('he-IL');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- storage (best effort) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('dlatot:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('dlatot:' + k, JSON.stringify(v)); return true; } catch { return false; } },
  };

  /* ---------- settings ---------- */
  const DEFAULT_SETTINGS = { name: 'דלתות במקום', phone: '03-0000000', line: 'אולם תצוגה · רחוב התעשייה 1', vat: 18, valid: 30,
    instI: 350, instE: 650, remI: 150, remE: 350, deposit: 30, prices: {}, opt: {} };
  let settings = { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };
  settings.opt = settings.opt || {};
  const priceOf = m => settings.prices[m.id] ?? m.price;
  const saveSettings = () => store.set('settings', settings);

  /* ---------- option catalogs (prices are defaults; the price list tab overrides them) ---------- */
  // גווני RAL נפוצים במניפת הצבעים. הגוון על המסך בקירוב בלבד.
  const RAL = [['9016', 'לבן', '#F1F0EA'], ['9010', 'לבן שמנת', '#F1ECE1'], ['1013', 'לבן פנינה', '#E3D9C6'], ['1015', 'שנהב', '#E6D2B5'],
    ['7035', 'אפור בהיר', '#CBD0CC'], ['7040', 'אפור חלון', '#9DA3A6'], ['7039', 'אפור קוורץ', '#6C6960'], ['7016', 'אנתרציט', '#383E42'],
    ['7021', 'אפור-שחור', '#2F3234'], ['9005', 'שחור', '#111214'], ['8019', 'חום-אפור', '#3D3635'], ['8017', 'שוקולד', '#45322E'],
    ['5003', 'כחול ספיר', '#1F3855'], ['5010', 'כחול', '#0E4C92'], ['5024', 'כחול פסטל', '#5D9BBF'], ['6034', 'טורקיז פסטל', '#7FB0B2'],
    ['6021', 'ירוק חיוור', '#89AC76'], ['6005', 'ירוק אזוב', '#114232'], ['1023', 'צהוב', '#F7B500'], ['3020', 'אדום', '#C1121C'], ['3004', 'בורדו', '#6B1C23']];
  const G = {
    // דלתות פנים
    iHandle: EX.interiorHandles,
    iCyl: EX.cylinders,
    iHinge: EX.hinges,
    iMez: [{ v: 'none', l: 'ללא מזוזה', p: 0 }, ...EX.mezuzot],
    iFrame: [{ v: 'std', l: 'משקוף רגיל', p: 0 }, { v: 'zero', l: 'משקוף נסתר ZERO', p: 900 }],
    iWidth: [60, 70, 80, 90].map(w => ({ v: String(w), l: `${w} ס״מ`, p: w === 90 ? 150 : 0 })),
    iHeight: [{ v: '204', l: '2.04 מ׳', p: 0 }, { v: '220', l: '2.20 מ׳', p: 350 }, { v: '240', l: '2.40 מ׳', p: 650 }],
    iMamad: [{ v: 'on', l: 'התאמה לפתח ממ״ד', p: 450 }],
    // דלתות כניסה
    eRal: [{ v: 'all', l: 'צביעה בגוון מהמניפה', p: 450 }],
    eGrille: [{ v: '__std', l: 'סורג רגיל', p: 0 }, { v: '__special', l: 'סורג מיוחד', p: 650 }],
    eGColor: [{ v: 'black', l: 'שחור', sw: '#1A1A1A', p: 0 }, { v: 'white', l: 'לבן', sw: '#F4F4F2', p: 0 }, { v: 'door', l: 'בגוון הדלת', p: 0 },
      { v: 'gold', l: 'זהב', sw: '#C2A05A', p: 250 }, { v: 'steel', l: 'נירוסטה', sw: '#B9BEC2', p: 300 }],
    eGlass: [{ v: 'frost', l: 'חלבית', p: 0 }, { v: 'clear', l: 'שקופה', p: 0 }, { v: 'reed', l: 'מחורצת', p: 120 }, { v: 'tinted', l: 'מעושנת', p: 180 }],
    eBelgian: [{ v: 'on', l: 'חלון בלגי נפתח עם רשת', p: 1200 }],
    eSide: [{ v: 'none', l: 'ללא', p: 0 }, { v: 'right', l: 'מימין', p: 2900 }, { v: 'left', l: 'משמאל', p: 2900 }, { v: 'both', l: 'משני הצדדים', p: 5800 }],
    eSideGrille: EX.sideGrilles.map(g => ({ v: g.num, l: g.num, img: g.src, p: 0 })),
    eHandle: EX.entryHandles,
    eHandleLen: [{ v: 'step', l: 'תוספת לכל מידת אורך', p: 120 }],
    eCyl: [{ v: 'std', l: 'צילינדר רב-בריח סטנדרטי', p: 0 }, { v: 'mts', l: 'צילינדר MTS', p: 380 },
      { v: 'interactive', l: 'צילינדר אינטראקטיב', p: 520 }, { v: 'smart', l: 'מנעול חכם: קוד, טביעת אצבע ואפליקציה', p: 1450 }],
    eWidth: [{ v: '90', l: '90 ס״מ', p: 0 }, { v: '100', l: '100 ס״מ', p: 600 }],
    eMez: [{ v: 'none', l: 'ללא מזוזה', p: 0 }, { v: 'silver', l: 'מזוזה כסף', sw: '#C9CCCF', p: 200 }, { v: 'black', l: 'מזוזה שחורה', sw: '#1E1F21', p: 200 }, { v: 'gold', l: 'מזוזה זהב', sw: '#C9A45A', p: 200 }],
    eExtra: [{ v: 'peephole', l: 'עינית דיגיטלית עם מסך', p: 450 }, { v: 'closer', l: 'מחזיר שמן (סגירה עצמית)', p: 380 },
      { v: 'elecCab', l: 'ארון חשמל מעוצב בגוון הדלת', p: 2400 }],
  };
  const GROUP_TITLES = { iHandle: 'ידיות לדלתות פנים', iCyl: 'צילינדר ונעילה', iHinge: 'צירים', iMez: 'מזוזה שקועה', iFrame: 'משקוף', iWidth: 'רוחב (פנים)',
    iHeight: 'גובה (פנים)', iMamad: 'ממ״ד', eRal: 'צבע מהמניפה', eGrille: 'סורגים', eGColor: 'צבע הסורג', eGlass: 'זכוכית', eBelgian: 'חלון בלגי',
    eSide: 'יחידת צד', eSideGrille: 'סורג ליחידת צד', eHandle: 'ידיות לדלתות כניסה', eHandleLen: 'אורך ידית מוט', eCyl: 'מנעול וצילינדר',
    eWidth: 'רוחב (כניסה)', eMez: 'מזוזה דקורטיבית', eExtra: 'אביזרים לדלת כניסה' };
  const P = (g, it) => settings.opt[g + ':' + it.v] ?? it.p;
  const find = (g, v) => G[g].find(x => x.v === v) || G[g][0];
  const grilleOf = num => EX.grilles.find(g => g.num === num);
  const grillePrice = num => { const g = grilleOf(num); return g ? P('eGrille', find('eGrille', g.special ? '__special' : '__std')) : 0; };
  const handleLenPrice = (h, len) => h.lens ? Math.max(0, h.lens.indexOf(len)) * P('eHandleLen', G.eHandleLen[0]) : 0;

  const DEFAULTS = {
    interior: { handle: 'grande-nickel', cyl: 'keykey', hinge: 'nickel', mez: 'none', frame: 'std', width: '80', height: '204', mamad: false },
    entry: { ral: null, grille: '', grilleColor: 'black', glass: 'frost', belgian: false, sideUnit: 'none', sideGrille: '7500', handle: 'lever', handleLen: null,
      cyl: 'std', width: '90', mez: 'none', peephole: false, closer: false, elecCab: false },
  };
  const COMMON = () => ({ side: 'right', install: true, remove: false, qty: 1, room: '' });

  /* ---------- state ---------- */
  const st = {
    kind: 'interior', series: 'all', q: '',
    model: CAT.interior.find(m => m.name === 'יובל') || CAT.interior[0], vi: 0,
    opts: { ...DEFAULTS.interior, ...COMMON() },
    open: new Set(),
    bg: null, bgIsSample: true, quad: null, marking: true, light: -6, depth: 10,
    compare: [],
  };
  let quote = store.get('quote', null) || newQuote();
  function newQuote() {
    const n = (store.get('qseq', 1040)) + 1; store.set('qseq', n);
    return { num: `${new Date().getFullYear()}-${n}`, created: Date.now(), customer: { name: '', phone: '', addr: '' }, items: [], discount: 0, approved: null };
  }
  const saveQuote = () => { if (!store.set('quote', quote)) { // תמונות גדולות מדי לאחסון: שומרים בלי תמונות
      store.set('quote', { ...quote, items: quote.items.map(i => ({ ...i, img: '' })) }); } };

  /* ---------- image loading ---------- */
  const imgCache = new Map();
  function loadImg(src) {
    if (imgCache.has(src)) return imgCache.get(src);
    const p = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => { imgCache.delete(src); rej(new Error(src)); }; i.src = src; });
    imgCache.set(src, p); return p;
  }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  /* ---------- sample scenes (drawn, so the demo works with no photo) ---------- */
  function sampleScene(kind) {
    const W = 1600, H = 1100, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (kind === 'interior') {
      // back wall
      let gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#D9D4CB'); gr.addColorStop(.55, '#E8E4DC'); gr.addColorStop(1, '#DCD7CE');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // left side wall in perspective
      g.fillStyle = '#C9C3B8'; g.beginPath(); g.moveTo(0, 0); g.lineTo(260, 0); g.lineTo(260, 990); g.lineTo(0, H); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(256, 0, 8, 990);
      // wood floor
      gr = g.createLinearGradient(0, 990, 0, H); gr.addColorStop(0, '#B08A63'); gr.addColorStop(1, '#8F6A45'); g.fillStyle = gr;
      g.beginPath(); g.moveTo(260, 990); g.lineTo(W, 990); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(60,40,20,.25)'; g.lineWidth = 2;
      for (let x = -800; x < W + 800; x += 120) { g.beginPath(); g.moveTo(800 + (x - 800) * .32, 990); g.lineTo(x, H); g.stroke(); }
      // baseboard
      g.fillStyle = '#F2EFEA'; g.fillRect(260, 962, W - 260, 28); g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(260, 988, W - 260, 3);
      // door opening (dark reveal)
      g.fillStyle = '#5A544C'; g.fillRect(612, 64, 376, 928);
      // light switch + framed print
      g.fillStyle = '#F7F6F3'; g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 2;
      g.fillRect(1060, 520, 46, 70); g.strokeRect(1060, 520, 46, 70);
      g.fillStyle = '#2F3A3C'; g.fillRect(1200, 300, 250, 330); g.fillStyle = '#EDE9E1'; g.fillRect(1220, 320, 210, 290);
      gr = g.createLinearGradient(1240, 340, 1410, 590); gr.addColorStop(0, '#9FB3B0'); gr.addColorStop(1, '#C9A97E'); g.fillStyle = gr; g.fillRect(1245, 345, 160, 240);
      // soft light falloff
      gr = g.createRadialGradient(800, 300, 50, 800, 400, 1100); gr.addColorStop(0, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(0,0,0,.18)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      return { canvas: c, quad: [[612, 64], [988, 64], [988, 992], [612, 992]] };
    }
    // entry: plaster facade, stone cladding, step, wall light
    let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#E9E6E0'); gr.addColorStop(1, '#D6D2CA'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .035})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
    // stone cladding panel right of door
    g.fillStyle = '#7D7468'; g.fillRect(1080, 0, 380, 1010);
    for (let y = 0; y < 1010; y += 46) for (let x = 1080 + ((y / 46) % 2) * 60; x < 1460; x += 120) {
      g.fillStyle = `hsl(${30 + Math.random() * 10} ${8 + Math.random() * 8}% ${38 + Math.random() * 14}%)`; g.fillRect(x + 2, y + 2, Math.min(116, 1458 - x), 42);
    }
    // canopy
    g.fillStyle = '#2B2F31'; g.fillRect(470, 0, 660, 28); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(470, 28, 660, 30);
    // door opening
    g.fillStyle = '#3B3833'; g.fillRect(592, 52, 416, 968);
    // wall lamp + number
    g.fillStyle = '#26292B'; g.fillRect(470, 360, 34, 120);
    gr = g.createRadialGradient(487, 420, 5, 487, 420, 260); gr.addColorStop(0, 'rgba(255,220,160,.35)'); gr.addColorStop(1, 'rgba(255,220,160,0)'); g.fillStyle = gr; g.fillRect(200, 100, 600, 700);
    g.fillStyle = '#2B2F31'; g.font = '600 64px Rubik, sans-serif'; g.fillText('12', 1500, 300);
    // step + paving
    g.fillStyle = '#BDB7AD'; g.fillRect(0, 1010, W, 90); g.fillStyle = '#A9A399'; g.fillRect(520, 1010, 560, 26);
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(520, 1036, 560, 8);
    // planter
    g.fillStyle = '#4A4E50'; g.fillRect(150, 820, 200, 190);
    for (let i = 0; i < 26; i++) { g.strokeStyle = `hsl(${100 + Math.random() * 30} 35% ${25 + Math.random() * 15}%)`; g.lineWidth = 6; g.beginPath(); g.moveTo(250, 820); g.quadraticCurveTo(250 + (Math.random() - .5) * 160, 700, 250 + (Math.random() - .5) * 260, 560 + Math.random() * 140); g.stroke(); }
    return { canvas: c, quad: [[592, 52], [1008, 52], [1008, 1020], [592, 1020]] };
  }
  function useSample() {
    const s = sampleScene(st.kind);
    st.bg = s.canvas; st.bgIsSample = true; st.quad = s.quad; setupStage();
  }

  /* ---------- perspective warp ---------- */
  function squareToQuad(p) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = p;
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    let g = 0, h = 0;
    if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) { const den = dx1 * dy2 - dx2 * dy1; g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den; }
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
    return (u, v) => { const w = g * u + h * v + 1; return [(a * u + b * v + x0) / w, (d * u + e * v + y0) / w]; };
  }
  function drawTri(g, img, s0, s1, s2, d0, d1, d2) {
    const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
    const grow = p => { const dx = p[0] - cx, dy = p[1] - cy, L = Math.hypot(dx, dy) || 1; return [p[0] + dx / L * .8, p[1] + dy / L * .8]; };
    const [e0, e1, e2] = [grow(d0), grow(d1), grow(d2)];
    const [sx0, sy0] = s0, [sx1, sy1] = s1, [sx2, sy2] = s2;
    const den = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
    if (!den) return;
    const a = ((d1[0] - d0[0]) * (sy2 - sy0) - (d2[0] - d0[0]) * (sy1 - sy0)) / den;
    const b = ((d2[0] - d0[0]) * (sx1 - sx0) - (d1[0] - d0[0]) * (sx2 - sx0)) / den;
    const c = ((d1[1] - d0[1]) * (sy2 - sy0) - (d2[1] - d0[1]) * (sy1 - sy0)) / den;
    const d = ((d2[1] - d0[1]) * (sx1 - sx0) - (d1[1] - d0[1]) * (sx2 - sx0)) / den;
    g.save();
    g.beginPath(); g.moveTo(e0[0], e0[1]); g.lineTo(e1[0], e1[1]); g.lineTo(e2[0], e2[1]); g.closePath(); g.clip();
    g.setTransform(a, c, b, d, d0[0] - a * sx0 - b * sy0, d0[1] - c * sx0 - d * sy0);
    g.drawImage(img, 0, 0);
    g.restore();
  }
  function warp(g, img, quad, mirror) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const map = squareToQuad(quad), NX = 8, NY = 16;
    const pts = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) pts.push(map(i / NX, j / NY));
    const P = (i, j) => pts[j * (NX + 1) + i];
    const S = (i, j) => [(mirror ? 1 - i / NX : i / NX) * W, j / NY * H];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      drawTri(g, img, S(i, j), S(i + 1, j), S(i + 1, j + 1), P(i, j), P(i + 1, j), P(i + 1, j + 1));
      drawTri(g, img, S(i, j), S(i + 1, j + 1), S(i, j + 1), P(i, j), P(i + 1, j + 1), P(i, j + 1));
    }
  }

  /* ---------- stage ---------- */
  const canvas = $('#canvas'), ctx = canvas.getContext('2d');
  const stageEl = $('#stage'), handlesEl = $('#handles'), outline = $('#outline'), poly = $('#outlinePoly');
  let doorImg = null, raf = 0;

  function setupStage() {
    canvas.width = st.bg.width; canvas.height = st.bg.height;
    outline.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
    handlesEl.innerHTML = '';
    st.quad.forEach((_, k) => {
      const h = document.createElement('div'); h.className = 'handle'; h.dataset.k = k; h.tabIndex = 0;
      h.setAttribute('aria-label', ['פינה עליונה שמאלית', 'פינה עליונה ימנית', 'פינה תחתונה ימנית', 'פינה תחתונה שמאלית'][k]);
      handlesEl.appendChild(h);
    });
    render();
  }
  function placeHandles() {
    const show = st.marking;
    $$('.handle', handlesEl).forEach(h => {
      const [x, y] = st.quad[+h.dataset.k];
      h.style.left = (x / canvas.width * 100) + '%'; h.style.top = (y / canvas.height * 100) + '%'; h.hidden = !show;
    });
    poly.setAttribute('points', st.quad.map(p => p.join(',')).join(' '));
    outline.style.display = show ? '' : 'none';
    $('#hint').hidden = !show || hintSeen;
  }
  function compose(g, w, h) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.drawImage(st.bg, 0, 0, w, h);
    if (!doorImg) return;
    const sx = w / st.bg.width, sy = h / st.bg.height;
    const q = st.quad.map(([x, y]) => [x * sx, y * sy]);
    const mirror = st.opts.side === 'left';
    warp(g, doorImg, q, false);
    const path = () => { g.beginPath(); g.moveTo(q[0][0], q[0][1]); q.slice(1).forEach(p => g.lineTo(p[0], p[1])); g.closePath(); };
    // lighting match
    if (st.light) { g.save(); path(); g.clip(); g.fillStyle = st.light < 0 ? `rgba(0,0,0,${-st.light / 100})` : `rgba(255,255,255,${st.light / 100})`; g.fillRect(0, 0, w, h); g.restore(); }
    // recess shadow from the top and the hinge side
    if (st.depth) {
      g.save(); path(); g.clip();
      const top = (q[0][1] + q[1][1]) / 2, hh = ((q[3][1] + q[2][1]) / 2 - top);
      let gr = g.createLinearGradient(0, top, 0, top + hh * .05 * st.depth / 10);
      gr.addColorStop(0, `rgba(0,0,0,${.35 * st.depth / 30 + .1})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const left = (q[0][0] + q[3][0]) / 2, right = (q[1][0] + q[2][0]) / 2, ww = right - left;
      const fromX = mirror ? right : left, toX = mirror ? right - ww * .06 : left + ww * .06;
      gr = g.createLinearGradient(fromX, 0, toX, 0);
      gr.addColorStop(0, `rgba(0,0,0,${.22 * st.depth / 30})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.restore();
    }
  }
  function render() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { compose(ctx, canvas.width, canvas.height); placeHandles(); drawMini(); });
  }
  // תצוגה מוקטנת שצפה בטלפון, כדי לראות את הדלת בזמן הבחירה
  const mini = $('#mini'), miniC = $('#miniCanvas');
  let stageVisible = true;
  function drawMini() {
    if (mini.hidden) return;
    const xs = st.quad.map(p => p[0]), ys = st.quad.map(p => p[1]);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = (y1 - y0) * .08; x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const k = Math.min(miniC.width / (x1 - x0), miniC.height / (y1 - y0)), w = (x1 - x0) * k, h = (y1 - y0) * k;
    const g = miniC.getContext('2d'); g.fillStyle = '#0d1112'; g.fillRect(0, 0, miniC.width, miniC.height);
    g.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, (miniC.width - w) / 2, (miniC.height - h) / 2, w, h);
  }
  function updateMini() {
    const want = !stageVisible && window.matchMedia('(max-width: 960px)').matches && !$('#view-studio').hidden;
    if (mini.hidden === !want) return;
    mini.hidden = !want; if (want) drawMini();
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { stageVisible = es[0].isIntersecting; updateMini(); }, { threshold: .15 }).observe(stageEl);
  window.addEventListener('resize', updateMini);
  mini.addEventListener('click', () => stageEl.scrollIntoView({ behavior: 'smooth', block: 'center' }));

  function snapshot(max = 900) {
    const k = Math.min(1, max / Math.max(canvas.width, canvas.height));
    const c = document.createElement('canvas'); c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
    compose(c.getContext('2d'), c.width, c.height);
    try { return c.toDataURL('image/jpeg', .82); } catch { return ''; }
  }

  // dragging corners, or the whole door
  const toImg = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * canvas.width, (e.clientY - r.top) / r.height * canvas.height]; };
  function inside(pt, q) {
    let c = false;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
      if ((q[i][1] > pt[1]) !== (q[j][1] > pt[1]) && pt[0] < (q[j][0] - q[i][0]) * (pt[1] - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) c = !c;
    }
    return c;
  }
  let drag = null, hintSeen = false;
  stageEl.addEventListener('pointerdown', e => {
    if (!st.marking) return;
    const h = e.target.closest('.handle');
    const p = toImg(e);
    if (h) drag = { k: +h.dataset.k };
    else if (inside(p, st.quad)) drag = { all: true, from: p, orig: st.quad.map(q => q.slice()) };
    else return;
    stageEl.setPointerCapture(e.pointerId); e.preventDefault();
  });
  stageEl.addEventListener('pointermove', e => {
    if (!drag) return;
    const [x, y] = toImg(e), cl = (v, m) => Math.max(0, Math.min(m, v));
    if (drag.all) { const dx = x - drag.from[0], dy = y - drag.from[1]; st.quad = drag.orig.map(([a, b]) => [cl(a + dx, canvas.width), cl(b + dy, canvas.height)]); }
    else st.quad[drag.k] = [cl(x, canvas.width), cl(y, canvas.height)];
    render();
  });
  const endDrag = () => { if (drag) { hintSeen = true; placeHandles(); } drag = null; };
  stageEl.addEventListener('pointerup', endDrag); stageEl.addEventListener('pointercancel', endDrag);
  handlesEl.addEventListener('keydown', e => { // keyboard nudging
    const h = e.target.closest('.handle'); if (!h) return;
    const d = { ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4] }[e.key]; if (!d) return;
    const k = +h.dataset.k; st.quad[k] = [st.quad[k][0] + d[0], st.quad[k][1] + d[1]]; render(); e.preventDefault();
  });

  function loadPhoto(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1800 / Math.max(im.width, im.height));
      const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      st.bg = c; st.bgIsSample = false;
      const h = c.height * .62, w = h / 2.45, x = c.width / 2 - w / 2, y = c.height * .2;
      st.quad = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      hintSeen = false; st.marking = true; $('#markBtn').setAttribute('aria-pressed', 'true');
      setupStage(); toast('גררו את הנקודות הכחולות לפינות הפתח');
    };
    im.onerror = () => toast('לא הצלחנו לפתוח את התמונה. נסו קובץ JPG או PNG.');
    im.src = url;
  }
  $('#camInput').addEventListener('change', e => { loadPhoto(e.target.files[0]); e.target.value = ''; });
  $('#fileInput').addEventListener('change', e => { loadPhoto(e.target.files[0]); e.target.value = ''; });
  $('#sampleBtn').addEventListener('click', useSample);
  $('#markBtn').addEventListener('click', e => { st.marking = !st.marking; e.currentTarget.setAttribute('aria-pressed', st.marking); placeHandles(); });
  $('#light').addEventListener('input', e => { st.light = +e.target.value; render(); });
  $('#depth').addEventListener('input', e => { st.depth = +e.target.value; render(); });


  /* ---------- door composition: color, glass and grille, handle, side panels ---------- */
  const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const ralHex = code => (RAL.find(r => r[0] === code) || [])[2];
  const leafColor = (v, o) => (o.ral && ralHex(o.ral)) || v.swatch;
  function grilleColor(o, leaf) { return o.grilleColor === 'door' ? leaf : (find('eGColor', o.grilleColor).sw || '#1A1A1A'); }

  function recolor(g, W, H, from, to) {
    const d = g.getImageData(0, 0, W, H), p = d.data, src = hex2rgb(from), dst = hex2rgb(to);
    const sl = Math.max(20, .3 * src[0] + .59 * src[1] + .11 * src[2]);
    // מדלת כהה לבהירה: מצמצמים את טווח הבהירות כדי שהמרקם לא יהפוך לרעש
    const lo = sl < 70 ? .82 : .45, hi = sl < 70 ? 1.18 : 1.6;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] < 10) continue;
      const dr = p[i] - src[0], dg = p[i + 1] - src[1], db = p[i + 2] - src[2], dist = Math.sqrt(dr * dr + dg * dg + db * db);
      const w = dist < 40 ? 1 : dist > 85 ? 0 : 1 - (dist - 40) / 45;
      if (!w) continue;
      const r = Math.max(lo, Math.min(hi, (.3 * p[i] + .59 * p[i + 1] + .11 * p[i + 2]) / sl));
      for (let k = 0; k < 3; k++) p[i + k] = p[i + k] * (1 - w) + Math.min(255, dst[k] * r) * w;
    }
    g.putImageData(d, 0, 0);
  }
  const tintCache = new Map();
  async function tinted(src, color) {
    const key = src + color;
    if (tintCache.has(key)) return tintCache.get(key);
    const im = await loadImg(src), c = mk(im.naturalWidth, im.naturalHeight), g = c.getContext('2d');
    g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    tintCache.set(key, c); return c;
  }
  function paintGlass(g, X, Y, w, h, kind) {
    const tones = { frost: ['#E6EBEC', '#C7D0D2'], clear: ['#55646A', '#9AAEB4'], reed: ['#E1E7E8', '#C2CCCE'], tinted: ['#30363A', '#5A6266'] }[kind] || ['#E6EBEC', '#C7D0D2'];
    let gr = g.createLinearGradient(X, Y, X, Y + h); gr.addColorStop(0, tones[0]); gr.addColorStop(1, tones[1]);
    g.fillStyle = gr; g.fillRect(X, Y, w, h);
    if (kind === 'reed') { g.fillStyle = 'rgba(255,255,255,.45)'; for (let x = X; x < X + w; x += 4) g.fillRect(x, Y, 1.6, h); }
    gr = g.createLinearGradient(X, Y, X + w, Y + h);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.42, 'rgba(255,255,255,.28)'); gr.addColorStop(.5, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(X, Y, w, h);
  }
  async function paintWindow(g, W, H, win, o, leaf) {
    let X = win[0] * W, Y = win[1] * H, w = (win[2] - win[0]) * W, h = (win[3] - win[1]) * H;
    X += w * .05; Y += h * .025; w *= .9; h *= .95;
    paintGlass(g, X, Y, w, h, o.glass);
    const gr = grilleOf(o.grille);
    if (gr) g.drawImage(await tinted(gr.src, grilleColor(o, leaf)), X, Y, w, h);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = Math.max(1.5, W * .008); g.strokeRect(X, Y, w, h);
    if (o.belgian) { g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = Math.max(1, W * .004); g.strokeRect(X + w * .04, Y + h * .02, w * .92, h * .96); }
  }
  async function paintHandle(g, W, H, v, o) {
    const h = find('iHandle', o.handle), im = await loadImg(h.cut);
    const hw = W * .23, hh = hw * h.ar, cx = (v.hx + .045) * W, cy = v.hy * H;
    g.save(); g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = W * .012; g.shadowOffsetY = W * .005;
    g.drawImage(im, cx - hw * h.rx, cy - hh * h.ry, hw, hh); g.restore();
    // רוזטה תחתונה: חור מנעול או סיבוב פנוי/תפוס
    const r = W * .028, ky = cy + H * .055;
    g.save(); g.shadowColor = 'rgba(0,0,0,.22)'; g.shadowBlur = W * .008;
    g.beginPath(); g.arc(cx, ky, r, 0, Math.PI * 2); g.fillStyle = h.fin; g.fill(); g.restore();
    g.fillStyle = 'rgba(0,0,0,.6)';
    if (o.cyl === 'privacy') g.fillRect(cx - r * .55, ky - r * .13, r * 1.1, r * .26);
    else { g.beginPath(); g.arc(cx, ky - r * .22, r * .22, 0, Math.PI * 2); g.fill(); g.fillRect(cx - r * .1, ky - r * .22, r * .2, r * .6); }
  }
  function flip(c) { const o = mk(c.width, c.height), g = o.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); return o; }
  const SIDE_RATIO = .36;
  const sideUnits = u => ({ l: u === 'left' || u === 'both' ? 1 : 0, r: u === 'right' || u === 'both' ? 1 : 0 });
  async function addSidePanels(door, o, leaf) {
    const W = door.width, H = door.height, sw = Math.round(W * SIDE_RATIO), u = sideUnits(o.sideUnit);
    const c = mk(W + sw * (u.l + u.r), H), g = c.getContext('2d');
    g.drawImage(door, u.l * sw, 0);
    const sg = find('eSideGrille', o.sideGrille), gi = await tinted(sg.img, grilleColor(o, leaf));
    const panel = x => {
      g.fillStyle = leaf; g.fillRect(x, 0, sw, H);
      let gr = g.createLinearGradient(x, 0, x + sw, 0); gr.addColorStop(0, 'rgba(0,0,0,.12)'); gr.addColorStop(.5, 'rgba(255,255,255,.04)'); gr.addColorStop(1, 'rgba(0,0,0,.12)');
      g.fillStyle = gr; g.fillRect(x, 0, sw, H);
      const fx = sw * .2, fy = H * .05, X = x + fx, Y = fy, w = sw - 2 * fx, h = H - 2 * fy;
      paintGlass(g, X, Y, w, h, o.glass);
      g.drawImage(gi, X, Y, w, h);
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = Math.max(1.5, W * .008); g.strokeRect(X, Y, w, h);
      g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x + (x === 0 ? sw - 3 : 0), 0, 3, H);
    };
    if (u.l) panel(0);
    if (u.r) panel(u.l * sw + W);
    return c;
  }
  // ידית לדלת כניסה: מוט אנכי, ידית משיכה אופקית או סט ידית מנוף, במקום הידית שנמחקה מהתמונה
  const entryHandleSwaps = (v, o) => !!v.eclean && o.handle !== 'lever';
  async function paintEntryHandle(g, W, H, v, o) {
    const h = find('eHandle', o.handle), im = await loadImg(h.img);
    const [x0, , x1] = v.hb, cx = (x0 + x1) / 2 * W, lockLeft = cx < W / 2;
    const perCm = H * .9 / 240, iw = im.naturalWidth, ih = im.naturalHeight;
    g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = W * .015; g.shadowOffsetX = W * .006; g.shadowOffsetY = W * .006;
    let cylX, cylY = H * .615;
    if (h.kind === 'bar') {
      const len = o.handleLen || h.lens[0], bh = len * perCm, bw = Math.max(W * .022, bh * iw / ih);
      const x = Math.min(Math.max(cx, W * .13), W * .87), y = H * .55;
      g.drawImage(im, x - bw / 2, y - bh / 2, bw, bh);
      cylX = lockLeft ? Math.max(W * .115, x - W * .065) : Math.min(W * .885, x + W * .065);
    } else if (h.kind === 'pull') {
      const len = o.handleLen || h.lens[0], pw = Math.min(W * .62, len * W * .84 / 98), ph = pw * ih / iw;
      const x = lockLeft ? W * .13 + pw / 2 : W * .87 - pw / 2;
      // ידית משיכה לא עולה על החלון: אם החלון יורד עד גובה הידית, היא יורדת מתחתיו
      const py = v.win && v.win[3] * H > H * .5 ? Math.min(H * .8, v.win[3] * H + H * .05) : H * .55;
      g.drawImage(im, x - pw / 2, py - ph / 2, pw, ph);
      cylX = lockLeft ? W * .13 + pw + W * .05 : W * .87 - pw - W * .05; cylY = py + H * .06;
    } else {
      const lw = W * .26, lh = lw * ih / iw, px = lockLeft ? Math.max(cx, W * .14) : Math.min(cx, W * .86), py = H * .55;
      g.translate(px, py); if (!lockLeft) g.scale(-1, 1);
      g.drawImage(im, -lw * .2, -lh * .28, lw, lh);
    }
    g.restore();
    if (cylX) { // צילינדר
      const r = W * .024, y = cylY;
      g.save(); g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = W * .01;
      const gr = g.createRadialGradient(cylX - r * .3, y - r * .3, r * .1, cylX, y, r);
      gr.addColorStop(0, '#F2F3F4'); gr.addColorStop(1, '#8E9396');
      g.beginPath(); g.arc(cylX, y, r, 0, Math.PI * 2); g.fillStyle = gr; g.fill(); g.restore();
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(cylX - r * .12, y - r * .45, r * .24, r * .9);
    }
  }
  async function buildDoor(m, v, o) {
    const useClean = m.kind === 'interior' ? !!v.clean : entryHandleSwaps(v, o);
    const img = await loadImg(useClean ? (v.clean || v.eclean) : v.src);
    const W = img.naturalWidth, H = img.naturalHeight, c = mk(W, H), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const leaf = leafColor(v, o);
    if (m.kind === 'entry') {
      if (o.ral) recolor(g, W, H, v.swatch, leaf);
      if (v.win && o.grille) await paintWindow(g, W, H, v.win, o, leaf);
      if (useClean) await paintEntryHandle(g, W, H, v, o);
    } else if (useClean) await paintHandle(g, W, H, v, o);
    let out = o.side === 'left' ? flip(c) : c;
    if (m.kind === 'entry' && o.sideUnit !== 'none') out = await addSidePanels(out, o, leaf);
    return out;
  }
  let doorSeq = 0;
  async function updateDoor() {
    const seq = ++doorSeq;
    try { const c = await buildDoor(st.model, st.model.variants[st.vi], st.opts); if (seq === doorSeq) { doorImg = c; render(); } }
    catch (e) { console.error(e); toast('תמונת הדלת לא נטענה'); }
  }
  // כשמוסיפים או מורידים יחידת צד, הפתח המסומן מתרחב או מצטמצם, והדלת עצמה נשארת במקומה
  function refitQuad(prevUnit, nextUnit) {
    const a = sideUnits(prevUnit), b = sideUnits(nextUnit);
    const Wo = 1 + SIDE_RATIO * (a.l + a.r);
    const uL = (SIDE_RATIO * (a.l - b.l)) / Wo, uR = (SIDE_RATIO * a.l + 1 + SIDE_RATIO * b.r) / Wo;
    const map = squareToQuad(st.quad);
    st.quad = [map(uL, 0), map(uR, 0), map(uR, 1), map(uL, 1)];
  }

  /* ---------- catalog panel ---------- */
  const list = () => CAT[st.kind];
  const hasWin = m => m.variants.some(v => v.win);
  function renderChips() {
    const series = [...new Set(list().map(m => m.series))];
    const chips = [['all', 'הכל'], ...(st.kind === 'entry' ? [['win', 'עם חלון לסורג']] : []), ...series.map(s => [s, s.replace('סדרת ', '')])];
    $('#chips').innerHTML = series.length > 1 ? chips.map(([v, l]) => `<button class="chip" data-s="${v}" aria-pressed="${st.series === v}">${l}</button>`).join('') : '';
  }
  function renderGrid() {
    const q = st.q.trim();
    const items = list().filter(m => (st.series === 'all' || (st.series === 'win' ? hasWin(m) : m.series === st.series)) && (!q || m.name.includes(q) || m.series.includes(q)));
    $('#grid').innerHTML = items.length ? items.map(m => `<button class="tile" data-id="${m.id}" aria-pressed="${m === st.model}">
        <img src="${m.variants[0].src}" alt="" loading="lazy"><span>${st.kind === 'entry' ? 'דגם ' : ''}${m.name}</span><small>${fmt(priceOf(m))}</small></button>`).join('')
      : `<p style="grid-column:1/-1;color:var(--muted);margin:8px">לא נמצאו דגמים בשם "${esc(q)}".</p>`;
  }

  // רכיבי בחירה חזותיים
  const priceTag = p => p ? `<small>+${fmt(p)}</small>` : '<small class="incl">כלול</small>';
  const picks = (key, items, cur, { group, cls = '', price } = {}) => `<div class="picks ${cls}">${items.map(it => {
    const p = price ? price(it) : P(group, it);
    return `<button class="pick" data-k="${key}" data-v="${it.v}" aria-pressed="${it.v === cur}" title="${esc(it.l)}">
      ${it.img ? `<span class="pi"><img src="${it.img}" alt="" loading="lazy"></span>` : `<span class="pi none">${it.icon || ''}</span>`}
      <span class="pl">${it.l}</span>${priceTag(p)}${it.badge ? `<em>${it.badge}</em>` : ''}</button>`; }).join('')}</div>`;
  const chipRow = (key, items, cur, group) => `<div class="chips-row">${items.map(it => `<button class="chip" data-k="${key}" data-v="${it.v}" aria-pressed="${it.v === cur}">${it.sw ? `<i style="background:${it.sw}"></i>` : ''}${it.l}${group && P(group, it) ? ` <small>+${fmt(P(group, it))}</small>` : ''}</button>`).join('')}</div>`;
  const check = (key, label, p, on) => `<label class="ck"><input type="checkbox" data-ck="${key}" ${on ? 'checked' : ''}><span>${label}</span>${p ? `<small>+${fmt(p)}</small>` : ''}</label>`;
  function calc(m = st.model, vi = st.vi, o = st.opts) {
    const v = m.variants[vi], L = [[`דלת ${m.brand} ${m.kind === 'entry' ? 'דגם ' : ''}${m.name}, כולל משקוף`, priceOf(m)]], D = [];
    const add = (label, price, desc = label) => { if (price) L.push([label, price]); if (desc) D.push(desc); };
    if (m.kind === 'interior') {
      add(`גוון ${v.color}`, v.extra);
      const fr = find('iFrame', o.frame); add(fr.l, P('iFrame', fr), o.frame === 'std' ? '' : fr.l);
      const w = find('iWidth', o.width), h = find('iHeight', o.height);
      add(`רוחב ${w.l}`, P('iWidth', w)); add(`גובה ${h.l}`, P('iHeight', h));
      D.push(`פתיחה ל${o.side === 'left' ? 'שמאל' : 'ימין'}`);
      const hd = find('iHandle', o.handle); add(hd.l, P('iHandle', hd));
      const cy = find('iCyl', o.cyl); add(cy.l, P('iCyl', cy));
      if (o.frame !== 'zero') { const hg = find('iHinge', o.hinge); add(hg.l, P('iHinge', hg)); } else D.push('צירים נסתרים');
      if (o.mez !== 'none') { const mz = find('iMez', o.mez); add(mz.l, P('iMez', mz)); }
      if (o.mamad) add(G.iMamad[0].l, P('iMamad', G.iMamad[0]));
    } else {
      if (o.ral) { const r = RAL.find(x => x[0] === o.ral); add(`צביעה ב-RAL ${r[0]} ${r[1]}`, P('eRal', G.eRal[0])); }
      else add(`גוון ${v.color}`, 0);
      if (v.win) {
        if (o.grille) { const gr = grilleOf(o.grille); add(`סורג ${gr.num}${gr.special ? ' (מיוחד)' : ''}`, grillePrice(o.grille)); }
        else D.push('סורג כמו בתמונה');
        const gc = find('eGColor', o.grilleColor); add(`סורג ב${gc.v === 'door' ? 'גוון הדלת' : 'צבע ' + gc.l}`, P('eGColor', gc));
        const gl = find('eGlass', o.glass); add(`זכוכית ${gl.l}`, P('eGlass', gl));
        if (o.belgian) add(G.eBelgian[0].l, P('eBelgian', G.eBelgian[0]));
      }
      if (o.sideUnit !== 'none') { const s = find('eSide', o.sideUnit); add(`יחידת צד ${s.l} עם סורג ${o.sideGrille}`, P('eSide', s)); }
      const w = find('eWidth', o.width); add(`רוחב ${w.l}`, P('eWidth', w));
      D.push(`פתיחה ל${o.side === 'left' ? 'שמאל' : 'ימין'}`);
      const hd = find('eHandle', o.handle); add(hd.l + (o.handleLen ? ` ${o.handleLen} ס״מ` : ''), P('eHandle', hd) + handleLenPrice(hd, o.handleLen));
      const cy = find('eCyl', o.cyl); add(cy.l, P('eCyl', cy));
      if (o.mez !== 'none') { const mz = find('eMez', o.mez); add(mz.l, P('eMez', mz)); }
      G.eExtra.forEach(x => { if (o[x.v]) add(x.l, P('eExtra', x)); });
    }
    if (o.install) add('התקנה', m.kind === 'entry' ? settings.instE : settings.instI);
    else D.push('ללא התקנה');
    if (o.remove) add('פירוק ופינוי דלת קיימת', m.kind === 'entry' ? settings.remE : settings.remI);
    const unit = L.reduce((s, x) => s + (+x[1] || 0), 0);
    return { lines: L, unit, total: unit * (o.qty || 1), desc: D.filter(Boolean).join(' · ') };
  }

  // ארבע ההחלטות שמוכרות את הדלת מוצגות תמיד; כל השאר נמצא ב"פרטים טכניים" עם ברירות מחדל סבירות
  const step = (n, title, value, price, body, note = '') => `<section class="step">
    <header><span class="sn">${n}</span><h3>${title}</h3><span class="sv">${value}</span>${price ? `<span class="sp">+${fmt(price)}</span>` : ''}</header>
    ${note ? `<p class="note">${note}</p>` : ''}${body}</section>`;
  const block = (title, value, body) => `<div class="tblock"><h4>${title}${value ? ` <small>${value}</small>` : ''}</h4>${body}</div>`;
  const sideChips = o => chipRow('side', [{ v: 'right', l: 'ימין' }, { v: 'left', l: 'שמאל' }], o.side);
  const installBlock = (m, o) => block('התקנה', '', check('install', 'התקנה', m.kind === 'entry' ? settings.instE : settings.instI, o.install) +
    check('remove', 'פירוק ופינוי דלת קיימת', m.kind === 'entry' ? settings.remE : settings.remI, o.remove));

  function stepsInterior(m, v, o) {
    const hd = find('iHandle', o.handle), cy = find('iCyl', o.cyl), hg = find('iHinge', o.hinge), fr = find('iFrame', o.frame);
    const w = find('iWidth', o.width), h = find('iHeight', o.height), mz = find('iMez', o.mez);
    const main = [
      step(2, 'גוון', v.color, v.extra, `<div class="swatches">${m.variants.map((x, i) =>
        `<button class="sw" data-vi="${i}" aria-pressed="${i === st.vi}"><i style="background:${x.swatch}"></i>${x.color}${x.extra ? ` +${fmt(x.extra)}` : ''}</button>`).join('')}</div>`),
      step(3, 'ידית', hd.l.replace('ידית ', ''), P('iHandle', hd), picks('handle', G.iHandle, o.handle, { group: 'iHandle', cls: 'hw' }),
        v.clean ? '' : 'בדגם הזה ההדמיה מציגה את הידית המקורית. הידית שתבחרו תיכנס להצעה.'),
    ];
    const techPrice = P('iCyl', cy) + (o.frame !== 'zero' ? P('iHinge', hg) : 0) + P('iFrame', fr) + P('iWidth', w) + P('iHeight', h) +
      (o.mez !== 'none' ? P('iMez', mz) : 0) + (o.mamad ? P('iMamad', G.iMamad[0]) : 0);
    const techSummary = [`רוחב ${w.l}`, `פתיחה ל${o.side === 'left' ? 'שמאל' : 'ימין'}`, o.frame === 'zero' ? 'ZERO' : '', o.install ? 'כולל התקנה' : 'ללא התקנה'].filter(Boolean).join(' · ');
    const tech = [
      block('מידות ופתיחה', '', `<div class="row-l"><span>רוחב</span>${chipRow('width', G.iWidth, o.width, 'iWidth')}</div>
        <div class="row-l"><span>גובה</span>${chipRow('height', G.iHeight, o.height, 'iHeight')}</div>
        <div class="row-l"><span>כיוון פתיחה</span>${sideChips(o)}</div>`),
      block('משקוף', o.frame === 'zero' ? 'מגיע עם צירים נסתרים' : '', chipRow('frame', G.iFrame, o.frame, 'iFrame')),
      block('נעילה', '', picks('cyl', G.iCyl, o.cyl, { group: 'iCyl', cls: 'hw sm' })),
      o.frame === 'zero' ? '' : block('צירים', '', picks('hinge', G.iHinge, o.hinge, { group: 'iHinge', cls: 'hw sm' })),
      block('מזוזה וממ״ד', '', picks('mez', G.iMez, o.mez, { group: 'iMez', cls: 'hw sm' }) + check('mamad', G.iMamad[0].l, P('iMamad', G.iMamad[0]), o.mamad)),
      installBlock(m, o),
    ];
    return { main, tech, techSummary, techPrice };
  }
  function stepsEntry(m, v, o) {
    const leaf = leafColor(v, o), ral = o.ral && RAL.find(r => r[0] === o.ral);
    const hd = find('eHandle', o.handle), cy = find('eCyl', o.cyl), w = find('eWidth', o.width), mz = find('eMez', o.mez), side = find('eSide', o.sideUnit);
    const gr = grilleOf(o.grille), gc = find('eGColor', o.grilleColor), gl = find('eGlass', o.glass);
    const extrasOn = G.eExtra.filter(x => o[x.v]);
    const grilleItems = [{ v: '', l: 'כמו בתמונה', p: 0, icon: '↺' }, ...EX.grilles.map(g => ({ v: g.num, l: g.num, img: g.src, badge: g.special ? 'מיוחד' : '' }))];
    const handleNote = v.eclean ? '' : 'בדגם הזה ההדמיה מציגה את הידית המקורית. הידית שתבחרו תיכנס להצעה.';
    const main = [
      step(2, 'גוון', ral ? `RAL ${ral[0]} ${ral[1]}` : v.color, o.ral ? P('eRal', G.eRal[0]) : 0,
        `${m.variants.length > 1 || !o.ral ? `<div class="swatches">${m.variants.map((x, i) =>
          `<button class="sw" data-vi="${i}" aria-pressed="${!o.ral && i === st.vi}"><i style="background:${x.swatch}"></i>${x.color}</button>`).join('')}</div>` : ''}
         <div class="row-l"><span>כל גוון מהמניפה · +${fmt(P('eRal', G.eRal[0]))}</span><div class="ral">${RAL.map(r =>
          `<button class="ralb" data-k="ral" data-v="${r[0]}" aria-pressed="${o.ral === r[0]}" title="RAL ${r[0]} ${r[1]}"><i style="background:${r[2]}"></i><small>${r[0]}</small></button>`).join('')}</div></div>`),
      v.win
        ? step(3, 'סורג', `${gr ? gr.num : 'כמו בתמונה'} · ${gc.l}`, (o.grille ? grillePrice(o.grille) : 0) + P('eGColor', gc),
          `${picks('grille', grilleItems, o.grille, { cls: 'gr', price: it => it.v ? grillePrice(it.v) : 0 })}
           <div class="row-l"><span>צבע הסורג</span>${chipRow('grilleColor', G.eGColor.map(x => x.v === 'door' ? { ...x, sw: leaf } : x), o.grilleColor, 'eGColor')}</div>`)
        : step(3, 'סורג', 'אין חלון בדגם', 0, `<button class="btn small" data-act="winFilter">הצגת דגמים עם חלון לסורג</button>`, 'לדגם הזה אין חלון זכוכית, ולכן אין בו סורג.'),
      step(4, 'ידית', hd.l + (o.handleLen ? ` · ${o.handleLen} ס״מ` : ''), P('eHandle', hd) + handleLenPrice(hd, o.handleLen),
        picks('handle', G.eHandle, o.handle, { group: 'eHandle', cls: 'hw eh' }) +
        (hd.lens ? `<div class="row-l"><span>אורך</span>${chipRow('handleLen', hd.lens.map((x, i) => ({ v: String(x), l: `${x} ס״מ`, p: i * P('eHandleLen', G.eHandleLen[0]) })), String(o.handleLen))}</div>` : ''),
        handleNote),
    ];
    const techPrice = P('eSide', side) + (v.win ? P('eGlass', gl) + (o.belgian ? P('eBelgian', G.eBelgian[0]) : 0) : 0) + P('eCyl', cy) + P('eWidth', w) +
      (o.mez !== 'none' ? P('eMez', mz) : 0) + extrasOn.reduce((s, x) => s + P('eExtra', x), 0);
    const techSummary = [`רוחב ${w.l}`, `פתיחה ל${o.side === 'left' ? 'שמאל' : 'ימין'}`, o.sideUnit !== 'none' ? `יחידת צד ${side.l}` : '', o.install ? 'כולל התקנה' : 'ללא התקנה'].filter(Boolean).join(' · ');
    const tech = [
      block('מידות ופתיחה', '', `<div class="row-l"><span>רוחב</span>${chipRow('width', G.eWidth, o.width, 'eWidth')}</div><div class="row-l"><span>כיוון פתיחה</span>${sideChips(o)}</div>`),
      block('יחידת צד', 'חלון קבוע עם סורג לצד הדלת', `${chipRow('sideUnit', G.eSide, o.sideUnit, 'eSide')}${o.sideUnit === 'none' ? '' :
        `<div class="row-l"><span>סורג ליחידת הצד</span>${picks('sideGrille', G.eSideGrille, o.sideGrille, { group: 'eSideGrille', cls: 'gr side' })}</div>`}`),
      v.win ? block('זכוכית', '', chipRow('glass', G.eGlass, o.glass, 'eGlass') + check('belgian', G.eBelgian[0].l, P('eBelgian', G.eBelgian[0]), o.belgian)) : '',
      block('מנעול וצילינדר', '', chipRow('cyl', G.eCyl, o.cyl, 'eCyl')),
      block('אביזרים', '', `${G.eExtra.map(x => check(x.v, x.l, P('eExtra', x), o[x.v])).join('')}<div class="row-l"><span>מזוזה</span>${chipRow('mez', G.eMez, o.mez, 'eMez')}</div>`),
      installBlock(m, o),
    ];
    return { main, tech, techSummary, techPrice };
  }
  function renderDetail() {
    const m = st.model, v = m.variants[st.vi], o = st.opts, c = calc();
    const s = (m.kind === 'entry' ? stepsEntry : stepsInterior)(m, v, o);
    const n = s.main.length + 2;
    $('#detail').innerHTML = `
      <div class="model-h"><h2>${m.kind === 'entry' ? 'דגם ' : ''}${m.name}</h2><div class="sub">${m.brand} · ${m.series} · ${m.desc}</div></div>
      ${s.main.join('')}
      <details class="tech" data-sec="tech" ${st.open.has('tech') ? 'open' : ''}>
        <summary><span class="sn">${n}</span><span class="tt">פרטים טכניים</span><span class="sv">${s.techSummary}</span>${s.techPrice ? `<span class="sp">+${fmt(s.techPrice)}</span>` : ''}</summary>
        <div class="tb">${s.tech.join('')}</div>
      </details>
      <div class="opts">
        <label class="field"><span>חדר / מיקום</span><input type="text" id="oRoom" value="${esc(o.room || '')}" placeholder="${m.kind === 'entry' ? 'כניסה ראשית' : 'חדר שינה הורים'}"></label>
        <label class="field"><span>כמות</span><input type="number" id="oQty" min="1" value="${o.qty}"></label>
      </div>
      <div class="price">
        ${c.lines.map(([l, p]) => `<div class="ln"><span>${l}</span><b>${fmt(p)}</b></div>`).join('')}
        ${o.qty > 1 ? `<div class="ln"><span>× ${o.qty} יחידות</span><b></b></div>` : ''}
        <div class="total"><span>סה״כ לפני מע״מ</span><b>${fmt(c.total)}</b></div>
        <div class="note">מחירי דוגמה. אפשר לעדכן אותם בלשונית "מחירון".</div>
      </div>
      <div class="actions"><button class="btn primary" id="addBtn">הוספה להצעת המחיר</button></div>`;
  }
  function refreshPanel() { renderChips(); renderGrid(); renderDetail(); }

  function setKind(kind) {
    if (st.kind === kind) return;
    st.kind = kind; st.series = 'all'; st.q = ''; $('#search').value = '';
    $$('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.kind === kind));
    st.model = kind === 'entry' ? (CAT.entry.find(m => m.name === '3014') || CAT.entry[0]) : (CAT.interior.find(m => m.name === 'יובל') || CAT.interior[0]);
    st.vi = 0;
    st.opts = { ...DEFAULTS[kind], side: st.opts.side, install: st.opts.install, remove: st.opts.remove, qty: 1, room: '' };
    if (st.bgIsSample) useSample();
    refreshPanel(); updateDoor();
  }
  $$('.seg button').forEach(b => b.addEventListener('click', () => setKind(b.dataset.kind)));
  $('#search').addEventListener('input', e => { st.q = e.target.value; renderGrid(); });
  $('#chips').addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; st.series = c.dataset.s; renderChips(); renderGrid(); });
  $('#grid').addEventListener('click', e => {
    const t = e.target.closest('.tile'); if (!t) return;
    st.model = byId[t.dataset.id]; st.vi = 0;
    if (st.kind === 'entry') st.opts.ral = null;
    $$('.tile', $('#grid')).forEach(x => x.setAttribute('aria-pressed', x === t));
    renderDetail(); updateDoor();
  });
  const detail = $('#detail');
  detail.addEventListener('toggle', e => { const d = e.target.closest('[data-sec]'); if (!d) return; d.open ? st.open.add(d.dataset.sec) : st.open.delete(d.dataset.sec); }, true);
  detail.addEventListener('click', e => {
    const sw = e.target.closest('.sw');
    if (sw) { st.vi = +sw.dataset.vi; st.opts.ral = null; renderDetail(); updateDoor(); return; }
    if (e.target.closest('[data-act="winFilter"]')) { st.series = 'win'; renderChips(); renderGrid(); $('#grid').scrollTop = 0; toast('מוצגים דגמים עם חלון לסורג'); return; }
    const b = e.target.closest('[data-k]');
    if (b) {
      const k = b.dataset.k, o = st.opts; let v = b.dataset.v;
      if (k === 'ral') v = o.ral === v ? null : v;
      if (k === 'handleLen') v = +v;
      if (k === 'sideUnit' && v !== o.sideUnit) refitQuad(o.sideUnit, v);
      o[k] = v;
      if (k === 'handle') { const h = find('eHandle', v); o.handleLen = st.kind === 'entry' && h.lens ? h.lens[0] : null; }
      renderDetail(); updateDoor(); return;
    }
    if (e.target.closest('#addBtn')) addToQuote();
  });
  detail.addEventListener('change', e => {
    const o = st.opts, ck = e.target.dataset.ck;
    if (ck) { o[ck] = e.target.checked; renderDetail(); if (ck === 'belgian') updateDoor(); return; }
    if (e.target.id === 'oQty') { o.qty = Math.max(1, Math.round(+e.target.value || 1)); renderDetail(); }
  });
  detail.addEventListener('input', e => { if (e.target.id === 'oRoom') st.opts.room = e.target.value; });
  /* ---------- compare ---------- */
  function renderCompare() {
    const cells = st.compare.map((c, i) => `<div class="cmp"><img src="${c.img}" alt="הדמיית ${c.title}">
      <div class="meta"><b>${c.title}</b><small>${c.sub}</small><small style="font-family:var(--f-num);color:var(--ink)">${fmt(c.total)}</small></div>
      <div class="row"><button class="btn small" data-load="${i}">לבחור את זו</button><button class="btn small ghost" data-del="${i}">הסרה</button></div></div>`);
    while (cells.length < 3) cells.push(`<div class="cmp empty">${cells.length === 0 ? 'בחרו דלת ולחצו "שמור להשוואה". אפשר להציג ללקוח עד שלוש אפשרויות זו לצד זו.' : 'מקום פנוי להשוואה'}</div>`);
    $('#compareRow').innerHTML = cells.join('');
  }
  $('#snapBtn').addEventListener('click', () => {
    const m = st.model, v = m.variants[st.vi];
    const snap = { img: snapshot(700), title: `${m.kind === 'entry' ? 'דגם ' : ''}${m.name} · ${v.color}`, sub: m.series, total: calc().total,
      cfg: { kind: st.kind, id: m.id, vi: st.vi, opts: { ...st.opts }, quad: st.quad.map(q => q.slice()) } };
    st.compare = [snap, ...st.compare].slice(0, 3); renderCompare(); toast('נשמר להשוואה');
  });
  $('#compareRow').addEventListener('click', e => {
    const l = e.target.closest('[data-load]'), d = e.target.closest('[data-del]');
    if (d) { st.compare.splice(+d.dataset.del, 1); renderCompare(); }
    if (l) {
      const c = st.compare[+l.dataset.load].cfg;
      if (st.kind !== c.kind) setKind(c.kind);
      st.model = byId[c.id]; st.vi = c.vi; st.opts = { ...c.opts };
      if (c.quad && st.bg) st.quad = c.quad.map(q => q.slice());
      refreshPanel(); updateDoor();
    }
  });

  /* ---------- quote ---------- */
  function addToQuote() {
    const m = st.model, v = m.variants[st.vi], c = calc();
    quote.items.push({ id: m.id, kind: m.kind, title: `${m.kind === 'entry' ? 'דלת כניסה' : 'דלת פנים'} ${m.brand} · ${m.kind === 'entry' ? 'דגם ' : ''}${m.name}`,
      room: st.opts.room.trim(), desc: c.desc, lines: c.lines, unit: c.unit, qty: st.opts.qty, img: snapshot(640), vi: st.vi, opts: { ...st.opts } });
    quote.approved = null; saveQuote(); updateCount();
    st.opts.room = ''; st.opts.qty = 1; renderDetail();
    toast(`נוספה להצעה (${quote.items.length} פריטים)`);
  }
  function totals() {
    const sub = quote.items.reduce((s, i) => s + i.unit * i.qty, 0);
    const disc = sub * (quote.discount || 0) / 100, net = sub - disc, vat = net * settings.vat / 100;
    return { sub, disc, net, vat, grand: net + vat };
  }
  function updateCount() { const b = $('#qCount'); b.textContent = quote.items.length; b.hidden = !quote.items.length; }
  function renderQuote() {
    $('#pBiz').textContent = settings.name; $('#pBizLine').textContent = [settings.line, settings.phone].filter(Boolean).join(' · ');
    $('#pNum').innerHTML = `מס׳ ${quote.num}<br>${new Date(quote.created).toLocaleDateString('he-IL')}`;
    $('#cName').value = quote.customer.name; $('#cPhone').value = quote.customer.phone; $('#cAddr').value = quote.customer.addr;
    $('#itemsBody').innerHTML = quote.items.length ? quote.items.map((it, i) => `<tr>
      <td><div class="item-main">${it.img ? `<img src="${it.img}" alt="">` : ''}<div style="min-width:0">${it.room ? `<span class="room">${esc(it.room)}</span><br>` : ''}<b>${it.title}</b><p>${it.desc}</p>${it.lines ? `<details class="brk"><summary>פירוט מחיר</summary>${it.lines.map(([l, p]) => `<div><span>${l}</span><span>${fmt(p)}</span></div>`).join('')}</details>` : ''}
        <button class="rm" data-rm="${i}">הסרת פריט</button></div></div></td>
      <td class="n"><input class="qty" type="number" min="1" value="${it.qty}" data-qty="${i}" aria-label="כמות"></td>
      <td class="n">${fmt(it.unit)}</td><td class="n">${fmt(it.unit * it.qty)}</td></tr>`).join('')
      : `<tr><td colspan="4"><div class="empty-quote"><b>עדיין אין פריטים בהצעה</b>בחרו דלת בלשונית "הדמיה ובחירה" ולחצו "הוספה להצעת המחיר".</div></td></tr>`;
    renderTotals();
    const until = new Date(quote.created + settings.valid * 864e5).toLocaleDateString('he-IL');
    $('#terms').innerHTML = `<div>המחירים בשקלים. ההצעה בתוקף עד ${until}.</div><div>מקדמה של ${settings.deposit}% בחתימה, יתרה ביום ההתקנה.</div>
      <div>מידות סופיות ייקבעו במדידה בשטח. גוונים בהדמיה להמחשה בלבד.</div>`;
    $('#sigDate').textContent = new Date().toLocaleDateString('he-IL');
    const a = $('#approvedStamp'); a.hidden = !quote.approved; if (quote.approved) a.textContent = `אושר ונחתם ע״י הלקוח · ${new Date(quote.approved).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}`;
    $('#printBtn').hidden = window.self !== window.top; // בתוך מסגרת אין חלון הדפסה
    updateWa(); sizeSig();
  }
  function renderTotals() {
    const t = totals();
    $('#totals').innerHTML = `<div><span>סה״כ</span><b>${fmt(t.sub)}</b></div>
      <div><span>הנחה <input type="number" id="disc" min="0" max="50" value="${quote.discount}" aria-label="אחוז הנחה">%</span><b>${t.disc ? '−' + fmt(t.disc) : fmt(0)}</b></div>
      <div><span>מע״מ ${settings.vat}%</span><b>${fmt(t.vat)}</b></div>
      <div class="grand"><span>סה״כ לתשלום</span><b>${fmt(t.grand)}</b></div>`;
  }
  function quoteText() {
    const t = totals();
    const rows = quote.items.map((it, i) => `${i + 1}. ${it.room ? it.room + ' – ' : ''}${it.title}\n   ${it.desc}\n   ${it.qty} × ${fmt(it.unit)} = ${fmt(it.unit * it.qty)}`);
    return [`שלום${quote.customer.name ? ' ' + quote.customer.name : ''},`, `הצעת מחיר מס׳ ${quote.num} מ${settings.name}:`, '', ...rows, '',
      quote.discount ? `הנחה ${quote.discount}%: −${fmt(t.disc)}` : '', `סה״כ לפני מע״מ: ${fmt(t.net)}`, `מע״מ ${settings.vat}%: ${fmt(t.vat)}`, `סה״כ לתשלום: ${fmt(t.grand)}`, '',
      `ההצעה בתוקף ${settings.valid} יום.${quote.approved ? ' אושרה ונחתמה.' : ''}`, `${settings.name} · ${settings.phone}`].filter(l => l !== '').join('\n').replace(/\n(?=\d\.)/g, '\n\n');
  }
  function updateWa() {
    let ph = (quote.customer.phone || '').replace(/\D/g, '');
    if (ph.startsWith('0')) ph = '972' + ph.slice(1);
    $('#waBtn').href = `https://wa.me/${ph}?text=${encodeURIComponent(quoteText())}`;
  }
  $('#itemsBody').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; quote.items.splice(+b.dataset.rm, 1); quote.approved = null; saveQuote(); updateCount(); renderQuote(); });
  $('#itemsBody').addEventListener('change', e => { const q = e.target.closest('[data-qty]'); if (!q) return; quote.items[+q.dataset.qty].qty = Math.max(1, Math.round(+q.value || 1)); saveQuote(); renderQuote(); });
  $('#totals').addEventListener('change', e => { if (e.target.id !== 'disc') return; quote.discount = Math.max(0, Math.min(50, +e.target.value || 0)); saveQuote(); renderTotals(); updateWa(); });
  [['cName', 'name'], ['cPhone', 'phone'], ['cAddr', 'addr']].forEach(([id, k]) => $('#' + id).addEventListener('input', e => { quote.customer[k] = e.target.value; saveQuote(); updateWa(); }));
  $('#copyBtn').addEventListener('click', () => {
    const txt = quoteText();
    navigator.clipboard?.writeText(txt).then(() => toast('נוסח ההצעה הועתק'), () => fallbackCopy(txt)) ?? fallbackCopy(txt);
  });
  function fallbackCopy(txt) {
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ } ta.remove();
    toast(ok ? 'נוסח ההצעה הועתק' : 'ההעתקה נחסמה. אפשר לשלוח דרך כפתור הוואטסאפ.');
  }
  $('#printBtn').addEventListener('click', () => window.print());
  $('#approveBtn').addEventListener('click', () => {
    if (!quote.items.length) return toast('אין עדיין פריטים בהצעה');
    if (!sigDirty) return toast('הלקוח צריך לחתום בתיבת החתימה');
    quote.approved = Date.now(); saveQuote(); renderQuote(); toast('ההצעה אושרה');
  });
  $('#newQuoteBtn').addEventListener('click', () => { $('#newQuoteBtn').hidden = true; $('#newQuoteConfirm').hidden = false; setTimeout(() => { $('#newQuoteBtn').hidden = false; $('#newQuoteConfirm').hidden = true; }, 4000); });
  $('#newQuoteConfirm').addEventListener('click', () => { quote = newQuote(); saveQuote(); clearSig(); updateCount(); renderQuote(); $('#newQuoteBtn').hidden = false; $('#newQuoteConfirm').hidden = true; toast('נפתחה הצעה חדשה'); });

  // signature pad
  const sig = $('#sigCanvas'), sg = sig.getContext('2d');
  let sigDirty = false, sigDrawing = false;
  function sizeSig() {
    const r = sig.getBoundingClientRect(); if (!r.width) return;
    const dpr = window.devicePixelRatio || 1, w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (sig.width === w && sig.height === h) return;
    sig.width = w; sig.height = h; sigDirty = false;
  }
  function clearSig() { sg.clearRect(0, 0, sig.width, sig.height); sigDirty = false; }
  const sp = e => { const r = sig.getBoundingClientRect(); return [(e.clientX - r.left) * sig.width / r.width, (e.clientY - r.top) * sig.height / r.height]; };
  sig.addEventListener('pointerdown', e => { sigDrawing = true; sig.setPointerCapture(e.pointerId); const [x, y] = sp(e); sg.beginPath(); sg.moveTo(x, y); });
  sig.addEventListener('pointermove', e => {
    if (!sigDrawing) return; const [x, y] = sp(e);
    sg.lineWidth = 2.4 * (window.devicePixelRatio || 1); sg.lineCap = 'round'; sg.lineJoin = 'round'; sg.strokeStyle = '#1C2324';
    sg.lineTo(x, y); sg.stroke(); sigDirty = true;
  });
  ['pointerup', 'pointercancel'].forEach(t => sig.addEventListener(t, () => { sigDrawing = false; }));
  $('#sigClear').addEventListener('click', () => { clearSig(); if (quote.approved) { quote.approved = null; saveQuote(); renderQuote(); } });

  /* ---------- settings ---------- */
  const S_FIELDS = [['sName', 'name'], ['sPhone', 'phone'], ['sLine', 'line'], ['sVat', 'vat', 1], ['sValid', 'valid', 1], ['sInstI', 'instI', 1], ['sInstE', 'instE', 1], ['sRemI', 'remI', 1], ['sRemE', 'remE', 1], ['sDeposit', 'deposit', 1]];
  function renderSettings() {
    S_FIELDS.forEach(([id, k]) => { $('#' + id).value = settings[k]; });
    const group = (title, arr) => `<tr class="grp"><td colspan="5">${title}</td></tr>` + arr.map(m => `<tr><td><img src="${m.variants[0].src}" alt="" loading="lazy"></td>
      <td>${m.kind === 'entry' ? 'דגם ' : ''}${m.name}</td><td>${m.series}</td><td>${m.variants.length}</td>
      <td><input type="number" min="0" step="50" data-price="${m.id}" value="${priceOf(m)}" aria-label="מחיר ${m.name}"></td></tr>`).join('');
    $('#ptBody').innerHTML = group('דלתות פנים · טלדור', CAT.interior) + group('דלתות כניסה · אלידור', CAT.entry);
    $('#optBody').innerHTML = Object.entries(GROUP_TITLES).map(([g, title]) => `<tr class="grp"><td colspan="3">${title}</td></tr>` +
      G[g].map(it => `<tr><td>${it.img ? `<img src="${it.img}" alt="" loading="lazy">` : (it.sw ? `<i class="dot" style="background:${it.sw}"></i>` : '')}</td><td>${it.l}</td>
        <td><input type="number" min="0" step="10" data-opt="${g}:${it.v}" value="${P(g, it)}" aria-label="מחיר ${esc(it.l)}"></td></tr>`).join('')).join('');
  }
  S_FIELDS.forEach(([id, k, num]) => $('#' + id).addEventListener('input', e => {
    settings[k] = num ? (+e.target.value || 0) : e.target.value; saveSettings(); applyBrand();
  }));
  $('#ptBody').addEventListener('input', e => { const i = e.target.closest('[data-price]'); if (!i) return; settings.prices[i.dataset.price] = +i.value || 0; saveSettings(); });
  $('#optBody').addEventListener('input', e => { const i = e.target.closest('[data-opt]'); if (!i) return; settings.opt[i.dataset.opt] = +i.value || 0; saveSettings(); });
  $('#resetPrices').addEventListener('click', () => { $('#resetPrices').hidden = true; $('#resetConfirm').hidden = false; setTimeout(() => { $('#resetPrices').hidden = false; $('#resetConfirm').hidden = true; }, 4000); });
  $('#resetConfirm').addEventListener('click', () => { settings = { ...DEFAULT_SETTINGS, prices: {}, opt: {} }; saveSettings(); renderSettings(); applyBrand(); $('#resetPrices').hidden = false; $('#resetConfirm').hidden = true; toast('המחירים חזרו לערכי הדוגמה'); });
  function applyBrand() { $('#bizName').textContent = settings.name || 'דלתות במקום'; }

  /* ---------- views & toast ---------- */
  function show(view) {
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === view));
    ['studio', 'quote', 'settings'].forEach(v => { $('#view-' + v).hidden = v !== view; });
    if (view === 'quote') renderQuote();
    if (view === 'settings') renderSettings();
    if (view === 'studio') { refreshPanel(); render(); }
    updateMini();
    try { history.replaceState(null, '', '#' + view); } catch { /* ignore */ }
  }
  $$('.tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));
  let tt = 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 2600); }

  /* ---------- boot ---------- */
  applyBrand(); updateCount(); renderCompare(); useSample(); refreshPanel(); updateDoor();
  const start = (location.hash || '').slice(1);
  if (['quote', 'settings'].includes(start)) show(start);
})();
