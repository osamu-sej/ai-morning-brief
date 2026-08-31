const NOTEBOOK_PATTERNS = ['https://notebooklm.google.com/*', 'https://notebook.google.com/*'];
const NOTEBOOK_HOME_URL = 'https://notebook.google.com/';
const GMAIL_INBOX_URL = 'https://mail.google.com/mail/u/0/#inbox';
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

function nextNotebookAutomation(now = new Date()) {
  const next = new Date(now);
  // 05:00のlaunchd収集・Gemma要約の完了を待ってから、最新の日次資料を読む。
  next.setHours(5, 10, 0, 0);
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

async function browserLevelClick(tabId, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('クリック座標が不正です。');
  const target = { tabId };
  await chrome.tabs.update(tabId, { active: true });
  await chrome.debugger.attach(target, '1.3');
  try {
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    return { clicked: true };
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
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

async function sendWhenReady(tabId, message, isReady) {
  let lastError = null;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab && isReady(tab.url)) {
      try {
        return await chrome.tabs.sendMessage(tabId, message);
      } catch (error) {
        lastError = error;
      }
    }
    await sleep(1000);
  }
  throw new Error(`自動処理画面の読み込みを待機中に失敗しました: ${lastError?.message ?? 'timeout'}`);
}

function reportSubject(status) {
  return `【AI Morning Brief】${status.expectedDate ?? '対象日未確定'} 実行結果`;
}

function reportBody(status) {
  const state = status.state === 'requested' ? '完了（Notebookへの投入・音声生成依頼まで実行）'
    : status.state === 'needs_attention' ? '一部未完了またはエラー'
      : status.state ?? '不明';
  const lines = [
    'AI Morning Brief の自動実行結果です。',
    '',
    `対象日: ${status.expectedDate ?? '未確定'}`,
    `状態: ${state}`,
    `Notebookへ投入した記事数: ${status.sourceCount ?? 0}件`,
    `音声解説の生成依頼: ${status.generationRequested ? '済み' : '未実行'}`
  ];
  if (status.notebookUrl) lines.push(`Notebook: ${status.notebookUrl}`);
  if (status.error) lines.push(`エラー詳細: ${status.error}`);
  lines.push('', 'このメールは、成功・一部成功・失敗のいずれの場合にも毎日送信されます。');
  return lines.join('\n');
}

async function sendDailyReport(status) {
  const tab = await chrome.tabs.create({ url: GMAIL_INBOX_URL, active: false });
  const sent = await sendWhenReady(tab.id, {
    type: 'amb:send-daily-report',
    subject: reportSubject(status),
    body: reportBody(status)
  }, (url) => url?.startsWith('https://mail.google.com/'));
  if (!sent?.ok) throw new Error(sent?.error ?? 'Gmailへの結果メールを送信できませんでした。');
  return { state: 'sent', sentAt: new Date().toISOString() };
}

async function saveStatusAndReport(status) {
  try {
    status.email = await sendDailyReport(status);
  } catch (error) {
    status.email = { state: 'failed', error: error.message, attemptedAt: new Date().toISOString() };
  }
  status.updatedAt = new Date().toISOString();
  await chrome.storage.local.set({ dailyStatus: status });
  return status;
}

async function runDailyAutomation(trigger) {
  const expectedDate = previousTokyoDate();
  await chrome.storage.local.set({ dailyStatus: { state: 'preparing', trigger, expectedDate, startedAt: new Date().toISOString() } });
  try {
    const sources = await dailySources(expectedDate);
    const tab = await chrome.tabs.create({ url: NOTEBOOK_HOME_URL, active: false });
    const created = await sendWhenReady(tab.id, { type: 'amb:create-notebook' }, (url) => url === NOTEBOOK_HOME_URL || url?.startsWith(`${NOTEBOOK_HOME_URL}?`));
    if (created?.error) throw new Error(created.error);
    const result = await sendWhenReady(tab.id, {
      type: 'amb:automate-daily',
      title: `AI Morning Brief — ${expectedDate}`,
      sources
    }, (url) => url?.startsWith('https://notebook.google.com/notebook/') && !url.endsWith('/creating'));
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
    return saveStatusAndReport(status);
  } catch (error) {
    const status = { state: 'needs_attention', trigger, expectedDate, error: error.message, updatedAt: new Date().toISOString() };
    return saveStatusAndReport(status);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DAILY_ALARM) runDailyAutomation('scheduled').catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'amb:browser-level-click') {
      if (!sender.tab?.id) throw new Error('Notebookタブを特定できません。');
      return browserLevelClick(sender.tab.id, message.x, message.y);
    }
    if (message?.type === 'amb:active-notebooklm') {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = activeTabs[0];
      if (isNotebookUrl(activeTab?.url)) return { tabId: activeTab.id };
      const tab = await activeNotebookLmTab();
      return tab ? { tabId: tab.id, inactive: true } : { error: 'NotebookLMのタブを開いてから、もう一度実行してください。' };
    }
    if (message?.type === 'amb:enable-daily') {
      chrome.alarms.create(DAILY_ALARM, { when: nextNotebookAutomation(), periodInMinutes: 24 * 60 });
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
