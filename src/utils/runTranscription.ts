import fs from 'fs';
import type { ITranscriber } from '../transcriber/ITranscriber.js';
import { extractTextFromSrt } from './srtParser.js';
import { buildSrtFromDiarized, formatDiarized } from './diarizedParser.js';
import { copyTextToClipboard } from './clipboard.js';
import type { LanguageCode } from '../constants.js';
import { Encoding, TranscriptionFormat } from '../constants.js';

export interface TranscriptionJob {
  audioPath: string;
  srtPath: string;
  textPath: string;
  language: LanguageCode;
  glossary?: string;
  diarize?: boolean;
  diarizedPath?: string;
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
}

export async function runTranscription(
  transcriber: ITranscriber,
  job: TranscriptionJob,
): Promise<TranscriptionOutcome> {
  if (!fs.existsSync(job.audioPath)) {
    throw new Error(`Audio file not found: ${job.audioPath}`);
  }

  const result = await transcriber.transcribe({
    audioFilePath: job.audioPath,
    language: job.language,
    format: TranscriptionFormat.SRT,
    prompt: job.glossary,
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

  if (!job.copyToClipboard) return { text: cleanText, clipboard: ClipboardOutcome.OFF };

  try {
    await copyTextToClipboard(cleanText);
    return { text: cleanText, clipboard: ClipboardOutcome.COPIED };
  } catch (error) {
    return {
      text: cleanText,
      clipboard: ClipboardOutcome.FAILED,
      clipboardError: error instanceof Error ? error.message : String(error),
    };
  }
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

  if (status === 401) return 'Invalid API key — run transcribe-cli setup to update it.';
  if (status === 429 || /quota|insufficient_quota/i.test(message)) {
    return 'OpenAI quota exceeded — check your plan and billing.';
  }
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || /fetch failed|network/i.test(message)) {
    return 'No connection — retry once you are back online.';
  }
  return message;
}
