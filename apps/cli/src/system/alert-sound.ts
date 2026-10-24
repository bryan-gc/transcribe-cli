import { spawn } from 'child_process';
import { Cmd, ProcessEvent, StdioOption } from '../constants.js';

const TERMINAL_BELL = '\u0007';
const BEEPS = [
  '-q',
  '-n',
  'synth',
  '0.15',
  'sine',
  '880',
  'vol',
  '0.6',
  'pad',
  '0',
  '0.1',
  'repeat',
  '2',
];

export function playAlertSound(): void {
  const player = spawn(Cmd.PLAY, BEEPS, { stdio: StdioOption.IGNORE });
  player.on(ProcessEvent.ERROR, () => {});
  player.on(ProcessEvent.CLOSE, (code) => {
    if (code !== 0) process.stdout.write(TERMINAL_BELL);
  });
}
