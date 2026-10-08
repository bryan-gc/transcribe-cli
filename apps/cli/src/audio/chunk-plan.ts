import { DIARIZE_MODEL, MAX_UPLOAD_BYTES, WHISPER_MODEL } from '../constants.js';

export const DEFAULT_CHUNK_MINUTES = 10;
export const CHUNK_MINUTES_RANGE = { min: 2, max: 20 } as const;
export const UPLOAD_SAFETY_RATIO = 0.9;

const SHORT_OUTPUT_MODEL_SECONDS = 300;

export const MODEL_CHUNK_CAP_SECONDS: Record<string, number> = {
  [WHISPER_MODEL]: 600,
  [DIARIZE_MODEL]: 600,
  'gpt-4o-transcribe': SHORT_OUTPUT_MODEL_SECONDS,
  'gpt-4o-mini-transcribe': SHORT_OUTPUT_MODEL_SECONDS,
};

export interface ChunkLimits {
  maxSeconds: number;
  maxBytes: number;
}

export function chunkMinutesFrom(value: unknown): number {
  const minutes = Number(value);
  return Number.isFinite(minutes) &&
    minutes >= CHUNK_MINUTES_RANGE.min &&
    minutes <= CHUNK_MINUTES_RANGE.max
    ? minutes
    : DEFAULT_CHUNK_MINUTES;
}

export function limitsFor(
  model: string,
  chunkMaxMinutes: number = DEFAULT_CHUNK_MINUTES,
): ChunkLimits {
  const cap = MODEL_CHUNK_CAP_SECONDS[model] ?? SHORT_OUTPUT_MODEL_SECONDS;
  return {
    maxSeconds: Math.min(chunkMinutesFrom(chunkMaxMinutes) * 60, cap),
    maxBytes: Math.floor(MAX_UPLOAD_BYTES * UPLOAD_SAFETY_RATIO),
  };
}

export function needsChunking(audioSeconds: number | undefined, limits: ChunkLimits): boolean {
  return audioSeconds !== undefined && audioSeconds > limits.maxSeconds;
}

export function needsCompression(bytes: number, limits: ChunkLimits): boolean {
  return bytes > limits.maxBytes;
}
