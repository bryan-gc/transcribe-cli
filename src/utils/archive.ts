import fs from 'fs';
import path from 'path';
import type { ImportedAudio } from '../audio/audioImport.js';
import {
  DIR,
  EXT,
  Encoding,
  RecordingKind,
  SUPPORTED_IMPORT_EXT,
  type LanguageCode,
} from '../constants.js';
import type { TranscriptionMeta } from './transcriptionMeta.js';

export interface ArchiveEntry extends ImportedAudio {
  source: RecordingKind;
  day: string;
  name: string;
}

export interface Attempt {
  at: string;
  engine?: string;
  model?: string;
  language?: LanguageCode;
  diarized?: boolean;
  glossaryApplied?: boolean;
  text: string;
}

const DAY_FOLDER = /^\d{4}-\d{2}-\d{2}$/;
const ATTEMPTS_EXT = '.attempts.json';

export function archiveEntries(basePath: string): ArchiveEntry[] {
  const found: ArchiveEntry[] = [];
  for (const kind of Object.values(RecordingKind)) {
    const kindDir = path.resolve(basePath, DIR.DATA, kind);
    if (!fs.existsSync(kindDir)) continue;
    for (const day of fs.readdirSync(kindDir, { withFileTypes: true })) {
      if (!day.isDirectory() || !DAY_FOLDER.test(day.name)) continue;
      const dayDir = path.join(kindDir, day.name);
      for (const name of fs.readdirSync(dayDir)) {
        if (isAudio(name)) found.push(entryFor(path.join(dayDir, name)));
      }
    }
  }
  const recency = (entry: ArchiveEntry) => `${entry.day}/${entry.name}`;
  return found.sort((a, b) => recency(b).localeCompare(recency(a)));
}

export function entryFor(audioPath: string): ArchiveEntry {
  const dayDir = path.dirname(audioPath);
  const name = path.basename(audioPath, path.extname(audioPath));
  const stem = path.join(dayDir, name);
  return {
    audioPath,
    srtPath: `${stem}${EXT.SUBTITLES}`,
    textPath: `${stem}${EXT.TEXT}`,
    diarizedPath: `${stem}${EXT.DIARIZED}`,
    metaPath: `${stem}${EXT.META}`,
    converted: false,
    source: path.basename(path.dirname(dayDir)) as RecordingKind,
    day: path.basename(dayDir),
    name,
  };
}

export function readMeta(entry: ArchiveEntry): Partial<TranscriptionMeta> | undefined {
  try {
    return JSON.parse(fs.readFileSync(entry.metaPath, Encoding.UTF8)) as Partial<TranscriptionMeta>;
  } catch {
    return undefined;
  }
}

export function currentAttempt(entry: ArchiveEntry): Attempt | undefined {
  if (!fs.existsSync(entry.textPath)) return undefined;
  const meta = readMeta(entry);
  return {
    at: meta?.at ?? fs.statSync(entry.textPath).mtime.toISOString(),
    engine: meta?.engine,
    model: meta?.model,
    language: meta?.language,
    diarized: meta?.diarized,
    glossaryApplied: meta?.glossary?.applied,
    text: fs.readFileSync(entry.textPath, Encoding.UTF8),
  };
}

export function readAttempts(entry: ArchiveEntry): Attempt[] {
  const current = currentAttempt(entry);
  return [...previousAttempts(entry), ...(current ? [current] : [])];
}

export function keepAttempt(entry: ArchiveEntry, attempt: Attempt): void {
  const all = [...previousAttempts(entry), attempt];
  fs.writeFileSync(attemptsPath(entry), `${JSON.stringify(all, null, 2)}\n`, Encoding.UTF8);
}

function previousAttempts(entry: ArchiveEntry): Attempt[] {
  try {
    return JSON.parse(fs.readFileSync(attemptsPath(entry), Encoding.UTF8)) as Attempt[];
  } catch {
    return [];
  }
}

function attemptsPath(entry: ArchiveEntry): string {
  return entry.textPath.slice(0, -EXT.TEXT.length) + ATTEMPTS_EXT;
}

function isAudio(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return ext === EXT.AUDIO || SUPPORTED_IMPORT_EXT.has(ext);
}
