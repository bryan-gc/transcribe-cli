import fs from 'fs';
import path from 'path';
import type { ImportedAudio } from '../audio/audioImport.js';
import { DIR, EXT, Encoding, RecordingKind, SUPPORTED_IMPORT_EXT } from '../constants.js';

export class RetryError extends Error {}

export interface RetryTarget extends ImportedAudio {
  source: RecordingKind;
  aside: boolean;
}

const DAY_FOLDER = /^\d{4}-\d{2}-\d{2}$/;
const STEM_SUFFIXES = [EXT.META, EXT.DIARIZED, EXT.SUBTITLES, EXT.TEXT];

export function findRetryTarget(basePath: string, file?: string): RetryTarget {
  const audioPath = file ? audioFor(basePath, path.resolve(file)) : newestAudio(basePath);
  const dayDir = path.dirname(audioPath);
  const stem = path.join(dayDir, path.basename(audioPath, path.extname(audioPath)));
  const metaPath = `${stem}${EXT.META}`;
  return {
    audioPath,
    srtPath: `${stem}${EXT.SUBTITLES}`,
    textPath: `${stem}${EXT.TEXT}`,
    diarizedPath: `${stem}${EXT.DIARIZED}`,
    metaPath,
    converted: false,
    source: path.basename(path.dirname(dayDir)) as RecordingKind,
    aside: readAside(metaPath),
  };
}

function newestAudio(basePath: string): string {
  const found: string[] = [];
  for (const kind of Object.values(RecordingKind)) {
    const kindDir = path.resolve(basePath, DIR.DATA, kind);
    if (!fs.existsSync(kindDir)) continue;
    for (const day of fs.readdirSync(kindDir, { withFileTypes: true })) {
      if (!day.isDirectory() || !DAY_FOLDER.test(day.name)) continue;
      const dayDir = path.join(kindDir, day.name);
      for (const name of fs.readdirSync(dayDir)) {
        if (isAudio(name)) found.push(path.join(dayDir, name));
      }
    }
  }
  const recency = (file: string) => `${path.basename(path.dirname(file))}/${path.basename(file)}`;
  const newest = found.sort((a, b) => recency(b).localeCompare(recency(a)))[0];
  if (!newest) throw new RetryError('Nothing to retry: there is no recording in the archive yet.');
  return newest;
}

function audioFor(basePath: string, file: string): string {
  const archive = path.resolve(basePath, DIR.DATA);
  const kind = path.basename(path.dirname(path.dirname(file)));
  const inArchive =
    path.dirname(path.dirname(path.dirname(file))) === archive &&
    (Object.values(RecordingKind) as string[]).includes(kind);
  if (!inArchive) {
    throw new RetryError(
      `${file} is not in the archive (${archive}). To transcribe it, use -f instead.`,
    );
  }
  if (isAudio(file) && fs.existsSync(file)) return file;

  const name = path.basename(file);
  const suffix = STEM_SUFFIXES.find((ext) => name.endsWith(ext));
  const stem = suffix ? name.slice(0, -suffix.length) : name;
  const dayDir = path.dirname(file);
  const audio = fs.existsSync(dayDir)
    ? fs.readdirSync(dayDir).find((f) => isAudio(f) && f === `${stem}${path.extname(f)}`)
    : undefined;
  if (!audio) throw new RetryError(`No audio next to ${file}, so there is nothing to transcribe.`);
  return path.join(dayDir, audio);
}

function isAudio(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return ext === EXT.AUDIO || SUPPORTED_IMPORT_EXT.has(ext);
}

function readAside(metaPath: string): boolean {
  try {
    return JSON.parse(fs.readFileSync(metaPath, Encoding.UTF8)).aside === true;
  } catch {
    return false;
  }
}
