import type { LanguageCode, TranscriptionFormat } from '../constants.js';

/** One stretch of speech attributed to a speaker. Times are seconds from the start of the audio. */
export interface DiarizedSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface TranscribeOptions {
  audioFilePath: string;
  language: LanguageCode;
  format: TranscriptionFormat;
  /** Context hint for the model, normally the contents of a glossary. */
  prompt?: string;
  /** Ask for speaker labels. Engines that cannot provide them must say so rather than ignore it. */
  diarize?: boolean;
  onProgress?: (status: string) => void;
}

export interface TranscriptionResult {
  /** What the engine returned: SRT for a plain transcription, raw JSON for a diarized one. */
  raw: string;
  /** Present only when speakers were requested and the engine could label them. */
  segments?: DiarizedSegment[];
}

export interface ITranscriber {
  transcribe(options: TranscribeOptions): Promise<TranscriptionResult>;
}
