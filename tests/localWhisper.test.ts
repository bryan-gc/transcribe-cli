import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildArgs, LocalWhisperTranscriber } from '../src/transcriber/LocalWhisperTranscriber.js';
import {
  createTranscriber,
  needsApiKey,
  needsSetup,
  MOCK_ENV_KEY,
  MOCK_FIXTURE_ENV_KEY,
} from '../src/transcriber/createTranscriber.js';
import { WhisperTranscriber } from '../src/transcriber/WhisperTranscriber.js';
import { MockTranscriber } from '../src/transcriber/MockTranscriber.js';
import {
  DEFAULT_CONFIG,
  Engine,
  type AppConfig,
  type LocalWhisperConfig,
} from '../src/config/configManager.js';
import { LanguageCode, TranscriptionFormat } from '../src/constants.js';

const config = (over: Partial<AppConfig> = {}): AppConfig => ({
  ...DEFAULT_CONFIG,
  apiKey: 'sk-test',
  ...over,
});
const local: LocalWhisperConfig = {
  binPath: '/opt/whisperx',
  model: 'large-v3-turbo',
  device: 'cuda',
  computeType: 'float16',
};
const options = {
  audioFilePath: '/tmp/a.wav',
  language: LanguageCode.SPANISH,
  format: TranscriptionFormat.SRT,
};

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

test('the command line carries the audio, model, language and device', () => {
  const args = buildArgs(local, options, '/tmp/out');

  assert.equal(args[0], '/tmp/a.wav', 'the audio comes first, as a positional argument');
  assert.equal(valueAfter(args, '--model'), 'large-v3-turbo');
  assert.equal(valueAfter(args, '--language'), LanguageCode.SPANISH);
  assert.equal(valueAfter(args, '--device'), 'cuda');
  assert.equal(valueAfter(args, '--compute_type'), 'float16');
  assert.equal(valueAfter(args, '--output_dir'), '/tmp/out');
  assert.equal(valueAfter(args, '--output_format'), TranscriptionFormat.SRT);
});

test('the glossary goes to whisperx as hotwords, and nothing is added without one', () => {
  const withGlossary = buildArgs(
    local,
    { ...options, prompt: 'Kubernetes, Terraform' },
    '/tmp/out',
  );
  assert.equal(valueAfter(withGlossary, '--hotwords'), 'Kubernetes, Terraform');
  assert.ok(!withGlossary.includes('--initial_prompt'));
  assert.ok(!withGlossary.includes('--condition_on_previous_text'));
  assert.ok(!buildArgs(local, options, '/tmp/out').includes('--hotwords'));
});

test('sentence resolution is always requested', () => {
  assert.equal(
    valueAfter(buildArgs(local, options, '/tmp/out'), '--segment_resolution'),
    'sentence',
  );
});

test('a card that runs out of memory can be handled from the configuration alone', () => {
  const args = buildArgs({ ...local, device: 'cpu', computeType: 'int8' }, options, '/tmp/out');
  assert.equal(valueAfter(args, '--device'), 'cpu');
  assert.equal(valueAfter(args, '--compute_type'), 'int8');
});

test('asking for speakers on the local engine fails instead of silently dropping them', async () => {
  const audio = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lw-')), 'a.wav');
  fs.writeFileSync(audio, Buffer.alloc(16));

  await assert.rejects(
    () =>
      new LocalWhisperTranscriber(local).transcribe({
        ...options,
        audioFilePath: audio,
        diarize: true,
      }),
    /not available from the local engine/,
  );
});

test('a missing whisperx says how to install it rather than failing to spawn', async () => {
  const audio = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lw-')), 'a.wav');
  fs.writeFileSync(audio, Buffer.alloc(16));

  await assert.rejects(
    () =>
      new LocalWhisperTranscriber({ ...local, binPath: '/nope/whisperx' }).transcribe({
        ...options,
        audioFilePath: audio,
      }),
    /install-whisperx\.sh/,
  );
});

test('the engine in the configuration decides which transcriber is built', () => {
  assert.ok(createTranscriber(config({ engine: Engine.OPENAI }), {}) instanceof WhisperTranscriber);
  assert.ok(
    createTranscriber(config({ engine: Engine.LOCAL }), {}) instanceof LocalWhisperTranscriber,
  );
});

test('the mock switch wins over the configured engine', () => {
  const env = { [MOCK_ENV_KEY]: '1' };
  assert.ok(createTranscriber(config({ engine: Engine.LOCAL }), env) instanceof MockTranscriber);
});

test('an empty or zero mock switch is off', () => {
  for (const raw of ['', '0', 'false']) {
    assert.ok(
      createTranscriber(config(), { [MOCK_ENV_KEY]: raw }) instanceof WhisperTranscriber,
      `${raw} should not enable the mock`,
    );
  }
});

test('the mock returns the fixture it is pointed at', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fx-')), 'canned.srt');
  fs.writeFileSync(file, 'from the fixture');

  const transcriber = createTranscriber(config(), {
    [MOCK_ENV_KEY]: '1',
    [MOCK_FIXTURE_ENV_KEY]: file,
  });
  assert.equal((await transcriber.transcribe(options)).raw, 'from the fixture');
});

test('only the API engine needs a key', () => {
  assert.equal(needsApiKey(config({ engine: Engine.OPENAI }), {}), true);
  assert.equal(needsApiKey(config({ engine: Engine.LOCAL }), {}), false);
  assert.equal(needsApiKey(config({ engine: Engine.OPENAI }), { [MOCK_ENV_KEY]: '1' }), false);
});

test('the API engine without a key says what to do instead of quoting the SDK', () => {
  assert.throws(
    () => createTranscriber(config({ apiKey: '' }), {}),
    /No API key configured.*--local/s,
  );
});

test('a base path that does not exist yet is created, not treated as unconfigured', () => {
  const cfg = config({ basePath: '/tmp/a-path-that-is-not-there-yet' });
  assert.equal(needsSetup(cfg, {}), false);
});

test('setup is only asked for when something is genuinely unset', () => {
  assert.equal(needsSetup(config({ basePath: '' }), {}), true);
  assert.equal(needsSetup(config({ apiKey: '' }), {}), true);
  assert.equal(needsSetup(config({ apiKey: '', engine: Engine.LOCAL }), {}), false);
  assert.equal(needsSetup(config({ apiKey: '' }), { [MOCK_ENV_KEY]: '1' }), false);
});
