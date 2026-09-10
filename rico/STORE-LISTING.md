# Chrome Web Store listing — draft

## Title (45 chars max on the store card)

```
Rico — Gmail Canned Responses & Templates
```

*(41 characters. The shortcut used to be in the title; it came out because the
title truncates on mobile and "Rico — Gmail Canned Res…" is a worse first
impression than losing the keystroke, which the first line of the description
covers anyway.)*

## Short description (132 chars max — this is `description` in the manifest)

```
A command palette for your Gmail templates. Press a key, search, hit Enter. Your snippet lands at the cursor in two seconds.
```

*(124 characters.)*

## Full description

```
Rico was a border collie who knew two hundred words. Tell him the name of a
thing and he came back with the right one.

This does that with your email templates.

Gmail's Templates feature is three clicks deep in a menu and shows you a flat
list. Past ten templates you stop being able to find the one you want. Past
twenty, you stop using the feature. Rico is a search box for them.

Press Cmd+Shift+K (Ctrl+Shift+K on Windows) inside any Gmail compose window.
Type a few letters. Press Enter. The snippet lands where your cursor was.
About two seconds, no mouse, no menu.


HOW IT WORKS

• Fuzzy search — type "fu" to find "Follow up". Rico searches the text of your
  snippets too, so you can find the one whose name you have forgotten.
• Arrow keys and Enter. Esc to back out. Your hands stay where they were.
• {FirstName} fills itself from whoever is in the To: field.
• Any other {Token} — {Company}, {Date}, whatever you invent — asks you to
  fill it before inserting.
• Line breaks and paragraphs come through intact, and Gmail's autosave picks
  the text up like you typed it.


PRICING — PLEASE READ BEFORE INSTALLING

Free forever:
• 10 snippets
• The full palette, search, and keyboard navigation
• Manual variable fill

Rico Pro — $24, paid once. Not a subscription:
• Unlimited snippets
• {FirstName} fills automatically from the To: field
• Snippet folders
• Import and export as JSON

You pay once and that is the end of it. No monthly charge, no renewal, no
card on file with us — payments run through ExtensionPay and no card details
ever touch the extension.

The free tier limits how many snippets you can CREATE. It never limits using
the ones you have. If you are sitting on forty snippets from before, all forty
keep working.


PRIVACY

Rico has no server, no account, and no analytics. Your snippets are stored in
your own browser and synced by Chrome's own sync if you have it turned on.
Nothing you write is sent anywhere — not to us, not to anyone. The only
permission Rico asks for is storage.


WHAT RICO DOES NOT DO

It works on Gmail. Not Outlook, not Superhuman, not LinkedIn. It does not
generate text with AI, does not share snippets with a team, and does not read
your mail. One thing, done quickly.


A NOTE ON THE SHORTCUT

Cmd+K is already Gmail's Insert Link shortcut, and Chrome reserves it for the
address bar — so Rico stays off it by default and uses Cmd+Shift+K instead.
If you never insert links, you can switch Rico to Cmd+K in Settings. The
shortcut is yours to choose either way.
```

## Category

Productivity

## The mascot, for whoever writes the next listing

Rico 🐕 is a border collie carrying an envelope, and he is one of three: Kiko 🦜
the parrot says back what you meant in the right tongue, Tico 🐿️ the squirrel
stashes a thought and returns it later, Rico fetches. Same tile, same white
silhouette, same single amber accent for the thing being carried — Tico's acorn
is Rico's envelope. Keep that if the listing art is ever redone.

## Permission justifications (the review form asks for each one)

**`storage`** — Snippets and settings are saved in the user's browser using
`chrome.storage`. This is the only place Rico keeps data; there is no server.

**Host permission `https://extensionpay.com/*`** — Required by ExtensionPay,
the payment processor, to check whether the user has purchased Pro. No user
content is sent; the request returns a paid/unpaid flag only.

**Content script on `https://mail.google.com/*`** — Rico's entire function is
inserting saved text into a Gmail compose window. It reads the compose box to
find the cursor position and reads the To: field to fill `{FirstName}`. Nothing
read from the page is transmitted anywhere.

**Limited Use disclosure** — Rico accesses the content of a compose window in
order to insert the user's own saved text at the cursor. It does not collect,
transmit, or store message content. All processing happens locally in the
browser.

---

## Screenshots (1280×800, five of them)

1. **The palette open over a Gmail reply.** The hero shot — search box with
   "fu" typed, "Follow up" highlighted at the top of a list of eight, the
   compose window visible behind it. This is the one that has to sell the
   product on its own; most people never read past it.
2. **Before and after, side by side.** Gmail's Templates menu three levels
   deep on the left, Rico's palette on the right. Caption: *Three clicks and a
   flat list, or two seconds.*
3. **The variable prompt.** A snippet with `{Company}` mid-insert, the inline
   field waiting. Caption: *{FirstName} fills itself. Anything else, Rico asks.*
4. **The snippet manager.** The popup with a dozen snippets in the sidebar and
   one open in the editor. Shows this is a real tool and not a toy.
5. **The pricing card.** The upgrade modal, plainly: $24 once, not a
   subscription, and the line about existing snippets always working. Putting
   the price in a screenshot rather than only in the text is worth the slot —
   it is the objection people have before they install.

## Demo GIF (10 seconds, loops, no audio)

`[ 0.0s ]` A Gmail reply, cursor in the body, two words typed
`[ 1.0s ]` Keystroke overlay: **⌘⇧K** — the palette appears
`[ 2.0s ]` Three letters typed, the list narrows to one
`[ 3.5s ]` **Enter** — the snippet drops in, line breaks and all
`[ 5.0s ]` Beat on "Draft saved" appearing in the corner
`[ 6.0s ]` Second insert, a snippet with `{FirstName}` — it fills with the
           recipient's name without a prompt
`[ 8.5s ]` Hold on the finished mail
`[10.0s ]` Loop

*Keep the keystroke overlay on screen for the whole GIF. The product is a
keyboard shortcut; a GIF of text appearing with no visible cause looks like
autocomplete.*

---

## Pre-submission checklist

- [ ] `pay.js` has the real ExtensionPay id, not the placeholder (`build.sh`
      refuses to package otherwise)
- [ ] Privacy policy page is live and its URL is in the listing
- [ ] The free/Pro split in the description matches what the code actually
      enforces — 10 snippets, gate on creation only
- [ ] Single purpose statement: *inserting the user's saved text into a Gmail
      compose window*
- [ ] Screenshots are 1280×800 and contain no real recipient names or addresses
- [ ] Expect a slower review than usual: a content script on mail.google.com
      puts Rico under the Limited Use policy
