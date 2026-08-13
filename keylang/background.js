// Re-assert popup and enabled state on every service-worker wakeup —
// clears any persisted disabled/no-popup state from older installs.
try { chrome.action.setPopup({ popup: 'popup.html' }); } catch {}
try { chrome.action.enable(); } catch {}

// Open uninstall survey when the extension is removed.
// Replace the URL with your Google Form or survey page.
chrome.runtime.setUninstallURL('https://docs.google.com/forms/d/e/1FAIpQLScfDa6ZKDuV1dYR-XMQGn4r_YISIR3uaJKqyVK0qDN7S65OyA/viewform');

// Recreate context menu on every service-worker startup.
// Remove the specific item first (checking lastError), then create it.
chrome.contextMenus.remove('kiko-fix', () => {
  void chrome.runtime.lastError; // "not found" on first install — safe to ignore
  chrome.contextMenus.create(
    { id: 'kiko-fix', title: '🦜 Fix with Kiko', contexts: ['selection'] },
    () => void chrome.runtime.lastError
  );
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }

  // Stamp when this user first installed, and which version they arrived on.
  // Written on update too, so people already running an older build are still
  // recorded rather than looking like brand-new installs. Purely local: nothing
  // is sent anywhere. This only has to exist from the first published version —
  // added later, every existing user is indistinguishable from a new one, and
  // there is no way to tell early adopters apart if terms ever change.
  try {
    const { firstInstall } = await chrome.storage.local.get('firstInstall');
    if (!firstInstall) {
      await chrome.storage.local.set({
        firstInstall: { at: Date.now(), version: chrome.runtime.getManifest().version }
      });
    }
  } catch {}

  // Tell the people who installed Kiko when it was free that it now costs
  // something. They agreed to no such thing, and an auto-update that silently
  // starts a countdown is not an announcement. Everyone who installs from here
  // on sees the price on the listing and on welcome.html, so this is for the
  // earlier crowd only, exactly once, keyed off the version in their stamp
  // rather than details.previousVersion — which says 4.5.0 for anyone who has
  // already taken that update and would miss them entirely.
  if (details.reason === 'update' && PAYWALL_ENABLED) {
    try {
      const { firstInstall, paywallNotice } =
        await chrome.storage.local.get(['firstInstall', 'paywallNotice']);
      if (!paywallNotice && trialLengthFor(firstInstall) !== TRIAL_DAYS) {
        await chrome.storage.local.set({ paywallNotice: { shownAt: Date.now() } });
        chrome.tabs.create({ url: chrome.runtime.getURL('whats-new.html') });
      }
    } catch {}
  }

  await refreshEntitlement({ force: true });

  // Re-inject content.js into all existing tabs so users don't need to refresh
  // after an extension update. The new content.js version-guards itself via
  // window.__kikoActive so it safely overwrites the old orphaned script.
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;
    chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['content.js']
    }).catch(() => {});
  }
});

// ── Trial and licence ─────────────────────────────────────────
// Entitlement is computed here, in one place, and written to storage as a
// plain object. content.js and the popup only ever read it — they never
// recompute, so there is no second copy of this logic to drift.
//
// Licence checks go through our own Worker, which holds the provider's API
// key — see the LICENCE_PROVIDER block below for why. Its host is already
// covered by the existing <all_urls> permission, which matters: adding a host
// permission would disable the extension for every current user until they
// re-approved it.

// Master switch for the paywall. False means everyone keeps working, the
// trial never expires, and nobody is asked for money.
//
// Off right now because Lemon Squeezy declined the store, which leaves the
// extension able to withhold a feature with no way for anyone to pay for it.
// Detection stopping in October with a dead Subscribe button is the worst
// outcome available, and far worse than earning nothing for a few weeks.
//
// There is no server, so entitlement can only be changed by shipping a build
// through review. That is the whole reason this is a switch rather than
// something to sort out later: turning the paywall back on will take days'
// notice, and so does turning it off.
const PAYWALL_ENABLED = false;

const TRIAL_DAYS   = 30;           // what the site, the listing and the popup promise
const LEGACY_DAYS  = 60;           // for people who were already here when Kiko was free
const PAYWALL_VER  = '4.5.0';      // the first build that can withhold anything
const DAY_MS       = 86400000;
const RECHECK_MS   = DAY_MS;       // don't hit the API more than once a day
const GRACE_MS     = 7 * DAY_MS;   // keep a valid licence working while offline
// ── Licence provider ──────────────────────────────────────────
// Everything specific to whoever sells Kiko lives in this one object, because
// it has already had to change once and will likely change again.
//
// The requirement that shapes all of this: nothing secret can ship inside the
// extension. Anything installed on someone's computer can be read off it, so
// an API key in here is a published API key.
//
// Lemon Squeezy's licence endpoints needed no key, so Kiko called them
// directly. Creem's need one — their own docs say not to put it in client-side
// code — so Kiko now calls a Cloudflare Worker (worker/kiko-licence.js) that
// holds the key and forwards the request. The Worker makes no decisions; it
// only adds the header. Every judgement about who is entitled to what stays
// here, where the tests are.
//
// The upside of having been forced into a proxy: the next provider change is
// a Worker redeploy, not another extension release waiting on store review.
//
// To move provider: change the URLs and bodies below, the readers underneath
// if their JSON differs, and CREEM_BASE in the Worker. Nothing else in the
// extension knows who takes the money.
const LICENCE_PROVIDER = {
  name:        'Creem',
  activateUrl: 'https://kiko-licence.itay-c84.workers.dev/activate',
  validateUrl: 'https://kiko-licence.itay-c84.workers.dev/validate',

  // Creem wants JSON, Lemon Squeezy wanted form encoding. Kept as provider
  // data rather than hardcoded at the fetch sites, since it is exactly the
  // kind of thing that differs between providers.
  contentType: 'application/json',
  encode:      (obj) => JSON.stringify(obj),

  // Field names the provider expects. Creem calls the key `key`; Lemon
  // Squeezy called it `license_key`.
  activateBody: (key) => ({ key, instance_name: 'kiko-browser' }),
  validateBody: (key, instanceId) => ({ key, instance_id: instanceId || '' }),

  // Readers for the provider's response shape.
  //
  // Each returns a plain answer to a plain question. Written defensively: a
  // provider that changes its shape without warning must not be able to
  // revoke a paying user's licence by returning something unexpected.
  //
  // Creem answers both activate and validate with the same licence object and
  // no boolean — `status` carries everything. It can be 'active', 'inactive',
  // 'expired' or 'disabled'; only the first entitles.
  didActivate:  (d) => d.status === 'active',
  isValid:      (d) => d.status === 'active',
  // Creem's docs show `instance` as an array; a real activation returns it as
  // a single object. Both are handled because the docs cannot be trusted here
  // and the cost of guessing wrong is that instanceId comes back undefined,
  // every later validation is malformed, and the customer is expired while
  // still paying. If it ever is an array, activation appends, so the one just
  // created is the last.
  instanceIdOf: (d) => Array.isArray(d.instance)
    ? (d.instance[d.instance.length - 1] || {}).id
    : (d.instance && d.instance.id),
  statusOf:     (d) => d.status || 'unknown',
  // Providers put the useful message — "activation limit reached" and the like
  // — in different places. Whatever comes back gets shown to the user, because
  // it is usually the only thing that tells them what to do next.
  errorOf:      (d) => d.error || d.message || null,
};

// Creem's error codes, turned into something a person can act on. Without
// this, someone who has used all their activations is told "that key could
// not be activated", which is true and useless.
// Which validation responses are allowed to take a licence away.
//
// A 2xx speaks for itself, and 403/404/410 mean the key is genuinely gone —
// seat limit, unknown key, expired or cancelled. Everything else is our fault:
// a malformed request, our Worker misconfigured, Creem unreachable. Billing
// someone while locking them out over our own bug is the worst thing this file
// can do, so anything inconclusive leaves the previous result standing.
//
// This is not hypothetical. The Worker rejects a blank instance_id with a 400,
// and instanceId is blank whenever activation returned a shape we failed to
// read. Without this, that bug would quietly expire every paying user a day
// after they subscribed.
const LICENCE_REVOKED_CODES = new Set([403, 404, 410]);

function mayRevokeLicence(status) {
  return (status >= 200 && status < 300) || LICENCE_REVOKED_CODES.has(status);
}

const LICENCE_HTTP_ERRORS = {
  403: 'This key is already in use on the maximum number of browsers. Remove one from your account, or contact support.',
  404: 'We do not recognise that licence key. Check it for typos.',
  410: 'This licence has expired or been cancelled.',
};

function computeEntitlement(firstInstall, licence, now = Date.now(), paywallStart = null) {
  // Paywall off: everyone is entitled, and the popup shows no countdown and
  // no price. 'licensed' rather than a fake trial, because a trial implies a
  // deadline we cannot currently honour either way.
  if (!PAYWALL_ENABLED) return { entitled: true, state: 'licensed', daysLeft: null };

  // A licence that validated recently, or within the offline grace window,
  // entitles regardless of the trial. Fail toward letting people work.
  if (licence && licence.valid && now - (licence.checkedAt || 0) < RECHECK_MS + GRACE_MS) {
    return { entitled: true, state: 'licensed', daysLeft: null };
  }
  const start    = trialStartedAt(firstInstall, paywallStart, now);
  const total    = trialLengthFor(firstInstall);
  const daysLeft = total - Math.floor((now - start) / DAY_MS);
  return {
    entitled: daysLeft > 0,
    state: daysLeft > 0 ? 'trial' : 'expired',
    daysLeft: Math.max(0, daysLeft),
  };
}

// When the clock starts.
//
// It used to start at install, which is fine for someone who installs a build
// that already charges — but ruinous for everyone else. Kiko has run free for
// months; on the day the paywall is switched on, every existing user's install
// date is already far past any trial length, so all of them would be expired at
// once, mid-sentence, with no warning. That is the single worst thing this file
// could do, and nothing in the UI would have hinted it was coming.
//
// So the clock starts at whichever came later: the install, or the first time
// this user ran a build that can charge. A new user's two stamps are minutes
// apart and the behaviour is unchanged; an existing user gets their full trial
// beginning the day they are first told there is one.
function trialStartedAt(firstInstall, paywallStart, now = Date.now()) {
  const installed = (firstInstall && firstInstall.at) || now;
  const told      = (paywallStart && paywallStart.at)  || now;
  return Math.max(installed, told);
}

// How long that clock runs, by what the user was promised when they arrived.
//
// Kiko was free through 4.4.x, so those people never agreed to any trial at
// all: they get 60 days. Everyone from 4.5.0 on was shown 30 on the site, the
// listing and the popup, and gets 30.
//
// If the advertised figure is ever changed, add a gate here rather than
// editing TRIAL_DAYS. Shortening a trial under people already inside it takes
// back a published promise they have no way of knowing was withdrawn.
function trialLengthFor(firstInstall) {
  const stamped = firstInstall && firstInstall.version;
  if (!stamped) return TRIAL_DAYS;   // no stamp: treat as new, the current promise
  if (versionBelow(stamped, PAYWALL_VER)) return LEGACY_DAYS;
  return TRIAL_DAYS;
}

function versionBelow(stamped, gate) {
  const got  = String(stamped).split('.').map(n => parseInt(n, 10) || 0);
  const want = gate.split('.').map(Number);
  for (let i = 0; i < want.length; i++) {
    if ((got[i] || 0) !== want[i]) return (got[i] || 0) < want[i];
  }
  return false;                      // exactly the gate version is not below it
}

async function refreshEntitlement({ force = false } = {}) {
  let firstInstall, licence, paywallStart;
  try {
    ({ firstInstall, licence, paywallStart } =
      await chrome.storage.local.get(['firstInstall', 'licence', 'paywallStart']));
  } catch { return null; }

  // The day this user first ran a build that can charge. Written here rather
  // than in onInstalled because the service worker wakes far more often than
  // the extension updates, so it is recorded even for someone who never
  // restarts Chrome around an update. Written once and never moved.
  //
  // Only while the paywall is on: stamping it during a free build would start
  // everyone's clock invisibly, months before they are told anything, which is
  // exactly the failure this exists to prevent.
  if (PAYWALL_ENABLED && !paywallStart) {
    paywallStart = { at: Date.now(), version: chrome.runtime.getManifest().version };
    try { await chrome.storage.local.set({ paywallStart }); } catch {}
  }

  // Re-validate a stored key at most daily. A network failure leaves the
  // previous result untouched so the grace window in computeEntitlement can
  // carry a paying user through an outage.
  if (licence && licence.key && (force || Date.now() - (licence.checkedAt || 0) > RECHECK_MS)) {
    try {
      const res  = await fetch(LICENCE_PROVIDER.validateUrl, {
        method: 'POST',
        headers: { 'Content-Type': LICENCE_PROVIDER.contentType, Accept: 'application/json' },
        body: LICENCE_PROVIDER.encode(
          LICENCE_PROVIDER.validateBody(licence.key, licence.instanceId)),
      });
      const data = await res.json();
      // Only an answer that actually says something about this licence may
      // take it away — see mayRevokeLicence. Anything inconclusive is treated
      // exactly like being offline: keep the last known result and let the
      // grace window carry them.
      if (!mayRevokeLicence(res.status)) {
        throw new Error(`licence check inconclusive (${res.status})`);
      }
      licence = {
        ...licence,
        valid: LICENCE_PROVIDER.isValid(data),
        status: LICENCE_PROVIDER.statusOf(data),
        checkedAt: Date.now(),
      };
      await chrome.storage.local.set({ licence });
    } catch {
      // offline or API down — keep the last known result
    }
  }

  const entitlement = computeEntitlement(firstInstall, licence, Date.now(), paywallStart);
  try { await chrome.storage.local.set({ entitlement }); } catch {}
  updateBadge(entitlement);
  return entitlement;
}

// ── Toolbar badge ─────────────────────────────────────────────
// Until now the trial existed only inside the popup, which hardly anyone
// opens. A number on the icon costs nothing, needs no permission, and means
// the last week can't pass unnoticed.
const BADGE_WARN_DAYS = 7;

function updateBadge(ent) {
  try {
    if (ent && ent.state === 'expired') {
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
      chrome.action.setBadgeText({ text: '!' });
      return;
    }
    if (ent && ent.state === 'trial' && ent.daysLeft != null && ent.daysLeft <= BADGE_WARN_DAYS) {
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
      chrome.action.setBadgeText({ text: String(ent.daysLeft) });
      return;
    }
    // Licensed, or plenty of time left: no badge at all.
    chrome.action.setBadgeText({ text: '' });
  } catch {}
}

async function activateLicence(key) {
  const clean = String(key || '').trim();
  if (!clean) return { ok: false, error: 'Enter a licence key.' };
  try {
    const res = await fetch(LICENCE_PROVIDER.activateUrl, {
      method: 'POST',
      headers: { 'Content-Type': LICENCE_PROVIDER.contentType, Accept: 'application/json' },
      body: LICENCE_PROVIDER.encode(LICENCE_PROVIDER.activateBody(clean)),
    });
    const data = await res.json();
    // Creem says why in the status code, not the body. Prefer our wording for
    // the three that have a clear cause and a clear next step.
    if (LICENCE_HTTP_ERRORS[res.status]) {
      return { ok: false, error: LICENCE_HTTP_ERRORS[res.status] };
    }
    if (!LICENCE_PROVIDER.didActivate(data)) {
      // The provider's own message carries the reason — a seat limit already
      // used, a key that was refunded — and that is what the user needs.
      return { ok: false, error: LICENCE_PROVIDER.errorOf(data) || 'That key could not be activated.' };
    }
    await chrome.storage.local.set({
      licence: {
        key: clean,
        instanceId: LICENCE_PROVIDER.instanceIdOf(data),
        valid: true,
        status: LICENCE_PROVIDER.statusOf(data),
        checkedAt: Date.now(),
      },
    });
    const entitlement = await refreshEntitlement();
    return { ok: true, entitlement };
  } catch {
    return { ok: false, error: 'Could not reach the licence server. Check your connection.' };
  }
}

// Recompute whenever the worker wakes, so an expiring trial takes effect
// without needing the popup to be opened.
refreshEntitlement();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'kiko-fix') {
    chrome.tabs.sendMessage(tab.id, {
      type: 'kiko-fix-selection',
      text: info.selectionText
    }, { frameId: info.frameId || 0 }, () => void chrome.runtime.lastError);
  }
});

// ── Sound via offscreen document ──────────────────────────────
// AudioContext is blocked in content scripts by Chrome's autoplay
// policy. Offscreen documents don't have this restriction.

async function ensureOffscreen() {
  try {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existing.length === 0) {
      await chrome.offscreen.createDocument({
        url:           'offscreen.html',
        reasons:       ['AUDIO_PLAYBACK'],
        justification: 'Kiko detection alert sound'
      });
    }
  } catch {}
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'kiko-feedback') {
    // Return true to keep the service worker alive until the fetch completes.
    // Without this, Chrome can terminate the worker before the POST goes out.
    fetch(msg.url, { method: 'POST', body: msg.body })
      .catch(() => {})
      .finally(() => sendResponse());
    return true;
  }
  if (msg.type === 'kiko-activate-licence') {
    activateLicence(msg.key).then(sendResponse);
    return true;
  }
  if (msg.type === 'kiko-refresh-entitlement') {
    refreshEntitlement({ force: !!msg.force }).then(e => sendResponse(e));
    return true;
  }
  if (msg.type !== 'kiko-play-sound') return;
  ensureOffscreen().then(() => {
    chrome.runtime.sendMessage({ type: 'kiko-play-sound' }).catch(() => {});
  });
  sendResponse();
});
