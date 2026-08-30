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
    '\nreturn { analyzeText: analyzeByLines, dueTrialMilestone, spendTrialMilestones, ownsTheToast,' +
    '         truncatePreview, isDuplicateOfVisibleToast,' +
    '         isAcceptShortcut, toastAcceptsKeyboard, ACCEPT_KEYS, IS_MAC,' +
    '         STRICT_MS, toHebrewKeys: convertToHebrew,' +
    '         unmistakablyEnglish, fromHebrewKeys: convertToEnglish,' +
    '         down: {he:convertToEnglish, ru:convertFromRussian,' +
    '                uk:convertFromUkrainian, ko:convertFromKorean,' +
    '                el:convertFromGreek, ar:convertFromArabic},' +
    '         up:   {he:convertToHebrew, ru:convertToRussian,' +
    '                uk:convertToUkrainian, ko:convertToKorean,' +
    '                el:convertToGreek, ar:convertToArabic},' +
    '         afterAFix: () => { strictModeUntil = Date.now() + STRICT_MS; },' +
    '         longAfterAFix: () => { strictModeUntil = 0; lastCase2Original = null; },' +
    '         rememberCase2: s => { lastCase2Original = s.trim().toLowerCase(); },' +
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
  // URLSearchParams is a browser global the provider block uses to form-encode.
  return vm.runInContext(block + ';LICENCE_PROVIDER',
                         vm.createContext({ URLSearchParams }));
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
  // Two stamps now matter, not one: when they installed, and when they first
  // ran a build that can charge. For someone who installs a paywalled build
  // they are the same moment, which is what `both` models.
  const day   = n => ({ at: now - n * DAY });
  const both  = n => [day(n), day(n)];
  const eq = (label, got, want) => {
    const ok = got.entitled === want.entitled && got.state === want.state &&
      (want.daysLeft === undefined || got.daysLeft === want.daysLeft);
    if (ok) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${JSON.stringify(want)}`);
    console.log(`        actual   ${JSON.stringify(got)}`);
  };
  const ent = (install, licence, paywallStart) =>
    computeEntitlement(install, licence, now, paywallStart);

  eq('fresh install',    ent(...both(0),  null), { entitled: true,  state: 'trial', daysLeft: 30 });
  eq('day 29 of trial',  ent(day(29), null, day(29)), { entitled: true,  state: 'trial', daysLeft: 1 });
  eq('day 30 — expired', ent(day(30), null, day(30)), { entitled: false, state: 'expired', daysLeft: 0 });
  eq('long past',        ent(day(400),null, day(400)),{ entitled: false, state: 'expired', daysLeft: 0 });
  // No stamp at all must not lock someone out — treat it as starting today.
  eq('no firstInstall',  ent(null, null, null), { entitled: true, state: 'trial' });

  const fresh = { valid: true, checkedAt: now - DAY / 2 };
  eq('licensed, trial over', ent(day(400), fresh, day(400)), { entitled: true, state: 'licensed' });
  // Offline for six days on a valid licence: still working, by design.
  eq('licensed, offline 6d', ent(day(400), { valid: true, checkedAt: now - 6 * DAY }, day(400)),
     { entitled: true, state: 'licensed' });
  // Past the grace window it falls back to the trial, which has expired.
  eq('licensed, offline 30d', ent(day(400), { valid: true, checkedAt: now - 30 * DAY }, day(400)),
     { entitled: false, state: 'expired' });
  eq('licence revoked', ent(day(400), { valid: false, checkedAt: now }, day(400)),
     { entitled: false, state: 'expired' });

  // ── What each group was promised ────────────────────────────
  // Three different figures have been advertised. Everyone gets the one that
  // was on the site the day they installed, not the one that is there now.
  const on = (n, version) => ({ at: now - n * DAY, version });

  // Free through 4.4.x: 60 days, because they never agreed to any trial.
  eq('4.4.0 user, day 20', ent(on(20, '4.4.0'), null, day(20)),
     { entitled: true,  state: 'trial', daysLeft: 40 });
  eq('4.4.1 user, day 60', ent(on(60, '4.4.1'), null, day(60)),
     { entitled: false, state: 'expired', daysLeft: 0 });
  eq('4.1.7 user, day 45', ent(on(45, '4.1.7'), null, day(45)),
     { entitled: true,  state: 'trial', daysLeft: 15 });

  // Everyone from the paywall build onwards was shown 30 days.
  eq('4.5.0 install, day 20', ent(on(20, '4.5.0'), null, day(20)),
     { entitled: true,  state: 'trial', daysLeft: 10 });
  eq('4.5.0 install, day 45', ent(on(45, '4.5.0'), null, day(45)),
     { entitled: false, state: 'expired', daysLeft: 0 });
  eq('4.6.0 install, day 29', ent(on(29, '4.6.0'), null, day(29)),
     { entitled: true,  state: 'trial', daysLeft: 1 });
  eq('4.7.0 install, day 20', ent(on(20, '4.7.0'), null, day(20)),
     { entitled: true,  state: 'trial', daysLeft: 10 });
  eq('5.0.0 install, day 20', ent(on(20, '5.0.0'), null, day(20)),
     { entitled: true,  state: 'trial', daysLeft: 10 });

  // An unversioned stamp gets the current promise, not the generous one.
  eq('stamp without version', ent(day(45), null, day(45)),
     { entitled: false, state: 'expired', daysLeft: 0 });

  // ── The clock starts when the paywall does ──────────────────
  // This is the one that decides whether switching payments on is a launch or
  // an outage. Every existing user installed months ago; if the trial counted
  // from installation they would all expire the same afternoon, mid-sentence,
  // having been told nothing.
  eq('installed 200 days ago, paywall on today',
     ent(on(200, '4.7.0'), null, day(0)),
     { entitled: true, state: 'trial', daysLeft: 30 });
  eq('installed 200 days ago, paywall on 10 days ago',
     ent(on(200, '4.7.0'), null, day(10)),
     { entitled: true, state: 'trial', daysLeft: 20 });
  eq('installed 200 days ago, paywall on 40 days ago',
     ent(on(200, '4.7.0'), null, day(40)),
     { entitled: false, state: 'expired', daysLeft: 0 });
  // A pre-paywall user gets 60 days from the day they are told, not from 4.4.
  eq('4.4.0 user, paywall on today',
     ent(on(300, '4.4.0'), null, day(0)),
     { entitled: true, state: 'trial', daysLeft: 60 });

  // The stamp can only ever delay the start, never bring it forward — a bad
  // clock or a restored backup must not shorten anyone's trial.
  eq('paywall stamp older than the install',
     ent(day(5), null, day(90)),
     { entitled: true, state: 'trial', daysLeft: 25 });

  // If the stamp is missing while the paywall is on — a failed write, or the
  // very first call before it is saved — nobody may be expired by its absence.
  eq('no paywall stamp yet, old install',
     ent(on(400, '4.7.0'), null, null),
     { entitled: true, state: 'trial', daysLeft: 30 });
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

console.log('A fix replaces the mistyped words and not one word more');
{
  // Found by the 4.8.6 audit. Detection was right — those really are mistyped
  // Hebrew words — but the context-extension pass then absorbed the English
  // word beside the run, so accepting the fix replaced a word the user had
  // typed on purpose. "yesterday" became טקדאקרגשט.
  //
  // The rule that came out of it: a common English word may be *enclosed* by
  // wrong-layout text, but may never *extend* a run outward.
  const span = (label, input, want) => {
    kiko.forgetLearned();
    kiko.setLangs({ ...ALL });
    const d = kiko.analyzeText(input);
    const got = d ? d.original : null;
    if (got === want) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${label}`);
    console.log(`        input    ${JSON.stringify(input)}`);
    console.log(`        expected ${JSON.stringify(want)}`);
    console.log(`        actual   ${JSON.stringify(got)}`);
  };

  span('trailing english is left alone',
       'I spoke with akuo nv akunl yesterday', 'akuo nv akunl');
  span('leading english is left alone',
       'the akuo nv file', 'akuo nv');
  span('english on both sides is left alone',
       'akuo nv akunl and then I left', 'akuo nv akunl');
  span('a brand before the run is left alone',
       'Slack akuo nv akunl', 'akuo nv akunl');
  span('a fully mistyped sentence is taken whole',
       'akuo nv akunl vhuo', 'akuo nv akunl vhuo');

  // Acronyms are short, vowel-free and in no dictionary, which is exactly the
  // shape of a mistyped Hebrew word. Capitalisation is the only thing that
  // tells them apart: nobody holds shift through a whole wrong-layout burst.
  check('acronyms are not offered for conversion',
        'send the PDF and the CSV to HR', null);
  check('more acronyms',  'PR CI CD QA UAT prod', null);
  // One-sided on purpose: a burst typed with caps lock is now missed, which
  // costs a shrug, where converting someone's acronyms costs them their text.
  check('lowercase burst still fires', 'akuo nv akunl', 'english_as_hebrew');
}

console.log('A comma is punctuation or the letter ת, whichever the word allows');
{
  // On the Hebrew layout the comma key is ת. So "t," is את — one of the
  // commonest words in the language — and stripping punctuation blindly would
  // destroy it. But an ordinary sentence has commas too, and "akuo," reads as
  // שלוםת, which is impossible: ם is a final form and cannot precede a letter.
  // Before this, the word was simply unrecognisable and the whole run died.
  check('a comma after a word no longer kills the run',
        'akuo, nv akunl vhuo', 'english_as_hebrew',
        { converted: 'שלום, מה שלומך היום' });
  // The raw reading is tried first so a word that genuinely ends in ת is
  // untouched. Honest caveat: no case in the corpus distinguishes raw-first
  // from strip-always, so that ordering rests on the argument about words
  // ending in ת rather than on evidence. Worth revisiting when the corpus
  // holds real text.
  check('a word that really ends in ת still converts',
        't, vhuo', 'english_as_hebrew', { converted: 'את היום' });
  check('a full stop behaves the same way',
        'akuo. nv akunl', 'english_as_hebrew', { converted: 'שלום. מה שלומך' });
  // Nothing is admitted that a bare word would not have been: the second
  // attempt runs the same gauntlet, so English with commas stays silent.
  check('english with commas stays quiet',  'yes, i can do that, but not before friday', null);
  check('english with a full stop stays quiet', 'ok, sounds good, talk later.', null);
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
  const need = ['name', 'activateUrl', 'validateUrl', 'deactivateUrl',
                'activateBody', 'validateBody', 'deactivateBody',
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
  // Nothing secret may ship inside the extension, so the only hosts it may
  // call are ones that need no key: our own Worker, or a provider whose
  // licence endpoints are documented as client-callable. Lemon Squeezy's are.
  // Creem's are not — pointing straight at them would either publish the API
  // key or 401 every paying customer, which is why the Worker exists.
  const NO_SECRET_NEEDED = /(^|\.)(workers\.dev|get-kiko\.com|lemonsqueezy\.com)$/;
  ['activateUrl', 'validateUrl', 'deactivateUrl'].forEach(k => {
    const host = new URL(P[k]).hostname;
    if (NO_SECRET_NEEDED.test(host)) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${k} calls ${host}, which needs a secret the extension cannot hold`);
  });

  is('activate body carries the key', P.activateBody('K').license_key, 'K');
  is('validate body carries the key', P.validateBody('K').license_key, 'K');
  is('activate names the instance',   P.activateBody('K').instance_name, 'kiko-browser');
  is('validate passes a known instance', P.validateBody('K', 'i1').instance_id, 'i1');
  // Before activation there is no instance, and Lemon Squeezy wants the field
  // absent rather than blank.
  is('validate omits a missing instance', 'instance_id' in P.validateBody('K'), false);

  // Bodies must survive encoding as the provider expects to receive them.
  // Deactivation needs both halves or the provider cannot tell which seat to
  // free, and a body missing either would silently release nothing.
  is('deactivate carries the key',      P.deactivateBody('K', 'i1').license_key, 'K');
  is('deactivate carries the instance', P.deactivateBody('K', 'i1').instance_id, 'i1');
  is('deactivate sends nothing else',   Object.keys(P.deactivateBody('K', 'i1')).length, 2);

  is('encodes as form data', P.encode({ a: 1, b: 'x y' }), 'a=1&b=x+y');
  is('content type matches the encoding', P.contentType, 'application/x-www-form-urlencoded');

  // The readers must be strict about success and forgiving about everything
  // else: an unexpected response should never read as "activated" or "valid",
  // and should never throw either.
  is('activated only on a true flag',  P.didActivate({ activated: true }), true);
  is('missing flag is not activation', P.didActivate({}), false);
  is('a string is not activation',     P.didActivate({ activated: 'yes' }), false);
  is('valid only on a true flag',      P.isValid({ valid: true }), true);
  is('missing flag is not valid',      P.isValid({}), false);
  is('a string is not valid',          P.isValid({ valid: 'yes' }), false);
  is('an explicit false is not valid', P.isValid({ valid: false }), false);
  is('status falls back rather than throwing', P.statusOf({}), 'unknown');
  is('status is read through',
     P.statusOf({ license_key: { status: 'expired' } }), 'expired');

  // Lemon Squeezy returns `instance` as an object. The array form is still
  // handled because Creem sent one and the Worker fallback may come back.
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

  // A real activation, captured from Creem on 12 Aug 2026 against a test-mode
  // purchase, kept because Creem is the fallback provider and this is the only
  // sample anyone has of what it actually sends. It differs from Creem's own
  // documentation in the field that matters most: the docs show `instance` as
  // an array and it arrives as a single object.
  //
  // Only the provider-independent parts are asserted here. didActivate and
  // isValid are deliberately not — they read Lemon Squeezy's shape now, and a
  // Creem payload failing them is correct rather than a defect. If Kiko ever
  // moves back, those two readers change and this fixture becomes live again.
  const CREEM = {
    object: 'license',
    id: 'lk_6QcSTA8cxL53FqHTD0QbMV',
    product_id: 'prod_6X90O0ijcb6lHAWfktGKBs',
    status: 'active',
    key: 'ZV0Y5-UNKRM-GNM6D-NFT9O-DP31V',
    activation: 1,
    activation_limit: 5,
    expires_at: null,
    created_at: '2026-08-12T10:27:01.225Z',
    instance: {
      object: 'license-instance',
      id: 'lki_18CrSXfPGyKFxCOfVZgfTo',
      name: 'kiko-browser',
      status: 'active',
      created_at: '2026-08-12T10:30:00.197Z',
      mode: 'test',
    },
    mode: 'test',
  };

  // The one that would have broken everything quietly: a missing instance id
  // makes every later validation malformed. instanceIdOf is shared across
  // providers, so this stays a live test whoever is selling.
  is('an object instance still yields its id',
     P.instanceIdOf(CREEM), 'lki_18CrSXfPGyKFxCOfVZgfTo');
  is('the follow-up validation carries the instance',
     P.validateBody('K', P.instanceIdOf(CREEM)).instance_id,
     'lki_18CrSXfPGyKFxCOfVZgfTo');
  is('an unrecognised shape never reads as valid', P.isValid(CREEM), false);
  is('an unrecognised shape yields no error',      P.errorOf(CREEM), null);

  // Product configuration, recorded because getting either wrong cuts people
  // off: no expiry on the key means access ends with the subscription rather
  // than on a fixed date, and five activations covers reinstalls.
  is('the key has no expiry of its own', CREEM.expires_at, null);
  is('five activations, as configured',  CREEM.activation_limit, 5);

  // Lemon Squeezy's documented shape. Marked as documented rather than
  // observed on purpose — Creem's docs turned out to be wrong about exactly
  // this, so replace it with a captured response after the first real
  // purchase.
  const LS_ACTIVATE = {
    activated: true,
    error: null,
    license_key: { id: 1, status: 'active', key: 'ABC-123', activation_limit: 5, activation_usage: 1 },
    instance: { id: '9b2f0c1e-1f0a-4a9b-9a2f-0c1e1f0a4a9b', name: 'kiko-browser' },
    meta: { store_id: 1, product_id: 2, variant_id: 3 },
  };
  const LS_VALIDATE = { valid: true, error: null, license_key: LS_ACTIVATE.license_key,
                        instance: LS_ACTIVATE.instance, meta: LS_ACTIVATE.meta };

  is('a documented activation reads as activated', P.didActivate(LS_ACTIVATE), true);
  is('a documented activation yields its instance',
     P.instanceIdOf(LS_ACTIVATE), '9b2f0c1e-1f0a-4a9b-9a2f-0c1e1f0a4a9b');
  is('a documented activation yields its status', P.statusOf(LS_ACTIVATE), 'active');
  is('a documented validation reads as valid',    P.isValid(LS_VALIDATE), true);
  is('a null error reads as null',                P.errorOf(LS_ACTIVATE), null);
  // A refunded or cancelled key comes back 200 with valid:false — the body
  // carries the answer, not the status code.
  is('a revoked key is not valid',
     P.isValid({ valid: false, error: 'license_key not active', license_key: { status: 'expired' } }), false);
  is('and its reason is shown to the user',
     P.errorOf({ valid: false, error: 'license_key not active' }), 'license_key not active');
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

console.log('Only a real answer can revoke a licence');
{
  const src = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
  // Load the real function rather than restating the rule here — a test that
  // reimplements what it is checking passes no matter what the code does.
  const block = src.slice(src.indexOf('const LICENCE_REVOKED_CODES'),
                          src.indexOf('function computeEntitlement'));
  const mayRevoke = vm.runInContext(block + ';mayRevokeLicence',
                                    vm.createContext({ Set }));

  const is = (label, got, want) => {
    if (got === want) { pass++; return; }
    fail++; console.log(`  FAIL  ${label}: expected ${want}, got ${got}`);
  };

  is('a 200 is authoritative',        mayRevoke(200), true);
  is('403 revokes (limit reached)',   mayRevoke(403), true);
  is('404 revokes (unknown key)',     mayRevoke(404), true);
  is('410 revokes (expired)',         mayRevoke(410), true);

  // Every one of these is our fault, not the customer's. This is the specific
  // path that would have expired paying users: the Worker 400s on a blank
  // instance_id, which happens whenever activation returned a shape we could
  // not read.
  is('400 does not revoke — our bad request',  mayRevoke(400), false);
  is('401 does not revoke — our API key',      mayRevoke(401), false);
  is('500 does not revoke — our Worker',       mayRevoke(500), false);
  is('502 does not revoke — Creem unreachable',mayRevoke(502), false);
  is('429 does not revoke — rate limited',     mayRevoke(429), false);
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

console.log('The same mistake typed twice fires twice');
{
  const dup = kiko.isDuplicateOfVisibleToast;
  const det = (...words) => ({ words });
  const sigOf = (d) => d.words.join('|');
  const TOAST = {};   // stands in for a live toast element

  const is = (label, got, want) => {
    if (got === want) { pass++; return; }
    fail++; console.log(`  FAIL  ${label}: expected ${want}, got ${got}`);
  };

  const akuo = det('akuo', 'nvhs');

  // The bug, as reported: type it, let the toast go, type the same thing again.
  // lastDetection still holds the old detection, but nothing is on screen, so
  // this must not be treated as a duplicate.
  is('same words after the toast closed is not a duplicate',
     dup(sigOf(akuo), akuo, null), false);

  // The behaviour actually worth keeping: don't rebuild a toast that is up.
  is('same words while the toast is up is a duplicate',
     dup(sigOf(akuo), akuo, TOAST), true);

  is('different words while a toast is up still fire',
     dup(sigOf(det('ghbdtn')), akuo, TOAST), false);
  is('nothing shown before is never a duplicate',
     dup(sigOf(akuo), null, TOAST), false);
  is('nothing shown and nothing on screen',
     dup(sigOf(akuo), null, null), false);

  // Word order is part of the signature, as it always was.
  is('reordered words are a different detection',
     dup(sigOf(det('nvhs', 'akuo')), akuo, TOAST), false);
}

console.log('Activating gives back the seat this browser already holds');
{
  // Every activation eats one of the licence's activations, and uninstalling
  // wipes chrome.storage.local — so a reinstall takes a fresh seat while the
  // old one counts for ever. Five reinstalls and a paying customer is locked
  // out. This is what happened during testing on 13 Aug: a key with five
  // activations refused, every seat spent by unpacked loads nobody released.
  const src = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');

  const has = (label, re) => {
    if (re.test(src)) { pass++; return; }
    fail++; console.log(`  FAIL  ${label}`);
  };

  has('a release step exists', /async function releaseStoredInstance\b/);
  has('activation releases first',
      /async function activateLicence[\s\S]{0,400}?await releaseStoredInstance\(\)/);

  // Order matters and is easy to get backwards: releasing after activating
  // would hand back the seat just taken.
  const release  = src.indexOf('await releaseStoredInstance()');
  const activate = src.indexOf('fetch(LICENCE_PROVIDER.activateUrl');
  if (release > -1 && activate > -1 && release < activate) pass++;
  else { fail++; console.log('  FAIL  the seat is released after activating, not before'); }

  // It must never block the activation the user is waiting on. A throw here
  // costs one wasted seat; an unhandled one costs them the activation.
  has('release swallows its own failures',
      /async function releaseStoredInstance[\s\S]*?catch \{\}[\s\S]*?\n\}/);
  // And nothing to release is the common case — a first-time activation.
  has('release does nothing without a stored instance',
      /if \(!licence \|\| !licence\.key \|\| !licence\.instanceId\) return;/);
}

console.log('A stale entitlement from an older build is never shown');
{
  // Every 4.7.x user carries entitlement {state:'licensed'} in storage, written
  // during the months the paywall was off, where it meant only "nobody is being
  // charged". Painted unchecked after the update it says "Subscription active"
  // to someone on a trial, hiding both the countdown and the price.
  //
  // The popup paints the cached copy first so it does not flash empty, so the
  // cached copy has to be checked. background.js stamps each one with the
  // version that computed it.
  const src = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
  const block = src.slice(src.indexOf('function freshEnough'),
                          src.indexOf('function renderEntitlement'));
  const HERE = '4.8.1';
  const fresh = vm.runInContext(block + ';freshEnough',
    vm.createContext({ chrome: { runtime: { getManifest: () => ({ version: HERE }) } } }));

  const is = (label, got, want) => {
    if (got === want) { pass++; return; }
    fail++; console.log(`  FAIL  ${label}: expected ${want}, got ${got}`);
  };

  is('this build\'s own answer is used',
     fresh({ state: 'trial', v: HERE }), true);
  // The exact shape a 4.7.x user brings into the update: no stamp at all.
  is('an unstamped answer is discarded',
     fresh({ entitled: true, state: 'licensed', daysLeft: null }), false);
  is('an older build\'s answer is discarded',
     fresh({ state: 'licensed', v: '4.7.0' }), false);
  is('a newer build\'s answer is discarded too',
     fresh({ state: 'licensed', v: '4.9.0' }), false);
  is('nothing stored is not fresh', fresh(null), false);
  is('undefined is not fresh',      fresh(undefined), false);

  // background.js must actually apply the stamp, or the popup discards every
  // answer forever and the banner never appears at all.
  const bg = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
  const stamps = /v: chrome\.runtime\.getManifest\(\)\.version/.test(bg);
  if (stamps) pass++;
  else { fail++; console.log('  FAIL  background.js writes entitlement without a version stamp'); }
}

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

console.log('The fix can be accepted without touching the mouse');
{
  // Escape dismissed, but accepting needed a click, so the fastest users —
  // the ones who type in two languages all day, which is the whole market —
  // had to leave the keyboard for every correction. Alt+Shift+Enter accepts.
  const is = (label, got, want) => {
    if (got === want) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  };
  const key = o => Object.assign(
    { code: 'Enter', altKey: false, shiftKey: false, ctrlKey: false, metaKey: false }, o);

  is('alt+shift+enter accepts',
     kiko.isAcceptShortcut(key({ altKey: true, shiftKey: true })), true);
  is('the numeric keypad enter works too',
     kiko.isAcceptShortcut(key({ altKey: true, shiftKey: true, code: 'NumpadEnter' })), true);

  // Enter alone is not available. In Gmail, Slack, WhatsApp Web and every
  // other place Kiko runs, Enter sends the message — binding accept to it
  // would fire the fix at the moment the text is already gone.
  is('bare enter does not accept',      kiko.isAcceptShortcut(key({})), false);
  is('shift+enter does not accept',     kiko.isAcceptShortcut(key({ shiftKey: true })), false);
  is('alt+enter does not accept',       kiko.isAcceptShortcut(key({ altKey: true })), false);
  is('ctrl+alt+shift+enter does not',
     kiko.isAcceptShortcut(key({ altKey: true, shiftKey: true, ctrlKey: true })), false);
  is('cmd+alt+shift+enter does not',
     kiko.isAcceptShortcut(key({ altKey: true, shiftKey: true, metaKey: true })), false);
  is('alt+shift+K is still the scan key, not accept',
     kiko.isAcceptShortcut(key({ altKey: true, shiftKey: true, code: 'KeyK' })), false);

  // The review nudge and the trial notice are built from the same markup and
  // put their own button under .kld-primary. One opens the Web Store, the
  // other opens checkout. A keystroke aimed at a sentence must not open either.
  is('a fix toast answers the shortcut',
     kiko.toastAcceptsKeyboard({ dataset: { kldFix: '1' } }), true);
  is('the review nudge does not',   kiko.toastAcceptsKeyboard({ dataset: {} }), false);
  is('the trial notice does not',   kiko.toastAcceptsKeyboard({ dataset: {} }), false);
  is('no toast at all does not',    kiko.toastAcceptsKeyboard(null), false);

  // A shortcut nobody is told about is not a feature. It is printed on the
  // button it presses, in symbols, so all seven locales read it the same.
  is('the shortcut is shown on the button', typeof kiko.ACCEPT_KEYS === 'string'
     && kiko.ACCEPT_KEYS.length > 0, true);
  const src = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
  const labelled = [...src.matchAll(/class="kld-btn kld-primary"[^>]*>\$\{escapeHtml\(detection\.btnLabel\)\}([^`]*?)<\/button>/g)];
  is('every fix button prints the shortcut', labelled.length, 2);
  for (const m of labelled) {
    is('  ...and it is the kbd hint', /kld-kbd">\$\{ACCEPT_KEYS\}/.test(m[1]), true);
  }
  // Both fix toasts must opt in, or the shortcut silently does nothing on one.
  is('both fix toasts mark themselves', (src.match(/dataset\.kldFix = '1'/g) || []).length, 2);
}

console.log('Two short Hebrew words do not veto a sentence of English');
{
  // Reported from the wild twice, and both times the same word. "מם' עם אם
  // איק מקסא כןסקד" is "now go to the next fixes" typed on a Hebrew keyboard.
  // Four of its six words convert to ordinary English — now, go, to, the — but
  // עם and אם are also real Hebrew words, and looksLikeRealHebrew vetoed the
  // whole sentence on the strength of those two.
  //
  // The guard is right to exist: it was added after a real Hebrew email was
  // offered up for conversion into gibberish, which is the worst thing this
  // extension can do. What was wrong was counting two-letter words as
  // evidence. Common short English words map onto common short Hebrew words
  // constantly — עם is the keys for "go", אם for "to", גם for "do".
  const CORPUS = require('./corpus.js');
  kiko.forgetLearned();
  kiko.setLangs({ ...ALL });
  kiko.setEntitled(true);
  kiko.longAfterAFix();

  check('the reported sentence fires', "מם' עם אם איק מקסא כןסקד",
        'hebrew_as_english', { converted: 'now go to the next fixes' });
  check('and the earlier report does too', 'סל ישמא אם נקעומ', 'hebrew_as_english');

  // The email the guard was written for. If this ever fires again, the trade
  // has been made the wrong way round.
  check('a real Hebrew email is never offered for conversion',
        'כמובן שאפשר גם יותר נמוך ללא לינה - תלוי מה התקציב', null);

  // And nothing else in the corpus either — this is the direction where a
  // mistake destroys someone's writing rather than merely annoying them.
  const offered = CORPUS.silent.he.filter(s => kiko.analyzeText(s) !== null);
  if (offered.length === 0) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${offered.length} real Hebrew sentences offered for conversion`);
    console.log(`        ${offered[0]}`);
  }

  // Long Hebrew words must still carry their full weight, or the guard is gone.
  check('three real Hebrew words still veto',  'שלום מה שלומך היום', null);
  check('and so does a short Hebrew sentence', 'תודה רבה על העזרה', null);
}

console.log('A run is not cut short by a word that only scores as English');
{
  // Reported from the wild, twice: "vhh nv akunl jcr?" offered only "היי מה"
  // and left "שלומך חבר?" behind as Latin. Converting half a sentence is worse
  // than converting none of it.
  //
  // englishScore divides by length - 1, so on a three-letter token a single
  // common bigram reads as 0.50 — and unmistakablyEnglish, added in 4.9.0 to
  // stop runs swallowing real English words, vetoes anything at 0.35. "jcr" is
  // חבר. That one bigram threw it out of its own run. A regression from 4.9.0.
  const span = (label, text, want) => {
    const d = kiko.analyzeText(text);
    const got = d ? d.original : null;
    if (got === want) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${JSON.stringify(want)}`);
    console.log(`        actual   ${JSON.stringify(got)}`);
  };
  kiko.forgetLearned();
  kiko.setLangs({ ...ALL });
  kiko.setEntitled(true);
  kiko.longAfterAFix();

  span('the whole greeting converts, not the first half',
       'vhh nv akunl jcr?', 'vhh nv akunl jcr?');
  check('and it converts to the right thing', 'vhh nv akunl jcr?',
        'english_as_hebrew', { converted: 'היי מה שלומך חבר?' });
  span('the same run inside an English sentence takes only its own words',
       'I said vhh nv akunl jcr to him', 'vhh nv akunl jcr');

  // A three-letter word joins as a bridge, not as a run of its own — so it can
  // extend a run but never create one. Two of them are still not a detection.
  span('a bridge word cannot start a run on its own', 'vhh jcr', null);
  check('and a lone Hebrew-looking word still never fires', 'jcr', null);

  // The 4.9.0 guard still has to do its job. This is the case it was added
  // for, and relaxing the score must not hand it back: "meeting" is a real
  // English word and stops the run dead, even with Hebrew on both sides.
  span('a real English word still stops a run',
       'vhh nv meeting jcr', 'vhh nv');
  span('and still does with more Hebrew behind it',
       'vhh nv meeting akunl jcr', 'vhh nv');
  check('genuine English is still silent',
        'i think the meeting was useful', null);

  // Why the length floor is there, and not only the vowel test. englishScore
  // divides by length - 1, so a two-letter token with one common bigram scores
  // a flat 1.00. These are among the most ordinary words in Hebrew, and every
  // one of them would be vetoed as English on the strength of that.
  const notEnglish = (he) => {
    const typed = kiko.fromHebrewKeys(he).replace(/[^a-z]/gi, '').toLowerCase();
    if (!kiko.unmistakablyEnglish(typed)) { pass++; return; }
    fail++;
    console.log(`  FAIL  "${he}" (typed "${typed}") is treated as English`);
  };
  for (const w of ['כן', 'יש', 'אין', 'רק', 'בוא', 'זה', 'לא', 'מה']) notEnglish(w);

  // And the guard still fires where it should: these are real English words of
  // four letters or more, with vowels, and they must stop a run.
  for (const w of ['meeting', 'sorry', 'quick', 'later', 'about']) {
    if (kiko.unmistakablyEnglish(w)) pass++;
    else { fail++; console.log(`  FAIL  "${w}" is not recognised as English`); }
  }
}

console.log('A keyboard table covers the whole keyboard, shift included');
{
  // The reverse tables were built by inverting the forward ones, and the
  // forward ones only ever declared the unshifted keys. Cyrillic and Greek
  // have case, so every sentence-initial letter and every proper noun had no
  // entry: "Привет" came back as "Пhbdtn", "Γεια σου" as "Γeia soy". Arabic is
  // not cased but keeps أ إ آ ذ on their own keys, and those were missing too.
  //
  // It made four of the six languages unmeasurable — a mistyped form that
  // still contains its own script is not what any keyboard produces — which is
  // why the quality suite scored them as clean for months.
  const CORPUS = require('./corpus.js');
  const clean = (label, code) => {
    const bad = CORPUS.silent[code].filter(s => /[^\x00-\x7F]/.test(kiko.down[code](s)));
    if (bad.length === 0) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${label}: ${bad.length} of ${CORPUS.silent[code].length} keep their own script`);
    console.log(`        ${bad[0]}\n          -> ${kiko.down[code](bad[0])}`);
  };
  for (const [code, name] of [['he','Hebrew'],['ru','Russian'],['uk','Ukrainian'],
                              ['ko','Korean'],['el','Greek'],['ar','Arabic']]) {
    clean(`${name} converts to keys a keyboard could produce`, code);
  }

  // And it has to survive the trip back, or the tables disagree with each other.
  // Letters only: punctuation cannot round-trip and is not meant to. A comma
  // is the ת key on a Hebrew keyboard and the б key on a Russian one, so
  // "typed" text containing one is genuinely ambiguous. Sentences carrying
  // Latin words are skipped for the same reason — convertTo* will map those
  // letters too, which is correct and not reversible.
  const trip = (label, code) => {
    const bad = CORPUS.silent[code]
      .map(s => s.replace(/[^\p{L} ]/gu, '').trim())
      .filter(s => s && !/[a-zA-Z]/.test(s))
      .filter(s => kiko.up[code](kiko.down[code](s)) !== s);
    if (bad.length === 0) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${label}: ${bad.length} do not survive the round trip`);
    console.log(`        ${bad[0]}\n          -> ${kiko.up[code](kiko.down[code](bad[0]))}`);
  };
  for (const [code, name] of [['he','Hebrew'],['ru','Russian'],['uk','Ukrainian'],
                              ['ko','Korean'],['el','Greek'],['ar','Arabic']]) {
    trip(`${name} round-trips`, code);
  }

  // The specific letters that were missing, named so a regression says why.
  const maps = (label, code, native, key) => {
    const got = kiko.down[code](native);
    if (got === key) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${label}: ${native} -> ${JSON.stringify(got)}, expected ${JSON.stringify(key)}`);
  };
  maps('capital Russian П',    'ru', 'П', 'G');
  maps('Russian ё',            'ru', 'ё', '`');
  maps('capital Russian Э',    'ru', 'Э', '"');   // э lives on the apostrophe
  maps('capital Ukrainian Я',  'uk', 'Я', 'Z');
  maps('capital Greek Γ',      'el', 'Γ', 'G');
  maps('capitalised Greek accent Έ', 'el', 'Έ', ';E');
  maps('Arabic أ',             'ar', 'أ', 'H');
  maps('Arabic ذ',             'ar', 'ذ', '`');
}

console.log('Real Greek is never offered up as English');
{
  // With the tables fixed, Case G1 lost the protection it had been getting by
  // accident — uppercase Greek used to survive conversion and trip its "no
  // Greek left" check. Six ordinary Greek sentences were offered as English.
  // The test that matters is whether the words are Greek words, not whether
  // the conversion completed.
  const CORPUS = require('./corpus.js');
  kiko.setLangs({ ...ALL });
  kiko.setEntitled(true);
  const fired = CORPUS.silent.el.filter(s => kiko.analyzeText(s) !== null);
  if (fired.length === 0) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${fired.length} correct Greek sentences are offered for conversion`);
    console.log(`        ${fired[0]}`);
  }
  // Each of the six, by name, so a loosened threshold says which it broke.
  for (const s of ['Θα σου στείλω το αρχείο αργότερα σήμερα',
                   'Τα παιδιά γυρίζουν από το σχολείο στις τέσσερις',
                   'Η συνάντηση αναβλήθηκε για αύριο το πρωί',
                   'Ας το συζητήσουμε στο τηλέφωνο αργότερα',
                   'Πόσο κοστίζει συνολικά με τα μεταφορικά',
                   'Θα τα πούμε αύριο στις οκτώ το βράδυ']) {
    if (kiko.analyzeText(s) === null) pass++;
    else { fail++; console.log(`  FAIL  offered to convert: ${s}`); }
  }
  // But English typed on a Greek keyboard must still be caught. Not every
  // sentence survives the rule — "please send me the file" happens to contain
  // με and φιλε once mapped, two real Greek words, and is silenced. That is
  // the measured cost: three sentences in fifty-five. So the floor is what is
  // pinned here, not any single example.
  check('English typed on a Greek keyboard still fires',
        kiko.up.el('i will review the document and get back to you'), 'greek_as_english');
  const caught = CORPUS.silent.en.filter(s => {
    const d = kiko.analyzeText(kiko.up.el(s));
    return d && d.lang === 'el';
  }).length;
  if (caught >= 30) pass++;
  else { fail++; console.log(`  FAIL  Greek catches only ${caught}/${CORPUS.silent.en.length} mistyped English sentences`); }
}

console.log('The language that explains the sentence wins, not the one asked first');
{
  // The passes ran in a fixed order and the first to match returned, so a
  // language that explained three words of a line beat one that explained all
  // of it purely by being asked earlier:
  //
  //   typed    Vj;tv kb vs yfpyfxbnm dcnhtxe yf cktle.otq ytltkt
  //   offered  לנ הד טכ                              (Hebrew, three words)
  //   Russian  назначить встречу на следующей неделе  (the whole line)
  //
  // Reordering only moves the problem to whoever is asked last, so the order
  // stopped deciding. Every enabled language is asked and the best answer
  // wins — best meaning the most real words in the language it claims, with
  // coverage settling ties. Coverage alone was the first attempt and was not
  // enough: Russian and Arabic each covered more of a Korean sentence than
  // Korean did, while producing pure noise.
  const CORPUS = require('./corpus.js');
  kiko.forgetLearned();
  kiko.setLangs({ ...ALL });
  kiko.setEntitled(true);
  kiko.longAfterAFix();

  check('Russian keeps the line Hebrew took three words of',
        'Vj;tv kb vs yfpyfxbnm dcnhtxe yf cktle.otq ytltkt',
        'english_as_russian',
        { converted: 'назначить встречу на следующей неделе' });
  check('Korean keeps a line Arabic covered more of',
        'rhoscksgdkdy rjrwjdgkwl dksgdmtueh ehlqslek',
        'english_as_korean', { converted: '괜찮아요 걱정하지' });

  // The ceiling. Every corpus sentence, mistyped, with all six languages on:
  // how many end up converted into a script the writer was not using. It was
  // 47 before this change and is 24 now. The number may only come down.
  const LANGS = ['he','ru','uk','ko','el','ar'];
  let usable = 0, wrong = 0;
  for (const code of LANGS) {
    for (const sentence of CORPUS.silent[code]) {
      const typed = kiko.down[code](sentence);
      if (/[^\x00-\x7F]/.test(typed)) continue;   // not a form a keyboard makes
      usable++;
      const d = kiko.analyzeText(typed);
      if (d && (d.lang || 'he') !== code) wrong++;
    }
  }
  if (wrong <= 24) pass++;
  else { fail++; console.log(`  FAIL  ${wrong} of ${usable} sentences go to the wrong language, ceiling is 24`); }
  if (usable >= 159) pass++;
  else { fail++; console.log(`  FAIL  only ${usable} sentences are measurable, expected 159`); }
}

console.log('Each language keeps its own text when all six are enabled');
{
  // The English→X passes run in order and the first match wins, so the order
  // decides who gets to claim ambiguous letters. Korean was asked last, after
  // Arabic and Russian, and lost ten of thirty-four corpus sentences to them —
  // a Korean speaker being offered their own greeting rewritten in Arabic.
  // That is not a miss, it is a confident wrong answer, and accepting it
  // destroys the sentence.
  //
  // Korean now goes first, because its test is the only structural one: every
  // keystroke must land inside a complete Hangul syllable. Arabic and Greek
  // are the loosest — nearly every QWERTY key maps to something — so they are
  // asked last.
  const claims = (label, typed, wantType) => {
    kiko.setLangs({ ...ALL });
    const d = kiko.analyzeText(typed);
    const got = d ? d.type : null;
    if (got === wantType) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${label}`);
    console.log(`        ${JSON.stringify(typed)}`);
    console.log(`        expected ${wantType}, got ${got}` +
                (d ? `  -> ${JSON.stringify(d.converted)}` : ''));
  };
  kiko.forgetLearned();
  kiko.setEntitled(true);
  kiko.longAfterAFix();

  // Every one of these was claimed by Arabic or Russian before the reorder.
  claims('a Korean greeting is not Arabic',
         'dkssudgktpdy dhsmf djEjgrp wlsotpdy', 'english_as_korean');
  claims('nor is a Korean sentence about a file',
         'vkdlfdms dhsmf wjsurdp qhsoemflrpTtmqslek', 'english_as_korean');
  claims('a Korean thank-you is not Russian',
         'ehdhkwntutj wjdakf rkatkgkqslek', 'english_as_korean');
  claims('nor is a Korean question',
         'ekdma wndp ghldmlfmf wkqdmf tn dlTdmfRkdy', 'english_as_korean');

  // And asking Korean first must not let it claim anyone else's.
  claims('Russian stays Russian', 'ghbdtn rfr ltkf ctujlyz', 'english_as_russian');
  claims('Russian stays Russian, second sample',
         'cgfcb,j ,jkmijt pf gjvjom', 'english_as_russian');
  claims('Greek stays Greek',   'geia soy ti kaneiw shmera', 'english_as_greek');
  claims('Greek stays Greek, second sample',
         'eyxaristv poly gia th bohueia', 'english_as_greek');
  claims('Hebrew stays Hebrew', 'akuo nv akunl vhuo', 'english_as_hebrew');
  claims('Hebrew stays Hebrew, second sample',
         'tbh atkj kl t, veuc', 'english_as_hebrew');
  claims('Arabic stays Arabic', 'a;vh [.dgh ugn hglshu]m', 'english_as_arabic');
}

console.log('Korean phrases are one word, and one word is enough');
{
  // Kiko needs a run of two words before it fires, which is right for Hebrew
  // and Russian and wrong for Korean: 안녕하세요, 감사합니다 and 알겠습니다 are
  // each a single token. The four most common things a Korean types were all
  // silent, and the corpus never caught it because every Korean sentence in it
  // had spaces. Found while preparing a campaign aimed at Korea.
  const fires = (label, text, want) => {
    const got = kiko.analyzeText(text) !== null;
    if (got === want) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${want ? 'a detection' : 'silence'} for ${JSON.stringify(text)}`);
  };
  kiko.forgetLearned();
  kiko.setLangs({ ...ALL });
  kiko.setEntitled(true);
  kiko.longAfterAFix();

  // Typed forms generated by the engine's own inverse, not by hand — the first
  // attempt at these tests failed on romanisation the author got wrong, not on
  // the code. ㅆ is Shift+T, which is why the capitals are load-bearing.
  for (const [typed, meant] of [
    ['dkssudgktpdy',   '안녕하세요'],
    ['rkatkgkqslek',   '감사합니다'],
    ['dkfrpTtmqslek',  '알겠습니다'],
    ['ahfmrpTdjdy',    '모르겠어요'],
    ['tnrhgktuTtmqslek', '수고하셨습니다'],
    ['ghkrdlsgoTtmqslek', '확인했습니다'],
  ]) {
    fires(`"${meant}" on its own fires`, typed, true);
    const d = kiko.analyzeText(typed);
    if (d && d.converted === meant) pass++;
    else {
      fail++;
      console.log(`  FAIL  "${meant}" converts back wrong`);
      console.log(`        got ${d ? JSON.stringify(d.converted) : 'nothing'}`);
    }
  }

  // The two calibration points. Both scores are tuned for short words and both
  // get long romanisations wrong: 보냈습니다 reads as 0.36 English, just over
  // the 0.35 rejection line, and 모르겠어요 scores 0.40 Korean, just under the
  // 0.5 acceptance line. Neither is an unusual thing to write.
  fires('a phrase that reads as 0.36 English still fires', 'qhsoTtmqslek', true);
  fires('a phrase scoring 0.40 Korean still fires',        'ahfmrpTdjdy',  true);

  // A short token stays silent. "sp" is 네, and two letters is not evidence.
  fires('two letters are never enough', 'sp', false);
  fires('nor is a single short syllable pair', 'dk', false);

  // The guard is four syllables, so a two-syllable word still needs a
  // neighbour — otherwise every short Latin token becomes a candidate.
  fires('a two-syllable word alone stays silent', 'vkdlf', false);
  fires('but it fires next to another',           'vkdlf qhsoTtmqslek', true);

  // None of this may cost the other languages, or English.
  fires('real English is still silent',  'please send me the file tomorrow', false);
  fires('a long English word is silent', 'internationalization', false);
  fires('a url is silent',               'https://github.com/anthropics', false);
  fires('real Korean is left alone',     '안녕하세요 오늘 어떻게 지내세요', false);
}

console.log('Kiko keeps working in the seconds after a fix');
{
  // The single largest source of "Kiko didn't fire". Accepting a fix put the
  // detector into a fifteen-second strict mode that switched off all word
  // scoring and left only final-form violations — which short text rarely has.
  // Measured, that silenced about half of the phrases people actually type
  // into a chat box, for fifteen seconds after every single fix. Someone
  // typing fast in two languages spends most of their session inside that
  // window, which is exactly the person Kiko is for.
  const fires = (label, text, want) => {
    const got = kiko.analyzeText(text) !== null;
    if (got === want) { pass++; return; }
    fail++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${want ? 'a detection' : 'silence'} for ${JSON.stringify(text)}`);
  };

  kiko.forgetLearned();
  kiko.setLangs({ he: true, ru: true, uk: true, ko: true, el: true, ar: true });
  kiko.setEntitled(true);

  const he = s => kiko.toHebrewKeys(s);   // English typed on a Hebrew keyboard

  for (const phrase of ['ok thanks', 'call me', 'not sure', 'on my way',
                        'give me a sec', 'maybe if we agree']) {
    kiko.longAfterAFix();
    fires(`"${phrase}" fires normally`, he(phrase), true);
    kiko.afterAFix();
    fires(`"${phrase}" still fires right after a fix`, he(phrase), true);
  }
  kiko.longAfterAFix();

  // What the window is actually for. One word is genuinely ambiguous straight
  // after a conversion — בוא is a real Hebrew word and also the keys for
  // "cut" — so the single-word trigger stays held back. Two words do not have
  // that problem, which is why the rule belongs on the fast path alone.
  kiko.afterAFix();
  fires('a lone word waits out the window', he('thanks'), false);
  kiko.longAfterAFix();
  fires('and fires once the window closes', he('thanks'), true);

  // The window has to be short enough to be over before the next sentence.
  if (kiko.STRICT_MS > 0 && kiko.STRICT_MS <= 5000) pass++;
  else { fail++; console.log(`  FAIL  the window is ${kiko.STRICT_MS}ms — seconds, not fifteen of them`); }

  // The reason the blanket rule existed: never undo the fix just applied. That
  // job belongs to lastCase2Original, so removing the blanket must not hand it
  // back. The direction matters — the risk is a Case 2 fix (Latin keys meaning
  // Hebrew, converted to Hebrew) that Case 1 then wants to read straight back
  // as Latin. Testing it with Hebrew-keys-meaning-English proves nothing,
  // because that path never sets the guard at all.
  const undone = [];
  for (const typed of ['akuo nv akunl', 'akuo ekhu vurt',
                       'vhahcv ,,ehho cjsr vhahcu, ceunv vabhhv']) {
    kiko.longAfterAFix();
    const d = kiko.analyzeText(typed);
    if (!d) { fail++; console.log(`  FAIL  nothing to fix in ${JSON.stringify(typed)}`); continue; }
    if (!d.type.startsWith('english_as_')) {
      fail++;
      console.log(`  FAIL  ${JSON.stringify(typed)} is ${d.type}, not the direction the guard covers`);
      continue;
    }
    const after = typed.replace(d.original, d.converted);
    kiko.longAfterAFix();
    kiko.rememberCase2(d.original);
    kiko.afterAFix();
    fires(`the fix of ${JSON.stringify(typed)} is not immediately undone`, after, false);
    undone.push(after);
  }
  kiko.longAfterAFix();

  // Real Hebrew is still left alone inside the window — the whole point of
  // narrowing rather than deleting.
  for (const real of ['שלום מה שלומך היום', 'אני חושב שזה רעיון טוב',
                      'בוא נדבר על זה מחר בבוקר']) {
    kiko.afterAFix();
    fires('real Hebrew stays untouched in the window', real, false);
  }
  kiko.longAfterAFix();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
