// A subsequence matcher, about eighty lines of it.
//
// The palette searches at most a few hundred snippets on every keystroke, so
// the requirement is "fast enough that nobody notices", which a linear scan
// clears by a wide margin. That makes a search library 30KB of dependency
// buying nothing.
//
// What matters more than speed is ranking. Typing "fu" should put "Follow up"
// above "Refund policy" even though both contain an f and a u, because the
// letters in "Follow up" start words. The score below is built out of that
// idea: where a letter lands matters more than that it landed.
var Rico = globalThis.Rico || (globalThis.Rico = {});

Rico.fuzzy = (() => {
  const START_OF_STRING = 12;   // the first character of the field
  const START_OF_WORD = 9;      // after a space, dash, slash, bracket
  const CONSECUTIVE = 7;        // directly after the previous match
  const LOOSE = 1;              // matched, but adrift in the middle of a word
  const GAP_PENALTY = 0.4;      // per character skipped, capped below
  const MAX_GAP_PENALTY = 12;

  const isBoundary = (ch) => ch === undefined || /[\s\-_/([{.,:;"']/.test(ch);

  /**
   * Score `query` against `text`, or return null when the letters are not
   * present in order. Also returns the matched positions so the caller can
   * show the user which letters it matched on.
   */
  function match(query, text) {
    if (!query) return { score: 0, positions: [] };
    if (!text) return null;

    const q = query.toLowerCase();
    const t = text.toLowerCase();

    let score = 0;
    let ti = 0;
    let previousMatch = -2;
    const positions = [];

    for (let qi = 0; qi < q.length; qi++) {
      const ch = q[qi];
      // A space in the query means "somewhere later", not a literal space —
      // it lets "fol up" find "Follow up" without matching the space itself.
      if (ch === ' ') { previousMatch = -2; continue; }

      const found = t.indexOf(ch, ti);
      if (found === -1) return null;

      if (found === 0) score += START_OF_STRING;
      else if (found === previousMatch + 1) score += CONSECUTIVE;
      else if (isBoundary(t[found - 1])) score += START_OF_WORD;
      else score += LOOSE;

      const gap = found - (previousMatch + 1);
      if (gap > 0) score -= Math.min(gap * GAP_PENALTY, MAX_GAP_PENALTY);

      positions.push(found);
      previousMatch = found;
      ti = found + 1;
    }

    // A short field that matched is a better hit than a long one that happened
    // to contain the same letters somewhere across two paragraphs.
    score -= Math.min(text.length / 120, 4);
    return { score, positions };
  }

  /**
   * Rank snippets against a query.
   *
   * A title hit outranks a body hit — someone typing "refund" wants the
   * snippet called Refund, not the three that mention the word in passing —
   * so the body's score is heavily discounted rather than merely ranked below.
   * The body is still searched, because half the value of the palette is
   * finding the snippet whose name you have forgotten.
   */
  function search(snippets, query) {
    const q = (query || '').trim();
    if (!q) {
      return snippets.map((snippet) => ({ snippet, score: 0, positions: [] }));
    }

    const hits = [];
    for (const snippet of snippets) {
      const inTitle = match(q, snippet.title || '');
      const inBody = inTitle ? null : match(q, snippet.body || '');
      if (!inTitle && !inBody) continue;

      hits.push({
        snippet,
        score: inTitle ? inTitle.score : inBody.score * 0.35 - 6,
        positions: inTitle ? inTitle.positions : [],
        matchedBody: !inTitle,
      });
    }

    hits.sort((a, b) => b.score - a.score
      || (a.snippet.title || '').localeCompare(b.snippet.title || ''));
    return hits;
  }

  return { match, search };
})();

if (typeof module !== 'undefined') module.exports = Rico.fuzzy;
