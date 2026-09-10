// Every Gmail selector Rico depends on, in one file.
//
// Gmail's DOM is minified and it changes without notice — obfuscated class
// names like `.Am` and `.aoP` are generated, not written, so they can turn over
// any quarter. When that happens Rico breaks in exactly one way: it stops
// finding compose windows. Keeping every selector here means the fix is a
// one-line patch in a known place rather than a hunt through the codebase.
//
// The ordering inside each list is deliberate: stable, semantic attributes
// first (role, contenteditable, name), obfuscated classes last as a fallback.
// If Gmail ever renames a class, the semantic selector ahead of it should
// already be carrying the load.
var Rico = globalThis.Rico || (globalThis.Rico = {});

Rico.selectors = (() => {
  // The editable body of a compose or reply. `g_editable` is Gmail's own
  // marker and has survived years of redesigns; the role and class are backup.
  const EDITABLE = [
    'div[g_editable="true"][role="textbox"]',
    'div[contenteditable="true"][role="textbox"][aria-label]',
    'div.Am.Al.editable[contenteditable="true"]',
  ].join(',');

  // Where recipients live once they are committed to chips. Gmail puts the
  // address on the chip element itself, which is the only part we need.
  const RECIPIENT_CHIP = [
    'div[data-hovercard-id]',
    'span[email]',
    'div[role="option"][data-name]',
  ].join(',');

  // The still-being-typed recipient input, and the region that holds the To:
  // chips. Cc/Bcc use the same shapes, so we scope to the To: region rather
  // than taking the first chip anywhere in the compose.
  const TO_INPUT = 'input[name="to"], textarea[name="to"]';
  const TO_REGION = 'div[name="to"], div[aria-label="To recipients"]';

  const SUBJECT = 'input[name="subjectbox"]';

  // Containers we accept as "the compose window". A popped-out compose is a
  // dialog; an inline reply is not, which is why the class fallbacks matter.
  const COMPOSE_ROOT = [
    'div[role="dialog"]',
    'div.iN',
    'div.aoI',
    'div.M9',
  ].join(',');

  // How far up the tree to walk before giving up on finding a compose root.
  // Deep enough for Gmail's nesting, shallow enough that a miss cannot climb
  // all the way to <body> and treat the whole page as one compose window.
  const MAX_CLIMB = 14;

  /**
   * The compose window that owns an editable.
   *
   * Tries the known containers first. When Gmail renames all of them at once,
   * falls back to walking up until it finds an ancestor that also contains a
   * recipient field — which is the actual definition of "a compose window"
   * and needs no class names to check.
   */
  function composeRootFrom(editable) {
    if (!editable) return null;
    const known = editable.closest(COMPOSE_ROOT);
    if (known) return known;

    let node = editable.parentElement;
    for (let i = 0; i < MAX_CLIMB && node && node !== node.ownerDocument.body; i++) {
      if (node.querySelector(TO_INPUT) || node.querySelector(TO_REGION)) return node;
      node = node.parentElement;
    }
    // An inline reply with the recipient row collapsed has no To: field in the
    // DOM at all. The editable's own parent is a poor compose root but a
    // working one — insertion only ever needs the editable itself.
    return editable.parentElement;
  }

  /** Every compose editable currently in this document. */
  function editables(root = document) {
    return Array.from(root.querySelectorAll(EDITABLE));
  }

  /** True when the element is a compose editable. */
  function isEditable(el) {
    return !!(el && el.matches && el.matches(EDITABLE));
  }

  /**
   * The To: recipients of a compose, as {name, email} — Cc and Bcc excluded.
   *
   * Prefers the chips inside the To: region. When the region cannot be
   * identified, falls back to every chip in the compose, which risks picking up
   * a Cc on a mail that has one; a slightly wrong {FirstName} beats no
   * {FirstName} at all, and the user sees the result before sending.
   */
  function recipients(composeRoot) {
    if (!composeRoot) return [];
    const region = composeRoot.querySelector(TO_REGION);
    const scope = region || composeRoot;
    const seen = new Set();
    const out = [];

    for (const chip of scope.querySelectorAll(RECIPIENT_CHIP)) {
      const email = chip.getAttribute('email')
        || chip.getAttribute('data-hovercard-id')
        || '';
      const name = chip.getAttribute('name')
        || chip.getAttribute('data-name')
        || '';
      if (!email && !name) continue;
      const key = (email || name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, email });
    }

    // Nothing committed to a chip yet — the address may still be sitting in
    // the input as raw text.
    if (!out.length) {
      const input = composeRoot.querySelector(TO_INPUT);
      const typed = input && input.value && input.value.trim();
      if (typed) out.push({ name: '', email: typed.split(/[,;]/)[0].trim() });
    }

    return out;
  }

  function subject(composeRoot) {
    const el = composeRoot && composeRoot.querySelector(SUBJECT);
    return el ? el.value : '';
  }

  return {
    EDITABLE, RECIPIENT_CHIP, TO_INPUT, TO_REGION, SUBJECT, COMPOSE_ROOT,
    composeRootFrom, editables, isEditable, recipients, subject,
  };
})();

if (typeof module !== 'undefined') module.exports = Rico.selectors;
