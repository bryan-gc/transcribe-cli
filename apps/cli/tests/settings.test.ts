import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Key, runCli, startCli } from './support/cli.js';
import { makeTone } from './support/audio.js';
import { fakeMicrophone } from './support/microphone.js';
import { harness } from './support/setup.js';
import { Sandbox } from './support/sandbox.js';

test('the first run without a key asks for it, refuses an empty one, and saves key and folder', async (t) => {
  const sandbox = new Sandbox();
  t.after(() => sandbox.remove());
  fakeMicrophone(sandbox);

  const session = startCli(sandbox, [], { OPENAI_API_KEY: undefined });
  t.after(() => session.kill());
  await session.waitFor('Please enter your OpenAI API Key:');
  await session.press(Key.ENTER);
  await session.waitFor('API Key is required.');
  await session.type('sk-from-setup');
  await session.press(Key.ENTER);
  await session.waitFor('Enter the base path for audio and glossaries:');
  await session.press(Key.ENTER);
  await session.waitFor('🔴 Recording');
  await session.press(Key.CTRL_C);
  await session.exited;

  const config = sandbox.readConfig();
  assert.equal(config.apiKey, 'sk-from-setup');
  assert.equal(config.basePath, sandbox.data);
  assert.equal(fs.statSync(sandbox.configPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(sandbox.dataFile('glossaries', 'general.txt')).isFile(), true);
});

test('nothing is asked when the key comes from the environment, or the mock or local engine need none', async (t) => {
  const { sandbox, env } = await harness(t);
  const whisperx = sandbox.stub('whisperx', 'exit 0');
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  const mock = await runCli(sandbox, ['-f', audio], {
    env: { ...env, OPENAI_API_KEY: undefined, TRANSCRIBE_MOCK: '1' },
  });
  assert.match(mock.screen, /Mock transcription\./);

  sandbox.writeConfig({
    autoGlossary: 'off',
    askMetaBackfill: false,
    engine: 'local',
    localWhisper: { binPath: whisperx },
  });
  const local = startCli(sandbox, ['-c'], { ...env, OPENAI_API_KEY: undefined });
  t.after(() => local.kill());
  const screen = await local.waitFor('Engine');
  assert.doesNotMatch(screen, /OpenAI API Key/);
});

test('the settings menu shows every setting and saves what is changed', async (t) => {
  const { sandbox, env } = await harness(t);

  const session = startCli(sandbox, ['-c'], env);
  t.after(() => session.kill());
  const menu = (await session.waitFor('↑↓ navigate · Enter confirm')).replaceAll(/\s+/g, ' ');
  for (const shown of [
    'Language [l] English',
    'Glossary [g] (none)',
    'General glossary [n] On',
    'Glossary learning [a] off',
    'Microphone [m] Default Device',
    'Engine [e] OpenAI API',
    'Long audio pieces [k] up to 10 min',
    'Clipboard [c] Off',
    'Copy notice [w] On',
  ]) {
    assert.ok(menu.includes(shown), `${shown} in the menu`);
  }

  let mark = session.mark();
  await session.press('c');
  await session.waitFor(/Clipboard \[c\]\s+On/, { from: mark });
  mark = session.mark();
  await session.press('w');
  await session.waitFor(/Copy notice \[w\]\s+Off/, { from: mark });
  mark = session.mark();
  await session.press('n');
  await session.waitFor(/General glossary \[n\]\s+Off/, { from: mark });
  mark = session.mark();
  await session.press('a');
  await session.waitFor('Glossary learning: auto.', { from: mark });

  await session.press('l');
  await session.waitFor('--- Select Language ---');
  await session.press(Key.DOWN, Key.ENTER);
  await session.waitFor('Language changed to Spanish.');

  await session.press('k');
  await session.waitFor('--- Longest piece sent at once');
  await session.press(Key.DOWN, Key.DOWN, Key.ENTER);
  await session.waitFor('Long audio pieces: up to 5 min.');

  await session.press('q');
  await session.exited;

  const config = sandbox.readConfig();
  assert.equal(config.autoCopy, true);
  assert.equal(config.wrapClipboard, false);
  assert.equal(config.useGeneralGlossary, false);
  assert.equal(config.autoGlossary, 'auto');
  assert.equal(config.selectedLanguage, 'es');
  assert.equal(config.chunkMaxMinutes, 5);
});

test('an engine that is not ready says so in the menu, and choosing it says what is missing', async (t) => {
  const { sandbox, env } = await harness(t);
  sandbox.writeConfig({
    autoGlossary: 'off',
    askMetaBackfill: false,
    localWhisper: { binPath: sandbox.file('none', 'whisperx') },
  });

  const session = startCli(sandbox, ['-c'], env);
  t.after(() => session.kill());
  await session.waitFor('↑↓ navigate');
  const mark = session.mark();
  await session.press('e');
  await session.waitFor('--- Select Engine ---', { from: mark });
  assert.ok(
    await session.shows([/OpenAI API/, /Local · WhisperX {2}— {2}not ready \(whisperx\)/], {
      from: mark,
    }),
  );
  await session.press(Key.DOWN, Key.DOWN, Key.ENTER);
  await session.waitFor(
    'Engine set, but whisperx is missing. Fix it with ./apps/cli/tools/install-whisperx.sh.',
  );
  await session.press('q');
  await session.exited;

  assert.equal(sandbox.readConfig().engine, 'local');
});

test('from the menu a recording can be started, paused, stopped and then transcribed', async (t) => {
  const { sandbox, api, env } = await harness(t);
  fakeMicrophone(sandbox);

  const session = startCli(sandbox, ['-c'], env);
  t.after(() => session.kill());
  await session.waitFor('↑↓ navigate');
  await session.press('t');
  await session.waitFor('No recent audio file found to transcribe.');
  await session.press('r');
  await session.waitFor(/Recording/);
  await session.press('t');
  await session.waitFor('Please stop the recording before transcribing.');
  await session.press('p');
  await session.waitFor('⏸️  Paused');
  await session.press('s');
  await session.waitFor('⏹️  Stopped. File saved.');
  await session.press('t');
  await session.waitFor('Last transcription:');
  await session.waitFor('Hello from the stub.');
  await session.press('q');
  await session.exited;

  assert.equal(api.requests.length, 1);
  assert.equal(sandbox.read(sandbox.transcriptFile('recorded', '.txt')), 'Hello from the stub.');
});
