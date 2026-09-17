import fs from 'fs';
import path from 'path';
import { openInEditor } from '../system/editor.js';
import { formatCandidates, GENERAL_NAME, suggestCandidates } from './candidates.js';
import { applyReview, type ReviewDecision } from './applyReview.js';
import type { Candidate } from './extractTerms.js';
import {
  ensureGeneralGlossary,
  glossaryNameOf,
  loadGlossaryFiles,
  readSelectedGlossaries,
} from '../utils/fileUtils.js';
import {
  buildGlossaryPrompt,
  estimateTokens,
  glossaryLines,
  PROMPT_TOKEN_BUDGET,
} from '../utils/glossaryPrompt.js';
import { Encoding, EXT, GENERAL_GLOSSARY, getPaths } from '../constants.js';

export const GLOSSARY_SUBCOMMANDS = ['edit', 'new', 'show', 'suggest', 'review'] as const;

const VALID_NAME = /^[\p{L}\p{N}_-]+$/u;

export class GlossaryCommandError extends Error {}

export interface GlossarySummary {
  name: string;
  lines: number;
  tokens: number;
  overBudget: boolean;
}

export interface GlossaryCommandDeps {
  write: (text: string) => void;
  edit: (file: string) => Promise<number>;
  review?: (name: string, candidates: Candidate[]) => Promise<ReviewDecision[] | undefined>;
}

const defaultDeps: GlossaryCommandDeps = {
  write: (text) => process.stdout.write(text),
  edit: (file) => openInEditor(file),
};

export function newGlossaryHeader(name: string): string {
  return [
    `# Glossary: ${name}`,
    '# One term, name or short phrase per line, or a comma-separated list.',
    '# Lines starting with # are ignored.',
    `# Only about ${PROMPT_TOKEN_BUDGET} tokens are sent: when it is longer, the TOP lines are dropped first,`,
    '# so keep the most important terms at the bottom.',
    '',
  ].join('\n');
}

export function summarizeGlossary(name: string, raw: string): GlossarySummary {
  const lines = glossaryLines(raw);
  const tokens = estimateTokens(lines.join('\n'));
  return { name, lines: lines.length, tokens, overBudget: tokens > PROMPT_TOKEN_BUDGET };
}

export function readGlossarySummary(basePath: string, file: string): GlossarySummary {
  const filePath = path.join(getPaths(basePath).GLOSSARIES_DIR, file);
  const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, Encoding.UTF8) : '';
  return summarizeGlossary(glossaryNameOf(file)!, raw);
}

export function glossaryOptionLabel(summary: GlossarySummary): string {
  const size = `~${summary.tokens} tokens${summary.overBudget ? ' ⚠ trimmed' : ''}`;
  return `${summary.name}  (${size})`;
}

export function formatGlossaryList(summaries: GlossarySummary[]): string {
  const width = Math.max(...summaries.map((s) => s.name.length), 0);
  const rows = summaries.map((s) => {
    const warning = s.overBudget
      ? `  ⚠ over budget: only the last ~${PROMPT_TOKEN_BUDGET} tokens are sent`
      : '';
    return `  ${s.name.padEnd(width)}  ${String(s.lines).padStart(3)} lines  ~${s.tokens} tokens${warning}`;
  });
  return ['transcribe-cli glossary', ...rows].join('\n');
}

export async function runGlossaryCommand(
  basePath: string,
  args: string[],
  useGeneral: boolean,
  deps: GlossaryCommandDeps = defaultDeps,
): Promise<number> {
  const dir = getPaths(basePath).GLOSSARIES_DIR;
  fs.mkdirSync(dir, { recursive: true });
  ensureGeneralGlossary(basePath);

  const [sub, name] = args;
  if (sub === undefined) {
    deps.write(`${formatGlossaryList(listSummaries(basePath))}\n`);
    return 0;
  }

  if (sub === 'new') {
    const file = fileFor(dir, requireName(name, sub));
    if (fs.existsSync(file)) {
      throw new GlossaryCommandError(
        `${path.basename(file)} already exists. Edit it with: transcribe-cli glossary edit ${name}`,
      );
    }
    fs.writeFileSync(file, newGlossaryHeader(name!), Encoding.UTF8);
    return editAndSummarize(file, deps);
  }

  if (sub === 'edit') {
    const file = fileFor(dir, name ?? glossaryNameOf(GENERAL_GLOSSARY)!);
    if (!fs.existsSync(file)) {
      throw new GlossaryCommandError(
        `No glossary called ${name}. Create it with: transcribe-cli glossary new ${name}`,
      );
    }
    return editAndSummarize(file, deps);
  }

  if (sub === 'review') {
    const target = name ? path.basename(fileFor(dir, name), EXT.GLOSSARY) : GENERAL_NAME;
    if (target !== GENERAL_NAME && !fs.existsSync(fileFor(dir, target))) {
      throw new GlossaryCommandError(`No glossary called ${target}.`);
    }
    const store = suggestCandidates(basePath, target);
    if (store.pending.length === 0 || !deps.review) {
      deps.write(`${formatCandidates(target, store)}\n`);
      if (store.pending.length > 0) deps.write('Reviewing needs an interactive terminal.\n');
      return 0;
    }
    const decisions = await deps.review(target, store.pending);
    if (!decisions) {
      deps.write('Nothing saved.\n');
      return 0;
    }
    const summary = applyReview(basePath, target, decisions);
    deps.write(
      `Saved: ${summary.addedToTopic} to ${target === GENERAL_NAME ? 'the topic' : target}, ${summary.addedToGeneral} to general, ${summary.rejected} rejected.\n`,
    );
    return 0;
  }

  if (sub === 'suggest') {
    const target = name ? path.basename(fileFor(dir, name), EXT.GLOSSARY) : GENERAL_NAME;
    if (target !== GENERAL_NAME && !fs.existsSync(fileFor(dir, target))) {
      throw new GlossaryCommandError(`No glossary called ${target}.`);
    }
    deps.write(`${formatCandidates(target, suggestCandidates(basePath, target))}\n`);
    return 0;
  }

  if (sub === 'show') {
    deps.write(`${describeSelection(basePath, name, useGeneral)}\n`);
    return 0;
  }

  throw new GlossaryCommandError(
    `Unknown glossary command '${sub}'. Available: ${GLOSSARY_SUBCOMMANDS.join(', ')}.`,
  );
}

function listSummaries(basePath: string): GlossarySummary[] {
  const dir = getPaths(basePath).GLOSSARIES_DIR;
  return [GENERAL_GLOSSARY, ...loadGlossaryFiles(basePath)].map((file) =>
    summarizeGlossary(glossaryNameOf(file)!, fs.readFileSync(path.join(dir, file), Encoding.UTF8)),
  );
}

function describeSelection(basePath: string, name: string | undefined, useGeneral: boolean) {
  const generalName = glossaryNameOf(GENERAL_GLOSSARY);
  const topic = name && name !== generalName ? `${name}${EXT.GLOSSARY}` : '';
  if (topic && !fs.existsSync(fileFor(getPaths(basePath).GLOSSARIES_DIR, name!))) {
    throw new GlossaryCommandError(`No glossary called ${name}.`);
  }
  const prompt = buildGlossaryPrompt(readSelectedGlossaries(basePath, topic, useGeneral || !topic));
  if (!prompt) return 'Nothing would be sent: the selected glossaries are empty.';
  const note = prompt.trimmed
    ? `trimmed: ${prompt.droppedLines} line(s) from the top are left out`
    : 'sent whole';
  return `This is what the engine receives (~${prompt.estimatedTokens} tokens, ${note}):\n\n${prompt.text}`;
}

async function editAndSummarize(file: string, deps: GlossaryCommandDeps): Promise<number> {
  const code = await deps.edit(file);
  const summary = summarizeGlossary(
    path.basename(file, EXT.GLOSSARY),
    fs.readFileSync(file, Encoding.UTF8),
  );
  deps.write(`${formatGlossaryList([summary])}\n`);
  return code;
}

function requireName(name: string | undefined, sub: string): string {
  if (!name) throw new GlossaryCommandError(`Usage: transcribe-cli glossary ${sub} <name>`);
  return name;
}

function fileFor(dir: string, name: string): string {
  const bare = name.endsWith(EXT.GLOSSARY) ? name.slice(0, -EXT.GLOSSARY.length) : name;
  if (!VALID_NAME.test(bare)) {
    throw new GlossaryCommandError(
      `"${name}" is not a valid glossary name: use letters, numbers, - and _.`,
    );
  }
  return path.join(dir, `${bare}${EXT.GLOSSARY}`);
}
