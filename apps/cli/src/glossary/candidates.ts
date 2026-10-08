import fs from 'fs';
import path from 'path';
import { extractCandidates, normalizeTerm, type Candidate } from './extract-terms.js';
import { readCorpus } from './corpus.js';
import { glossaryLines } from '../utils/glossary-prompt.js';
import { parseReplacements } from '../utils/replacements.js';
import { Encoding, EXT, GENERAL_GLOSSARY, getPaths } from '../constants.js';

export const CANDIDATES_DIR = '.candidates';
export const GENERAL_NAME = path.basename(GENERAL_GLOSSARY, EXT.GLOSSARY);

export interface CandidateStore {
  updatedAt: string;
  pending: Candidate[];
  added: string[];
  rejected: string[];
}

export function candidatesFile(basePath: string, name: string): string {
  return path.join(getPaths(basePath).GLOSSARIES_DIR, CANDIDATES_DIR, `${name}.json`);
}

export function readStore(basePath: string, name: string): CandidateStore {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(candidatesFile(basePath, name), Encoding.UTF8),
    ) as Partial<CandidateStore>;
    return {
      updatedAt: parsed.updatedAt ?? '',
      pending: parsed.pending ?? [],
      added: parsed.added ?? [],
      rejected: parsed.rejected ?? [],
    };
  } catch {
    return { updatedAt: '', pending: [], added: [], rejected: [] };
  }
}

export function writeStore(basePath: string, name: string, store: CandidateStore): void {
  const file = candidatesFile(basePath, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, Encoding.UTF8);
}

export function glossaryKeys(raw: string): Set<string> {
  const keys = new Set<string>();
  for (const line of glossaryLines(raw)) {
    for (const part of line.split(/[,;]/)) {
      const term = part.trim();
      if (term) keys.add(normalizeTerm(term));
    }
  }
  for (const rule of parseReplacements(raw)) {
    keys.add(normalizeTerm(rule.from));
    keys.add(normalizeTerm(rule.to));
  }
  return keys;
}

export function knownKeys(basePath: string, name: string, store: CandidateStore): Set<string> {
  const known = new Set([...store.added, ...store.rejected].map(normalizeTerm));
  const dir = getPaths(basePath).GLOSSARIES_DIR;
  for (const file of new Set([GENERAL_GLOSSARY, `${name}${EXT.GLOSSARY}`])) {
    const full = path.join(dir, file);
    if (fs.existsSync(full)) {
      for (const key of glossaryKeys(fs.readFileSync(full, Encoding.UTF8))) known.add(key);
    }
  }
  return known;
}

export function suggestCandidates(
  basePath: string,
  name: string = GENERAL_NAME,
  now: Date = new Date(),
): CandidateStore {
  const store = readStore(basePath, name);
  const pending = extractCandidates(readCorpus(basePath), {
    topic: name === GENERAL_NAME ? undefined : name,
    known: knownKeys(basePath, name, store),
    now,
  });
  const updated = { ...store, updatedAt: now.toISOString(), pending };
  writeStore(basePath, name, updated);
  return updated;
}

export function formatCandidates(name: string, store: CandidateStore): string {
  if (store.pending.length === 0) {
    return `No new terms to suggest for ${name}.`;
  }
  const width = Math.max(...store.pending.map((c) => c.term.length));
  const rows = store.pending.map(
    (c) =>
      `  ${c.term.padEnd(width)}  ${String(c.count).padStart(3)}× in ${String(c.docs).padStart(2)} notes  ${c.reasons.join(', ')}`,
  );
  return [
    `${store.pending.length} suggested terms for ${name}:`,
    ...rows,
    `Review them with: transcribe-cli glossary review ${name === GENERAL_NAME ? '' : name}`.trimEnd(),
  ].join('\n');
}
