const NOTEBOOKLM_PATTERN = 'https://notebooklm.google.com/*';

async function activeNotebookLmTab() {
  const tabs = await chrome.tabs.query({ url: NOTEBOOKLM_PATTERN });
  return tabs.find((tab) => tab.active) ?? tabs[0] ?? null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'amb:active-notebooklm') return;
  (async () => {
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = activeTabs[0];
    if (activeTab?.url?.startsWith('https://notebooklm.google.com/')) {
      sendResponse({ tabId: activeTab.id });
      return;
    }
    const tab = await activeNotebookLmTab();
    sendResponse(tab ? { tabId: tab.id, inactive: true } : { error: 'NotebookLMのタブを開いてから、もう一度実行してください。' });
  })().catch((error) => sendResponse({ error: error.message }));
  return true;
});
