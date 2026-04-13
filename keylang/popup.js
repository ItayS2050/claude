// popup.js — KeyLang settings & stats

function render(data) {
  const stats = data.stats || { detected: 0, converted: 0, rejected: 0 };
  const hebrewWords = data.learnedHebrew || [];
  const englishWords = data.learnedEnglish || [];

  document.getElementById('s-detected').textContent = stats.detected;
  document.getElementById('s-converted').textContent = stats.converted;
  document.getElementById('s-rejected').textContent = stats.rejected;

  renderWordList('hebrew-words', hebrewWords, 'hebrew', (word) => removeWord(word, 'hebrew'));
  renderWordList('english-words', englishWords, 'english', (word) => removeWord(word, 'english'));
}

function renderWordList(containerId, words, type, onRemove) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (words.length === 0) {
    container.innerHTML = '<span class="empty">None yet</span>';
    return;
  }
  words.forEach(word => {
    const tag = document.createElement('div');
    tag.className = `word-tag ${type}`;
    tag.innerHTML = `<span>${word}</span><button title="Remove">✕</button>`;
    tag.querySelector('button').addEventListener('click', () => onRemove(word));
    container.appendChild(tag);
  });
}

function removeWord(word, type) {
  chrome.storage.local.get(['learnedHebrew', 'learnedEnglish'], (data) => {
    const key = type === 'hebrew' ? 'learnedHebrew' : 'learnedEnglish';
    const list = (data[key] || []).filter(w => w !== word);
    chrome.storage.local.set({ [key]: list }, () => {
      chrome.storage.local.get(['learnedHebrew', 'learnedEnglish', 'stats'], render);
    });
  });
}

function addWord(word, type) {
  if (!word.trim()) return;
  const key = type === 'hebrew' ? 'learnedHebrew' : 'learnedEnglish';
  chrome.storage.local.get([key], (data) => {
    const list = [...new Set([...(data[key] || []), word.trim().toLowerCase()])];
    chrome.storage.local.set({ [key]: list }, () => {
      chrome.storage.local.get(['learnedHebrew', 'learnedEnglish', 'stats'], render);
    });
  });
}

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

document.getElementById('reset-btn').addEventListener('click', () => {
  if (!confirm('Reset all learned data? Stats and word lists will be cleared.')) return;
  chrome.storage.local.set({
    learnedHebrew: [],
    learnedEnglish: [],
    stats: { detected: 0, converted: 0, rejected: 0 }
  }, () => {
    chrome.storage.local.get(['learnedHebrew', 'learnedEnglish', 'stats'], render);
  });
});

// Load on open
chrome.storage.local.get(['learnedHebrew', 'learnedEnglish', 'stats'], render);
