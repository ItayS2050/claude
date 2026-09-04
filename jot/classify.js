// Decides whether a task belongs to work or to the rest of your life.
//
// No model, no network — a word list and a count. That matters: the answer has
// to be instant (it runs on every keystroke in the composer preview) and it has
// to be explainable, because the classifier will be wrong sometimes and the
// only thing that makes a wrong guess tolerable is being able to see which word
// caused it and flip it in one click.

// Two-word signals are checked against the whole sentence; everything else is
// matched token by token.
const WORK_PHRASES = [
  'pull request', 'code review', 'follow up', 'catch up', 'stand up', 'one on one',
  'design doc', 'status update', 'quarterly review', 'performance review',
  'הצעת מחיר', 'הצעת מחירי', 'יום עבודה', 'סטטוס פרויקט', 'ישיבת צוות',
];

const PERSONAL_PHRASES = [
  'walk the dog', 'pick up the kids', 'pick up kids', 'school run', 'dry cleaning',
  'grocery shopping', 'date night', 'car service', 'parents evening',
  'יום הולדת', 'בית ספר', 'חדר כושר', 'בית מרקחת', 'רופא שיניים', 'שכר דירה',
];

const WORK_WORDS = `
meeting meetings standup sync syncs 1:1 client clients customer customers
invoice invoices quote quotes proposal proposals contract contracts deck decks
slides presentation deadline sprint ticket tickets jira linear asana trello
pr prs deploy deployment release releases bug bugs backlog roadmap spec specs
report reports budget forecast revenue pipeline kpi kpis okr okrs
hire hiring interview interviews candidate candidates onboarding offboarding
payroll vendor vendors supplier procurement demo demos pitch investor investors
board stakeholder stakeholders retro retrospective kickoff workshop
conference webinar keynote crm salesforce hubspot slack notion figma github
gitlab jenkins staging prod production api endpoint migration incident
postmortem oncall manager boss team teammate colleague colleagues office
expenses timesheet invoicing quota renewal churn onboard escalation sow nda
מצגת מצגות פגישה פגישות ישיבה ישיבות לקוח לקוחות ספק ספקים חשבונית חשבוניות
דוח דוחות פרויקט פרויקטים משימה משימות דדליין גיוס ראיון ראיונות מועמד
מנהל מנהלת צוות משרד חוזה חוזים משכורת סטטוס עדכון מכירות שיווק תקציב
`.trim().split(/\s+/);

const PERSONAL_WORDS = `
mom mum mother dad father wife husband girlfriend boyfriend partner
kid kids son daughter baby grandma grandpa granny family cousin sister brother
doctor dentist gp clinic pharmacy prescription optician therapist vet
gym workout run running yoga swim pilates haircut barber hairdresser nails
groceries grocery supermarket milk bread eggs coffee dinner breakfast recipe
birthday anniversary wedding gift gifts present flowers party
rent mortgage bills bill electricity gas water insurance council tax
car mot tyres tires petrol garage parking bike laundry dishes vacuum
bins trash recycling plumber electrician landlord cleaner
school kindergarten daycare nursery playdate pickup homework
holiday vacation flight flights hotel airbnb passport visa packing
bank atm savings pension dog cat pet walk shopping mall pharmacy
אמא אבא אישה בעל ילדים ילד ילדה תינוק סבתא סבא משפחה אחות אח
רופא רופאה מרפאה שיניים מרשם וטרינר כושר תספורת ספר מספרה
קניות סופר מכולת חלב לחם ביצים ארוחה מתנה מתנות חתונה מסיבה
ארנונה חשמל מים ביטוח רכב טסט דלק חניה כביסה ניקיון נקיון גינה
גן גננת חופש חופשה טיסה מלון דרכון מזוודה בנק חיסכון כלב חתול
`.trim().split(/\s+/);

// Tags are an explicit statement, so they outrank every guess below them.
const WORK_TAGS = new Set(['work', 'job', 'office', 'biz', 'business', 'client', 'עבודה']);
const PERSONAL_TAGS = new Set(['personal', 'home', 'family', 'life', 'בית', 'אישי', 'משפחה']);

const WORK_SET = new Set(WORK_WORDS);
const PERSONAL_SET = new Set(PERSONAL_WORDS);

// Words too common to mean anything, and too common to be worth learning.
const STOPWORDS = new Set(`
a an the to for of and or with my our this that then than at in on by from
is are was be been do does did get got go going need needs must should
call send make take give find check ask tell put set new old some any all
about into over under out up down off before after again more most
את של עם על אל כל גם רק עוד יש אין זה זו הוא היא אני אנחנו לא כן
`.trim().split(/\s+/));

// Hebrew glues prefixes onto words — "לרופא" is "רופא" with a ל on the front.
// Without this, half the Hebrew vocabulary above never matches anything.
const HE_PREFIXES = ['ל', 'ב', 'ה', 'ו', 'מ', 'ש', 'כ'];

function variants(token) {
  const out = [token];
  if (/^[֐-׿]+$/.test(token) && token.length >= 4) {
    if (HE_PREFIXES.includes(token[0])) out.push(token.slice(1));
    if (token.length >= 5 && HE_PREFIXES.includes(token[0]) && HE_PREFIXES.includes(token[1])) {
      out.push(token.slice(2));
    }
  }
  return out;
}

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}:]+/u)
    .filter(Boolean);
}

/**
 * @returns {{lane: 'work'|'personal'|null, because: string}}
 *   `because` names the word that decided it, for the tooltip on the dot.
 *   A tie, or nothing recognised at all, is left unsorted rather than guessed.
 */
export function classify(text, tags = [], learned = {}) {
  for (const tag of tags) {
    if (WORK_TAGS.has(tag)) return { lane: 'work', because: `#${tag}` };
    if (PERSONAL_TAGS.has(tag)) return { lane: 'personal', because: `#${tag}` };
  }

  const lower = ` ${String(text || '').toLowerCase()} `;
  for (const phrase of WORK_PHRASES) {
    if (lower.includes(` ${phrase} `) || lower.includes(`${phrase} `)) {
      return { lane: 'work', because: `“${phrase}”` };
    }
  }
  for (const phrase of PERSONAL_PHRASES) {
    if (lower.includes(` ${phrase} `) || lower.includes(`${phrase} `)) {
      return { lane: 'personal', because: `“${phrase}”` };
    }
  }

  let work = 0;
  let personal = 0;
  let workWord = '';
  let personalWord = '';

  for (const token of tokenize(text)) {
    for (const form of variants(token)) {
      // What you corrected before beats the built-in list.
      const taught = learned[form];
      if (taught === 'work') { work += 2; workWord = workWord || form; break; }
      if (taught === 'personal') { personal += 2; personalWord = personalWord || form; break; }
      if (WORK_SET.has(form)) { work += 1; workWord = workWord || form; break; }
      if (PERSONAL_SET.has(form)) { personal += 1; personalWord = personalWord || form; break; }
    }
  }

  if (work > personal) return { lane: 'work', because: `“${workWord}”` };
  if (personal > work) return { lane: 'personal', because: `“${personalWord}”` };
  return { lane: null, because: '' };
}

/**
 * Words worth remembering from a task the user re-filed by hand. The three
 * longest non-obvious words carry most of the meaning ("acme", "physio") while
 * "call" and "the" carry none.
 */
export function wordsToLearn(text) {
  return [...new Set(tokenize(text))]
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
}

/** Fold new lessons in, keeping the map small enough to stay in storage. */
export function learn(learned, text, lane) {
  const next = { ...learned };
  for (const word of wordsToLearn(text)) {
    // A word the built-in list already knows is not worth an override entry
    // unless the user is contradicting that list.
    if (lane === null) delete next[word];
    else next[word] = lane;
  }
  const keys = Object.keys(next);
  if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete next[k];
  return next;
}
