const selected = new Set();

document.querySelectorAll('.lang-card').forEach(card => {
  card.addEventListener('click', () => {
    const lang = card.dataset.lang;
    if (selected.has(lang)) {
      selected.delete(lang);
      card.classList.remove('selected');
      card.querySelector('.lang-check').textContent = '';
    } else {
      selected.add(lang);
      card.classList.add('selected');
      card.querySelector('.lang-check').textContent = '✓';
    }
    document.getElementById('start-btn').disabled = selected.size === 0;
  });
});

document.getElementById('start-btn').addEventListener('click', () => {
  // Every key must be written, not just the chosen ones: content.js falls back
  // to a permissive default for any key missing here, which would leave a
  // language running while the popup showed its toggle as off.
  const enabledLangs = {
    he: selected.has('he'),
    ru: selected.has('ru'),
    uk: selected.has('uk'),
    ko: selected.has('ko'),
    el: selected.has('el'),
    ar: selected.has('ar'),
  };
  chrome.storage.local.set({ enabledLangs, onboardingDone: true }, () => window.close());
});

// "Skip" used to switch all six languages on, which is the one answer nobody
// means. It is also the answer that costs the most accuracy — a language
// running that you never type interferes with the ones you do. Skipping now
// records nothing at all: content.js falls back to the languages Chrome says
// this person reads, and the popup keeps asking until they choose.
document.getElementById('skip-btn').addEventListener('click', () => {
  chrome.storage.local.set({ onboardingDone: false }, () => window.close());
});

// Pre-tick whatever Chrome says they read, so for most people choosing is
// confirming rather than hunting. Nothing is saved until they press the button.
try {
  const MAP = { he: 'he', iw: 'he', ru: 'ru', uk: 'uk', ko: 'ko', el: 'el', ar: 'ar' };
  for (const tag of (navigator.languages || [])) {
    const code = MAP[String(tag).toLowerCase().split('-')[0]];
    const card = code && document.getElementById('card-' + code);
    if (card && !selected.has(code)) card.click();
  }
} catch {}
