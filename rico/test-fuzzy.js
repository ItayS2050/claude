// node test-fuzzy.js — the ranking, which is the part of search a user notices.
const fuzzy = require('./fuzzy.js');

let failed = 0;
const ok = (label, cond) => {
  if (cond) console.log(`ok    ${label}`);
  else { failed++; console.log(`FAIL  ${label}`); }
};

const S = (title, body = '') => ({ id: title, title, body });

// Letters must appear in order, and only in order.
ok('matches a subsequence',        fuzzy.match('fu', 'Follow up') !== null);
ok('rejects out-of-order letters', fuzzy.match('uf', 'Follow up') === null);
ok('rejects a missing letter',     fuzzy.match('fuz', 'Follow up') === null);
ok('an empty query matches',       fuzzy.match('', 'anything').score === 0);

// Word starts beat letters buried mid-word — this is the rule that makes
// two-letter queries useful.
ok('word starts outrank the middle of a word',
  fuzzy.match('fu', 'Follow up').score > fuzzy.match('fu', 'Refund policy').score);

ok('a run of letters outranks a scattered match',
  fuzzy.match('fol', 'Follow up').score > fuzzy.match('fol', 'Fetch old logs').score);

ok('a short field outranks a long one',
  fuzzy.match('int', 'Intro').score
    > fuzzy.match('int', 'Intro to the quarterly process and everything that follows from it').score);

ok('a space in the query is a gap, not a character',
  fuzzy.match('fol up', 'Follow up') !== null);

// Ranking across a set.
const set = [S('Refund policy'), S('Follow up'), S('Out of office')];
const hits = fuzzy.search(set, 'fu');
ok('search ranks Follow up first for "fu"', hits[0].snippet.title === 'Follow up');
ok('search drops non-matches', hits.every((h) => h.snippet.title !== 'Out of office'));

// The body is searched, but never beats a title.
const mixed = [S('Pricing', 'our refund window is 30 days'), S('Refund', 'happy to sort that')];
const refund = fuzzy.search(mixed, 'refund');
ok('a title hit outranks a body hit', refund[0].snippet.title === 'Refund');
ok('a body hit is still found',       refund.length === 2);
ok('a body hit is flagged as one',    refund[1].matchedBody === true);

// Highlight positions have to line up with the characters they mark, or the
// palette marks the wrong letters.
const positions = fuzzy.match('fu', 'Follow up').positions;
ok('positions point at the matched letters',
  positions.map((i) => 'Follow up'[i].toLowerCase()).join('') === 'fu');

// No query means every snippet, unranked — the palette opens showing the lot.
ok('an empty query returns everything', fuzzy.search(set, '').length === 3);

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
