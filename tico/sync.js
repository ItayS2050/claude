// Merging two copies of the list, and fitting them through chrome.storage.sync.
//
// Everything here is pure: it takes state and returns state, so the parts that
// can silently destroy someone's tasks — a delete that comes back, an edit that
// loses to a stale copy, a list that quietly stops fitting — are testable
// against fixed inputs instead of against two real laptops.
//
// The model is last-write-wins per task, keyed on `updated`, with tombstones for
// deletes. That is not a general-purpose CRDT and does not try to be: two people
// are not editing one task at once here, one person is using two computers, and
// the failure it has to prevent is a delete on the laptop being resurrected by
// the desktop's older copy.

export const SCHEMA = 1;

// chrome.storage.sync's real limits. A single item may not exceed 8192 bytes
// including its key, and everything together may not exceed 102400.
const ITEM_LIMIT = 8192;
const TOTAL_LIMIT = 102400;
const ITEM_BUDGET = 7200;      // headroom for the key and JSON overhead
const TOTAL_BUDGET = 92000;    // headroom for settings, meta and tombstones

const TOMBSTONE_DAYS = 30;

const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

/** Stamp a task as changed now. Every mutation has to go through this. */
export function touch(task, now = Date.now()) {
  return { ...task, updated: now };
}

/**
 * One merged list from two.
 *
 * @param {Array} local
 * @param {Array} remote
 * @param {Object} tombstones  id -> deletedAt
 */
export function mergeTasks(local = [], remote = [], tombstones = {}) {
  const winner = new Map();

  for (const task of [...local, ...remote]) {
    if (!task || !task.id) continue;
    const seen = winner.get(task.id);
    const stamp = task.updated || task.created || 0;
    if (!seen || stamp > (seen.updated || seen.created || 0)) winner.set(task.id, task);
  }

  const out = [];
  for (const task of winner.values()) {
    const deletedAt = tombstones[task.id];
    // A delete only wins if it happened after the newest edit. Otherwise the
    // task was deleted on one machine and then legitimately re-created or
    // edited on the other, and the edit is the newer intent.
    if (deletedAt && deletedAt >= (task.updated || task.created || 0)) continue;
    out.push(task);
  }

  return out.sort((a, b) => (b.created || 0) - (a.created || 0));
}

/** Union of two tombstone sets, with anything long-dead forgotten. */
export function mergeTombstones(a = {}, b = {}, now = Date.now()) {
  const cutoff = now - TOMBSTONE_DAYS * 24 * 60 * 60 * 1000;
  const out = {};
  for (const [id, at] of [...Object.entries(a), ...Object.entries(b)]) {
    const when = Math.max(at, out[id] || 0);
    // Keeping tombstones forever would eventually fill the quota with the
    // memory of tasks nobody has thought about in a month.
    if (when >= cutoff) out[id] = when;
  }
  return out;
}

/**
 * Settings merge. Scalars are last-write-wins on the whole object, but the two
 * maps Tico learns into are unioned — losing a month of corrections because the
 * other laptop wrote its settings more recently would be a nasty surprise.
 */
export function mergeSettings(local = {}, remote = {}) {
  const localNewer = (local.settingsUpdated || 0) >= (remote.settingsUpdated || 0);
  const base = localNewer ? local : remote;
  const other = localNewer ? remote : local;

  const clients = { ...(other.clients || {}) };
  for (const [key, value] of Object.entries(local.clients || {})) {
    const rival = (remote.clients || {})[key];
    clients[key] = !rival ? value : {
      name: value.name,
      count: Math.max(value.count || 0, rival.count || 0),
      confirmed: Boolean(value.confirmed || rival.confirmed),
      lastSeen: Math.max(value.lastSeen || 0, rival.lastSeen || 0),
    };
  }
  for (const [key, value] of Object.entries(remote.clients || {})) {
    if (!clients[key]) clients[key] = value;
  }

  return {
    ...base,
    clients,
    learned: { ...(other.learned || {}), ...(base.learned || {}) },
    settingsUpdated: Math.max(local.settingsUpdated || 0, remote.settingsUpdated || 0),
  };
}

/**
 * Split the list into items that each fit chrome.storage.sync's per-item cap.
 * Returns { chunks, dropped } — `dropped` is what did not fit in the quota at
 * all, oldest completed first, so a full quota costs you history rather than
 * anything you still have to do.
 */
export function chunkTasks(tasks = []) {
  // Order the list so that if something has to go, it is the least useful.
  const ranked = [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (b.updated || b.created || 0) - (a.updated || a.created || 0);
  });

  const chunks = [];
  const dropped = [];
  let current = [];
  let total = 0;

  for (const task of ranked) {
    const size = bytes(task) + 2;
    if (size > ITEM_BUDGET) { dropped.push(task); continue; }   // one absurd task
    if (total + size > TOTAL_BUDGET) { dropped.push(task); continue; }

    if (bytes(current) + size > ITEM_BUDGET) {
      chunks.push(current);
      current = [];
    }
    current.push(task);
    total += size;
  }
  if (current.length) chunks.push(current);

  return { chunks, dropped };
}

/** The object to hand chrome.storage.sync.set, and the keys to remove. */
export function planWrite(tasks, settings, tombstones, previousChunkCount = 0) {
  const { chunks, dropped } = chunkTasks(tasks);
  const payload = {
    'v1.meta': { schema: SCHEMA, chunks: chunks.length, updated: Date.now() },
    'v1.settings': syncableSettings(settings),
    'v1.tombs': tombstones,
  };
  chunks.forEach((c, i) => { payload[`v1.tasks.${i}`] = c; });

  // Shrinking from five chunks to three leaves two orphans holding stale tasks
  // that would come back on the next read.
  const stale = [];
  for (let i = chunks.length; i < previousChunkCount; i++) stale.push(`v1.tasks.${i}`);

  return { payload, stale, dropped, chunkCount: chunks.length };
}

/** Settings worth carrying between machines. Device-local ones stay put. */
export function syncableSettings(settings = {}) {
  const { sound, snoozeMinutes, briefHour, briefDays, clients, learned, settingsUpdated } = settings;
  return { sound, snoozeMinutes, briefHour, briefDays, clients, learned, settingsUpdated };
}

/** Rebuild the list from whatever chrome.storage.sync handed back. */
export function readRemote(raw = {}) {
  const meta = raw['v1.meta'];
  if (!meta || meta.schema !== SCHEMA) return null;
  const tasks = [];
  for (let i = 0; i < (meta.chunks || 0); i++) {
    const chunk = raw[`v1.tasks.${i}`];
    if (Array.isArray(chunk)) tasks.push(...chunk);
  }
  return {
    tasks,
    settings: raw['v1.settings'] || {},
    tombstones: raw['v1.tombs'] || {},
    updated: meta.updated || 0,
  };
}

export const LIMITS = { ITEM_LIMIT, TOTAL_LIMIT, ITEM_BUDGET, TOTAL_BUDGET, TOMBSTONE_DAYS };
