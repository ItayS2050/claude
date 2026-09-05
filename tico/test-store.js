// node test-store.js — exercises the task model against a stub of
// chrome.storage, so completion, repeats and grouping can be checked without a
// browser. Run it alongside test-nlp.js after touching store.js.
import { readFileSync } from 'node:fs';

const memory = { tasks: [] };
globalThis.chrome = {
  storage: {
    local: {
      // chrome.storage.local.get takes a string or an array of keys; the real
      // one omits keys that were never set, so this does too.
      async get(keys) {
        const wanted = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(wanted.filter((k) => k in memory).map((k) => [k, memory[k]]));
      },
      async set(obj) { Object.assign(memory, structuredClone(obj)); },
    },
  },
};

// Node cannot resolve './nlp.js' from a data: URL, so each local import is
// replaced by the module's own source inlined as another data: URL.
const inline = (file) => {
  const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
    .replace(/from '\.\/([\w-]+\.js)'/g, (_, dep) => `from '${inline(dep)}'`);
  return 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
};

const load = (file) => import(inline(file));

const store = await load('store.js');

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.log(`FAIL  ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
  else console.log(`ok    ${name}`);
};

const day = (ms) => new Date(ms).toISOString().slice(0, 16);

// --- a plain task finishes ---
memory.tasks = [];
const plain = store.taskFromInput('buy milk');
await store.addTask(plain);
await store.completeTask(plain.id);
check('plain task completes', (await store.loadTasks())[0].done, true);

// --- a repeating task rolls forward instead ---
memory.tasks = [];
const now = Date.now();
const daily = store.taskFromInput('standup every day at 9am');
await store.addTask(daily);
const first = (await store.loadTasks())[0].due;
await store.completeTask(daily.id);
const second = (await store.loadTasks())[0];
check('repeat stays open', second.done, false);
check('repeat advances exactly one day', Math.round((second.due - first) / 86400000), 1);

// Ticking one off early must still move it on, not leave it where it was.
await store.completeTask(daily.id);
const third = (await store.loadTasks())[0];
check('repeat advances again from a future due date',
  Math.round((third.due - first) / 86400000), 2);

// --- grouping ---
const H = 3600000;
const mk = (due) => ({ due, done: false, tags: [] });
const midday = new Date(); midday.setHours(12, 0, 0, 0);
const t = +midday;
check('bucket: overdue',  store.bucketOf(mk(t - H), t), 'overdue');
check('bucket: today',    store.bucketOf(mk(t + H), t), 'today');
check('bucket: tomorrow', store.bucketOf(mk(t + 24 * H), t), 'tomorrow');
check('bucket: this week', store.bucketOf(mk(t + 4 * 24 * H), t), 'week');
check('bucket: later',    store.bucketOf(mk(t + 30 * 24 * H), t), 'later');
check('bucket: no date',  store.bucketOf(mk(null), t), 'someday');

// --- badge count: everything due by tonight, done tasks excluded ---
const list = [
  mk(t - H), mk(t + H), mk(t + 24 * H), mk(null),
  { due: t - H, done: true, tags: [] },
];
check('dueCount counts today and overdue only', store.dueCount(list, t), 2);

// --- work / personal filing ---
memory.tasks = []; delete memory.settings;
const workTask = store.taskFromInput('send the invoice to acme');
const homeTask = store.taskFromInput('call mom');
await store.addTask(workTask);
await store.addTask(homeTask);
const filed = await store.loadTasks();
check('work task files itself as work', filed.find((x) => x.id === workTask.id).lane, 'work');
check('personal task files itself as personal', filed.find((x) => x.id === homeTask.id).lane, 'personal');
check('the reason is recorded for the tooltip',
  filed.find((x) => x.id === workTask.id).laneBecause, '“invoice”');

// Moving one by hand sticks, and teaches the words for next time.
await store.setLane(workTask.id, 'personal');
const moved = (await store.loadTasks()).find((x) => x.id === workTask.id);
check('a hand-filed task stays where it was put', [moved.lane, moved.laneLocked], ['personal', true]);
check('the correction is remembered',
  (await store.loadSettings()).learned.acme, 'personal');

const nextOne = store.taskFromInput('acme kickoff', 'type', new Date(), await store.loadSettings());
check('the next task with that word follows the correction', nextOne.lane, 'personal');

// Unsorting is a deliberate state, not a re-guess waiting to happen.
await store.setLane(homeTask.id, null);
const unsorted = (await store.loadTasks()).find((x) => x.id === homeTask.id);
check('deliberately unfiled stays unfiled', [unsorted.lane, unsorted.laneLocked], [null, true]);

// --- clients ---
memory.tasks = []; delete memory.settings;
const campaign = store.taskFromInput('finish campaigns for stream tomorrow');
check('the client comes out of the sentence', campaign.client, 'stream');
check('the date still comes out too', campaign.due !== null, true);
check('the title keeps the client, loses the date', campaign.text, 'Finish campaigns for stream');
check('a client makes it work even with no work words', campaign.lane, 'work');
check('and says so', campaign.laneBecause, 'for stream');

await store.addTask(campaign);
check('adding records the client', (await store.loadSettings()).clients.stream.count, 1);

// Once the name is known it is spotted without the "for".
const bare = store.taskFromInput('stream banner sizes', 'type', new Date(), await store.loadSettings());
check('a known client is matched bare', bare.client, 'stream');
await store.addTask(bare);
check('the second sighting establishes it',
  store.establishedClients((await store.loadSettings()).clients).map((c) => c.name), ['stream']);

// A personal task is not dragged into work just for naming someone.
const personalClient = store.taskFromInput('buy milk for dinner', 'type', new Date(), await store.loadSettings());
check('no client invented from an ordinary phrase', personalClient.client, null);
check('and it stays personal', personalClient.lane, 'personal');

// Correcting a client sticks, and removing one cleans up every task using it.
await store.setClient(campaign.id, 'Stream Media');
const recliented = (await store.loadTasks()).find((t) => t.id === campaign.id);
check('a hand-set client sticks', [recliented.client, recliented.clientLocked], ['Stream Media', true]);
await store.removeClient('stream');
check('removing a client clears it off its tasks',
  (await store.loadTasks()).filter((t) => t.client === 'stream').length, 0);
check('and out of the registry', 'stream' in (await store.loadSettings()).clients, false);

// --- the morning brief ---
// Fixed clock: Thursday 3 September 2026. The window logic is the kind that is
// quietly wrong at 11pm on a Sunday and goes unnoticed for a week.
const at = (day, h, m = 0) => +new Date(2026, 8, day, h, m);
const on = { briefHour: 8, briefDays: 'all' };

check('fires at the hour',            store.briefDue(on, at(3, 8, 0), null), true);
check('fires later that morning',     store.briefDue(on, at(3, 11, 30), null), true);
check('not before the hour',          store.briefDue(on, at(3, 7, 59), null), false);
check('catches up six hours late',    store.briefDue(on, at(3, 14, 0), null), true);
check('but not at nine at night',     store.briefDue(on, at(3, 21, 0), null), false);
check('only once a day',              store.briefDue(on, at(3, 9, 0), '2026-09-03'), false);
check('and again the next day',       store.briefDue(on, at(4, 9, 0), '2026-09-03'), true);
check('off means off',                store.briefDue({ ...on, briefHour: 0 }, at(3, 9), null), false);

// Sept 4 2026 is a Friday, Sept 5 a Saturday, Sept 6 a Sunday.
const sunThu = { ...on, briefDays: 'sun-thu' };
check('sun-thu: quiet on Friday',     store.briefDue(sunThu, at(4, 9), null), false);
check('sun-thu: quiet on Saturday',   store.briefDue(sunThu, at(5, 9), null), false);
check('sun-thu: speaks on Sunday',    store.briefDue(sunThu, at(6, 9), null), true);
const monFri = { ...on, briefDays: 'mon-fri' };
check('mon-fri: speaks on Friday',    store.briefDue(monFri, at(4, 9), null), true);
check('mon-fri: quiet on Sunday',     store.briefDue(monFri, at(6, 9), null), false);

// The local date key must not roll over on UTC's schedule.
check('date key is local',            store.dateKey(new Date(2026, 8, 3, 23, 30)), '2026-09-03');

// --- what the brief says ---
const noonToday = +new Date(2026, 8, 3, 12, 0);
const mk2 = (text, due) => ({ text, due, done: false, tags: [], hasTime: true });
const content = store.briefContent([
  mk2('Send the invoice', noonToday - 3 * 3600000),   // overdue
  mk2('Call mom', noonToday + 5 * 3600000),           // later today
  mk2('Book flights', noonToday + 5 * 86400000),      // next week, not today's problem
  { ...mk2('Old thing', noonToday - 86400000), done: true },
], noonToday);
check('counts today and overdue only', content.title, '1 today · 1 overdue');
check('overdue is listed first',       content.rows[0].title, 'Send the invoice');
check('and labelled as overdue',       content.rows[0].message, 'overdue');
check('next week is left out',         content.rows.length, 2);

check('nothing due says nothing',
  store.briefContent([mk2('Next week', noonToday + 5 * 86400000)], noonToday), null);
check('an empty list says nothing', store.briefContent([], noonToday), null);

// --- an empty line never becomes a task ---
check('blank input is rejected', store.taskFromInput('   '), null);
// --- a bare date keeps its words rather than saving an empty row ---
check('date-only input keeps the text', store.taskFromInput('tomorrow').text, 'tomorrow');

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
