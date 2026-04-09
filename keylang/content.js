// ============================================================
// KeyLang – Keyboard Language Detector (Hebrew ↔ English)
// content.js
// ============================================================

// ── Keyboard mapping ─────────────────────────────────────────
// Physical key → Hebrew character (standard Israeli keyboard layout)
const EN_TO_HE = {
  'a': 'ש', 'b': 'נ', 'c': 'ב', 'd': 'ג', 'e': 'ק', 'f': 'כ',
  'g': 'ע', 'h': 'י', 'i': 'ן', 'j': 'ח', 'k': 'ל', 'l': 'ך',
  'm': 'צ', 'n': 'מ', 'o': 'ם', 'p': 'פ', 'q': '/',  'r': 'ר',
  's': 'ד', 't': 'א', 'u': 'ו', 'v': 'ה', 'w': "'",  'x': 'ס',
  'y': 'ט', 'z': 'ז', ';': 'ף', ',': 'ת', '.': 'ץ'
};

// Hebrew character → English key (reverse)
const HE_TO_EN = {};
for (const [en, he] of Object.entries(EN_TO_HE)) {
  if (/[\u0590-\u05FF]/.test(he)) HE_TO_EN[he] = en;
}

const HEBREW_RE = /[\u0590-\u05FF]/;

// Common English words to exclude from "looks like Hebrew" detection
const EN_WORDS = new Set([
  'the','be','to','of','and','a','in','that','have','it','for','not','on',
  'with','he','as','you','do','at','this','but','his','by','from','they',
  'we','say','her','she','or','an','will','my','one','all','would','there',
  'their','what','so','up','out','if','about','who','get','which','go','me',
  'when','make','can','like','time','no','just','him','know','take','into',
  'your','good','some','could','them','see','other','than','then','now',
  'look','only','come','its','over','think','also','back','after','use',
  'two','how','our','work','first','well','way','even','new','want','any',
  'give','day','most','us','hello','ok','yes','hi','hey','lol','omg',
  'thanks','please','sorry','help','okay','yeah','im','am','is','are','was',
  'has','had','did','got','let','put','set','run','try','ask','act','add',
  'big','bit','box','buy','car','cut','eat','end','eye','far','few','fit',
  'fix','fly','fun','gun','hit','hot','job','key','kid','law','lay','leg',
  'lie','lot','low','map','may','met','mix','mom','net','old','own','pay',
  'per','pig','pit','pop','pot','pro','raw','red','rid','row','sad','sat',
  'saw','sea','sit','six','sky','son','spy','sum','sun','tax','tea','ten',
  'too','top','tv','van','via','war','win','won','age','ago','air','led',
  'man','men','boy','girl','day','way','her','him','she','who','why',
  'here','come','from','this','that','with','they','have','been','were',
  'said','each','which','their','time','will','about','many','then','them'
]);

// ── Core detection ────────────────────────────────────────────

function hasHebrew(text) {
  return HEBREW_RE.test(text);
}

function convertToHebrew(text) {
  return [...text].map(c => EN_TO_HE[c] || c).join('');
}

function convertToEnglish(text) {
  return [...text].map(c => HE_TO_EN[c] || c).join('');
}

// Returns true if a word looks like it could be Hebrew
// typed via an English keyboard layout
function wordCouldBeHebrew(word) {
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;
  if (EN_WORDS.has(lower)) return false;

  // Every character must map to something (undefined = not on Hebrew keyboard)
  const mapped = [...lower].map(c => EN_TO_HE[c]);
  if (mapped.some(c => c === undefined)) return false;

  // At least 70% of mapped chars must be Hebrew Unicode
  const heCount = mapped.filter(c => HEBREW_RE.test(c)).length;
  return heCount / lower.length >= 0.7;
}

function analyze(text) {
  if (!text || text.trim().length < 3) return null;

  // ── Case 1: Hebrew characters detected (keyboard in Hebrew, user wanted English) ──
  if (hasHebrew(text)) {
    const hebrewChars = [...text].filter(c => HEBREW_RE.test(c));
    if (hebrewChars.length >= 2) {
      const converted = convertToEnglish(text);
      return {
        type: 'hebrew_detected',
        message: 'Hebrew detected — did you mean English?',
        original: text,
        converted,
        btnLabel: 'Switch to English'
      };
    }
  }

  // ── Case 2: English chars typed with Hebrew layout intent ──
  const words = text.trim().split(/\s+/).filter(w => /^[a-z,;.']+$/i.test(w) && w.length >= 2);
  if (words.length === 0) return null;

  // Look at the last 4 words to avoid flagging on old correct text
  const sample = words.slice(-4);
  const hebrewLike = sample.filter(w => wordCouldBeHebrew(w));

  // Require majority of recent words to look Hebrew-like
  // (single word needs to be length >= 4 to avoid noise)
  const threshold = sample.length === 1
    ? (sample[0].length >= 4 ? 1 : Infinity)
    : Math.ceil(sample.length * 0.6);

  if (hebrewLike.length >= threshold) {
    const sampleText = sample.join(' ');
    const converted = convertToHebrew(sampleText.toLowerCase());

    if (hasHebrew(converted)) {
      return {
        type: 'english_as_hebrew',
        message: 'Typing in the wrong layout? This might be Hebrew:',
        original: sampleText,
        converted,
        btnLabel: 'Convert to Hebrew'
      };
    }
  }

  return null;
}

// ── UI ────────────────────────────────────────────────────────

const STYLES = `
  #kld-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    background: #16213e;
    color: #e2e8f0;
    border: 1px solid #2d3a5c;
    border-radius: 12px;
    padding: 14px 16px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.45);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    max-width: 340px;
    min-width: 260px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: kld-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: all;
  }
  @keyframes kld-in {
    from { opacity: 0; transform: translateY(16px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .kld-header {
    display: flex;
    align-items: center;
    gap: 7px;
    font-weight: 600;
    font-size: 13px;
    color: #94a3b8;
  }
  .kld-icon { font-size: 16px; }
  .kld-preview {
    background: #0f172a;
    border-radius: 7px;
    padding: 8px 12px;
    font-size: 16px;
    letter-spacing: 0.3px;
    unicode-bidi: plaintext;
    direction: auto;
    color: #7dd3fc;
    word-break: break-word;
  }
  .kld-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .kld-btn {
    border: none;
    border-radius: 7px;
    padding: 7px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
    line-height: 1;
  }
  .kld-btn:hover  { opacity: 0.88; transform: translateY(-1px); }
  .kld-btn:active { transform: translateY(0); }
  .kld-primary    { background: #3b82f6; color: #fff; flex: 1; }
  .kld-secondary  { background: #1e293b; color: #94a3b8; padding: 7px 10px; }
`;

let activeToast = null;
let activeTimer = null;
let lastKey = null;

function injectStyles() {
  if (document.getElementById('kld-styles')) return;
  const s = document.createElement('style');
  s.id = 'kld-styles';
  s.textContent = STYLES;
  (document.head || document.documentElement).appendChild(s);
}

function showToast(element, detection) {
  // Suppress duplicate notifications for identical detections
  const key = `${detection.type}|${detection.original.slice(0, 30)}`;
  if (key === lastKey) return;
  lastKey = key;

  removeToast();
  injectStyles();

  const toast = document.createElement('div');
  toast.id = 'kld-toast';
  toast.innerHTML = `
    <div class="kld-header">
      <span class="kld-icon">⌨️</span>
      <span>${detection.message}</span>
    </div>
    <div class="kld-preview">${escapeHtml(detection.converted)}</div>
    <div class="kld-actions">
      <button class="kld-btn kld-primary">${detection.btnLabel}</button>
      <button class="kld-btn kld-secondary" title="Dismiss">✕</button>
    </div>
  `;

  toast.querySelector('.kld-primary').addEventListener('click', () => {
    applyConversion(element, detection);
    removeToast();
  });
  toast.querySelector('.kld-secondary').addEventListener('click', removeToast);

  document.documentElement.appendChild(toast);
  activeToast = toast;
  activeTimer = setTimeout(removeToast, 8000);
}

function removeToast() {
  if (activeToast) { activeToast.remove(); activeToast = null; }
  if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Text conversion ───────────────────────────────────────────

function applyConversion(element, detection) {
  const { original, converted } = detection;

  if (element.isContentEditable) {
    const current = element.innerText || element.textContent;
    const idx = current.lastIndexOf(original);
    if (idx === -1) return;
    const newText = current.slice(0, idx) + converted + current.slice(idx + original.length);
    // Use execCommand so the change lands in the undo stack
    element.focus();
    document.execCommand('selectAll');
    document.execCommand('insertText', false, newText);
  } else {
    const val = element.value;
    const idx = val.lastIndexOf(original);
    if (idx === -1) return;
    element.value = val.slice(0, idx) + converted + val.slice(idx + original.length);
    element.selectionStart = element.selectionEnd = idx + converted.length;
    // Trigger framework reactivity (React, Vue, etc.)
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  lastKey = null;
}

// ── Input monitoring ──────────────────────────────────────────

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function attachTo(el) {
  if (el._kld) return;
  el._kld = true;

  const check = debounce(() => {
    const text = el.isContentEditable
      ? (el.innerText || el.textContent || '')
      : el.value;

    const detection = analyze(text);
    if (detection) {
      showToast(el, detection);
    } else {
      removeToast();
      lastKey = null;
    }
  }, 800);

  el.addEventListener('input', check);
  // Reset suppression key on new focus so returning to a field re-evaluates
  el.addEventListener('focus', () => { lastKey = null; });
}

const SELECTOR = [
  'input[type="text"]',
  'input[type="search"]',
  'input:not([type])',
  'textarea',
  '[contenteditable="true"]',
  '[contenteditable=""]'
].join(', ');

function scanDOM() {
  document.querySelectorAll(SELECTOR).forEach(attachTo);
}

// Initial scan + watch for dynamically added elements (SPAs, modals, etc.)
scanDOM();

new MutationObserver(mutations => {
  for (const { addedNodes } of mutations) {
    for (const node of addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches?.(SELECTOR)) attachTo(node);
      node.querySelectorAll?.(SELECTOR).forEach(attachTo);
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });
