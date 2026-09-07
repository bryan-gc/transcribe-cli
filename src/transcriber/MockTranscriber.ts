import type { ITranscriber } from './ITranscriber.js';
import type { LanguageCode, TranscriptionFormat } from '../constants.js';

export interface RecordedCall {
  audioFilePath: string;
  language: LanguageCode;
  format: TranscriptionFormat;
  prompt?: string;
}

/**
 * Transcriber that returns canned results instead of reaching a real engine.
 *
 * Outcomes are consumed one per call and the last one repeats, so a single value stands for
 * "always this" and a list expresses a sequence — `[error, srt]` is a transcription that fails
 * once and succeeds on retry.
 */
export class MockTranscriber implements ITranscriber {
  readonly calls: RecordedCall[] = [];
  private readonly outcomes: (string | Error)[];
  private index = 0;

  constructor(outcomes: string | Error | (string | Error)[]) {
    this.outcomes = Array.isArray(outcomes) ? [...outcomes] : [outcomes];
    if (this.outcomes.length === 0) {
      throw new Error('MockTranscriber needs at least one outcome.');
    }
  }

  async transcribe(
    audioFilePath: string,
    language: LanguageCode,
    format: TranscriptionFormat,
    prompt?: string,
    onProgress?: (status: string) => void,
  ): Promise<string> {
    this.calls.push({ audioFilePath, language, format, prompt });
    onProgress?.('mock: returning canned result');

    const outcome = this.outcomes[Math.min(this.index, this.outcomes.length - 1)]!;
    this.index += 1;
    if (outcome instanceof Error) throw outcome;
    return outcome;
  }
}
