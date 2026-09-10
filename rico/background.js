// The service worker. Three jobs, all of them small.
importScripts('ExtPay.js', 'storage.js', 'pay.js');

Rico.pay.start();

// 1. First run. Three example snippets so the first ⌘⇧K has something to show,
//    and the welcome page that explains where the shortcut lives.
chrome.runtime.onInstalled.addListener(async (details) => {
  await Rico.storage.seedOnce();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

// 2. The global shortcut fallback.
//
//    The palette normally opens from a keydown listener inside the page, which
//    is the only way to catch a key while the caret is in Gmail's compose box.
//    When something shadows that listener there is no second chance from
//    inside the page — hence a chrome.commands binding as a backstop.
//
//    It is deliberately NOT the same combo as the in-page shortcut. Chrome
//    reserves Ctrl/Cmd+K for omnibox search and will not hand it to an
//    extension, so a commands entry claiming it would silently never fire.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'open-palette' || !tab || !tab.id) return;
  // Sent to every frame; the one holding the focused compose box answers, the
  // rest ignore it. Gmail puts compose in an iframe often enough that
  // targeting the top frame alone would miss.
  chrome.tabs.sendMessage(tab.id, { type: 'rico:open' }, () => {
    void chrome.runtime.lastError;   // no content script on this tab yet
  });
});

// 3. Answering the palette and the popup.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return false;

  switch (msg.type) {
    case 'rico:status':
      // The palette asks this on open. It has to be a cache read and nothing
      // else — see pay.js.
      Rico.pay.status().then(sendResponse);
      return true;

    case 'rico:refresh-pay':
      Rico.pay.refresh({ force: !!msg.force }).then(sendResponse);
      return true;

    case 'rico:upgrade':
      Rico.pay.openPaymentPage().then((ok) => sendResponse({ ok }));
      return true;

    case 'rico:touch':
      Rico.storage.touch(msg.id).then(() => sendResponse({ ok: true }));
      return true;

    default:
      return false;
  }
});

// One unpaid check per service-worker start, at most once a day inside
// refresh(). No alarms permission for this: the worker wakes on every message
// the palette and popup send, which is far more often than daily, and a
// permission the store has to review is a poor trade for a timer.
Rico.pay.refresh();
