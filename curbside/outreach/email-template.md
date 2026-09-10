# Cold email copy

Plain text only. No images, no tracking pixel, no link shortener, one link.
Anything fancier lands in spam, and these pages only work if they get opened.

Merge fields come from `out/links.csv`: `{{name}}`, `{{url}}`, `{{city}}`.

---

## First send

**Subject:** made a quote page for {{name}}

```
Hi — I build instant quote pages for landscaping companies.

I made one for {{name}} so you can look at it instead of reading about it:

{{url}}

A homeowner picks their yard size and what they need, sees a real price in
about a minute, and you get their name, number, address and that price in
your inbox. It works at ten o'clock on a Sunday night.

The rates on it are my guesses. Tell me what you actually charge and I'll
fix them within the hour.

If you want it live on your own site it's $59 a month, cancel whenever.
If not, no hard feelings — the link stays up either way.

— Itay
```

---

## Follow-up, four days later

**Subject:** re: quote page for {{name}}

```
Did that link come through? {{url}}

If the pricing looked wrong, that's on me — I guessed at it. Send me what
you really charge for a small, a medium and a big yard and I'll have it
matching by tonight.

— Itay
```

---

## Why it is worded this way

**"I made you one" and nothing more.** It is true — the page is real, it is
theirs, it works. Do not claim it was hand-built or that you studied their
business. If two of them compare notes, the honest version survives that
conversation and the overclaim does not.

**The wrong prices are the hook.** People who would never reply to a pitch
will absolutely reply to correct you about their own pricing. That reply is
the sale starting. This is why the banner points at the guessed rates instead
of hiding them.

**"The link stays up either way"** removes the pressure that makes people
delete cold email unread, and costs you nothing — the page is a static file.

## Sending

Deliverability decides this campaign, not the pages.

- Send from a **separate domain** to your main one, so a spam complaint can't
  poison your real email.
- Warm it up for two to three weeks before the first batch.
- **30–50 a day**, not 500 at once.
- Send as plain text from a normal mailbox. Anything that looks like a
  newsletter gets filtered.
- Reply-to a real inbox you actually watch. The whole point is the reply.
