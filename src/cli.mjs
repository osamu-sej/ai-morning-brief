#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { access, readFile } from 'node:fs/promises';
import {
  assertDate,
  defaultSettings,
  ensureRuntime,
  executableAvailable,
  previousTokyoDate,
  readJson,
  runCommand,
  runtimePaths,
  writeJson
} from './core.mjs';
import {
  addXImage,
  dedupeAndRank,
  enrichCandidates,
  ingestManualArticles,
  ingestXImages,
  writeBrief
} from './pipeline.mjs';
import { installSchedule, uninstallSchedule, writeScheduleDefinition } from './schedule.mjs';

function parseArgs(args) {
  const positional = [];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const [key, inline] = value.slice(2).split('=', 2);
    if (inline !== undefined) options[key] = inline;
    else if (args[index + 1] && !args[index + 1].startsWith('--')) options[key] = args[++index];
    else options[key] = true;
  }
  return { positional, options };
}

function usage() {
  return `AI Morning Brief\n\n使い方:\n  npm run amb -- setup [--root PATH]\n  npm run amb -- doctor [--root PATH]\n  npm run amb -- add-x --image PATH [--url URL] [--date YYYY-MM-DD] [--root PATH]\n  npm run amb -- run [--date YYYY-MM-DD] [--dry-run] [--no-local-ai] [--root PATH]\n  npm run amb -- schedule write [--hour 5] [--minute 0] [--root PATH]\n  npm run amb -- schedule install [--hour 5] [--minute 0] [--root PATH]\n  npm run amb -- schedule uninstall [--root PATH]\n\n対象日の初期値は日本時間の前日です。`;
}

function appRoot(options) {
  return path.resolve(options.root || process.env.AMB_ROOT || path.join(process.cwd(), 'runtime'));
}

async function getSettings(root, date) {
  const paths = await ensureRuntime(root, date);
  const defaults = defaultSettings(root);
  const stored = await readJson(paths.settings, {});
  const settings = {
    ...defaults,
    ...stored,
    localAi: { ...defaults.localAi, ...(stored.localAi ?? {}) },
    notebooklm: { ...defaults.notebooklm, ...(stored.notebooklm ?? {}) },
    schedule: { ...defaults.schedule, ...(stored.schedule ?? {}) },
    notifications: { ...defaults.notifications, ...(stored.notifications ?? {}) },
    retention: { ...defaults.retention, ...(stored.retention ?? {}) }
  };
  return { paths, settings };
}

async function prepare(root, date, options = {}) {
  const { paths, settings } = await getSettings(root, date);
  if (options['no-local-ai']) settings.localAi.enabled = false;
  const x = await ingestXImages(paths, date);
  const articles = await ingestManualArticles(paths, date);
  const allCandidates = [...x, ...articles];
  const { candidates, gemmaStatus } = await enrichCandidates(allCandidates, settings);
  const selected = dedupeAndRank(candidates, settings);
  const output = await writeBrief(paths, date, selected, gemmaStatus);
  await writeJson(path.join(paths.daily, 'candidates.json'), candidates);
  return { paths, settings, candidates, selected, output };
}

async function doctor(root) {
  const date = previousTokyoDate();
  const { paths, settings } = await getSettings(root, date);
  const checks = {
    root,
    node: process.version,
    local_ai_executable: settings.localAi.executable,
    local_ai_command_available: await executableAvailable(settings.localAi.executable),
    local_ai_model: settings.localAi.model,
    ocr_binary: paths.ocr,
    ocr_binary_available: await access(paths.ocr).then(() => true).catch(() => false),
    scheduled_time: `${String(settings.schedule.hour).padStart(2, '0')}:${String(settings.schedule.minute).padStart(2, '0')}`,
    notebooklm_handoff: '通常のChromeで日次Markdownを手動投入'
  };
  console.log(JSON.stringify(checks, null, 2));
}

async function notify(settings, message) {
  if (!settings.notifications?.enabled) return;
  const script = 'on run argv\n display notification (item 1 of argv) with title "AI Morning Brief"\nend run';
  await runCommand('/usr/bin/osascript', ['-e', script, message], { timeout: 10_000 }).catch(() => {});
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const command = positional.shift();
  const root = appRoot(options);
  const date = assertDate(options.date || previousTokyoDate());
  if (!command || ['help', '--help', '-h'].includes(command)) {
    console.log(usage());
    return;
  }
  if (command === 'setup') {
    const paths = await ensureRuntime(root, date);
    console.log(`初期化しました: ${paths.root}`);
    console.log(`設定: ${paths.settings}`);
    return;
  }
  if (command === 'doctor') {
    await doctor(root);
    return;
  }
  if (command === 'add-x') {
    if (!options.image) throw new Error('--image が必要です。');
    const { paths } = await getSettings(root, date);
    const output = await addXImage(paths, date, path.resolve(options.image), options.url || null, options.title || null);
    console.log(`X画像を登録しました: ${output}`);
    return;
  }
  if (command === 'run') {
    const result = await prepare(root, date, options);
    console.log(`候補: ${result.candidates.length}件 / 選定: ${result.selected.length}件`);
    console.log(`日次資料: ${result.output.digestFile}`);
    console.log(`Gemma: ${result.output.run.gemma.succeeded}/${result.output.run.gemma.attempted}件成功`);
    if (!options['dry-run'] && result.selected.length > 0) {
      console.log('通常のChromeで日次資料をNotebookLMへ追加し、「音声解説を生成」を選んでください。');
      await notify(result.settings, `${result.selected.length}件の日次資料を作成しました。NotebookLMへ追加できます。`);
    } else if (!options['dry-run']) {
      console.log('入力がないため、NotebookLMへ追加する資料はありません。');
      await notify(result.settings, '入力がなかったため、日次資料は0件です。');
    }
    return;
  }
  if (command === 'schedule') {
    const subcommand = positional.shift();
    const { settings } = await getSettings(root, date);
    const hour = Number(options.hour ?? settings.schedule.hour);
    const minute = Number(options.minute ?? settings.schedule.minute);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      throw new Error('時刻は --hour 0〜23 と --minute 0〜59 で指定してください。');
    }
    const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
    const definition = await writeScheduleDefinition({ root, node: process.execPath, cli, hour, minute });
    if (subcommand === 'write') {
      console.log(`launchd定義を作成しました: ${definition}`);
      return;
    }
    if (subcommand === 'install') {
      const target = await installSchedule(definition, process.env.HOME);
      console.log(`毎日${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}の自動実行を登録しました: ${target}`);
      return;
    }
    if (subcommand === 'uninstall') {
      const target = await uninstallSchedule(process.env.HOME);
      console.log(`自動実行を解除しました: ${target}`);
      return;
    }
    throw new Error('schedule のサブコマンドは write、install、uninstall です。');
  }
  throw new Error(`不明なコマンドです: ${command}`);
}

main().catch((error) => {
  console.error(`エラー: ${error.message}`);
  process.exitCode = 1;
});
