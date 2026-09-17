export interface Doc {
  id: string;
  text: string;
  topic?: string;
  at: string;
}

export type CandidateReason = 'distinctive' | 'capitalized' | 'shape' | 'bigram';

export interface Candidate {
  term: string;
  key: string;
  score: number;
  count: number;
  docs: number;
  lastSeen: string;
  reasons: CandidateReason[];
  example: string;
}

export interface ExtractOptions {
  topic?: string;
  limit?: number;
  known?: Set<string>;
  now?: Date;
  commonDocRatio?: number;
}

export const COMMON_DOC_RATIO = 0.05;
export const MIN_COMMON_DOCS = 5;
export const MIN_COUNT = 3;
export const MIN_DOCS = 2;
export const MIN_TOKEN_LENGTH = 3;
export const RECENT_DAYS = 30;
export const DEFAULT_LIMIT = 30;
export const USAGE_WEIGHT = 0.5;
export const CAPITALIZED_SHARE = 0.6;
export const TOPIC_SHARE = 0.8;
const EXAMPLE_RADIUS = 36;

const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}'’\-./]*[\p{L}\p{N}]|[\p{L}\p{N}]/gu;
const SENTENCE_BREAK = /[.?!¿¡:;\n]\s*$/;
const LABEL = /^\s*(\[Speaker [^\]]{1,20}\]|[^\s:]{1,20}:)\s*/gmu;
const NUMBER = /^\d+([.,]\d+)*$/;
const SHAPES = [/\d/, /\p{Ll}\p{Lu}/u, /^\p{Lu}{2,}$/u, /\p{L}[-.]\p{L}/u];

export function normalizeTerm(term: string): string {
  return term.toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '');
}

interface Stat {
  key: string;
  count: number;
  docs: Set<string>;
  topicDocs: Set<string>;
  forms: Map<string, number>;
  midSentence: number;
  capitalizedMid: number;
  lastSeen: string;
  example: string;
  bigram: boolean;
}

interface Token {
  form: string;
  key: string;
  index: number;
  midSentence: boolean;
  joinedToPrevious: boolean;
}

export function extractCandidates(docs: Doc[], options: ExtractOptions = {}): Candidate[] {
  const known = options.known ?? new Set<string>();
  const now = options.now ?? new Date();
  const ratio = options.commonDocRatio ?? COMMON_DOC_RATIO;
  const tokenized = docs
    .map((doc) => ({ doc, text: stripLabels(doc.text) }))
    .map(({ doc, text }) => ({
      doc,
      text,
      tokens: tokenize(text),
    }));

  const docFrequency = new Map<string, number>();
  for (const { tokens } of tokenized) {
    for (const key of new Set(tokens.map((t) => t.key))) {
      docFrequency.set(key, (docFrequency.get(key) ?? 0) + 1);
    }
  }
  const commonLimit = Math.max(ratio * docs.length, MIN_COMMON_DOCS);
  const isCommon = (key: string) =>
    key.length < MIN_TOKEN_LENGTH || NUMBER.test(key) || (docFrequency.get(key) ?? 0) > commonLimit;

  const stats = new Map<string, Stat>();
  const topicTotal = docs.filter((d) => d.topic === options.topic).length;

  for (const { doc, text, tokens } of tokenized) {
    const inTopic = options.topic !== undefined && doc.topic === options.topic;
    tokens.forEach((token, i) => {
      if (isCommon(token.key)) return;
      record(stats, token.key, token.form, doc, inTopic, text, token.index, token.midSentence);
      const previous = tokens[i - 1];
      if (
        previous &&
        token.joinedToPrevious &&
        !isCommon(previous.key) &&
        looksLikeTerm(previous.form) &&
        looksLikeTerm(token.form)
      ) {
        const form = `${previous.form} ${token.form}`;
        const stat = record(
          stats,
          `${previous.key} ${token.key}`,
          form,
          doc,
          inTopic,
          text,
          previous.index,
          previous.midSentence,
        );
        stat.bigram = true;
      }
    });
  }

  const total = Math.max(docs.length, 1);
  const candidates: Candidate[] = [];
  for (const stat of stats.values()) {
    if (known.has(stat.key) || stat.count < MIN_COUNT || stat.docs.size < MIN_DOCS) continue;
    if (options.topic !== undefined && stat.topicDocs.size === 0) continue;

    const term = mostFrequentForm(stat.forms);
    const topicShare = options.topic !== undefined ? stat.topicDocs.size / stat.docs.size : 0;
    const distinctive =
      options.topic !== undefined ? topicShare >= TOPIC_SHARE && topicTotal < total : false;

    const reasons: CandidateReason[] = [];
    if (distinctive) reasons.push('distinctive');
    if (stat.midSentence > 0 && stat.capitalizedMid / stat.midSentence >= CAPITALIZED_SHARE) {
      reasons.push('capitalized');
    }
    if (SHAPES.some((shape) => shape.test(term))) reasons.push('shape');
    if (stat.bigram) reasons.push('bigram');
    if (reasons.length === 0) continue;

    const base =
      Math.log2(1 + stat.docs.size) * USAGE_WEIGHT +
      (distinctive ? topicShare : 0) +
      (reasons.includes('capitalized') ? 1 : 0) +
      (reasons.includes('shape') ? 1 : 0) +
      (stat.bigram ? 0.5 : 0);
    const ageDays = (now.getTime() - Date.parse(stat.lastSeen)) / 86_400_000;
    const recency = ageDays <= RECENT_DAYS ? 1 : 0.5;

    candidates.push({
      term,
      key: stat.key,
      score: Math.round(base * recency * 1000) / 1000,
      count: stat.count,
      docs: stat.docs.size,
      lastSeen: stat.lastSeen,
      reasons,
      example: stat.example,
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score || b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, options.limit ?? DEFAULT_LIMIT);
}

function looksLikeTerm(form: string): boolean {
  return /^\p{Lu}/u.test(form) || SHAPES.some((shape) => shape.test(form));
}

function stripLabels(text: string): string {
  return text.replace(LABEL, '');
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let previousEnd = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index!;
    const gap = text.slice(previousEnd, index);
    const before = text.slice(Math.max(0, index - 3), index);
    tokens.push({
      form: match[0],
      key: normalizeTerm(match[0]),
      index,
      midSentence: index > 0 && !SENTENCE_BREAK.test(before) && !/^\s*$/.test(text.slice(0, index)),
      joinedToPrevious: tokens.length > 0 && /^[ \t]+$/.test(gap),
    });
    previousEnd = index + match[0].length;
  }
  return tokens;
}

function record(
  stats: Map<string, Stat>,
  key: string,
  form: string,
  doc: Doc,
  inTopic: boolean,
  text: string,
  index: number,
  midSentence: boolean,
): Stat {
  let stat = stats.get(key);
  if (!stat) {
    stat = {
      key,
      count: 0,
      docs: new Set(),
      topicDocs: new Set(),
      forms: new Map(),
      midSentence: 0,
      capitalizedMid: 0,
      lastSeen: doc.at,
      example: '',
      bigram: false,
    };
    stats.set(key, stat);
  }
  stat.count++;
  stat.docs.add(doc.id);
  if (inTopic) stat.topicDocs.add(doc.id);
  stat.forms.set(form, (stat.forms.get(form) ?? 0) + 1);
  if (midSentence) {
    stat.midSentence++;
    if (/^\p{Lu}/u.test(form)) stat.capitalizedMid++;
  }
  if (doc.at >= stat.lastSeen) {
    stat.lastSeen = doc.at;
    stat.example = excerpt(text, index, form.length);
  }
  return stat;
}

function mostFrequentForm(forms: Map<string, number>): string {
  return [...forms.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
}

function excerpt(text: string, index: number, length: number): string {
  const from = Math.max(0, index - EXAMPLE_RADIUS);
  const to = Math.min(text.length, index + length + EXAMPLE_RADIUS);
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ').trim()}${to < text.length ? '…' : ''}`;
}
