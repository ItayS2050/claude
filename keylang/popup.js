// popup.js — Kiko settings & stats

function render(data) {
  const stats = data.stats || { detected: 0, converted: 0, rejected: 0 };
  const hebrewWords  = data.learnedHebrew  || [];
  const englishWords = data.learnedEnglish || [];
  const russianWords = data.learnedRussian || [];
  const ukrainianWords = data.learnedUkrainian || [];
  const koreanWords = data.learnedKorean || [];
  const greekWords = data.learnedGreek || [];
  const arabicWords  = data.learnedArabic  || [];

  document.getElementById('s-detected').textContent = stats.detected;
  document.getElementById('s-converted').textContent = stats.converted;
  document.getElementById('s-rejected').textContent = stats.rejected;

  // Detection toggle
  const toggle = document.getElementById('detection-toggle');
  const enabled = data.detectionEnabled !== false;
  toggle.checked = enabled;
  document.getElementById('paused-banner').style.display = enabled ? 'none' : 'block';

  // Sound toggle
  document.getElementById('sound-toggle').checked = data.soundEnabled !== false;

  // Language toggles — default off until user completes onboarding
  const langs = data.enabledLangs || { he: false, ru: false, uk: false, ko: false, el: false, ar: false };
  document.getElementById('lang-he-toggle').checked = langs.he === true;
  document.getElementById('lang-ru-toggle').checked = langs.ru === true;
  document.getElementById('lang-uk-toggle').checked = langs.uk === true;
  document.getElementById('lang-ko-toggle').checked = langs.ko === true;
  document.getElementById('lang-el-toggle').checked = langs.el === true;
  document.getElementById('lang-ar-toggle').checked = langs.ar === true;

  // Per-site toggle
  const disabled = data.disabledSites || [];
  if (currentHostname) {
    document.getElementById('site-hostname').textContent = currentHostname;
    document.getElementById('site-toggle').checked = !disabled.includes(currentHostname);
  } else {
    document.getElementById('site-row').style.display = 'none';
  }

  renderEntitlement(data.entitlement);

  renderWordList('hebrew-words',  hebrewWords,  'hebrew',  (word) => removeWord(word, 'hebrew'));
  renderWordList('english-words', englishWords, 'english', (word) => removeWord(word, 'english'));
  renderWordList('russian-words', russianWords, 'russian', (word) => removeWord(word, 'russian'));
  renderWordList('ukrainian-words', ukrainianWords, 'ukrainian', (word) => removeWord(word, 'ukrainian'));
  renderWordList('korean-words', koreanWords, 'korean', (word) => removeWord(word, 'korean'));
  renderWordList('greek-words', greekWords, 'greek', (word) => removeWord(word, 'greek'));
  renderWordList('arabic-words',  arabicWords,  'arabic',  (word) => removeWord(word, 'arabic'));
}

function renderWordList(containerId, words, type, onRemove) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (words.length === 0) {
    container.textContent = '';
    const empty = document.createElement('span');
    empty.className = 'empty';
    empty.textContent = t('emptyList', null, 'None yet');
    container.appendChild(empty);
    return;
  }
  words.forEach(word => {
    const tag = document.createElement('div');
    tag.className = `word-tag ${type}`;
    tag.innerHTML = `<span>${word}</span><button title="${t('removeWord', null, 'Remove')}">✕</button>`;
    tag.querySelector('button').addEventListener('click', () => onRemove(word));
    container.appendChild(tag);
  });
}

// Lemon Squeezy checkout. This is the product link, not a single variant: it
// opens with both plans and the buyer picks — $5/month or $40/year. Whichever
// variant sits first in the product's variant list is the one preselected.
const CHECKOUT_URL = 'https://getkiko.lemonsqueezy.com/checkout/buy/572c829f-1e66-46bf-86d1-fd4441b5d3dc';

// The two places the popup shows its version. Read from the manifest so they
// cannot disagree with the build they are running in — which they did, and it
// cost an afternoon of "the new build isn't loading".
(() => {
  try {
    const v = chrome.runtime.getManifest().version;
    for (const id of ['ver', 'ver-foot']) {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    }
  } catch {}
})();

// Same fallback rule as content.js: the English that used to be hard-coded
// here is passed in, so a missing key reads as it always did.
function t(key, subs, fallback) {
  try {
    const s = chrome.i18n.getMessage(key, subs);
    if (s) return s;
  } catch {}
  return fallback !== undefined ? fallback : '';
}

// ── Trial / licence banner ────────────────────────────────────
function renderEntitlement(ent) {
  const box = document.getElementById('ent-box');
  if (!ent) { box.style.display = 'none'; return; }
  const title = document.getElementById('ent-title');
  const body  = document.getElementById('ent-body');
  const cta   = document.getElementById('ent-cta');
  const keys  = document.querySelector('.key-row');

  box.style.display = 'block';
  box.className = 'ent ' + ent.state;
  cta.href = CHECKOUT_URL;

  if (ent.state === 'licensed') {
    title.textContent = t('entLicensedTitle', null, 'Subscription active');
    body.textContent  = t('entLicensedBody', null, 'Thanks — every language is unlocked.');
    cta.style.display = 'none';
    keys.style.display = 'none';
  } else if (ent.state === 'trial') {
    const d = ent.daysLeft;
    title.textContent = d === 1
      ? t('entTrialLastDay', null, 'Last day of your free trial')
      : t('entTrialTitle', [String(d)], `${d} days left in your free trial`);
    body.textContent  = t('entTrialBody', null,
      'Everything works. Subscribe any time to keep it after the trial.');
    cta.style.display = 'block';
    keys.style.display = 'flex';
  } else {
    title.textContent = t('entExpiredTitle', null, 'Your free trial has ended');
    body.textContent  = t('entExpiredBody', null,
      'Detection is paused. Your learned words are safe — subscribe to switch it back on.');
    cta.style.display = 'block';
    keys.style.display = 'flex';
  }
}

document.getElementById('key-btn').addEventListener('click', () => {
  const input = document.getElementById('key-input');
  const msg   = document.getElementById('key-msg');
  msg.className = 'key-msg';
  msg.textContent = 'Checking…';
  chrome.runtime.sendMessage({ type: 'kiko-activate-licence', key: input.value }, (res) => {
    if (!res || !res.ok) {
      msg.className = 'key-msg err';
      msg.textContent = (res && res.error) || 'Could not activate that key.';
      return;
    }
    msg.className = 'key-msg ok';
    msg.textContent = 'Activated. Thank you!';
    input.value = '';
    renderEntitlement(res.entitlement);
  });
});
document.getElementById('key-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('key-btn').click();
});

const ALL_LEARNED_KEYS = ['learnedHebrew', 'learnedEnglish', 'learnedRussian', 'learnedUkrainian', 'learnedKorean', 'learnedGreek', 'learnedArabic', 'stats', 'detectionEnabled', 'soundEnabled', 'enabledLangs', 'disabledSites', 'entitlement'];

function removeWord(word, type) {
  const key = type === 'hebrew' ? 'learnedHebrew' : type === 'russian' ? 'learnedRussian' : type === 'ukrainian' ? 'learnedUkrainian' : type === 'korean' ? 'learnedKorean' : type === 'greek' ? 'learnedGreek' : type === 'arabic' ? 'learnedArabic' : 'learnedEnglish';
  chrome.storage.local.get([key], (data) => {
    const list = (data[key] || []).filter(w => w !== word);
    chrome.storage.local.set({ [key]: list }, () => {
      chrome.storage.local.get(ALL_LEARNED_KEYS, render);
    });
  });
}

function addWord(word, type) {
  if (!word.trim()) return;
  const key = type === 'hebrew' ? 'learnedHebrew' : type === 'russian' ? 'learnedRussian' : type === 'ukrainian' ? 'learnedUkrainian' : type === 'korean' ? 'learnedKorean' : type === 'greek' ? 'learnedGreek' : type === 'arabic' ? 'learnedArabic' : 'learnedEnglish';
  chrome.storage.local.get([key], (data) => {
    const list = [...new Set([...(data[key] || []), word.trim().toLowerCase()])];
    chrome.storage.local.set({ [key]: list }, () => {
      chrome.storage.local.get(ALL_LEARNED_KEYS, render);
    });
  });
}

// Detection on/off toggle
document.getElementById('detection-toggle').addEventListener('change', (e) => {
  chrome.storage.local.set({ detectionEnabled: e.target.checked });
  document.getElementById('paused-banner').style.display = e.target.checked ? 'none' : 'block';
});

// Sound on/off toggle
document.getElementById('sound-toggle').addEventListener('change', (e) => {
  chrome.storage.local.set({ soundEnabled: e.target.checked });
});

// Per-language toggles
function setLang(lang, enabled) {
  chrome.storage.local.get(['enabledLangs'], (d) => {
    const current = d.enabledLangs || { he: false, ru: false, uk: false, ko: false, el: false, ar: false };
    chrome.storage.local.set({ enabledLangs: { ...current, [lang]: enabled } });
  });
}
document.getElementById('lang-he-toggle').addEventListener('change', (e) => setLang('he', e.target.checked));
document.getElementById('lang-ru-toggle').addEventListener('change', (e) => setLang('ru', e.target.checked));
document.getElementById('lang-uk-toggle').addEventListener('change', (e) => setLang('uk', e.target.checked));
document.getElementById('lang-ko-toggle').addEventListener('change', (e) => setLang('ko', e.target.checked));
document.getElementById('lang-el-toggle').addEventListener('change', (e) => setLang('el', e.target.checked));
document.getElementById('lang-ar-toggle').addEventListener('change', (e) => setLang('ar', e.target.checked));

// Test sound button — plays directly in popup (guaranteed user gesture)
document.getElementById('test-sound-btn').addEventListener('click', () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t   = ctx.currentTime;
    function note(freq, start, dur, vol) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, t + start);
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.start(t + start); osc.stop(t + start + dur);
      return osc;
    }
    note(880, 0, 0.22, 0.22);
    const last = note(660, 0.14, 0.38, 0.18);
    last.onended = () => ctx.close();
  } catch {}
});

// Re-enable button in the paused banner
document.getElementById('reenable-btn').addEventListener('click', () => {
  chrome.storage.local.set({ detectionEnabled: true });
  document.getElementById('detection-toggle').checked = true;
  document.getElementById('paused-banner').style.display = 'none';
});

document.getElementById('add-hebrew-btn').addEventListener('click', () => {
  const input = document.getElementById('add-hebrew-input');
  addWord(input.value, 'hebrew');
  input.value = '';
});
document.getElementById('add-hebrew-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('add-hebrew-btn').click();
});
document.getElementById('add-english-btn').addEventListener('click', () => {
  const input = document.getElementById('add-english-input');
  addWord(input.value, 'english');
  input.value = '';
});
document.getElementById('add-english-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('add-english-btn').click();
});
document.getElementById('add-russian-btn').addEventListener('click', () => {
  const input = document.getElementById('add-russian-input');
  addWord(input.value, 'russian');
  input.value = '';
});
document.getElementById('add-russian-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('add-russian-btn').click();
});
document.getElementById('add-ukrainian-btn').addEventListener('click', () => {
  const input = document.getElementById('add-ukrainian-input');
  addWord(input.value, 'ukrainian');
  input.value = '';
});
document.getElementById('add-ukrainian-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('add-ukrainian-btn').click();
});
document.getElementById('add-korean-btn').addEventListener('click', () => {
  const input = document.getElementById('add-korean-input');
  addWord(input.value, 'korean');
  input.value = '';
});
document.getElementById('add-korean-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('add-korean-btn').click();
});
document.getElementById('add-greek-btn').addEventListener('click', () => {
  const input = document.getElementById('add-greek-input');
  addWord(input.value, 'greek');
  input.value = '';
});
document.getElementById('add-greek-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('add-greek-btn').click();
});
document.getElementById('add-arabic-btn').addEventListener('click', () => {
  const input = document.getElementById('add-arabic-input');
  addWord(input.value, 'arabic');
  input.value = '';
});
document.getElementById('add-arabic-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('add-arabic-btn').click();
});

document.getElementById('reset-btn').addEventListener('click', () => {
  if (!confirm('Reset all learned data? Stats and word lists will be cleared.')) return;
  chrome.storage.local.set({
    learnedHebrew: [],
    learnedEnglish: [],
    learnedRussian: [],
    learnedUkrainian: [],
    learnedKorean: [],
    learnedGreek: [],
    learnedArabic: [],
    stats: { detected: 0, converted: 0, rejected: 0 }
  }, () => {
    chrome.storage.local.get(ALL_LEARNED_KEYS, render);
  });
});

// ── Review nudge ──────────────────────────────────────────────
// State machine stored in chrome.storage.local as `reviewNudge`:
//   null / missing  → never shown; show after 3 conversions
//   { state: 'snoozed', snoozeUntil: <ms> } → dismissed; show again after 30 days
//   { state: 'done' }                        → clicked review; never show again

const REVIEW_URL = `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`;
const SNOOZE_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days

function maybeShowNudge(stats, nudge) {
  if (stats.converted < 3) return;
  if (nudge && nudge.state === 'done') return;
  if (nudge && nudge.state === 'snoozed' && Date.now() < nudge.snoozeUntil) return;
  document.getElementById('review-nudge').style.display = 'block';
}

document.getElementById('review-nudge-rate').addEventListener('click', () => {
  chrome.storage.local.set({ reviewNudge: { state: 'done' } });
  document.getElementById('review-nudge').style.display = 'none';
  window.open(REVIEW_URL, '_blank');
});

function snoozeNudge() {
  chrome.storage.local.set({ reviewNudge: { state: 'snoozed', snoozeUntil: Date.now() + SNOOZE_MS } });
  document.getElementById('review-nudge').style.display = 'none';
}

document.getElementById('review-nudge-close').addEventListener('click', snoozeNudge);
document.getElementById('review-nudge-later').addEventListener('click', snoozeNudge);

// ── Per-site disable ──────────────────────────────────────────
let currentHostname = null;

document.getElementById('site-toggle').addEventListener('change', (e) => {
  if (!currentHostname) return;
  chrome.storage.local.get(['disabledSites'], (d) => {
    const sites = d.disabledSites || [];
    const updated = e.target.checked
      ? sites.filter(s => s !== currentHostname)
      : [...new Set([...sites, currentHostname])];
    chrome.storage.local.set({ disabledSites: updated });
  });
});

// ── Report a problem ──────────────────────────────────────────
// Pre-fills the version and settings, because "it isn't working" with no
// version attached costs a round trip every time.
//
// What it must never carry: the learned word lists. Those are things the user
// typed, and the whole promise is that their text stays on their machine —
// mailing it to support would break that promise in the very feature meant to
// help them. Counts only.
document.getElementById('help-report').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.storage.local.get(
    [...ALL_LEARNED_KEYS, 'entitlement', 'enabledLangs'],
    (d) => {
      const langs = d.enabledLangs || {};
      const on    = Object.keys(langs).filter(k => langs[k]);
      const stats = d.stats || {};
      const ent   = d.entitlement || {};
      const learnedCount = ALL_LEARNED_KEYS
        .filter(k => k.startsWith('learned'))
        .reduce((n, k) => n + ((d[k] || []).length), 0);

      const body = [
        'Tell us what happened — what you were typing, on which site,',
        'and what you expected instead.',
        '',
        '',
        '',
        '--- please leave the lines below, they help us debug ---',
        `Kiko ${chrome.runtime.getManifest().version}`,
        `Languages on: ${on.length ? on.join(', ') : 'none'}`,
        `Status: ${ent.state || 'unknown'}${ent.daysLeft != null ? ` (${ent.daysLeft} days left)` : ''}`,
        `Detected ${stats.detected || 0} · converted ${stats.converted || 0} · rejected ${stats.rejected || 0}`,
        `Learned words: ${learnedCount}`,
        navigator.userAgent,
      ].join('\n');

      chrome.tabs.create({
        url: 'mailto:hello@get-kiko.com'
           + '?subject=' + encodeURIComponent('Kiko problem report')
           + '&body='    + encodeURIComponent(body),
      });
    }
  );
});

// Load on open
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  try {
    const url = tabs[0] && tabs[0].url ? new URL(tabs[0].url) : null;
    currentHostname = url && !['chrome:', 'chrome-extension:'].includes(url.protocol)
      ? url.hostname : null;
  } catch {}
  chrome.storage.local.get(
    [...ALL_LEARNED_KEYS, 'reviewNudge'],
    (data) => {
      render(data);
      chrome.runtime.sendMessage({ type: 'kiko-refresh-entitlement' }, (ent) => {
        void chrome.runtime.lastError;
        if (ent) renderEntitlement(ent);
      });
      maybeShowNudge(data.stats || { converted: 0 }, data.reviewNudge || null);
    }
  );
});
