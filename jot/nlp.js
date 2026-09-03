// Turns one line of typed or spoken text into a task: what to do, when to be
// reminded, how often, how urgent. Everything it recognises gets cut out of the
// text, so "call mom tomorrow at 5" is left reading just "Call mom".
//
// English and Hebrew, because dictating in Hebrew and getting "מחר" left sitting
// in the title would defeat the point.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const DEFAULT_HOUR = 9;      // a day with no time attached means "morning"
const EVENING_HOUR = 20;     // ...unless the word was "tonight"

// \b only knows about ASCII word characters, so it never matches beside a
// Hebrew letter. These lookarounds are the same idea, spelled in Unicode:
// write << and >> in a pattern and re() expands them.
const LB = '(?<![\\p{L}\\p{N}_])';
const RB = '(?![\\p{L}\\p{N}_])';
const re = (pattern, flags = 'iu') =>
  new RegExp(pattern.split('<<').join(LB).split('>>').join(RB), flags);

const WEEKDAYS = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6,
};

const HE_WEEKDAYS = {
  'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6,
};

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

const DAY_NAMES = Object.keys(WEEKDAYS).concat(Object.keys(HE_WEEKDAYS))
  .sort((a, b) => b.length - a.length).join('|');
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

// Scratch text the matchers eat from. Matched spans are blanked rather than
// spliced out so later patterns still see the original word boundaries.
class Scratch {
  constructor(text) { this.text = text; }

  // Runs `pattern` against what is left and blanks the hit. Returns the match.
  take(pattern) {
    const m = this.text.match(pattern instanceof RegExp ? pattern : re(pattern));
    if (!m) return null;
    this.text = this.text.slice(0, m.index) + ' '.repeat(m[0].length) +
                this.text.slice(m.index + m[0].length);
    return m;
  }

  clean() {
    return this.text
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .replace(/^[\s,.\-–—]+|[\s,.\-–—]+$/g, '')
      // A preposition left dangling by the bit we removed.
      .replace(re('\\s+(on|at|by|in|the|of|ב|בשעה|ל)$'), '')
      .replace(re('^(on|at|by|in|ב|בשעה)\\s+'), '')
      .trim();
  }
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function setTime(date, hour, minute) {
  const x = new Date(date);
  x.setHours(hour, minute, 0, 0);
  return x;
}

// --- time of day -----------------------------------------------------------
// Only patterns that clearly mean a clock time. A bare number counts just when
// something marks it as one ("at 5", "@5", "5pm"), so "buy 5 apples" and
// "invite 12 people" keep their numbers.
function takeTime(sc) {
  let m;

  if (sc.take('<<(noon|midday|צהריים)>>')) return { hour: 12, minute: 0 };
  if (sc.take('<<(midnight|חצות)>>')) return { hour: 0, minute: 0 };

  // 17:30 / 5:30pm / at 5.30
  if ((m = sc.take('(?:<<(?:at|@|around|בשעה|ב)\\s*)?<<(\\d{1,2})[:.](\\d{2})\\s*(am|pm|a\\.m\\.|p\\.m\\.)?'))) {
    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    if (hour <= 24 && minute < 60) {
      const mer = (m[3] || '').toLowerCase().split('.').join('');
      if (mer.startsWith('p') && hour < 12) hour += 12;
      if (mer.startsWith('a') && hour === 12) hour = 0;
      return { hour: hour % 24, minute };
    }
  }

  // 5pm / 5 pm
  if ((m = sc.take('<<(\\d{1,2})\\s*(am|pm|a\\.m\\.|p\\.m\\.)'))) {
    let hour = parseInt(m[1], 10);
    const mer = m[2].toLowerCase().split('.').join('');
    if (mer.startsWith('p') && hour < 12) hour += 12;
    if (mer.startsWith('a') && hour === 12) hour = 0;
    return { hour: hour % 24, minute: 0 };
  }

  // at 5 / @5 / בשעה 5
  if ((m = sc.take('<<(?:at|@|around|בשעה)\\s*(\\d{1,2})>>(?!\\s*(?:min|minutes?|hours?|days?|weeks?|%))'))) {
    let hour = parseInt(m[1], 10);
    if (hour <= 24) {
      // "at 5" means 17:00. Nobody schedules 05:00 without saying "am".
      if (hour >= 1 && hour <= 7) hour += 12;
      return { hour: hour % 24, minute: 0 };
    }
  }

  return null;
}

// --- day -------------------------------------------------------------------
// Returns midnight of the day meant (or {day, evening} for "tonight"), or null.
function takeDay(sc, now) {
  let m;
  const today = startOfDay(now);

  if (sc.take('<<(day after tomorrow|מחרתיים)>>')) return new Date(+today + 2 * DAY);
  if (sc.take('<<(tomorrow|tmrw|tmr|tomo|מחר)>>')) return new Date(+today + DAY);
  if (sc.take('<<(tonight|this evening|הערב|היום בערב)>>')) return { day: today, evening: true };
  if (sc.take('<<(today|היום)>>')) return today;

  // on friday / next monday / thursday
  if ((m = sc.take(`<<(?:(on|next|this|coming|every|each|כל)\\s+)?(?:יום\\s+)?(${DAY_NAMES})>>`))) {
    const word = m[2].toLowerCase();
    const target = word in WEEKDAYS ? WEEKDAYS[word] : HE_WEEKDAYS[m[2]];
    if (target !== undefined) {
      let delta = (target - today.getDay() + 7) % 7;
      if (delta === 0 && /next/i.test(m[1] || '')) delta = 7;
      return new Date(+today + delta * DAY);
    }
  }

  // dec 5 / december 5th / 5 of december
  if ((m = sc.take(`<<(?:on\\s+)?(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?>>`))) {
    return resolveDate(now, MONTHS[m[1].toLowerCase()], parseInt(m[2], 10));
  }
  if ((m = sc.take(`<<(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAMES})\\.?>>`))) {
    return resolveDate(now, MONTHS[m[2].toLowerCase()], parseInt(m[1], 10));
  }

  // 12/10 — day first, the way most of the world writes it.
  if ((m = sc.take('<<(?:on\\s+)?(\\d{1,2})[/](\\d{1,2})(?:[/](\\d{2,4}))?>>'))) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      const year = m[3]
        ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10))
        : null;
      return resolveDate(now, month, day, year);
    }
  }

  return null;
}

// A bare day+month with no year means the next time that date comes round.
function resolveDate(now, month, day, year = null) {
  if (year !== null) return new Date(year, month, day);
  const candidate = new Date(now.getFullYear(), month, day);
  if (+startOfDay(candidate) < +startOfDay(now)) candidate.setFullYear(now.getFullYear() + 1);
  return candidate;
}

// --- "in 20 minutes" -------------------------------------------------------
function takeRelative(sc, now) {
  const m = sc.take('<<(?:in|בעוד|עוד)\\s+(an?|\\d{1,4}|half\\s+an?)\\s*' +
    '(minutes?|mins?|hours?|hrs?|hr|h|days?|weeks?|months?|' +
    'דקות|דקה|שעות|שעה|ימים|יום|שבועות|שבוע|חודשים|חודש)>>');
  if (!m) return null;

  const word = m[1].toLowerCase();
  const n = /^\d+$/.test(word) ? parseInt(word, 10) : (word.startsWith('half') ? 0.5 : 1);
  const unit = m[2].toLowerCase();

  if (/^(minutes?|mins?|דקות|דקה)$/.test(unit)) return { at: new Date(+now + n * MINUTE), hasTime: true };
  if (/^(hours?|hrs?|hr|h|שעות|שעה)$/.test(unit)) return { at: new Date(+now + n * HOUR), hasTime: true };
  if (/^(days?|ימים|יום)$/.test(unit)) return { at: new Date(+now + n * DAY), hasTime: false };
  if (/^(weeks?|שבועות|שבוע)$/.test(unit)) return { at: new Date(+now + n * 7 * DAY), hasTime: false };
  const d = new Date(now);
  d.setMonth(d.getMonth() + Math.round(n));
  return { at: d, hasTime: false };
}

// --- repeats ---------------------------------------------------------------
function takeRepeat(sc) {
  if (sc.take('<<(every day|daily|each day|כל יום)>>')) return 'daily';
  if (sc.take('<<(every week|weekly|each week|כל שבוע)>>')) return 'weekly';
  if (sc.take('<<(every month|monthly|each month|כל חודש)>>')) return 'monthly';
  if (sc.take('<<(every year|yearly|annually|כל שנה)>>')) return 'yearly';
  // "every monday" — drop the "every" and leave the weekday for takeDay.
  if (re(`<<(every|each|כל)\\s+(?:יום\\s+)?(${DAY_NAMES})>>`).test(sc.text)) {
    sc.take('<<(every|each|כל)\\s+');
    return 'weekly';
  }
  return null;
}

/**
 * Parse one line of input.
 * @returns {{text:string, due:number|null, hasTime:boolean,
 *            repeat:string|null, priority:number, tags:string[]}}
 */
export function parse(input, now = new Date()) {
  const sc = new Scratch(String(input || '').trim());

  // #tags come out of the title and become chips.
  const tags = [];
  let tagMatch;
  while ((tagMatch = sc.take(/(?:^|\s)#([\p{L}\p{N}_-]{1,24})/u))) tags.push(tagMatch[1].toLowerCase());

  // ! or !! for priority.
  let priority = 0;
  const bang = sc.take(/(?:^|\s)(!{1,3})(?=\s|$)/);
  if (bang) priority = Math.min(bang[1].length, 2);

  const repeat = takeRepeat(sc);
  const relative = takeRelative(sc, now);

  let due = null;
  let hasTime = false;

  if (relative) {
    due = relative.at;
    hasTime = relative.hasTime;
    if (!hasTime) due = setTime(due, DEFAULT_HOUR, 0);
  } else {
    let dayResult = takeDay(sc, now);
    let evening = false;
    if (dayResult && dayResult.evening) { evening = true; dayResult = dayResult.day; }

    const time = takeTime(sc);

    if (dayResult) {
      due = time ? setTime(dayResult, time.hour, time.minute)
                 : setTime(dayResult, evening ? EVENING_HOUR : DEFAULT_HOUR, 0);
      hasTime = Boolean(time) || evening;
    } else if (time) {
      due = setTime(now, time.hour, time.minute);
      // A time that has already gone by today means tomorrow.
      if (+due <= +now) due = new Date(+due + DAY);
      hasTime = true;
    }
  }

  // "every day" with no time still needs one to fire at.
  if (repeat && !due) {
    due = setTime(now, DEFAULT_HOUR, 0);
    if (+due <= +now) due = new Date(+due + DAY);
  }

  let text = sc.clean();
  if (text) text = text.charAt(0).toUpperCase() + text.slice(1);

  return { text, due: due ? +due : null, hasTime, repeat, priority, tags };
}

/** The next occurrence strictly after `from`, for a repeating task. */
export function nextOccurrence(due, repeat, from = Date.now()) {
  if (!repeat || !due) return null;
  let d = new Date(due);
  let guard = 0;
  while (+d <= from && guard++ < 500) {
    if (repeat === 'daily') d = new Date(+d + DAY);
    else if (repeat === 'weekly') d = new Date(+d + 7 * DAY);
    else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (repeat === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else return null;
  }
  return +d;
}
