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
    insert.click();
    window.setTimeout(() => sendResponse({ inserted: true, snapshot: inspectPage() }), 4000);
    return true;
  }
});
