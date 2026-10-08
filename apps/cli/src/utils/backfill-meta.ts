import fs from 'fs';
import path from 'path';
import { audioDurationSeconds } from '../audio/audio-duration.js';
import { DIR, EXT, Encoding, RecordingKind, SUPPORTED_IMPORT_EXT } from '../constants.js';

const DAY_FOLDER = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PREFIX = /^(\d{2})-(\d{2})-(\d{2})/;

export interface BackfilledMeta {
  at: string;
  source: RecordingKind;
  audio?: { file: string; seconds?: number };
  backfilled: true;
}

export type DurationOf = (audioPath: string) => number | undefined;

export function transcriptsWithoutMeta(basePath: string): string[] {
  const found: string[] = [];
  for (const kind of Object.values(RecordingKind)) {
    const kindDir = path.resolve(basePath, DIR.DATA, kind);
    if (!fs.existsSync(kindDir)) continue;
    for (const day of fs.readdirSync(kindDir, { withFileTypes: true })) {
      if (!day.isDirectory() || !DAY_FOLDER.test(day.name)) continue;
      const dayDir = path.join(kindDir, day.name);
      for (const name of fs.readdirSync(dayDir)) {
        if (!name.endsWith(EXT.TEXT) || !TIME_PREFIX.test(name)) continue;
        const stem = path.join(dayDir, name.slice(0, -EXT.TEXT.length));
        if (!fs.existsSync(`${stem}${EXT.META}`)) found.push(`${stem}${EXT.TEXT}`);
      }
    }
  }
  return found.toSorted((a, b) => a.localeCompare(b));
}

export function backfilledMeta(
  textPath: string,
  durationOf: DurationOf = audioDurationSeconds,
): BackfilledMeta {
  const dayDir = path.dirname(textPath);
  const stem = path.basename(textPath, EXT.TEXT);
  const [year = 0, month = 1, day = 1] = numbers(DAY_FOLDER, path.basename(dayDir));
  const [hours = 0, minutes = 0, seconds = 0] = numbers(TIME_PREFIX, stem);
  const audioFile = fs.readdirSync(dayDir).find((name) => {
    const ext = path.extname(name).toLowerCase();
    return (
      name === `${stem}${path.extname(name)}` &&
      (ext === EXT.AUDIO || SUPPORTED_IMPORT_EXT.has(ext))
    );
  });
  const audioSeconds = audioFile ? durationOf(path.join(dayDir, audioFile)) : undefined;

  return {
    at: new Date(year, month - 1, day, hours, minutes, seconds).toISOString(),
    source: path.basename(path.dirname(dayDir)) as RecordingKind,
    ...(audioFile
      ? {
          audio: {
            file: audioFile,
            ...(audioSeconds !== undefined ? { seconds: audioSeconds } : {}),
          },
        }
      : {}),
    backfilled: true,
  };
}

export function backfillMeta(
  textPaths: string[],
  durationOf: DurationOf = audioDurationSeconds,
): number {
  let written = 0;
  for (const textPath of textPaths) {
    const metaPath = `${textPath.slice(0, -EXT.TEXT.length)}${EXT.META}`;
    if (fs.existsSync(metaPath)) continue;
    const meta = backfilledMeta(textPath, durationOf);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), Encoding.UTF8);
    written += 1;
  }
  return written;
}

function numbers(pattern: RegExp, text: string): number[] {
  return (pattern.exec(text) ?? []).slice(1).map(Number);
}
