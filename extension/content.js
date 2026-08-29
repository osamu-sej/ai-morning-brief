function normalized(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function inspectPage() {
  return {
    url: location.href,
    title: document.title,
    buttons: Array.from(document.querySelectorAll('button')).map((item) => normalized(item.innerText || item.getAttribute('aria-label'))).filter(Boolean).slice(0, 100),
    inputs: Array.from(document.querySelectorAll('input')).map((item) => ({
      type: item.type,
      accept: item.accept || null,
      ariaLabel: item.getAttribute('aria-label'),
      visible: Boolean(item.offsetParent)
    })),
    dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).map((item) => normalized(item.innerText).slice(0, 1500)),
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
});
