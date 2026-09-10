// {Tokens} — finding them, and working out what to put in their place.
var Rico = globalThis.Rico || (globalThis.Rico = {});

Rico.tokens = (() => {
  const PATTERN = /\{([A-Za-z][A-Za-z0-9 _-]{0,40})\}/g;

  // The one token Rico can answer on its own, from the To: field. Everything
  // else has to be asked, which is why this one is worth paying for.
  const AUTO = new Set(['firstname', 'first name', 'first']);

  const norm = (name) => name.trim().toLowerCase();

  /** Every distinct token in a body, in the order they first appear. */
  function find(body) {
    const seen = new Set();
    const out = [];
    for (const m of String(body || '').matchAll(PATTERN)) {
      const key = norm(m[1]);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ raw: m[0], name: m[1], key, auto: AUTO.has(key) });
    }
    return out;
  }

  /**
   * A person's first name, out of whatever the chip gave us.
   *
   * Gmail hands over a display name when the contact has one and a bare
   * address when it does not, and neither arrives in a predictable shape.
   */
  function firstNameOf(recipient) {
    if (!recipient) return '';
    const name = (recipient.name || '').trim();

    if (name && !name.includes('@')) {
      // "Doe, John" is a directory listing, not a name. The part after the
      // comma is the one people are called by.
      const reversed = name.match(/^([^,]+),\s*(.+)$/);
      const ordered = reversed ? reversed[2] : name;
      const first = ordered.split(/\s+/)[0].replace(/^["'(]+|["')]+$/g, '');
      if (first && !/^(mr|mrs|ms|dr|prof)\.?$/i.test(first)) return titleCase(first);
      const second = ordered.split(/\s+/)[1];
      if (second) return titleCase(second);
    }

    const email = (recipient.email || name || '').trim();
    const local = email.split('@')[0];
    if (!local) return '';

    // "info", "sales", "no-reply" are not people, and greeting a shared
    // mailbox by name reads as a mail merge that went wrong — which is the
    // exact impression a canned response is trying to avoid. Checked against
    // the whole local part before splitting, because "no-reply" splits into
    // "no", which is no longer a role word but is not a name either.
    if (ROLE.test(local)) return '';

    // john.doe / john_doe / john+tag / mike99 — the first segment is the best
    // guess available, and a wrong guess is visible before the mail is sent.
    const head = local.split(/[.\-_+]/)[0].replace(/[0-9]+$/, '');
    if (!head || head.length < 2) return '';
    if (ROLE.test(head)) return '';

    // "jd@" is initials. "jo.smith@" is a name, because the separator says the
    // first segment is a first name on its own. Two letters standing alone are
    // a coin toss, and "Hi Jd," is worse than a plain "Hi,".
    if (head.length < 3 && head === local) return '';

    return titleCase(head);
  }

  const ROLE = /^(info|sales|support|hello|hi|contact|admin|team|office|no-?reply|donotreply|do-not-reply|mail|email|help|billing|accounts|jobs|careers|hr|press|marketing|enquiries|inquiries|newsletter|notifications?)$/i;

  const titleCase = (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

  /**
   * Fill what can be filled; report what cannot.
   *
   * `values` holds anything the user has already typed for this insertion.
   * Auto-fill is a paid feature, so `canAuto` decides whether {FirstName}
   * resolves itself or joins the queue of things to ask about.
   */
  function resolve(body, { recipients = [], values = {}, canAuto = false } = {}) {
    const found = find(body);
    const pending = [];
    const filled = {};

    for (const token of found) {
      if (Object.prototype.hasOwnProperty.call(values, token.key)) {
        filled[token.key] = values[token.key];
        continue;
      }
      if (token.auto && canAuto) {
        const name = firstNameOf(recipients[0]);
        if (name) { filled[token.key] = name; continue; }
      }
      pending.push(token);
    }

    return { tokens: found, filled, pending };
  }

  /** Substitute every {Token} we have a value for, leaving the rest alone. */
  function apply(body, filled) {
    return String(body || '').replace(PATTERN, (raw, name) => {
      const key = norm(name);
      return Object.prototype.hasOwnProperty.call(filled, key) ? filled[key] : raw;
    });
  }

  return { PATTERN, find, firstNameOf, resolve, apply };
})();

if (typeof module !== 'undefined') module.exports = Rico.tokens;
