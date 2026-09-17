import fs from 'fs';
import path from 'path';
import { ChunkedTranscriber } from './ChunkedTranscriber.js';
import { DIR } from '../constants.js';
import type { ITranscriber } from './ITranscriber.js';
import { WhisperTranscriber } from './WhisperTranscriber.js';
import { LocalWhisperTranscriber } from './LocalWhisperTranscriber.js';
import { MockTranscriber } from './MockTranscriber.js';
import { Engine, type AppConfig } from '../config/configManager.js';

export const MOCK_ENV_KEY = 'TRANSCRIBE_MOCK';
export const MOCK_FIXTURE_ENV_KEY = 'TRANSCRIBE_MOCK_FIXTURE';

const CHUNKS_CACHE_DIR = 'chunks';

const CANNED_SRT = '1\n00:00:00,000 --> 00:00:02,000\nMock transcription.\n';

export function createTranscriber(
  config: AppConfig,
  env: NodeJS.ProcessEnv = process.env,
): ITranscriber {
  if (isMockMode(env)) {
    const fixture = env[MOCK_FIXTURE_ENV_KEY];
    return chunked(
      config,
      new MockTranscriber(
        fixture && fs.existsSync(fixture) ? fs.readFileSync(fixture, 'utf-8') : CANNED_SRT,
      ),
    );
  }

  if (config.engine === Engine.LOCAL) return new LocalWhisperTranscriber(config.localWhisper);

  if (!config.apiKey) {
    throw new Error('No API key configured. Run transcribe-cli -c, or use --local.');
  }
  return chunked(config, new WhisperTranscriber(config.apiKey));
}

function chunked(config: AppConfig, inner: ITranscriber): ITranscriber {
  return new ChunkedTranscriber(inner, {
    cacheDir: path.join(config.basePath, DIR.CACHE, CHUNKS_CACHE_DIR),
    get chunkMaxMinutes() {
      return config.chunkMaxMinutes;
    },
  });
}

function isMockMode(env: NodeJS.ProcessEnv): boolean {
  const raw = env[MOCK_ENV_KEY]?.trim().toLowerCase();
  return raw !== undefined && raw !== '' && raw !== '0' && raw !== 'false';
}

export function needsApiKey(config: AppConfig, env: NodeJS.ProcessEnv = process.env): boolean {
  return !isMockMode(env) && config.engine !== Engine.LOCAL;
}

export function needsSetup(config: AppConfig, env: NodeJS.ProcessEnv = process.env): boolean {
  if (config.basePath.trim() === '') return true;
  return needsApiKey(config, env) && config.apiKey === '';
}
