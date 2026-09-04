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

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
