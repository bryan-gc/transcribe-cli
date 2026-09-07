import type { StatusField } from './Header.js';
import { Engine } from '../config/configManager.js';
import { LANGUAGE_NAMES, type LanguageCode } from '../constants.js';
import {
  ClipboardOutcome,
  formatDuration,
  type TranscriptionOutcome,
} from '../utils/runTranscription.js';

export function languageField(language: LanguageCode): StatusField {
  return { label: 'Language', value: LANGUAGE_NAMES[language] };
}

export function glossaryField(label: string): StatusField {
  return { label: 'Glossary', value: label };
}

export function engineField(engine: Engine, run: TranscriptionOutcome | null): StatusField {
  const configured = engine === Engine.LOCAL ? 'Local · WhisperX' : 'OpenAI API';
  return {
    label: 'Engine',
    value: run ? `${describeEngine(run.engine)} · ${run.model}` : configured,
  };
}

export function tookField(run: TranscriptionOutcome | null): StatusField[] {
  return run ? [{ label: 'Took', value: formatDuration(run.tookMs), tone: 'dim' }] : [];
}

export function clipboardField(enabled: boolean, run: TranscriptionOutcome | null): StatusField {
  if (run?.clipboard === ClipboardOutcome.COPIED) {
    return { label: 'Clipboard', value: 'Copied', tone: 'good' };
  }
  if (run?.clipboard === ClipboardOutcome.FAILED) {
    return { label: 'Clipboard', value: `Failed — ${run.clipboardError ?? ''}`, tone: 'bad' };
  }
  return enabled
    ? { label: 'Clipboard', value: 'On', tone: 'good' }
    : { label: 'Clipboard', value: 'Off', tone: 'dim' };
}

function describeEngine(engine: string): string {
  if (engine === Engine.LOCAL) return 'Local · WhisperX';
  if (engine === Engine.OPENAI) return 'OpenAI API';
  return engine;
}
