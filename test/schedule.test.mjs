import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeLaunchdPlist, launchdPlist } from '../src/schedule.mjs';

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

test('bridge launchd definition keeps the local bridge available', () => {
  const definition = bridgeLaunchdPlist({ node: '/opt/node/bin/node', cli: '/project/src/cli.mjs', root: '/runtime' });
  assert.match(definition, /bridge/);
  assert.match(definition, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(definition, /<key>KeepAlive<\/key><true\/>/);
});
