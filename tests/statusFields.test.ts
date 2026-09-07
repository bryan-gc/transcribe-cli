import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clipboardField,
  engineField,
  languageField,
  tookField,
} from '../src/components/statusFields.js';
import { formatDuration, ClipboardOutcome } from '../src/utils/runTranscription.js';
import { Engine } from '../src/config/configManager.js';
import { LanguageCode } from '../src/constants.js';

const run = (over = {}) => ({
  text: 'x',
  clipboard: ClipboardOutcome.OFF,
  engine: Engine.OPENAI as string,
  model: 'whisper-1',
  tookMs: 4000,
  ...over,
});

test('before a run the engine field shows what is configured', () => {
  assert.equal(engineField(Engine.LOCAL, null).value, 'Local · WhisperX');
  assert.equal(engineField(Engine.OPENAI, null).value, 'OpenAI API');
});

test('after a run it names the model that actually did the work', () => {
  assert.equal(engineField(Engine.OPENAI, run()).value, 'OpenAI API · whisper-1');
  assert.equal(
    engineField(Engine.OPENAI, run({ engine: Engine.LOCAL, model: 'large-v3-turbo' })).value,
    'Local · WhisperX · large-v3-turbo',
    'the run wins over the configuration, since a flag can override it',
  );
});

test('a diarized run is distinguishable by its model', () => {
  assert.match(
    engineField(Engine.OPENAI, run({ model: 'gpt-4o-transcribe-diarize' })).value,
    /diarize/,
  );
});

test('copied and enabled are no longer reported with the same words', () => {
  assert.equal(clipboardField(true, null).value, 'On');
  assert.equal(clipboardField(true, run({ clipboard: ClipboardOutcome.COPIED })).value, 'Copied');
});

test('a clipboard that failed says so and carries the reason', () => {
  const field = clipboardField(
    true,
    run({ clipboard: ClipboardOutcome.FAILED, clipboardError: 'no xclip' }),
  );
  assert.match(field.value, /Failed/);
  assert.match(field.value, /no xclip/);
  assert.equal(field.tone, 'bad');
});

test('the elapsed time only appears once there is a run to report', () => {
  assert.deepEqual(tookField(null), []);
  assert.equal(tookField(run())[0]!.value, '4s');
});

test('durations read as a person would say them', () => {
  assert.equal(formatDuration(4000), '4s');
  assert.equal(formatDuration(13400), '13s');
  assert.equal(formatDuration(67000), '1m 07s');
  assert.equal(formatDuration(3600000), '60m 00s');
});

test('the language field spells the language out', () => {
  assert.equal(languageField(LanguageCode.SPANISH).value, 'Spanish');
});
