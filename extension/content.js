function normalized(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function audioOverviewCandidates() {
  const pattern = /(^|\s)音声解説($|\s)|audio overview/i;
  return Array.from(document.querySelectorAll('*'))
    .filter((item) => item.offsetParent)
    .filter((item) => pattern.test(normalized(item.innerText || item.getAttribute('aria-label'))))
    .map((item) => {
      const rect = item.getBoundingClientRect();
      return {
        tag: item.tagName,
        role: item.getAttribute('role'),
        tabIndex: item.getAttribute('tabindex'),
        text: normalized(item.innerText || item.getAttribute('aria-label')),
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        html: item.outerHTML.slice(0, 700)
      };
    })
    .slice(0, 30);
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
    audioOverviewCandidates: audioOverviewCandidates(),
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
  const nativeButton = buttons.find((button) => /新規作成|Create new/i.test(normalized(button.innerText || button.getAttribute('aria-label'))));
  if (nativeButton) return nativeButton;
  const candidates = Array.from(document.querySelectorAll('[role="button"], [tabindex], *'))
    .filter((item) => item.offsetParent)
    .filter((item) => /新規作成|Create new/i.test(normalized(item.innerText || item.getAttribute('aria-label'))))
    .map((item) => ({ item, rect: item.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width >= 80 && rect.height >= 28 && rect.width <= 650 && rect.height <= 180)
    .sort((left, right) => {
      const leftInteractive = left.item.matches('[role="button"], [tabindex]') ? 0 : 1;
      const rightInteractive = right.item.matches('[role="button"], [tabindex]') ? 0 : 1;
      return leftInteractive - rightInteractive || (left.rect.width * left.rect.height) - (right.rect.width * right.rect.height);
    });
  return candidates[0]?.item ?? null;
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

function findVisibleTextControl(text, scope = document) {
  const candidates = Array.from(scope.querySelectorAll('button, [role="button"], [tabindex], *'))
    .filter((item) => item.offsetParent)
    .filter((item) => normalized(item.innerText || item.getAttribute('aria-label')) === text)
    .map((item) => ({ item, rect: item.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width >= 48 && rect.height >= 24 && rect.width <= 500 && rect.height <= 240)
    .sort((left, right) => (left.rect.width * left.rect.height) - (right.rect.width * right.rect.height));
  return candidates[0]?.item ?? null;
}

function findGenerateAudioButton(dialog = document) {
  return findVisibleTextControl('生成', dialog);
}

function sourceCount() {
  const match = normalized(document.body?.innerText).match(/(\d+)\s*件のソース/);
  return match ? Number(match[1]) : 0;
}

function visibleButtonMatching(pattern, scope = document) {
  return Array.from(scope.querySelectorAll('button')).find((button) => button.offsetParent && pattern.test(normalized(button.innerText || button.getAttribute('aria-label'))));
}

function findAudioOverviewControl() {
  const labelledControl = document.querySelector('[role="button"][aria-label="音声解説"], [role="button"][aria-label="Audio Overview"]');
  if (labelledControl?.offsetParent) return labelledControl;
  const pattern = /(^|\s)音声解説($|\s)|audio overview/i;
  const nativeControl = visibleButtonMatching(pattern);
  if (nativeControl) return nativeControl;
  const candidates = Array.from(document.querySelectorAll('[role="button"], [tabindex], *'))
    .filter((item) => item.offsetParent)
    .filter((item) => pattern.test(normalized(item.innerText || item.getAttribute('aria-label'))))
    .map((item) => ({ item, rect: item.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width >= 90 && rect.height >= 40 && rect.width <= 420 && rect.height <= 260)
    .sort((left, right) => (left.rect.width * left.rect.height) - (right.rect.width * right.rect.height));
  return candidates[0]?.item ?? null;
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

async function browserLevelClick(button) {
  const rect = button.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) throw new Error('クリック対象が画面上にありません。');
  const response = await chrome.runtime.sendMessage({
    type: 'amb:browser-level-click',
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  });
  if (response?.error) throw new Error(response.error);
  return response;
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
  await browserLevelClick(insert);
  const inserted = await waitFor(() => !findPasteTextDialog() && sourceCount() > before, 25_000);
  return inserted
    ? { ok: true, sourceCount: sourceCount() }
    : { ok: false, error: 'ソース追加の完了を25秒以内に確認できませんでした。', sourceCount: sourceCount() };
}

async function requestAudioOverview() {
  const audioButton = findAudioOverviewControl();
  if (!audioButton) return { ok: false, error: '「音声解説」ボタンが見つかりません。' };
  await browserLevelClick(audioButton);
  const generate = await waitFor(() => findGenerateAudioButton(), 30_000);
  if (!generate || generate.disabled) return { ok: false, error: '音声解説の設定画面または有効な「生成」ボタンが見つかりません。' };
  await browserLevelClick(generate);
  await new Promise((resolve) => window.setTimeout(resolve, 3000));
  const limitMessage = normalized(document.body?.innerText).match(/音声解説の一日の上限に達しました[^\n]*/);
  if (limitMessage) return { ok: false, error: limitMessage[0] };
  return { ok: true, generationRequested: true };
}

async function automateDailyNotebook({ title, sources }) {
  const result = { titleSet: setNotebookTitle(title), sources: [] };
  for (const source of sources) {
    const added = await addTextSource(source.text);
    result.sources.push({ title: source.title, ...added });
    if (!added.ok) return { ...result, error: added.error, snapshot: inspectPage() };
  }
  // Gemini Notebook updates the Studio controls asynchronously after a source is added.
  // Waiting here avoids opening the audio dialog while that update is still in progress.
  const audioControl = await waitFor(findAudioOverviewControl, 15_000);
  if (!audioControl) return { ...result, error: 'ソース追加後に「音声解説」タイルが準備されませんでした。', snapshot: inspectPage() };
  await new Promise((resolve) => window.setTimeout(resolve, 8_000));
  const audio = await requestAudioOverview();
  return audio.ok
    ? { ...result, generationRequested: true, snapshot: inspectPage() }
    : { ...result, error: audio.error, snapshot: inspectPage() };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'amb:inspect') {
    sendResponse(inspectPage());
    return;
  }
  if (message?.type === 'amb:audio-diagnostics') {
    sendResponse({ url: location.href, audioOverviewCandidates: audioOverviewCandidates(), dialogs: inspectPage().dialogs });
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
    browserLevelClick(button).catch(() => button.click());
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
      browserLevelClick(insert)
        .then(() => window.setTimeout(() => sendResponse({ inserted: true, snapshot: inspectPage() }), 4000))
        .catch((error) => sendResponse({ error: error.message, snapshot: inspectPage() }));
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
    browserLevelClick(generate)
      .then(() => window.setTimeout(() => sendResponse({ generationRequested: true, snapshot: inspectPage() }), 3000))
      .catch((error) => sendResponse({ error: error.message, snapshot: inspectPage() }));
    return true;
  }
  if (message?.type === 'amb:start-audio') {
    requestAudioOverview()
      .then((result) => sendResponse({ ...result, snapshot: inspectPage() }))
      .catch((error) => sendResponse({ error: error.message, snapshot: inspectPage() }));
    return true;
  }
  if (message?.type === 'amb:automate-daily') {
    automateDailyNotebook({ title: message.title, sources: message.sources ?? [] })
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message, snapshot: inspectPage() }));
    return true;
  }
});
