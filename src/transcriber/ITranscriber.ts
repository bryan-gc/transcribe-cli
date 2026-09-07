import type { LanguageCode, TranscriptionFormat } from '../constants.js';

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
  prompt?: string;
  diarize?: boolean;
  onProgress?: (status: string) => void;
}

export interface TranscriptionResult {
  raw: string;
  segments?: DiarizedSegment[];
}

export interface ITranscriber {
  transcribe(options: TranscribeOptions): Promise<TranscriptionResult>;
}
