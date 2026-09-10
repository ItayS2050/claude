// Runs in every Gmail frame. Finds compose windows, watches for the shortcut,
// and hands the palette what it needs.
(() => {
  const S = Rico.selectors;

  let settings = { ...Rico.storage.DEFAULTS };
  let snippets = [];
  let paid = false;
  let activeEditable = null;
  const known = new WeakSet();       // compose boxes we have already greeted

  // Everything the palette needs is kept in memory and refreshed in the
  // background, because the palette is not allowed to await anything. Two
  // seconds is the entire product claim; a storage round-trip on the keypress
  // would spend a visible slice of it, and a payment check would spend all of
  // it.
  async function load() {
    settings = await Rico.storage.settings();
    snippets = await Rico.storage.all();
  }

  function loadPaid() {
    chrome.runtime.sendMessage({ type: 'rico:status' }, (res) => {
      void chrome.runtime.lastError;
      if (res) paid = !!res.paid;
    });
  }

  chrome.storage.onChanged.addListener(() => { load(); });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'rico:open') tryOpen();
    return false;
  });

  // ---------------------------------------------------------------- compose

  /**
   * The compose box to insert into.
   *
   * Whatever the user last had the caret in, as long as it is still on the
   * page. Gmail keeps closed compose windows in the DOM for a while, so
   * "still connected" is not the same question as "still open" — but an
   * insertion into a detached node is the failure worth guarding against.
   */
  function currentEditable() {
    if (activeEditable && activeEditable.isConnected) return activeEditable;
    activeEditable = null;

    const focused = document.activeElement;
    if (S.isEditable(focused)) return (activeEditable = focused);

    const all = S.editables();
    return all.length === 1 ? (activeEditable = all[0]) : null;
  }

  document.addEventListener('focusin', (event) => {
    if (S.isEditable(event.target)) {
      activeEditable = event.target;
      announce(event.target);
    }
  }, true);

  function announce(editable) {
    if (known.has(editable)) return;
    known.add(editable);
    console.debug('[Rico] compose open', editable);
    maybeOnboard(editable);
  }

  // Gmail builds compose windows well after load and tears them down without
  // an event anyone outside Gmail can hear, so the DOM is the only source of
  // truth about whether one is open.
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (S.isEditable(node)) announce(node);
        else if (node.querySelector) for (const el of S.editables(node)) announce(el);
      }
      for (const node of record.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (activeEditable && (node === activeEditable || node.contains(activeEditable))) {
          console.debug('[Rico] compose closed');
          activeEditable = null;
          Rico.palette.close();
        }
      }
    }
  });

  // --------------------------------------------------------------- shortcut

  function tryOpen() {
    if (Rico.palette.isOpen()) { Rico.palette.close(); return true; }

    const editable = currentEditable();
    if (!editable) return false;

    const composeRoot = S.composeRootFrom(editable);
    return Rico.palette.open({
      editable,
      composeRoot,
      caret: Rico.insert.saveCaret(editable),
      snippets,
      recipients: S.recipients(composeRoot),
      paid,
      shortcut: settings.shortcut,
      freeLimit: Rico.storage.FREE_LIMIT,
    });
  }

  // Capture phase, on the way down, so Gmail's own handlers never see the key.
  // This is the whole reason the default shortcut is not ⌘K: Gmail binds that
  // to Insert Link inside compose, and taking it silently would mean the user
  // loses a Gmail feature to an extension they installed for something else.
  document.addEventListener('keydown', (event) => {
    if (!Rico.shortcut.matches(event, settings.shortcut)) return;
    if (!currentEditable()) return;         // not in a compose box: leave the key alone

    event.preventDefault();
    event.stopImmediatePropagation();
    tryOpen();
  }, true);

  // --------------------------------------------------------- repeat catching

  /**
   * Watch for the send, and check what went out against what has gone out
   * before.
   *
   * The text has to be read on the way *into* the send — mousedown, before
   * Gmail handles the click — because by the time the send completes the
   * compose window is gone and the text with it.
   */
  function armSendWatch() {
    const capture = (editable) => {
      if (!settings.suggest || !editable) return;
      const text = S.bodyText(editable);
      // Run after the send has actually gone, so nothing here can delay or
      // interfere with it. If the send failed, the worst case is a suggestion
      // about a mail still sitting in the compose window.
      setTimeout(() => considerSaving(text), 900);
    };

    document.addEventListener('mousedown', (event) => {
      const button = event.target.closest && event.target.closest(S.SEND);
      if (!button) return;
      capture(currentEditable());
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
      const editable = currentEditable();
      if (editable) capture(editable);
    }, true);
  }

  async function considerSaving(text) {
    const repeat = await Rico.repeats.record(text, snippets.map((s) => s.body));
    if (!repeat) return;

    Rico.suggest.show({
      text: repeat.text,
      title: Rico.repeats.suggestTitle(repeat.text),
      tag: Rico.repeats.suggestTag(repeat.text),
      paid,
      atLimit: snippets.length >= Rico.storage.FREE_LIMIT,
      onMute: () => Rico.repeats.mute(repeat.key),
      onSave: async (title, tag) => {
        try {
          const saved = await Rico.storage.put(
            { title, body: repeat.text, folder: tag }, { paid },
          );
          snippets = await Rico.storage.all();
          return saved;
        } catch {
          return null;
        }
      },
    });
  }

  // ------------------------------------------------------------- onboarding

  /**
   * One hint, once, ever. Shown against the compose box the user just opened
   * rather than on a page of its own, because the thing being explained only
   * makes sense while a compose window is in front of them.
   */
  function maybeOnboard(editable) {
    if (settings.onboarded) return;
    settings.onboarded = true;              // set now: two composes in one second is one hint
    Rico.storage.saveSettings({ onboarded: true });

    const doc = editable.ownerDocument;
    const host = doc.createElement('div');
    host.setAttribute('data-rico', 'hint');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        .hint {
          position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
          z-index: 2147483646; display: flex; align-items: center; gap: 10px;
          background: #171a23; color: #e7e9ef; padding: 11px 15px;
          border-radius: 10px; font: 500 13px/18px -apple-system, BlinkMacSystemFont,
            "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          box-shadow: 0 12px 32px rgba(15,17,23,0.34);
          animation: in 160ms ease-out;
        }
        @keyframes in { from { opacity: 0; transform: translate(-50%, 8px); } }
        kbd { border: 1px solid #4b5169; border-radius: 5px; padding: 2px 6px;
              font: inherit; font-size: 11px; }
        button { background: none; border: 0; color: #8b93a7; cursor: pointer;
                 font: inherit; font-size: 16px; line-height: 1; padding: 0 0 0 4px; }
      </style>
      <div class="hint">
        <span>Press <kbd>${Rico.shortcut.format(settings.shortcut)}</kbd> in any compose to insert a snippet.</span>
        <button aria-label="Dismiss">×</button>
      </div>`;

    const remove = () => host.remove();
    shadow.querySelector('button').addEventListener('click', remove);
    doc.body.appendChild(host);
    setTimeout(remove, 15000);
  }

  // ------------------------------------------------------------------ start

  load().then(() => {
    loadPaid();
    observer.observe(document.body, { childList: true, subtree: true });
    armSendWatch();
    for (const editable of S.editables()) announce(editable);
    console.debug('[Rico] watching', location.host,
      window === window.top ? '(top frame)' : '(frame)');
  });
})();
