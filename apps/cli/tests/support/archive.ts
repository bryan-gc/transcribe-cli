import fs from 'node:fs';
import path from 'node:path';
import type { Sandbox } from './sandbox.js';

export interface SeededNote {
  daysAgo: number;
  text: string;
  topic?: string;
  kind?: 'recorded' | 'imported';
  seconds?: number;
  engine?: string;
  model?: string;
  tookMs?: number;
  meta?: Record<string, unknown> | false;
}

const DAY_MS = 86_400_000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function noteDate(daysAgo: number, index = 0): Date {
  const date = new Date(Date.now() - daysAgo * DAY_MS);
  date.setHours(9, 0, index % 60, 0);
  return date;
}

export function seedNotes(sandbox: Sandbox, notes: SeededNote[]): string[] {
  return notes.map((note, index) => {
    const at = noteDate(note.daysAgo, index);
    const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
    const stem = `${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`;
    const dir = sandbox.dataFile('transcriptions', note.kind ?? 'recorded', day);
    fs.mkdirSync(dir, { recursive: true });
    const base = path.join(dir, stem);
    fs.writeFileSync(`${base}.txt`, note.text);
    fs.writeFileSync(`${base}.wav`, '');
    if (note.meta !== false) {
      fs.writeFileSync(
        `${base}.meta.json`,
        JSON.stringify({
          at: at.toISOString(),
          source: note.kind ?? 'recorded',
          audio: { file: `${stem}.wav`, seconds: note.seconds ?? 60 },
          engine: note.engine ?? 'openai',
          model: note.model ?? 'whisper-1',
          language: 'es',
          diarized: false,
          tookMs: note.tookMs ?? 3000,
          cost: { usd: 0.006, estimated: true },
          pricingCheckedOn: '2026-09-07',
          ...(note.topic
            ? { glossary: { name: note.topic, applied: true, trimmed: false, estimatedTokens: 5 } }
            : {}),
          ...note.meta,
        }),
      );
    }
    return base;
  });
}
