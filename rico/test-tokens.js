// node test-tokens.js — {FirstName} guessing, which is a paid feature and so
// has to be right more often than it is clever.
const tokens = require('./tokens.js');

let failed = 0;
const ok = (label, cond) => {
  if (cond) console.log(`ok    ${label}`);
  else { failed++; console.log(`FAIL  ${label}`); }
};
const is = (label, actual, expected) => {
  if (actual === expected) console.log(`ok    ${label}`);
  else { failed++; console.log(`FAIL  ${label} -> ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); }
};

// Finding them.
const found = tokens.find('Hi {FirstName}, about {Project} — {FirstName} again');
is('finds each token once', found.length, 2);
is('keeps first-seen order', found[0].name, 'FirstName');
ok('marks the one it can fill itself', found[0].auto === true);
ok('marks the one it cannot', found[1].auto === false);
is('ignores text with no tokens', tokens.find('no tokens here').length, 0);
is('ignores an empty body', tokens.find('').length, 0);

// Names out of chips.
const name = (n, e = '') => tokens.firstNameOf({ name: n, email: e });
is('plain display name',      name('John Doe'), 'John');
is('single word name',        name('Madonna'), 'Madonna');
is('directory order',         name('Doe, John'), 'John');
is('skips a title',           name('Dr. Alice Chen'), 'Alice');
is('normalises shouting',     name('JOHN DOE'), 'John');
is('strips quotes',           name('"John" Doe'), 'John');

// Names out of addresses, when there is no display name.
is('dotted address',   name('', 'john.doe@acme.com'), 'John');
is('underscored',      name('', 'jane_smith@acme.com'), 'Jane');
is('plus addressing',  name('', 'sam+news@acme.com'), 'Sam');
is('trailing digits',  name('', 'mike99@acme.com'), 'Mike');
is('name field holding an address', name('john.doe@acme.com'), 'John');

// The cases where a guess is worse than nothing. Greeting a shared mailbox by
// name reads as a mail merge that went wrong, which is exactly the impression
// a canned response is trying not to give.
is('a role address yields nothing',  name('', 'support@acme.com'), '');
is('no-reply yields nothing',        name('', 'no-reply@acme.com'), '');
is('initials are too short to guess', name('', 'jd@acme.com'), '');
is('nothing at all',                 tokens.firstNameOf(null), '');

// Resolving.
const body = 'Hi {FirstName}, about {Project}.';
const to = [{ name: 'John Doe', email: 'john@acme.com' }];

const free = tokens.resolve(body, { recipients: to, canAuto: false });
is('free: both tokens are asked about', free.pending.length, 2);

const pro = tokens.resolve(body, { recipients: to, canAuto: true });
is('pro: only the unknown token is asked about', pro.pending.length, 1);
is('pro: FirstName filled itself', pro.filled.firstname, 'John');

const anon = tokens.resolve(body, { recipients: [{ name: '', email: 'info@acme.com' }], canAuto: true });
is('pro: an unguessable recipient falls back to asking', anon.pending.length, 2);

const typed = tokens.resolve(body, { recipients: to, canAuto: true, values: { project: 'Q3' } });
is('a value the user typed is kept', typed.filled.project, 'Q3');
is('and nothing is left pending', typed.pending.length, 0);

// Applying.
is('substitutes what it has',
  tokens.apply(body, { firstname: 'John', project: 'Q3' }),
  'Hi John, about Q3.');
is('leaves a token it has no value for alone',
  tokens.apply(body, { firstname: 'John' }),
  'Hi John, about {Project}.');
is('matching ignores case',
  tokens.apply('Hi {firstname}', { firstname: 'John' }),
  'Hi John');
is('line breaks survive',
  tokens.apply('Hi {FirstName},\n\nThanks', { firstname: 'Jo' }),
  'Hi Jo,\n\nThanks');

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
