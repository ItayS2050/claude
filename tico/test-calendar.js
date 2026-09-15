// node test-calendar.js — the .ics a calendar app will either accept or
// silently drop. Silently is the problem: a malformed file does not error, the
// event simply never appears, so the format details are worth asserting.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./calendar.js', import.meta.url), 'utf8');
const C = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.log(`FAIL  ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
  else console.log(`ok    ${name}`);
};

const NOW = Date.UTC(2026, 8, 15, 9, 0, 0);
const DUE = Date.UTC(2026, 8, 16, 14, 0, 0);
const task = (over = {}) => ({ id: 'abc123', text: 'Call mom', due: DUE, hasTime: true,
                               tags: [], client: null, repeat: null, ...over });

// --- stamps -----------------------------------------------------------------
check('UTC stamp format', C.stamp(DUE), '20260916T140000Z');
check('single digits are padded', C.stamp(Date.UTC(2026, 0, 2, 3, 4, 5)), '20260102T030405Z');

// --- escaping, which is where hand-rolled ics files usually break ------------
check('commas are escaped', C.escapeText('milk, bread'), 'milk\\, bread');
check('semicolons are escaped', C.escapeText('a;b'), 'a\;b');
check('backslashes first', C.escapeText('a\\b'), 'a\\\\b');
check('newlines become literal \\n', C.escapeText('one\ntwo'), 'one\\ntwo');
check('nothing to escape passes through', C.escapeText('Call mom'), 'Call mom');

// --- folding ----------------------------------------------------------------
const long = 'SUMMARY:' + 'a'.repeat(200);
const folded = C.fold(long);
const widest = Math.max(...folded.split('\r\n').map((l) => new TextEncoder().encode(l).length));
check('no folded line exceeds 75 octets', widest <= 75, true);
check('continuations start with a space',
  folded.split('\r\n').slice(1).every((l) => l.startsWith(' ')), true);
check('unfolding restores the original',
  folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join(''), long);
check('a short line is untouched', C.fold('SUMMARY:Call mom'), 'SUMMARY:Call mom');
// Hebrew is two octets per character, so a title well under 75 characters can
// still exceed 75 octets — and folding mid-character corrupts the file.
const hebrew = C.fold('SUMMARY:' + 'ש'.repeat(60));
check('hebrew folds without splitting a character',
  hebrew.split('\r\n').every((l) => !l.includes('�')), true);
check('and still respects the octet limit',
  Math.max(...hebrew.split('\r\n').map((l) => new TextEncoder().encode(l).length)) <= 75, true);

// --- the event ---------------------------------------------------------------
const ics = C.icsFor(task(), { lead: 60, now: NOW });
const has = (line) => ics.includes(line);
check('opens and closes as a calendar', [has('BEGIN:VCALENDAR'), has('END:VCALENDAR')], [true, true]);
check('carries the task title', has('SUMMARY:Call mom'), true);
check('starts at the due time', has('DTSTART:20260916T140000Z'), true);
check('ends half an hour later', has('DTEND:20260916T143000Z'), true);
check('an hour of lead becomes a negative trigger', has('TRIGGER:-PT60M'), true);
check('no lead means an alarm at the time',
  C.icsFor(task(), { lead: 0, now: NOW }).includes('TRIGGER:PT0M'), true);
check('every line ends CRLF', /[^\r]\n/.test(ics), false);
check('the uid is stable for the task', has('UID:abc123@tico.local'), true);

// A dateless task has no moment to put in a calendar.
check('no due time, no event', C.icsFor(task({ due: null })), null);

// --- extras ------------------------------------------------------------------
const rich = C.icsFor(task({ client: 'Acme, Inc', tags: ['q4', 'urgent'], repeat: 'weekly' }), { now: NOW });
check('the client is escaped into the description', rich.includes('For: Acme\\, Inc'), true);
check('tags come along', rich.includes('#q4 #urgent'), true);
check('a repeat becomes a recurrence rule', rich.includes('RRULE:FREQ=WEEKLY'), true);
check('an all-day task gets a shorter slot',
  C.icsFor(task({ hasTime: false }), { now: NOW }).includes('DTEND:20260916T141500Z'), true);

// --- the Google link ----------------------------------------------------------
const url = new URL(C.googleUrl(task()));
check('points at Google Calendar', url.host, 'calendar.google.com');
check('is a template action', url.searchParams.get('action'), 'TEMPLATE');
check('carries the title', url.searchParams.get('text'), 'Call mom');
check('carries the window', url.searchParams.get('dates'), '20260916T140000Z/20260916T143000Z');
check('dateless task gets no link', C.googleUrl(task({ due: null })), null);

// --- filename -----------------------------------------------------------------
check('filename is readable', C.icsName(task()), 'Call mom.ics');
check('path characters are stripped', C.icsName(task({ text: 'a/b:c*d' })), 'abcd.ics');
check('an empty title still yields a file', C.icsName({ text: '///' }), 'task.ics');

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
