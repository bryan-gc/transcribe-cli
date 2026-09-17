import fs from 'fs';
import path from 'path';
import type { Doc } from './extractTerms.js';
import type { TranscriptionMeta } from '../utils/transcriptionMeta.js';
import { DIR, EXT, Encoding } from '../constants.js';

export function readCorpus(basePath: string): Doc[] {
  const root = path.resolve(basePath, DIR.DATA);
  if (!fs.existsSync(root)) return [];

  const docs: Doc[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(EXT.TEXT) && !entry.name.endsWith(EXT.META)) {
        docs.push(readDoc(root, full));
      }
    }
  };
  walk(root);
  return docs.sort((a, b) => a.at.localeCompare(b.at));
}

function readDoc(root: string, textFile: string): Doc {
  const meta = readMeta(textFile.slice(0, -EXT.TEXT.length) + EXT.META);
  return {
    id: path.relative(root, textFile),
    text: fs.readFileSync(textFile, Encoding.UTF8),
    topic: meta?.glossary?.name,
    at: meta?.at ?? fs.statSync(textFile).mtime.toISOString(),
  };
}

function readMeta(file: string): TranscriptionMeta | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, Encoding.UTF8)) as TranscriptionMeta;
  } catch {
    return undefined;
  }
}
