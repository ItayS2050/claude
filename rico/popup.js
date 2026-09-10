// The snippet manager. Everything Rico can do that is not "insert this now".
(() => {
  const $ = (id) => document.getElementById(id);

  let snippets = [];
  let settings = { ...Rico.storage.DEFAULTS };
  let paid = false;
  let selectedId = null;
  let draft = null;              // {id?, title, body} while editing
  let query = '';

  // ------------------------------------------------------------------ chrome

  const ask = (msg) => new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => { void chrome.runtime.lastError; resolve(res); });
  });

  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('on'), 1800);
  }

  // -------------------------------------------------------------- rendering

  function renderChrome() {
    $('shortcutChip').textContent = Rico.shortcut.format(settings.shortcut);
    $('tier').textContent = paid ? 'Pro' : 'Free';
    $('count').textContent = paid
      ? `${snippets.length} snippet${snippets.length === 1 ? '' : 's'}`
      : `${snippets.length}/${Rico.storage.FREE_LIMIT} snippets`;
    $('upgradeBtn').hidden = paid;
  }

  function renderList() {
    const hits = Rico.fuzzy.search(snippets, query);
    const list = $('list');

    if (!hits.length) {
      list.innerHTML = `<div class="empty" style="padding:24px 12px;font-size:12px">${
        snippets.length ? 'Nothing matches that.' : 'No snippets yet.'}</div>`;
      return;
    }

    const ordered = query ? hits : hits.sort(byOrder);
    list.innerHTML = ordered.map(({ snippet }) => `
      <div class="item${snippet.id === selectedId ? ' on' : ''}" data-id="${snippet.id}">
        <h3></h3><p></p>
      </div>`).join('');

    // Titles and bodies are user text and go in as text, never as markup.
    ordered.forEach(({ snippet }, i) => {
      const row = list.children[i];
      row.querySelector('h3').textContent = snippet.title || 'Untitled';
      row.querySelector('p').textContent = (snippet.body || '').replace(/\s+/g, ' ').slice(0, 80);
      row.addEventListener('click', () => select(snippet.id));
    });
  }

  const byOrder = (a, b) => {
    if (settings.sortBy === 'title') {
      return (a.snippet.title || '').localeCompare(b.snippet.title || '');
    }
    if (settings.sortBy === 'used') return (b.snippet.uses || 0) - (a.snippet.uses || 0);
    return (b.snippet.updatedAt || 0) - (a.snippet.updatedAt || 0);
  };

  function renderPane() {
    const pane = $('pane');
    const actions = $('paneActions');

    if (!draft) {
      actions.hidden = true;
      pane.innerHTML = `
        <div class="empty">
          <h2>Pick a snippet, or make one</h2>
          <p>Then press ${escapeHtml(Rico.shortcut.format(settings.shortcut))} inside any Gmail
             compose window to search and insert it.</p>
        </div>`;
      return;
    }

    actions.hidden = false;
    $('deleteBtn').hidden = !draft.id;

    pane.innerHTML = `
      <div class="field">
        <label for="title">Title</label>
        <input type="text" id="title" placeholder="Follow up" autocomplete="off">
        <div class="hint">What you will search for. Rico also searches the body.</div>
      </div>
      <div class="field">
        <label for="body">Snippet</label>
        <textarea id="body" spellcheck="true" placeholder="Hi {FirstName},&#10;&#10;…"></textarea>
        <div class="hint">
          <code>{FirstName}</code> fills from the To: field${paid ? '' : ' on Pro'}.
          Any other <code>{Token}</code> asks you before inserting.
        </div>
      </div>`;

    const title = $('title');
    const body = $('body');
    title.value = draft.title || '';
    body.value = draft.body || '';
    title.addEventListener('input', () => { draft.title = title.value; });
    body.addEventListener('input', () => { draft.body = body.value; });
    title.focus();
    if (draft.id) title.setSelectionRange(title.value.length, title.value.length);
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function render() { renderChrome(); renderList(); renderPane(); }

  // ----------------------------------------------------------------- editing

  function select(id) {
    const snippet = snippets.find((s) => s.id === id);
    if (!snippet) return;
    selectedId = id;
    draft = { id: snippet.id, title: snippet.title, body: snippet.body };
    render();
  }

  function startNew() {
    // The check is here so the user is stopped before typing a snippet, not
    // after. storage.put refuses too — that one is the guarantee, this one is
    // the manners.
    if (!paid && snippets.length >= Rico.storage.FREE_LIMIT) return showUpgrade();
    selectedId = null;
    draft = { title: '', body: '' };
    render();
  }

  async function save() {
    if (!draft) return;
    if (!draft.title.trim() && !draft.body.trim()) { toast('Nothing to save'); return; }

    try {
      const saved = await Rico.storage.put(draft, { paid });
      snippets = await Rico.storage.all();
      selectedId = saved.id;
      draft = { id: saved.id, title: saved.title, body: saved.body };
      render();
      toast('Saved');
    } catch (err) {
      if (err.code === 'FREE_LIMIT') showUpgrade();
      else toast('Could not save — storage is full');
    }
  }

  async function remove() {
    if (!draft || !draft.id) return;
    await Rico.storage.remove(draft.id);
    snippets = await Rico.storage.all();
    selectedId = null;
    draft = null;
    render();
    toast('Deleted');
  }

  // ---------------------------------------------------------------- dialogs

  function showUpgrade() {
    const dlg = $('upgradeDlg');
    dlg.innerHTML = `
      <div class="dlg">
        <h2>Rico Pro</h2>
        <p class="price">$24 <small>once — not a subscription</small></p>
        <ul class="sell">
          <li>Unlimited snippets (you have ${snippets.length})</li>
          <li><code>{FirstName}</code> fills itself from the To: field</li>
          <li>Folders, JSON import and export</li>
          <li>No account, no server, nothing leaves your browser</li>
        </ul>
        <p style="margin-top:14px">Your ${Rico.storage.FREE_LIMIT} existing snippets keep working
           either way — the free tier stops you adding an eleventh, never using what you have.</p>
        <div class="row">
          <button class="ghost" data-act="later">Not now</button>
          <button class="primary" data-act="buy">Unlock Pro</button>
        </div>
      </div>`;
    dlg.querySelector('[data-act="later"]').addEventListener('click', () => dlg.close());
    dlg.querySelector('[data-act="buy"]').addEventListener('click', async () => {
      dlg.close();
      const res = await ask({ type: 'rico:upgrade' });
      if (!res || !res.ok) toast('Payments are not configured in this build');
    });
    dlg.showModal();
  }

  function showSettings() {
    const dlg = $('settingsDlg');
    const options = Rico.shortcut.PRESETS.map((p) => `
      <option value="${p.value}"${p.value === settings.shortcut ? ' selected' : ''}>
        ${escapeHtml(p.label)} — ${escapeHtml(p.note)}
      </option>`).join('');

    dlg.innerHTML = `
      <div class="dlg">
        <h2>Settings</h2>
        <div class="field">
          <label for="sc">Palette shortcut</label>
          <select id="sc">${options}</select>
          <div class="hint">
            Gmail already uses ⌘K for Insert Link inside a compose window, and Chrome
            reserves it for the address bar — so Rico stays off it unless you choose it here.
            <br><br>If the in-page shortcut is ever swallowed by Gmail, <code>Alt+Shift+K</code>
            works as a backup and can be changed at <code>chrome://extensions/shortcuts</code>.
          </div>
        </div>
        <div class="field">
          <label for="sort">Sort snippets by</label>
          <select id="sort">
            <option value="recent"${settings.sortBy === 'recent' ? ' selected' : ''}>Recently edited</option>
            <option value="title"${settings.sortBy === 'title' ? ' selected' : ''}>Title</option>
            <option value="used"${settings.sortBy === 'used' ? ' selected' : ''}>Most used</option>
          </select>
        </div>
        <div class="field">
          <label>Suggestions</label>
          <label style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--text);
                        display:flex;gap:8px;align-items:flex-start;cursor:pointer">
            <input type="checkbox" id="sugg" style="width:auto;margin-top:2px"
                   ${settings.suggest ? 'checked' : ''}>
            <span>Offer to save a paragraph when I write it twice
              <span class="hint" style="display:block;margin-top:2px">
                Rico stores a one-way hash of each paragraph you send, never the text.
                It cannot read back what you wrote.</span></span>
          </label>
        </div>
        <div class="row" style="justify-content:flex-start">
          <button data-act="import">Import…</button>
          <button data-act="export">Export JSON</button>
          <span style="flex:1"></span>
          <button class="primary" data-act="done">Done</button>
        </div>
      </div>`;

    dlg.querySelector('#sc').addEventListener('change', async (e) => {
      settings = await Rico.storage.saveSettings({ shortcut: e.target.value });
      renderChrome();
      toast('Shortcut updated — reload your Gmail tab');
    });
    dlg.querySelector('#sort').addEventListener('change', async (e) => {
      settings = await Rico.storage.saveSettings({ sortBy: e.target.value });
      renderList();
    });
    dlg.querySelector('#sugg').addEventListener('change', async (e) => {
      settings = await Rico.storage.saveSettings({ suggest: e.target.checked });
      toast(e.target.checked ? 'Suggestions on' : 'Suggestions off');
    });
    dlg.querySelector('[data-act="done"]').addEventListener('click', () => dlg.close());
    dlg.querySelector('[data-act="import"]').addEventListener('click', () => { dlg.close(); showImport(); });
    dlg.querySelector('[data-act="export"]').addEventListener('click', exportJson);
    dlg.showModal();
  }

  function showImport() {
    const dlg = $('importDlg');
    dlg.innerHTML = `
      <div class="dlg">
        <h2>Import snippets</h2>
        <p>Paste a Rico export, or paste your Gmail templates one after another with
           <code>---</code> on its own line between them. The first line of each block
           becomes the title.</p>
        <textarea id="importText" spellcheck="false" placeholder="Follow up
Hi {FirstName}, just checking in…
---
Thanks
Got it, thank you —"></textarea>
        <div class="row">
          <button class="ghost" data-act="cancel">Cancel</button>
          <button class="primary" data-act="go">Import</button>
        </div>
      </div>`;
    dlg.querySelector('[data-act="cancel"]').addEventListener('click', () => dlg.close());
    dlg.querySelector('[data-act="go"]').addEventListener('click', async () => {
      const parsed = parseImport(dlg.querySelector('#importText').value);
      if (!parsed.length) { toast('Nothing to import'); return; }
      dlg.close();
      await importAll(parsed);
    });
    dlg.showModal();
    dlg.querySelector('#importText').focus();
  }

  /**
   * Accepts a Rico export or a pile of pasted templates.
   *
   * There is no way to read Gmail's saved templates programmatically — they
   * live in the user's mail settings, not anywhere an extension can reach — so
   * "import my Gmail templates" is, honestly, paste them in. Making that one
   * paste instead of eleven is the whole of the feature.
   */
  function parseImport(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];

    if (raw.startsWith('[') || raw.startsWith('{')) {
      try {
        const data = JSON.parse(raw);
        const items = Array.isArray(data) ? data : data.snippets;
        if (Array.isArray(items)) {
          return items
            .filter((s) => s && (s.title || s.body))
            .map((s) => ({ title: String(s.title || 'Untitled'), body: String(s.body || '') }));
        }
      } catch {
        // Not JSON after all — fall through and treat it as pasted text.
      }
    }

    return raw.split(/^\s*-{3,}\s*$/m)
      .map((block) => block.replace(/^\n+/, '').trimEnd())
      .filter(Boolean)
      .map((block) => {
        const lines = block.split('\n');
        return { title: lines[0].trim().slice(0, 200), body: lines.slice(1).join('\n').trim() };
      })
      .filter((s) => s.title || s.body);
  }

  async function importAll(items) {
    let added = 0;
    let blocked = 0;

    for (const item of items) {
      try {
        await Rico.storage.put(item, { paid });
        added++;
      } catch (err) {
        if (err.code === 'FREE_LIMIT') { blocked = items.length - added; break; }
        throw err;
      }
    }

    snippets = await Rico.storage.all();
    render();

    if (blocked) {
      toast(`Imported ${added}. ${blocked} need Pro.`);
      showUpgrade();
    } else {
      toast(`Imported ${added} snippet${added === 1 ? '' : 's'}`);
    }
  }

  function exportJson() {
    const payload = JSON.stringify({
      exported: new Date().toISOString(),
      snippets: snippets.map(({ title, body, folder }) => ({ title, body, folder })),
    }, null, 2);

    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `rico-snippets-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ------------------------------------------------------------------- wire

  $('newBtn').addEventListener('click', startNew);
  $('saveBtn').addEventListener('click', save);
  $('cancelBtn').addEventListener('click', () => { draft = null; selectedId = null; render(); });
  $('deleteBtn').addEventListener('click', remove);
  $('settingsBtn').addEventListener('click', showSettings);
  $('upgradeBtn').addEventListener('click', showUpgrade);
  $('search').addEventListener('input', (e) => { query = e.target.value; renderList(); });

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 's') { e.preventDefault(); save(); }
    if (mod && e.key === 'n') { e.preventDefault(); startNew(); }
  });

  (async () => {
    await Rico.storage.seedOnce();
    [settings, snippets] = await Promise.all([Rico.storage.settings(), Rico.storage.all()]);
    const status = await ask({ type: 'rico:status' });
    paid = !!(status && status.paid);
    render();
    // Ask the network only after the UI is up, and only if we might be wrong.
    if (!paid) ask({ type: 'rico:refresh-pay' }).then((res) => {
      if (res && res.paid) { paid = true; render(); }
    });
  })();
})();
