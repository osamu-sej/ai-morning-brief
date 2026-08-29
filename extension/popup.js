const result = document.querySelector('#result');

document.querySelector('#inspect').addEventListener('click', async () => {
  result.textContent = 'NotebookLMを開いています…';
  const opened = await chrome.runtime.sendMessage({ type: 'amb:open-or-inspect' });
  if (opened.error) {
    result.textContent = `エラー: ${opened.error}`;
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 1200));
  try {
    const snapshot = await chrome.tabs.sendMessage(opened.tabId, { type: 'amb:inspect' });
    result.textContent = JSON.stringify(snapshot, null, 2);
  } catch {
    result.textContent = 'NotebookLMのページ読み込み後、もう一度ボタンを押してください。';
  }
});
