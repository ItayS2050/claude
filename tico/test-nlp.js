// node test-nlp.js — checks the parser against a fixed "now" so the expected
// dates never drift. Run it after touching nlp.js.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./nlp.js', import.meta.url), 'utf8');
const nlp = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

// Thursday 3 September 2026, 10:00 local.
const NOW = new Date(2026, 8, 3, 10, 0, 0, 0);

const fmt = (ms) => {
  if (ms == null) return 'none';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// [input, expected title, expected due, extras]
const cases = [
  ['buy milk',                          'Buy milk',        'none'],
  ['call mom tomorrow at 5pm',          'Call mom',        '2026-09-04 17:00'],
  ['standup tomorrow',                  'Standup',         '2026-09-04 09:00'],
  ['dentist today at 15:30',            'Dentist',         '2026-09-03 15:30'],
  ['pay rent in 20 minutes',            'Pay rent',        '2026-09-03 10:20'],
  ['stretch in 2 hours',                'Stretch',         '2026-09-03 12:00'],
  ['review PR in 3 days',               'Review PR',       '2026-09-06 09:00'],
  ['send invoice on friday',            'Send invoice',    '2026-09-04 09:00'],
  ['gym next monday at 7am',            'Gym',             '2026-09-07 07:00'],
  ['book flights on 12/10',             'Book flights',    '2026-10-12 09:00'],
  ['mums birthday dec 5',               'Mums birthday',   '2026-12-05 09:00'],
  ['drinks tonight',                    'Drinks',          '2026-09-03 20:00'],
  ['lunch at noon',                     'Lunch',           '2026-09-03 12:00'],
  ['call bob at 3',                     'Call bob',        '2026-09-03 15:00'],  // afternoon reading
  ['email at 8am',                      'Email',           '2026-09-04 08:00'],  // already gone -> tomorrow
  ['water plants every day at 9am',     'Water plants',    '2026-09-04 09:00', { repeat: 'daily' }],
  ['standup every monday at 9:30',      'Standup',         '2026-09-07 09:30', { repeat: 'weekly' }],
  ['file taxes !! #finance',            'File taxes',      'none', { priority: 2, tags: ['finance'] }],
  ['ship the release #work #urgent',    'Ship the release','none', { tags: ['work', 'urgent'] }],
  ['buy 5 apples',                      'Buy 5 apples',    'none'],   // bare number is not a time
  ['invite 12 people to the demo',      'Invite 12 people to the demo', 'none'],
  ['לקנות חלב מחר',                      'לקנות חלב',       '2026-09-04 09:00'],
  ['להתקשר לאמא מחר בשעה 17:00',          'להתקשר לאמא',     '2026-09-04 17:00'],
  ['פגישה בעוד 30 דקות',                 'פגישה',           '2026-09-03 10:30'],
  ['לשלם ארנונה כל חודש',                'לשלם ארנונה',      '2026-09-04 09:00', { repeat: 'monthly' }],
];

let failed = 0;
for (const [input, wantText, wantDue, extra = {}] of cases) {
  const got = nlp.parse(input, NOW);
  const problems = [];
  if (got.text !== wantText) problems.push(`text "${got.text}" != "${wantText}"`);
  if (fmt(got.due) !== wantDue) problems.push(`due ${fmt(got.due)} != ${wantDue}`);
  for (const [k, v] of Object.entries(extra)) {
    const actual = JSON.stringify(got[k]);
    if (actual !== JSON.stringify(v)) problems.push(`${k} ${actual} != ${JSON.stringify(v)}`);
  }
  if (problems.length) {
    failed++;
    console.log(`FAIL  ${input}\n      ${problems.join('\n      ')}`);
  } else {
    console.log(`ok    ${input}  ->  "${got.text}" @ ${fmt(got.due)}`);
  }
}

// Repeating tasks roll forward past now, not by one step from the old due date.
const weekAgo = +new Date(2026, 7, 27, 9, 0);
const next = nlp.nextOccurrence(weekAgo, 'daily', +NOW);
if (fmt(next) !== '2026-09-04 09:00') { failed++; console.log(`FAIL  nextOccurrence -> ${fmt(next)}`); }
else console.log(`ok    nextOccurrence rolls forward -> ${fmt(next)}`);

console.log(failed ? `\n${failed} failing` : `\nall ${cases.length + 1} passing`);
process.exit(failed ? 1 : 0);
