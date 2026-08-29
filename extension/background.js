const NOTEBOOK_PATTERNS = ['https://notebooklm.google.com/*', 'https://notebook.google.com/*'];
const NOTEBOOK_CREATE_URL = 'https://notebook.google.com/notebook/creating';
const BRIDGE = 'http://127.0.0.1:8765';
const DAILY_ALARM = 'amb:daily-notebook';

function isNotebookUrl(url) {
  return url?.startsWith('https://notebooklm.google.com/') || url?.startsWith('https://notebook.google.com/');
}

function previousTokyoDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  const date = new Date(Date.UTC(Number(value('year')), Number(value('month')) - 1, Number(value('day'))));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function nextFiveAm(now = new Date()) {
  const next = new Date(now);
  next.setHours(5, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function activeNotebookLmTab() {
  const tabs = await chrome.tabs.query({ url: NOTEBOOK_PATTERNS });
  return tabs.find((tab) => tab.active) ?? tabs[0] ?? null;
}

async function readJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`ローカルブリッジ: ${response.status}`);
  return response.json();
}

async function dailySources(expectedDate) {
  const [daily, articlePayload] = await Promise.all([
    readJson(`${BRIDGE}/v1/daily/latest`),
    readJson(`${BRIDGE}/v1/daily/latest/articles`)
  ]);
  if (daily.date !== expectedDate || articlePayload.date !== expectedDate) {
    throw new Error(`対象日 ${expectedDate} の日次資料がまだ準備できていません（現在: ${daily.date}）。`);
  }
  if (!articlePayload.articles?.length) throw new Error('選定された記事が0件のため、Notebookを作成しません。');
  return articlePayload.articles.map(({ title, text }) => ({ title, text }));
}

async function sendWhenNotebookReady(tabId, message) {
  let lastError = null;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.url?.startsWith('https://notebook.google.com/notebook/') && !tab.url.endsWith('/creating')) {
      try {
        return await chrome.tabs.sendMessage(tabId, message);
      } catch (error) {
        lastError = error;
      }
    }
    await sleep(1000);
  }
  throw new Error(`新規Notebookの読み込みを待機中に失敗しました: ${lastError?.message ?? 'timeout'}`);
}

async function runDailyAutomation(trigger) {
  const expectedDate = previousTokyoDate();
  await chrome.storage.local.set({ dailyStatus: { state: 'preparing', trigger, expectedDate, startedAt: new Date().toISOString() } });
  try {
    const sources = await dailySources(expectedDate);
    const tab = await chrome.tabs.create({ url: NOTEBOOK_CREATE_URL, active: false });
    const result = await sendWhenNotebookReady(tab.id, {
      type: 'amb:automate-daily',
      title: `AI Morning Brief — ${expectedDate}`,
      sources
    });
    const currentTab = await chrome.tabs.get(tab.id).catch(() => null);
    const status = {
      state: result.error ? 'needs_attention' : 'requested',
      trigger,
      expectedDate,
      notebookUrl: currentTab?.url ?? null,
      sourceCount: result.sources?.filter((source) => source.ok).length ?? 0,
      generationRequested: Boolean(result.generationRequested),
      error: result.error ?? null,
      updatedAt: new Date().toISOString()
    };
    await chrome.storage.local.set({ dailyStatus: status });
    return status;
  } catch (error) {
    const status = { state: 'needs_attention', trigger, expectedDate, error: error.message, updatedAt: new Date().toISOString() };
    await chrome.storage.local.set({ dailyStatus: status });
    return status;
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DAILY_ALARM) runDailyAutomation('scheduled').catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'amb:active-notebooklm') {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = activeTabs[0];
      if (isNotebookUrl(activeTab?.url)) return { tabId: activeTab.id };
      const tab = await activeNotebookLmTab();
      return tab ? { tabId: tab.id, inactive: true } : { error: 'NotebookLMのタブを開いてから、もう一度実行してください。' };
    }
    if (message?.type === 'amb:enable-daily') {
      chrome.alarms.create(DAILY_ALARM, { when: nextFiveAm(), periodInMinutes: 24 * 60 });
      const alarm = await chrome.alarms.get(DAILY_ALARM);
      const status = { state: 'scheduled', nextRunAt: alarm?.scheduledTime ?? null, updatedAt: new Date().toISOString() };
      await chrome.storage.local.set({ dailyStatus: status });
      return status;
    }
    if (message?.type === 'amb:run-daily-now') return runDailyAutomation('manual_test');
    if (message?.type === 'amb:daily-status') return (await chrome.storage.local.get('dailyStatus')).dailyStatus ?? { state: 'not_configured' };
    return null;
  })().then(sendResponse).catch((error) => sendResponse({ error: error.message }));
  return true;
});
