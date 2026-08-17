# Kiko 4.8.6 — product and technical audit

Read-only. Nothing in the product was changed to produce this.

Everything below marked **measured** was run against the 4.8.6 source in this
repo. Everything marked **not verifiable here** could not be checked, and why is
stated rather than guessed around.

## What could not be audited, and why

This environment's egress proxy blocks every search engine, the Chrome Web
Store, Google Trends, and `docs.google.com`. Verified by request, not assumed.

That makes four parts of the brief unanswerable from here:

- **Audit 6, website compatibility.** Cannot load Gmail, Salesforce or any of
  the sixteen sites. What follows is a reading of the selector and injection
  code plus one case I can prove; the matrix itself needs a human with a browser.
- **Audit 10, Chrome Web Store.** Cannot see the listing, its version, its
  metadata or its privacy declarations. The version-indexing question in
  particular needs someone looking at the dashboard.
- **Audit 11 in part.** The HTML, sitemap, canonicals and structured data are
  in this repo and were checked. Page speed, crawlability and rendered-HTML
  behaviour from outside were not.
- **Competitive claims.** GIBRISH, NeuroSwitcher, KeyboardSwitcher and the rest
  are taken from your brief. I have not verified any of them and have not
  assumed their accuracy in the recommendations.

---

## 1. Current 4.8.6 architecture

Four moving parts, ~4,000 lines of application code, no build step, no
dependencies.

```
content.js   3,131 lines   injected into every frame of every page at
                           document_idle. Owns detection, the toast, the
                           in-place replacement, and the learned-word sets.

background.js  476 lines   service worker. Owns entitlement, the trial clock,
                           the licence calls, the toolbar badge, the context
                           menu, and the offscreen document for sound.

popup.js       433 lines   toolbar popup. Reads state, never computes it.
                           Language toggles, per-site switch, learned-word
                           editor, licence key entry.

i18n.js         ~90 lines  data-i18n attribute substitution for the
                           extension's own pages.
```

Shipped package: 22 files, 246 KB, seven `_locales` directories.

**State lives in exactly one place** — `chrome.storage.local` — and is written
by whichever surface owns it. `background.js` computes entitlement and writes
it; `content.js` and the popup only read. That is a deliberate single-writer
design and it holds throughout.

A fifth component sits outside the extension: `worker/kiko-licence.js`, a
Cloudflare Worker built when Creem was the provider. It is deployed, tested and
currently **unused** — Lemon Squeezy needs no secret, so the extension calls it
directly. The Worker is the escape hatch for the next provider change.

---

## 2. What is already implemented

Every item in your list, verified against 4.8.6 source:

| Claim | Verified | Note |
|---|---|---|
| Automatic wrong-layout detection | Yes | debounced 200 ms, max 1500 ms |
| Hebrew, Russian, Ukrainian, Korean, Greek, Arabic | Yes | six, both directions each |
| Conversion both directions | Yes | separate detection case per direction |
| In-place correction | Yes | `input`/`textarea` by value, contenteditable via execCommand with fallbacks |
| Manual scan — Alt+Shift+K | Yes | scans field, or converts selection |
| Per-language activation | Yes | `enabledLangs`, disabled languages never run |
| "Not Hebrew" style feedback | Yes | one reject button per detected language |
| Learned exceptions | Yes | seven sets, one per language plus English |
| Per-site disable | Yes | `disabledSites` by hostname |
| Draggable notification | Yes | position persisted in `toastPos` |
| Recall bubble | Yes | replaces the toast for runs of 10+ words |
| Optional sound | Yes | offscreen document, off by default |
| Local processing | **Yes, with one caveat** | see section 5 |
| Subscription / licensing | Yes | Lemon Squeezy, licence keys |
| 30-day trial | Yes | 60 for pre-4.5.0 installs |
| $5/month | Yes | and $40/year, which your list omits |

---

## 3. What differs from the brief's assumptions

1. **There are two prices, not one.** $5/month and $40/year, chosen at
   checkout. The brief says "$5/month".
2. **There are three trial lengths, not one.** 30 days is the advertised
   figure; anyone who installed before 4.5.0 gets 60, because Kiko was free
   then and they never agreed to a trial. Unstamped installs get 30.
3. **The trial clock does not start at install.** It starts at whichever came
   later: the install, or the first run of a build that can charge. Without
   this, switching payments on would have expired all 152 existing users the
   same afternoon.
4. **Detection is not purely automatic.** A run of 10+ words deliberately
   collapses to a small bubble rather than a toast, so long typing sessions do
   not produce a popup.
5. **Store listing languages are seven, not four**, as of 4.8.6 — English,
   Hebrew, Russian, Korean plus Ukrainian, Greek and Arabic added this cycle.
   Your Audit 10 question about "six languages described, four in metadata" is
   a real observation about **4.8.4**, and 4.8.6 closes it.
6. **A telemetry function exists in shipped code.** Disabled, but present. See
   section 5. This is the single most important correction to the brief's
   assumptions.

---

## 4. Current detection algorithm

### Pipeline

```
input event
  └─ debounce(200 ms, max 1500 ms)
      └─ isLive? detectionEnabled? past fixCooldownUntil?
          └─ analyzeFullField(el)  ||  analyze(el)        ← full field first,
              └─ analyzeText(text)                          cursor-context second
                  ├─ script sniff: does the text contain Hebrew/Cyrillic/Hangul/Greek/Arabic?
                  ├─ per-language case, in fixed order
                  ├─ word tokenisation
                  ├─ per-word plausibility
                  ├─ run assembly
                  ├─ context extension          ← see the defect in section 9
                  └─ scoring gate
          └─ showToast(el, detection)
```

### Tokenisation

`extractWords` splits on whitespace, strips `? ! ( ) [ ] { }` from the edges,
and keeps a token only if it matches `^[a-z,;.']+$` and is 2+ characters.

Punctuation is kept **inside** words on purpose: on the Hebrew layout the comma
key is `ת`, the full stop is `ש` and the semicolon is `ף`. `את` is typed `t,`.
Stripping punctuation would destroy one of the commonest words in the language.

### Character mapping

Six bidirectional tables built at load from a single source map per language.
Korean additionally composes and decomposes Hangul jamo; Greek expands tonos.

### Per-word plausibility

`wordCouldBeHebrew(word)` and its five siblings, in order:

1. shorter than 2 characters → no
2. in the user's learned-English set → no
3. in the user's learned-Hebrew set → **yes**, short-circuit
4. in `EN_WORDS` → no
5. `englishScore(word) >= 0.20` → no  (0.35 for Russian/Ukrainian/Arabic/Greek/Korean)
6. every character must map into the target script
7. a final-form letter (ך ם ן ף ץ) anywhere but the last position → no
8. otherwise yes

Since 4.8.5 there is a second attempt: if the raw word fails, the word is
retried with one trailing `, . ;` removed. `t,` still reads as `את` on the first
attempt; `akuo,` fails, then passes as `שלום`.

### Run assembly

Words are walked left to right. A plausible word extends the current run. An
implausible word is tolerated as a **gap** — at most two consecutive, and only
if it is in `PASSTHROUGH` or satisfies `bridgesRejectedWord` — otherwise the run
ends. The last run meeting the minimum length wins.

Minimum run is 2 plausible words. **A single word never fires**, by design.

### Context extension

After a run is confirmed, the code scans backwards and forwards and absorbs
adjacent words that pass `extCheck`, which is `mapsToHebrew` in pure-Latin text
and the looser `physicallyMapsToHebrew` in text that already contains Hebrew.

**This is where the most serious defect lives — section 9.**

### Scoring gate

Two ways to fire:

- **Strong signal**: 2+ final-form letters in wrong positions. Structural, not
  statistical.
- **Fallback**: convert the run, score the result for English-likeness — 2
  points per common English word, 1 per word with a plausible vowel ratio and
  no consonant pile-up — and require **both** score ≥ 3 **and** at least one
  hit in `COMMON_EN_WORDS`.

That conjunction is what stops legitimate Hebrew being offered for conversion.
It was added after a real incident: Kiko offered to turn a customer email into
`fnuci atpar do hu,r bnul kkt khbv`.

### Dictionaries

Hand-built common-word lists: Hebrew 251, English 136, Russian 129, Ukrainian
128, Greek 106, Korean 94, **Arabic 45**.

### N-grams, context, ML

None. `englishScore` is a vowel-ratio and letter-pattern heuristic, not an
n-gram model. There is no sentence-level or cross-field context. No model file,
no inference, no remote call.

### Suppression

Detection is suppressed when: the paywall says unentitled; detection is off;
the site is disabled; within `fixCooldownUntil` (900 ms after a fix, 4 s after a
failed one); the frame does not own the toast (`document.hasFocus` plus
activeElement is not an iframe); the exact signature was dismissed; a toast for
the same words is already on screen.

---

## 5. Privacy and data architecture

### Measured: every network call in the extension

There are exactly four `fetch` calls in the entire codebase.

| Call | Destination | Payload | When |
|---|---|---|---|
| validate | `api.lemonsqueezy.com` | licence key, instance id | at most once a day, only if a key is stored |
| activate | `api.lemonsqueezy.com` | licence key, `"kiko-browser"` | when the user pastes a key |
| deactivate | `api.lemonsqueezy.com` | licence key, instance id | immediately before an activation |
| `kiko-feedback` | **whatever `FEEDBACK_URL` holds** | **the user's words** | never — the URL is `''` |

No analytics. No crash reporting. No `chrome.storage.sync`. No remote code, no
`eval`, no dynamic `import`. Everything Kiko learns is in `chrome.storage.local`
on the device.

### The one real finding

`content.js` contains a working telemetry function:

```js
const FEEDBACK_URL = '';

function sendFeedback(words, action, type) {
  if (!FEEDBACK_URL) return;
  ... body: JSON.stringify({ words: words.slice(0, 15).map(w => w.toLowerCase()), ... })
```

It would transmit **up to fifteen of the user's actual typed words** to an
arbitrary URL. It is disabled by an empty string, and the background handler
that would perform the POST exists and is wired.

Nothing is being sent today. But your published privacy promise — "your typing
never leaves your computer", on the site in six languages and in the store
listing — is currently guaranteed by one empty string constant, in a file that
gets edited every release. That is not a technical guarantee, it is a
convention. **P0 in section 13.**

### Data table

| Data | Collected? | Stored where | Sent off device? | Why |
|---|---|---|---|---|
| Typed text | Read in memory | Never persisted | **No** | detection |
| Learned words (7 sets) | Yes | `storage.local` | No | suppress false positives |
| Detected/converted/rejected counts | Yes | `storage.local` | No | popup display |
| Enabled languages | Yes | `storage.local` | No | user setting |
| Disabled sites (hostnames) | Yes | `storage.local` | No | user setting |
| Toast position | Yes | `storage.local` | No | user setting |
| Install date + version | Yes | `storage.local` | No | trial length |
| Paywall start date | Yes | `storage.local` | No | trial clock |
| Licence key + instance id | Yes | `storage.local` | **Yes** | to Lemon Squeezy, to validate |
| Entitlement result | Yes | `storage.local` | No | gate detection |
| Sound / detection toggles | Yes | `storage.local` | No | user settings |

### Permissions

`storage`, `contextMenus`, `offscreen`, `scripting`, `activeTab`, and
`host_permissions: <all_urls>`.

`<all_urls>` is genuinely required — a layout mistake happens in any text field
on any site, and there is no fixed list. It is also the reason the store shows a
broad data-handling category. The narrower alternative, `activeTab` only, would
mean Kiko does nothing until clicked, which destroys the product.

On the store showing **"Authentication information"**: nothing in the code reads
credentials. The likeliest cause is the declaration itself rather than the code
— a licence key is arguably authentication information, and if that box was
ticked for the licence key it is defensible but confusing to a reader. **This
needs checking against the dashboard, which I cannot see.** Do not change a
declaration to be narrower than the code without confirming the code first.

---

## 6. Licensing architecture

Entitlement is computed in one function, `computeEntitlement`, from three
inputs: the install stamp, the paywall-start stamp, and the stored licence.
Everything else reads the result.

```js
const PAYWALL_ENABLED = true;
const TRIAL_DAYS  = 30;      // advertised
const LEGACY_DAYS = 60;      // installed before 4.5.0
const RECHECK_MS  = 1 day;   // validate at most daily
const GRACE_MS    = 7 days;  // keep working while offline
```

Provider-specific detail is confined to one object, `LICENCE_PROVIDER`: two
URLs, an encoder, two body builders and five readers. Moving provider is that
object plus, if the provider needs a secret, a Worker redeploy.

Failure behaviour is deliberately asymmetric toward the paying customer. Only a
2xx or a 403/404/410 may revoke a licence; a 400, 401, 429 or 5xx is treated as
inconclusive and the previous result stands.

**Answering your Audit 9 question — how hard are pricing experiments?**

| Experiment | Difficulty | Why |
|---|---|---|
| Change price | Trivial | Lemon Squeezy dashboard, no code |
| Add annual/lifetime tier | Trivial | new variant, same checkout link |
| Different trial length | Small | one constant plus a version gate; copy in 4 languages is the real work |
| **Feature-gated tiers (free = 1 language)** | **Medium** | `entitled` is a single boolean. Tiers need it to become a capability object, and every gate site updated |
| **Daily allowance (GIBRISH model)** | **Medium** | needs a per-day counter in storage and a reset; the counting is easy, the honest UX is not |

The single boolean is the constraint. Everything else is configuration.

---

## 7. Bugs and technical debt found

1. **Context extension eats real English.** Section 9. The most serious.
2. **Dead telemetry function.** Section 5.
3. **Learned-word sets are unbounded.** No cap, no expiry, no LRU. A user who
   rejects aggressively grows storage without limit, and every entry
   permanently suppresses detection for that word.
4. **`content.js` is 3,131 lines** with six near-duplicated detection cases.
   The Greek, Korean, Ukrainian, Russian and Arabic blocks are structurally
   the same code with different tables — around 300 lines each. A change to
   the scoring rule has to be made five times.
5. **`analyzeFullField` runs on the whole field on every debounce fire.** Fine
   at 250 words (measured 0.39 ms). A 5,000-word contenteditable would be
   roughly 20× that on every typing pause.
6. **Arabic's common-word list has 45 entries** against Hebrew's 251, on a
   script written without short vowels where the veto has least to work with.
7. **`docs/sitemap.xml` had the wrong namespace** — `sitemap.org` rather than
   `sitemaps.org` — so it was likely being rejected outright. Fixed this cycle,
   noted because it means the site has effectively had no sitemap until now.

---

## 8. Security and privacy risks

| Risk | Severity | Note |
|---|---|---|
| `sendFeedback` exists and would transmit typed words | **High** | disabled by one empty string |
| `<all_urls>` + `all_frames` on every page | Medium | necessary, but it is the maximum surface an extension can request |
| Licence key in `storage.local` | Low | readable by anyone with disk access; unavoidable without a server |
| No Subresource Integrity concerns | None | no external scripts, no remote code |
| `innerHTML` used to build the toast | Low | all interpolated values pass through `escapeHtml`; verified |

---

## 9. Detection-quality risks

### Measured: the brief's own mixed-language examples

All four are silent. So are ten other hard cases:

```
שלחתי לך את ה deck ב-Slack                        silent
תבדוק ב Salesforce אם ה opportunity עדיין פתוח    silent
I spoke with יוסי yesterday                        silent
אני עובד עכשיו על the new campaign                 silent
check https://github.com/... please                silent
send it to itay@selltech.io tomorrow               silent
const foo = bar.map(x => x.id)                     silent
the CRM and the API need SSO                       silent
Yossi and Dvir met Sarah                           silent
order 12345 shipped on 2026-08-16                  silent
ok / hi there / lol thats sick bro                 silent
Slack Notion Figma Salesforce                      silent
```

And on the 190-sentence corpus: **0 false positives**, Hebrew recall 86.7%,
Russian/Ukrainian/Arabic 100%, Korean 90%, Greek 95%.

So the headline is good. The defect is elsewhere.

### The defect: correct extent, not correct detection

When mistyped text sits **inside** an English sentence, Kiko fires correctly and
then converts too much:

| Typed | Would replace | With |
|---|---|---|
| `I spoke with akuo nv akunl yesterday` | `akuo nv akunl yesterday` | `שלום מה שלומך טקדאקרגשט` |
| `the akuo nv file` | `the akuo nv` | `איק שלום מה` |
| `akuo nv akunl and then I left` | `akuo nv akunl and then` | `שלום מה שלומך שמג איקמ` |

`yesterday`, `the`, `and` and `then` are real English words the user typed
deliberately. Accepting the fix destroys them.

**Root cause, located.** `wordCouldBeHebrew` correctly rejects all four —
measured. But the context-extension pass uses `mapsToHebrew`, which checks only
that the characters map into Hebrew and that no final-form letter sits in a
non-final position. It does **not** consult `EN_WORDS` and does **not** consult
`englishScore`. Anything spellable on the Hebrew layout gets absorbed.

By your own priority order this is the highest-value fix in the codebase. It is
not a false positive in the usual sense — the detection is right — but the
user's own words get destroyed, which is the outcome the false-positive priority
exists to prevent.

### The other quality risks

- **Arabic's 45-word list.** Not currently producing false positives on the
  corpus, but the corpus is 20 Arabic sentences that I wrote.
- **The corpus is written, not collected.** Every number above is only as good
  as sentences invented by someone who is not a native speaker of five of the
  six languages.
- **`learnedEnglish` is permanent and unbounded.** One careless reject of a
  genuinely common mistyped word silently reduces detection for that word for
  ever, with no expiry and no prompt.

---

## 10. Compatibility risks

Not verifiable here — no browser access to real sites. What the code says:

Kiko attaches to `input[type=text|search|email|url]`, bare `input`, `textarea`,
`[contenteditable]`, and `[role=textbox|combobox|searchbox]`, plus named hooks
for Quill, Lexical, Slack and WhatsApp. A MutationObserver re-attaches on DOM
changes and a periodic sweep catches the rest. `all_frames: true` covers
iframes where permissions allow.

**Shadow DOM is not handled.** `document.querySelectorAll` does not pierce
shadow roots and there is no `getRootNode` walk. Any site whose editor lives in
a closed or open shadow root is invisible to Kiko. That is a concrete gap worth
testing against your sixteen sites.

**Google Docs cannot work and never will.** It renders text to `<canvas>`;
there is no DOM text node to read or replace. This is not a Kiko bug and no
browser extension can solve it.

**One case I can prove:** the Chrome New Tab Page. Extensions cannot inject
there at all, and "the Google search bar doesn't work" will be a recurring
support question because most people cannot tell the New Tab Page from
google.com.

---

## 11. Performance risks

### Measured — `analyzeText`, 1,000 iterations after warm-up

| Input | Per call |
|---|---|
| 5 words | 0.037 ms |
| 25 words | 0.056 ms |
| 250 words, mistyped | 0.387 ms |
| 250 words, plain English | 1.137 ms |

Detection is not a performance problem at ordinary lengths. Note that **plain
English is the slowest case** — every language check runs and fails before the
text is cleared.

Extrapolating linearly, a 5,000-word contenteditable would cost roughly 20 ms
per debounce fire on the main thread. That is the one scenario worth bounding.

Not measured, and needing a real browser: memory over a long session,
MutationObserver cost on heavy SPAs, and whether the periodic re-attach sweep
leaks listeners on pages that churn DOM.

---

## 12. Product and UX issues

1. **Keyboard-first users cannot complete the loop.** Alt+Shift+K opens or
   scans, Escape dismisses — but **accepting requires a click**. There is no
   accept shortcut. For the target user, someone who types fast in two
   languages, that is the single biggest friction in the product.
2. **The toast auto-dismisses after 8 seconds** whether or not it was seen.
3. **Zero ratings on the store listing.** The review prompt is wired and fires
   three seconds after a third successful fix, so the mechanism exists. With
   152 users and no reviews, this is the biggest conversion leak in the funnel
   and it is not a code problem.
4. **Subscribing early loses the remaining trial.** No trial is configured at
   Lemon Squeezy, so someone who subscribes on day 3 of 30 pays immediately and
   forfeits 27 free days. The popup says "Subscribe any time to keep it after
   the trial", which reads as though billing starts later. Raised previously;
   you decided to leave it.
5. **No accessibility work has been done.** The toast is a `div` with no
   `role="dialog"`, no `aria-live`, and no focus management. A screen-reader
   user gets no announcement that a suggestion appeared.

---

## 13–16. Recommendations, priority, complexity, dependencies

| # | Recommendation | Priority | Size | Depends on |
|---|---|---|---|---|
| 1 | Stop context extension absorbing words that `wordCouldBeHebrew` rejects. Make `mapsToHebrew` consult `EN_WORDS` and `englishScore`, or drop extension in pure-Latin text | **P0** | Small | corpus, to prove recall does not collapse |
| 2 | Delete `sendFeedback` and its background handler outright | **P0** | Small | none |
| 3 | Replace the corpus with real sentences per language | **P0** | Medium | native speakers |
| 4 | Accept shortcut — Enter or Alt+Shift+Enter — so the loop is keyboard-only | **P1** | Small | none |
| 5 | Cap learned sets, add per-entry timestamps, add "reset all" | **P1** | Small | none |
| 6 | Expand Arabic common words to parity, roughly 250 | **P1** | Medium | Arabic speaker |
| 7 | Shadow-DOM traversal when attaching | **P1** | Medium | site testing |
| 8 | Extend the benchmark to the brief's 19 dataset categories, add precision/recall/F-beta and latency | **P1** | Medium | #3 |
| 9 | Bound `analyzeFullField` to a window around the caret for very long fields | **P2** | Small | latency benchmark |
| 10 | Collapse six duplicated detection cases into one table-driven path | **P2** | Large | #1, #8 — do not refactor before the tests can catch a regression |
| 11 | `role="dialog"` and `aria-live` on the toast | **P2** | Small | none |
| 12 | Turn `entitled` into a capability object for tier experiments | **P2** | Medium | a pricing decision |
| 13 | Landing pages with a live converter demo | **P2** | Medium | none |
| 14 | Aggregate privacy-safe metrics | **Later** | Large | see below |

### On Audit 2 — the quality score

Precision and recall are not equally valuable here, so do not use F1. Use
**F-beta with β = 0.3**, which weights precision roughly eleven times recall,
and gate it:

```
Kiko score = Fβ(β=0.3)    subject to a hard gate:
             false-positive rate on correct-text corpora < 0.5%
```

A release that breaches the gate does not ship, whatever its score. Report the
number per language, never only in aggregate — Arabic's weakness would vanish
in a six-language average.

### On Audit 12 — analytics

You can do this safely, but only with counters that never touch content:
install, activation, languages enabled, detections, accepts, rejects, manual
conversions, site disables, trial start, conversion, churn. Integers and
enums, batched daily, no text, no URLs, no hostnames, no learned words.

But be clear-eyed: the moment you add any network call carrying behavioural
data, the sentence "your typing never leaves your computer" needs qualifying,
and your store declaration changes. Given that privacy is a stated pillar and
the current promise is unusually strong, I would **not** build this before the
detection work is done. Trial-to-paid and churn are already visible in Lemon
Squeezy without touching the extension at all.

---

## 17. What I recommend NOT doing

1. **Do not refactor `content.js` yet.** It is duplicated and long, and it is
   also the only working implementation of six language pairs. Refactor after
   the benchmark can catch a regression, not before.
2. **Do not add an ML model.** KeyboardSwitcher's LSTM claim is a reasonable
   approach for a desktop app that ships a runtime. In a content script it
   means a model file on every page load, a slower cold start, and a much
   larger review surface — to improve a number that is currently 0 false
   positives on 190 sentences. Fix the extent bug first and re-measure.
3. **Do not add the daily-allowance free tier to match GIBRISH.** It converts a
   simple promise into a meter, and metering the thing the product exists to do
   is how you teach people to resent it. If you want a free tier, gate
   languages, not corrections.
4. **Do not build product analytics yet.** Section above.
5. **Do not rename the extension while installs are growing.** The listing is
   worth improving, but a name change triggers re-review, and the last one made
   your review noticeably slower.
6. **Do not chase Google Docs.** Canvas-rendered. Not solvable.

---

## 18. Proposed roadmap for the next three releases

### 4.9.0 — Precision

Everything here serves "never destroy what the user wrote".

- Fix context extension (#1)
- Delete `sendFeedback` (#2)
- Real corpus for Hebrew and Russian at minimum (#3)
- Benchmark reports precision, recall, F-beta and the FP gate (#8)

**Ship criterion:** false positives 0 on the corpus, Hebrew recall not lower
than 86.7%, and the three sentences in section 9 convert only the words the
user actually mistyped.

### 4.10.0 — The correction loop

- Accept shortcut, keyboard-only round trip (#4)
- Learned-word cap, timestamps, reset (#5)
- `role="dialog"` and `aria-live` (#11)
- Arabic list to parity (#6)

**Ship criterion:** a fast typist can go mistake → corrected → still typing
without touching the mouse, and Arabic's benchmark numbers are reported
separately and are no worse than Hebrew's.

### 4.11.0 — Reach

- Shadow-DOM traversal (#7)
- Compatibility matrix across the sixteen sites, published in the repo
- Bounded analysis window for long fields (#9)
- Landing pages with a live demo (#13)

**Ship criterion:** a documented matrix saying exactly where Kiko works,
partly works and cannot work — including the New Tab Page and Google Docs, as
honest limitations rather than silent failures.

---

## The one thing to take from this

The engine's judgement about **whether** to fire is good: 0 false positives
across 190 sentences and 14 hard cases including URLs, emails, code and four
mixed-language sentences from your own brief.

Its judgement about **how much to convert** is not. In mixed English and Hebrew
writing — which is exactly how your users write — accepting a correction can
silently destroy adjacent English words. That is a small, well-localised fix in
one predicate, and it is worth more than everything else on this list combined.
