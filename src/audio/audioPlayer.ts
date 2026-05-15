import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import os from 'os';
import { Platform, Cmd, Signal, ProcessEvent, StdioOption } from '../constants';

let playProcess: ChildProcess | null = null;

export function stopPlayback() {
  if (playProcess) {
    playProcess.kill(Signal.SIGTERM);
    playProcess = null;
  }
}

/**
 * Plays a WAV file. Tries 'play' (sox) first, falls back to 'aplay' on Linux,
 * or 'afplay' on macOS. Resolves when playback finishes or is stopped.
 */
export function playAudio(filepath: string): Promise<void> {
  stopPlayback();

  const platform = os.platform();
  const getCmdArgs = (): { cmd: string; args: string[] } => {
    if (platform === Platform.DARWIN) {
      return { cmd: Cmd.AFPLAY, args: [filepath] };
    }
    // Try sox's 'play' first (already installed for recording)
    try {
      execSync(`which ${Cmd.PLAY}`, { stdio: StdioOption.IGNORE });
      return { cmd: Cmd.PLAY, args: [filepath] };
    } catch {
      return { cmd: Cmd.APLAY, args: [filepath] };
    }
  };

  const { cmd, args } = getCmdArgs();

  return new Promise((resolve, reject) => {
    playProcess = spawn(cmd, args, { stdio: StdioOption.IGNORE });
    playProcess.on(ProcessEvent.CLOSE, (code) => {
      playProcess = null;
      if (code === null || code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Playback exited with code ${code}`));
    });
    playProcess.on(ProcessEvent.ERROR, (err) => {
      playProcess = null;
      reject(err);
    });
  });
}
