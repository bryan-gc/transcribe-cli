import { isReplacementLine } from './replacements.js';

export const PROMPT_TOKEN_BUDGET = 220;

const CHARS_PER_TOKEN = 3;
const COMMENT_PREFIX = '#';

export interface GlossaryPrompt {
  text: string;
  estimatedTokens: number;
  trimmed: boolean;
  droppedLines: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function glossaryLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith(COMMENT_PREFIX) && !isReplacementLine(line));
}

export function buildGlossaryPrompt(
  raw: string | undefined,
  budget: number = PROMPT_TOKEN_BUDGET,
): GlossaryPrompt | undefined {
  const lines = glossaryLines(raw ?? '');
  if (lines.length === 0) return undefined;

  let kept = lines;
  while (kept.length > 1 && estimateTokens(kept.join('\n')) > budget) {
    kept = kept.slice(1);
  }

  let text = kept.join('\n');
  if (estimateTokens(text) > budget) text = keepLastWords(text, budget);

  return {
    text,
    estimatedTokens: estimateTokens(text),
    trimmed: kept.length < lines.length || text !== kept.join('\n'),
    droppedLines: lines.length - kept.length,
  };
}

function keepLastWords(line: string, budget: number): string {
  const words = line.split(/\s+/);
  let start = 0;
  while (start < words.length - 1 && estimateTokens(words.slice(start).join(' ')) > budget) {
    start++;
  }
  const text = words.slice(start).join(' ');
  return estimateTokens(text) > budget ? text.slice(-budget * CHARS_PER_TOKEN) : text;
}

export function promptAsLine(prompt: string): string {
  return prompt
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(', ');
}
