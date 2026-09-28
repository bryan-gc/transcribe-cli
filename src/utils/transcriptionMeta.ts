import type { TranscriptionUsage } from '../transcriber/ITranscriber.js';
import type { RecordingKind } from '../constants.js';
import {
  DIARIZE_MODEL,
  PRICING,
  PRICING_CHECKED_ON,
  WHISPER_MODEL,
  type LanguageCode,
} from '../constants.js';

export interface TranscriptionCost {
  usd: number;
  estimated: boolean;
}

export interface GlossaryMeta {
  name: string;
  applied: boolean;
  trimmed: boolean;
  estimatedTokens: number;
  replacements?: number;
}

export interface ChunkMeta {
  count: number;
  hardCuts: number;
  retries: number;
}

export interface TranscriptionMeta {
  at: string;
  source: RecordingKind;
  aside?: true;
  audio: { file: string; seconds?: number };
  engine: string;
  model: string;
  language: LanguageCode;
  diarized: boolean;
  tookMs: number;
  usage?: TranscriptionUsage;
  cost: TranscriptionCost;
  pricingCheckedOn: string;
  glossary?: GlossaryMeta;
  chunks?: ChunkMeta;
}

export interface MetaInput {
  source: RecordingKind;
  aside?: boolean;
  audioFile: string;
  audioSeconds?: number;
  engine: string;
  model: string;
  language: LanguageCode;
  diarized: boolean;
  tookMs: number;
  usage?: TranscriptionUsage;
  glossary?: GlossaryMeta;
  chunks?: ChunkMeta;
  at?: Date;
}

export function estimateCost(
  model: string,
  usage?: TranscriptionUsage,
  audioSeconds?: number,
): TranscriptionCost {
  if (model === DIARIZE_MODEL && usage) {
    const rates = PRICING[DIARIZE_MODEL];
    const usd =
      usage.inputTokens * rates.perInputTokenUsd + usage.outputTokens * rates.perOutputTokenUsd;
    return { usd: round(usd), estimated: true };
  }

  if (model === WHISPER_MODEL && audioSeconds !== undefined) {
    return {
      usd: round((audioSeconds / 60) * PRICING[WHISPER_MODEL].perAudioMinuteUsd),
      estimated: true,
    };
  }

  if (model === WHISPER_MODEL || model === DIARIZE_MODEL) {
    return { usd: 0, estimated: true };
  }
  return { usd: 0, estimated: false };
}

export function buildMeta(input: MetaInput): TranscriptionMeta {
  return {
    at: (input.at ?? new Date()).toISOString(),
    source: input.source,
    ...(input.aside ? { aside: true as const } : {}),
    audio: { file: input.audioFile, seconds: input.audioSeconds },
    engine: input.engine,
    model: input.model,
    language: input.language,
    diarized: input.diarized,
    tookMs: input.tookMs,
    usage: input.usage,
    cost: estimateCost(input.model, input.usage, input.audioSeconds),
    pricingCheckedOn: PRICING_CHECKED_ON,
    ...(input.glossary ? { glossary: input.glossary } : {}),
    ...(input.chunks ? { chunks: input.chunks } : {}),
  };
}

export function formatCost(cost: TranscriptionCost): string {
  if (cost.usd === 0) return 'free';
  const shown = cost.usd < 0.01 ? cost.usd.toFixed(4) : cost.usd.toFixed(2);
  return `$${shown}${cost.estimated ? ' (est.)' : ''}`;
}

function round(usd: number): number {
  return Math.round(usd * 1e6) / 1e6;
}
