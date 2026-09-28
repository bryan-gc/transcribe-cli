import fs from 'fs';
import path from 'path';
import { DIR, EXT, Encoding, HISTORY_SAMPLE_SIZE } from '../constants.js';
import type { TranscriptionMeta } from './transcriptionMeta.js';
import type { SpeedLookup } from './estimate.js';

export function readRecentMeta(
  basePath: string,
  limit: number = HISTORY_SAMPLE_SIZE,
): TranscriptionMeta[] {
  const root = path.resolve(basePath, DIR.DATA);
  if (!fs.existsSync(root)) return [];

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(EXT.META)) files.push(full);
    }
  };
  walk(root);

  return files
    .sort((a, b) => recency(b).localeCompare(recency(a)))
    .flatMap((file) => {
      try {
        const meta = JSON.parse(fs.readFileSync(file, Encoding.UTF8)) as TranscriptionMeta;
        return meta.engine === undefined ? [] : [meta];
      } catch {
        return [];
      }
    })
    .slice(0, limit);
}

function recency(file: string): string {
  return `${path.basename(path.dirname(file))}/${path.basename(file)}`;
}

export function measuredSpeed(history: TranscriptionMeta[]): SpeedLookup {
  const totals = new Map<string, { tookMs: number; audioMs: number }>();
  for (const meta of history) {
    const seconds = meta.audio?.seconds;
    if (!seconds || !meta.tookMs) continue;
    const current = totals.get(meta.model) ?? { tookMs: 0, audioMs: 0 };
    totals.set(meta.model, {
      tookMs: current.tookMs + meta.tookMs,
      audioMs: current.audioMs + seconds * 1000,
    });
  }
  return (model) => {
    const total = totals.get(model);
    return total && total.audioMs > 0 ? total.tookMs / total.audioMs : undefined;
  };
}
