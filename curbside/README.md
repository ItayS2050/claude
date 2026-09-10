# Curbside Quote

An instant quoting page for a landscaping business. One HTML file per
customer, no backend, no build step. A homeowner picks their lawn size and
services, the price updates live, and they submit a request with the quote
attached.

## How it is sold

You host it. Each customer gets a link, not a file:

```
yoursite.com/ridgeline/
yoursite.com/joes-lawn/
```

They paste that link on their website, their Facebook page, and a QR sticker
on the truck. Quote requests arrive in their inbox. They never touch the file,
can't break it, and the link goes dark if they stop paying.

## Adding a customer

```
./new-customer.py joes-lawn "Joe's Lawn Care" "(555) 201-4477" joe@joeslawn.com
```

That writes `customers/joes-lawn/index.html` with their name, phone and email
already in place. Then:

1. Open `customers/joes-lawn/index.html?setup` in a browser.
2. Drag the rates around until they match what the customer charges. The
   homeowner-facing page updates live as you type, so you can see what their
   customers will see.
3. Click **Copy config block** and paste it over the `CONFIG` block at the top
   of that file.
4. Upload `customers/` and send them their link.

The `?setup` panel is how you configure a copy — it is invisible to anyone
who visits the plain URL, and nothing it does is saved to the file on its own.
That is deliberate: rates live in the file you control, so a customer poking
at their own page can never leave homeowners looking at stale prices.

## Where quote requests go

Set `leadEndpoint` in the customer's `CONFIG` block to a form endpoint that
emails them — [Formspree](https://formspree.io) or similar. Create a form,
point it at their address, paste the URL. Each submission POSTs the lead as
JSON, including a preformatted `text` field that reads as a plain email.

With no endpoint set, the page falls back to opening the homeowner's own mail
app addressed to `notifyEmail`. That works and loses nothing, but fewer people
finish, so treat it as a safety net rather than the plan. If a POST fails, the
homeowner is shown the same mailto fallback plus the phone number — a lead is
never silently dropped.

Every submission is also written to the visitor's own browser storage as a
local backup, visible under `?setup`. That is a debugging aid, not a CRM.

## Hosting

Any static host. Drag the folder into Netlify Drop or Cloudflare Pages and
it is live — there is nothing to run.

## Pricing model

Every rate is editable per customer; the defaults are placeholders, not market
research.

| Service | How it is priced |
| --- | --- |
| Mowing | base + per 1,000 sq ft, times a frequency multiplier (less often costs more per visit, because there is more growth to cut) |
| Seasonal cleanup | base + per 1,000 sq ft |
| Mulch | cubic yards at 2" depth (bed sq ft ÷ 162) × rate per yard |
| Bed edging | per linear foot |
| Shrub trimming | per shrub |
| Aeration | per 1,000 sq ft, with a minimum |

Access surcharges (gated yard, steep slope, heavy obstacles) apply as a
percentage on top. The homeowner sees a range, ±12% by default, because the
lawn is estimated from a size bracket rather than measured.

## Known limits

- Lawn size is a bracket the homeowner picks, not a satellite measurement.
  Swapping in a parcel-data lookup is the obvious upgrade, and the only part
  that would need a backend.
- Nothing stops a curious visitor from opening `?setup` and looking at the
  rates. They can't change what anyone else sees, but the numbers aren't
  secret. If that matters to a customer, delete the setup panel from their
  copy after configuring it.

## Layout

```
template/index.html      the master — edit this, not the customer copies
customers/<slug>/        one configured copy per customer, ready to upload
new-customer.py          makes a new customer folder from the template
```

Fixing a bug means editing `template/index.html` and regenerating the customer
copies, so keep customer-specific changes to the `CONFIG` block only.
