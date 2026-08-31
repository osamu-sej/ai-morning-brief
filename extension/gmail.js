function normalized(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function waitFor(check, timeoutMs = 20_000, intervalMs = 250) {
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

function setInputValue(input, value) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function ownEmailAddress() {
  const accountControl = Array.from(document.querySelectorAll('[aria-label]')).find((item) => /Google アカウント|Google Account/i.test(item.getAttribute('aria-label') ?? ''));
  return accountControl?.getAttribute('aria-label')?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
}

function composeButton() {
  return document.querySelector('[role="button"][gh="cm"]')
    ?? Array.from(document.querySelectorAll('[role="button"]')).find((button) => normalized(button.innerText) === '作成' || normalized(button.innerText) === 'Compose');
}

function composeDialog() {
  return Array.from(document.querySelectorAll('[role="dialog"]')).find((dialog) => /新規メッセージ|New Message/i.test(normalized(dialog.innerText)));
}

function sendButton(dialog) {
  return Array.from(dialog.querySelectorAll('[role="button"], button')).find((button) => {
    const label = normalized(button.innerText || button.getAttribute('aria-label') || button.getAttribute('data-tooltip'));
    return /^(送信|Send)(\s|$)/i.test(label) && !button.getAttribute('aria-disabled') && !button.disabled;
  });
}

async function sendDailyReport({ subject, body }) {
  const recipient = ownEmailAddress();
  if (!recipient) return { ok: false, error: 'Gmailのログイン中アカウントを確認できませんでした。' };
  const compose = composeButton();
  if (!compose) return { ok: false, error: 'Gmailの「作成」ボタンが見つかりません。' };
  compose.click();
  const dialog = await waitFor(composeDialog);
  const to = dialog?.querySelector('input[role="combobox"], textarea[role="combobox"]');
  const subjectInput = dialog?.querySelector('input[name="subjectbox"]');
  const bodyInput = dialog?.querySelector('[role="textbox"][aria-label], [contenteditable="true"][aria-label]');
  if (!dialog || !to || !subjectInput || !bodyInput) return { ok: false, error: 'Gmailの宛先・件名・本文欄を特定できませんでした。' };
  setInputValue(to, recipient);
  to.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  to.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
  setInputValue(subjectInput, subject);
  bodyInput.focus();
  bodyInput.textContent = body;
  bodyInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: body }));
  const send = await waitFor(() => sendButton(dialog), 8_000);
  if (!send) return { ok: false, error: 'Gmailの「送信」ボタンを有効化できませんでした。' };
  send.click();
  const sent = await waitFor(() => !composeDialog(), 8_000);
  return sent ? { ok: true, recipient } : { ok: false, error: 'Gmailの送信完了を確認できませんでした。' };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'amb:send-daily-report') return;
  sendDailyReport(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
