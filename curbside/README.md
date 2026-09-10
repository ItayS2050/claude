# Curbside Quote

An instant quoting page for a landscaping business. One HTML file, no backend,
no build step. The homeowner picks their lawn size and services, the price
updates live as they go, and they submit a request with the quote attached.

## Selling it

The landscaper buys a configured copy. You send them `index.html` with their
name, phone and rates already filled in.

## Setting one up

1. Open `index.html` in a browser, click **Contractor setup**.
2. Enter their business name, phone and rates. Everything saves as you type.
3. Send them the file. They upload it to their host and link it from their
   website, their Facebook page, and a QR code on the truck.

## Where leads go

By default a submitted quote is stored in that browser and listed under
Contractor setup. To have leads delivered instead, set `LEAD_ENDPOINT` at the
top of the `<script>` block to a form endpoint (Formspree or similar) — each
submission POSTs there as JSON.

## Pricing model

Every rate is editable in the setup panel; the defaults are placeholders, not
market research.

| Service | How it is priced |
| --- | --- |
| Mowing | base + per 1,000 sq ft, multiplied by frequency (less often costs more per visit) |
| Seasonal cleanup | base + per 1,000 sq ft |
| Mulch | cubic yards at 2" depth (bed sq ft ÷ 162) × rate per yard |
| Bed edging | per linear foot |
| Shrub trimming | per shrub |
| Aeration | per 1,000 sq ft, with a minimum |

Access surcharges (gated yard, steep slope, heavy obstacles) apply as a
percentage on top. The homeowner sees a range, not a single number — ±12% by
default — because the lawn is estimated from a size bracket rather than
measured.

## Known limits

- Lawn size is a bracket the homeowner picks, not a satellite measurement.
  Swapping in a parcel-data lookup is the obvious upgrade.
- Rates and leads live in the browser's local storage, so they are per-device
  until `LEAD_ENDPOINT` is set.
