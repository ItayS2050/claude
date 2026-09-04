// The task list and everything that reads or writes it. Shared by the popup and
// the service worker, so both agree on what a task is and where it lives.
import { parse, nextOccurrence } from './nlp.js';
import { classify, learn } from './classify.js';

const KEY = 'tasks';
const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS = {
  sound: true,          // play Chrome's notification sound
  snoozeMinutes: 10,
  learned: {},          // words the user has re-filed, and where they put them
};

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function loadTasks() {
  const got = await chrome.storage.local.get([KEY, SETTINGS_KEY]);
  const list = Array.isArray(got[KEY]) ? got[KEY] : [];
  const learned = got[SETTINGS_KEY]?.learned || {};
  return list.map((t) => normalise(t, learned));
}

export async function saveTasks(tasks) {
  await chrome.storage.local.set({ [KEY]: tasks });
}

export async function loadSettings() {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(got[SETTINGS_KEY] || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// Old records gain new fields as the extension grows; fill the gaps on read so
// nothing downstream has to test for undefined.
function normalise(t, learned = {}) {
  // Work/personal is recomputed from the text every time unless the user has
  // said otherwise. That way a task filed wrongly today gets filed correctly
  // once the word list learns the word — and a task the user moved by hand
  // stays exactly where they put it, including deliberately unsorted.
  const guess = t.laneLocked ? { lane: t.lane ?? null, because: 'you filed this' }
                             : classify(t.text || '', t.tags || [], learned);
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
    notified: Boolean(t.notified),
    source: t.source || 'type',
    lane: guess.lane,
    laneLocked: Boolean(t.laneLocked),
    laneBecause: guess.because,
  };
}

/** Build a task from raw input. Returns null if there is nothing to save. */
export function taskFromInput(raw, source = 'type', now = new Date(), learned = {}) {
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
  }, learned);
}

export async function addTask(task) {
  const tasks = await loadTasks();
  tasks.unshift(task);
  await saveTasks(tasks);
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
    tasks[i] = { ...t, due: next, notified: false, done: false };
  } else {
    tasks[i] = { ...t, done: true, doneAt: Date.now(), notified: true };
  }
  await saveTasks(tasks);
  return tasks[i];
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
  tasks[i] = { ...tasks[i], lane, laneLocked: true, laneBecause: 'you filed this' };
  await saveTasks(tasks);

  const settings = await loadSettings();
  await saveSettings({ ...settings, learned: learn(settings.learned || {}, tasks[i].text, lane) });
  return tasks[i];
}

export { parse, nextOccurrence, classify };
