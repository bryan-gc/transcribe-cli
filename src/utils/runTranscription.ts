import fs from 'fs';
import path from 'path';
import type {
  ITranscriber,
  TranscriptionResult,
  TranscriptionUsage,
} from '../transcriber/ITranscriber.js';
import {
  learnFromTranscripts,
  type GlossaryLearning,
  type LearnedGlossary,
} from '../glossary/learnGlossary.js';
import { audioDurationSeconds } from '../audio/audioDuration.js';
import { buildMeta, type TranscriptionMeta } from './transcriptionMeta.js';
import { extractTextFromSrt } from './srtParser.js';
import { buildSrtFromDiarized, formatDiarized } from './diarizedParser.js';
import { copyTextToClipboard } from './clipboard.js';
import { appendUsage } from './usageLog.js';
import { wrapTranscript } from './transcriptWrapper.js';
import { applyReplacements, parseReplacements } from './replacements.js';
import { buildGlossaryPrompt, type GlossaryPrompt } from './glossaryPrompt.js';
import type { LanguageCode } from '../constants.js';
import { Encoding, RecordingKind, TranscriptionFormat } from '../constants.js';

export interface TranscriptionJob {
  audioPath: string;
  srtPath: string;
  textPath: string;
  language: LanguageCode;
  glossary?: string;
  glossaryName?: string;
  diarize?: boolean;
  diarizedPath?: string;
  metaPath?: string;
  basePath?: string;
  source: RecordingKind;
  aside?: boolean;
  copyToClipboard: boolean;
  wrap?: boolean;
  glossaryLearning?: GlossaryLearning;
  onProgress?: (status: string) => void;
}

export enum ClipboardOutcome {
  OFF = 'off',
  COPIED = 'copied',
  FAILED = 'failed',
}

export interface TranscriptionOutcome {
  text: string;
  clipboard: ClipboardOutcome;
  clipboardError?: string;
  engine: string;
  model: string;
  tookMs: number;
  usage?: TranscriptionUsage;
  meta: TranscriptionMeta;
  glossaryPrompt?: GlossaryPrompt;
  glossaryApplied: boolean;
  clipboardText?: string;
  learned?: LearnedGlossary;
}

export async function runTranscription(
  transcriber: ITranscriber,
  job: TranscriptionJob,
): Promise<TranscriptionOutcome> {
  if (!fs.existsSync(job.audioPath)) {
    throw new Error(`Audio file not found: ${job.audioPath}`);
  }

  const startedAt = Date.now();
  const glossaryPrompt = buildGlossaryPrompt(job.glossary);
  const result = await transcriber.transcribe({
    audioFilePath: job.audioPath,
    language: job.language,
    format: TranscriptionFormat.SRT,
    prompt: glossaryPrompt?.text,
    diarize: job.diarize,
    onProgress: job.onProgress,
  });

  job.onProgress?.('Saving files...');

  const rules = parseReplacements(job.glossary);
  const segments = result.segments?.map((segment) => ({
    ...segment,
    text: applyReplacements(segment.text, rules).text,
  }));
  const srtContent = segments
    ? buildSrtFromDiarized(segments)
    : applyReplacements(result.raw, rules).text;
  const unreplaced = result.segments
    ? formatDiarized(result.segments)
    : extractTextFromSrt(result.raw);
  const { text: cleanText, count: replacements } = applyReplacements(unreplaced, rules);

  fs.writeFileSync(job.srtPath, srtContent, Encoding.UTF8);
  fs.writeFileSync(job.textPath, cleanText, Encoding.UTF8);
  if (segments && job.diarizedPath) {
    const response = JSON.parse(result.raw) as Record<string, unknown>;
    fs.writeFileSync(job.diarizedPath, JSON.stringify({ ...response, segments }), Encoding.UTF8);
  }

  const meta = buildMeta({
    source: job.source,
    aside: job.aside,
    audioFile: path.basename(job.audioPath),
    audioSeconds: audioDurationSeconds(job.audioPath),
    engine: result.engine,
    model: result.model,
    language: job.language,
    diarized: result.segments !== undefined,
    tookMs: Date.now() - startedAt,
    usage: result.usage,
    chunks: result.chunks,
    glossary:
      glossaryPrompt && job.glossaryName
        ? {
            name: job.glossaryName,
            applied: result.promptApplied,
            trimmed: glossaryPrompt.trimmed,
            estimatedTokens: glossaryPrompt.estimatedTokens,
            ...(replacements > 0 ? { replacements } : {}),
          }
        : undefined,
  });
  if (job.metaPath) fs.writeFileSync(job.metaPath, JSON.stringify(meta, null, 2), Encoding.UTF8);
  if (job.basePath) appendUsage(job.basePath, meta);

  const base = {
    text: cleanText,
    engine: result.engine,
    model: result.model,
    tookMs: meta.tookMs,
    usage: result.usage,
    meta,
    glossaryPrompt,
    glossaryApplied: result.promptApplied,
  };

  const copied = await copyIfWanted(job, cleanText, result, glossaryPrompt, meta);
  const learned =
    job.basePath && job.glossaryLearning
      ? learnFromTranscripts(job.basePath, job.glossaryLearning, job.glossaryName)
      : undefined;
  return { ...base, ...copied, ...(learned ? { learned } : {}) };
}

async function copyIfWanted(
  job: TranscriptionJob,
  cleanText: string,
  result: TranscriptionResult,
  glossaryPrompt: GlossaryPrompt | undefined,
  meta: TranscriptionMeta,
): Promise<Pick<TranscriptionOutcome, 'clipboard' | 'clipboardText' | 'clipboardError'>> {
  if (!job.copyToClipboard) return { clipboard: ClipboardOutcome.OFF };

  const clipboardText = job.wrap
    ? wrapTranscript(cleanText, {
        language: job.language,
        glossaryUsed: result.promptApplied ? glossaryPrompt?.text : undefined,
        diarized: result.segments !== undefined,
        audioSeconds: meta.audio.seconds,
      })
    : cleanText;

  try {
    await copyTextToClipboard(clipboardText);
    return { clipboard: ClipboardOutcome.COPIED, clipboardText };
  } catch (error) {
    return {
      clipboardText,
      clipboard: ClipboardOutcome.FAILED,
      clipboardError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

export function describeOutcome(outcome: TranscriptionOutcome): string {
  if (outcome.clipboard === ClipboardOutcome.COPIED) {
    return '✅ Transcription done — copied to clipboard.';
  }
  if (outcome.clipboard === ClipboardOutcome.FAILED) {
    return `✅ Transcription saved. ⚠️ Clipboard: ${outcome.clipboardError}`;
  }
  return '✅ Transcription completed and saved.';
}

export function describeTranscriptionError(error: unknown): string {
  const status = (error as { status?: number })?.status;
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error);

  if (status === 401) return 'Invalid API key — run transcribe-cli -c to update it.';
  if (status === 429 || /quota|insufficient_quota/i.test(message)) {
    return 'OpenAI quota exceeded — check your plan and billing.';
  }
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || /fetch failed|network/i.test(message)) {
    return 'No connection — retry once you are back online.';
  }
  return message;
}
