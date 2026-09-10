// node test-repeats.js — what counts as a repeat worth mentioning. The risk
// this file exists for is a feature that fires too often: a card that appears
// after every mail gets the whole extension uninstalled, and the failure looks
// like success in a unit test unless the boring cases are written down.

function fakeChrome() {
  const store = new Map();
  return {
    storage: {
      local: {
        get(keys, cb) {
          let out = {};
          if (keys == null) out = Object.fromEntries(store);
          else for (const k of [].concat(keys)) if (store.has(k)) out[k] = store.get(k);
          cb(JSON.parse(JSON.stringify(out)));
        },
        set(items, cb) {
          for (const [k, v] of Object.entries(items)) store.set(k, v);
          cb();
        },
      },
    },
    runtime: { lastError: undefined },
  };
}
globalThis.chrome = fakeChrome();

const repeats = require('./repeats.js');

let failed = 0;
const ok = (label, cond) => {
  if (cond) console.log(`ok    ${label}`);
  else { failed++; console.log(`FAIL  ${label}`); }
};
const is = (label, actual, expected) => ok(`${label} -> ${JSON.stringify(actual)}`, actual === expected);
const reset = () => { globalThis.chrome = fakeChrome(); };

// A real paragraph: long enough, wordy enough, not a pleasantry.
const REAL = 'Thanks for sending that over. I have had a look through the numbers and '
  + 'the second quarter looks workable, but I would want to walk through the '
  + 'assumptions behind the growth line before we commit to anything.';

const OTHER = 'Just so you have it in writing: the contract runs to the end of March '
  + 'and either side can give thirty days notice at any point before then.';

(async () => {
  // ------------------------------------------------------------- normalising
  is('case does not matter', repeats.hash('Book A Call'), repeats.hash('book a call'));
  is('punctuation does not matter', repeats.hash('book a call.'), repeats.hash('book a call'));
  is('spacing does not matter', repeats.hash('book  a\ncall'), repeats.hash('book a call'));
  ok('different text hashes differently', repeats.hash('book a call') !== repeats.hash('book a taxi'));
  // Names are kept, so the same sentence to two people is two paragraphs. A
  // missed suggestion costs nothing; a wrong one costs patience.
  ok('names are not normalised away',
    repeats.hash('call with John') !== repeats.hash('call with Sarah'));

  // ------------------------------------------------------------ what counts
  is('a real paragraph counts', repeats.blocks(REAL).length, 1);
  is('a short line does not', repeats.blocks('Sounds good, thanks!').length, 0);
  is('a greeting does not', repeats.blocks('Hi John, hope you are having a good week so far and that the move went well.').length, 0);
  is('a sign-off does not', repeats.blocks('Thanks again for all your help with this, it is genuinely appreciated by the whole team.').length, 0);
  is('a mobile footer does not', repeats.blocks('Sent from my iPhone, please excuse any typos or unusual brevity in this message.').length, 0);
  is('two paragraphs are two blocks', repeats.blocks(`${REAL}\n\n${OTHER}`).length, 2);
  is('an empty message has none', repeats.blocks('').length, 0);

  // ---------------------------------------------------------- the first time
  reset();
  is('nothing is suggested the first time', await repeats.record(REAL), null);

  // --------------------------------------------------------- the second time
  const second = await repeats.record(REAL);
  ok('the second time is a repeat', second !== null);
  is('and it hands back the paragraph', second && second.text, repeats.blocks(REAL)[0]);

  // ------------------------------------------------------------- the details
  reset();
  await repeats.record(REAL);
  is('a different paragraph is not a repeat', await repeats.record(OTHER), null);

  reset();
  await repeats.record(REAL);
  const reworded = await repeats.record(REAL.replace('Thanks for sending that over.', 'thanks FOR sending that over!'));
  ok('a repeat survives different case and punctuation', reworded !== null);

  // Already saved as a snippet — offering to save it again is noise.
  reset();
  await repeats.record(REAL);
  is('never offers something already saved', await repeats.record(REAL, [REAL]), null);

  // "Never" has to stick.
  reset();
  await repeats.record(REAL);
  const toMute = await repeats.record(REAL);
  await repeats.mute(toMute.key);
  is('a muted paragraph is never raised again', await repeats.record(REAL), null);

  // One card, not three.
  reset();
  const long = `${REAL} It also needs a second sentence to be clearly the longer of the two.`;
  await repeats.record(`${long}\n\n${OTHER}`);
  const many = await repeats.record(`${long}\n\n${OTHER}`);
  ok('two repeats in one mail still offer only one', many !== null && typeof many.text === 'string');
  ok('and it is the longer one', many.text.length > OTHER.length);

  // ------------------------------------------------------------- the guesses
  is('titles come from the opening words',
    repeats.suggestTitle('Happy to jump on a call this week. Let me know what suits.'),
    'Happy to jump on a call');
  ok('long titles are cut', repeats.suggestTitle(REAL).length <= 49);
  is('an empty body still gets a title', repeats.suggestTitle(''), 'Saved snippet');

  is('tags a pricing mail', repeats.suggestTag('I have attached the invoice for last month.'), 'pricing');
  is('tags a scheduling mail', repeats.suggestTag('Can we reschedule to Thursday?'), 'scheduling');
  is('tags a follow-up', repeats.suggestTag('Just checking in on the below.'), 'follow-up');
  is('leaves an ambiguous mail untagged', repeats.suggestTag('The weather here has been strange.'), '');

  // ------------------------------------------------------------- the ceiling
  reset();
  for (let i = 0; i < repeats.MAX_TRACKED + 60; i++) {
    await repeats.record(`${REAL} Sentence number ${i} makes this paragraph distinct from the others.`);
  }
  const stored = await new Promise((r) => chrome.storage.local.get('repeats', (v) => r(v.repeats)));
  ok(`the tracked list is capped (${Object.keys(stored).length} <= ${repeats.MAX_TRACKED})`,
    Object.keys(stored).length <= repeats.MAX_TRACKED);

  // The thing the privacy claim rests on: no message text is written anywhere.
  const serialised = JSON.stringify(stored);
  ok('no message text is stored, only hashes and counts',
    !serialised.includes('assumptions') && !serialised.includes('Sentence number'));

  console.log(failed ? `\n${failed} failing` : '\nall passing');
  process.exit(failed ? 1 : 0);
})();
