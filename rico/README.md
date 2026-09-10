# Rico — Gmail canned responses, on a keyboard shortcut

*A search box for the snippets you already have.*

Gmail's Templates feature is three clicks deep in a menu and shows you a flat
list. Past about ten templates you stop being able to find anything, and past
twenty you stop using the feature. Rico puts a command palette over the compose
window: press a key, type a few letters, press Enter, and the snippet lands
where your cursor was.

It is a Chrome extension. It works on Gmail and nothing else, deliberately.
Nothing leaves your browser — no account, no server, no analytics.

---

## Local dev setup

```bash
git clone <this repo>
```

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose the `rico/` folder
4. Open <https://mail.google.com> and start a reply
5. Press <kbd>⌘⇧K</kbd> (Mac) or <kbd>Ctrl+Shift+K</kbd> (Windows/Linux)

Three example snippets are seeded on install, so the palette has something in
it the first time you open it.

After changing any file, hit the reload arrow on the Rico card in
`chrome://extensions`, then **reload the Gmail tab** — content scripts are
injected at page load and a stale one stays on the page until you do.

### Running the tests

```bash
node test-fuzzy.js       # ranking
node test-shortcut.js    # the collision rules
node test-tokens.js      # {FirstName} guessing
node test-storage.js     # the free-tier gate and the sync-quota fallback
node test-repeats.js     # what counts as a repeat worth mentioning
```

They are plain Node scripts with no dependencies. `./build.sh` runs all five
and refuses to package if any of them fail.

### Packaging

```bash
./build.sh     # -> dist/rico-1.0.0.zip
```

**It will refuse to build until you set your ExtensionPay id** — see below.
That is deliberate: the placeholder id routes every purchase nowhere, silently,
and finding that out after launch is worse than finding out now.

---

## Why the shortcut is not ⌘K

It was going to be. It cannot be, for two separate reasons:

| Collision | Where | What happens |
| --- | --- | --- |
| Gmail's **Insert Link** | The compose editor's own handler | Taking ⌘K means the user loses Insert Link |
| Chrome's **omnibox search** | The browser | `chrome.commands` cannot bind ⌘K at all |

The two behave differently and it matters. An in-page `keydown` listener *does*
receive ⌘K — Gmail's own link shortcut is proof — so a content script can
intercept it. It just costs the user a Gmail feature they did not agree to give
up. The `chrome.commands` global binding is the harder no: Chrome reserves the
combo and a manifest entry claiming it silently never fires.

So the default is <kbd>⌘⇧K</kbd>, which collides with nothing, and ⌘K is
offered in Settings for people who never insert links — labelled with what it
costs. `Alt+Shift+K` is registered as a `chrome.commands` backstop for the case
where something shadows the in-page listener; change it at
`chrome://extensions/shortcuts`.

---

## Wiring up payments

Pro is **$24 paid once**, not a subscription, through
[ExtensionPay](https://extensionpay.com). No card details ever reach the
extension.

1. Register the extension at <https://extensionpay.com> and create a **one-time
   payment** plan at $24.
2. Put the id you were given into `pay.js`:
   ```js
   const EXTENSION_ID = 'your-id-here';
   ```
3. `ExtPay.js` is vendored in this repo. Update it from
   <https://github.com/Glench/ExtPay> when they ship a new version.

The one-time model is why `pay.js` is as short as it is. A subscription can
lapse, so it has to be re-checked forever; a purchase cannot un-happen. Once
`paid` is true Rico caches it and **stops calling the network entirely** — no
expiry, no re-validation, and no chance of a paid user losing their features on
a plane.

The free tier gates **creating** a snippet, never using one. Someone sitting on
forty snippets keeps all forty in the palette whatever the paid state says.
Locking people out of their own writing is not a sales tactic.

---

## How it fits together

| File | What it owns |
| --- | --- |
| `selectors.js` | **Every Gmail DOM selector.** When Gmail changes, this is the file to patch |
| `content.js` | Compose detection, the keydown listener, the first-run hint |
| `palette.js` | The overlay, in a shadow root, including the token prompt |
| `insert.js` | Getting text into the compose box so Gmail's autosave notices |
| `fuzzy.js` | Search and ranking |
| `repeats.js` | Spotting a paragraph written twice. Hashes only, never text |
| `suggest.js` | The card that offers to save it |
| `tokens.js` | `{Token}` parsing and the `{FirstName}` guess |
| `storage.js` | Snippets, settings, the free-tier gate, the sync-quota fallback |
| `pay.js` | Paid state. Lives in the service worker; everyone else asks by message |
| `background.js` | Service worker: first run, the commands backstop, message routing |
| `popup.*` | The snippet manager |

### The three decisions worth knowing about

**Gmail's DOM is borrowed, not owned.** Every selector lives in `selectors.js`
so a Gmail redesign is a one-file patch. Semantic attributes are listed ahead of
obfuscated class names in each selector, so a class rename should be absorbed
before anyone notices.

**The palette may not await anything.** Snippets, settings and paid state are
held in memory in the content script and refreshed in the background. Two
seconds is the entire product claim, and a storage round-trip on the keypress
would spend a visible slice of it.

**Repeat detection stores hashes, never text.** Rico's claim is that it does
not keep your mail, and noticing "you have written this before" must not quietly
undo that. What is recorded per sent paragraph is a 32-bit FNV-1a hash and a
count — enough to recognise a repeat, useless for reconstructing anything. The
old copy of the text is never needed, because when a repeat fires the text is
already in the compose window. Signatures and quoted threads are stripped before
anything is hashed, or every reply would look like a repeat of the last one.

**Insertion goes through `execCommand`.** It is deprecated and it is still the
only call that mutates a contenteditable through the browser's own editing
pipeline. Setting `innerHTML` puts the text on screen and leaves Gmail's draft
model untouched — the mail looks written, the draft saves without it, and the
user finds out after sending. Line breaks are driven explicitly with
`insertLineBreak` rather than passing `\n` to `insertText`, which is not
consistent across contenteditable configurations.

---

## Not in v1, on purpose

Cloud sync, accounts, team sharing, AI generation, analytics, other mail
clients, LinkedIn. One thing, small and fast.

## Known limits

- **Gmail templates cannot be read programmatically.** They live in the user's
  mail settings, where no extension can reach. Import is a bulk paste, which
  makes it one paste instead of eleven.
- **A compose box in a very small iframe.** The palette renders into the
  document that owns the compose box; when that frame is too short to hold the
  palette, it renders in the top document instead. A cross-origin frame too
  small for the palette would be clipped — not seen in practice, listed here
  because it is the shape of the bug if one appears.
