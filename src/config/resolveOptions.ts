import { AVAILABLE_LANGUAGES, EXT, LanguageCode } from '../constants.js';
import type { AppConfig } from './configManager.js';

/** Raw values as they arrive from commander, before any precedence is applied. */
export interface CliFlags {
  manual?: boolean;
  file?: string;
  speakers?: boolean;
  language?: string;
  glossary?: string;
  copy?: boolean;
}

export interface ResolvedOptions {
  manual: boolean;
  /** Path of an existing audio file to transcribe instead of recording. */
  file?: string;
  /** Ask the engine to label who is speaking. */
  diarize: boolean;
  language: LanguageCode;
  glossary: string;
  copyToClipboard: boolean;
}

export const ENV_KEYS = {
  LANGUAGE: 'TRANSCRIBE_LANGUAGE',
  GLOSSARY: 'TRANSCRIBE_GLOSSARY',
  COPY: 'TRANSCRIBE_COPY',
  SPEAKERS: 'TRANSCRIBE_SPEAKERS',
} as const;

export class OptionError extends Error {}

/**
 * Keeps only the options the user actually typed.
 *
 * commander fills in a value for every declared option, so `--no-copy` reports `copy: true` even
 * when it was never passed. Taken at face value that would look like an explicit request and
 * override a saved `autoCopy: false` on every run. `sourceOf` tells the two apart.
 */
export function cliFlags(
  opts: Record<string, unknown>,
  sourceOf: (key: string) => string | undefined,
): CliFlags {
  const flags: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(opts)) {
    if (sourceOf(key) === 'cli') flags[key] = value;
  }
  return flags as CliFlags;
}

/**
 * Applies one precedence rule to every option: CLI flag, then environment, then the saved
 * configuration, then the built-in default. Nothing here writes to the configuration — a flag
 * changes a single run, and only `setup` and the interactive menu change what is saved.
 *
 * `availableGlossaries` is passed in rather than read from disk so this stays a pure function.
 */
export function resolveOptions(
  flags: CliFlags,
  config: AppConfig,
  env: NodeJS.ProcessEnv = process.env,
  availableGlossaries: string[] = [],
): ResolvedOptions {
  return {
    manual: flags.manual === true,
    file: flags.file,
    diarize: firstDefined(flags.speakers, parseBool(env[ENV_KEYS.SPEAKERS]), false),
    language: resolveLanguage(flags.language ?? env[ENV_KEYS.LANGUAGE], config),
    glossary: resolveGlossary(flags.glossary ?? env[ENV_KEYS.GLOSSARY], availableGlossaries),
    copyToClipboard: firstDefined(
      flags.copy,
      parseBool(env[ENV_KEYS.COPY]),
      config.autoCopy,
      false,
    ),
  };
}

function firstDefined<T>(...values: (T | undefined)[]): T {
  return values.find((v) => v !== undefined)!;
}

function parseBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new OptionError(`Not a boolean: "${raw}". Use true or false.`);
}

// An unknown language is rejected rather than quietly replaced with the default: transcribing a
// recording in the wrong language wastes the call and the mistake only shows up in the result.
function resolveLanguage(raw: string | undefined, config: AppConfig): LanguageCode {
  if (raw === undefined || raw.trim() === '') {
    return AVAILABLE_LANGUAGES.includes(config.selectedLanguage)
      ? config.selectedLanguage
      : LanguageCode.ENGLISH;
  }
  const value = raw.trim().toLowerCase() as LanguageCode;
  if (!AVAILABLE_LANGUAGES.includes(value)) {
    throw new OptionError(
      `Unknown language "${raw}". Available: ${AVAILABLE_LANGUAGES.join(', ')}.`,
    );
  }
  return value;
}

function resolveGlossary(raw: string | undefined, available: string[]): string {
  if (raw === undefined || raw.trim() === '') return '';

  const wanted = raw.trim();
  const withExt = wanted.endsWith(EXT.GLOSSARY) ? wanted : `${wanted}${EXT.GLOSSARY}`;
  if (available.includes(withExt)) return withExt;

  const names = available.map((f) => f.replace(EXT.GLOSSARY, ''));
  throw new OptionError(
    names.length === 0
      ? `No glossaries found, so "${wanted}" cannot be used.`
      : `Unknown glossary "${wanted}". Available: ${names.join(', ')}.`,
  );
}
