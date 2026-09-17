import { updateAutoGeneral } from './autoGeneral.js';
import { GENERAL_NAME, suggestCandidates } from './candidates.js';

export enum GlossaryLearning {
  AUTO = 'auto',
  REVIEW = 'review',
  OFF = 'off',
}

export const GLOSSARY_LEARNING_ORDER = [
  GlossaryLearning.AUTO,
  GlossaryLearning.REVIEW,
  GlossaryLearning.OFF,
];

export interface LearnedGlossary {
  autoAdded: number;
  suggestions: number;
}

export function nextGlossaryLearning(mode: GlossaryLearning): GlossaryLearning {
  const index = GLOSSARY_LEARNING_ORDER.indexOf(mode);
  return GLOSSARY_LEARNING_ORDER[(index + 1) % GLOSSARY_LEARNING_ORDER.length]!;
}

export function learnFromTranscripts(
  basePath: string,
  mode: GlossaryLearning,
  topic: string | undefined,
  now: Date = new Date(),
): LearnedGlossary | undefined {
  if (mode === GlossaryLearning.OFF) return undefined;
  try {
    const autoAdded =
      mode === GlossaryLearning.AUTO ? updateAutoGeneral(basePath, now).added.length : 0;
    const target =
      topic && topic !== GENERAL_NAME
        ? topic
        : mode === GlossaryLearning.REVIEW
          ? GENERAL_NAME
          : undefined;
    const suggestions = target ? suggestCandidates(basePath, target, now).pending.length : 0;
    return { autoAdded, suggestions };
  } catch {
    return undefined;
  }
}
