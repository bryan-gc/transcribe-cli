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

export class ClipboardError extends Error {}

export function copyTextToClipboard(text: string): Promise<void> {
  const platform = os.platform();
  if (platform === PLATFORM_MAC) return write(CMD_MAC, [], text);
  if (platform === PLATFORM_WIN) return write(CMD_WIN, [], text);

  return write(CMD_LINUX_PRIMARY, ARGS_LINUX_PRIMARY, text).catch(() =>
    write(CMD_LINUX_SECONDARY, ARGS_LINUX_SECONDARY, text).catch(() => {
      throw new ClipboardError(
        `Could not copy: neither ${CMD_LINUX_PRIMARY} nor ${CMD_LINUX_SECONDARY} is available. Run transcribe-cli doctor.`,
      );
    }),
  );
}

function write(cmd: string, args: string[], text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    try {
      const proc = spawn(cmd, args, { stdio: STDIO_IGNORE });
      proc.on(EVENT_ERROR, (error: Error) => finish(error));

      if (!proc.stdin) return finish(new ClipboardError(`${cmd} accepted no input.`));
      proc.stdin.on(EVENT_ERROR, (error: Error) => finish(error));
      proc.stdin.end(text, () => finish());
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
