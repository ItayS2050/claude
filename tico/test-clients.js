// node test-clients.js — client and project detection. The tests that matter
// most here are the negative ones: a system that invents a client out of "for
// dinner" produces a filter list full of rubbish, and the user turns it off.
import { readFileSync } from 'node:fs';

const inline = (file) => {
  const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
    .replace(/from '\.\/([\w-]+\.js)'/g, (_, dep) => `from '${inline(dep)}'`);
  return 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
};
const cl = await import(inline('clients.js'));
const { classify } = await import(inline('classify.js'));

// The classifier's vocabulary doubles as the "this is an ordinary word" test.
const isCommon = (w) => classify(w).lane !== null;

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.log(`FAIL  ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
  else console.log(`ok    ${name}`);
};
const finds = (text, want) =>
  check(`${want === null ? 'ignores' : 'finds'.padEnd(6)} ${String(want).padEnd(10)} ${text}`,
        cl.extractCandidate(text, isCommon), want);

// --- names the sentence gives up ---
finds('Finish campaigns for stream', 'stream');
finds('Send the invoice to acme', 'acme');
finds('Meeting with sarah', 'sarah');
finds('Prep the deck @northwind', 'northwind');
finds('Ship the release for the acme launch', 'acme');
finds('לסיים קמפיינים עבור סטרים', 'סטרים');

// --- ordinary sentences that must NOT produce a client ---
finds('Buy milk for dinner', null);
finds('Pick up flowers for mom', null);
finds('Call mom', null);
finds('Book a table for tonight', null);
finds('Do the shopping for the week', null);
finds('Ask for a raise', null);
finds('Send it to me', null);
finds('Prep for the meeting', null);
finds('Set aside time for review', null);

// --- once known, a client is spotted without the "for" ---
let clients = {};
clients = cl.remember(clients, 'stream');
check('a known name matches bare', cl.matchKnown('stream campaign copy', clients), 'stream');
check('an unknown name does not', cl.matchKnown('acme campaign copy', clients), null);
check('substrings are not matches', cl.matchKnown('streaming service outage', clients), null);

// --- promotion by repetition ---
check('one sighting is only a guess', cl.establishedClients(clients).length, 0);
clients = cl.remember(clients, 'stream');
check('two sightings make it a client', cl.establishedClients(clients).map((c) => c.name), ['stream']);
check('the count is kept', clients.stream.count, 2);

// Confirming by hand skips the wait.
let confirmed = cl.remember({}, 'northwind', { confirmed: true });
check('confirming promotes immediately', cl.establishedClients(confirmed).map((c) => c.name), ['northwind']);

// --- detectClient prefers what it already knows over a fresh guess ---
check('known beats new', cl.detectClient('email stream about acme', clients, isCommon),
  { client: 'stream', isNew: false });
check('new is flagged as new', cl.detectClient('proposal for globex', clients, isCommon),
  { client: 'globex', isNew: true });

// --- forgetting a wrong one ---
check('forget removes it', Object.keys(cl.forget(clients, 'Stream')), []);

// --- the registry stays bounded ---
let many = {};
for (let i = 0; i < 200; i++) many = cl.remember(many, `client${i}`);
check('registry is capped', Object.keys(many).length <= 120, true);

// --- the sentence that exposed all three (reported from a real screenshot) ---
// "For Stream- i need to run the new personlized campaign from or" was filed
// under campaign. Three separate faults lined up: the trailing hyphen, the
// longest-known-name sort, and the registry being consulted before the wording.
let real = {};
for (const n of ['campaign', 'wing', 'stream']) real = cl.remember(real, n);

finds('For Stream- i need to run the new personlized campaign from or', 'Stream');
check('the stated client wins over one merely mentioned',
  cl.detectClient('For Stream- i need to run the new personlized campaign from or', real, isCommon),
  { client: 'stream', isNew: false });
check('a second real sentence stays with its own client',
  cl.detectClient('For wing- i need to vuild new lists with AI', real, isCommon),
  { client: 'wing', isNew: false });

// --- trailing punctuation is not part of the name ---
// Inner punctuation still is, or Coca-Cola and O'Neill break.
finds('for Stream- run the campaign', 'Stream');
finds('for acme, send the invoice', 'acme');
finds('for coca-cola, book the studio', 'coca-cola');
finds("for o'neill, draft the brief", "o'neill");

// --- a name said first beats a longer one said later ---
check('earliest mention wins, not the longest name',
  cl.matchKnown('run the campaign for stream', real), 'campaign');
check('and the other way round too',
  cl.matchKnown('stream wants the campaign', real), 'stream');

// Length is still the tie-break where it was needed: two known names starting
// at the same spot, one a prefix of the other.
let pre = {};
for (const n of ['acme', 'acme corp']) pre = cl.remember(pre, n);
check('the longer name still wins a tie', cl.matchKnown('ping acme corp today', pre), 'acme corp');
check('the shorter one still matches alone', cl.matchKnown('ping acme today', pre), 'acme');

// --- a differently spelled name is the same client, not a second one ---
check('stored spelling is kept so the group does not split',
  cl.detectClient('for STREAM, send the report', real, isCommon), { client: 'stream', isNew: false });
check('and it keeps its colour', cl.colourOf(real, 'STREAM'), cl.colourOf(real, 'stream'));

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
