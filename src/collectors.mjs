import { cleanText, sha256 } from './core.mjs';

const USER_AGENT = 'AI-Morning-Brief/0.1 (personal local research tool)';

function stripHtml(value) {
  return cleanText(String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
}

async function fetchWithTimeout(url, { timeoutMs = 20_000, headers = {} } = {}) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json, application/rss+xml, application/xml, text/xml, text/plain;q=0.8, */*;q=0.5', ...headers },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response;
}

function candidate({ date, sourceName, sourceType, title, url, text, capturedAt, metadata = {} }) {
  const rawText = cleanText(`${title}\n\n${text}`);
  return {
    id: `public-${sha256(url || `${sourceName}:${title}`).slice(0, 12)}`,
    target_date: date,
    source_type: sourceType,
    source_name: sourceName,
    source_url: url || null,
    title: cleanText(title),
    raw_text: rawText,
    captured_at: capturedAt,
    metadata
  };
}

async function collectGitHub(date, limit) {
  // GitHub Searchは複雑なOR条件だと日付条件との組合せで0件になりやすいため、
  // 広めのAI語と更新日で取得し、スター順で上位の公開リポジトリを採用する。
  const query = encodeURIComponent(`AI pushed:>=${date}`);
  const response = await fetchWithTimeout(`https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=${limit}`, {
    headers: { accept: 'application/vnd.github+json' }
  });
  const data = await response.json();
  const capturedAt = new Date().toISOString();
  return (data.items ?? []).map((item) => candidate({
    date,
    sourceName: 'GitHub public search',
    sourceType: 'github_public',
    title: item.full_name,
    url: item.html_url,
    text: `GitHub repository\n${item.description ?? ''}\nStars: ${item.stargazers_count ?? 0}\nLanguage: ${item.language ?? 'unknown'}\nTopics: ${(item.topics ?? []).join(', ')}`,
    capturedAt,
    metadata: { stars: item.stargazers_count ?? 0, language: item.language ?? null, topics: item.topics ?? [] }
  }));
}

async function collectHackerNews(date, limit) {
  const since = Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent('AI')}&tags=story&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}&hitsPerPage=${limit}`;
  const response = await fetchWithTimeout(url);
  const data = await response.json();
  const capturedAt = new Date().toISOString();
  return (data.hits ?? [])
    .filter((item) => item.title && (item.url || item.story_url))
    .map((item) => candidate({
      date,
      sourceName: 'Hacker News public search',
      sourceType: 'hacker_news_public',
      title: item.title,
      url: item.url || item.story_url,
      text: `${item.story_text ?? ''}\nPoints: ${item.points ?? 0}\nComments: ${item.num_comments ?? 0}`,
      capturedAt,
      metadata: { points: item.points ?? 0, comments: item.num_comments ?? 0 }
    }));
}

function rssItems(xml) {
  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)).map((match) => {
    const item = match[1];
    const read = (tag) => item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] ?? '';
    return {
      title: stripHtml(read('title').replace(/^<!\[CDATA\[|\]\]>$/g, '')),
      link: stripHtml(read('link').replace(/^<!\[CDATA\[|\]\]>$/g, '')),
      description: stripHtml(read('description').replace(/^<!\[CDATA\[|\]\]>$/g, '')),
      published: stripHtml(read('pubDate'))
    };
  });
}

async function collectGoogleNews(date, perQuery) {
  const queries = [
    'AI 企業 活用 when:1d',
    'OpenAI Anthropic Gemini AI when:1d',
    '生成AI GitHub when:1d',
    'AI エンジニア 活用事例 when:1d'
  ];
  const capturedAt = new Date().toISOString();
  const groups = await Promise.allSettled(queries.map(async (query) => {
    const response = await fetchWithTimeout(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`);
    const items = rssItems(await response.text()).slice(0, perQuery);
    return items.map((item) => candidate({
      date,
      sourceName: 'Google News RSS',
      sourceType: 'google_news_rss',
      title: item.title,
      url: item.link,
      text: `${item.description}\nPublished: ${item.published}`,
      capturedAt,
      metadata: { published: item.published, query }
    }));
  }));
  return groups.flatMap((group) => group.status === 'fulfilled' ? group.value : []);
}

export async function collectPublicCandidates(date, settings) {
  if (!settings.collection?.enabled) return { candidates: [], errors: [] };
  const tasks = [
    ['github', collectGitHub(date, settings.collection.githubLimit)],
    ['hacker_news', collectHackerNews(date, settings.collection.hackerNewsLimit)],
    ['google_news', collectGoogleNews(date, settings.collection.googleNewsPerQuery)]
  ];
  const settled = await Promise.allSettled(tasks.map(([, task]) => task));
  const candidates = [];
  const errors = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') candidates.push(...result.value);
    else errors.push({ collector: tasks[index][0], error: result.reason.message });
  });
  return { candidates, errors };
}
