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
  const enabledLangs = {
    he: selected.has('he'),
    ru: selected.has('ru'),
    ar: selected.has('ar'),
  };
  chrome.storage.local.set({ enabledLangs, onboardingDone: true }, () => {
    window.close();
  });
});
