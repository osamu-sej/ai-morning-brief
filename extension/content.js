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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'amb:inspect') return;
  sendResponse(inspectPage());
});
