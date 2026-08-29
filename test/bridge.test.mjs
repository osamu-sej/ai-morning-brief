import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { latestDailyArticlesPayload, latestDailyPayload } from '../src/bridge.mjs';

test('latest daily payload returns the newest valid daily brief', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amb-bridge-'));
  const daily = path.join(root, 'daily', '2026-08-28');
  const digest = path.join(daily, 'daily_brief_2026-08-28.md');
  await mkdir(daily, { recursive: true });
  await writeFile(digest, '# Test daily brief\n', 'utf8');
  await writeFile(path.join(daily, 'run.json'), JSON.stringify({ digest_file: digest, selected: [] }), 'utf8');
  const payload = await latestDailyPayload(root);
  assert.equal(payload.date, '2026-08-28');
  assert.equal(payload.filename, 'daily_brief_2026-08-28.md');
  assert.match(payload.text, /Test daily brief/);
});

test('latest daily articles payload returns each selected article text', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amb-bridge-'));
  const daily = path.join(root, 'daily', '2026-08-28');
  const selected = path.join(root, 'processed', '2026-08-28', 'selected');
  const digest = path.join(daily, 'daily_brief_2026-08-28.md');
  const article = path.join(selected, '01-example.md');
  await mkdir(selected, { recursive: true });
  await mkdir(daily, { recursive: true });
  await writeFile(digest, '# Test daily brief\n', 'utf8');
  await writeFile(article, '# Article one\n', 'utf8');
  await writeFile(path.join(daily, 'run.json'), JSON.stringify({ digest_file: digest, selected: [{ rank: 1, title: 'Article one', output_file: article }] }), 'utf8');
  const payload = await latestDailyArticlesPayload(root);
  assert.equal(payload.date, '2026-08-28');
  assert.deepEqual(payload.articles, [{ rank: 1, title: 'Article one', filename: '01-example.md', text: '# Article one\n' }]);
});
