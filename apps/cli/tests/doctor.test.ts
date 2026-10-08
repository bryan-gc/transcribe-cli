import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runCli } from './support/cli.js';
import { Sandbox } from './support/sandbox.js';

function withSandbox(options: ConstructorParameters<typeof Sandbox>[0] = {}) {
  const sandbox = new Sandbox(options);
  test.after(() => sandbox.remove());
  return sandbox;
}

test('with everything this setup uses in place, doctor says so and exits 0', async () => {
  const sandbox = withSandbox();
  sandbox.stub('arecord', 'exit 0');
  const result = await runCli(sandbox, ['doctor']);
  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /Recording {2}\(active\)\n {4}✔ arecord/);
  assert.match(
    result.stdout,
    /Transcription · OpenAI API {2}\(active\)\n {4}✔ API key {6}configured/,
  );
  assert.doesNotMatch(result.stdout, /missing in what this setup uses/);
});

test('a missing recorder fails doctor and names the command that installs it', async () => {
  const sandbox = withSandbox();
  const result = await runCli(sandbox, ['doctor']);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /✘ arecord {6}not found\n {6}sudo apt install alsa-utils/);
  assert.match(result.stdout, /1 missing in what this setup uses\./);
});

test('something missing in a capability nobody uses is listed but does not fail', async () => {
  const sandbox = withSandbox();
  sandbox.stub('arecord', 'exit 0');
  const result = await runCli(sandbox, ['doctor']);
  assert.equal(result.code, 0);
  assert.match(
    result.stdout,
    /Playback {2}\(not in use\)\n {4}✘ play {9}not found\n {6}sudo apt install sox/,
  );
  assert.match(result.stdout, /missing elsewhere — only matters if you turn those on/);
});

test('importing asks for ffmpeg and not for a microphone', async () => {
  const sandbox = withSandbox({ tools: [] });
  const result = await runCli(sandbox, ['doctor', '-f', 'talk.mp3']);
  assert.equal(result.code, 1);
  assert.match(
    result.stdout,
    /Importing audio files {2}\(active\)\n {4}✘ ffmpeg {7}not found\n {6}sudo apt install ffmpeg/,
  );
  assert.match(result.stdout, /Recording {2}\(not in use\)/);
  assert.match(result.stdout, /1 missing in what this setup uses\./);
});

test('recording asks for nothing that only importing needs', async () => {
  const sandbox = withSandbox({ tools: [] });
  sandbox.stub('arecord', 'exit 0');
  const result = await runCli(sandbox, ['doctor']);
  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /Importing audio files {2}\(not in use\)\n {4}✘ ffmpeg/);
});

test('the configuration wins over the PATH, and the environment wins over the configuration', async () => {
  const sandbox = withSandbox({ tools: [] });
  sandbox.stub('ffmpeg', 'exit 0');
  const configured = sandbox.executable('custom/ffmpeg');
  const fromEnv = sandbox.executable('env/ffmpeg');
  sandbox.writeConfig({ binPaths: { ffmpeg: configured, arecord: '' } });

  const byConfig = await runCli(sandbox, ['doctor', '-f', 'talk.mp3']);
  assert.match(byConfig.stdout, new RegExp(`✔ ffmpeg {7}${configured}`));

  const byEnv = await runCli(sandbox, ['doctor', '-f', 'talk.mp3'], {
    env: { TRANSCRIBE_FFMPEG_PATH: fromEnv },
  });
  assert.match(byEnv.stdout, new RegExp(`✔ ffmpeg {7}${fromEnv}`));
});

test('an override that does not exist is reported missing instead of falling back to the PATH', async () => {
  const sandbox = withSandbox();
  const result = await runCli(sandbox, ['doctor', '-f', 'talk.mp3'], {
    env: { TRANSCRIBE_FFMPEG_PATH: sandbox.file('nowhere', 'ffmpeg') },
  });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /✘ ffmpeg {7}not found/);
});

test('a file on the PATH that is not executable does not count as installed', async () => {
  const sandbox = withSandbox();
  fs.writeFileSync(`${sandbox.bin}/arecord`, '#!/bin/bash\nexit 0\n', { mode: 0o644 });
  const result = await runCli(sandbox, ['doctor']);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /✘ arecord {6}not found/);
});

test('xsel stands in for xclip when copying is on', async () => {
  const sandbox = withSandbox({ config: { autoCopy: true } });
  sandbox.stub('arecord', 'exit 0');
  const missing = await runCli(sandbox, ['doctor']);
  assert.equal(missing.code, 1);
  assert.match(
    missing.stdout,
    /Clipboard {2}\(active\)\n {4}✘ xclip {8}not found\n {6}sudo apt install xclip/,
  );

  const xsel = sandbox.stub('xsel', 'exit 0');
  const satisfied = await runCli(sandbox, ['doctor']);
  assert.equal(satisfied.code, 0, satisfied.stdout);
  assert.match(satisfied.stdout, new RegExp(`✔ xclip {8}${xsel}`));
});

test('the OpenAI engine without a key points at the settings menu', async () => {
  const sandbox = withSandbox();
  sandbox.stub('arecord', 'exit 0');
  const result = await runCli(sandbox, ['doctor'], { env: { OPENAI_API_KEY: undefined } });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /✘ API key {6}not set\n {6}transcribe-cli -c/);
});

test('the key from the environment counts, and an empty variable does not hide the stored one', async () => {
  const sandbox = withSandbox({ config: { apiKey: '' } });
  sandbox.stub('arecord', 'exit 0');
  const fromEnv = await runCli(sandbox, ['doctor']);
  assert.match(fromEnv.stdout, /✔ API key {6}configured/);

  sandbox.writeConfig({ apiKey: 'sk-stored' });
  const blank = await runCli(sandbox, ['doctor'], { env: { OPENAI_API_KEY: '' } });
  assert.match(blank.stdout, /✔ API key {6}configured/);
});

test('the local engine needs whisperx where the config says, and ffmpeg too', async () => {
  const sandbox = withSandbox({ tools: [] });
  sandbox.stub('arecord', 'exit 0');
  const whisperx = sandbox.file('venv', 'bin', 'whisperx');
  sandbox.writeConfig({ engine: 'local', localWhisper: { binPath: whisperx } });

  const nothing = await runCli(sandbox, ['doctor']);
  assert.equal(nothing.code, 1);
  assert.match(nothing.stdout, /Transcription · local WhisperX {2}\(active\)/);
  assert.match(
    nothing.stdout,
    new RegExp(`✘ whisperx {5}not found at ${whisperx}\n {6}./apps/cli/tools/install-whisperx.sh`),
  );
  assert.match(nothing.stdout, /2 missing in what this setup uses\./);

  sandbox.executable(whisperx);
  const onlyWhisperx = await runCli(sandbox, ['doctor']);
  assert.equal(onlyWhisperx.code, 1);
  assert.match(onlyWhisperx.stdout, /1 missing in what this setup uses\./);

  sandbox.linkSystemTool('ffmpeg');
  const ready = await runCli(sandbox, ['doctor']);
  assert.equal(ready.code, 0, ready.stdout);
});

test('TRANSCRIBE_WHISPERX_PATH says where whisperx lives, and an empty one is ignored', async () => {
  const sandbox = withSandbox();
  const configured = sandbox.file('configured', 'whisperx');
  const moved = sandbox.executable('moved/whisperx');
  sandbox.writeConfig({ engine: 'local', localWhisper: { binPath: configured } });

  const overridden = await runCli(sandbox, ['doctor'], {
    env: { TRANSCRIBE_WHISPERX_PATH: moved },
  });
  assert.match(overridden.stdout, new RegExp(`✔ whisperx {5}${moved}`));

  const blank = await runCli(sandbox, ['doctor'], { env: { TRANSCRIBE_WHISPERX_PATH: '' } });
  assert.match(blank.stdout, new RegExp(`✘ whisperx {5}not found at ${configured}`));
});

test('doctor --all lists the groups that are fine and not in use', async () => {
  const sandbox = withSandbox();
  sandbox.stub('arecord', 'exit 0');
  sandbox.stub('play', 'exit 0');
  sandbox.stub('xclip', 'exit 0');
  const short = await runCli(sandbox, ['doctor']);
  assert.doesNotMatch(short.stdout, /Clipboard/);
  const all = await runCli(sandbox, ['doctor', '--all']);
  assert.match(all.stdout, /Clipboard {2}\(not in use\)\n {4}✔ xclip/);
  assert.equal(all.code, 0);
  assert.match(all.stdout, /1 missing elsewhere — only matters if you turn those on\./);
});

test('an engine that is not ready stops the run before recording, saying why', async () => {
  const sandbox = withSandbox();
  sandbox.writeConfig({
    engine: 'local',
    localWhisper: { binPath: sandbox.file('none', 'whisperx') },
  });
  const audio = sandbox.write('talk.wav', '');
  const result = await runCli(sandbox, ['-f', audio]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /^Nothing was recorded: the Local · WhisperX engine is not ready\./);
  assert.match(
    result.stderr,
    /✘ whisperx: not found at .*\n {4}\.\/apps\/cli\/tools\/install-whisperx\.sh/,
  );
  assert.match(
    result.stderr,
    /Pick another engine with --engine, open transcribe-cli -c, or run transcribe-cli doctor\./,
  );
  assert.deepEqual(sandbox.transcripts('imported'), []);
});

test('an unknown command is refused with the list of the known ones', async () => {
  const sandbox = withSandbox();
  const result = await runCli(sandbox, ['transcribe']);
  assert.equal(result.code, 1);
  assert.match(
    result.stderr,
    /^Unknown command 'transcribe'\. Available: doctor, usage, glossary, speakers, list, ls\./,
  );
});
