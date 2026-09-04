// The popup: capture at the top, everything you already captured underneath.
import {
  loadTasks, saveTasks, loadSettings, saveSettings, taskFromInput, completeTask,
  setLane, classify, parse, nextOccurrence, BUCKETS, bucketOf,
} from './store.js';

const $ = (id) => document.getElementById(id);
const el = { input: $('input'), field: $('field'), mic: $('mic'), add: $('add'),
  preview: $('preview'), hint: $('hint'), lanes: $('lanes'), filters: $('filters'), list: $('list'),
  summary: $('summary'), clearDone: $('clearDone'), voiceLang: $('voiceLang'),
  toast: $('toast'), toastMsg: $('toastMsg'), undo: $('undo') };

const HOUR = 3600000;
const DAY = 24 * HOUR;

let tasks = [];
let settings = {};
let lane = 'all';         // all | work | personal — which hat you are wearing
let filter = 'all';       // all | today | done | tag:<name>
let query = '';
let editingId = null;     // task whose title is being edited
let schedId = null;       // task whose scheduling row is open
let flashId = null;       // freshly added task, for the highlight
let undoSnapshot = null;
let undoTimer = null;

if (new URLSearchParams(location.search).has('window')) document.body.classList.add('windowed');

// --- boot ------------------------------------------------------------------
(async function init() {
  [tasks, settings] = await Promise.all([loadTasks(), loadSettings()]);
  if (!settings.voiceLang) settings.voiceLang = defaultVoiceLang();
  render();
  el.input.focus();
})();

function defaultVoiceLang() {
  const ui = (chrome.i18n?.getUILanguage?.() || navigator.language || 'en-US');
  return ui.startsWith('he') ? 'he-IL' : (ui.startsWith('ru') ? 'ru-RU' : 'en-US');
}

async function persist() {
  await saveTasks(tasks);
  chrome.runtime.sendMessage({ type: 'refresh' }).catch(() => {});
}

// --- adding ----------------------------------------------------------------
async function addFromInput(source = 'type') {
  const raw = el.input.value.trim();
  if (!raw) return;
  const task = taskFromInput(raw, source, new Date(), settings.learned || {});
  if (!task) return;
  tasks.unshift(task);
  flashId = task.id;
  el.input.value = '';
  updatePreview();
  await persist();
  render();
  el.list.scrollTop = 0;
  setTimeout(() => { flashId = null; }, 1200);
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
  const pills = [];
  if (guess.lane) {
    pills.push(`<span class="pill"><span class="dot ${guess.lane}" style="display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:4px;vertical-align:1px"></span>${guess.lane}</span>`);
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
  el.input.placeholder = 'What needs doing?  (try “call mom tomorrow at 5”)';
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
  snapshot();

  if (t.done) {
    Object.assign(t, { done: false, doneAt: null, notified: t.due != null && t.due <= Date.now() });
  } else if (t.repeat && t.due) {
    // Past the occurrence just ticked off, even if it had not come round yet.
    const next = nextOccurrence(t.due, t.repeat, Math.max(Date.now(), t.due));
    Object.assign(t, { due: next, notified: false });
    showToast(`Next: ${dueLabel(next, t.hasTime)}`);
  } else {
    Object.assign(t, { done: true, doneAt: Date.now(), notified: true });
    showToast('Completed');
  }
  await persist();
  render();
}

async function removeTask(id) {
  const t = tasks.find((x) => x.id === id);
  snapshot();
  tasks = tasks.filter((x) => x.id !== id);
  await persist();
  render();
  showToast(`Deleted “${truncate(t?.text || '', 28)}”`);
}

async function patch(id, changes) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  Object.assign(t, changes);
  await persist();
  render();
}

async function setDue(id, due, hasTime) {
  await patch(id, { due, hasTime, notified: due != null && due <= Date.now() });
}

// Undo is a snapshot of the whole list — small enough to copy, and it makes
// every destructive action reversible without per-action bookkeeping.
function snapshot() {
  undoSnapshot = JSON.parse(JSON.stringify(tasks));
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
  tasks = undoSnapshot;
  undoSnapshot = null;
  el.toast.classList.remove('show');
  await persist();
  render();
});

el.clearDone.addEventListener('click', async () => {
  snapshot();
  const n = tasks.filter((t) => t.done).length;
  tasks = tasks.filter((t) => !t.done);
  await persist();
  render();
  showToast(`Cleared ${n} completed`);
});

// --- rendering -------------------------------------------------------------
function render() {
  renderLanes();
  renderFilters();
  renderList();
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

  const tags = [...new Set(open.flatMap((t) => t.tags))].sort().slice(0, 6);
  const chips = [
    { id: 'all', label: 'Open', n: counts.all },
    { id: 'today', label: 'Today', n: counts.today },
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
    const done = [...items].sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    el.list.innerHTML = `<div class="group-head">Completed <span class="count">${done.length}</span></div>` +
      done.map(taskHtml).join('');
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
  if (t.due != null) {
    meta.push(`<span class="due ${late ? 'late' : (soon ? 'soon' : '')}" data-act="sched" data-id="${t.id}">${escapeHtml(dueLabel(t.due, t.hasTime))}</span>`);
  } else {
    meta.push(`<span class="due" data-act="sched" data-id="${t.id}">Set a time</span>`);
  }
  if (t.repeat) meta.push(`<span class="rep">↻ ${t.repeat}</span>`);
  for (const tag of t.tags) meta.push(`<button class="tag" data-act="tag" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`);
  if (t.source === 'voice') meta.push('<span class="rep" title="Added by voice">🎙</span>');

  const titleHtml = editingId === t.id
    ? `<input class="title-edit" dir="auto" data-act="edit-input" data-id="${t.id}" value="${escapeHtml(t.text)}">`
    : `<div class="title" data-act="edit" data-id="${t.id}">${escapeHtml(t.text)}</div>`;

  return `
    <div class="task ${t.done ? 'done' : ''} p${t.priority} ${flashId === t.id ? 'flash' : ''}" data-id="${t.id}">
      <button class="check" data-act="toggle" data-id="${t.id}" aria-label="Complete">
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
        <button class="act flag ${t.priority ? 'on' : ''}" data-act="prio" data-id="${t.id}" title="Important">
          <svg viewBox="0 0 24 24"><path d="M6 3a1 1 0 0 1 1-1h11a1 1 0 0 1 .8 1.6L15.25 8l3.55 4.4A1 1 0 0 1 18 14H8v7a1 1 0 1 1-2 0V3Z"/></svg>
        </button>
        <button class="act" data-act="del" data-id="${t.id}" title="Delete">
          <svg viewBox="0 0 24 24"><path d="M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7H4a1 1 0 0 1 0-2h4V4a1 1 0 0 1 1-1Zm1 6v9h1.5V9H10Zm3.5 0v9H15V9h-1.5Z"/></svg>
        </button>
      </div>
    </div>
    ${schedId === t.id ? schedHtml(t) : ''}`;
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
  el.list.querySelectorAll('[data-act]').forEach((node) => {
    const act = node.dataset.act;
    const id = node.dataset.id;

    if (act === 'toggle') node.addEventListener('click', () => toggleDone(id));
    if (act === 'del') node.addEventListener('click', () => removeTask(id));
    if (act === 'prio') node.addEventListener('click', () => {
      const t = tasks.find((x) => x.id === id);
      patch(id, { priority: t.priority ? 0 : 1 });
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
      [tasks, settings] = await Promise.all([loadTasks(), loadSettings()]);
      render();
    });
    if (act === 'sched') node.addEventListener('click', () => {
      schedId = schedId === id ? null : id;
      renderList();
    });
    if (act === 'edit') node.addEventListener('click', () => { editingId = id; renderList(); });

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

function applyQuickDue(id, when) {
  const now = new Date();
  if (when === 'clear') return setDue(id, null, false);
  if (when === '1h') return setDue(id, Date.now() + HOUR, true);
  if (when === 'evening') {
    const d = new Date(now); d.setHours(20, 0, 0, 0);
    return setDue(id, +d > Date.now() ? +d : Date.now() + HOUR, true);
  }
  if (when === 'tomorrow') {
    const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
    return setDue(id, +d, false);
  }
  if (when === 'week') {
    const d = new Date(now); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0);
    return setDue(id, +d, false);
  }
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
  if (filter === 'done') return '<div class="empty"><p>Nothing completed yet.</p></div>';
  if (filter.startsWith('tag:')) return `<div class="empty"><p>No open tasks tagged ${escapeHtml(filter.slice(4))}.</p></div>`;
  if (filter === 'today') return '<div class="empty"><div class="big">☀️</div><p>Nothing due today.</p></div>';
  if (lane !== 'all') {
    return `<div class="empty">
      <div class="big">${lane === 'work' ? '💼' : '🏠'}</div>
      <p>Nothing filed under <strong>${lane}</strong> yet.</p>
      <p style="margin-top:8px">Jot files new tasks by what they say. Click the dot
      beside any task in <strong>All</strong> to move it here.</p>
    </div>`;
  }
  return `<div class="empty">
    <div class="big">✓</div>
    <p>Type it or say it — Jot works out when.</p>
    <p style="margin-top:10px">
      <code>call mom tomorrow at 5</code><br>
      <code>standup every monday 9:30</code><br>
      <code>pay rent in 20 minutes !</code>
    </p>
  </div>`;
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
