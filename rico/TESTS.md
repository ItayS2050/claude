# TESTS.md — verifying Rico, milestone by milestone

Eight milestones, in build order. Each one is checkable on its own; if a
milestone fails, the ones after it are not worth running yet.

**Setup for every manual check:** load unpacked from `chrome://extensions`,
open <https://mail.google.com>, and keep DevTools open on the Gmail tab
(<kbd>F12</kbd> → Console). Rico logs to `console.debug`, so set the console's
level filter to include **Verbose** or you will see nothing.

**After changing any file:** reload the extension *and* reload the Gmail tab.
A stale content script stays on the page until the tab reloads, and it will
happily contradict the code you just wrote.

Automated tests run first — they cover the parts a click-through cannot reach:

```bash
node test-fuzzy.js && node test-shortcut.js && node test-tokens.js && node test-storage.js
```

---

## 1 — Skeleton and compose detection

- [ ] The extension loads at `chrome://extensions` with **no errors** on the card
- [ ] The service worker says **active** (click *service worker* to open its console)
- [ ] Gmail console logs `[Rico] watching mail.google.com (top frame)` on load
- [ ] Clicking **Compose** logs `[Rico] compose open`
- [ ] Closing that compose window logs `[Rico] compose closed`
- [ ] Opening a **reply** on an existing thread (not a popped-out compose) also logs `compose open`
- [ ] Opening **three** compose windows logs three times, not one
- [ ] Reopening a compose that was already opened once does **not** log twice
      (each box is greeted once)
- [ ] The console shows one or more `(frame)` lines as well as the `(top frame)`
      one — that is `all_frames` working

## 2 — The palette renders, and the shortcut does not collide

**The collision audit comes first.** Do this before trusting anything below.

- [ ] With Rico **disabled**, open a compose and press <kbd>⌘K</kbd> /
      <kbd>Ctrl+K</kbd>. **Expect Gmail's Insert Link dialog.** Record what
      actually happened here: ......................................
- [ ] Re-enable Rico. <kbd>⌘K</kbd> still opens **Insert Link** — Rico has not
      taken it
- [ ] <kbd>⌘⇧K</kbd> / <kbd>Ctrl+Shift+K</kbd> opens the palette
- [ ] The palette opens **over** the compose window, not behind it
- [ ] It looks like itself: Gmail's fonts and spacing have not leaked in
      (that is the shadow root doing its job)
- [ ] Typing filters the list as you type
- [ ] <kbd>↑</kbd> <kbd>↓</kbd> move the selection; it wraps at both ends
- [ ] <kbd>Tab</kbd> / <kbd>⇧Tab</kbd> move it too
- [ ] <kbd>Esc</kbd> closes it
- [ ] Clicking the dimmed backdrop closes it
- [ ] Pressing the shortcut **again** while open closes it
- [ ] Typing letters in the search box does **not** trigger Gmail's own
      single-letter shortcuts (no archive, no compose, no jump to label)
- [ ] The palette opens inside a **reply**, not just a popped-out compose
- [ ] With no compose window open at all, the shortcut does nothing — and
      does not swallow the key

## 3 — Insertion, autosave, and line breaks

- [ ] Type `Hello ` in a compose, then insert a snippet: it lands **at the
      cursor**, not at the top or bottom
- [ ] Put the cursor in the **middle** of existing text and insert: it lands
      mid-sentence, splitting nothing
- [ ] A multi-line snippet keeps its line breaks
- [ ] A snippet with a **blank line** in it keeps the blank line
- [ ] After inserting, wait for Gmail to show **"Draft saved"** in the compose
      window
- [ ] Close the compose, reopen the draft from **Drafts** — the inserted text
      is there. *This is the check that matters most; text on screen that never
      reaches the draft is the failure this milestone exists to catch*
- [ ] Insert twice in a row without clicking anything between: both land, in order
- [ ] Insert into an **empty** compose (no cursor placed yet): text appears
- [ ] Undo (<kbd>⌘Z</kbd>) after an insert behaves — it undoes the insertion
      rather than the whole message

## 4 — Popup CRUD and persistence

- [ ] The toolbar icon opens the manager
- [ ] Three seeded snippets are listed on a fresh install
- [ ] **New snippet** → title + body → **Save** → it appears in the list
- [ ] Clicking a snippet loads it into the editor
- [ ] Editing and saving updates it; the list shows the new title
- [ ] **Delete** removes it, and it is gone from the palette too
- [ ] The search box in the popup filters the list
- [ ] <kbd>⌘S</kbd> saves and <kbd>⌘N</kbd> starts a new snippet
- [ ] Saving with an empty title *and* empty body is refused ("Nothing to save")
- [ ] **Quit Chrome entirely, reopen it** — every snippet is still there
- [ ] A snippet created in the popup is in the palette **without reloading Gmail**
      (the storage listener picked it up)
- [ ] Sign into Chrome on a second machine with sync on — the snippets arrive

## 5 — Variables

- [ ] A snippet containing `{FirstName}`, inserted into a reply to
      **John Doe <john@acme.com>**, produces "John" *(Pro only — on free it
      prompts instead, which is correct)*
- [ ] A recipient with no display name, `jane.smith@acme.com`, produces "Jane"
- [ ] `support@acme.com` produces **no** guess and prompts instead — greeting a
      shared mailbox by name is worse than not greeting it
- [ ] A snippet with `{Company}` shows the inline prompt before inserting
- [ ] Filling the prompt and pressing <kbd>Enter</kbd> inserts with the value in place
- [ ] <kbd>Esc</kbd> in the prompt returns to the list, and inserts nothing
- [ ] **Back** in the prompt returns to the list
- [ ] Two unknown tokens produce two fields, both filled in one go
- [ ] The same token twice in one body is asked about **once** and filled in
      both places
- [ ] Leaving a prompt field empty inserts an empty string, not `{Token}`

## 6 — Free tier and the paywall

Set your ExtensionPay id in `pay.js` first, or these do nothing.

- [ ] With 10 snippets, **New snippet** opens the upgrade modal instead of the editor
- [ ] The modal states **$24, once, not a subscription**
- [ ] The palette footer reads `10/10 · Get unlimited`
- [ ] **Existing snippets still insert normally at the limit** — the gate is on
      creating, never on using
- [ ] **An existing snippet can still be edited and saved at the limit**
- [ ] Deleting one lets you create one again
- [ ] `{FirstName}` prompts on free rather than auto-filling, and the prompt
      says so
- [ ] Completing a test purchase flips the badge to **Pro** without a reload
- [ ] After paying: **restart the browser** — still Pro
- [ ] After paying: go **offline** (DevTools → Network → Offline) and reopen the
      palette — still Pro, and the palette still opens instantly
- [ ] With no network at all on a **free** install, the palette still opens
      with no delay. *Nothing about payment may ever be in the path of the
      keypress*
- [ ] In the service worker console, confirm no ExtensionPay request is made on
      a paid install — `paid` is monotonic and should never be re-checked

## 7 — Import and the onboarding hint

- [ ] On a fresh profile, the **first** compose window shows the hint toast once
- [ ] The hint names the **configured** shortcut, not a hardcoded ⌘⇧K
- [ ] Dismissing it with **×** works
- [ ] It disappears on its own after ~15 seconds
- [ ] It does **not** appear on the second compose, or after a reload
- [ ] Settings → **Import** → paste two blocks separated by a `---` line →
      both import, first line of each as the title
- [ ] Pasting a Rico JSON export imports it
- [ ] Importing past the free limit imports what fits and offers the upgrade
- [ ] Settings → **Export JSON** downloads a file that re-imports cleanly
- [ ] Settings → shortcut → pick <kbd>⌘K</kbd> → reload Gmail → ⌘K now opens
      the palette and Insert Link is gone *(the documented trade)*
- [ ] Switch back to <kbd>⌘⇧K</kbd> → Insert Link works again
- [ ] `chrome://extensions/shortcuts` shows `Alt+Shift+K`, and it opens the palette

## 8 — Polish

- [ ] Total unpacked size is under 150KB (`du -ch` on the packaged files: ~132KB)
- [ ] `./build.sh` produces a zip and all four test files pass
- [ ] No errors in the Gmail console during a full open → search → insert cycle
- [ ] No errors in the service worker console
- [ ] The palette works in **dark mode** (Gmail dark theme + OS dark)
- [ ] It works in Gmail's **compact** density
- [ ] It works in a **popped-out** compose window (the separate browser window)
- [ ] It works with a Gmail account that has **multiple identities** / send-as
- [ ] Insert a snippet containing `<script>`, `&`, and `<b>` — they appear as
      literal characters, in the mail and in the palette preview
- [ ] Insert a 3000-character snippet — no visible delay
- [ ] With 100 snippets, the palette still opens and filters instantly
- [ ] Rico does nothing on a non-Gmail page (check any other site's console)
