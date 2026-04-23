chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'kiko-fix',
    title: '🦜 Fix with Kiko',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'kiko-fix') {
    chrome.tabs.sendMessage(tab.id, {
      type: 'kiko-fix-selection',
      text: info.selectionText
    });
  }
});
