// Tests for the licence proxy.
//
// This Worker is the only place the Creem API key exists, so the things worth
// asserting are mostly about what it refuses: unknown paths, smuggled fields,
// and leaking the key or Creem's 401 back to a customer.
//
// Run: node worker/test-worker.js

// The Worker is an ES module because that is what Cloudflare runs. Rather than
// keep a second CommonJS copy that could drift, load the real file and swap its
// one export statement for a return.
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'kiko-licence.js'), 'utf8')
              .replace('export default {', 'return {');
const ctx = vm.createContext({ URL, Response, Request, Headers, JSON, console,
                               get fetch() { return global.fetch; } });
const worker = vm.runInContext(`(function () {\n${src}\n})()`, ctx);

let pass = 0, fail = 0;

function is(label, got, want) {
  if (got === want) { pass++; return; }
  fail++;
  console.log(`  FAIL  ${label}`);
  console.log(`        expected ${JSON.stringify(want)}`);
  console.log(`        actual   ${JSON.stringify(got)}`);
}

const KEY = 'creem_test_SECRET';
const env = { CREEM_API_KEY: KEY, CREEM_MODE: 'test' };

// Stand-in for Creem. Records what it was called with so the tests can assert
// on the outgoing request, and answers with whatever the case needs.
function stubCreem(status, body) {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return { status, json: async () => body };
  };
  return calls;
}

const post = (path, body) => new Request(`https://w.example${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

async function read(res) {
  return { status: res.status, body: await res.json().catch(() => null) };
}

(async () => {
  console.log('Routing');
  {
    stubCreem(200, {});
    const r = await read(await worker.fetch(post('/nope', { key: 'K' }), env));
    is('an unknown path is 404', r.status, 404);

    const g = await worker.fetch(new Request('https://w.example/validate'), env);
    is('GET is refused', g.status, 405);

    const o = await worker.fetch(
      new Request('https://w.example/validate', { method: 'OPTIONS' }), env);
    is('preflight is allowed', o.status, 200);
    is('preflight carries CORS',
       o.headers.get('Access-Control-Allow-Origin'), '*');

    stubCreem(200, { status: 'active' });
    const t = await read(await worker.fetch(
      post('/validate/', { key: 'K', instance_id: 'i1' }), env));
    is('a trailing slash still routes', t.status, 200);
  }

  console.log('Input handling');
  {
    stubCreem(200, {});
    is('non-JSON is 400',
       (await read(await worker.fetch(post('/validate', 'not json'), env))).status, 400);
    is('a missing field is 400',
       (await read(await worker.fetch(post('/validate', { key: 'K' }), env))).status, 400);
    is('an empty field is 400',
       (await read(await worker.fetch(
         post('/validate', { key: 'K', instance_id: '   ' }), env))).status, 400);
    is('a non-string field is 400',
       (await read(await worker.fetch(
         post('/validate', { key: 'K', instance_id: 42 }), env))).status, 400);
  }

  console.log('Only the named fields reach Creem');
  {
    // Whatever else a caller puts in the body must be dropped. Forwarding
    // arbitrary fields to an authenticated endpoint is how a thin proxy turns
    // into someone else's API key.
    const calls = stubCreem(200, { status: 'active' });
    await worker.fetch(post('/activate', {
      key: 'K', instance_name: 'kiko-browser',
      activation_limit: 9999, status: 'active', mode: 'live',
    }), env);
    const sent = JSON.parse(calls[0].init.body);
    is('the key is forwarded',      sent.key, 'K');
    is('the instance is forwarded', sent.instance_name, 'kiko-browser');
    is('nothing else is forwarded', Object.keys(sent).length, 2);
    is('smuggled fields are gone',  sent.activation_limit, undefined);

    // Licence keys get pasted, and pasting picks up whitespace.
    const c2 = stubCreem(200, { status: 'active' });
    await worker.fetch(post('/activate',
      { key: '  K  ', instance_name: ' kiko-browser ' }), env);
    is('fields are trimmed', JSON.parse(c2[0].init.body).key, 'K');
  }

  console.log('The API key is attached and never returned');
  {
    const calls = stubCreem(200, { status: 'active', key: 'ABC' });
    const r = await read(await worker.fetch(
      post('/validate', { key: 'ABC', instance_id: 'i1' }), env));
    is('the key header is set', calls[0].init.headers['x-api-key'], KEY);
    is('it went to test-api',
       calls[0].url, 'https://test-api.creem.io/v1/licenses/validate');
    is('the response is passed through', r.body.status, 'active');
    is('the secret is not in the response',
       JSON.stringify(r.body).includes(KEY), false);
  }

  console.log('Live mode is opt-in');
  {
    const calls = stubCreem(200, { status: 'active' });
    await worker.fetch(post('/validate', { key: 'K', instance_id: 'i' }),
                       { ...env, CREEM_MODE: 'live' });
    is('live hits the live host',
       calls[0].url, 'https://api.creem.io/v1/licenses/validate');

    // Anything that is not exactly "live" must stay on test, so a typo in
    // wrangler.toml cannot quietly start charging real cards.
    const c2 = stubCreem(200, { status: 'active' });
    await worker.fetch(post('/validate', { key: 'K', instance_id: 'i' }),
                       { ...env, CREEM_MODE: 'Live' });
    is('a typo falls back to test',
       c2[0].url, 'https://test-api.creem.io/v1/licenses/validate');
  }

  console.log('Our failures are not blamed on the customer');
  {
    // Creem answers 401 when *our* key is wrong. Relayed as-is, the extension
    // would tell a paying user their licence is unauthorised.
    stubCreem(401, { error: 'Unauthorized' });
    const r = await read(await worker.fetch(
      post('/validate', { key: 'K', instance_id: 'i' }), env));
    is('a 401 from Creem becomes our 500', r.status, 500);
    is('and does not mention the key', /licence key/i.test(r.body.error), false);

    // No key configured at all: same reasoning, and we must not call Creem.
    const calls = stubCreem(200, {});
    const n = await read(await worker.fetch(
      post('/validate', { key: 'K', instance_id: 'i' }), { CREEM_MODE: 'test' }));
    is('no configured key is a 500', n.status, 500);
    is('and Creem is never called',  calls.length, 0);

    global.fetch = async () => { throw new Error('network down'); };
    const d = await read(await worker.fetch(
      post('/validate', { key: 'K', instance_id: 'i' }), env));
    is('an unreachable Creem is a 502', d.status, 502);
  }

  console.log('Real failures reach the extension intact');
  {
    // These three the extension turns into specific advice, so the status code
    // has to survive the trip.
    for (const code of [403, 404, 410]) {
      stubCreem(code, { error: 'nope' });
      const r = await read(await worker.fetch(
        post('/activate', { key: 'K', instance_name: 'kiko-browser' }), env));
      is(`HTTP ${code} is passed through`, r.status, code);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
