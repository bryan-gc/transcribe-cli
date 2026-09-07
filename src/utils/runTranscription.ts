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
  /** Ask the engine for speaker labels. */
  diarize?: boolean;
  /** Where to keep the raw diarized response; only written when speakers were labelled. */
  diarizedPath?: string;
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

  const result = await transcriber.transcribe({
    audioFilePath: job.audioPath,
    language: job.language,
    format: TranscriptionFormat.SRT,
    prompt: job.glossary,
    diarize: job.diarize,
    onProgress: job.onProgress,
  });

  job.onProgress?.('Saving files...');

  // With speakers the engine returns segments rather than subtitles, so both outputs are built
  // here: the timings are all that was missing, and the rest of the pipeline stays the same.
  const srtContent = result.segments ? buildSrtFromDiarized(result.segments) : result.raw;
  const cleanText = result.segments
    ? formatDiarized(result.segments)
    : extractTextFromSrt(result.raw);

  fs.writeFileSync(job.srtPath, srtContent, Encoding.UTF8);
  fs.writeFileSync(job.textPath, cleanText, Encoding.UTF8);
  // The raw response is kept only for a diarized run: it is the one that carries information the
  // subtitles drop, such as which speaker said what at what exact offset.
  if (result.segments && job.diarizedPath) {
    fs.writeFileSync(job.diarizedPath, result.raw, Encoding.UTF8);
  }

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
