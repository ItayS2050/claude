// Fires the reminders, keeps the badge honest, and lets you send selected text
// on any page straight into the list.
import {
  loadTasks, saveTasks, loadSettings, addTask, completeTask, taskFromInput, dueCount,
} from './store.js';

const TICK = 'tico-tick';
const NOTIF = 'tico:';

// One alarm that ticks every minute, rather than one alarm per task. The
// service worker is torn down constantly; a single repeating alarm survives
// that, and a minute is as precise as a reminder needs to be.
async function ensureAlarm() {
  const existing = await chrome.alarms.get(TICK);
  if (!existing) chrome.alarms.create(TICK, { periodInMinutes: 1, delayInMinutes: 0.1 });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  ensureAlarm();
  buildMenu();
  await refreshBadge();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  ensureAlarm();
  buildMenu();
  await refreshBadge();
});

function buildMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'tico-add',
      title: 'Add “%s” to Tico',
      contexts: ['selection'],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'tico-add' || !info.selectionText) return;
  const settings = await loadSettings();
  const task = taskFromInput(info.selectionText.trim().slice(0, 300), 'page', new Date(), settings);
  if (!task) return;
  await addTask(task);
  await refreshBadge();
  chrome.notifications.create(`${NOTIF}added:${task.id}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon128.png'),
    title: 'Added to Tico',
    message: task.text,
    silent: true,
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== TICK) return;
  await fireDueReminders();
  await refreshBadge();
});

// Storage is the single source of truth, so the badge follows it — whether the
// change came from the popup, the context menu, or a notification button.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tasks) refreshBadge();
});

async function fireDueReminders() {
  const now = Date.now();
  const tasks = await loadTasks();
  const settings = await loadSettings();
  let dirty = false;

  // Chrome cannot fire anything while it is closed, so reopening it after a
  // night or a weekend surfaces a pile of reminders at once. Twenty separate
  // notifications is unusable and silently dropping them is worse — that is the
  // "my reminders just vanished" complaint. One summary, listing them.
  const missed = [];

  for (const t of tasks) {
    if (t.done || t.notified || t.due == null || t.due > now) continue;
    t.notified = true;
    dirty = true;

    if (now - t.due > 2 * 60 * 60 * 1000) { missed.push(t); continue; }

    chrome.notifications.create(`${NOTIF}task:${t.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon128.png'),
      title: t.priority ? `❗ ${t.text}` : t.text,
      message: t.note || whenText(t),
      priority: t.priority ? 2 : 1,
      requireInteraction: t.priority > 0,
      silent: !settings.sound,
      buttons: [{ title: 'Done' }, { title: `Snooze ${settings.snoozeMinutes}m` }],
    });
  }

  if (missed.length === 1) {
    // A single one is not a pile; show it normally so Done and Snooze work.
    const t = missed[0];
    chrome.notifications.create(`${NOTIF}task:${t.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon128.png'),
      title: t.text,
      message: `Was due ${new Date(t.due).toLocaleString([], {
        weekday: 'short', hour: 'numeric', minute: '2-digit' })}`,
      priority: 1,
      silent: !settings.sound,
      buttons: [{ title: 'Done' }, { title: `Snooze ${settings.snoozeMinutes}m` }],
    });
  } else if (missed.length > 1) {
    chrome.notifications.create(`${NOTIF}missed`, {
      type: 'list',
      iconUrl: chrome.runtime.getURL('icon128.png'),
      title: `${missed.length} reminders while you were away`,
      message: `${missed.length} tasks came due`,
      items: missed.slice(0, 8).map((t) => ({
        title: t.text.slice(0, 40),
        message: new Date(t.due).toLocaleString([], {
          weekday: 'short', hour: 'numeric', minute: '2-digit' }),
      })),
      priority: 1,
      silent: !settings.sound,
    });
  }

  if (dirty) await saveTasks(tasks);
}

function whenText(t) {
  const d = new Date(t.due);
  return t.hasTime
    ? `Due ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'Due today';
}

chrome.notifications.onButtonClicked.addListener(async (id, index) => {
  const taskId = id.startsWith(`${NOTIF}task:`) ? id.slice(`${NOTIF}task:`.length) : null;
  if (!taskId) return;
  chrome.notifications.clear(id);

  if (index === 0) {
    await completeTask(taskId);
  } else {
    const settings = await loadSettings();
    const tasks = await loadTasks();
    const t = tasks.find((x) => x.id === taskId);
    if (t) {
      t.due = Date.now() + settings.snoozeMinutes * 60 * 1000;
      t.hasTime = true;
      t.notified = false;
      await saveTasks(tasks);
    }
  }
  await refreshBadge();
});

chrome.notifications.onClicked.addListener(async (id) => {
  chrome.notifications.clear(id);
  try {
    await chrome.action.openPopup();
  } catch {
    // openPopup only works while a window has focus; a standalone window is
    // the next best thing.
    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html?window=1'),
      type: 'popup', width: 400, height: 640,
    });
  }
});

async function refreshBadge() {
  const tasks = await loadTasks();
  const now = Date.now();
  const due = dueCount(tasks, now);
  const overdue = tasks.some((t) => !t.done && t.due != null && t.due < now);
  await chrome.action.setBadgeText({ text: due ? String(Math.min(due, 99)) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: overdue ? '#ef4444' : '#6366f1' });
}

// The popup asks for this after it writes, so the badge updates without waiting
// for the next tick.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'refresh') {
    refreshBadge().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

ensureAlarm();
refreshBadge();
