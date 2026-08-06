#!/usr/bin/env node
/**
 * Detection regression tests.  Run:  node test-detection.js
 *
 * content.js is a browser IIFE with no exports, so this strips the wrapper,
 * stubs the handful of Chrome and DOM globals it touches at load time, and
 * evaluates it as a module. No build step, no dependencies.
 *
 * Every case here exists because something was actually broken:
 *   - привет and как were discarded before COMMON_RU_WORDS was consulted
 *   - 안녕 was discarded the same way, by the Hebrew guard and the English score
 *   - Russian claimed привіт, starving Ukrainian of the words it exists for
 *   - single words never fire; detection needs a run of two. Easy to "fix"
 *     by accident and flood users with false positives.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadContentScript() {
  let src = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
  src = src.replace('(()=>{', '');
  src = src.slice(0, src.lastIndexOf('})(); // end IIFE'));

  const sandbox = {
    chrome: {
      runtime: {
        getManifest: () => ({ version: 'test' }),
        sendMessage: () => ({ catch() {} }),
        id: 'test',
        onMessage: { addListener() {} },
      },
      storage: {
        local: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener() {} },
      },
    },
    window: { location: { hostname: 'test' }, addEventListener() {}, getSelection: () => null },
    document: {
      addEventListener() {}, querySelectorAll: () => [], body: null, documentElement: {},
      createElement: () => ({ style: {}, addEventListener() {}, querySelector: () => ({ addEventListener() {} }) }),
    },
    navigator: { userAgent: 'test' },
    MutationObserver: class { observe() {} disconnect() {} },
    setInterval: () => 0,
    setTimeout: () => 0,
    clearTimeout() {},
    requestAnimationFrame: () => 0,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // Wrap in a function: the script keeps the IIFE's top-level `return` from the
  // duplicate-injection guard, which is illegal at true top level.
  return vm.runInContext(
    '(function () {\n' + src +
    '\nreturn { analyzeText, setLangs: o => { enabledLangs = o; },' +
    '         setEntitled: v => { entitled = v; } };\n})()',
    sandbox);
}

function loadComputeEntitlement() {
  const src = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
  const fn = src.slice(src.indexOf('function computeEntitlement'),
                       src.indexOf('async function refreshEntitlement'));
  const ctx = vm.createContext({});
  return vm.runInContext(
    'const TRIAL_DAYS=30, DAY_MS=86400000, RECHECK_MS=86400000, GRACE_MS=7*86400000;\n' + fn + ';computeEntitlement', ctx);
}

const kiko = loadContentScript();
const computeEntitlement = loadComputeEntitlement();
const ALL = { he: true, ru: true, uk: true, ko: true, el: true, ar: true };
const NONE = { he: false, ru: false, uk: false, ko: false, el: false, ar: false };

let pass = 0, fail = 0;

function check(label, input, wantType, opts = {}) {
  kiko.setLangs({ ...(opts.langs || ALL) });
  const got = kiko.analyzeText(input);
  const gotType = got ? got.type : null;
  const ok = gotType === wantType &&
    (opts.converted === undefined || (got && got.converted === opts.converted));
  if (ok) { pass++; return; }
  fail++;
  console.log(`  FAIL  ${label}`);
  console.log(`        input    ${JSON.stringify(input)}`);
  console.log(`        expected ${wantType}${opts.converted ? '  -> ' + opts.converted : ''}`);
  console.log(`        actual   ${gotType}${got ? '  -> ' + got.converted : ''}`);
}

console.log('\nEnglish typed on a foreign layout');
check('hebrew',    'akuo nvhs ekhu',  'english_as_hebrew');
check('russian',   'ghbdtn rfr',      'english_as_russian',   { converted: 'привет как' });
check('ukrainian', 'ghbdsn ghbdsn',   'english_as_ukrainian', { converted: 'привіт' });
check('korean',    'dkssud gksrnr',   'english_as_korean',    { converted: '안녕 한국' });
check('greek',     'geia soy',        'english_as_greek',     { converted: 'γεια σου' });

console.log('Common words must survive the heuristics that used to eat them');
check('привет not blocked by the Hebrew guard', 'ghbdtn rfr', 'english_as_russian');
check('как not blocked by the English score',   'rfr ghbdtn', 'english_as_russian');
check('안녕 not blocked by either',              'dkssud gksrnr', 'english_as_korean');

console.log('A single word never fires — two consecutive are required');
for (const w of ['dkssud', 'ghbdsn', 'ghbdtn', 'geia', 'akuo']) {
  check(`single "${w}"`, w, null);
}

console.log('Natural English stays silent');
[
  'please send me the file tomorrow morning',
  'can you upload the file to the shared folder',
  'the soy sauce is in the kitchen cabinet',
  'i will review the document and get back to you',
  'lets schedule a meeting for next week to discuss the project',
  'the customer support team has been notified about this issue',
  'download the latest version and restart your browser',
  'thanks a lot for helping with this design work',
  'my phone number and contact details are attached below',
  'we need to confirm the shipping address before payment',
  'hello world this is a test of the system',
  'the quick brown fox jumps over the lazy dog',
  'check the file permissions and try again later today',
  'i think the new keyboard and mouse are on the desk',
  'are you free for lunch on thursday',
  'what time does the meeting start tomorrow',
].forEach(s => check('english: ' + s.slice(0, 34), s, null));

console.log('Disabled languages never run');
check('ru off',  'ghbdtn rfr',    null, { langs: { ...NONE, ko: true } });
check('uk off',  'ghbdsn ghbdsn', 'english_as_russian', { langs: { ...NONE, ru: true } });
check('ko off',  'dkssud gksrnr', null, { langs: { ...NONE, ru: true } });
check('el off',  'geia soy',      null, { langs: { ...NONE, ru: true } });
check('only uk', 'ghbdsn ghbdsn', 'english_as_ukrainian', { langs: { ...NONE, uk: true } });
check('only ko', 'dkssud gksrnr', 'english_as_korean',    { langs: { ...NONE, ko: true } });
check('only el', 'geia soy',      'english_as_greek',     { langs: { ...NONE, el: true } });
check('all off', 'ghbdtn rfr',    null, { langs: { ...NONE } });

console.log('Foreign script typed while English was meant');
check('korean -> english', 'ㅔㅣㄷㅁㄴㄷ ㄴ둥 솓 ㄱ데ㅐㄱㅅ', 'korean_as_english',
      { converted: 'please send the report' });

console.log('Trial and licence entitlement');
{
  const DAY = 86400000, now = Date.UTC(2026, 0, 31);
  const day = n => ({ at: now - n * DAY });
  const eq = (label, got, want) => {
    const ok = got.entitled === want.entitled && got.state === want.state &&
      (want.daysLeft === undefined || got.daysLeft === want.daysLeft);
    if (ok) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${JSON.stringify(want)}`);
    console.log(`        actual   ${JSON.stringify(got)}`);
  };

  eq('fresh install',      computeEntitlement(day(0),  null, now), { entitled: true,  state: 'trial', daysLeft: 30 });
  eq('day 29 of trial',    computeEntitlement(day(29), null, now), { entitled: true,  state: 'trial', daysLeft: 1 });
  eq('day 30 — expired',   computeEntitlement(day(30), null, now), { entitled: false, state: 'expired', daysLeft: 0 });
  eq('long past',          computeEntitlement(day(400),null, now), { entitled: false, state: 'expired', daysLeft: 0 });
  // No stamp at all must not lock someone out — treat it as starting today.
  eq('no firstInstall',    computeEntitlement(null,    null, now), { entitled: true,  state: 'trial' });

  const fresh = { valid: true, checkedAt: now - DAY / 2 };
  eq('licensed, trial over', computeEntitlement(day(400), fresh, now), { entitled: true, state: 'licensed' });
  // Offline for six days on a valid licence: still working, by design.
  eq('licensed, offline 6d', computeEntitlement(day(400), { valid: true, checkedAt: now - 6 * DAY }, now),
     { entitled: true, state: 'licensed' });
  // Past the grace window it falls back to the trial, which has expired.
  eq('licensed, offline 30d', computeEntitlement(day(400), { valid: true, checkedAt: now - 30 * DAY }, now),
     { entitled: false, state: 'expired' });
  eq('licence revoked',    computeEntitlement(day(400), { valid: false, checkedAt: now }, now),
     { entitled: false, state: 'expired' });
}

console.log('An expired trial stops detection');
kiko.setEntitled(false);
check('expired: russian silent', 'ghbdtn rfr',    null);
check('expired: korean silent',  'dkssud gksrnr', null);
check('expired: hebrew silent',  'akuo nvhs ekhu', null);
kiko.setEntitled(true);
check('restored after paying',   'ghbdtn rfr',    'english_as_russian');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
