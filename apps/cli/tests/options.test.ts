import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from './support/cli.js';
import { makeTone } from './support/audio.js';
import { glossary, harness } from './support/setup.js';

test('a language saved by an older version that is no longer offered falls back to English', async (t) => {
  const { sandbox, api, env } = await harness(t, { config: { selectedLanguage: 'it' } });
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  await runCli(sandbox, ['-f', audio], { env });

  assert.equal(api.field(0, 'language'), 'en');
});

test('empty environment variables are ignored rather than validated', async (t) => {
  const { sandbox, api, env } = await harness(t, { config: { selectedLanguage: 'de' } });
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  const result = await runCli(sandbox, ['-f', audio], {
    env: {
      ...env,
      TRANSCRIBE_LANGUAGE: '',
      TRANSCRIBE_COPY: ' ',
      TRANSCRIBE_ENGINE: '',
      TRANSCRIBE_GLOSSARY: '',
    },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(api.field(0, 'language'), 'de');
});

test('a glossary can be named with or without its extension', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const audio = makeTone(sandbox.file('talk.wav'), 1);
  glossary(sandbox, 'work', ['Pulumi']);

  await runCli(sandbox, ['-f', audio, '-g', 'work.txt', '--no-general-glossary'], { env });
  await runCli(sandbox, ['-f', audio, '-g', 'work', '--no-general-glossary'], { env });

  assert.deepEqual(
    api.requests.map((request) => request.fields.prompt?.[0]),
    ['Pulumi', 'Pulumi'],
  );
});
