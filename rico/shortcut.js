// Parsing, matching and displaying keyboard shortcuts.
//
// This exists as its own module because of what Cmd+K turned out to be. It is
// Gmail's Insert Link shortcut inside a compose window, and Chrome reserves it
// for omnibox search besides — so Rico cannot simply take it, and the shortcut
// has to be something the user can change. Once it is configurable it needs
// parsing, matching and formatting, and those want to be tested without a
// browser.
var Rico = globalThis.Rico || (globalThis.Rico = {});

Rico.shortcut = (() => {
  // Not the default because it is nicest, but because it is free. Cmd+Shift+K
  // collides with nothing in Gmail and nothing in Chrome, and it sits next to
  // the muscle memory of every other cmd+K palette.
  const DEFAULT = 'Mod+Shift+K';

  // Offered in the popup, with the cost of each spelled out there.
  const PRESETS = [
    { value: 'Mod+Shift+K', label: '⌘⇧K / Ctrl+Shift+K', note: 'Default — no conflicts' },
    { value: 'Mod+K', label: '⌘K / Ctrl+K', note: 'Overrides Gmail’s Insert Link' },
    { value: 'Mod+Shift+Space', label: '⌘⇧Space / Ctrl+Shift+Space', note: 'No conflicts' },
    { value: 'Alt+K', label: '⌥K / Alt+K', note: 'Types a special character on some layouts' },
    { value: 'Mod+/', label: '⌘/ / Ctrl+/', note: 'Gmail uses it for its shortcut help' },
  ];

  const isMac = () => {
    const platform = (globalThis.navigator && (navigator.userAgentData?.platform
      || navigator.platform)) || '';
    return /mac|iphone|ipad/i.test(platform);
  };

  /** "Mod+Shift+K" -> {mod, shift, alt, ctrl, key} */
  function parse(spec) {
    const parts = String(spec || DEFAULT).split('+').map((p) => p.trim()).filter(Boolean);
    const key = parts.pop() || 'K';
    const lower = parts.map((p) => p.toLowerCase());
    return {
      // Mod means Cmd on a Mac and Ctrl everywhere else, which is what every
      // shortcut anyone writes down actually means.
      mod: lower.includes('mod'),
      ctrl: lower.includes('ctrl'),
      shift: lower.includes('shift'),
      alt: lower.includes('alt') || lower.includes('option'),
      key: key.length === 1 ? key.toUpperCase() : key,
    };
  }

  /** Does this keydown event fire this shortcut? */
  function matches(event, spec) {
    const want = parse(spec);
    const mac = isMac();

    const wantPrimary = want.mod ? (mac ? 'meta' : 'ctrl') : (want.ctrl ? 'ctrl' : null);
    if (wantPrimary === 'meta' && !event.metaKey) return false;
    if (wantPrimary === 'ctrl' && !event.ctrlKey) return false;
    if (!wantPrimary && (event.metaKey || event.ctrlKey)) return false;
    // On a Mac, Ctrl+Shift+K must not also fire a Cmd+Shift+K binding.
    if (wantPrimary === 'meta' && event.ctrlKey) return false;
    if (wantPrimary === 'ctrl' && event.metaKey) return false;

    if (want.shift !== event.shiftKey) return false;
    if (want.alt !== event.altKey) return false;

    if (want.key === 'Space') return event.code === 'Space' || event.key === ' ';
    // `code` rather than `key`, so the shortcut survives a non-Latin keyboard
    // layout — the same reason Kiko exists at all. Alt on a Mac rewrites
    // event.key outright (⌥K is a dead key), and code is unmoved by it.
    if (/^[A-Z]$/.test(want.key)) {
      return event.code === `Key${want.key}`
        || (event.key || '').toUpperCase() === want.key;
    }
    return event.key === want.key;
  }

  /** "Mod+Shift+K" -> "⌘⇧K" on a Mac, "Ctrl+Shift+K" elsewhere. */
  function format(spec) {
    const s = parse(spec);
    const mac = isMac();
    const out = [];
    if (s.mod) out.push(mac ? '⌘' : 'Ctrl');
    if (s.ctrl && !s.mod) out.push(mac ? '⌃' : 'Ctrl');
    if (s.alt) out.push(mac ? '⌥' : 'Alt');
    if (s.shift) out.push(mac ? '⇧' : 'Shift');
    out.push(s.key === 'Space' ? 'Space' : s.key);
    return mac ? out.join('') : out.join('+');
  }

  /** A keydown event -> a shortcut spec, for the popup's recorder. */
  function fromEvent(event) {
    const parts = [];
    if (event.metaKey || event.ctrlKey) parts.push('Mod');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');

    let key = null;
    if (event.code === 'Space') key = 'Space';
    else if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
    else if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5);
    else if (event.key && event.key.length === 1) key = event.key.toUpperCase();
    if (!key) return null;

    // A bare letter would swallow typing, so a modifier is required.
    if (!parts.length) return null;
    parts.push(key);
    return parts.join('+');
  }

  return { DEFAULT, PRESETS, parse, matches, format, fromEvent, isMac };
})();

if (typeof module !== 'undefined') module.exports = Rico.shortcut;
