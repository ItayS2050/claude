# Chrome Web Store Listing — Kiko v4.4.1

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

**Free for 30 days. Then $5/month.**

---

## Category
Productivity

## Language
English

## Privacy policy URL
`https://get-kiko.com/privacy.html` — live.

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

## Run the tests first
`node test-detection.js` from the `keylang/` folder. 38 assertions covering all
six languages, the two-word minimum, false positives on natural English, and
per-language gating. Every case is there because something was actually broken.

## Build the package
Run `./build.sh` from the `keylang/` folder. It produces `dist/kiko-4.4.1.zip`
containing only the files the extension actually needs — dev files, mockups and
marketing pages are excluded.

Do **not** zip the folder by hand: it would ship `test.html`, the screenshot and
promo mockups, and this file.

## Before you submit
- [ ] `./build.sh` run, `dist/kiko-4.4.1.zip` exists
- [x] Privacy policy live at https://get-kiko.com/privacy.html
- [ ] Screenshots ready — 1280×800, between 1 and 5 of them
- [ ] Version in `manifest.json` (4.4.1) is higher than the published one

## Hosting the site + privacy policy (GitHub Pages)
The website now lives in `docs/` at the repo root — landing page plus the three
legal pages. To publish:

1. Settings → Pages → Source: `main` branch, `/docs` folder → Save
2. Wait ~1 min. Privacy URL becomes:
   `https://itays2050.github.io/claude/privacy.html`
3. Paste that into the Chrome listing. Done — no domain required.

### Domain (get-kiko.com) — do these in order
DNS **first**, then Pages. Enabling Pages while the CNAME points at a domain
that does not resolve takes the site offline, privacy policy included.

1. At the registrar, four A records on the apex:
   `185.199.108.153` · `185.199.109.153` · `185.199.110.153` · `185.199.111.153`
   plus a CNAME for `www` → `itays2050.github.io`
2. Wait for it to resolve (`dig get-kiko.com` returns those IPs)
3. Settings → Pages → Source `main` / `/docs`, Custom domain `get-kiko.com`,
   tick Enforce HTTPS
4. Create a **`hello@get-kiko.com` forwarder** at the registrar. That address is
   on every legal page and Chrome reviewers use it — it must receive mail.

Stuck on DNS and need the privacy URL today? Delete `docs/CNAME`, enable Pages,
and the site serves instantly at `https://itays2050.github.io/claude/`.

### Two placeholders to fill after publishing
- `docs/index.html` — `WEBSTORE_URL` at the bottom of the file. Kiko is already
  published, so the ID exists now: copy it from the dashboard URL and paste the
  full store link in. Every "Add to Chrome" button reads from that one constant.
- Pro and Team both point at mailto: links. There is no checkout yet, and no
  payment code in the extension — see the paid tier section below.

## Submit — this is an UPDATE, not a new item
Kiko is already published and has users. Do not create a new item: a new item
gets a new extension ID, and every existing install stays on the old one.

1. https://chrome.google.com/webstore/devconsole → open the **existing Kiko item**
2. Package → **Upload new package** → `dist/kiko-4.4.1.zip`
   (4.4.1 must be higher than the published version, or it is rejected)
3. Store listing tab → replace description, summary and screenshots
4. Privacy tab → single purpose, the permission justifications, data usage none,
   privacy URL `https://get-kiko.com/privacy.html`
5. Distribution → tick **contains in-app purchases** (the site sells a
   subscription; over-declaring is safe, under-declaring is the violation)
6. Submit → 1–3 business days

Existing users get 4.4.1 automatically once it is approved.

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

**1. Package** — upload `dist/kiko-4.4.1.zip` first; the version is read from it.

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
- Pricing: Free to install. **Declare in-app purchases** — the site now advertises
  a 30-day trial then $5/month, so the listing must say so or it contradicts
  your own terms. Do not submit as "no in-app purchases" while the website
  sells a subscription.

**5. Submit for review** — usually 1–3 business days. Broad host permissions
(`<all_urls>`) push it toward the longer end.

---

# PAYMENTS (built in 4.5.0, not yet live)

Lemon Squeezy, chosen because its licence keys are a built-in feature: the
per-key **activation limit is the seat count**, so the 5-seat team plan needs no
code of ours. Their licence endpoints take no API key and are meant to be called
from a client, so there is no server in the loop.

## Ship 4.4.1 first
4.4.1 has no payment code and declares no data collection — submit that today.
4.5.0 cannot ship until the Lemon Squeezy product exists, because the checkout
URL is still a placeholder.

## What you set up in Lemon Squeezy
1. Store → verify the account (needs the live site, which get-kiko.com now is)
2. Product **Kiko Individual** — $5/month subscription, **no trial in Lemon Squeezy**
   - Enable **licence keys**, activation limit **1**
   - The extension owns the 30-day trial and takes no card for it. Configuring a
     trial here too would stack them: someone subscribing on day 5 would get 30
     more free days. Charge immediately at checkout.
3. Product **Kiko Team** — $36/seat/year
   - Enable **licence keys**, activation limit = seats sold (minimum 5)
4. Copy each checkout URL

## Then two constants, same value
- `docs/index.html` → `CHECKOUT_URL`
- `keylang/popup.js` → `CHECKOUT_URL`

## What to tell Lemon Squeezy at verification
Product description, when they ask when you charge:

> Kiko is a browser extension that detects when someone has typed with the wrong
> keyboard layout active — Hebrew, Russian, Ukrainian, Korean, Greek or Arabic
> typed while the keyboard was in English, or the reverse — and corrects the text
> in one click. We sell it as a $5/month subscription, plus a $36/seat/year team
> plan, through our website get-kiko.com and the Chrome Web Store; customers use
> it free for 30 days without entering any payment details, and are charged
> immediately at checkout when they choose to subscribe.

## What the extension does
- Trial is 30 days from the `firstInstall` stamp. That stamp is written on
  update too, so the users you have today start their 30 days when 4.4.1
  reaches them, not retroactively from whenever they installed.
- `background.js` owns entitlement and writes it to storage; content.js and the
  popup only read it, so there is no second copy of the logic.
- A stored key is re-validated at most once a day. If the check fails, the last
  good result stands for seven days — an outage must never lock out someone who
  has paid.
- The gate fails **open**: if the service worker has not run or storage is
  unreadable, detection stays on.
- No new permissions. The API host is already covered by `<all_urls>` — adding a
  host permission would disable the extension for every existing user until they
  re-approved it.

## Store listing changes for 4.5.0
- Data usage: tick **Authentication information** (the licence key is sent to
  Lemon Squeezy). Nothing else changes — no text is ever transmitted.
- Remote code: still **No**. A licence check is data, not code.
- In-app purchases: yes.

## Still missing
Nothing tells a trial user how long they have except the popup. Consider a
one-time toast at day 25.
