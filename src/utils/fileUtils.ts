import fs from 'fs';
import path from 'path';
import { DIR, EXT, Encoding, RecordingKind, getPaths } from '../constants.js';

export interface TimestampPathOptions {
  now?: Date;
  originalName?: string;
  audioExt?: string;
}

export function getTimestampPaths(
  basePath: string,
  kind: RecordingKind = RecordingKind.RECORDED,
  { now = new Date(), originalName, audioExt = EXT.AUDIO }: TimestampPathOptions = {},
) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const folder = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const stem = originalName ? `${time}__${sanitizeName(originalName)}` : time;
  const dir = path.resolve(basePath, DIR.DATA, kind, folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return {
    audioPath: path.join(dir, `${stem}${audioExt}`),
    srtPath: path.join(dir, `${stem}${EXT.SUBTITLES}`),
    textPath: path.join(dir, `${stem}${EXT.TEXT}`),
    diarizedPath: path.join(dir, `${stem}${EXT.DIARIZED}`),
  };
}

export function sanitizeName(name: string): string {
  const stem = path.basename(name, path.extname(name));
  const ascii = stem.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'audio';
}

/**
 * Loads the list of available glossary files from the configured directory.
 */
export function loadGlossaryFiles(basePath: string): string[] {
  const dir = getPaths(basePath).GLOSSARIES_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(EXT.GLOSSARY))
    .sort();
}

/**
 * Reads the content of a specific glossary file.
 */
export function readGlossaryContent(basePath: string, filename: string): string | undefined {
  if (!filename) return undefined;
  const filepath = path.join(getPaths(basePath).GLOSSARIES_DIR, filename);
  const content = fs.existsSync(filepath) ? fs.readFileSync(filepath, Encoding.UTF8).trim() : '';
  return content || undefined;
}

/**
 * Ensures at least one glossary is selected if available.
 * Useful for automatic modes where a default might be needed.
 */
export function getInitialGlossary(basePath: string): string {
  const files = loadGlossaryFiles(basePath);
  return files[0] ?? '';
}
