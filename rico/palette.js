// The palette itself: a search box over the compose window.
//
// It renders into a shadow root because Gmail's stylesheet is a thousand rules
// deep and several of them are unhelpfully generic. Without isolation the
// palette inherits line heights and font stacks from whichever part of Gmail
// it happens to be nested inside, and looks different in a reply than in a
// popped-out compose.
var Rico = globalThis.Rico || (globalThis.Rico = {});

Rico.palette = (() => {
  let host = null;          // the shadow host currently in the DOM
  let shadow = null;
  let state = null;         // everything about the open palette

  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }

  .backdrop {
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(15, 17, 23, 0.28);
    display: flex; justify-content: center; align-items: flex-start;
    padding: 8vh 16px 16px;
  }
  .panel {
    width: 100%; max-width: 520px; max-height: 70vh;
    display: flex; flex-direction: column;
    background: #ffffff; color: #1b1e28;
    border-radius: 12px; overflow: hidden;
    border: 1px solid #e3e6ee;
    box-shadow: 0 18px 48px rgba(15, 17, 23, 0.28);
    animation: rise 90ms ease-out;
  }
  @keyframes rise { from { transform: translateY(-6px); opacity: 0; } }
  @media (prefers-color-scheme: dark) {
    .panel { background: #171a23; color: #e7e9ef; border-color: #272c3a; }
    .row.on { background: #2a2d52 !important; }
    .row { border-color: #21242f !important; }
    .meta, .hint, .body { color: #8b93a7 !important; }
    input, textarea { background: transparent !important; color: #e7e9ef !important; }
    .fill input { background: #0f1117 !important; border-color: #272c3a !important; }
    .foot { background: #131620 !important; border-color: #272c3a !important; }
  }

  .search { display: flex; align-items: center; gap: 10px; padding: 13px 16px;
    border-bottom: 1px solid #e3e6ee; }
  .search svg { flex: none; opacity: 0.45; }
  input {
    flex: 1; border: 0; outline: 0; background: transparent;
    font-size: 15px; line-height: 20px; color: inherit; padding: 0;
  }
  input::placeholder { color: #8b93a7; }

  .list { overflow-y: auto; padding: 6px; margin: 0; list-style: none; }
  .row {
    padding: 9px 11px; border-radius: 8px; cursor: pointer;
    border: 1px solid transparent;
  }
  .row.on { background: #eef0fb; }
  .title { font-size: 14px; line-height: 19px; font-weight: 550; }
  .title mark { background: transparent; color: #5b63f0; font-weight: 700; }
  @media (prefers-color-scheme: dark) { .title mark { color: #a5abff; } }
  .body {
    font-size: 12px; line-height: 17px; color: #6b7280; margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tag {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;
    color: #8b93a7; margin-left: 6px;
  }

  .empty { padding: 26px 16px; text-align: center; font-size: 13px; color: #8b93a7; }

  .foot {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 8px 14px; border-top: 1px solid #e3e6ee; background: #f7f8fb;
    font-size: 11px; color: #8b93a7;
  }
  kbd {
    font-family: inherit; font-size: 10px; padding: 1px 5px;
    border: 1px solid currentColor; border-radius: 4px; opacity: 0.7;
  }
  .foot a { color: #5b63f0; text-decoration: none; font-weight: 600; cursor: pointer; }

  .fill { padding: 16px; }
  .fill h2 { margin: 0 0 3px; font-size: 14px; font-weight: 600; }
  .fill p { margin: 0 0 14px; font-size: 12px; color: #8b93a7; }
  .fill label { display: block; font-size: 12px; font-weight: 600; margin: 10px 0 4px; }
  .fill input {
    width: 100%; padding: 8px 10px; font-size: 14px;
    border: 1px solid #e3e6ee; border-radius: 7px; background: #fff;
  }
  .fill .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  button {
    font: inherit; font-size: 13px; padding: 7px 14px; border-radius: 7px;
    border: 1px solid #e3e6ee; background: transparent; color: inherit; cursor: pointer;
  }
  button.primary { background: #5b63f0; border-color: #5b63f0; color: #fff; font-weight: 600; }
  `;

  /**
   * Which document to render into.
   *
   * Normally the one that owns the compose box, so the palette sits over the
   * thing it is editing. But Gmail sometimes puts the editable in an iframe
   * only a few hundred pixels tall, and a `position: fixed` overlay inside
   * that iframe is clipped to it — a 520px palette in a 200px frame is a
   * scrollbar, not a palette. When the frame is too small to hold it, and the
   * top document is reachable, render up there instead.
   */
  function surfaceFor(editable) {
    const own = editable.ownerDocument;
    const win = own.defaultView;
    if (!win || win === win.top) return own;
    if (win.innerHeight >= 360 && win.innerWidth >= 380) return own;
    try {
      if (win.top.document && win.top.document.body) return win.top.document;
    } catch {
      // Cross-origin frame; the small frame is all we have.
    }
    return own;
  }

  const escape = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /** The title with the matched letters marked, so the ranking is visible. */
  function highlight(title, positions) {
    if (!positions || !positions.length) return escape(title);
    const set = new Set(positions);
    let out = '';
    for (let i = 0; i < title.length; i++) {
      out += set.has(i) ? `<mark>${escape(title[i])}</mark>` : escape(title[i]);
    }
    return out;
  }

  const preview = (body) => String(body || '').replace(/\s+/g, ' ').trim().slice(0, 110);

  function close() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    if (state && state.onClose) state.onClose();
    host = null; shadow = null; state = null;
  }

  const isOpen = () => !!host;

  function open(context) {
    close();
    state = { ...context, query: '', index: 0, hits: [], view: 'list' };

    const doc = surfaceFor(context.editable);
    host = doc.createElement('div');
    host.setAttribute('data-rico', 'palette');
    shadow = host.attachShadow({ mode: 'open' });
    doc.body.appendChild(host);

    shadow.innerHTML = `<style>${CSS}</style><div class="backdrop"><div class="panel"></div></div>`;

    shadow.querySelector('.backdrop').addEventListener('mousedown', (e) => {
      if (e.target === e.currentTarget) close();
    });

    renderList();
    return true;
  }

  function renderList() {
    state.view = 'list';
    const panel = shadow.querySelector('.panel');
    const limitReached = !state.paid && state.snippets.length >= state.freeLimit;

    panel.innerHTML = `
      <div class="search">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
             stroke-width="1.6"><circle cx="7" cy="7" r="4.6"/><path d="M10.5 10.5L14 14"/></svg>
        <input type="text" placeholder="Search snippets…" spellcheck="false"
               autocomplete="off" aria-label="Search snippets">
      </div>
      <ul class="list"></ul>
      <div class="foot">
        <span><kbd>↑↓</kbd> move &nbsp; <kbd>↵</kbd> insert &nbsp; <kbd>esc</kbd> close</span>
        <span class="counter"></span>
      </div>`;

    const input = panel.querySelector('input');
    input.addEventListener('input', () => { state.query = input.value; state.index = 0; refresh(); });
    input.addEventListener('keydown', onKey);

    const counter = panel.querySelector('.counter');
    if (limitReached) {
      counter.innerHTML = `${state.snippets.length}/${state.freeLimit} · <a>Get unlimited</a>`;
      counter.querySelector('a').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'rico:upgrade' });
        close();
      });
    } else if (!state.paid) {
      counter.textContent = `${state.snippets.length}/${state.freeLimit} snippets`;
    }

    refresh();
    // Focus after the frame is in the tree, or the caret lands nowhere.
    setTimeout(() => input.focus({ preventScroll: true }), 0);
  }

  function refresh() {
    state.hits = Rico.fuzzy.search(state.snippets, state.query);
    const list = shadow.querySelector('.list');

    if (!state.hits.length) {
      list.innerHTML = `<li class="empty">${state.snippets.length
        ? 'No snippet matches that.'
        : 'No snippets yet — add one from the Rico icon in your toolbar.'}</li>`;
      return;
    }

    list.innerHTML = state.hits.map((hit, i) => `
      <li class="row${i === state.index ? ' on' : ''}" data-i="${i}" role="option">
        <div class="title">${highlight(hit.snippet.title, hit.positions)}${
          hit.matchedBody ? '<span class="tag">in body</span>' : ''}</div>
        <div class="body">${escape(preview(hit.snippet.body))}</div>
      </li>`).join('');

    for (const row of list.querySelectorAll('.row')) {
      row.addEventListener('mouseenter', () => {
        state.index = Number(row.dataset.i);
        for (const other of list.querySelectorAll('.row')) other.classList.remove('on');
        row.classList.add('on');
      });
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();          // keep focus off the row, on the input
        state.index = Number(row.dataset.i);
        choose();
      });
    }
  }

  function move(delta) {
    if (!state.hits.length) return;
    state.index = (state.index + delta + state.hits.length) % state.hits.length;
    const list = shadow.querySelector('.list');
    for (const row of list.querySelectorAll('.row')) row.classList.remove('on');
    const active = list.querySelector(`.row[data-i="${state.index}"]`);
    if (active) {
      active.classList.add('on');
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function onKey(event) {
    // Gmail has a keyboard shortcut for nearly every letter. Nothing typed
    // into the palette should reach it.
    event.stopPropagation();

    // The shortcut is a toggle. content.js handles the second press when the
    // palette is in the same frame as the compose box — but when the compose
    // frame was too small and the palette rendered into the top document, the
    // keystroke lands in a frame whose copy of this module believes nothing is
    // open. Catching it on the input covers both cases.
    if (state.shortcut && Rico.shortcut.matches(event, state.shortcut)) {
      event.preventDefault();
      close();
      return;
    }

    switch (event.key) {
      case 'Escape':    event.preventDefault(); close(); break;
      case 'ArrowDown': event.preventDefault(); move(1); break;
      case 'ArrowUp':   event.preventDefault(); move(-1); break;
      case 'Tab':       event.preventDefault(); move(event.shiftKey ? -1 : 1); break;
      case 'Enter':     event.preventDefault(); choose(); break;
      default: break;
    }
  }

  /** The chosen snippet: fill what we can, ask about the rest, then insert. */
  function choose() {
    const hit = state.hits[state.index];
    if (!hit) return;

    const resolved = Rico.tokens.resolve(hit.snippet.body, {
      recipients: state.recipients,
      canAuto: state.paid,
      values: {},
    });

    if (resolved.pending.length) return renderFill(hit.snippet, resolved);
    commit(hit.snippet, resolved.filled);
  }

  /**
   * The inline prompt for tokens Rico cannot answer by itself.
   *
   * Deliberately part of the palette rather than a second dialog: the user is
   * two seconds into an insertion and interrupting that with a modal somewhere
   * else on screen would cost more than typing the name by hand.
   */
  function renderFill(snippet, resolved) {
    state.view = 'fill';
    const panel = shadow.querySelector('.panel');
    const pending = resolved.pending;

    const upsell = !state.paid && pending.some((t) => t.auto)
      ? '<p style="margin-top:-8px">{FirstName} fills itself from the To: field on Pro.</p>'
      : '';

    panel.innerHTML = `
      <div class="fill">
        <h2>${escape(snippet.title)}</h2>
        <p>Fill in ${pending.length === 1 ? 'this' : 'these'} before inserting.</p>
        ${upsell}
        ${pending.map((t, i) => `
          <label for="t${i}">${escape(t.name)}</label>
          <input id="t${i}" data-key="${escape(t.key)}" type="text"
                 autocomplete="off" spellcheck="false"
                 placeholder="${escape(t.name)}">`).join('')}
        <div class="actions">
          <button data-act="cancel">Back</button>
          <button class="primary" data-act="go">Insert</button>
        </div>
      </div>`;

    const inputs = Array.from(panel.querySelectorAll('.fill input'));

    const go = () => {
      const filled = { ...resolved.filled };
      for (const input of inputs) filled[input.dataset.key] = input.value.trim();
      commit(snippet, filled);
    };

    panel.querySelector('[data-act="go"]').addEventListener('click', go);
    panel.querySelector('[data-act="cancel"]').addEventListener('click', () => renderList());

    for (const input of inputs) {
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); renderList(); }
        if (event.key === 'Enter') { event.preventDefault(); go(); }
      });
    }

    setTimeout(() => inputs[0] && inputs[0].focus({ preventScroll: true }), 0);
  }

  function commit(snippet, filled) {
    const text = Rico.tokens.apply(snippet.body, filled);
    const caret = state.caret;
    close();                              // focus must be back in the compose box first
    Rico.insert.insertText(caret, text);
    chrome.runtime.sendMessage({ type: 'rico:touch', id: snippet.id }, () => {
      void chrome.runtime.lastError;
    });
  }

  return { open, close, isOpen };
})();
