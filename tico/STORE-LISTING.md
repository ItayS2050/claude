# Chrome Web Store Listing — Tico

Everything the submission form asks for, in the order it asks. Paste each block
into the matching field. Assets are in `store/`, regenerated with
`node make-store-assets.mjs`.

---

## Store listing tab

### Extension name (max 75 — this is 36)
Tico – Quick Tasks & Voice Reminders

### Short description (max 132 — this is 107)
Tell Tico the task — type it or say it. Tico works out when it's due, files it, and brings it back on time.

### Category
Productivity → Workflow & Planning

### Language
English (UK)

### Detailed description

---

**The task you will forget is the one that took too long to write down.**

Tico is a squirrel. You hand it a thought, it stashes it, and it brings it back at exactly the moment you needed it — which is the only job a to-do list has ever really had.

Click the icon — or press Alt+Shift+T from any page — and the box is already waiting with the cursor in it. Type the task, or press the microphone and say it. That's the whole thing.

**Write it the way you'd say it**

Tico reads the timing out of your own sentence and turns it into a real reminder, then takes those words back out of the title so the task reads cleanly:

• "call mom tomorrow at 5" → tomorrow, 17:00
• "pay rent in 20 minutes" → a reminder in 20 minutes
• "standup every monday 9:30" → repeats weekly, forever
• "send invoice friday !" → Friday, flagged important
• "book flights #travel" → tagged, no date

A preview under the box shows exactly what it understood *before* you press Enter, so a wrong guess is something you see rather than something you discover on Thursday.

**Say it instead**

Press the mic, talk, stop. Tico transcribes, works out the date and saves it — you never touch the keyboard. Dictation works in English, Hebrew, Russian and Arabic, and Hebrew tasks are read and displayed right-to-left properly.

**Work and personal, kept apart**

Every task is filed automatically into work or personal by what it says. "Send the invoice to acme" is work. "Call mom" is personal. A coloured dot on every task shows where it went, and hovering it tells you which word decided — because a guess you cannot see the reason for is a guess you stop trusting. One click moves a task, and Tico remembers your correction for next time.

**It learns your clients on its own**

Write "finish campaigns for stream" and the task is filed under Stream. No project picker, no setup, no configuring anything first. Mention a name twice and Tico recognises it everywhere after that — "stream banner sizes" lands in the same place, without the "for". Every client gets its own filter, and a wrong one is removed in a click.

**Reminders that don't quietly vanish**

A notification at the due time with Done and Snooze on it. Repeating tasks roll to their next occurrence when you tick them off instead of disappearing.

And because Chrome can't fire anything while it's closed, reopening after a weekend can mean several reminders are due at once. Tico shows one summary — "5 reminders while you were away", naming them — instead of firing five notifications at you, or worse, silently marking them as seen. Nothing is ever swallowed.

**Organised without you filing anything**

Overdue in red, then Today, Tomorrow, This week, Later, and No date. The toolbar badge counts what's due. Click a title to rename, click the date to reschedule, and every deletion has an undo.

**Everything stays on your computer**

No account. No sign-up. No servers. No analytics. No ads. Your tasks live in local storage on your own machine and Tico has no backend to send them to. A squirrel does not tell anyone where it buried things. Export the lot to a file whenever you want — the import merges, so restoring an old backup never costs you what you've written since.

Optional: on a computer that supports Chrome's built-in AI, you can switch on an on-device assist for spotting client names. It runs inside Chrome, nothing is uploaded, and it's off unless you turn it on.

**Free.**

---

### Homepage URL
https://get-kiko.com/tico/

### Support URL
https://get-kiko.com/tico/support.html

---

## Privacy tab

### Single purpose description
Tico is a task and reminder notepad. Its single purpose is to let the user capture a task — by typing or dictation — and remind them about it at the time they said. Everything else it does (reading the due date out of the wording, sorting tasks by when they are due, grouping them as work or personal, and grouping them by client) serves that one purpose and happens entirely on the user's own device.

### Permission justifications

**storage** — Stores the user's own tasks, due dates and settings on their device so the list survives closing the browser. Nothing is stored anywhere else.

**alarms** — A reminder has to fire at a set time even when no window is focused. A single one-minute repeating alarm wakes the service worker to check whether anything has come due. The extension cannot use timers for this because a Manifest V3 service worker is terminated when idle.

**notifications** — This is how a reminder reaches the user at its due time, with Done and Snooze buttons on it. There is no other way for the extension to tell them.

**contextMenus** — Adds a single "Add to Tico" item to the right-click menu when text is selected, so a task can be captured from a page without opening the popup. It appears only on a text selection and reads only what the user has deliberately selected.

*Note: Tico requests no host permissions at all, and does not declare the microphone as a permission. It cannot read the pages you visit. Dictation asks for the microphone the same way any website does — once, from a normal tab, and only if the user presses the mic button.*

### Are you using remote code?
**No, I am not using remote code.**

Every line Tico runs is in the uploaded package. There is no `eval`, no `new
Function`, no dynamic `import()`, no `importScripts`, no `fetch`, no
`XMLHttpRequest`, no `WebSocket`, and no script or stylesheet loaded from any
URL — the only two script tags in the package point at local files, and the
ES-module imports are all relative paths.

Verified two ways rather than asserted: a grep of every shipped file for those
patterns, and a runtime check that loaded the extension, exercised the whole
product (adding tasks, completing, re-filing, settings, rescheduling, the
welcome page, a full reminder cycle) and logged every network request it made.
Thirteen requests, all `chrome-extension://` — its own packaged files. Zero
external.

Two things a reviewer might reasonably ask about, neither of which is remote
code, because neither fetches or executes code:

- **Dictation** uses `webkitSpeechRecognition`, a browser API. Chrome performs
  the transcription; Tico receives text. No code is downloaded or run.
- **The optional AI assist** uses `LanguageModel`, Chrome's built-in on-device
  model API. Chrome downloads a *model*, not executable code, and only if the
  user turns the feature on. It is off by default.

### Data usage — certifications
- **Personally identifiable information:** Not collected
- **Health information:** Not collected
- **Financial and payment information:** Not collected
- **Authentication information:** Not collected
- **Personal communications:** Not collected
- **Location:** Not collected
- **Web history:** Not collected
- **User activity:** Not collected
- **Website content:** Not collected

Tico transmits nothing off the device, so every category is "not collected".

Tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL
https://get-kiko.com/tico/privacy.html

---

## Assets

| File | Size | Where it is used |
|---|---|---|
| `store/shot1-capture.png` | 1280×800 | Screenshot 1 — natural language capture |
| `store/shot2-list.png` | 1280×800 | Screenshot 2 — the organised list |
| `store/shot3-voice.png` | 1280×800 | Screenshot 3 — dictation |
| `store/shot4-clients.png` | 1280×800 | Screenshot 4 — clients |
| `store/shot5-settings.png` | 1280×800 | Screenshot 5 — privacy and settings |
| `store/promo-small-440x280.png` | 440×280 | Small promo tile (required for search placement) |
| `store/promo-marquee-1400x560.png` | 1400×560 | Marquee tile (only used if featured) |
| `icon128.png` | 128×128 | Store icon |

The product shots are photographs of the real extension, seeded with real tasks
through its own storage — not mockups. Regenerate them after any UI change:

    node make-store-assets.mjs

---

## Before you submit

1. `./build.sh` — runs all four test suites, then writes `dist/tico-<version>.zip`
2. Upload that zip. Do not upload the folder or the repo.
3. Publish `docs/tico-privacy.html` first and check the URL loads — a dead
   privacy policy URL is a rejection.
4. Set visibility to **Public**.

Review normally takes one to three days for an extension with no host
permissions and no microphone permission declared. The thing most likely to
slow it down is the privacy policy, which is why it is spelled out above.

## The character

Tico is a squirrel holding an acorn. The acorn is the user's thought, kept
safe. It is worth protecting that idea in the copy — "stash it", "hand it to
Tico", "it brings it back" — because the phrase a user repeats to a colleague
is what actually spreads a small extension, and no competitor in this category
has one.

The 16px icon is a separate drawing from the 128px one, not a shrink of it
(`brand/mascots.py`, `squirrel_small`). At sixteen pixels a stroke has to be a
fifth of the canvas to read at all, so the small cut has a fatter tail, a
bigger head, and no muzzle or paw. Keep them in sync by eye when either
changes.

## After it is live

The listing cannot be reviewed by you, and asking for reviews in the extension
itself is against policy if it nags. Kiko's approach — a single quiet prompt
after the user has had real value from it — is the pattern to copy, not a
recurring one.
