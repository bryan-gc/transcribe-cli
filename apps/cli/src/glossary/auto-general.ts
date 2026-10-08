import fs from 'fs';
import path from 'path';
import { extractCandidates, normalizeTerm } from './extract-terms.js';
import { readCorpus } from './corpus.js';
import { GENERAL_NAME, knownKeys, readStore, writeStore } from './candidates.js';
import { estimateTokens, glossaryLines, PROMPT_TOKEN_BUDGET } from '../utils/glossary-prompt.js';
import { ensureGeneralGlossary } from '../utils/file-utils.js';
import { Encoding, GENERAL_GLOSSARY, getPaths } from '../constants.js';

export const AUTO_MARKER =
  '# ─ automatic: added from your transcriptions; delete a line to reject it for good ─';
export const AUTO_ADD_MIN_SCORE = 2;
export const AUTO_ADD_MIN_DOCS = 3;
export const AUTO_MAX_TERMS = 40;
export const AUTO_MAX_TOKENS = Math.floor(PROMPT_TOKEN_BUDGET / 2);

export interface AutoGeneralLimits {
  maxTerms: number;
  maxTokens: number;
}

export interface AutoGeneralResult {
  added: string[];
  rejected: string[];
  dropped: string[];
}

export function splitGeneral(raw: string): { user: string; auto: string[] } {
  const lines = raw.split(/\r?\n/);
  const marker = lines.findIndex((line) => line.trim() === AUTO_MARKER);
  if (marker === -1) return { user: raw.replace(/\s+$/, ''), auto: [] };
  return {
    user: lines.slice(0, marker).join('\n').replace(/\s+$/, ''),
    auto: lines
      .slice(marker + 1)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#')),
  };
}

export function joinGeneral(user: string, auto: string[]): string {
  const head = user === '' ? '' : `${user}\n\n`;
  return auto.length === 0
    ? `${head}`.replace(/\n+$/, '\n')
    : `${head}${AUTO_MARKER}\n${auto.join('\n')}\n`;
}

export function fitAutoTerms(user: string, auto: string[], limits: AutoGeneralLimits): string[] {
  const fitted = auto.slice(-limits.maxTerms);
  const userLines = glossaryLines(user);
  while (
    fitted.length > 0 &&
    estimateTokens([...userLines, ...fitted].join('\n')) > limits.maxTokens
  ) {
    fitted.shift();
  }
  return fitted;
}

export function updateAutoGeneral(
  basePath: string,
  now: Date = new Date(),
  limits: AutoGeneralLimits = { maxTerms: AUTO_MAX_TERMS, maxTokens: AUTO_MAX_TOKENS },
): AutoGeneralResult {
  ensureGeneralGlossary(basePath);
  const file = path.join(getPaths(basePath).GLOSSARIES_DIR, GENERAL_GLOSSARY);
  const { user, auto } = splitGeneral(fs.readFileSync(file, Encoding.UTF8));
  const store = readStore(basePath, GENERAL_NAME);

  const present = new Set(auto.map(normalizeTerm));
  const rejected = store.added.filter((term) => !present.has(normalizeTerm(term)));
  const rejectedKeys = new Set([...store.rejected, ...rejected].map(normalizeTerm));
  store.rejected = [...new Set([...store.rejected, ...rejected])];
  store.added = store.added.filter((term) => present.has(normalizeTerm(term)));

  const autoKeys = new Set(auto.map(normalizeTerm));
  const known = knownKeys(basePath, GENERAL_NAME, store);
  for (const key of autoKeys) known.delete(key);
  const ageLimit = now.getTime() - 30 * 86_400_000;
  const scores = new Map<string, number>();
  const fresh: string[] = [];
  for (const c of extractCandidates(readCorpus(basePath), { known, now, limit: 500 })) {
    if (rejectedKeys.has(c.key)) continue;
    if (autoKeys.has(c.key)) {
      scores.set(c.key, c.score);
      continue;
    }
    if (
      c.score >= AUTO_ADD_MIN_SCORE &&
      c.docs >= AUTO_ADD_MIN_DOCS &&
      Date.parse(c.lastSeen) >= ageLimit
    ) {
      scores.set(c.key, c.score);
      fresh.push(c.term);
    }
  }

  const byScore = [...auto, ...fresh].sort(
    (a, b) => (scores.get(normalizeTerm(b)) ?? 0) - (scores.get(normalizeTerm(a)) ?? 0),
  );
  const keep = new Set(fitAutoTerms(user, byScore.toReversed(), limits).map(normalizeTerm));
  const fitted = [...auto, ...fresh].filter((term) => keep.has(normalizeTerm(term)));
  const fittedKeys = keep;
  const added = fresh.filter((term) => fittedKeys.has(normalizeTerm(term)));
  const dropped = auto.filter((term) => !fittedKeys.has(normalizeTerm(term)));

  store.added = [...store.added.filter((t) => fittedKeys.has(normalizeTerm(t))), ...added];
  store.pending = store.pending.filter((c) => !fittedKeys.has(c.key));
  store.updatedAt = now.toISOString();
  writeStore(basePath, GENERAL_NAME, store);

  if (added.length > 0 || dropped.length > 0) {
    fs.writeFileSync(file, joinGeneral(user, fitted), Encoding.UTF8);
  }
  return { added, rejected, dropped };
}
