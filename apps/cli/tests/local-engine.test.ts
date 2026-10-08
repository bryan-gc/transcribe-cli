import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, startCli } from './support/cli.js';
import { makeTone } from './support/audio.js';
import { srtBody } from './support/openai-stub.js';
import { glossary, harness } from './support/setup.js';
import type { Sandbox } from './support/sandbox.js';

const WRITES_SRT = `
printf '%s\\n' "$@" > '%LOG%'
out=""; audio="$1"
while [ $# -gt 0 ]; do [ "$1" = "--output_dir" ] && out="$2"; shift; done
stem=$(basename "$audio"); stem="\${stem%.*}"
cat > "$out/$stem.srt" <<'SRT'
${srtBody([{ start: 0, end: 2, text: 'Transcribed on this machine.' }])}SRT
`;

function fakeWhisperx(sandbox: Sandbox, script = WRITES_SRT): string {
  return sandbox.stub('whisperx', script.replace('%LOG%', `${sandbox.logDir}/whisperx.args`));
}

function whisperxArgs(sandbox: Sandbox): string[] {
  return sandbox.callArgs('whisperx')!.split('\n');
}

function localConfig(binPath: string, extra: Record<string, string> = {}) {
  return {
    engine: 'local',
    localWhisper: {
      binPath,
      model: 'large-v3-turbo',
      device: 'cuda',
      computeType: 'float16',
      ...extra,
    },
  };
}

test('the local engine runs whisperx on the archived audio and keeps what it wrote, free and offline', async (t) => {
  const { sandbox, api, env } = await harness(t);
  sandbox.writeConfig({ autoGlossary: 'off', ...localConfig(fakeWhisperx(sandbox)) });
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  const result = await runCli(sandbox, ['-f', audio, '-l', 'es'], {
    env: { ...env, OPENAI_API_KEY: undefined },
  });

  assert.equal(result.code, 0, result.screen);
  const args = whisperxArgs(sandbox);
  assert.match(args[0]!, /transcriptions\/imported\/.*__talk\.wav$/);
  assert.deepEqual(args.slice(1, 11), [
    '--model',
    'large-v3-turbo',
    '--language',
    'es',
    '--device',
    'cuda',
    '--compute_type',
    'float16',
    '--segment_resolution',
    'sentence',
  ]);
  assert.deepEqual(args.slice(11, 13), ['--output_format', 'srt']);
  assert.ok(!args.includes('--hotwords'), 'nothing is added without a glossary');
  assert.equal(
    sandbox.read(sandbox.transcriptFile('imported', '.txt')),
    'Transcribed on this machine.',
  );
  const meta = sandbox.meta('imported');
  assert.equal(meta.engine, 'local');
  assert.equal(meta.model, 'large-v3-turbo');
  assert.deepEqual(meta.cost, { usd: 0, estimated: false });
  assert.match(result.screen, /Engine: Local · WhisperX · large-v3-turbo/);
  assert.equal(api.requests.length, 0);
});

test('--local, --engine and TRANSCRIBE_ENGINE pick the engine; an unknown one is refused', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const config = localConfig(fakeWhisperx(sandbox));
  sandbox.writeConfig({ autoGlossary: 'off', localWhisper: config.localWhisper });
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  await runCli(sandbox, ['-f', audio, '--local'], { env });
  await runCli(sandbox, ['-f', audio, '--engine', 'local'], { env });
  await runCli(sandbox, ['-f', audio], { env: { ...env, TRANSCRIBE_ENGINE: 'LOCAL' } });
  assert.equal(api.requests.length, 0);
  assert.equal(sandbox.transcripts('imported').filter((file) => file.endsWith('.txt')).length, 3);

  const unknown = await runCli(sandbox, ['-f', audio, '--engine', 'cloud'], { env });
  assert.equal(unknown.code, 1);
  assert.equal(unknown.stderr, 'Unknown engine "cloud". Available: openai, local.\n');
});

test('the glossary reaches whisperx as one comma-separated --hotwords line', async (t) => {
  const { sandbox, env } = await harness(t);
  sandbox.writeConfig({ autoGlossary: 'off', ...localConfig(fakeWhisperx(sandbox)) });
  glossary(sandbox, 'general', ['# comment', 'Kubernetes', 'OpenAI', 'kuberneti => Kubernetes']);
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  await runCli(sandbox, ['-f', audio], { env });

  const args = whisperxArgs(sandbox);
  assert.deepEqual(args.slice(args.indexOf('--hotwords')), ['--hotwords', 'Kubernetes, OpenAI']);
  assert.equal((sandbox.meta('imported').glossary as { applied: boolean }).applied, true);
});

test('a card that runs out of memory can be handled from the configuration alone', async (t) => {
  const { sandbox, env } = await harness(t);
  const oom = `
echo "/venv/lib/python3.12/site-packages/pyannote/audio/core/io.py:43: UserWarning: torchaudio._backend.set_audio_backend has been deprecated." >&2
echo "  warnings.warn(" >&2
echo "Traceback (most recent call last):" >&2
echo "RuntimeError: CUDA failed with error out of memory" >&2
echo "Lightning automatically upgraded your loaded checkpoint from v1.5.4 to v2.5.5." >&2
exit 1`;
  const failing = fakeWhisperx(sandbox, oom);
  sandbox.writeConfig({ autoGlossary: 'off', ...localConfig(failing) });
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  const session = startCli(sandbox, ['-f', audio], env);
  t.after(() => session.kill());
  const screen = (await session.waitFor('Transcription failed.')).replaceAll(/\s+/g, ' ');
  assert.match(
    screen,
    /WhisperX exited with code 1: Traceback \(most recent call last\): RuntimeError: CUDA failed with error out of memory Audio saved/,
  );
  assert.doesNotMatch(screen, /Lightning automatically|warnings\.warn/);
  await session.press('q');
  await session.exited;

  sandbox.writeConfig({
    autoGlossary: 'off',
    ...localConfig(fakeWhisperx(sandbox), { device: 'cpu', computeType: 'int8' }),
  });
  const retried = await runCli(sandbox, ['-f', audio], { env });
  assert.equal(retried.code, 0);
  const args = whisperxArgs(sandbox);
  assert.equal(args[args.indexOf('--device') + 1], 'cpu');
  assert.equal(args[args.indexOf('--compute_type') + 1], 'int8');
});

test('asking the local engine for speakers fails instead of silently dropping them', async (t) => {
  const { sandbox, env } = await harness(t);
  sandbox.writeConfig({ autoGlossary: 'off', ...localConfig(fakeWhisperx(sandbox)) });
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  const session = startCli(sandbox, ['-f', audio, '--speakers'], env);
  t.after(() => session.kill());
  const screen = (await session.waitFor('Transcription failed.')).replaceAll(/\s+/g, ' ');

  assert.match(
    screen,
    /Speaker labels are not available from the local engine yet\. Drop --local to use the API, or drop --speakers\./,
  );
  assert.equal(sandbox.callArgs('whisperx'), undefined);
});

test('whisperx that ends without writing a transcription is a failure, not an empty text', async (t) => {
  const { sandbox, env } = await harness(t);
  sandbox.writeConfig({ autoGlossary: 'off', ...localConfig(fakeWhisperx(sandbox, 'exit 0')) });
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  const session = startCli(sandbox, ['-f', audio], env);
  t.after(() => session.kill());
  const screen = await session.waitFor('Transcription failed.');

  assert.match(screen, /WhisperX finished without writing a transcription\./);
});

test('the mock switch wins over the configured engine', async (t) => {
  const { sandbox, env } = await harness(t);
  sandbox.writeConfig({ autoGlossary: 'off', ...localConfig(fakeWhisperx(sandbox)) });
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  const result = await runCli(sandbox, ['-f', audio], { env: { ...env, TRANSCRIBE_MOCK: '1' } });

  assert.match(result.screen, /Mock transcription\./);
  assert.equal(sandbox.callArgs('whisperx'), undefined);
});
