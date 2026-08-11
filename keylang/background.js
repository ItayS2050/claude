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
      if (!paywallNotice && isLegacyUser(firstInstall)) {
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
// Lemon Squeezy's licence endpoints are designed to be called from a client
// and need no API key, so there is no server of ours in the loop. The host is
// already covered by the existing <all_urls> permission, which matters: adding
// a host permission would disable the extension for every current user until
// they re-approved it.

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
// The requirement that rules most providers out: activation and validation
// have to be callable straight from the extension, with no secret key. A
// secret in a content script is not a secret, and needing a server to hold
// one would mean running a backend purely to check licences — the thing this
// design exists to avoid. Lemon Squeezy, Polar, Creem and Gumroad all publish
// client-callable licence endpoints; Paddle does not issue licence keys at
// all, and adopting it means building that server.
//
// To move provider: change the four fields below and, if their JSON differs,
// the two readers underneath. Nothing else in the extension knows who takes
// the money.
const LICENCE_PROVIDER = {
  name:        'Lemon Squeezy',
  activateUrl: 'https://api.lemonsqueezy.com/v1/licenses/activate',
  validateUrl: 'https://api.lemonsqueezy.com/v1/licenses/validate',

  // Form fields the provider expects. Named here rather than inline so a
  // provider using different parameter names is a data change, not a code one.
  activateBody: (key) => ({ license_key: key, instance_name: 'kiko-browser' }),
  validateBody: (key, instanceId) =>
    instanceId ? { license_key: key, instance_id: instanceId } : { license_key: key },

  // Readers for the provider's response shape.
  //
  // Each returns a plain answer to a plain question, so a provider that says
  // { success: true } instead of { activated: true } is a one-line edit here
  // and nothing else. Written defensively: a provider that changes its shape
  // without warning must not be able to revoke a paying user's licence by
  // returning something unexpected.
  didActivate:  (d) => d.activated === true,
  isValid:      (d) => d.valid === true,
  instanceIdOf: (d) => d.instance && d.instance.id,
  statusOf:     (d) => (d.license_key && d.license_key.status) || 'unknown',
  // Providers put the useful message — "activation limit reached" and the like
  // — in different places. Whatever comes back gets shown to the user, because
  // it is usually the only thing that tells them what to do next.
  errorOf:      (d) => d.error || null,
};

function computeEntitlement(firstInstall, licence, now = Date.now()) {
  // Paywall off: everyone is entitled, and the popup shows no countdown and
  // no price. 'licensed' rather than a fake trial, because a trial implies a
  // deadline we cannot currently honour either way.
  if (!PAYWALL_ENABLED) return { entitled: true, state: 'licensed', daysLeft: null };

  // A licence that validated recently, or within the offline grace window,
  // entitles regardless of the trial. Fail toward letting people work.
  if (licence && licence.valid && now - (licence.checkedAt || 0) < RECHECK_MS + GRACE_MS) {
    return { entitled: true, state: 'licensed', daysLeft: null };
  }
  const start    = (firstInstall && firstInstall.at) || now;
  const total    = isLegacyUser(firstInstall) ? LEGACY_DAYS : TRIAL_DAYS;
  const daysLeft = total - Math.floor((now - start) / DAY_MS);
  return {
    entitled: daysLeft > 0,
    state: daysLeft > 0 ? 'trial' : 'expired',
    daysLeft: Math.max(0, daysLeft),
  };
}

// Kiko was free through 4.4.x, and the install stamp predates the paywall, so
// for those users the clock had already been running for weeks before anyone
// told them there was one. Give them double the runway rather than expiring
// people who never agreed to a trial. New installs get the advertised 30 days.
function isLegacyUser(firstInstall) {
  const stamped = firstInstall && firstInstall.version;
  if (!stamped) return false;   // no stamp: treat as new, which is the safe promise
  const got  = String(stamped).split('.').map(n => parseInt(n, 10) || 0);
  const gate = PAYWALL_VER.split('.').map(Number);
  for (let i = 0; i < gate.length; i++) {
    if ((got[i] || 0) !== gate[i]) return (got[i] || 0) < gate[i];
  }
  return false;                 // exactly the paywall version: a new user
}

async function refreshEntitlement({ force = false } = {}) {
  let firstInstall, licence;
  try {
    ({ firstInstall, licence } = await chrome.storage.local.get(['firstInstall', 'licence']));
  } catch { return null; }

  // Re-validate a stored key at most daily. A network failure leaves the
  // previous result untouched so the grace window in computeEntitlement can
  // carry a paying user through an outage.
  if (licence && licence.key && (force || Date.now() - (licence.checkedAt || 0) > RECHECK_MS)) {
    try {
      const res  = await fetch(LICENCE_PROVIDER.validateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(
          LICENCE_PROVIDER.validateBody(licence.key, licence.instanceId)),
      });
      const data = await res.json();
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

  const entitlement = computeEntitlement(firstInstall, licence);
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(LICENCE_PROVIDER.activateBody(clean)),
    });
    const data = await res.json();
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
