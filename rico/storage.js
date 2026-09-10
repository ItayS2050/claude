// Snippets and settings on disk. Shared by the palette, the popup and the
// service worker, so all three agree on what a snippet is and where it lives.
var Rico = globalThis.Rico || (globalThis.Rico = {});

Rico.storage = (() => {
  const SNIPPET_PREFIX = 'snip:';
  const SETTINGS_KEY = 'settings';
  const OVERFLOW_KEY = 'rico:overflow';

  // The free tier. Ten is enough to be genuinely useful — which is the point;
  // a crippled free tier sells nothing — and few enough that anyone sending
  // 30 mails a day runs into it inside a week.
  const FREE_LIMIT = 10;

  const DEFAULTS = {
    shortcut: 'Mod+Shift+K',
    onboarded: false,      // the one-time hint inside Gmail has been shown
    seeded: false,         // the example snippets have been written once
    sortBy: 'recent',      // recent | title | used
    suggest: true,         // offer to save a paragraph written twice
  };

  // One snippet per storage key rather than one array under a single key.
  // chrome.storage.sync caps a single item at 8KB, which an array of snippets
  // clears in about thirty entries — and the failure mode is silent data loss
  // on the write that crosses the line. Per-key storage trades that for a
  // 512-item cap, which is a limit a person can actually see coming.
  const keyOf = (id) => SNIPPET_PREFIX + id;

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function area(name) {
    return {
      get: (keys) => new Promise((resolve) => chrome.storage[name].get(keys, (r) => {
        void chrome.runtime.lastError; resolve(r || {});
      })),
      set: (items) => new Promise((resolve, reject) => chrome.storage[name].set(items, () => {
        const err = chrome.runtime.lastError;
        err ? reject(new Error(err.message)) : resolve();
      })),
      remove: (keys) => new Promise((resolve) => chrome.storage[name].remove(keys, () => {
        void chrome.runtime.lastError; resolve();
      })),
    };
  }

  const sync = area('sync');
  const local = area('local');

  const isSnippet = (value) => value && typeof value === 'object' && 'title' in value;

  /**
   * Every snippet, from both stores.
   *
   * Sync is the home; local is where snippets go once sync's quota is full, so
   * that hitting the ceiling costs the user cross-machine carry rather than the
   * snippet itself. Reads always merge both, and local wins a collision because
   * an id only exists in both when a sync write failed after a local one
   * succeeded — making local the newer copy.
   */
  async function all() {
    const [fromSync, fromLocal] = await Promise.all([sync.get(null), local.get(null)]);
    const merged = new Map();

    for (const [key, value] of Object.entries(fromSync)) {
      if (key.startsWith(SNIPPET_PREFIX) && isSnippet(value)) merged.set(value.id, value);
    }
    for (const [key, value] of Object.entries(fromLocal)) {
      if (key.startsWith(SNIPPET_PREFIX) && isSnippet(value)) merged.set(value.id, value);
    }

    return Array.from(merged.values());
  }

  async function count() {
    return (await all()).length;
  }

  async function get(id) {
    return (await all()).find((s) => s.id === id) || null;
  }

  /**
   * Write a snippet. Returns the stored copy.
   *
   * The free-tier check lives here rather than in the popup so that no caller
   * can route around it — but it only ever refuses to *create*. Snippets that
   * already exist stay editable and stay usable whatever the paid state says,
   * because locking someone out of their own writing is not a sales tactic.
   */
  async function put(snippet, { paid = false } = {}) {
    const now = Date.now();
    const existing = snippet.id ? await get(snippet.id) : null;

    if (!existing && !paid && (await count()) >= FREE_LIMIT) {
      const err = new Error('free-limit');
      err.code = 'FREE_LIMIT';
      throw err;
    }

    const record = {
      id: snippet.id || newId(),
      title: String(snippet.title || '').slice(0, 200).trim(),
      body: String(snippet.body || '').slice(0, 7000),
      folder: String(snippet.folder || '').slice(0, 60).trim(),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      usedAt: existing ? existing.usedAt || 0 : 0,
      uses: existing ? existing.uses || 0 : 0,
    };

    const item = { [keyOf(record.id)]: record };
    try {
      await sync.set(item);
      // It may have been living in local from a previous quota failure.
      await local.remove(keyOf(record.id));
    } catch {
      // Sync is full, or sync is off. Neither is a reason to lose the snippet.
      await local.set(item);
      await local.set({ [OVERFLOW_KEY]: true });
    }
    return record;
  }

  async function remove(id) {
    await Promise.all([sync.remove(keyOf(id)), local.remove(keyOf(id))]);
  }

  /** Record that a snippet was inserted, for the "most used" ordering. */
  async function touch(id) {
    const snippet = await get(id);
    if (!snippet) return;
    snippet.usedAt = Date.now();
    snippet.uses = (snippet.uses || 0) + 1;
    const item = { [keyOf(id)]: snippet };
    try { await sync.set(item); } catch { await local.set(item); }
  }

  async function settings() {
    const [s, l] = await Promise.all([sync.get(SETTINGS_KEY), local.get(SETTINGS_KEY)]);
    return { ...DEFAULTS, ...(l[SETTINGS_KEY] || {}), ...(s[SETTINGS_KEY] || {}) };
  }

  async function saveSettings(patch) {
    const next = { ...(await settings()), ...patch };
    try { await sync.set({ [SETTINGS_KEY]: next }); }
    catch { await local.set({ [SETTINGS_KEY]: next }); }
    return next;
  }

  /**
   * Three examples, written once, so that the first ⌘⇧K shows a working
   * palette instead of an empty box asking the user to go and configure
   * something. They are ordinary snippets: editable, deletable, and counted
   * against the free ten.
   */
  const SEEDS = [
    {
      title: 'Follow up',
      body: 'Hi {FirstName},\n\nJust following up on my last note — did you get a chance to look?\n\nHappy to jump on a quick call if that is easier.\n\nThanks,',
    },
    {
      title: 'Thanks / received',
      body: 'Hi {FirstName},\n\nGot it, thank you — I will come back to you by {Day}.\n\nBest,',
    },
    {
      title: 'Not a fit right now',
      body: 'Hi {FirstName},\n\nThanks for reaching out. This is not something we are looking at this quarter, but I have kept your details for when we are.\n\nAll the best,',
    },
  ];

  async function seedOnce() {
    const s = await settings();
    if (s.seeded) return;
    if ((await count()) === 0) {
      for (const seed of SEEDS) await put(seed, { paid: true });
    }
    await saveSettings({ seeded: true });
  }

  return {
    FREE_LIMIT, DEFAULTS, SEEDS,
    all, get, put, remove, touch, count,
    settings, saveSettings, seedOnce, newId,
  };
})();

if (typeof module !== 'undefined') module.exports = Rico.storage;
