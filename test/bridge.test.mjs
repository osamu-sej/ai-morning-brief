import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { latestDailyPayload } from '../src/bridge.mjs';

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
