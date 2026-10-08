import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface Tone {
  seconds: number;
  silence?: boolean;
}

export function makeAudio(target: string, parts: Tone[], sampleRate = 16000): string {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const inputs = parts.flatMap((part, index) => [
    '-f',
    'lavfi',
    '-i',
    part.silence
      ? `anullsrc=r=${sampleRate}:cl=mono:d=${part.seconds}`
      : `sine=frequency=${300 + index * 40}:sample_rate=${sampleRate}:duration=${part.seconds}`,
  ]);
  const filter = `${parts.map((_, index) => `[${index}:a]`).join('')}concat=n=${parts.length}:v=0:a=1[out]`;
  execFileSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-y',
      ...inputs,
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-ac',
      '1',
      target,
    ],
    { stdio: 'ignore' },
  );
  return target;
}

export function makeTone(target: string, seconds: number): string {
  return makeAudio(target, [{ seconds }]);
}

export function audioSeconds(file: string): number {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  );
  return Number.parseFloat(out.trim());
}
