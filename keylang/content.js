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
// Cyrillic and Greek have upper case, and almost every sentence a person types
// starts with one. Nothing below declared the shifted keys, so the inverse
// tables had no entry for them and the manual "convert selection" path left
// them untranslated: Привет came back as Пhbdtn, Γεια σου as Γeia soy. Every
// sentence-initial letter and every proper noun, in four of the six languages.
//
// Declaring them by hand would be eighty more rows to keep in step with the
// lower-case ones. Shift on a cased layout gives the capital of whatever the
// key already produces, so the pairs are derived instead, and cannot drift.
// Several letters live on punctuation keys — э on the apostrophe, ж on the
// semicolon, ё on the backtick — and toUpperCase() does nothing to those, so
// they need the shifted key spelled out.
const SHIFTED_PUNCT = {
  ';': ':', "'": '"', '[': '{', ']': '}', ',': '<', '.': '>',
  '/': '?', '`': '~', '-': '_', '=': '+',
};
function withShiftedKeys(map) {
  for (const [en, native] of Object.entries({ ...map })) {
    const EN = SHIFTED_PUNCT[en] || en.toUpperCase();
    const NATIVE = native.toUpperCase();
    if (EN !== en && NATIVE !== native && map[EN] === undefined) map[EN] = NATIVE;
  }
  return map;
}

const EN_TO_RU = {
  'q':'й','w':'ц','e':'у','r':'к','t':'е','y':'н','u':'г','i':'ш','o':'щ','p':'з',
  '[':'х',']':'ъ',
  'a':'ф','s':'ы','d':'в','f':'а','g':'п','h':'р','j':'о','k':'л','l':'д',
  ';':'ж',"'":'э',
  'z':'я','x':'ч','c':'с','v':'м','b':'и','n':'т','m':'ь',
  ',':'б','.':'ю',
  '`':'ё'
};
withShiftedKeys(EN_TO_RU);
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
  ',':'و','.':'ز','/':'ظ',
  // Arabic is not cased, so withShiftedKeys cannot derive these. The three
  // hamza-carrying alefs and ذ sit on their own keys and were missing
  // entirely: أ alone appeared fifteen times in the corpus, and every one of
  // those sentences came out of "convert selection" with an Arabic letter
  // still sitting in the middle of the Latin.
  //
  // These four positions are from the Arabic 101 layout and have not been
  // checked by a native typist — see REVIEW-ar.md. Getting one wrong converts
  // that letter to the wrong key rather than leaving it alone, so they are
  // worth confirming before the next Arabic push.
  '`':'ذ','H':'أ','Y':'إ','N':'آ'
};
withShiftedKeys(EN_TO_UK);
const ARABIC_RE = /[؀-ۿ]/;
const AR_TO_EN = {};
for (const [en, ar] of Object.entries(EN_TO_AR)) {
  if (ARABIC_RE.test(ar)) AR_TO_EN[ar] = en;
}

// ── Greek keyboard mapping (Greek 220 ↔ QWERTY) ───────────────
// A plain 1:1 table with one wrinkle: the ';' key is a dead key that adds the
// tonos accent to the vowel after it, so "kalhm;era" is καλημέρα. foldGreekTonos
// applies that pairing; expandGreekTonos undoes it on the way back.
const EN_TO_EL = {
  'q':';','w':'ς','e':'ε','r':'ρ','t':'τ','y':'υ','u':'θ','i':'ι','o':'ο','p':'π',
  'a':'α','s':'σ','d':'δ','f':'φ','g':'γ','h':'η','j':'ξ','k':'κ','l':'λ',';':'΄',
  'z':'ζ','x':'χ','c':'ψ','v':'ω','b':'β','n':'ν','m':'μ'
};
withShiftedKeys(EN_TO_EL);
const GREEK_RE = /[Ά-ώ]/;
const EL_TO_EN = {};
for (const [en, el] of Object.entries(EN_TO_EL)) {
  if (GREEK_RE.test(el)) EL_TO_EN[el] = en;
}
EL_TO_EN['΄'] = ';'; // the tonos dead key itself is not a Greek letter

const EL_TONOS = { 'α':'ά','ε':'έ','η':'ή','ι':'ί','ο':'ό','υ':'ύ','ω':'ώ' };
// A capitalised accented vowel opens a great many Greek sentences — Έχω, Ήταν,
// Όταν — and with only the lower-case pairs here, expandGreekTonos left them
// as they were and the conversion carried a Greek letter into Latin text.
for (const [plain, accented] of Object.entries({ ...EL_TONOS })) {
  EL_TONOS[plain.toUpperCase()] = accented.toUpperCase();
}
const EL_UNTONOS = {};
for (const [plain, accented] of Object.entries(EL_TONOS)) EL_UNTONOS[accented] = plain;

function foldGreekTonos(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '΄' && EL_TONOS[text[i + 1]]) { out += EL_TONOS[text[i + 1]]; i++; }
    else out += text[i];
  }
  return out;
}
function expandGreekTonos(text) {
  return [...text].map(c => EL_UNTONOS[c] ? '΄' + EL_UNTONOS[c] : c).join('');
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

// ── No telemetry ──────────────────────────────────────────────
// There is deliberately no function here that can send anything anywhere.
//
// Until 4.9.0 this block held sendFeedback(), which posted up to fifteen of
// the user's typed words to whatever URL a constant held. The constant was an
// empty string and nothing was ever sent — but "your typing never leaves your
// computer" is published on the site in six languages and in the store
// listing, and that promise was being kept by one empty string in a file
// edited every release. A promise that survives only by nobody filling in a
// blank is not a guarantee.
//
// The background handler that performed the POST is gone too. The only network
// calls left in the extension are the three licence calls in background.js,
// which carry a licence key and nothing else.
//
// If aggregate metrics are ever wanted, they belong in background.js as
// integer counters with no text, no URLs and no hostnames — and the store
// declaration and the privacy pages have to change in the same release.

// ── Localisation ──────────────────────────────────────────────
// Every call carries the English that used to be hard-coded here as its
// fallback, so a missing key degrades to the previous behaviour rather than
// to an empty button — and a locale we have not translated yet simply reads
// as it always did.
function t(key, subs, fallback) {
  try {
    const s = chrome.i18n.getMessage(key, subs);
    if (s) return s;
  } catch {}
  return fallback !== undefined ? fallback : '';
}

// Direction of the interface, which is a different question from the
// direction of the text being fixed: a Hebrew speaker correcting English
// still wants the toast laid out right to left.
const UI_RTL = t('uiDir', null, 'ltr') === 'rtl';

const LANG_MSG_KEY = {
  English: 'langEnglish', Hebrew: 'langHebrew', Russian: 'langRussian',
  Ukrainian: 'langUkrainian', Korean: 'langKorean', Greek: 'langGreek',
  Arabic: 'langArabic',
};

// Thirty-odd detection sites build their labels as English literals. Rather
// than thread a language code through every one of them, read the language
// back out of the message they already produce. If a name turns up that has
// no translation the detection is returned untouched, so a new language shows
// English labels instead of blanks — test-i18n.js fails the build in that
// case, so it should never reach anyone.
function localiseDetection(d) {
  const m = /Looks like ([A-Za-z]+):/.exec(d.message || '');
  const key = m && LANG_MSG_KEY[m[1]];
  if (!key) return d;
  const lang = t(key, null, m[1]);
  return {
    ...d,
    message:     t('toastLooksLike', [lang], d.message),
    btnLabel:    t('toastFix',       [lang], d.btnLabel),
    rejectLabel: t('toastReject',    [lang], d.rejectLabel),
  };
}

// ── Storage & learned data ────────────────────────────────────
let learnedHebrew   = new Set();
let learnedEnglish  = new Set();
let learnedRussian  = new Set();
let learnedUkrainian = new Set();
let learnedKorean   = new Set();
let learnedGreek    = new Set();
let learnedArabic   = new Set();
let stats           = { detected: 0, converted: 0, rejected: 0 };
let detectionEnabled = true;
let soundEnabled     = true;
let toastPos        = null;
// Which languages Kiko watches before anyone has said. All six used to be on,
// which is the permissive choice and the wrong one: a language running that
// the person never types costs accuracy in the ones they do. Measured over the
// corpus, every language alone scores 123 right and 0 wrong; all six together
// score 114 right and 24 wrong, and Ukrainian alone goes from 8 right / 0
// wrong to 7 / 12 once Russian is beside it.
//
// Chrome already knows which languages this person reads, so ask it. Someone
// whose browser lists Hebrew types Hebrew; that guess is free and far better
// than assuming all six. The welcome screen still asks properly — this only
// covers the person who closed that tab without answering.
const BROWSER_TO_KIKO = { he: 'he', iw: 'he', ru: 'ru', uk: 'uk', ko: 'ko', el: 'el', ar: 'ar' };

function langsFromBrowser() {
  const picked = { he: false, ru: false, uk: false, ko: false, el: false, ar: false };
  let matched = false;
  try {
    const tags = navigator.languages && navigator.languages.length
      ? navigator.languages : [navigator.language || ''];
    for (const tag of tags) {
      const code = BROWSER_TO_KIKO[String(tag).toLowerCase().split('-')[0]];
      if (code) { picked[code] = true; matched = true; }
    }
  } catch {}
  // Nothing recognised — an English-only Chrome belonging to someone who types
  // Russian looks exactly like one belonging to someone who types nothing else.
  // Guessing wrong here means Kiko appears broken, so this case keeps the old
  // permissive behaviour and the popup asks instead.
  if (!matched) return { he: true, ru: true, uk: true, ko: true, el: true, ar: true };
  return picked;
}

let enabledLangs    = langsFromBrowser();
// Entitlement is computed in background.js and mirrored here. Defaults to true
// on purpose: if the service worker has not run yet, or storage is unreadable,
// a paying user must not be locked out of their own text.
let entitled        = true; // overridden by loadLearned; permissive default avoids blank window

async function loadLearned() {
  try {
    const d = await chrome.storage.local.get(
      ['learnedHebrew','learnedEnglish','learnedRussian','learnedUkrainian','learnedKorean','learnedGreek','learnedArabic','stats','detectionEnabled','soundEnabled','toastPos','enabledLangs','disabledSites','entitlement']
    );
    learnedHebrew   = new Set(d.learnedHebrew  || []);
    learnedEnglish  = new Set(d.learnedEnglish || []);
    learnedRussian  = new Set(d.learnedRussian || []);
    learnedUkrainian = new Set(d.learnedUkrainian || []);
    learnedKorean   = new Set(d.learnedKorean || []);
    learnedGreek    = new Set(d.learnedGreek || []);
    learnedArabic   = new Set(d.learnedArabic  || []);
    stats           = d.stats || { detected: 0, converted: 0, rejected: 0 };
    detectionEnabled = d.detectionEnabled !== false;
    soundEnabled     = d.soundEnabled !== false;
    toastPos        = d.toastPos || null;
    // A stored object means the user has been through onboarding, so languages
    // they never opted into stay off — otherwise someone upgrading from a build
    // with fewer languages silently gets the new ones running while the popup
    // (which defaults its toggles to off) shows them as disabled.
    if (d.entitlement) entitled = d.entitlement.entitled !== false;
    if (d.enabledLangs) {
      enabledLangs = { he: false, ru: false, uk: false, ko: false, el: false, ar: false, ...d.enabledLangs };
    }
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
    if ('entitlement' in changes) {
      entitled = !changes.entitlement.newValue || changes.entitlement.newValue.entitled !== false;
      if (!entitled) { removeToast(false); hideHint(); }
    }
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
    } else if (lang === 'el') {
      if (isWrongLayout) {
        normalised.forEach(w => { learnedGreek.add(w); learnedEnglish.delete(w); });
        stats.converted++;
      } else {
        normalised.forEach(w => { learnedEnglish.add(w); learnedGreek.delete(w); });
        stats.rejected++;
      }
      await chrome.storage.local.set({
        learnedGreek: [...learnedGreek],
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

// One trial check per page, once the page has settled. Top frame only, and
// only if this tab is actually in front — otherwise a dozen background tabs
// each raise the same notice the moment the trial ticks over.
setTimeout(() => {
  try {
    if (!isLive()) return;
    if (window.top !== window) return;
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    maybeShowTrialNotice();
  } catch {}
}, 5000);

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

// Proper nouns — countries, cities, the companies people look up — and the one
// whole category the lists above deliberately leave out, because a name is not
// a word and nothing about its letters says "English".
//
// That gap is invisible in a chat box and total in a search box. Reported from
// LinkedIn's geography filter, where "israel" typed on a Hebrew keyboard is
// ןדרשקך: the single-word trigger asks COMMON_EN_WORDS, the multi-word scoring
// asks it again, and a name answers no to both. Measured before this list: 0 of
// 216 country, city and company names fired. Not some. None.
//
// Safety comes from three things. Every entry is four letters or more, so the
// short-word ambiguity that unmistakablyEnglish warns about cannot arise. No
// entry decodes to a real Hebrew word — checked against COMMON_HE_WORDS, and
// the check is a test, not a comment. And the 624-sentence corpus still reports
// zero false positives with the list switched on.
const EN_NAMES = new Set([
  // Israel
  'israel','jerusalem','telaviv','haifa','netanya','herzliya','ramatgan','holon',
  'ashdod','ashkelon','rishon','petah','tikva','beersheba','eilat','nazareth','akko',
  // the halves people actually type: "tel aviv" is two tokens, and the
  // multi-word scoring reads each one on its own
  'aviv','ramat','sheva','york','kong','town','angel',
  // countries
  'usa','america','canada','mexico','brazil','argentina','chile','colombia','peru',
  'england','britain','scotland','ireland','wales','france','germany','spain',
  'portugal','italy','greece','malta','netherlands','holland','belgium','austria',
  'switzerland','sweden','norway','denmark','finland','iceland','estonia','latvia',
  'lithuania','poland','czechia','slovakia','hungary','romania','bulgaria','serbia',
  'croatia','slovenia','albania','russia','ukraine','belarus','moldova','georgia',
  'armenia','azerbaijan','turkey','cyprus','china','japan','korea','india','pakistan',
  'bangladesh','indonesia','thailand','vietnam','philippines','singapore','malaysia',
  'taiwan','australia','zealand','africa','egypt','morocco','tunisia','algeria',
  'nigeria','kenya','ghana','ethiopia','uganda','tanzania','emirates','dubai','qatar',
  'kuwait','bahrain','oman','jordan','lebanon','syria','iraq','iran','saudi','yemen',
  // cities
  'london','paris','berlin','munich','hamburg','madrid','barcelona','valencia','rome',
  'milan','naples','turin','lisbon','porto','amsterdam','rotterdam','brussels','vienna',
  'zurich','geneva','basel','prague','warsaw','krakow','budapest','athens','dublin',
  'edinburgh','manchester','liverpool','glasgow','bristol','leeds','oslo','bergen',
  'stockholm','copenhagen','helsinki','tallinn','riga','vilnius','moscow','petersburg',
  'novosibirsk','kazan','kyiv','kiev','odesa','odessa','lviv','kharkiv','dnipro','minsk',
  'istanbul','ankara','izmir','newyork','brooklyn','boston','chicago','houston','dallas',
  'austin','denver','seattle','portland','miami','orlando','atlanta','angeles',
  'francisco','diego','vegas','phoenix','philadelphia','baltimore','detroit',
  'minneapolis','nashville','washington','toronto','vancouver','montreal','ottawa',
  'calgary','tokyo','osaka','kyoto','yokohama','nagoya','seoul','busan','incheon',
  'beijing','shanghai','shenzhen','guangzhou','hongkong','taipei','bangkok','hanoi',
  'jakarta','manila','mumbai','delhi','bangalore','chennai','kolkata','hyderabad',
  'sydney','melbourne','brisbane','perth','adelaide','auckland','wellington','cairo',
  'lagos','nairobi','johannesburg','pretoria','capetown','durban','casablanca','rabat',
  'tunis','algiers','doha','riyadh','jeddah','amman','beirut','baghdad','tehran',
  // regions and demonyms that behave like place names in a filter box
  'europe','asia','america','pacific','atlantic','mediterranean','balkans','baltics',
  'scandinavia','california','texas','florida','virginia','carolina','arizona',
  'nevada','colorado','oregon','ohio','michigan','illinois','massachusetts',
  'american','british','french','german','spanish','italian','russian','israeli',
  'ukrainian','korean','japanese','chinese','indian','arabic','greek','hebrew',
  // companies people actually search for
  'linkedin','google','facebook','instagram','whatsapp','amazon','microsoft','apple',
  'netflix','spotify','tesla','nvidia','intel','openai','anthropic','claude','chatgpt',
  'github','gitlab','slack','zoom','notion','figma','canva','shopify','stripe','paypal',
  'salesforce','hubspot','oracle','adobe','cisco','samsung','huawei','xiaomi','sony',
  'toyota','honda','nissan','siemens','philips','nestle','unilever','pfizer','moderna',
  'monday','wix','fiverr','payoneer','mobileye','checkpoint','nice','teva',
]);

// Four letters is the floor everywhere in this file where a word has to carry
// its own weight; below it the evidence is noise. It also keeps 'usa' and 'ibm'
// out, which is the right call — three letters of consonants is exactly the
// shape a real Hebrew word takes.
function isEnglishName(word) {
  return word.length >= 4 && EN_NAMES.has(word);
}

// A word worth firing on: something everybody writes, or something everybody
// looks up.
function englishEnough(word) {
  return COMMON_EN_WORDS.has(word) || isEnglishName(word);
}

// An English dictionary, because guessing was not working.
//
// unmistakablyEnglish existed to stop a run swallowing a word somebody typed on
// purpose — "yesterday", "meeting", "Slack" — and it did that with a bigram
// score. The score is a guess, and on Hebrew typed through a Latin keyboard it
// guesses wrong constantly: בהמשך is "cvnal", בכביש is "cfcha", בקרוב is
// "ceruc", and every one of them scores 0.50 or higher because "un", "ha", "ru"
// and "al" are ordinary English pairs. Eight of the eleven words Kiko was
// leaving behind at the end of a Hebrew sentence were rejected for that reason
// alone. That is the "why did it stop the sentence?" report.
//
// Asking a list is not a guess. Measured on every wrong-layout word in the
// corpus — 532 of them across six languages — three collide with this list, all
// three Greek words that genuinely are English words too. The words it must
// protect are all in it.
//
// Top ~10k English by frequency, four letters and up, minus what the lists
// above already hold. 70KB, which buys the end of the sentence.
const EN_LEXICON = new Set(('aaron abandoned aberdeen abilities ability able aboriginal abortion above abraham abroad absence absent absolute absolutely absorption abstract abstracts abuse academic academics academy accent accept acceptable acceptance accepted accepting accepts access accessed accessibility accessible accessing accessories accessory accident accidents accommodate accommodation accommodations accompanied accompanying accomplish accomplished accordance according accordingly account accountability accounting accounts accreditation accredited accuracy accurate accurately accused acdbentity acer achieve achieved achievement achievements achieving acid acids acknowledge acknowledged acne acoustic acquire acquired acquisition acquisitions acre acres acrobat across acrylic acting action actions activated activation active actively activists activities activity actor actors actress acts actual actually acute adam adams adaptation adapted adapter adapters adaptive adaptor added addiction adding addition additional additionally additions address addressed addresses addressing adds adequate adidas adipex adjacent adjust adjustable adjusted adjustment adjustments admin administered administration administrative administrator administrators admission admissions admit admitted adolescent adopt adopted adoption adrian adsl adult adults advance advanced advancement advances advantage advantages adventure adventures adverse advert advertise advertisement advertisements advertiser advertisers advertising advice advise advised advisor advisors advisory advocacy advocate adware aerial aerospace affair affairs affect affected affecting affects affiliate affiliated affiliates affiliation afford affordable afghanistan afraid african afternoon afterwards against aged agencies agency agenda agent agents ages aggregate aggressive aging agree agreed agreement agreements agrees agricultural agriculture ahead aids aimed aims aircraft airfare airline airlines airplane airport airports alabama alan alarm alaska albany albert alberta album albums albuquerque alcohol alert alerts alex alexander alexandria alfred algebra algorithm algorithms alias alice alien align alignment alike alive allah allan alleged allen allergy alliance allied allocated allocation allow allowance allowed allowing allows alloy almost alone along alot alpha alphabetical alpine already alter altered alternate alternative alternatively alternatives although alto aluminium aluminum alumni always amanda amateur amazing ambassador amber ambien ambient amend amended amendment amendments amenities americans americas amino among amongst amount amounts ampland amplifier anaheim anal analog analysis analyst analysts analytical analyze analyzed analyzes anatomy anchor ancient andale anderson andorra andrea andreas andrew andrews andy angela angels anger angle angola angry animal animals animated animation anime anna anne annex annie anniversary annotated annotation announce announced announcement announcements announces annoying annual annually anonymous another answer answered answering answers antarctica antenna anthony anthropology anti antibodies antibody anticipated antigua antique antiques antivirus antonio anxiety anybody anymore anyone anything anytime anyway anywhere apache apart apartment apartments apnic apollo apparatus apparel apparent apparently appeal appeals appear appearance appeared appearing appears appendix appliance appliances applicable applicant applicants application applications applied applies apply applying appointed appointment appointments appraisal appreciate appreciated appreciation approach approaches appropriate appropriations approval approve approved approx approximate approximately apps april aqua aquarium aquatic arab arabia arbitrary arbitration arbor arcade arch architect architects architectural architecture archive archived archives arctic area areas arena argue argued argument arguments arise arising arkansas arlington armed armor arms armstrong army arnold around arrange arranged arrangement arrangements array arrest arrested arrival arrivals arrive arrived arrives arrow arthritis arthur article articles artificial artist artistic artists arts artwork aruba asbestos ascii ashley asian aside asin asked asking asks aspect aspects assault assembled assembly assess assessed assessing assessment assessments asset assets assign assigned assignment assignments assist assistance assistant assisted assists associate associated associates association associations assume assumed assumes assuming assumption assumptions assurance assure assured asthma astrology astronomy asus asylum athletes athletic athletics atlas atmosphere atmospheric atom atomic attach attached attachment attachments attack attacked attacks attempt attempted attempting attempts attend attendance attended attending attention attitude attitudes attorney attorneys attract attraction attractions attractive attribute attributes auburn auction auctions audi audience audio audit auditor august aurora australian authentic authentication author authorities authority authorization authorized authors auto automated automatic automatically automation automobile automobiles automotive autos autumn availability available avatar avenue average aviation avoid avoiding avon award awarded awards aware awareness away awesome awful axis babe babes babies baby bachelor backed background backgrounds backing backup bacon bacteria bacterial badge badly bags bahamas bailey baker baking balance balanced bald bali ball ballet balloon ballot balls banana band bands bandwidth bang bangbus bank banking bankruptcy banks banned banner banners baptist barbados barbara barbie bare barely bargain bargains barn barnes barrel barrier barriers barry bars base baseball based baseline basement basename bases basic basically basics basin basis basket basketball baskets bass batch bath bathroom bathrooms baths batman batteries battery battle battlefield bdsm beach beaches beads beam bean beans bear bearing bears beast beastality beastiality beat beatles beats beautiful beautifully beauty beaver became because become becomes becoming bedding bedford bedroom bedrooms beds beef beer began begin beginner beginners beginning begins begun behalf behavior behavior behavioral behind being beings belfast belief beliefs believe believed believes belize belkin bell belle belly belong belongs below belt belts bench benchmark bend beneath beneficial benefit benefits benjamin bennett bent benz berkeley bermuda bernard berry beside besides best bestiality bestsellers beta beth better betting betty between beverage beverages beverly beyond bhutan bias bible biblical bibliographic bibliography bicycle bidder bidding bids bigger biggest bike bikes bikini bill billing billion bills billy binary bind binding bingo biodiversity biographies biography biol biological biology bios biotechnology bird birds birmingham birth birthday bishop bitch bite bits bizarre bizrate black blackberry blackjack blacks blade blades blah blair blake blame blank blanket blast bleeding blend bless blessed blind blink block blocked blocking blocks blog blogger bloggers blogging blogs blond blonde blood bloody bloom bloomberg blow blowing blowjob blowjobs blue blues bluetooth blvd board boards boat boating boats bobby bodies body bold bolivia bolt bomb bond bondage bonds bone bones bonus boob boobs book booking bookings bookmark bookmarks books bookstore bool boolean boom boost boot booth boots booty border borders bored boring born borough bosnia boss both bother botswana bottle bottles bottom bought boulder boulevard bound boundaries boundary bouquet boutique bowl bowling boxed boxes boxing boys bracelet bracelets bracket brad bradford bradley brain brake brakes branch branches brand brandon brands bras brass brave brazilian breach bread break breakdown breakfast breaking breaks breast breasts breath breathing breed breeding breeds brian brick bridal bride bridge bridges brief briefing briefly briefs bright brighton brilliant bring bringing brings britannica britney broad broadband broadcast broadcasting broader broadway brochure brochures broke broken broker brokers bronze brook brooks brother brothers brought brown browse browser browsers browsing bruce brunei brunette brunswick brush brutal bryan bryant bubble buck bucks buddy budget budgets buffalo buffer bufing bugs build builder builders building buildings builds built bukkake bulgarian bulk bull bullet bulletin bumper bunch bundle bunny burden bureau buried burke burlington burn burner burning burns burst burton buses bush business businesses busty busy butler butt butter butterfly button buttons butts buyer buyers buying buys buzz byte bytes cabin cabinet cabinets cable cables cache cached cadillac cafe cage cake cakes calcium calculate calculated calculation calculations calculator calculators calendar calendars calibration call called calling calls calm calvin cambodia cambridge camcorder camcorders came camel camera cameras cameron cameroon camp campaign campaigns campbell camping camps campus cams canadian canal canberra cancel cancellation cancelled cancer candidate candidates candle candles candy cannon canon canvas canyon capabilities capability capable capacity cape capital capitol caps captain capture captured carb carbon card cardiac cardiff cardiovascular cards care career careers careful carefully carey cargo caribbean caring carl carlo carlos carmen carnival carol caroline carpet carried carrier carriers carries carroll carry carrying cars cart carter cartoon cartoons cartridge cartridges casa case cases casey cash cashiers casino casinos casio cassette cast casting castle casual catalog catalogs catalogue catalyst catch categories category catering cathedral catherine catholic cats cattle caught cause caused causes causing caution cave cayman cdna cedar ceiling celebrate celebration celebrities celebrity celebs cell cells cellular celtic cement cemetery census cent center centered centers central centre centres cents centuries century ceramic ceremony certain certainly certificate certificates certification certified chad chain chains chair chairman chairs challenge challenged challenges challenging chamber chambers champagne champion champions championship championships chan chance chancellor chances change changed changelog changes changing channel channels chaos chapel chapter chapters char character characteristic characteristics characterization characterized characters charge charged charger chargers charges charging charitable charity charles charleston charlie charlotte charm charming charms chart charter charts chase chassis chat cheap cheaper cheapest cheat cheats check checked checking checklist checkout checks cheers cheese chef chelsea chem chemical chemicals chemistry chen cheque cherry chess chest chester chevrolet chevy chick chicken chicks chief child childhood children childrens chip chips chocolate choice choices choir cholesterol choose choosing chorus chose chosen chris christ christian christianity christians christina christine christmas christopher chrome chronic chronicle chronicles chrysler chubby chuck church churches cialis ciao cigarette cigarettes cincinnati cindy cinema cingular circle circles circuit circuits circular circulation circumstances circus citation citations cite cited cities citizen citizens citizenship city citysearch civic civil civilian civilization claim claimed claims claire clan clara clarity clark clarke class classes classic classical classics classification classified classifieds classroom clause clay clean cleaner cleaners cleaning cleanup clear clearance cleared clearing clearly clerk cleveland click clicking clicks client clients cliff climate climb climbing clinic clinical clinics clinton clip clips clock clocks clone close closed closely closer closes closest closing closure cloth clothes clothing cloud clouds cloudy club clubs cluster clusters cnet coach coaches coaching coal coalition coast coastal coat coated coating cock cocks cocktail code codes coding coffee cognitive cohen coin coins cold cole coleman colin collaboration collaborative collapse collar colleague colleagues collect collectables collected collectible collectibles collecting collection collections collective collector collectors college colleges collins cologne colon colonial colony color color colored colors colors columbia columbus column columnists columns combat combination combinations combine combined combines combining combo comedy comes comfort comfortable comic comics coming comm command commander commands comment commentary commented comments commerce commercial commission commissioner commissioners commissions commit commitment commitments committed committee committees commodities commodity common commonly commons commonwealth communicate communication communications communist communities community comp compact companies companion company compaq comparable comparative compare compared comparing comparison comparisons compatibility compatible compensation compete competent competing competition competitions competitive competitors compilation compile compiled compiler complaint complaints complement complete completed completely completing completion complex complexity compliance compliant complicated complications complimentary comply component components composed composer composite composition compound compounds comprehensive compressed compression compromise computation computational compute computed computer computers computing concentrate concentration concentrations concept concepts conceptual concern concerned concerning concerns concert concerts conclude concluded conclusion conclusions concord concrete condition conditional conditioning conditions condo condos conduct conducted conducting conf conference conferences conferencing confidence confident confidential confidentiality config configuration configurations configure configured configuring confirm confirmation confirmed conflict conflicts confused confusion congo congratulations congress congressional conjunction connect connected connecticut connecting connection connections connectivity connector connectors cons conscious consciousness consecutive consensus consent consequence consequences consequently conservation conservative consider considerable consideration considerations considered considering considers consist consistency consistent consistently consisting consists console consoles consolidated consolidation consortium conspiracy const constant constantly constitute constitutes constitution constitutional constraint constraints construct constructed construction consult consultancy consultant consultants consultation consulting consumer consumers consumption contact contacted contacting contacts contain contained container containers containing contains contamination contemporary content contents contest contests context continent continental continually continue continued continues continuing continuity continuous continuously contract contracting contractor contractors contracts contrary contrast contribute contributed contributing contribution contributions contributor contributors control controlled controller controllers controlling controls controversial controversy convenience convenient convention conventional conventions convergence conversation conversations conversion convert converted converter convertible convicted conviction convinced cook cookbook cooked cookie cookies cooking cooler cooling cooper cooperation cooperative coordinate coordinated coordinates coordination coordinator cope copied copies copper copy copying copyright copyrighted copyrights coral cord cordless core cork corn cornell corner corners cornwall corp corporate corporation corporations corps corpus correct corrected correction corrections correctly correlation correspondence corresponding corruption cosmetic cosmetics cost costa costs costume costumes cottage cottages cotton council councils counsel counseling count counted counter counters counties counting countries country counts county couple coupled couples coupon coupons courage courier course courses court courtesy courts cove cover coverage covered covering covers cowboy crack cradle craft crafts craig crap craps crash crawford crazy cream create created creates creating creation creations creative creativity creator creature creatures credit credits creek crest crew cricket crime crimes criminal crisis criteria criterion critical criticism critics crop crops cross crossing crossword crowd crown crucial crude cruise cruises cruz crystal ctrl cuba cube cubic cuisine cult cultural culture cultures cumshot cumshots cumulative cunt cups cure curious currencies currency current currently curriculum cursor curtis curve curves custody custom customer customers customize customize customized customs cute cuts cutting cyber cycle cycles cycling cylinder czech daddy daily dairy daisy dakota dale damage damaged damages dame damn dana dance dancing danger dangerous daniel danish danny dans dare dark darkness darwin dash data database databases date dated dates dating daughter daughters dave david davidson davis dawn days dayton dead deadline deadly deaf deal dealer dealers dealing deals dealt dealtime dean dear death deaths debate debian deborah debt debug debut decade decades december decent decide decided decimal decision decisions deck declaration declare declared decline declined decor decorating decorative decrease decreased dedicated deemed deep deeper deeply deer default defeat defects defence defend defendant defense defensive deferred deficit define defined defines defining definitely definition definitions degree degrees delaware delay delayed delays delegation delete deleted delicious delight deliver delivered delivering delivers delivery dell delta deluxe demand demanding demands demo democracy democrat democratic democrats demographic demonstrate demonstrated demonstrates demonstration denial denied dennis dense density dental dentists deny department departmental departments departure depend dependence dependent depending depends deployment deposit deposits depot depression dept depth deputy derby derek derived descending describe described describes describing description descriptions desert deserve design designated designation designed designer designers designing designs desirable desire desired desk desktop desktops desperate despite destination destinations destiny destroy destroyed destruction detail detailed details detect detected detection detective detector determination determine determined determines determining deutsch deutsche deutschland devel develop developed developer developers developing development developmental developments develops deviant deviation device devices devil devon devoted diabetes diagnosis diagnostic diagram dial dialog dialogue diameter diamond diamonds diana diane diary dice dick dicke dicks dictionaries dictionary died dies diesel diet dietary diff differ difference differences different differential differently difficult difficulties difficulty diffs digest digit digital dildo dildos dimension dimensional dimensions dining dinner diploma direct directed direction directions directive directly director directories directors directory dirt dirty disabilities disability disable disabled disagree disappointed disaster disc discharge disciplinary discipline disciplines disclaimer disclaimers disclose disclosure disco discount discounted discounts discover discovered discovery discrete discretion discrimination discs discuss discussed discusses discussing discussion discussions disease diseases dish dishes disk disks disney disorder disorders dispatch dispatched display displayed displaying displays disposal disposition dispute disputes dist distance distances distant distinct distinction distinguished distribute distributed distribution distributions distributor distributors district districts disturbed dive diverse diversity divide divided dividend divine diving division divisions divorce divx dock docs doctor doctors doctrine document documentary documentation documented documents dodge does dogs doing doll dollar dollars dolls domain domains dome domestic dominant dominican donald donate donated donation donations done donna donor donors doom door doors dosage dose double doubt doug douglas dover down download downloadable downloaded downloading downloads downtown dozen dozens draft drag dragon drain drainage drama dramatic dramatically draw drawing drawings drawn draws dream dreams dress dressed dresses dressing drew dried drill drilling drink drinking drinks drive driven driver drivers drives driving drop dropped drops drove drug drugs drum drums drunk dryer dual duck dude duke dumb dump duncan duplicate durable duration durham during dust dutch duties duty dvds dying dylan dynamic dynamics each eagle eagles earl earlier earliest early earn earned earning earnings earrings ears earth earthquake ease easier easily east easter eastern easy eating ebay ebony ebook ebooks echo eclipse ecological ecology ecommerce economic economics economies economy ecuador eddie eden edgar edge edges edit edited editing edition editions editor editorial editorials editors edmonton educated education educational educators edward edwards effect effective effectively effectiveness effects efficiency efficient efficiently effort efforts eggs egyptian eight either ejaculation elder elderly elect elected election elections electoral electric electrical electricity electro electron electronic electronics elegant element elementary elements elephant elevation eleven eligibility eligible eliminate elimination elite elizabeth ellen elliott ellis else elsewhere elvis emacs email emails embassy embedded emerald emergency emerging emily eminem emission emissions emma emotional emotions emperor emphasis empire empirical employ employed employee employees employer employers employment empty enable enabled enables enabling enclosed enclosure encoding encounter encountered encourage encouraged encourages encouraging encryption encyclopedia endangered ended endif ending endless endorsed endorsement ends enemies enemy energy enforcement engage engaged engagement engaging engine engineer engineering engineers engines english enhance enhanced enhancement enhancements enhancing enjoy enjoyed enjoying enlarge enlargement enormous enough enquiries enquiry enrolled enrollment ensemble ensure ensures ensuring enter entered entering enterprise enterprises enters entertaining entertainment entire entirely entities entitled entity entrance entrepreneur entrepreneurs entries entry envelope environment environmental environments enzyme epic epinions episode episodes epson equal equality equally equation equations equilibrium equipment equipped equity equivalent eric ericsson erik erotic erotica error errors escape escort escorts especially espn essay essays essence essential essentially essentials essex establish established establishing establishment estate estates estimate estimated estimates estimation eternal ethernet ethical ethics ethnic eugene euro european euros eval evaluate evaluated evaluating evaluation evaluations evanescence evans even evening event events eventually ever every everybody everyday everyone everything everywhere evidence evident evil evolution exact exactly exam examination examinations examine examined examines examining example examples exams exceed excel excellence excellent except exception exceptional exceptions excerpt excess excessive exchange exchanges excited excitement exciting exclude excluded excluding exclusion exclusive exclusively excuse exec execute executed execution executive executives exempt exemption exercise exercises exhaust exhibit exhibition exhibitions exhibits exist existed existence existing exists exit exotic expand expanded expanding expansion expansys expect expectations expected expects expedia expenditure expenditures expense expenses expensive experience experienced experiences experiencing experiment experimental experiments expert expertise experts expiration expired expires explain explained explaining explains explanation explicit explicitly exploration explore explorer exploring explosion expo export exports exposed exposure express expressed expression expressions extend extended extending extends extension extensions extensive extent exterior external extra extract extraction extraordinary extras extreme extremely eyed eyes fabric fabrics fabulous face faced faces facial facilitate facilities facility facing fact factor factors factory facts faculty fail failed failing fails failure failures fair fairfield fairly fairy faith fake fall fallen falling falls false fame familiar families family famous fancy fans fantastic fantasy faqs fare fares farm farmer farmers farming farms fascinating fashion fast faster fastest fatal fate father fathers fatty fault favor favor favorite favorite favorites favorites favors fear fears feat feature featured features featuring february federal federation feed feedback feeding feeds feel feeling feelings feels fees feet fell fellow fellowship felt female females fence feof ferrari ferry festival festivals fetish fever fewer fiber fibre fiction field fields fifteen fifth fifty fight fighter fighters fighting figure figured figures fiji file filed filename files filing fill filled filling film filme films filter filtering filters final finally finals finance finances financial financing find findarticles finder finding findings findlaw finds fine finest finger fingering fingers finish finished finishing finite finnish fioricet fire fired firefox fireplace fires firewall firewire firm firms firmware first fiscal fish fisher fisheries fishing fist fisting fitness fits fitted fitting five fixed fixes fixtures flag flags flame flash flashers flashing flat flavor fleece fleet flesh flex flexibility flexible flickr flight flights flip float floating flood floor flooring floors floppy floral florence florist florists flour flow flower flowers flows floyd fluid flush flux flyer flying foam focal focus focused focuses focusing fold folder folders folding folk folks follow followed following follows font fonts food foods fool foot footage football footwear forbes forbidden force forced forces ford forecast forecasts foreign forest forestry forests forever forge forget forgot forgotten fork form formal format formation formats formatting formed former formerly forming forms formula fort forth fortune forty forum forums forward forwarding fossil foster foto fotos fought foul found foundation foundations founded founder fountain four fourth fraction fragrance fragrances frame framed frames framework framing franchise francis frank frankfurt franklin fraser fraud fred frederick free freebsd freedom freelance freely freeware freeze freight frequencies frequency frequent frequently fresh friday fridge friend friendly friends friendship frog front frontier frontpage frost frozen fruit fruits fuck fucked fucking fuel fuji fujitsu full fully function functional functionality functioning functions fund fundamental fundamentals funded funding fundraising funds funeral funk funky funny furnished furnishings furniture further furthermore fusion future futures fuzzy gabriel gadgets gage gain gained gains galaxy gale galleries gallery gambling game gamecube games gamespot gaming gamma gang gangbang gaps garage garbage garcia garden gardening gardens garlic garmin gary gasoline gate gates gateway gather gathered gathering gauge gave gays gazette gear geek gender gene genealogy general generally generate generated generates generating generation generations generator generators generic generous genes genesis genetic genetics genius genome genre genres gentle gentleman gently genuine geographic geographical geography geological geology geometry george gerald gets getting ghost giant giants gibraltar gibson gift gifts gilbert girl girlfriend girls given gives giving glad glance glass glasses glen glenn global globe glory glossary gloves glow glucose gmbh gnome goal goals goat gods goes going gold golden golf gone gonna goods gordon gore gorgeous gospel gossip gothic goto gotta gotten gourmet governance governing government governmental governments governor grab grace grad grade grades gradually graduate graduated graduates graduation graham grain grammar grams grand grande granny grant granted grants graph graphic graphical graphics graphs gras grass grateful gratis gratuit grave gravity gray greater greatest greatly green greene greenhouse greensboro greeting greetings greg gregory grenada grew grey grid griffin grill grip grocery groove gross ground grounds groundwater group groups grove grow growing grown grows growth guam guarantee guaranteed guarantees guard guardian guards guatemala guess guest guestbook guests guidance guide guided guidelines guides guild guilty guinea guitar guitars gulf guns guru guyana guys gzip habitat habits hack hacker hair hairy haiti half halifax hall halloween halo hamilton hammer hampshire hampton hand handbags handbook handed handheld handhelds handjob handjobs handle handled handles handling handmade hands handy hang hanging hans hansen happen happened happening happens happiness happy harassment harbor harbor hard hardcore hardcover harder hardly hardware hardwood harley harm harmful harmony harold harper harris harrison harry hart hartford harvard harvest harvey hash hate hats haven having hawaii hawaiian hawk hayes hazard hazardous hazards hdtv head headed header headers heading headline headlines headphones headquarters heads headset healing health healthcare healthy hear heard hearing hearings heart hearts heat heated heater heath heather heating heaven heavily heavy heel height heights held helen helena helicopter hell hello helmet helped helpful helping helps hence henderson henry hentai hepatitis herald herb herbal herbs hereby herein heritage hero heroes herself hewlett hidden hide hierarchy high higher highest highland highlight highlighted highlights highly highs highway highways hiking hill hills hilton himself hindu hint hints hire hired hiring hispanic hist historic historical history hitachi hits hitting hobbies hobby hockey hold holdem holder holders holding holdings holds hole holes holiday holidays hollow holly hollywood holmes holocaust holy home homeland homeless homepage homes hometown homework honduras honest honey hong honolulu honor honors hood hook hope hoped hopefully hopes hoping hopkins horizon horizontal hormone horn horny horrible horror horse horses hose hospital hospitality hospitals host hosted hostel hostels hosting hosts hotel hotels hotmail hottest hour hourly hours house household households houses housewares housewives housing howard however howto href html http hudson huge hugh hughes hugo hull human humanitarian humanities humanity humans humidity humor hundred hundreds hung hungarian hunger hungry hunt hunter hunting huntington hurricane hurt husband hybrid hydraulic hydrocodone hydrogen hygiene hypothesis hypothetical hyundai icon icons idaho idea ideal ideas identical identification identified identifier identifies identify identifying identity idle idol ieee ignore ignored illegal illness illustrated illustration illustrations image images imagination imagine imaging immediate immediately immigrants immigration immune immunology impact impacts impaired imperial implement implementation implemented implementing implications implied implies import importance important importantly imported imports impose imposed impossible impressed impression impressive improve improved improvement improvements improving inappropriate inbox incentive incentives incest inch inches incidence incident incidents incl include included includes including inclusion inclusive income incoming incomplete incorporate incorporated incorrect increase increased increases increasing increasingly incredible incurred indeed independence independent independently index indexed indexes indiana indianapolis indians indicate indicated indicates indicating indication indicator indicators indices indie indigenous indirect individual individually individuals indonesian indoor induced induction industrial industries industry inexpensive infant infants infected infection infections infectious infinite inflation influence influenced influences info inform informal information informational informative informed infrared infrastructure infringement ingredients inherited initial initially initiated initiative initiatives injection injured injuries injury inkjet inline inner innocent innovation innovations innovative inns input inputs inquire inquiries inquiry insects insert inserted insertion inside insider insight insights inspection inspections inspector inspiration inspired install installation installations installed installing instance instances instant instantly instead institute institutes institution institutional institutions instruction instructional instructions instructor instructors instrument instrumental instrumentation instruments insulation insulin insurance insured intake integer integral integrate integrated integrating integration integrity intellectual intelligence intelligent intend intended intense intensity intensive intent intention inter interact interaction interactions interactive interest interested interesting interests interface interfaces interference interim interior intermediate internal international internationally internet internship interpretation interpreted interracial intersection interstate interval intervals intervention interventions interview interviews intimate intl into intranet intro introduce introduced introduces introducing introduction introductory invalid invasion invention inventory invest investigate investigated investigation investigations investigator investigators investing investment investments investor investors invisible invision invitation invitations invite invited invoice involve involved involvement involves involving iowa ipaq ipod iraqi irish iron irrigation isaac isbn islam islamic island islands isle isolated isolation issn issue issued issues italia italiano italic item items itself itunes ivory jack jacket jackets jackie jackson jacksonville jacob jade jaguar jail jake jamaica james jamie jane janet january jason java javascript jazz jean jeans jeep jeff jefferson jeffrey jelsoft jennifer jenny jeremy jerry jersey jesse jessica jesus jets jewel jewellery jewelry jewish jews jill jimmy joan jobs joel john johnny johns johnson johnston join joined joining joins joint joke jokes jonathan jones jose joseph josh joshua journal journalism journalist journalists journals journey joyce jpeg juan judge judges judgment judicial judy juice julia julian julie july jump jumping junction june jungle junior junk jurisdiction jury justice justify justin juvenile kansas karaoke karen karl karma kate kathy katie katrina kazakhstan keen keep keeping keeps keith kelkoo kelly kennedy kenneth kenny keno kent kentucky kept kernel kerry kevin keyboard keyboards keys keyword keywords kick kidney kids kijiji kill killed killer killing kills kilometers kinase kind kinda kinds king kingdom kings kingston kirk kiss kissing kitchen kits kitty klein knee knew knife knight knights knit knitting knives knock knowing knowledge knowledgestorm known knows kodak kruger kurt kyle label labeled labels labor labor laboratories laboratory labs lace lack ladder laden ladies lady lafayette laid lake lakes lamb lambda lamp lamps lancaster lance land landing lands landscape landscapes lane lanes lang language languages lanka laos laptop laptops large largely larger largest larry laser last lasting late lately later latest latex latin latina latinas latino latitude latter lauderdale laugh laughing launch launched launches laundry laura lauren lawn lawrence laws lawsuit lawyer lawyers layer layers layout lazy lead leader leaders leadership leading leads leaf league lean learn learned learners learning lease leasing least leather leave leaves leaving lecture lectures left legacy legal legally legend legendary legends legislation legislative legislature legitimate legs leisure lemon lender lenders lending length lens lenses leon leonard leone lesbian lesbians leslie less lesser lesson lessons lets letter letters letting level levels levitra levy lewis lexington lexmark lexus liabilities liability liable liberal liberia liberty librarian libraries library libs licence license licensed licenses licensing licking liechtenstein lies life lifestyle lifetime lift light lightbox lighter lighting lightning lights lightweight liked likelihood likely likes likewise lime limit limitation limitations limited limiting limits limousines lincoln linda lindsay line linear lined lines lingerie link linked linking links linux lion lions lips liquid lisa list listed listen listening listing listings listprice lists lite literacy literally literary literature litigation little live livecam lived liver lives livesex livestock living lloyd load loaded loading loads loan loans lobby local locale locally locate located location locations locator lock locked locking locks lodge lodging logan logged logging logic logical login logistics logitech logo logos logs lolita lone lonely long longer longest longitude look looked looking looks looksmart lookup loop loops loose lopez lord lose losing loss losses lost lots lottery lotus loud louis louise louisiana louisville lounge loved lovely lover lovers loves loving lower lowest lows lucas lucia luck lucky lucy luggage luis luke lunch lung luther luxembourg luxury lycos lying lynn lyric lyrics macedonia machine machinery machines macintosh macro macromedia madagascar made madison madness madonna magazine magazines magic magical magnet magnetic magnificent magnitude maiden mail mailed mailing mailman mails mailto main maine mainland mainly mainstream maintain maintained maintaining maintains maintenance major majority maker makers makes makeup making malawi maldives male males mali mall malpractice mambo manage managed management manager managers managing mandate mandatory manga manhattan manitoba manner manor manual manually manuals manufacture manufactured manufacturer manufacturers manufacturing many maple mapping maps marathon marble marc march marco marcus mardi margaret margin maria mariah marie marijuana marilyn marina marine mario marion maritime mark marked marker markers market marketing marketplace markets marking marks marriage married marriott mars marsh marshall mart martha martial martin marvel mary maryland mask mason mass massage massive master mastercard masters masturbating masturbation match matched matches matching mate material materials maternity math mathematical mathematics mating matrix mats matt matter matters matthew mattress mature maui mauritius maximize maximum maybe mayor mazda mcdonald meal meals mean meaning meaningful means meant meanwhile measure measured measurement measurements measures measuring meat mechanical mechanics mechanism mechanisms medal media median mediawiki medicaid medical medicare medication medications medicine medicines medieval meditation medium medline meet meeting meetings meets meetup mega melissa member members membership membrane memo memorabilia memorial memories memory memphis mens ment mental mention mentioned mentor menu menus mercedes merchandise merchant merchants mercury mercy mere merely merge merger merit merry mesa mesh mess message messages messaging messenger meta metabolism metadata metal metallic metallica metals meter meters method methodology methods metres metric metro metropolitan mexican meyer mice michael michel michelle micro microphone microwave middle midi midlands midnight midwest mighty migration mike mild mile mileage miles milf milfhunter milfs military milk mill millennium miller million millions mills milton milwaukee mime mind minds mine mineral minerals mines mini miniature minimal minimize minimum mining minister ministers ministries ministry minnesota minolta minor minority mins mint minus minute minutes miracle mirror mirrors misc miscellaneous missed missile missing mission missions mississippi missouri mistake mistakes mistress mitchell mitsubishi mixed mixer mixing mixture mobile mobiles mobility mode model modeling modelling models modem modems moderate moderator moderators modern modes modification modifications modified modify mods modular module modules moisture mold molecular molecules moment moments momentum moms monaco monetary money mongolia monica monitor monitored monitoring monitors monkey mono monroe monster monsters montana monte montgomery month monthly months mood moon moore moral moreover morgan morning morris morrison mortality mortgage mortgages moses moss most mostly motel motels mother motherboard mothers motion motivated motivation motor motorcycle motorcycles motorola motors mount mountain mountains mounted mounting mounts mouse mouth move moved movement movements movers moves movie movies moving mozambique mozilla mpeg mpegs mrna msgid msgstr msie much multi multimedia multiple municipal municipality murder murphy murray muscle muscles museum museums music musical musician musicians muslim muslims mustang mutual muze myanmar myers myrtle myself mysimon myspace mysql mysterious mystery myth nail nails naked name named namely names namespace namibia nancy nano narrative narrow nasa nascar nasdaq nasty nathan nation national nationally nations nationwide native nato natural naturally naturals nature naughty naval navigate navigation navigator navy ncaa near nearby nearest nearly nebraska necessarily necessary necessity neck necklace needed needle needs negative negotiation negotiations neighbor neighborhood neighbors neil neither nelson neon nepal nerve nervous nest nested netscape network networking networks neural neutral never nevertheless newark newbie newcastle newer newest newfoundland newly newman newport news newsletter newsletters newspaper newspapers newton next nextel niagara nicaragua nicholas nick nickel nickname nicole niger night nightlife nightmare nights nike nikon nine nintendo nipple nipples nirvana nitrogen noble nobody node nodes noise nokia nominated nomination nominations none nonprofit noon norfolk norm normal normally norman north northeast northern northwest norton norwegian nose note notebook notebooks noted notes nothing notice noticed notices notification notifications notified notify notre nottingham nova novel novels novelty november nowhere ntsc nuclear nude nudist nudity nuke null number numbers numeric numerical numerous nurse nursery nurses nursing nutrition nutritional nuts nutten nylon oakland oaks oasis obesity obituaries object objective objectives objects obligation obligations observation observations observe observed observer obtain obtained obtaining obvious obviously occasion occasional occasionally occasions occupation occupational occupations occupied occur occurred occurrence occurring occurs ocean oclc october odds oecd offense offensive offer offered offering offerings offers office officer officers offices official officially officials offline offset offshore often oils oklahoma older oldest olive oliver olympic olympics olympus omaha omega omissions once ones ongoing onion online only ontario onto oops open opened opening openings opens opera operate operated operates operating operation operational operations operator operators opinion opinions opponent opponents opportunities opportunity opposed opposite opposition optical optics optimal optimization optimize optimum option optional options oral orange orbit orchestra order ordered ordering orders ordinance ordinary organ organic organisation organisations organisms organization organizational organizations organize organized organized organizer organizing orgasm orgy oriental orientation oriented origin original originally origins orleans oscar other others otherwise ought ours ourselves outcome outcomes outdoor outdoors outer outlet outlets outline outlined outlook output outputs outreach outside outsourcing outstanding oval oven over overall overcome overhead overnight overseas overview owen owned owner owners ownership owns oxford oxide oxygen ozone pace pack package packages packaging packard packed packet packets packing packs pads page pages paid pain painful paint paintball painted painting paintings pair pairs palace pale palestine palestinian palm palmer pamela panama panasonic panel panels panic panties pants pantyhose paper paperback paperbacks papers papua para parade paradise paragraph paragraphs paraguay parallel parameter parameters parcel parent parental parenting parents parish park parker parking parks parliament parliamentary part partial partially participant participants participate participated participating participation particle particles particular particularly parties partition partly partner partners partnership partnerships parts party paso pass passage passed passenger passengers passes passing passion passive passport password passwords past pasta paste pastor patch patches patent patents path pathology paths patient patients patio patricia patrick patrol pattern patterns paul pavilion paxil payable payday paying payment payments payroll pays pdas peace peaceful peak pearl peas pediatric peeing peer peers penalties penalty pencil pendant pending penetration penguin peninsula penis penn pennsylvania penny pens pension pensions pentium people peoples pepper perceived percent percentage perception perfect perfectly perform performance performances performed performer performing performs perfume perhaps period periodic periodically periods peripheral peripherals perl permalink permanent permission permissions permit permits permitted perry persian persistent person personal personality personalized personally personals personnel persons perspective perspectives pest pete peter peterson petite petition petroleum pets phantom pharmaceutical pharmaceuticals pharmacies pharmacology pharmacy phase phases phenomenon phentermine phil philip phillips philosophy phone phones photo photograph photographer photographers photographic photographs photography photos photoshop phpbb phrase phrases phys physical physically physician physicians physics physiology piano pichunter pick picked picking picks pickup picnic pics picture pictures piece pieces pierce pierre pike pill pillow pills pilot pine ping pink pins pioneer pipe pipeline pipes pirates piss pissing pitch pittsburgh pixel pixels pizza place placed placement places placing plain plains plaintiff plan plane planes planet planets planned planner planners planning plans plant plants plasma plastic plastics plate plates platform platforms platinum play playback playboy played player players playing playlist plays playstation plaza pleasant pleased pleasure pledge plenty plot plots plug plugin plugins plumbing plus plymouth pmid pocket pockets podcast podcasts poem poems poet poetry point pointed pointer pointing points poison pokemon poker polar pole police policies policy polish polished political politicians politics poll polls pollution polo poly polyester polymer polyphonic pond pontiac pool pools poor pope popular popularity population populations porcelain pork porn porno porsche port portable portal porter portfolio portion portions portrait portraits ports portsmouth portuguese pose posing position positioning positions positive possess possession possibilities possibility possible possibly post postage postal postcard postcards posted poster posters posting postings postposted posts potato potatoes potential potentially potter pottery poultry pound pounds pour poverty powder powell power powered powerful powerpoint powers powerseller practical practice practices practitioner practitioners prairie praise pray prayer prayers preceding precious precipitation precise precisely precision predict predicted prediction predictions prefer preference preferences preferred prefers prefix pregnancy pregnant preliminary premier premiere premises premium prep prepaid preparation prepare prepared preparing prerequisite prescribed prescription presence present presentation presentations presented presenting presently presents preservation preserve president presidential press pressed pressing pressure preston pretty prev prevent preventing prevention preview previews previous previously price priced prices pricing pride priest primarily primary prime prince princess princeton principal principle principles print printable printed printer printers printing prints prior priorities priority prison prisoner prisoners privacy private privilege privileges prix prize prizes probability probably probe problem problems proc procedure procedures proceed proceeding proceedings proceeds process processed processes processing processor processors procurement produce produced producer producers produces producing product production productions productive productivity products profession professional professionals professor profile profiles profit profits program programme programmer programmers programmes programming programs progress progressive prohibited project projected projection projector projectors projects prominent promise promised promises promising promo promote promoted promotes promoting promotion promotional promotions prompt promptly proof propecia proper properly properties property prophet proportion proposal proposals propose proposed proposition proprietary pros prospect prospective prospects prostate prostores prot protect protected protecting protection protective protein proteins protest protocol protocols prototype proud proudly prove proved proven provide provided providence provider providers provides providing province provinces provincial provision provisions proxy prozac psychiatry psychological psychology public publication publications publicity publicly publish published publisher publishers publishing pubmed pubs puerto pull pulled pulling pulse pump pumps punch punishment punk pupils puppy purchase purchased purchases purchasing pure purple purpose purposes purse pursuant pursue pursuit push pushed pushing pussy puts putting puzzle puzzles python quad qualification qualifications qualified qualify qualifying qualities quality quantitative quantities quantity quantum quarter quarterly quarters quebec queen queens queensland queries query quest question questionnaire questions queue quick quickly quiet quilt quit quite quiz quizzes quotations quote quoted quotes rabbit race races rachel racial racing rack racks radar radiation radical radio radios radius rage raid rail railroad railway rain rainbow raise raised raises raising raleigh rally ralph ranch rand random randy range ranger rangers ranges ranging rank ranked ranking rankings ranks rape rapid rapidly rapids rare rarely rate rated rates rather rating ratings ratio rational ratios rats raymond rays reach reached reaches reaching reaction reactions read reader readers readily reading readings reads ready real realistic reality realize realized really realm realtor realtors realty rear reason reasonable reasonably reasoning reasons rebate rebates rebecca rebel rebound recall receipt receive received receiver receivers receives receiving recent recently reception receptor receptors recipe recipes recipient recipients recognition recognize recognized recognized recommend recommendation recommendations recommended recommends reconstruction record recorded recorder recorders recording recordings records recover recovered recovery recreation recreational recruiting recruitment recycling redeem redhead reduce reduced reduces reducing reduction reductions reed reef reel refer reference referenced references referral referrals referred referring refers refinance refine refined reflect reflected reflection reflections reflects reform reforms refresh refrigerator refugees refund refurbished refuse refused regard regarded regarding regardless regards reggae regime region regional regions register registered registrar registration registry regression regular regularly regulated regulation regulations regulatory rehab rehabilitation reid reject rejected relate related relates relating relation relations relationship relationships relative relatively relatives relax relaxation relay release released releases relevance relevant reliability reliable reliance relief religion religions religious reload relocation rely relying remain remainder remained remaining remains remark remarkable remarks remedies remedy remember remembered remind reminder remix remote removable removal remove removed removing renaissance render rendered rendering renew renewable renewal reno rent rental rentals repair repairs repeat repeated replace replaced replacement replacing replica replication replied replies reply report reported reporter reporters reporting reports repository represent representation representations representative representatives represented representing represents reprint reprints reproduce reproduced reproduction reproductive republic republican republicans reputation request requested requesting requests require required requirement requirements requires requiring rescue research researcher researchers reseller reservation reservations reserve reserved reserves reservoir reset residence resident residential residents resist resistance resistant resolution resolutions resolve resolved resort resorts resource resources respect respected respective respectively respiratory respond responded respondent respondents responding response responses responsibilities responsibility responsible rest restaurant restaurants restoration restore restored restrict restricted restriction restrictions restructuring result resulted resulting results resume resumes retail retailer retailers retain retained retention retired retirement retreat retrieval retrieve retrieved retro return returned returning returns reunion reuters reveal revealed reveals revelation revenge revenue revenues reverse review reviewed reviewer reviewing reviews revised revision revisions revolution revolutionary reward rewards reynolds rhode rhythm ribbon rica rice rich richard richards richardson richmond rick ricky rico ride rider riders rides ridge riding right rights ring rings ringtone ringtones ripe rise rising risk risks river rivers riverside road roads robbie robert roberts robertson robin robinson robot robots robust rochester rock rocket rocks rocky roger rogers roland role roles roll rolled roller rolling rolls roman romance romantic ronald roof room roommate roommates rooms root roots rope rosa rose roses ross roster rotary rotation rouge rough roughly roulette round rounds route router routers routes routine routines routing rover rows royal royalty rubber ruby rugby rugs rule ruled rules ruling runner running runs runtime rural rush russell ruth rwanda ryan sacramento sacred sacrifice saddam safari safe safely safer safety sage sagem said sail sailing saint saints sake salad salaries salary sale salem sales sally salmon salon salt salvador salvation samba same samoa sample samples sampling samuel sand sandra sandwich sandy sans santa sanyo sapphire sara sarah saskatchewan satellite satin satisfaction satisfactory satisfied satisfy saturday saturn sauce savage savannah save saved saver saves saving savings saying says sbjct scale scales scan scanned scanner scanners scanning scared scary scenario scenarios scene scenes scenic schedule scheduled schedules scheduling schema scheme schemes scholar scholars scholarship scholarships school schools science sciences scientific scientist scientists scoop scope score scored scores scoring scotia scott scottish scout scratch screen screening screens screensaver screensavers screenshot screenshots screw script scripting scripts scroll scsi scuba sculpture seafood seal sealed sean search searched searches searching seas season seasonal seasons seat seating seats second secondary seconds secret secretariat secretary secrets section sections sector sectors secure secured securely securities security seed seeds seeing seek seeker seekers seeking seeks seem seemed seems seen sees sega segment segments select selected selecting selection selections selective self sell seller sellers selling sells semester semi semiconductor seminar seminars senate senator senators send sender sending sends senegal senior seniors sense sensitive sensitivity sensor sensors sent sentence sentences separate separated separately separation sept september sequence sequences serial series serious seriously serum serve served server servers serves service services serving session sessions sets setting settings settle settled settlement setup seven seventh several severe sewing sexcam sexo sexual sexuality sexually sexy shade shades shadow shadows shaft shake shakespeare shakira shame shannon shape shaped shapes share shared shareholders shares shareware sharing shark sharon sharp shaved shaw shed sheep sheer sheet sheets sheffield shelf shell shelter shemale shemales shepherd sheriff sherman shield shift shine ship shipment shipments shipped shipping ships shirt shirts shit shock shoe shoes shoot shooting shop shopper shoppers shopping shops shopzilla shore short shortcuts shorter shortly shorts shot shots shoulder show showcase showed shower showers showing shown shows showtimes shut shuttle sick side sides sierra sight sigma sign signal signals signature signatures signed significance significant significantly signing signs signup silence silent silicon silk silly silver similar similarly simon simple simplified simply simpson simpsons sims simulation simulations simultaneously since sing singer singh singing single singles sink sister sisters site sitemap sites sitting situated situation situations sixth size sized sizes skating skiing skill skilled skills skin skins skip skirt skirts skype slave sleep sleeping sleeps sleeve slide slides slideshow slight slightly slim slip slope slot slots slovak slow slowly slut sluts small smaller smallest smart smell smile smilies smith smithsonian smoke smoking smooth smtp snake snap snapshot snow snowboard soap soccer social societies society sociology socket socks sodium sofa soft softball software soil solar solaris sold soldier soldiers sole solely solid solo solomon solution solutions solve solved solving soma somalia somebody somehow someone somerset something sometimes somewhat somewhere song songs sonic sons soon soonest sophisticated sort sorted sorts sought soul souls sound sounds soundtrack soup source sources south southampton southeast southern southwest soviet space spaces spam span spank spanking sparc spare spas spatial speak speaker speakers speaking speaks spears spec special specialist specialists specialized specializing specially specials specialties specialty species specific specifically specification specifications specifics specified specifies specify specs spectacular spectrum speech speeches speed speeds spell spelling spencer spend spending spent sperm sphere spice spider spies spin spine spirit spirits spiritual spirituality split spoke spoken spokesman sponsor sponsored sponsors sponsorship sport sporting sports spot spotlight spots spouse spray spread spreading spring springer springfield springs sprint spyware squad square squirt squirting stability stable stack stadium staff staffing stage stages stainless stake stakeholders stamp stamps stan stand standard standards standing standings stands stanford stanley star starring stars starsmerchant start started starter starting starts startup stat state stated statement statements states statewide static stating station stationery stations statistical statistics stats status statute statutes statutory stay stayed staying stays steady steal steam steel steering stem step stephanie stephen steps stereo sterling steve steven stevens stewart stick sticker stickers sticks sticky still stock stockings stocks stolen stomach stone stones stood stopped stopping stops storage store stored stores stories storm story straight strain strand strange stranger strap strategic strategies strategy stream streaming streams street streets strength strengthen strengthening strengths stress stretch strict strictly strike strikes striking string strings strip stripes strips stroke strong stronger strongly struck struct structural structure structured structures struggle stuart stuck stud student students studied studies studio studios study studying stuff stuffed stunning stupid style styles stylish stylus subaru subcommittee subdivision subject subjective subjects sublime sublimedirectory submission submissions submit submitted submitting subscribe subscriber subscribers subscription subscriptions subsection subsequent subsequently subsidiaries subsidiary substance substances substantial substantially substitute subtle suburban succeed success successful successfully such suck sucking sucks sudan sudden suddenly suffer suffered suffering sufficient sufficiently sugar suggest suggested suggesting suggestion suggestions suggests suicide suit suitable suite suited suites suits sullivan summaries summary summer summit sunday sunglasses sunny sunrise sunset sunshine super superb superintendent superior supervision supervisor supervisors supplement supplemental supplements supplied supplier suppliers supplies supply support supported supporters supporting supports suppose supposed supreme surely surf surface surfaces surfing surge surgeon surgeons surgery surgical surname surplus surprise surprised surprising surrey surround surrounded surrounding surveillance survey surveys survival survive survivor survivors susan suse suspect suspected suspended suspension sussex sustainability sustainable sustained suzuki swap swaziland swedish sweet swift swim swimming swing swingers swiss switch switched switches switching sword symantec symbol symbols sympathy symphony symposium symptoms sync syndicate syndication syndrome synopsis syntax synthesis synthetic syracuse system systematic systems table tables tablet tablets tabs tackle tactics tagged tags tahoe tail taken takes taking tale talent talented tales talk talked talking talks tall tamil tampa tank tanks tape tapes target targeted targets tariff task tasks taste tattoo taught taxation taxes taxi taylor teach teacher teachers teaches teaching team teams tear tears tech technical technician technique techniques techno technological technologies technology techrepublic teddy teen teenage teens teeth telecharger telecom telecommunications telephone telephony telescope television televisions tell telling tells temp temperature temperatures template templates temple temporal temporarily temporary tenant tend tender tennessee tennis tension tent term terminal terminals termination terminology terms terrace terrain terrible territories territory terror terrorism terrorist terrorists terry test testament tested testimonials testimony testing tests text textbook textbooks textile textiles texts texture thai than thank thanksgiving thats theater theaters theatre thee theft thehun their them theme themes themselves theology theorem theoretical theories theory therapeutic therapist therapy thereafter thereby therefore thereof thermal thesaurus thesis theta thick thickness thin thing things thinking thinkpad thinks third thirty thomas thompson thomson thong thongs thorough thoroughly thou though thought thoughts thousand thousands thread threaded threads threat threatened threatening threats three threesome threshold thriller throat through throughout throw throwing thrown throws thru thumb thumbnail thumbnails thumbs thumbzilla thunder thursday thus ticket tickets tide tied tier ties tiffany tiger tigers tight tile tiles till timber timeline timely timer times timing timothy tiny tion tions tips tire tired tires tissue titanium titans title titled titles tits titten tobacco tobago today todd toddler together toilet token told tolerance toll tomato tomatoes tommy tomorrow tone toner tones tongue tonight tons tony took tool toolbar toolbox toolkit tools tooth topic topics topless tops torture toshiba total totally totals touch touched tough tour touring tourism tourist tournament tournaments tours toward towards tower towers towns township toxic toys trace track trackback trackbacks tracked tracker tracking tracks tract tractor tracy trade trademark trademarks trader trades trading tradition traditional traditions traffic tragedy trail trailer trailers trails train trained trainer trainers training trains tramadol trance tranny trans transaction transactions transcript transcription transcripts transexual transexuales transfer transferred transfers transform transformation transit transition translate translated translation translations translator transmission transmit transmitted transparency transparent transport transportation transsexual trap trash trauma travel traveler travelers traveling traveller travelling travels travesti travis tray treasure treasurer treasures treasury treat treated treating treatment treatments treaty tree trees trek trembl tremendous trend trends treo trial trials triangle tribal tribe tribes tribunal tribune tribute trick tricks tried tries trigger trim trinidad trinity trio trip tripadvisor triple trips triumph trivia troops tropical trouble troubleshooting trout troy truck trucks true truly trunk trust trusted trustee trustees trusts truth trying tsunami tube tubes tucson tuesday tuition tulsa tumor tune tuner tunes tuning tunnel turbo turkish turn turned turner turning turns turtle tutorial tutorials twelve twenty twice twiki twin twinks twins twist twisted tyler type types typical typically typing ugly ultimate ultimately ultra ultram unable unauthorized unavailable uncertainty uncle undefined under undergraduate underground underlying understand understanding understood undertake undertaken underwear undo unemployment unexpected unfortunately unified uniform union unions uniprotkb unique unit united units unity univ universal universe universities university unix unknown unless unlike unlikely unlimited unlock unnecessary unsigned unsubscribe until untitled unto unusual unwrap upcoming update updated updates updating upgrade upgrades upgrading upload uploaded upon upper upset upskirt upskirts urban urge urgent urls uruguay usage usda used useful user username users uses usgs using usps usual usually utah utilities utility utilization utilize utils uzbekistan vacancies vacation vacations vaccine vacuum vagina valentine valid validation validity valium valley valuable valuation value valued values valve valves vampire vanilla variable variables variance variation variations varied varies varieties variety various vary varying vast vatican vault vbulletin vector vegetable vegetables vegetarian vegetation vehicle vehicles velocity velvet vendor vendors venezuela venice venture ventures venue venues verbal verde verification verified verify verizon vermont vernon verse version versions versus vertex vertical verzeichnis vessel vessels veteran veterans veterinary viagra vibrator vibrators vice victim victims victor victoria victorian victory video videos vids vietnamese view viewed viewer viewers viewing viewpicture views viii viking villa village villages villas vincent vintage vinyl violation violations violence violent violin viral virgin virtual virtually virtue virus viruses visa visibility visible vision visit visited visiting visitor visitors visits vista visual vital vitamin vitamins vocabulary vocal vocals vocational voice voices void voip volkswagen volleyball volt voltage volume volumes voluntary volunteer volunteers volvo vote voted voters votes voting voyeur voyeurweb voyuer vsnet vulnerability vulnerable wage wages wagner wagon waiting waiver wake walk walked walker walking walks wall wallace wallet wallpaper wallpapers walls walnut walt walter wang wanna wanted wanting wants warcraft ward ware warehouse warm warming warned warner warning warnings warrant warranties warranty warren warrior warriors wars wash washer washing waste watch watched watches watching water waterproof waters watershed watson watt watts wave waves wayne ways weak wealth weapon weapons wear wearing weather webcam webcams webcast weblog weblogs webmaster webmasters webpage webshots website websites webster wedding weddings wednesday weed week weekend weekends weekly weeks weight weighted weights weird welcome welding welfare well wellness wells welsh wendy went wesley west western westminster whale whatever whats wheat wheel wheels whenever whereas wherever whether while whilst white whole wholesale whom whore whose wichita wicked wide widely wider widescreen widespread width wife wifi wiki wikipedia wild wilderness wildlife wiley william williams willing willow wilson wind window windows winds windsor wine wines wing wings winner winners winning wins winston winter wire wired wireless wires wiring wisconsin wisdom wise wish wishes wishing wishlist witch withdrawal within without witness witnesses wives wizard wolf woman women womens wonder wonderful wondering wood wooden woods wool worcester word wordpress words worked worker workers workflow workforce working workout workplace works workshop workshops workstation world worldcat worlds worldsex worldwide worm worn worried worry worse worship worst worth worthy wound wrap wrapped wrapping wrestling wright wrist write writer writers writes writing writings written wrong wrote wyoming xanax xbox xerox xhtml xnxx yacht yahoo yale yamaha yang yard yards yarn yeah year yearly years yeast yellow yesterday yield yields yoga yorkshire young younger yours yourself youth yugoslavia yukon zambia zdnet zero zimbabwe zinc zoloft zone zones zoning zoophilia zope zshops').split(' '));

// Where the bigram score is still allowed to have an opinion, now that a real
// dictionary sits in front of it. It used to be 0.35, and at 0.35 it was the
// only thing standing between a Hebrew sentence and its own last word: בהמשך,
// בכביש, בקרוב and בהקדם all score 0.50 or more through a Latin keyboard.
//
// Swept across the whole range. 0.35 leaves 7 of 31 Hebrew sentences converting
// short; 0.76 is the first point where all 31 convert whole; every value from
// 0.35 to 1.01 gives the same Fβ, the same zero false positives out of 624, and
// the same 11/11 spans. 0.80 rather than 0.76 because 0.76 is exactly the
// highest word in the corpus and that is a number fitted to a corpus, not a
// threshold. Above it the score is off entirely, which is not the intent: it
// still has to catch the English words a ten-thousand-word list does not know.
const EN_THRESHOLD = 0.80;

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

// The two English lists had drifted: eighteen words sat in COMMON_EN_WORDS and
// not here, among them "go" and "do". Both map onto real Hebrew words — עם and
// גם — so both passed wordCouldBeHebrew, and two adjacent words is the whole
// minimum run. Typing "go do that" in plain English got an offer to convert it.
//
// Enforcing the containment rather than adding the three words keeps the lists
// from parting again. Anything common enough to be scored as a common English
// word must never be a candidate for wrong-layout text.
for (const w of COMMON_EN_WORDS) EN_WORDS.add(w);

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

// Trailing punctuation is not part of the word — except when it is. A comma is
// the ת key in Hebrew and the б key in Russian, so it cannot simply be stripped:
// it has to be tried both ways, once as a letter and once as punctuation.
//
// Hebrew has done this since early on. The other five never did, and it is the
// single largest reason a fix stops in the middle of a sentence. "Γεια σου, τι
// κάνεις σήμερα" was offered as nothing at all, because σου, ends in a comma,
// the comma is not on the Greek layout, and the word was refused before any
// scoring saw it. Measured across the corpus, Greek converted 0 of 11 sentences
// whole.
function orWithoutTrailingPunctuation(word, test) {
  if (test(word)) return true;
  const trimmed = word.replace(/[,.;:!?)\]}"']+$/, '');
  return trimmed.length >= 2 && trimmed !== word && test(trimmed);
}

// A single letter with punctuation hung off it is a list item, an initial, a
// spreadsheet column. "s, i, n," maps onto דת ןת מת cleanly enough to look like
// a three-word Hebrew run, and it was offered as one on a page of English prose.
//
// It cannot simply be refused: "t," really is את, and "t, vhuo" really is
// את היום. The rule is therefore about the run, not the word — a token this
// short may belong to a run, but a run made of nothing else is not evidence of
// anything. Every run has to contain at least one word with two letters in it.
function hasTwoLetters(word) {
  return (word.match(/[a-zA-Z]/g) || []).length >= 2;
}

function isRealRun(entry) {
  return entry.words.some(hasTwoLetters);
}

function wordCouldBeRussian(word) {
  return orWithoutTrailingPunctuation(word, russianExactly);
}

function russianExactly(word) {
  if (looksLikeAcronym(word)) return false;
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;
  if (learnedEnglish.has(lower)) return false;
  if (learnedRussian.has(lower)) return true;
  if (EN_WORDS.has(lower)) return false;
  const mapped = [...lower].map(c => EN_TO_RU[c]);
  if (!mapped.every(c => c !== undefined)) return false;
  const ruWord = mapped.join('');
  // A known Russian word outranks both heuristics below. Checked after
  // EN_WORDS so real English still wins, but before them because they were
  // silently eating the two commonest words in the language: "ghbdtn"
  // (привет) looks plausibly Hebrew, and "rfr" (как) scores 0.50 as English.
  if (COMMON_RU_WORDS.has(ruWord)) return true;
  if (enabledLangs.he && wordCouldBeHebrew(word)) return false;
  if (englishScore(lower) >= 0.35) return false;
  // Yield to Ukrainian when this is plainly a Ukrainian word and not a Russian
  // one. "ghbdsn" decodes to привіт under the Ukrainian layout, but under the
  // Russian one it becomes привыт — not a word, yet still scoring well enough
  // on bigrams to be claimed here, which starved Case U2 of every word it
  // exists to catch.
  if (enabledLangs.uk && !COMMON_RU_WORDS.has(ruWord)) {
    const ukMapped = [...lower].map(c => EN_TO_UK[c]);
    if (ukMapped.every(c => c !== undefined) &&
        COMMON_UK_WORDS.has(ukMapped.join(''))) return false;
  }
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
  return orWithoutTrailingPunctuation(word, ukrainianExactly);
}

function ukrainianExactly(word) {
  if (looksLikeAcronym(word)) return false;
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;
  if (learnedEnglish.has(lower)) return false;
  if (learnedUkrainian.has(lower)) return true;
  if (EN_WORDS.has(lower)) return false;
  const mapped = [...lower].map(c => EN_TO_UK[c]);
  if (!mapped.every(c => c !== undefined)) return false;
  const ukWord = mapped.join('');
  // Known word first, for the same reason as the Russian check above.
  if (COMMON_UK_WORDS.has(ukWord)) return true;
  if (enabledLangs.he && wordCouldBeHebrew(word)) return false;
  if (englishScore(lower) >= 0.35) return false;
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
  return orWithoutTrailingPunctuation(word, arabicExactly);
}

function arabicExactly(word) {
  if (looksLikeAcronym(word)) return false;
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;
  if (learnedEnglish.has(lower)) return false;
  if (learnedArabic.has(lower)) return true;
  if (EN_WORDS.has(lower)) return false;
  const mapped = [...lower].map(c => EN_TO_AR[c]);
  if (!mapped.every(c => c !== undefined)) return false;
  const arWord = mapped.join('');
  // Known word first, for the same reason as the Russian check above.
  if (COMMON_AR_WORDS.has(arWord)) return true;
  if (englishScore(lower) >= 0.35) return false;
  return arabicScore(arWord) >= 0.25;
}

// ── Greek scoring data ────────────────────────────────────────
const EL_BIGRAMS = new Set([
  'αι','τα','το','ου','ος','ει','ης','ον','αν','ερ',
  'ρο','κα','να','με','τη','ντ','στ','ια','εν','ις',
  'ας','ατ','ικ','λο','ολ','ορ','πο','πα','ρα','ρι',
  'σε','τι','υπ','χα','ωσ','μα','μο','νο','λι','λα',
  'δε','δι','γι','γε','θα','θε','φο','φα','βα','ελ',
  'τρ','πρ','κρ','χρ','γρ','δρ','σπ','σκ','αρ','απ',
  'επ','εκ','ετ','ημ','ιν','ιο','ητ','ομ','οπ','συ',
]);

const COMMON_EL_WORDS = new Set([
  'και','να','το','τα','της','του','την','τον','των','οι',
  'με','σε','για','από','που','δεν','είναι','ένα','μια','ένας',
  'στο','στη','στον','στην','στα','ως','αν','θα','όταν',
  'όχι','ναι','γεια','σου','σας','μου','μας','τους','τις',
  'καλά','καλή','καλό','ευχαριστώ','παρακαλώ','συγγνώμη',
  'τι','πως','πώς','πού','ποιος','πότε','γιατί','ποιο',
  'όλα','όλοι','κάτι','τίποτα','πολύ','λίγο','ακόμα','πάλι',
  'τώρα','μετά','πριν','εδώ','εκεί','σήμερα','αύριο','χθες',
  'σπίτι','δουλειά','φίλος','φίλε','χρόνος','μέρα','νύχτα','ώρα',
  'καλημέρα','καλησπέρα','καληνύχτα','αντίο','έλα','πάμε',
  'άνθρωπος','παιδί','κόσμος','ζωή','χέρι','μάτι','νερό','ψωμί',
  'θέλω','έχω','κάνω','λέω','πάω','ξέρω','μπορώ','πρέπει',
  'αυτό','αυτή','αυτός','εγώ','εσύ','εμείς','εσείς','αλλά',
]);

// Plenty of people type Greek without the tonos key, so match the word list
// with accents stripped from both sides rather than demanding an exact hit.
const stripTonos = w => [...w].map(c => EL_UNTONOS[c] || c).join('');
const COMMON_EL_WORDS_PLAIN = new Set([...COMMON_EL_WORDS].map(stripTonos));

function greekScore(word) {
  const s = word.toLowerCase();
  if (s.length < 2) return 0;
  let hits = 0;
  for (let i = 0; i < s.length - 1; i++) {
    if (EL_BIGRAMS.has(s.slice(i, i + 2))) hits++;
  }
  return hits / (s.length - 1);
}

function wordCouldBeGreek(word) {
  return orWithoutTrailingPunctuation(word, greekExactly);
}

function greekExactly(word) {
  if (looksLikeAcronym(word)) return false;
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;
  if (learnedEnglish.has(lower)) return false;
  if (learnedGreek.has(lower)) return true;
  if (EN_WORDS.has(lower)) return false;
  if (![...lower].every(c => EN_TO_EL[c] !== undefined)) return false;
  const elWord = convertToGreek(lower);
  if (COMMON_EL_WORDS_PLAIN.has(stripTonos(elWord))) return true;
  if (englishScore(lower) >= 0.35) return false;
  // 0.3 let "lazy"/"project"/"support" through — nearly every QWERTY key maps to
  // a Greek letter, so this pass needs the tighter bar Korean uses.
  return greekScore(elWord) >= 0.5;
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
  return orWithoutTrailingPunctuation(word, koreanExactly);
}

function koreanExactly(word) {
  if (looksLikeAcronym(word)) return false;
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
  // A long token that decomposes into four or more complete syllables is
  // evidence on its own, and the two scores below are not built for it.
  // englishScore on a twelve-character romanisation is noise — 보냈습니다
  // reads as 0.36 English and was rejected — while koreanScore's 0.5 floor is
  // tuned for short words and drops 모르겠어요 at 0.40. Both are ordinary
  // things to type. Hangul that falls out this cleanly, this many syllables
  // deep, is not an accident of English letters.
  if (koWord.length >= 4 && koreanScore(koWord) >= 0.35) return true;
  if (englishScore(lower) >= 0.35) return false;
  return koreanScore(koWord) >= 0.5;
}

// ── Helper functions ──────────────────────────────────────────
function hasHebrew(t)          { return HEBREW_RE.test(t); }
function hasArabic(t)          { return ARABIC_RE.test(t); }
// Frequent Hebrew words. Hebrew was the first language Kiko supported and the
// only one that never got a word list, which is why it was the only one that
// could offer to convert a perfectly good sentence into gibberish: there was
// no way to ask "is this already real Hebrew?", only "does the conversion look
// vaguely English?" — and that question has a much worse answer rate.
const COMMON_HE_WORDS = new Set([
  // pronouns, particles, the connective tissue of any sentence
  'של','את','עם','על','אל','לא','כן','זה','זו','זאת','אלה','הוא','היא','הם','הן',
  'אני','אתה','את','אנחנו','אתם','אתן','שלי','שלך','שלו','שלה','שלנו','שלכם',
  'יש','אין','כל','גם','אבל','או','כי','אם','אז','רק','עוד','כבר','לא','אף',
  'מה','מי','איך','למה','איפה','מתי','כמה','איזה','כמו','ככה','לכן','אולי',
  'בין','לפני','אחרי','מתחת','מעל','ליד','בתוך','מחוץ','אצל','בלי','ללא','לפי',
  'כאן','שם','פה','הכל','כלום','משהו','מישהו','שום','דבר','עצמו',
  // very common verbs
  'יש','היה','הייתה','יהיה','להיות','צריך','צריכה','יכול','יכולה','רוצה','אפשר',
  'אשמח','מקווה','חושב','חושבת','יודע','יודעת','מבין','מבינה','עושה','הולך',
  'בא','בואי','בוא','נותן','לוקח','אומר','שואל','עונה','כותב','קורא','שומע',
  'רואה','אוהב','מצרף','מצורף','שולח','מקבל','נראה','נשמע','סוגר','סגרה','פותח',
  'להגיד','לעשות','לקבל','לשלוח','לבדוק','להוסיף','לצאת','להיכנס','לדבר',
  // time
  'שנה','יום','יומיים','שבוע','חודש','שעה','דקה','זמן','פעם','פעמיים','עכשיו',
  'היום','מחר','אתמול','תמיד','לעולם','בבוקר','בערב','בלילה','אחר','הצהריים',
  // frequent adjectives and quantifiers
  'טוב','טובה','רע','גדול','גדולה','קטן','קטנה','חדש','חדשה','ישן','מלא','ריק',
  'יותר','פחות','מאוד','קצת','הרבה','מעט','כמעט','בערך','בדיוק','ממש','לגמרי',
  'נמוך','נמוכה','גבוה','גבוהה','זול','יקר','מהיר','איטי','קל','קשה','פשוט',
  // courtesy and correspondence
  'תודה','בבקשה','שלום','היי','אהלן','סליחה','בסדר','בטח','נכון','יופי','מצוין',
  'ברכות','בהצלחה','נשמח','להתראות','ביי','מזל','טוב',
  // words that turn up constantly in work email
  'חברה','עבודה','לקוח','לקוחות','אנשים','איש','אישה','ילד','בית','משרד','צוות',
  'כסף','מחיר','מחירים','עלות','תקציב','הצעה','הצעת','שאלה','תשובה','בעיה',
  'פתרון','דוגמא','דוגמה','פרטים','מידע','קובץ','מסמך','פגישה','שיחה','מייל',
  'כמובן','בהתאם','כמות','אפשרות','אפשרויות','משתנה','משתתפים','תלוי','כולל',
  'לינה','נופש','אזור','פלוס','ברמת','רמה','סוג','חלק','שלב','תהליך','מערכת',
]);

// Hebrew glues its prepositions and articles onto the front of a word, so a
// list of bare stems misses most real usage. Two letters covers the ordinary
// combinations (וב, כש, מה…); beyond that the risk of a false stem grows.
const HE_PREFIXES = ['ש','ה','ו','ב','כ','ל','מ','שה','שב','של','שכ','שא','וה','וב','ול','ומ','כש','לכ','מה','מב'];

function isCommonHebrewWord(word) {
  const w = word.replace(/[^\u0590-\u05FF]/g, '');
  if (!w) return false;
  if (COMMON_HE_WORDS.has(w)) return true;
  for (const p of HE_PREFIXES) {
    if (w.length > p.length + 1 && w.startsWith(p) && COMMON_HE_WORDS.has(w.slice(p.length))) return true;
  }
  return false;
}

// Is this run already good Hebrew? Two recognised words, or a third of them,
// is enough — real wrong-layout text is the output of an English sentence
// mapped through a Hebrew keyboard, and virtually never lands on several
// genuine Hebrew words at once.
//
// That last claim holds for long words and fails badly for short ones. Common
// two-letter English words map onto common two-letter Hebrew words all the
// time: עם is the keys for "go", אם the keys for "to", גם for "do". Two of
// those in a sentence was enough to veto it, and both of the misses reported
// from the wild turned out to be the same word — "מם' עם אם איק מקסא כןסקד",
// which is "now go to the next fixes", vetoed by עם and אם while the other
// four words converted to ordinary English.
//
// So only words of three Hebrew letters or more count as evidence. Measured
// over the corpus, that never wrongly blocks a mistyped English sentence,
// where the old rule blocked one; what protection it gives up is picked up by
// the English-likeness scoring further down, which is why the false-positive
// count does not move.
const HE_EVIDENCE_MIN = 3;
function looksLikeRealHebrew(words) {
  const he = words.filter(w => HEBREW_RE.test(w));
  if (he.length < 2) return false;
  const hits = he.filter(w =>
    isCommonHebrewWord(w) &&
    w.replace(/[^\u0590-\u05FF]/g, '').length >= HE_EVIDENCE_MIN
  ).length;
  return hits >= 2 || hits / he.length >= 0.34;
}

function convertToHebrew(t) {
  // Token by token, because a trailing comma is ambiguous and the reading that
  // matched has to be the reading that converts. wordCouldBeHebrew accepts
  // "akuo," by trying it again as "akuo" plus punctuation; if the conversion
  // did not agree it would offer שלוםת where the user wrote שלום, — a visibly
  // wrong suggestion, which is worse than staying quiet.
  //
  // Only tokens that fail as-is and succeed stripped are treated this way, so
  // "t," still converts to את and nothing that already worked changes.
  return t.split(/(\s+)/).map(tok => {
    if (!/\S/.test(tok)) return tok;
    const bare = tok.replace(/[,.;]$/, '');
    if (bare !== tok && bare.length >= 2 &&
        !couldBeHebrewExactly(tok) && couldBeHebrewExactly(bare)) {
      return mapToHebrew(bare) + tok.slice(bare.length);
    }
    return mapToHebrew(tok);
  }).join('');
}

function mapToHebrew(t) { return [...t].map(c => EN_TO_HE[c] || c).join(''); }
function convertToEnglish(t)   { return [...t].map(c => HE_TO_EN[c] || c).join(''); }
function convertToRussian(t)   { return [...t].map(c => EN_TO_RU[c]  || c).join(''); }
function convertFromRussian(t) { return [...t].map(c => RU_TO_EN[c] || c).join(''); }
function convertToGreek(t)     { return foldGreekTonos([...t].map(c => EN_TO_EL[c] ?? c).join('')); }
function convertFromGreek(t)   { return [...expandGreekTonos(t)].map(c => EL_TO_EN[c] ?? c).join(''); }
function convertToKorean(t)    { return composeHangul([...t].map(c => EN_TO_KO[c] ?? c).join('')); }
function convertFromKorean(t)  { return [...decomposeHangul(t)].map(c => KO_TO_EN[c] ?? c).join(''); }
function convertToUkrainian(t)   { return [...t].map(c => EN_TO_UK[c] || c).join(''); }
function convertFromUkrainian(t) { return [...t].map(c => UK_TO_EN[c] || c).join(''); }
function convertToArabic(t)    { return [...t].map(c => EN_TO_AR[c]  || c).join(''); }
function convertFromArabic(t)  { return [...t].map(c => AR_TO_EN[c] || c).join(''); }
// The preview is the only thing a person has to go on before they press Fix.
// Nine words used to be the cap, which cut an ordinary sentence in half and
// asked them to approve the part they could not see. The toast wraps, so a
// longer preview costs height, not legibility. The cap stays only to stop a
// pasted paragraph from filling the screen.
function truncatePreview(text, maxWords = 30) {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + ' …';
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// On the Hebrew layout the comma key is ת, the full stop is ש and the
// semicolon is ף, so those characters are kept inside words — "את" is typed
// `t,` and stripping the comma would destroy one of the commonest words in the
// language. But an ordinary sentence has commas in it too, and "akuo," reads as
// שלוםת, which the final-form rule rejects as impossible. So the word came out
// as unrecognisable and the whole run died with it.
//
// Try the raw reading first, and only if that fails, try it again without a
// single trailing punctuation mark. `t,` still passes as את on the first
// attempt; `akuo,` fails, then passes as שלום. Nothing is accepted that a bare
// word would not have been — the second attempt runs the same gauntlet — so
// this cannot admit a class of text the rules already reject.
// PDF, CSV, HR, CI, CD. Short, vowel-free, in no dictionary, and they map onto
// Hebrew keys as cleanly as any mistyped word does — "csv to hr" was being
// offered as בדה אם יר. Capitalisation is the signal that separates them:
// somebody typing Hebrew with the wrong layout produces lowercase, because
// they are not holding shift for every letter.
//
// Deliberately one-sided. A burst typed with caps lock on will now be missed,
// which costs a shrug; offering to convert someone's acronyms costs them their
// text. Only applied to short all-caps tokens — a genuinely shouted sentence
// is several long words and does not match.
function looksLikeAcronym(word) {
  return word.length <= 5 && word === word.toUpperCase() && /[A-Z]/.test(word);
}

function wordCouldBeHebrew(word) {
  if (looksLikeAcronym(word)) return false;
  if (couldBeHebrewExactly(word)) return true;
  const trimmed = word.replace(/[,.;]$/, '');
  return trimmed.length >= 2 && trimmed !== word && couldBeHebrewExactly(trimmed);
}

function couldBeHebrewExactly(word) {
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;
  if (learnedEnglish.has(lower)) return false;
  if (learnedHebrew.has(lower))  return true;
  if (EN_WORDS.has(lower))       return false;
  // englishScore divides by length - 1, so a five-letter word scores 0.25 on a
  // single common bigram and a four-letter word 0.33. At 0.20 that rejected
  // eighteen of twenty ordinary Hebrew words — אפשר, לקבוע, פגישה, החשבון,
  // אשמח, לשמוע — and cost Hebrew nine points of recall, the worst of the six
  // languages by some way.
  //
  // Measured across the threshold: 0.30 takes Hebrew from 87.5% to 96.9% with
  // the false-positive count still at zero. 0.35 reaches 100% but costs two,
  // which is not a trade this product makes — precision is weighted about
  // eleven times recall, and converting text somebody wrote on purpose is the
  // expensive mistake. 0.30 rather than 0.33 for margin: both score the same
  // today, and 0.35 is where the first false positive appears.
  //
  // A length floor was tried too, as in unmistakablyEnglish, and made it worse
  // here — on this gate the low threshold is doing useful work on short words.
  if (englishScore(lower) >= 0.30) return false;
  const mapped = [...lower].map(c => EN_TO_HE[c]);
  if (!mapped.every(c => c !== undefined && HEBREW_RE.test(c))) return false;
  // Final-form letters (ך ם ן ף ץ) only appear at word-end in valid Hebrew.
  // Finding one in a non-final position is an unambiguous wrong-keyboard signal.
  for (let i = 0; i < mapped.length - 1; i++) {
    if (FINAL_FORMS.has(mapped[i])) return false;
  }
  return true;
}

// A word that is unmistakably English is never part of a wrong-layout burst,
// however cleanly its letters happen to map onto Hebrew keys.
//
// This is the guard the context extension was missing. Detection was right —
// "I spoke with akuo nv akunl yesterday" really does contain three mistyped
// Hebrew words — but the extension pass then absorbed "yesterday", and
// accepting the fix would have replaced a word the user typed on purpose with
// טקדאקרגשט. "the", "and" and "then" went the same way. wordCouldBeHebrew
// rejects all four correctly; the extension pass simply never asked it.
//
// The threshold is looser than wordCouldBeHebrew's 0.20 on purpose. Extension
// exists to pick up the ragged edges of a burst — short words, words with no
// vowels — and tightening it all the way would make the pass pointless. What
// it must never do is swallow a word from the common English list.
function unmistakablyEnglish(lower) {
  if (EN_WORDS.has(lower)) return true;
  // englishScore divides by length - 1, so a short token has almost no
  // denominator: two letters with one common bigram score a flat 1.00, three
  // letters score 0.50. That is how "jcr" — חבר — came to be treated as
  // unmistakably English and thrown out of its own run, leaving the toast
  // offering "היי מה" and abandoning "שלומך חבר?" as Latin. The same arithmetic
  // reads כן, יש, אין, רק and בוא as English too, which are about as common as
  // Hebrew words get. Below four letters the score means nothing and the word
  // list above is the only evidence worth having.
  //
  // A vowel test was here as well and was removed: across every word of every
  // Hebrew sentence in the corpus, 147 of them, not one was four letters or
  // more, vowel-less, and scoring as English. It guarded nothing.
  if (lower.length < 4) return false;
  if (EN_LEXICON.has(lower)) return true;
  // Plurals and third-person forms are not in the list; the stem is.
  if (lower.endsWith('s') && lower.length >= 5 && EN_LEXICON.has(lower.slice(0, -1))) return true;
  // The score stays as a backstop for what a ten-thousand-word list misses —
  // jargon, brand names, inflections — but the threshold is set where the
  // dictionary has taken over the work. See EN_THRESHOLD.
  return englishScore(lower) >= EN_THRESHOLD;
}

function mapsToHebrew(word) {
  if (looksLikeAcronym(word)) return false;
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;
  if (learnedEnglish.has(lower)) return false;
  if (learnedHebrew.has(lower)) return true;
  if (unmistakablyEnglish(lower)) return false;
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
// The looser check, used when the text already contains real Hebrew. In that
// company a word like "vc" probably is a mistyped Hebrew word rather than an
// abbreviation, so the final-form rule is dropped. The English guard is not:
// "Slack" and "deck" in a Hebrew sentence are the brand and the noun, and
// eating them is the same destructive mistake in a different context.
// Pure key-mapping, no judgement about the word itself. Only ever used to
// decide whether a word can sit *inside* a run, never whether a run may grow
// outward to reach it — see the bridge condition in the run assembly.
// Length is what separates the two cases, and neither the dictionary nor the
// English score can do it: "cut" and "meeting" are both absent from the common
// word list and both score high, yet "cut" belongs inside
// "tueh cut brtv nv eurv gfahu" and "meeting" must break
// "brtv nv meeting eurv gfahu" in half.
//
// Three or four letters enclosed by wrong-layout text is plausibly part of the
// burst. Seven letters is a word somebody meant to type.
const MAX_BRIDGE_LEN = 4;

function keysMapToHebrew(word) {
  const lower = word.toLowerCase();
  if (lower.length < 2 || lower.length > MAX_BRIDGE_LEN) return false;
  if (learnedEnglish.has(lower)) return false;
  return [...lower].every(c => EN_TO_HE[c] !== undefined && HEBREW_RE.test(EN_TO_HE[c]));
}

function physicallyMapsToHebrew(word) {
  if (looksLikeAcronym(word)) return false;
  const lower = word.toLowerCase();
  if (lower.length < 2) return false;
  if (learnedEnglish.has(lower)) return false;
  if (unmistakablyEnglish(lower)) return false;
  const mapped = [...lower].map(c => EN_TO_HE[c]);
  return mapped.every(c => c !== undefined && HEBREW_RE.test(c));
}

// The run assembly Hebrew has had all along, made available to the other five.
//
// Hebrew converts 31 of 31 corpus sentences whole. Russian converts 6 of 25,
// Arabic 3 of 20, Greek 0 of 11. That difference is not the language and not
// the keyboard table. It is that Case 2 for Hebrew can bridge one word it does
// not recognise and then extend outward from the run it confirmed, while Cases
// R2, U2, A2, E2 and K2 stop dead at the first word that fails the test.
//
// One comma does it. "Γεια σου, τι κάνεις σήμερα" typed on a QWERTY keyboard is
// "Geia soy, ti k;aneiw s;hmera", and σου, ends in a comma the Greek layout does
// not have — so the run broke there, every time, in every Greek sentence.
//
//   accepts   the language's own wordCouldBeX
//   bridges   may sit *inside* a run, never extend one outward
//   grows     may extend a confirmed run at either end
function collectRuns(words, accepts, bridges) {
  const runs = [];
  let cur = [], gap = [], startIdx = -1;
  for (let wi = 0; wi < words.length; wi++) {
    const w = words[wi];
    if (accepts(w)) {
      if (gap.length > 0) cur.push(...gap);
      gap = [];
      if (cur.length === 0) startIdx = wi;
      cur.push(w);
    } else if (cur.length > 0 && gap.length < 2 && bridges(w)) {
      // Enclosure is what makes a bridge safe: the gap is only kept when
      // another accepted word follows it, so a trailing English word is
      // dropped rather than swallowed.
      gap.push(w);
    } else {
      if (cur.length > 0) runs.push({ words: [...cur], startIdx });
      cur = []; gap = []; startIdx = -1;
    }
  }
  if (cur.length > 0) runs.push({ words: cur, startIdx });
  return runs;
}

function growRun(words, entry, grows) {
  let run = [...entry.words];
  for (let i = entry.startIdx - 1; i >= 0; i--) {
    if (!grows(words[i])) break;
    run.unshift(words[i]);
  }
  const lastIdx = entry.startIdx + entry.words.length - 1;
  for (let i = lastIdx + 1; i < words.length; i++) {
    if (!grows(words[i])) break;
    run.push(words[i]);
  }
  return run;
}

// Can these keystrokes be this script at all? Used for bridging and for growing
// a run, never for starting one — the run has already been earned by words that
// passed the language's own test.
function keysMapToScript(map, word, maxLen) {
  const lower = word.toLowerCase();
  if (lower.length < 2 || (maxLen && lower.length > maxLen)) return false;
  if (learnedEnglish.has(lower)) return false;
  return [...lower].every(c => map[c] !== undefined);
}

function scriptBridge(map) {
  return word => !looksLikeAcronym(word) && orWithoutTrailingPunctuation(
    word, w => keysMapToScript(map, w, MAX_BRIDGE_LEN));
}

// Growing is the same test without the length cap, plus the English guard —
// "Slack" and "meeting" at the end of a Russian sentence are the brand and the
// noun, and eating them is the destructive mistake this product must not make.
// EN_LEXICON is what makes this safe enough to switch on.
function scriptGrower(map) {
  return word => {
    // "FYI the RFP is due EOD" grew into a Russian sentence without this: every
    // one of those letters is on the Cyrillic layout. Shouting is not a burst.
    if (looksLikeAcronym(word)) return false;
    const lower = word.toLowerCase();
    if (unmistakablyEnglish(lower.replace(/[^a-z]/g, ''))) return false;
    return orWithoutTrailingPunctuation(word, w => keysMapToScript(map, w, 0));
  };
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

// Does this map cleanly onto Hebrew letters, ignoring every learned
// preference? wordCouldBeHebrew and mapsToHebrew both refuse a rejected word
// outright, which is right when deciding whether to flag it — and wrong when
// the only question is whether it plausibly belongs to a Hebrew run that
// already exists around it.
function couldTypeAsHebrew(word) {
  const lower = word.toLowerCase();
  if (!lower) return false;
  const mapped = [...lower].map(c => EN_TO_HE[c]);
  return mapped.every(c => c !== undefined && HEBREW_RE.test(c));
}

// One "Not right" on a short word used to split every later sentence
// containing it. Typing a six-word Hebrew phrase with a rejected word in the
// middle produced a fix for the longer half and left the rest as gibberish
// beside it — worse than not firing at all, because the result is a sentence
// half in each script.
//
// So a rejected word may bridge two parts of a run: the words either side are
// strong evidence the user is typing Hebrew, and outweigh a rejection made in
// some other sentence. It can only ever bridge — the gap is discarded unless
// more Hebrew follows it, so a rejected word cannot start a run, cannot end
// one, and cannot appear alone. Those are the cases the rejection was for,
// and they still hold.
function bridgesRejectedWord(word) {
  return learnedEnglish.has(word.toLowerCase()) && couldTypeAsHebrew(word);
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
  if (!entitled) return null;
  if (!rawText || rawText.trim().length < 3) return null;

  const text = scanAll ? rawText : rawText.slice(-2000);
  const textHasHebrew  = hasHebrew(text);
  const textHasRussian = RUSSIAN_RE.test(text);
  const textHasArabic  = hasArabic(text);
  const textHasUkOnly  = UK_ONLY_RE.test(text);
  const textHasHangul  = HANGUL_ANY_RE.test(text);
  const textHasGreek   = GREEK_RE.test(text);

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

        // The sentence is already Hebrew. Reported from the wild: a real email
        // reading "כמובן שאפשר גם יותר נמוך ללא לינה - תלוי מה התקציב" was
        // offered for conversion into "fnuci atpar do hu,r bnul kkt khbv",
        // because the scoring below asks whether the output looks English and
        // six of those words cleared it on vowel ratio alone. The one real
        // English word it required was "do" — which is what גם converts to, so
        // any Hebrew sentence containing גם was a candidate.
        //
        // Asking the opposite question is far more reliable, and it has to come
        // first: offering to destroy someone's writing is the worst thing this
        // extension can do.
        if (looksLikeRealHebrew(run1)) return null;

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

        // Strict mode, for a few seconds after a fix. It exists because short
        // real Hebrew words decode to real English ones — בוא→cut, אם→to — so
        // a single word is genuinely ambiguous right after a conversion.
        //
        // It used to switch off the multi-word scoring as well, and that was
        // the wrong trade. Measured: with the window open the corpus still
        // fires zero false positives on 300 correct sentences, and across 80
        // accept-then-reanalyse cycles nothing re-fired on its own fix either
        // way — lastCase2Original and fixCooldownUntil already cover the undo
        // it was guarding. What it did cost was recall on exactly the text
        // people type into a chat box: about half of short phrases went silent
        // for fifteen seconds after every fix. For someone typing fast in two
        // languages, that is most of their session.
        //
        // So it now guards the single-word trigger only, where בוא→cut really
        // can bite, and nothing else.
        const inStrictMode = Date.now() < strictModeUntil;

        // Fast single-word trigger: only outside strict mode (avoid "בוא"→"cut" false-pos)
        if (run1.length === 1) {
          const w = converted.trim().replace(/[^a-z]/gi, '').toLowerCase();
          if (w.length >= 3 && !inStrictMode && englishEnough(w)) {
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
          let engScore = 0;
          let hasCommonWord = false;
          if (!strongSignal) {
            const convWords = converted.split(/\s+/)
              .map(w => w.replace(/[^a-z]/gi, '').toLowerCase())
              .filter(w => w.length >= 2);
            engScore = convWords.reduce((acc, w) => {
              if (englishEnough(w)) { hasCommonWord = true; return acc + 2; }
              if (w.length < 3 || !/[aeiou]/.test(w)) return acc;
              if (/[^aeiou]{4,}/.test(w)) return acc;
              const r = (w.match(/[aeiou]/g) || []).length / w.length;
              return (r >= 0.20 && r <= 0.70) ? acc + 1 : acc;
            }, 0);
          }

          if (strongSignal || (engScore >= 3 && hasCommonWord)) {
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

  // ── Case G1: Greek typed while English keyboard was expected
  // Greek shares no code points with the other scripts, so like Hangul this can
  // run early without contending with them.
  if (textHasGreek && enabledLangs.el) {
    let allElTokens;
    try {
      allElTokens = text.trim().split(/\s+/).flatMap(w =>
        w.split(/(?<=[a-zA-Z])(?=[Ά-ώ])|(?<=[Ά-ώ])(?=[a-zA-Z])/).filter(Boolean)
      );
    } catch {
      allElTokens = text.trim().split(/\s+/);
    }
    const runG1 = [];
    for (let i = allElTokens.length - 1; i >= 0; i--) {
      const w = allElTokens[i];
      if (GREEK_RE.test(w)) {
        runG1.unshift(w);
      } else if (runG1.length > 0 && w.length <= 2) {
        runG1.unshift(w);
      } else if (runG1.length === 0) {
        continue;
      } else {
        break;
      }
    }
    if (runG1.length >= 1) {
      const elInRun = runG1.filter(w => GREEK_RE.test(w));
      if (!elInRun.some(w => learnedEnglish.has(w.toLowerCase()))) {
        // Real Greek is not for converting. Until the keyboard tables were
        // completed this pass was protected by accident: uppercase Greek had
        // no entry, so it survived conversion and tripped the "no Greek left"
        // check below. With the tables correct that protection vanished, and
        // six ordinary Greek sentences — every one of them opening on a
        // capital — were offered up as English.
        //
        // The real test was never conversion completeness but whether the
        // words are Greek words. Measured over the corpus: real Greek carries
        // a median of three common words per sentence, English typed on a
        // Greek keyboard a median of none. Two is the line — it silences 21 of
        // 22 real Greek sentences and costs 3 detections out of 55, which is
        // the trade this product is tuned for.
        const greekWordsInRun = elInRun.filter(
          w => COMMON_EL_WORDS_PLAIN.has(stripTonos(w.toLowerCase().replace(/[^Ά-ώ]/g, '')))
        ).length;
        const allMapG = elInRun.every(w => [...expandGreekTonos(w)].every(c => EL_TO_EN[c] !== undefined));
        if (allMapG && greekWordsInRun < 2) {
          const originalG1  = elInRun.join(' ');
          const convertedG1 = convertFromGreek(originalG1);
          if (convertedG1.trim().length >= 2 && !GREEK_RE.test(convertedG1)) {
            const convWordsG1 = convertedG1.split(/\s+/)
              .map(w => w.replace(/[^a-z]/gi, '').toLowerCase())
              .filter(w => w.length >= 2);
            const hasCommonG1 = convWordsG1.some(w => englishEnough(w));
            const avgScoreG1 = convWordsG1.length
              ? convWordsG1.reduce((a, w) => a + englishScore(w), 0) / convWordsG1.length
              : 0;
            const fireG1 = runG1.length === 1
              ? (convWordsG1.length >= 1 && convWordsG1[0].length >= 3 && englishEnough(convWordsG1[0]))
              : (hasCommonG1 && avgScoreG1 >= 0.15);
            if (fireG1) {
              return {
                type: 'greek_as_english', lang: 'el',
                message: 'Wrong layout? Looks like English:',
                original: originalG1, converted: convertedG1,
                btnLabel: 'Fix → English', rejectLabel: 'Not English',
                words: elInRun
              };
            }
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
          const hasCommonK1 = convWordsK1.some(w => englishEnough(w));
          const avgScoreK1 = convWordsK1.length
            ? convWordsK1.reduce((a, w) => a + englishScore(w), 0) / convWordsK1.length
            : 0;
          const fireK1 = runK1.length === 1
            ? (convWordsK1.length >= 1 && convWordsK1[0].length >= 3 && englishEnough(convWordsK1[0]))
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
            const hasCommonU1 = convWordsU1.some(w => englishEnough(w));
            const avgScoreU1 = convWordsU1.length
              ? convWordsU1.reduce((a, w) => a + englishScore(w), 0) / convWordsU1.length
              : 0;
            const fireU1 = runU1.length === 1
              ? (convWordsU1.length >= 1 && convWordsU1[0].length >= 3 && englishEnough(convWordsU1[0]))
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
            const hasCommonR1 = convWordsR1.some(w => englishEnough(w));
            const avgScoreR1 = convWordsR1.length
              ? convWordsR1.reduce((a, w) => a + englishScore(w), 0) / convWordsR1.length
              : 0;
            const fire = runR1.length === 1
              ? (convWordsR1.length >= 1 && convWordsR1[0].length >= 3 && englishEnough(convWordsR1[0]))
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
            const hasCommonA1 = convWordsA1.some(w => englishEnough(w));
            const avgScoreA1 = convWordsA1.length
              ? convWordsA1.reduce((a, w) => a + englishScore(w), 0) / convWordsA1.length
              : 0;
            const fire = runA1.length === 1
              ? (convWordsA1.length >= 1 && convWordsA1[0].length >= 3 && englishEnough(convWordsA1[0]))
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
    } else if (curRun.length > 0 && curGap.length < 2 &&
               // A common English word may be *enclosed* by wrong-layout text —
               // "tueh cut brtv nv eurv gfahu" is a whole Hebrew sentence in
               // which "cut" happens to spell an English word, and splitting
               // there leaves half the sentence as gibberish. It may never
               // *extend* a run outward, which is what was destroying the
               // "yesterday" in "I spoke with akuo nv akunl yesterday".
               //
               // Enclosure is what makes it safe: a gap is only merged when
               // another plausible word follows it, so a trailing English word
               // is dropped rather than absorbed.
               (PASSTHROUGH.has(w.toLowerCase()) || bridgesRejectedWord(w) ||
                keysMapToHebrew(w))) {
      curGap.push(w);
    } else {
      if (curRun.length > 0) allRuns.push({ words: [...curRun], startIdx: curStartIdx });
      curRun = []; curGap = []; curStartIdx = -1;
    }
  }
  if (curRun.length > 0) allRuns.push({ words: curRun, startIdx: curStartIdx });

  // Use the last (most recent) run that meets the minimum threshold
  const runEntry = [...allRuns].reverse().find(r =>
    isRealRun(r) && r.words.filter(w => wordCouldBeHebrew(w)).length >= minRun);
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

  // Korean runs first of the English→X passes, and that ordering is the whole
  // point rather than an accident of when each language was added. Korean is
  // the only one whose test is structural: every keystroke must land inside a
  // complete Hangul syllable, and a run of letters that does that is Korean or
  // it is nothing. Arabic and Greek are the loosest — very nearly every QWERTY
  // key maps to some letter — so they must be asked last, and Russian sits in
  // between.
  //
  // Asked last, as it used to be, Korean lost ten of thirty-four corpus
  // sentences to Arabic and Russian, and losing them meant a Korean speaker
  // being offered their own greeting rewritten in Arabic. Not a miss — a
  // confident wrong answer that destroys the sentence if accepted.
  // ── Case K2: English characters typed while Korean keyboard was expected
  // Runs last of all the English→X passes. wordCouldBeKorean already demands a
  // clean syllable decomposition, but English maps onto plausible Hangul easily,
  // so the established languages keep first claim on any ambiguous run.
  if (!textHasHebrew && enabledLangs.ko) {
    const koCandWords = extractWords(text);
    const koMinRun = textHasHangul ? 1 : 2;
    // Korean writes whole phrases as one token — 안녕하세요, 감사합니다 and
    // 알겠습니다 are each a single word — so the two-word rule that keeps the
    // Latin languages honest silences the four most common things a Korean
    // types. A romanised Korean phrase is long and decomposes into many clean
    // syllables, and that is the evidence the second word was standing in for.
    // Four syllables is the line: 안녕 (2) still needs a neighbour, 안녕하세요
    // (5) speaks for itself. wordCouldBeKorean has already required a complete
    // syllable decomposition and rejected anything English-looking, so what
    // reaches here is a long token that is Korean or nothing.
    const koSoloRun = w => convertToKorean(w).length >= 4;
    const allKoRuns = collectRuns(koCandWords, wordCouldBeKorean, scriptBridge(EN_TO_KO));

    const koRunEntry = [...allKoRuns].reverse().find(r => isRealRun(r) &&
      (r.words.length >= koMinRun ||
       (r.words.length === 1 && koSoloRun(r.words[0]))));
    if (koRunEntry) {
      const runKo2 = growRun(koCandWords, koRunEntry, scriptGrower(EN_TO_KO));
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

  // ── Case R2: English characters typed while Russian keyboard was expected
  if (!textHasHebrew && enabledLangs.ru) {
    const ruCandWords = extractWords(text);
    const ruMinRun = textHasRussian ? 1 : 2;
    const allRuRuns = collectRuns(ruCandWords, wordCouldBeRussian, scriptBridge(EN_TO_RU));

    const ruRunEntry = [...allRuRuns].reverse().find(r => isRealRun(r) && r.words.length >= ruMinRun);
    if (ruRunEntry) {
      const runRu2 = growRun(ruCandWords, ruRunEntry, scriptGrower(EN_TO_RU));
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
    const allUkRuns = collectRuns(ukCandWords, wordCouldBeUkrainian, scriptBridge(EN_TO_UK));

    const ukRunEntry = [...allUkRuns].reverse().find(r => isRealRun(r) && r.words.length >= ukMinRun);
    if (ukRunEntry) {
      const runUk2 = growRun(ukCandWords, ukRunEntry, scriptGrower(EN_TO_UK));
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
    const allArRuns2 = collectRuns(arCandWords, wordCouldBeArabic, scriptBridge(EN_TO_AR));

    const arRunEntry2 = [...allArRuns2].reverse().find(r => isRealRun(r) && r.words.length >= arMinRun);
    if (arRunEntry2) {
      const runAr2 = growRun(arCandWords, arRunEntry2, scriptGrower(EN_TO_AR));
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

  // ── Case G2: English characters typed while Greek keyboard was expected
  // Runs after Korean, last of all: nearly every QWERTY key maps to a Greek
  // letter, so this is the loosest pass and must not pre-empt the others.
  if (!textHasHebrew && enabledLangs.el) {
    const elCandWords = extractWords(text);
    const elMinRun = textHasGreek ? 1 : 2;
    const allElRuns = collectRuns(elCandWords, wordCouldBeGreek, scriptBridge(EN_TO_EL));

    const elRunEntry = [...allElRuns].reverse().find(r => isRealRun(r) && r.words.length >= elMinRun);
    if (elRunEntry) {
      const runEl2 = growRun(elCandWords, elRunEntry, scriptGrower(EN_TO_EL));
      const spanEl2 = findRunSpan(text, runEl2[0], runEl2[runEl2.length - 1]) || runEl2.join(' ');
      const convertedEl2 = convertToGreek(spanEl2.toLowerCase());
      if (GREEK_RE.test(convertedEl2)) {
        return {
          type: 'english_as_greek', lang: 'el',
          message: 'Wrong layout? Looks like Greek:',
          original: spanEl2, converted: convertedEl2,
          btnLabel: 'Fix → Greek', rejectLabel: 'Not Greek',
          words: runEl2
        };
      }
    }
  }

  return null;
}

// analyzeText answers with the first pass that matches, and the passes run in
// a fixed order, so a language that explains three words of a sentence beats
// one that explains all of it purely by being asked earlier. Measured over the
// corpus, 47 of 159 sentences were converted into a script the writer was not
// using — and the worst of them are not close calls:
//
//   typed     Vj;tv kb vs yfpyfxbnm dcnhtxe yf cktle.otq ytltkt
//   offered   לנ הד טכ                                  (Hebrew, three words)
//   Russian   назначить встречу на следующей неделе      (the whole line)
//
// Hebrew won that by going first. Reordering the passes only moves the problem
// to whoever is asked last, so the order stops deciding: every enabled
// language is asked, and the answer that accounts for the most of what the
// person typed is the one shown. Ties keep the existing order, so nothing
// changes where the passes already agreed.
//
// The cost lands where it is cheap. Almost every call finds nothing at all —
// somebody typing ordinary English — and those still run exactly one pass and
// stop. Only a call that already has a candidate pays for the comparison.
const NO_LANGS = { he: false, ru: false, uk: false, ko: false, el: false, ar: false };

// How much of what the person typed a candidate accounts for. Coverage alone
// was the first attempt and it is not enough: on two Korean sentences both
// Russian and Arabic covered more characters while producing pure noise —
// "цла йлувлееьйыдул" is not Russian, "قاخسؤنسلينيغ" is not Arabic — where
// Korean produced 받았습니다 and 괜찮아요. So the first question is whether the
// output is made of real words in the language being claimed, and coverage
// only settles ties. Every language already carries the list needed to ask.
const REAL_WORDS = {
  ru: w => COMMON_RU_WORDS.has(w),
  uk: w => COMMON_UK_WORDS.has(w),
  ar: w => COMMON_AR_WORDS.has(w),
  ko: w => COMMON_KO_WORDS.has(w),
  el: w => COMMON_EL_WORDS_PLAIN.has(stripTonos(w)),
  he: w => isCommonHebrewWord(w),
  en: w => COMMON_EN_WORDS.has(w),
};

function outputLanguage(detection) {
  // english_as_he produces Hebrew; he_as_english produces English.
  const m = /^english_as_(\w+)$/.exec(detection.type);
  if (m) return detection.lang || 'he';
  return 'en';
}

function realWordsProduced(detection) {
  if (!detection) return 0;
  const isReal = REAL_WORDS[outputLanguage(detection)];
  if (!isReal) return 0;
  return detection.converted.split(/\s+/)
    .map(w => w.replace(/[^\p{L}]/gu, '').toLowerCase())
    .filter(w => w.length >= 2 && isReal(w))
    .length;
}

function explains(detection) {
  return detection ? detection.original.replace(/\s/g, '').length : 0;
}

// Better means more real words; the same number of real words means whichever
// accounts for more of the line. Equal on both keeps the earlier pass, so the
// existing order still decides where there is nothing to choose between them.
function beats(candidate, best) {
  const cw = realWordsProduced(candidate), bw = realWordsProduced(best);
  if (cw !== bw) return cw > bw;
  return explains(candidate) > explains(best);
}

function bestOfLanguages(text, scanAll) {
  const first = analyzeText(text, scanAll);
  if (!first) return null;
  const enabled = Object.keys(NO_LANGS).filter(l => enabledLangs[l]);
  if (enabled.length < 2) return first;

  const saved = enabledLangs;
  let best = first;
  try {
    for (const lang of enabled) {
      if (lang === (first.lang || 'he')) continue;
      enabledLangs = { ...NO_LANGS, [lang]: true };
      const candidate = analyzeText(text, scanAll);
      if (candidate && beats(candidate, best)) best = candidate;
    }
  } finally {
    enabledLangs = saved;
  }
  return best;
}

// The word the cursor is inside is a prefix, not a word, and judging it is how
// Kiko came to strike through "vps and abo" in the middle of someone writing
// "vps and above". "above" is English and gets thrown out of the run; "abo" is
// three letters nobody has an opinion about, so it stayed in and tipped a
// two-word run over the line. Finishing the word made the toast disappear,
// which is the tell: it was never about the sentence.
//
// So while the keys are still going, the trailing fragment is cut off and the
// rest is judged on its own. Nothing is lost by waiting — the moment typing
// stops, the quiet pass sees the whole line, fragment included. Measured: if
// this cut applied at rest too it would cost 140 catches out of 159 down to
// 122, which is why it is scoped to the burst and not made unconditional.
// A pause is not proof the word is finished either — people stop mid-word to
// think — so a very short fragment is dropped whether or not the keys are still
// going. Three characters is the line because every last word that a detection
// in the corpus actually depends on is four characters or more: all eighteen of
// them. So this costs nothing measurable and still refuses to have an opinion
// about "abo".
function withoutTheWordInProgress(line, midBurst) {
  if (!/[^\s.,;:!?()"'\[\]{}\-–—]$/.test(line)) return line;  // ends on a separator: nothing in progress
  const fragment = (line.match(/\S+$/) || [''])[0];
  if (!midBurst) {
    // At rest the bar is much higher, and it has to be: cutting every trailing
    // word at rest costs 140 catches out of 159 down to 122, and it silences
    // Korean almost entirely, where one word is a whole phrase. So only a short
    // Latin fragment with a real run in front of it — the exact shape of "abo"
    // in "vps and abo" — is refused. Every last word a corpus detection depends
    // on is four characters or more, all eighteen, so this costs nothing.
    const rest = line.slice(0, line.length - fragment.length).trim();
    if (!(fragment.length <= 3 && /^[A-Za-z]+$/.test(fragment) &&
          rest.split(/\s+/).filter(Boolean).length >= 2)) return line;
  }
  return line.replace(/\S+$/, '').trimEnd();
}

// Analyze each line independently (last → first) so a correctly-typed line
// on one row can't bleed into a wrong-layout run on another row.
function analyzeByLines(text, scanAll = false, midBurst = false) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    // Only the last line can hold the cursor, so only it has a word in progress.
    // Two passes, and the split between them is the whole point: the fragment
    // gets no say in *whether* to speak, but once something else has earned the
    // toast, the fragment is part of the sentence and belongs in the fix. Judge
    // without it, replace with it.
    const judged = i === lines.length - 1
      ? withoutTheWordInProgress(line, midBurst)
      : line;
    if (judged.trim().length < 3) continue;
    if (!bestOfLanguages(judged, scanAll)) continue;
    const result = bestOfLanguages(line, scanAll) || bestOfLanguages(judged, scanAll);
    if (result) return result;
  }
  return null;
}

function analyze(el, midBurst = false) {
  return analyzeByLines(getTextBeforeCursor(el), false, midBurst);
}

function analyzeFullField(el, midBurst = false) {
  const fullText = el.isContentEditable
    ? (el.innerText || el.textContent || '')
    : (el.value || '');
  return analyzeByLines(fullText, true, midBurst);
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
  /* The accept shortcut, printed on the button that it presses. Symbols only,
     so it reads the same in all seven locales, and isolated so it does not
     get reordered when the toast is in RTL. */
  .kld-kbd {
    font-size: 10px; font-weight: 600; opacity: 0.7; letter-spacing: 0.3px;
    margin-inline-start: 6px; direction: ltr; unicode-bidi: isolate;
  }
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
let strictModeUntil    = 0; // after a fix, hold the single-word trigger back briefly
// Long enough to cover the keystroke or two right after a fix, short enough
// that it is over before the user has typed their next thought. Fifteen
// seconds silenced half of all short phrases; see the note at inStrictMode.
const STRICT_MS = 4000;
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

// manifest.json sets all_frames, so a page with iframes is running a separate
// copy of this script in each one, and each keeps its own activeToast. Nothing
// coordinates them, so the same correction can appear two or three times over
// — once per frame that happens to see the text.
//
// Rather than build cross-frame messaging, decide locally who is entitled to
// speak. Only the frame the user is actually typing in should, and every path
// that reaches showToast — typing, the recall bubble, Alt+Shift+K, the context
// menu — runs in exactly that frame.
// The whole loop has to be reachable without the mouse. Escape already
// dismisses; this accepts. Enter on its own is not available — in every chat
// app Kiko runs in, Enter sends the message — so accept carries the same
// modifiers as Alt+Shift+K rather than inventing a second convention.
const IS_MAC      = /mac/i.test(navigator.userAgent);
const ACCEPT_KEYS = IS_MAC ? '⌥⇧⏎' : 'Alt+Shift+↵';

function isAcceptShortcut(e) {
  return !!(e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey &&
            (e.code === 'Enter' || e.code === 'NumpadEnter'));
}

// The review nudge and the trial notice reuse the toast markup, and both put a
// .kld-primary button where the fix button goes — one opens the store, the
// other opens checkout. Neither may be pressed by a keystroke the user aimed
// at their text, so only a toast that marked itself as offering a fix answers.
function toastAcceptsKeyboard(toast) {
  return !!(toast && toast.dataset && toast.dataset.kldFix === '1');
}

function ownsTheToast() {
  try {
    // An unfocused window must stay quiet. Two windows on the same site each
    // run this script, and only one of them has the caret.
    if (!document.hasFocus()) return false;
    // hasFocus() is also true for an ancestor of the focused frame, so it
    // cannot tell a parent from its child on its own. When focus is inside a
    // child frame the parent's activeElement is the frame element itself —
    // that is the parent recognising the child should handle this, not it.
    const active = document.activeElement;
    if (active && (active.tagName === 'IFRAME' || active.tagName === 'FRAME')) return false;
    return true;
  } catch {
    return true;   // never let this check be the reason a fix is withheld
  }
}


// While a toast is on screen, a detection with the same words is the same
// request — rebuilding it would flicker and restart its eight-second timer.
//
// It used to compare the signature alone, without asking whether the toast was
// still there. lastDetection is never cleared, so once a toast had been shown
// for a phrase and then closed — by the auto-dismiss, or a fix, or anything
// else — typing that exact phrase again was silently ignored for the rest of
// the page's life. Reported by a user watching someone type, delete, and type
// the same mistake again to no response.
//
// Deliberate suppressions live elsewhere and still work: an explicit ✕ or Esc
// sets dismissedSignature, a fix sets fixCooldownUntil, and rejected words go
// into learnedEnglish. Those are choices the user made. This one was an
// accident of leftover state.
function isDuplicateOfVisibleToast(sig, prev, toastOnScreen) {
  if (!toastOnScreen || !prev) return false;
  return sig === prev.words.join('|');
}

function showToast(element, detection, forceShow = false) {
  if (!detectionEnabled) return;
  if (!ownsTheToast()) return;

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
  if (!forceShow && isDuplicateOfVisibleToast(sig, lastDetection, activeToast)) return;

  // Guard: don't regress to a smaller detection on the same element
  if (activeToast && lastDetection && lastElement === element) {
    if (detection.words.length < lastDetection.words.length) return;
  }

  detection          = localiseDetection(detection);
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
  if (UI_RTL) toast.dir = 'rtl';
  // Only a toast that offers a fix answers to the accept shortcut. The review
  // nudge and the trial notice reuse this markup, and neither should be
  // openable by a keystroke the user aimed at their text.
  toast.dataset.kldFix = '1';
  toast.innerHTML = `
    <div class="kld-header">
      <span>⌨️</span>
      <span style="flex:1">${escapeHtml(detection.message)}</span>
      <button class="kld-btn kld-sound-btn" title="${escapeHtml(t('toastSoundTitle', null, 'Toggle sound'))}">${soundEnabled ? '🔔' : '🔕'}</button>
      <button class="kld-btn kld-dismiss" title="${escapeHtml(t('toastDismiss', null, 'Dismiss (Esc)'))}">✕</button>
    </div>
    <div class="kld-preview">
      <div class="kld-preview-orig">${escapeHtml(truncatePreview(detection.original))}</div>
      <span class="kld-preview-arrow">→</span><span class="kld-preview-new">${escapeHtml(truncatePreview(detection.converted))}</span>
    </div>
    <div class="kld-actions">
      <button class="kld-btn kld-primary">${escapeHtml(detection.btnLabel)}<span class="kld-kbd">${ACCEPT_KEYS}</span></button>
      <button class="kld-btn kld-reject">${escapeHtml(detection.rejectLabel)}</button>
    </div>
    <div class="kld-footer">
      <span>${escapeHtml(t('toastFooter', null, 'Drag · Alt+Shift+K to scan field'))}</span>
      <button class="kld-pause-btn" title="${escapeHtml(t('toastPauseTitle', null, 'Pause auto-detection'))}">⏸ ${escapeHtml(t('toastPause', null, 'Pause Kiko'))}</button>
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
      strictModeUntil = Date.now() + STRICT_MS;
      if (detection.type === 'english_as_hebrew' || detection.type === 'english_as_russian' || detection.type === 'english_as_ukrainian' || detection.type === 'english_as_korean' || detection.type === 'english_as_greek' || detection.type === 'english_as_arabic') {
        lastCase2Original = detection.original.trim().toLowerCase();
      }
    }
    saveFeedback(detection.words, true, detection.lang || 'he');
    removeToast(false);
    if (ok) {
      const kb = IS_MAC ? '⌘+Space' : 'Alt+Shift';
      const undoFn = undoSnapshot ? () => {
        element.value = undoSnapshot.val;
        element.selectionStart = element.selectionEnd = undoSnapshot.sel;
        element.dispatchEvent(new Event('input',  { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } : null;
      showConfirm(`✓ Fixed! Switch keyboard: ${kb}`, undoFn);
      setTimeout(maybeShowReviewToast, REVIEW_DELAY_MS);
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
//
// 160 users, zero reviews, and the reason was here. This asked once, for nine
// seconds, on top of the green "✓ Fixed!" box — same coordinates, three
// seconds in, while the confirm was still on screen — and then wrote a
// thirty-day silence whether or not anyone had looked at it. Timing out is not
// an answer. One unseen appearance bought a month of quiet, and
// chrome.storage.local survives updates, so reinstalling changed nothing.
//
// Now: an answer is honoured for a month, going unseen is honoured for three
// days, and four unseen tries in a row is taken as an answer of its own.
const KIKO_ITEM_ID      = 'alibejcaklfjcbjmncgbhpdichpblnkl';
const REVIEW_SNOOZE_MS  = 30 * 24 * 60 * 60 * 1000;  // "maybe later" — a reply
const REVIEW_QUIET_MS   =  3 * 24 * 60 * 60 * 1000;  // timed out — not a reply
const REVIEW_MAX_MISSES = 4;
// Long enough after the confirm's own five seconds that the two are never on
// screen together, and never in the same place.
const REVIEW_DELAY_MS   = 6000;
const REVIEW_VISIBLE_MS = 15000;

function showReviewToast(nudge) {
  if (activeToast) return;
  injectStyles();
  // See KIKO_ITEM_ID in popup.js: chrome.runtime.id is not the published id
  // for anything but the published build, and the review page has to be the
  // real listing either way.
  const reviewUrl = `https://chromewebstore.google.com/detail/${KIKO_ITEM_ID}/reviews`;
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

  const close = (state, ms) => {
    const misses = state === 'quiet' ? ((nudge && nudge.misses) || 0) + 1 : 0;
    try { chrome.storage.local.set({ reviewNudge: { state, snoozeUntil: Date.now() + ms, misses } }).catch(() => {}); } catch {}
    toast.remove(); if (activeToast === toast) activeToast = null;
  };
  const snooze = () => close('snoozed', REVIEW_SNOOZE_MS);   // they answered
  const unseen = () => close('quiet',   REVIEW_QUIET_MS);    // they never saw it
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
  const t = setTimeout(() => { if (activeToast === toast) unseen(); }, REVIEW_VISIBLE_MS);
  toast.addEventListener('mouseenter', () => clearTimeout(t));
}

// ── Trial notices ─────────────────────────────────────────────
// The trial used to live only in the popup, so the first thing a user learned
// about it was detection going quiet. These are the three moments worth
// interrupting for, and each fires once, ever.
//
// TRIAL_NAG_DAYS is the whole of the "we warned you" behaviour: empty it and
// only the expiry notice remains, which is the one that has to exist — silence
// reads as broken software, and people uninstall broken software.
const TRIAL_NAG_DAYS  = [7, 1];
const KIKO_CHECKOUT   = 'https://getkiko.lemonsqueezy.com/checkout/buy/572c829f-1e66-46bf-86d1-fd4441b5d3dc';

// Smallest milestone reached but not yet used. Someone who closes the laptop on
// day 9 and opens it on day 1 should get "last day", not a stale warning about
// next week — so the urgent one wins and the passed one is spent silently.
function dueTrialMilestone(daysLeft, seen = {}) {
  return TRIAL_NAG_DAYS
    .filter(n => daysLeft <= n && !seen[`d${n}`])
    .sort((a, b) => a - b)[0];
}

// Every milestone at or above the one being shown, so a single absence costs
// one interruption rather than queueing several.
function spendTrialMilestones(due, seen = {}) {
  const next = { ...seen };
  TRIAL_NAG_DAYS.filter(n => n >= due).forEach(n => { next[`d${n}`] = true; });
  return next;
}

function showTrialToast({ title, body, cta, accent, onClose }) {
  if (activeToast) return false;
  injectStyles();
  const toast = document.createElement('div');
  toast.id = 'kld-toast';
  if (UI_RTL) toast.dir = 'rtl';
  toast.style.borderColor = accent;
  toast.innerHTML = `
    <div class="kld-header">
      <span>🦜</span>
      <span style="flex:1;color:${accent};font-weight:700">${escapeHtml(title)}</span>
      <button class="kld-btn kld-dismiss" id="kld-tr-x">✕</button>
    </div>
    <div style="font-size:12px;color:#94a3b8;line-height:1.5">${escapeHtml(body)}</div>
    <div class="kld-actions">
      <button class="kld-btn kld-primary" id="kld-tr-go" style="background:${accent}">${escapeHtml(cta)}</button>
      <button class="kld-btn kld-reject" id="kld-tr-later">${escapeHtml(t('notNow', null, 'Not now'))}</button>
    </div>
  `;
  toast.querySelectorAll('button').forEach(btn => btn.addEventListener('mousedown', e => e.preventDefault()));

  const close = () => {
    toast.remove();
    if (activeToast === toast) activeToast = null;
    if (onClose) onClose();
  };
  toast.querySelector('#kld-tr-go').addEventListener('click', () => {
    close();
    window.open(KIKO_CHECKOUT, '_blank');
  });
  toast.querySelector('#kld-tr-x').addEventListener('click', close);
  toast.querySelector('#kld-tr-later').addEventListener('click', close);

  applyPos(toast);
  makeDraggable(toast);
  (document.body || document.documentElement).appendChild(toast);
  activeToast = toast;
  // Longer than a detection toast. This one is worth reading, and unlike a fix
  // suggestion there is nothing the user is mid-way through typing.
  const t = setTimeout(() => { if (activeToast === toast) close(); }, 14000);
  toast.addEventListener('mouseenter', () => clearTimeout(t));
  return true;
}

async function maybeShowTrialNotice() {
  try {
    const d = await chrome.storage.local.get(['entitlement', 'trialNotices']);
    const ent = d.entitlement;
    if (!ent || ent.state === 'licensed') return;
    const seen = d.trialNotices || {};

    if (ent.state === 'expired') {
      if (seen.expired) return;
      const shown = showTrialToast({
        title:  t('trialEndedTitle', null, 'Your free trial has ended'),
        body:   t('trialEndedBody', null,
                  'Kiko has stopped correcting layout mistakes. Your learned words are '
                  + 'safe — subscribing switches detection straight back on.'),
        cta:    t('trialEndedCta', null, 'Keep Kiko'),
        accent: '#f87171',
      });
      if (shown) {
        await chrome.storage.local.set({ trialNotices: { ...seen, expired: true } });
      }
      return;
    }

    if (ent.state !== 'trial' || typeof ent.daysLeft !== 'number') return;
    const due = dueTrialMilestone(ent.daysLeft, seen);
    if (due === undefined) return;

    const shown = showTrialToast({
      title:  ent.daysLeft === 1
                ? t('trialLastDayTitle', null, 'Last day of your free trial')
                : t('trialLeftTitle', [String(ent.daysLeft)],
                    `${ent.daysLeft} days left of your free trial`),
      body:   t('trialBody', null,
                'After that Kiko stops correcting layout mistakes. $5/month, or $40 '
                + 'for the year. Nothing has been charged so far.'),
      cta:    t('trialCta', null, 'See the plans'),
      accent: '#fbbf24',
    });
    if (shown) {
      await chrome.storage.local.set({ trialNotices: spendTrialMilestones(due, seen) });
    }
  } catch {}
}

async function maybeShowReviewToast() {
  try {
    const d = await chrome.storage.local.get(['stats', 'reviewNudge']);
    const converted = (d.stats || {}).converted || 0;
    const nudge = d.reviewNudge || null;
    // Never ask someone whose trial has run out. Detection has just stopped
    // working for them, and the honest reading of that moment is that they
    // have lost something, not that they owe us a favour. Asking there is how
    // a 5.0 becomes a 3.0 — at a handful of ratings, one angry review halves
    // the score. They can still rate Kiko whenever they choose: the permanent
    // link in the popup stays. This only stops us from raising it.
    if (!entitled) return;
    if (converted < 3) return;
    if (nudge && nudge.state === 'done') return;
    if (nudge && (nudge.misses || 0) >= REVIEW_MAX_MISSES) return;
    // Both 'snoozed' and 'quiet' wait out their own clock; the difference is
    // only how long each one bought.
    if (nudge && nudge.snoozeUntil && Date.now() < nudge.snoozeUntil) return;
    showReviewToast(nudge);
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
                : lastDetection.type === 'greek_as_english' ? '→ EN'
                : lastDetection.type === 'english_as_greek' ? '→ EL'
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
    <span class="kld-hint-text" title="${escapeHtml(t('hintOpen', null, 'Click to open fix'))}">${wcLabel}</span>
    <button class="kld-hint-close" title="${escapeHtml(t('hintDismiss', null, 'Dismiss'))}">✕</button>
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

  // Alt+Shift+Enter — accept the fix. Clicking the button rather than calling
  // the handler keeps one code path for both, and dispatching it inline in the
  // keydown preserves the user activation execCommand('insertText') needs.
  if (isAcceptShortcut(e)) {
    if (!toastAcceptsKeyboard(activeToast)) return;
    e.preventDefault();
    const primary = activeToast.querySelector('.kld-primary');
    if (primary) primary.click();
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
  } else if (GREEK_RE.test(text)) {
    detection = {
      type: 'greek_detected', lang: 'el',
      message: 'Convert selection to English?',
      original: text,
      converted: convertFromGreek(text),
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
  toast.dataset.kldFix = '1';
  toast.innerHTML = `
    <div class="kld-header"><span>⌨️</span><span style="flex:1">${escapeHtml(detection.message)}</span><button class="kld-btn kld-dismiss" title="${escapeHtml(t('hintDismiss', null, 'Dismiss'))}">✕</button></div>
    <div class="kld-preview">${escapeHtml(detection.converted)}</div>
    <div class="kld-actions">
      <button class="kld-btn kld-primary">${escapeHtml(detection.btnLabel)}<span class="kld-kbd">${ACCEPT_KEYS}</span></button>
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

// Calls fn with midBurst = true when maxWait forced the call while the keys
// were still going, false when it fired because typing actually stopped. The
// difference matters: mid-burst, the word under the cursor is half-written.
function debounce(fn, ms, maxWait = 0) {
  let t, lastFired = 0;
  return () => {
    clearTimeout(t);
    const now = Date.now();
    if (maxWait && now - lastFired >= maxWait) {
      lastFired = now;
      fn(true);
    } else {
      t = setTimeout(() => { lastFired = Date.now(); fn(false); }, ms);
    }
  };
}

function fieldLength(el) {
  try {
    const text = el.isContentEditable
      ? (el.innerText || el.textContent || '')
      : (el.value || '');
    return text.length;
  } catch { return 0; }
}

function attachTo(el) {
  if (el._kldVer === KIKO_VERSION) return;
  el._kldVer = KIKO_VERSION;
  const check = debounce((midBurst) => {
    if (!isLive()) return;
    if (!detectionEnabled) return;
    if (Date.now() < fixCooldownUntil) return;
    // Analyze the full field so long sentences aren't split when the debounce
    // fires mid-typing. Fall back to cursor-position analysis if full-field
    // returns nothing (catches the word currently being typed).
    const detection = analyzeFullField(el, midBurst) || analyze(el, midBurst);
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
    // 200ms was not a pause. An average typist leaves 150–250ms between the
    // letters of a single word, so the quiet pass was landing mid-word about as
    // often as the burst pass was — and mid-word is where the false positives
    // live. 350ms is still far below the time it takes to notice a toast, and
    // it is long enough that the word on screen is a word.
  }, 350, 1500);
  el.addEventListener('input',          check);

  // Deleting is how someone takes back a mistake, and retyping it is a fresh
  // one that deserves an answer. The debounced check above can miss that
  // entirely: it only clears a dismissal when it happens to observe a nearly
  // empty field, and someone who deletes and retypes inside the debounce
  // window never presents one. Watching the raw input events cannot miss it.
  el.addEventListener('input', () => {
    if (!dismissedSignature || lastElement !== el) { el._kldLen = fieldLength(el); return; }
    const len  = fieldLength(el);
    const prev = el._kldLen ?? len;
    el._kldLen = len;
    if (len < prev) {
      dismissedSignature = null;
      dismissedWordSet   = new Set();
    }
  });
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
