import { spawn, type StdioOptions } from 'child_process';
import os from 'os';

const PLATFORM_MAC = 'darwin';
const PLATFORM_WIN = 'win32';

const CMD_MAC = 'pbcopy';
const CMD_WIN = 'clip';
const CMD_LINUX_PRIMARY = 'xclip';
const CMD_LINUX_SECONDARY = 'xsel';

const ARGS_LINUX_PRIMARY = ['-selection', 'clipboard'];
const ARGS_LINUX_SECONDARY = ['--clipboard', '--input'];

const STDIO_IGNORE: StdioOptions = ['pipe', 'ignore', 'ignore'];
const EVENT_ERROR = 'error';

/**
 * Copies text to the system clipboard asynchronously.
 * Supports Linux (xclip / xsel), macOS (pbcopy) and Windows (clip).
 * Fails silently if no clipboard tool is available.
 *
 * We use spawn instead of execSync because tools like xclip on Linux
 * can fork into the background and keep the process alive, which causes
 * execSync to hang forever and freeze the application UI.
 */
export function copyTextToClipboard(text: string): void {
  const platform = os.platform();
  const getCmdArgs = (): { cmd: string; args: string[] } => {
    if (platform === PLATFORM_MAC) return { cmd: CMD_MAC, args: [] };
    if (platform === PLATFORM_WIN) return { cmd: CMD_WIN, args: [] };
    return { cmd: CMD_LINUX_PRIMARY, args: ARGS_LINUX_PRIMARY };
  };

  const { cmd, args } = getCmdArgs();

  try {
    const proc = spawn(cmd, args, { stdio: STDIO_IGNORE });

    proc.on(EVENT_ERROR, () => {
      if (cmd === CMD_LINUX_PRIMARY) {
        // Fallback to xsel if xclip fails on Linux
        const fallback = spawn(CMD_LINUX_SECONDARY, ARGS_LINUX_SECONDARY, {
          stdio: STDIO_IGNORE,
        });
        fallback.on(EVENT_ERROR, () => {});
        if (fallback.stdin) {
          fallback.stdin.write(text);
          fallback.stdin.end();
        }
      }
    });

    if (proc.stdin) {
      proc.stdin.write(text);
      proc.stdin.end();
    }
  } catch {
    // Silently ignore clipboard errors
  }
}
