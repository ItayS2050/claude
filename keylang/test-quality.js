#!/usr/bin/env node
/**
 * Detection quality benchmark.  Run:  node test-quality.js
 *
 * test-detection.js proves that things which once broke stay fixed. It cannot
 * say how good detection actually is, because every case in it was chosen after
 * the fact. This measures instead, and prints two numbers per language:
 *
 *   FALSE POSITIVES — ordinary correct text that Kiko offers to convert.
 *     The one that matters. Firing here means offering to turn what somebody
 *     wrote into gibberish, in front of them, mid-sentence.
 *
 *   RECALL — text genuinely typed on the wrong layout that Kiko notices.
 *     Missing one costs nothing but a shrug. Missing most of them means the
 *     extension does not work.
 *
 * The mistyped text is generated from the same sentences by running them
 * through the extension's own layout maps, which is exactly what a keyboard
 * produces when the layout is wrong. It shares those tables with the code under
 * test, so it measures whether detection notices — not whether the conversion
 * is correct. test-detection.js covers that separately.
 *
 * This exits 0 whatever it finds. It is a measurement, not a gate: the point is
 * to watch the numbers move.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const CORPUS = require('./corpus.js');

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
    '         fromHebrew: convertToEnglish, fromRussian: convertFromRussian,' +
    '         fromUkrainian: convertFromUkrainian, fromKorean: convertFromKorean,' +
    '         fromGreek: convertFromGreek, fromArabic: convertFromArabic };\n})()',
    sandbox);
}

const kiko = load();
kiko.setLangs({ he: true, ru: true, uk: true, ko: true, el: true, ar: true });
kiko.setEntitled(true);

const NAMES = { he: 'Hebrew', ru: 'Russian', uk: 'Ukrainian', ko: 'Korean',
                el: 'Greek', ar: 'Arabic', en: 'English' };
const MISTYPE = { he: 'fromHebrew', ru: 'fromRussian', uk: 'fromUkrainian',
                  ko: 'fromKorean', el: 'fromGreek', ar: 'fromArabic' };

const pct = (n, of) => of === 0 ? '  —  ' : (100 * n / of).toFixed(1).padStart(5) + '%';
const rows = [];
let worstFP = null;

for (const [code, sentences] of Object.entries(CORPUS)) {
  // Correct text. Every hit here is Kiko offering to destroy something.
  const fp = sentences.filter(s => kiko.analyzeText(s) !== null);
  let hit = null, total = 0;
  if (MISTYPE[code]) {
    // The same sentences as the keyboard would have produced with the wrong
    // layout on. Every miss is a mistake Kiko failed to catch.
    const typed = sentences.map(s => kiko[MISTYPE[code]](s));
    total = typed.length;
    hit = typed.filter(t => kiko.analyzeText(t) !== null).length;
  }
  rows.push({ code, n: sentences.length, fp: fp.length, hit, total, examples: fp.slice(0, 3) });
  if (fp.length && (!worstFP || fp.length / sentences.length > worstFP.rate)) {
    worstFP = { code, rate: fp.length / sentences.length };
  }
}

console.log('\nDetection quality — seed corpus, written not collected\n');
console.log('language     n   false positives      recall');
console.log('─'.repeat(52));
for (const r of rows) {
  const fpCell  = `${String(r.fp).padStart(3)} ${pct(r.fp, r.n)}`;
  const recCell = r.hit === null ? '     n/a' : `${String(r.hit).padStart(3)} ${pct(r.hit, r.total)}`;
  console.log(`${NAMES[r.code].padEnd(10)} ${String(r.n).padStart(3)}   ${fpCell}    ${recCell}`);
}

const totalN  = rows.reduce((a, r) => a + r.n, 0);
const totalFP = rows.reduce((a, r) => a + r.fp, 0);
console.log('─'.repeat(52));
console.log(`${'all'.padEnd(10)} ${String(totalN).padStart(3)}   ${String(totalFP).padStart(3)} ${pct(totalFP, totalN)}`);

const offenders = rows.filter(r => r.fp);
if (offenders.length) {
  console.log('\nText Kiko offered to convert, which it should have left alone:');
  for (const r of offenders) {
    for (const ex of r.examples) {
      const d = kiko.analyzeText(ex);
      console.log(`  [${r.code}] ${ex}`);
      console.log(`         -> ${d.type}: ${d.converted}`);
    }
  }
}

const missed = rows.filter(r => r.hit !== null && r.hit < r.total);
if (missed.length) {
  console.log('\nMistyped text Kiko did not notice (first few per language):');
  for (const r of missed) {
    const typed = CORPUS[r.code].map(s => kiko[MISTYPE[r.code]](s));
    typed.filter(t => kiko.analyzeText(t) === null).slice(0, 3)
      .forEach(t => console.log(`  [${r.code}] ${t}`));
  }
}

console.log('\nSeed data: these sentences were written, not collected from users.');
console.log('Replace any block in corpus.js with real text to sharpen the numbers.\n');
