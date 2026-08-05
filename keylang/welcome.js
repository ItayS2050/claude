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

document.getElementById('skip-btn').addEventListener('click', () => {
  chrome.storage.local.set({
    enabledLangs: { he: true, ru: true, uk: true, ko: true, el: true, ar: true },
    onboardingDone: true,
  }, () => window.close());
});
