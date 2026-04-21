# Chrome Web Store Listing — KeyLang

## Extension name
KeyLang – Hebrew ↔ English Layout Detector

## Short description (max 132 chars)
Detects when you type Hebrew in English mode (or vice versa) and offers instant one-click correction. Learns from your feedback.

## Full description (paste this into the store)

---

**Ever typed a whole sentence and realized it came out as gibberish because your keyboard was in the wrong layout?**

KeyLang watches what you type and instantly detects when you're accidentally using the wrong layout — Hebrew characters coming out as English letters, or vice versa. One click converts the text back to what you meant to write.

**How it works**
- Type normally. If KeyLang detects a layout mismatch, a small popup appears with the corrected text.
- Click **Convert** to instantly replace the garbled text with the correct version.
- Click **✗ Not Hebrew** if it was wrong — KeyLang learns from your feedback and won't flag that word again.
- Use **Alt + Shift + K** to manually convert selected text at any time.

**Works everywhere**
Gmail, WhatsApp Web, Slack, Notion, Google Docs, Twitter/X, LinkedIn, any website with a text box.

**Smart detection**
- Learns your personal vocabulary over time
- Silent mode for long typing sessions — shows a discreet recall button instead of interrupting
- Draggable popup — position it wherever you want, it remembers
- Enable/disable with one click from the popup

**100% private**
All processing happens in your browser. No text is ever sent to any server. No accounts required.

---

## Category
Productivity

## Language
English (also supports Hebrew)

## Screenshots needed (1280×800 each)
1. Extension detecting "tbh rumv" and showing "אני רוצה" popup
2. The popup with Convert / Not Hebrew / Dismiss buttons
3. The recall button (small floating indicator)
4. The extension popup showing stats and learned words

## Privacy policy URL
https://keylang.app/privacy  (or host privacy.html anywhere and paste that URL)

---

# SUBMISSION CHECKLIST

## Before you submit:
- [ ] Open generate-icons.html in Chrome → 3 PNGs downloaded to your Downloads folder
- [ ] Move icon16.png, icon48.png, icon128.png into the keylang/ folder
- [ ] Take screenshots of the extension working (1280×800)
- [ ] Host privacy.html somewhere (GitHub Pages is free — see below)
- [ ] Zip the keylang/ folder (exclude generate-icons.html and this file)

## Quick way to host privacy policy free (GitHub Pages):
1. Create a GitHub repo called "keylang-site"
2. Upload privacy.html as index.html in a /privacy folder
3. Enable GitHub Pages in repo settings
4. Your URL becomes: https://yourusername.github.io/keylang-site/privacy

## Submit:
1. Go to https://chrome.google.com/webstore/devconsole
2. Pay $5 one-time developer registration
3. Click "New Item" → upload your ZIP
4. Fill in the listing using the copy above
5. Add your privacy policy URL
6. Submit for review → typically 1–3 business days

---

# FUTURE PAID TIER PLAN ($5/month Pro)

## What's free forever:
- Full detection (Hebrew ↔ English)
- Personal learning (your own word lists)
- All current features

## What Pro adds (build when you have 500+ free users):
- **Cloud sync** — learned words follow you across devices/browsers
- **Collective learning** — benefits from thousands of users' feedback (community blocklist auto-updated weekly)
- **More language pairs** — Russian ↔ English, Arabic ↔ Hebrew, etc.
- **Team mode** — shared word lists for companies with Hebrew-English employees
- **Priority support**

## How to gate Pro features:
- Backend: Supabase (free tier) + Cloudflare Workers (free tier)
- Auth: Supabase Auth (email/password or Google login)
- Payment: Stripe Checkout (simplest) or Lemon Squeezy
- Extension checks license key stored in chrome.storage.sync
- Gate Pro features behind: `if (license.valid && license.tier === 'pro')`

## Pricing psychology:
- $5/month is an impulse buy for professionals
- Position as: "less than one coffee, fixes a daily annoyance"
- Annual option: $40/year (saves $20 → feels like a deal)
- Target: Hebrew-speaking tech workers, journalists, customer service teams
