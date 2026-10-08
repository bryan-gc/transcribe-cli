import fs from 'fs';
import path from 'path';
import { normalizeTerm } from './extract-terms.js';
import { GENERAL_NAME, readStore, writeStore } from './candidates.js';
import { AUTO_MARKER } from './auto-general.js';
import { Encoding, EXT, getPaths } from '../constants.js';

export enum ReviewAction {
  ADD = 'add',
  GENERAL = 'general',
  REJECT = 'reject',
  SKIP = 'skip',
}

export interface ReviewDecision {
  term: string;
  action: ReviewAction;
  corrected?: string;
}

export interface ReviewSummary {
  addedToTopic: number;
  addedToGeneral: number;
  rejected: number;
}

export function reviewHeader(now: Date): string {
  return `# added by review ${now.toISOString().slice(0, 10)}`;
}

export function appendTerms(raw: string, lines: string[], now: Date): string {
  if (lines.length === 0) return raw;
  const block = [reviewHeader(now), ...lines].join('\n');
  const marker = raw.split('\n').findIndex((line) => line.trim() === AUTO_MARKER);
  if (marker === -1) return `${raw.replace(/\s+$/, '')}${raw.trim() ? '\n\n' : ''}${block}\n`;
  const all = raw.split('\n');
  const before = all.slice(0, marker).join('\n').replace(/\s+$/, '');
  return `${before}${before ? '\n\n' : ''}${block}\n\n${all.slice(marker).join('\n')}`;
}

export function linesFor(decision: ReviewDecision): string[] {
  const corrected = decision.corrected?.trim();
  if (!corrected || corrected === decision.term) return [decision.term];
  return [corrected, `${decision.term} => ${corrected}`];
}

export function applyReview(
  basePath: string,
  name: string,
  decisions: ReviewDecision[],
  now: Date = new Date(),
): ReviewSummary {
  const dir = getPaths(basePath).GLOSSARIES_DIR;
  const toTopic = decisions.filter((d) => d.action === ReviewAction.ADD);
  const toGeneral = decisions.filter(
    (d) =>
      d.action === ReviewAction.GENERAL || (d.action === ReviewAction.ADD && name === GENERAL_NAME),
  );
  const topicLines = name === GENERAL_NAME ? [] : toTopic.flatMap(linesFor);
  const generalLines = toGeneral.flatMap(linesFor);

  for (const [target, lines] of [
    [name, topicLines],
    [GENERAL_NAME, generalLines],
  ] as const) {
    if (lines.length === 0) continue;
    const file = path.join(dir, `${target}${EXT.GLOSSARY}`);
    const raw = fs.existsSync(file) ? fs.readFileSync(file, Encoding.UTF8) : '';
    fs.writeFileSync(file, appendTerms(raw, lines, now), Encoding.UTF8);
  }

  const decided = new Set(
    decisions.filter((d) => d.action !== ReviewAction.SKIP).map((d) => normalizeTerm(d.term)),
  );
  const rejected = decisions.filter((d) => d.action === ReviewAction.REJECT).map((d) => d.term);
  const store = readStore(basePath, name);
  writeStore(basePath, name, {
    ...store,
    pending: store.pending.filter((c) => !decided.has(c.key)),
    rejected: [...new Set([...store.rejected, ...rejected])],
  });

  return {
    addedToTopic: name === GENERAL_NAME ? 0 : toTopic.length,
    addedToGeneral: toGeneral.length,
    rejected: rejected.length,
  };
}
