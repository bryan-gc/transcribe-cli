import { AVAILABLE_LANGUAGES, EXT, GLOSSARY_NONE, LanguageCode } from '../constants.js';
import { Engine, type AppConfig } from './configManager.js';

export interface CliFlags {
  manual?: boolean;
  config?: boolean;
  file?: string;
  speakers?: boolean;
  local?: boolean;
  engine?: string;
  language?: string;
  glossary?: string;
  copy?: boolean;
  wrap?: boolean;
  generalGlossary?: boolean;
  yes?: boolean;
}

export interface ResolvedOptions {
  manual: boolean;
  file?: string;
  diarize: boolean;
  engine: Engine;
  language: LanguageCode;
  glossary: string;
  useGeneralGlossary: boolean;
  copyToClipboard: boolean;
  wrapClipboard: boolean;
  confirmLongAudio: boolean;
}

export const ENV_KEYS = {
  LANGUAGE: 'TRANSCRIBE_LANGUAGE',
  GLOSSARY: 'TRANSCRIBE_GLOSSARY',
  COPY: 'TRANSCRIBE_COPY',
  WRAP: 'TRANSCRIBE_WRAP',
  SPEAKERS: 'TRANSCRIBE_SPEAKERS',
  ENGINE: 'TRANSCRIBE_ENGINE',
  YES: 'TRANSCRIBE_YES',
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
    manual: flags.manual === true || flags.config === true,
    file: flags.file,
    diarize: firstDefined(flags.speakers, parseBool(env[ENV_KEYS.SPEAKERS]), false),
    engine: resolveEngine(flags, env, config),
    language: resolveLanguage(flags.language ?? env[ENV_KEYS.LANGUAGE], config),
    glossary: resolveGlossary(flags.glossary ?? env[ENV_KEYS.GLOSSARY], availableGlossaries),
    useGeneralGlossary:
      !isNoGlossary(flags.glossary ?? env[ENV_KEYS.GLOSSARY]) &&
      firstDefined(flags.generalGlossary, config.useGeneralGlossary, true),
    copyToClipboard: firstDefined(
      flags.copy,
      parseBool(env[ENV_KEYS.COPY]),
      config.autoCopy,
      false,
    ),
    wrapClipboard: firstDefined(
      flags.wrap,
      parseBool(env[ENV_KEYS.WRAP]),
      config.wrapClipboard,
      true,
    ),
    confirmLongAudio: !firstDefined(flags.yes, parseBool(env[ENV_KEYS.YES]), false),
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

function isNoGlossary(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === GLOSSARY_NONE;
}

function resolveGlossary(raw: string | undefined, available: string[]): string {
  if (raw === undefined || raw.trim() === '' || isNoGlossary(raw)) return '';

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

function resolveEngine(flags: CliFlags, env: NodeJS.ProcessEnv, config: AppConfig): Engine {
  if (flags.local === true) return Engine.LOCAL;
  const raw = flags.engine ?? env[ENV_KEYS.ENGINE];
  if (raw === undefined || raw.trim() === '') return config.engine;

  const value = raw.trim().toLowerCase();
  if (!Object.values(Engine).includes(value as Engine)) {
    throw new OptionError(
      `Unknown engine "${raw}". Available: ${Object.values(Engine).join(', ')}.`,
    );
  }
  return value as Engine;
}
