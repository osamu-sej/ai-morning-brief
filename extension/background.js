const NOTEBOOK_PATTERNS = ['https://notebooklm.google.com/*', 'https://notebook.google.com/*'];

function isNotebookUrl(url) {
  return url?.startsWith('https://notebooklm.google.com/') || url?.startsWith('https://notebook.google.com/');
}

async function activeNotebookLmTab() {
  const tabs = await chrome.tabs.query({ url: NOTEBOOK_PATTERNS });
  return tabs.find((tab) => tab.active) ?? tabs[0] ?? null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'amb:active-notebooklm') return;
  (async () => {
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = activeTabs[0];
    if (isNotebookUrl(activeTab?.url)) {
      sendResponse({ tabId: activeTab.id });
      return;
    }
    const tab = await activeNotebookLmTab();
    sendResponse(tab ? { tabId: tab.id, inactive: true } : { error: 'NotebookLMのタブを開いてから、もう一度実行してください。' });
  })().catch((error) => sendResponse({ error: error.message }));
  return true;
});
