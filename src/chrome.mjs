import { runCommand } from './core.mjs';

const APPLESCRIPT = '/usr/bin/osascript';
const NOTEBOOKLM_ORIGIN = 'https://notebook.google.com';

async function runAppleScript(source, args = []) {
  const { stdout } = await runCommand(APPLESCRIPT, ['-e', source, ...args], { timeout: 30_000 });
  return stdout.trim();
}

const OPEN_TAB = `
on run argv
  set targetUrl to item 1 of argv
  tell application "Google Chrome"
    if it is not running then launch
    activate
    if (count of windows) is 0 then make new window
    set targetTab to make new tab at end of tabs of front window with properties {URL:targetUrl}
    return URL of targetTab
  end tell
end run
`;

const EXECUTE_ON_NOTEBOOKLM = `
on run argv
  set scriptText to item 1 of argv
  tell application "Google Chrome"
    if it is not running then error "Google Chromeが起動していません。"
    repeat with theWindow in windows
      repeat with theTab in tabs of theWindow
        if URL of theTab starts with "https://notebooklm.google.com" or URL of theTab starts with "https://notebook.google.com" then
          set front window to theWindow
          set active tab index of theWindow to (index of theTab)
          return execute theTab javascript scriptText
        end if
      end repeat
    end repeat
  end tell
  error "NotebookLMのタブが見つかりません。"
end run
`;

export async function openNotebookLm() {
  return runAppleScript(OPEN_TAB, [NOTEBOOKLM_ORIGIN]);
}

export async function executeOnNotebookLm(javascript) {
  return runAppleScript(EXECUTE_ON_NOTEBOOKLM, [javascript]);
}

export async function inspectNotebookLm() {
  const javascript = `(() => JSON.stringify({
    url: location.href,
    title: document.title,
    buttons: Array.from(document.querySelectorAll('button')).map((button) => button.innerText.trim()).filter(Boolean).slice(0, 80),
    inputs: Array.from(document.querySelectorAll('input')).map((input) => ({type: input.type, accept: input.accept, aria: input.getAttribute('aria-label')})).slice(0, 30),
    dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).map((dialog) => dialog.innerText.trim().slice(0, 1000)),
    text: document.body.innerText.trim().slice(0, 5000)
  })) )()`;
  const output = await executeOnNotebookLm(javascript);
  return JSON.parse(output);
}

export { NOTEBOOKLM_ORIGIN };
