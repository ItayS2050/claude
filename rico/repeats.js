// Noticing that you have written this before.
//
// The point of the feature is that the best moment to save a snippet is the
// second time you type it — not later, in a settings screen, from memory.
//
// The constraint is that Rico's whole promise is that it does not keep your
// mail. So it does not. What is stored is a 32-bit hash per paragraph and a
// count, which is enough to recognise a repeat and useless for reconstructing
// anything: hashes are one-way, and at this size they are not even reversible
// by brute force into the *specific* wording. When a repeat is found, the text
// is already sitting in the compose window in front of the user — which is why
// the old copy never needed keeping in the first place.
var Rico = globalThis.Rico || (globalThis.Rico = {});

Rico.repeats = (() => {
  const KEY = 'repeats';

  // Below this, everything matches everything. "Thanks!" and "Let me know" are
  // written by everybody a hundred times a week and are not snippets — they
  // are just how people write. A suggestion feature that fires on those gets
  // switched off in a day, which costs more than never having shipped it.
  const MIN_CHARS = 70;
  const MIN_WORDS = 12;

  // Hashes are cheap but not free, and a list that grows forever eventually
  // becomes the biggest thing in local storage.
  const MAX_TRACKED = 800;

  // Openings, sign-offs and the lines that surround real content. These repeat
  // by nature and carry no information worth saving — but only when that is
  // all the paragraph is. "Thanks for sending that over. I have had a look
  // through the numbers and…" opens with one of these and is a real paragraph,
  // so the test below strips the pleasantry and asks whether anything of
  // substance is left rather than judging on the first word.
  const BOILERPLATE = new RegExp('^(' + [
    'hi', 'hey', 'hello', 'dear', 'good morning', 'good afternoon', 'good evening',
    'thanks', 'thank you', 'many thanks', 'cheers', 'best', 'best regards',
    'kind regards', 'regards', 'all the best', 'sincerely', 'yours',
    'sent from my', 'let me know', 'looking forward', 'speak soon', 'talk soon',
  ].join('|') + ')\\b', 'i');

  /**
   * The comparable form of a paragraph.
   *
   * Case and punctuation go, because "Let's book a call." and "let's book a
   * call" are the same sentence. Names and numbers stay, so the same paragraph
   * addressed to two different people is treated as two different paragraphs —
   * conservative on purpose. A missed suggestion costs nothing; a wrong one
   * costs the user's patience.
   */
  function normalise(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[^\p{L}\p{N}\s']/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** FNV-1a, 32-bit, as a short string. Small, fast, and one-way. */
  function hash(text) {
    let h = 0x811c9dc5;
    const s = normalise(text);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  /**
   * The paragraphs of a message that are worth watching.
   *
   * Anything too short, and anything that reads as a greeting or a sign-off,
   * is dropped before it is ever hashed — so those are not merely ignored at
   * suggestion time, they are never recorded at all.
   */
  const substantial = (text) =>
    text.length >= MIN_CHARS && text.split(/\s+/).filter(Boolean).length >= MIN_WORDS;

  function blocks(text) {
    return String(text || '')
      .split(/\n\s*\n/)
      .map((block) => block.replace(/\s+/g, ' ').trim())
      .filter((block) => {
        if (!substantial(block)) return false;
        if (!BOILERPLATE.test(block)) return true;
        // Opens with a pleasantry. Drop that sentence and see whether the
        // paragraph still stands up on what is left.
        const rest = block.split(/(?<=[.!?])\s+/).slice(1).join(' ').trim();
        return substantial(rest);
      });
  }

  const read = () => new Promise((resolve) => chrome.storage.local.get(KEY, (r) => {
    void chrome.runtime.lastError;
    resolve((r && r[KEY]) || {});
  }));

  const write = (seen) => new Promise((resolve) => chrome.storage.local.set(
    { [KEY]: seen }, () => { void chrome.runtime.lastError; resolve(); },
  ));

  /** Drop the least recently seen entries once the list gets too long. */
  function prune(seen) {
    const keys = Object.keys(seen);
    if (keys.length <= MAX_TRACKED) return seen;
    keys.sort((a, b) => seen[b][1] - seen[a][1]);
    const kept = {};
    for (const key of keys.slice(0, MAX_TRACKED)) kept[key] = seen[key];
    return kept;
  }

  /**
   * Record a sent message, and say which paragraph is worth offering to save.
   *
   * Returns at most one — the longest repeat. Offering three at once turns a
   * helpful nudge into a form to fill in, and the user is mid-send.
   *
   * `existing` is the bodies of snippets already saved, so Rico never offers
   * to save something the user has plainly already saved.
   */
  async function record(text, existing = []) {
    const found = blocks(text);
    if (!found.length) return null;

    const saved = new Set(existing.flatMap((body) => blocks(body).map(hash)));
    const seen = await read();
    const now = Date.now();
    const repeats = [];

    for (const block of found) {
      const key = hash(block);
      const entry = seen[key] || [0, 0, 0];
      const [count, , muted] = entry;

      // Seen before, not already a snippet, and not one the user has told us
      // to stop asking about.
      if (count >= 1 && !muted && !saved.has(key)) repeats.push({ key, text: block });

      seen[key] = [count + 1, now, muted];
    }

    await write(prune(seen));
    if (!repeats.length) return null;

    repeats.sort((a, b) => b.text.length - a.text.length);
    return repeats[0];
  }

  /** Stop offering this particular paragraph. */
  async function mute(key) {
    const seen = await read();
    const entry = seen[key] || [1, Date.now(), 0];
    seen[key] = [entry[0], entry[1], 1];
    await write(seen);
  }

  /**
   * A title, guessed from the text.
   *
   * The first few words of the first sentence are almost always a decent name
   * for it, and the user can overwrite it in the field where it appears.
   */
  function suggestTitle(text) {
    const first = String(text || '').split(/(?<=[.!?])\s/)[0] || '';
    const words = first.split(/\s+/).filter(Boolean).slice(0, 6);
    if (!words.length) return 'Saved snippet';
    let title = words.join(' ').replace(/[,;:]$/, '');
    if (title.length > 48) title = `${title.slice(0, 45).trimEnd()}…`;
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  /**
   * A tag, guessed from the text.
   *
   * Deliberately a small fixed vocabulary rather than anything clever. A tag
   * that is wrong is worse than no tag, because the user has to notice it and
   * delete it — so this only fires on words that are close to unambiguous, and
   * returns nothing the rest of the time.
   */
  const TAGS = [
    ['pricing', /\b(pricing|price|quote|invoice|cost|discount|refund|payment)\b/i],
    ['scheduling', /\b(calendar|reschedul\w*|availability|book a|meeting|call on|time slot)\b/i],
    ['follow-up', /\b(follow(ing)? up|checking in|circle back|bumping this|any update)\b/i],
    ['intro', /\b(nice to meet|introduc\w+|reaching out|wanted to connect)\b/i],
    ['support', /\b(issue|bug|not working|troubleshoot\w*|error|reset your)\b/i],
    ['hiring', /\b(candidate|role|interview|cv|resume|application|position)\b/i],
    ['declining', /\b(not a fit|not looking|pass on|unfortunately we|decline)\b/i],
  ];

  function suggestTag(text) {
    for (const [tag, pattern] of TAGS) if (pattern.test(text)) return tag;
    return '';
  }

  return {
    MIN_CHARS, MIN_WORDS, MAX_TRACKED,
    normalise, hash, blocks, record, mute, suggestTitle, suggestTag,
  };
})();

if (typeof module !== 'undefined') module.exports = Rico.repeats;
