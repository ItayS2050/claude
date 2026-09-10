# Outreach: a personalized preview for every prospect

Generates one working quote page per landscaper on your list — their name,
their logo, their brand color — each on its own unguessable URL. You email
the link; they click it and see their own business running the thing.

## Run it

```
pip install requests Pillow
./outreach/build_demos.py prospects.csv \
    --reply you@yourdomain.com \
    --base-url https://quotes.yourdomain.com
```

Input CSV needs a `name` column. `domain`, `email`, `phone` and `city` are
optional but `domain` is what makes the page look bespoke — it is where the
logo and brand color come from.

```csv
name,domain,email,city,phone
Cedar & Stone Landscaping,cedarstone.com,info@cedarstone.com,Boise ID,
```

Output lands in `outreach/out/`: one folder per prospect, plus `links.csv`
with the URL for each — that is your mail merge. Upload the folder to any
static host.

Useful flags: `--limit 5` to try a handful first, `--no-fetch` to skip the
network, `--price` to change what the pitch block says.

## What it pulls from their site

In order of preference: an `<img>` whose markup calls itself a logo, then an
apple-touch-icon, then `og:image`, then the favicon. The image is flattened
onto white, capped at 128px tall and embedded in the page as a data URI —
their server is never hit when the page is viewed, so nothing shows up in
their logs before you have even spoken.

Brand color is the most common strongly-saturated color in the logo, falling
back to their `theme-color` meta tag. The page retints around it, including a
lightened variant so it stays readable on a dark background.

No logo found, or no domain given, gets a monogram in a neutral green. That
still looks deliberate — it does not look broken.

Nothing here can fail the run. A dead domain, a 403, a logo that won't decode:
that row gets a monogram and the script moves on.

## Keep it honest

The pages say **"Preview built for [name]"** across the top, are marked
`noindex`, and live on URLs nobody can guess. That framing is not decoration
— it is what keeps this a mockup you made for someone rather than a page
impersonating their business.

Two rules that follow from that:

- Don't claim you hand-built each one. "I made you one" is true and converts
  just as well.
- If anyone asks you to take theirs down, delete the folder that day and say
  you did.

## Preview mode

Setting `demoFor` in a page's CONFIG is what turns it into a pitch page: the
banner appears, the closing block appears, and the submit button stops
sending anything — instead it shows the email the landscaper would have
received. Clearing `demoFor` turns the same file into a live customer page.
