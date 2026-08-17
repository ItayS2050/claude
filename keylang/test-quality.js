#!/usr/bin/env node
/**
 * Detection quality benchmark.  Run:  node test-quality.js
 *
 * test-detection.js proves that things which once broke stay fixed. Every case
 * in it was chosen after the fact, so it cannot say how good detection is. This
 * measures instead, over the corpus in corpus.js.
 *
 * Four numbers, in the order they matter:
 *
 *   FALSE POSITIVES  correct text Kiko offers to convert. The expensive
 *                    mistake: turning what somebody wrote into gibberish in
 *                    front of them. This is a gate, not a score — a release
 *                    that breaches it does not ship whatever else improved.
 *
 *   SPAN ACCURACY    of the detections that fire, how many replace exactly the
 *                    words the user mistyped and nothing else. Detecting
 *                    correctly and then converting one word too far still
 *                    destroys a word they typed on purpose.
 *
 *   RECALL           genuine wrong-layout text that Kiko notices. Missing one
 *                    costs a shrug.
 *
 *   LATENCY          per analyzeText call. Runs on every debounce fire.
 *
 * The headline is F-beta with beta = 0.3, which weights precision about eleven
 * times recall. F1 would be the wrong summary here: it treats a destroyed
 * sentence and a missed correction as equally bad, and they are not.
 *
 * Reported per language, never only in aggregate — a six-language average
 * hides the weakest one, which is the one that loses users.
 *
 * Exits non-zero only if the false-positive gate is breached. Everything else
 * is a number to watch, not a pass or fail.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const CORPUS = require('./corpus.js');

// Breach this and the build is not shippable, whatever else improved.
const FP_GATE = 0.005;   // 0.5% of correct text
const BETA    = 0.3;     // precision weighted ~11x recall

function load() {
  let src = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
  src = src.replace('(()=>{', '');
  src = src.slice(0, src.lastIndexOf('})(); // end IIFE'));
  const sandbox = {
    chrome: {
      runtime: { getManifest: () => ({ version: 'test' }), sendMessage: () => ({ catch() {} }),
                 id: 'test', onMessage: { addListener() {} } },
      storage: { local: { get: async () => ({}), set: async () => {} },
                 onChanged: { addListener() {} } },
    },
    window: { location: { hostname: 'test' }, addEventListener() {}, getSelection: () => null },
    document: { addEventListener() {}, querySelectorAll: () => [], body: null, documentElement: {},
                createElement: () => ({ style: {}, addEventListener() {},
                                        querySelector: () => ({ addEventListener() {} }) }),
                hasFocus: () => true, activeElement: null },
    navigator: { userAgent: 'test' },
    MutationObserver: class { observe() {} disconnect() {} },
    setInterval: () => 0, setTimeout: () => 0, clearTimeout() {},
    requestAnimationFrame: () => 0, console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return vm.runInContext(
    '(function () {\n' + src +
    '\nreturn { analyzeText,' +
    '         setLangs: o => { enabledLangs = o; },' +
    '         setEntitled: v => { entitled = v; },' +
    '         reject: ws => ws.forEach(w => learnedEnglish.add(w)),' +
    '         forget: () => { learnedEnglish.clear(); },' +
    '         fromHebrew: convertToEnglish, fromRussian: convertFromRussian,' +
    '         fromUkrainian: convertFromUkrainian, fromKorean: convertFromKorean,' +
    '         fromGreek: convertFromGreek, fromArabic: convertFromArabic };\n})()',
    sandbox);
}

const kiko = load();
kiko.setLangs({ he: true, ru: true, uk: true, ko: true, el: true, ar: true });
kiko.setEntitled(true);

const LANGS   = ['he', 'ru', 'uk', 'ko', 'el', 'ar'];
const NAMES   = { he: 'Hebrew', ru: 'Russian', uk: 'Ukrainian', ko: 'Korean',
                  el: 'Greek', ar: 'Arabic' };
const MISTYPE = { he: 'fromHebrew', ru: 'fromRussian', uk: 'fromUkrainian',
                  ko: 'fromKorean', el: 'fromGreek', ar: 'fromArabic' };

const pct  = n => (100 * n).toFixed(1).padStart(5) + '%';
const fbeta = (p, r) => (p + r === 0) ? 0
  : (1 + BETA * BETA) * p * r / (BETA * BETA * p + r);

// ── Per language: does it fire on mistyped text, stay silent on correct? ──
const rows = [];
for (const code of LANGS) {
  const correct = CORPUS.silent[code];
  const typed   = correct.map(s => kiko[MISTYPE[code]](s));

  const tp = typed.filter(t => kiko.analyzeText(t) !== null).length;
  const fn = typed.length - tp;
  const fp = correct.filter(s => kiko.analyzeText(s) !== null).length;
  const tn = correct.length - fp;

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall    = tp + fn === 0 ? 1 : tp / (tp + fn);
  rows.push({ code, tp, fp, tn, fn, precision, recall, f: fbeta(precision, recall) });
}

// ── Correct text of every other kind. All of it must be silent. ──────────
const OTHER = ['en', 'mixed', 'names', 'urls', 'emails', 'technical', 'code',
               'abbreviations', 'slang', 'short'];
const otherRows = OTHER.map(kind => {
  const set = CORPUS.silent[kind];
  const fp  = set.filter(s => kiko.analyzeText(s) !== null);
  return { kind, n: set.length, fp: fp.length, examples: fp.slice(0, 2) };
});

// ── Span accuracy: of what fires, does it replace the right words? ───────
const spanResults = CORPUS.spans.map(c => {
  const d = kiko.analyzeText(c.typed);
  const got = d ? d.original : null;
  return { ...c, got, ok: got === c.expect };
});

console.log('\n' + '═'.repeat(64));
console.log('  Kiko detection quality');
console.log('═'.repeat(64));

console.log('\nPer language — mistyped text should fire, correct text should not\n');
console.log('              TP   FP   TN   FN   precision  recall   Fβ(0.3)');
console.log('─'.repeat(64));
for (const r of rows) {
  console.log(
    NAMES[r.code].padEnd(11) +
    String(r.tp).padStart(4) + String(r.fp).padStart(5) +
    String(r.tn).padStart(5) + String(r.fn).padStart(5) +
    pct(r.precision).padStart(11) + pct(r.recall).padStart(9) +
    pct(r.f).padStart(10));
}
const agg = rows.reduce((a, r) => ({
  tp: a.tp + r.tp, fp: a.fp + r.fp, tn: a.tn + r.tn, fn: a.fn + r.fn }),
  { tp: 0, fp: 0, tn: 0, fn: 0 });
const aggP = agg.tp / (agg.tp + agg.fp || 1);
const aggR = agg.tp / (agg.tp + agg.fn || 1);
console.log('─'.repeat(64));
console.log('all'.padEnd(11) +
  String(agg.tp).padStart(4) + String(agg.fp).padStart(5) +
  String(agg.tn).padStart(5) + String(agg.fn).padStart(5) +
  pct(aggP).padStart(11) + pct(aggR).padStart(9) + pct(fbeta(aggP, aggR)).padStart(10));

console.log('\nCorrect text of other kinds — every one of these must be silent\n');
let otherN = 0, otherFP = 0;
for (const r of otherRows) {
  otherN += r.n; otherFP += r.fp;
  const flag = r.fp ? '  ← FIRED' : '';
  console.log(`  ${r.kind.padEnd(15)} ${String(r.n).padStart(3)} sentences   ${String(r.fp).padStart(2)} false positives${flag}`);
  for (const ex of r.examples) {
    const d = kiko.analyzeText(ex);
    console.log(`      ${ex}`);
    console.log(`         -> ${d.converted}`);
  }
}

console.log('\nSpan accuracy — does the fix replace exactly the mistyped words\n');
for (const r of spanResults) {
  const mark = r.ok ? ' ok ' : 'WRONG';
  console.log(`  [${mark}] ${r.typed}`);
  if (!r.ok) {
    console.log(`           expected: ${r.expect === null ? '(silence)' : JSON.stringify(r.expect)}`);
    console.log(`           got     : ${r.got === null ? '(silence)' : JSON.stringify(r.got)}`);
  }
}
const spanOK = spanResults.filter(r => r.ok).length;

// ── Learned exceptions behave as promised ────────────────────────────────
kiko.forget();
kiko.reject(CORPUS.learned.reject);
const learnedSilent = CORPUS.learned.thenSilent.filter(t => kiko.analyzeText(t) === null).length;
const learnedFires  = CORPUS.learned.thenStillFires.filter(t => kiko.analyzeText(t) !== null).length;
kiko.forget();

// ── Latency ──────────────────────────────────────────────────────────────
function timeOf(text, iters = 500) {
  for (let i = 0; i < 200; i++) kiko.analyzeText(text);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) kiko.analyzeText(text);
  return Number(process.hrtime.bigint() - t0) / 1e6 / iters;
}
const lat = {
  'short (5 words)':      timeOf('akuo nv akunl vhuo ekhu'),
  'typical (25 words)':   timeOf(Array(5).fill('akuo nv akunl vhuo ekhu').join(' ')),
  'english paragraph':    timeOf(CORPUS.long.en),
  'hebrew paragraph':     timeOf(CORPUS.long.he),
};

console.log('\nLearned exceptions\n');
console.log(`  after rejecting ${JSON.stringify(CORPUS.learned.reject)}:`);
console.log(`    silent as promised   ${learnedSilent}/${CORPUS.learned.thenSilent.length}`);
console.log(`    other languages fine ${learnedFires}/${CORPUS.learned.thenStillFires.length}`);

console.log('\nLatency per analyzeText call\n');
for (const [k, v] of Object.entries(lat)) {
  console.log(`  ${k.padEnd(22)} ${v.toFixed(3)} ms`);
}

// ── Verdict ──────────────────────────────────────────────────────────────
const totalCorrect = rows.reduce((a, r) => a + r.tn + r.fp, 0) + otherN;
const totalFP      = agg.fp + otherFP;
const fpRate       = totalFP / totalCorrect;

console.log('\n' + '═'.repeat(64));
console.log(`  Fβ(0.3)          ${pct(fbeta(aggP, aggR))}`);
console.log(`  span accuracy    ${spanOK}/${spanResults.length}`);
console.log(`  false positives  ${totalFP} of ${totalCorrect} correct sentences  (${pct(fpRate)})`);
console.log(`  gate             ${(FP_GATE * 100).toFixed(1)}%  ${fpRate <= FP_GATE ? 'PASS' : 'BREACHED'}`);
console.log('═'.repeat(64));
console.log('\nCorpus is written, not harvested. Numbers are a floor, not a truth.\n');

process.exit(fpRate <= FP_GATE ? 0 : 1);
