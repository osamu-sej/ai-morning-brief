import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTEBOOKLM_ORIGIN } from '../src/chrome.mjs';

test('NotebookLM uses the expected Google origin', () => {
  assert.equal(NOTEBOOKLM_ORIGIN, 'https://notebooklm.google.com');
});
