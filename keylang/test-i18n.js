// Every key the extension asks for must exist in the default locale, and
// every key any locale defines must be asked for somewhere. Both directions
// matter: the first catches a blank button, the second catches translations
// written and never wired up.
//
// Other locales are allowed to define a subset. Chrome falls back to
// default_locale for anything they omit, which is exactly how a language can
// ship a translated store listing while its interface stays English. What
// they may not do is define a key the default locale lacks — that key would
// have nothing to fall back to.
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const LOCALES = fs.readdirSync(path.join(HERE, '_locales')).sort();
const SOURCES = ['content.js', 'popup.js', 'welcome.js', 'whats-new.js',
                 'background.js', 'popup.html', 'welcome.html', 'whats-new.html'];

let pass = 0, fail = 0;
const bad = (msg) => { fail++; console.log('  FAIL  ' + msg); };
const ok  = () => { pass++; };

// Keys referenced from code: t('key'  /  getMessage('key'
// Keys referenced from markup: data-i18n="key|…", data-i18n-html, -placeholder, -title
const used = new Set();
const quoted = new Set();
for (const f of SOURCES) {
  const src = fs.readFileSync(path.join(HERE, f), 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g))            used.add(m[1]);
  for (const m of src.matchAll(/getMessage\(\s*'([A-Za-z0-9_]+)'/g))     used.add(m[1]);
  for (const m of src.matchAll(/data-i18n(?:-html)?="([A-Za-z0-9_]+)/g)) used.add(m[1]);
  for (const m of src.matchAll(/data-i18n-(?:placeholder|title)="([A-Za-z0-9_]+)"/g)) used.add(m[1]);
  // Nested substitutions: data-i18n="learnedFor|__langHebrew__"
  for (const m of src.matchAll(/__([A-Za-z0-9_]+)__/g))                  used.add(m[1]);
  // Keys held in a lookup table rather than passed to t() directly, e.g.
  // LANG_MSG_KEY maps a detected language name onto 'langHebrew'. Any quoted
  // string that happens to be a catalogue key counts as a reference; over-
  // counting here only ever costs us a missed cleanup, never a blank button.
  for (const m of src.matchAll(/'([A-Za-z0-9_]+)'/g))                    quoted.add(m[1]);
}
// Read by Chrome itself rather than by our code.
['extName', 'extDescription', 'uiDir'].forEach(k => used.add(k));

console.log(`Locales: ${LOCALES.join(', ')}`);
console.log(`Keys referenced: ${used.size}`);

const catalogues = {};
for (const code of LOCALES) {
  catalogues[code] = JSON.parse(
    fs.readFileSync(path.join(HERE, '_locales', code, 'messages.json'), 'utf8'));
}

const DEFAULT = 'en';

console.log(`Every referenced key exists in the default locale (${DEFAULT})`);
for (const key of [...used].sort()) {
  if (catalogues[DEFAULT][key]) ok();
  else bad(`${DEFAULT} is missing "${key}" — nothing to fall back to`);
}

console.log('No locale defines a key the default locale lacks');
for (const code of LOCALES.filter(c => c !== DEFAULT)) {
  for (const key of Object.keys(catalogues[code])) {
    if (catalogues[DEFAULT][key]) ok();
    else bad(`${code} defines "${key}", which ${DEFAULT} does not`);
  }
}

console.log('Every locale carries the two strings the Web Store reads');
for (const code of LOCALES) {
  for (const key of ['extName', 'extDescription']) {
    if (catalogues[code][key]) ok();
    else bad(`${code} has no ${key} — the store listing for that language would be blank`);
  }
}

// A locale that ships an interface must ship all of it. Half a translated
// popup reads worse than none of it.
console.log('A locale with interface strings has the complete set');
const fullSet = Object.keys(catalogues[DEFAULT]).sort();
for (const code of LOCALES.filter(c => c !== DEFAULT)) {
  const keys = Object.keys(catalogues[code]).sort();
  const listingOnly = keys.length === 2;
  if (listingOnly || keys.join(',') === fullSet.join(',')) ok();
  else bad(`${code} has ${keys.length} keys — neither listing-only (2) nor complete (${fullSet.length})`);
}

console.log('Every defined key is actually used');
for (const key of Object.keys(catalogues[DEFAULT]).sort()) {
  if (used.has(key) || quoted.has(key)) ok();
  else bad(`"${key}" is translated in all locales but referenced nowhere`);
}

console.log('Placeholders are declared wherever a $NAME$ is used');
for (const code of LOCALES) {
  for (const [key, entry] of Object.entries(catalogues[code])) {
    const names = [...entry.message.matchAll(/\$([A-Z]+)\$/g)].map(m => m[1].toLowerCase());
    const declared = Object.keys(entry.placeholders || {});
    const missing = names.filter(n => !declared.includes(n));
    if (missing.length) bad(`${code} "${key}" uses $${missing[0].toUpperCase()}$ with no placeholder — Chrome renders it literally`);
    else ok();
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
