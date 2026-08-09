// Fills the extension's own pages from _locales/. Loaded before each page's
// script so nothing renders in English and then flips.
//
// Markup opts in per element:
//   data-i18n="key"                     → textContent
//   data-i18n="key|sub1|sub2"           → textContent with substitutions
//   data-i18n="key|__otherKey__"        → substitution is itself a message
//   data-i18n-html="key|<em>x</em>"     → innerHTML, for the few strings that
//                                         carry emphasis around a substitution
//   data-i18n-placeholder="key"         → input placeholder
//   data-i18n-title="key"               → title attribute
//
// data-i18n-html takes authored markup only — every value passed to it is a
// literal in our own HTML, never anything a user typed. Do not point it at
// storage or at page content.
(() => {
  const msg = (key, subs) => {
    try { return chrome.i18n.getMessage(key, subs) || ''; } catch { return ''; }
  };

  // Direction first: the page should already be laid out correctly by the time
  // it paints, not reflow once the strings land.
  const dir = msg('uiDir') || 'ltr';
  document.documentElement.setAttribute('dir', dir);
  try {
    const ui = chrome.i18n.getUILanguage ? chrome.i18n.getUILanguage() : 'en';
    document.documentElement.setAttribute('lang', ui.split('-')[0]);
  } catch {}

  // A substitution written as __someKey__ is itself a message, looked up
  // before being substituted. That is how "Learned — $LANG$ keyboard words"
  // gets a translated language name inside a translated sentence without the
  // markup having to know either of them.
  const parse = (raw) => {
    const [key, ...subs] = raw.split('|');
    const resolved = subs.map(v => {
      const m = /^__(.+)__$/.exec(v);
      return m ? (msg(m[1]) || m[1]) : v;
    });
    return [key, resolved.length ? resolved : undefined];
  };

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const [key, subs] = parse(el.dataset.i18n);
    const s = msg(key, subs);
    if (s) el.textContent = s;          // empty means untranslated: keep the English
  });

  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const [key, subs] = parse(el.dataset.i18nHtml);
    const s = msg(key, subs);
    if (s) el.innerHTML = s;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const s = msg(el.dataset.i18nPlaceholder);
    if (s) el.placeholder = s;
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const s = msg(el.dataset.i18nTitle);
    if (s) el.title = s;
  });
})();
