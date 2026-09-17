import fs from 'fs';
import path from 'path';
import {
  DIR,
  EXT,
  Encoding,
  GENERAL_GLOSSARY,
  GENERAL_GLOSSARY_HEADER,
  RecordingKind,
  getPaths,
} from '../constants.js';

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
    metaPath: path.join(dir, `${stem}${EXT.META}`),
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
    .filter((f) => f.endsWith(EXT.GLOSSARY) && f !== GENERAL_GLOSSARY)
    .sort();
}

export function selectedGlossaryFiles(topic: string, useGeneral: boolean): string[] {
  return [...(useGeneral ? [GENERAL_GLOSSARY] : []), ...(topic ? [topic] : [])];
}

export function readSelectedGlossaries(
  basePath: string,
  topic: string,
  useGeneral: boolean,
): string | undefined {
  const parts = selectedGlossaryFiles(topic, useGeneral)
    .map((file) => readGlossaryContent(basePath, file))
    .filter((content): content is string => content !== undefined);
  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function glossarySelectionLabel(topic: string, useGeneral: boolean): string {
  const names = selectedGlossaryFiles(topic, useGeneral).map((file) => glossaryNameOf(file)!);
  return names.length > 0 ? names.join(' + ') : '(none)';
}

export function glossaryMetaName(topic: string, useGeneral: boolean): string | undefined {
  return glossaryNameOf(topic) ?? (useGeneral ? glossaryNameOf(GENERAL_GLOSSARY) : undefined);
}

export function ensureGeneralGlossary(basePath: string): void {
  const file = path.join(getPaths(basePath).GLOSSARIES_DIR, GENERAL_GLOSSARY);
  if (!fs.existsSync(file)) fs.writeFileSync(file, GENERAL_GLOSSARY_HEADER, Encoding.UTF8);
}

export function glossaryNameOf(filename: string): string | undefined {
  return filename ? path.basename(filename, EXT.GLOSSARY) : undefined;
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
