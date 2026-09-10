// node test-shortcut.js — the collision rules, which are the reason this
// module exists. Run it after touching shortcut.js.
const shortcut = require('./shortcut.js');

let failed = 0;
const ok = (label, cond) => {
  if (cond) console.log(`ok    ${label}`);
  else { failed++; console.log(`FAIL  ${label}`); }
};

// The module reads navigator to decide what Mod means, so the tests set it.
// Node 21 and up define globalThis.navigator as a read-only accessor, so a
// plain assignment here is silently dropped and every Mac case quietly runs as
// Windows — which passes about half of them and looks like a real bug in the
// module. defineProperty is the only way to stand in front of it.
const asPlatform = (platform, fn) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform, userAgentData: { platform } },
    configurable: true, writable: true,
  });
  try { return fn(); } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  }
};

const key = (over = {}) => ({
  metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
  code: 'KeyK', key: 'k', ...over,
});

// Mod is Cmd on a Mac and Ctrl everywhere else.
asPlatform('MacIntel', () => {
  ok('Mac: Cmd+Shift+K fires the default',
    shortcut.matches(key({ metaKey: true, shiftKey: true }), 'Mod+Shift+K'));
  ok('Mac: Ctrl+Shift+K does not fire the default',
    !shortcut.matches(key({ ctrlKey: true, shiftKey: true }), 'Mod+Shift+K'));
});

asPlatform('Win32', () => {
  ok('Windows: Ctrl+Shift+K fires the default',
    shortcut.matches(key({ ctrlKey: true, shiftKey: true }), 'Mod+Shift+K'));
  ok('Windows: Cmd+Shift+K does not fire the default',
    !shortcut.matches(key({ metaKey: true, shiftKey: true }), 'Mod+Shift+K'));
});

// The collision that started all this: the default must not fire on the key
// Gmail uses for Insert Link.
asPlatform('MacIntel', () => {
  ok('Cmd+K alone does NOT fire the default shortcut',
    !shortcut.matches(key({ metaKey: true }), 'Mod+Shift+K'));
  ok('Cmd+K fires only when the user has opted into it',
    shortcut.matches(key({ metaKey: true }), 'Mod+K'));
  ok('Cmd+Shift+K does not fire an opted-in Cmd+K binding',
    !shortcut.matches(key({ metaKey: true, shiftKey: true }), 'Mod+K'));

  // Modifiers are exact, not "at least". An extra one is a different chord.
  ok('an extra Alt does not fire it',
    !shortcut.matches(key({ metaKey: true, shiftKey: true, altKey: true }), 'Mod+Shift+K'));
  ok('a bare K never fires it', !shortcut.matches(key(), 'Mod+Shift+K'));
});

// Layout independence. This is the same problem Kiko exists for: on a Hebrew
// or Russian keyboard event.key is not a Latin letter, but event.code is.
asPlatform('MacIntel', () => {
  ok('fires on a non-Latin layout, where key is not "k"',
    shortcut.matches(key({ metaKey: true, shiftKey: true, key: 'ל' }), 'Mod+Shift+K'));
  ok('fires when Alt has rewritten key to a dead character',
    shortcut.matches(key({ altKey: true, key: '˚' }), 'Alt+K'));
});

// Space, which has a code but a single-character key.
asPlatform('Win32', () => {
  ok('Space matches by code',
    shortcut.matches(key({ ctrlKey: true, shiftKey: true, code: 'Space', key: ' ' }),
      'Mod+Shift+Space'));
});

// Display.
asPlatform('MacIntel', () => {
  ok('formats for a Mac', shortcut.format('Mod+Shift+K') === '⌘⇧K');
});
asPlatform('Win32', () => {
  ok('formats for Windows', shortcut.format('Mod+Shift+K') === 'Ctrl+Shift+K');
});

// The recorder in the popup.
ok('records a chord',
  shortcut.fromEvent(key({ metaKey: true, shiftKey: true })) === 'Mod+Shift+K');
ok('refuses a bare letter, which would swallow typing',
  shortcut.fromEvent(key()) === null);

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
