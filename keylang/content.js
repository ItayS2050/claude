// ============================================================
// KeyLang – Keyboard Language Detector (Hebrew ↔ English)
// content.js
// ============================================================

console.log('[KeyLang] v1.0.5 loaded');

// ── Keyboard mapping ─────────────────────────────────────────
const EN_TO_HE = {
  'a': 'ש', 'b': 'נ', 'c': 'ב', 'd': 'ג', 'e': 'ק', 'f': 'כ',
  'g': 'ע', 'h': 'י', 'i': 'ן', 'j': 'ח', 'k': 'ל', 'l': 'ך',
  'm': 'צ', 'n': 'מ', 'o': 'ם', 'p': 'פ', 'q': '/',  'r': 'ר',
  's': 'ד', 't': 'א', 'u': 'ו', 'v': 'ה', 'w': "'",  'x': 'ס',
  'y': 'ט', 'z': 'ז', ';': 'ף', ',': 'ת', '.': 'ץ'
};

const HE_TO_EN = {};
for (const [en, he] of Object.entries(EN_TO_HE)) {
  if (/[\u0590-\u05FF]/.test(he)) HE_TO_EN[he] = en;
}

const HEBREW_RE = /[\u0590-\u05FF]/;

// ── English detection helpers ─────────────────────────────────

// Only bigrams/patterns that are UNIQUELY English and very rare in Hebrew
// keyboard output. Removed ambiguous ones like "at","er","as","or","is","he"
// which also appear frequently when typing Hebrew via English keyboard.
const EN_BIGRAMS = new Set([
  'th','st','ll','oo','ee','ly','wh','tw','qu'
  // removed: ck(ב+ל common Hebrew), nd(מ+ג exists), ng(מ+ע exists), gh(ע+י exists), ld
]);
// Definitive English suffixes — if a word ends with these, it's English
const EN_SUFFIXES = ['tion','ness','ment','ight','ough','ould','ing','ful','less','able','ible'];

function englishScore(word) {
  const s = word.toLowerCase();
  if (s.length < 2) return 0;
  let hits = 0;
  const bigrams = s.length - 1;
  for (let i = 0; i < bigrams; i++) {
    if (EN_BIGRAMS.has(s.slice(i, i + 2))) hits++;
  }
  // Suffix match counts as a strong English signal
  if (EN_SUFFIXES.some(sfx => s.endsWith(sfx))) hits += 2;
  return hits / bigrams;
}

// Words that must never be flagged as Hebrew keyboard input
const EN_WORDS = new Set([
  'the','be','to','of','and','a','in','that','have','it','for','not','on',
  'with','he','as','you','do','at','this','but','his','by','from','they',
  'we','say','her','she','or','an','will','my','one','all','would','there',
  'their','what','so','up','out','if','about','who','get','which','go','me',
  'when','make','can','like','time','no','just','him','know','take','into',
  'your','good','some','could','them','see','other','than','then','now',
  'look','only','come','its','over','think','also','back','after','use',
  'two','how','our','work','works','first','well','way','even','new','want',
  'any','give','day','most','us','hello','ok','yes','hi','hey','lol','omg',
  'thanks','please','sorry','help','okay','yeah','im','am','is','are','was',
  'has','had','did','got','let','put','set','run','try','ask','act','add',
  'big','bit','box','buy','car','cut','eat','end','eye','far','few','fit',
  'fix','fly','fun','gun','hit','hot','job','key','kid','law','lay','leg',
  'lie','lot','low','map','may','met','mix','mom','net','old','own','pay',
  'per','pop','pot','raw','red','rid','row','sad','sat','saw','sea','sit',
  'six','sky','son','spy','sum','sun','tax','tea','ten','too','top','van',
  'via','war','win','won','age','ago','air','led','man','men','boy','girl',
  'here','come','from','said','each','many','been','were','them',
  // common longer words
  'seems','better','still','often','every','never','always','again',
  'between','different','something','nothing','everything','someone',
  'anyone','everyone','keyboard','language','english','hebrew','typing',
  'detect','switch','suggest','suggests','appears','happens','working',
  'getting','found','right','left','without','another','think','things',
  'problem','program','browser','chrome','firefox','extension','install',
  'update','version','feature','button','click','press','type','text',
  'word','letter','convert','correct','option','setting','field','input',
  'result','status','error','google','doesnt','dont','cant','wont','isnt',
  'wasnt','arent','werent','shouldnt','couldnt','wouldnt','havent','hasnt',
  'didnt','going','doing','being','having','making','taking','coming',
  'looking','trying','using','putting','letting','seeing','knowing','saying',
  'really','very','quite','rather','pretty','maybe','perhaps','probably',
  'definitely','certainly','usually','actually','basically','literally',
  'seriously','honestly','clearly','simply','exactly','nearly','almost',
  // tech/abbreviations
  'npm','cpu','gpu','ram','ssd','usb','api','url','sql','css','html',
  'tbh','btw','fyi','imo','idk','ngl','smh','wtf','omg','lmao','brb'
]);

// ── Core detection ────────────────────────────────────────────

function hasHebrew(text) { return HEBREW_RE.test(text); }

function convertToHebrew(text) {
  return [...text].map(c => EN_TO_HE[c] || c).join('');
}

function convertToEnglish(text) {
  return [...text].map(c => HE_TO_EN[c] || c).join('');
}

// Returns true if a word looks like Hebrew typed via an English keyboard
function wordCouldBeHebrew(word) {
  const lower = word.toLowerCase();

  // Min length 2 — Hebrew has many 2-letter words (לא=kt, מה=nv, כי=ft…)
  if (lower.length < 2) return false;
  if (EN_WORDS.has(lower)) return false;

  // Strong English patterns → not Hebrew
  if (englishScore(lower) >= 0.15) return false;

  // Every character must map to a Hebrew Unicode character.
  // 'w'→"'" and 'q'→"/" are NOT Hebrew — their presence disqualifies the word.
  return [...lower].every(c => {
    const mapped = EN_TO_HE[c];
    return mapped !== undefined && HEBREW_RE.test(mapped);
  });
}

function analyze(text) {
  if (!text || text.trim().length < 3) return null;

  // ── Case 1: Hebrew Unicode chars found (keyboard in Hebrew mode) ──
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

  // ── Case 2: English chars that should be Hebrew ──
  const words = text.trim().split(/\s+/).filter(
    w => /^[a-z,;.']+$/i.test(w) && w.length >= 2
  );
  if (words.length < 3) return null;

  // Check ALL words — if 40%+ look like Hebrew keyboard input, convert everything
  const hebrewLike = words.filter(w => wordCouldBeHebrew(w));
  const ratio = hebrewLike.length / words.length;

  if (hebrewLike.length >= 3 && ratio >= 0.4) {
    // Convert the entire text, not just a trailing window.
    // This catches long sentences like "yuc tbh guav t, zv pv tck gshhi kt rutv azv gucs"
    // where every word is Hebrew typed in English mode.
    const fullText = words.join(' ');
    const converted = convertToHebrew(fullText.toLowerCase());

    if (hasHebrew(converted)) {
      return {
        type: 'english_as_hebrew',
        message: 'Typing in the wrong layout? This might be Hebrew:',
        original: fullText,
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
  .kld-header { display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 13px; color: #94a3b8; }
  .kld-preview {
    background: #0f172a;
    border-radius: 7px;
    padding: 8px 12px;
    font-size: 16px;
    unicode-bidi: plaintext;
    direction: auto;
    color: #7dd3fc;
    word-break: break-word;
  }
  .kld-actions { display: flex; gap: 8px; align-items: center; }
  .kld-hint { font-size: 10px; color: #475569; }
  .kld-btn {
    border: none; border-radius: 7px; padding: 7px 14px;
    font-size: 12px; font-weight: 600; cursor: pointer;
    transition: opacity 0.15s, transform 0.1s; line-height: 1;
  }
  .kld-btn:hover  { opacity: 0.88; transform: translateY(-1px); }
  .kld-btn:active { transform: translateY(0); }
  .kld-primary    { background: #3b82f6; color: #fff; flex: 1; }
  .kld-secondary  { background: #1e293b; color: #94a3b8; padding: 7px 10px; }

  #kld-recall {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483646;
    background: #1e3a5f;
    border: 1px solid #3b82f6;
    border-radius: 20px;
    padding: 7px 12px;
    font-size: 13px;
    font-weight: 600;
    color: #93c5fd;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    transition: transform 0.15s, opacity 0.15s;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  #kld-recall:hover { transform: scale(1.05); opacity: 1; }
`;

let activeToast = null;
let lastDetection = null;
let lastElement = null;
let recallBtn = null;

function injectStyles() {
  if (document.getElementById('kld-styles')) return;
  const s = document.createElement('style');
  s.id = 'kld-styles';
  s.textContent = STYLES;
  (document.head || document.documentElement).appendChild(s);
}

function showToast(element, detection) {
  // Don't re-show the exact same detection while it's already visible
  if (activeToast && lastDetection === detection) return;

  lastDetection = detection;
  lastElement = element;

  hideRecallBtn();
  if (activeToast) { activeToast.remove(); activeToast = null; }
  injectStyles();

  const toast = document.createElement('div');
  toast.id = 'kld-toast';
  toast.innerHTML = `
    <div class="kld-header"><span>⌨️</span><span>${detection.message}</span></div>
    <div class="kld-preview">${escapeHtml(detection.converted)}</div>
    <div class="kld-actions">
      <button class="kld-btn kld-primary">${detection.btnLabel}</button>
      <button class="kld-btn kld-secondary" title="Dismiss">✕</button>
    </div>
    <div class="kld-hint">Alt + Shift + K to recall later</div>
  `;

  toast.querySelector('.kld-primary').addEventListener('click', () => {
    applyConversion(element, detection);
    removeToast();
  });
  toast.querySelector('.kld-secondary').addEventListener('click', removeToast);

  (document.body || document.documentElement).appendChild(toast);
  activeToast = toast;
  // No auto-dismiss — stays until user acts on it
}

function removeToast() {
  if (activeToast) { activeToast.remove(); activeToast = null; }
  if (lastDetection) showRecallBtn();
}

function showRecallBtn() {
  if (recallBtn) return;
  injectStyles();
  recallBtn = document.createElement('button');
  recallBtn.id = 'kld-recall';
  recallBtn.innerHTML = '⌨️ Recall';
  recallBtn.title = 'Show last language detection (Alt+Shift+K)';
  recallBtn.addEventListener('click', () => {
    if (lastDetection && lastElement) showToast(lastElement, lastDetection);
  });
  (document.body || document.documentElement).appendChild(recallBtn);
}

function hideRecallBtn() {
  if (recallBtn) { recallBtn.remove(); recallBtn = null; }
}

// Alt+Shift+K to recall last detection anywhere
document.addEventListener('keydown', e => {
  if (e.altKey && e.shiftKey && e.code === 'KeyK') {
    e.preventDefault();
    if (activeToast) {
      removeToast();     // toggle: hide if visible
    } else if (lastDetection && lastElement) {
      showToast(lastElement, lastDetection);
    }
  }
});

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
    const current = element.innerText || element.textContent || '';
    const idx = current.lastIndexOf(original);
    if (idx === -1) return;
    const newText = current.slice(0, idx) + converted + current.slice(idx + original.length);
    element.focus();
    document.execCommand('selectAll');
    document.execCommand('insertText', false, newText);
  } else {
    const val = element.value;
    const idx = val.lastIndexOf(original);
    if (idx === -1) return;
    element.value = val.slice(0, idx) + converted + val.slice(idx + original.length);
    element.selectionStart = element.selectionEnd = idx + converted.length;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  lastDetection = null;
  hideRecallBtn();
}

// ── Input monitoring ──────────────────────────────────────────

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function attachTo(el) {
  if (el._kld) return;
  el._kld = true;

  const check = debounce(() => {
    // Don't interrupt a visible toast — let the user act on it
    if (activeToast) return;

    const text = el.isContentEditable
      ? (el.innerText || el.textContent || '')
      : el.value;

    const detection = analyze(text);
    if (detection) showToast(el, detection);
  }, 800);

  el.addEventListener('input', check);
  el.addEventListener('keyup', check);
  el.addEventListener('compositionend', check);
  el.addEventListener('focus', () => {
    // On refocus, allow re-detection for this element
  });
}

// ── DOM observation ───────────────────────────────────────────

const SELECTOR = [
  'input[type="text"]',
  'input[type="search"]',
  'input:not([type])',
  'textarea',
  '[contenteditable="true"]',
  '[contenteditable=""]'
].join(', ');

document.querySelectorAll(SELECTOR).forEach(attachTo);

new MutationObserver(mutations => {
  for (const { type, addedNodes, target } of mutations) {
    if (type === 'childList') {
      for (const node of addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(SELECTOR)) attachTo(node);
        node.querySelectorAll?.(SELECTOR).forEach(attachTo);
      }
    } else if (type === 'attributes') {
      // WhatsApp sets contenteditable after element insertion
      if (target.nodeType === 1 && target.matches?.(SELECTOR)) attachTo(target);
    }
  }
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['contenteditable']
});
