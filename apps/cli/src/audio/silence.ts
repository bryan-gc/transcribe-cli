import { spawnSync } from 'child_process';
import { Encoding } from '../constants.js';

export interface Silence {
  start: number;
  end: number;
}

export interface CutPlan {
  cuts: number[];
  hardCuts: number;
}

export const SILENCE_STRICT = { noiseDb: -30, minSeconds: 0.5 } as const;
export const SILENCE_LAX = { noiseDb: -35, minSeconds: 0.3 } as const;

const START_LINE = /silence_start:\s*(-?[\d.]+)/;
const END_LINE = /silence_end:\s*(-?[\d.]+)/;

export function parseSilencedetect(stderr: string): Silence[] {
  const silences: Silence[] = [];
  let open: number | undefined;
  for (const line of stderr.split(/\r?\n/)) {
    const start = START_LINE.exec(line);
    if (start) {
      open = Math.max(0, Number(start[1]));
      continue;
    }
    const end = END_LINE.exec(line);
    if (end && open !== undefined) {
      silences.push({ start: open, end: Number(end[1]) });
      open = undefined;
    }
  }
  if (open !== undefined) silences.push({ start: open, end: Number.POSITIVE_INFINITY });
  return silences;
}

export function detectSilences(
  ffmpeg: string,
  file: string,
  opts: { noiseDb: number; minSeconds: number } = SILENCE_STRICT,
): Silence[] {
  const result = spawnSync(
    ffmpeg,
    [
      '-hide_banner',
      '-nostats',
      '-i',
      file,
      '-af',
      `silencedetect=noise=${opts.noiseDb}dB:d=${opts.minSeconds}`,
      '-f',
      'null',
      '-',
    ],
    { encoding: Encoding.UTF8, maxBuffer: 64 * 1024 * 1024 },
  );
  return parseSilencedetect(result.stderr ?? '');
}

export function planCuts(
  totalSeconds: number,
  maxSeconds: number,
  silences: Silence[],
  laxSilences: Silence[] = [],
): CutPlan {
  const cuts: number[] = [];
  let hardCuts = 0;
  let start = 0;
  while (totalSeconds - start > maxSeconds) {
    const limit = start + maxSeconds;
    const floor = start + maxSeconds / 2;
    const cut = lastCutBefore(silences, floor, limit) ?? lastCutBefore(laxSilences, floor, limit);
    if (cut === undefined) hardCuts++;
    const next = cut ?? limit;
    cuts.push(next);
    start = next;
  }
  return { cuts, hardCuts };
}

function lastCutBefore(silences: Silence[], floor: number, limit: number): number | undefined {
  let best: number | undefined;
  for (const silence of silences) {
    const from = Math.max(silence.start, floor);
    const to = Math.min(silence.end, limit);
    if (to <= from) continue;
    const middle = (from + to) / 2;
    if (best === undefined || middle > best) best = middle;
  }
  return best;
}
