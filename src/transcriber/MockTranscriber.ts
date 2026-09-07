import type { ITranscriber, TranscribeOptions, TranscriptionResult } from './ITranscriber.js';
import { parseDiarized } from '../utils/diarizedParser.js';

/**
 * Transcriber that returns canned results instead of reaching a real engine.
 *
 * Outcomes are consumed one per call and the last one repeats, so a single value stands for
 * "always this" and a list expresses a sequence — `[error, srt]` is a transcription that fails
 * once and succeeds on retry.
 */
export class MockTranscriber implements ITranscriber {
  readonly calls: TranscribeOptions[] = [];
  private readonly outcomes: (string | Error)[];
  private index = 0;

  constructor(outcomes: string | Error | (string | Error)[]) {
    this.outcomes = Array.isArray(outcomes) ? [...outcomes] : [outcomes];
    if (this.outcomes.length === 0) {
      throw new Error('MockTranscriber needs at least one outcome.');
    }
  }

  async transcribe(options: TranscribeOptions): Promise<TranscriptionResult> {
    this.calls.push(options);
    options.onProgress?.('mock: returning canned result');

    const outcome = this.outcomes[Math.min(this.index, this.outcomes.length - 1)]!;
    this.index += 1;
    if (outcome instanceof Error) throw outcome;

    // A diarized fixture is JSON, so it is parsed the same way a real response would be and the
    // caller sees the shape it will see in production.
    return options.diarize ? { raw: outcome, segments: parseDiarized(outcome) } : { raw: outcome };
  }
}
