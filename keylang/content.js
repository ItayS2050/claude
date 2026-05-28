// ============================================================
// Kiko v3.3.1 – Hebrew ↔ English Layout Fixer
// content.js
// ============================================================
console.log('[Kiko] v3.3.1 loaded');

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
  if (/[֐-׿]/.test(he)) HE_TO_EN[he] = en;
}
HE_TO_EN["'"] = 'w'; // w-key on Hebrew keyboard produces apostrophe

const HEBREW_RE  = /[֐-׿]/;
const FINAL_FORMS = new Set(['ך','ם','ן','ף','ץ']);

// ── Storage & learned data ────────────────────────────────────
let learnedHebrew   = new Set();
let learnedEnglish  = new Set();
let stats           = { detected: 0, converted: 0, rejected: 0 };
let detectionEnabled = true;
let soundEnabled     = true;
let toastPos        = null;

async function loadLearned() {
  try {
    const d = await chrome.storage.local.get(
      ['learnedHebrew','learnedEnglish','stats','detectionEnabled','soundEnabled','toastPos']
    );
    learnedHebrew   = new Set(d.learnedHebrew  || []);
    learnedEnglish  = new Set(d.learnedEnglish || []);
    stats           = d.stats || { detected: 0, converted: 0, rejected: 0 };
    detectionEnabled = d.detectionEnabled !== false;
    soundEnabled     = d.soundEnabled !== false;
    toastPos        = d.toastPos || null;
  } catch {}
}

try {
  chrome.storage.onChanged.addListener(changes => {
    if ('detectionEnabled' in changes) {
      detectionEnabled = changes.detectionEnabled.newValue !== false;
      if (!detectionEnabled) { removeToast(false); hideHint(); }
    }
    if ('soundEnabled' in changes) soundEnabled = changes.soundEnabled.newValue !== false;
    if ('toastPos' in changes) toastPos = changes.toastPos.newValue;
  });
} catch {}

async function saveFeedback(words, isHebrew) {
  try {
    // Always normalise to lowercase so lookups in wordCouldBeHebrew() match
    const normalised = words.map(w => w.toLowerCase()).filter(Boolean);
    if (isHebrew) {
      normalised.forEach(w => { learnedHebrew.add(w); learnedEnglish.delete(w); });
      stats.converted++;
    } else {
      normalised.forEach(w => { learnedEnglish.add(w); learnedHebrew.delete(w); });
      stats.rejected++;
    }
    await chrome.storage.local.set({
      learnedHebrew:  [...learnedHebrew],
      learnedEnglish: [...learnedEnglish],
      stats
    });
  } catch {}
}

loadLearned();

// ── Common English words (used for Case 1 fallback detection) ────────────────
const COMMON_EN_WORDS = new Set([
  'the','a','an','in','on','at','to','of','is','it','be','as','by','or','do',
  'he','she','we','they','i','you','my','your','his','her','our','its','us','me','him',
  'and','but','if','not','no','yes','so','up','out','am',
  'what','how','why','when','where','who','which',
  'are','was','were','been','did','have','has','had','will','would','can','could',
  'may','might','shall','should','must','dont','cant','wont','im','its',
  'this','that','these','those','here','there','now','then','just','all','one',
  'hey','hi','ok','okay','sure','good','great','nice','thanks','please','sorry','cool',
  'with','from','for','about','like','also','very','too','more','some','any',
  'come','go','see','know','think','want','need','make','take','get','give','say',
  'time','day','way','back','after','before','again','work','help','wait','stop',
  'love','miss','hi','bye','yes','no','oh','wow','haha','lol',
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
  'hair','fair','pair','main','rain','pain','gain','vain','train','brain','plain','grain','chain',
  'dear','fear','hear','near','year','bear','tear','gear','rear','pear',
  'mean','lean','bean','dean','clean',
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
  'storm','dorm','norm','form','farm','charm','alarm',
  'floor','door','poor','moor','lore','gore','bore','core','fore','more','sore','tore','wore',
  'does','goes',
  'next','before','until','head','nose','read','lead','dead','skin','blue',
  'pink','gray','four','nine','pore','task','mask','glory','team','item',
  'data','beta','meta','info','menu','user','idea','human','super','crazy',
  'topic','extra','photo','video','media','email','login','admin',
  'bug','rug','dug','beg','peg','pro','duo','nap','gap','cap','rap',
  'tab','nab','grab','crab','scab','snag','drag','brag',
  'miss','boss','toss','moss','fuss','buzz','jazz','fuzz','fizz',
  'carry','merry','berry','ferry','hurry',
  'funny','bunny','penny',
  'runner','dinner','inner','summer','hammer',
  'common','cannot','banner','manner','mirror',
  'letter','bitter','butter','matter','button','bottom'
]);

// Short common words that act as bridges in a Hebrew-like run without counting toward threshold
const PASSTHROUGH = new Set([
  'up','no','ok','hi','so','or','an','be','in','at','by','as','if',
  'he','me','we','us','it','to','on','am','is','do','go','of','my'
]);

// ── Helper functions ──────────────────────────────────────────
function hasHebrew(t)        { return HEBREW_RE.test(t); }
function convertToHebrew(t)  { return [...t].map(c => EN_TO_HE[c]  || c).join(''); }
function convertToEnglish(t) { return [...t].map(c => HE_TO_EN[c] || c).join(''); }
function truncatePreview(text, maxWords = 9) {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + ' …';
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function wordCouldBeHebrew(word) {
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;
  if (learnedEnglish.has(lower)) return false;
  if (learnedHebrew.has(lower))  return true;
  if (EN_WORDS.has(lower))       return false;
  if (englishScore(lower) >= 0.20) return false;
  const mapped = [...lower].map(c => EN_TO_HE[c]);
  if (!mapped.every(c => c !== undefined && HEBREW_RE.test(c))) return false;
  // Final-form letters (ך ם ן ף ץ) only appear at word-end in valid Hebrew.
  // Finding one in a non-final position is an unambiguous wrong-keyboard signal.
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

// ── Cursor-aware text extraction ──────────────────────────────
function getTextBeforeCursor(el) {
  try {
    if (el.isContentEditable) {
      const doc = el.ownerDocument || document;
      const sel = doc.getSelection();
      if (sel && sel.rangeCount) {
        const anchor = sel.getRangeAt(0).startContainer;
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

// ── Core analysis ─────────────────────────────────────────────
// scanAll = true → don't slice (used for explicit user-triggered full scan)
function analyzeText(rawText, scanAll = false) {
  if (!rawText || rawText.trim().length < 3) return null;

  const text = scanAll ? rawText : rawText.slice(-2000);
  const textHasHebrew = hasHebrew(text);

  // ── Case 1: Hebrew characters typed while English keyboard layout was expected
  // Hebrew final-form letters (ך ם ן ף ץ) never appear at the START of a word.
  // When English is typed on a Hebrew keyboard, those keys (l i o ; .) map to
  // exactly those final-form letters — so finding them in non-final position is
  // an unambiguous signal the user was in the wrong layout.
  if (textHasHebrew) {
    const allWords = text.trim().split(/\s+/);
    const run1 = [];
    for (let i = allWords.length - 1; i >= 0; i--) {
      const w = allWords[i];
      if (HEBREW_RE.test(w) || w === "'") {
        run1.unshift(w);
      } else if (run1.length > 0 && w.length <= 2) {
        run1.unshift(w); // short English bridge word
      } else if (run1.length === 0) {
        continue;
      } else {
        break;
      }
    }

    const badCount = run1.filter(w => {
      const hc = [...w].filter(c => HEBREW_RE.test(c));
      return hc.length >= 2 && hc.slice(0, -1).some(c => FINAL_FORMS.has(c));
    }).length;

    if (run1.length >= 2) {
      const original  = run1.join(' ');
      const converted = convertToEnglish(original);
      if (converted.trim().length >= 3 && !hasHebrew(converted)) {
        // Strong signal: final-form Hebrew letters in wrong position (original check)
        const strongSignal = badCount >= 2;

        // Fallback signal: convert Hebrew → English and score how "English-like" it is.
        // Each word scores +2 if it's a common English word, +1 if it has a good
        // vowel ratio (20–70%) and no impossible consonant clusters. Threshold ≥ 3
        // prevents false positives from short accidental matches.
        let engScore = 0;
        if (!strongSignal) {
          const convWords = converted.split(/\s+/)
            .map(w => w.replace(/[^a-z]/gi, '').toLowerCase())
            .filter(w => w.length >= 2);
          engScore = convWords.reduce((acc, w) => {
            if (COMMON_EN_WORDS.has(w)) return acc + 2;
            if (w.length < 3 || !/[aeiou]/.test(w)) return acc;
            if (/[^aeiou]{4,}/.test(w)) return acc; // 4+ consecutive consonants = not English
            const r = (w.match(/[aeiou]/g) || []).length / w.length;
            return (r >= 0.20 && r <= 0.70) ? acc + 1 : acc;
          }, 0);
        }

        if (strongSignal || engScore >= 3) {
          return {
            type:     'hebrew_as_english',
            message:  'Wrong layout? Looks like English:',
            original, converted,
            btnLabel: 'Fix → English',
            rejectLabel: 'Not English',
            words: run1.filter(w => HEBREW_RE.test(w))
          };
        }
      }
    }
  }

  // ── Case 2: English characters typed while Hebrew keyboard layout was expected
  const words = extractWords(text);
  const minRun = textHasHebrew ? 1 : 2;

  // Collect ALL contiguous runs of Hebrew-candidate words (forward pass),
  // then pick the LAST one (closest to cursor). This ensures words at the
  // START of mixed Hebrew/Latin text are not silently skipped.
  const allRuns = [];
  let curRun = [], curGap = [];
  for (const w of words) {
    if (wordCouldBeHebrew(w)) {
      if (curGap.length > 0) curRun.push(...curGap);
      curGap = [];
      curRun.push(w);
    } else if (PASSTHROUGH.has(w.toLowerCase()) && curGap.length < 2 && curRun.length > 0) {
      curGap.push(w);
    } else {
      if (curRun.length > 0) allRuns.push([...curRun]);
      curRun = []; curGap = [];
    }
  }
  if (curRun.length > 0) allRuns.push(curRun);

  // Use the last (most recent) run that meets the minimum threshold
  const run = [...allRuns].reverse().find(r => r.filter(w => wordCouldBeHebrew(w)).length >= minRun) || [];
  const hebrewCount = run.filter(w => wordCouldBeHebrew(w)).length;

  if (hebrewCount >= minRun) {
    const runText  = run.join(' ');
    const lastWord = run[run.length - 1];
    const escaped  = lastWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const punct    = (text.match(new RegExp(escaped + '([?!]+)', 'i')) || [])[1] || '';
    const original  = runText + punct;
    const converted = convertToHebrew(runText.toLowerCase()) + punct;
    if (hasHebrew(converted)) {
      return {
        type:      'english_as_hebrew',
        message:   'Wrong layout? Looks like Hebrew:',
        original, converted,
        btnLabel:  'Fix → Hebrew',
        rejectLabel: 'Not Hebrew',
        words:     run.filter(w => wordCouldBeHebrew(w)),
        moreRuns:  allRuns.length > 1  // flag: there may be other mismatched runs
      };
    }
  }

  return null;
}

function analyze(el) {
  return analyzeText(getTextBeforeCursor(el));
}

function analyzeFullField(el) {
  const fullText = el.isContentEditable
    ? (el.innerText || el.textContent || '')
    : (el.value || '');
  return analyzeText(fullText, true);
}

// ── Text replacement ──────────────────────────────────────────

function selectTextRange(el, idx, length) {
  const doc    = el.ownerDocument || document;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let offset = 0, startNode, startOff, endNode, endOff, node;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (!startNode && offset + len > idx) {
      startNode = node; startOff = idx - offset;
    }
    if (startNode && offset + len >= idx + length) {
      endNode = node; endOff = idx + length - offset; break;
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

// Returns: true (success) | false (failed, caller should do clipboard fallback)
// MUST be called synchronously within a user gesture handler —
// execCommand('insertText') loses user-activation context after any await.
function applyConversion(el, detection) {
  const { original, converted } = detection;

  // ── input / textarea — direct value mutation always works ────
  if (!el.isContentEditable) {
    const pos    = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, pos);
    const idx    = before.lastIndexOf(original);
    if (idx === -1) return false;
    el.value = el.value.slice(0, idx) + converted + el.value.slice(idx + original.length);
    el.selectionStart = el.selectionEnd = idx + converted.length;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // ── contenteditable ──────────────────────────────────────────
  const doc    = el.ownerDocument || document;
  const before = el.innerText || el.textContent || '';
  const idx    = before.lastIndexOf(original);
  if (idx === -1) return false;

  el.focus();

  // Lexical editors (WhatsApp Web) maintain their own internal cursor state.
  // selectTextRange sets the DOM selection, but Lexical won't use it unless we
  // fire 'selectionchange' first — that's the signal Lexical listens to in order
  // to sync its internal cursor from the DOM. After syncing, execCommand fires
  // a trusted beforeinput with targetRanges, and Lexical replaces the right text.
  // We return immediately without checking the DOM (Lexical updates async via React,
  // so any immediate DOM check would fail and trigger duplicate insertions).
  const isLexical = el.hasAttribute('data-lexical-editor') ||
                    !!el.closest?.('[data-lexical-editor]');
  if (isLexical) {
    if (selectTextRange(el, idx, original.length)) {
      try { document.dispatchEvent(new Event('selectionchange')); } catch {}
      doc.execCommand('insertText', false, converted);
    }
    return true;
  }

  // For non-Lexical contenteditable: use synchronous DOM check to detect success
  // and fall through to the next strategy only if the previous one truly failed.
  function replaced() {
    const after = el.innerText || el.textContent || '';
    return after !== before && after.slice(idx, idx + original.length) !== original;
  }

  // Strategy 1 — execCommand insertText (standard contenteditable, Gmail, Slack).
  if (selectTextRange(el, idx, original.length)) {
    doc.execCommand('insertText', false, converted);
    if (replaced()) return true;
  }

  // Strategy 2 — synthetic ClipboardEvent (some older ProseMirror editors).
  try {
    if (selectTextRange(el, idx, original.length)) {
      const dt = new DataTransfer();
      dt.setData('text/plain', converted);
      el.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt, bubbles: true, cancelable: true
      }));
      if (replaced()) return true;
    }
  } catch {}

  // Strategy 3 — beforeinput insertText (Slate and other non-Lexical editors).
  try {
    if (selectTextRange(el, idx, original.length)) {
      el.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true, cancelable: true,
        inputType: 'insertText',
        data: converted
      }));
      if (replaced()) return true;
    }
  } catch {}

  return false;
}

// ── Styles ────────────────────────────────────────────────────
const STYLES = `
  #kld-toast {
    position: fixed;
    z-index: 2147483647;
    background: #16213e;
    color: #e2e8f0;
    border: 1px solid #3b82f6;
    border-radius: 12px;
    padding: 12px 14px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.55);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    max-width: 320px; min-width: 240px;
    display: flex; flex-direction: column; gap: 9px;
    animation: kld-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: all;
    cursor: grab;
    user-select: none;
  }
  #kld-toast.kld-dragging { cursor: grabbing; }
  @keyframes kld-in {
    from { opacity: 0; transform: translateY(-10px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0)     scale(1); }
  }
  .kld-header {
    display: flex; align-items: center; gap: 7px;
    font-size: 12px; font-weight: 600; color: #94a3b8; cursor: grab;
  }
  .kld-preview {
    background: #0f172a; border-radius: 7px; padding: 8px 12px;
    font-size: 15px; unicode-bidi: plaintext; direction: auto;
    color: #7dd3fc; word-break: break-word; line-height: 1.5;
    cursor: text; user-select: text;
  }
  .kld-actions { display: flex; gap: 6px; align-items: center; }
  .kld-btn {
    border: none; border-radius: 7px; padding: 7px 11px;
    font-size: 12px; font-weight: 600; cursor: pointer;
    transition: opacity 0.15s, transform 0.1s; line-height: 1;
    white-space: nowrap;
  }
  .kld-btn:hover  { opacity: 0.85; transform: translateY(-1px); }
  .kld-btn:active { transform: translateY(0); }
  .kld-primary    { background: #3b82f6; color: #fff; flex: 1; }
  .kld-reject     { background: #1e293b; color: #f87171; border: 1px solid #f8717140; }
  .kld-dismiss    { background: none; border: none; color: #64748b; padding: 4px 6px; font-size: 14px; line-height: 1; }
  .kld-dismiss:hover { color: #e2e8f0; }
  .kld-sound-btn  { background: none; border: none; padding: 4px 5px; font-size: 14px; line-height: 1; cursor: pointer; }
  .kld-footer     { display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #334155; }
  .kld-pause-btn  { background: none; border: none; color: #475569; font-size: 10px; cursor: pointer; padding: 0; }
  .kld-pause-btn:hover { color: #f87171; }

  @keyframes kld-pulse {
    0%,100% { box-shadow: 0 4px 16px rgba(59,130,246,0.3); }
    50%      { box-shadow: 0 4px 24px rgba(59,130,246,0.65), 0 0 0 4px rgba(59,130,246,0.12); }
  }
  #kld-hint {
    position: fixed;
    z-index: 2147483646;
    background: #1e3a5f;
    border: 1.5px solid #3b82f6;
    border-radius: 20px;
    padding: 6px 12px 6px 10px;
    font-size: 12px; font-weight: 600; color: #93c5fd;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    animation: kld-pulse 2.5s ease-in-out infinite;
    display: flex; align-items: center; gap: 6px;
    cursor: pointer; user-select: none;
    max-width: 220px;
  }
  #kld-hint:hover { opacity: 0.9; }
  #kld-hint.kld-dragging { cursor: grabbing; }
  .kld-hint-text {
    font-size: 11px; font-weight: 400; color: #7dd3fc;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 130px; unicode-bidi: plaintext;
  }
  .kld-hint-close {
    background: none; border: none; font-size: 12px; cursor: pointer;
    color: #475569; padding: 0 0 0 2px; line-height: 1; flex-shrink: 0;
  }
  .kld-hint-close:hover { color: #94a3b8; }
`;

// ── UI state ──────────────────────────────────────────────────
let activeToast        = null;
let lastDetection      = null;
let lastElement        = null;
let hintEl             = null;
let dismissedSignature = null;

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
  let sx, sy, sl, st;
  el.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY; sl = r.left; st = r.top;
    el.classList.add('kld-dragging');
    el.style.right = 'auto';
    const onMove = e => {
      el.style.left = Math.max(0, Math.min(window.innerWidth  - el.offsetWidth,  sl + e.clientX - sx)) + 'px';
      el.style.top  = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, st + e.clientY - sy)) + 'px';
    };
    const onUp = () => {
      el.classList.remove('kld-dragging');
      document.removeEventListener('mousemove', onMove);
      const r2 = el.getBoundingClientRect();
      toastPos = { top: r2.top, left: r2.left };
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

// ── Detection sound ───────────────────────────────────────────
// Sound is played via an offscreen document (background.js manages
// it). AudioContext is blocked in content scripts by Chrome's
// autoplay policy; offscreen documents don't have this restriction.

function playDetectionSound() {
  if (!soundEnabled) return;
  try { chrome.runtime.sendMessage({ type: 'kiko-play-sound' }).catch(() => {}); } catch {}
}

// ── Toast ─────────────────────────────────────────────────────

function showToast(element, detection, forceShow = false) {
  if (!detectionEnabled) return;

  const sig = detection.words.join('|');

  // Don't re-show a detection the user explicitly dismissed
  if (!forceShow && sig && sig === dismissedSignature) {
    lastDetection = detection;
    lastElement   = element;
    if (!hintEl) showHint();
    return;
  }

  // Very long runs (≥10 words) just pulse the hint bubble — don't cover the screen.
  // forceShow = true bypasses this so hint-click always opens the full toast.
  if (!forceShow && detection.words.length >= 10) {
    const prevSig = lastDetection ? lastDetection.words.join('|') : '';
    lastDetection = detection;
    lastElement   = element;
    if (sig !== prevSig) { hideHint(); showHint(); }
    else if (!hintEl)    showHint();
    return;
  }

  // Guard: don't regress to a smaller detection on the same element
  if (activeToast && lastDetection && lastElement === element) {
    if (detection.words.length < lastDetection.words.length) return;
  }

  lastDetection      = detection;
  lastElement        = element;
  dismissedSignature = null;
  hideHint();
  if (activeToast) { activeToast.remove(); activeToast = null; }
  injectStyles();

  stats.detected++;
  try { chrome.storage.local.set({ stats }).catch(() => {}); } catch {}
  playDetectionSound();

  const toast = document.createElement('div');
  toast.id = 'kld-toast';
  toast.innerHTML = `
    <div class="kld-header">
      <span>⌨️</span>
      <span style="flex:1">${escapeHtml(detection.message)}</span>
      <button class="kld-btn kld-sound-btn" title="Toggle sound">${soundEnabled ? '🔔' : '🔕'}</button>
      <button class="kld-btn kld-dismiss" title="Dismiss (Esc)">✕</button>
    </div>
    <div class="kld-preview">${escapeHtml(truncatePreview(detection.converted))}</div>
    <div class="kld-actions">
      <button class="kld-btn kld-primary">${escapeHtml(detection.btnLabel)}</button>
      <button class="kld-btn kld-reject">${escapeHtml(detection.rejectLabel)}</button>
    </div>
    <div class="kld-footer">
      <span>Drag · Alt+Shift+K to scan field</span>
      <button class="kld-pause-btn" title="Pause auto-detection">⏸ Pause Kiko</button>
    </div>
  `;

  // Prevent buttons from stealing focus from the editor
  toast.querySelectorAll('.kld-btn, .kld-pause-btn').forEach(btn =>
    btn.addEventListener('mousedown', e => e.preventDefault())
  );

  // Sound toggle — inline, no popup needed
  toast.querySelector('.kld-sound-btn').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    toast.querySelector('.kld-sound-btn').textContent = soundEnabled ? '🔔' : '🔕';
    try { chrome.storage.local.set({ soundEnabled }).catch(() => {}); } catch {}
  });

  // Pause Kiko — disable detection until user re-enables from popup
  toast.querySelector('.kld-pause-btn').addEventListener('click', () => {
    detectionEnabled = false;
    try { chrome.storage.local.set({ detectionEnabled: false }).catch(() => {}); } catch {}
    removeToast(false);
    hideHint();
    showConfirm('Kiko paused — re-enable from the 🦜 popup');
  });

  // Primary — fix the text in place
  toast.querySelector('.kld-primary').addEventListener('click', async () => {
    // applyConversion is synchronous — must run before any await to keep
    // user activation for execCommand('insertText').
    const ok = applyConversion(element, detection);
    saveFeedback(detection.words, true);
    removeToast(false);
    if (ok) {
      const kb = /mac/i.test(navigator.userAgent) ? '⌘+Space' : 'Alt+Shift';
      showConfirm(`✓ Fixed! Switch keyboard: ${kb}`);
      // Re-scan after a short delay to catch any remaining mismatched words
      // (e.g. a sentence with both Hebrew text and Latin-on-Hebrew-keyboard words)
      setTimeout(() => {
        if (activeToast || !detectionEnabled) return;
        const next = analyzeFullField(element);
        if (next && next.words.join('|') !== sig) {
          lastDetection = next; lastElement = element;
          dismissedSignature = null;
          showToast(element, next);
        }
      }, 500);
    } else {
      await navigator.clipboard.writeText(detection.converted).catch(() => {});
      showConfirm('✓ Copied — select your text then paste (Ctrl+V)');
    }
  });

  // Reject — teach Kiko this is not a layout mistake
  toast.querySelector('.kld-reject').addEventListener('click', () => {
    saveFeedback(detection.words, false);
    const sample = detection.words.slice(0, 3).join(', ');
    showConfirm(`✓ Got it — "${sample}${detection.words.length > 3 ? '…' : ''}" noted`);
    removeToast(false);
  });

  // Dismiss (✕) — hide without teaching anything, show recall hint
  toast.querySelector('.kld-dismiss').addEventListener('click', () => {
    dismissedSignature = sig;
    removeToast(true);
  });

  applyPos(toast);
  makeDraggable(toast);
  (document.body || document.documentElement).appendChild(toast);
  activeToast = toast;
}

// Brief green confirmation flash
function showConfirm(message) {
  injectStyles();
  const el = document.createElement('div');
  el.id = 'kld-toast';
  el.style.cssText = 'border-color:#22c55e!important;cursor:default';
  el.innerHTML = `<div class="kld-header"><span>✓</span><span style="color:#86efac">${escapeHtml(message)}</span></div>`;
  applyPos(el);
  (document.body || document.documentElement).appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function removeToast(showRecall = true) {
  if (activeToast) { activeToast.remove(); activeToast = null; }
  if (showRecall && lastDetection) showHint();
}

// ── Hint bubble (small persistent indicator) ──────────────────

function showHint() {
  if (hintEl) { hintEl.remove(); hintEl = null; }
  if (!lastDetection) return;
  injectStyles();

  hintEl = document.createElement('div');
  hintEl.id = 'kld-hint';
  const wc      = lastDetection.words.length;
  const dir     = lastDetection.type === 'hebrew_as_english' ? '→ EN' : '→ HE';
  const wcLabel = wc >= 5 ? `${wc} words ${dir}` : escapeHtml(lastDetection.converted.slice(0, 22) + (lastDetection.converted.length > 22 ? '…' : ''));
  hintEl.innerHTML = `
    <span>⌨️</span>
    <span class="kld-hint-text" title="Click to open fix">${wcLabel}</span>
    <button class="kld-hint-close" title="Dismiss">✕</button>
  `;

  hintEl.addEventListener('click', e => {
    if (e.target.closest('.kld-hint-close')) return;
    if (lastDetection && lastElement) {
      dismissedSignature = null;
      hideHint();
      showToast(lastElement, lastDetection, true); // forceShow bypasses word-count guard
    }
  });
  hintEl.querySelector('.kld-hint-close').addEventListener('click', e => {
    e.stopPropagation();
    hideHint();
  });
  hintEl.querySelector('.kld-hint-close').addEventListener('mousedown', e => e.preventDefault());

  applyPos(hintEl);
  makeDraggable(hintEl);
  (document.body || document.documentElement).appendChild(hintEl);
}

function hideHint() {
  if (hintEl) { hintEl.remove(); hintEl = null; }
}

// ── Keyboard shortcut ─────────────────────────────────────────

document.addEventListener('keydown', e => {
  // Escape — dismiss active toast
  if (e.key === 'Escape' && activeToast) {
    const sig = lastDetection ? lastDetection.words.join('|') : null;
    if (sig) dismissedSignature = sig;
    removeToast(true);
    return;
  }

  if (!e.altKey || !e.shiftKey || e.code !== 'KeyK') return;
  e.preventDefault();

  // Alt+Shift+K with selection — convert the selection
  const sel = window.getSelection();
  const selectedText = sel && sel.toString().trim();
  if (selectedText && selectedText.length >= 2) {
    convertSelection(selectedText, sel);
    return;
  }

  // Alt+Shift+K without selection:
  // 1. Active toast → dismiss it
  if (activeToast) { removeToast(); return; }
  // 2. Remembered detection on same element → re-show toast
  const focusedEl = document.activeElement;
  if (lastDetection && lastElement && focusedEl === lastElement) {
    dismissedSignature = null;
    showToast(lastElement, lastDetection);
    return;
  }
  // 3. Scan the FULL text of the currently focused field
  if (focusedEl && (focusedEl.isContentEditable || focusedEl.matches?.(SELECTOR))) {
    const det = analyzeFullField(focusedEl);
    if (det) {
      lastDetection = det;
      lastElement   = focusedEl;
      showToast(focusedEl, det);
    } else {
      showConfirm('✓ No layout issues found in this field');
    }
  }
});

// ── Manual selection conversion (Alt+Shift+K / right-click) ──

function convertSelection(text, sel) {
  const savedRange = (sel && sel.rangeCount) ? sel.getRangeAt(0).cloneRange() : null;

  let detection;
  if (hasHebrew(text)) {
    detection = {
      type: 'hebrew_detected',
      message: 'Convert selection to English?',
      original: text,
      converted: convertToEnglish(text),
      btnLabel: 'Convert → English',
      rejectLabel: 'Cancel',
      words: []
    };
  } else {
    const converted = convertToHebrew(text.toLowerCase());
    if (hasHebrew(converted)) {
      detection = {
        type: 'english_as_hebrew',
        message: 'Convert selection to Hebrew?',
        original: text,
        converted,
        btnLabel: 'Convert → Hebrew',
        rejectLabel: 'Cancel',
        words: extractWords(text)
      };
    }
  }

  if (!detection) {
    showConfirm('No layout mismatch detected in selection.');
    return;
  }

  lastDetection = detection;
  lastElement   = document.activeElement;
  hideHint();
  if (activeToast) { activeToast.remove(); activeToast = null; }
  injectStyles();

  const toast = document.createElement('div');
  toast.id = 'kld-toast';
  toast.innerHTML = `
    <div class="kld-header"><span>⌨️</span><span>${escapeHtml(detection.message)}</span></div>
    <div class="kld-preview">${escapeHtml(detection.converted)}</div>
    <div class="kld-actions">
      <button class="kld-btn kld-primary">${escapeHtml(detection.btnLabel)}</button>
      <button class="kld-btn kld-dismiss">Cancel</button>
    </div>
    <div class="kld-hint">Converting selected text</div>
  `;

  toast.querySelectorAll('.kld-btn').forEach(btn =>
    btn.addEventListener('mousedown', e => e.preventDefault())
  );

  toast.querySelector('.kld-primary').addEventListener('click', async () => {
    saveFeedback(detection.words, detection.type !== 'hebrew_detected');

    let replaced = false;

    // Try inline replacement synchronously first (preserves user activation)
    if (savedRange) {
      try {
        const doc = savedRange.startContainer.ownerDocument || document;
        let edEl = savedRange.startContainer;
        if (edEl.nodeType !== 1) edEl = edEl.parentElement;
        while (edEl && !edEl.isContentEditable) edEl = edEl.parentElement;
        if (edEl) edEl.focus();
        const s = doc.getSelection();
        s.removeAllRanges();
        s.addRange(savedRange.cloneRange());
        const snap = edEl ? (edEl.innerText || edEl.textContent || '') : '';
        doc.execCommand('insertText', false, detection.converted);
        if (edEl && (edEl.innerText || edEl.textContent || '') !== snap) replaced = true;
      } catch {}
    }

    removeToast(false);

    if (replaced) {
      showConfirm('✓ Fixed!');
    } else {
      // Fallback: write to clipboard (async OK here — user activation no longer needed)
      await navigator.clipboard.writeText(detection.converted).catch(() => {});
      showConfirm(savedRange ? '✓ Copied — paste with Ctrl+V' : '✓ Copied — select text and paste (Ctrl+V)');
    }
  });

  toast.querySelector('.kld-dismiss').addEventListener('click', () => removeToast(false));

  applyPos(toast);
  makeDraggable(toast);
  (document.body || document.documentElement).appendChild(toast);
  activeToast = toast;
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
  }, 400);
  el.addEventListener('input',          check);
  el.addEventListener('keyup',          check);
  el.addEventListener('compositionend', check);
}

// ── DOM observation ───────────────────────────────────────────

const SELECTOR = [
  'input[type="text"]','input[type="search"]','input[type="email"]',
  'input[type="url"]','input:not([type])',
  'textarea',
  '[contenteditable="true"]','[contenteditable=""]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="searchbox"]',
  '[role="article"] [contenteditable]',
  '.ql-editor',
  '[data-lexical-editor]',
  '[data-qa="message_input"]',
  '[data-testid="conversation-compose-box-input"]',
].join(', ');

document.querySelectorAll(SELECTOR).forEach(attachTo);

document.addEventListener('focusin', e => {
  const el = e.target;
  if (!el || el._kld) return;
  if (el.isContentEditable || el.matches?.(SELECTOR)) attachTo(el);
}, true);

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

// ── Right-click context menu ──────────────────────────────────
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type !== 'kiko-fix-selection' || !msg.text) return;
  const sel     = window.getSelection();
  const selText = sel && sel.toString().trim();
  convertSelection(msg.text, selText === msg.text.trim() ? sel : null);
});
