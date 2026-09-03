// node test-store.js — exercises the task model against a stub of
// chrome.storage, so completion, repeats and grouping can be checked without a
// browser. Run it alongside test-nlp.js after touching store.js.
import { readFileSync } from 'node:fs';

const memory = { tasks: [], settings: {} };
globalThis.chrome = {
  storage: {
    local: {
      async get(key) { return key in memory ? { [key]: memory[key] } : {}; },
      async set(obj) { Object.assign(memory, structuredClone(obj)); },
    },
  },
};

const load = async (file) => {
  const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
    // The module graph is flat; point store.js at the copy we already inlined.
    .replace("from './nlp.js'", `from 'data:text/javascript;base64,${
      Buffer.from(readFileSync(new URL('./nlp.js', import.meta.url), 'utf8')).toString('base64')}'`);
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
};

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

// --- an empty line never becomes a task ---
check('blank input is rejected', store.taskFromInput('   '), null);
// --- a bare date keeps its words rather than saving an empty row ---
check('date-only input keeps the text', store.taskFromInput('tomorrow').text, 'tomorrow');

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
