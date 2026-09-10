// Putting text into Gmail's compose box so that Gmail believes the user typed
// it.
//
// The hard requirement here is autosave. Setting innerHTML or appending nodes
// puts the text on screen and leaves Gmail's draft model untouched — the mail
// looks written, the draft saves without it, and the user finds out after
// sending. execCommand is deprecated and still the only call that mutates a
// contenteditable through the browser's own editing pipeline, which is what
// fires the input events Gmail listens to.
var Rico = globalThis.Rico || (globalThis.Rico = {});

Rico.insert = (() => {
  /**
   * Remember where the caret is.
   *
   * Opening the palette takes focus off the compose box, and losing the caret
   * means inserting at the top of the mail instead of where the user was
   * typing. The range has to come from the editable's own document — in an
   * iframe that is not the same object as `document`.
   */
  function saveCaret(editable) {
    if (!editable) return null;
    const doc = editable.ownerDocument;
    const sel = doc.defaultView.getSelection();
    if (!sel || !sel.rangeCount) return { editable, range: null };
    const range = sel.getRangeAt(0);
    // A selection elsewhere on the page is not this compose box's caret.
    if (!editable.contains(range.commonAncestorContainer)) return { editable, range: null };
    return { editable, range: range.cloneRange() };
  }

  function restoreCaret(saved) {
    if (!saved || !saved.editable) return false;
    const { editable, range } = saved;
    const doc = editable.ownerDocument;
    editable.focus({ preventScroll: true });

    const sel = doc.defaultView.getSelection();
    if (!sel) return false;

    if (range) {
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }

    // No remembered caret — the user opened the palette before typing
    // anything. The end of the body is where they would have been.
    const end = doc.createRange();
    end.selectNodeContents(editable);
    end.collapse(false);
    sel.removeAllRanges();
    sel.addRange(end);
    return true;
  }

  /**
   * Insert plain text at the caret, line breaks intact.
   *
   * execCommand('insertText') with a \n in the string is not reliable across
   * contenteditable configurations — sometimes a <br>, sometimes a new block,
   * sometimes nothing. Driving the breaks explicitly with insertLineBreak
   * gives the same result every time, and gives Gmail one input event per
   * line, which is if anything more like typing than a single bulk insert.
   */
  function insertText(saved, text) {
    if (!restoreCaret(saved)) return false;

    const editable = saved.editable;
    const doc = editable.ownerDocument;
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');

    let wrote = false;
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) wrote = doc.execCommand('insertLineBreak') || wrote;
      if (lines[i]) wrote = doc.execCommand('insertText', false, lines[i]) || wrote;
    }

    if (!wrote) return fallbackInsert(editable, doc, text);

    // Belt and braces. execCommand fires its own input event, but Gmail's
    // autosave is the entire reason this module exists and a second event
    // costs nothing.
    editable.dispatchEvent(new InputEvent('input', {
      bubbles: true, cancelable: false, inputType: 'insertText', data: text,
    }));
    return true;
  }

  /**
   * If execCommand ever goes away, write the text by hand.
   *
   * This produces the right characters in the right place but has no claim on
   * Gmail's draft model, so it is a last resort rather than an alternative.
   */
  function fallbackInsert(editable, doc, text) {
    const sel = doc.defaultView.getSelection();
    if (!sel || !sel.rangeCount) return false;

    const range = sel.getRangeAt(0);
    range.deleteContents();

    const fragment = doc.createDocumentFragment();
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    lines.forEach((line, i) => {
      if (i > 0) fragment.appendChild(doc.createElement('br'));
      if (line) fragment.appendChild(doc.createTextNode(line));
    });

    const last = fragment.lastChild;
    range.insertNode(fragment);
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    editable.dispatchEvent(new InputEvent('input', {
      bubbles: true, cancelable: false, inputType: 'insertText', data: text,
    }));
    return true;
  }

  return { saveCaret, restoreCaret, insertText };
})();
