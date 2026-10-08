import { Engine } from '../config/config-manager.js';
import { DIARIZE_MODEL, DIARIZE_TOKENS_PER_AUDIO_MINUTE, WHISPER_MODEL } from '../constants.js';
import { estimateCost, formatCost, type TranscriptionCost } from './transcription-meta.js';
import { formatDuration } from './run-transcription.js';
import { limitsFor } from '../audio/chunk-plan.js';

export interface EngineChoice {
  engine: Engine;
  diarize: boolean;
}

export interface RunEstimate extends EngineChoice {
  model: string;
  cost: TranscriptionCost;
  seconds: number;
  measured: boolean;
  parts: number;
}

export type SpeedLookup = (model: string) => number | undefined;

const FALLBACK_SECONDS_PER_AUDIO_SECOND: Record<Engine, number> = {
  [Engine.LOCAL]: 2,
  [Engine.OPENAI]: 0.05,
};

export function apiModelFor(diarize: boolean): string {
  return diarize ? DIARIZE_MODEL : WHISPER_MODEL;
}

export function estimateRun(
  audioSeconds: number,
  choice: EngineChoice,
  localModel: string,
  speedOf: SpeedLookup = () => undefined,
  chunkMaxMinutes?: number,
): RunEstimate {
  const model = choice.engine === Engine.LOCAL ? localModel : apiModelFor(choice.diarize);
  const measuredSpeed = speedOf(model);
  const speed = measuredSpeed ?? FALLBACK_SECONDS_PER_AUDIO_SECOND[choice.engine];
  return {
    ...choice,
    model,
    cost: estimateCostFor(audioSeconds, choice, model),
    seconds: Math.round(audioSeconds * speed),
    measured: measuredSpeed !== undefined,
    parts:
      choice.engine === Engine.LOCAL
        ? 1
        : Math.max(1, Math.ceil(audioSeconds / limitsFor(model, chunkMaxMinutes).maxSeconds)),
  };
}

function estimateCostFor(audioSeconds: number, choice: EngineChoice, model: string) {
  if (choice.engine === Engine.LOCAL) return { usd: 0, estimated: false };
  if (!choice.diarize) return estimateCost(model, undefined, audioSeconds);
  const minutes = audioSeconds / 60;
  const inputTokens = Math.round(minutes * DIARIZE_TOKENS_PER_AUDIO_MINUTE.input);
  const outputTokens = Math.round(minutes * DIARIZE_TOKENS_PER_AUDIO_MINUTE.output);
  return estimateCost(model, {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  });
}

export function formatEstimatedCost(cost: TranscriptionCost): string {
  return cost.usd === 0 ? 'free' : `~${formatCost(cost).replace(' (est.)', '')}`;
}

export function formatEstimatedTime(estimate: RunEstimate): string {
  return `~${formatDuration(estimate.seconds * 1000)}${estimate.measured ? '' : ' (guess)'}`;
}
