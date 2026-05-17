import fs from 'fs';
import path from 'path';
import { DIR, EXT, Encoding, getPaths } from '../constants.js';

/**
 * Generates unique file paths for audio, srt, and text files based on the current timestamp.
 */
export function getTimestampPaths(basePath: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const folder = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const base = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const tmpDir = path.resolve(basePath, DIR.TMP, folder);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  return {
    audioPath: path.join(tmpDir, `${base}${EXT.AUDIO}`),
    srtPath: path.join(tmpDir, `${base}${EXT.SUBTITLES}`),
    textPath: path.join(tmpDir, `${base}${EXT.TEXT}`),
  };
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
