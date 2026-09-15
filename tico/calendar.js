// Handing a task to the calendar the user already carries.
//
// Tico cannot reach a phone — no extension can. The calendar on that phone
// can, it already works, and it costs nothing to run. So rather than build a
// server to send email, Tico writes the event and gets out of the way.
//
// Two routes, because they fail in different places. An .ics file carries the
// alarm exactly as set and is understood by Apple Calendar, Outlook and Google
// alike. A Google Calendar link needs no download and no import, but the URL
// format has no way to express an alarm, so the event lands with whatever
// default that calendar uses. Both are offered; the difference is stated rather
// than hidden.

/** RFC 5545 wants UTC stamps like 20260916T140000Z. */
export function stamp(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`
       + `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/**
 * Escape a value for an iCalendar property: backslash, semicolon and comma are
 * separators in the format itself, and a raw newline ends the property.
 */
export function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold to 75 octets per line, as the spec requires — a long Hebrew task title
 * will exceed it, and an unfolded line is what makes a calendar app reject the
 * whole file rather than just that event.
 */
export function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const out = [];
  let current = '';
  let width = 0;
  for (const char of line) {                    // by code point, never mid-character
    const size = new TextEncoder().encode(char).length;
    const limit = out.length === 0 ? 75 : 74;   // continuations carry a leading space
    if (width + size > limit) {
      out.push(current);
      current = char;
      width = size + 1;
    } else {
      current += char;
      width += size;
    }
  }
  out.push(current);
  return out.join('\r\n ');
}

const REPEAT_RULE = {
  daily: 'FREQ=DAILY',
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
};

/**
 * One VEVENT for a task. `lead` is minutes before the due time, 0 for an alarm
 * at the time itself.
 *
 * A task with no due time gets no event: a calendar entry with no moment in it
 * is not useful to anybody.
 */
export function icsFor(task, { lead = 0, now = Date.now() } = {}) {
  if (!task || task.due == null) return null;

  const minutes = task.hasTime ? 30 : 15;       // something to occupy on the grid
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tico//Tasks//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${task.id}@tico.local`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(task.due)}`,
    `DTEND:${stamp(task.due + minutes * 60000)}`,
    `SUMMARY:${escapeText(task.text)}`,
  ];

  const details = [];
  if (task.client) details.push(`For: ${task.client}`);
  if (task.tags?.length) details.push(task.tags.map((t) => `#${t}`).join(' '));
  if (details.length) lines.push(`DESCRIPTION:${escapeText(details.join('\n'))}`);
  if (task.client) lines.push(`CATEGORIES:${escapeText(task.client)}`);
  if (task.repeat && REPEAT_RULE[task.repeat]) lines.push(`RRULE:${REPEAT_RULE[task.repeat]}`);

  // The alarm is the whole point of the exercise: this is what reaches a phone.
  lines.push(
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `TRIGGER:${lead > 0 ? `-PT${lead}M` : 'PT0M'}`,
    `DESCRIPTION:${escapeText(task.text)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );

  // CRLF throughout, not \n — some parsers are strict about it.
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** A Google Calendar pre-filled event. No alarm: the URL format has no field for one. */
export function googleUrl(task) {
  if (!task || task.due == null) return null;
  const minutes = task.hasTime ? 30 : 15;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: task.text,
    dates: `${stamp(task.due)}/${stamp(task.due + minutes * 60000)}`,
  });
  const details = [];
  if (task.client) details.push(`For: ${task.client}`);
  if (task.tags?.length) details.push(task.tags.map((t) => `#${t}`).join(' '));
  if (details.length) params.set('details', details.join('\n'));
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** A filename a person can find again. */
export function icsName(task) {
  const safe = String(task.text || 'task').replace(/[^\p{L}\p{N} -]/gu, '').trim().slice(0, 40);
  return `${safe || 'task'}.ics`;
}
