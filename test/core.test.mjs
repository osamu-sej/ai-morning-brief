import test from 'node:test';
import assert from 'node:assert/strict';
import { previousTokyoDate } from '../src/core.mjs';

test('previousTokyoDate uses the Tokyo calendar rather than the UTC calendar', () => {
  assert.equal(previousTokyoDate(new Date('2026-08-26T13:00:00.000Z')), '2026-08-25');
  assert.equal(previousTokyoDate(new Date('2026-08-25T15:30:00.000Z')), '2026-08-25');
});
