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

const nextOne = store.taskFromInput('acme kickoff', 'type', new Date(),
  (await store.loadSettings()).learned);
check('the next task with that word follows the correction', nextOne.lane, 'personal');

// Unsorting is a deliberate state, not a re-guess waiting to happen.
await store.setLane(homeTask.id, null);
const unsorted = (await store.loadTasks()).find((x) => x.id === homeTask.id);
check('deliberately unfiled stays unfiled', [unsorted.lane, unsorted.laneLocked], [null, true]);

// --- an empty line never becomes a task ---
check('blank input is rejected', store.taskFromInput('   '), null);
// --- a bare date keeps its words rather than saving an empty row ---
check('date-only input keeps the text', store.taskFromInput('tomorrow').text, 'tomorrow');

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
