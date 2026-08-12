# Kiko licence proxy

Kiko needs to ask Creem "is this licence key valid?". Creem requires an
`x-api-key` header on that question, and their docs say not to put that key in
client-side code. An extension *is* client-side code — anything shipped in it
can be read by anyone who installs it.

So the key lives here instead. This Worker is the only place it exists.

    extension  ──POST──▶  this Worker  ──POST + x-api-key──▶  Creem
                            (holds the key)

It makes no decisions. It checks the path, keeps only the fields that endpoint
takes, adds the header, and hands Creem's answer straight back. Every judgement
about who is entitled to what stays in `keylang/background.js`, where the tests
are.

## Deploy

    cd worker
    npx wrangler login
    npx wrangler secret put CREEM_API_KEY    # paste the key, press enter
    npx wrangler deploy

The URL it prints must match `LICENCE_PROVIDER.activateUrl` and `validateUrl`
in `keylang/background.js`. A test asserts those point at `workers.dev` or
`get-kiko.com` and never straight at a provider's API.

Get the API key from the Creem dashboard under **Developers**. Test and live
mode have different keys.

## Going live

1. Set the **live** key: `npx wrangler secret put CREEM_API_KEY`
2. Change `CREEM_MODE` to `"live"` in `wrangler.toml`
3. `npx wrangler deploy`

Until then it talks to `test-api.creem.io` and no real money moves. Anything
other than exactly `"live"` stays on test, so a typo cannot start charging
real cards.

## Endpoints

    POST /activate     { key, instance_name }
    POST /validate     { key, instance_id }
    POST /deactivate   { key, instance_id }

All return Creem's licence object and Creem's status code, with two
exceptions: a 401 from Creem means *our* key is wrong, so it becomes a 500
with our own wording rather than telling a paying customer their licence is
unauthorised; and an unreachable Creem is a 502.

`403`, `404` and `410` pass through untouched — the extension turns those into
"already in use on the maximum number of browsers", "we do not recognise that
key", and "expired or cancelled".

## Tests

    node worker/test-worker.js

28 assertions, no network. They mostly cover what the Worker *refuses*:
unknown paths, missing or non-string fields, and extra fields smuggled into
the body — forwarding those to an authenticated endpoint is how a thin proxy
becomes someone else's API key.

## Notes

There is no rate limiting. Both endpoints need a real licence key to do
anything, so the worst an unauthenticated caller can do is burn activation
slots on a key they already possess. If that ever matters, Cloudflare's rate
limiting rules can be applied to the route without touching this code.
