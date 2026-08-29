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

document.querySelector('#create-inspect').addEventListener('click', async () => {
  result.textContent = '新規作成画面を確認中…';
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.url?.startsWith('https://notebook.google.com/')) {
    result.textContent = 'Gemini Notebookのホーム画面を前面にしてください。';
    return;
  }
  try {
    const snapshot = await chrome.tabs.sendMessage(tab.id, { type: 'amb:open-create-and-inspect' });
    result.textContent = JSON.stringify(snapshot, null, 2);
  } catch (error) {
    result.textContent = `エラー: ${error.message}`;
  }
});

document.querySelector('#source-inspect').addEventListener('click', async () => {
  result.textContent = 'ソース追加画面を確認中…';
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.url?.startsWith('https://notebook.google.com/notebook/')) {
    result.textContent = '対象のGemini Notebookを前面にしてください。';
    return;
  }
  try {
    const snapshot = await chrome.tabs.sendMessage(tab.id, { type: 'amb:open-source-and-inspect' });
    result.textContent = JSON.stringify(snapshot, null, 2);
  } catch (error) {
    result.textContent = `エラー: ${error.message}`;
  }
});

document.querySelector('#upload-latest').addEventListener('click', async () => {
  result.textContent = 'ローカル日次資料を取得中…';
  try {
    const daily = await fetch('http://127.0.0.1:8765/v1/daily/latest').then(async (response) => {
      if (!response.ok) throw new Error(`ローカルブリッジ: ${response.status}`);
      return response.json();
    });
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.url?.startsWith('https://notebook.google.com/notebook/')) throw new Error('対象のGemini Notebookを前面にしてください。');
    result.textContent = 'Notebookへテスト投入中…';
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'amb:drop-markdown', filename: daily.filename, text: daily.text });
    result.textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    result.textContent = `エラー: ${error.message}`;
  }
});
