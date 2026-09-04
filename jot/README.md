# Jot — quick tasks & voice reminders

A Chrome extension for the thought you need to get out of your head *right now*.
Click the icon (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>), type or
speak the task, press Enter. Jot works out when it is due, files it under the
right day, and reminds you.

## What it does

**Capture in one click.** The popup opens with the cursor already in the box.
Type it, or press the mic and say it — dictation lands in the same box and saves
itself when you stop talking.

**Reads the timing out of the sentence.** You write the way you would tell a
person, and the date comes out of the text:

| You type | You get |
| --- | --- |
| `call mom tomorrow at 5` | tomorrow, 17:00 |
| `pay rent in 20 minutes` | a reminder in 20 minutes |
| `standup every monday 9:30` | repeats weekly |
| `send invoice friday !` | Friday, flagged important |
| `book flights #travel` | tagged `#travel`, no date |
| `לקנות חלב מחר` | tomorrow, 09:00 |

Hebrew, and the words it recognises, are stripped from the title — the task
reads "Call mom", not "call mom tomorrow at 5". A preview under the box shows
what it understood *before* you press Enter, so a wrong guess is never a
surprise.

**Work and personal, sorted for you.** Every task is filed into one of two
lanes by what it says — "send the invoice to acme" is work, "call mom" is
personal, and the switch at the top shows one lane at a time. A coloured dot on
each row says where it went, and hovering it says *why* ("filed under work —
'invoice'"). One click on the dot moves it, and Jot remembers the words: correct
"acme kickoff" once and every future task mentioning acme follows. Anything it
cannot place stays unfiled and visible in **All**, never hidden in a lane.

**Organised without being filed.** Within a lane, tasks group themselves into
Overdue, Today, Tomorrow, This week, Later and No date. Overdue is red, today is
highlighted, `#tags` become filter chips, and the toolbar badge counts what is
due.

**Reminds you.** A Chrome notification at the due time, with **Done** and
**Snooze** on it. Repeating tasks roll to their next occurrence when ticked off
instead of disappearing. Reminders more than twelve hours stale are marked seen
but stay quiet, so reopening Chrome after a weekend does not bury you.

Everything else is where you would expect: click a title to rename it, click the
date to reschedule, hover for the flag and the bin, and every destructive action
gets an undo.

## Privacy

Tasks live in `chrome.storage.local` on your own machine. There is no account,
no server, and no analytics. Dictation uses Chrome's built-in speech
recognition; Jot keeps the text it returns and never stores audio.

## Install from source

1. `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → pick this folder
3. Pin it, and allow the microphone on the welcome page that opens

## Development

```
node test-nlp.js      # the language parser, against a fixed clock
node test-classify.js # the work/personal split, both languages
node test-store.js    # the task model: completion, repeats, grouping, filing
./build.sh            # runs both, then writes dist/jot-<version>.zip
python3 make-icons.py  # regenerates the PNGs
```

`nlp.js` turns a line of text into `{text, due, repeat, priority, tags}` and
`classify.js` decides work or personal from the same text. Both are dependency
-free word-and-regex work — no model, no network — which is what lets the
composer re-run them on every keystroke to show you the guess before you commit
to it. They are the two files worth checking first when something lands in the
wrong day or the wrong lane.
