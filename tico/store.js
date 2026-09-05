// The task list and everything that reads or writes it. Shared by the popup and
// the service worker, so both agree on what a task is and where it lives.
import { parse, nextOccurrence } from './nlp.js';
import { classify, learn } from './classify.js';
import { detectClient, matchKnown, remember, forget, establishedClients } from './clients.js';
import { touch } from './sync.js';

const KEY = 'tasks';
const SETTINGS_KEY = 'settings';
const TOMBS_KEY = 'tombstones';

export const DEFAULT_SETTINGS = {
  sound: true,          // play Chrome's notification sound
  snoozeMinutes: 10,
  learned: {},          // words the user has re-filed, and where they put them
  clients: {},          // names seen in tasks, and how often
  aiAssist: false,      // use Chrome's on-device model, where there is one
  briefHour: 8,         // the morning brief, 0 = off
  briefDays: 'all',     // all | sun-thu | mon-fri
  lastBrief: null,      // the day the last one went out, so it goes once
  syncEnabled: false,   // carry the list between this Chrome's other machines
};

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function loadTasks() {
  const got = await chrome.storage.local.get([KEY, SETTINGS_KEY]);
  const list = Array.isArray(got[KEY]) ? got[KEY] : [];
  const settings = got[SETTINGS_KEY] || {};
  return list.map((t) => normalise(t, settings.learned || {}, settings.clients || {}));
}

export async function saveTasks(tasks) {
  await chrome.storage.local.set({ [KEY]: tasks });
}

export async function loadSettings() {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(got[SETTINGS_KEY] || {}) };
}

export async function saveSettings(settings) {
  // Stamped on every write so the two machines can tell whose settings are
  // newer without a central clock.
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { ...settings, settingsUpdated: Date.now() },
  });
}

export async function loadTombstones() {
  const got = await chrome.storage.local.get(TOMBS_KEY);
  return got[TOMBS_KEY] || {};
}

export async function saveTombstones(tombstones) {
  await chrome.storage.local.set({ [TOMBS_KEY]: tombstones });
}

/**
 * Delete, and remember having deleted. Without the tombstone the other machine
 * still has the task and hands it straight back on the next merge.
 */
export async function deleteTasks(ids) {
  const doomed = new Set(ids);
  const tasks = await loadTasks();
  await saveTasks(tasks.filter((t) => !doomed.has(t.id)));
  const tombs = await loadTombstones();
  const now = Date.now();
  for (const id of doomed) tombs[id] = now;
  await saveTombstones(tombs);
}

// Old records gain new fields as the extension grows; fill the gaps on read so
// nothing downstream has to test for undefined.
function normalise(t, learned = {}, clients = {}) {
  // Work/personal is recomputed from the text every time unless the user has
  // said otherwise. That way a task filed wrongly today gets filed correctly
  // once the word list learns the word — and a task the user moved by hand
  // stays exactly where they put it, including deliberately unsorted.
  const guess = t.laneLocked ? { lane: t.lane ?? null, because: 'you filed this' }
                             : classify(t.text || '', t.tags || [], learned);

  // A task written before a client was known picks it up once the name has been
  // seen enough times to be a real client — but only established ones, so a
  // one-off guess never spreads itself across the whole list.
  let client = t.client ?? null;
  if (!client && !t.clientLocked) {
    const established = Object.fromEntries(
      establishedClients(clients).map((c) => [c.name.toLowerCase(), c]));
    client = matchKnown(t.text || '', established);
  }

  // Client work is work. It is the one signal strong enough to file a sentence
  // the word lists made nothing of — "finish campaigns for stream" has no work
  // vocabulary in it at all.
  const lane = guess.lane || (client && !t.laneLocked ? 'work' : guess.lane);
  const because = guess.lane ? guess.because : (client ? `for ${client}` : guess.because);

  return {
    id: t.id || uid(),
    text: t.text || '',
    note: t.note || '',
    due: typeof t.due === 'number' ? t.due : null,
    hasTime: Boolean(t.hasTime),
    repeat: t.repeat || null,
    priority: t.priority || 0,
    tags: Array.isArray(t.tags) ? t.tags : [],
    done: Boolean(t.done),
    doneAt: t.doneAt || null,
    created: t.created || Date.now(),
    updated: t.updated || t.created || Date.now(),
    notified: Boolean(t.notified),
    source: t.source || 'type',
    lane,
    laneLocked: Boolean(t.laneLocked),
    laneBecause: because,
    client,
    clientLocked: Boolean(t.clientLocked),
  };
}

/** Build a task from raw input. Returns null if there is nothing to save. */
export function taskFromInput(raw, source = 'type', now = new Date(), settings = {}) {
  const learned = settings.learned || {};
  const clients = settings.clients || {};
  const parsed = parse(raw, now);
  // "tomorrow at 5" on its own is a reminder with no subject — keep the words
  // rather than saving a blank row.
  const text = parsed.text || String(raw).trim();
  if (!text) return null;
  return normalise({
    id: uid(),
    text,
    due: parsed.due,
    hasTime: parsed.hasTime,
    repeat: parsed.repeat,
    priority: parsed.priority,
    tags: parsed.tags,
    created: Date.now(),
    source,
    client: detectClient(parsed.text || String(raw), clients,
      (w) => classify(w).lane !== null).client,
  }, learned, clients);
}

export async function addTask(task) {
  const tasks = await loadTasks();
  tasks.unshift(task);
  await saveTasks(tasks);
  if (task.client) {
    const settings = await loadSettings();
    await saveSettings({ ...settings, clients: remember(settings.clients || {}, task.client) });
  }
  return task;
}

/**
 * Tick a task off. A repeating task is not finished — it rolls to its next
 * occurrence instead, which is the whole point of "every day at 9".
 */
export async function completeTask(id) {
  const tasks = await loadTasks();
  const i = tasks.findIndex((t) => t.id === id);
  if (i === -1) return null;
  const t = tasks[i];

  if (t.repeat && t.due) {
    // Advance past the occurrence being ticked off, not merely past now —
    // otherwise finishing tomorrow's standup early leaves it on tomorrow.
    const next = nextOccurrence(t.due, t.repeat, Math.max(Date.now(), t.due));
    tasks[i] = touch({ ...t, due: next, notified: false, done: false });
  } else {
    tasks[i] = touch({ ...t, done: true, doneAt: Date.now(), notified: true });
  }
  await saveTasks(tasks);
  return tasks[i];
}

// --- the morning brief -----------------------------------------------------

/** Local YYYY-MM-DD. Not toISOString, which is UTC and rolls over at the wrong
 *  time for anyone east or west of Greenwich. */
export function dateKey(d) {
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

/**
 * Should the brief go out right now? Pure, so the window logic can be tested
 * against a fixed clock instead of by waiting until morning.
 */
export function briefDue(settings, now, lastBrief) {
  const hour = settings.briefHour;
  if (!hour) return false;                        // 0 or null means switched off

  const d = new Date(now);
  const day = d.getDay();                         // 0 Sun … 6 Sat
  const days = settings.briefDays || 'all';
  if (days === 'sun-thu' && (day === 5 || day === 6)) return false;
  if (days === 'mon-fri' && (day === 0 || day === 6)) return false;

  if (lastBrief === dateKey(d)) return false;     // one a day, no more

  const start = new Date(d);
  start.setHours(hour, 0, 0, 0);
  if (+d < +start) return false;
  // A "morning" brief at nine at night is not one. If the browser was shut all
  // morning, catch it up to six hours late and then let it go.
  return +d <= +start + 6 * 60 * 60 * 1000;
}

/** What the brief has to say, or null when it has nothing worth saying. */
export function briefContent(tasks, now = Date.now()) {
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  const open = tasks.filter((t) => !t.done && t.due != null);
  const overdue = open.filter((t) => t.due < now);
  const today = open.filter((t) => t.due >= now && t.due <= +endOfToday);

  // Nothing due is not news. An extension that pings you to say it has nothing
  // to say is one you turn off.
  if (!overdue.length && !today.length) return null;

  const parts = [];
  if (today.length) parts.push(`${today.length} today`);
  if (overdue.length) parts.push(`${overdue.length} overdue`);

  const rows = [...overdue, ...today]
    .sort((a, b) => a.due - b.due)
    .slice(0, 5)
    .map((t) => ({
      title: t.text.slice(0, 42),
      message: t.due < now
        ? 'overdue'
        : (t.hasTime
            ? new Date(t.due).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            : 'today'),
    }));

  return { title: parts.join(' · '), count: overdue.length + today.length, rows };
}

// --- grouping --------------------------------------------------------------

export const BUCKETS = [
  { id: 'overdue',  label: 'Overdue' },
  { id: 'today',    label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week',     label: 'This week' },
  { id: 'later',    label: 'Later' },
  { id: 'someday',  label: 'No date' },
];

export function bucketOf(task, now = Date.now()) {
  if (task.due == null) return 'someday';
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const dayStart = +today;
  const due = task.due;
  if (due < now) return 'overdue';
  if (due < dayStart + 86400000) return 'today';
  if (due < dayStart + 2 * 86400000) return 'tomorrow';
  if (due < dayStart + 8 * 86400000) return 'week';
  return 'later';
}

/** Open tasks that are due now or earlier — what the badge counts. */
export function dueCount(tasks, now = Date.now()) {
  const today = new Date(now); today.setHours(23, 59, 59, 999);
  return tasks.filter((t) => !t.done && t.due != null && t.due <= +today).length;
}

/** Move a task between lanes by hand, and remember the words that put it there. */
export async function setLane(id, lane) {
  const tasks = await loadTasks();
  const i = tasks.findIndex((t) => t.id === id);
  if (i === -1) return null;
  tasks[i] = touch({ ...tasks[i], lane, laneLocked: true, laneBecause: 'you filed this' });
  await saveTasks(tasks);

  const settings = await loadSettings();
  await saveSettings({ ...settings, learned: learn(settings.learned || {}, tasks[i].text, lane) });
  return tasks[i];
}

/** Set or clear a task's client by hand; the choice sticks through reloads. */
export async function setClient(id, client) {
  const tasks = await loadTasks();
  const i = tasks.findIndex((t) => t.id === id);
  if (i === -1) return null;
  tasks[i] = touch({ ...tasks[i], client: client || null, clientLocked: true });
  await saveTasks(tasks);
  if (client) {
    const settings = await loadSettings();
    await saveSettings({
      ...settings,
      clients: remember(settings.clients || {}, client, { confirmed: true }),
    });
  }
  return tasks[i];
}

/** Drop a client from the registry and off every task carrying it. */
export async function removeClient(name) {
  const settings = await loadSettings();
  await saveSettings({ ...settings, clients: forget(settings.clients || {}, name) });
  const tasks = await loadTasks();
  const key = String(name).toLowerCase();
  await saveTasks(tasks.map((t) =>
    (t.client || '').toLowerCase() === key ? touch({ ...t, client: null, clientLocked: true }) : t));
}

export { parse, nextOccurrence, classify, establishedClients, touch };
