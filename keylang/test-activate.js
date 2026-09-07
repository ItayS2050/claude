#!/usr/bin/env node
/**
 * One-click activation, end to end.  Run:  node test-activate.js
 *
 * Two real files have to agree with each other for a customer to get what
 * they paid for: the block in content.js that reads the key off our own page,
 * and the script inside docs/activate.html that shows them what happened.
 * Neither is testable alone — the whole thing is a conversation over
 * postMessage — so this stands up a small DOM, drops both scripts into it, and
 * lets them talk.
 *
 * The failures this exists to catch are the expensive ones. A customer who has
 * paid and cannot activate is charged, still broken, and rightly furious, and
 * every branch below is a way that happens: the wrong host, a key left in the
 * address bar, a spinner with nothing behind it, a provider that says no.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; return; }
  fail++;
  console.log(`  FAIL  ${label}${extra ? '\n        ' + extra : ''}`);
};

// ── The two pieces of real source under test ──────────────────
const CONTENT = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
const PAGE    = fs.readFileSync(path.join(__dirname, '..', 'docs', 'activate.html'), 'utf8');

const contentBlock = CONTENT.slice(
  CONTENT.indexOf('const ACTIVATION_HOSTS'),
  CONTENT.indexOf('autoActivateFromPage();') + 'autoActivateFromPage();'.length);
if (!contentBlock.includes('function autoActivateFromPage')) {
  console.log('  FAIL  could not find the activation block in content.js');
  process.exit(1);
}

const pageScript = (() => {
  const m = PAGE.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  if (!m) { console.log('  FAIL  could not find the page script'); process.exit(1); }
  return m[1];
})();

// ── A DOM small enough to read, real enough to lie in ─────────
function makeWorld({ url = 'https://get-kiko.com/activate.html?key=ABCD-1234-EFGH-5678',
                     top = true, sendMessage = null } = {}) {
  const u = new URL(url);
  const listeners = [];
  const timers = [];

  // Every id the page touches, discovered from the HTML rather than listed
  // here, so an element renamed in one place and not the other is a failure
  // rather than a silently dead branch.
  const els = {};
  for (const id of [...PAGE.matchAll(/id="([\w-]+)"/g)].map(m => m[1])) {
    els[id] = {
      id, hidden: PAGE.includes(`id="${id}" hidden`), textContent: '', value: '',
      _clicks: [],
      addEventListener(_t, fn) { this._clicks.push(fn); },
      select() {},
    };
  }

  const win = {
    location: { protocol: u.protocol, hostname: u.hostname, search: u.search, pathname: u.pathname,
                get origin() { return u.origin; } },
    addEventListener(type, fn) { if (type === 'message') listeners.push(fn); },
    postMessage(data, origin) {
      // Same-window messaging: everyone listening hears it, including the
      // sender, which is exactly how the two real scripts find each other.
      // `source` has to be the global as seen from *inside* the context, not
      // the sandbox object out here — both scripts check `e.source !== window`
      // and vm hands the code a contextified global that is not `win`.
      for (const fn of [...listeners]) fn({ source: win.window, origin, data });
    },
    history: { _url: url, replaceState(_s, _t, p) { this._url = p; win.location.search = ''; } },
    document: {
      getElementById: id => els[id] || null,
      querySelectorAll: () => [],
    },
    navigator: { clipboard: { writeText: async () => {} } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    URLSearchParams,
    console,
  };
  win.chrome = { runtime: { sendMessage: sendMessage || (() => {}), lastError: null } };

  const ctx = vm.createContext(win);
  const inside = vm.runInContext('this', ctx);
  win.window = inside;
  win.top = top ? inside : {};
  win.self = inside;
  const runPage    = () => vm.runInContext(pageScript, ctx);
  const runContent = () => vm.runInContext(contentBlock, ctx);
  const fire = (maxMs = Infinity) => {
    const due = timers.filter(t => t.ms <= maxMs);
    timers.length = 0;
    due.forEach(t => t.fn());
  };
  return { win, els, runPage, runContent, fire, timers };
}

const visible = els => ['s-working', 's-ok', 's-failed'].filter(id => !els[id].hidden);

console.log('\nOne-click activation');

// ── The happy path, which is the whole point ──────────────────
{
  let sentKey = null, calls = 0;
  const w = makeWorld({
    sendMessage: (msg, cb) => { calls++; sentKey = msg.key; cb({ ok: true }); },
  });
  w.runPage();
  ok('the page spins while it waits', visible(w.els).join() === 's-working');
  w.runContent();

  ok('the key reaches the background exactly as it arrived', sentKey === 'ABCD-1234-EFGH-5678',
     `sent ${sentKey}`);
  // Once. The extension announces itself proactively *and* answers the page's
  // hello, so "here" can legitimately arrive twice — and each activation call
  // spends one of the three browser slots the licence allows.
  ok('the key is activated exactly once', calls === 1, `${calls} activation calls`);
  ok('the page says it is done', visible(w.els).join() === 's-ok', visible(w.els).join());
  ok('the instructions are put away', w.els.manual.hidden);
  ok('the key is not left on screen', w.els.keywrap.hidden);
  ok('the key is out of the address bar', !w.win.location.search.includes('key'),
     w.win.location.search);

  // Chrome re-injects content scripts — on an extension update, and on some
  // in-page navigations — so "here" can arrive a second time long after the
  // first. Handing the key over again would spend a second of the three
  // browser slots the licence allows, for nothing.
  w.win.postMessage({ source: 'kiko-extension', type: 'here' }, w.win.location.origin);
  ok('a second announcement does not spend another slot', calls === 1,
     `${calls} activation calls`);
  ok('and out of the history entry', !w.win.history._url.includes('key'), w.win.history._url);
}

// ── The provider says no ──────────────────────────────────────
{
  const w = makeWorld({
    sendMessage: (_m, cb) => cb({ ok: false, error: 'This key is already in use on the maximum number of browsers.' }),
  });
  w.runPage();
  w.runContent();
  ok('a refusal is shown, not swallowed', visible(w.els).join() === 's-failed', visible(w.els).join());
  ok('and it says what the provider said',
     w.els['s-failed-why'].textContent.includes('maximum number of browsers'),
     w.els['s-failed-why'].textContent);
  ok('the manual route comes back', !w.els.manual.hidden);
  ok('with the key already filled in', w.els.keyfield.value === 'ABCD-1234-EFGH-5678');
  ok('and shown', !w.els.keywrap.hidden);
}

// ── Kiko is not installed in this browser ─────────────────────
// The customer paid on their phone, or in Firefox, or has not installed yet.
// They must not be left watching a spinner that cannot finish.
{
  const w = makeWorld();          // content script never runs
  w.runPage();
  ok('it spins at first', visible(w.els).join() === 's-working');
  w.fire(1500);
  ok('then falls back within a couple of seconds', visible(w.els).length === 0,
     visible(w.els).join());
  ok('the instructions are back', !w.els.manual.hidden);
  ok('and the key is on screen to copy', !w.els.keywrap.hidden &&
     w.els.keyfield.value === 'ABCD-1234-EFGH-5678');
  ok('nobody is sent to their inbox to find it',
     w.els.lede.textContent.includes('below'), w.els.lede.textContent);
}

// ── Someone arrives with no key at all ────────────────────────
{
  const w = makeWorld({ url: 'https://get-kiko.com/activate.html' });
  w.runPage();
  ok('no spinner without a key', visible(w.els).length === 0);
  ok('the instructions are there immediately', !w.els.manual.hidden);
  ok('and no empty key box', w.els.keywrap.hidden);
  ok('nothing is scheduled to change that', w.timers.filter(t => t.ms >= 1000).length === 0);
}

// ── Where the content script must refuse to act ───────────────
{
  const cases = [
    ['a different site',      { url: 'https://evil.example/activate.html?key=ABCD-1234-EFGH-5678' }],
    ['a lookalike host',      { url: 'https://get-kiko.com.evil.example/?key=ABCD-1234-EFGH-5678' }],
    ['plain http',            { url: 'http://get-kiko.com/activate.html?key=ABCD-1234-EFGH-5678' }],
    ['inside an iframe',      { top: false }],
  ];
  for (const [label, opts] of cases) {
    let called = false;
    const w = makeWorld({ ...opts, sendMessage: () => { called = true; } });
    w.runPage();
    w.runContent();
    ok(`no activation from ${label}`, !called);
  }
}

// ── What counts as a key ──────────────────────────────────────
// Whatever this accepts is sent to the licence provider.
{
  const good = ['ABCD-1234-EFGH-5678', '38b1460a-5104-4d7c-a4d5-b1e3b0ad3f39', 'A1b2C3d4'];
  const bad  = ['', 'short', '../../etc/passwd', 'key with spaces', 'a'.repeat(101),
                '<script>alert(1)</script>', '-leadingdash', 'semi;colon'];
  for (const k of good) {
    let called = false;
    const w = makeWorld({ url: `https://get-kiko.com/activate.html?key=${encodeURIComponent(k)}`,
                          sendMessage: () => { called = true; } });
    w.runPage();
    w.runContent();
    ok(`a real key is accepted: ${k.slice(0, 12)}`, called);
  }
  for (const k of bad) {
    let called = false;
    const w = makeWorld({ url: `https://get-kiko.com/activate.html?key=${encodeURIComponent(k)}`,
                          sendMessage: () => { called = true; } });
    w.runPage();
    w.runContent();
    ok(`refused: ${JSON.stringify(k).slice(0, 24)}`, !called);
  }
}

// ── The handshake works whichever script is ready first ───────
// There is no ordering guarantee between a content script and a page's own
// scripts, and getting this wrong means the page spins forever for a customer
// who has everything installed correctly.
{
  for (const [label, order] of [['page first', ['page', 'content']],
                                ['content first', ['content', 'page']]]) {
    const w = makeWorld({ sendMessage: (_m, cb) => cb({ ok: true }) });
    for (const which of order) (which === 'page' ? w.runPage : w.runContent)();
    ok(`activation completes with the ${label}`, visible(w.els).join() === 's-ok',
       visible(w.els).join());
  }
}

// ── The page and the extension agree on the wire format ───────
{
  ok('both sides name the same hosts',
     CONTENT.includes("'get-kiko.com'") && CONTENT.includes("'www.get-kiko.com'"));
  ok('the page sends kiko-page/hello', pageScript.includes("source: 'kiko-page'") &&
     pageScript.includes("type: 'hello'"));
  ok('the extension answers kiko-extension', contentBlock.includes("source: 'kiko-extension'"));
  ok('both check the origin', pageScript.includes('e.origin !== location.origin') &&
     contentBlock.includes('e.origin !== location.origin'));
  // Every postMessage on both sides is addressed to this origin and nowhere
  // else. A "*" here would broadcast a licence key to anything listening.
  for (const [where, src] of [['page', pageScript], ['extension', contentBlock]]) {
    const posts = (src.match(/postMessage\(/g) || []).length;
    const scoped = (src.match(/,\s*location\.origin\s*\)/g) || []).length;
    ok(`the ${where} addresses every message to our own origin`, posts > 0 && posts === scoped,
       `${posts} postMessage calls, ${scoped} scoped`);
    ok(`the ${where} never posts to a wildcard origin`, !src.includes("'*'"));
  }
  ok('the extension uses the existing background message',
     contentBlock.includes("'kiko-activate-licence'"));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
