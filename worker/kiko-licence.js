// Kiko licence proxy
//
// Why this exists: Creem's licence endpoints require an x-api-key header, and
// their docs say plainly not to put that key in client-side code. An extension
// is client-side code — anything shipped inside it can be read by anyone who
// installs it. So the key lives here instead, in a Cloudflare Worker, and Kiko
// talks to this Worker rather than to Creem.
//
// It deliberately does almost nothing. It accepts two shapes of request,
// forwards them to exactly one of three known Creem endpoints with the key
// attached, and hands the answer back untouched. No storage, no logic, no
// decisions about who is entitled to what — that judgement stays in
// background.js where it can be tested.
//
// Deploy:
//   cd worker
//   npx wrangler secret put CREEM_API_KEY     # paste the key when prompted
//   npx wrangler deploy
//
// Switching to live: set CREEM_MODE = "live" in wrangler.toml, then put the
// live API key in with the same secret command. Test and live keys differ.

const CREEM_BASE = {
  test: 'https://test-api.creem.io',
  live: 'https://api.creem.io',
};

// Only these three, only these fields. Naming them explicitly means a caller
// cannot talk this Worker into forwarding the API key to some other endpoint,
// or into passing parameters we never intended to expose.
const ROUTES = {
  '/activate':   ['key', 'instance_name'],
  '/validate':   ['key', 'instance_id'],
  '/deactivate': ['key', 'instance_id'],
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

    const path   = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    const fields = ROUTES[path];
    if (!fields) return json({ error: 'Not found' }, 404);

    if (!env.CREEM_API_KEY) {
      // Misconfiguration, not the caller's fault. Say so rather than sending
      // Creem a keyless request and relaying its 401, which would read to the
      // user as "your licence key is wrong".
      return json({ error: 'Licence server is not configured.' }, 500);
    }

    let input;
    try { input = await request.json(); }
    catch { return json({ error: 'Expected JSON.' }, 400); }

    const body = {};
    for (const f of fields) {
      const v = input && input[f];
      if (typeof v !== 'string' || !v.trim()) {
        return json({ error: `Missing ${f}.` }, 400);
      }
      body[f] = v.trim();
    }

    const base = CREEM_BASE[env.CREEM_MODE === 'live' ? 'live' : 'test'];

    let res, data;
    try {
      res  = await fetch(`${base}/v1/licenses${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept':       'application/json',
          'x-api-key':    env.CREEM_API_KEY,
        },
        body: JSON.stringify(body),
      });
      data = await res.json();
    } catch {
      return json({ error: 'Could not reach the licence provider.' }, 502);
    }

    // Pass Creem's answer through as-is, including its status code. The reader
    // functions in background.js are written against Creem's shape, so
    // reshaping it here would put the same knowledge in two places.
    //
    // One exception: Creem returns 401 when *our* API key is bad. Relaying
    // that verbatim would tell a paying customer their key is unauthorised
    // when the fault is ours, so it becomes a 500 with our own wording.
    if (res.status === 401) return json({ error: 'Licence server is not configured.' }, 500);

    return json(data, res.status);
  },
};
