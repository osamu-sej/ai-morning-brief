const result = document.querySelector('#result');

document.querySelector('#inspect').addEventListener('click', async () => {
  result.textContent = '診断中…';
  const response = await chrome.runtime.sendMessage({ type: 'amb:active-notebooklm' });
  if (response.error) {
    result.textContent = `エラー: ${response.error}`;
    return;
  }
  if (response.inactive) {
    result.textContent = 'NotebookLMタブを前面にしてから、もう一度拡張機能を開いてください。';
    return;
  }
  try {
    const snapshot = await chrome.tabs.sendMessage(response.tabId, { type: 'amb:inspect' });
    result.textContent = JSON.stringify(snapshot, null, 2);
  } catch {
    result.textContent = 'NotebookLMのページ読み込み後、もう一度ボタンを押してください。';
  }
});
