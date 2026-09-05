// node test-sync.js — the merge and the quota maths.
//
// This is the file to distrust first when someone says Tico lost something.
// Every case below is a way two computers can disagree, written as fixed input
// rather than discovered on somebody's laptop.
import { readFileSync } from 'node:fs';

const inline = (file) => {
  const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
    .replace(/from '\.\/([\w-]+\.js)'/g, (_, dep) => `from '${inline(dep)}'`);
  return 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
};
const S = await import(inline('sync.js'));

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.log(`FAIL  ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
  else console.log(`ok    ${name}`);
};

const T = 1_760_000_000_000;                       // a fixed "now"
const task = (id, text, updated, extra = {}) =>
  ({ id, text, created: T - 86400000, updated, done: false, tags: [], ...extra });
const ids = (list) => list.map((t) => t.id).sort();
const textOf = (list, id) => list.find((t) => t.id === id)?.text;

// --- the basic three-way shapes ------------------------------------------
check('a task only the laptop has survives',
  ids(S.mergeTasks([task('a', 'A', T)], [], {})), ['a']);
check('a task only the desktop has survives',
  ids(S.mergeTasks([], [task('b', 'B', T)], {})), ['b']);
check('both sides are kept',
  ids(S.mergeTasks([task('a', 'A', T)], [task('b', 'B', T)], {})), ['a', 'b']);

// --- the same task edited in two places -----------------------------------
check('the newer edit wins',
  textOf(S.mergeTasks([task('a', 'older', T - 1000)], [task('a', 'newer', T)], {}), 'a'), 'newer');
check('and wins from either side',
  textOf(S.mergeTasks([task('a', 'newer', T)], [task('a', 'older', T - 1000)], {}), 'a'), 'newer');
check('no duplicate is left behind',
  S.mergeTasks([task('a', 'x', T)], [task('a', 'y', T + 1)], {}).length, 1);

// --- deletes, which is where a naive merge loses ---------------------------
check('a delete is not resurrected by the other machine',
  ids(S.mergeTasks([], [task('a', 'A', T - 5000)], { a: T })), []);
check('but an edit made after the delete wins',
  ids(S.mergeTasks([task('a', 'A', T + 5000)], [], { a: T })), ['a']);
check('a delete at the same instant as the edit still deletes',
  ids(S.mergeTasks([task('a', 'A', T)], [], { a: T })), []);

// --- tombstones do not accumulate forever ----------------------------------
const old = T - 40 * 86400000;
check('tombstones older than a month are forgotten',
  Object.keys(S.mergeTombstones({ gone: old }, {}, T)), []);
check('recent ones are kept',
  Object.keys(S.mergeTombstones({ gone: T - 86400000 }, {}, T)), ['gone']);
check('both sides are unioned',
  Object.keys(S.mergeTombstones({ a: T }, { b: T }, T)).sort(), ['a', 'b']);
check('the later delete time wins',
  S.mergeTombstones({ a: T - 1000 }, { a: T }, T).a, T);

// --- settings ---------------------------------------------------------------
const local = { sound: false, snoozeMinutes: 30, settingsUpdated: T,
                clients: { acme: { name: 'acme', count: 3, confirmed: false, lastSeen: T } },
                learned: { physio: 'personal' } };
const remote = { sound: true, snoozeMinutes: 10, settingsUpdated: T - 1000,
                 clients: { globex: { name: 'globex', count: 1, confirmed: false, lastSeen: T } },
                 learned: { acme: 'work' } };
const merged = S.mergeSettings(local, remote);
check('the newer settings win on scalars', [merged.sound, merged.snoozeMinutes], [false, 30]);
check('but clients from both sides are kept', Object.keys(merged.clients).sort(), ['acme', 'globex']);
check('and so is everything learned', Object.keys(merged.learned).sort(), ['acme', 'physio']);

const bothKnow = S.mergeSettings(
  { clients: { acme: { name: 'acme', count: 2, confirmed: false, lastSeen: T - 100 } }, settingsUpdated: T },
  { clients: { acme: { name: 'acme', count: 5, confirmed: true, lastSeen: T } }, settingsUpdated: T - 1 });
check('a client seen on both machines takes the higher count', bothKnow.clients.acme.count, 5);
check('and stays confirmed if either confirmed it', bothKnow.clients.acme.confirmed, true);

// --- device-local settings do not travel ------------------------------------
check('the AI toggle is not synced',
  'aiAssist' in S.syncableSettings({ aiAssist: true, sound: true }), false);
check('nor is the last brief date',
  'lastBrief' in S.syncableSettings({ lastBrief: '2026-09-05', sound: true }), false);

// --- chunking against the real quota ----------------------------------------
const many = Array.from({ length: 400 }, (_, i) =>
  task(`t${i}`, `A task with a reasonably typical amount of text in it, number ${i}`, T - i));
const { chunks, dropped } = S.chunkTasks(many);
const enc = new TextEncoder();
const oversize = chunks.filter((c) => enc.encode(JSON.stringify(c)).length > S.LIMITS.ITEM_LIMIT);
check('no chunk exceeds the per-item limit', oversize.length, 0);
const totalBytes = chunks.reduce((n, c) => n + enc.encode(JSON.stringify(c)).length, 0);
check('the whole payload fits the total quota', totalBytes < S.LIMITS.TOTAL_LIMIT, true);
console.log(`      (${many.length} tasks → ${chunks.length} chunks, ${totalBytes} bytes, ${dropped.length} dropped)`);

// When something has to go, it is finished work rather than a live task.
const mixed = [
  ...Array.from({ length: 500 }, (_, i) => task(`done${i}`, `Finished thing ${i}`, T - i, { done: true })),
  ...Array.from({ length: 200 }, (_, i) => task(`open${i}`, `Still to do ${i}`, T - i)),
];
const full = S.chunkTasks(mixed);
check('a full quota drops completed tasks, not open ones',
  full.dropped.every((t) => t.done), true);
check('and every open task survived',
  full.chunks.flat().filter((t) => !t.done).length, 200);

// --- the write plan ----------------------------------------------------------
const plan = S.planWrite(many.slice(0, 40), local, { gone: T }, 0);
check('meta records the chunk count', plan.payload['v1.meta'].chunks, plan.chunkCount);
check('tombstones are written', plan.payload['v1.tombs'], { gone: T });
check('nothing stale to clear on a first write', plan.stale, []);
const shrunk = S.planWrite(many.slice(0, 5), local, {}, 6);
check('shrinking clears the orphaned chunks',
  shrunk.stale, ['v1.tasks.1', 'v1.tasks.2', 'v1.tasks.3', 'v1.tasks.4', 'v1.tasks.5']);

// --- reading back ------------------------------------------------------------
const round = S.readRemote(plan.payload);
check('what was written reads back whole', round.tasks.length, 40);
check('an empty bucket reads as nothing', S.readRemote({}), null);
check('a future schema is refused rather than half-read',
  S.readRemote({ 'v1.meta': { schema: 99, chunks: 1 } }), null);

// --- the round trip that matters ---------------------------------------------
// Laptop deletes one and edits another while the desktop is asleep.
const before = [task('keep', 'Keep', T - 10000), task('kill', 'Kill', T - 10000), task('edit', 'Old', T - 10000)];
const laptop = [before[0], { ...before[2], text: 'New', updated: T }];
const tombs = { kill: T };
const desktop = before;
const after = S.mergeTasks(laptop, desktop, tombs);
check('the deleted one is gone', after.find((t) => t.id === 'kill'), undefined);
check('the edited one is the new version', textOf(after, 'edit'), 'New');
check('the untouched one is still there', textOf(after, 'keep'), 'Keep');

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
