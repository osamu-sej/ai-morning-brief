import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureRuntime, readJson, writeJson } from '../src/core.mjs';
import { dedupeAndRank, enrichCandidates, ingestManualArticles, writeBrief } from '../src/pipeline.mjs';

test('manual article becomes an individual article and a NotebookLM daily briefing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-morning-brief-'));
  const date = '2026-08-25';
  try {
    const paths = await ensureRuntime(root, date);
    const settings = await readJson(paths.settings);
    settings.localAi.enabled = false;
    settings.targetCount = 1;
    await writeJson(paths.settings, settings);
    await writeFile(
      path.join(paths.inboxArticles, 'gemma-update.md'),
      '# Gemma update\n\nA team released an open-source AI coding workflow on GitHub with practical setup notes.',
      'utf8'
    );

    const input = await ingestManualArticles(paths, date);
    const { candidates, gemmaStatus } = await enrichCandidates(input, settings);
    const selected = dedupeAndRank(candidates, settings);
    const output = await writeBrief(paths, date, selected, gemmaStatus);
    const digest = await readFile(output.digestFile, 'utf8');

    assert.equal(selected.length, 1);
    assert.match(digest, /Gemma update/);
    assert.equal(output.articles.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
