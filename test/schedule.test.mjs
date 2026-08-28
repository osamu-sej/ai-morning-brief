import test from 'node:test';
import assert from 'node:assert/strict';
import { launchdPlist } from '../src/schedule.mjs';

test('launchd definition starts the local CLI at the requested time', () => {
  const plist = launchdPlist({
    node: '/usr/local/bin/node',
    cli: '/opt/ai-morning-brief/src/cli.mjs',
    root: '/opt/ai-morning-brief/runtime',
    hour: 5,
    minute: 0
  });
  assert.match(plist, /<integer>5<\/integer>/);
  assert.match(plist, /<integer>0<\/integer>/);
  assert.match(plist, /<string>run<\/string>/);
  assert.match(plist, /--root/);
});
