import http from 'node:http';
import path from 'node:path';
import { access, readFile, readdir } from 'node:fs/promises';
import { readJson } from './core.mjs';

async function fileExists(file) {
  return access(file).then(() => true).catch(() => false);
}

export async function latestDailyRun(root) {
  const dailyRoot = path.join(root, 'daily');
  const dates = await readdir(dailyRoot, { withFileTypes: true })
    .then((entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse())
    .catch((error) => error.code === 'ENOENT' ? [] : Promise.reject(error));
  for (const date of dates) {
    const run = await readJson(path.join(dailyRoot, date, 'run.json'));
    if (run?.digest_file && await fileExists(run.digest_file)) return { date, run };
  }
  return null;
}

export async function latestDailyPayload(root) {
  const latest = await latestDailyRun(root);
  if (!latest) return null;
  const text = await readFile(latest.run.digest_file, 'utf8');
  return {
    date: latest.date,
    filename: path.basename(latest.run.digest_file),
    text,
    articles: (latest.run.selected ?? []).map(({ rank, title, output_file }) => ({ rank, title, filename: path.basename(output_file), output_file }))
  };
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(`${JSON.stringify(value)}\n`);
}

export function createBridgeServer(root) {
  return http.createServer(async (request, response) => {
    if (request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' });
    if (request.url === '/health') return sendJson(response, 200, { status: 'ok' });
    if (request.url === '/v1/daily/latest') {
      const payload = await latestDailyPayload(root);
      return payload ? sendJson(response, 200, payload) : sendJson(response, 404, { error: 'daily_brief_not_found' });
    }
    return sendJson(response, 404, { error: 'not_found' });
  });
}

export async function serveBridge(root, port = 8765) {
  const server = createBridgeServer(root);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}
