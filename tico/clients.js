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

/**
 * Eight slots, in this exact order.
 *
 * The order is not cosmetic — it is what makes adjacent colours separable to a
 * colourblind reader, and it was validated rather than chosen by eye (worst
 * adjacent CVD ΔE 9.1 light / 8.4 dark, normal-vision 19.6 / 19.3). Three
 * re-orderings were tried to keep blue away from the work lane's dot; every one
 * of them made CVD separation worse, two into the warn band and one to an
 * outright fail at ΔE 3.2. The lane is told apart by shape instead.
 *
 * A slot is claimed when a client is first recorded and then kept, so a name
 * never changes colour — not on a reload, not after a rename of something else,
 * and not on the other computer, because the slot rides along in the synced
 * client list. Past eight names the slots come round again; the chip carries the
 * name, so colour is a shortcut here and never the only way to tell two apart.
 */
export const COLOUR_SLOTS = 8;

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

    // Inner punctuation is part of some names — Coca-Cola, O'Neill, 3M.co —
    // but a hyphen or full stop on either end is just how the sentence was
    // written. "For Stream- i need to…" was producing the client "Stream-",
    // which is a different client from "Stream" and silently splits the group.
    const word = (words[j] || '')
      .replace(/[^\p{L}\p{N}_'&.-]/gu, '')
      .replace(/^[-.'&]+|[-.'&]+$/g, '');
    if (!word || word.length < 2 || word.length > 24) continue;
    const lower = word.toLowerCase();
    if (NEVER.has(lower) || isCommonWord(lower)) continue;
    if (/^\d+$/.test(word)) continue;
    return word;
  }

  return null;
}

/** Where a name appears as a whole word, or -1. */
function wordIndex(lower, key) {
  const edge = (ch) => ch === undefined || !/[\p{L}\p{N}]/u.test(ch);
  for (let from = 0; ; ) {
    const at = lower.indexOf(key, from);
    if (at < 0) return -1;
    if (edge(lower[at - 1]) && edge(lower[at + key.length])) return at;
    from = at + 1;
  }
}

/**
 * A name already known, spotted anywhere in the text regardless of wording.
 *
 * When two known names are both in the sentence, the one mentioned first wins.
 * Sorting by length instead — which is what this did — meant "For Stream, run
 * the campaign" was filed under campaign purely because the word is two letters
 * longer. Length is still the tie-break, but only between names starting at the
 * same place, which is the case it was there for: "acme corp" beating "acme".
 */
export function matchKnown(text, clients = {}) {
  const lower = String(text || '').toLowerCase();
  let best = null;
  for (const key of Object.keys(clients)) {
    const at = wordIndex(lower, key);
    if (at < 0) continue;
    if (!best || at < best.at || (at === best.at && key.length > best.key.length)) {
      best = { at, key };
    }
  }
  return best ? clients[best.key].name : null;
}

/**
 * The client for a task: one already known, or a new one the sentence names.
 * @returns {{client: string|null, isNew: boolean}}
 */
export function detectClient(text, clients = {}, isCommonWord = () => false) {
  // The sentence saying who it is for outranks a name that merely appears in
  // it. "For Stream, run the new campaign" is about Stream even when campaign
  // is also a client — asking the registry first got that exactly backwards.
  const named = extractCandidate(text, isCommonWord);
  if (named) {
    // Spelled differently from how it is stored? Keep the stored spelling, so
    // "Stream" and "stream" stay one client rather than two.
    const existing = clients[keyOf(named)];
    return { client: existing ? existing.name : named, isNew: !existing };
  }
  const known = matchKnown(text, clients);
  return known ? { client: known, isNew: false } : { client: null, isNew: false };
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
    colour: prior?.colour ?? nextFreeSlot(next),
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

/**
 * The lowest slot nobody is using, so the first few clients get the leading
 * colours and a deleted name frees its own back up.
 */
function nextFreeSlot(clients) {
  const taken = new Set(Object.values(clients).map((c) => c.colour).filter((n) => Number.isInteger(n)));
  for (let i = 0; i < COLOUR_SLOTS; i++) if (!taken.has(i)) return i;
  return taken.size % COLOUR_SLOTS;
}

/** The slot a client sits in, for anything drawing its chip. */
export function colourOf(clients, name) {
  const c = clients[keyOf(name)];
  return Number.isInteger(c?.colour) ? c.colour : 0;
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
