# Rico — Gmail Canned Response Command Palette

*Builder prompt, v2.*

> **Revision note (v2).** Two things changed from v1, both because v1 would have
> shipped a bug and a pricing model that fights the market:
>
> 1. **The shortcut is no longer Cmd+K by default.** Cmd/Ctrl+K is already
>    Gmail's *Insert Link* shortcut inside compose, and Chrome itself reserves
>    Ctrl/Cmd+K for omnibox search. See **Keyboard trigger** below — this is
>    now a verify-first task in Milestone 2, not an assumption.
> 2. **Pro is a one-time purchase, not a subscription.** $24 once, not $2.99/mo.
>    Rico has no servers and no recurring costs, so there is nothing to fund
>    with recurring revenue — and a one-time unlock converts better on a small
>    utility, has no churn, and needs no subscription-state handling. See
>    **Monetization**.
>
> Everything else from v1 stands.

---

## What it does

Inside Gmail's compose/reply window, a keyboard shortcut opens a small command
palette overlay where the user fuzzy-searches saved snippets/templates,
navigates with arrow keys, and hits Enter to insert the snippet at the cursor
position in ~2 seconds. Snippets support dynamic variables like `{FirstName}`.

This replaces Gmail's buried 3-click Templates menu for people who send 30–50
repetitive emails daily.

**The palette is the product.** Not the snippet storage — every competitor has
snippet storage, and most give away more of it than we do. What Rico sells is
*finding the right snippet out of fifty without remembering its name*. Fuzzy
search over titles **and** bodies, arrow keys, Enter, done. Build and pitch
around that.

---

## Keyboard trigger

**Verify before writing palette code (Milestone 2, task 1):** open a Gmail
compose window and press Cmd+K (Mac) / Ctrl+K (Windows). Expect Gmail's
*Insert Link* dialog to open. Confirm this and record the result in TESTS.md.

Two separate collisions exist:

| Collision | Where | Consequence |
| --- | --- | --- |
| Gmail *Insert Link* | The compose editor's own handler | Binding Cmd+K takes link insertion away from the user |
| Chrome omnibox search | Browser level | `chrome.commands` **cannot** bind Ctrl/Cmd+K at all |

Note the asymmetry: an in-page `keydown` listener *does* receive Ctrl/Cmd+K
(Gmail's own link shortcut proves the page gets it), so intercepting it in a
content script is technically possible — it just costs the user a Gmail
feature. The `chrome.commands` global fallback is a hard no on that combo.

**Therefore:**

* **Default trigger: `Cmd+Shift+K` / `Ctrl+Shift+K`.** No Gmail collision, no
  Chrome reservation, still one-handed and adjacent to the muscle memory of
  every other cmd+K palette.
* **Make it configurable in the popup**, with a short list of safe presets plus
  a "record a shortcut" field. Offer plain `Cmd+K` as an explicit opt-in,
  labelled with what it costs: *"Overrides Gmail's Insert Link shortcut."*
  Users who never insert links will take that trade happily — but they must
  choose it, not discover it.
* **Whichever combo is active, call `preventDefault()` and
  `stopImmediatePropagation()` at capture phase** so Gmail's handler never
  sees it, and register the listener on the compose iframe's document, not
  just the top frame.
* **`chrome.commands` fallback**: register a *different* combo (suggest
  `Alt+Shift+K`) that routes to the focused frame, for the case where the
  content script's listener is shadowed. Do not attempt to register the
  primary combo here; Chrome will reject or silently override it.
* **Escape closes the palette** and returns focus to the compose body at the
  prior cursor position.

---

## Monetization

**Freemium with a one-time unlock, managed by ExtensionPay.** No credit card
data ever touches the extension.

**Free tier:** 10 snippets, the full palette, manual variable fill.

**Pro — $24, paid once, forever:** unlimited snippets, auto-fill of
`{FirstName}` from the recipient in the To: field, snippet folders, JSON
import/export.

*(Optional, if you want launch urgency: $19 for the first 100 buyers, then $24.
ExtensionPay supports this with a second one-time plan — but only do it if you
will actually honour the cutoff.)*

Creating snippet #11 as a free user triggers the ExtensionPay upgrade modal.

**Why one-time and not $2.99/mo:**

* Rico has no backend, no servers, no per-user marginal cost. There is no
  recurring cost to cover, so recurring pricing is friction with nothing behind
  it.
* The competition — Text Blaze, Magical, Briskine — has free tiers more
  generous than ours and venture funding behind them. Competing on a monthly
  subscription against free is a losing frame; a one-time unlock at the price of
  two lunches is a different decision entirely.
* No churn to manage, no dunning, no lapsed-subscription edge cases, no
  "your card expired" support email you have to answer.

**Paid-state handling is simpler than v1 because of this.** With a one-time
purchase, `user.paid` from ExtPay is monotonic — once true, it never becomes
false:

* On first run and on service-worker startup, read cached state from
  `chrome.storage.local`.
* **If cached state is `paid: true`, never call the network again.** Not once
  per 24h — never. The answer cannot change.
* If cached state is unpaid, refresh at most once per 24h in the service
  worker, and immediately after the user returns from the ExtensionPay payment
  page.
* **Never block the palette on a network call.** An unknown paid state means
  "treat as free for gating, open the palette instantly regardless."
* Gate on snippet *creation*, never on snippet *use*. A user who somehow has 40
  snippets and an unpaid state keeps full access to all 40 in the palette; they
  simply cannot add a 41st. Never hide or delete data behind a paywall.

---

## Technical requirements

* **Manifest V3.** Permissions: `storage` only, plus a content script match on
  `https://mail.google.com/*` with `all_frames: true` (Gmail renders compose
  windows inside iframes — the palette must work there). Register a
  `chrome.commands` global shortcut as fallback routing to the focused frame,
  per **Keyboard trigger** above.
* The palette overlay must be **Shadow-DOM-isolated** so Gmail's CSS doesn't
  clash with it.
* Detect compose windows with a **MutationObserver**.
* Put **ALL Gmail DOM selectors in a single `selectors.ts` module** so quarterly
  Gmail DOM changes are one-line patches.
* Insertion into the contenteditable body must trigger proper input events (use
  `document.execCommand('insertText')` or equivalent) so Gmail's autosave
  registers the text. **Preserve line breaks.**
* Unknown `{Tokens}` (other than `FirstName`) show a tiny inline prompt to fill
  before inserting.
* Snippets stored in `chrome.storage.sync` where quota allows, fallback
  `chrome.storage.local`. No backend, no server, no accounts.
* Keep the extension small (**target under 150KB**) and dependency-light
  (vanilla JS or Preact; tiny local fuzzy-search implementation, no libraries).

### Chrome Web Store review

A content script on `mail.google.com` puts Rico under the Limited Use policy for
user email data. Rico complies — `storage` only, nothing leaves the device — but
budget for slower review, and make the privacy story explicit in both the
listing and a linked privacy page: *no data leaves your browser, no accounts, no
analytics, no servers.*

---

## Screens

1. **Popup (snippet manager):** searchable list, create/edit/delete
   (title + body), Pro badge on gated features, **shortcut configuration**.
2. **Content palette in Gmail:** the overlay, with fuzzy search over titles
   *and* bodies.
3. **First-run:** a 15-second onboarding hint inside Gmail
   ("Press Cmd+Shift+K in any compose" — echoing the *configured* shortcut, not
   a hardcoded string), shown once.
4. **"Import my Gmail Templates"** button in the popup (bulk paste import is an
   acceptable fallback).

---

## Build order

Confirm each milestone works before moving on.

1. Skeleton + compose detection (logs when compose opens/closes)
2. **Shortcut collision audit** (see **Keyboard trigger**), then palette renders
   inside the compose iframe (search + keyboard nav + Esc)
3. Snippet insertion at cursor, autosave picks it up, line breaks preserved
4. Popup CRUD + persistence across browser restarts
5. Variables: `{FirstName}` auto-fill from To: field; unknown tokens prompt
   inline
6. Free tier limit + ExtensionPay **one-time purchase** wiring
7. Gmail templates import + onboarding hint + shortcut configuration UI
8. Polish

---

## Deliverables

* Full source repo with the file structure above
* A **README** with local dev setup (`chrome://extensions` load-unpacked
  instructions)
* A short **TESTS.md** checklist matching the 8 milestones, including an
  explicit shortcut-collision test row for Milestone 2 and a
  purchase-then-restart-browser row for Milestone 6

---

## Explicitly NOT in v1

Cloud sync, user accounts, team sharing, AI generation, analytics, support for
other email clients, LinkedIn. Single purpose, small, fast.

---

## Store listing copy (generate a draft)

**Title:** "Rico — Gmail Canned Responses & Templates (Cmd+Shift+K)"

**Description must:**

* Lead with the palette and the speed — *fifty snippets, no names to remember,
  two seconds* — not with the snippet count.
* Explicitly disclose the free tier limit (10 snippets) and the Pro price
  (**$24 one-time, not a subscription**) — Chrome Web Store policy requires the
  pricing disclosure, and "one-time" is a selling point worth stating twice.
* State the privacy position plainly: nothing leaves the browser.
* Name the default shortcut and say it is configurable.

**Assets:** 5 screenshot placeholders and a spot for a 10-second demo GIF.
