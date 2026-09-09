// The popup: capture at the top, everything you already captured underneath.
import {
  loadTasks, saveTasks, loadSettings, saveSettings, taskFromInput, completeTask,
  setLane, setClient, removeClient, establishedClients, classify, parse,
  nextOccurrence, deleteTasks, setTags, loadTombstones, saveTombstones,
  touch, BUCKETS, bucketOf, doneBucket, doneOrder,
} from './store.js';
import { detectClient, remember } from './clients.js';
import { aiStatus, aiExtract } from './ai.js';

const $ = (id) => document.getElementById(id);
const el = { input: $('input'), field: $('field'), mic: $('mic'), add: $('add'),
  preview: $('preview'), hint: $('hint'), lanes: $('lanes'), filters: $('filters'), list: $('list'),
  summary: $('summary'), clearDone: $('clearDone'), voiceLang: $('voiceLang'),
  toast: $('toast'), toastMsg: $('toastMsg'), undo: $('undo'),
  sheet: $('sheet'), sheetBody: $('sheetBody'),
  openSettings: $('openSettings'), closeSettings: $('closeSettings'),
  pricing: $('pricing'), pricingOk: $('pricingOk'),
  bulk: $('bulk'), bulkCount: $('bulkCount'), bulkActs: $('bulkActs'),
  bulkAll: $('bulkAll'), bulkCancel: $('bulkCancel'), suggest: $('suggest') };

const HOUR = 3600000;
const DAY = 24 * HOUR;

let tasks = [];
let settings = {};
let lane = 'all';         // all | work | personal — which hat you are wearing
let filter = 'all';       // all | today | done | tag:<name>
let query = '';
let editingId = null;     // task whose title is being edited
let schedId = null;       // task whose scheduling row is open
let fileId = null;        // task whose filing row is open
let picked = new Set();   // the tasks chosen, if any
let bulkPanel = null;     // null | 'when' | 'file' — the expanded action row
let flashId = null;       // freshly added task, for the highlight
let undoSnapshot = null;
let undoTimer = null;

if (new URLSearchParams(location.search).has('window')) document.body.classList.add('windowed');

// --- boot ------------------------------------------------------------------
(async function init() {
  [tasks, settings, syncState] = await Promise.all([loadTasks(), loadSettings(), loadSyncState()]);
  if (!settings.voiceLang) settings.voiceLang = defaultVoiceLang();
  render();
  el.input.focus();
})();

function defaultVoiceLang() {
  const ui = (chrome.i18n?.getUILanguage?.() || navigator.language || 'en-US');
  return ui.startsWith('he') ? 'he-IL' : (ui.startsWith('ru') ? 'ru-RU' : 'en-US');
}

// Filing changes both the task and the learned client list, so both come back.
async function reloadAll() {
  [tasks, settings] = await Promise.all([loadTasks(), loadSettings()]);
  chrome.runtime.sendMessage({ type: 'refresh' }).catch(() => {});
  render();
}

async function persist() {
  await saveTasks(tasks);
  chrome.runtime.sendMessage({ type: 'refresh' }).catch(() => {});
}

// --- adding ----------------------------------------------------------------
async function addFromInput(source = 'type') {
  const raw = el.input.value.trim();
  if (!raw) return;
  const task = taskFromInput(raw, source, new Date(), settings);
  if (!task) return;
  tasks.unshift(task);
  flashId = task.id;
  el.input.value = '';
  updatePreview();
  await persist();

  // Record the name so the next task mentioning it is filed without needing
  // "for", and so a name seen twice earns its own filter chip. Reloading after
  // picks up any task already written that this sighting now explains.
  if (task.client) {
    settings = { ...settings, clients: remember(settings.clients || {}, task.client) };
    await saveSettings(settings);
    tasks = await loadTasks();
  }
  render();
  el.list.scrollTop = 0;
  setTimeout(() => { flashId = null; }, 1200);
  if (!task.client && settings.aiAssist) enrichWithAi(task.id, task.text);
}

// The patterns handle "campaigns for stream". They do not handle "chase the
// northwind renewal", where the name is not in a position that gives it away.
// When the machine has an on-device model, ask it about exactly those.
async function enrichWithAi(id, text) {
  const { client } = await aiExtract(text);
  if (!client) return;
  await setClient(id, client);
  [tasks, settings] = await Promise.all([loadTasks(), loadSettings()]);
  render();
}

el.add.addEventListener('click', () => addFromInput());
el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addFromInput(); }
  if (e.key === 'Escape') { el.input.value = ''; updatePreview(); }
});
el.input.addEventListener('input', updatePreview);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') { e.preventDefault(); toggleVoice(); }
});

// Shows what the parser is about to do, before you commit to it. Guessing wrong
// is much less annoying when you can see the guess.
function updatePreview() {
  const raw = el.input.value.trim();
  el.add.disabled = !raw;
  if (!raw) { el.preview.classList.remove('show'); el.preview.innerHTML = ''; el.hint.textContent = ''; return; }

  const p = parse(raw);
  const guess = classify(p.text || raw, p.tags, settings.learned || {});
  const found = detectClient(p.text || raw, settings.clients || {},
    (w) => classify(w).lane !== null);
  const pills = [];
  if (found.client) {
    pills.push(`<span class="pill">◆ ${escapeHtml(found.client)}${found.isNew ? ' (new)' : ''}</span>`);
  }
  const previewLane = guess.lane || (found.client ? 'work' : null);
  if (previewLane) {
    pills.push(`<span class="pill"><span class="dot ${previewLane}" style="display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:4px;vertical-align:1px"></span>${previewLane}</span>`);
  }
  if (p.due) pills.push(`<span class="pill">${escapeHtml(dueLabel(p.due, p.hasTime, true))}</span>`);
  if (p.repeat) pills.push(`<span class="pill">repeats ${p.repeat}</span>`);
  if (p.priority) pills.push(`<span class="pill">${p.priority > 1 ? 'urgent' : 'important'}</span>`);
  for (const t of p.tags) pills.push(`<span class="pill muted">#${escapeHtml(t)}</span>`);

  el.preview.innerHTML = pills.join('');
  el.preview.classList.toggle('show', pills.length > 0);
  el.hint.textContent = p.due ? '' : 'No date found — add “tomorrow”, “in 20 min”, “friday at 5”…';
}

// --- voice -----------------------------------------------------------------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let heardSomething = false;

function toggleVoice() {
  if (recognition) { stopVoice(); return; }
  if (!SpeechRecognition) {
    el.hint.textContent = 'Dictation needs Chrome’s speech engine, which this build does not have.';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = settings.voiceLang || defaultVoiceLang();
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  heardSomething = false;

  const before = el.input.value.trim();

  recognition.onstart = () => {
    el.mic.classList.add('on');
    el.field.classList.add('listening');
    el.input.placeholder = 'Listening…';
    el.hint.textContent = 'Speak, then stop — it saves itself.';
  };

  recognition.onresult = (event) => {
    let text = '';
    for (const result of event.results) text += result[0].transcript;
    text = text.trim();
    if (!text) return;
    heardSomething = true;
    el.input.value = before ? `${before} ${text}` : text;
    updatePreview();
  };

  recognition.onerror = async (event) => {
    stopVoice();
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      if (await micGranted()) {
        // Permission is there, so the speech service itself is the problem —
        // sending them to the permission page would just waste their time.
        el.hint.textContent = 'Chrome’s speech service isn’t responding. Type it instead?';
        return;
      }
      // The mic prompt cannot be answered inside a popup — the popup closes the
      // moment focus moves to it. A real tab can hold the prompt.
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html#mic') });
      window.close();
    } else if (event.error === 'no-speech') {
      el.hint.textContent = 'Didn’t catch that. Try again?';
    } else if (event.error !== 'aborted') {
      el.hint.textContent = `Dictation stopped (${event.error}).`;
    }
  };

  recognition.onend = () => {
    const spoke = heardSomething;
    stopVoice();
    if (spoke && el.input.value.trim()) addFromInput('voice');
  };

  try {
    recognition.start();
  } catch {
    stopVoice();
  }
}

async function micGranted() {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

function stopVoice() {
  if (recognition) {
    recognition.onend = null;
    try { recognition.stop(); } catch { /* already stopped */ }
    recognition = null;
  }
  el.mic.classList.remove('on');
  el.field.classList.remove('listening');
  el.input.placeholder = 'Tell Tico…  (try “call mom tomorrow at 5”)';
}

el.mic.addEventListener('click', toggleVoice);

el.voiceLang.addEventListener('click', async () => {
  const order = ['en-US', 'he-IL', 'ru-RU', 'ar-SA'];
  const i = order.indexOf(settings.voiceLang);
  settings.voiceLang = order[(i + 1) % order.length];
  await saveSettings(settings);
  renderFoot();
});

// --- task actions ----------------------------------------------------------
async function toggleDone(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  await snapshot();

  if (t.done) {
    Object.assign(t, { done: false, doneAt: null, updated: Date.now(),
                       notified: t.due != null && t.due <= Date.now() });
  } else if (t.repeat && t.due) {
    // Past the occurrence just ticked off, even if it had not come round yet.
    const next = nextOccurrence(t.due, t.repeat, Math.max(Date.now(), t.due));
    Object.assign(t, { due: next, notified: false, updated: Date.now() });
    showToast(`Next: ${dueLabel(next, t.hasTime)}`);
  } else {
    Object.assign(t, { done: true, doneAt: Date.now(), notified: true, updated: Date.now() });
    showToast('Completed');
  }
  await persist();
  render();
}

async function removeTask(id) {
  const t = tasks.find((x) => x.id === id);
  await snapshot();
  // deleteTasks writes the tombstone too — without it the other machine still
  // has this task and hands it back on the next merge.
  await deleteTasks([id]);
  tasks = await loadTasks();
  chrome.runtime.sendMessage({ type: 'refresh' }).catch(() => {});
  render();
  showToast(`Deleted “${truncate(t?.text || '', 28)}”`);
}

async function patch(id, changes) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  Object.assign(t, changes, { updated: Date.now() });
  await persist();
  render();
}

async function setDue(id, due, hasTime) {
  await patch(id, { due, hasTime, notified: due != null && due <= Date.now() });
}

// Undo is a snapshot of the whole list — small enough to copy, and it makes
// every destructive action reversible without per-action bookkeeping.
async function snapshot() {
  // Tombstones have to come along. Restoring a deleted task without also
  // dropping its tombstone looks like it worked, and then the next sync merge
  // sees a delete newer than the task and removes it again — silently, and only
  // on the machines that sync.
  undoSnapshot = {
    tasks: JSON.parse(JSON.stringify(tasks)),
    tombstones: JSON.parse(JSON.stringify(await loadTombstones())),
  };
}

function showToast(msg) {
  el.toastMsg.textContent = msg;
  el.toast.classList.add('show');
  el.undo.hidden = !undoSnapshot;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => el.toast.classList.remove('show'), 4500);
}

el.undo.addEventListener('click', async () => {
  if (!undoSnapshot) return;
  tasks = undoSnapshot.tasks;
  await saveTombstones(undoSnapshot.tombstones);
  undoSnapshot = null;
  el.toast.classList.remove('show');
  await persist();
  render();
});

el.clearDone.addEventListener('click', async () => {
  await snapshot();
  const doomed = tasks.filter((t) => t.done).map((t) => t.id);
  await deleteTasks(doomed);
  tasks = await loadTasks();
  chrome.runtime.sendMessage({ type: 'refresh' }).catch(() => {});
  render();
  showToast(`Cleared ${doomed.length} completed`);
});

// --- rendering -------------------------------------------------------------
function render() {
  renderLanes();
  renderFilters();
  renderList();
  renderBulk();
  renderPricing();
  renderFoot();
  updatePreview();
}

function inLane(t) {
  return lane === 'all' || t.lane === lane;
}

function renderLanes() {
  const open = tasks.filter((t) => !t.done);
  const buttons = [
    { id: 'all', label: 'All', dot: null, n: open.length },
    { id: 'work', label: 'Work', dot: 'work', n: open.filter((t) => t.lane === 'work').length },
    { id: 'personal', label: 'Personal', dot: 'personal', n: open.filter((t) => t.lane === 'personal').length },
  ];
  el.lanes.innerHTML = buttons.map((b) => `
    <button class="lane-btn ${lane === b.id ? 'active' : ''}" data-lane="${b.id}">
      ${b.dot ? `<span class="dot ${b.dot}"></span>` : ''}${b.label}${b.n ? `<span class="n">${b.n}</span>` : ''}
    </button>`).join('');
  el.lanes.querySelectorAll('[data-lane]').forEach((b) => {
    b.addEventListener('click', () => { lane = b.dataset.lane; render(); });
  });
}

function visible() {
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  const q = query.trim().toLowerCase();

  return tasks.filter((t) => {
    if (!inLane(t)) return false;
    if (q && !(`${t.text} ${t.tags.map((x) => `#${x}`).join(' ')}`.toLowerCase().includes(q))) return false;
    if (filter === 'done') return t.done;
    if (t.done) return false;
    if (filter === 'today') return t.due != null && t.due <= +endOfToday;
    if (filter.startsWith('tag:')) return t.tags.includes(filter.slice(4));
    if (filter.startsWith('client:')) {
      return (t.client || '').toLowerCase() === filter.slice(7).toLowerCase();
    }
    return true;
  });
}

function renderFilters() {
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  const open = tasks.filter((t) => !t.done && inLane(t));
  const counts = {
    all: open.length,
    today: open.filter((t) => t.due != null && t.due <= +endOfToday).length,
    done: tasks.filter((t) => t.done && inLane(t)).length,
  };

  const tags = [...new Set(open.flatMap((t) => t.tags))].sort().slice(0, 4);
  const clientChips = establishedClients(settings.clients || {})
    .filter((c) => open.some((t) => (t.client || '').toLowerCase() === c.name.toLowerCase()))
    .slice(0, 4);
  const chips = [
    { id: 'all', label: 'Open', n: counts.all },
    { id: 'today', label: 'Today', n: counts.today },
    ...clientChips.map((c) => ({ id: `client:${c.name}`, label: `◆ ${c.name}`, n: 0 })),
    ...tags.map((t) => ({ id: `tag:${t}`, label: `#${t}`, n: 0 })),
    { id: 'done', label: 'Done', n: counts.done },
  ];

  el.filters.innerHTML = chips.map((c) => `
    <button class="chip ${filter === c.id ? 'active' : ''}" data-filter="${escapeHtml(c.id)}">
      ${escapeHtml(c.label)}${c.n ? `<span class="n">${c.n}</span>` : ''}
    </button>`).join('') +
    (tasks.length >= 6 ? `<input id="search" placeholder="Search" value="${escapeHtml(query)}">` : '');

  el.filters.querySelectorAll('[data-filter]').forEach((b) => {
    b.addEventListener('click', () => { filter = b.dataset.filter; render(); });
  });
  const search = $('search');
  if (search) {
    search.addEventListener('input', () => { query = search.value; renderList(); renderFoot(); });
    if (query) { search.focus(); search.setSelectionRange(query.length, query.length); }
  }
}

function renderList() {
  const items = visible();

  if (!items.length) {
    el.list.innerHTML = emptyState();
    return;
  }

  if (filter === 'done') {
    // Grouped by the day it was finished, because "what did I actually get
    // through this week" is the only question anyone opens this view to ask.
    const now = Date.now();
    const byDay = new Map();
    for (const t of [...items].sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))) {
      const label = doneBucket(t, now);
      if (!byDay.has(label)) byDay.set(label, []);
      byDay.get(label).push(t);
    }
    el.list.innerHTML = doneOrder([...byDay.keys()]).map((label) => {
      const rows = byDay.get(label);
      return `<div class="group-head">${escapeHtml(label)} <span class="count">${rows.length}</span></div>` +
             rows.map(taskHtml).join('');
    }).join('');
    wireList();
    return;
  }

  const now = Date.now();
  const groups = new Map(BUCKETS.map((b) => [b.id, []]));
  for (const t of items) groups.get(bucketOf(t, now)).push(t);

  let html = '';
  for (const b of BUCKETS) {
    const rows = groups.get(b.id);
    if (!rows.length) continue;
    rows.sort(compareTasks);
    const cls = b.id === 'overdue' ? 'overdue' : (b.id === 'today' ? 'today' : '');
    html += `<div class="group-head ${cls}">${b.label} <span class="count">${rows.length}</span></div>`;
    html += rows.map(taskHtml).join('');
  }
  el.list.innerHTML = html;
  wireList();
  revealOpenRow();
}

// Opening a row on the last task in the list puts its contents below the fold,
// where they look like nothing happened.
function revealOpenRow() {
  if (!fileId && !schedId) return;
  const row = el.list.querySelector('.filing, .sched');
  row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function compareTasks(a, b) {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.due != null && b.due != null && a.due !== b.due) return a.due - b.due;
  if ((a.due == null) !== (b.due == null)) return a.due == null ? 1 : -1;
  return b.created - a.created;
}

function taskHtml(t) {
  const now = Date.now();
  const late = t.due != null && t.due < now && !t.done;
  const soon = t.due != null && !late && t.due < now + 6 * HOUR;
  const meta = [];
  if (t.done && t.doneAt) {
    meta.push(`<span class="rep">✓ ${escapeHtml(new Date(t.doneAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</span>`);
  }
  if (t.due != null) {
    meta.push(`<span class="due ${late ? 'late' : (soon ? 'soon' : '')}" data-act="sched" data-id="${t.id}">${escapeHtml(dueLabel(t.due, t.hasTime))}</span>`);
  } else {
    meta.push(`<span class="due" data-act="sched" data-id="${t.id}">Set a time</span>`);
  }
  if (t.client) {
    meta.push(`<span class="client"><button data-act="client-filter" data-client="${escapeHtml(t.client)}">◆ ${escapeHtml(t.client)}</button><button class="x" data-act="client-clear" data-id="${t.id}" title="Not for ${escapeHtml(t.client)}">×</button></span>`);
  }
  if (t.repeat) meta.push(`<span class="rep">↻ ${t.repeat}</span>`);
  for (const tag of t.tags) meta.push(`<button class="tag" data-act="tag" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`);
  if (t.source === 'voice') meta.push('<span class="rep" title="Added by voice">🎙</span>');

  const titleHtml = editingId === t.id
    ? `<input class="title-edit" dir="auto" data-act="edit-input" data-id="${t.id}" value="${escapeHtml(t.text)}">`
    : `<div class="title" data-act="edit" data-id="${t.id}">${escapeHtml(t.text)}</div>`;

  return `
    <div class="task ${t.done ? 'done' : ''} p${t.priority} ${flashId === t.id ? 'flash' : ''} ${picked.has(t.id) ? 'picked' : ''}" data-id="${t.id}">
      <button class="check" data-act="toggle" data-id="${t.id}"
              aria-label="Select" title="Select">
        <svg viewBox="0 0 24 24"><polyline points="4,12 10,18 20,6"/></svg>
      </button>
      <button class="lane-dot" data-act="lane" data-id="${t.id}" title="${escapeHtml(laneTitle(t))}">
        <i class="${t.lane || 'none'}"></i>
      </button>
      <div class="body" dir="auto">
        ${titleHtml}
        <div class="meta">${meta.join('')}</div>
      </div>
      <div class="actions">
        <button class="act done-act" data-act="complete" data-id="${t.id}"
                title="${t.done ? 'Put it back' : 'Tick it off'}">
          ${t.done
            ? '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z"/></svg>'
            : '<svg viewBox="0 0 24 24"><path d="M9.5 17.6 4.2 12.3l1.6-1.6 3.7 3.7 8.7-8.7 1.6 1.6z"/></svg>'}
        </button>
        <button class="act" data-act="rename" data-id="${t.id}" title="Rename">
          <svg viewBox="0 0 24 24"><path d="M20.7 5.6 18.4 3.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7 1.8-1.8a1 1 0 0 0 0-1.4ZM13.8 6.5 3.6 16.7a1 1 0 0 0-.3.5l-1 4a1 1 0 0 0 1.2 1.2l4-1a1 1 0 0 0 .5-.3L18.2 10.9l-4.4-4.4Z"/></svg>
        </button>
        <button class="act" data-act="file" data-id="${t.id}" title="File it — client and tags">
          <svg viewBox="0 0 24 24"><path d="M10.6 3a2 2 0 0 1 1.4.6l8.4 8.4a2 2 0 0 1 0 2.8l-5.6 5.6a2 2 0 0 1-2.8 0L3.6 12A2 2 0 0 1 3 10.6V5a2 2 0 0 1 2-2h5.6ZM7.5 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/></svg>
        </button>
        <button class="act flag ${t.priority ? 'on' : ''}" data-act="prio" data-id="${t.id}" title="Important">
          <svg viewBox="0 0 24 24"><path d="M6 3a1 1 0 0 1 1-1h11a1 1 0 0 1 .8 1.6L15.25 8l3.55 4.4A1 1 0 0 1 18 14H8v7a1 1 0 1 1-2 0V3Z"/></svg>
        </button>
        <button class="act" data-act="del" data-id="${t.id}" title="Delete">
          <svg viewBox="0 0 24 24"><path d="M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7H4a1 1 0 0 1 0-2h4V4a1 1 0 0 1 1-1Zm1 6v9h1.5V9H10Zm3.5 0v9H15V9h-1.5Z"/></svg>
        </button>
      </div>
    </div>
    ${schedId === t.id ? schedHtml(t) : ''}
    ${fileId === t.id ? fileHtml(t) : ''}`;
}

/**
 * Filing a task by hand. The parser is a guess and typing fast makes it a worse
 * one, so every field it fills in has to be reachable afterwards in a click:
 * this is the client and the tags, the lane is the dot, the date is the chip.
 */
function fileHtml(t) {
  const known = establishedClients(settings.clients || {}).map((c) => c.name);
  // Whatever this task already has belongs in the list even if it is a one-off
  // that has not been seen twice yet.
  if (t.client && !known.some((n) => n.toLowerCase() === t.client.toLowerCase())) known.unshift(t.client);
  const allTags = [...new Set(tasks.flatMap((x) => x.tags))].filter((tag) => !t.tags.includes(tag));

  return `<div class="filing" data-id="${t.id}">
    <div class="lbl">File under</div>
    <div class="opts">
      <button class="opt ${!t.client ? 'on' : ''}" data-act="pick-client" data-id="${t.id}" data-client="">Nothing</button>
      ${known.slice(0, 8).map((name) => `
        <button class="opt ${(t.client || '').toLowerCase() === name.toLowerCase() ? 'on' : ''}"
                data-act="pick-client" data-id="${t.id}" data-client="${escapeHtml(name)}">◆ ${escapeHtml(name)}</button>`).join('')}
      <input data-act="new-client" data-id="${t.id}" placeholder="+ new" maxlength="24">
    </div>
    <div class="lbl">Tags</div>
    <div class="opts">
      ${t.tags.map((tag) => `
        <button class="opt on" data-act="drop-tag" data-id="${t.id}" data-tag="${escapeHtml(tag)}" title="Remove">#${escapeHtml(tag)} ×</button>`).join('')}
      ${allTags.slice(0, 6).map((tag) => `
        <button class="opt" data-act="add-tag" data-id="${t.id}" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join('')}
      <input data-act="new-tag" data-id="${t.id}" placeholder="+ tag" maxlength="24">
    </div>
  </div>`;
}

// The dot has to explain itself: a guess you cannot see the reason for is a
// guess you stop trusting.
function laneTitle(t) {
  const where = t.lane ? `Filed under ${t.lane}` : 'Not filed';
  const why = t.laneBecause ? ` — ${t.laneBecause}` : '';
  return `${where}${why}. Click to change.`;
}

function schedHtml(t) {
  const value = t.due ? toLocalInput(new Date(t.due)) : '';
  return `<div class="sched" data-id="${t.id}">
    <button data-act="due" data-when="1h">In 1 hour</button>
    <button data-act="due" data-when="evening">Tonight</button>
    <button data-act="due" data-when="tomorrow">Tomorrow 9am</button>
    <button data-act="due" data-when="week">Next week</button>
    <input type="datetime-local" data-act="due-exact" value="${value}">
    ${t.due ? '<button data-act="due" data-when="clear">Clear</button>' : ''}
  </div>`;
}

function wireList() {
  // Clicking a task picks it. Choosing what happens to it comes after, in the
  // bar — the app does not get to decide that on the user's behalf.
  el.list.querySelectorAll('.task').forEach((row) => {
    row.addEventListener('click', (e) => {
      // Everything with its own meaning keeps it: the tick box, the date chip,
      // the client and tag chips, and the three row actions.
      if (e.target.closest('button, input, .client, .filing, .sched')) return;
      togglePick(row.dataset.id);
    });
  });

  el.list.querySelectorAll('[data-act]').forEach((node) => {
    const act = node.dataset.act;
    const id = node.dataset.id;

    if (act === 'toggle') node.addEventListener('click', (e) => {
      e.stopPropagation();
      // The box selects, and only selects. It is the first thing on the row and
      // the thing everyone reaches for, so it cannot be the one control that
      // acts on its own — choosing a task and deciding what happens to it are
      // two separate steps, and the second one is the user's.
      togglePick(id);
    });
    if (act === 'del') node.addEventListener('click', () => removeTask(id));
    if (act === 'prio') node.addEventListener('click', () => {
      const t = tasks.find((x) => x.id === id);
      patch(id, { priority: t.priority ? 0 : 1 });
    });
    if (act === 'client-filter') node.addEventListener('click', () => {
      filter = `client:${node.dataset.client}`;
      render();
    });
    if (act === 'client-clear') node.addEventListener('click', async () => {
      await setClient(id, null);
      await reloadAll();
    });
    if (act === 'tag') node.addEventListener('click', () => {
      filter = `tag:${node.dataset.tag}`;
      render();
    });
    if (act === 'lane') node.addEventListener('click', async () => {
      const t = tasks.find((x) => x.id === id);
      const order = ['work', 'personal', null];
      const next = order[(order.indexOf(t.lane) + 1) % order.length];
      await setLane(id, next);
      await reloadAll();
    });
    if (act === 'sched') node.addEventListener('click', () => {
      schedId = schedId === id ? null : id;
      fileId = null;
      renderList();
    });
    if (act === 'file') node.addEventListener('click', () => {
      fileId = fileId === id ? null : id;
      schedId = null;
      renderList();
    });

    if (act === 'pick-client') node.addEventListener('click', async () => {
      await setClient(id, node.dataset.client || null);
      await reloadAll();
    });
    if (act === 'new-client') {
      node.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        const name = node.value.trim();
        if (!name) return;
        await setClient(id, name);
        await reloadAll();
      });
    }

    if (act === 'add-tag') node.addEventListener('click', async () => {
      const t = tasks.find((x) => x.id === id);
      await setTags(id, [...t.tags, node.dataset.tag]);
      await reloadAll();
    });
    if (act === 'drop-tag') node.addEventListener('click', async () => {
      const t = tasks.find((x) => x.id === id);
      await setTags(id, t.tags.filter((x) => x !== node.dataset.tag));
      await reloadAll();
    });
    if (act === 'new-tag') {
      node.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        const value = node.value.trim();
        if (!value) return;
        const t = tasks.find((x) => x.id === id);
        await setTags(id, [...t.tags, value]);
        await reloadAll();
      });
    }
    // A single click on the title now means "select this one", so renaming
    // needs its own way in. Double-click was the obvious candidate and it is
    // not reliable here: selecting shows or hides the action bar, the list
    // resizes between the two clicks, and the browser stops calling it a
    // double-click. A button does not have that problem.
    if (act === 'complete') node.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDone(id);
    });
    if (act === 'rename') node.addEventListener('click', (e) => {
      e.stopPropagation();
      picked.delete(id);
      editingId = id;
      renderList();
    });

    if (act === 'edit-input') {
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
      const commit = async () => {
        if (editingId !== id) return;
        const text = node.value.trim();
        editingId = null;
        if (text) await patch(id, { text }); else render();
      };
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); node.blur(); }
        if (e.key === 'Escape') { editingId = null; renderList(); }
      });
      node.addEventListener('blur', commit);
    }

    if (act === 'due') node.addEventListener('click', () => {
      const parentId = node.closest('.sched').dataset.id;
      schedId = null;
      applyQuickDue(parentId, node.dataset.when);
    });

    if (act === 'due-exact') node.addEventListener('change', () => {
      const parentId = node.closest('.sched').dataset.id;
      if (!node.value) return;
      schedId = null;
      setDue(parentId, +new Date(node.value), true);
    });
  });
}

/** One definition of "tonight", shared by the single-task row and the bulk bar. */
function quickDue(when) {
  const now = new Date();
  if (when === 'clear') return { due: null, hasTime: false };
  if (when === '1h') return { due: Date.now() + HOUR, hasTime: true };
  if (when === 'evening') {
    const d = new Date(now); d.setHours(20, 0, 0, 0);
    return { due: +d > Date.now() ? +d : Date.now() + HOUR, hasTime: true };
  }
  if (when === 'tomorrow') {
    const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
    return { due: +d, hasTime: false };
  }
  const d = new Date(now); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0);
  return { due: +d, hasTime: false };
}

function applyQuickDue(id, when) {
  const { due, hasTime } = quickDue(when);
  return setDue(id, due, hasTime);
}

function renderPricing() {
  el.pricing.classList.toggle('show', !settings.pricingSeen);
}

function renderFoot() {
  const open = tasks.filter((t) => !t.done).length;
  const done = tasks.filter((t) => t.done).length;
  const late = tasks.filter((t) => !t.done && t.due != null && t.due < Date.now()).length;
  const unsorted = tasks.filter((t) => !t.done && !t.lane).length;
  el.summary.textContent = tasks.length
    ? `${open} open${late ? ` · ${late} overdue` : ''}${
        lane === 'all' && unsorted ? ` · ${unsorted} unfiled` : ''}${done ? ` · ${done} done` : ''}`
    : '';
  el.clearDone.hidden = done === 0;
  el.voiceLang.textContent = `🎙 ${(settings.voiceLang || 'en-US').slice(0, 2).toUpperCase()}`;
}

function emptyState() {
  if (query) return `<div class="empty"><p>Nothing matches “${escapeHtml(query)}”.</p></div>`;
  if (filter === 'done') return '<div class="empty"><p>Nothing ticked off yet.</p></div>';
  if (filter.startsWith('tag:')) return `<div class="empty"><p>No open tasks tagged ${escapeHtml(filter.slice(4))}.</p></div>`;
  if (filter.startsWith('client:')) return `<div class="empty"><p>Nothing open for <strong>${escapeHtml(filter.slice(7))}</strong>.</p></div>`;
  if (filter === 'today') return '<div class="empty"><div class="big">☀️</div><p>Nothing due today. Tico is having a quiet one.</p></div>';
  if (lane !== 'all') {
    return `<div class="empty">
      <div class="big">${lane === 'work' ? '💼' : '🏠'}</div>
      <p>Nothing filed under <strong>${lane}</strong> yet.</p>
      <p style="margin-top:8px">Tico files new tasks by what they say. Click the dot
      beside any task in <strong>All</strong> to move it here.</p>
    </div>`;
  }
  return `<div class="empty">
    <img src="icon128.png" alt="" style="width:52px;height:52px;border-radius:14px;opacity:.9">
    <p style="margin-top:12px">Tell Tico and forget it.<br>It works out when things are due.</p>
    <p style="margin-top:10px">
      <code>call mom tomorrow at 5</code><br>
      <code>standup every monday 9:30</code><br>
      <code>pay rent in 20 minutes !</code>
    </p>
  </div>`;
}

// --- doing several at once --------------------------------------------------

function clearPicked() {
  picked.clear();
  bulkPanel = null;
  render();
}

function togglePick(id) {
  if (picked.has(id)) picked.delete(id); else picked.add(id);
  if (!picked.size) bulkPanel = null;

  // Update the one row in place rather than rebuilding the list. Rebuilding
  // replaces the node the pointer is over, so the second half of a double-click
  // lands on an element that no longer exists and renaming never fires. It is
  // also just wrong to redraw everything because one checkbox changed.
  const row = el.list.querySelector(`.task[data-id="${CSS.escape(id)}"]`);
  row?.classList.toggle('picked', picked.has(id));
  renderBulk();
  renderFoot();
}

// Said once, then never again. A price that is still months away does not earn
// a permanent strip across the top of a to-do list.
el.pricingOk.addEventListener('click', async () => {
  settings = { ...settings, pricingSeen: true };
  await saveSettings(settings);
  el.pricing.classList.remove('show');
});

// In the footer rather than buried in Settings: the moment someone notices
// something is missing is the moment they are looking at the list, not at a
// preferences panel.
const SUGGEST_URL = 'https://get-kiko.com/tico/suggest.html';
el.suggest.addEventListener('click', () => chrome.tabs.create({ url: SUGGEST_URL }));

el.bulkCancel.addEventListener('click', clearPicked);
el.bulkAll.addEventListener('click', () => {
  const shown = visible().map((t) => t.id);
  // Second press clears, which is what every list with a "select all" does.
  if (shown.length && shown.every((id) => picked.has(id))) picked.clear();
  else for (const id of shown) picked.add(id);
  if (!picked.size) bulkPanel = null;
  render();
});

function renderBulk() {
  // No separate "selection mode" to enter or leave: the bar exists exactly when
  // something is selected.
  el.bulk.hidden = picked.size === 0;
  if (!picked.size) return;

  el.bulkCount.textContent = String(picked.size);
  const none = false;

  if (bulkPanel === 'when') {
    el.bulkActs.innerHTML = `
      <button data-bulk="back">←</button>
      <button data-bulk="due" data-when="1h">In 1 hour</button>
      <button data-bulk="due" data-when="evening">Tonight</button>
      <button data-bulk="due" data-when="tomorrow">Tomorrow</button>
      <button data-bulk="due" data-when="week">Next week</button>
      <button data-bulk="due" data-when="clear">No date</button>`;
  } else if (bulkPanel === 'file') {
    // Every name Tico knows, not just the established ones. The two-sightings
    // rule exists to keep automatic filing and the filter chips honest; when
    // someone is deliberately picking from a list, a name they used once is
    // exactly as valid as one they used twice.
    const known = Object.values(settings.clients || {})
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .map((c) => c.name)
      .slice(0, 6);
    el.bulkActs.innerHTML = `
      <button data-bulk="back">←</button>
      <button data-bulk="client" data-client="">Nothing</button>
      ${known.map((n) => `<button data-bulk="client" data-client="${escapeHtml(n)}">◆ ${escapeHtml(n)}</button>`).join('')}
      <input id="bulkNewClient" placeholder="+ new group" maxlength="24"
             style="background:var(--surface-2);border:1px solid var(--line);color:var(--text);
                    border-radius:8px;padding:5px 9px;font-size:11.5px;outline:none;width:104px">`;
  } else {
    el.bulkActs.innerHTML = `
      <button data-bulk="done" ${none ? 'disabled' : ''}>Tick off</button>
      <button data-bulk="panel" data-panel="when" ${none ? 'disabled' : ''}>When…</button>
      <button data-bulk="panel" data-panel="file" ${none ? 'disabled' : ''}>File…</button>
      <button data-bulk="lane" data-lane="work" ${none ? 'disabled' : ''}><span class="dot" style="background:var(--work)"></span>Work</button>
      <button data-bulk="lane" data-lane="personal" ${none ? 'disabled' : ''}><span class="dot" style="background:var(--personal)"></span>Personal</button>
      <button class="danger" data-bulk="delete" ${none ? 'disabled' : ''}>Delete</button>`;
  }

  el.bulkActs.querySelectorAll('[data-bulk]').forEach((node) => {
    node.addEventListener('click', () => runBulk(node.dataset, node));
  });

  // Naming a group here rather than making it elsewhere first: choosing the
  // tasks is what tells you the group is needed.
  const fresh = $('bulkNewClient');
  if (fresh) {
    fresh.focus();
    fresh.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !fresh.value.trim()) return;
      runBulk({ bulk: 'client', client: fresh.value.trim() }, fresh);
    });
  }
}

async function runBulk(data, node) {
  if (data.bulk === 'back') { bulkPanel = null; renderBulk(); return; }
  if (data.bulk === 'panel') { bulkPanel = data.panel; renderBulk(); return; }

  const ids = [...picked];
  if (!ids.length) return;
  await snapshot();
  node.disabled = true;

  if (data.bulk === 'done') {
    for (const id of ids) await completeTask(id);
    showToast(`Ticked off ${ids.length}`);
  } else if (data.bulk === 'delete') {
    await deleteTasks(ids);
    showToast(`Deleted ${ids.length}`);
  } else if (data.bulk === 'lane') {
    for (const id of ids) await setLane(id, data.lane);
    showToast(`Filed ${ids.length} under ${data.lane}`);
  } else if (data.bulk === 'client') {
    for (const id of ids) await setClient(id, data.client || null);
    showToast(data.client ? `Filed ${ids.length} under ${data.client}` : `Cleared the client on ${ids.length}`);
  } else if (data.bulk === 'due') {
    const due = quickDue(data.when);
    const all = await loadTasks();
    for (const t of all) {
      if (picked.has(t.id)) Object.assign(t, { ...due, notified: due.due != null && due.due <= Date.now(), updated: Date.now() });
    }
    await saveTasks(all);
    showToast(`Rescheduled ${ids.length}`);
  }

  picked.clear();
  bulkPanel = null;
  [tasks, settings] = await Promise.all([loadTasks(), loadSettings()]);
  chrome.runtime.sendMessage({ type: 'refresh' }).catch(() => {});
  render();
}

// --- settings --------------------------------------------------------------
// Everything here exists because of a complaint people make about reminder
// extensions: alarms with no volume control, a snooze fixed at one length, a
// list with no way out of it, and a learned client you cannot unlearn.

let aiState = 'unavailable';
let syncState = {};

async function loadSyncState() {
  const got = await chrome.storage.local.get('syncState');
  return got.syncState || {};
}

// Chrome's own sync carries this, so it needs no account of ours — but it only
// works if the browser itself is signed in, and saying so up front is cheaper
// than a support email asking why nothing arrived.
function arrivedOn() {
  if (!settings.installedAt) return 'early';
  return `on ${new Date(settings.installedAt).toLocaleDateString([], {
    day: 'numeric', month: 'long', year: 'numeric' })}`;
}

function syncBlurb() {
  return settings.syncEnabled
    ? 'Carried by Chrome to every computer you are signed into. Nothing passes through us.'
    : 'Uses Chrome\'s own sync, so it needs no account of ours — but Chrome has to be signed in.';
}

function syncStatus() {
  if (syncState.error) return `Last attempt failed: ${syncState.error}`;
  if (syncState.dropped) {
    return `${syncState.dropped} completed task${syncState.dropped === 1 ? '' : 's'} left behind — Chrome's sync is full`;
  }
  const when = Math.max(syncState.lastPush || 0, syncState.lastPull || 0);
  if (!when) return 'Not synced yet';
  const mins = Math.round((Date.now() - when) / 60000);
  if (mins < 1) return 'Synced just now';
  if (mins < 60) return `Synced ${mins} minute${mins === 1 ? '' : 's'} ago`;
  return `Synced ${new Date(when).toLocaleString([], { hour: 'numeric', minute: '2-digit' })}`;
}

el.openSettings.addEventListener('click', async () => {
  aiState = await aiStatus();
  syncState = await loadSyncState();
  renderSettings();
  el.sheet.classList.add('open');
});
el.closeSettings.addEventListener('click', () => el.sheet.classList.remove('open'));
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (el.sheet.classList.contains('open')) { el.sheet.classList.remove('open'); return; }
  if (picked.size) clearPicked();
});

function renderSettings() {
  const clients = establishedClients(settings.clients || {});
  const aiLabel = {
    available: 'Ready on this computer',
    downloadable: 'Supported — Chrome will download the model on first use',
    downloading: 'Chrome is downloading the model',
    unavailable: 'Not supported on this computer',
  }[aiState] || 'Not supported on this computer';

  el.sheetBody.innerHTML = `
    <h3>Reminders</h3>
    <div class="row">
      <div><div class="label">Notification sound</div>
        <div class="sub">Off still shows the notification, silently</div></div>
      <button class="switch ${settings.sound ? 'on' : ''}" data-set="sound"><i></i></button>
    </div>
    <div class="row">
      <div><div class="label">Snooze length</div>
        <div class="sub">The button on the notification itself</div></div>
      <select data-set="snoozeMinutes">
        ${[5, 10, 15, 30, 60, 120].map((m) => `
          <option value="${m}" ${settings.snoozeMinutes === m ? 'selected' : ''}>
            ${m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? 's' : ''}`}
          </option>`).join('')}
      </select>
    </div>

    <div class="row">
      <div><div class="label">Morning brief</div>
        <div class="sub">One notification a day with what is on it. Silent when there is nothing.</div></div>
      <select data-set="briefHour">
        <option value="0" ${!settings.briefHour ? 'selected' : ''}>Off</option>
        ${[6, 7, 8, 9, 10, 11].map((h) => `
          <option value="${h}" ${settings.briefHour === h ? 'selected' : ''}>${h}:00</option>`).join('')}
      </select>
    </div>
    ${settings.briefHour ? `
    <div class="row">
      <div><div class="label">…on which days</div>
        <div class="sub">Whichever week you actually work</div></div>
      <select data-set="briefDays">
        <option value="all" ${settings.briefDays === 'all' ? 'selected' : ''}>Every day</option>
        <option value="sun-thu" ${settings.briefDays === 'sun-thu' ? 'selected' : ''}>Sun – Thu</option>
        <option value="mon-fri" ${settings.briefDays === 'mon-fri' ? 'selected' : ''}>Mon – Fri</option>
      </select>
    </div>` : ''}

    <h3>Filing</h3>
    <div class="row">
      <div><div class="label">On-device AI assist</div>
        <div class="sub">${escapeHtml(aiLabel)}. Nothing leaves your computer.</div></div>
      <button class="switch ${settings.aiAssist ? 'on' : ''} ${aiState === 'unavailable' ? 'disabled' : ''}"
              data-set="aiAssist" ${aiState === 'unavailable' ? 'disabled' : ''}><i></i></button>
    </div>
    <div class="row" style="display:block">
      <div class="label">Clients and projects</div>
      <div class="sub" style="margin-bottom:6px">Learned from what you write. Remove one to stop it being used.</div>
      ${clients.length
        ? clients.map((c) => `
          <div class="client-row">
            <span>◆ ${escapeHtml(c.name)}<span class="count">${c.count} task${c.count === 1 ? '' : 's'}</span></span>
            <button data-forget="${escapeHtml(c.name)}">Remove</button>
          </div>`).join('')
        : '<div class="sub">None yet. Write “for acme” in a task and it appears here.</div>'}
    </div>

    <h3>Across your computers</h3>
    <div class="row">
      <div><div class="label">Sync with your other Chrome</div>
        <div class="sub">${escapeHtml(syncBlurb())}</div></div>
      <button class="switch ${settings.syncEnabled ? 'on' : ''}" data-set="syncEnabled"><i></i></button>
    </div>
    ${settings.syncEnabled ? `
    <div class="row">
      <div><div class="label">Sync now</div>
        <div class="sub">${escapeHtml(syncStatus())}</div></div>
      <button class="btn" data-act-set="sync">Sync</button>
    </div>` : ''}

    <h3>Tell us what to build</h3>
    <div class="row">
      <div><div class="label">Ask for a feature</div>
        <div class="sub">Almost everything in Tico is here because somebody asked.</div></div>
      <button class="btn" data-act-set="suggest">Open</button>
    </div>

    <h3>What this costs</h3>
    <div class="row" style="display:block">
      <div class="label">Free — and free for you, permanently</div>
      <div class="sub" style="margin-top:4px">
        Tico will be <strong>$2.99 once</strong> for people who arrive after the
        price goes on. You started using it ${escapeHtml(arrivedOn())}, before
        that, so yours does not change. No subscription, and nothing to do.
      </div>
    </div>

    <h3>Your data</h3>
    <div class="row">
      <div><div class="label">Back up everything</div>
        <div class="sub">${tasks.length} task${tasks.length === 1 ? '' : 's'} to a JSON file</div></div>
      <button class="btn" data-act-set="export">Export</button>
    </div>
    <div class="row">
      <div><div class="label">Restore from a backup</div>
        <div class="sub">Adds tasks it does not already have</div></div>
      <button class="btn" data-act-set="import">Import</button>
    </div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>`;

  el.sheetBody.querySelectorAll('[data-set]').forEach((node) => {
    const key = node.dataset.set;
    if (node.tagName === 'SELECT') {
      const numeric = key !== 'briefDays';
      node.addEventListener('change', () =>
        applySetting(key, numeric ? Number(node.value) : node.value));
    } else if (!node.disabled) {
      node.addEventListener('click', () => applySetting(key, !settings[key]));
    }
  });
  el.sheetBody.querySelectorAll('[data-forget]').forEach((node) => {
    node.addEventListener('click', async () => {
      await removeClient(node.dataset.forget);
      [tasks, settings] = await Promise.all([loadTasks(), loadSettings()]);
      renderSettings();
      render();
    });
  });
  const syncBtn = el.sheetBody.querySelector('[data-act-set="sync"]');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.textContent = 'Syncing…';
      await chrome.runtime.sendMessage({ type: 'sync-now' }).catch(() => {});
      [tasks, settings, syncState] = await Promise.all([loadTasks(), loadSettings(), loadSyncState()]);
      renderSettings();
      render();
    });
  }
  el.sheetBody.querySelector('[data-act-set="suggest"]')
    .addEventListener('click', () => chrome.tabs.create({ url: SUGGEST_URL }));
  el.sheetBody.querySelector('[data-act-set="export"]').addEventListener('click', exportBackup);
  el.sheetBody.querySelector('[data-act-set="import"]').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', importBackup);
}

async function applySetting(key, value) {
  settings = { ...settings, [key]: value };
  await saveSettings(settings);
  renderSettings();
}

function exportBackup() {
  const payload = JSON.stringify({ tico: 1, exported: new Date().toISOString(), tasks, settings }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `tico-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  showToast(`Exported ${tasks.length} tasks`);
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data.tasks) ? data.tasks : null;
    if (!incoming) throw new Error('no tasks in that file');

    await snapshot();
    // Merge rather than replace: restoring a backup should never cost you the
    // tasks you have written since you made it.
    const have = new Set(tasks.map((t) => t.id));
    const added = incoming.filter((t) => t && t.id && !have.has(t.id));
    tasks = [...added, ...tasks];
    if (data.settings?.clients || data.settings?.learned) {
      settings = {
        ...settings,
        clients: { ...(data.settings.clients || {}), ...(settings.clients || {}) },
        learned: { ...(data.settings.learned || {}), ...(settings.learned || {}) },
      };
      await saveSettings(settings);
    }
    await persist();
    [tasks, settings] = await Promise.all([loadTasks(), loadSettings()]);
    render();
    renderSettings();
    showToast(added.length ? `Restored ${added.length} tasks` : 'Nothing new in that backup');
  } catch (err) {
    showToast(`Could not read that file: ${err.message}`);
  } finally {
    event.target.value = '';
  }
}

// --- formatting ------------------------------------------------------------
function dueLabel(due, hasTime, forPreview = false) {
  const d = new Date(due);
  const now = new Date();
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  const days = Math.floor((+new Date(d).setHours(0, 0, 0, 0) - +startToday) / DAY);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (days === 0) {
    if (+d < +now && !forPreview) {
      const mins = Math.round((+now - +d) / 60000);
      if (mins < 60) return mins <= 1 ? 'Just now' : `${mins}m ago`;
      return `${Math.round(mins / 60)}h ago`;
    }
    return hasTime ? `Today ${time}` : 'Today';
  }
  if (days === 1) return hasTime ? `Tomorrow ${time}` : 'Tomorrow';
  if (days === -1) return hasTime ? `Yesterday ${time}` : 'Yesterday';
  if (days > 1 && days < 7) {
    const name = d.toLocaleDateString([], { weekday: 'short' });
    return hasTime ? `${name} ${time}` : name;
  }
  const date = d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  if (days < 0) return `${date}${hasTime ? ` ${time}` : ''}`;
  return hasTime ? `${date} ${time}` : date;
}

function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function truncate(s, n) { return s.length > n ? `${s.slice(0, n - 1)}…` : s; }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Another surface (the context menu, a notification button) changed the list.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.tasks || editingId) return;
  tasks = await loadTasks();
  render();
});
