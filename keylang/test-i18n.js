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

console.log('Nothing in the extension can send typed text anywhere');
{
  // The published promise — "your typing never leaves your computer", on the
  // site in six languages and in the store listing — used to be kept by one
  // empty string constant in content.js. sendFeedback() would have posted up
  // to fifteen typed words to whatever URL that constant held. It held "", so
  // nothing was ever sent, but a promise that survives only because nobody
  // filled in a blank is not a guarantee. Removed in 4.9.0; this keeps it out.
  const shipped = fs.readFileSync(path.join(HERE, 'build.sh'), 'utf8')
    .match(/FILES=\(([\s\S]*?)\)/)[1]
    .split(/\s+/).filter(f => f.endsWith('.js'));

  // content.js sees every keystroke on every page. It must not be able to
  // reach the network at all — not directly, and not by asking the background
  // to fetch a URL on its behalf, which is exactly how the old path worked.
  const content = fs.readFileSync(path.join(HERE, 'content.js'), 'utf8');
  for (const [label, re] of [
    ['fetch',            /\bfetch\s*\(/],
    ['XMLHttpRequest',   /XMLHttpRequest/],
    ['sendBeacon',       /sendBeacon/],
    ['WebSocket',        /new\s+WebSocket/],
    ['EventSource',      /new\s+EventSource/],
    ['a url in a message', /sendMessage\s*\(\s*\{[^}]*\burl\s*:/],
  ]) {
    if (!re.test(content)) ok();
    else bad(`content.js can reach the network via ${label} — it sees every keystroke and must not`);
  }

  // Nowhere may forward an arbitrary URL handed to it. The old background
  // handler did `fetch(msg.url, ...)`, which turned the service worker into a
  // relay for anything a content script asked it to send.
  for (const name of shipped) {
    const src = fs.readFileSync(path.join(HERE, name), 'utf8');
    if (!/fetch\s*\(\s*msg\./.test(src)) ok();
    else bad(`${name} fetches a URL taken from a message — that is a relay for arbitrary data`);
  }

  // The only destination the extension may talk to is the licence provider,
  // and the only thing it may carry is a licence key.
  const bg = fs.readFileSync(path.join(HERE, 'background.js'), 'utf8');
  const targets = [...bg.matchAll(/fetch\(([^,)]+)/g)].map(m => m[1].trim());
  for (const t of targets) {
    if (/^LICENCE_PROVIDER\.\w+Url$/.test(t)) ok();
    else bad(`background.js fetches ${t}, which is not a LICENCE_PROVIDER endpoint`);
  }
  if (targets.length) ok();
  else bad('expected the licence calls to still be present');
}

console.log('Kiko only watches languages it has been told about');
{
  // The default used to be all six on, and Skip wrote all six explicitly.
  // Measured over the corpus, every language alone scores 123 right and 0
  // wrong; all six together score 114 right and 24 wrong. A language running
  // that you never type interferes with the ones you do, so nothing is on
  // until the person says so — with Chrome's own language list as the guess
  // in between.
  const content = fs.readFileSync(path.join(HERE, 'content.js'), 'utf8');
  const welcome = fs.readFileSync(path.join(HERE, 'welcome.js'), 'utf8');
  const popupJs = fs.readFileSync(path.join(HERE, 'popup.js'), 'utf8');

  if (/let enabledLangs\s*=\s*langsFromBrowser\(\)/.test(content)) ok();
  else bad('content.js still defaults to a hard-coded set of languages');

  if (/navigator\.languages/.test(content)) ok();
  else bad('content.js does not consult the browser language list');

  // Skip must record nothing at all. Writing every language was the bug.
  const skip = welcome.slice(welcome.indexOf("getElementById('skip-btn')"));
  if (!/enabledLangs/.test(skip.slice(0, 400))) ok();
  else bad('the Skip button still writes enabledLangs');

  // And the label has to match what the button does.
  const en = JSON.parse(fs.readFileSync(path.join(HERE, '_locales/en/messages.json'), 'utf8'));
  if (!/enable all/i.test(en.welcomeSkip.message)) ok();
  else bad(`the Skip label still promises to enable all languages: ${en.welcomeSkip.message}`);

  // Somebody who skipped is running on a guess, so the popup keeps asking.
  if (/pick-langs/.test(popupJs) && /!data\.enabledLangs/.test(popupJs)) ok();
  else bad('the popup does not ask the people who skipped');
  const popupHtml = fs.readFileSync(path.join(HERE, 'popup.html'), 'utf8');
  if (/id="pick-langs"/.test(popupHtml)) ok();
  else bad('popup.html has no language prompt to show');
}

console.log('Every message send handles the receiver being gone');
{
  // "Unchecked runtime.lastError: Could not establish connection. Receiving end
  // does not exist." An orphaned content script — left in an open tab after the
  // extension reloads — has no background left to answer it. Nothing breaks,
  // but Chrome posts a red error on the extension's own page, which reviewers
  // read. Every send needs either a .catch or a callback that reads lastError.
  // Every script build.sh ships, so a new one cannot quietly escape the rule.
  const FILES = fs.readFileSync(path.join(HERE, 'build.sh'), 'utf8')
    .match(/FILES=\(([\s\S]*?)\)/)[1]
    .split(/\s+/).filter(f => f.endsWith('.js'));
  for (const name of FILES) {
    const file = path.join(HERE, name);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const re = /chrome\.(runtime|tabs)\.sendMessage\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
      // Take the call plus a little of what follows: enough to see a .catch()
      // chained on, or a callback that touches lastError.
      const tail = src.slice(m.index, m.index + 900);
      const guarded = /\.catch\s*\(/.test(tail) || /lastError/.test(tail);
      if (guarded) ok();
      else bad(`${name} line ${src.slice(0, m.index).split('\n').length}: sendMessage with no .catch and no lastError check`);
    }
  }
}

console.log('Literal dollar signs survive Chrome\'s substitution');
{
  // Chrome reads $ followed by a digit as a substitution slot: $1..$9. So
  // "Subscribe — $5/month or $40/year" rendered as "Subscribe — /month or
  // 0/year" — $5 became empty substitution five, and $40 became empty
  // substitution four followed by a nought. The price vanished from the one
  // button whose entire job is to state the price. Literal dollars must be
  // written $$.
  for (const code of LOCALES) {
    for (const [key, entry] of Object.entries(catalogues[code])) {
      const bare = entry.message.match(/(?<!\$)\$\d/g);
      if (!bare) { ok(); continue; }
      bad(`${code} "${key}" has ${bare[0]} — Chrome eats it as a substitution. Write $$ for a literal dollar`);
    }
  }

  // The other half: a placeholder's content is a substitution reference and
  // must stay a single dollar, or the argument never lands and the message
  // prints the reference itself.
  for (const code of LOCALES) {
    for (const [key, entry] of Object.entries(catalogues[code])) {
      for (const [name, ph] of Object.entries(entry.placeholders || {})) {
        if (/^\$\d$/.test(ph.content)) ok();
        else bad(`${code} "${key}" placeholder ${name} has content ${ph.content} — must be $1..$9`);
      }
    }
  }
}

console.log('No page states a version number of its own');
{
  // popup.html carried "v4.7.0" typed by hand, in two places. The manifest went
  // to 4.8.0 and the popup did not, so a freshly loaded build reported itself as
  // the old one and a whole test session was spent looking for a phantom
  // loading failure. Any literal version in a shipped page is that bug waiting.
  const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
  const pages = ['popup.html', 'welcome.html', 'whats-new.html'];
  const VERSIONISH = /\bv?\d+\.\d+\.\d+\b/g;

  for (const page of pages) {
    const file = path.join(HERE, page);
    if (!fs.existsSync(file)) continue;
    // Comments are not shipped UI, and the comment explaining this very rule
    // names the two versions that drifted.
    const body = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const hits = body.match(VERSIONISH) || [];
    if (!hits.length) { ok(); continue; }
    bad(`${page} hard-codes ${hits.join(', ')} — read chrome.runtime.getManifest().version instead`);
  }

  // And the one place a version legitimately lives must be well formed, since
  // the store rejects anything else and the trial gates parse it.
  if (/^\d+\.\d+\.\d+$/.test(manifest.version)) ok();
  else bad(`manifest version ${manifest.version} is not three dotted numbers`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
