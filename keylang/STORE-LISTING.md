# Chrome Web Store Listing — Kiko v4.4.0

## Extension name
Kiko – Multilingual Keyboard Layout Fixer

## Short description (max 132 chars — 130 chars)
Wrong keyboard layout? Kiko catches Hebrew, Russian, Ukrainian, Korean, Greek & Arabic typing mix-ups and fixes them in one click.

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

## Hosting the site + privacy policy (GitHub Pages)
The website now lives in `docs/` at the repo root — landing page plus the three
legal pages. To publish:

1. Settings → Pages → Source: `main` branch, `/docs` folder → Save
2. Wait ~1 min. Privacy URL becomes:
   `https://itays2050.github.io/claude/privacy.html`
3. Paste that into the Chrome listing. Done — no domain required.

### Once get-kiko.com is bought
1. Create `docs/CNAME` containing exactly `get-kiko.com`
2. At the registrar, point the apex at GitHub Pages with four A records:
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   (and a CNAME for `www` → `itays2050.github.io`)
3. Settings → Pages → Custom domain → `get-kiko.com` → Enforce HTTPS
4. Swap `homepage_url` in `manifest.json` to `https://get-kiko.com`
5. Set up a `hello@get-kiko.com` forwarder and replace `itay@selltech.io`
   across `docs/*.html`

Do **not** add the CNAME before the domain resolves — Pages will redirect the
github.io URL to a dead domain and take your privacy policy offline with it.

### Two placeholders to fill after publishing
- `docs/index.html` — `WEBSTORE_URL` at the bottom of the file. The extension ID
  only exists once the store accepts the package; every "Add to Chrome" button
  reads from that one constant.
- Pro and Team both point at mailto: links. There is no checkout yet, and no
  payment code in the extension — see the paid tier section below.

## Submit
1. https://chrome.google.com/webstore/devconsole
2. $5 one-time developer registration (first submission only)
3. New Item → upload the ZIP
4. Paste the listing copy above
5. Paste the permission justifications above into the privacy practices tab
6. Submit → review usually takes 1–3 business days, longer for broad host permissions

---

# STORE ASSETS

All generated — run `python3 make-store-assets.py` to rebuild after any UI change.
Output lands in `store/`. The wrong-layout text in each shot was produced by the
extension's own converters, so it is exactly what Kiko would show.

| File | Size | Use |
|---|---|---|
| `store/shot1-hebrew.png` | 1280×800 | Screenshot 1 — the hero, shown in search results |
| `store/shot2-korean.png` | 1280×800 | Screenshot 2 |
| `store/shot3-russian.png` | 1280×800 | Screenshot 3 |
| `store/shot4-popup.png` | 1280×800 | Screenshot 4 — language toggles |
| `store/shot5-languages.png` | 1280×800 | Screenshot 5 — all six pairs |
| `store/promo-small-440x280.png` | 440×280 | Small promo tile (optional) |
| `store/promo-marquee-1400x560.png` | 1400×560 | Marquee tile (optional, needed for featuring) |

Upload the screenshots in that order — the first is the one people see before
they click through.

---

# FILL THE FORM IN THIS ORDER

The dashboard splits the listing across four tabs. Everything you need is above.

**1. Package** — upload `dist/kiko-4.4.0.zip` first; the version is read from it.

**2. Store listing tab**
- Title: `Kiko – Multilingual Keyboard Layout Fixer`
- Summary: the short description above (130 chars, under the 132 limit)
- Description: the full description above
- Category: Productivity
- Language: English
- Screenshots: the five above, in order
- Promo tiles: the two above (skip unless you want to be featureable)

**3. Privacy tab** — the one that holds up reviews
- Single purpose: *"Detect and correct keyboard-layout mistakes in text fields."*
- A justification for **every** permission — copy them from the section above
- Data usage: tick nothing. Kiko collects no user data
- Certify the disclosures are accurate
- Privacy policy URL — required, must be publicly reachable

**4. Distribution tab**
- Visibility: Public
- Regions: all
- Pricing: Free, no in-app purchases (there is no payment code in this build)

**5. Submit for review** — usually 1–3 business days. Broad host permissions
(`<all_urls>`) push it toward the longer end.

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
