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

const TRIAL_DAYS   = 30;
const DAY_MS       = 86400000;
const RECHECK_MS   = DAY_MS;       // don't hit the API more than once a day
const GRACE_MS     = 7 * DAY_MS;   // keep a valid licence working while offline
const LS_API       = 'https://api.lemonsqueezy.com/v1/licenses';

function computeEntitlement(firstInstall, licence, now = Date.now()) {
  // A licence that validated recently, or within the offline grace window,
  // entitles regardless of the trial. Fail toward letting people work.
  if (licence && licence.valid && now - (licence.checkedAt || 0) < RECHECK_MS + GRACE_MS) {
    return { entitled: true, state: 'licensed', daysLeft: null };
  }
  const start    = (firstInstall && firstInstall.at) || now;
  const daysLeft = TRIAL_DAYS - Math.floor((now - start) / DAY_MS);
  return {
    entitled: daysLeft > 0,
    state: daysLeft > 0 ? 'trial' : 'expired',
    daysLeft: Math.max(0, daysLeft),
  };
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
      const body = new URLSearchParams({ license_key: licence.key });
      if (licence.instanceId) body.set('instance_id', licence.instanceId);
      const res  = await fetch(`${LS_API}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
      });
      const data = await res.json();
      licence = {
        ...licence,
        valid: data.valid === true,
        status: (data.license_key && data.license_key.status) || 'unknown',
        checkedAt: Date.now(),
      };
      await chrome.storage.local.set({ licence });
    } catch {
      // offline or API down — keep the last known result
    }
  }

  const entitlement = computeEntitlement(firstInstall, licence);
  try { await chrome.storage.local.set({ entitlement }); } catch {}
  return entitlement;
}

async function activateLicence(key) {
  const clean = String(key || '').trim();
  if (!clean) return { ok: false, error: 'Enter a licence key.' };
  try {
    const res = await fetch(`${LS_API}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ license_key: clean, instance_name: 'kiko-browser' }),
    });
    const data = await res.json();
    if (!data.activated) {
      // Lemon Squeezy returns the seat-limit message here when a team licence
      // is already fully used, which is exactly what the user needs to read.
      return { ok: false, error: (data.error || 'That key could not be activated.') };
    }
    await chrome.storage.local.set({
      licence: {
        key: clean,
        instanceId: data.instance && data.instance.id,
        valid: true,
        status: (data.license_key && data.license_key.status) || 'active',
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
