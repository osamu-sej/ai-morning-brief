import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);
export const TOKYO = 'Asia/Tokyo';

export function formatTokyoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TOKYO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function previousTokyoDate(date = new Date()) {
  const [year, month, day] = formatTokyoDate(date).split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  calendarDate.setUTCDate(calendarDate.getUTCDate() - 1);
  return calendarDate.toISOString().slice(0, 10);
}

export function assertDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) {
    throw new Error(`対象日は YYYY-MM-DD 形式で指定してください: ${value}`);
  }
  return value;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function slugify(value, fallback = 'article') {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return slug || fallback;
}

export function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function firstHeadingOrFilename(text, filename) {
  const heading = cleanText(text).match(/^#{1,6}\s+(.+)$/m)?.[1];
  return cleanText(heading || path.basename(filename, path.extname(filename)).replace(/[_-]+/g, ' '));
}

export function defaultSettings(root) {
  return {
    version: 1,
    timezone: TOKYO,
    locale: 'ja-JP',
    targetCount: 30,
    categories: {
      github: 8,
      company_use_case: 8,
      personal_use_case: 6,
      major_ai_news: 8
    },
    localAi: {
      enabled: true,
      executable: 'ollama',
      model: 'gemma4:12b-mlx',
      timeoutSeconds: 240,
      temperature: 0.1,
      fallbackToRules: true
    },
    notebooklm: {
      language: 'Japanese',
      audioFormat: 'Deep Dive'
    },
    schedule: {
      hour: 5,
      minute: 0
    },
    notifications: {
      enabled: true
    },
    retention: {
      rawDays: 90,
      diagnosticDays: 30
    }
  };
}

export function runtimePaths(root, date) {
  return {
    root,
    config: path.join(root, 'config'),
    settings: path.join(root, 'config', 'settings.json'),
    inboxX: path.join(root, 'inbox', 'x', date),
    inboxArticles: path.join(root, 'inbox', 'articles', date),
    raw: path.join(root, 'raw', date),
    processed: path.join(root, 'processed', date),
    selected: path.join(root, 'processed', date, 'selected'),
    daily: path.join(root, 'daily', date),
    logs: path.join(root, 'logs'),
    state: path.join(root, 'state'),
    bin: path.join(root, 'bin'),
    ocr: path.join(root, 'bin', 'vision-ocr'),
  };
}

export async function ensureRuntime(root, date = previousTokyoDate()) {
  const paths = runtimePaths(root, date);
  for (const directory of Object.values(paths)) {
    if (directory.endsWith('.json') || directory.endsWith('vision-ocr')) continue;
    await mkdir(directory, { recursive: true });
  }
  try {
    await stat(paths.settings);
  } catch {
    await writeJson(paths.settings, defaultSettings(root));
  }
  return paths;
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeText(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value, 'utf8');
}

export async function listFiles(directory, extensions = []) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(directory, entry.name))
      .filter((file) => extensions.length === 0 || extensions.includes(path.extname(file).toLowerCase()))
      .sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function copyInput(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { errorOnExist: false, force: false });
}

export async function executableAvailable(executable) {
  try {
    await execFileAsync(executable, ['--version'], { timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

export async function runCommand(executable, args, options = {}) {
  return execFileAsync(executable, args, {
    maxBuffer: 20 * 1024 * 1024,
    timeout: options.timeout ?? 60_000,
    ...options
  });
}
