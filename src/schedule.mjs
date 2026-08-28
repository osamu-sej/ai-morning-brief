import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { runCommand, writeText } from './core.mjs';

export const LAUNCHD_LABEL = 'com.osamu.ai-morning-brief';

function xml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function launchdPlist({ node, cli, root, hour = 5, minute = 0 }) {
  const logDirectory = path.join(root, 'logs');
  const args = [node, cli, 'run', '--root', root];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key><array>${args.map((arg) => `<string>${xml(arg)}</string>`).join('')}</array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>${Number(hour)}</integer><key>Minute</key><integer>${Number(minute)}</integer></dict>
  <key>WorkingDirectory</key><string>${xml(path.dirname(cli))}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StandardOutPath</key><string>${xml(path.join(logDirectory, 'launchd.out.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(logDirectory, 'launchd.err.log'))}</string>
  <key>ProcessType</key><string>Background</string>
</dict></plist>
`;
}

export async function writeScheduleDefinition({ root, node, cli, hour, minute }) {
  const scheduleDirectory = path.join(root, 'launchd');
  const definition = path.join(scheduleDirectory, `${LAUNCHD_LABEL}.plist`);
  await mkdir(scheduleDirectory, { recursive: true });
  await writeText(definition, launchdPlist({ node, cli, root, hour, minute }));
  return definition;
}

export async function installSchedule(definition, homeDirectory) {
  const targetDirectory = path.join(homeDirectory, 'Library', 'LaunchAgents');
  const target = path.join(targetDirectory, `${LAUNCHD_LABEL}.plist`);
  await mkdir(targetDirectory, { recursive: true });
  await runCommand('cp', [definition, target]);
  // bootoutは未登録でも失敗するため、ここでは無視する。
  await runCommand('launchctl', ['bootout', `gui/${process.getuid()}`, target]).catch(() => {});
  await runCommand('launchctl', ['bootstrap', `gui/${process.getuid()}`, target]);
  return target;
}

export async function uninstallSchedule(homeDirectory) {
  const target = path.join(homeDirectory, 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`);
  await runCommand('launchctl', ['bootout', `gui/${process.getuid()}`, target]).catch(() => {});
  return target;
}
