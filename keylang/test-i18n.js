// Every key the extension asks for must exist in every locale, and every key
// a locale defines must be asked for somewhere. Both directions matter: the
// first catches a blank button in a language nobody here reads, the second
// catches translations paid for and never wired up.
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

console.log('Every referenced key exists in every locale');
for (const key of [...used].sort()) {
  for (const code of LOCALES) {
    if (catalogues[code][key]) ok();
    else bad(`${code} is missing "${key}"`);
  }
}

console.log('Every defined key is actually used');
for (const key of Object.keys(catalogues[LOCALES[0]]).sort()) {
  if (used.has(key) || quoted.has(key)) ok();
  else bad(`"${key}" is translated in all locales but referenced nowhere`);
}

console.log('Locales agree on which keys exist');
const base = Object.keys(catalogues[LOCALES[0]]).sort().join(',');
for (const code of LOCALES.slice(1)) {
  if (Object.keys(catalogues[code]).sort().join(',') === base) ok();
  else bad(`${code} has a different set of keys from ${LOCALES[0]}`);
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
