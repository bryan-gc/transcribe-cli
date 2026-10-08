import { Engine, type AppConfig } from '../config/config-manager.js';
import { estimateRun, type EngineChoice, type RunEstimate } from './estimate.js';
import { measuredSpeed, readRecentMeta } from './history.js';

export interface Preflight {
  audioSeconds: number;
  rows: RunEstimate[];
  selected: number;
}

export function buildPreflight(
  audioSeconds: number,
  choice: EngineChoice,
  config: AppConfig,
): Preflight {
  const speedOf = measuredSpeed(readRecentMeta(config.basePath));
  const localModel = config.localWhisper.model;
  const choices: EngineChoice[] = [
    { engine: Engine.OPENAI, diarize: false },
    { engine: Engine.OPENAI, diarize: true },
    { engine: Engine.LOCAL, diarize: choice.engine === Engine.LOCAL && choice.diarize },
  ];
  const rows = choices.map((c) =>
    estimateRun(audioSeconds, c, localModel, speedOf, config.chunkMaxMinutes),
  );
  const selected = Math.max(
    0,
    rows.findIndex((r) => r.engine === choice.engine && r.diarize === choice.diarize),
  );
  return { audioSeconds, rows, selected };
}
