import { AVAILABLE_LANGUAGES, EXT, LanguageCode } from '../constants.js';
import type { AppConfig } from './configManager.js';

export interface CliFlags {
  manual?: boolean;
  language?: string;
  glossary?: string;
  copy?: boolean;
}

export interface ResolvedOptions {
  manual: boolean;
  language: LanguageCode;
  glossary: string;
  copyToClipboard: boolean;
}

export const ENV_KEYS = {
  LANGUAGE: 'TRANSCRIBE_LANGUAGE',
  GLOSSARY: 'TRANSCRIBE_GLOSSARY',
  COPY: 'TRANSCRIBE_COPY',
} as const;

export class OptionError extends Error {}

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

export function resolveOptions(
  flags: CliFlags,
  config: AppConfig,
  env: NodeJS.ProcessEnv = process.env,
  availableGlossaries: string[] = [],
): ResolvedOptions {
  return {
    manual: flags.manual === true,
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
