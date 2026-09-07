import fs from 'fs';
import type { ITranscriber } from '../transcriber/ITranscriber.js';
import { extractTextFromSrt } from './srtParser.js';
import { copyTextToClipboard } from './clipboard.js';
import { Encoding, LanguageCode, TranscriptionFormat } from '../constants.js';

export interface TranscriptionJob {
  audioPath: string;
  srtPath: string;
  textPath: string;
  language: LanguageCode;
  glossary?: string;
  copyToClipboard: boolean;
  onProgress?: (status: string) => void;
}

/**
 * Transcribes one recording and saves the result beside it.
 *
 * Both modes of the app used to carry their own copy of this, which meant every change to the
 * pipeline had to be made twice and could drift. Nothing is written until the transcription comes
 * back, so a failure leaves no half-written files and the audio stays ready for another attempt.
 */
export async function runTranscription(
  transcriber: ITranscriber,
  job: TranscriptionJob,
): Promise<string> {
  if (!fs.existsSync(job.audioPath)) {
    throw new Error(`Audio file not found: ${job.audioPath}`);
  }

  const srtContent = await transcriber.transcribe(
    job.audioPath,
    job.language,
    TranscriptionFormat.SRT,
    job.glossary,
    job.onProgress,
  );

  job.onProgress?.('Saving files...');
  const cleanText = extractTextFromSrt(srtContent);
  fs.writeFileSync(job.srtPath, srtContent, Encoding.UTF8);
  fs.writeFileSync(job.textPath, cleanText, Encoding.UTF8);

  if (job.copyToClipboard) copyTextToClipboard(cleanText);
  return cleanText;
}

/**
 * Turns a failure into something worth reading in a status bar.
 *
 * The raw message from the SDK names an HTTP status and a request id, which tells the user nothing
 * about what to do next. These three cases cover what actually happens: a key that is wrong, an
 * account that has run out, and no connection.
 */
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
