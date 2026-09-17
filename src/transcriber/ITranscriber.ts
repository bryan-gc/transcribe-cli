import type { LanguageCode, TranscriptionFormat } from '../constants.js';

export interface DiarizedSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface KnownSpeaker {
  name: string;
  referencePath: string;
}

export interface TranscribeOptions {
  audioFilePath: string;
  language: LanguageCode;
  format: TranscriptionFormat;
  prompt?: string;
  diarize?: boolean;
  knownSpeakers?: KnownSpeaker[];
  onProgress?: (status: string) => void;
}

export interface TranscriptionUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface TranscriptionResult {
  raw: string;
  segments?: DiarizedSegment[];
  engine: string;
  model: string;
  usage?: TranscriptionUsage;
  promptApplied: boolean;
  chunks?: { count: number; hardCuts: number; retries: number };
}

export interface ITranscriber {
  transcribe(options: TranscribeOptions): Promise<TranscriptionResult>;
}
