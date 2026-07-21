// Re-assert popup and enabled state on every service-worker wakeup —
// clears any persisted disabled/no-popup state from older installs.
try { chrome.action.setPopup({ popup: 'popup.html' }); } catch {}
try { chrome.action.enable(); } catch {}

// Open uninstall survey when the extension is removed.
// Replace the URL with your Google Form or survey page.
chrome.runtime.setUninstallURL('https://docs.google.com/forms/d/1LaHVWw5GZl5tcF16uMcaP2U7I3EHh4uhgwPHj9I9gGA/viewform');

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
  if (msg.type !== 'kiko-play-sound') return;
  ensureOffscreen().then(() => {
    chrome.runtime.sendMessage({ type: 'kiko-play-sound' }).catch(() => {});
  });
  sendResponse();
});
