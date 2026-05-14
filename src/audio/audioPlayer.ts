import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import os from 'os';

let playProcess: ChildProcess | null = null;

export function stopPlayback() {
  if (playProcess) {
    playProcess.kill('SIGTERM');
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
    if (platform === 'darwin') {
      return { cmd: 'afplay', args: [filepath] };
    }
    // Try sox's 'play' first (already installed for recording)
    try {
      execSync('which play', { stdio: 'ignore' });
      return { cmd: 'play', args: [filepath] };
    } catch {
      return { cmd: 'aplay', args: [filepath] };
    }
  };

  const { cmd, args } = getCmdArgs();

  return new Promise((resolve, reject) => {
    playProcess = spawn(cmd, args, { stdio: 'ignore' });
    playProcess.on('close', (code) => {
      playProcess = null;
      if (code === null || code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Playback exited with code ${code}`));
    });
    playProcess.on('error', (err) => {
      playProcess = null;
      reject(err);
    });
  });
}
