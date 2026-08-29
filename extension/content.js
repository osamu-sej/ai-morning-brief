function normalized(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function inspectPage() {
  return {
    url: location.href,
    title: document.title,
    buttons: Array.from(document.querySelectorAll('button')).map((item) => ({
      text: normalized(item.innerText || item.getAttribute('aria-label')),
      disabled: item.disabled,
      visible: Boolean(item.offsetParent)
    })).filter((item) => item.text).slice(0, 100),
    inputs: Array.from(document.querySelectorAll('input')).map((item) => ({
      type: item.type,
      accept: item.accept || null,
      ariaLabel: item.getAttribute('aria-label'),
      visible: Boolean(item.offsetParent)
    })),
    dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).map((item) => normalized(item.innerText).slice(0, 1500)),
    editables: Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"]')).map((item) => ({
      tag: item.tagName,
      type: item.getAttribute('type'),
      placeholder: item.getAttribute('placeholder'),
      ariaLabel: item.getAttribute('aria-label'),
      contenteditable: item.getAttribute('contenteditable'),
      valueLength: (item.value ?? item.innerText ?? '').length,
      visible: Boolean(item.offsetParent),
      inDialog: Boolean(item.closest('[role="dialog"]')),
      html: item.outerHTML.slice(0, 600)
    })),
    text: normalized(document.body?.innerText).slice(0, 6000)
  };
}

function findCreateButton() {
  const buttons = Array.from(document.querySelectorAll('button'));
  return buttons.find((button) => /新規作成|Create new/i.test(normalized(button.innerText || button.getAttribute('aria-label'))));
}

function findAddSourceButton() {
  return Array.from(document.querySelectorAll('button')).find((button) => /ソースを追加|Add source/i.test(normalized(button.innerText || button.getAttribute('aria-label'))));
}

function findDropTargets() {
  const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find((item) => /ファイルをドロップ|Upload file/i.test(normalized(item.innerText)));
  if (!dialog) return [];
  const hint = Array.from(dialog.querySelectorAll('*')).find((item) => /ファイルをドロップ|Upload file/i.test(normalized(item.innerText)));
  return [...new Set([hint, hint?.parentElement, hint?.parentElement?.parentElement, dialog].filter(Boolean))];
}

function dispatchDrop(target, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  for (const type of ['dragenter', 'dragover', 'drop']) {
    target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }
}

function findPasteTextDialog() {
  return Array.from(document.querySelectorAll('[role="dialog"]')).find((item) => /コピーしたテキストを貼り付ける/i.test(normalized(item.innerText)));
}

function setInputValue(input, value) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function findInsertButton(dialog) {
  return Array.from(dialog.querySelectorAll('button')).find((button) => normalized(button.innerText || button.getAttribute('aria-label')) === '挿入');
}

function findAudioOverviewDialog() {
  return Array.from(document.querySelectorAll('[role="dialog"]')).find((item) => /音声解説をカスタマイズ|audio overview/i.test(normalized(item.innerText)));
}

function findGenerateAudioButton(dialog) {
  return Array.from(dialog.querySelectorAll('button')).find((button) => normalized(button.innerText || button.getAttribute('aria-label')) === '生成');
}

function sourceCount() {
  const match = normalized(document.body?.innerText).match(/(\d+)\s*件のソース/);
  return match ? Number(match[1]) : 0;
}

function visibleButtonMatching(pattern, scope = document) {
  return Array.from(scope.querySelectorAll('button')).find((button) => button.offsetParent && pattern.test(normalized(button.innerText || button.getAttribute('aria-label'))));
}

function waitFor(check, timeoutMs = 15_000, intervalMs = 250) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const poll = () => {
      const value = check();
      if (value) return resolve(value);
      if (Date.now() - startedAt >= timeoutMs) return resolve(null);
      window.setTimeout(poll, intervalMs);
    };
    poll();
  });
}

function setNotebookTitle(title) {
  const input = document.querySelector('input.title-input');
  if (!input || !title) return false;
  setInputValue(input, title);
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  return true;
}

async function addTextSource(text) {
  const before = sourceCount();
  const addSource = findAddSourceButton();
  if (!addSource) return { ok: false, error: '「ソースを追加」ボタンが見つかりません。' };
  addSource.click();
  const sourceDialog = await waitFor(() => Array.from(document.querySelectorAll('[role="dialog"]')).find((item) => /コピーしたテキスト|Copy pasted text/i.test(normalized(item.innerText))));
  if (!sourceDialog) return { ok: false, error: 'ソースの追加画面が開きませんでした。' };
  const copyText = visibleButtonMatching(/コピーしたテキスト|Copy pasted text/i, sourceDialog);
  if (!copyText) return { ok: false, error: '「コピーしたテキスト」選択肢が見つかりません。' };
  copyText.click();
  const pasteDialog = await waitFor(findPasteTextDialog);
  const input = pasteDialog?.querySelector('textarea, input[type="text"], [contenteditable="true"]');
  const insert = pasteDialog && findInsertButton(pasteDialog);
  if (!pasteDialog || !input || !insert) return { ok: false, error: '貼り付け入力欄または「挿入」ボタンが見つかりません。' };
  setInputValue(input, text);
  await waitFor(() => !insert.disabled, 5_000);
  await new Promise((resolve) => window.setTimeout(resolve, 750));
  insert.click();
  const inserted = await waitFor(() => !findPasteTextDialog() && sourceCount() > before, 25_000);
  return inserted
    ? { ok: true, sourceCount: sourceCount() }
    : { ok: false, error: 'ソース追加の完了を25秒以内に確認できませんでした。', sourceCount: sourceCount() };
}

async function automateDailyNotebook({ title, sources }) {
  const result = { titleSet: setNotebookTitle(title), sources: [] };
  for (const source of sources) {
    const added = await addTextSource(source.text);
    result.sources.push({ title: source.title, ...added });
    if (!added.ok) return { ...result, error: added.error, snapshot: inspectPage() };
  }
  const audioButton = visibleButtonMatching(/(^|\s)音声解説($|\s)|audio overview/i);
  if (!audioButton) return { ...result, error: '「音声解説」ボタンが見つかりません。', snapshot: inspectPage() };
  audioButton.click();
  const audioDialog = await waitFor(findAudioOverviewDialog);
  const generate = audioDialog && findGenerateAudioButton(audioDialog);
  if (!audioDialog || !generate || generate.disabled) return { ...result, error: '音声解説の設定画面または有効な「生成」ボタンが見つかりません。', snapshot: inspectPage() };
  generate.click();
  await new Promise((resolve) => window.setTimeout(resolve, 3000));
  return { ...result, generationRequested: true, snapshot: inspectPage() };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'amb:inspect') {
    sendResponse(inspectPage());
    return;
  }
  if (message?.type === 'amb:open-create-and-inspect') {
    const button = findCreateButton();
    if (!button) {
      sendResponse({ error: '「新規作成」ボタンが見つかりません。', snapshot: inspectPage() });
      return;
    }
    button.click();
    window.setTimeout(() => sendResponse(inspectPage()), 900);
    return true;
  }
  if (message?.type === 'amb:create-notebook') {
    const button = findCreateButton();
    if (!button) {
      sendResponse({ error: '「新規作成」ボタンが見つかりません。', snapshot: inspectPage() });
      return;
    }
    sendResponse({ creationRequested: true });
    button.click();
    return;
  }
  if (message?.type === 'amb:open-source-and-inspect') {
    const button = findAddSourceButton();
    if (!button) {
      sendResponse({ error: '「ソースを追加」ボタンが見つかりません。', snapshot: inspectPage() });
      return;
    }
    button.click();
    window.setTimeout(() => sendResponse(inspectPage()), 900);
    return true;
  }
  if (message?.type === 'amb:drop-markdown') {
    const targets = findDropTargets();
    if (targets.length === 0) {
      sendResponse({ error: 'ファイルをドロップするソース追加画面が見つかりません。' });
      return;
    }
    const file = new File([message.text], message.filename, { type: 'text/markdown' });
    targets.forEach((target) => dispatchDrop(target, file));
    window.setTimeout(() => sendResponse({ dropped: true, targetCount: targets.length, snapshot: inspectPage() }), 2500);
    return true;
  }
  if (message?.type === 'amb:paste-markdown') {
    const dialog = findPasteTextDialog();
    const input = dialog?.querySelector('textarea, input[type="text"], [contenteditable="true"]');
    const insert = dialog && findInsertButton(dialog);
    if (!dialog || !input || !insert) {
      sendResponse({ error: 'コピーしたテキストの入力欄または「挿入」ボタンが見つかりません。', snapshot: inspectPage() });
      return;
    }
    setInputValue(input, message.text);
    window.setTimeout(() => {
      insert.click();
      window.setTimeout(() => sendResponse({ inserted: true, snapshot: inspectPage() }), 4000);
    }, 750);
    return true;
  }
  if (message?.type === 'amb:generate-audio') {
    const dialog = findAudioOverviewDialog();
    const generate = dialog && findGenerateAudioButton(dialog);
    if (!dialog || !generate) {
      sendResponse({ error: '音声解説の設定画面または「生成」ボタンが見つかりません。', snapshot: inspectPage() });
      return;
    }
    if (generate.disabled) {
      sendResponse({ error: '「生成」ボタンがまだ有効になっていません。', snapshot: inspectPage() });
      return;
    }
    generate.click();
    window.setTimeout(() => sendResponse({ generationRequested: true, snapshot: inspectPage() }), 3000);
    return true;
  }
  if (message?.type === 'amb:automate-daily') {
    automateDailyNotebook({ title: message.title, sources: message.sources ?? [] })
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message, snapshot: inspectPage() }));
    return true;
  }
});
