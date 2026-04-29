// ============================================================
// Kiko v2.3.2 – Hebrew ↔ English Layout Fixer
// content.js
// ============================================================
console.log('[Kiko] v2.3.2 loaded');

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
HE_TO_EN["'"] = 'w'; // w-key on Hebrew keyboard produces apostrophe

const HEBREW_RE = /[\u0590-\u05FF]/;

// ── Learned data (loaded from storage) ───────────────────────
let learnedHebrew = new Set();
let learnedEnglish = new Set();
let stats = { detected: 0, converted: 0, rejected: 0 };
let detectionEnabled = true;   // on/off switch
let toastPos = null;           // { top, left } saved drag position

async function loadLearned() {
  try {
    const data = await chrome.storage.local.get([
      'learnedHebrew','learnedEnglish','stats','detectionEnabled','toastPos'
    ]);
    learnedHebrew = new Set(data.learnedHebrew || []);
    learnedEnglish = new Set(data.learnedEnglish || []);
    stats = data.stats || { detected: 0, converted: 0, rejected: 0 };
    detectionEnabled = data.detectionEnabled !== false; // default on
    toastPos = data.toastPos || null;
  } catch { /* storage unavailable */ }
}

// React to on/off changes made from the popup
try {
  chrome.storage.onChanged.addListener((changes) => {
    if ('detectionEnabled' in changes) {
      detectionEnabled = changes.detectionEnabled.newValue !== false;
      if (!detectionEnabled) { removeToast(false); hideRecallBtn(); }
    }
    if ('toastPos' in changes) toastPos = changes.toastPos.newValue;
  });
} catch { /* storage unavailable */ }

async function saveFeedback(words, isHebrew) {
  try {
    if (isHebrew) {
      words.forEach(w => { learnedHebrew.add(w); learnedEnglish.delete(w); });
      stats.converted++;
    } else {
      words.forEach(w => { learnedEnglish.add(w); learnedHebrew.delete(w); });
      stats.rejected++;
    }
    await chrome.storage.local.set({
      learnedHebrew: [...learnedHebrew],
      learnedEnglish: [...learnedEnglish],
      stats
    });
  } catch { /* storage unavailable */ }
}

loadLearned();

// ── English detection ─────────────────────────────────────────
const EN_BIGRAMS = new Set([
  // 'th' removed — t=א h=י gives "אי" which starts many Hebrew words (איפה,איך,אין)
  // All common English "th" words (the,that,this,there…) are already in EN_WORDS
  'st','ng','ll','oo','ee','ly','ld','wh','tw','qu','ck','nd'
]);
const EN_SUFFIXES = ['tion','ness','ment','ight','ough','ould','ing','ful','less','able','ible'];

function englishScore(word) {
  const s = word.toLowerCase();
  if (s.length < 2) return 0;
  let hits = 0;
  for (let i = 0; i < s.length - 1; i++) {
    if (EN_BIGRAMS.has(s.slice(i, i + 2))) hits++;
  }
  if (EN_SUFFIXES.some(sfx => s.endsWith(sfx))) hits += 2;
  return hits / (s.length - 1);
}

const EN_WORDS = new Set([
  'the','be','to','of','and','a','in','that','have','it','for','not','on',
  'with','he','as','you','at','this','but','his','by','from','they',
  'we','say','she','or','an','will','my','one','all','would','there',
  'their','what','so','up','out','if','about','who','get','which','me',
  'when','make','can','like','time','no','just','him','know','take','into',
  'your','good','some','could','them','see','other','than','then','now',
  'look','only','come','its','over','think','also','back','after','use',
  'two','how','our','work','works','first','well','way','even','new','want',
  'any','give','day','most','us','hello','ok','yes','hi','hey','lol','omg',
  'thanks','please','sorry','help','okay','yeah','am','is','are','was',
  'has','had','did','got','let','put','set','try','ask','act','add',
  // NOTE: removed from EN_WORDS because they map to common Hebrew words:
  // 'cut'→בוא 'far'→כשר 'her'→יקר 'run'→רום 'car'→בשר 'pay'→פשט
  // 'sat'→דשא 'sun'→דום 'do'→גם 'go'→עם
  'big','bit','box','buy','eat','end','eye','few','fit',
  'fix','fly','fun','gun','hit','hot','job','key','kid','law','lay','leg',
  'lie','lot','low','map','may','met','mix','mom','net','old','own',
  'per','pop','pot','raw','red','rid','row','sad','saw','sea','sit',
  'six','sky','son','spy','sum','tax','tea','ten','too','top','van',
  'off','sunny',
  'via','war','win','won','age','ago','air','led','man','men','boy','girl',
  'here','come','from','said','each','many','been','were','them','im',
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
  'npm','cpu','gpu','ram','ssd','usb','api','url','sql','css','html','lmao',
  // Common words that pass all-chars-map-to-Hebrew check but are clearly English
  // (-e endings, common verbs/nouns without q/w and without our bigrams)
  'home','love','life','live','hope','cope','note','vote','move','more',
  'care','dare','bare','core','bore','sore','fore','gore','lore','wore',
  'fire','hire','tire','wire','sire','dire',
  'fine','line','mine','pine','vine','dine','sine',
  'side','ride','hide','tide','wide','aide',
  'bike','hike','type','ripe','pipe','hype','dive','five','hive','jive',
  'cake','bake','fake','lake','rake','sake',
  'game','fame','lame','came','tame','dame','name','same',
  'rule','role','pole','mole','hole','sole',
  'sale','male','pale','tale','vale',
  'date','fate','gate','hate','late','mate','rate',
  'bite','site','cite','kite','mite',
  'mode','code','node','rode',
  'bone','cone','tone','zone','lone','done','gone',
  'cure','lure','pure','sure','cute','mute','lute',
  'tube','cube','robe','vibe',
  'rise','size','wise',
  'cafe','safe','page','cage','rage','sage','wage',
  'term','germ','perm','norm','dorm','form','farm','harm',
  'fact','film','firm','fort',
  'camp','damp','lamp','ramp',
  'bump','dump','hump','jump','lump','pump',
  'bond','fond','pond',
  'barn','yarn','earn',
  'real','meal','deal','heal','feel','feed','seed',
  'cool','fool','pool','tool','fuel','duel',
  'face','race','pace','lace','mace','base','case','vase',
  'find','kind','mind','bind',
  'able','ago','ace','ice','eve','ore','ego','ado',
  'ex','ox','vs','id','pc','tv','dr','mr','ms','jr','sr',
  // Words freed when cut/far/her removed — add English words that could pair with them
  // Common -ain, -air, -ear, -ain words
  'hair','fair','pair','main','rain','pain','gain','vain','train','brain','plain','grain','chain',
  'dear','fear','hear','near','year','bear','tear','gear','rear','pear',
  'mean','lean','bean','dean','clean',
  // Common past tenses / adjectives not caught by bigrams
  'made','gave','kept','sent','felt','great','short','close','price','paper','money',
  'span','plan','scan','clan','sort','born','corn','horn','torn','dark','park','bark','mark',
  'star','scar','sharp','smart','start','spark',
  'nice','fresh','crisp','clear','clean','chief',
  'city','pity','body','baby','lady','navy',
  'open','even','seven','often','given','taken','risen','fallen',
  'reason','season','person','lesson','prison','garden',
  'cover','river','liver','never','fever','peter',
  'given','risen','driven','riven',
  'brain','drain','grain','sprain','strain',
  'paper','taper','vapor','caper',
  'sport','fort','sort','port','mort',
  'third','bird','nerd','herd',
  'belt','melt','pelt','felt','dealt',
  'spent','meant','lent','bent','rent','cent','dent','gent','tent',
  'brand','grand','grant','plant','slant','chant',
  'break','speak','sneak','freak','creak',
  'block','clock','flock','stock','knock','shock',
  'drink','think','blink','brink','clink','stink','shrink',
  'grass','class','glass','brass','crass','mass','pass',
  'press','dress','stress','bless','chess',
  'spoke','broke','choke','smoke','stroke',
  'froze','those','chose','prose','close',
  'grain','sprain','strain','train','brain','drain',
  'storm','dorm','norm','form','farm','charm','alarm',
  'floor','door','poor','moor','lore','gore','bore','core','fore','more','sore','tore','wore',
  // Compensate for removing 'do'→גם and 'go'→עם
  'does','goes',
  // Common words that pass all-chars-Hebrew check and have no bigram match
  // (bigrams st/nd/ld/ll/oo/ee/ng/ck already cover huge categories)
  'next','before','until','head','nose','read','lead','dead','skin','blue',
  'pink','gray','four','nine','pore','task','mask','glory','team','item',
  'data','beta','meta','info','menu','user','idea','human','super','crazy',
  'topic','extra','photo','video','media','email','login','admin',
  // Short English words that pass final-form check but map to no real Hebrew word
  // (ran/tan/bat/rag/reg intentionally kept out — they ARE real Hebrew and should be detectable)
  'bug','rug','dug','beg','peg','pro','duo','nap','gap','cap','rap',
  'tab','nab','grab','crab','scab','snag','drag','brag',
  // Double-consonant words — not caught by bigrams (nn/mm/rr/ss/zz/tt)
  'miss','boss','toss','moss','fuss','buzz','jazz','fuzz','fizz',
  'carry','merry','berry','ferry','hurry',
  'funny','bunny','penny',
  'runner','dinner','inner','summer','hammer',
  'common','cannot','banner','manner','mirror',
  'letter','bitter','butter','matter','button','bottom'
]);

// ── Core detection ────────────────────────────────────────────

function hasHebrew(text) { return HEBREW_RE.test(text); }
function convertToHebrew(text) { return [...text].map(c => EN_TO_HE[c] || c).join(''); }
function convertToEnglish(text) { return [...text].map(c => HE_TO_EN[c] || c).join(''); }

// Hebrew final-form letters: ך ם ן ף ץ
// In valid Hebrew orthography these can ONLY appear at the LAST position of a word.
// English words like 'bit'→נ[ן]א, 'lot'→[ך][ם]א, 'hot'→י[ם]א fail this check —
// eliminating the vast majority of false positives from short English words.
const FINAL_FORMS = new Set(['ך','ם','ן','ף','ץ']);

function wordCouldBeHebrew(word) {
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;

  // Learned data overrides heuristics
  if (learnedEnglish.has(lower)) return false;
  if (learnedHebrew.has(lower)) return true;

  if (EN_WORDS.has(lower)) return false;
  if (englishScore(lower) >= 0.15) return false;

  // Every character must map to a Hebrew Unicode character
  // Note: 'w'→"'" and 'q'→"/" are NOT Hebrew, so words with w/q fail here (correct)
  const mapped = [...lower].map(c => EN_TO_HE[c]);
  if (!mapped.every(c => c !== undefined && HEBREW_RE.test(c))) return false;

  // Final-form letters may only appear at the last position of a word.
  // Any match in a non-final position means this can't be valid Hebrew.
  for (let i = 0; i < mapped.length - 1; i++) {
    if (FINAL_FORMS.has(mapped[i])) return false;
  }

  return true;
}

function extractWords(text) {
  return text.trim().split(/\s+/)
    .map(w => w.replace(/^[?!()\[\]{}]+|[?!()\[\]{}]+$/g, ''))
    .filter(w => /^[a-z,;.']+$/i.test(w) && w.length >= 2);
}

// Short common English words that also appear in Hebrew-keyboard sentences.
// These act as "bridges" — they don't break the consecutive run but don't
// count toward the minimum Hebrew-word threshold either.
const PASSTHROUGH = new Set([
  'up','no','ok','hi','so','or','an','be','in','at','by','as','if',
  'he','me','we','us','it','to','on','am','is','do','go','of','my'
]);

// ── Cursor-aware text extraction ──────────────────────────────
function getTextBeforeCursor(el) {
  try {
    if (el.isContentEditable) {
      const doc = el.ownerDocument || document;
      const sel = doc.getSelection();
      if (sel && sel.rangeCount) {
        const anchor = sel.getRangeAt(0).startContainer;
        // Only use cursor position if it's inside el
        if (el.contains(anchor)) {
          const range = doc.createRange();
          range.selectNodeContents(el);
          range.setEnd(anchor, sel.getRangeAt(0).startOffset);
          return range.toString();
        }
      }
      return el.innerText || el.textContent || '';
    }
    const pos = el.selectionStart ?? el.value.length;
    return el.value.slice(0, pos);
  } catch {
    return el.isContentEditable ? (el.innerText || '') : (el.value || '');
  }
}

function analyze(el) {
  const rawText = getTextBeforeCursor(el);
  if (!rawText || rawText.trim().length < 3) return null;

  const text = rawText.slice(-600);
  const textHasHebrew = hasHebrew(text);

  // Case 1: Hebrew characters with final-form letters in non-final positions.
  // Real Hebrew NEVER starts a word with ך ם ן ף ץ — those only appear at word-end.
  // On the Hebrew keyboard, pressing l/i/o/;/. produces exactly those letters, so
  // finding them at position 0 of a word is an unambiguous wrong-keyboard signal.
  if (textHasHebrew) {
    const allWords = text.trim().split(/\s+/);
    const run1 = [];
    for (let i = allWords.length - 1; i >= 0; i--) {
      const w = allWords[i];
      if (HEBREW_RE.test(w) || w === "'") {
        run1.unshift(w);
      } else if (run1.length > 0 && w.length <= 2) {
        run1.unshift(w); // short English bridge between Hebrew words
      } else if (run1.length === 0) {
        continue; // skip trailing non-Hebrew
      } else {
        break;
      }
    }

    const badCount = run1.filter(w => {
      const heChars = [...w].filter(c => HEBREW_RE.test(c));
      return heChars.length >= 2 && heChars.slice(0, -1).some(c => FINAL_FORMS.has(c));
    }).length;

    if (badCount >= 2 && run1.length >= 2) {
      const original = run1.join(' ');
      const converted = convertToEnglish(original);
      if (converted.trim().length >= 3 && !hasHebrew(converted)) {
        return {
          type: 'hebrew_as_english',
          message: 'Typing in the wrong layout? This might be English:',
          original,
          converted,
          btnLabel: 'Convert to English',
          words: run1.filter(w => HEBREW_RE.test(w))
        };
      }
    }
  }

  // Case 2: English-letter words at end that look like Hebrew keyboard input.
  // Walk backwards; allow PASSTHROUGH words as bridges between Hebrew-like words.
  const words = extractWords(text);
  const run = [];
  let gapBuffer = []; // buffered passthrough words not yet committed to run

  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    if (wordCouldBeHebrew(w)) {
      // Flush any buffered gap words only if they're bridging (run already has Hebrew words)
      if (gapBuffer.length > 0 && run.length > 0) {
        run.unshift(...gapBuffer);
      }
      gapBuffer = [];
      run.unshift(w);
    } else if (PASSTHROUGH.has(w.toLowerCase()) && gapBuffer.length < 2) {
      gapBuffer.unshift(w); // collect as potential bridge; don't commit yet
    } else {
      break;
    }
  }
  // Flush any leading PASSTHROUGH words that precede the Hebrew run
  // e.g. "to tbh rumv" — "to" was buffered before "tbh" was found
  if (gapBuffer.length > 0 && run.length > 0) {
    run.unshift(...gapBuffer);
  }

  const hebrewCount = run.filter(w => wordCouldBeHebrew(w)).length;

  // Require 3 consecutive Hebrew-like words in pure-English context to avoid
  // false positives from short English words (ran, tan, bat, rag…) that happen
  // to pass the Hebrew check. Drop to 1 when text already has Hebrew chars —
  // clear sign the user is in Hebrew-keyboard context (e.g. "האם זה kt").
  const minRun = textHasHebrew ? 1 : 2;

  if (hebrewCount >= minRun) {
    const runText = run.join(' ');
    // Preserve trailing punctuation (?, !) from the last word in the original text
    const lastWord = run[run.length - 1];
    const escaped = lastWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const trailingPunct = (text.match(new RegExp(escaped + '([?!]+)', 'i')) || [])[1] || '';
    const original = runText + trailingPunct;
    const converted = convertToHebrew(runText.toLowerCase()) + trailingPunct;
    if (hasHebrew(converted)) {
      return {
        type: 'english_as_hebrew',
        message: 'Typing in the wrong layout? This might be Hebrew:',
        original,
        converted,
        btnLabel: 'Convert to Hebrew',
        words: run.filter(w => wordCouldBeHebrew(w))
      };
    }
  }

  return null;
}

// ── UI ────────────────────────────────────────────────────────

const STYLES = `
  #kld-toast {
    position: fixed;
    top: 16px; right: 16px;
    z-index: 2147483647;
    background: #16213e;
    color: #e2e8f0;
    border: 1px solid #3b82f6;
    border-radius: 12px;
    padding: 14px 16px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.55);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    max-width: 340px; min-width: 260px;
    display: flex; flex-direction: column; gap: 10px;
    animation: kld-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: all;
    cursor: grab;
    user-select: none;
  }
  #kld-toast.kld-dragging { cursor: grabbing; }
  @keyframes kld-in {
    from { opacity: 0; transform: translateY(-12px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .kld-dragbar {
    font-size: 10px; color: #334155; text-align: center;
    letter-spacing: 2px; margin-bottom: -4px; cursor: grab;
  }
  .kld-header { display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 13px; color: #94a3b8; cursor: grab; }
  .kld-preview {
    background: #0f172a; border-radius: 7px; padding: 8px 12px;
    font-size: 16px; unicode-bidi: plaintext; direction: auto;
    color: #7dd3fc; word-break: break-word; line-height: 1.5;
    cursor: text; user-select: text;
  }
  .kld-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .kld-hint { font-size: 10px; color: #475569; }
  .kld-btn {
    border: none; border-radius: 7px; padding: 7px 12px;
    font-size: 12px; font-weight: 600; cursor: pointer;
    transition: opacity 0.15s, transform 0.1s; line-height: 1;
  }
  .kld-btn:hover  { opacity: 0.85; transform: translateY(-1px); }
  .kld-btn:active { transform: translateY(0); }
  .kld-primary  { background: #3b82f6; color: #fff; flex: 1; }
  .kld-wrong    { background: #1e293b; color: #f87171; border: 1px solid #f8717155; }
  .kld-dismiss  { background: #1e293b; color: #94a3b8; padding: 7px 10px; }
  .kld-copy     { background: #1e293b; color: #a78bfa; border: 1px solid #a78bfa55; }

  @keyframes kld-pulse {
    0%, 100% { box-shadow: 0 4px 16px rgba(59,130,246,0.35); }
    50%       { box-shadow: 0 4px 24px rgba(59,130,246,0.7), 0 0 0 5px rgba(59,130,246,0.15); }
  }
  #kld-recall {
    position: fixed;
    top: 16px; right: 16px;
    z-index: 2147483646;
    background: #1e3a5f;
    border: 2px solid #3b82f6;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px; font-weight: 700; color: #93c5fd;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    animation: kld-pulse 2s ease-in-out infinite;
    display: flex; align-items: center; gap: 6px;
    max-width: 260px;
    cursor: grab; user-select: none;
  }
  #kld-recall.kld-dragging { cursor: grabbing; }
  #kld-recall:hover { opacity: 0.9; }
  .kld-recall-preview {
    font-size: 12px; font-weight: 400; color: #7dd3fc;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 150px; direction: rtl; unicode-bidi: plaintext;
    cursor: pointer;
  }
  .kld-recall-count {
    font-size: 10px; font-weight: 700; color: #3b82f6;
    background: #1e3a5f; border-radius: 4px; padding: 1px 5px; flex-shrink: 0;
  }
  .kld-recall-off {
    background: none; border: none; font-size: 13px; cursor: pointer;
    color: #475569; padding: 0 2px; line-height: 1; flex-shrink: 0;
  }
  .kld-recall-off:hover { color: #f87171; }
`;

let activeToast = null;
let lastDetection = null;
let lastElement = null;
let recallBtn = null;
let dismissedSignature = null; // signature of last user-dismissed detection

// ── Drag & position ───────────────────────────────────────────

function getDefaultPos() {
  return { top: 16, left: window.innerWidth - 360 };
}

function applyPos(el) {
  const pos = toastPos || getDefaultPos();
  el.style.top   = Math.max(0, Math.min(pos.top,  window.innerHeight - 60)) + 'px';
  el.style.left  = Math.max(0, Math.min(pos.left, window.innerWidth  - 60)) + 'px';
  el.style.right = 'auto';
}

function makeDraggable(el) {
  let startX, startY, startLeft, startTop;

  el.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startLeft = rect.left; startTop = rect.top;
    el.style.right = 'auto';
    el.classList.add('kld-dragging');

    const onMove = e => {
      const left = Math.max(0, Math.min(window.innerWidth  - el.offsetWidth,  startLeft + e.clientX - startX));
      const top  = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, startTop  + e.clientY - startY));
      el.style.left = left + 'px';
      el.style.top  = top  + 'px';
    };
    const onUp = () => {
      el.classList.remove('kld-dragging');
      document.removeEventListener('mousemove', onMove);
      const rect = el.getBoundingClientRect();
      toastPos = { top: rect.top, left: rect.left };
      try { chrome.storage.local.set({ toastPos }).catch(() => {}); } catch {}
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
  });
}

function injectStyles() {
  if (document.getElementById('kld-styles')) return;
  const s = document.createElement('style');
  s.id = 'kld-styles';
  s.textContent = STYLES;
  (document.head || document.documentElement).appendChild(s);
}

// Show toast, OR silently update recall button if the run is long (≥5 Hebrew words).
// Long detections just pulse the recall button — they don't interrupt typing.
function showToast(element, detection) {
  if (!detectionEnabled) return;

  // Don't re-show a toast the user just dismissed (same detected words)
  const sig = detection.words.join('|');
  if (sig && sig === dismissedSignature) {
    // Silently keep recall button updated
    lastDetection = detection;
    lastElement = element;
    if (!recallBtn) showRecallBtn();
    return;
  }

  // Long run → silent: just pulse the recall button, don't interrupt typing
  const isLong = detection.words.length >= 10;
  if (isLong) {
    const prevSig = lastDetection ? lastDetection.words.join('|') : '';
    lastDetection = detection;
    lastElement = element;
    // Only rebuild recall button if the detected text actually changed
    if (sig !== prevSig) { hideRecallBtn(); showRecallBtn(); }
    else if (!recallBtn) showRecallBtn();
    return;
  }

  // Only apply word-count guard for the SAME element to avoid blocking cross-field detections
  if (activeToast && lastDetection && lastElement === element) {
    if (detection.words.length < lastDetection.words.length) return;
    if (lastDetection === detection) return;
  }
  lastDetection = detection;
  lastElement = element;
  dismissedSignature = null;
  hideRecallBtn();
  if (activeToast) { activeToast.remove(); activeToast = null; }
  injectStyles();

  stats.detected++;
  try { chrome.storage.local.set({ stats }).catch(() => {}); } catch {}

  const toast = document.createElement('div');
  toast.id = 'kld-toast';
  toast.innerHTML = `
    <div class="kld-dragbar">⠿ drag to move</div>
    <div class="kld-header"><span>⌨️</span><span>${detection.message}</span></div>
    <div class="kld-preview">${escapeHtml(detection.converted)}</div>
    <div class="kld-actions">
      <button class="kld-btn kld-primary">${detection.btnLabel}</button>
      <button class="kld-btn kld-copy" title="Copy to clipboard">Copy</button>
      <button class="kld-btn kld-wrong" title="Not Hebrew — teach KeyLang">✗ Not Hebrew</button>
      <button class="kld-btn kld-dismiss" title="Dismiss">✕</button>
    </div>
    <div class="kld-hint">Drag to move · Select text + Alt+Shift+K to convert manually</div>
  `;

  // Prevent all buttons from stealing focus away from the editor
  toast.querySelectorAll('.kld-btn').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
  });

  toast.querySelector('.kld-primary').addEventListener('click', () => {
    const ok = applyConversion(element, detection);
    if (detection.words.length > 0) saveFeedback(detection.words, true);
    if (ok) {
      const kbShortcut = /mac/i.test(navigator.userAgent) ? '⌘+Space' : 'Alt+Shift';
      showFeedbackConfirm(`✓ Text fixed! Now press ${kbShortcut} to switch your keyboard back to English`);
    } else {
      navigator.clipboard.writeText(detection.converted).then(() => {
        showFeedbackConfirm('✓ Copied! Delete your text and press Ctrl+V to paste');
      }).catch(() => {
        showFeedbackConfirm('Conversion: ' + detection.converted);
      });
    }
    removeToast(false);
  });

  toast.querySelector('.kld-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(detection.converted).catch(() => {});
    showFeedbackConfirm('✓ Copied to clipboard!');
  });

  toast.querySelector('.kld-wrong').addEventListener('click', () => {
    saveFeedback(detection.words, false);
    const sample = detection.words.slice(0, 3).join(', ');
    showFeedbackConfirm(`✓ Noted — "${sample}${detection.words.length > 3 ? '…' : ''}" marked as English`);
    removeToast(false);
  });

  toast.querySelector('.kld-dismiss').addEventListener('click', () => {
    dismissedSignature = sig; // remember — don't re-show for same words
    removeToast(true);
  });

  applyPos(toast);
  makeDraggable(toast);
  (document.body || document.documentElement).appendChild(toast);
  activeToast = toast;
}

function showFeedbackConfirm(message) {
  injectStyles();
  const el = document.createElement('div');
  el.id = 'kld-toast';
  el.style.cssText = 'border-color:#22c55e!important;cursor:default';
  el.innerHTML = `<div class="kld-header"><span>✓</span><span style="color:#86efac">${message}</span></div>`;
  applyPos(el);
  (document.body || document.documentElement).appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function removeToast(showRecall = true) {
  if (activeToast) { activeToast.remove(); activeToast = null; }
  if (showRecall && lastDetection) showRecallBtn();
}

function showRecallBtn() {
  if (recallBtn) { recallBtn.remove(); recallBtn = null; } // always rebuild for fresh preview
  injectStyles();
  recallBtn = document.createElement('div');
  recallBtn.id = 'kld-recall';
  const preview = lastDetection
    ? lastDetection.converted.slice(0, 18) + (lastDetection.converted.length > 18 ? '…' : '')
    : '';
  const wordCount = lastDetection ? lastDetection.words.length : 0;
  const countBadge = wordCount > 0 ? `<span class="kld-recall-count">${wordCount}w</span>` : '';
  recallBtn.innerHTML = `
    <span>⌨️</span>
    ${countBadge}
    <span class="kld-recall-preview" title="Click to show full detection">${escapeHtml(preview)}</span>
    <button class="kld-recall-off" title="Dismiss">✕</button>
  `;
  recallBtn.querySelector('.kld-recall-preview').addEventListener('click', () => {
    if (lastDetection && lastElement) {
      dismissedSignature = null; // allow re-show
      showToast(lastElement, lastDetection);
    }
  });
  recallBtn.querySelector('.kld-recall-off').addEventListener('click', e => {
    e.stopPropagation();
    hideRecallBtn();
  });
  applyPos(recallBtn);
  makeDraggable(recallBtn);
  (document.body || document.documentElement).appendChild(recallBtn);
}

function hideRecallBtn() {
  if (recallBtn) { recallBtn.remove(); recallBtn = null; }
}

document.addEventListener('keydown', e => {
  if (!e.altKey || !e.shiftKey || e.code !== 'KeyK') return;
  e.preventDefault();

  // Priority 1: if text is selected, convert the selection directly
  const sel = window.getSelection();
  const selectedText = sel && sel.toString().trim();
  if (selectedText && selectedText.length >= 2) {
    convertSelection(selectedText, sel);
    return;
  }

  // Priority 2: toggle last auto-detection toast
  if (activeToast) removeToast();
  else if (lastDetection && lastElement) showToast(lastElement, lastDetection);
});

// Convert any selected text on demand — works even when auto-detection missed the window
function convertSelection(text, sel) {
  // Clone the range NOW — clicking the button later will lose the selection
  const savedRange = (sel && sel.rangeCount) ? sel.getRangeAt(0).cloneRange() : null;

  let detection;

  if (hasHebrew(text)) {
    // Selected text is Hebrew → offer English conversion
    detection = {
      type: 'hebrew_detected',
      message: 'Convert selected Hebrew to English?',
      original: text,
      converted: convertToEnglish(text),
      btnLabel: 'Convert to English',
      words: []
    };
  } else {
    // Try interpreting as Hebrew keyboard input
    const words = extractWords(text);
    const converted = convertToHebrew(text.toLowerCase());
    if (hasHebrew(converted)) {
      detection = {
        type: 'english_as_hebrew',
        message: 'Convert selected text to Hebrew?',
        original: text,
        converted,
        btnLabel: 'Convert to Hebrew',
        words
      };
    }
  }

  if (!detection) {
    showFeedbackConfirm('Could not detect a language mismatch in selection.');
    return;
  }

  // Show toast and wire Convert to replace the actual selection
  lastDetection = detection;
  lastElement = document.activeElement;
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
      <button class="kld-btn kld-dismiss">✕</button>
    </div>
    <div class="kld-hint">Converting selection</div>
  `;

  // Prevent buttons from stealing focus so the selection stays intact
  toast.querySelectorAll('.kld-btn').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
  });

  toast.querySelector('.kld-primary').addEventListener('click', async () => {
    saveFeedback(detection.words, detection.type === 'english_as_hebrew');

    // Always write to clipboard first so fallback is always ready
    await navigator.clipboard.writeText(detection.converted).catch(() => {});

    if (!savedRange) {
      showFeedbackConfirm('✓ Copied! Select your text and press Ctrl+V to paste');
      return;
    }

    try {
      const doc = savedRange.startContainer.ownerDocument || document;

      // Find and focus the contenteditable
      let editorEl = savedRange.startContainer;
      if (editorEl.nodeType !== 1) editorEl = editorEl.parentElement;
      while (editorEl && !editorEl.isContentEditable) editorEl = editorEl.parentElement;
      if (editorEl) editorEl.focus();

      // Restore selection
      const sel = doc.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange.cloneRange());

      const before = editorEl ? (editorEl.innerText || editorEl.textContent || '') : '';

      // Try 1: native paste from real clipboard (best for Lexical/React editors)
      doc.execCommand('paste');
      if ((editorEl?.innerText || '') !== before) { removeToast(false); return; }

      // Try 2: insertText
      doc.execCommand('insertText', false, detection.converted);
      if ((editorEl?.innerText || '') !== before) { removeToast(false); return; }

      // Try 3: fake ClipboardEvent paste
      const dt = new DataTransfer();
      dt.setData('text/plain', detection.converted);
      (editorEl || doc.activeElement)?.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
      );
      if ((editorEl?.innerText || '') !== before) { removeToast(false); return; }

    } catch { /* stale range or permission error */ }

    // All methods failed — clipboard already has the text
    showFeedbackConfirm('✓ Copied! Select all (Ctrl+A) then paste (Ctrl+V)');
  });
  toast.querySelector('.kld-dismiss').addEventListener('click', () => removeToast(true));

  (document.body || document.documentElement).appendChild(toast);
  activeToast = toast;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Text conversion ───────────────────────────────────────────

function selectTextRange(el, idx, length) {
  const doc = el.ownerDocument || document;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let offset = 0, startNode, startOff, endNode, endOff;
  let node;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (!startNode && offset + len > idx) {
      startNode = node; startOff = idx - offset;
    }
    if (startNode && offset + len >= idx + length) {
      endNode = node; endOff = idx + length - offset;
      break;
    }
    offset += len;
  }
  if (!startNode || !endNode) return false;
  const range = doc.createRange();
  range.setStart(startNode, startOff);
  range.setEnd(endNode, endOff);
  const sel = doc.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

function applyConversion(el, detection) {
  const { original, converted } = detection;
  if (el.isContentEditable) {
    const doc = el.ownerDocument || document;
    const full = el.innerText || el.textContent || '';
    const idx = full.lastIndexOf(original);
    if (idx === -1) return false;
    // Editor keeps focus (mousedown.preventDefault on button), so just select + replace
    if (selectTextRange(el, idx, original.length)) {
      doc.execCommand('insertText', false, converted);
      if ((el.innerText || el.textContent || '') !== full) {
        lastDetection = null; hideRecallBtn(); return true;
      }
    }
    // execCommand didn't change the text — try fake paste (ProseMirror/Lexical editors)
    try {
      if (selectTextRange(el, idx, original.length)) {
        const dt = new DataTransfer();
        dt.setData('text/plain', converted);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        if ((el.innerText || el.textContent || '') !== full) {
          lastDetection = null; hideRecallBtn(); return true;
        }
      }
    } catch {}
    return false;
  } else {
    const pos = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, pos);
    const idx = before.lastIndexOf(original);
    if (idx === -1) return false;
    el.value = el.value.slice(0, idx) + converted + el.value.slice(idx + original.length);
    el.selectionStart = el.selectionEnd = idx + converted.length;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    lastDetection = null; hideRecallBtn();
    return true;
  }
}

// ── Input monitoring ──────────────────────────────────────────

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function attachTo(el) {
  if (el._kld) return;
  el._kld = true;
  const check = debounce(() => {
    if (!detectionEnabled) return;
    const detection = analyze(el);
    if (detection) showToast(el, detection);
  }, 700);
  el.addEventListener('input', check);
  el.addEventListener('keyup', check);
  el.addEventListener('compositionend', check);
}

// ── DOM observation ───────────────────────────────────────────

const SELECTOR = [
  'input[type="text"]','input[type="search"]','input[type="email"]',
  'input[type="url"]','input:not([type])',
  'textarea',
  '[contenteditable="true"]','[contenteditable=""]',
  '[role="textbox"]',    // Gmail, Outlook, Slack compose
  '[role="combobox"]',   // search boxes in many apps
  '[role="searchbox"]',  // WhatsApp search, etc.
  '[role="article"] [contenteditable]', // LinkedIn post composer
  '.ql-editor',          // Quill rich text editor (LinkedIn, Notion)
].join(', ');

document.querySelectorAll(SELECTOR).forEach(attachTo);

// Attach on focus — catches LinkedIn, Twitter, and other SPAs that build
// their compose boxes dynamically after the user clicks into them.
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (!el || el._kld) return;
  if (el.isContentEditable || el.matches?.(SELECTOR)) attachTo(el);
}, true);

// Fallback keyup — catches anything focusin missed
document.addEventListener('keyup', () => {
  const el = document.activeElement;
  if (!el || el._kld) return;
  if (el.isContentEditable || el.matches?.(SELECTOR)) attachTo(el);
}, true);

new MutationObserver(mutations => {
  for (const { type, addedNodes, target } of mutations) {
    if (type === 'childList') {
      for (const node of addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(SELECTOR)) attachTo(node);
        node.querySelectorAll?.(SELECTOR).forEach(attachTo);
      }
    } else if (type === 'attributes') {
      if (target.nodeType === 1 && target.matches?.(SELECTOR)) attachTo(target);
    }
  }
}).observe(document.documentElement, {
  childList: true, subtree: true,
  attributes: true, attributeFilter: ['contenteditable']
});

// Right-click context menu: "Fix with Kiko"
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'kiko-fix-selection' || !msg.text) return;
  // Use current selection if it still matches, otherwise pass null (popup shows but won't auto-replace)
  const sel = window.getSelection();
  const selText = sel && sel.toString().trim();
  convertSelection(msg.text, selText === msg.text.trim() ? sel : null);
});
