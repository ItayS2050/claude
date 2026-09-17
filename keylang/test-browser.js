#!/usr/bin/env node
/**
 * Kiko in a real browser.  Run:  node test-browser.js
 *
 * Every other test here runs the engine against a DOM I wrote, and a DOM I
 * wrote agrees with me. Three bugs reached the user straight through that gap,
 * and not one of them was in the detection logic:
 *
 *   - a toast that froze several keystrokes behind the field, reported twice
 *     with screenshots before I found it, because showToast recorded a
 *     detection it had not drawn
 *   - "s, i, n," offered as Hebrew on a page of English prose
 *   - me telling the user a version was unshipped when it was live
 *
 * A stub cannot see any of that. This loads the actual extension into actual
 * Chromium, types actual keystrokes into an actual input, and reads the toast
 * out of the page. Slower than the others and worth it: it is the only test
 * here that can fail for a reason I did not think of in advance.
 *
 * Skips itself, loudly, if no Chromium is available, so it never blocks a
 * machine that has none.
 */
'use strict';
const path = require('path');
const B = require('./browser.js');

const EXT = __dirname;
let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok    ${label}`); return; }
  fail++;
  console.log(`  FAIL  ${label}${extra ? '\n        ' + extra : ''}`);
};

// ── Typing, one key at a time, the way a person does ──────────
// Input.insertText would be faster and would not exercise the keyup listener
// or the debounce, which is where the timing bugs live.
const CODES = {
  ' ': { code: 'Space', key: ' ' }, ',': { code: 'Comma', key: ',' },
  ';': { code: 'Semicolon', key: ';' }, "'": { code: 'Quote', key: "'" },
  '.': { code: 'Period', key: '.' }, '/': { code: 'Slash', key: '/' },
};
async function type(s, text, perKey = 45) {
  for (const ch of text) {
    const k = CODES[ch] || { code: 'Key' + ch.toUpperCase(), key: ch };
    await s.send('Input.dispatchKeyEvent',
      { type: 'keyDown', text: ch, unmodifiedText: ch, key: k.key, code: k.code });
    await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code });
    await B.sleep(perKey);
  }
}

// Everything the toast says, which is enough to assert against and does not
// couple the test to the markup.
const OFFER = `(() => {
  const t = document.getElementById('kld-toast');
  if (!t) return null;
  return t.innerText;
})()`;

async function freshPage(s, port, page = '/') {
  await s.send('Page.navigate', { url: `http://127.0.0.1:${port}${page}` });
  await B.sleep(1200);
  await s.eval('document.getElementById("f").focus()');
}

const noToast = `!document.getElementById('kld-toast')`;

(async () => {
  if (!B.CHROME) {
    console.log('\nKiko in a real browser\n  SKIPPED — no Chromium found. Set $CHROME to run this.\n');
    process.exit(0);
  }

  const pages = {
    '/': '<!doctype html><meta charset=utf-8><title>field</title>'
       + '<input id=f style="width:600px;font-size:16px">',
    // A page with English prose around the field, which is where "s, i, n,"
    // was offered as Hebrew.
    '/prose': '<!doctype html><meta charset=utf-8><title>prose</title>'
       + '<p>Any save to Strategy or Proof re-evaluates the shared gate hook.</p>'
       + '<input id=f style="width:600px;font-size:16px">',
    // The shape a chat composer really has. The second one throws away its own
    // text node and builds a new one on every keystroke, which is what a
    // framework-managed editor does and what a plain field never does — the
    // suspect, when a toast was reported showing the field as it stood several
    // keystrokes earlier.
    '/editor': '<!doctype html><meta charset=utf-8><title>editor</title>'
       + '<div id=f contenteditable style="width:600px;min-height:40px"></div>',
    '/rebuilding': '<!doctype html><meta charset=utf-8><title>rebuilding</title>'
       + '<div id=f contenteditable style="width:600px;min-height:40px"></div>'
       + '<script>const f=document.getElementById("f");'
       + 'f.addEventListener("input",()=>{const t=f.innerText,sel=document.getSelection();'
       + 'f.textContent="";f.appendChild(document.createTextNode(t));'
       + 'const r=document.createRange();r.selectNodeContents(f);r.collapse(false);'
       + 'sel.removeAllRanges();sel.addRange(r);});<\/script>',
  };
  const { server, port } = await B.serve(pages);
  const browser = await B.launch({ extension: EXT });
  let s;
  try {
    const targets = await B.fetchJson(`http://127.0.0.1:${browser.port}/json/list`);
    const target = targets.find(t => t.type === 'page');
    s = await B.connect(target.webSocketDebuggerUrl);
    await s.send('Page.enable');
    await s.send('Runtime.enable');

    console.log('\nKiko in a real browser');
    console.log(`  ${path.basename(path.dirname(path.dirname(B.CHROME)))} · extension loaded unpacked\n`);

    // ── It speaks at all ──────────────────────────────────────
    await freshPage(s, port);
    await type(s, 'akuo nvhs ekhu');
    let offer = await B.until(s, OFFER, { timeout: 7000 });
    ok('a wrong-layout sentence raises a toast', !!offer);
    ok('and offers the whole sentence', !!offer && offer.includes('שלום מהיד קליו'),
       offer && offer.replace(/\n/g, ' | '));

    // ── The bug that got here twice ───────────────────────────
    // Type half, let the toast appear, then keep going. The toast has to
    // follow. Both screenshots showed one that did not — one of them cutting
    // mid-token, which no version of the engine produces from the full text.
    // A toast is only raised once a word is finished — the word under the
    // cursor gets no vote, which is 4.9.15 — so the offer is checked after
    // each completed word, and each one has to be the whole line so far.
    // Polled, never slept on. The toast takes up to a second to catch up —
    // a 350ms quiet debounce plus the work — and a fixed sleep samples the
    // previous state and calls it a frozen toast. Waiting *for* the expected
    // text is both honest and deterministic; the timeout is the failure.
    const offers = (want) => B.until(s,
      `(() => { const t = document.getElementById('kld-toast');
                return t && t.innerText.includes(${JSON.stringify(want)}) ? t.innerText : null; })()`,
      { timeout: 6000 });

    await freshPage(s, port);
    await type(s, 'ngsh; t, zv ');
    ok('a toast appears once the first words are finished', !!await offers('מעדיף את זה'));
    await type(s, 'go nxl ');
    ok('it grows with the sentence rather than freezing',
       !!await offers('מעדיף את זה עם מסך'),
       'stuck at: ' + String(await s.eval(OFFER)).replace(/\n/g, ' | '));
    await type(s, 'eyi ');
    ok('and reaches the end of it',
       !!await offers('מעדיף את זה עם מסך קטן'),
       'stuck at: ' + String(await s.eval(OFFER)).replace(/\n/g, ' | '));
    ok('the field itself is untouched until the fix is accepted',
       (await s.eval('document.getElementById("f").value')).startsWith('ngsh; t, zv go nxl eyi'));

    await freshPage(s, port);
    await type(s, 'why cant they get to');
    await B.sleep(900);
    ok('ordinary English raises nothing at all',
       await s.eval(noToast),
       String(await s.eval(OFFER)).replace(/\n/g, ' | '));

    // ── The false positive from a real page ───────────────────
    await freshPage(s, port, '/prose');
    await type(s, 's, i, n,');
    await B.sleep(1200);
    ok('a list of initials is not a Hebrew sentence',
       await s.eval(noToast),
       String(await s.eval(OFFER)).replace(/\n/g, ' | '));

    // ── Accepting actually rewrites the field ─────────────────
    await freshPage(s, port);
    await type(s, 'akuo nvhs ekhu');
    await B.until(s, OFFER, { timeout: 7000 });
    await s.eval(`document.querySelector('#kld-toast .kld-primary').click()`);
    await B.sleep(600);
    ok('clicking Fix replaces the text in the field',
       (await s.eval('document.getElementById("f").value')).includes('שלום מהיד קליו'),
       'field is now: ' + await s.eval('document.getElementById("f").value'));
    // Not gone — replaced by a confirmation, which is the right thing. The
    // part that matters is that it offers a way back.
    const after = await s.eval(OFFER);
    ok('and says so, with a way back', !!after && /Undo/i.test(after),
       String(after).replace(/\n/g, ' | '));
    await s.eval(`[...document.querySelectorAll('#kld-toast button')]
                    .find(b => /undo/i.test(b.textContent)).click()`);
    await B.sleep(600);
    ok('Undo puts the original text back',
       (await s.eval('document.getElementById("f").value')) === 'akuo nvhs ekhu',
       'field is now: ' + await s.eval('document.getElementById("f").value'));

    // ── Without touching the mouse ────────────────────────────
    await freshPage(s, port);
    await type(s, 'akuo nvhs ekhu');
    await B.until(s, OFFER, { timeout: 7000 });
    for (const type_ of ['keyDown', 'keyUp']) {
      await s.send('Input.dispatchKeyEvent', {
        type: type_, key: 'Enter', code: 'Enter',
        modifiers: 1 /* Alt */ + 8 /* Shift */,
      });
    }
    await B.sleep(600);
    ok('Alt+Shift+Enter accepts the fix',
       (await s.eval('document.getElementById("f").value')).includes('שלום מהיד קליו'),
       'field is now: ' + await s.eval('document.getElementById("f").value'));

    // ── The same, in the shape a chat composer really has ─────
    // Both screenshots of a frozen toast came from a rich editor, not a plain
    // input. Neither of these reproduces it, which is worth recording: it is
    // where I would have looked next, and it is not there either.
    for (const [page, what] of [['/editor', 'a contenteditable'],
                                ['/rebuilding', 'an editor that rebuilds its DOM every keystroke']]) {
      await freshPage(s, port, page);
      await type(s, 'ngsh; t, zv ');
      const first = await B.until(s,
        `(() => { const t = document.getElementById('kld-toast');
                  return t && t.innerText.includes('מעדיף את זה') ? t.innerText : null; })()`,
        { timeout: 6000 });
      ok(`a toast appears in ${what}`, !!first);
      await type(s, 'go nxl eyi ');
      const full = await B.until(s,
        `(() => { const t = document.getElementById('kld-toast');
                  return t && t.innerText.includes('מעדיף את זה עם מסך קטן') ? t.innerText : null; })()`,
        { timeout: 6000 });
      ok(`and follows the field in ${what}`, !!full,
         'stuck at: ' + String(await s.eval(OFFER)).replace(/\n/g, ' | '));
    }

    // ── The service worker is alive ───────────────────────────
    const all = await B.fetchJson(`http://127.0.0.1:${browser.port}/json/list`);
    ok('the background service worker is running',
       all.some(t => t.type === 'service_worker' && t.url.endsWith('background.js')),
       all.map(t => t.type).join(', '));

  } finally {
    if (s) s.close();
    B.stop(browser);
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('\n  the harness itself failed:', e.message, '\n');
  process.exit(1);
});
