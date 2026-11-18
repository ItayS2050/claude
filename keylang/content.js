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
      ['learnedHebrew','learnedEnglish','learnedRussian','learnedUkrainian','learnedKorean','learnedGreek','learnedArabic','stats','detectionEnabled','soundEnabled','toastPos','enabledLangs','disabledSites','entitlement','relaunch']
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
    relaunch = d.relaunch || null;
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
    if ('relaunch' in changes) relaunch = changes.relaunch.newValue || null;
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

// ── One-click activation, on our own site only ────────────────
//
// The path a customer had to walk was: pay, wait for the email, find the
// email, copy the key, open Chrome, click the icon, find the box, paste,
// activate. Nine steps with a mail round trip in the middle of a five-dollar
// purchase, and the worst outcome in software sits inside it — somebody who
// pays and never finishes is charged, still broken, and rightly furious.
//
// Lemon Squeezy will put the key straight into the redirect URL, so the page
// they land on after paying already knows it. This reads it there and
// activates. The customer does nothing.
//
// Three limits, and none of them are optional. Only our own hosts, so no other
// page can spend a key's activation slot on someone's browser. Only https, so
// the key is not read off the wire. And the page drops it from the address bar
// the moment it has it, because a licence key in a URL is a licence key in
// browser history — and in anything that reads a URL later.
const ACTIVATION_HOSTS = new Set(['get-kiko.com', 'www.get-kiko.com']);

// Deliberately narrow. Whatever this matches is sent to the licence provider,
// so it accepts the shape of a key and nothing else.
const LICENCE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9-]{7,99}$/;

function autoActivateFromPage() {
  try {
    if (window.top !== window) return;
    if (location.protocol !== 'https:') return;
    if (!ACTIVATION_HOSTS.has(location.hostname)) return;

    const tell = payload => {
      try { window.postMessage({ source: 'kiko-extension', ...payload }, location.origin); }
      catch {}
    };

    // The page hands the key over rather than this reading it out of the URL,
    // and that is not a style choice. The page takes the key out of the address
    // bar the instant it has it — a licence key left in a URL is one in browser
    // history — and a content script runs at document_idle, which is after that
    // has already happened. Reading location.search here found nothing at all.
    //
    // So the key travels one hop, in memory, between two things on the same
    // origin, and the address bar is clean the whole time.
    window.addEventListener('message', e => {
      if (e.source !== window || e.origin !== location.origin) return;
      const d = e.data;
      if (!d || d.source !== 'kiko-page') return;

      // Whoever loaded second asks; whoever loaded first answers. There is no
      // ordering guarantee between a content script and a page's own scripts,
      // and getting this wrong leaves a paying customer watching a spinner.
      if (d.type === 'hello') { tell({ type: 'here' }); return; }
      if (d.type !== 'activate') return;

      const key = String(d.key || '');
      if (!LICENCE_KEY_RE.test(key)) {
        tell({ type: 'activated', ok: false,
               error: 'That does not look like a licence key.' });
        return;
      }
      chrome.runtime.sendMessage({ type: 'kiko-activate-licence', key }, res => {
        // Read lastError so Chrome does not log an unchecked one; the page is
        // told either way and falls back to the manual route.
        void chrome.runtime.lastError;
        tell({ type: 'activated', ok: !!(res && res.ok), error: (res && res.error) || null });
      });
    });

    tell({ type: 'here' });
  } catch {}
}
autoActivateFromPage();

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

// A word worth firing on *by itself*: something everybody writes, or something
// everybody looks up. Deliberately tiny, because a single Hebrew word is
// genuinely ambiguous — בוא converts to "cut", which is ordinary English, and
// on that evidence alone Kiko would offer to destroy the word.
function englishEnough(word) {
  return COMMON_EN_WORDS.has(word) || isEnglishName(word);
}

// A word worth counting toward a run. A run has already cleared a score of
// three, so one accidental hit cannot carry it, and the whole dictionary is
// safe here where it is not above.
//
// Reported: "add a function" typed on a Hebrew keyboard — שגג ש כומבאןמם —
// stayed silent, three times in a morning. So did "write a summary" and
// "create a new project". None of add, write, summary, create, project is in
// the 150-word common list, and the list was the only thing that could set
// hasCommonWord. Case 2 was given a real dictionary in 4.9.16 and this side
// was left asking the short list.
function realEnglishWord(word) {
  return englishEnough(word) ||
         (word.length >= 4 && EN_LEXICON.has(word)) ||
         (word.length >= 5 && word.endsWith('s') && EN_LEXICON.has(word.slice(0, -1)));
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

// ── Hebrew scoring data ───────────────────────────────────────
// The 240 commonest letter pairs in Hebrew, by frequency mass over a 50k
// word list, covering about 88% of all bigrams in ordinary text.
//
// Every other gate in this file asks whether a word looks English. None of
// them ask whether it looks Hebrew, and that asymmetry is what made Kiko read
// a whole sentence perfectly and go silent on "מה קורה": a four-letter word
// has three bigrams, so one incidental English pair scores 0.33 and vetoes
// it. The same fix took Arabic from 60% to 93% — see AR_BIGRAMS — and Hebrew,
// the language this started as, never got it.
//
// 240 rather than Arabic's 400 on purpose: Hebrew has 27 letters including
// the final forms, so 400 pairs would cover 98.5% of the bigram mass and
// score almost any letter sequence as Hebrew, which is precision thrown away
// for nothing. 240 is where the measurements below were taken.
const HE_BIGRAMS = new Set('את ני ות אנ ים לא או לי הי זה יו יי של לה מה תי ול נו הו וא אי רי תה ור רו ית וד שה לו שי מו בי בר כו וב מי די שו יש כל על יה לך בו חו שא תו יל עו מש רא מר יכ נה בל אל ון טו חי כן ין יר קו אמ אח יא דר רה הא ונ מת וש יד המ שב ינ אב למ דע הב ום הר כי דו אה סי ומ רת וו יק יך וק תר בא זו יב וצ מא לע קר גי עם אם לכ וכ הם מע אז עש עי פי בה בת הת נח וח וה שמ מצ חר בס שר רג חד הז סו קי וי צה פר דה עת חנ ימ שת לנ כמ הש שנ צר דב פו אר הח יפ בע סד צי רק בד קש כא יח מד הכ לח פה תך וע לד חת לב בח טי מנ צו רב אן כש פש תח ופ לת מס לש יע ער עב נש הג מק לפ אש מח לק וט במ יס ספ לל זא עד כנ מכ וס טר נס הע תק חש ממ הנ בכ גע בש צא וג נת בט הס לם כה זר אד מן חל תם פנ בק הפ עז כב הד גו הל חב תמ תנ וז חז כת שם מב עצ בנ נכ זמ פע תכ בב'.split(' '));

// The bar a Hebrew reading has to clear to overrule the English veto.
const HE_SURE = 0.60;

function hebrewScore(word) {
  if (word.length < 2) return 0;
  let hits = 0;
  for (let i = 0; i < word.length - 1; i++) {
    if (HE_BIGRAMS.has(word.slice(i, i + 2))) hits++;
  }
  return hits / (word.length - 1);
}

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
,
  'что', 'это', 'как', 'мне', 'нет', 'меня', 'так', 'его', 'все', 'она',
  'тебя', 'если', 'тебе', 'они', 'чтобы', 'есть', 'просто', 'для', 'когда',
  'хорошо', 'здесь', 'был', 'знаю', 'только', 'всё', 'было', 'вас', 'может',
  'нас', 'вот', 'быть', 'кто', 'будет', 'почему', 'вам', 'очень', 'могу',
  'уже', 'спасибо', 'или', 'нам', 'еще', 'там', 'нужно', 'сейчас', 'где',
  'чем', 'хочу', 'ничего', 'этого', 'была', 'мой', 'ладно', 'знаешь',
  'этом', 'потому', 'теперь', 'думаю', 'больше', 'раз', 'ему', 'надо',
  'время', 'этот', 'ещё', 'пока', 'даже', 'привет', 'сказал', 'себя',
  'должен', 'тоже', 'хочешь', 'давай', 'никогда', 'того', 'тогда', 'него',
  'тут', 'были', 'конечно', 'правда', 'моя', 'пожалуйста', 'тобой',
  'сказать', 'сегодня', 'один', 'лучше', 'можешь', 'сюда', 'мной', 'значит',
  'сделать', 'всегда', 'дело', 'можно', 'должны', 'порядке', 'без', 'день',
  'том', 'буду', 'делать', 'хотел', 'чего', 'эти', 'много', 'после', 'этим',
  'всего', 'твой', 'ним', 'лет', 'боже', 'них', 'сэр', 'ведь', 'мистер',
  'жизнь', 'потом', 'ней', 'такой', 'который', 'всех', 'через', 'возможно',
  'немного', 'такое', 'слишком', 'себе', 'зачем', 'должна', 'моей', 'люди',
  'знаете', 'этой', 'думаешь', 'свою', 'точно', 'человек', 'твоя', 'под',
  'сказала', 'назад', 'эту', 'можем', 'случилось', 'мама', 'мог', 'вместе',
  'отец', 'сделал', 'мои', 'кажется', 'друг', 'куда', 'никто', 'поэтому',
  'эта', 'которые', 'два', 'тот', 'сколько', 'понимаю', 'снова', 'жизни',
  'нравится', 'людей', 'помочь', 'видел', 'люблю', 'хочет', 'место',
  'знать', 'прости', 'отлично', 'похоже', 'парень', 'домой', 'всем',
  'деньги', 'иди', 'времени', 'дома', 'именно', 'доктор', 'думал',
  'говорил', 'делаешь', 'будем', 'прямо', 'стоит', 'поговорить', 'найти',
  'разве', 'слушай', 'своей', 'лишь', 'ага', 'можете', 'простите', 'хотела',
  'сам', 'тем', 'будешь', 'прошу', 'три', 'деле', 'хотите', 'говорить',
  'давайте', 'совсем', 'знал', 'знает', 'какой', 'моего', 'скажи', 'дом',
  'дела', 'вами', 'свои', 'говорит', 'несколько', 'должно', 'про', 'ваш',
  'происходит', 'жаль', 'туда', 'действительно', 'папа', 'завтра', 'оно',
  'черт', 'одна', 'перед', 'наш', 'уверен', 'отсюда', 'нужна', 'самом',
  'тех', 'нужен', 'свой', 'мою', 'кого', 'верно', 'работу', 'каждый',
  'твоей', 'будут', 'хватит', 'понял', 'нее', 'имя', 'против', 'пор', 'чём',
  'раньше', 'говорю', 'более', 'надеюсь', 'итак', 'при', 'ваша', 'вообще',
  'пошли', 'мать', 'нельзя', 'наверное', 'нами', 'твои', 'могли', 'дай',
  'ради', 'всю', 'ребята', 'хотя', 'понимаешь', 'идти', 'этих', 'откуда',
  'такая', 'ясно', 'другой', 'извините', 'вижу', 'видеть', 'над', 'могут',
  'равно', 'мисс', 'скоро', 'будто', 'зовут', 'виду', 'наши', 'думала',
  'послушай', 'между', 'своего', 'вопрос', 'этому', 'почти', 'года',
  'человека', 'которая', 'подожди', 'руки', 'нормально', 'такие', 'возьми',
  'минут', 'извини', 'вещи', 'могла', 'смотри', 'хоть', 'работа', 'пару',
  'сын', 'ваше', 'дня', 'пора', 'неё', 'жить', 'видишь', 'достаточно',
  'господи', 'быстро', 'твою', 'весь', 'убить', 'ночь', 'говоришь', 'собой',
  'скажу', 'готов', 'слышал', 'какая', 'посмотри', 'первый', 'самое',
  'видела', 'пусть', 'месте', 'нашли', 'сказали', 'плохо', 'смогу', 'ваши',
  'отца', 'детей', 'знаем', 'рад', 'прав', 'никаких', 'имею', 'миссис',
  'иногда', 'смерти', 'своих', 'пойду', 'брат', 'вроде', 'рядом', 'мир',
  'произошло', 'которую', 'сделала', 'говорила', 'знала', 'мое', 'одного',
  'таким', 'помощь', 'такого', 'кем', 'насчет', 'вчера', 'случае',
  'увидеть', 'нашей', 'говорят', 'правильно', 'убил', 'одно', 'пойти',
  'друга', 'сама', 'долго', 'работать', 'дверь', 'делает', 'женщина',
  'важно', 'кроме', 'будь', 'собираюсь', 'вашей', 'нужны', 'здорово',
  'номер', 'проблема', 'проблемы', 'денег', 'чёрт', 'хороший', 'твоего',
  'одну', 'дальше', 'вернуться', 'давно', 'последний', 'ночи', 'узнать',
  'уверена', 'машину', 'права', 'пять', 'моих', 'также', 'тому', 'вечером',
  'дети', 'опять', 'серьезно', 'работает', 'своим', 'сначала', 'две',
  'одной', 'моим', 'жена', 'думаете', 'помнишь', 'глаза', 'ними', 'чувак',
  'ночью', 'чувствую', 'взять', 'сразу', 'утром', 'часть', 'придется',
  'стать', 'идея', 'дорогая', 'прекрасно', 'слова', 'сделали', 'видели',
  'наша', 'сердце', 'помню', 'парня', 'момент', 'утро', 'здравствуйте',
  'стал', 'скорее', 'большой', 'часов', 'год', 'друзья', 'сильно', 'говори',
  'смысле', 'которой', 'уйти', 'которого', 'капитан', 'работы', 'любовь',
  'дочь', 'новый', 'боюсь', 'имеет', 'стой', 'дней', 'той', 'голову',
  'столько', 'понятно', 'дать', 'девушка', 'довольно', 'доме', 'вечер',
  'оба', 'пойдем', 'увидимся', 'шанс', 'хорошая', 'прежде', 'сделаю',
  'какого', 'быстрее', 'понять', 'рассказать', 'вашего', 'бог', 'интересно',
  'затем', 'умер', 'обо', 'никого', 'парни', 'самый', 'твое', 'вон',
  'пришел', 'чтоб', 'поверить', 'слово', 'будете', 'нашел', 'милая',
  'странно', 'какие', 'однажды', 'сможешь', 'получить', 'обычно', 'ума',
  'полагаю', 'алло', 'посмотреть', 'иначе', 'наших', 'тело', 'хотели',
  'свое', 'пришли', 'моё', 'другие', 'выглядит', 'подумал', 'лицо',
  'приятно', 'мам', 'говорите', 'обратно', 'нашего', 'телефон', 'мире',
  'честь', 'господин', 'доброе', 'план', 'другом', 'час', 'джон', 'пути',
  'делал', 'типа', 'посмотрим', 'насколько', 'пытался', 'правду', 'решил',
  'поздно', 'нем', 'работе', 'любит', 'хотят', 'кому', 'сестра', 'места',
  'скажешь', 'следующий', 'других', 'получил', 'кстати', 'говорили',
  'пришла', 'безопасности', 'рада', 'город', 'внимание', 'кофе', 'которое',
  'вся', 'семья', 'конец', 'позже', 'дал', 'думать', 'спать', 'вернулся',
  'остаться', 'некоторые', 'кровь', 'оружие', 'пришлось', 'хуже', 'дорогой',
  'полиция', 'сможем', 'понимаете', 'четыре', 'которых', 'ужасно', 'ждать',
  'способ', 'делаю', 'готовы', 'совершенно', 'смотреть', 'вернусь',
  'большое', 'единственный', 'вперед', 'часа', 'муж', 'идет', 'таких',
  'ребенка', 'машина', 'стороны', 'смог', 'сына', 'играть', 'сами', 'верю',
  'честно', 'нашла', 'звучит', 'угодно', 'руку', 'начала', 'перевод',
  'какое', 'взял', 'станет', 'пытаюсь', 'внутри', 'знали', 'новости',
  'добрый', 'подождите', 'скажите', 'ребенок', 'вашу', 'мальчик',
  'осталось', 'делаете', 'году', 'мере', 'поняла', 'отношения', 'далеко',
  'вокруг', 'хотим', 'слышала', 'двух', 'приятель', 'никому', 'мужчина',
  'неделю', 'вернуть', 'смерть', 'сих', 'сможет', 'дайте', 'двое', 'видите',
  'долларов', 'крови', 'решение', 'путь', 'следует', 'неужели', 'около',
  'готова', 'семьи', 'идем', 'смотрите', 'круто', 'история', 'вдруг',
  'спросить', 'твоих', 'второй', 'вина', 'джек', 'женщины', 'нашу',
  'заткнись', 'минуту', 'собираешься', 'твоим', 'шоу', 'прощения', 'больно',
  'машины', 'пап', 'трудно', 'постоянно', 'поможет', 'проблем', 'например',
  'дерьмо', 'полиции', 'начать', 'знают', 'лучший', 'добро', 'спасти',
  'рождения', 'оставить', 'чарли', 'любишь', 'конце', 'забыл', 'месяцев',
  'часто', 'мило', 'комнате', 'нему', 'матери', 'милый', 'полностью',
  'школе', 'леди', 'серьёзно', 'убили', 'случай', 'джо', 'убийство',
  'послушайте', 'посмотрите', 'пошел', 'никакого', 'сделаем', 'говоря',
  'неплохо', 'использовать', 'прошлой', 'иду', 'узнал', 'прекрати', 'чуть',
  'держи', 'невозможно', 'господа', 'слушайте', 'наше', 'машине', 'сэм',
  'свет', 'образом', 'иметь', 'другое', 'другого', 'шесть', 'людям',
  'погоди', 'имени', 'детка', 'недели', 'меньше', 'легко', 'крайней',
  'девочка', 'придётся', 'мало', 'ненавижу', 'последние', 'насчёт',
  'выглядишь', 'сообщение', 'думает', 'друзей', 'обещаю', 'агент', 'вместо',
  'последнее', 'самого', 'настолько', 'ответ', 'детектив', 'понятия',
  'родители', 'показать', 'поехали', 'стало', 'мэм', 'своими', 'всей',
  'очевидно', 'помогите', 'маленький', 'школу', 'пожаловать', 'твоё',
  'либо', 'забрать', 'прошло', 'особенно', 'имеешь', 'истории', 'вопросы',
  'большая', 'минутку', 'пол', 'остановить', 'чему', 'свидания',
  'обязательно', 'городе', 'убийца', 'сделай', 'ваших', 'любви',
  'спокойной', 'своё', 'мадам', 'идите', 'выйти', 'делают', 'немедленно',
  'делай', 'возможность', 'человеком', 'бывает', 'ужин', 'моем', 'купить',
  'позвонить', 'наконец', 'стала', 'любой', 'клянусь', 'смешно',
  'абсолютно', 'всему', 'переводчики', 'забудь', 'секунду', 'выбор',
  'тысяч', 'потерял', 'майкл', 'волнуйся', 'ноги', 'таком', 'настоящий',
  'означает', 'встретиться', 'известно', 'работаю', 'замечательно', 'любом',
  'оставь', 'связи', 'боль', 'выпить', 'представить', 'убийства', 'малыш',
  'умерла', 'воды', 'окей', 'речь', 'хорошие', 'поводу', 'перестань',
  'увидел', 'повезло', 'президент', 'мужик', 'которым', 'прошлом', 'дам',
  'десять', 'умереть', 'поговорим', 'отцом', 'искать', 'тихо', 'оставил',
  'пистолет', 'начал', 'сложно', 'города', 'неделе', 'хотелось', 'принять',
  'историю', 'босс', 'держать', 'пойдём', 'подумала', 'фильм', 'слышишь',
  'рано', 'удачи', 'еду', 'словно', 'причина', 'пришёл', 'компании',
  'спокойно', 'работал', 'подумать', 'вести', 'вещь', 'брата', 'конца',
  'получится', 'блин', 'право', 'ввиду', 'бога', 'подарок', 'комнату',
  'мира', 'успокойся', 'позволить', 'моему', 'идёт', 'самая', 'рассказал',
  'курсе', 'намного', 'мистера', 'женщин', 'тяжело', 'предложение', 'одним',
  'счет', 'улице', 'другим', 'уходи', 'майк', 'среди', 'помоги',
  'получилось', 'месяц', 'проверить', 'генри', 'голос', 'позвольте',
  'стороне', 'вероятно', 'случится', 'уверены', 'мужа', 'питер', 'провести',
  'людьми', 'неважно', 'нашёл', 'доктора', 'месяца', 'игра', 'идём', 'нём',
  'джордж', 'познакомиться', 'возьму', 'слышали', 'пошла', 'корабль',
  'чувствуешь', 'позволь', 'сторону', 'игры', 'согласен', 'письмо', 'вниз',
  'молодец', 'наверняка', 'утра', 'вашим', 'нечего', 'встречи', 'вид',
  'никакой', 'связь', 'список', 'такую', 'весело', 'сидеть', 'гораздо',
  'собирался', 'впервые', 'находится', 'объяснить', 'полицию', 'решили',
  'семью', 'свидание', 'отличная', 'остальные', 'прийти', 'руках', 'фбр',
  'чувство', 'котором', 'решила', 'понадобится', 'сынок', 'найду', 'фрэнк',
  'школы', 'чувства', 'дядя', 'стали', 'ушла', 'первым', 'поверь',
  'расскажи', 'хочется', 'девушки', 'сон', 'имел', 'каким', 'парнем',
  'многие', 'части', 'ехать', 'считаю', 'никуда', 'голове', 'старый',
  'оттуда', 'называется', 'вопросов', 'фото', 'пройти', 'заниматься',
  'другу', 'вернулась', 'пара', 'никак', 'девочки', 'благодарю', 'своем',
  'недавно', 'приехал', 'глаз', 'могло', 'становится', 'пыталась',
  'является', 'брось', 'богу', 'нашим', 'помощи', 'волосы', 'невероятно',
  'одном', 'ушел', 'джейн', 'тела', 'недель', 'собирается', 'защитить',
  'всеми', 'существует', 'жив', 'первая', 'позвоню', 'благодаря', 'вперёд',
  'навсегда', 'помните', 'земле', 'делу', 'вполне', 'пытается', 'будущее',
  'семь', 'своему', 'идиот', 'слава', 'стоило', 'удалось', 'делаем',
  'команда', 'главное', 'огонь', 'дэнни', 'замуж', 'начали', 'мужчины',
  'силы', 'семье', 'шеф', 'суд', 'слышу', 'тюрьме', 'попробовать',
  'друзьями', 'алекс', 'вашем', 'новая', 'маленькая', 'черта', 'придет',
  'страшно', 'услышать', 'новые', 'общем', 'звонил', 'купил', 'понравится',
  'близко', 'самой', 'смысл', 'хорошее', 'любил', 'сара', 'единственная',
  'делали', 'макс', 'мэри', 'жду', 'получается', 'хорошего', 'эми', 'дамы',
  'жену', 'гарри', 'неправильно', 'стоять', 'плевать', 'ключ', 'верить',
  'лично', 'слышать', 'взяли', 'поздравляю', 'пить', 'заставить',
  'получили', 'рот', 'делала', 'преступления', 'двери', 'землю',
  'разумеется', 'очередь', 'первой', 'разговор', 'видимо', 'звонок',
  'джеймс', 'менее', 'нового', 'получила', 'подальше', 'сможете', 'похож',
  'состоянии', 'необходимо', 'адвокат', 'касается', 'секунд', 'стоп',
  'дали', 'оставаться', 'сделает', 'ходить', 'помощью', 'хватает',
  'изменить', 'король', 'народ', 'новую', 'девушку', 'живет', 'секс',
  'сделаешь', 'думали', 'нашем', 'попасть', 'каждого', 'другую', 'просил',
  'пошёл', 'войны', 'случайно', 'игру', 'мертв', 'держись', 'забыла',
  'цель', 'минуты', 'месье', 'выше', 'однако', 'женщину', 'раза', 'мысли',
  'выход', 'платье', 'вовсе', 'пришло', 'женой', 'ребёнка', 'сожалею',
  'твоем', 'осторожно', 'смогла', 'этими', 'стану', 'маме', 'парней',
  'нравятся', 'покое', 'поехать', 'садись', 'миллионов', 'отличный',
  'ребёнок', 'дочери', 'дороги', 'ого', 'нечто', 'первое', 'выяснить',
  'ник', 'информацию', 'офис', 'записи', 'лучшее', 'течение', 'вечеринку',
  'убью', 'годы', 'забыть', 'правила', 'сожалению', 'слов', 'джимми', 'дни',
  'дала', 'жизнью', 'совет', 'занят', 'попробуй', 'подруга', 'расскажу',
  'целый', 'красивая', 'попросил', 'вышел', 'удар', 'вещей', 'адрес',
  'дэвид', 'оставьте', 'сержант', 'увидишь', 'виноват', 'разница',
  'открыть', 'написал', 'ждет', 'новое', 'счастлив', 'вау', 'выбора',
  'продолжай', 'задницу', 'покажу', 'единственное', 'доверять', 'встреча',
  'убивать', 'концов', 'обоих', 'будьте', 'останется', 'тюрьму', 'наверно',
  'ищу', 'момента', 'обед', 'лица', 'видео', 'стойте', 'взяла', 'подождать',
  'считает', 'вечно', 'покажи', 'бен', 'книгу', 'многое', 'земли', 'дел',
  'какую', 'поскольку', 'узнала', 'сильнее', 'жены', 'встречу', 'весьма',
  'блядь', 'поняли', 'родителей', 'лейтенант', 'глупо', 'узнает', 'думают',
  'сезон', 'снаружи', 'голова', 'мамой', 'заняться', 'кино', 'вечера',
  'свете', 'выйдет', 'восемь', 'найдем', 'помогу', 'больницу', 'больнице',
  'магазин', 'тони', 'заметил', 'договорились', 'слушать', 'бизнес',
  'примерно', 'уехать', 'мамы', 'позвонил', 'выходит', 'маму', 'документы',
  'попал', 'шаг', 'отпусти', 'смотрю', 'здравствуй', 'понравилось',
  'смогли', 'правы', 'большие', 'рассказала', 'идут', 'готово', 'плохой',
  'офицер', 'узнали', 'скажет', 'сюрприз', 'внимания', 'вышло', 'дорогу',
  'считаешь', 'фотографии', 'вода', 'делом', 'каком', 'полный', 'следующей',
  'доказать', 'захочешь', 'книги', 'война', 'планы', 'мысль', 'веришь',
  'видно', 'скажем', 'большинство', 'ребят', 'продолжать', 'ранее',
  'жертвы', 'ближе', 'качестве', 'двигаться', 'написано', 'чувствовать',
  'хорош', 'любить', 'величество', 'головы', 'дороге', 'попросить',
  'времена', 'подумай', 'забавно', 'главный', 'внизу', 'каждую', 'остался',
  'вставай', 'мнение', 'твоему', 'часы', 'вряд', 'постой', 'сомневаюсь',
  'отдай', 'вечеринка', 'ошибка', 'приехали', 'бросил', 'вернется',
  'профессор', 'любят', 'ключи', 'подходит', 'беги', 'ничто', 'поле',
  'вышла', 'открой', 'воду', 'сексом', 'музыка', 'побери', 'бабушка',
  'собираемся', 'несмотря', 'госпожа', 'стране', 'рэй', 'отдать', 'трубку',
  'сил', 'кончено', 'другая', 'комната', 'ричард', 'сердца', 'опасности',
  'сша', 'закончить', 'детьми', 'врач', 'живу', 'имеете', 'команды',
  'пожалуй', 'роль', 'порядок', 'группа', 'встретимся', 'кольцо', 'самые',
  'позвони', 'всём', 'вверх', 'разговаривать', 'джим', 'закон', 'мужчин',
  'шутишь', 'играет', 'хорошим', 'новой', 'начнем', 'ухожу', 'член',
  'такси', 'серия', 'днк', 'получше', 'убила', 'настоящая', 'молодой',
  'эмили', 'показания', 'одному', 'шутка', 'уходить', 'снять',
  'недостаточно', 'каких', 'кейт', 'одни', 'разобраться', 'язык', 'едем',
  'директор', 'сто', 'энди', 'учитывая', 'спросил', 'днем', 'первого',
  'джей', 'наверху', 'говорим', 'счастлива', 'помог', 'отцу', 'приходится',
  'определенно', 'сигнал', 'закончится', 'помогает', 'группы', 'моём',
  'едва', 'легче', 'ответить', 'спустя', 'принести', 'секрет', 'приказ',
  'опасно', 'позволю', 'билли', 'бросить', 'телефону', 'самых', 'эдди',
  'получишь', 'господь', 'внутрь', 'компания', 'прекрасный', 'томми',
  'такими', 'пойдет', 'женщиной', 'работаешь', 'большую', 'волнует', 'рук',
  'память', 'старик', 'избавиться', 'квартиру', 'закончили', 'информация',
  'встречаться', 'удовольствием', 'спас', 'мозг', 'читать', 'ким',
  'чертовски', 'стол', 'джонни', 'ублюдок', 'дон', 'тысячи', 'боб', 'ложь',
  'ёто', 'потеряла', 'взглянуть', 'писать', 'мен', 'увидела', 'передать',
  'войти', 'везде', 'бобби', 'кое', 'солнце', 'устал', 'сделку',
  'настоящее', 'потеряли', 'класс', 'смотрел', 'держите', 'закончил',
  'марк', 'джерри', 'потрясающе', 'обещал', 'убедиться', 'скажете', 'факт',
  'уничтожить', 'страны', 'учитель', 'полно', 'начинается', 'бежать',
  'операции', 'сукин', 'ошибку', 'украл', 'данные', 'двоих', 'света',
  'запах', 'придурок', 'найди', 'лучшая', 'вернулись', 'убирайся',
  'боишься', 'окно', 'убийстве', 'ситуации', 'костюм', 'казалось',
  'доказательства', 'обсудить', 'жил', 'принимать', 'море', 'оставила',
  'судя', 'штука', 'ситуация', 'возможности', 'следы', 'генерал',
  'рождество', 'платить', 'пытались', 'забрал', 'эрик', 'самым',
  'великолепно', 'песню', 'билл', 'помогать', 'новость', 'силу', 'жертва',
  'баксов', 'другими', 'обожаю', 'достать', 'вовремя', 'появился', 'кларк',
  'тише', 'одежду', 'приходит', 'расследование', 'зато', 'девушкой', 'яйца',
  'зависит', 'принадлежит', 'согласно', 'предложить', 'уровень', 'любила',
  'вашему', 'собака', 'знак', 'чисто', 'срочно', 'начало', 'вне', 'клуб',
  'искал', 'собираетесь', 'души', 'расслабься', 'супер', 'ждал', 'неправда',
  'доступ', 'куча', 'туалет', 'знакомы', 'офисе', 'сука', 'слегка', 'ждут',
  'песня', 'наверх', 'небольшой', 'анна', 'красиво', 'запись', 'причины',
  'работала', 'состояние', 'белый', 'зайти', 'дважды', 'думай', 'центр',
  'дружище', 'исправить', 'джейк', 'использовал', 'идешь', 'желание',
  'книга', 'многих', 'разные', 'полковник', 'оказался', 'идеи', 'добраться',
  'нос', 'возьмите', 'матерью', 'суда', 'каково', 'сила', 'уходите', 'рука',
  'повсюду', 'лучшие', 'сделано', 'взгляд', 'наркотики', 'бери', 'судья',
  'чушь', 'плохая', 'система', 'практически', 'выходные', 'лили', 'суде',
  'еда', 'док', 'узнаю', 'нож', 'написать', 'собиралась', 'чай', 'глазах',
  'остальное', 'брак', 'представляешь', 'остальных', 'мимо', 'поеду',
  'потерять', 'старые', 'звук', 'частью', 'приехала', 'даст', 'спит',
  'пытаешься', 'выглядеть', 'беременна', 'увижу', 'спал', 'вкус', 'крис',
  'поезд', 'пиво', 'уехал', 'устроить', 'радио', 'обе', 'команду',
  'безумие', 'решить', 'солдат', 'мальчика', 'короля', 'проще', 'особо',
  'ребенком', 'дедушка', 'мертва', 'церкви', 'результаты', 'имена',
  'беспокойся', 'неприятности', 'камеры', 'отправить', 'брайан', 'здание',
  'шон', 'возле', 'защищать', 'плохие', 'работают', 'называть', 'третий',
  'способен', 'удивительно', 'смысла', 'долг', 'боли', 'клэр', 'первую',
  'стыдно', 'случиться', 'сестры', 'называют', 'райан', 'счёт', 'слушаю',
  'мартин', 'возвращаться', 'выбрал', 'черту', 'инспектор', 'земля',
  'оказалось', 'сходить', 'головой', 'плюс', 'оружия', 'музыку', 'явно',
  'сказано', 'назвал', 'стрелять', 'своём', 'столь', 'ушли', 'последняя',
  'лицом', 'решать', 'остались', 'заплатить', 'разу', 'жене', 'даю',
  'центре', 'началось', 'президента', 'сообщить', 'кучу', 'звали', 'принял',
  'придёт', 'рода', 'справиться', 'поцелуй', 'сбежал', 'еды', 'встречались',
  'прошла', 'команде', 'оставлю', 'ищем', 'согласна', 'останусь', 'тест',
  'прошлое', 'смотришь', 'код', 'двумя', 'шучу', 'человеку', 'выбраться',
  'следовало', 'продать', 'которому', 'звонила', 'поставить', 'клиент',
  'здоровье', 'прочь', 'приду', 'держу', 'поговорю', 'похожа',
  'рассказывать', 'играл', 'стив', 'заставил', 'встретил', 'самолет',
  'кости', 'сбежать', 'прекратить', 'уйду', 'принесу', 'власти', 'ушёл',
  'остается', 'постели', 'вернись', 'впереди', 'захочет', 'реально',
  'двадцать', 'квартире', 'маленькой', 'важное', 'ешь', 'бар', 'жива',
  'дает', 'завтрак', 'любовью', 'зря', 'полицейский', 'принес', 'мария',
  'страшного', 'устала', 'прекратите', 'убери', 'нравишься', 'заходи',
  'энни', 'сработает', 'старая', 'скучаю', 'заявление', 'плохого',
  'поймать', 'ответственность', 'прощай', 'девять', 'осталась', 'наедине',
  'выбрать', 'обвинения', 'ммм', 'компанию', 'поедем', 'цветы', 'имела',
  'ждёт', 'камеру', 'новых', 'преступление', 'трех', 'кусок', 'пропал',
  'посмотрю', 'медленно', 'душу', 'получит', 'рады', 'значения', 'забрали',
  'пойдешь', 'сохранить', 'привести', 'видит', 'информации', 'войну',
  'письма', 'бумаги', 'холодно', 'руками', 'томас', 'упал', 'моими',
  'отношение', 'карл', 'операция', 'судьба', 'любимый', 'задать', 'папочка',
  'внезапно', 'временем', 'представляю', 'церковь', 'решения', 'чувствовал',
  'чудесно', 'специально', 'маленькие', 'дурак', 'мальчики', 'начинает',
  'компьютер', 'станешь', 'продолжайте', 'роберт', 'урок', 'кровью',
  'глазами', 'занимается', 'линии', 'люк', 'брать', 'давать', 'вновь',
  'трое', 'девушек', 'услышал', 'вызвать', 'работали', 'позвонила',
  'бороться', 'остановись', 'вариант', 'послал', 'назвать', 'просила',
  'ход', 'положение', 'вернемся', 'уходим', 'уилл', 'связано', 'каждой'
]);

// How strongly a reading has to read as Russian before it outranks the
// Hebrew guard. Swept against everyday phrases and the false-positive
// corpora; see the Hebrew guard in russianExactly.
const RU_SURE = 0.50;

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

// A capital letter is not a thing Hebrew, Russian, Greek, Korean, Ukrainian or
// Arabic has. Somebody typing one of them on an English layout produces
// lowercase, because Shift on those layouts reaches a different character
// altogether — so a run whose every word is Title Case is a proper noun, not a
// mistake.
//
// From a screenshot of a Smartlead lead list: "Dagan Schattert" offered as
// גשעשמ דבישאאקרא. Neither word is in the English dictionary, both map
// cleanly, and two candidates side by side is a run. Nothing in this file
// looked at the capitals, which is the one signal that settles it.
//
// Two words, not one: a sentence legitimately starts with a capital, and on a
// phone the keyboard supplies it whether or not it was wanted. A single
// capitalised word is left alone. A line of them is a name.
function allTitleCase(words) {
  const real = words.filter(w => /[a-z]/i.test(w));
  if (real.length < 2) return false;
  // Internal capitals belong to names too: O'Brien, Smith-Jones, MacDonald.
  // The signal is that the word is not lowercase, not that it is Title Case
  // exactly, and an assertion for those three caught the narrower spelling.
  return real.every(w => /^[A-Z][A-Za-z'’-]*$/.test(w));
}

function isRealRun(entry) {
  if (allTitleCase(entry.words)) return false;
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
  // The English dictionary, before any of this language's own evidence.
  //
  // Every one of these checks consulted EN_WORDS, which holds a few hundred
  // words, and none of them consulted EN_LEXICON, which holds 8,625. So
  // "entitlement", "guilty", "rugby", "truck" and the rest of ordinary
  // written English were invisible to every language but Hebrew, and Korean
  // in particular returns true on any token that falls out as four clean
  // syllables — "entitlement" became 두샤시드둣 on its own, in the middle of a
  // sentence about entitlement.
  //
  // It goes above this language's own word list on purpose. A word the
  // English dictionary knows and the foreign list also claims is a word the
  // foreign list should not have: that is what the eleven exclusions inside
  // unmistakablyEnglish are for, and they are the cases where the two
  // genuinely collide.
  if (!ALSO_A_WORD.ru.has(lower) && unmistakablyEnglish(lower)) return false;
  const mapped = [...lower].map(c => EN_TO_RU[c]);
  if (!mapped.every(c => c !== undefined)) return false;
  const ruWord = mapped.join('');
  // A known Russian word outranks both heuristics below. Checked after
  // EN_WORDS so real English still wins, but before them because they were
  // silently eating the two commonest words in the language: "ghbdtn"
  // (привет) looks plausibly Hebrew, and "rfr" (как) scores 0.50 as English.
  if (COMMON_RU_WORDS.has(ruWord)) return true;
  // The Hebrew guard yields to strong Russian evidence, for the same reason
  // the COMMON_RU_WORDS line above it does. It ran first and unconditionally,
  // so конечно (0.67 as Russian), ответа (0.80), встретимся (0.56) and
  // отправь (0.50) were all handed to Hebrew on a weak match and went silent
  // — Russian caught 36% of everyday phrases while the corpus said 100%.
  // A word list cannot carry this on its own: these are ordinary inflected
  // forms, and no list of a few hundred stems contains them.
  if (enabledLangs.he && wordCouldBeHebrew(word) && russianScore(ruWord) < RU_SURE) return false;
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
  // The English dictionary, before any of this language's own evidence.
  //
  // Every one of these checks consulted EN_WORDS, which holds a few hundred
  // words, and none of them consulted EN_LEXICON, which holds 8,625. So
  // "entitlement", "guilty", "rugby", "truck" and the rest of ordinary
  // written English were invisible to every language but Hebrew, and Korean
  // in particular returns true on any token that falls out as four clean
  // syllables — "entitlement" became 두샤시드둣 on its own, in the middle of a
  // sentence about entitlement.
  //
  // It goes above this language's own word list on purpose. A word the
  // English dictionary knows and the foreign list also claims is a word the
  // foreign list should not have: that is what the eleven exclusions inside
  // unmistakablyEnglish are for, and they are the cases where the two
  // genuinely collide.
  if (!ALSO_A_WORD.uk.has(lower) && unmistakablyEnglish(lower)) return false;
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
// Learned from a 50,000-word Arabic frequency list rather than written by
// hand, and it had to be: the hand-written table held 60 bigrams and covered
// 45% of the bigram occurrences in real Arabic. Measured against words the
// table has never seen, Kiko recognised 60% of ordinary Arabic — and the
// misses were the backbone of the language: هذا، هل، إلى، عن، ليس، يجب، نحن.
// Every one of those breaks a run and leaves a sentence half converted.
//
// 400 is where this stops. Swept in steps to 500 against the corpus: 400
// recognises 93% of held-out words with no false positives, and the plateau
// from 0.40 to 0.50 on the threshold is flat, so the number is not balanced
// on a knife edge. 500 recognises 96% and costs two false positives, which
// is not a trade this product makes.
//
// A word list was tried first, because that is what fixed English in 4.9.16.
// It does not transfer. English has a small closed set of common words;
// Arabic inflects — ال، و، ب، ل، ف on the front, ها، هم، ون، ين، ات on the
// back — so a list memorises instead of generalising. Twelve thousand words,
// 131KB, moved held-out recognition from 61% to 63%. These 400 bigrams are
// 3KB and move it to 93%.
const AR_BIGRAMS = new Set(('ال أن نا لا ما ان لم ذا لك عل من لي هذ نت في كن يا ين لى ري ها نه يد ني ول قد با لق دي ون كا لأ وا را ار لت ير عن ست كل مر سي ذل هن مع يك ات هل اذ لن دا ية يس ام بي سن ذه قا مك لو عم أي حد إن له يم تع رة مي لد تي يل حس لس اب نك عر جل إل لل يع اء رف أع عا كو مل لع يق عد أم لح فع تر بع رج حي شي لذ اك تق يه هم هو سا اع لة اي نن وم ائ دة تح تم جد هي اس اح كي يت كر حا تك يف لب قي قو أر وق اد بد ور أخ عي حق نع دو مو بر رب قت حت أس أو خر دم عت جا أح فق تا يو مس يب تل أك جي مت لف حب لج أت كم بل لر تو سو قط سم ذي رك ند به تف قل وج يء قة طي ته اج أج يج لش سب ود لآ رو لط يح شك بأ آن نو اق إذ هب دث شر جب أل جم در جو صل تى فا اه فت مة وي وف نح او نف رت عة بح تب لخ سأ بة رح ظر بم خي كث دت قب خا اف تط غي خب وه أف بن شا نس أب طر بو كذ صد خل نة بك بق ثل حن ضا تن أق جر رى مح لص فس خص سر وع عو شخ نظ طا فض فة تأ فر تس مث ثي وك زي مج عض بت اخ فل رد مه سف فى تص طل رأ كت يض حص لإ ضل صا وأ مد رس اص صو وس قر دع لغ فه وب وح ده رق عب يئ وت حر تت هر مش خط فك أش طب سل تش ثر صح نى تخ حم غا تظ دق جن نذ حل غر نز صب زل دك بش سك رض شع قف اة كب ثا خذ بب رن مق آخ بس ضي مم طو نب أص ره حو اض طة بخ نق جع قص تج زا طف ضع زو عه تذ يز ئع اث سة ظن فو ضر سع حة قم ئا جه بط از ذك رع وض هد نج خت ئي عك لث اط حظ ثم تد صة جة قع آس').split(' '));

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
,
  'هذا', 'على', 'أنا', 'ذلك', 'لقد', 'ماذا', 'كان', 'هنا', 'إلى', 'أنت',
  'هذه', 'نعم', 'هناك', 'ليس', 'كنت', 'فقط', 'شيء', 'الآن', 'الذي', 'لكن',
  'أجل', 'يجب', 'كيف', 'حسنا', 'انا', 'إنه', 'سوف', 'نحن', 'إذا', 'كانت',
  'عندما', 'لماذا', 'الأمر', 'أنه', 'حتى', 'بعد', 'كذلك', 'ولكن', 'قبل',
  'التي', 'انه', 'إنها', 'ربما', 'أين', 'هيا', 'تلك', 'أعرف', 'الى', 'يكون',
  'بعض', 'أريد', 'أعتقد', 'انت', 'عليك', 'مثل', 'صحيح', 'أنك', 'الوقت',
  'بخير', 'أعلم', 'أحد', 'شخص', 'رجل', 'لذا', 'يمكن', 'كما', 'كلا', 'أكثر',
  'يبدو', 'جيد', 'تكون', 'علي', 'اليوم', 'يمكنك', 'انها', 'أليس', 'لدي',
  'عليه', 'آخر', 'لست', 'منذ', 'غير', 'أيها', 'لديك', 'تريد', 'أستطيع',
  'الرجل', 'تعرف', 'مرة', 'لدينا', 'أنها', 'يمكنني', 'بأن', 'واحد', 'أنني',
  'أوه', 'سيكون', 'الناس', 'ليست', 'حدث', 'بها', 'أفضل', 'الكثير', 'علينا',
  'سيدي', 'مكان', 'تفعل', 'وقت', 'يكن', 'بهذا', 'وأنا', 'اذا', 'جدا',
  'أخرى', 'آسف', 'رائع', 'بذلك', 'يوجد', 'واحدة', 'ولا', 'قلت', 'يحدث',
  'بالطبع', 'شكرا', 'مرحبا', 'يوم', 'أبي', 'معك', 'لها', 'معي', 'سيد',
  'تعلم', 'إذن', 'العمل', 'المكان', 'الليلة', 'إلهي', 'لهذا', 'فعل', 'هكذا',
  'أمي', 'لذلك', 'ألا', 'الان', 'حول', 'بما', 'حقا', 'الحقيقة', 'الجميع',
  'يمكننا', 'بالتأكيد', 'لأن', 'لديه', 'لنا', 'خلال', 'بشكل', 'العالم',
  'فحسب', 'حال', 'الذهاب', 'عليها', 'أعني', 'فعلت', 'قال', 'المنزل', 'عنه',
  'بشأن', 'أفعل', 'أكون', 'اللعنة', 'للغاية', 'فيه', 'بين', 'أننا', 'منك',
  'وهذا', 'جيدة', 'يعني', 'مجرد', 'أظن', 'انك', 'مني', 'بالنسبة', 'الأمور',
  'فكرة', 'متى', 'الشيء', 'المال', 'كنا', 'أقول', 'عمل', 'ستكون', 'أمر',
  'تقول', 'توقف', 'هؤلاء', 'السيد', 'انظر', 'لما', 'منه', 'الطريق', 'أشعر',
  'حصلت', 'الحياة', 'أني', 'نفس', 'معه', 'بحاجة', 'بسبب', 'الذين', 'تستطيع',
  'بأس', 'بدون', 'لكم', 'تبدو', 'أرى', 'الجحيم', 'تكن', 'اعتقد', 'عند',
  'آسفة', 'حيث', 'وأنت', 'تحت', 'تعال', 'بالفعل', 'فضلك', 'الأشياء', 'ليلة',
  'نفسك', 'لكي', 'تعتقد', 'وهو', 'بحق', 'مشكلة', 'شيئا', 'أرجوك', 'أذهب',
  'يريد', 'الـ', 'الوحيد', 'قتل', 'إنهم', 'الشخص', 'رأيت', 'عزيزتي', 'طوال',
  'بهذه', 'الشرطة', 'الأن', 'أحب', 'الذى', 'أيضا', 'بنا', 'أردت', 'أكن',
  'النار', 'سمعت', 'اجل', 'جميع', 'مالذي', 'بأنه', 'والآن', 'إلي', 'انتظر',
  'فتاة', 'كبير', 'يعرف', 'فيها', 'الرجال', 'اريد', 'لأنه', 'السبب',
  'سنوات', 'الباب', 'نذهب', 'دون', 'حياتي', 'لابد', 'السيارة', 'تريدين',
  'خارج', 'ومن', 'ثلاثة', 'فعله', 'تذهب', 'كانوا', 'اذهب', 'الحصول', 'يقول',
  'الواقع', 'اعرف', 'أنهم', 'سبب', 'كبيرة', 'مما', 'أحتاج', 'قمت', 'منها',
  'للتو', 'استطيع', 'نوع', 'هنالك', 'تعرفين', 'جميلة', 'بكل', 'دولار',
  'بأنك', 'لأنني', 'الأفضل', 'دائما', 'جديد', 'الامر', 'اين', 'بالضبط',
  'جون', 'دعنا', 'أنظر', 'المدينة', 'الخاص', 'تعلمين', 'جميل', 'بسرعة',
  'الأرض', 'لحظة', 'الطريقة', 'طريقة', 'رائعة', 'سعيد', 'دقيقة', 'لكنه',
  'غرفة', 'إليه', 'التحدث', 'ثانية', 'دعني', 'لكنني', 'الفتاة', 'ولم',
  'أنتم', 'عظيم', 'انهم', 'اوه', 'بينما', 'نفسي', 'إليك', 'قام', 'لديها',
  'عام', 'اعلم', 'يعمل', 'سأكون', 'عيد', 'رفاق', 'ألم', 'لهم', 'تعمل',
  'تتحدث', 'القيام', 'الله', 'ساعة', 'المرة', 'ترى', 'جاك', 'الخير',
  'متأكد', 'أحاول', 'شيئ', 'الموت', 'رقم', 'منهم', 'سيارة', 'ايها', 'عنك',
  'يفعل', 'فقد', 'ذهبت', 'المزيد', 'أتمنى', 'مات', 'يتم', 'لكني', 'طريق',
  'وجدت', 'وقد', 'أول', 'معها', 'سعيدة', 'لدى', 'أقصد', 'إلا', 'صباح',
  'الرئيس', 'احد', 'فرصة', 'الأولى', 'يرام', 'يكفي', 'علاقة', 'صغيرة',
  'الأقل', 'لأنك', 'غريب', 'لنذهب', 'المدرسة', 'الصباح', 'أفهم', 'حين',
  'صديقي', 'سأذهب', 'تأتي', 'الخاصة', 'أخبرني', 'تقوم', 'نستطيع', 'نفسه',
  'التى', 'الأطفال', 'حالة', 'يستطيع', 'يجري', 'سنة', 'نفعل', 'أتعلم',
  'نهاية', 'أفكر', 'أود', 'عشر', 'شىء', 'أقوم', 'الحب', 'انني', 'لديهم',
  'جديدة', 'يعلم', 'قالت', 'بدأت', 'الأول', 'دقائق', 'عني', 'سيدة', 'حالك',
  'إنني', 'عزيزي', 'رجال', 'نعرف', 'الجنس', 'رؤية', 'ينبغي', 'الي', 'حصل',
  'معنا', 'الطفل', 'وليس', 'تحتاج', 'قليلا', 'حياة', 'اسمع', 'الساعة',
  'أكبر', 'اليس', 'فهمت', 'عنها', 'أريدك', 'تفعله', 'وماذا', 'ظننت',
  'سيدتي', 'البعض', 'الصغير', 'تعني', 'البيت', 'رأيك', 'تكوني', 'والدك',
  'مهما', 'العودة', 'تماما', 'لطيف', 'يقوم', 'السجن', 'الليل', 'السيدة',
  'أخي', 'بأنني', 'طويلة', 'والدي', 'وهي', 'حان', 'أقل', 'الهاتف', 'عبر',
  'مهلا', 'ترجمة', 'نحتاج', 'أيتها', 'وما', 'اكثر', 'أتحدث', 'أيام',
  'أحدهم', 'الماضي', 'أحبك', 'الطعام', 'البقاء', 'معرفة', 'العام', 'أية',
  'أصبح', 'ذات', 'الجديد', 'لكنك', 'أبدا', 'وضع', 'سيئة', 'طفل', 'فوق',
  'حياتك', 'داخل', 'وكان', 'نكون', 'خطأ', 'سام', 'ونحن', 'منزل', 'تشعر',
  'عليهم', 'المفترض', 'نتحدث', 'طويل', 'نصف', 'فريق', 'أخذ', 'الماء',
  'يأتي', 'صديق', 'سأفعل', 'منا', 'الصغيرة', 'نريد', 'وانا', 'للمنزل',
  'ايضا', 'جزء', 'لكنها', 'أشياء', 'كلمة', 'تفعلين', 'أعمل', 'يمكنه',
  'الآخر', 'تحاول', 'صغير', 'بخصوص', 'أخبرك', 'الحال', 'بأي', 'نظرة',
  'لأجل', 'الخروج', 'تظن', 'النوم', 'الماضية', 'دكتور', 'المرأة', 'انظري',
  'لمدة', 'وجود', 'الحرب', 'تقلق', 'بلا', 'عرفت', 'ثلاث', 'هلا', 'أدري',
  'اللعين', 'ذهب', 'الا', 'المشكلة', 'الأسبوع', 'الوحيدة', 'كله', 'تعالي',
  'مايكل', 'إنك', 'حاولت', 'دعونا', 'اخرى', 'وشك', 'وسوف', 'عائلة', 'افعل',
  'عدم', 'أخبرتك', 'كثيرا', 'سيدى', 'رئيس', 'فأنا', 'الغرفة', 'وحسب',
  'المساعدة', 'الخارج', 'أعطني', 'اذن', 'سيء', 'العديد', 'أصبحت', 'الطبيب',
  'رسالة', 'خمسة', 'يذهب', 'العشاء', 'الفتيات', 'النساء', 'تحصل', 'نقوم',
  'جيدا', 'يهم', 'بهم', 'الموضوع', 'وفي', 'الممكن', 'اخر', 'الفتى',
  'مباشرة', 'بالأمر', 'أتذكر', 'بيت', 'مايك', 'لأني', 'بطريقة', 'ساعات',
  'حينما', 'فترة', 'الأشخاص', 'نيويورك', 'أراك', 'أنتي', 'اسم', 'قصة',
  'توجد', 'القادمة', 'امرأة', 'فتى', 'افضل', 'حقيقي', 'بواسطة', 'مجنون',
  'زوجتي', 'أهذا', 'متأكدة', 'ذاهب', 'يحصل', 'تحب', 'أتعرف', 'النهاية',
  'مكتب', 'ولن', 'مثلك', 'اننا', 'بالخارج', 'لهذه', 'الحق', 'بلى', 'أصدق',
  'أخر', 'آمل', 'الإطلاق', 'فرانك', 'طلب', 'بدأ', 'لعبة', 'جورج', 'اني',
  'مجموعة', 'أمام', 'الحديث', 'مساعدتك', 'حاول', 'حقيقة', 'جميعا', 'اللقاء',
  'وبعد', 'مدى', 'صورة', 'بأنها', 'سوى', 'التفكير', 'الملك', 'الأخيرة',
  'الثانية', 'فهو', 'تحدث', 'فيما', 'الوضع', 'عدد', 'حفلة', 'ولكني', 'لسنا',
  'تبقى', 'بشيء', 'مدينة', 'كهذا', 'كلها', 'انتهى', 'يحاول', 'نحو', 'أشهر',
  'مثير', 'شركة', 'تفهم', 'اسف', 'الجديدة', 'لكل', 'أصدقاء', 'النوع',
  'الجيد', 'إليها', 'بأني', 'ميت', 'بيننا', 'الرب', 'عملية', 'بيتر',
  'بعضنا', 'القضية', 'وكل', 'أحضر', 'قيد', 'تشارلي', 'أخرج', 'قادم',
  'الواضح', 'دعيني', 'تفضل', 'توم', 'أتيت', 'أسمع', 'تأخذ', 'قول',
  'العائلة', 'بنفسك', 'موعد', 'عندي', 'أثناء', 'ممكن', 'تخبرني', 'الكبير',
  'صاح', 'إنتظر', 'الزواج', 'فعلته', 'ولكنه', 'حبيبتي', 'تذكر', 'أمك',
  'مستحيل', 'اعتقدت', 'مليون', 'علم', 'طلبت', 'ذاك', 'حسن', 'الأخرى',
  'يحتاج', 'تعود', 'الهي', 'زلت', 'نسيت', 'وصلت', 'انتظري', 'نعلم', 'النظر',
  'إذهب', 'أتريد', 'عدة', 'سيحدث', 'ابن', 'الصعب', 'الحظ', 'ألف', 'مساعدة',
  'تصبح', 'سأقوم', 'جين', 'جئت', 'خلف', 'خمس', 'الحقيقي', 'منكم', 'أربعة',
  'القليل', 'يزال', 'الدم', 'إننا', 'أسرع', 'البداية', 'سأعود', 'صعب',
  'بعيدا', 'عرض', 'بكثير', 'وعندما', 'اسمه', 'تفكر', 'آنسة', 'تعتقدين',
  'فقدت', 'مهم', 'يتحدث', 'بتلك', 'لأي', 'بعدها', 'يريدون', 'يعود', 'جاء',
  'أتعلمين', 'ترك', 'المناسب', 'السؤال', 'اكون', 'الآخرين', 'تقصد', 'اتصل',
  'تبدين', 'للعمل', 'معهم', 'التالي', 'شرطة', 'جريمة', 'أبحث', 'توقفي',
  'بنفسي', 'الشمس', 'فكرت', 'يفترض', 'السماء', 'الوصول', 'الجانب', 'أحصل',
  'عشرة', 'معا', 'الداخل', 'أعود', 'المعلومات', 'تحمل', 'أطفال', 'الثاني',
  'هذة', 'ببعض', 'يارجل', 'ماري', 'بكم', 'يعد', 'الأيام', 'أسوأ', 'مشاكل',
  'البحث', 'ستفعل', 'اسمي', 'واضح', 'جهاز', 'الدخول', 'الحلقة', 'قتلت',
  'مستعد', 'يقولون', 'سؤال', 'لأنها', 'فعلا', 'بضعة', 'عما', 'أمس', 'بول',
  'الجزء', 'اقول', 'اللحظة', 'القديمة', 'لويس', 'كرة', 'المخدرات', 'محق',
  'ستة', 'بيل', 'وهذه', 'المستشفى', 'صوت', 'نرى', 'الكلام', 'رجاء', 'سنذهب',
  'وانت', 'قضية', 'كامل', 'أكره', 'الجريمة', 'مختلف', 'خاصة', 'اتفقنا',
  'أخذت', 'انتي', 'خطر', 'قطعة', 'يمكننى', 'طالما', 'زال', 'أأنت', 'مقابل',
  'ماكس', 'عليكم', 'مركز', 'بإمكاني', 'وأن', 'الدكتور', 'القائد', 'بأننا',
  'المنطقة', 'الخطأ', 'أطلب', 'تعيش', 'الاشياء', 'لفترة', 'زوجتك', 'يحب',
  'المعذرة', 'عالم', 'طبيب', 'الفريق', 'الصورة', 'نفسها', 'لكننا',
  'الاتصال', 'حيال', 'والذي', 'جيمي', 'مفهوم', 'وبعدها', 'فلا', 'مختلفة',
  'شعرت', 'الشارع', 'بإمكانك', 'غدا', 'مضحك', 'الطائرة', 'بوب', 'فعلها',
  'ينتهي', 'ولكنني', 'منتصف', 'القانون', 'رأيته', 'هنري', 'أنتظر', 'الهواء',
  'بعمل', 'الكتاب', 'قسم', 'سنكون', 'فيلم', 'أهتم', 'موجود', 'بشدة',
  'القتل', 'ممتاز', 'العثور', 'مرات', 'كثير', 'ابني', 'لطيفة', 'أقسم',
  'الشعور', 'وجه', 'وإذا', 'أولئك', 'إني', 'أجد', 'حوالي', 'قليل', 'حاجة',
  'يعيش', 'إعادة', 'أنتما', 'دليل', 'فإن', 'السنة', 'مازال', 'القاتل',
  'ولقد', 'ميلاد', 'شهر', 'تعلمون', 'السيطرة', 'قوة', 'رحلة', 'ستعمل',
  'أسفل', 'يعتقد', 'زوجي', 'علمت', 'عملي', 'القادم', 'وهل', 'تزال', 'العرض',
  'الصحيح', 'أحمق', 'القصة', 'هراء', 'مساء', 'تركت', 'يموت', 'أنظري',
  'جاهز', 'المكتب', 'تفعلي', 'اخرج', 'محاولة', 'الصور', 'عدت', 'اللعبة',
  'عاد', 'ترغب', 'وكيف', 'اسمك', 'الوغد', 'داني', 'تبحث', 'اسمعي', 'ولكنك',
  'خطة', 'سارة', 'أننى', 'وراء', 'السفينة', 'قائمة', 'وضعت', 'ابي',
  'حقيقية', 'تنظر', 'تود', 'موقع', 'بالكامل', 'مهمة', 'ابدا', 'أطلق',
  'شباب', 'البلدة', 'القهوة', 'أسف', 'المحتمل', 'حينها', 'أرغب', 'راي',
  'مره', 'تخرج', 'مازلت', 'تستطيعين', 'معلومات', 'اشعر', 'أعد', 'انظروا',
  'كوني', 'الفرصة', 'ماهو', 'قلبي', 'الخط', 'الشئ', 'تبا', 'صديقك', 'نيك',
  'مجددا', 'تجد', 'قاتل', 'نجد', 'إيجاد', 'يجعل', 'يصبح', 'نقطة', 'البشر',
  'نظام', 'تبدأ', 'تملك', 'أملك', 'تمت', 'مضى', 'أعرفه', 'أخبر', 'البحر',
  'رؤيتك', 'امي', 'رأسك', 'الأخبار', 'أما', 'يستحق', 'العميل', 'المحكمة',
  'هـذا', 'دعينا', 'تقلقي', 'تغيير', 'الأرجح', 'بالداخل', 'عدا', 'منزلي',
  'القديم', 'خائفة', 'كثيرة', 'للحصول', 'قامت', 'إطلاق', 'المشاكل', 'كلنا',
  'حتي', 'خيار', 'جيمس', 'بماذا', 'أنـا', 'عندها', 'كلما', 'تحرك', 'أجلك',
  'الغد', 'ماتت', 'يتعلق', 'غبي', 'أخبار', 'عائلتي', 'القلب', 'بعيد', 'جعل',
  'الحالة', 'إمرأة', 'أستطع', 'الموسيقى', 'أعلى', 'سبق', 'إلينا', 'ارجوك',
  'القيادة', 'لأننا', 'الشركة', 'العيش', 'البارحة', 'القوة', 'يجدر',
  'منطقة', 'يمكنها', 'بالكاد', 'خاص', 'وظيفة', 'اثنان', 'معنى', 'الطابق',
  'العاهرة', 'القول', 'تحدثت', 'الميلاد', 'عملك', 'النقود', 'قريب', 'أولا',
  'فلن', 'عندك', 'وكنت', 'قلته', 'الأحمق', 'أتى', 'جيم', 'حياته', 'الكبيرة',
  'السابقة', 'صاحب', 'الملابس', 'يبدوا', 'وقال', 'للأبد', 'بنفس', 'أشخاص',
  'وإلا', 'الأمن', 'خائف', 'الأكثر', 'السابق', 'أفعله', 'أخشى', 'السلاح',
  'تموت', 'ولكنها', 'سنفعل', 'لبعض', 'وهم', 'الدماء', 'اثنين', 'أعدك',
  'حفل', 'تريده', 'أسابيع', 'يكونوا', 'الجيش', 'زوجة', 'فهذا', 'أخبرتني',
  'أعتذر', 'ديفيد', 'كلانا', 'سنقوم', 'برنامج', 'فأنت', 'المتحدة', 'سلاح',
  'اللعينة', 'صندوق', 'يديك', 'الكلب', 'لطالما', 'ابتعد', 'الحمام', 'الغير',
  'بني', 'أمريكا', 'الهدف', 'ولد', 'الأخير', 'وجدنا', 'انتم', 'سخيف', 'لمن',
  'احب', 'قطع', 'ثمة', 'بجانب', 'احتاج', 'تقريبا', 'الامور', 'قدم', 'قوية',
  'اظن', 'الحفلة', 'نبدأ', 'غريبة', 'فهم', 'وذلك', 'اعني', 'أراد', 'ظهر',
  'سماع', 'الكفاية', 'الثالث', 'تناول', 'التعامل', 'الانتظار', 'دور',
  'هدية', 'هاه', 'كتاب', 'معى', 'تقل', 'رائحة', 'معظم', 'الفيلم', 'حبيبي',
  'سأتصل', 'بيلي', 'مكانك', 'نعمل', 'لوس', 'الصوت', 'المياه', 'والتي',
  'مثلي', 'أذا', 'شعور', 'الخلف', 'عادة', 'قريبا', 'ألن', 'ابنتي', 'أنكم',
  'المستقبل', 'ويل', 'ميل', 'خرجت', 'إثنان', 'وجهي', 'الهراء', 'رغم',
  'فجأة', 'مثيرة', 'الإتصال', 'أيمكنك', 'والدتك', 'أختي', 'ليسوا',
  'الجميلة', 'المبنى', 'النظام', 'لديكم', 'بقدر', 'هاري', 'نبحث', 'تصل',
  'درجة', 'الرغم', 'بالمناسبة', 'طريقي', 'قادمة', 'السرير', 'وجهك', 'وإن',
  'السيارات', 'المهمة', 'بالله', 'أهلا', 'اذهبي', 'أتصل', 'زوجته', 'القبض',
  'مريض', 'بلدي', 'مـن', 'أخبريني', 'لاحقا', 'الشاب', 'العجوز', 'نعود',
  'الأب', 'مذهل', 'عملت', 'مايرام', 'مارك', 'أحضرت', 'وصل', 'ولو', 'الكرة',
  'يصل', 'موجودة', 'نحصل', 'الثالثة', 'اللعب', 'لكى', 'المسيح', 'استخدام',
  'يفعله', 'محقة', 'فهي', 'تتذكر', 'ارى', 'يملك', 'نخرج', 'تظهر', 'تعد',
  'تجعل', 'الطاقة', 'أريده', 'تتحدثين', 'أشكرك', 'أترى', 'للذهاب', 'واثق',
  'هاي', 'مجنونة', 'جانب', 'القتال', 'القاضي', 'المحقق', 'بطاقة', 'متأخر',
  'شعر', 'ماهذا', 'يظهر', 'مال', 'ساعدني', 'العملية', 'هاتف', 'الأم',
  'يخرج', 'كلارك', 'الموسم', 'يأخذ', 'يعرفون', 'فعلتها', 'وهناك', 'الظلام',
  'الرقص', 'لرؤية', 'الولايات', 'مدرسة', 'نحاول', 'كيفية', 'تمزح', 'أسبوع',
  'تقولين', 'دفع', 'قمنا', 'يجعلك', 'بداية', 'يهتم', 'الغداء', 'لندن',
  'طعام', 'كاملة', 'وربما', 'مزيد', 'شون', 'إحدى', 'المدير', 'ريتشارد',
  'لربما', 'لنفسك', 'ستيف', 'سيتم', 'تتحرك', 'الحيوانات', 'بيتي', 'أتفهم',
  'وسط', 'قلب', 'ملابس', 'الفندق', 'كريس', 'الضوء', 'اللعنه', 'حسب',
  'الرسالة', 'لان', 'الحكومة', 'صديقة', 'كلب', 'قررت', 'مستعدة', 'الأعلى',
  'يدك', 'المهم', 'إسمع', 'الخطة', 'رأس', 'وصلنا', 'أقوله', 'آمن', 'شخصية',
  'اتصلت', 'سمحت', 'جنون', 'يشعر', 'الشيطان', 'يبقى', 'حرب', 'الأسئلة',
  'تهتم', 'بيني', 'أجلي', 'تتكلم', 'تشعرين', 'كنتم', 'ومع', 'روبرت',
  'سأقول', 'الشعر', 'اننى', 'تغير', 'قوله', 'واحده', 'أيمكنني', 'اليك',
  'الأعمال', 'أصدقائي', 'يدي', 'يمكنهم', 'مثلما', 'حصلنا', 'بان', 'بوسعي',
  'بمجرد', 'معكم', 'الرقم', 'طيب', 'رأسي', 'لحم', 'أعيش', 'الغابة', 'جاد',
  'سان', 'تومي', 'تسمع', 'الآنسة', 'أليكس', 'أراهن', 'مسألة', 'القطار',
  'أحسنت', 'التلفاز', 'أرسل', 'بسيط', 'ملك', 'ولماذا', 'شرطي', 'السلامة',
  'جميعنا', 'صور', 'يدعى', 'عظيمة', 'العمر', 'البلاد', 'اردت', 'سرقة',
  'حماية', 'سكوت', 'اليه', 'تقوله', 'جاي', 'تريدني', 'خدمة', 'للبيت',
  'سأخبرك', 'أتعرفين', 'قوي', 'خاطئ', 'وعلى', 'معذرة', 'فتيات', 'رباه',
  'دماء', 'تتوقف', 'اللحم', 'القدم', 'إنتهى', 'قلق', 'قالوا', 'أبدو',
  'بالعمل', 'تاريخ', 'اجلس', 'الضحية', 'باريس', 'فكر', 'الأبيض', 'تنتهي',
  'لنرى', 'الرائع', 'تضع', 'الأسلحة', 'الدفاع', 'حالما', 'بالإضافة',
  'بعضهم', 'أبقى', 'بأمان', 'أثق', 'تظنين', 'التاريخ', 'التالية', 'تسير',
  'الأولاد', 'مساعدتي', 'أمور', 'شراب', 'الألم', 'الأحيان', 'الشاحنة',
  'الكلمات', 'التوقف', 'وداعا', 'اسمها', 'اهلا', 'دان', 'أدخل', 'والتر',
  'امر', 'اتمنى', 'ثمن', 'جاهزة', 'لشخص', 'تقولي', 'جوني', 'حضرة', 'خذي',
  'الكنيسة', 'بناء', 'ستذهب', 'المفضل', 'مشاهدة', 'اكن', 'سيئ', 'صفقة',
  'عمله', 'ألديك', 'القبيل', 'واو', 'بالرغم', 'الصف', 'عاهرة', 'كلير',
  'لكنهم', 'الجلوس', 'السرعة', 'بوبي', 'الشراب', 'موافقة', 'الجميل',
  'الفكرة', 'بالقرب', 'الشخصية', 'القمر', 'آلاف', 'تتصل', 'أتريدين',
  'وكانت', 'كهذه', 'أربع', 'طائرة', 'الثانوية', 'استمع', 'وكذلك', 'مرتين',
  'ستكونين', 'سبعة', 'جيري', 'إتفقنا', 'شارع', 'ميتة', 'يرى', 'بقية',
  'أقدر', 'يجعلني', 'أراه', 'تعرفي', 'زوج', 'الزمن', 'سواء', 'قتله', 'موت',
  'الدرجة', 'لله', 'انتهت', 'دخلت', 'للخروج', 'صنع', 'أمل', 'طبيعي',
  'السلام', 'شراء', 'فرقة', 'السادة', 'الترجمة', 'تدخل', 'الكل', 'نصل',
  'فندق', 'الصندوق', 'شكل', 'منزلك', 'أقرب', 'الحقيقية', 'الرئيسي', 'زوجك',
  'أعمال', 'مشغول', 'حامل', 'يارفاق', 'تفعلينه', 'التحكم', 'ولهذا', 'مناسب',
  'قاموا', 'أبى', 'الشباب', 'يمكنكم', 'تقدم', 'الأسود', 'زمن', 'خير',
  'تطلب', 'يبدأ', 'باب', 'والدتي', 'صديقتي', 'عائلتك', 'يومين', 'روز',
  'كابتن', 'سهل', 'خطير', 'بشأنه', 'الرحيل', 'كارل', 'أتوقع', 'النجدة',
  'يبحث', 'غاضبة', 'توماس', 'يوما', 'تعرفه', 'الافضل', 'يقتل', 'طول', 'إما',
  'وحدة', 'سيارتي', 'توني', 'دين', 'المفتاح', 'الضغط', 'أقوى', 'موافق',
  'الرحلة', 'وجد', 'تلعب', 'ببساطة', 'إعتقدت', 'نوعا', 'قادر', 'طريقه',
  'ذاهبة', 'تكذب', 'دخل', 'كنتي', 'أقدم', 'مجلس', 'جيني', 'الخطب', 'توقفوا',
  'عطلة', 'نادي', 'حياتنا', 'للقيام', 'مـا', 'ماهي', 'عمي', 'بضع',
  'الإنتظار', 'مجال', 'عميل', 'ترين', 'منى', 'المسدس', 'كايل', 'ليلي',
  'مدير', 'لعين', 'الشهر', 'للحظة', 'قرأت', 'داعي', 'إبن', 'الجو', 'محطة',
  'افكر', 'تأكيد', 'سيأتي', 'الأبد', 'قيمة', 'بدا', 'الأصدقاء', 'فتح',
  'وكأنه', 'الزفاف', 'فمن', 'آخذ', 'لأحد', 'الطاولة', 'خطوة', 'تمانع',
  'بالأمس', 'وقعت', 'عقد', 'بإمكاننا', 'والد', 'للهول', 'ثمانية', 'العظيم',
  'السيدات', 'قائد', 'الحالي', 'يتوجب', 'شاب', 'فيك', 'تقرير', 'سبيل',
  'الخوف', 'الموقع', 'الحدود', 'لوك', 'شخصا', 'النافذة', 'تنتظر', 'كيم',
  'اقصد', 'أفترض', 'رأيتها', 'الملازم', 'لمعرفة', 'تستخدم', 'يفعلون',
  'الأحمر', 'الكلمة', 'صعبة', 'ذكر', 'تحديد', 'خرج', 'ريد', 'ابقى',
  'التحقيق', 'حركة', 'فيل', 'الفضاء', 'غاضب', 'جوي', 'للخارج', 'توقفت',
  'الثلج', 'جيده', 'أتعتقد', 'علامة', 'تقصدين', 'قديم', 'اقوم', 'لفعل',
  'موضوع', 'الشاي', 'آنا', 'أسئلة', 'الجثة', 'العلاج', 'حادث', 'أتساءل',
  'الغبي', 'محظوظ', 'لابأس', 'القدر', 'تستحق', 'احاول', 'الرأس', 'تحركوا',
  'الأمريكية', 'مفاجأة', 'الفوضى', 'المطبخ', 'الجامعة', 'متن', 'محل',
  'جدتي', 'تذهبي', 'قليلة', 'ذالك', 'وحتى', 'النجوم', 'قلقة', 'دانيال',
  'بنفسه', 'لأنهم', 'ابنك', 'يقومون', 'تحتاجين', 'يعجبني', 'أسألك',
  'الفيديو', 'جدي', 'السحر', 'تفضلي', 'شديد', 'فسوف', 'الداخلية', 'أولاد',
  'بأكمله', 'آلة', 'نقول', 'تعالى', 'تفقد', 'النبيذ', 'مكالمة', 'فعلنا',
  'تشارلز', 'إشارة', 'الشكل', 'مستوى', 'النهر', 'قدر', 'المراقبة', 'غادر',
  'فمك', 'أغنية', 'حقيبة', 'ستقوم', 'البيض', 'الغريب', 'مكتبي', 'قهوة',
  'يهمني', 'عضو', 'اسفة', 'موقف', 'أنحاء', 'بأمر', 'أكل', 'بطل', 'السنوات',
  'وقالت', 'بارد', 'آتي', 'نفعله', 'الاسبوع', 'رأى', 'كتب', 'كيت', 'أغلق',
  'تدفع', 'بالمنزل', 'رؤيته', 'هيه', 'قصيرة', 'بأنهم', 'قلبك', 'الولد',
  'الثلاثة', 'تسمح', 'ذكي', 'أموت', 'أطول', 'إنقاذ', 'مقابلة', 'افتح',
  'ولكننا', 'مارتن', 'وسيلة', 'فـي', 'لاشيء', 'قادرة', 'رأسه', 'البريد',
  'الليله', 'جثة', 'مصدر', 'سفينة', 'قديمة', 'الحقيبة', 'نقل', 'عقلك',
  'ترتدي', 'ملايين', 'كاثرين', 'لعب', 'سريع', 'الكلاب', 'أضع', 'المحيط',
  'مطعم', 'ليو', 'للجميع', 'الوجه', 'بسهولة', 'لون', 'الضابط', 'الاطفال',
  'جعلت', 'الصيف', 'ماء', 'اتصال', 'يحمل', 'بسيطة', 'زالت', 'بربك', 'لدرجة',
  'سأحضر', 'فلم', 'روح', 'أخبره', 'الكاميرا', 'أخبرت', 'وجهه', 'أترك',
  'شاهد', 'بصراحة', 'كذبت', 'كفاية', 'غادرت', 'البرنامج', 'الأسفل', 'فإنه',
  'متجر', 'يشبه', 'لانه', 'جرى', 'كارتر', 'آسفه', 'مضت', 'إنتظري', 'وقتك',
  'الجزيرة', 'مدة', 'أعتقدت', 'مسرح', 'الكون', 'قولي', 'القرار', 'كلهم',
  'إسم', 'اول', 'يدخل', 'القدوم'
]);

// The bar a word has to clear to count as Arabic. See AR_BIGRAMS.
const AR_SURE = 0.45;

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
  // The English dictionary, before any of this language's own evidence.
  //
  // Every one of these checks consulted EN_WORDS, which holds a few hundred
  // words, and none of them consulted EN_LEXICON, which holds 8,625. So
  // "entitlement", "guilty", "rugby", "truck" and the rest of ordinary
  // written English were invisible to every language but Hebrew, and Korean
  // in particular returns true on any token that falls out as four clean
  // syllables — "entitlement" became 두샤시드둣 on its own, in the middle of a
  // sentence about entitlement.
  //
  // It goes above this language's own word list on purpose. A word the
  // English dictionary knows and the foreign list also claims is a word the
  // foreign list should not have: that is what the eleven exclusions inside
  // unmistakablyEnglish are for, and they are the cases where the two
  // genuinely collide.
  if (!ALSO_A_WORD.ar.has(lower) && unmistakablyEnglish(lower)) return false;
  const mapped = [...lower].map(c => EN_TO_AR[c]);
  if (!mapped.every(c => c !== undefined)) return false;
  const arWord = mapped.join('');
  // Known word first, for the same reason as the Russian check above.
  if (COMMON_AR_WORDS.has(arWord)) return true;
  if (englishScore(lower) >= 0.35) return false;
  return arabicScore(arWord) >= AR_SURE;
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

// Scored without accents, because Greek accents almost every word and the
// bigram list above has none. στείλω scored 0.20 and στειλω scores 0.40;
// κάνεις 0.40 against κανεις 0.80. The gate is 0.5, so the accent was the
// difference between recognising an ordinary Greek word and not — which is
// why Greek converted 7 of its 22 corpus sentences whole and Hebrew converted
// 31 of 32. It was never about Greek being harder.
function greekScore(word) {
  const s = stripTonos(word).toLowerCase();
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
  // The English dictionary, before any of this language's own evidence.
  //
  // Every one of these checks consulted EN_WORDS, which holds a few hundred
  // words, and none of them consulted EN_LEXICON, which holds 8,625. So
  // "entitlement", "guilty", "rugby", "truck" and the rest of ordinary
  // written English were invisible to every language but Hebrew, and Korean
  // in particular returns true on any token that falls out as four clean
  // syllables — "entitlement" became 두샤시드둣 on its own, in the middle of a
  // sentence about entitlement.
  //
  // It goes above this language's own word list on purpose. A word the
  // English dictionary knows and the foreign list also claims is a word the
  // foreign list should not have: that is what the eleven exclusions inside
  // unmistakablyEnglish are for, and they are the cases where the two
  // genuinely collide.
  if (!ALSO_A_WORD.el.has(lower) && unmistakablyEnglish(lower)) return false;
  if (![...lower].every(c => EN_TO_EL[c] !== undefined)) return false;
  const elWord = convertToGreek(lower);
  if (COMMON_EL_WORDS_PLAIN.has(stripTonos(elWord))) return true;
  // A semicolon inside a word is the Greek equivalent of a final-form letter in
  // the wrong place. On the Greek layout that key is the accent, and Greek
  // accents almost everything, while English never puts a semicolon mid-word.
  // στείλω is "ste;ilv" and scores 0.40 against a 0.5 gate; αρχείο, κλείσει,
  // δρόμο and κέντρο all failed the same way. The bigram table will never cover
  // every Greek word. The accent is not a guess.
  if (/[a-z];[a-z]/i.test(lower)) return true;
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

// Korean word stems, for the solo rule below.
//
// koSoloRun admitted any token that fell out as four clean syllables, with no
// dictionary of any kind — length was the whole test. Measured against a
// 370,105-word English dictionary: 470 ordinary English words fired as Korean
// on their own, 97% of every single-word false positive this extension had.
// "abditory" is 뮤야새교, "absorbancy" is 뮤내규무쵸.
//
// Korean is agglutinative, so a list of whole words cannot carry this: 보냈습니다
// and 보내 are the same verb. Stems of two and three syllables, matched
// against the front of the word, cover the inflections a list never would.
//
// The top 10,000 words of a subtitle frequency corpus, those of three
// syllables or fewer: 7740 stems. Measured, the whole rule end to end — false
// positives 470 to 3, and recall goes *up*, because the list admits three and
// four-syllable words the old length test refused.
// The polite endings. Korean inflects at the tail, and a stem list cannot
// reach past it: 반갑습니다 and 기다리겠습니다 are ordinary things to type and
// neither stem survives into a frequency list. Measured, these cost no false
// positives at all and recover seven corpus tokens the stems alone miss.
// 니다 rather than 습니다 and 입니다 separately: it also covers 합니다, which
// 가능합니다 ends in and neither of the longer two reaches. Measured, the
// shorter form costs no false positives over the longer ones.
const KO_ENDINGS = ['니다', '세요', '해요', '어요', '아요', '예요', '네요', '군요'];

const KO_STEMS = new Set('가거라 가게 가게에 가겠어 가격을 가격이 가고 가기 가기로 가길 가까운 가까워 가까이 가끔 가끔씩 가끔은 가나 가난한 가네 가는 가는게 가는데 가는지 가능성 가능한 가능할 가능해 가니 가던 가도 가도록 가동 가득 가득찬 가득한 가든 가라 가라고 가려고 가렴 가르쳐 가리고 가만 가만히 가면 가문의 가방 가방에 가방을 가방이 가버려 가벼운 가볍게 가보자 가본 가볼게 가봐 가봐야 가봐요 가서 가세 가세요 가수 가스 가슴 가슴에 가슴을 가슴이 가시면 가시죠 가실 가야 가야돼 가야죠 가야지 가야할 가야해 가요 가운데 가자 가자고 가자구 가장 가정 가정을 가져 가져가 가져간 가져갈 가져다 가져도 가져온 가져올 가져와 가졌어 가족 가족과 가족도 가족들 가족에 가족은 가족을 가족의 가족이 가죠 가죽 가지 가지게 가지고 가지는 가지러 가지를 가지마 가지만 가진 가질 가짜 가치 가치가 가치를 각각 각각의 각자 각자의 각하 간다 간다고 간다는 간다면 간단한 간단해 간단히 간신히 간에 간을 간의 간이 간절히 간호사 갇혀 갇힌 갈거야 갈게 갈게요 갈까 갈까요 갈께 갈래 갈래요 갈색 갈수록 갈아 갈지 감각이 감고 감기 감당할 감독 감사 감사를 감시 감시를 감아 감염 감염된 감염이 감옥 감옥에 감자 감정 감정에 감정은 감정을 감정이 감히 갑니다 갑시다 갑자기 값을 갔고 갔나 갔는데 갔는지 갔다 갔다가 갔다고 갔던 갔어 갔어요 갔었어 갔을 갔죠 갔지 강도 강력한 강아지 강에 강을 강제로 강철 강하게 강하고 강한 강해 갖게 갖고 갖는 갖다 갖지 같거든 같고 같구나 같군 같군요 같기도 같긴 같나 같나요 같네 같네요 같니 같다 같다고 같다는 같던데 같소 같아 같아서 같아요 같았다 같았어 같았죠 같았지 같애 같으니 같으면 같은 같은거 같은건 같은걸 같은게 같은데 같을 같이 같잖아 같죠 같지 같지는 같지만 같진 개가 개나 개는 개를 개리 개새끼 개소리 개시 개야 개의 개인 개자식 걔가 걔네 걔네가 걔는 걔도 걔들 걔들은 걔들이 걔랑 걔를 걔한테 거거든 거겠죠 거겠지 거고 거고요 거구나 거구요 거군 거군요 거기 거기가 거기다 거기로 거기서 거기선 거기에 거기엔 거긴 거길 거꾸로 거나 거냐 거냐고 거네 거네요 거는 거니 거니까 거다 거대 거대한 거라 거라고 거라곤 거라구 거라는 거라도 거라면 거란 거란다 거랑 거래 거래가 거래는 거래를 거래요 거로 거리 거리가 거리는 거리를 거리에 거면 거봐 거시기 거야 거에 거에요 거여 거였어 거였죠 거예요 거요 거울 거울을 거의 거인 거잖아 거죠 거지 거지만 거짓 거짓말 거친 걱정 걱정돼 걱정마 걱정은 걱정을 걱정이 걱정할 건가 건가요 건강 건강한 건너 건데 건데요 건들지 건물 건물에 건물을 건배 건요 건은 건지 건지도 걷고 걷는 걸고 걸까 걸까요 걸려 걸려서 걸려요 걸렸어 걸로 걸리는 걸리면 걸리지 걸린 걸릴 걸세 걸어 걸어서 걸어요 걸었어 걸요 걸을 걸지 걸지도 걸쳐 검사 검사가 검사는 검사를 검은 검을 겁나 겁니까 겁니다 겁먹지 겁에 겁을 겁이 겁쟁이 것과 것도 것도요 것들 것들에 것들은 것들을 것들이 것만 것보다 것보단 것에 것으로 것은 것을 것의 것이 것이고 것이다 것이며 것이야 것이오 것이죠 것이지 것인가 것인지 것일 것처럼 게다가 게만 게요 게이 게임 게임에 게임은 게임을 게임이 겠네요 겠어 겠어요 겨우 겨울 겪고 겪는 겪은 견딜 결과 결과가 결과는 결과를 결과에 결국 결국엔 결국은 결정 결정에 결정은 결정을 결정이 결정할 결정해 결코 결혼 결혼식 결혼은 결혼을 결혼이 결혼한 결혼할 결혼해 경고 경고를 경관 경관님 경기 경기가 경기를 경력을 경보 경비 경비를 경우 경우가 경우는 경우에 경우엔 경찰 경찰에 경찰은 경찰을 경찰의 경찰이 경험을 경험이 곁에 곁을 계단 계단을 계란 계산 계세요 계셔 계속 계속해 계시는 계시죠 계신 계실 계약 계약을 계획 계획도 계획에 계획은 계획을 계획이 고개 고개를 고객 고객이 고급 고기 고기를 고대 고든 고래 고른 고마워 고맙게 고맙군 고맙네 고맙다 고맙소 고문 고스트 고양이 고용한 고작 고장 고쳐 고치고 고칠 고통 고통은 고통을 고통이 고향 고향에 곡을 곤경에 곧바로 곧장 골든 골라 골치 골프 곳도 곳에 곳에서 곳으로 곳은 곳을 곳의 곳이 곳이야 곳이죠 곳이지 공간 공간을 공간이 공격 공격을 공격이 공격할 공격해 공기 공기가 공기를 공동 공부 공부를 공식 공연 공연을 공원 공원에 공을 공이 공장 공주 공주님 공짜 공짜로 공포 공항 과거 과거는 과거로 과거를 과거에 과거의 과연 과자 과장님 과정을 과학 관계 관계가 관계는 관계를 관계에 관련 관련된 관련이 관리 관심 관심도 관심을 관심이 관을 관한 관해 관해서 광고 광대 광산 괜찮고 괜찮나 괜찮네 괜찮니 괜찮다 괜찮아 괜찮은 괜찮을 괜찮지 괜한 괜히 괴물 괴물을 괴물이 굉장한 굉장해 굉장히 교도소 교수 교수님 교육 교육을 교통 교회 교회에 교훈을 구경 구급차 구나 구두 구름 구멍 구멍을 구멍이 구역 구역을 구조 구하고 구하기 구하는 구하러 구하지 구한 구할 구해 구해야 구했어 국가 국경 국장님 국제 군대 군대가 군대는 군대를 군대에 군사 군요 군은 군이 군인 군인이 굳게 굳이 굴어 굴지 궁금한 궁금해 권력을 권리 권리가 권리를 권한을 권한이 귀가 귀를 귀신 귀에 귀여운 귀여워 귀엽다 귀찮게 규칙 규칙은 규칙을 규칙이 균형을 그가 그거 그거면 그거야 그거에 그건 그걸 그걸로 그것 그것도 그것만 그것에 그것은 그것을 그것이 그것참 그게 그곳에 그곳을 그나마 그날 그냥 그녀 그녀가 그녀는 그녀도 그녀를 그녀에 그녀와 그녀의 그년 그녈 그놈 그놈들 그놈은 그놈을 그놈의 그놈이 그는 그니까 그다지 그닥 그대 그대가 그대는 그대로 그대를 그대의 그도 그동안 그들 그들과 그들도 그들은 그들을 그들의 그들이 그딴 그때 그때가 그때는 그땐 그래 그래도 그래서 그래야 그래요 그랜드 그랜트 그랬나 그랬던 그랬어 그랬을 그랬죠 그랬지 그러게 그러고 그러곤 그러기 그러길 그러나 그러냐 그러네 그러는 그러니 그러다 그러면 그러셔 그러실 그러자 그러죠 그러지 그런 그런가 그런거 그런건 그런걸 그런것 그런게 그런데 그런지 그럴 그럴게 그럴까 그럴수 그럼 그럼요 그렇게 그렇고 그렇군 그렇긴 그렇네 그렇다 그렇소 그렇죠 그렇지 그렇진 그레이 그레타 그렉 그려 그룹 그를 그리 그리고 그리곤 그리워 그린 그림 그림을 그림이 그림자 그만 그만둬 그만들 그만큼 그만해 그말은 그보다 그분 그분은 그분을 그분의 그분이 그사람 그애가 그야 그에 그에게 그와 그의 그이 그이가 그이는 그자가 그저 그전에 그죠 그중 그지 그쪽 그쪽은 그쪽이 그쵸 그치 그치만 극장 근데 근무 근사한 근처 근처에 글렌 글로리 글쎄 글쎄요 글을 금고 금발 금방 금속 금요일 금을 금지 급하게 급한 기가 기계 기계가 기계를 기꺼이 기능을 기다려 기다릴 기대 기도 기도를 기록 기록에 기록은 기록을 기록이 기를 기름 기미갤 기밀 기본 기분 기분은 기분을 기분이 기뻐 기뻐요 기쁘게 기쁜 기쁨을 기사 기사가 기사를 기술 기술을 기술이 기어 기억 기억나 기억도 기억에 기억은 기억을 기억이 기억할 기억해 기운 기운이 기자 기저귀 기적을 기적이 기지 기지에 기차 기차를 기타 기회 기회가 기회는 기회도 기회를 기회야 긴급 긴장 긴장을 길게 길고 길로 길어 길에 길에서 길은 길을 길이 길이야 김에 깁스 깊게 깊은 깊이 까지 깜짝 깨고 깨끗이 깨끗한 깨닫게 깨어 꺼내 꺼내서 꺼내지 꺼낼 꺼야 꺼져 꼬마 꼬마가 꼬마야 꼬맹아 꼬맹이 꼴을 꼴이 꼼짝 꼼짝마 꽃을 꽤나 꾸미고 꾸민 꿇고 꿇어 꿈꾸는 꿈도 꿈에 꿈에서 꿈은 꿈을 꿈의 꿈이 꿈이야 꿨나 끄고 끄는 끊어 끌고 끌어 끔찍한 끔찍해 끝까지 끝나 끝나고 끝나는 끝나면 끝나지 끝난 끝날 끝났다 끝났어 끝내 끝내고 끝내야 끝내줘 끝낼 끝에 끝을 끝이 끝이야 끼고 나가 나가게 나가고 나가는 나가면 나가서 나가야 나가요 나가자 나가지 나간 나간다 나갈 나갔다 나갔어 나같은 나게 나고 나기사 나까지 나나 나네 나누고 나눌 나눠 나는 나는데 나니까 나더러 나도 나도야 나두 나라 나라가 나라고 나라는 나라를 나라면 나라에 나라의 나랑 나를 나름 나리 나만 나만의 나머지 나머진 나면 나무 나무가 나무를 나무에 나보고 나보다 나빠 나쁘게 나쁘지 나쁘진 나쁜 나쁠 나서 나서는 나선 나아 나아요 나아질 나야 나에 나에게 나에겐 나오게 나오고 나오는 나오면 나오지 나온 나온다 나올 나와 나와라 나와서 나와요 나왔다 나왔어 나요 나은 나을 나의 나이 나이가 나이를 나이에 나이트 나중에 나지 나처럼 나치 나타나 나타난 나타날 나탈리 나하고 나한테 나한텐 낚시 난다 날개 날개를 날도 날려 날씨 날씨가 날에 날은 날을 날이 날이야 날짜를 낡은 남겨 남기고 남기지 남긴 남는 남들이 남부 남성 남아 남아서 남았다 남았어 남은 남을 남의 남자 남자가 남자는 남자도 남자들 남자랑 남자로 남자를 남자야 남자에 남자와 남자의 남지 남쪽 남편 남편과 남편은 남편을 남편의 남편이 납치 낫게 낫네 낫다고 낫지 났네 났어 났어요 낭비 낮은 낮잠 낮춰 낯선 낳고 낳을 내가 내게 내게서 내겐 내고 내기 내내 내년에 내놔 내는 내려 내려가 내려놔 내려야 내려와 내려요 내로 내리고 내리는 내리지 내린 내릴 내말 내말은 내면 내버려 내보내 내부 내서 내셔널 내야 내에 내요 내용은 내용을 내용이 내일 내일은 내일이 내지 낸시 냄새 냄새가 냄새를 냈어 너가 너같은 너까지 너나 너네 너넨 너는 너도 너라면 너랑 너를 너만 너머로 너무 너무나 너보다 너야 너에 너에게 너와 너의 너처럼 너한테 너한텐 너희 너희가 너희는 너희도 너희들 너희를 너희의 너흰 너흴 넓은 넘게 넘겨 넘는 넘어 넘어갈 넘치는 넣고 넣는 넣어 넣어서 넣었어 넣으면 넣은 넣을 네가 네게 네겐 네놈 네놈이 네드 네이단 네이트 넥타이 녀석 녀석들 녀석은 녀석을 녀석의 녀석이 년간 년은 년을 년이 노는 노란 노래 노래가 노래는 노래를 노력 노력은 노력을 노력이 노력해 노리고 노리는 노먼 노아 녹색 녹음 놀고 놀라게 놀라운 놀라워 놀라지 놀란 놀랄 놀랐어 놀러 놀아 놀이 놀자 놈도 놈들 놈들은 놈들을 놈들의 놈들이 놈아 놈은 놈을 놈의 놈이 놈이야 농담 농담이 농장 높게 높은 높이 놓고 놓으면 놓은 놓을 놓지 놓쳤어 놓치고 놓치면 놓치지 놓친 놓칠 놔두고 놔두지 놔둘 놔요 놔줘요 놨어 놨어요 뇌가 뇌를 뇌에 뇌의 누가 누구 누구나 누구냐 누구니 누구도 누구든 누구랑 누구를 누구야 누구와 누구요 누구의 누구죠 누구지 누군가 누군데 누군지 누굴 누나 누나가 누나는 누르고 누르면 누워 누워서 눈도 눈물 눈물이 눈에 눈엔 눈으로 눈은 눈을 눈이 눈치 눌러 뉴스 뉴스를 뉴스에 뉴욕 뉴욕에 느껴 느껴져 느꼈어 느끼게 느끼고 느끼는 느끼지 느낀 느낄 느낌 느낌을 느낌이 늑대 늙은 능력 능력을 능력이 늦게 늦어서 늦었어 늦은 늦지 니가 니나 니네 니들 니들이 니키 닉은 닉이 다가 다같이 다녀 다녀요 다는 다니고 다니는 다니엘 다니지 다닐 다들 다루는 다룰 다르게 다르죠 다르지 다른 다른데 다를 다름 다리 다리가 다리는 다리를 다리에 다만 다물고 다물어 다섯 다수의 다시 다시는 다신 다야 다양한 다에요 다예요 다요 다음 다음날 다음에 다음엔 다음은 다쳤어 다치게 다치지 다친 다칠 다크 다하고 다해 다했어 다행히 닥쳐 닥쳐요 닥치고 닥터 단단히 단서가 단서를 단순한 단순히 단어 단어가 단어를 단지 닫고 닫아 달걀 달고 달라 달라고 달라요 달라질 달러 달러가 달러를 달려 달렸어 달리 달리고 달리는 달린 달에 달이 달콤한 닮았어 닮은 담긴 담당 담배 담배를 담아 담요 답은 답을 답이 당겨 당분간 당시 당신 당신과 당신께 당신네 당신도 당신들 당신만 당신에 당신은 당신을 당신의 당신이 당연한 당연히 당장 당장은 당하고 당하는 당한 당할 당했어 대가로 대가를 대고 대기 대니 대니가 대단한 대단해 대단히 대답 대답은 대답을 대답이 대답할 대답해 대동맥 대략 대령 대령님 대령이 대로 대마초 대박 대부분 대사 대상이 대신 대신에 대위 대위님 대장 대장님 대지 대체 대충 대통령 대학 대학교 대학에 대한 대해 대해서 대해선 대형 대화 대화가 대화는 대화를 대화할 대회 댁에 댁이 댄버스 댄스 댓가를 더그 더는 더러운 더러워 더럽게 더블 더요 더욱 더이상 더한 덕분에 덕에 던져 던피 덤벼 덩치 데가 데는 데니 데니스 데도 데렉 데려 데려가 데려갈 데려다 데려온 데려올 데려와 데로 데리고 데리러 데릭 데릭은 데릭이 데릴 데서 데에 데이 데이브 데이빗 데이지 데이터 데이트 도나 도니 도대체 도둑 도련님 도로 도로를 도리 도리가 도망 도망가 도망갈 도망쳐 도망친 도망칠 도서관 도시 도시가 도시는 도시로 도시를 도시에 도시의 도와 도와야 도와줄 도와줘 도우러 도울 도움 도움도 도움은 도움을 도움이 도저히 도중에 도착 도착할 독수리 독을 독이 독일 독특한 돈도 돈만 돈으로 돈은 돈을 돈이 돌고 돌려 돌려줘 돌리고 돌릴 돌볼 돌봐 돌아 돌아가 돌아갈 돌아서 돌아온 돌아올 돌아와 돌을 돕게 돕고 돕는 돕지 동네 동네에 동료 동료가 동무 동물 동물을 동물이 동생 동생아 동생은 동생을 동생이 동시에 동안 동안에 동안은 동영상 동의 동의해 동일한 동전 동쪽 돼가 돼서 돼야 돼요 돼죠 돼지 됐고 됐구나 됐군 됐군요 됐나 됐나요 됐네 됐네요 됐는데 됐는지 됐니 됐다 됐다고 됐든 됐소 됐어 됐어요 됐을 됐잖아 됐죠 됐지 되거든 되게 되겠군 되겠나 되겠네 되겠다 되겠어 되겠죠 되겠지 되고 되기 되길 되나 되나요 되네 되네요 되는 되는거 되는게 되는데 되는지 되니 되니까 되다니 되도록 되돌려 되돌릴 되려고 되려면 되면 되서 되세요 되어 되어서 되어야 되었고 되었다 되었어 되었을 되었죠 되었지 되요 되잖아 되죠 되지 되지만 되진 되찾을 된거 된거야 된거죠 된거지 된다 된다고 된다는 된다면 된단다 된대 될거 될거야 될걸 될까 될까요 될꺼야 될지 될지도 됩니까 됩니다 됬어 두가지 두개 두개골 두개의 두고 두는 두들겨 두려운 두려움 두려워 두렵지 두면 두명의 두번 두번째 두분 두세요 두지 둘다 둘러 둘만 둘은 둘을 둘의 둘이 둘이서 둘째 둬요 뒤로 뒤를 뒤에 뒤에서 뒤엔 뒤집어 드네요 드는 드는데 드디어 드라마 드래곤 드레스 드려 드려요 드론 드류 드리고 드리죠 드릴 드멜자 드문 드세요 든다 듣게 듣고 듣기 듣는 듣지 들게 들고 들려 들려요 들리나 들리는 들리지 들릴 들면 들어 들어가 들어간 들어갈 들어라 들어본 들어봐 들어서 들어야 들어온 들어올 들어와 들어요 들었고 들었나 들었네 들었다 들었던 들었어 들었을 들었죠 들었지 들으니 들으면 들은 들을 들지 듯이 듯한 등등 등에 등을 디트 딜런 따님이 따뜻한 따라 따라가 따라서 따라야 따라와 따로 따르는 따르면 따르지 따른 따를 따위 따위는 따윈 딱히 딸과 딸도 딸아 딸에게 딸은 딸을 딸의 딸이 딸이야 땅에 땅에서 땅을 땅이 때가 때까지 때까진 때나 때는 때도 때때로 때려 때로는 때론 때를 때리고 때마다 때만 때면 때문에 때문이 때보다 때부터 때야 때에 때요 때의 때처럼 땜에 떠나 떠나게 떠나고 떠나기 떠나는 떠나면 떠나서 떠나야 떠나요 떠나지 떠난 떠날 떠났어 떠도는 떨고 떨어져 떨어진 떨어질 또는 또다른 또다시 또한 똑같아 똑같은 똑같이 똑똑한 똑똑해 똑똑히 똑바로 똥을 뚫고 뚱뚱한 뛰고 뛰는 뛰어 뛰어난 뛰어요 뜨거운 뜨고 뜻대로 뜻은 뜻을 뜻이 뜻이야 뜻이죠 뜻이지 뜻인지 라고 라그나 라는 라니 라디오 라이언 라이온 라이트 라일리 랄프 래리 램퍼트 러셀 러시아 런던 런던에 레너드 레드 레베카 레슬리 레이 레이첼 레일라 레지 렉시 로건 로니 로드 로라 로레인 로렌스 로리 로마 로버트 로봇 로비 로빈 로빈스 로스 로스가 로이 로저 로즈 로지타 로켓 론다 롤로 루디 루시 루시퍼 루이 루이스 루카스 루크 루크가 루크는 리가 리더 리드 리디아 리무 리무야 리사 리즈 리지 리차드 리처드 리치 리코 리코야 리틀 린다 릴리 릴리가 릴리는 릴리를 릴리야 마가렛 마구 마냥 마녀 마누라 마님 마다 마담 마당에 마디 마라 마렴 마르코 마르타 마른 마리 마리아 마무리 마법 마법사 마법을 마법의 마법이 마사지 마세요 마셔 마셔요 마셨어 마술 마스크 마스터 마시고 마시는 마시러 마시면 마시오 마시지 마신 마실 마실래 마약 마약을 마요 마을 마을로 마을에 마을을 마을의 마을이 마음 마음껏 마음도 마음에 마음은 마음을 마음의 마음이 마이 마이크 마이클 마이키 마일 마일스 마저 마지막 마치 마치고 마침 마침내 마커스 마크 마크가 마크는 마티 마틴 막고 막기 막는 막아 막아야 막을 막지 만나 만나게 만나고 만나기 만나는 만나러 만나면 만나서 만나야 만나요 만나자 만나지 만난 만날 만났던 만났어 만났을 만났죠 만났지 만드는 만든 만들 만들고 만들기 만들면 만들어 만들죠 만들지 만세 만약 만약에 만에 만일 만지지 만큼 만큼은 만한 많고 많네 많네요 많다 많아 많아서 많아요 많은 많은걸 많은데 많을 많이 많이요 많잖아 많죠 많지 말거라 말게 말고 말고는 말고도 말고요 말구 말구요 말대로 말도 말든 말들을 말라 말라고 말라구 말라는 말란 말려 말로 말로는 말만 말씀 말씀은 말씀을 말씀이 말씀해 말아 말아라 말아야 말아요 말아줘 말야 말어 말에 말예요 말은 말을 말이 말이군 말이나 말이냐 말이네 말이다 말이야 말이여 말이오 말이요 말이죠 말이지 말인가 말인데 말인지 말일세 말자 말자고 말좀 말처럼 말콤 말하게 말하고 말하기 말하길 말하는 말하면 말하죠 말하지 말한 말한게 말한다 말할 말할게 말해 말해도 말해봐 말해서 말해야 말해요 말해준 말해줄 말해줘 말했다 말했던 말했어 말했을 말했죠 말했지 맘대로 맘에 맘이 맙소사 맛을 맛이 맛있게 맛있는 맛있어 망가진 망쳤어 망치고 망치지 망친 망칠 망할 망했어 맞게 맞고 맞나 맞나요 맞네 맞는 맞다 맞다고 맞다면 맞서 맞아 맞아서 맞아요 맞았어 맞어 맞으면 맞은 맞을 맞잖아 맞죠 맞지 맞춰 맞춰서 맡게 맡겨 맡고 맡기고 맡아 맡은 맡을 맡을게 맡지 매기 매년 매니 매니가 매니는 매니야 매달 매디슨 매번 매우 매일 매주 매튜 매티 맥박이 맥스 맥주 맨날 맹세코 맹세해 머리 머리가 머리는 머리도 머리를 머리에 머릴 머물 머시 머피 먹게 먹고 먹기 먹는 먹어 먹어도 먹어라 먹어야 먹어요 먹었어 먹여 먹으러 먹으면 먹은 먹을 먹을래 먹이를 먹자 먹지 먼로 먼저 멀리 멀리서 멀어 멀지 멀쩡한 멀쩡해 멈추게 멈추고 멈추면 멈추지 멈출 멈춰 멈춰라 멈춰야 멈춰요 멈췄어 멋대로 멋있어 멋져 멋져요 멋지게 멋지군 멋지네 멋지다 멋지지 멋진 멋진데 멍청아 멍청이 멍청한 메리 메세지 메스 메시지 메이 메이브 메이슨 메인 멕시코 며칠 면에서 명단에 명도 명령 명령에 명령을 명령이 명만 명심해 명예를 명은 명을 명의 명이 명이나 몇가지 몇개 몇년 몇몇 몇몇은 몇시간 모건 모니카 모니터 모델 모두 모두가 모두는 모두들 모두를 모두의 모든 모든걸 모든게 모래 모르게 모르고 모르는 모르니 모르죠 모르지 모른 모른다 모를 모를까 모리스 모세 모습 모습은 모습을 모습이 모시고 모아 모양 모여 모여서 모인 모자 모자를 모조리 모험을 모헨조 목사님 목소리 목숨 목숨을 목숨이 목에 목요일 목을 목이 목적은 목적을 목적이 목표 목표가 목표는 목표를 몰고 몰라 몰라도 몰라서 몰라요 몰랐네 몰랐다 몰랐던 몰랐어 몰랐지 몰래 몰리 몸도 몸에 몸에서 몸으로 몸은 몸을 몸의 몸이 몹시 못되게 못된 못봤어 못생긴 못하게 못하고 못하는 못하면 못하죠 못하지 못한 못한다 못할 못해 못해서 못해요 못했다 못했던 못했어 못했을 못했죠 못했지 몽땅 무거운 무고한 무기 무기가 무기는 무기를 무단 무대 무대에 무덤을 무례한 무료 무릎 무릎을 무리 무리가 무리를 무사히 무서운 무서워 무섭게 무섭네 무섭지 무슈 무슨 무슨일 무시해 무어 무언가 무얼 무엇 무엇을 무엇이 무장 무조건 무지 무척 무한한 묶어 묶여 문니 문에 문으로 문은 문을 문이 문자 문자로 문자를 문제 문제가 문제는 문제도 문제로 문제를 문제야 문제에 문제죠 문제지 묻고 묻는 묻은 묻지 물건 물건들 물건은 물건을 물건이 물고 물도 물러나 물러서 물론 물어 물어본 물어볼 물어봐 물에 물은 물을 물이 뭐가 뭐가요 뭐고 뭐냐 뭐냐고 뭐니 뭐든 뭐든지 뭐라 뭐라고 뭐라구 뭐라는 뭐라도 뭐랄까 뭐래 뭐랬어 뭐로 뭐를 뭐야 뭐에 뭐에요 뭐여 뭐였어 뭐였죠 뭐였지 뭐예요 뭐요 뭐지 뭐하고 뭐하는 뭐하러 뭐해 뭐해요 뭔가 뭔가가 뭔가를 뭔가에 뭔가요 뭔갈 뭔데 뭔데요 뭔지 뭔지는 뭔지도 뭔진 뭘까 뭘까요 뭘로 뭘요 뭡니까 미국 미국에 미국은 미국의 미국이 미국인 미란다 미래 미래가 미래는 미래를 미래에 미래의 미리 미사일 미셸 미소 미소를 미스 미스터 미아 미안 미안해 미첼 미첼이 미쳐 미쳤어 미치 미치게 미치마 미치지 미친 미칠 믿게 믿고 믿기 믿기지 믿는 믿는다 믿어 믿어도 믿어야 믿어요 믿었어 믿으면 믿을 믿음을 믿음이 믿지 밀고 밀러 밀어 밋첼 밑에 밑에서 밑으로 바가 바깥 바꾸고 바꾸는 바꾸지 바꾼 바꿀 바꿔 바꿔야 바꿨어 바뀌지 바뀐 바뀔 바나나 바네사 바늘 바다 바다가 바다로 바다를 바다에 바닥 바닥에 바닥을 바라 바라고 바라네 바라는 바라요 바라지 바란 바란다 바랄 바람 바람에 바람을 바람이 바래 바래요 바로 바로는 바른 바를 바바라 바보 바보가 바보로 바보야 바비 바빠 바빠서 바빠요 바쁜 바에 바에서 바위 바지 바지를 바지에 바짝 바퀴 박사 박사가 박사는 박사님 박사를 박사의 박수 박스 박준 밖에 밖에서 밖엔 밖으로 밖을 밖의 반가워 반갑네 반갑다 반대 반대로 반드시 반은 반을 반응을 반응이 반지 반지를 반쯤 받게 받고 받기 받는 받아 받아라 받아서 받아야 받아요 받았고 받았다 받았어 받았을 받았죠 받았지 받으러 받으면 받은 받을 받지 발견 발견된 발견한 발로 발사 발생 발생한 발에 발을 발이 발작을 밝은 밟아 밤마다 밤새 밤에 밤에는 밤엔 밤은 밤을 밤의 밤이 밥은 밥을 밥이 방금 방법 방법도 방법은 방법을 방법이 방사선 방송 방송을 방식을 방식이 방에 방에서 방으로 방은 방을 방이 방해 방해가 방향 방향을 배가 배고파 배는 배로 배를 배리 배에 배에서 배우 배우고 배우는 배운 배울 배워야 배웠어 배터리 배포 배포시 백만 백신을 백인 백작 밴드 뱀이 버나드 버는 버니 버려 버려진 버렸어 버리고 버리는 버리면 버리지 버린 버릴 버스 버스가 버스를 버스에 버크 버크가 버크는 버텨 버트 버튼 버튼을 버티고 버틸 번도 번만 번씩 번에 번역 번은 번을 번의 번이나 번째 번째는 번째로 번호 번호가 번호는 번호를 벌고 벌려 벌써 벌어진 벌을 범위를 범인 범인은 범인을 범인의 범인이 범죄 범죄를 범죄자 법도 법에 법원 법은 법을 법이 법이야 법이지 법적 법정에 벗고 벗어 벗어나 벗어날 벗은 베넷 베니 베를린 베리 베스 베스트 베이비 베일리 베키 베트남 베티 벤자민 벨트 벽에 벽을 벽이 변신 변태 변하고 변하는 변하지 변한 변할 변했어 변호사 변화가 변화를 별거 별로 별로야 별명이 별을 별일 병력을 병력이 병신 병신아 병에 병원 병원에 병원은 병원을 병원의 병원이 병을 병이 보게 보고 보고를 보고만 보고서 보고해 보군 보군요 보기 보기만 보기에 보기엔 보긴 보길 보내 보내게 보내고 보내는 보내면 보내서 보내야 보내요 보내줘 보내지 보낸 보낼 보냈어 보냈죠 보냈지 보네 보네요 보는 보는게 보는데 보니 보니까 보다 보다는 보단 보도록 보라 보라고 보라구 보러 보려고 보렴 보며 보면 보면서 보물을 보살펴 보상을 보석 보세요 보셨죠 보스 보스가 보시면 보시죠 보신 보실 보아 보안 보안관 보안을 보여 보여서 보여요 보여준 보여줄 보여줘 보였어 보이 보이게 보이고 보이기 보이나 보이네 보이는 보이니 보이면 보이죠 보이지 보이진 보인다 보일 보자 보자고 보자구 보조 보죠 보지 보지도 보통 보통은 보트 보트를 보험 보호 보호를 보호할 보호해 복도 복부 복수 복수를 복잡한 복잡해 본다 본다면 본데 본부 본인 본인의 본인이 본적 본적이 본즈 볼게 볼게요 볼까 볼까요 볼래 볼래요 볼수 볼수록 볼일 봅니다 봅시다 봐도 봐라 봐바 봐서 봐야 봐야지 봐요 봐줄 봤거든 봤고 봤나 봤는데 봤니 봤다 봤다고 봤다는 봤던 봤어 봤어요 봤으면 봤을 봤을때 봤잖아 봤지 봤지만 뵙게 부대 부동산 부디 부러진 부르고 부르는 부르면 부르죠 부르지 부른 부를 부모 부모가 부모는 부모님 부모를 부부 부부가 부분 부분에 부분은 부분을 부분이 부상 부상을 부수고 부스 부엌 부인 부인과 부인은 부인을 부인의 부인이 부자가 부족한 부족해 부탁 부탁을 부탁이 부탁한 부탁해 부터 북부의 북쪽 분께 분노 분노를 분도 분들 분들은 분들이 분만 분명 분명해 분명히 분석 분위기 분은 분을 분의 분이 불과해 불러 불러도 불러서 불러야 불러요 불러줘 불렀어 불리는 불법 불쌍한 불어 불에 불을 불이 불타는 불편한 붉은 붙어 붙었어 붙여 붙은 붙이고 붙일 붙잡고 붙잡아 뷰티 브라보 브라운 브래드 브랜드 브레넌 브렌다 브루스 브룩스 브리짓 블랙 블루 비가 비는 비니 비디오 비록 비명 비명을 비밀 비밀로 비밀은 비밀을 비밀이 비상 비숍 비슷한 비슷해 비싼 비용을 비켜 비켜요 비하면 비행 비행기 빅터 빈다 빈센트 빌게 빌딩 빌려 빌리 빌린 빌어 빌어요 빕니다 빙고 빚을 빚이 빚진 빛나는 빛을 빛의 빛이 빠르게 빠르고 빠른 빠져 빠졌어 빠지게 빠지고 빠지면 빠진 빠질 빨간 빨라 빨리 빨리요 빵을 빼고 빼고요 빼면 뻔한 뻔해 뻔했어 뼈가 뼈를 뽑아 뿐만 뿐이고 뿐이다 뿐이야 뿐이죠 뿐이지 뿐인데 사건 사건과 사건에 사건은 사건을 사건의 사건이 사격 사고 사고가 사고로 사고를 사과 사과를 사과할 사귀고 사귀는 사기 사냥 사냥을 사는 사는데 사라 사라져 사라진 사라질 사람 사람과 사람도 사람들 사람만 사람에 사람은 사람을 사람의 사람이 사람인 사람일 사랑 사랑과 사랑에 사랑은 사랑을 사랑의 사랑이 사랑한 사랑할 사랑해 사러 사망 사망한 사면 사모님 사무실 사방에 사부님 사샤 사서 사세요 사소한 사실 사실상 사실에 사실은 사실을 사실이 사악한 사업 사업에 사업은 사업을 사용 사용한 사용할 사용해 사우스 사이 사이가 사이는 사이로 사이를 사이먼 사이에 사이의 사인 사인을 사자 사장 사장님 사적인 사지 사진 사진도 사진은 사진을 사진이 사촌 사촌이 사탕 사형 사회 사흘 산다고 산사 산소 산에 산을 산채로 산책 산타 살게 살고 살기 살던 살라고 살려 살려고 살려줘 살리기 살리는 살릴 살면 살면서 살살 살아 살아갈 살아서 살아야 살아요 살았어 살을 살이 살인 살인은 살인을 살인이 살인자 살지 살짝 살펴 살해 삶과 삶에 삶에서 삶은 삶을 삶의 삶이 삼촌 삼촌은 삼촌이 샀어 샀어요 상관 상관이 상관할 상담 상당한 상당히 상대 상대가 상대로 상대를 상사 상사님 상상 상상도 상상을 상상이 상상할 상상해 상업적 상을 상의 상자 상자를 상자에 상처 상처가 상처는 상처를 상태 상태가 상태는 상태로 상태를 상태야 상태에 상황 상황에 상황은 상황을 상황이 샅샅이 새가 새끼 새끼가 새끼들 새끼를 새끼야 새는 새라 새로 새로운 새롭게 새를 새벽 새해 샐리 샘이 샘플을 생각 생각나 생각도 생각만 생각에 생각엔 생각은 생각을 생각이 생각한 생각할 생각해 생겨 생겨서 생겼네 생겼다 생겼어 생기고 생기는 생기면 생기지 생긴 생길 생명 생명을 생명의 생명이 생애 생일 생일을 생존 생활 생활을 샤워 샴페인 서는 서둘러 서로 서로가 서로를 서로의 서류 서류를 서류에 서명 서비스 서서 서약을 서울 서장님 서쪽 석션 선물 선물로 선물은 선물을 선물이 선배 선생 선생님 선생이 선수 선수가 선을 선장 선장님 선택 선택은 선택을 선택의 선택이 선택한 선택할 선한 설마 설명 설명을 설명이 설명할 설명해 설탕 섬에 섬을 성공 성공을 성공한 성공할 성을 성이 성인 성적 성하 성함이 세게 세계 세계가 세계는 세계로 세계를 세계에 세계의 세고 세금 세번째 세상 세상에 세상엔 세상은 세상을 세상의 세상이 세스 세우고 세워 세인트 섹스 섹스는 섹스를 섹시한 센터 셈이야 셈이죠 셈이지 셋에 셋을 셋이 셔먼 셔츠 셔츠를 셜록 셰인 셰퍼드 소개해 소녀 소녀가 소녀는 소녀를 소년 소년을 소년이 소령 소령님 소리 소리가 소리는 소리도 소리로 소리를 소리야 소리죠 소리지 소린 소린지 소릴 소문 소문을 소문이 소설 소설을 소송 소송을 소스 소스를 소식 소식은 소식을 소식이 소아과 소용 소용이 소원을 소중한 소중히 소피 소피아 속도 속도가 속도로 속도를 속에 속에서 속옷 속으로 속을 속의 속이 속일 손가락 손님 손님이 손대지 손도 손들어 손상 손상을 손상이 손에 손으로 손은 손을 손이 솔직히 쇼가 쇼는 쇼를 수가 수건 수고 수녀님 수년간 수는 수도 수록 수를 수만 수많은 수면 수밖에 수백 수백만 수사 수사를 수상한 수색 수석 수술 수술도 수술실 수술에 수술은 수술을 수술이 수술할 수십 수업 수업에 수업을 수염 수영 수영을 수영장 수있는 수잔 수정 수천 수치가 수치다 수학 숙녀 숙여 숙제 숙청 숙청의 순간 순간에 순간을 순간이 순수한 순순히 술도 술에 술은 술을 술이 술이나 술집 술집에 숨겨진 숨기고 숨기는 숨길 숨어 숨어서 숨은 숨을 숨이 숫자 숫자가 숫자를 숲에 숲에서 숲으로 숲을 쉐퍼드 쉬게 쉬고 쉬는 쉬세요 쉬어 쉬어야 쉬어요 쉬운 쉬워 쉬지 쉴드 쉽게 쉽지 슈퍼 슈퍼걸 스노우 스미스 스스로 스카이 스카치 스캇 스캔 스코티 스콧 스키 스타 스타일 스타크 스텔라 스톤 스튜 스티브 스티븐 스틸 스파이 스팍 스페인 스펜서 스포츠 슬론 슬론이 슬슬 슬퍼 슬픈 슬픔을 승객 승리 승리를 승인 시간 시간과 시간도 시간만 시간에 시간은 시간을 시간의 시간이 시계 시계가 시계를 시골 시끄러 시내에 시도 시도는 시도해 시동 시드니 시를 시민 시발 시선을 시속 시스템 시신을 시신이 시애틀 시에 시작 시작도 시작된 시작한 시작할 시작해 시장 시장님 시저 시절 시체 시체가 시체는 시체를 시카고 시켜 시켜서 시키는 시킨 시킬 시티 시험 시험에 시험을 식당 식당에 식사 식사를 식으로 식은 신경 신경도 신경을 신경이 신고 신과 신께 신께서 신나게 신들이 신랑 신뢰를 신문 신문에 신발 신발을 신부 신부가 신부님 신분을 신분증 신사 신선한 신성한 신세 신에게 신원 신원을 신은 신을 신음 신의 신이 신장 신장을 신체 신호 신호가 신호를 싣고 실력 실력이 실례 실수 실수가 실수는 실수로 실수를 실어 실은 실제 실제로 실종 실종된 실컷 실패 실패한 실행 실험 실험실 실험을 싫고 싫다 싫다고 싫다면 싫어 싫어서 싫어요 싫어할 싫어해 싫었어 싫으면 싫은 싫은데 싫지만 심각한 심각해 심장 심장에 심장은 심장을 심장이 심지어 심하게 심한 심해 심해요 십대 싱크 싶고 싶구나 싶군 싶군요 싶나 싶네 싶네요 싶니 싶다 싶다고 싶다는 싶다면 싶소 싶어 싶어서 싶어요 싶어해 싶었다 싶었던 싶었어 싶었죠 싶었지 싶으면 싶은 싶은게 싶은데 싶을 싶지 싶지는 싶지도 싶지만 싶진 싸게 싸고 싸구려 싸우게 싸우고 싸우는 싸우지 싸운 싸울 싸움 싸움은 싸움을 싸움이 싸워 싸워야 쌍둥이 써도 써서 써야 써요 썩은 썼어 썼어요 썼지 쏘고 쏘는 쏘지 쐈어 쐈어요 쓰게 쓰고 쓰는 쓰던 쓰레기 쓰려고 쓰면 쓰세요 쓰여 쓰지 쓸모 쓸모가 씨가 씨는 씨를 씨발 씨에게 씨와 씨의 씻고 아가 아가씨 아가야 아기 아기가 아기는 아기를 아기의 아까 아깐 아끼는 아나 아나요 아내 아내가 아내는 아내랑 아내를 아내와 아내의 아냐 아네 아네요 아녀 아녜요 아뇨 아는 아는건 아는게 아는데 아니 아니고 아니군 아니길 아니까 아니냐 아니네 아니니 아니다 아니라 아니란 아니면 아니야 아니오 아니요 아니죠 아니지 아닌 아닌가 아닌거 아닌것 아닌데 아닌지 아닐 아닐까 아닐세 아님 아담 아델 아들 아들과 아들도 아들아 아들은 아들을 아들의 아들이 아따 아래 아래로 아래서 아래에 아마 아마도 아메 아멘 아무 아무나 아무도 아무런 아무리 아무튼 아버님 아버지 아버진 아빠 아빠가 아빠는 아빠도 아빠랑 아빠를 아빠야 아빠와 아빠의 아빤 아서 아세요 아셔야 아셨죠 아스나 아시는 아시오 아시죠 아실 아아 아야 아예 아오 아우 아유 아이 아이가 아이고 아이구 아이는 아이도 아이들 아이를 아이야 아이와 아이의 아이작 아인 아저씨 아저씬 아주 아줌마 아직 아직도 아직은 아침 아침에 아침엔 아침을 아파 아파서 아파요 아파트 아프게 아프지 아픈 아플 아하 아홉 아휴 악당 악마 악마가 악마는 악마를 악마의 악몽을 악몽일 악의 악한 안가 안가요 안경 안고 안그래 안나 안나요 안내해 안녕 안녕히 안다 안다고 안다는 안다면 안돼 안돼요 안됐어 안되 안되고 안되는 안되요 안되죠 안되지 안된다 안될 안될까 안드레 안들려 안들어 안보여 안부 안아 안에 안에는 안에서 안으로 안을 안의 안전 안전을 안전한 안전할 안전해 안정을 안젤라 안좋아 안좋은 안하고 안하는 안하면 안할 안해 안해도 안해요 안했어 앉게 앉아 앉아도 앉아봐 앉아서 앉아요 앉은 앉을 않거든 않게 않겠나 않겠다 않겠소 않겠어 않겠죠 않겠지 않고 않고요 않군 않군요 않기 않기로 않길 않나 않나요 않냐 않네 않네요 않는 않는게 않는군 않는다 않는데 않니 않다 않다고 않다는 않다면 않도록 않소 않아 않아도 않아서 않아요 않았고 않았나 않았네 않았다 않았던 않았소 않았어 않았을 않았죠 않았지 않으니 않으면 않은 않은가 않은데 않을 않을게 않을까 않을래 않잖아 않죠 않지 않지만 알거든 알거야 알게 알겠군 알겠나 알겠네 알겠니 알겠다 알겠소 알겠어 알겠죠 알겠지 알고 알기 알기나 알기론 알던 알렉스 알렌 알려 알려야 알려줄 알려줘 알려진 알리고 알면 알면서 알수 알아 알아낸 알아낼 알아둬 알아볼 알아봐 알아서 알아야 알아요 알았고 알았나 알았네 알았니 알았다 알았소 알았어 알았을 알았죠 알았지 알어 알을 알잖아 알죠 알지 알지도 알지만 알파 암살 암에 암이 암튼 암호 암호를 암흑 압니다 압력 압력을 앞서 앞에 앞에서 앞에선 앞으로 앞으론 앞을 애가 애기 애나 애는 애니 애도 애들 애들도 애들아 애들은 애들을 애들이 애디슨 애랑 애런 애를 애비 애쉬 애야 애의 애인 애인이 애초에 애한테 액션 앤드류 앤디 앨런 앨리샤 앨리스 앨리슨 앨범 앨범을 야간 야구 야야 약간 약간의 약물 약속 약속은 약속을 약속이 약속한 약속해 약에 약은 약을 약이 약점을 약한 얌전히 양말 양반 양은 양을 양의 양이 양쪽 얘가 얘기 얘기가 얘기나 얘기는 얘기도 얘기를 얘기만 얘기야 얘기좀 얘기죠 얘기지 얘기한 얘기할 얘기해 얘긴 얘길 얘는 얘들아 얘를 얘야 얘한테 어깨 어깨에 어느 어느날 어두운 어둠 어둠을 어둠의 어둠이 어디 어디가 어디다 어디든 어디로 어디를 어디서 어디야 어디에 어디요 어디죠 어디지 어딘가 어딘지 어딜 어딨나 어딨니 어딨어 어딨죠 어딨지 어때 어때서 어때요 어땠어 어떠냐 어떠니 어떠한 어떡해 어떤 어떤가 어떤지 어떨 어떨까 어떨지 어떻게 어떻고 어라 어려운 어려울 어려워 어렵게 어렵지 어렸을 어른 어른이 어린 어릴 어머 어머나 어머니 어머님 어서 어서와 어서요 어우 어울려 어이 어이구 어제 어제는 어젯 어젯밤 어째 어째서 어쨋든 어쨌든 어쩌고 어쩌다 어쩌면 어쩌죠 어쩌지 어쩐 어쩐지 어쩔 어쩜 어찌 어찌나 어차피 어휴 억지로 언니 언니가 언니는 언니도 언니를 언덕 언론에 언제 언제나 언제든 언제요 언제쯤 언젠가 언젠간 얻게 얻고 얻기 얻는 얻어 얻었어 얻은 얻을 얻지 얼간이 얼굴 얼굴도 얼굴에 얼굴은 얼굴을 얼굴이 얼레 얼른 얼마 얼마나 얼어 얼음 엄니 엄마 엄마가 엄마는 엄마도 엄마랑 엄마를 엄마야 엄마에 엄마와 엄마의 엄만 엄밀히 엄청 엄청난 업무 없거든 없게 없겠죠 없겠지 없고 없고요 없구나 없구요 없군 없군요 없기 없나 없나요 없냐 없네 없네요 없는 없는데 없는지 없니 없다 없다고 없다구 없다네 없다는 없다니 없다면 없단 없단다 없대 없대요 없던 없도록 없소 없앨 없어 없어도 없어서 없어요 없어진 없었고 없었다 없었던 없었어 없었을 없었죠 없었지 없으니 없으면 없을 없을걸 없을까 없음 없이 없이는 없이도 없인 없잖아 없죠 없지 없지만 엉덩이 엉뚱한 엉망이 엎드려 에게 에그 에그시 에너지 에드 에디 에리카 에릭 에린 에밀리 에바 에서 에스더 에요 에이 에이미 엔진 엔진을 엔진이 엘렌 엘리 엘리스 엘리엇 엘비스 엠마 여권 여기 여기가 여기는 여기다 여기도 여기로 여기를 여기서 여기선 여기야 여기에 여기엔 여기요 여긴 여길 여깄다 여깄어 여는 여덟 여동생 여러 여러번 여러분 여름 여름에 여보 여섯 여성 여성을 여성의 여성이 여왕 여왕님 여왕은 여왕을 여왕의 여왕이 여유가 여자 여자가 여자는 여자도 여자들 여자랑 여자를 여자애 여자야 여자에 여자와 여자의 여잔 여잘 여전히 여지가 여태 여태껏 여행 여행은 여행을 역겨운 역겨워 역사 역사를 역사상 역사에 역시 역을 역할을 연결 연결이 연결해 연관이 연구 연구를 연기 연기가 연기를 연락 연락을 연락이 연락할 연락해 연료 연방 연설 연설을 연쇄 연습 연습을 연주 열고 열려 열리는 열린 열면 열쇠 열쇠가 열쇠는 열쇠를 열심히 열어 열어봐 열어요 열이 열지 열차 열차가 염려 염병할 염소 엿이나 였어 였어요 영감을 영광을 영국 영국의 영리한 영상 영상을 영상이 영어 영어로 영어를 영업 영영 영웅 영웅이 영원한 영원히 영향을 영혼 영혼은 영혼을 영혼의 영혼이 영화 영화가 영화는 영화를 영화에 옆에 옆에서 옆으로 옆집 예를 예비 예뻐 예뻐요 예쁘게 예쁘네 예쁘다 예쁜 예상 예상치 예수 예수님 예스 예약 예요 예의 예이 예전 예전에 예전엔 예전의 옛날 옛날에 오게 오고 오기 오길 오냐 오너라 오네 오는 오는데 오늘 오늘도 오늘밤 오늘은 오늘의 오늘이 오드리 오디션 오라고 오래 오래된 오래전 오랜 오렌지 오렴 오로지 오른쪽 오리 오말리 오면 오버 오브 오빠 오빠가 오빠는 오빠를 오빤 오세요 오셔서 오셨죠 오스카 오시면 오신 오실 오역 오우 오웬 오웬이 오전 오죠 오줌 오줌을 오지 오직 오케이 오후 오후에 오히려 옥수수 온갖 온거 온거야 온게 온다 온다고 온라인 온종일 온통 올거야 올게 올게요 올라 올라가 올라갈 올라와 올려 올리고 올리버 올릴 올림픽 올바른 올해 올해는 올해의 옮겨 옮기는 옮길 옳았어 옳은 옳지 옷도 옷에 옷은 옷을 옷이 옷장 와도 와라 와봐 와서 와야 와요 와우 와인 와인을 와줘서 완료 완벽한 완벽해 완벽히 완전 완전한 완전히 왓슨 왔고 왔구나 왔군 왔군요 왔나 왔네 왔네요 왔는데 왔는지 왔니 왔다 왔다고 왔다는 왔던 왔소 왔어 왔어요 왔었어 왔으니 왔으면 왔을 왔잖아 왔죠 왔지 왕국을 왕국의 왕은 왕을 왕의 왕이 왕자님 왜그래 왜냐면 왜들 왜요 왜이래 왜죠 왜지 왠지 외계 외계인 외과 외국 외로운 외부 외상 외에 외에는 왼발 왼쪽 왼쪽에 요가 요괴 요리 요리를 요새 요원 요원님 요원을 요원이 요점은 요점이 요정 요즘 요즘은 요청을 용감한 용기 용기가 용기를 용서 용서를 용서할 용서해 용의 용의자 우는 우리 우리가 우리는 우리도 우리들 우리랑 우리를 우리만 우리에 우리와 우리의 우리집 우린 우릴 우선 우연히 우와 우유 우주 우주가 우주를 우주선 우주에 우주의 운동 운명은 운명을 운명의 운명이 운이 운전 운전을 운전해 울고 울어 울지 움직여 움직일 웃겨 웃고 웃기는 웃기지 웃긴 웃는 웃어 웃을 웃음 웃지 워낙 워렌 워싱턴 워커 원래 원래는 원숭이 원인을 원인이 원치 원하고 원하는 원하던 원하면 원하지 원한 원한다 원할 원해 원해서 원해요 원했던 원했어 월리 월요일 월터 웨버 웨버가 웨스트 웨슬리 웨이드 웨인 웰스 위대한 위로 위를 위성 위스키 위에 위에서 위의 위장 위층에 위치 위치가 위치는 위치로 위치를 위치에 위하여 위한 위해 위해서 위해선 위험 위험에 위험을 위험이 위험한 위험할 위험해 위협을 위협이 윌리엄 윌슨 유능한 유다 유대인 유럽 유령 유령이 유리 유명 유명한 유일한 유전자 유죄 유지 유진 유카와 유키 으로 으악 으음 으흠 은하 은행 은행에 은행을 음성 음식 음식은 음식을 음식이 음악 음악은 음악을 음악이 응급 응급실 의견 의견은 의견을 의견이 의도는 의료 의무가 의무를 의문을 의미 의미가 의미는 의미를 의사 의사가 의사는 의사를 의사야 의상 의상을 의식을 의식이 의심을 의역 의원님 의자 의자에 의하면 의학 의학적 의한 의해 이가 이거 이거나 이거면 이거야 이거에 이거요 이거지 이건 이걸 이걸로 이것 이것도 이것들 이것만 이것봐 이것에 이것은 이것을 이것이 이것좀 이게 이겨낼 이겼다 이겼어 이곳 이곳에 이곳은 이곳을 이곳의 이곳이 이기고 이기는 이기면 이긴 이길 이끄는 이끌고 이내에 이년아 이놈 이놈아 이는 이대로 이동 이동해 이든 이들 이들은 이들을 이들의 이들이 이따 이따가 이딴 이라 이라고 이라는 이란 이래 이래도 이래서 이래요 이랴 이러고 이러는 이러다 이러면 이러지 이러한 이런 이런거 이런건 이런걸 이런게 이럴 이럼 이렇게 이륙 이른 이를 이름 이름도 이름은 이름을 이름의 이름이 이리 이리로 이리와 이만 이메일 이모 이모가 이미 이번 이번에 이번엔 이번이 이보다 이봐 이봐요 이분은 이분이 이브 이비 이빨 이쁜 이쁜이 이사 이사회 이상 이상은 이상을 이상의 이상이 이상한 이상해 이성을 이식 이식을 이안 이야 이야기 이야길 이어 이에요 이요 이용 이용한 이용할 이용해 이유 이유가 이유는 이유도 이유로 이유를 이유야 이유죠 이유지 이의 이익을 이전 이전에 이제 이제는 이제야 이젠 이죠 이지 이지가 이지는 이집트 이쪽 이쪽에 이쪽은 이틀 이해 이해가 이해를 이해할 이해해 이혼 이후 이후로 이후에 익숙한 인가요 인간 인간과 인간은 인간을 인간의 인간이 인공 인기 인기가 인도 인류 인류를 인류의 인마 인사 인사를 인사해 인상을 인생 인생에 인생은 인생을 인생의 인생이 인정 인정해 인제 인터넷 인터뷰 인턴 인턴이 인한 인해 인형 인형을 일곱 일과 일년 일단 일단은 일도 일들 일들은 일들을 일들이 일로 일만 일명 일반 일본 일부 일부가 일부는 일부러 일부를 일어 일어나 일어난 일어날 일에 일요일 일으켜 일으킬 일은 일을 일의 일이 일이고 일이나 일이니 일이다 일이야 일이오 일이요 일이죠 일이지 일인 일인가 일인데 일인지 일종의 일주일 일찍 일하게 일하고 일하는 일하러 일하지 일한 일할 일해 일해야 일해요 일했던 읽고 읽는 읽어 읽었어 읽은 읽을 잃게 잃고 잃는 잃어 잃었다 잃었어 잃은 잃을 잃지 임마 임무 임무가 임무는 임무를 임무에 임시 임신 임신한 입고 입는 입니다 입어 입에 입에서 입으로 입으면 입은 입을 입이 입장을 있거나 있거든 있게 있겠군 있겠나 있겠네 있겠니 있겠다 있겠소 있겠어 있겠죠 있겠지 있고 있고요 있구나 있구만 있구요 있군 있군요 있기 있기를 있긴 있길 있나 있나봐 있나요 있냐 있냐고 있네 있네요 있는 있는가 있는거 있는건 있는걸 있는것 있는게 있는데 있는지 있니 있다 있다가 있다고 있다구 있다네 있다는 있다니 있다면 있단 있단다 있대 있대요 있더군 있더라 있던 있던데 있도록 있든 있소 있어 있어도 있어라 있어봐 있어서 있어야 있어요 있어줘 있었고 있었군 있었나 있었네 있었니 있었다 있었던 있었소 있었어 있었을 있었죠 있었지 있으니 있으렴 있으며 있으면 있을 있을거 있을것 있을게 있을까 있을때 있을래 있을지 있음 있음을 있잖니 있잖아 있죠 있지 있지도 있지만 있지요 있진 잊게 잊고 잊어 잊었어 잊은 잊을 잊지 잊지마 자가 자게 자격 자격이 자고 자국이 자금을 자기 자기가 자기는 자기도 자기들 자기랑 자기를 자기야 자기의 자긴 자길 자꾸 자네 자네가 자네는 자네도 자네들 자네를 자네와 자네의 자넨 자넬 자넷 자는 자도 자동 자동차 자들 자들은 자들을 자들이 자라 자라고 자란 자러 자료를 자르고 자를 자리 자리가 자리는 자리로 자리를 자리에 자릴 자막 자말 자말이 자매 자면 자비를 자살 자살을 자세한 자세히 자식 자식들 자식아 자식은 자식을 자식이 자신 자신도 자신을 자신의 자신이 자야 자연 자연의 자요 자유 자유가 자유를 자유의 자의 자자 자전거 자주 자지 자체가 작가 작게 작고 작년 작년에 작동 작별 작업 작업을 작은 작전 작전은 작전을 작전이 작품 작품을 잔뜩 잔소리 잔을 잔인한 잖아 잖아요 잘가 잘가요 잘난 잘도 잘됐군 잘됐네 잘됐다 잘됐어 잘된 잘될 잘들어 잘라 잘못 잘못도 잘못된 잘못은 잘못을 잘못이 잘못한 잘생긴 잘은 잘하고 잘하네 잘하는 잘한다 잘할 잘해 잘해봐 잘해요 잘했네 잘했다 잘했어 잠깐 잠깐만 잠도 잠든 잠시 잠시만 잠을 잠이 잠이나 잡고 잡기 잡는 잡아 잡아라 잡아서 잡아야 잡아요 잡았다 잡았어 잡으러 잡으면 잡은 잡을 잡지 잡혀 잡히지 잤어 잤어요 장관님 장군 장군님 장기 장기를 장난 장난감 장난을 장난이 장난해 장면 장면을 장면이 장벽 장비 장비가 장비를 장소 장소가 장소는 장소로 장소를 장소에 장치 장치가 장치를 재능을 재능이 재미 재미로 재밌게 재밌네 재밌는 재밌어 재밌을 재밌지 재산을 재수 재판 재판을 잭슨 잭슨이 잭이 쟈니 쟤가 쟤네 쟤는 쟤들 쟤들은 쟤들이 저거 저건 저걸 저것 저게 저기 저기로 저기서 저기에 저기요 저긴 저길 저녁 저녁에 저녁은 저녁을 저놈 저는 저도 저도요 저들 저들은 저들을 저들의 저들이 저라면 저랑 저래 저런 저렇게 저를 저리 저리가 저만 저번 저번에 저보고 저보다 저스틴 저에 저에게 저에요 저예요 저와 저요 저의 저절로 저주를 저지른 저쪽 저쪽에 저한테 저한텐 저희 저희가 저희는 저희도 저희를 저희의 저흰 적당한 적당히 적도 적어 적어도 적은 적을 적의 적이 적절한 적혀 전과 전기 전기가 전기를 전까지 전까진 전날 전력 전력을 전문 전부 전부가 전부는 전부다 전부를 전부야 전부터 전에 전에는 전에도 전에요 전엔 전원 전의 전자 전쟁 전쟁에 전쟁은 전쟁을 전쟁의 전쟁이 전직 전체 전체가 전체를 전체에 전투 전하 전할 전해 전해줘 전혀 전혀요 전화 전화가 전화기 전화는 전화도 전화로 전화를 전화할 전화해 절개 절대 절대로 절반은 절반을 젊고 젊은 젊은이 점수를 점심 점심을 점은 점을 점이 점점 접근 접근할 접니다 접속 정당한 정도 정도가 정도는 정도로 정도면 정도야 정도요 정도의 정리 정말 정말로 정말요 정보 정보가 정보는 정보를 정보에 정부 정부가 정부는 정부를 정부의 정상 정상이 정신 정신과 정신은 정신을 정신이 정신적 정의를 정작 정지 정직한 정체가 정체를 정치적 정해진 정확한 정확히 젖은 제가 제가요 제거 제거할 제게 제겐 제국의 제군들 제기랄 제길 제니 제니퍼 제대로 제리 제말은 제발 제발요 제법 제스 제시 제시카 제안은 제안을 제이 제이가 제이미 제이슨 제이콥 제이크 제인 제일 제임스 제작 제프 제프리 젠장 젠장할 졌어 조가 조각 조각을 조건부 조건을 조건이 조국을 조그만 조금 조금도 조금만 조금씩 조금은 조니 조만간 조명 조사 조사를 조사해 조셉 조쉬 조심 조심해 조심히 조언을 조엘 조용 조용한 조용해 조용히 조이 조준 조지 조지가 조지는 조직 조직을 조직의 조직이 조차 조차도 조치를 조카 존나 존스 존슨 존은 존이 존재 존재가 존재를 존재야 졸라 졸업 좀더 좀만 좀비 좁은 종교 종류의 종양 종양을 종양이 종이 종일 종종 좆같은 좋게 좋겠군 좋겠네 좋겠다 좋겠어 좋고 좋구나 좋구만 좋군 좋군요 좋긴 좋네 좋네요 좋다 좋다고 좋다는 좋다면 좋더라 좋소 좋아 좋아서 좋아요 좋아질 좋아할 좋아해 좋았던 좋았어 좋았을 좋았지 좋으면 좋은 좋은데 좋을 좋잖아 좋죠 좋지 좋지만 좋진 죄가 죄다 죄를 죄송 죄책감 죠지 주가 주게 주겠다 주겠어 주고 주기 주기로 주길 주는 주님 주님의 주디 주라고 주려고 주로 주마 주말 주말에 주머니 주면 주목 주문 주문을 주변 주변에 주변을 주변의 주사 주사를 주세요 주셔서 주소 주소를 주시고 주시면 주시오 주시죠 주신 주실 주어진 주에 주여 주요 주위를 주위에 주의 주의를 주인 주인님 주인이 주제에 주죠 주지 죽거나 죽게 죽겠네 죽겠어 죽겠지 죽고 죽기 죽길 죽는 죽는다 죽도록 죽어 죽어도 죽어라 죽어서 죽어야 죽어요 죽었고 죽었다 죽었어 죽었을 죽었죠 죽었지 죽여 죽여라 죽여서 죽여야 죽여요 죽였다 죽였어 죽였을 죽였지 죽으면 죽은 죽을 죽음 죽음과 죽음에 죽음은 죽음을 죽음의 죽음이 죽이게 죽이고 죽이기 죽이는 죽이러 죽이려 죽이면 죽이지 죽인 죽인다 죽일 죽지 준다 준다고 준다면 준비 준비가 준비는 준비를 준비한 준비할 준비해 줄거야 줄게 줄게요 줄곧 줄까 줄까요 줄도 줄래 줄래요 줄리 줄리아 줄리엣 줄수 줄은 줄을 줄이야 중간 중간에 중국 중대한 중앙 중에 중에서 중요치 중요한 중요해 중위 중의 중이고 중이다 중이라 중이야 중이죠 중이지 중인 중인데 중지 줘서 줘야 줘야지 줘요 줬는데 줬다고 줬어 줬어요 줬으면 줬잖아 줬지 쥐가 쥐고 즉시 즐거운 즐겁게 즐겨 즐기고 즐기는 즐길 증거 증거가 증거는 증거도 증거를 증명할 증명해 증상을 증상이 증언을 지가 지갑 지갑을 지겨워 지고 지구 지구로 지구를 지구에 지구의 지금 지금껏 지금도 지금요 지금은 지금의 지금이 지금쯤 지나 지나간 지나갈 지나면 지나서 지난 지난번 지났어 지내 지내고 지내는 지내요 지낼 지냈어 지는 지니 지도 지도를 지독한 지랄 지루한 지루해 지르고 지면 지미 지방 지붕 지상 지시를 지역 지역에 지역을 지역의 지옥 지옥에 지옥의 지원 지원을 지원이 지은 지지 지쳤어 지켜 지켜볼 지켜봐 지켜야 지켜줄 지키고 지키기 지키는 지키지 지킬 지하 지하에 지하철 직업 직업은 직업을 직업이 직원 직원이 직장 직장에 직장을 직전에 직접 진술을 진실 진실은 진실을 진실이 진작 진작에 진전이 진정 진정한 진정해 진지한 진짜 진짜가 진짜로 진짜야 진짜요 진통제 진행 질문 질문에 질문은 질문을 질문이 질질 짐은 짐을 짐이 집까지 집도 집안 집안에 집어 집에 집에서 집으로 집은 집을 집의 집이 집이야 집중 집중해 짓고 짓는 짓도 짓은 짓을 짓이 짓이야 짓이지 짜리 짜잔 짜증 짜증나 짧게 짧은 쪽에 쪽에서 쪽으로 쪽은 쪽을 쪽이 쫓고 쫓는 쫓아 찍고 찍는 찍어 찍은 찍을 차가 차가운 차고 차는 차도 차라리 차량 차량을 차려 차려요 차례 차례야 차로 차를 차리고 차에 차에서 차이가 차이를 차트 착륙 착하게 착하지 착한 찰리 찰스 참고 참말로 참아 참으로 참을 창고 창고에 창녀 창문 창문을 창문이 찾게 찾고 찾기 찾는 찾는데 찾던 찾아 찾아내 찾아낸 찾아낼 찾아라 찾아봐 찾아서 찾아야 찾아온 찾아와 찾아요 찾았고 찾았나 찾았다 찾았어 찾았죠 찾았지 찾으러 찾으면 찾은 찾을 찾을수 찾자 찾지 채널 채로 채워 채프먼 책도 책상 책상에 책에 책은 책을 책이 책임 책임을 책임이 챈들러 챔피언 챙겨 챙기고 처럼 처럼요 처리 처리할 처리해 처음 처음에 처음엔 척추 척하는 천국에 천만에 천사 천사가 천재 천천히 철이 철저히 첫번째 첫째 청소 체스 체이스 체포 체포할 쳐다봐 초기 초대 초록색 초음파 초콜릿 총기 총도 총알 총알을 총알이 총에 총으로 총은 총을 총이 촬영 촬영을 최고 최고로 최고야 최고의 최근 최근에 최근의 최대 최대한 최선을 최선의 최소 최소한 최신 최악의 최종 최초로 최초의 최후의 추가 추운 추워 추적 추적할 축구 축복을 축하 축하해 출동 출발 출발해 출신 출입 출처를 출혈 출혈을 출혈이 춤을 춤추고 춤추는 춤추자 충격 충격을 충돌 충분치 충분한 충분해 충분히 충성을 충전 취한 취해 취해서 취했어 취향이 치고 치는 치료 치료가 치료를 치료할 치면 치워 치즈 치지 치킨 치프 치프가 친구 친구가 친구는 친구도 친구들 친구랑 친구로 친구를 친구야 친구와 친구요 친구의 친구인 친구지 친절한 친한 칠면조 침대 침대로 침대에 침착해 카논 카드 카드가 카드를 카라 카레브 카레프 카렌 카메라 카일 카터 칵테일 칼로 칼리 칼에 칼은 칼을 칼이 캐롤 캐리 캐서린 캐스 캐시 캘리 캘리가 캠이 캠프 캡틴 캣니스 커다란 커서 커요 커피 커피를 컴퓨터 케빈 케이스 케이시 케이지 케이크 케이트 케이티 케프너 켈리 코너 코니 코드 코드를 코를 코치님 코카인 코트 코트니 쿠키 쿠키가 쿠퍼 크게 크고 크루즈 크리스 크림 큰일 클라라 클라크 클락 클램프 클럽 클럽에 클레어 클레이 클로이 클리어 클린턴 키가 키루밍 키를 키스 키스를 키우고 키우는 타고 타고난 타는 타라 타마오 타면 타미 타세요 타야 타요 타워 타이 타이어 타일러 타임 타지 탈출 탐정 탔어 태아 태양 태양이 태어난 태어날 태우고 태워 태워다 택시 택시를 터널 터질 테고 테니 테니까 테디 테러 테레사 테리 테스트 테오 테이블 테이프 테일러 테지 텍사스 텐데 텐데요 토끼 토니 토드 토레스 토마스 토미 토비 토요일 토할 통과 통신 통신을 통제 통제할 통증을 통증이 통하는 통해 통해서 통화 통화를 투표를 튀어 튜브 트럭 트럭에 트럭을 트럭이 트레이 특별 특별한 특별히 특수 특이한 특정 특정한 특히 특히나 틀렸어 틀린 티켓 팀에 팀은 팀을 팀의 팀이 파괴 파는 파란 파리 파리를 파리에 파블로 파이 파이팅 파이퍼 파일 파일을 파커 파트너 파티 파티가 파티는 파티를 파티에 판단을 판사가 팔고 팔아 팔에 팔은 팔을 팔이 패트릭 패티 퍽이나 펄스 페니 페이지 편에 편을 편이 편이야 편지 편지가 편지를 편하게 편한 편히 평범한 평생 평생을 평화 평화를 폐가 폐를 폐에 폐하 폐하를 폐하의 포기 포기할 포드 포르노 포스터 포터 폭력을 폭발 폭발이 폭스 폭탄 폭탄을 폭탄이 폭풍 폭풍이 폴닥 폴란드 표를 표정 표정을 표정이 푸른 풀고 풀어 풀어줘 품고 품에 풋볼 프랑스 프랭크 프랭키 프레드 프로 프리쳇 플래시 플로키 피가 피곤해 피는 피로 피를 피바디 피부 피부가 피부를 피아노 피오나 피우고 피자 피츠 피타 피터 피트 피하고 피할 피해 피해를 피해자 필름 필립 필요 필요가 필요는 필요도 필요로 필요한 필요할 필요해 필욘 필이 핑크 하거나 하거든 하게 하겠네 하겠다 하겠어 하겠죠 하겠지 하고 하고요 하곤 하구요 하기 하기로 하기엔 하긴 하길 하나 하나가 하나는 하나님 하나도 하나로 하나를 하나만 하나씩 하나야 하나에 하나요 하나의 하냐 하네 하네요 하느님 하느라 하는 하는거 하는건 하는걸 하는게 하는군 하는데 하는지 하늘 하늘에 하늘을 하늘의 하늘이 하니 하니까 하다 하다가 하다니 하더군 하더니 하더라 하던 하던데 하도 하도록 하든 하라 하라고 하라는 하란 하러 하려 하려고 하려는 하려던 하려면 하렴 하루 하루가 하루는 하루도 하루를 하루만 하루에 하룻밤 하며 하면 하면서 하비 하세요 하셔야 하셨어 하셨죠 하시고 하시는 하시면 하시오 하시죠 하시지 하신 하실 하얀 하여간 하오 하와이 하워드 하이 하자 하자고 하자는 하자면 하잖아 하죠 하지 하지는 하지도 하지마 하지만 하지요 하진 하진스 하찮은 하킴 하킴이 하퍼 하필 하하 학교 학교가 학교는 학교로 학교를 학교에 학생 한가지 한거 한거야 한거죠 한거지 한건 한게 한글 한나 한다 한다고 한다구 한다는 한다면 한단 한단다 한달 한대 한대요 한데 한동안 한두 한때 한때는 한마디 한명 한명은 한명이 한방 한번 한번도 한번만 한번에 한번은 한숨 한스 한시간 한심한 한이 한잔 한쪽 한참 한테 한판 할거 할거야 할걸 할것 할게 할게요 할까 할까요 할꺼야 할께 할께요 할때 할래 할래요 할려고 할로윈 할머니 할수 할일이 할지 할지도 할텐데 함께 함께할 함부로 함장님 합니까 합니다 합시다 합의를 항로를 항상 해가 해결 해결할 해결해 해고 해군 해낼 해냈어 해도 해라 해롤드 해를 해리 해리스 해변에 해보고 해보는 해보자 해보죠 해보지 해본 해볼 해볼게 해볼까 해볼래 해봐 해봐야 해봐요 해봤어 해서 해서는 해서요 해선 해야 해야돼 해야만 해야죠 해야지 해야할 해야해 해요 해제 해주고 해주는 해주면 해주지 해준 해줄 해줄게 해줄까 해줄래 해줘 해줘서 해줘야 해줘요 해줬어 해치지 해칠 해피 핸드폰 했거든 했겠지 했고 했고요 했군 했나 했나요 했네 했네요 했는데 했는지 했니 했다 했다고 했다는 했다면 했단 했단다 했더니 했던 했소 했어 했어야 했어요 했었어 했었죠 했었지 했으니 했으면 했을 했을까 했잖니 했잖아 했죠 했지 했지만 행동 행동에 행동은 행동을 행동이 행복을 행복한 행복할 행복해 행성 행운을 행운의 행운이 행크 향하고 향하는 향한 향해 허가 허가를 허나 허드슨 허락 허락을 헌데 헌트 헌트가 헛소리 헤드 헤어진 헤이 헤일리 헨리 헨리가 헬기 헬렌 혀를 현금 현명한 현실 현실은 현실을 현실이 현장 현장에 현장을 현재 현지어 혈관 혈압은 혈압이 혈액 혈액을 혐의로 혐의를 협상 협상을 형님 형사 형사가 형사님 형씨 형은 형을 형의 형이 형제 형제가 형제를 형제여 호도 호랑이 호수 호의를 호출 호출해 호텔 호텔로 호텔에 호흡 혹시 혹시나 혹은 혼자 혼자가 혼자만 혼자서 홀든 홀로 홀리 홈즈 화가 화나게 화난 화났어 화내지 화려한 화를 화면 화살을 화상 화성 화성에 화이트 화장실 화재 화학 확률이 확신이 확신할 확신해 확실한 확실해 확실히 확인 확인을 확인할 확인해 환영 환영해 환자 환자가 환자는 환자도 환자들 환자를 환자분 환자야 환자의 활동을 황금 회복 회사 회사가 회사는 회사를 회사에 회사의 회의 회의가 회의를 회의에 효과 효과가 후로 후면 후안 후에 후에는 후에도 후엔 후지이 후회 후회할 훈련 훈련을 훌륭한 훌륭해 훔쳐 훔쳤어 훔치고 훔치는 훔친 훨씬 휴가 휴가를 휴대폰 흉부 흐르는 흑인 흔들어 흔적도 흔적은 흔적을 흔적이 흔한 흘러 흘리고 흥미를 희망 희망은 희망을 희망이 히틀러 힘내 힘든 힘들 힘들게 힘들어 힘들죠 힘들지 힘으로 힘은 힘을 힘이'.split(' '));

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
,
  // The 500 commonest Korean words, by frequency over a 50k list.
  //
  // This set does two jobs and was far too small for either. koreanExactly
  // consults it to overrule the English-likeness heuristic, and
  // realWordsProduced uses it to decide which language best explains a
  // sentence — so at 94 words "좋은 하루 되세요" scored zero real Korean
  // words, tied Russian 17 to 17 on length alone, and lost the tie to
  // iteration order. Russian offered "црпвьы плат урдезвн" for a perfectly
  // ordinary Korean sign-off.
  //
  // Business and chat phrases both go from 93% and 90% to 100%. Measured for
  // cost the same way as everything else here: every word in EN_LEXICON
  // alone and 20,000 random English pairs give the identical counts before
  // and after — 6 singles and 53 pairs, none of the pairs Korean. Going to
  // 1500, 3000 or 6000 words moved no measurement at all, so this is the
  // smallest list that buys the whole gain.
  //
  // EN_WORDS is still checked first in koreanExactly, so an ordinary English
  // word whose romanisation collides with Korean keeps winning.
  '내가', '거야', '그래', '있어', '그리고', '우리', '무슨', '하지만', '어떻게', '그냥', '정말', '그럼',
  '있어요', '있는', '여기', '제가', '우리가', '이제', '지금', '그게', '아니', '네가', '없어', '우린',
  '좋아', '당신이', '다른', '그런', '그건', '너무', '그래서', '그렇게', '다시', '이건', '이런', '나도',
  '모든', '당신', '거예요', '당신은', '좋은', '하는', '하고', '아냐', '나는', '아니야', '알아', '같이',
  '이게', '없어요', '괜찮아', '오늘', '말이야', '누가', '어떤', '아주', '아직', '안돼', '진짜', '모두',
  '같은', '여기서', '어서', '그는', '위해', '해요', '일이', '하지', '엄마', '바로', '근데', '알고',
  '이렇게', '빨리', '있습니다', '이거', '전에', '아뇨', '계속', '닥터', '얼마나', '알았어', '않아',
  '제발', '있지', '겁니다', '어디', '사람이', '그가', '안녕', '좋아요', '같아', '우리는', '그래요',
  '당신을', '그걸', '아니에요', '있을', '때문에', '대해', '아빠', '사람', '했어', '뭐야', '수도',
  '많이', '집에', '거지', '일을', '저는', '그렇지', '함께', '만약', '하나', '저기', '고마워요', '항상',
  '나한테', '잠깐', '가서', '가장', '돼요', '거죠', '가자', '맞아', '보고', '그거', '말을', '괜찮아요',
  '아무도', '없는', '안녕하세요', '몰라', '많은', '당신의', '아무것도', '그러니까', '알아요', '그의',
  '뭐가', '고마워', '그만', '했어요', '젠장', '사람들이', '거에요', '이걸', '그럴', '것도', '말이',
  '이미', '그를', '뭔가', '이봐', '아니면', '같아요', '그런데', '아니라', '세상에', '있다고', '있고',
  '뭐라고', '절대', '말야', '당장', '그래도', '대한', '말은', '거기', '전부', '그녀는', '니가',
  '않아요', '자기', '있죠', '하면', '가지고', '그들이', '너도', '됐어', '미안해', '것을', '여긴',
  '아무', '사람은', '감사합니다', '다들', '어때', '엄마가', '나를', '이젠', '아마', '그들은', '얘기',
  '있잖아', '저도', '지금은', '그녀가', '있다', '시간', '먼저', '우릴', '말고', '사람을', '수가',
  '봐요', '있는데', '알았어요', '해야', '있었어', '우리의', '않을', '방금', '완전', '동안', '시간이',
  '싶어', '일은', '친구', '들어', '안에', '자네', '합니다', '사실', '한번', '대체', '같은데', '생각해',
  '맞아요', '혼자', '자네가', '그러니', '선생님', '사람들은', '문제가', '다음', '물론', '거의', '일이야',
  '없습니다', '아빠가', '되는', '그러면', '가는', '말도', '이리', '있었어요', '맙소사', '내일', '있으면',
  '잠깐만', '싫어', '중요한', '내게', '말해', '이상', '거라고', '아는', '너는', '전혀', '여자',
  '새로운', '너희', '왔어', '아직도', '가지', '나와', '싶지', '여기에', '원하는', '필요', '도움이',
  '그녀를', '몰라요', '작은', '혹시', '미안해요', '나쁜', '죄송해요', '모르겠어', '가요', '알지', '밖에',
  '직접', '있나', '해도', '하죠', '했는데', '필요해', '아니요', '적이', '있나요', '갖고', '돈을',
  '주세요', '어디서', '것이', '거요', '위한', '것은', '없이', '나중에', '아버지', '나랑', '됐어요',
  '마세요', '언제', '그저', '생각', '했지', '봤어', '해서', '시간을', '마지막', '알겠어', '왜냐면',
  '위해서', '엄청', '알겠습니다', '오래', '기다려', '아닙니다', '있는지', '알겠어요', '제일', '지난',
  '그렇죠', '죽은', '제대로', '아니지', '있다면', '보면', '우리를', '짓을', '남자', '너가', '있다는',
  '누구', '보여', '왔어요', '너한테', '여러분', '완전히', '너의', '것이다', '소리', '없지', '벌써',
  '모르겠어요', '말이지', '사람들을', '처음', '말이죠', '사람들', '그녀의', '멋진', '왜요', '정말로',
  '이름은', '와서', '대해서', '여보', '조금', '않았어', '말이에요', '이름이', '여보세요', '서로', '안돼요',
  '죽을', '매우', '사랑해', '오늘은', '싶은', '어디로', '단지', '아닌', '나가', '뿐이야', '미안',
  '확실히', '싶어요', '죄송합니다', '때까지', '없고', '어때요', '당연히', '데리고', '필요한', '없다',
  '가고', '글쎄', '않는', '했죠', '나의', '별로', '않은', '라고', '여전히', '없을', '있어서', '이야기',
  '엄마는', '부인', '하는데', '않고', '알았지', '아니고', '여자가', '되지', '거기서', '훨씬', '아버지가',
  '망할', '뭔지', '수술', '듣고', '어쩌면', '보세요', '생각이', '어느', '그러지', '되면', '아마도',
  '준비', '전화', '뒤에', '도대체', '너를', '당신도', '것처럼', '않으면', '말하는', '최고의', '말하지',
  '모르는', '유일한', '갑자기', '이봐요', '건가요', '없다고', '것입니다', '있잖아요', '되고', '어쨌든',
  '가진', '이번', '뭐하는', '후에', '친구가', '신경', '그만해', '누구야', '당신에게', '없었어', '그들을',
  '있게', '알잖아', '누군가', '분명히', '생각을', '일단', '가야', '걱정', '보자', '매일', '수는',
  '아침', '말할', '말아요', '모두가', '않았어요', '얘기를', '봤어요', '대신', '마치', '건데', '자넨',
  '했잖아', '둘이', '당신과', '집으로', '한다', '두고', '이름을', '있네', '그들의', '뭔데', '금방',
  '사는', '좋아하는', '찾을', '맘에', '결국', '이유가', '필요해요', '중에', '그때', '보는', '너랑'
,
  // Three-syllable words the solo rule needs by name. The list is what makes
  // a three-syllable token evidence, so an everyday word missing from it is
  // an everyday message going unanswered.
  '뭐해요','늦어요','계세요','안녕히','알았어','고마워요','미안해','괜찮아',
  '그래요','맞아요','좋아요','싫어요','모르겠','어디야','뭐야','있어요','없어요',
  '할게요','갈게요','왔어요','했어요','됐어요','보내요','받았어','알겠어'
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
  // The English dictionary, before any of this language's own evidence.
  //
  // Every one of these checks consulted EN_WORDS, which holds a few hundred
  // words, and none of them consulted EN_LEXICON, which holds 8,625. So
  // "entitlement", "guilty", "rugby", "truck" and the rest of ordinary
  // written English were invisible to every language but Hebrew, and Korean
  // in particular returns true on any token that falls out as four clean
  // syllables — "entitlement" became 두샤시드둣 on its own, in the middle of a
  // sentence about entitlement.
  //
  // It goes above this language's own word list on purpose. A word the
  // English dictionary knows and the foreign list also claims is a word the
  // foreign list should not have: that is what the eleven exclusions inside
  // unmistakablyEnglish are for, and they are the cases where the two
  // genuinely collide.
  if (!ALSO_A_WORD.ko.has(lower) && unmistakablyEnglish(lower)) return false;
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
// Where the span sits inside its line, so the toast can mark what changes and
// leave the rest visible around it. Returns null whenever the span cannot be
// located exactly — a selection fix has no line, and `original` sometimes
// carries trailing punctuation the line does not — and the toast then falls
// back to showing the span alone, which is what it always did.
function spanContext(line, span, pad = 24) {
  if (typeof line !== 'string' || typeof span !== 'string' || !span) return null;
  const idx = line.lastIndexOf(span);
  if (idx < 0) return null;
  let before = line.slice(0, idx);
  let after  = line.slice(idx + span.length);
  if (!before && !after) return null;   // the span is the whole line: nothing to mark
  if (before.length > pad) before = '… ' + before.slice(-pad);
  if (after.length  > pad) after  = after.slice(0, pad) + ' …';
  return { before, after };
}

// How much of a run the toast will show, and so how long a run can be before
// the toast is the wrong shape for it and the hint takes over. One number for
// both: when they disagreed, every run between the two was shown as a hint
// bubble although the preview could have displayed it whole.
const PREVIEW_MAX_WORDS = 30;

function truncatePreview(text, maxWords = PREVIEW_MAX_WORDS) {
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
  // Two letters minimum. One capital letter on its own is not an acronym — it
  // is a word, and in Russian and Ukrainian it is the commonest word there is:
  // "Z" is Я. Every Russian sentence that opens with Я was losing its first
  // word to this, eleven of the thirteen that fixed only partway.
  return word.length >= 2 && word.length <= 5 &&
         word === word.toUpperCase() && /[A-Z]/.test(word);
}

// A single word has never been enough, and for good reason: one Latin token
// that happens to map onto Hebrew letters is exactly how a false positive
// starts, so a run has always needed two. The cost of that rule is that
// שלום, תודה, בסדר and סבבה — whole messages, the commonest things anyone
// sends — were invisible. Nought out of five on single words is most of what
// "it didn't detect my keyboard mistakes" means.
//
// So one word may speak, at a bar set far above the one a word inside a run
// has to clear: every single bigram has to be one Hebrew actually uses, the
// word has to be long enough for that to be worth anything, and the English
// dictionary has to have never heard of it. Three letters is not enough
// evidence at any threshold — two bigrams both landing is luck, not proof.
const HE_SOLO_SURE    = 1.0;
const HE_SOLO_MIN_LEN = 4;

function soloHebrewWord(word) {
  const lower = word.toLowerCase().replace(/[,.;]+$/, '');
  if (lower.length < HE_SOLO_MIN_LEN) return false;
  if (unmistakablyEnglish(lower)) return false;
  if (!wordCouldBeHebrew(lower)) return false;
  const mapped = [...lower].map(c => EN_TO_HE[c]);
  if (!mapped.every(c => c !== undefined && HEBREW_RE.test(c))) return false;
  // A word list, not a bigram score.
  //
  // The score was the obvious gate and it was wrong: "bans" maps to נשמד,
  // which is a real Hebrew word and scores a flat 1.00, so pasting ordinary
  // English raised a Hebrew offer on it. Measured against 370,000 English
  // words, the score let 1,804 of them through; the list lets 14. Russian
  // and Arabic were given a list in 4.21 and added one false positive
  // between them, and Hebrew should have had the same treatment then.
  //
  // My own test for this was tautological: every word in EN_LEXICON, which
  // is the list unmistakablyEnglish checks, so by construction none of them
  // could fire. The words that fire are the ones no dictionary here knows.
  return isCommonHebrewWord(mapped.join(''));
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
  // , . and ; are letters on the Hebrew layout — ת ץ ף — so an ordinary
  // English word carrying one of them maps to a longer, entirely plausible
  // Hebrew word, and every English gate below misses it because the lookup
  // key still has the punctuation on it. "team," maps to אקשצת, EN_WORDS does
  // not contain "team," and englishScore is diluted by the extra character,
  // so "Hi team, akuo nvhs ekhu" absorbed "team," into the run and offered to
  // replace a word the user had typed on purpose with gibberish. The trimming
  // branch in wordCouldBeHebrew was meant to cover this and cannot: it only
  // runs when the untrimmed word is rejected, and this one is accepted.
  //
  // The English checks run on the bare word. The Hebrew mapping below still
  // runs on the whole thing, punctuation included, because "מילה," really is
  // a word plus a comma and has to keep converting.
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
  //
  // What that threshold could never do on its own is tell a four-letter Hebrew
  // word from a four-letter English one. Three bigrams means a single common
  // English pair scores 0.33 and vetoes the word, and קורה, נראה, תודה and
  // בסדר all die that way — which is why Kiko read whole sentences perfectly
  // and went silent on "מה קורה".
  //
  // The veto now takes a second opinion, in two steps, and the order is the
  // whole point. First the English dictionary, which this gate never
  // consulted: EN_WORDS is a few hundred words, EN_LEXICON is 8,625, and
  // letting a bigram score overrule the big list put "you can pay by card or
  // in cash" and "perfect, thanks" on screen as Hebrew. Only a word the
  // dictionary has never heard of gets to argue, and then it argues with its
  // Hebrew reading. See HE_BIGRAMS.
  const mapped = [...lower].map(c => EN_TO_HE[c]);
  if (!mapped.every(c => c !== undefined && HEBREW_RE.test(c))) return false;
  // Two Hebrew letters is not two letters of evidence.
  //
  // "a." is one English letter and a full stop, and because , . and ; are
  // letters on this layout it reads as שץ — long enough to pass a length
  // check and clear every score, since a two-character token has one bigram.
  // That is how "a. engine_version bumps automatically on every" became a
  // Hebrew offer: "a." and "bumps" were two candidates, which is a run, and
  // the span then swallowed the identifier sitting between them.
  //
  // A two-letter reading has to be a word somebody actually writes. That
  // keeps את, מה, לא and זה, which are among the commonest words in the
  // language, and drops שץ, ןץ and קץ, which are not words at all.
  if (mapped.length <= 2 && !isCommonHebrewWord(mapped.join(''))) return false;
  // Final-form letters (ך ם ן ף ץ) only appear at word-end in valid Hebrew.
  // Finding one in a non-final position is an unambiguous wrong-keyboard signal.
  for (let i = 0; i < mapped.length - 1; i++) {
    if (FINAL_FORMS.has(mapped[i])) return false;
  }
  // The dictionary is asked about every word, not only the ones a bigram
  // score has already found suspicious.
  //
  // It used to sit inside the score test, and a trailing comma is enough to
  // get past that: englishScore divides by length - 1 and "s," is not a
  // common English pair, so "accepts," scores below the bar that "accepts"
  // clears, the dictionary is never consulted, and a word EN_LEXICON knows
  // perfectly well becomes a Hebrew candidate. Two of them in a row is a run,
  // which is how "detections, accepts, rejects, manual" was offered as
  // שבבקפאדת רקחקבאדת — ordinary English prose, nothing mistyped in it.
  //
  // Measured over 735 paragraphs of real English, typed a word at a time, the
  // way the product actually runs.
  if (unmistakablyEnglish(lower)) return false;
  if (englishScore(lower) >= 0.30 && hebrewScore(mapped.join('')) < HE_SURE) return false;
  return true;
}

// English words that are also ordinary words in one of the other five
// languages, where the English dictionary must not have the final say.
//
// Hebrew has carried a list like this inside unmistakablyEnglish since 4.26 —
// are=שרק, cut=בוא, her=יקר and eight more. The same collisions exist in every
// language and nothing was holding them, because until now no language but
// Hebrew consulted EN_LEXICON at all.
//
// Built from the corpus rather than from guesswork: every token of every
// mistyped sentence, in all six languages, that the English dictionary claims.
// That found eight, of which these five are genuine words in their own
// language and three are not — "email" inside a Greek sentence really is the
// English word, and belongs to English.
const ALSO_A_WORD = {
  el: new Set(['den', 'kai', 'ston']),    // δεν, και, στον
  ru: new Set(['vs']),                    // мы
  ar: new Set(['arm']),                   // شقة
  uk: new Set(),
  ko: new Set(),
};

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
// ── Three-letter English ──────────────────────────────────────
// EN_LEXICON was built from words of four letters and up, and
// unmistakablyEnglish refuses to score anything shorter, so every
// three-letter English word was invisible to every English guard in this
// file. "run" maps to רומ and "far," to כשרת, neither is in any list, and
// two of them beside each other is a run — which is how "This was the best
// run so far, but it's still not very" was offered as Hebrew.
//
// Eleven of the 672 are left out, because the list cannot settle them:
// are=שרק, cut=בוא, her=יקר, act=שבא, ago=שעם, two=א'ם, chi=בין and a few
// names are ordinary words in both languages at once. Calling those English
// would veto some of the commonest words in Hebrew, so they keep the
// treatment they already had — the bridge rule, which lets a word enclosed
// by wrong-layout text stay inside the run, and is what keeps
// "tueh cut brtv nv eurv gfahu" whole.
const EN_SHORT = new Set('the and for you not all new was can has but our one may out use any see his who web now get how its top had day buy add jan she sex set map way off did car dvd own end him per big law art usa old non why low man job too men box gay air yes hot say dec san tax got let red key few age oct pay war nov fax yet sun rss run net put try god log faq fun feb sep lot ask due mar pro url aug apr via bad far jul jun oil bit bay bar dog eur pdf usr mon com gas six pre sat zip bid fri wed inn ltd los inc win bed tue ass thu sea tel kit boy est son mac iii gmt max xml bin van ads pop int hit eye usb php etc msn fee las min aid fat saw pst xxx tom sub led fan ten cat die pet guy dev cup vol lee bob fit met www cum ice llc sec bus bag ibm nor bug mid jim del joe cds lab cvs des lcd ave pic tag mix vhs fix ray dry spa con ups var won doc mom row usd eat aim les ann tip ski dan fly hey bbc tea avg sky rom toy src hip dot hiv pda dsl zum dna tim sql don gps acc cap ink pin raw gnu ben aol hat lib utc der cam wet ram fox arm pub hop gun sam pdt ref kid pan psp und nfl iso sum oak vat sir kim spy res sit wow que fig tab css qty bio pcs von sci edt sin ing ftp med leg abc jay gap biz rob era gcc asp jet par mad ken exp pen joy cpu ran jon ill lbs lay lol mph bet def nba epa ron org dad pat reg nsw ear pci tie ian mod bmw cst ceo rep mit sri toe api urw lan sms nec den aud lie crm amp usc amd eve pad rod hrs sad cal pot img rpm pee tvs egg mhz lat sur rev nyc jam rio arc mrs app roy ion tit fed ban zus ent odd ext amy phd cry zoo aka tee cad tcp dir val ghz hub eng ace sue gbp rfc seo isp ins jpg ssl opt flu mlb rap tin oem rat dos plc msg cod gen nhl gel aaa std vid bbw fda thy tri pal mat ted gym kde tan alt pie cbs bow hon atm cox cms vic pos nav cab ist dam cnn lil das sys icq dns pty sox tub ash ali tft jvc cgi por mem tap vii bee cfr pmc mba pit mag gsm ddr rec ton gif gpl irc bra phi mls cow cet ppc div ons ide rpg tgp leo diy geo doe ati wal abs sim rna rid rip buf sol eco bat lip sap ict sku pts rrp ooo nhs aye ste col une tex cia dod neo dig nat dpi gis loc gui ver rim zen dis kay ser fwd aus hwy nam gdp pig lit una ada yrs foo gba sig duo fog str vip yea fur tar soc rug dem wav ham fbi tba sie eva rca gst bon mas len kai dom obj jar cos pac erp vpn fcc eds wax nut irs bye cdt ana eau mil lap sao gmc asn ppm ant apt inf eos vcr uri gem psi pct qld pas gig sas liz ccd llp boc tmp ate fin mud uni ala dip nbc mpg cas cio upc dui yen lid pvc enb til hay isa pix mic ata nil pam cop dim mai abu mtv leu lou pgp sip dee mae mel sic seq wma cir acm ips dsc mia wan gtk ira sen dts pod dat soa cho wit bbs ind qui mug ids'.split(' '));

function unmistakablyEnglish(lower) {
  // Trailing , . and ; are letters on the Hebrew layout — ת ץ ף — so every
  // lookup below misses on a word that carries one, and the word sails
  // through as wrong-layout text. "Hi team, akuo nvhs ekhu" absorbed "team,"
  // into the Hebrew run and offered to replace it with אקשצת: a word the user
  // typed on purpose, rewritten as gibberish, in the middle of an otherwise
  // correct fix. Every caller passed the raw token, so the guard that exists
  // precisely to stop this was answering a question about "team," when the
  // word in front of it was "team".
  //
  // Only the lookups are bared. The callers still map the full token,
  // punctuation included, because "מילה," is a word plus a comma and has to
  // keep converting.
  const bare = lower.replace(/[,.;]+$/, '');
  if (bare !== lower && bare.length >= 2 && unmistakablyEnglish(bare)) return true;
  if (EN_WORDS.has(lower)) return true;
  // Three letters, from the same frequency list as EN_LEXICON. The score
  // below still means nothing at this length — this is the list doing the
  // work, not the arithmetic.
  if (lower.length === 3 && EN_SHORT.has(lower)) return true;
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
  // One letter is a word in most of these languages, and in Russian it is the
  // commonest one there is: Я, в, с, и, у, к. "Z" is Я, and Я starts a third of
  // the Russian corpus — eleven of the thirteen Russian sentences that fixed
  // only partway lost exactly that word, off the front of their own sentence.
  //
  // Safe because this is only ever asked about a word next to, or inside, a run
  // that has already been earned, and because "a" and "i" — the two English
  // words this could otherwise swallow — are in EN_WORDS and refused by the
  // grower before it gets here.
  if (lower.length < 1 || (maxLen && lower.length > maxLen)) return false;
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
// Where the run sits in the text, matched as whole words.
//
// indexOf matches substrings, and a run's last word is often one or two
// characters — so "א" was found inside "אםה" at position 0 and an eight-word
// sentence collapsed to its first word. What reached the user was a toast
// offering "tov" for "tov i dont know what to tell you", and then, because
// showToast refuses to regress to a smaller detection, that stunted offer sat
// frozen on screen while they kept typing. Reported three times with
// screenshots before the cause was found, each time looking like the toast
// had stopped following the sentence; it had, but the span was the reason.
//
// A match counts only when whitespace or an edge sits on both sides of it.
//
// Looking only at the first and last word is not enough either, because a run
// can repeat a word. Someone typed "wait wait" on the Hebrew layout — ‫'שןא
// 'שןא‬ — and the search for the last word started at the first word's own
// position and found the first word again, so a two-word run produced a
// one-word span and the toast offered to fix half of what they had typed.
// Any repeated word does this: "hello hello", "ok ok", "wait please wait".
//
// So the run is walked in order instead, each word located at or after the
// end of the one before it. A word that cannot be placed is stepped over
// rather than failing the span, which keeps the old behaviour for tokens the
// tokeniser has rewritten (stripped brackets, split punctuation) and still
// anchors the end on the last word that was found.
function findRunSpan(text, words, lastWord) {
  // Legacy two-word form, which the tests and older call sites use: the same
  // word twice means a run of one.
  if (!Array.isArray(words))
    words = (lastWord === undefined || words === lastWord) ? [words] : [words, lastWord];
  if (!words.length) return null;

  const lt = text.toLowerCase();
  const whole = (i, len) =>
    i !== -1 &&
    (i === 0 || /\s/.test(text[i - 1])) &&
    (i + len === text.length || /\s/.test(text[i + len]));
  // Fall back to the loose match rather than giving up: a token carrying
  // punctuation the tokeniser kept but the text spaces differently still has
  // to produce a span, and a loose one is better than none.
  const find = (needle, from) => {
    for (let i = lt.indexOf(needle, from); i !== -1; i = lt.indexOf(needle, i + 1))
      if (whole(i, needle.length)) return i;
    return lt.indexOf(needle, from);
  };

  const fw = words[0].toLowerCase();
  const fi = find(fw, 0);
  if (fi === -1) return null;

  let end = fi + fw.length;
  let found = words.length === 1;
  for (let n = 1; n < words.length; n++) {
    const w = words[n].toLowerCase();
    const i = find(w, end);
    if (i === -1) continue;          // not placeable here — step over it
    end = i + w.length;
    if (n === words.length - 1) found = true;
  }
  // The last word has to be somewhere, or this is not the run it claims to be.
  if (!found) return null;
  const span = text.slice(fi, end);

  // A span may not be bigger than the run it describes.
  //
  // This is anchored on the first occurrence of the run's first word, which
  // is almost always right and is catastrophic when it is not. A run is a
  // handful of adjacent words, but its first word is an ordinary one that
  // also appears early in any long text — so on a pasted document the span
  // started near the top, ran to the real run near the bottom, and the offer
  // was four thousand characters of somebody's English rewritten as Hebrew.
  // Measured on an 80-line paste: the whole document, every time. Pressing
  // Fix would have destroyed it.
  //
  // Picking the shortest span instead was tried and is worse: it truncates
  // real sentences whose first word repeats, and cost Russian, Greek and
  // Arabic a corpus conversion each. The run is contiguous and its length is
  // known, so the honest check is against that length. Anything wider is not
  // this run, and the caller falls back to joining the run's own words.
  //
  // Four tokens of slack for the bridge material a run legitimately spans —
  // a lone geresh, a short enclosed English word.
  if (span.split(/\s+/).filter(Boolean).length > words.length + 4) return null;
  return span;
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
    .map(w => w.replace(/^[?!(){}]+|[?!(){}]+$/g, ''))
    // One character is kept. It cannot start a run — every language's own test
    // demands two — but it can be bridged over or grown into, and in Russian
    // and Ukrainian it is the commonest word there is: "Z" is Я. Dropping it
    // here meant Я never reached the run assembly at all, so a third of the
    // Russian corpus lost the first word of its own sentence.
    // The character class is every key that carries a letter on one of the six
    // layouts, not just the Latin ones. On the Arabic layout [ ] ` and / are
    // letters — المساعدة is "hglshu]m" — and this filter was throwing those
    // tokens away whole before any language saw them. Same for the leading and
    // trailing brackets stripped above: on Arabic they are part of the word.
    .filter(w => /^[a-z,;.'\[\]`\/]+$/i.test(w) && w.length >= 1);
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

    // Real Hebrew written after the mistake is not part of the mistake.
    //
    // The run is collected backwards from the end of the line and takes every
    // Hebrew word it meets, so Hebrew the person wrote on purpose, sitting
    // after a wrong-layout run, is pulled in with it. Measured: after "create
    // a code for me to unlock the launch" typed on the Hebrew layout, adding
    // שלום offered "... launch akuo", תודה רבה offered "... ,usv rcv", and
    // תחילת הרווחים offered "... ,jhk, vruujho". Pressing Fix would have
    // replaced the person's own Hebrew with gibberish, which is the worst
    // thing this extension can do.
    //
    // looksLikeRealHebrew does not catch it: it needs two recognised Hebrew
    // words, or a third of the run, and a word or two of real Hebrew at the
    // end of a nine-word English run is neither. It is also the wrong shape of
    // answer — the run is not entirely Hebrew, it just does not end where it
    // thought. So the tail is trimmed instead of the whole thing vetoed, and
    // what is left converts as it always did.
    //
    // A word is trimmed only when all three hold: it is long enough to mean
    // something, its English reading is not English, and its Hebrew reading is
    // Hebrew the language actually uses. The first word that fails any of
    // those stops the trim — the run is contiguous, so one real word is where
    // the mistake ends.
    // Once one real word has been trimmed, a short Hebrew word in front of it
    // is almost certainly part of the same phrase, so the length bar drops to
    // whatever the Hebrew dictionary will vouch for. Without this, "מה שלומך"
    // lost שלומך and kept מה, and the fix still ate a word of real Hebrew.
    const runUntrimmed = run1.slice();
    let trimmed = 0;
    while (run1.length > 1) {
      const w  = run1[run1.length - 1];
      const he = w.replace(/[^֐-׿]/g, '');
      if (he.length < HE_EVIDENCE_MIN && !(trimmed && isCommonHebrewWord(he))) break;
      const en = convertToEnglish(w).replace(/[^a-z]/gi, '').toLowerCase();
      if (unmistakablyEnglish(en) || realEnglishWord(en) || englishEnough(en)) break;
      if (!(isCommonHebrewWord(he) || hebrewScore(he) >= HE_SURE)) break;
      run1.pop();
      trimmed++;
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
        const spanText = findRunSpan(text, hebrewInRun);
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
        // On the run as it was collected, not as it was trimmed. Trimming
        // takes away exactly the words this veto counts as evidence, so
        // judging the trimmed run let three real Hebrew sentences through:
        // the tail was removed and what was left no longer had two
        // recognisable words in it.
        if (looksLikeRealHebrew(runUntrimmed)) return null;

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
              if (realEnglishWord(w)) { hasCommonWord = true; return acc + 2; }
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
        // Punctuation is not Greek and does not need to be. Requiring every
        // character to be a Greek letter meant one comma disqualified the whole
        // run: "υεσ, ι ψαν δο τηατ, βθτ νοτ βεφορε φριδαυ" is "yes, i can do
        // that, but not before friday" and was silent, as was every other
        // sentence with a comma in it — fifteen of the eighteen that were left.
        // The three others were "quick", "question" and "quick" again, where q
        // is the accent key and produces a semicolon.
        const passesThrough = c => !/[Ά-ώa-z]/i.test(c);
        const allMapG = elInRun.every(w =>
          [...expandGreekTonos(w)].every(c => EL_TO_EN[c] !== undefined || passesThrough(c)));
        if (allMapG) {
          const originalG1  = elInRun.join(' ');
          const convertedG1 = convertFromGreek(originalG1);
          if (convertedG1.trim().length >= 2 && !GREEK_RE.test(convertedG1)) {
            const convWordsG1 = convertedG1.split(/\s+/)
              .map(w => w.replace(/[^a-z]/gi, '').toLowerCase())
              .filter(w => w.length >= 2);
            const hasCommonG1 = convWordsG1.some(w => realEnglishWord(w));

            // Counting Greek words alone was half an argument. "πλεασε σενδ με
            // τηε φιλε τομορρος μορνινγ" converts back to "please send me the
            // file tomorrow morning" — seven English words — and was silenced
            // because two of the Greek tokens, με and το, happen to be real
            // Greek words. Real Greek does not convert into a sentence.
            //
            // So both sides are counted and the larger one wins. The Greek
            // count still decides on its own when English has nothing to say,
            // which is what the guard was protecting.
            const englishWordsInRun = convWordsG1.filter(w => realEnglishWord(w)).length;
            if (greekWordsInRun >= 2 && englishWordsInRun <= greekWordsInRun) {
              // Greek explains it at least as well. Leave it alone.
            } else {
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
          const hasCommonK1 = convWordsK1.some(w => realEnglishWord(w));
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
            const hasCommonU1 = convWordsU1.some(w => realEnglishWord(w));
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
            const hasCommonR1 = convWordsR1.some(w => realEnglishWord(w));
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
            const hasCommonA1 = convWordsA1.some(w => realEnglishWord(w));
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

  // One English word inside a Hebrew sentence still has to read as Hebrew.
  //
  // minRun drops to 1 as soon as the text contains any Hebrew, which is right
  // — somebody writing Hebrew who fumbles a single word should get it back —
  // and it meant any English token at all sitting in a Hebrew sentence was
  // offered for conversion. From a Gmail thread: "לגבי qbe axa וכו' - מה
  // דעתך?", where axa is the insurer, offered as שסש. Brand names, product
  // names and acronyms live in Hebrew sentences constantly.
  //
  // The lone word has to produce Hebrew somebody would write: a word the
  // dictionary knows, or a reading whose bigrams are Hebrew's own. מה and
  // שלום clear it; שסש does not, and neither does any other three letters
  // that merely happen to map.
  // 0.40, which is where the curve flattens. Measured against 61 real company
  // and insurer names dropped into a Hebrew sentence, against single mistyped
  // words inside the Hebrew corpus:
  //
  //     bar 0.60   5 of 61 brands fire   89 of 165 real words caught
  //     bar 0.50   5                     93
  //     bar 0.40   5                     93
  //     bar 0.33   6                     95
  //
  // Nothing is bought between 0.40 and 0.60 and four real catches are paid
  // for, so HE_SURE is the wrong number here. Below 0.40 the brand count
  // starts moving. Picking 0.25 would have restored every catch and sits
  // 0.05 above the highest brand score in the sample, which is fitting the
  // threshold to the examples rather than measuring it.
  //
  // The five that still fire — kpmg, chubb, esurance, cna, renre — read as
  // plausible Hebrew by bigram and nothing short of a brand list separates
  // them. That is the residue, and it is named rather than hidden.
  const HE_SOLO_IN_MIXED = 0.40;
  const soloInMixed = (w) => {
    const he = convertToHebrew(w.toLowerCase()).replace(/[^\u0590-\u05FF]/g, '');
    if (!he) return false;
    return isCommonHebrewWord(he) || hebrewScore(he) >= HE_SOLO_IN_MIXED;
  };

  // Use the last (most recent) run that meets the minimum threshold
  const runEntry = [...allRuns].reverse().find(r => {
    if (!isRealRun(r)) return false;
    const heWords = r.words.filter(w => wordCouldBeHebrew(w));
    if (r.words.length === 1 && soloHebrewWord(r.words[0])) return true;
    if (heWords.length < minRun) return false;
    if (heWords.length === 1 && !soloInMixed(heWords[0])) return false;
    return true;
  });
  let run = runEntry ? [...runEntry.words] : [];
  const hebrewCount = run.filter(w => wordCouldBeHebrew(w)).length;
  // One word, clearing the much higher solo bar, counts as a run on its own.
  const soloOk = !!runEntry && runEntry.words.length === 1 &&
                 soloHebrewWord(runEntry.words[0]);
  const enoughRun = soloOk ||
    (hebrewCount >= minRun && (hebrewCount > 1 || soloInMixed(run.find(wordCouldBeHebrew))));

  // Context extension: scan backwards AND forwards from the confirmed run.
  // In pure-English text (textHasHebrew=false) use mapsToHebrew (strict: valid Hebrew mapping
  // + no final-form at non-final position). In mixed text (textHasHebrew=true) use the looser
  // physicallyMapsToHebrew — final-form at non-final is actually evidence of wrong layout,
  // and common English words (you/are/can…) that happen to map to Hebrew chars ARE wrong-layout
  // in a sentence that already contains real Hebrew.
  const extCheck = textHasHebrew ? physicallyMapsToHebrew : mapsToHebrew;

  if (enoughRun && runEntry) {
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

  if (enabledLangs.he && enoughRun) {
    // Use the actual text span from first→last run word so intermediate single-char
    // words (e.g. 'w' → Hebrew apostrophe/geresh) are preserved in original/converted.
    const spanText = findRunSpan(text, run) || run.join(' ');
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
    // Three syllables is the line. It was four, and four is wrong: Korean
    // chat is built out of three-syllable words — 뭐해요, 고마워, 아니요,
    // 했어요, 알았어 — and every one of them was silent. Greetings went from
    // 70% to 90% and chat from 50% to 90% by moving it one syllable.
    //
    // Measured rather than argued, because this is the rule most likely to
    // flood somebody with false positives: every word in EN_LEXICON alone and
    // 20,000 random English pairs produce the identical count at three that
    // they produce at four — 6 and 53, none of the pairs Korean. At two it
    // collapses: 28 singles and 229 pairs, 173 of them claimed by Korean.
    // So the cliff is between two and three, not three and four.
    //
    // 안녕 (2) still needs a neighbour. 안녕하세요 (5) still speaks for itself.
    // wordCouldBeKorean has already required a complete syllable decomposition
    // and rejected anything English-looking before a token reaches here.
    const koSoloRun = w => {
      const ko = convertToKorean(w);
      // Four syllables used to be evidence on its own, and it is not: 470
      // ordinary English words fell out as four clean syllables and fired.
      // A Korean stem at the front of the word is evidence; length is not.
      // Three syllables is still the floor. Moving the word-list check above
      // it let 안녕 speak on its own, which two separate tests exist to stop:
      // two syllables is not enough evidence from anybody.
      if (ko.length < 3) return false;
      if (COMMON_KO_WORDS.has(ko)) return true;
      for (let n = ko.length; n >= 2; n--) if (KO_STEMS.has(ko.slice(0, n))) return true;
      return KO_ENDINGS.some(e => ko.endsWith(e));
    };
    const allKoRuns = collectRuns(koCandWords, wordCouldBeKorean, scriptBridge(EN_TO_KO));

    const koRunEntry = [...allKoRuns].reverse().find(r => isRealRun(r) &&
      (r.words.length >= koMinRun ||
       (r.words.length === 1 && koSoloRun(r.words[0]))));
    if (koRunEntry) {
      const runKo2 = growRun(koCandWords, koRunEntry, scriptGrower(EN_TO_KO));
      const spanKo2 = findRunSpan(text, runKo2) || runKo2.join(' ');
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

    // One word may speak, at a much higher bar than a word inside a run.
    //
    // привет, спасибо, хорошо, конечно — and مرحبا, شكرا, تمام — are whole
    // messages, and every one of them was silent: one-word phrases scored
    // 0 of 8 in Russian and 0 of 7 in Arabic. The two-word rule is what keeps
    // the Latin languages honest, so it is lifted only for a word the
    // language's own word list knows, or one whose reading scores well above
    // the bar a word inside a run has to clear, and never below four letters.
    const ruSoloRun = w => {
      const ru = convertToRussian(w.toLowerCase().replace(/[,.;:!?]+$/, ''));
      // An ordinary English word whose keystrokes happen to spell a real
      // Russian one is not evidence of anything: "herb" is руки. The
      // dictionary gets the final say, exactly as it does for Hebrew solo.
      if (unmistakablyEnglish(w.toLowerCase())) return false;
      return ru.length >= 4 && COMMON_RU_WORDS.has(ru);
    };
    const ruRunEntry = [...allRuRuns].reverse().find(r => isRealRun(r) &&
      (r.words.length >= ruMinRun ||
       (r.words.length === 1 && ruSoloRun(r.words[0]))));
    if (ruRunEntry) {
      const runRu2 = growRun(ruCandWords, ruRunEntry, scriptGrower(EN_TO_RU));
      const spanRu2 = findRunSpan(text, runRu2) || runRu2.join(' ');
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
      const spanUk2 = findRunSpan(text, runUk2) || runUk2.join(' ');
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

    const arSoloRun = w => {
      const ar = convertToArabic(w.toLowerCase().replace(/[,.;:!?]+$/, ''));
      // "high" is اهلا. Same rule as Russian above.
      if (unmistakablyEnglish(w.toLowerCase())) return false;
      return ar.length >= 4 && COMMON_AR_WORDS.has(ar);
    };
    const arRunEntry2 = [...allArRuns2].reverse().find(r => isRealRun(r) &&
      (r.words.length >= arMinRun ||
       (r.words.length === 1 && arSoloRun(r.words[0]))));
    if (arRunEntry2) {
      const runAr2 = growRun(arCandWords, arRunEntry2, scriptGrower(EN_TO_AR));
      const spanAr2 = findRunSpan(text, runAr2) || runAr2.join(' ');
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
      const spanEl2 = findRunSpan(text, runEl2) || runEl2.join(' ');
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
    // The line the span came out of, carried along so the toast can show the
    // fix in place — which words change and which are being left alone. This
    // is the only spot that knows it: every detection is built per line, in a
    // dozen different branches, none of which can see the whole field.
    if (result) { result.line = line; return result; }
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
  /* The words being changed carry the colour and the strike; the rest of the
     line sits around them, dim and untouched, so it is obvious at a glance
     what Kiko is about to rewrite and what it is leaving alone. <mark> is
     yellow-on-black by default in every browser, so both rules reset it. */
  .kld-preview-orig {
    color: #64748b; font-size: 12px;
    margin-bottom: 2px; word-break: break-word;
    unicode-bidi: plaintext; direction: auto;
  }
  .kld-preview-orig .kld-mark {
    color: #f87171; background: rgba(248,113,113,.14);
    text-decoration: line-through;
    border-radius: 3px; padding: 0 2px;
  }
  .kld-preview-arrow { color: #475569; font-size: 11px; margin: 0 2px; }
  .kld-preview-new { direction: auto; color: #64748b; }
  .kld-preview-new .kld-mark {
    color: #7dd3fc; background: rgba(125,211,252,.14);
    border-radius: 3px; padding: 0 2px;
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
// What the toast on screen is actually offering, as opposed to the last thing
// analyzeText worked out. They are not the same, and treating them as the same
// is how a toast comes to sit there offering a sentence the person finished
// typing several keystrokes ago.
//
// Reported twice with screenshots: a field reading "why cant they get to" under
// a toast offering "why cant th", and a field reading "מעדיף את זה עם מסך קטן"
// under one offering four of its six words. Neither span is produced by any
// version of the engine from that text — it had already moved on, and the toast
// had not.
//
// showToast has two branches that assign lastDetection and return without
// rendering anything. After either of them lastDetection sits ahead of the DOM,
// and the duplicate check — which means "is this the same as what we showed?" —
// starts answering yes about a toast that was never shown. The question is only
// worth asking about the screen.
let shownDetection     = null;
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
// Alt+Enter, with Alt+Shift+Enter still accepted for anyone who learned it.
//
// Plain Enter was asked for and is not on offer at any price: in Gmail,
// Slack, WhatsApp Web, LinkedIn and every search box, Enter sends. The toast
// appears 350ms after typing stops, and pressing Enter to send is the thing
// people do immediately after typing stops — so the collision would not be an
// edge case, it would be the normal case, and the failure mode is Kiko
// rewriting a message instead of sending it. Dropping Shift is the part of
// that request that can be honoured safely.
const ACCEPT_KEYS = IS_MAC ? '⌥⏎' : 'Alt+↵';

function isAcceptShortcut(e) {
  return !!(e.altKey && !e.ctrlKey && !e.metaKey &&
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

  // Very long runs just pulse the hint bubble — don't cover the screen.
  // forceShow = true bypasses this so hint-click always opens the full toast.
  //
  // The bar was ten words, and the preview has shown thirty since 4.6. So
  // every run between the two — which is most of a chat message — was
  // demoted to a hint although the toast could have shown all of it. The
  // sentence in the report is twelve words, fourteen tokens once the geresh
  // in "want" and "sweep" splits them, and it never had a toast of its own
  // at all. Both numbers are now the same number.
  //
  // This is the freeze, and it is the one that was reported again and again
  // as "it stops after a few words". Screenshotted in a ChatGPT box: a toast
  // reading "ok if i" sitting over a field that said "ok if i want to run the
  // sweep campaign where do i begin?". The engine was never wrong — every
  // build back to 4.14 converts that sentence whole — but it never got to
  // say so. The run passed ten words, this branch took over, and it returned
  // without touching the toast already on screen. So the offer stayed pinned
  // at the last thing under ten words, which for a sentence that starts with
  // three one and two-letter words is three words, and every keystroke after
  // that only pulsed the hint.
  //
  // Whatever is on screen has to go when this branch takes over: the hint is
  // the whole point of it, and a stale offer underneath that hint is worse
  // than no offer, because pressing it converts a fragment.
  if (!forceShow && detection.words.length > PREVIEW_MAX_WORDS) {
    const prevSig = lastDetection ? lastDetection.words.join('|') : '';
    lastDetection = detection;
    lastElement   = element;
    if (activeToast) { activeToast.remove(); activeToast = null; shownDetection = null; }
    if (sig !== prevSig) { hideHint(); showHint(); }
    else if (!hintEl)    showHint();
    return;
  }

  // Same detection as the one already on screen — leave the toast alone
  if (!forceShow && isDuplicateOfVisibleToast(sig, shownDetection, activeToast)) return;

  // Guard: don't regress to a smaller detection on the same element — but
  // only while the text it is protecting is still in the field.
  //
  // This is the freeze. Reported as "Kiko stops working when I switch tabs,
  // then I delete and retype and it works", and tabs have nothing to do with
  // it: leaving a toast on screen and then typing any *shorter* mistake is
  // enough. Returning here leaves the existing toast untouched, so the offer
  // on screen stays pinned to a sentence that is no longer there, and every
  // shorter detection after it is dropped in silence. Measured in a real
  // browser: field "ghbdtn rfr", toast still reading "akuo nvhs ekhu vuc nv
  // akunl", focus fine, page visible.
  //
  // This exact fix was written in 4.19 and removed again because reverting it
  // failed no test. That was my error, not the fix's: the test deleted text
  // and something else cleared the toast before the guard was reached. The
  // case that reaches it is replacing the text with a different, shorter
  // mistake, which is what a person does all day.
  if (activeToast && lastDetection && lastElement === element) {
    const fieldNow = element.isContentEditable
      ? (element.innerText || element.textContent || '')
      : (element.value || '');
    const stillThere = !!lastDetection.original && fieldNow.includes(lastDetection.original);
    if (stillThere && detection.words.length < lastDetection.words.length) return;
  }

  detection          = localiseDetection(detection);
  lastDetection      = detection;
  lastElement        = element;
  dismissedSignature = null;
  dismissedWordSet   = new Set();
  hideHint();
  if (activeToast) { activeToast.remove(); activeToast = null; shownDetection = null; }
  injectStyles();

  stats.detected++;
  try { chrome.storage.local.set({ stats }).catch(() => {}); } catch {}
  playDetectionSound();

  // Show the fix where it lands: the rest of the line stays visible and dim,
  // the part being rewritten is marked. Asked for as "highlight the words",
  // and this is the half of it that touches nobody's text — marking inside
  // the field itself means either an overlay mirroring the input's metrics or
  // wrapping the user's own DOM in a span, and in an editor that rebuilds
  // itself every keystroke that is how text gets corrupted.
  const ctx = spanContext(detection.line, detection.original);
  // The mark is always emitted, context or not: it carries the colour and the
  // strike-through, so dropping it when there is nothing around the span
  // would quietly un-style the most common toast there is.
  const inContext = (mid) => {
    const marked = `<mark class="kld-mark">${escapeHtml(truncatePreview(mid))}</mark>`;
    return ctx ? escapeHtml(ctx.before) + marked + escapeHtml(ctx.after) : marked;
  };

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
      <div class="kld-preview-orig">${inContext(detection.original)}</div>
      <span class="kld-preview-arrow">→</span><span class="kld-preview-new">${inContext(detection.converted)}</span>
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
      // Undo in a contenteditable too, which is where it was missing and
      // where most people type: Gmail, Slack, Notion, Base44. The snapshot
      // route only ever worked on an input, so the button simply never
      // appeared in the editors that matter, and the advice in the old
      // comment — "contenteditable uses browser Ctrl+Z" — is not true of a
      // framework editor that rebuilds its own DOM.
      //
      // The inverse is the same call with the two strings swapped, so it
      // reuses every bit of applyConversion's editor handling rather than
      // inventing a second, worse path.
      const undoFn = () => {
        const back = undoSnapshot
          ? (element.value = undoSnapshot.val,
             element.selectionStart = element.selectionEnd = undoSnapshot.sel,
             element.dispatchEvent(new Event('input',  { bubbles: true })),
             element.dispatchEvent(new Event('change', { bubbles: true })),
             true)
          : applyConversion(element, { ...detection,
              original: detection.converted, converted: detection.original });
        // Putting the mistake back must not instantly offer to fix it again.
        if (back) {
          fixCooldownUntil   = Date.now() + 4000;
          dismissedSignature = detection.words.join('|');
          dismissedWordSet   = new Set(detection.words);
        }
      };
      showConfirm(`✓ Fixed! Switch keyboard: ${kb}`, undoFn);
      // One slot, two things that might want it, and an order that matters.
      // A grant announcement follows a fix that has just visibly worked; a
      // review ask must never follow the grant in the same breath.
      setTimeout(async () => {
        if (await maybeAnnounceRelaunch()) return;
        maybeShowReviewToast();
      }, REVIEW_DELAY_MS);
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
  activeToast    = toast;
  shownDetection = detection;

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
  setTimeout(() => el.remove(), undoFn ? 8000 : 2800);
}

function removeToast(showRecall = true) {
  if (activeToast) { activeToast.remove(); activeToast = null; shownDetection = null; }
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
// Long enough after the confirm that the two are never on screen together,
// and never in the same place. The confirm runs eight seconds when it is
// carrying an Undo button, so this follows it rather than landing on top:
// test-review asserts the ordering, and caught this when the confirm was
// lengthened from five seconds without moving the nudge with it.
const REVIEW_DELAY_MS   = 9000;
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
    toast.remove(); if (activeToast === toast) { activeToast = null; shownDetection = null; }
  };
  const snooze = () => close('snoozed', REVIEW_SNOOZE_MS);   // they answered
  const unseen = () => close('quiet',   REVIEW_QUIET_MS);    // they never saw it
  toast.querySelector('#kld-rv-rate').addEventListener('click', () => {
    try { chrome.storage.local.set({ reviewNudge: { state: 'done' } }).catch(() => {}); } catch {}
    toast.remove(); if (activeToast === toast) { activeToast = null; shownDetection = null; }
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
//
// It used to be [7, 1]. That meant someone could install Kiko, use it every
// day for three weeks, and hear nothing about a price until seven days before
// it applied — the popup was the only other place the trial existed, and
// people do not open the popup. Being told on day one is not a nag, it is the
// honest version: this is a paid product, here is a month of it.
const TRIAL_NAG_DAYS  = [30, 14, 7, 1];

// The day-30 notice is the odd one out: every other milestone says "time is
// running out", this one says "there is a price at all". It has to arrive
// after Kiko has visibly worked, not before — told to someone who has never
// seen a correction accepted, it is a bill for nothing. So it waits for the
// first accepted fix, however many days that takes.
const TRIAL_WELCOME_DAY = 30;

function welcomeHeld(due, converted = 0) {
  return due === TRIAL_WELCOME_DAY && converted < 1;
}
const KIKO_CHECKOUT   = 'https://getkiko.lemonsqueezy.com/checkout/buy/572c829f-1e66-46bf-86d1-fd4441b5d3dc';

// The expiry notice used to show once, ever. That is the wrong number.
//
// It is the single moment Kiko has to explain itself: detection has just gone
// quiet, and to someone who misses the toast — a background tab, a step away
// from the desk — silence reads as broken software rather than as a trial that
// ended. People uninstall broken software; they do not subscribe to it. It is
// also the best conversion moment there is, and spending it on one fourteen
// second impression is throwing it away.
//
// Three times, a day apart, then it stops. Anyone who has not decided by the
// third has decided.
const EXPIRY_NOTICES  = 3;
const EXPIRY_GAP_MS   = 24 * 60 * 60 * 1000;

// Whether to raise the expiry notice now, and nothing else — no storage, no
// DOM, so the schedule can be tested without either.
// Anyone carrying the old one-shot flag has had the first of the three, not
// none — upgrading must not restart the sequence. Written once and used by
// both halves: when the two disagreed, one could be broken and the other
// would hide it.
function expiryNoticesShown(seen = {}) {
  if (seen.expiredShown != null) return seen.expiredShown;
  return seen.expired ? 1 : 0;
}

function expiryNoticeDue(seen = {}, now = Date.now()) {
  if (expiryNoticesShown(seen) >= EXPIRY_NOTICES) return false;
  return now - (seen.expiredAt || 0) >= EXPIRY_GAP_MS;
}

function spendExpiryNotice(seen = {}, now = Date.now()) {
  return { ...seen, expired: true,
           expiredShown: expiryNoticesShown(seen) + 1, expiredAt: now };
}

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

// `go` is what the primary button does. It defaults to the checkout, because
// every one of these toasts but one is asking for money. The exception is the
// grant: sending somebody to a payment page in the same breath as telling them
// they have two free weeks is the opposite of what the grant is for, so that
// one passes a `go` that simply closes.
function showTrialToast({ title, body, cta, accent, onClose, go, hideLater }) {
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
      ${hideLater ? '' : `<button class="kld-btn kld-reject" id="kld-tr-later">${escapeHtml(t('notNow', null, 'Not now'))}</button>`}
    </div>
  `;
  toast.querySelectorAll('button').forEach(btn => btn.addEventListener('mousedown', e => e.preventDefault()));

  const close = () => {
    toast.remove();
    if (activeToast === toast) { activeToast = null; shownDetection = null; }
    if (onClose) onClose();
  };
  toast.querySelector('#kld-tr-go').addEventListener('click', () => {
    close();
    if (go) go(); else window.open(KIKO_CHECKOUT, '_blank');
  });
  toast.querySelector('#kld-tr-x').addEventListener('click', close);
  const later = toast.querySelector('#kld-tr-later');
  if (later) later.addEventListener('click', close);

  applyPos(toast);
  makeDraggable(toast);
  (document.body || document.documentElement).appendChild(toast);
  activeToast = toast;
  // Longer than a detection toast. This one is worth reading, and unlike a fix
  // suggestion there is nothing the user is mid-way through typing.
  // Not `t`. This function calls t('notNow', …) forty lines above, and a
  // `const t` anywhere in the scope puts that call in the temporal dead zone:
  // it threw ReferenceError every single time, and maybeShowTrialNotice wraps
  // the whole thing in a bare catch, so nobody ever saw the error either.
  //
  // The cost of that was every trial notice this product has: the warning at
  // seven days, the one on the last day, and the notice that the trial has
  // ended. None of them had ever been shown to anyone.
  const dismissTimer = setTimeout(() => { if (activeToast === toast) close(); }, 14000);
  toast.addEventListener('mouseenter', () => clearTimeout(dismissTimer));
  return true;
}

// The trial-ended notice, on its own, so the two callers cannot drift apart.
// maybeShowTrialNotice spends one of the three from the budget; the
// right-click path does not, because that one is not an interruption — the
// user asked for a fix by hand and is owed the reason there isn't one.
// Stacking is impossible either way: showTrialToast refuses while a toast is
// already up.
function showExpiredToast() {
  return showTrialToast({
    title:  t('trialEndedTitle', null, 'Your free trial has ended'),
    body:   t('trialEndedBody', null,
              'Kiko has stopped correcting layout mistakes. Your learned words are '
              + 'safe — subscribing switches detection straight back on. '
              + '$5/month, or $40 for the year.'),
    cta:    t('trialEndedCta', null, 'Keep Kiko'),
    accent: '#f87171',
  });
}

async function maybeShowTrialNotice() {
  try {
    const d = await chrome.storage.local.get(['entitlement', 'trialNotices', 'stats']);
    const ent = d.entitlement;
    if (!ent || ent.state === 'licensed') return;
    const seen = d.trialNotices || {};

    if (ent.state === 'expired') {
      if (!expiryNoticeDue(seen)) return;
      const shown = showExpiredToast();
      if (shown) {
        await chrome.storage.local.set({ trialNotices: spendExpiryNotice(seen) });
      }
      return;
    }

    if (ent.state !== 'trial' || typeof ent.daysLeft !== 'number') return;
    const due = dueTrialMilestone(ent.daysLeft, seen);
    if (due === undefined) return;
    // Not spent, only withheld: it comes back the moment a fix is accepted.
    if (welcomeHeld(due, (d.stats || {}).converted || 0)) return;

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

// ── The moment they actually need it ──────────────────────────
// What an expired user saw before this: the ended notice three times, a day
// apart, and then silence for ever. Silence is indistinguishable from broken,
// and an uninstall note said so in as many words — "it didn't detect my
// keyboard mistakes". By then detection had been off for weeks and they had
// no way to know it was ever on.
//
// Worse, the one moment that matters was the quietest. analyzeText returns
// null before any detection runs when the trial is over, so the instant
// somebody types akuo meaning שלום — the exact second Kiko is worth paying
// for — nothing happens at all.
//
// So the engine keeps running and the fix is what is withheld. Once a day,
// when a real mistake is found, Kiko says it found one.
// Every mistake, not one a day.
//
// It was once a day, and that was too careful. Two uninstall notes now say
// the same thing — "it didn't detect my keyboard mistakes" — from people
// whose trial had simply ended. An expired user types gibberish all morning,
// sees nothing, and concludes the product is broken, which is both wrong and
// the worst thing they could conclude. Kiko did detect every one of them.
//
// So it speaks for every mistake it catches. The only thing held back is the
// same mistake twice in quick succession: a sentence raises detections as it
// grows, and re-announcing the one the user is still typing is noise rather
// than news. A different mistake always speaks, immediately.
const EXPIRED_NUDGE_REPEAT_MS = 2 * 60 * 1000;

// What was last announced, so a growing sentence is one mistake and not six.
// Deliberately in memory and not storage: a new page is a new chance to tell
// someone their product has stopped working.
// The second trial, as content.js sees it. background.js decides who gets one
// and for how long; this file's only job is to say so, once, at the right
// moment. null until loadLearned has run.
let relaunch = null;

// Forty-eight hours. Someone who has not taken a fix in two days of using
// Kiko is not going to be told by the fix, so the detection tells them
// instead — a worse moment, because it costs them that one toast, and still
// far better than a grant nobody hears about.
const RELAUNCH_FALLBACK_MS = 48 * 60 * 60 * 1000;

function relaunchAnnounceDue(r, now = Date.now()) {
  if (!r || !r.until || r.toldAt) return false;   // none, or already said
  if (now >= r.until) return false;               // too late to be good news
  return true;
}

// The fallback is due only once the grant has been sitting unspoken for two
// days of actual use. seenAt is stamped the first time a detection happens,
// not when the grant is written, because an extension that updates while the
// laptop is shut has not been used at all.
function relaunchFallbackDue(r, now = Date.now()) {
  return relaunchAnnounceDue(r, now) && !!r.seenAt && now - r.seenAt >= RELAUNCH_FALLBACK_MS;
}

async function markRelaunchSeen() {
  try {
    if (!relaunchAnnounceDue(relaunch) || relaunch.seenAt) return;
    relaunch = { ...relaunch, seenAt: Date.now() };
    await chrome.storage.local.set({ relaunch });
  } catch {}
}

// Proof first, then the offer. This is called after a fix has been accepted
// and the sentence has visibly gone in whole — which is the thing that did not
// work for five months — so the message lands on something just demonstrated
// rather than on a claim. Returns whether it spoke, because the review nudge
// shares this slot and must not follow it: nobody who has just been told
// their trial reopened should be asked for a star rating in the same breath.
async function maybeAnnounceRelaunch() {
  try {
    if (!relaunchAnnounceDue(relaunch)) return false;
    const days = Math.max(1, Math.ceil((relaunch.until - Date.now()) / 86400000));
    const shown = showTrialToast({
      title:  t('relaunchTitle', [String(days)], `${days} days on us`),
      body:   t('relaunchBody', null,
                'We have just shipped a batch of fixes. Here are two weeks to try '
                + 'them out, on us — nothing charged.'),
      cta:    t('relaunchCta', null, 'Start using Kiko'),
      accent: '#34d399',
      go:     () => {},      // nowhere to send them: they already have it
      hideLater: true,       // and nothing to decline
    });
    if (!shown) return false;
    relaunch = { ...relaunch, toldAt: Date.now() };
    await chrome.storage.local.set({ relaunch });
    return true;
  } catch { return false; }
}

let lastExpiredSig = null;
let lastExpiredAt  = 0;

// Run the engine with the paywall lifted, exactly as bestOfLanguages lifts
// and restores enabledLangs. Nothing is shown from this — the caller decides
// — and nothing leaves the page, same as every other analysis here.
function analyzeIgnoringPaywall(fn) {
  const saved = entitled;
  entitled = true;
  try { return fn(); } finally { entitled = saved; }
}

// What the notice says, and does not say. It reports that a mistake was
// found and how many words it covers; it does not show the correction.
// Handing over the fix is handing over the product to exactly the
// people who are deciding whether to buy it, and they have already watched it
// work for thirty days — the question in their mind is not whether it works,
// it is whether they want it back. One line to change if that reads wrong:
// pass detection.converted into the body instead of the count.
async function maybeNudgeExpired(detection) {
  try {
    if (entitled || !detection) return false;
    // showTrialToast refuses while another toast is up, so bursts cannot
    // stack however fast somebody types.
    if (activeToast) return false;
    const sig = detection.words.join('|');
    if (!expiredNudgeDue(sig, lastExpiredSig, lastExpiredAt)) return false;
    const n = detection.words.length;
    const shown = showTrialToast({
      title:  t('expiredCaughtTitle', null, 'Kiko just caught a layout mistake'),
      // The price belongs here. The notices *before* the trial ends have
      // carried it since 4.6 — "$5/month, or $40 for the year" — and the two
      // that fire *after* it ends did not, although this is the moment of
      // highest intent there is: they have just made a mistake Kiko will not
      // fix. "Keep Kiko" opened a checkout and the first number they saw was
      // on the payment page. Anyone deciding in two seconds was deciding
      // without the one fact that settles it.
      body:   t('expiredCaughtBody', [String(n)],
                `${n} words you just typed are in the wrong keyboard layout. `
                + `Kiko can put them right in one keystroke — your free trial has `
                + `ended. $5/month, or $40 for the year.`),
      cta:    t('trialEndedCta', null, 'Keep Kiko'),
      accent: '#f87171',
    });
    if (shown) { lastExpiredSig = sig; lastExpiredAt = Date.now(); }
    return shown;
  } catch { return false; }
}

// Separate from the DOM so the rule can be tested without one, the same way
// expiryNoticeDue is. A different mistake always speaks; the same one waits.
function expiredNudgeDue(sig, lastSig, lastAt, now = Date.now()) {
  if (sig !== lastSig) return true;
  return now - (lastAt || 0) >= EXPIRED_NUDGE_REPEAT_MS;
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
    // Someone whose trial has run out and who reaches for the shortcut is
    // asking the one question this extension exists to answer. analyzeText
    // returns null for them before it looks at anything, and the branch below
    // reads that null as "nothing wrong" and says so — "✓ No layout issues
    // found" on a field full of wrong-layout text. That is not a paywall, it
    // is a lie, and it is told at the exact moment the person is trying to use
    // the thing they might pay for.
    //
    // Unlike the automatic notice, this one repeats: they asked.
    if (!entitled) {
      showTrialToast({
        title:  t('trialEndedTitle', null, 'Your free trial has ended'),
        body:   t('trialEndedBody', null,
                  'Kiko has stopped correcting layout mistakes. Your learned words are '
                  + 'safe — subscribing switches detection straight back on.'),
        cta:    t('trialEndedCta', null, 'Keep Kiko'),
        accent: '#f87171',
      });
      return;
    }
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
  if (activeToast) { activeToast.remove(); activeToast = null; shownDetection = null; }
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

function fieldTextOf(el) {
  try {
    return el.isContentEditable
      ? (el.innerText || el.textContent || '')
      : (el.value || '');
  } catch { return ''; }
}

function fieldLength(el) {
  return fieldTextOf(el).length;
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
    if (!entitled) {
      // The engine still runs; only the fix is withheld. Once a day, and only
      // on a real detection, so it lands on a mistake rather than on a timer.
      const found = analyzeIgnoringPaywall(
        () => analyzeFullField(el, midBurst) || analyze(el, midBurst));
      if (found) maybeNudgeExpired(found);
      return;
    }
    const detection = analyzeFullField(el, midBurst) || analyze(el, midBurst);
    if (detection) {
      // Two days of detections and still no fix taken: tell them about the
      // grant here instead, and give this detection up. showTrialToast refuses
      // while a toast is up, so this can only land on an empty screen, and the
      // next keystroke brings the fix offer back.
      if (relaunchFallbackDue(relaunch) && !activeToast) { maybeAnnounceRelaunch(); return; }
      markRelaunchSeen();
      showToast(el, detection);
    } else if (activeToast && shownDetection && lastElement === el &&
               shownDetection.original &&
               !fieldTextOf(el).includes(shownDetection.original)) {
      // Nothing to offer any more, and the text the toast is about is no
      // longer in the field. Until now this branch did not exist: a silent
      // pass simply returned, so the toast stayed where it was, still
      // offering a fix for a sentence that had been edited away. Pressing it
      // then replaced something the person could no longer see.
      removeToast(false);
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
  // Expired means expired. Automatic detection has stopped since 4.8.0, but
  // this path never asked — it checked only that the script was the current
  // version — so "🦜 Fix with Kiko" kept converting text for people whose
  // trial had run out. Found by tracing what actually still works after the
  // thirty days, rather than by assuming one gate covered everything.
  //
  // Answering with the notice rather than doing nothing: a right-click that
  // silently does nothing is the broken-software reading all over again, and
  // this is the best conversion moment there is — they wanted a fix badly
  // enough to go to the menu for it.
  if (!entitled) { showExpiredToast(); return; }
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
