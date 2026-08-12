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
      // Which frame is in front, and where the caret is. ownsTheToast reads
      // both to decide whether this copy of the script should speak.
      hasFocus: () => true,
      activeElement: null,
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
    '\nreturn { analyzeText, dueTrialMilestone, spendTrialMilestones, ownsTheToast,' +
    '         truncatePreview,' +
    '         learnHebrew: ws => ws.forEach(w => learnedHebrew.add(w)),' +
    '         rejectWords: ws => ws.forEach(w => learnedEnglish.add(w)),' +
    '         forgetLearned: () => { learnedHebrew.clear(); learnedEnglish.clear(); },' +
    '         setFocus: (f, tag) => { document.hasFocus = () => f;' +
    '                                 document.activeElement = tag ? { tagName: tag } : null; },' +
    '         setLangs: o => { enabledLangs = o; },' +
    '         setEntitled: v => { entitled = v; } };\n})()',
    sandbox);
}

function loadLicenceProvider() {
  const src = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
  const block = src.slice(src.indexOf('const LICENCE_PROVIDER'),
                          src.indexOf('function computeEntitlement'));
  return vm.runInContext(block + ';LICENCE_PROVIDER', vm.createContext({}));
}

function loadComputeEntitlement(paywallOn) {
  const src = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
  // Take the constants along with the functions. Restating them here once let
  // the copy drift from the real ones, which is the one thing these tests are
  // supposed to catch.
  let block = src.slice(src.indexOf('const PAYWALL_ENABLED'),
                        src.indexOf('async function refreshEntitlement'));
  // The switch is off in the shipped file, so the trial rules below would
  // never be reached. Both settings are exercised: the shipped one, and the
  // one the rules exist for.
  block = block.replace(/const PAYWALL_ENABLED = \w+;/, `const PAYWALL_ENABLED = ${paywallOn};`);
  const ctx = vm.createContext({});
  return vm.runInContext(block + ';computeEntitlement', ctx);
}

const kiko = loadContentScript();
const computeEntitlement = loadComputeEntitlement(true);
const entitlementPaywallOff = loadComputeEntitlement(false);
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

console.log('The two English word lists stay in step');
{
  // Reported from the wild: typing "go do that" in plain English got an offer
  // to convert it to Hebrew. "go" and "do" were listed as common English words
  // for scoring but missing from the list that decides what could be Hebrew,
  // and both map onto real Hebrew words — עם and גם. Two adjacent words is the
  // entire minimum run.
  ['go do that', 'go do', 'lets go do that now', 'do go and check now',
   'i need to go do this', 'bye bye everyone', 'why do you need these',
  ].forEach(s => check('plain English: ' + s, s, null));
}

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

  // Users stamped on a pre-paywall build get 60 days, not 30 — their clock had
  // already been running since 4.4.0 shipped, before anyone mentioned a price.
  const on = (n, version) => ({ at: now - n * DAY, version });
  eq('4.4.0 user, day 20',  computeEntitlement(on(20, '4.4.0'), null, now),
     { entitled: true,  state: 'trial', daysLeft: 40 });
  eq('4.4.1 user, day 45',  computeEntitlement(on(45, '4.4.1'), null, now),
     { entitled: true,  state: 'trial', daysLeft: 15 });
  eq('4.4.1 user, day 60',  computeEntitlement(on(60, '4.4.1'), null, now),
     { entitled: false, state: 'expired', daysLeft: 0 });
  eq('4.1.7 user, day 45',  computeEntitlement(on(45, '4.1.7'), null, now),
     { entitled: true,  state: 'trial', daysLeft: 15 });
  // Anyone who arrives on the paywall build itself gets the advertised 30.
  eq('4.5.0 install, day 20', computeEntitlement(on(20, '4.5.0'), null, now),
     { entitled: true,  state: 'trial', daysLeft: 10 });
  eq('4.5.0 install, day 45', computeEntitlement(on(45, '4.5.0'), null, now),
     { entitled: false, state: 'expired', daysLeft: 0 });
  eq('4.6.0 install, day 45', computeEntitlement(on(45, '4.6.0'), null, now),
     { entitled: false, state: 'expired', daysLeft: 0 });
  // An unversioned stamp must not silently hand out the longer trial.
  eq('stamp without version', computeEntitlement(day(45), null, now),
     { entitled: false, state: 'expired', daysLeft: 0 });
}

console.log('Real Hebrew is never offered for conversion into English');
{
  // Reported from the wild, mid-email to a customer. Kiko offered to turn
  // "כמובן שאפשר גם יותר נמוך ללא לינה - תלוי מה התקציב" into
  // "fnuci atpar do hu,r bnul kkt khbv" — six words cleared the English-
  // likeness test on vowel ratio alone, and the single real English word it
  // required was "do", which is what גם converts to.
  //
  // Offering to destroy what someone has written is the worst thing this
  // extension can do, so these are the cases that matter most in this file.
  [
    'כמובן שאפשר גם יותר נמוך ללא לינה - תלוי מה התקציב',
    'היי שרון, מצרף הצעה לדוגמא של חברה שסגרה אצלנו השבוע',
    'ברמת המחירים כמובן שזה משתנה בהתאם לכמות משתתפים',
    'נופש + לינה יכול לצאת לכם באזור ה1300-1500 פלוס מעמ',
    'תודה רבה על ההצעה נבדוק ונחזור אליך',
    'אני חושב שזה יכול להיות טוב גם בשבוע הבא',
  ].forEach(s => check('real Hebrew: ' + s.slice(0, 30), s, null));

  // Hebrew built from vocabulary the word list does not contain. These are the
  // ones a list alone would miss and a bigram score has to carry — before
  // hebrewScore existed, "המחשב שלי נשרף אתמול" had nothing to protect it.
  [
    'המחשב שלי נשרף אתמול ואני צריך לקנות חדש',
    'הטלפון של המסעדה לא עונה כבר שעתיים',
    'שמתי את המפתחות על השולחן במטבח',
    'החתונה תתקיים בגינה של ההורים שלה',
    'הספרייה באוניברסיטה סגורה בימי שישי',
  ].forEach(s => check('unlisted Hebrew: ' + s.slice(0, 26), s, null));

  // And the case the feature exists for still has to work: English typed
  // while the keyboard was left in Hebrew. These score well below the
  // threshold, which is what keeps the two apart.
  check('english on a hebrew keyboard', 'איק אקקאןמע ןד אםצםררםצ', 'hebrew_as_english');
  check('english on a hebrew keyboard, 2', 'ישן טםו דקני אק כןךק', 'hebrew_as_english');
  check('english on a hebrew keyboard, 3', 'פךקשדק גם\'מךםשג איק ךשאקדא הקרדןםמ', 'hebrew_as_english');
  check('english on a hebrew keyboard, 4', 'בשמ טםו דקמג צק איק שאאשביקג כןךק', 'hebrew_as_english');
}

console.log('A rejected word bridges a run instead of splitting it');
{
  // Reported from the wild. "cut" had been rejected once; every later Hebrew
  // sentence containing it got fixed in half, leaving the rest as gibberish.
  const HE = ['tueh', 'brtv', 'nv', 'eurv', 'gfahu'];
  const phrase = 'tueh cut brtv nv eurv gfahu';
  const both   = 'אוקי בוא נראה מה קורה עכשיו';

  const conv = (input, rejected, learn = HE) => {
    kiko.forgetLearned();
    kiko.setLangs({ ...ALL });
    kiko.learnHebrew(learn);
    if (rejected) kiko.rejectWords(rejected);
    const r = kiko.analyzeText(input);
    return r ? r.converted : null;
  };
  const eq = (label, got, want) => {
    if (got === want) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${want}`);
    console.log(`        actual   ${got}`);
  };

  eq('nothing rejected: whole sentence', conv(phrase, null), both);
  eq('rejected word mid-run is bridged', conv(phrase, ['cut']), both);

  // The rejection still has to mean something. It may only ever bridge:
  // nothing Hebrew follows, so the gap is dropped and the word stays English.
  eq('rejected word trailing a run stays out',
     conv('brtv nv eurv cut', ['cut']), 'נראה מה קורה');
  eq('rejected word leading a run stays out',
     conv('cut brtv nv eurv', ['cut']), 'נראה מה קורה');
  // The bridge inherits PASSTHROUGH's limit of two words, so a longer stretch
  // of rejected words is still treated as a genuine break in the sentence.
  eq('two rejected words in a row are bridged',
     conv('brtv nv cut cut eurv gfahu', ['cut']), 'נראה מה בוא בוא קורה עכשיו');
  eq('three in a row is a real break',
     conv('brtv nv cut cut cut eurv gfahu', ['cut']), 'קורה עכשיו');
  // And a rejected word on its own is still just an English word.
  eq('rejected word alone never fires', conv('cut', ['cut']), null);

  // The bridge must depend on the word having been rejected. Without that
  // condition an ordinary English word would be swallowed into any Hebrew run
  // it happened to sit inside, which is the false positive this whole file
  // exists to prevent.
  eq('an ordinary English word still breaks the run',
     conv('brtv nv meeting eurv gfahu', null), 'קורה עכשיו');
}

console.log('Only the frame being typed in shows the toast');
{
  // all_frames is on, so a page with iframes runs one copy of the script per
  // frame, each with its own toast and no knowledge of the others. This is
  // what stops the same correction appearing twice.
  const cases = [
    ['caret in this frame',        true,  null,       true ],
    ['caret inside a child iframe', true, 'IFRAME',   false],
    ['caret inside a child frame',  true, 'FRAME',    false],
    ['window not focused',         false, null,       false],
    ['caret in a textarea here',   true,  'TEXTAREA', true ],
  ];
  for (const [label, focused, tag, want] of cases) {
    kiko.setFocus(focused, tag);
    const got = kiko.ownsTheToast();
    if (got === want) { pass++; continue; }
    fail++;
    console.log(`  FAIL  ${label}: expected ${want}, got ${got}`);
  }
  kiko.setFocus(true, null);
}

console.log('The licence provider block is complete and reads its own shape');
{
  // Everything provider-specific lives in one object so that switching seller
  // is a data change. This checks the object still has every part the rest of
  // background.js calls, which is the thing that breaks when someone swaps a
  // provider in a hurry.
  const P = loadLicenceProvider();
  const need = ['name', 'activateUrl', 'validateUrl', 'activateBody', 'validateBody',
                'contentType', 'encode',
                'didActivate', 'isValid', 'instanceIdOf', 'statusOf', 'errorOf'];
  need.forEach(k => {
    if (P[k] !== undefined) { pass++; return; }
    fail++; console.log(`  FAIL  LICENCE_PROVIDER is missing ${k}`);
  });

  const is = (label, got, want) => {
    if (got === want) { pass++; return; }
    fail++; console.log(`  FAIL  ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  };
  is('activate is https', P.activateUrl.startsWith('https://'), true);
  is('validate is https', P.validateUrl.startsWith('https://'), true);

  // Nothing secret may ship inside the extension, so the URLs it calls must be
  // our own proxy, never the provider's API directly. Creem's endpoints need
  // an x-api-key; pointing at them from here would either publish the key or
  // 401 every paying customer.
  const OURS = /(^|\.)(workers\.dev|get-kiko\.com)$/;
  ['activateUrl', 'validateUrl'].forEach(k => {
    const host = new URL(P[k]).hostname;
    if (OURS.test(host)) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${k} must call our own proxy, not ${host}`);
  });

  is('activate body carries the key', P.activateBody('K').key, 'K');
  is('validate body carries the key', P.validateBody('K').key, 'K');
  is('activate names the instance',   P.activateBody('K').instance_name, 'kiko-browser');
  is('validate passes a known instance', P.validateBody('K', 'i1').instance_id, 'i1');

  // The Worker rejects anything that is not a non-empty string, so a first
  // validation before activation must still send a field rather than undefined.
  is('validate sends a string when there is no instance yet',
     typeof P.validateBody('K').instance_id, 'string');

  // Bodies must survive encoding as the provider expects to receive them.
  is('encodes as JSON', P.encode({ a: 1 }), '{"a":1}');
  is('content type matches the encoding', P.contentType, 'application/json');

  // The readers must be strict about success and forgiving about everything
  // else: an unexpected response should never read as "activated" or "valid",
  // and should never throw either. Creem carries both answers in `status`.
  is('active means activated',         P.didActivate({ status: 'active' }), true);
  is('missing status is not activation', P.didActivate({}), false);
  is('inactive is not activation',     P.didActivate({ status: 'inactive' }), false);
  is('active means valid',             P.isValid({ status: 'active' }), true);
  is('expired is not valid',           P.isValid({ status: 'expired' }), false);
  is('disabled is not valid',          P.isValid({ status: 'disabled' }), false);
  is('missing status is not valid',    P.isValid({}), false);
  is('status falls back rather than throwing', P.statusOf({}), 'unknown');
  is('status is read through',         P.statusOf({ status: 'expired' }), 'expired');

  // Creem returns `instance` as an array and appends on each activation, so
  // the one that matters is the last. An object still works, because that is
  // what the previous provider sent and the reader must not throw on it.
  is('instance id absent is undefined', P.instanceIdOf({}), undefined);
  is('instance id from an empty array', P.instanceIdOf({ instance: [] }), undefined);
  is('instance id from a single entry',
     P.instanceIdOf({ instance: [{ id: 'i1' }] }), 'i1');
  is('instance id is the newest activation',
     P.instanceIdOf({ instance: [{ id: 'i1' }, { id: 'i2' }] }), 'i2');
  is('instance id from an object still works',
     P.instanceIdOf({ instance: { id: 'i9' } }), 'i9');

  is('no error reads as null',   P.errorOf({}), null);
  is('an error field is read',   P.errorOf({ error: 'nope' }), 'nope');
  is('a message field is read',  P.errorOf({ message: 'nope' }), 'nope');
}

console.log('Licence failures say something the user can act on');
{
  const src = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
  const block = src.slice(src.indexOf('const LICENCE_HTTP_ERRORS'),
                          src.indexOf('function computeEntitlement'));
  const E = vm.runInContext(block + ';LICENCE_HTTP_ERRORS', vm.createContext({}));

  const is = (label, got, want) => {
    if (got === want) { pass++; return; }
    fail++; console.log(`  FAIL  ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  };

  // The three Creem statuses with a cause the user can do something about.
  // "That key could not be activated" is true for all of them and helps with
  // none, which is why these exist.
  [403, 404, 410].forEach(code => {
    const msg = E[code];
    if (typeof msg === 'string' && msg.length > 20) { pass++; return; }
    fail++; console.log(`  FAIL  no usable message for HTTP ${code}`);
  });
  is('403 talks about the browser limit', /browser/i.test(E[403]), true);
  is('404 suggests a typo',               /typo/i.test(E[404]), true);
  is('410 says expired or cancelled',     /expired|cancel/i.test(E[410]), true);
  // 500 is our own proxy failing. Blaming the user's key for our outage is the
  // specific mistake this guards against.
  is('500 is not treated as a bad key',   E[500], undefined);
  is('401 is not treated as a bad key',   E[401], undefined);
}

console.log('With the paywall switched off, nobody is ever gated');
{
  // Lemon Squeezy declined the store, so there is currently no way to pay.
  // An extension that withholds a feature with a dead Subscribe button is
  // worse than one that earns nothing, so PAYWALL_ENABLED is false and this
  // is what every user gets regardless of when they installed.
  const DAY = 86400000, now = Date.UTC(2026, 0, 31);
  [
    ['a brand new install',        { at: now, version: '4.6.5' }],
    ['someone 400 days in',        { at: now - 400 * DAY, version: '4.6.5' }],
    ['a pre-paywall install',      { at: now - 400 * DAY, version: '4.4.1' }],
    ['no install stamp at all',    null],
  ].forEach(([label, stamp]) => {
    const got = entitlementPaywallOff(stamp, null, now);
    if (got.entitled === true && got.state === 'licensed') { pass++; return; }
    fail++;
    console.log(`  FAIL  paywall off, ${label}: ${JSON.stringify(got)}`);
  });
}

console.log('Trial notice milestones');
{
  const { dueTrialMilestone: due, spendTrialMilestones: spend } = kiko;
  const is = (label, got, want) => {
    if (got === want || JSON.stringify(got) === JSON.stringify(want)) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${JSON.stringify(want)}`);
    console.log(`        actual   ${JSON.stringify(got)}`);
  };

  is('day 20 — too early, say nothing', due(20, {}), undefined);
  is('day 8 — still early',             due(8,  {}), undefined);
  is('day 7 — the first warning',       due(7,  {}), 7);
  is('day 4 — still the 7-day one',     due(4,  {}), 7);
  is('day 1 — the last-day warning',    due(1,  {}), 1);
  is('day 7 already given',             due(4,  { d7: true }), undefined);
  // Away for a week: the urgent one wins, not the stale one.
  is('day 1, nothing given yet',        due(1,  {}), 1);
  is('both already given',              due(1,  { d7: true, d1: true }), undefined);

  is('showing day 7 spends only day 7', spend(7, {}), { d7: true });
  // Showing the last-day notice retires the 7-day one too, so a user who was
  // away does not get a second, now-pointless warning afterwards.
  is('showing day 1 spends both',       spend(1, {}), { d7: true, d1: true });
  is('spending keeps what was there',   spend(1, { d7: true }), { d7: true, d1: true });

  // The whole nag behaviour must be switchable off without touching anything
  // else — the expiry notice is separate and stays.
  is('no milestone is ever due at 0',   due(0, { d7: true, d1: true }), undefined);
}

console.log('An expired trial stops detection');
kiko.setEntitled(false);
check('expired: russian silent', 'ghbdtn rfr',    null);
check('expired: korean silent',  'dkssud gksrnr', null);
check('expired: hebrew silent',  'akuo nvhs ekhu', null);
kiko.setEntitled(true);
check('restored after paying',   'ghbdtn rfr',    'english_as_russian');

console.log('The toast preview shows the whole sentence');
{
  const trunc = kiko.truncatePreview;
  const is = (label, got, want) => {
    if (got === want) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${JSON.stringify(want)}`);
    console.log(`        actual   ${JSON.stringify(got)}`);
  };

  // The sentence that started this: 11 words, cut after 9 by the old cap.
  const real = 'how are you not able to read i dont get it';
  is('ordinary sentence survives intact', trunc(real), real);

  is('short text untouched',   trunc('shalom'), 'shalom');
  is('exactly at the cap',     trunc(Array(30).fill('w').join(' ')),
                               Array(30).fill('w').join(' '));
  is('one over the cap trims', trunc(Array(31).fill('w').join(' ')),
                               Array(30).fill('w').join(' ') + ' …');

  // A pasted paragraph must still be bounded — that is the cap's only job now.
  const long = trunc(Array(400).fill('word').join(' '));
  is('a paragraph is still capped', long.split(/\s+/).length, 31);
  is('capped text is marked as cut', long.endsWith('…'), true);

  // Hebrew counts words the same way; nothing here is Latin-specific.
  const he = 'שלום מה שלומך אני לא מצליח לקרוא את זה בכלל';
  is('hebrew sentence survives intact', trunc(he), he);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
