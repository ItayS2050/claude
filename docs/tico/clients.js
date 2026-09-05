// Who or what a task is for: a client, a project, a person.
//
// "finish campaigns for stream" has to end up filed under Stream without the
// user ever opening a settings page to declare that Stream exists. So the name
// is pulled out of the sentence, and the sentence pattern is what identifies it
// — "for X", "with X", "@X" — not a list somebody maintained by hand.
//
// The danger with that approach is inventing clients out of ordinary words, so
// a candidate has to survive three filters: it cannot be a filler word, it
// cannot be a word the work/personal classifier already recognises as a common
// noun, and it has to look like a name rather than a verb phrase. Anything that
// gets through once is attached; anything that gets through twice is promoted
// to a real client and starts being matched anywhere in the text, "for" or not.

import { tokenize } from './classify.js';

// Words that follow "for"/"with" constantly and are never a client.
const NEVER = new Set(`
me you us them him her myself yourself it this that these those
today tomorrow tonight yesterday now later soon then when while
work home office team teams everyone everybody people person staff
all any both each few more most other some such only own same
the a an my our your his their its no not
lunch dinner breakfast coffee tea drinks food
review reviews meeting meetings call calls email emails
raise update updates launch party trip weekend morning evening night
holiday appointment interview presentation report reports deadline budget
project projects task tasks note notes list plan plans idea ideas
week weeks month months year years day days hour hours minute minutes
time times thing things stuff bit lot kind sort way ways
sure ok okay yes yeah please thanks
עם עבור בשביל אצל של את אני אנחנו אתה הם היא הוא
היום מחר אתמול עכשיו אחר כך שבוע חודש שנה יום שעה דקה
עבודה בית משרד צוות כולם אנשים ארוחה פגישה שיחה מייל
`.trim().split(/\s+/));

// "for" and its friends, in both languages. These are the only positions a new
// name is discovered from; everything else has to already be known.
const LEAD_INS = ['for', 'with', 'at', 'from', 'to', 'עבור', 'בשביל', 'עם', 'אצל', 'ל'];

export function keyOf(name) {
  return String(name || '').trim().toLowerCase();
}

/**
 * A name discovered from the shape of the sentence.
 * @param {(w:string)=>boolean} isCommonWord  the classifier's vocabulary, so a
 *   word it already understands as a common noun is never mistaken for a name.
 * @returns {string|null}
 */
export function extractCandidate(text, isCommonWord = () => false) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  // @name is explicit and beats everything else.
  const at = raw.match(/(?:^|\s)@([\p{L}\p{N}][\p{L}\p{N}_'&.-]{1,23})/u);
  if (at && !NEVER.has(at[1].toLowerCase())) return at[1];

  const words = raw.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const lead = words[i].toLowerCase().replace(/[^\p{L}]/gu, '');
    if (!LEAD_INS.includes(lead)) continue;

    // "the" often stands in front of a named thing — "for the acme launch" —
    // so step over it. "a" and "an" do the opposite: they almost always
    // introduce an ordinary noun ("ask for a raise", "wait for an update"),
    // and stepping over those is what invents clients that do not exist.
    let j = i + 1;
    if (['the', 'ה'].includes(words[j]?.toLowerCase())) j++;

    const word = (words[j] || '').replace(/[^\p{L}\p{N}_'&.-]/gu, '');
    if (!word || word.length < 2 || word.length > 24) continue;
    const lower = word.toLowerCase();
    if (NEVER.has(lower) || isCommonWord(lower)) continue;
    if (/^\d+$/.test(word)) continue;
    return word;
  }

  return null;
}

/** A name already known, spotted anywhere in the text regardless of wording. */
export function matchKnown(text, clients = {}) {
  const known = Object.keys(clients);
  if (!known.length) return null;
  const tokens = new Set(tokenize(text));
  // Longest first, so "acme corp" wins over "acme" when both are known.
  for (const key of known.sort((a, b) => b.length - a.length)) {
    if (key.includes(' ') ? ` ${String(text).toLowerCase()} `.includes(` ${key} `) : tokens.has(key)) {
      return clients[key].name;
    }
  }
  return null;
}

/**
 * The client for a task: one already known, or a new one the sentence names.
 * @returns {{client: string|null, isNew: boolean}}
 */
export function detectClient(text, clients = {}, isCommonWord = () => false) {
  const known = matchKnown(text, clients);
  if (known) return { client: known, isNew: false };
  const found = extractCandidate(text, isCommonWord);
  return found ? { client: found, isNew: true } : { client: null, isNew: false };
}

/**
 * Record a sighting. A name seen twice stops being a guess and becomes a client
 * — that is what earns it a filter chip and matching without a "for".
 */
export function remember(clients, name, { confirmed = false } = {}) {
  const key = keyOf(name);
  if (!key) return clients;
  const next = { ...clients };
  const prior = next[key];
  next[key] = {
    name: prior?.name || name,
    count: (prior?.count || 0) + 1,
    confirmed: confirmed || Boolean(prior?.confirmed),
    lastSeen: Date.now(),
  };

  // Keep the registry from growing without bound; one-off guesses go first.
  const keys = Object.keys(next);
  if (keys.length > 120) {
    const doomed = keys
      .filter((k) => !next[k].confirmed && next[k].count < 2)
      .sort((a, b) => next[a].lastSeen - next[b].lastSeen)
      .slice(0, keys.length - 120);
    for (const k of doomed) delete next[k];
  }
  return next;
}

export function forget(clients, name) {
  const next = { ...clients };
  delete next[keyOf(name)];
  return next;
}

/** The ones worth showing as filter chips: seen more than once, or confirmed. */
export function establishedClients(clients = {}) {
  return Object.values(clients)
    .filter((c) => c.confirmed || c.count >= 2)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
