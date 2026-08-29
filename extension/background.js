const NOTEBOOKLM_PATTERN = 'https://notebooklm.google.com/*';

async function activeNotebookLmTab() {
  const tabs = await chrome.tabs.query({ url: NOTEBOOKLM_PATTERN });
  return tabs.find((tab) => tab.active) ?? tabs[0] ?? null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'amb:open-or-inspect') return;
  (async () => {
    let tab = await activeNotebookLmTab();
    if (!tab) tab = await chrome.tabs.create({ url: 'https://notebooklm.google.com/' });
    await chrome.tabs.update(tab.id, { active: true });
    sendResponse({ tabId: tab.id, opened: true });
  })().catch((error) => sendResponse({ error: error.message }));
  return true;
});
