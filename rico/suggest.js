// The card that appears after you send something you have written before.
//
// It arrives *after* the send, never during. Interrupting a send to ask a
// favour is the fastest way to make someone uninstall a thing — the mail is
// already gone, and the offer can wait for the half-second afterwards.
var Rico = globalThis.Rico || (globalThis.Rico = {});

Rico.suggest = (() => {
  let host = null;

  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }

  .card {
    position: fixed; right: 20px; bottom: 20px; width: 330px; z-index: 2147483646;
    background: #ffffff; color: #1b1e28; border: 1px solid #e3e6ee;
    border-radius: 12px; box-shadow: 0 16px 40px rgba(15,17,23,0.26);
    padding: 14px 15px; animation: in 150ms ease-out;
  }
  @keyframes in { from { opacity: 0; transform: translateY(10px); } }
  @media (prefers-color-scheme: dark) {
    .card { background: #171a23; color: #e7e9ef; border-color: #272c3a; }
    .quote { background: #0f1117 !important; color: #8b93a7 !important; }
    input { background: #0f1117 !important; color: #e7e9ef !important; border-color: #272c3a !important; }
    button.ghost { color: #8b93a7 !important; }
  }

  h3 { margin: 0 0 3px; font-size: 13px; font-weight: 650; }
  p.why { margin: 0 0 10px; font-size: 12px; color: #8b93a7; }
  .quote {
    font-size: 11px; line-height: 1.5; color: #6b7280; background: #f7f8fb;
    border-radius: 7px; padding: 8px 10px; margin-bottom: 11px;
    max-height: 62px; overflow: hidden;
  }
  label { display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.05em;
          text-transform: uppercase; color: #8b93a7; margin: 0 0 4px; }
  .fields { display: flex; gap: 8px; margin-bottom: 12px; }
  .fields > div:first-child { flex: 1.6; }
  .fields > div:last-child { flex: 1; }
  input {
    width: 100%; padding: 7px 9px; font: inherit; font-size: 13px; color: inherit;
    background: #fff; border: 1px solid #e3e6ee; border-radius: 7px; outline: none;
  }
  input:focus { border-color: #5b63f0; }
  .row { display: flex; align-items: center; gap: 8px; }
  button {
    font: inherit; font-size: 12px; font-weight: 600; padding: 7px 13px;
    border-radius: 7px; border: 1px solid #e3e6ee; background: transparent;
    color: inherit; cursor: pointer;
  }
  button.primary { background: #5b63f0; border-color: #5b63f0; color: #fff; }
  button.ghost { border-color: transparent; color: #6b7280; font-weight: 500; }
  .done { font-size: 12.5px; }
  .done b { font-weight: 650; }
  `;

  const escape = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  function close() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }

  /**
   * Offer to keep a paragraph.
   *
   * `onSave` is given the title and tag the user settled on; `onMute` is the
   * promise that this exact paragraph will never be raised again. "Never" has
   * to be one click, or the feature is a nag.
   */
  function show({ text, title, tag, paid, atLimit, onSave, onMute }) {
    close();

    const doc = document;
    host = doc.createElement('div');
    host.setAttribute('data-rico', 'suggest');
    const shadow = host.attachShadow({ mode: 'open' });
    doc.body.appendChild(host);

    shadow.innerHTML = `<style>${CSS}</style>
      <div class="card">
        <h3>You have written this before.</h3>
        <p class="why">Keep it as a snippet?</p>
        <div class="quote">${escape(text.slice(0, 220))}${text.length > 220 ? '…' : ''}</div>
        <div class="fields">
          <div><label for="t">Title</label><input id="t" type="text" autocomplete="off"></div>
          <div><label for="g">Tag</label><input id="g" type="text" autocomplete="off"
               placeholder="optional"></div>
        </div>
        <div class="row">
          <button class="primary" data-act="save">Save snippet</button>
          <button class="ghost" data-act="later">Not now</button>
          <span style="flex:1"></span>
          <button class="ghost" data-act="never" title="Never ask about this one">Never</button>
        </div>
      </div>`;

    const card = shadow.querySelector('.card');
    const titleInput = shadow.querySelector('#t');
    const tagInput = shadow.querySelector('#g');
    titleInput.value = title;
    tagInput.value = tag;

    // At the free limit there is nothing to save into, so the card says so
    // rather than offering a button that fails.
    if (atLimit && !paid) {
      card.querySelector('[data-act="save"]').textContent = 'Get Pro to save';
    }

    const finish = (message) => {
      card.innerHTML = `<div class="done">${message}</div>`;
      setTimeout(close, 2200);
    };

    card.querySelector('[data-act="save"]').addEventListener('click', async () => {
      if (atLimit && !paid) {
        chrome.runtime.sendMessage({ type: 'rico:upgrade' });
        close();
        return;
      }
      const saved = await onSave(titleInput.value.trim() || title, tagInput.value.trim());
      finish(saved
        ? `Saved as <b>${escape(saved.title)}</b>. Press the Rico shortcut in any compose to use it.`
        : 'Could not save that one.');
    });

    card.querySelector('[data-act="later"]').addEventListener('click', close);
    card.querySelector('[data-act="never"]').addEventListener('click', async () => {
      await onMute();
      finish('Fine — Rico will not raise that one again.');
    });

    // Keystrokes in the card belong to the card, not to Gmail's shortcuts.
    for (const input of [titleInput, tagInput]) {
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Escape') close();
        if (event.key === 'Enter') card.querySelector('[data-act="save"]').click();
      });
    }

    // Long enough to notice and act on, short enough not to sit there. Ignored
    // once the user starts typing a title — that is someone mid-decision.
    let timer = setTimeout(close, 22000);
    card.addEventListener('input', () => { clearTimeout(timer); timer = null; }, { once: true });
    card.addEventListener('mouseenter', () => { if (timer) { clearTimeout(timer); timer = null; } });
  }

  return { show, close };
})();
