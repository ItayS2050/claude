#!/usr/bin/env node
/**
 * The review nudge.  Run:  node test-review.js
 *
 * 160 users and zero reviews, with two nudges in the product that both worked
 * exactly as written. That is the case this file exists for: logic that passes
 * every reading and still never reaches a human.
 *
 * The in-page one opened three seconds after a fix, at the same coordinates as
 * the green "✓ Fixed!" confirm that was still on screen, lived nine seconds,
 * and then wrote a thirty-day silence — whether or not anybody had looked at
 * it. One unseen appearance bought a month of quiet, and chrome.storage.local
 * survives updates, so reinstalling did not reset it.
 *
 * The popup one sat at y=1440 in a popup Chrome cuts off at 600px.
 *
 * So the tests below are not only "does the state machine transition". They
 * pin the two things that actually decided the outcome: whether it can be on
 * screen at the same time and place as something else, and whether going
 * unseen is allowed to count as an answer.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const is = (label, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return; }
  fail++;
  console.log(`  FAIL  ${label}`);
  console.log(`        expected ${JSON.stringify(want)}`);
  console.log(`        actual   ${JSON.stringify(got)}`);
};
const ok = (label, cond) => is(label, !!cond, true);

// ── A DOM stub real enough to append to and click ────────────────────────
function makeKiko() {
  let src = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
  src = src.replace('(()=>{', '');
  src = src.slice(0, src.lastIndexOf('})(); // end IIFE'));

  const onScreen = [];
  const timers = [];
  const mkEl = () => {
    const handlers = {};
    const el = {
      style: { cssText: '', setProperty() {} }, dataset: {}, id: '', className: '',
      classList: { add() {}, remove() {}, contains: () => false },
      children: [], innerHTML: '', textContent: '', byId: {},
      addEventListener(k, fn) { (handlers[k] = handlers[k] || []).push(fn); },
      removeEventListener() {},
      fire(k) { (handlers[k] || []).forEach(fn => fn({ preventDefault() {} })); },
      remove() { const i = onScreen.indexOf(el); if (i >= 0) onScreen.splice(i, 1); },
      appendChild(c) { el.children.push(c); return c; },
      // Buttons are looked up by the ids the markup gives them, so a click in a
      // test lands on the same handler a real click would.
      querySelector(sel) { return el.byId[sel] || (el.byId[sel] = mkEl()); },
      querySelectorAll() { return Object.values(el.byId); },
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 300, height: 100 }),
      closest: () => null, contains: () => false,
    };
    return el;
  };
  const body = mkEl();
  body.appendChild = c => { onScreen.push(c); return c; };

  let stored = {};
  const sandbox = {
    chrome: {
      runtime: { getManifest: () => ({ version: 'test' }), id: 'abc',
                 sendMessage: () => ({ catch() {} }), onMessage: { addListener() {} } },
      storage: { local: { get: async () => stored,
                          set: async o => { Object.assign(stored, o); return undefined; } },
                 onChanged: { addListener() {} } },
    },
    window: { location: { hostname: 'test' }, innerWidth: 1200, innerHeight: 800,
              addEventListener() {}, getSelection: () => null, open() {} },
    document: { addEventListener() {}, querySelectorAll: () => [], body,
                documentElement: body, createElement: mkEl, head: mkEl(),
                getElementById: () => null, hasFocus: () => true, activeElement: null },
    navigator: { userAgent: 'test' },
    MutationObserver: class { observe() {} disconnect() {} },
    setInterval: () => 0,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {}, requestAnimationFrame: () => 0, console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const api = vm.runInContext('(function(){\n' + src +
    '\nreturn { maybeShowReviewToast, showConfirm,' +
    '         REVIEW_SNOOZE_MS, REVIEW_QUIET_MS, REVIEW_MAX_MISSES,' +
    '         REVIEW_DELAY_MS, REVIEW_VISIBLE_MS,' +
    '         clearToast: () => { activeToast = null; },' +
    '         setToast:   t => { activeToast = t; } };\n})()', sandbox);

  return {
    ...api,
    onScreen, timers,
    put: o => { stored = o; },
    get: () => stored,
    reset: () => { onScreen.length = 0; timers.length = 0; api.clearToast(); },
    // Run the timer the nudge armed for its own auto-dismiss.
    runTimer: ms => { const t = timers.find(t => t.ms === ms); if (t) t.fn(); },
  };
}

const settle = () => new Promise(r => setImmediate(r));
const DAY = 24 * 60 * 60 * 1000;

(async () => {
  const k = makeKiko();

  // ── When it appears ────────────────────────────────────────────────────
  console.log('It asks once the user has actually got value from Kiko');

  k.reset(); k.put({ stats: { converted: 2 } });
  await k.maybeShowReviewToast(); await settle();
  is('two fixes is too early', k.onScreen.length, 0);

  k.reset(); k.put({ stats: { converted: 3 } });
  await k.maybeShowReviewToast(); await settle();
  is('the third fix earns the ask', k.onScreen.length, 1);

  k.reset(); k.put({ stats: {} });
  await k.maybeShowReviewToast(); await settle();
  is('no stats at all is not an invitation', k.onScreen.length, 0);

  // ── Going unseen is not an answer ──────────────────────────────────────
  console.log('Timing out unseen buys days, not a month');

  k.reset(); k.put({ stats: { converted: 9 } });
  await k.maybeShowReviewToast(); await settle();
  k.runTimer(k.REVIEW_VISIBLE_MS);
  await settle();
  const quiet = k.get().reviewNudge;
  is('a timeout is recorded as quiet, not snoozed', quiet.state, 'quiet');
  is('and it counts as one miss', quiet.misses, 1);
  ok('the silence it buys is the short one',
     quiet.snoozeUntil - Date.now() <= k.REVIEW_QUIET_MS + 50);
  ok('which is nowhere near thirty days',
     quiet.snoozeUntil - Date.now() < k.REVIEW_SNOOZE_MS / 5);
  is('nothing is left on screen', k.onScreen.length, 0);

  // The bug in one assertion: this is what the old code wrote for a nudge
  // nobody looked at, and why 160 users were asked at most once, ever.
  ok('an unseen nudge never buys a month', k.REVIEW_QUIET_MS < k.REVIEW_SNOOZE_MS);

  console.log('A quiet period expires and it tries again');

  k.reset();
  k.put({ stats: { converted: 9 },
          reviewNudge: { state: 'quiet', snoozeUntil: Date.now() - 1000, misses: 1 } });
  await k.maybeShowReviewToast(); await settle();
  is('after three days it asks again', k.onScreen.length, 1);

  k.reset();
  k.put({ stats: { converted: 9 },
          reviewNudge: { state: 'quiet', snoozeUntil: Date.now() + DAY, misses: 1 } });
  await k.maybeShowReviewToast(); await settle();
  is('but not before then', k.onScreen.length, 0);

  console.log('Four unseen tries is taken as an answer of its own');

  k.reset();
  k.put({ stats: { converted: 9 },
          reviewNudge: { state: 'quiet', snoozeUntil: Date.now() - 1000,
                         misses: k.REVIEW_MAX_MISSES } });
  await k.maybeShowReviewToast(); await settle();
  is('someone who never engages is left alone', k.onScreen.length, 0);

  k.reset();
  k.put({ stats: { converted: 9 },
          reviewNudge: { state: 'quiet', snoozeUntil: Date.now() - 1000,
                         misses: k.REVIEW_MAX_MISSES - 1 } });
  await k.maybeShowReviewToast(); await settle();
  is('one try short, it still asks', k.onScreen.length, 1);

  // ── A real answer is honoured ──────────────────────────────────────────
  console.log('Answering is honoured, and resets the unseen count');

  k.reset(); k.put({ stats: { converted: 9 } });
  await k.maybeShowReviewToast(); await settle();
  k.onScreen[0].querySelector('#kld-rv-later').fire('click');
  await settle();
  const later = k.get().reviewNudge;
  is('"maybe later" snoozes properly', later.state, 'snoozed');
  ok('for a month', later.snoozeUntil - Date.now() > 29 * DAY);
  is('and clears the misses — they answered', later.misses, 0);

  k.reset();
  k.put({ stats: { converted: 9 },
          reviewNudge: { state: 'snoozed', snoozeUntil: Date.now() + 20 * DAY, misses: 0 } });
  await k.maybeShowReviewToast(); await settle();
  is('a live snooze is respected', k.onScreen.length, 0);

  k.reset(); k.put({ stats: { converted: 9 } });
  await k.maybeShowReviewToast(); await settle();
  k.onScreen[0].querySelector('#kld-rv-rate').fire('click');
  await settle();
  is('rating marks it done', k.get().reviewNudge.state, 'done');

  k.reset(); k.put({ stats: { converted: 99 }, reviewNudge: { state: 'done' } });
  await k.maybeShowReviewToast(); await settle();
  is('and done means never again', k.onScreen.length, 0);

  k.reset(); k.put({ stats: { converted: 9 } });
  await k.maybeShowReviewToast(); await settle();
  k.onScreen[0].querySelector('#kld-rv-x').fire('click');
  await settle();
  is('the ✕ is an answer too', k.get().reviewNudge.state, 'snoozed');

  // ── It must not land underneath something else ─────────────────────────
  console.log('It never shares the screen with another toast');

  k.reset(); k.put({ stats: { converted: 9 } });
  k.setToast({ dataset: {} });          // a fresh detection opened first
  await k.maybeShowReviewToast(); await settle();
  is('a detection toast wins the spot', k.onScreen.length, 0);
  ok('and no state is written for a nudge that never rendered',
     k.get().reviewNudge === undefined);

  // The original failure, pinned: the confirm and the nudge use the same id and
  // the same applyPos coordinates, so the only thing keeping them apart is that
  // the nudge waits longer than the confirm lives.
  const src = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
  const confirmLife = src.match(/setTimeout\(\(\) => el\.remove\(\), undoFn \? (\d+) : (\d+)\)/);
  ok('showConfirm still self-removes on a timer', !!confirmLife);
  const longestConfirm = Math.max(Number(confirmLife[1]), Number(confirmLife[2]));
  ok(`the nudge waits out the confirm (${k.REVIEW_DELAY_MS}ms > ${longestConfirm}ms)`,
     k.REVIEW_DELAY_MS > longestConfirm);
  ok('and stays long enough to be read', k.REVIEW_VISIBLE_MS >= 12000);

  // ── The popup nudge is above the fold ──────────────────────────────────
  console.log('The popup nudge is somewhere a person will see it');
  {
    const html = fs.readFileSync(path.join(__dirname, 'popup.html'), 'utf8');
    const nudge = html.indexOf('id="review-nudge"');
    const stats = html.indexOf('<div class="stats">');
    const firstList = html.indexOf('<div class="word-list"');
    const help = html.indexOf('class="help-links"');
    ok('it exists', nudge > 0);
    ok('it comes after the stats that justify it', nudge > stats);
    // Chrome caps a popup at 600px and scrolls the rest. Everything below is
    // the learned-word lists for seven languages; measured, this used to put
    // the nudge at y=1440. Keeping it above the first list keeps it on screen.
    ok('and before the learned-word lists', nudge < firstList);
    ok('nowhere near the help links at the bottom', nudge < help);
  }

  // ── The one-time repair for people already silenced ────────────────────
  console.log('Users silenced by the old bug get one honest chance');
  {
    const bg = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
    const block = bg.slice(bg.indexOf('reviewNudgeReset'));
    ok('it runs only on update, not on fresh installs',
       /details\.reason === 'update'/.test(bg.slice(0, bg.indexOf('reviewNudgeReset'))));
    ok('it clears a stale snooze', /remove\('reviewNudge'\)/.test(block));
    ok('it only touches snoozed records',
       /reviewNudge\.state === 'snoozed'/.test(block));
    ok("it never clears a real 'done'", !/state === 'done'/.test(block));
    ok('and it is guarded so it happens exactly once',
       /reviewNudgeReset: true/.test(block) && /if \(!reviewNudgeReset\)/.test(block));
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
