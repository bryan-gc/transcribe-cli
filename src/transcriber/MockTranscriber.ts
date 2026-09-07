import type { ITranscriber, TranscribeOptions, TranscriptionResult } from './ITranscriber.js';
import { parseDiarized } from '../utils/diarizedParser.js';

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

    return options.diarize ? { raw: outcome, segments: parseDiarized(outcome) } : { raw: outcome };
  }
}
