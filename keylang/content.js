// ============================================================
// Kiko – Hebrew, Russian & Arabic ↔ English Layout Fixer
// content.js  (wrapped in IIFE so re-injection never causes const redeclaration)
// ============================================================
(()=>{
const KIKO_VERSION = chrome.runtime.getManifest().version;

// Guard against duplicate injection (e.g. after extension update).
// Old orphaned script set window.__kikoActive to its own version; new script
// overwrites the guard so it wins, then re-attaches all editors.
if (window.__kikoActive === KIKO_VERSION) { return; }
window.__kikoActive = KIKO_VERSION;

// Detect orphaned state: chrome.runtime.id throws when the extension context
// has been invalidated (i.e. this script belongs to an old extension version).
const isLive = () => { try { return !!chrome.runtime.id && window.__kikoActive === KIKO_VERSION; } catch { return false; } };

// Remove any toast left behind by a previous version before we take over
document.querySelectorAll('#kld-toast,#kld-hint').forEach(el => el.remove());

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
const RUSSIAN_RE = /[а-яёА-ЯЁ]/;
const FINAL_FORMS = new Set(['ך','ם','ן','ף','ץ']);

// ── Russian keyboard mapping (ЙЦУКЕН ↔ QWERTY) ───────────────
const EN_TO_RU = {
  'q':'й','w':'ц','e':'у','r':'к','t':'е','y':'н','u':'г','i':'ш','o':'щ','p':'з',
  '[':'х',']':'ъ',
  'a':'ф','s':'ы','d':'в','f':'а','g':'п','h':'р','j':'о','k':'л','l':'д',
  ';':'ж',"'":'э',
  'z':'я','x':'ч','c':'с','v':'м','b':'и','n':'т','m':'ь',
  ',':'б','.':'ю'
};
const RU_TO_EN = {};
for (const [en, ru] of Object.entries(EN_TO_RU)) {
  if (RUSSIAN_RE.test(ru)) RU_TO_EN[ru] = en;
}

// ── Ukrainian keyboard mapping (ЙЦУКЕН-UA ↔ QWERTY) ───────────
// The Ukrainian layout is the Russian one with four keys changed:
//   s → і (not ы), ' → є (not э), ] → ї (not ъ), \ → ґ
const EN_TO_UK = { ...EN_TO_RU, 's': 'і', "'": 'є', ']': 'ї', '\\': 'ґ' };
// Letters Ukrainian has and Russian doesn't — the only unambiguous signal that
// a Cyrillic run belongs to Ukrainian rather than Russian.
const UK_ONLY_RE  = /[іїєґІЇЄҐ]/;
const CYRILLIC_RE = /[а-яёА-ЯЁіїєґІЇЄҐ]/;
const UK_TO_EN = {};
for (const [en, uk] of Object.entries(EN_TO_UK)) {
  if (CYRILLIC_RE.test(uk)) UK_TO_EN[uk] = en;
}

// ── Arabic keyboard mapping (Windows Arabic ↔ QWERTY) ──────────
const EN_TO_AR = {
  'q':'ض','w':'ص','e':'ث','r':'ق','t':'ف','y':'غ','u':'ع','i':'ه','o':'خ','p':'ح',
  '[':'ج',']':'د',
  'a':'ش','s':'س','d':'ي','f':'ب','g':'ل','h':'ا','j':'ت','k':'ن','l':'م',
  ';':'ك',"'":'ط',
  'z':'ئ','x':'ء','c':'ؤ','v':'ر','n':'ى','m':'ة',
  ',':'و','.':'ز','/':'ظ'
};
const ARABIC_RE = /[؀-ۿ]/;
const AR_TO_EN = {};
for (const [en, ar] of Object.entries(EN_TO_AR)) {
  if (ARABIC_RE.test(ar)) AR_TO_EN[ar] = en;
}

// ── Korean keyboard mapping (두벌식 Dubeolsik ↔ QWERTY) ────────
// Korean is the one layout that can't be a 1:1 character table: jamo compose
// into syllable blocks, so "dkssud" is 안녕, not six separate letters.
// EN_TO_KO maps keys to jamo; composeHangul() then runs the same state machine
// a real IME does, and decomposeHangul() reverses it.
const EN_TO_KO = {
  'q':'ㅂ','w':'ㅈ','e':'ㄷ','r':'ㄱ','t':'ㅅ','y':'ㅛ','u':'ㅕ','i':'ㅑ','o':'ㅐ','p':'ㅔ',
  'a':'ㅁ','s':'ㄴ','d':'ㅇ','f':'ㄹ','g':'ㅎ','h':'ㅗ','j':'ㅓ','k':'ㅏ','l':'ㅣ',
  'z':'ㅋ','x':'ㅌ','c':'ㅊ','v':'ㅍ','b':'ㅠ','n':'ㅜ','m':'ㅡ',
  'Q':'ㅃ','W':'ㅉ','E':'ㄸ','R':'ㄲ','T':'ㅆ','O':'ㅒ','P':'ㅖ'
};
// Lowercase keys win on the reverse map — shifted jamo keep their own entries.
const KO_TO_EN = {};
for (const [en, ko] of Object.entries(EN_TO_KO)) if (!(ko in KO_TO_EN)) KO_TO_EN[ko] = en;

const KO_INITIALS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const KO_MEDIALS  = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const KO_FINALS   = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

// Two keystrokes that merge into one compound vowel / final consonant
const KO_VOWEL_JOIN = {
  'ㅗㅏ':'ㅘ','ㅗㅐ':'ㅙ','ㅗㅣ':'ㅚ','ㅜㅓ':'ㅝ','ㅜㅔ':'ㅞ','ㅜㅣ':'ㅟ','ㅡㅣ':'ㅢ'
};
const KO_FINAL_JOIN = {
  'ㄱㅅ':'ㄳ','ㄴㅈ':'ㄵ','ㄴㅎ':'ㄶ','ㄹㄱ':'ㄺ','ㄹㅁ':'ㄻ','ㄹㅂ':'ㄼ',
  'ㄹㅅ':'ㄽ','ㄹㅌ':'ㄾ','ㄹㅍ':'ㄿ','ㄹㅎ':'ㅀ','ㅂㅅ':'ㅄ'
};
const KO_VOWEL_SPLIT = {};
for (const [pair, joined] of Object.entries(KO_VOWEL_JOIN)) KO_VOWEL_SPLIT[joined] = [...pair];
const KO_FINAL_SPLIT = {};
for (const [pair, joined] of Object.entries(KO_FINAL_JOIN)) KO_FINAL_SPLIT[joined] = [...pair];

const HANGUL_RE      = /[가-힣]/;              // complete syllable blocks
const HANGUL_ANY_RE  = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;    // blocks or bare jamo
const SYLLABLE_BASE  = 0xAC00;

// Fold a jamo stream into syllable blocks, exactly as a Dubeolsik IME would.
function composeHangul(jamo) {
  let out = '';
  let L = -1, V = -1, T = 0; // initial / medial indices (-1 = unset), final index (0 = none)
  const flush = () => {
    if (L >= 0 && V >= 0)      out += String.fromCharCode(SYLLABLE_BASE + (L * 21 + V) * 28 + T);
    else if (L >= 0)           out += KO_INITIALS[L];
    else if (V >= 0)           out += KO_MEDIALS[V];
    L = -1; V = -1; T = 0;
  };
  for (const ch of jamo) {
    if (!HANGUL_ANY_RE.test(ch)) { flush(); out += ch; continue; }

    const vi = KO_MEDIALS.indexOf(ch);
    if (vi >= 0) {
      if (T > 0) {
        // A vowel after a final means that final was really the NEXT syllable's
        // initial — "tkfkd" is 사랑, not 삵+ㅏ. Hand it over (compound finals
        // give up only their second half).
        const split = KO_FINAL_SPLIT[KO_FINALS[T]];
        const moved = split ? split[1] : KO_FINALS[T];
        T = split ? KO_FINALS.indexOf(split[0]) : 0;
        flush();
        L = KO_INITIALS.indexOf(moved);
        V = vi;
      } else if (L >= 0 && V < 0) {
        V = vi;
      } else if (V >= 0) {
        const joined = KO_VOWEL_JOIN[KO_MEDIALS[V] + ch];
        if (joined) V = KO_MEDIALS.indexOf(joined);
        else { flush(); V = vi; }
      } else {
        flush(); V = vi;
      }
      continue;
    }

    const li = KO_INITIALS.indexOf(ch);
    const fi = KO_FINALS.indexOf(ch);
    if (L < 0 && V < 0) {
      if (li >= 0) L = li; else out += ch;
    } else if (L < 0 || V < 0) {
      // A bare vowel, or an initial with no vowel yet, can't carry a final —
      // every syllable block needs both. Start a fresh syllable instead.
      flush(); if (li >= 0) L = li; else out += ch;
    } else if (T === 0) {
      if (fi > 0) T = fi;
      else { flush(); if (li >= 0) L = li; else out += ch; }
    } else {
      const joined = KO_FINAL_JOIN[KO_FINALS[T] + ch];
      if (joined) T = KO_FINALS.indexOf(joined);
      else { flush(); if (li >= 0) L = li; else out += ch; }
    }
  }
  flush();
  return out;
}

// Break syllable blocks back into the jamo keystrokes that produced them.
function decomposeHangul(text) {
  let out = '';
  for (const ch of text) {
    const idx = ch.charCodeAt(0) - SYLLABLE_BASE;
    if (idx >= 0 && idx < 11172) {
      const L = Math.floor(idx / (21 * 28));
      const V = Math.floor((idx % (21 * 28)) / 28);
      const T = idx % 28;
      out += KO_INITIALS[L];
      const v = KO_MEDIALS[V];
      out += KO_VOWEL_SPLIT[v] ? KO_VOWEL_SPLIT[v].join('') : v;
      if (T > 0) {
        const f = KO_FINALS[T];
        out += KO_FINAL_SPLIT[f] ? KO_FINAL_SPLIT[f].join('') : f;
      }
    } else {
      out += ch;
    }
  }
  return out;
}

// ── Feedback telemetry (anonymous, fire-and-forget) ──────────
// Telemetry disabled — all processing is local, no text is sent to any server.
const FEEDBACK_URL = '';

function sendFeedback(words, action, type) {
  if (!FEEDBACK_URL) return;
  try {
    chrome.runtime.sendMessage({
      type: 'kiko-feedback',
      url: FEEDBACK_URL,
      body: JSON.stringify({
        words: words.slice(0, 15).map(w => w.toLowerCase()),
        action, type,
        version: KIKO_VERSION
      })
    });
  } catch {}
}

// ── Storage & learned data ────────────────────────────────────
let learnedHebrew   = new Set();
let learnedEnglish  = new Set();
let learnedRussian  = new Set();
let learnedUkrainian = new Set();
let learnedKorean   = new Set();
let learnedArabic   = new Set();
let stats           = { detected: 0, converted: 0, rejected: 0 };
let detectionEnabled = true;
let soundEnabled     = true;
let toastPos        = null;
let enabledLangs    = { he: true, ru: true, uk: true, ar: true, ko: true }; // overridden by loadLearned; permissive default avoids blank window

async function loadLearned() {
  try {
    const d = await chrome.storage.local.get(
      ['learnedHebrew','learnedEnglish','learnedRussian','learnedUkrainian','learnedKorean','learnedArabic','stats','detectionEnabled','soundEnabled','toastPos','enabledLangs','disabledSites']
    );
    learnedHebrew   = new Set(d.learnedHebrew  || []);
    learnedEnglish  = new Set(d.learnedEnglish || []);
    learnedRussian  = new Set(d.learnedRussian || []);
    learnedUkrainian = new Set(d.learnedUkrainian || []);
    learnedKorean   = new Set(d.learnedKorean || []);
    learnedArabic   = new Set(d.learnedArabic  || []);
    stats           = d.stats || { detected: 0, converted: 0, rejected: 0 };
    detectionEnabled = d.detectionEnabled !== false;
    soundEnabled     = d.soundEnabled !== false;
    toastPos        = d.toastPos || null;
    if (d.enabledLangs) enabledLangs = { ...enabledLangs, ...d.enabledLangs };
    if ((d.disabledSites || []).includes(window.location.hostname)) {
      detectionEnabled = false;
    }
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
    if ('enabledLangs' in changes) enabledLangs = { ...enabledLangs, ...(changes.enabledLangs.newValue || {}) };
    if ('disabledSites' in changes) {
      const sites = changes.disabledSites.newValue || [];
      const nowDisabled = sites.includes(window.location.hostname);
      detectionEnabled = !nowDisabled;
      if (nowDisabled) { removeToast(false); hideHint(); }
    }
  });
} catch {}

async function saveFeedback(words, isWrongLayout, lang = 'he') {
  try {
    const normalised = words.map(w => w.toLowerCase()).filter(Boolean);
    if (lang === 'ru') {
      if (isWrongLayout) {
        normalised.forEach(w => { learnedRussian.add(w); learnedEnglish.delete(w); });
        stats.converted++;
      } else {
        normalised.forEach(w => { learnedEnglish.add(w); learnedRussian.delete(w); });
        stats.rejected++;
      }
      await chrome.storage.local.set({
        learnedRussian: [...learnedRussian],
        learnedEnglish: [...learnedEnglish],
        stats
      });
    } else if (lang === 'uk') {
      if (isWrongLayout) {
        normalised.forEach(w => { learnedUkrainian.add(w); learnedEnglish.delete(w); });
        stats.converted++;
      } else {
        normalised.forEach(w => { learnedEnglish.add(w); learnedUkrainian.delete(w); });
        stats.rejected++;
      }
      await chrome.storage.local.set({
        learnedUkrainian: [...learnedUkrainian],
        learnedEnglish: [...learnedEnglish],
        stats
      });
    } else if (lang === 'ko') {
      if (isWrongLayout) {
        normalised.forEach(w => { learnedKorean.add(w); learnedEnglish.delete(w); });
        stats.converted++;
      } else {
        normalised.forEach(w => { learnedEnglish.add(w); learnedKorean.delete(w); });
        stats.rejected++;
      }
      await chrome.storage.local.set({
        learnedKorean: [...learnedKorean],
        learnedEnglish: [...learnedEnglish],
        stats
      });
    } else if (lang === 'ar') {
      if (isWrongLayout) {
        normalised.forEach(w => { learnedArabic.add(w); learnedEnglish.delete(w); });
        stats.converted++;
      } else {
        normalised.forEach(w => { learnedEnglish.add(w); learnedArabic.delete(w); });
        stats.rejected++;
      }
      await chrome.storage.local.set({
        learnedArabic:  [...learnedArabic],
        learnedEnglish: [...learnedEnglish],
        stats
      });
    } else {
      if (isWrongLayout) {
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
    }
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

const EN_BIGRAMS = new Set([
  'th','he','in','er','an','re','on','en','at','nd','st','es',
  'ed','to','it','is','hi','of','or','as','ha','ou','te','et',
  'al','se','le','me','de','nt','ne','ea','io','ti','ar','ma',
  'ng','ro','ll','si','ur','ce','ch','el','li','ri','sh','ss',
  'wh','co','oo','no','pr','wi','la','ot','na','we','ly','ac',
  'ic','tr','ca','ge','ve','pe','ty','fo','ee','om','id','fi',
  'ut','be','un','so','lo','ad','mi','pl','sp','fr','di','wo',
  'ni','ta','ki','fa','vi','bi','pu','mo','cu','bu','mu','su',
  'ai','au','ay','ow','ew','ey','oa','ie','ue','ei',
  'bl','cl','fl','gl','sl','br','cr','dr','gr','sk','sm','sn','sw','tw','qu'
]);

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

// ── Russian scoring data ──────────────────────────────────────
const RU_BIGRAMS = new Set([
  'ст','то','но','ен','ко','от','ро','ни','ра','во',
  'на','ли','ан','ти','та','ло','ка','се','ма','ла',
  'по','за','де','ве','ле','ер','ос','ел','ри','ес',
  'ит','те','ме','ре','со','ак','ал','ар','ас','ат',
  'ов','ол','ор','ну','бо','бу','ди','до','же','жи',
  'зн','ив','ил','им','ин','ис','кл','лу','ми','мо',
  'не','об','он','оп','оч','пе','пл','пр','пу','ры',
  'са','си','сл','сн','сп','ср','су','тв','тр','ту',
  'ты','уж','ул','ум','ур','ут','уч','хо','чт','ча',
  'чи','шт','ых','ью','ая','ие','ой','ую'
]);

const COMMON_RU_WORDS = new Set([
  'я','ты','он','она','мы','вы','они','это','так','что',
  'как','где','кто','нет','да','все','уже','еще','очень','тут',
  'там','нам','вам','ему','ей','им','нас','вас','его',
  'если','когда','почему','зачем','который','которая',
  'привет','пока','спасибо','пожалуйста','хорошо','ладно','окей',
  'буду','будет','надо','нужно','можно','нельзя',
  'знаю','думаю','хочу','могу','иду','жду',
  'время','день','ночь','утро','вечер','год','раз',
  'дело','слово','место','друг','мир','работа','дом',
  'идти','быть','знать','думать','говорить','делать',
  'видеть','понять','сказать','дать','взять',
  'ничего','немного','много','мало','только','просто',
  'сейчас','потом','поэтому',
  'не','ни','но','или','при','без','для','над','под',
  'меня','тебя','него','неё','нас','вас','них',
  'мне','тебе','ему','ей','нам','вам','им',
  'меня','тебя','его','её','нас','вас','их',
  'себя','себе','сам','сама','само','сами',
  'один','два','три','один','первый',
]);

function russianScore(word) {
  const s = word.toLowerCase();
  if (s.length < 2) return 0;
  let hits = 0;
  for (let i = 0; i < s.length - 1; i++) {
    if (RU_BIGRAMS.has(s.slice(i, i + 2))) hits++;
  }
  return hits / (s.length - 1);
}

function wordCouldBeRussian(word) {
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;
  if (learnedEnglish.has(lower)) return false;
  if (learnedRussian.has(lower)) return true;
  if (EN_WORDS.has(lower)) return false;
  if (enabledLangs.he && wordCouldBeHebrew(word)) return false;
  if (englishScore(lower) >= 0.35) return false;
  const mapped = [...lower].map(c => EN_TO_RU[c]);
  if (!mapped.every(c => c !== undefined)) return false;
  const ruWord = mapped.join('');
  if (COMMON_RU_WORDS.has(ruWord)) return true;
  return russianScore(ruWord) >= 0.25;
}

// ── Ukrainian scoring data ────────────────────────────────────
const UK_BIGRAMS = new Set([
  'на','не','ні','ня','но','ти','то','та','те','ть',
  'по','пр','ра','ре','ро','ри','ко','ка','ки','ку',
  'ла','ли','ло','лі','ва','ве','ви','во','ий','ів',
  'ик','ин','ич','ід','із','іс','іт','сь','ст','ся',
  'го','ги','ер','ор','ар','ур','ан','ен','ін','он',
  'ит','ол','ал','ел','ул','ом','ам','ем','ум','об',
  'од','ож','за','зн','до','де','ді','му','мо','ма',
  'ми','чи','ча','че','що','як','ак','ок','ук','ює',
  'ає','ії','аю','ую','єт','ьс','жи','ша','ши','бу',
]);

const COMMON_UK_WORDS = new Set([
  'я','ти','ви','ми','він','вона','воно','вони','це','цей','ця',
  'що','як','де','хто','коли','чому','який','яка','яке','чи',
  'так','ні','вже','ще','дуже','тут','там','нам','вам','його','її','їх',
  'привіт','дякую','будь','ласка','добре','гаразд','вибач','бувай',
  'якщо','тому','щоб','бо','але','або','лише','навіть',
  'буду','буде','треба','можна','можу','хочу','знаю','думаю','йду','чекаю',
  'час','день','ніч','ранок','вечір','рік','раз','тиждень',
  'справа','слово','місце','друг','світ','робота','дім','дома','місто',
  'йти','бути','знати','думати','говорити','робити',
  'бачити','зрозуміти','сказати','дати','взяти',
  'нічого','трохи','багато','мало','тільки','просто','зараз','потім',
  'мене','тебе','нього','неї','нас','вас','них',
  'мені','тобі','йому','їй','їм','себе','собі',
  'сам','сама','саме','самі','один','два','три','перший',
  'добрий','гарний','великий','малий','новий','старий',
  'україна','український','київ','львів','вітаю',
]);

function ukrainianScore(word) {
  const s = word.toLowerCase();
  if (s.length < 2) return 0;
  let hits = 0;
  for (let i = 0; i < s.length - 1; i++) {
    if (UK_BIGRAMS.has(s.slice(i, i + 2))) hits++;
  }
  return hits / (s.length - 1);
}

function wordCouldBeUkrainian(word) {
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;
  if (learnedEnglish.has(lower)) return false;
  if (learnedUkrainian.has(lower)) return true;
  if (EN_WORDS.has(lower)) return false;
  if (enabledLangs.he && wordCouldBeHebrew(word)) return false;
  if (englishScore(lower) >= 0.35) return false;
  const mapped = [...lower].map(c => EN_TO_UK[c]);
  if (!mapped.every(c => c !== undefined)) return false;
  const ukWord = mapped.join('');
  if (COMMON_UK_WORDS.has(ukWord)) return true;
  // Beyond the common-word list, only claim words carrying a letter Russian
  // doesn't have. Everything else decodes identically under both layouts, and
  // the Russian pass runs first — so it owns those.
  if (!UK_ONLY_RE.test(ukWord)) return false;
  return ukrainianScore(ukWord) >= 0.25;
}

// ── Arabic scoring data ───────────────────────────────────────
const AR_BIGRAMS = new Set([
  'ال','لا','ان','ين','ات','وا','نا','ها','ما','من',
  'في','هم','كل','لم','لك','له','لل','ير','ية','ري',
  'قا','كا','بي','بر','تا','تي','سي','سا','شي','قل',
  'ول','رت','نت','مر','رح','حب','بل','عل','لن','دي',
  'وه','وي','مع','رب','حي','كن','يا','اب','سل','غد',
  'يل','يب','يت','يف','كب','صغ','طا','ثم','سم','نم',
]);

const COMMON_AR_WORDS = new Set([
  // Pronouns
  'هو','هي','هم','ها',
  // Particles / prepositions
  'من','في','ما','لا','مع','ثم','بل','كل','لم','قد','لو',
  // Question words
  'كيف','هنا','متى',
  // Greetings / affirmations
  'نعم','شكرا','مرحبا','سلام','تمام','صح','اهلا',
  // Common nouns
  'يوم','ليل','وقت','راس','باب','كتب',
  // Verbs
  'كان','قال','كنت','راح','رحت','كتب',
  // Conjunctions / discourse
  'لكن','حتى',
  // Common phrases typed on Arabic keyboard
  'هناك','كنا','كانت','قالت','قالوا','كانوا',
]);

function arabicScore(word) {
  const s = word;
  if (s.length < 2) return 0;
  let hits = 0;
  for (let i = 0; i < s.length - 1; i++) {
    if (AR_BIGRAMS.has(s.slice(i, i + 2))) hits++;
  }
  return hits / (s.length - 1);
}

function wordCouldBeArabic(word) {
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;
  if (learnedEnglish.has(lower)) return false;
  if (learnedArabic.has(lower)) return true;
  if (EN_WORDS.has(lower)) return false;
  if (englishScore(lower) >= 0.35) return false;
  const mapped = [...lower].map(c => EN_TO_AR[c]);
  if (!mapped.every(c => c !== undefined)) return false;
  const arWord = mapped.join('');
  if (COMMON_AR_WORDS.has(arWord)) return true;
  return arabicScore(arWord) >= 0.25;
}

// ── Korean scoring data ───────────────────────────────────────
// English maps onto valid-looking Hangul far more readily than onto Cyrillic,
// so Korean is scored on whole syllables against a frequency list rather than
// on bigrams, and held to a higher threshold.
const KO_SYLLABLES = new Set([...(
  '이다는에가하을를의고지서사한로자어대아그시인수나도리부상정기스주우만년일오소전무신성안내니라미조유것등문화회생국학산방물명요여남동발경제개계공과관광구군금김노능단당두말매면목반백법변보복본분비삼선세속손술습승식실심씨악야약양업연열영예온왕외용원월위은음임입장재저적절점접종좌준중즉증진질집차참창채처천청초총최추축출충취층치친침카코타토통특파판편평포표품풍피필할함합항해행향현형호확환활황획효후훈휴흑힘밥집일돈책영화노래친구가족음식시간사람오늘내일어제지금진짜정말조금많이여기거기저기학교'
)]);

const COMMON_KO_WORDS = new Set([
  '안녕','안녕하세요','감사','감사합니다','고마워','고맙습니다','미안','죄송합니다',
  '네','아니','아니요','응','그래','맞아','알겠습니다','괜찮아','괜찮아요',
  '뭐','왜','어디','누구','언제','어떻게','얼마',
  '지금','오늘','내일','어제','아침','저녁','시간','요일',
  '사람','친구','가족','학교','회사','집','일','돈','책','음식','물','밥',
  '사랑','행복','생각','문제','이유','방법','정도','경우',
  '하다','있다','없다','좋다','싫다','크다','작다','많다','적다',
  '해요','합니다','했어','했어요','할게','할까','하자','해줘',
  '진짜','정말','조금','많이','너무','아주','다시','아직','벌써',
  '이거','저거','그거','여기','거기','저기','이것','그것',
  '한국','한국어','서울','부산','영화','노래','게임','사진',
]);

function koreanScore(word) {
  const syls = [...word].filter(c => HANGUL_RE.test(c));
  if (syls.length === 0) return 0;
  return syls.filter(c => KO_SYLLABLES.has(c)).length / syls.length;
}

function wordCouldBeKorean(word) {
  if (word.length < 2) return false;
  const lower = word.toLowerCase();
  if (learnedEnglish.has(lower)) return false;
  if (learnedKorean.has(lower)) return true;
  if (EN_WORDS.has(lower)) return false;
  // No wordCouldBeHebrew() guard here, unlike the Cyrillic checks: the Hebrew
  // pass already runs earlier and returns before this one, and the short
  // keystroke runs behind 안녕 / 사랑 / 한국 all look plausibly Hebrew — keeping
  // the guard silently cost Korean its most common words.
  if (![...word].every(c => EN_TO_KO[c] !== undefined)) return false;
  const koWord = convertToKorean(word);
  // Every keystroke must land inside a complete syllable — leftover bare jamo
  // means this was never Korean, just letters that happen to map.
  if (!/^[가-힣]{2,}$/.test(koWord)) return false;
  // A known Korean word outranks the English-likeness heuristic: "dkssud" (안녕)
  // scores 0.40 as English and would otherwise never be caught.
  if (COMMON_KO_WORDS.has(koWord)) return true;
  if (englishScore(lower) >= 0.35) return false;
  return koreanScore(koWord) >= 0.5;
}

// ── Helper functions ──────────────────────────────────────────
function hasHebrew(t)          { return HEBREW_RE.test(t); }
function hasArabic(t)          { return ARABIC_RE.test(t); }
function convertToHebrew(t)    { return [...t].map(c => EN_TO_HE[c]  || c).join(''); }
function convertToEnglish(t)   { return [...t].map(c => HE_TO_EN[c] || c).join(''); }
function convertToRussian(t)   { return [...t].map(c => EN_TO_RU[c]  || c).join(''); }
function convertFromRussian(t) { return [...t].map(c => RU_TO_EN[c] || c).join(''); }
function convertToKorean(t)    { return composeHangul([...t].map(c => EN_TO_KO[c] ?? c).join('')); }
function convertFromKorean(t)  { return [...decomposeHangul(t)].map(c => KO_TO_EN[c] ?? c).join(''); }
function convertToUkrainian(t)   { return [...t].map(c => EN_TO_UK[c] || c).join(''); }
function convertFromUkrainian(t) { return [...t].map(c => UK_TO_EN[c] || c).join(''); }
function convertToArabic(t)    { return [...t].map(c => EN_TO_AR[c]  || c).join(''); }
function convertFromArabic(t)  { return [...t].map(c => AR_TO_EN[c] || c).join(''); }
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

function mapsToHebrew(word) {
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;
  if (learnedEnglish.has(lower)) return false;
  if (learnedHebrew.has(lower)) return true;
  const mapped = [...lower].map(c => EN_TO_HE[c]);
  if (!mapped.every(c => c !== undefined && HEBREW_RE.test(c))) return false;
  for (let i = 0; i < mapped.length - 1; i++) {
    if (FINAL_FORMS.has(mapped[i])) return false;
  }
  return true;
}

// Looser version for mixed-text extension: only checks that every char has a Hebrew
// keyboard mapping. Final-form at non-final position is actually EVIDENCE of wrong
// layout here, not a reason to exclude. EN_WORDS/englishScore filters are also skipped
// because in a mixed Hebrew+Latin sentence we want the whole Latin segment.
function physicallyMapsToHebrew(word) {
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;
  if (learnedEnglish.has(lower)) return false;
  const mapped = [...lower].map(c => EN_TO_HE[c]);
  return mapped.every(c => c !== undefined && HEBREW_RE.test(c));
}

// Returns the actual text substring spanning from firstWord to lastWord (inclusive),
// preserving any intermediate characters (spaces, short bridge words like 'w').
function findRunSpan(text, firstWord, lastWord) {
  const lt = text.toLowerCase();
  const fi = lt.indexOf(firstWord.toLowerCase());
  if (fi === -1) return null;
  const li = lt.indexOf(lastWord.toLowerCase(), fi);
  if (li === -1) return null;
  return text.slice(fi, li + lastWord.length);
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
  const textHasHebrew  = hasHebrew(text);
  const textHasRussian = RUSSIAN_RE.test(text);
  const textHasArabic  = hasArabic(text);
  const textHasUkOnly  = UK_ONLY_RE.test(text);
  const textHasHangul  = HANGUL_ANY_RE.test(text);

  // ── Case 1: Hebrew characters typed while English keyboard layout was expected
  // Hebrew final-form letters (ך ם ן ף ץ) never appear at the START of a word.
  // When English is typed on a Hebrew keyboard, those keys (l i o ; .) map to
  // exactly those final-form letters — so finding them in non-final position is
  // an unambiguous signal the user was in the wrong layout.
  if (textHasHebrew && enabledLangs.he) {
    let allWords;
    try {
      allWords = text.trim().split(/\s+/).flatMap(w =>
        w.split(/(?<=[a-z,;.'\d])(?=[֐-׿])|(?<=[֐-׿])(?=[a-z,;.'\d])/i).filter(Boolean)
      );
    } catch {
      allWords = text.trim().split(/\s+/);
    }
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

    if (run1.length >= 1) {
      // Use actual text span between first and last Hebrew word — preserves the true
      // spacing around bridge chars (e.g. 'ישאד vs ' ישאד) so applyConversion can
      // find and replace the text, and the already-fixed suppression check works.
      const hebrewInRun = run1.filter(w => HEBREW_RE.test(w));
      let original;
      if (hebrewInRun.length >= 1) {
        const spanText = findRunSpan(text, hebrewInRun[0], hebrewInRun[hebrewInRun.length - 1]);
        if (spanText) {
          // Extend backward over adjacent HE_TO_EN chars (e.g. leading apostrophe = 'w' key)
          // so "' + Hebrew" captures the full word like "what" not just "hat".
          const spanStart = text.toLowerCase().indexOf(hebrewInRun[0].toLowerCase());
          let extStart = spanStart;
          while (extStart > 0 && text[extStart - 1] !== ' ' && HE_TO_EN[text[extStart - 1]] !== undefined) extStart--;
          // Extend forward over trailing HE_TO_EN chars (e.g. trailing apostrophe = 'w' key)
          // so "Hebrew + '" captures the full word like "now" not just "no".
          const spanEnd = spanStart + spanText.length;
          let extEnd = spanEnd;
          while (extEnd < text.length && text[extEnd] !== ' ' && HE_TO_EN[text[extEnd]] !== undefined) extEnd++;
          original = text.slice(extStart, extEnd);
        } else {
          original = run1.join(' ');
        }
      } else {
        original = run1.join(' ');
      }
      const converted = convertToEnglish(original);
      if (converted.trim().length >= 3 && !hasHebrew(converted)) {
        // Suppress if user previously clicked "Not English" for these Hebrew words
        if (run1.some(w => HEBREW_RE.test(w) && learnedEnglish.has(w.toLowerCase()))) return null;

        // Suppress if user already manually retyped the English right after the Hebrew mis-type
        const origIdx = text.indexOf(original);
        if (origIdx !== -1) {
          const afterOrig = text.slice(origIdx + original.length).trimStart();
          const convStripped = converted.trim().toLowerCase().replace(/\s/g, '');
          if (convStripped.length >= 8 && afterOrig.toLowerCase().replace(/\s/g, '').startsWith(convStripped)) {
            return null;
          }
        }

        // Suppress if this is just the reverse of a recent Case 2 fix — we converted
        // "cut brtv to zv gucs" → "בוא נראה אם זה עובד" and now Case 1 wants to undo it.
        if (lastCase2Original && converted.trim().toLowerCase() === lastCase2Original) return null;

        // After a fix we enter strict mode: common-word scoring is too noisy
        // because short real Hebrew words (e.g. "בוא"→"cut", "אם"→"to") look
        // identical to wrong-layout text. In strict mode we only fire on
        // unambiguous final-form violations.
        const inStrictMode = Date.now() < strictModeUntil;

        // Fast single-word trigger: only outside strict mode (avoid "בוא"→"cut" false-pos)
        if (run1.length === 1) {
          const w = converted.trim().replace(/[^a-z]/gi, '').toLowerCase();
          if (w.length >= 3 && !inStrictMode && COMMON_EN_WORDS.has(w)) {
            return {
              type: 'hebrew_as_english',
              message: 'Wrong layout? Looks like English:',
              original, converted,
              btnLabel: 'Fix → English',
              rejectLabel: 'Not English',
              words: run1.filter(w => HEBREW_RE.test(w))
            };
          }
          // Single unrecognised word — wait for more context
        } else {
          // Strong signal: final-form Hebrew letters in wrong position
          const strongSignal = badCount >= 2;

          // Fallback: score converted text for English-likeness.
          // +2 per common word, +1 per English-like word (good vowel ratio, no consonant pile-up).
          // Requires BOTH score ≥ 3 AND at least one COMMON_EN_WORDS hit — real Hebrew text
          // almost never converts to a recognisable common English word, so this prevents
          // false positives on legitimate Hebrew sentences.
          // In strict mode (post-fix) skip word scoring — only strongSignal fires.
          let engScore = 0;
          let hasCommonWord = false;
          if (!strongSignal && !inStrictMode) {
            const convWords = converted.split(/\s+/)
              .map(w => w.replace(/[^a-z]/gi, '').toLowerCase())
              .filter(w => w.length >= 2);
            engScore = convWords.reduce((acc, w) => {
              if (COMMON_EN_WORDS.has(w)) { hasCommonWord = true; return acc + 2; }
              if (w.length < 3 || !/[aeiou]/.test(w)) return acc;
              if (/[^aeiou]{4,}/.test(w)) return acc;
              const r = (w.match(/[aeiou]/g) || []).length / w.length;
              return (r >= 0.20 && r <= 0.70) ? acc + 1 : acc;
            }, 0);
          }

          if (strongSignal || (!inStrictMode && engScore >= 3 && hasCommonWord)) {
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
  }

  // ── Case K1: Hangul typed while English keyboard was expected
  // Hangul shares no code points with the other scripts, so this pass can run
  // first and never contend with them.
  if (textHasHangul && enabledLangs.ko) {
    let allKoTokens;
    try {
      allKoTokens = text.trim().split(/\s+/).flatMap(w =>
        w.split(/(?<=[a-zA-Z])(?=[가-힣ㄱ-ㅎㅏ-ㅣ])|(?<=[가-힣ㄱ-ㅎㅏ-ㅣ])(?=[a-zA-Z])/).filter(Boolean)
      );
    } catch {
      allKoTokens = text.trim().split(/\s+/);
    }
    const runK1 = [];
    for (let i = allKoTokens.length - 1; i >= 0; i--) {
      const w = allKoTokens[i];
      if (HANGUL_ANY_RE.test(w)) {
        runK1.unshift(w);
      } else if (runK1.length > 0 && w.length <= 2) {
        runK1.unshift(w);
      } else if (runK1.length === 0) {
        continue;
      } else {
        break;
      }
    }
    if (runK1.length >= 1) {
      const koInRun = runK1.filter(w => HANGUL_ANY_RE.test(w));
      if (!koInRun.some(w => learnedEnglish.has(w.toLowerCase()))) {
        const originalK1  = koInRun.join(' ');
        const convertedK1 = convertFromKorean(originalK1);
        if (convertedK1.trim().length >= 2 && !HANGUL_ANY_RE.test(convertedK1)) {
          const convWordsK1 = convertedK1.split(/\s+/)
            .map(w => w.replace(/[^a-z]/gi, '').toLowerCase())
            .filter(w => w.length >= 2);
          const hasCommonK1 = convWordsK1.some(w => COMMON_EN_WORDS.has(w));
          const avgScoreK1 = convWordsK1.length
            ? convWordsK1.reduce((a, w) => a + englishScore(w), 0) / convWordsK1.length
            : 0;
          const fireK1 = runK1.length === 1
            ? (convWordsK1.length >= 1 && convWordsK1[0].length >= 3 && COMMON_EN_WORDS.has(convWordsK1[0]))
            : (hasCommonK1 && avgScoreK1 >= 0.15);
          if (fireK1) {
            return {
              type: 'korean_as_english', lang: 'ko',
              message: 'Wrong layout? Looks like English:',
              original: originalK1, converted: convertedK1,
              btnLabel: 'Fix → English', rejectLabel: 'Not English',
              words: koInRun
            };
          }
        }
      }
    }
  }

  // ── Case U1: Ukrainian Cyrillic typed while English keyboard was expected
  // Runs here first, but only claims text containing і/ї/є/ґ. Anything else
  // decodes identically under both Cyrillic layouts and belongs to Case R1.
  if (!textHasHebrew && textHasUkOnly && enabledLangs.uk) {
    let allUkTokens;
    try {
      allUkTokens = text.trim().split(/\s+/).flatMap(w =>
        w.split(/(?<=[a-zA-Z])(?=[а-яёА-ЯЁіїєґІЇЄҐ])|(?<=[а-яёА-ЯЁіїєґІЇЄҐ])(?=[a-zA-Z])/).filter(Boolean)
      );
    } catch {
      allUkTokens = text.trim().split(/\s+/);
    }
    const runU1 = [];
    for (let i = allUkTokens.length - 1; i >= 0; i--) {
      const w = allUkTokens[i];
      if (CYRILLIC_RE.test(w)) {
        runU1.unshift(w);
      } else if (runU1.length > 0 && w.length <= 2) {
        runU1.unshift(w);
      } else if (runU1.length === 0) {
        continue;
      } else {
        break;
      }
    }
    if (runU1.length >= 1) {
      const ukInRun = runU1.filter(w => CYRILLIC_RE.test(w));
      // Only take the run if the Ukrainian-only letters are actually in it
      if (ukInRun.some(w => UK_ONLY_RE.test(w)) &&
          !ukInRun.some(w => learnedEnglish.has(w.toLowerCase()))) {
        const allMapU = ukInRun.every(w => [...w].every(c => UK_TO_EN[c] !== undefined));
        if (allMapU) {
          const originalU1  = ukInRun.join(' ');
          const convertedU1 = convertFromUkrainian(originalU1);
          if (convertedU1.trim().length >= 2 && !CYRILLIC_RE.test(convertedU1)) {
            const convWordsU1 = convertedU1.split(/\s+/)
              .map(w => w.replace(/[^a-z]/gi, '').toLowerCase())
              .filter(w => w.length >= 2);
            const hasCommonU1 = convWordsU1.some(w => COMMON_EN_WORDS.has(w));
            const avgScoreU1 = convWordsU1.length
              ? convWordsU1.reduce((a, w) => a + englishScore(w), 0) / convWordsU1.length
              : 0;
            const fireU1 = runU1.length === 1
              ? (convWordsU1.length >= 1 && convWordsU1[0].length >= 3 && COMMON_EN_WORDS.has(convWordsU1[0]))
              : (hasCommonU1 && avgScoreU1 >= 0.15);
            if (fireU1) {
              return {
                type: 'ukrainian_as_english', lang: 'uk',
                message: 'Wrong layout? Looks like English:',
                original: originalU1, converted: convertedU1,
                btnLabel: 'Fix → English', rejectLabel: 'Not English',
                words: ukInRun
              };
            }
          }
        }
      }
    }
  }

  // ── Case R1: Russian Cyrillic typed while English keyboard was expected
  if (!textHasHebrew && textHasRussian && enabledLangs.ru) {
    let allRuTokens;
    try {
      allRuTokens = text.trim().split(/\s+/).flatMap(w =>
        w.split(/(?<=[a-zA-Z])(?=[а-яёА-ЯЁ])|(?<=[а-яёА-ЯЁ])(?=[a-zA-Z])/).filter(Boolean)
      );
    } catch {
      allRuTokens = text.trim().split(/\s+/);
    }
    const runR1 = [];
    for (let i = allRuTokens.length - 1; i >= 0; i--) {
      const w = allRuTokens[i];
      if (RUSSIAN_RE.test(w)) {
        runR1.unshift(w);
      } else if (runR1.length > 0 && w.length <= 2) {
        runR1.unshift(w);
      } else if (runR1.length === 0) {
        continue;
      } else {
        break;
      }
    }
    if (runR1.length >= 1) {
      const ruInRun = runR1.filter(w => RUSSIAN_RE.test(w));
      // Suppress if user confirmed these Cyrillic chars are real Russian
      if (!ruInRun.some(w => learnedEnglish.has(w.toLowerCase()))) {
        const allMap = ruInRun.every(w => [...w].every(c => RU_TO_EN[c] !== undefined));
        if (allMap) {
          const originalR1 = ruInRun.join(' ');
          const convertedR1 = convertFromRussian(originalR1);
          if (convertedR1.trim().length >= 2 && !RUSSIAN_RE.test(convertedR1)) {
            const convWordsR1 = convertedR1.split(/\s+/)
              .map(w => w.replace(/[^a-z]/gi, '').toLowerCase())
              .filter(w => w.length >= 2);
            const hasCommonR1 = convWordsR1.some(w => COMMON_EN_WORDS.has(w));
            const avgScoreR1 = convWordsR1.length
              ? convWordsR1.reduce((a, w) => a + englishScore(w), 0) / convWordsR1.length
              : 0;
            const fire = runR1.length === 1
              ? (convWordsR1.length >= 1 && convWordsR1[0].length >= 3 && COMMON_EN_WORDS.has(convWordsR1[0]))
              : (hasCommonR1 && avgScoreR1 >= 0.15);
            if (fire) {
              return {
                type: 'russian_as_english', lang: 'ru',
                message: 'Wrong layout? Looks like English:',
                original: originalR1, converted: convertedR1,
                btnLabel: 'Fix → English', rejectLabel: 'Not English',
                words: ruInRun
              };
            }
          }
        }
      }
    }
  }

  // ── Case A1: Arabic characters typed while English keyboard was expected
  if (!textHasHebrew && !textHasRussian && textHasArabic && enabledLangs.ar) {
    let allArTokens;
    try {
      allArTokens = text.trim().split(/\s+/).flatMap(w =>
        w.split(/(?<=[a-zA-Z])(?=[؀-ۿ])|(?<=[؀-ۿ])(?=[a-zA-Z])/).filter(Boolean)
      );
    } catch {
      allArTokens = text.trim().split(/\s+/);
    }
    const runA1 = [];
    for (let i = allArTokens.length - 1; i >= 0; i--) {
      const w = allArTokens[i];
      if (ARABIC_RE.test(w)) {
        runA1.unshift(w);
      } else if (runA1.length > 0 && w.length <= 2) {
        runA1.unshift(w);
      } else if (runA1.length === 0) {
        continue;
      } else {
        break;
      }
    }
    if (runA1.length >= 1) {
      const arInRun = runA1.filter(w => ARABIC_RE.test(w));
      if (!arInRun.some(w => learnedEnglish.has(w.toLowerCase()))) {
        const allMap = arInRun.every(w => [...w].every(c => AR_TO_EN[c] !== undefined));
        if (allMap) {
          const originalA1 = arInRun.join(' ');
          const convertedA1 = convertFromArabic(originalA1);
          if (convertedA1.trim().length >= 2 && !ARABIC_RE.test(convertedA1)) {
            const convWordsA1 = convertedA1.split(/\s+/)
              .map(w => w.replace(/[^a-z]/gi, '').toLowerCase())
              .filter(w => w.length >= 2);
            const hasCommonA1 = convWordsA1.some(w => COMMON_EN_WORDS.has(w));
            const avgScoreA1 = convWordsA1.length
              ? convWordsA1.reduce((a, w) => a + englishScore(w), 0) / convWordsA1.length
              : 0;
            const fire = runA1.length === 1
              ? (convWordsA1.length >= 1 && convWordsA1[0].length >= 3 && COMMON_EN_WORDS.has(convWordsA1[0]))
              : (hasCommonA1 && avgScoreA1 >= 0.15);
            if (fire) {
              return {
                type: 'arabic_as_english', lang: 'ar',
                message: 'Wrong layout? Looks like English:',
                original: originalA1, converted: convertedA1,
                btnLabel: 'Fix → English', rejectLabel: 'Not English',
                words: arInRun
              };
            }
          }
        }
      }
    }
  }

  // ── Case 2: English characters typed while Hebrew keyboard layout was expected
  const words = extractWords(text);
  const minRun = textHasHebrew ? 1 : 2;

  // Collect ALL contiguous runs of Hebrew-candidate words (forward pass),
  // tracking start index so we can extend backwards for context.
  const allRuns = [];
  let curRun = [], curGap = [], curStartIdx = -1;
  for (let wi = 0; wi < words.length; wi++) {
    const w = words[wi];
    if (wordCouldBeHebrew(w)) {
      if (curGap.length > 0) curRun.push(...curGap);
      curGap = [];
      if (curRun.length === 0) curStartIdx = wi;
      curRun.push(w);
    } else if (PASSTHROUGH.has(w.toLowerCase()) && curGap.length < 2 && curRun.length > 0) {
      curGap.push(w);
    } else {
      if (curRun.length > 0) allRuns.push({ words: [...curRun], startIdx: curStartIdx });
      curRun = []; curGap = []; curStartIdx = -1;
    }
  }
  if (curRun.length > 0) allRuns.push({ words: curRun, startIdx: curStartIdx });

  // Use the last (most recent) run that meets the minimum threshold
  const runEntry = [...allRuns].reverse().find(r => r.words.filter(w => wordCouldBeHebrew(w)).length >= minRun);
  let run = runEntry ? [...runEntry.words] : [];
  const hebrewCount = run.filter(w => wordCouldBeHebrew(w)).length;

  // Context extension: scan backwards AND forwards from the confirmed run.
  // In pure-English text (textHasHebrew=false) use mapsToHebrew (strict: valid Hebrew mapping
  // + no final-form at non-final position). In mixed text (textHasHebrew=true) use the looser
  // physicallyMapsToHebrew — final-form at non-final is actually evidence of wrong layout,
  // and common English words (you/are/can…) that happen to map to Hebrew chars ARE wrong-layout
  // in a sentence that already contains real Hebrew.
  const extCheck = textHasHebrew ? physicallyMapsToHebrew : mapsToHebrew;

  if (hebrewCount >= minRun && runEntry) {
    // Backwards — words before the run start
    if (runEntry.startIdx > 0) {
      const ext = [];
      for (let i = runEntry.startIdx - 1; i >= 0; i--) {
        if (extCheck(words[i])) ext.unshift(words[i]);
        else break;
      }
      if (ext.length > 0) run = [...ext, ...run];
    }
    // Forwards — words after the run end
    const runLastIdx = runEntry.startIdx + runEntry.words.length - 1;
    if (runLastIdx < words.length - 1) {
      const ext = [];
      for (let i = runLastIdx + 1; i < words.length; i++) {
        if (extCheck(words[i])) ext.push(words[i]);
        else break;
      }
      if (ext.length > 0) run = [...run, ...ext];
    }
  }

  if (enabledLangs.he && hebrewCount >= minRun) {
    // Use the actual text span from first→last run word so intermediate single-char
    // words (e.g. 'w' → Hebrew apostrophe/geresh) are preserved in original/converted.
    const spanText = findRunSpan(text, run[0], run[run.length - 1]) || run.join(' ');
    const lastWord = run[run.length - 1];
    const escaped  = lastWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const punct    = (text.match(new RegExp(escaped + '([?!]+)', 'i')) || [])[1] || '';
    const original  = spanText + punct;
    const converted = convertToHebrew(spanText.toLowerCase()) + punct;
    if (hasHebrew(converted)) {
      return {
        type:      'english_as_hebrew',
        message:   'Wrong layout? Looks like Hebrew:',
        original, converted,
        btnLabel:  'Fix → Hebrew',
        rejectLabel: 'Not Hebrew',
        words:     run.filter(w => wordCouldBeHebrew(w) || mapsToHebrew(w)),
        moreRuns:  allRuns.length > 1  // flag: there may be other mismatched runs
      };
    }
  }

  // ── Case R2: English characters typed while Russian keyboard was expected
  if (!textHasHebrew && enabledLangs.ru) {
    const ruCandWords = extractWords(text);
    const ruMinRun = textHasRussian ? 1 : 2;
    const allRuRuns = [];
    let curRuRun = [], curRuStartIdx = -1;
    for (let wi = 0; wi < ruCandWords.length; wi++) {
      const w = ruCandWords[wi];
      if (wordCouldBeRussian(w)) {
        if (curRuRun.length === 0) curRuStartIdx = wi;
        curRuRun.push(w);
      } else {
        if (curRuRun.length > 0) allRuRuns.push({ words: [...curRuRun], startIdx: curRuStartIdx });
        curRuRun = []; curRuStartIdx = -1;
      }
    }
    if (curRuRun.length > 0) allRuRuns.push({ words: curRuRun, startIdx: curRuStartIdx });

    const ruRunEntry = [...allRuRuns].reverse().find(r => r.words.length >= ruMinRun);
    if (ruRunEntry) {
      const runRu2 = ruRunEntry.words;
      const spanRu2 = findRunSpan(text, runRu2[0], runRu2[runRu2.length - 1]) || runRu2.join(' ');
      const convertedRu2 = convertToRussian(spanRu2.toLowerCase());
      if (RUSSIAN_RE.test(convertedRu2)) {
        return {
          type: 'english_as_russian', lang: 'ru',
          message: 'Wrong layout? Looks like Russian:',
          original: spanRu2, converted: convertedRu2,
          btnLabel: 'Fix → Russian', rejectLabel: 'Not Russian',
          words: runRu2
        };
      }
    }
  }

  // ── Case U2: English characters typed while Ukrainian keyboard was expected
  // Runs after R2 so genuine Russian keeps its existing behaviour; this picks up
  // what's left, which wordCouldBeUkrainian limits to distinctly-Ukrainian text.
  if (!textHasHebrew && enabledLangs.uk) {
    const ukCandWords = extractWords(text);
    const ukMinRun = textHasRussian || textHasUkOnly ? 1 : 2;
    const allUkRuns = [];
    let curUkRun = [], curUkStartIdx = -1;
    for (let wi = 0; wi < ukCandWords.length; wi++) {
      const w = ukCandWords[wi];
      if (wordCouldBeUkrainian(w)) {
        if (curUkRun.length === 0) curUkStartIdx = wi;
        curUkRun.push(w);
      } else {
        if (curUkRun.length > 0) allUkRuns.push({ words: [...curUkRun], startIdx: curUkStartIdx });
        curUkRun = []; curUkStartIdx = -1;
      }
    }
    if (curUkRun.length > 0) allUkRuns.push({ words: curUkRun, startIdx: curUkStartIdx });

    const ukRunEntry = [...allUkRuns].reverse().find(r => r.words.length >= ukMinRun);
    if (ukRunEntry) {
      const runUk2 = ukRunEntry.words;
      const spanUk2 = findRunSpan(text, runUk2[0], runUk2[runUk2.length - 1]) || runUk2.join(' ');
      const convertedUk2 = convertToUkrainian(spanUk2.toLowerCase());
      if (CYRILLIC_RE.test(convertedUk2)) {
        return {
          type: 'english_as_ukrainian', lang: 'uk',
          message: 'Wrong layout? Looks like Ukrainian:',
          original: spanUk2, converted: convertedUk2,
          btnLabel: 'Fix → Ukrainian', rejectLabel: 'Not Ukrainian',
          words: runUk2
        };
      }
    }
  }

  // ── Case A2: English characters typed while Arabic keyboard was expected
  if (!textHasHebrew && !textHasRussian && enabledLangs.ar) {
    const arCandWords = extractWords(text);
    const arMinRun = textHasArabic ? 1 : 2;
    const allArRuns2 = [];
    let curArRun2 = [], curArStartIdx2 = -1;
    for (let wi = 0; wi < arCandWords.length; wi++) {
      const w = arCandWords[wi];
      if (wordCouldBeArabic(w)) {
        if (curArRun2.length === 0) curArStartIdx2 = wi;
        curArRun2.push(w);
      } else {
        if (curArRun2.length > 0) allArRuns2.push({ words: [...curArRun2], startIdx: curArStartIdx2 });
        curArRun2 = []; curArStartIdx2 = -1;
      }
    }
    if (curArRun2.length > 0) allArRuns2.push({ words: curArRun2, startIdx: curArStartIdx2 });

    const arRunEntry2 = [...allArRuns2].reverse().find(r => r.words.length >= arMinRun);
    if (arRunEntry2) {
      const runAr2 = arRunEntry2.words;
      const spanAr2 = findRunSpan(text, runAr2[0], runAr2[runAr2.length - 1]) || runAr2.join(' ');
      const convertedAr2 = convertToArabic(spanAr2.toLowerCase());
      if (ARABIC_RE.test(convertedAr2)) {
        return {
          type: 'english_as_arabic', lang: 'ar',
          message: 'Wrong layout? Looks like Arabic:',
          original: spanAr2, converted: convertedAr2,
          btnLabel: 'Fix → Arabic', rejectLabel: 'Not Arabic',
          words: runAr2
        };
      }
    }
  }

  // ── Case K2: English characters typed while Korean keyboard was expected
  // Runs last of all the English→X passes. wordCouldBeKorean already demands a
  // clean syllable decomposition, but English maps onto plausible Hangul easily,
  // so the established languages keep first claim on any ambiguous run.
  if (!textHasHebrew && enabledLangs.ko) {
    const koCandWords = extractWords(text);
    const koMinRun = textHasHangul ? 1 : 2;
    const allKoRuns = [];
    let curKoRun = [], curKoStartIdx = -1;
    for (let wi = 0; wi < koCandWords.length; wi++) {
      const w = koCandWords[wi];
      if (wordCouldBeKorean(w)) {
        if (curKoRun.length === 0) curKoStartIdx = wi;
        curKoRun.push(w);
      } else {
        if (curKoRun.length > 0) allKoRuns.push({ words: [...curKoRun], startIdx: curKoStartIdx });
        curKoRun = []; curKoStartIdx = -1;
      }
    }
    if (curKoRun.length > 0) allKoRuns.push({ words: curKoRun, startIdx: curKoStartIdx });

    const koRunEntry = [...allKoRuns].reverse().find(r => r.words.length >= koMinRun);
    if (koRunEntry) {
      const runKo2 = koRunEntry.words;
      const spanKo2 = findRunSpan(text, runKo2[0], runKo2[runKo2.length - 1]) || runKo2.join(' ');
      const convertedKo2 = convertToKorean(spanKo2);
      if (HANGUL_RE.test(convertedKo2)) {
        return {
          type: 'english_as_korean', lang: 'ko',
          message: 'Wrong layout? Looks like Korean:',
          original: spanKo2, converted: convertedKo2,
          btnLabel: 'Fix → Korean', rejectLabel: 'Not Korean',
          words: runKo2
        };
      }
    }
  }

  return null;
}

// Analyze each line independently (last → first) so a correctly-typed line
// on one row can't bleed into a wrong-layout run on another row.
function analyzeByLines(text, scanAll = false) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.trim().length < 3) continue;
    const result = analyzeText(line, scanAll);
    if (result) return result;
  }
  return null;
}

function analyze(el) {
  return analyzeByLines(getTextBeforeCursor(el));
}

function analyzeFullField(el) {
  const fullText = el.isContentEditable
    ? (el.innerText || el.textContent || '')
    : (el.value || '');
  return analyzeByLines(fullText, true);
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
    const val = typeof el.value === 'string' ? el.value : null;
    if (val === null) return false;
    const pos  = el.selectionStart ?? val.length;
    const idx  = val.slice(0, pos).lastIndexOf(original);
    if (idx === -1) return false;
    el.value = val.slice(0, idx) + converted + val.slice(idx + original.length);
    el.selectionStart = el.selectionEnd = idx + converted.length;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // ── contenteditable ──────────────────────────────────────────
  const doc = el.ownerDocument || document;
  // Walk text nodes directly — must match what selectTextRange does.
  const walkText = () => {
    let s = '';
    const tw = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) s += n.textContent;
    return s;
  };

  // ── Framework editor detection (must come BEFORE idx check) ──
  // Lexical/React/ProseMirror process execCommand asynchronously;
  // the synchronous replaced() check always returns false for them.
  // We return true optimistically even when idx is unknown.
  const isLexical = el.hasAttribute('data-lexical-editor') ||
                    !!el.closest?.('[data-lexical-editor]');
  const isReactManaged = Object.keys(el).some(k =>
    k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance') || k.startsWith('__reactProps')
  );
  const isProseMirror = el.classList?.contains('ProseMirror') ||
                        !!el.closest?.('.ProseMirror');
  const isFramework = isLexical || isReactManaged || isProseMirror;

  // ── Find the text position ────────────────────────────────────
  let before   = walkText();
  let idx      = before.lastIndexOf(original);
  let matchLen = original.length;

  if (idx === -1) {
    // CSS-spacing fallback: innerText includes visual gaps that text nodes miss
    const altBefore = el.innerText || el.textContent || '';
    const altIdx    = altBefore.lastIndexOf(original);
    if (altIdx !== -1) { before = altBefore; idx = altIdx; }
  }

  if (idx === -1) {
    // Flexible-whitespace fallback: handles ZWS / ZWNJ / double-spaces
    // between words that were joined with single spaces in `original`.
    try {
      const escaped = original
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+/g, '[\\s\\u200b-\\u200f\\ufeff]+');
      const re = new RegExp(escaped, 'g');
      let lastMatch = null, m;
      while ((m = re.exec(before)) !== null) lastMatch = m;
      if (lastMatch) { idx = lastMatch.index; matchLen = lastMatch[0].length; }
    } catch {}
  }

  el.focus();

  // Helper: dispatch deleteContentBackward N times then insert converted text.
  // Works for React/Lexical editors where select-replace via execCommand fails
  // but cursor-relative beforeinput events are processed.
  // Returns true if at least one delete event was acknowledged (defaultPrevented).
  function tryDeleteInsert() {
    try {
      const chars = [...original]; // Unicode code-point aware
      let anyHandled = false;
      for (const _ of chars) {
        const evt = new InputEvent('beforeinput', {
          inputType: 'deleteContentBackward', bubbles: true, cancelable: true
        });
        el.dispatchEvent(evt);
        if (evt.defaultPrevented) anyHandled = true;
      }
      if (!doc.execCommand('insertText', false, converted)) {
        el.dispatchEvent(new InputEvent('beforeinput', {
          inputType: 'insertText', data: converted, bubbles: true, cancelable: true
        }));
      }
      return anyHandled;
    } catch { return false; }
  }

  if (isFramework) {
    // Framework editors (Lexical/React/ProseMirror): return true optimistically.
    if (idx !== -1 && selectTextRange(el, idx, matchLen)) {
      try { document.dispatchEvent(new Event('selectionchange')); } catch {}
      if (!doc.execCommand('insertText', false, converted)) {
        const bEvt = new InputEvent('beforeinput', {
          bubbles: true, cancelable: true, inputType: 'insertText', data: converted
        });
        el.dispatchEvent(bEvt);
        // If neither execCommand nor beforeinput were accepted, try delete-insert
        if (!bEvt.defaultPrevented) tryDeleteInsert();
      }
    } else {
      // Can't locate text — try delete-insert at current cursor
      if (!tryDeleteInsert()) {
        doc.execCommand('insertText', false, converted);
      }
    }
    return true;
  }

  if (idx === -1) return false;

  // For non-framework contenteditable: synchronous DOM check.
  function replaced() {
    const after = walkText();
    return after !== before && after.slice(idx, idx + matchLen) !== original.slice(0, matchLen);
  }

  // Strategy 1 — execCommand insertText (standard contenteditable, Gmail, Slack).
  if (selectTextRange(el, idx, matchLen)) {
    doc.execCommand('insertText', false, converted);
    if (replaced()) return true;
  }

  // Strategy 2 — synthetic ClipboardEvent (some older ProseMirror editors).
  try {
    if (selectTextRange(el, idx, matchLen)) {
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
    if (selectTextRange(el, idx, matchLen)) {
      const evt = new InputEvent('beforeinput', {
        bubbles: true, cancelable: true, inputType: 'insertText', data: converted
      });
      el.dispatchEvent(evt);
      if (replaced()) return true;
    }
  } catch {}

  // Strategy 4 — delete-backward N times + insert (editors where select-replace fails
  // but cursor-relative beforeinput events work, e.g. some React-managed inputs).
  if (tryDeleteInsert()) return true;

  return false;
}

function fixTextDirection(el, type) {
  if (!el || !el.isContentEditable) return;
  // Hebrew and Arabic as target need rtl; everything else (English or Russian) is ltr
  const targetDir = (type === 'english_as_hebrew' || type === 'english_as_arabic') ? 'rtl' : 'ltr';
  el.dir = targetDir;
  // Also fix any block children that carry the opposite dir explicitly
  const opposite = targetDir === 'ltr' ? 'rtl' : 'ltr';
  el.querySelectorAll('[dir="' + opposite + '"]').forEach(child => {
    child.dir = targetDir;
  });
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
    font-size: 14px; unicode-bidi: plaintext;
    color: #7dd3fc; word-break: break-word; line-height: 1.5;
    cursor: text; user-select: text;
  }
  .kld-preview-orig {
    color: #f87171; text-decoration: line-through; font-size: 12px;
    margin-bottom: 2px; word-break: break-word;
    unicode-bidi: plaintext; direction: auto;
  }
  .kld-preview-arrow { color: #475569; font-size: 11px; margin: 0 2px; }
  .kld-preview-new { direction: auto; }
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
let dismissedWordSet   = new Set(); // for subset-based dismissal across continued typing
let fixCooldownUntil   = 0; // ms timestamp — skip analyze() briefly after a fix to avoid ghost re-detection
let strictModeUntil    = 0; // after a fix, only use strong signal (final-form violations) for Case 1
let lastCase2Original  = null; // after Case 2 fix, suppress Case 1 re-detecting the same text in reverse

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

  // Don't re-show a detection the user explicitly dismissed (exact sig or subset of dismissed words)
  if (!forceShow && sig) {
    const isExact   = sig === dismissedSignature;
    const isSubset  = dismissedWordSet.size >= 2 &&
      [...dismissedWordSet].every(w => detection.words.includes(w));
    const hasNewWords = detection.words.some(w => !dismissedWordSet.has(w));
    if ((isExact || isSubset) && !hasNewWords) {
      lastDetection = detection;
      lastElement   = element;
      if (!hintEl) showHint();
      return;
    }
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

  // Same detection as the one already on screen — leave the toast alone
  if (!forceShow && lastDetection && sig === lastDetection.words.join('|')) return;

  // Guard: don't regress to a smaller detection on the same element
  if (activeToast && lastDetection && lastElement === element) {
    if (detection.words.length < lastDetection.words.length) return;
  }

  lastDetection      = detection;
  lastElement        = element;
  dismissedSignature = null;
  dismissedWordSet   = new Set();
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
    <div class="kld-preview">
      <div class="kld-preview-orig">${escapeHtml(truncatePreview(detection.original))}</div>
      <span class="kld-preview-arrow">→</span><span class="kld-preview-new">${escapeHtml(truncatePreview(detection.converted))}</span>
    </div>
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
    // Snapshot for undo (input/textarea only; contenteditable uses browser Ctrl+Z)
    const undoSnapshot = !element.isContentEditable && typeof element.value === 'string'
      ? { val: element.value, sel: element.selectionStart ?? 0 } : null;

    // applyConversion is synchronous — must run before any await to keep
    // user activation for execCommand('insertText').
    const ok = applyConversion(element, detection);
    fixCooldownUntil = Date.now() + (ok ? 900 : 4000); // brief cooldown prevents immediate ghost re-detection
    if (ok) {
      fixTextDirection(element, detection.type);
      strictModeUntil = Date.now() + 15000; // 15 s: only strong signals after a fix
      if (detection.type === 'english_as_hebrew' || detection.type === 'english_as_russian' || detection.type === 'english_as_ukrainian' || detection.type === 'english_as_korean' || detection.type === 'english_as_arabic') {
        lastCase2Original = detection.original.trim().toLowerCase();
      }
    }
    saveFeedback(detection.words, true, detection.lang || 'he');
    sendFeedback(detection.words, 'fix', detection.type);
    removeToast(false);
    if (ok) {
      const kb = /mac/i.test(navigator.userAgent) ? '⌘+Space' : 'Alt+Shift';
      const undoFn = undoSnapshot ? () => {
        element.value = undoSnapshot.val;
        element.selectionStart = element.selectionEnd = undoSnapshot.sel;
        element.dispatchEvent(new Event('input',  { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } : null;
      showConfirm(`✓ Fixed! Switch keyboard: ${kb}`, undoFn);
      setTimeout(maybeShowReviewToast, 3000);
      // Re-scan after a short delay to catch any remaining mismatched words
      // (e.g. a sentence with both Hebrew text and Latin-on-Hebrew-keyboard words)
      setTimeout(() => {
        if (activeToast || !detectionEnabled) return;
        const next = analyzeFullField(element);
        if (next && next.words.join('|') !== sig) {
          lastDetection = next; lastElement = element;
          dismissedSignature = null; dismissedWordSet = new Set();
          showToast(element, next);
        }
      }, 500);
    } else {
      // Inline fix failed — select the wrong text so the user can just press Ctrl+V
      try {
        const fb = element.isContentEditable
          ? (element.innerText || element.textContent || '') : (element.value || '');
        const fi = fb.lastIndexOf(detection.original);
        if (fi !== -1) selectTextRange(element, fi, detection.original.length);
      } catch {}
      await navigator.clipboard.writeText(detection.converted).catch(() => {});
      showConfirm('✓ Fix ready — text selected, press Ctrl+V to apply');
    }
  });

  // Reject — teach Kiko this is not a layout mistake
  toast.querySelector('.kld-reject').addEventListener('click', () => {
    saveFeedback(detection.words, false, detection.lang || 'he');
    sendFeedback(detection.words, 'reject', detection.type);
    const sample = detection.words.slice(0, 3).join(', ');
    showConfirm(`✓ Got it — "${sample}${detection.words.length > 3 ? '…' : ''}" noted`);
    removeToast(false);
  });

  // Dismiss (✕) — hide without teaching anything, show recall hint
  toast.querySelector('.kld-dismiss').addEventListener('click', () => {
    dismissedSignature = sig;
    dismissedWordSet   = new Set(detection.words);
    removeToast(true);
  });

  applyPos(toast);
  makeDraggable(toast);
  (document.body || document.documentElement).appendChild(toast);
  activeToast = toast;

  // Auto-dismiss after 8 s if the user never touches the toast
  const autoDismissId = setTimeout(() => {
    if (activeToast === toast) removeToast(true);
  }, 8000);
  toast.addEventListener('mouseenter', () => clearTimeout(autoDismissId));
}

// Brief green confirmation flash; pass undoFn to show an Undo button
function showConfirm(message, undoFn = null) {
  injectStyles();
  const el = document.createElement('div');
  el.id = 'kld-toast';
  el.style.cssText = 'border-color:#22c55e!important;cursor:default';
  if (undoFn) {
    el.innerHTML = `
      <div class="kld-header">
        <span>✓</span>
        <span style="color:#86efac;flex:1">${escapeHtml(message)}</span>
        <button class="kld-btn" style="background:#334155;color:#e2e8f0;font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid #475569">Undo</button>
      </div>`;
    const undoBtn = el.querySelector('button');
    undoBtn.addEventListener('mousedown', e => e.preventDefault());
    undoBtn.addEventListener('click', () => { undoFn(); el.remove(); });
  } else {
    el.innerHTML = `<div class="kld-header"><span>✓</span><span style="color:#86efac">${escapeHtml(message)}</span></div>`;
  }
  applyPos(el);
  (document.body || document.documentElement).appendChild(el);
  setTimeout(() => el.remove(), undoFn ? 5000 : 2800);
}

function removeToast(showRecall = true) {
  if (activeToast) { activeToast.remove(); activeToast = null; }
  if (showRecall && lastDetection) showHint();
}

// ── Review nudge (shown in-page after 3rd fix) ────────────────
const REVIEW_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

function showReviewToast() {
  if (activeToast) return;
  injectStyles();
  const reviewUrl = `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`;
  const toast = document.createElement('div');
  toast.id = 'kld-toast';
  toast.style.borderColor = '#f59e0b';
  toast.innerHTML = `
    <div class="kld-header">
      <span>⭐</span>
      <span style="flex:1;color:#fcd34d;font-weight:700">Enjoying Kiko?</span>
      <button class="kld-btn kld-dismiss" id="kld-rv-x">✕</button>
    </div>
    <div style="font-size:12px;color:#94a3b8;line-height:1.5">A quick review helps others find it — takes 30 seconds!</div>
    <div class="kld-actions">
      <button class="kld-btn kld-primary" id="kld-rv-rate" style="background:#f59e0b">Rate Kiko ⭐</button>
      <button class="kld-btn kld-reject" id="kld-rv-later">Maybe later</button>
    </div>
  `;
  toast.querySelectorAll('button').forEach(btn => btn.addEventListener('mousedown', e => e.preventDefault()));

  const snooze = () => {
    try { chrome.storage.local.set({ reviewNudge: { state: 'snoozed', snoozeUntil: Date.now() + REVIEW_SNOOZE_MS } }).catch(() => {}); } catch {}
    toast.remove(); if (activeToast === toast) activeToast = null;
  };
  toast.querySelector('#kld-rv-rate').addEventListener('click', () => {
    try { chrome.storage.local.set({ reviewNudge: { state: 'done' } }).catch(() => {}); } catch {}
    toast.remove(); if (activeToast === toast) activeToast = null;
    window.open(reviewUrl, '_blank');
  });
  toast.querySelector('#kld-rv-x').addEventListener('click', snooze);
  toast.querySelector('#kld-rv-later').addEventListener('click', snooze);

  applyPos(toast);
  makeDraggable(toast);
  (document.body || document.documentElement).appendChild(toast);
  activeToast = toast;
  const t = setTimeout(() => { if (activeToast === toast) snooze(); }, 9000);
  toast.addEventListener('mouseenter', () => clearTimeout(t));
}

async function maybeShowReviewToast() {
  try {
    const d = await chrome.storage.local.get(['stats', 'reviewNudge']);
    const converted = (d.stats || {}).converted || 0;
    const nudge = d.reviewNudge || null;
    if (converted < 3) return;
    if (nudge && nudge.state === 'done') return;
    if (nudge && nudge.state === 'snoozed' && Date.now() < nudge.snoozeUntil) return;
    showReviewToast();
  } catch {}
}

// ── Hint bubble (small persistent indicator) ──────────────────

function showHint() {
  if (hintEl) { hintEl.remove(); hintEl = null; }
  if (!lastDetection) return;
  injectStyles();

  hintEl = document.createElement('div');
  hintEl.id = 'kld-hint';
  const wc      = lastDetection.words.length;
  const dir     = lastDetection.type === 'hebrew_as_english'  ? '→ EN'
                : lastDetection.type === 'russian_as_english' ? '→ EN'
                : lastDetection.type === 'arabic_as_english'  ? '→ EN'
                : lastDetection.type === 'korean_as_english' ? '→ EN'
                : lastDetection.type === 'english_as_korean' ? '→ KO'
                : lastDetection.type === 'ukrainian_as_english' ? '→ EN'
                : lastDetection.type === 'english_as_ukrainian' ? '→ UK'
                : lastDetection.type === 'english_as_russian' ? '→ RU'
                : lastDetection.type === 'english_as_arabic'  ? '→ AR'
                : '→ HE';
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
      dismissedWordSet   = new Set();
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
  if (!isLive()) return;
  // Escape — dismiss active toast
  if (e.key === 'Escape' && activeToast) {
    const sig = lastDetection ? lastDetection.words.join('|') : null;
    if (sig) { dismissedSignature = sig; dismissedWordSet = new Set(lastDetection.words); }
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
  // 1. Remembered detection on same element → re-show toast
  // Resolve active element — walk into shadow roots if needed
  let focusedEl = document.activeElement;
  while (focusedEl && focusedEl.shadowRoot && focusedEl.shadowRoot.activeElement) {
    focusedEl = focusedEl.shadowRoot.activeElement;
  }
  const editorEl = resolveEditor(focusedEl);
  if (lastDetection && lastElement && editorEl === lastElement) {
    dismissedSignature = null; dismissedWordSet = new Set();
    showToast(lastElement, lastDetection, true); // forceShow: recall must bypass the same-signature guard
    return;
  }
  // 2. Scan the FULL text of the currently focused field
  if (editorEl) {
    if (editorEl._kldVer !== KIKO_VERSION) attachTo(editorEl);
    const det = analyzeFullField(editorEl);
    if (det) {
      lastDetection = det;
      lastElement   = editorEl;
      showToast(editorEl, det);
    } else {
      showConfirm('✓ No layout issues found — try selecting specific text first');
    }
  } else {
    showConfirm('Click inside a text field first, then press Alt+Shift+K');
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
  } else if (HANGUL_ANY_RE.test(text)) {
    detection = {
      type: 'korean_detected', lang: 'ko',
      message: 'Convert selection to English?',
      original: text,
      converted: convertFromKorean(text),
      btnLabel: 'Convert → English',
      rejectLabel: 'Cancel',
      words: []
    };
  } else if (UK_ONLY_RE.test(text)) {
    detection = {
      type: 'ukrainian_detected', lang: 'uk',
      message: 'Convert selection to English?',
      original: text,
      converted: convertFromUkrainian(text),
      btnLabel: 'Convert → English',
      rejectLabel: 'Cancel',
      words: []
    };
  } else if (RUSSIAN_RE.test(text)) {
    detection = {
      type: 'russian_detected', lang: 'ru',
      message: 'Convert selection to English?',
      original: text,
      converted: convertFromRussian(text),
      btnLabel: 'Convert → English',
      rejectLabel: 'Cancel',
      words: []
    };
  } else if (hasArabic(text)) {
    detection = {
      type: 'arabic_detected', lang: 'ar',
      message: 'Convert selection to English?',
      original: text,
      converted: convertFromArabic(text),
      btnLabel: 'Convert → English',
      rejectLabel: 'Cancel',
      words: []
    };
  } else {
    // Try Hebrew, then Russian, then Arabic conversion
    const heConverted = convertToHebrew(text.toLowerCase());
    if (hasHebrew(heConverted)) {
      detection = {
        type: 'english_as_hebrew',
        message: 'Convert selection to Hebrew?',
        original: text,
        converted: heConverted,
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
    <div class="kld-header"><span>⌨️</span><span style="flex:1">${escapeHtml(detection.message)}</span><button class="kld-btn kld-dismiss" title="Dismiss">✕</button></div>
    <div class="kld-preview">${escapeHtml(detection.converted)}</div>
    <div class="kld-actions">
      <button class="kld-btn kld-primary">${escapeHtml(detection.btnLabel)}</button>
      <button class="kld-btn kld-reject">Cancel</button>
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

  toast.querySelectorAll('.kld-dismiss, .kld-reject').forEach(btn =>
    btn.addEventListener('click', () => removeToast(false))
  );

  applyPos(toast);
  makeDraggable(toast);
  (document.body || document.documentElement).appendChild(toast);
  activeToast = toast;
}

// ── Input monitoring ──────────────────────────────────────────

function debounce(fn, ms, maxWait = 0) {
  let t, lastFired = 0;
  return (...a) => {
    clearTimeout(t);
    const now = Date.now();
    if (maxWait && now - lastFired >= maxWait) {
      lastFired = now;
      fn(...a);
    } else {
      t = setTimeout(() => { lastFired = Date.now(); fn(...a); }, ms);
    }
  };
}

function attachTo(el) {
  if (el._kldVer === KIKO_VERSION) return;
  el._kldVer = KIKO_VERSION;
  const check = debounce(() => {
    if (!isLive()) return;
    if (!detectionEnabled) return;
    if (Date.now() < fixCooldownUntil) return;
    // Analyze the full field so long sentences aren't split when the debounce
    // fires mid-typing. Fall back to cursor-position analysis if full-field
    // returns nothing (catches the word currently being typed).
    const detection = analyzeFullField(el) || analyze(el);
    if (detection) {
      showToast(el, detection);
    } else if (lastElement === el && dismissedSignature) {
      // Field was cleared/corrected after a dismiss — reset so next paste shows full toast
      const fieldText = el.isContentEditable
        ? (el.innerText || el.textContent || '').trim()
        : (el.value || '').trim();
      if (fieldText.length < 3) {
        dismissedSignature = null;
        dismissedWordSet   = new Set();
      }
    }
  }, 200, 1500);
  el.addEventListener('input',          check);
  el.addEventListener('keyup',          e => {
    if (!isLive()) return;
    // Don't fire check on shortcut keys (Alt+Shift+K etc.).
    // Two cases to catch:
    //   1. Still holding Alt/Ctrl/Meta when K is released → e.altKey/ctrlKey/metaKey true
    //   2. Releasing the modifier key itself LAST (e.g. Alt keyup after K was already up)
    //      → e.altKey is now false, but e.key IS the modifier
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (['Alt','Control','Meta','Shift'].includes(e.key)) return;
    check();
  });
  el.addEventListener('compositionend', check);
}

// ── DOM observation ───────────────────────────────────────────

const SELECTOR = [
  'input[type="text"]','input[type="search"]','input[type="email"]',
  'input[type="url"]','input:not([type])',
  'textarea',
  '[contenteditable="true"]','[contenteditable=""]','[contenteditable="plaintext-only"]',
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

function resolveEditor(el) {
  if (!el || el === document.body || el === document.documentElement) return null;
  // Always walk up to the actual element with the contenteditable attribute,
  // not a child <p>/<span> that inherits isContentEditable from its parent.
  const ce = el.closest?.('[contenteditable]:not([contenteditable="false"])');
  if (ce) return ce;
  // Inputs/textareas don't have contenteditable but are in SELECTOR
  if (el.matches?.(SELECTOR)) return el;
  return null;
}

document.addEventListener('focusin', e => {
  if (!isLive()) return;
  const el = resolveEditor(e.target);
  // Moving to a different input: old dismissal is no longer relevant
  if (el !== lastElement) { dismissedSignature = null; dismissedWordSet = new Set(); }
  if (!el || el._kldVer === KIKO_VERSION) return;
  attachTo(el);
}, true);

document.addEventListener('keyup', e => {
  if (!isLive()) return;
  const el = resolveEditor(e.target) || resolveEditor(document.activeElement);
  if (!el || el._kldVer === KIKO_VERSION) return;
  attachTo(el);
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

// ── Periodic scan — catches editors missed by MutationObserver ─
// Sites like LinkedIn batch-render modals in ways that can slip past the
// observer. Scanning every 800ms catches any newly visible editor.
setInterval(() => {
  if (!isLive()) return;
  document.querySelectorAll(SELECTOR).forEach(el => { if (el._kldVer !== KIKO_VERSION) attachTo(el); });
  const focused = resolveEditor(document.activeElement);
  if (focused && focused._kldVer !== KIKO_VERSION) attachTo(focused);
}, 800);

// ── Right-click context menu ──────────────────────────────────
chrome.runtime.onMessage.addListener(msg => {
  if (!isLive()) return;
  if (msg.type !== 'kiko-fix-selection' || !msg.text) return;
  const sel     = window.getSelection();
  const selText = sel && sel.toString().trim();
  convertSelection(msg.text, selText === msg.text.trim() ? sel : null);
});

// ── Test API (only active when test.html sets window.__kikoTestMode) ──
if (typeof window !== 'undefined' && window.__kikoTestMode) {
  window.__kiko = {
    analyzeText,
    analyzeByLines,
    setStrictMode:   (ms) => { strictModeUntil = Date.now() + ms; },
    clearStrictMode: ()   => { strictModeUntil = 0; },
    setLearnedHebrew: (arr) => { arr.forEach(w => learnedHebrew.add(w)); },
    clearLearned:    ()   => { learnedHebrew.clear(); learnedEnglish.clear(); },
  };
}

})(); // end IIFE
