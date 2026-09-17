import fs from 'fs';
import path from 'path';
import type { ITranscriber, TranscriptionUsage } from '../transcriber/ITranscriber.js';
import { audioDurationSeconds } from '../audio/audioDuration.js';
import { buildMeta, type TranscriptionMeta } from './transcriptionMeta.js';
import { extractTextFromSrt } from './srtParser.js';
import { buildSrtFromDiarized, formatDiarized } from './diarizedParser.js';
import { copyTextToClipboard } from './clipboard.js';
import { appendUsage } from './usageLog.js';
import { buildGlossaryPrompt, type GlossaryPrompt } from './glossaryPrompt.js';
import type { LanguageCode } from '../constants.js';
import { Encoding, RecordingKind, TranscriptionFormat } from '../constants.js';

export interface TranscriptionJob {
  audioPath: string;
  srtPath: string;
  textPath: string;
  language: LanguageCode;
  glossary?: string;
  diarize?: boolean;
  diarizedPath?: string;
  metaPath?: string;
  basePath?: string;
  source?: RecordingKind;
  copyToClipboard: boolean;
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

  const srtContent = result.segments ? buildSrtFromDiarized(result.segments) : result.raw;
  const cleanText = result.segments
    ? formatDiarized(result.segments)
    : extractTextFromSrt(result.raw);

  fs.writeFileSync(job.srtPath, srtContent, Encoding.UTF8);
  fs.writeFileSync(job.textPath, cleanText, Encoding.UTF8);
  if (result.segments && job.diarizedPath) {
    fs.writeFileSync(job.diarizedPath, result.raw, Encoding.UTF8);
  }

  const meta = buildMeta({
    source: job.source ?? RecordingKind.RECORDED,
    audioFile: path.basename(job.audioPath),
    audioSeconds: audioDurationSeconds(job.audioPath),
    engine: result.engine,
    model: result.model,
    language: job.language,
    diarized: result.segments !== undefined,
    tookMs: Date.now() - startedAt,
    usage: result.usage,
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

  if (!job.copyToClipboard) return { ...base, clipboard: ClipboardOutcome.OFF };

  try {
    await copyTextToClipboard(cleanText);
    return { ...base, clipboard: ClipboardOutcome.COPIED };
  } catch (error) {
    return {
      ...base,
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
