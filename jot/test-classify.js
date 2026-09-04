// node test-classify.js — the work/personal split. Worth testing carefully:
// a classifier that files things wrongly is worse than no classifier at all,
// because the user stops trusting the two lanes and goes back to one list.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./classify.js', import.meta.url), 'utf8');
const { classify, learn, wordsToLearn } =
  await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

let failed = 0;
const is = (text, want, tags = [], learned = {}) => {
  const got = classify(text, tags, learned);
  if (got.lane !== want) {
    failed++;
    console.log(`FAIL  "${text}"\n      filed as ${got.lane} ${got.because}, expected ${want}`);
  } else {
    console.log(`ok    ${String(want).padEnd(8)} ${got.because.padEnd(18)} ${text}`);
  }
};

// --- work ---
is('send the invoice to acme', 'work');
is('standup at 9:30', 'work');
is('prep the deck for the board', 'work');
is('review the pull request', 'work');
is('interview the backend candidate', 'work');
is('deploy to production', 'work');
is('submit expenses', 'work');
is('פגישה עם הלקוח', 'work');
is('לשלוח חשבונית', 'work');
is('להכין מצגת לצוות', 'work');

// --- personal ---
is('call mom', 'personal');
is('buy milk and bread', 'personal');
is('dentist appointment', 'personal');
is('walk the dog', 'personal');
is('pay the rent', 'personal');
is('book flights for the holiday', 'personal');
is('pick up the kids from school', 'personal');
is('לקנות חלב', 'personal');
is('לקבוע תור לרופא', 'personal');
is('לשלם ארנונה', 'personal');
is('יום הולדת לאמא', 'personal');

// --- tags are an explicit instruction and outrank the word list ---
is('call mom', 'work', ['work']);
is('deploy to production', 'personal', ['personal']);

// --- nothing recognised stays unsorted rather than being guessed ---
is('xyzzy', null);
is('thing', null);
is('sort out the whatsit', null);

// --- a sentence with signals on both sides is not forced ---
is('invoice mom', null);

// --- learning from a correction ---
const learned = learn({}, 'physio appointment on tuesday', 'personal');
console.log('\nlearned from "physio appointment on tuesday":', JSON.stringify(learned));
is('physio again', 'personal', [], learned);

// A learned word outweighs a built-in one pointing the other way.
const taught = learn({}, 'acme invoice review', 'personal');
is('acme invoice', 'personal', [], taught);

// Unsorting forgets what it taught.
const forgotten = learn(learned, 'physio appointment on tuesday', null);
is('physio again', null, [], forgotten);

// --- the words it picks up are the distinctive ones ---
const words = wordsToLearn('call the physiotherapist about tuesday');
const okWords = !words.includes('call') && !words.includes('the') && words.includes('physiotherapist');
if (!okWords) { failed++; console.log(`FAIL  wordsToLearn -> ${JSON.stringify(words)}`); }
else console.log(`ok    wordsToLearn skips filler -> ${JSON.stringify(words)}`);

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
