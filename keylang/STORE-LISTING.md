# Chrome Web Store Listing — Kiko v4.4.0

## Extension name
Kiko – Multilingual Keyboard Layout Fixer

## Short description (max 132 chars — 128 chars)
Typed in the wrong keyboard layout? Kiko catches Hebrew, Russian, Ukrainian, Korean, Greek & Arabic mix-ups and fixes them.

## Full description (paste this into the store)

---

**You meant to type שלום. You got akuo.**

It happens to everyone who types in two languages. You switch tabs, start typing, and only notice three sentences later that the keyboard was in the wrong layout. Then you delete it all and start again.

Kiko 🦜 watches for exactly that moment. The instant your text stops making sense in one layout and starts making sense in another, a small notification appears with the corrected version. One click and it's fixed — in place, in whatever field you were typing in.

**Six languages, both directions**

- **Hebrew ↔ English** — akuo → שלום
- **Russian ↔ English** — ghbdtn → привет
- **Ukrainian ↔ English** — ghbdsn → привіт
- **Korean ↔ English** — dkssud → 안녕
- **Greek ↔ English** — geia → γεια
- **Arabic ↔ English** — lvpfh → مرحبا

It works the other way too. Typed English while your keyboard was still in Hebrew, Russian, Korean or Greek? Kiko reads the gibberish and turns it back into English.

**It learns your words**

Kiko is not a dictionary lookup — it scores every word against the letter patterns of each language, so it catches words no word list would contain. When it does get one wrong, click "Not Hebrew" (or Not Russian, Not Korean…) and it will never flag that word again. The more you use it, the quieter it gets.

**Built to stay out of your way**

- Enable only the languages you actually type — the rest never run
- Long typing sessions collapse to a small recall bubble instead of a popup
- Drag the notification anywhere on screen; it remembers where you put it
- Turn Kiko off for a specific site with one click
- Optional sound alert when a mistake is caught
- **Alt + Shift + K** — scan the current field, or convert whatever text you've selected

**Everything stays on your machine**

No account. No sign-up. No servers. Every conversion runs inside your browser, and your learned word lists live in local storage and never leave your device. Kiko has no backend to send anything to.

**Free to use.**

---

## Category
Productivity

## Language
English

## Privacy policy URL
Required before submission. Host `privacy.html` publicly and paste the URL here.
(See "Hosting the privacy policy" below.)

---

# PERMISSION JUSTIFICATIONS

Chrome asks for a written reason for each permission. Reviews get rejected or
delayed when these are vague — the text below is what to paste in.

**host_permissions `<all_urls>` / broad host access**
> Kiko corrects keyboard-layout mistakes in text fields on any website the user types in — email, chat, search, forms, admin panels. There is no fixed list of sites where a user might mistype, so the extension must be able to read and correct the text field the user is actively typing in on any origin. No page content is collected, stored, or transmitted; text is analysed in memory and discarded.

**`scripting`**
> Used to re-inject the content script into already-open tabs after the extension updates, so users do not have to reload every tab for the fix to keep working.

**`storage`**
> Stores the user's own settings (which languages are enabled, sound on/off, notification position, per-site disables) and the word lists Kiko learns from their feedback. All of it is `chrome.storage.local` — local to the device.

**`contextMenus`**
> Adds a single "Fix with Kiko" item to the right-click menu so users can convert selected text on demand.

**`offscreen`**
> Plays the optional detection sound. Chrome's autoplay policy blocks AudioContext in content scripts, so an offscreen document is required.

**`activeTab`**
> Lets the toolbar popup show whether Kiko is enabled for the current site.

**Remote code:** None. All code ships in the package. No external scripts, no `eval`, no remote configuration.

---

# SUBMISSION CHECKLIST

## Build the package
Run `./build.sh` from the `keylang/` folder. It produces `dist/kiko-4.4.0.zip`
containing only the files the extension actually needs — dev files, mockups and
marketing pages are excluded.

Do **not** zip the folder by hand: it would ship `test.html`, the screenshot and
promo mockups, and this file.

## Before you submit
- [ ] `./build.sh` run, `dist/kiko-4.4.0.zip` exists
- [ ] Privacy policy hosted, URL copied
- [ ] Screenshots ready — 1280×800, between 1 and 5 of them
- [ ] Version in `manifest.json` is higher than the currently published one

## Hosting the privacy policy free (GitHub Pages)
1. In this repo, create a `docs/` folder
2. Copy `privacy.html`, `terms.html` and `refund.html` into it
3. Settings → Pages → Source: `main` branch, `/docs` folder
4. URL becomes `https://itays2050.github.io/claude/privacy.html`

## Submit
1. https://chrome.google.com/webstore/devconsole
2. $5 one-time developer registration (first submission only)
3. New Item → upload the ZIP
4. Paste the listing copy above
5. Paste the permission justifications above into the privacy practices tab
6. Submit → review usually takes 1–3 business days, longer for broad host permissions

---

# SCREENSHOTS

Existing mockups in this folder (`store-screenshot*.html`) render at 1280×800 and
render to PNG with the same names. They currently show **Hebrew only** and the old
"Not Hebrew" button label — worth refreshing to show the six-language lineup before
submitting, since the listing now leads with all six.

Suggested set:
1. Detection toast catching a Hebrew mistake mid-sentence
2. The same for Korean or Russian — shows it is genuinely multilingual
3. The popup: stats, language toggles, learned word lists
4. The recall bubble during a long typing session

---

# PAID TIER PLAN (not built yet)

There is currently **no payment code in the extension** and nothing is gated.
`terms.html` and `refund.html` describe the $5/month plan as something that may
be introduced later, which is what makes them accurate against a free listing.
Before charging, all three of these need to happen together:

- Payment + license check actually implemented in the extension
- `terms.html` section 3 switched from "may introduce" to the active wording
- Store listing updated to declare in-app purchases

## Free forever
- Detection and correction for all six language pairs
- Personal learned-word lists
- Every feature currently in the extension

## What Pro could add (build at 500+ active users)
- **Cloud sync** — learned words follow you across devices and browsers
- **Collective learning** — benefit from other users' corrections
- **Team mode** — shared word lists for companies
- **Priority support**
