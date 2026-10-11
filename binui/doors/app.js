/* דלתות במקום — אב-טיפוס: הדמיית דלת על תמונת הפתח של הלקוח והפקת הצעת מחיר במקום. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const CAT = window.CATALOG;
  const ALL = [...CAT.interior, ...CAT.entry];
  const byId = Object.fromEntries(ALL.map(m => [m.id, m]));
  const fmt = n => '₪' + Math.round(n).toLocaleString('he-IL');

  /* ---------- storage (best effort) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('dlatot:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('dlatot:' + k, JSON.stringify(v)); return true; } catch { return false; } },
  };

  /* ---------- options & settings ---------- */
  const OPTIONS = {
    interior: {
      width: [['60', '60 ס״מ', 0], ['70', '70 ס״מ', 0], ['80', '80 ס״מ', 0], ['90', '90 ס״מ', 150]],
      handle: [['std', 'ידית ניקל סטנדרטית', 0], ['black', 'ידית שחור מט', 120], ['gold', 'ידית זהב מוברש', 180], ['rosette', 'ידית רוזטה מגנטית', 260]],
      lock: [['std', 'מנעול רגיל', 0], ['wc', 'מנעול תפוס/פנוי (שירותים)', 90], ['magnet', 'מנעול מגנטי שקט', 160]],
      defaults: { width: '80', handle: 'std', lock: 'std' },
    },
    entry: {
      width: [['90', '90 ס״מ (סטנדרט)', 0], ['100', '100 ס״מ', 600]],
      handle: [['lever', 'ידית מנוף', 0], ['bar60', 'ידית מוט 60 ס״מ', 350], ['bar120', 'ידית מוט 120 ס״מ', 650]],
      lock: [['std', 'צילינדר רב-בריח', 0], ['secure', 'צילינדר מוגן העתקה', 380], ['smart', 'מנעול חכם (קוד וטביעת אצבע)', 1450]],
      defaults: { width: '90', handle: 'lever', lock: 'std' },
    },
  };
  const DEFAULT_SETTINGS = { name: 'דלתות במקום', phone: '03-0000000', line: 'אולם תצוגה · רחוב התעשייה 1', vat: 18, valid: 30,
    instI: 350, instE: 650, remI: 150, remE: 350, deposit: 30, prices: {} };
  let settings = { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };
  const priceOf = m => settings.prices[m.id] ?? m.price;
  const saveSettings = () => store.set('settings', settings);

  /* ---------- state ---------- */
  const st = {
    kind: 'interior', series: 'all', q: '',
    model: CAT.interior.find(m => m.name === 'יובל') || CAT.interior[0], vi: 0,
    opts: { ...OPTIONS.interior.defaults, side: 'right', install: true, remove: false, qty: 1, room: '' },
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
    const p = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    imgCache.set(src, p); return p;
  }

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
    warp(g, doorImg, q, mirror);
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
    raf = requestAnimationFrame(() => { compose(ctx, canvas.width, canvas.height); placeHandles(); });
  }
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

  /* ---------- catalog panel ---------- */
  const list = () => CAT[st.kind];
  function renderChips() {
    const series = [...new Set(list().map(m => m.series))];
    const chips = [['all', 'הכל'], ...series.map(s => [s, s.replace('סדרת ', '')])];
    $('#chips').innerHTML = series.length > 1 ? chips.map(([v, l]) => `<button class="chip" data-s="${v}" aria-pressed="${st.series === v}">${l}</button>`).join('') : '';
  }
  function renderGrid() {
    const q = st.q.trim();
    const items = list().filter(m => (st.series === 'all' || m.series === st.series) && (!q || m.name.includes(q) || m.series.includes(q)));
    $('#grid').innerHTML = items.length ? items.map(m => `<button class="tile" data-id="${m.id}" aria-pressed="${m === st.model}">
        <img src="${m.variants[0].src}" alt="" loading="lazy"><span>${st.kind === 'entry' ? 'דגם ' : ''}${m.name}</span><small>${fmt(priceOf(m))}</small></button>`).join('')
      : `<p style="grid-column:1/-1;color:var(--muted);margin:8px">לא נמצאו דגמים בשם "${q.replace(/[<>&"]/g, '')}".</p>`;
  }
  function optSelect(id, label, arr, val) {
    return `<label class="field"><span>${label}</span><select id="${id}">${arr.map(([v, l, p]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}${p ? ` (+${fmt(p)})` : ''}</option>`).join('')}</select></label>`;
  }
  function calc(model = st.model, vi = st.vi, o = st.opts, kind = model.kind) {
    const O = OPTIONS[kind], v = model.variants[vi];
    const pick = (arr, val) => arr.find(a => a[0] === val) || arr[0];
    const w = pick(O.width, o.width), h = pick(O.handle, o.handle), l = pick(O.lock, o.lock);
    const lines = [[`דלת ${model.brand} ${kind === 'entry' ? 'דגם ' : ''}${model.name}, כולל משקוף`, priceOf(model)]];
    if (v.extra) lines.push([`גוון ${v.color}`, v.extra]);
    if (w[2]) lines.push([`רוחב ${w[1]}`, w[2]]);
    if (h[2]) lines.push([h[1], h[2]]);
    if (l[2]) lines.push([l[1], l[2]]);
    if (o.install) lines.push(['התקנה', kind === 'entry' ? settings.instE : settings.instI]);
    if (o.remove) lines.push(['פירוק ופינוי דלת קיימת', kind === 'entry' ? settings.remE : settings.remI]);
    const unit = lines.reduce((s, x) => s + (+x[1] || 0), 0);
    const desc = [`גוון ${v.color}`, `רוחב ${w[1].replace(' (סטנדרט)', '')}`, `פתיחה ל${o.side === 'left' ? 'שמאל' : 'ימין'}`, h[1], l[1],
      o.install ? 'כולל התקנה' : 'ללא התקנה', o.remove ? 'כולל פירוק דלת קיימת' : ''].filter(Boolean).join(' · ');
    return { lines, unit, total: unit * (o.qty || 1), desc };
  }
  function renderDetail() {
    const m = st.model, v = m.variants[st.vi], o = st.opts, O = OPTIONS[m.kind];
    const c = calc();
    $('#detail').innerHTML = `
      <div><h2>${m.kind === 'entry' ? 'דגם ' : ''}${m.name}</h2><div class="sub">${m.brand} · ${m.series} · ${m.desc}</div></div>
      <div class="field"><span>גוון${m.variants.length > 1 ? ` (${m.variants.length} אפשרויות)` : ''}</span><div class="swatches">${m.variants.map((x, i) =>
        `<button class="sw" data-vi="${i}" aria-pressed="${i === st.vi}"><i style="background:${x.swatch}"></i>${x.color}${x.extra ? ` +${fmt(x.extra)}` : ''}</button>`).join('')}</div></div>
      <div class="opts">
        ${optSelect('oWidth', 'רוחב', O.width, o.width)}
        <div class="field"><span>כיוון פתיחה</span><div class="side-toggle">
          <button class="btn small" data-side="right" aria-pressed="${o.side === 'right'}">ימין</button>
          <button class="btn small" data-side="left" aria-pressed="${o.side === 'left'}">שמאל</button></div></div>
        ${optSelect('oHandle', 'ידית', O.handle, o.handle)}
        ${optSelect('oLock', 'מנעול', O.lock, o.lock)}
        <label class="field"><span>חדר / מיקום</span><input type="text" id="oRoom" value="${(o.room || '').replace(/"/g, '&quot;')}" placeholder="${m.kind === 'entry' ? 'כניסה ראשית' : 'חדר שינה הורים'}"></label>
        <label class="field"><span>כמות</span><input type="number" id="oQty" min="1" value="${o.qty}"></label>
      </div>
      <div class="checks">
        <label><input type="checkbox" id="oInstall" ${o.install ? 'checked' : ''}> התקנה (${fmt(m.kind === 'entry' ? settings.instE : settings.instI)})</label>
        <label><input type="checkbox" id="oRemove" ${o.remove ? 'checked' : ''}> פירוק דלת קיימת (${fmt(m.kind === 'entry' ? settings.remE : settings.remI)})</label>
      </div>
      <div class="price">
        ${c.lines.map(([l, p]) => `<div class="ln"><span>${l}</span><b>${fmt(p)}</b></div>`).join('')}
        ${o.qty > 1 ? `<div class="ln"><span>× ${o.qty} יחידות</span><b></b></div>` : ''}
        <div class="total"><span>סה״כ לפני מע״מ</span><b>${fmt(c.total)}</b></div>
        <div class="note">מחירי דוגמה. אפשר לעדכן אותם בלשונית "מחירון".</div>
      </div>
      <div class="actions"><button class="btn primary" id="addBtn">הוספה להצעת המחיר</button></div>`;
  }
  async function selectDoor() {
    const src = st.model.variants[st.vi].src;
    try { doorImg = await loadImg(src); } catch { doorImg = null; toast('תמונת הדלת לא נטענה'); }
    if (st.model.variants[st.vi].src === src) render();
  }
  function refreshPanel() { renderChips(); renderGrid(); renderDetail(); }

  function setKind(kind) {
    if (st.kind === kind) return;
    st.kind = kind; st.series = 'all'; st.q = ''; $('#search').value = '';
    $$('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.kind === kind));
    st.model = kind === 'entry' ? (CAT.entry.find(m => m.name === '7014') || CAT.entry[0]) : (CAT.interior.find(m => m.name === 'יובל') || CAT.interior[0]);
    st.vi = 0;
    const keep = { side: st.opts.side, install: st.opts.install, remove: st.opts.remove, qty: 1, room: '' };
    st.opts = { ...OPTIONS[kind].defaults, ...keep };
    if (st.bgIsSample) useSample();
    refreshPanel(); selectDoor();
  }
  $$('.seg button').forEach(b => b.addEventListener('click', () => setKind(b.dataset.kind)));
  $('#search').addEventListener('input', e => { st.q = e.target.value; renderGrid(); });
  $('#chips').addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; st.series = c.dataset.s; renderChips(); renderGrid(); });
  $('#grid').addEventListener('click', e => {
    const t = e.target.closest('.tile'); if (!t) return;
    st.model = byId[t.dataset.id]; st.vi = 0;
    $$('.tile', $('#grid')).forEach(x => x.setAttribute('aria-pressed', x === t));
    renderDetail(); selectDoor();
  });
  const detail = $('#detail');
  detail.addEventListener('click', e => {
    const sw = e.target.closest('.sw');
    if (sw) { st.vi = +sw.dataset.vi; renderDetail(); selectDoor(); return; }
    const sd = e.target.closest('[data-side]');
    if (sd) { st.opts.side = sd.dataset.side; renderDetail(); render(); return; }
    if (e.target.closest('#addBtn')) addToQuote();
  });
  detail.addEventListener('change', e => {
    const id = e.target.id, o = st.opts;
    if (id === 'oWidth') o.width = e.target.value;
    else if (id === 'oHandle') o.handle = e.target.value;
    else if (id === 'oLock') o.lock = e.target.value;
    else if (id === 'oInstall') o.install = e.target.checked;
    else if (id === 'oRemove') o.remove = e.target.checked;
    else if (id === 'oQty') o.qty = Math.max(1, Math.round(+e.target.value || 1));
    else return;
    renderDetail();
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
      cfg: { kind: st.kind, id: m.id, vi: st.vi, opts: { ...st.opts } } };
    st.compare = [snap, ...st.compare].slice(0, 3); renderCompare(); toast('נשמר להשוואה');
  });
  $('#compareRow').addEventListener('click', e => {
    const l = e.target.closest('[data-load]'), d = e.target.closest('[data-del]');
    if (d) { st.compare.splice(+d.dataset.del, 1); renderCompare(); }
    if (l) {
      const c = st.compare[+l.dataset.load].cfg;
      if (st.kind !== c.kind) setKind(c.kind);
      st.model = byId[c.id]; st.vi = c.vi; st.opts = { ...c.opts };
      refreshPanel(); selectDoor();
    }
  });

  /* ---------- quote ---------- */
  function addToQuote() {
    const m = st.model, v = m.variants[st.vi], c = calc();
    quote.items.push({ id: m.id, kind: m.kind, title: `${m.kind === 'entry' ? 'דלת כניסה' : 'דלת פנים'} ${m.brand} · ${m.kind === 'entry' ? 'דגם ' : ''}${m.name}`,
      room: st.opts.room.trim(), desc: c.desc, unit: c.unit, qty: st.opts.qty, img: snapshot(640), vi: st.vi, opts: { ...st.opts } });
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
      <td><div class="item-main">${it.img ? `<img src="${it.img}" alt="">` : ''}<div style="min-width:0">${it.room ? `<span class="room">${esc(it.room)}</span><br>` : ''}<b>${it.title}</b><p>${it.desc}</p>
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
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
  }
  S_FIELDS.forEach(([id, k, num]) => $('#' + id).addEventListener('input', e => {
    settings[k] = num ? (+e.target.value || 0) : e.target.value; saveSettings(); applyBrand();
  }));
  $('#ptBody').addEventListener('input', e => { const i = e.target.closest('[data-price]'); if (!i) return; settings.prices[i.dataset.price] = +i.value || 0; saveSettings(); });
  $('#resetPrices').addEventListener('click', () => { $('#resetPrices').hidden = true; $('#resetConfirm').hidden = false; setTimeout(() => { $('#resetPrices').hidden = false; $('#resetConfirm').hidden = true; }, 4000); });
  $('#resetConfirm').addEventListener('click', () => { settings = { ...DEFAULT_SETTINGS, prices: {} }; saveSettings(); renderSettings(); applyBrand(); $('#resetPrices').hidden = false; $('#resetConfirm').hidden = true; toast('המחירים חזרו לערכי הדוגמה'); });
  function applyBrand() { $('#bizName').textContent = settings.name || 'דלתות במקום'; }

  /* ---------- views & toast ---------- */
  function show(view) {
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === view));
    ['studio', 'quote', 'settings'].forEach(v => { $('#view-' + v).hidden = v !== view; });
    if (view === 'quote') renderQuote();
    if (view === 'settings') renderSettings();
    if (view === 'studio') { refreshPanel(); render(); }
    try { history.replaceState(null, '', '#' + view); } catch { /* ignore */ }
  }
  $$('.tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));
  let tt = 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 2600); }

  /* ---------- boot ---------- */
  applyBrand(); updateCount(); renderCompare(); useSample(); refreshPanel(); selectDoor();
  const start = (location.hash || '').slice(1);
  if (['quote', 'settings'].includes(start)) show(start);
})();
