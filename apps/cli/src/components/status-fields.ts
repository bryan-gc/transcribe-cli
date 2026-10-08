import type { StatusField } from './header.js';
import { Engine, type AppConfig } from '../config/config-manager.js';
import { engineBlockers } from '../system/doctor.js';
import { type ResolveSources } from '../system/dependencies.js';
import { LANGUAGE_NAMES, type LanguageCode } from '../constants.js';
import {
  ClipboardOutcome,
  formatDuration,
  type TranscriptionOutcome,
} from '../utils/run-transcription.js';
import { formatCost } from '../utils/transcription-meta.js';

export function asideField(aside: boolean): StatusField[] {
  return aside ? [{ label: 'Aside', value: 'marked in the meta and usage log' }] : [];
}

export function languageField(language: LanguageCode): StatusField {
  return { label: 'Language', value: LANGUAGE_NAMES[language] };
}

export function glossaryField(label: string, run: TranscriptionOutcome | null = null): StatusField {
  const field = promptField(label, run);
  const learned = learnedNote(run);
  return learned ? { ...field, value: `${field.value}${learned}` } : field;
}

function learnedNote(run: TranscriptionOutcome | null): string {
  const parts = [
    run?.learned?.autoAdded ? `+${run.learned.autoAdded} auto` : '',
    run?.learned?.suggestions ? `${run.learned.suggestions} suggestions` : '',
  ].filter(Boolean);
  return parts.length > 0 ? ` · ${parts.join(' · ')}` : '';
}

function promptField(label: string, run: TranscriptionOutcome | null): StatusField {
  const prompt = run?.glossaryPrompt;
  if (!prompt) return { label: 'Glossary', value: label };
  if (!run.glossaryApplied) {
    return { label: 'Glossary', value: `${label} (not used by this model)`, tone: 'dim' };
  }
  if (prompt.trimmed) {
    const kept = prompt.text.split('\n').length;
    const total = kept + prompt.droppedLines;
    return {
      label: 'Glossary',
      value: `${label} (trimmed: kept the last ${kept} of ${total} lines)`,
      tone: 'warn',
    };
  }
  return { label: 'Glossary', value: label };
}

export function engineLabel(engine: Engine): string {
  return engine === Engine.LOCAL ? 'Local · WhisperX' : 'OpenAI API';
}

export function engineOption(
  config: AppConfig,
  engine: Engine,
  sources: ResolveSources = {},
): { label: string; ready: boolean; blocker: string } {
  const missing = engineBlockers({ ...config, engine }, sources)[0];
  if (!missing) return { label: engineLabel(engine), ready: true, blocker: '' };
  return {
    label: `${engineLabel(engine)}  —  not ready (${missing.name})`,
    ready: false,
    blocker: `${missing.name} is missing${missing.remedy ? `. Fix it with ${missing.remedy}` : ''}.`,
  };
}

export function engineField(engine: Engine, run: TranscriptionOutcome | null): StatusField {
  return {
    label: 'Engine',
    value: run ? `${describeEngine(run.engine)} · ${run.model}` : engineLabel(engine),
  };
}

export function tookField(run: TranscriptionOutcome | null): StatusField[] {
  return run ? [{ label: 'Took', value: formatDuration(run.tookMs), tone: 'dim' }] : [];
}

export function costField(run: TranscriptionOutcome | null): StatusField[] {
  if (!run || run.meta.cost.usd === 0) return [];
  return [{ label: 'Cost', value: formatCost(run.meta.cost), tone: 'dim' }];
}

export function audioLengthField(run: TranscriptionOutcome | null): StatusField[] {
  const seconds = run?.meta.audio.seconds;
  return seconds === undefined
    ? []
    : [{ label: 'Audio', value: formatDuration(seconds * 1000), tone: 'dim' }];
}

export function clipboardField(
  enabled: boolean,
  run: TranscriptionOutcome | null,
  marked = false,
): StatusField {
  const notice = marked ? ' · marked' : '';
  if (run?.clipboard === ClipboardOutcome.COPIED) {
    return { label: 'Clipboard', value: `Copied${notice}`, tone: 'good' };
  }
  if (run?.clipboard === ClipboardOutcome.FAILED) {
    return { label: 'Clipboard', value: `Failed — ${run.clipboardError ?? ''}`, tone: 'bad' };
  }
  return enabled
    ? { label: 'Clipboard', value: `On${notice}`, tone: 'good' }
    : { label: 'Clipboard', value: 'Off', tone: 'dim' };
}

function describeEngine(engine: string): string {
  if (engine === Engine.LOCAL) return 'Local · WhisperX';
  if (engine === Engine.OPENAI) return 'OpenAI API';
  return engine;
}
