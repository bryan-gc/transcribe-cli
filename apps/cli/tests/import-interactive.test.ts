import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Key, runCli, startCli } from './support/cli.js';
import { makeAudio, makeTone } from './support/audio.js';
import { apiError, diarizedBody } from './support/openai-stub.js';
import { harness } from './support/setup.js';

const SIX_MINUTES = [{ seconds: 360, silence: true }];

function seedMeta(
  dataDir: string,
  day: string,
  stem: string,
  meta: Record<string, unknown> | string,
) {
  const dir = `${dataDir}/transcriptions/recorded/${day}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    `${dir}/${stem}.meta.json`,
    typeof meta === 'string' ? meta : JSON.stringify(meta),
  );
}

test('a long audio shows what each engine would cost before sending, and q sends nothing', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const audio = makeAudio(sandbox.file('meeting.wav'), SIX_MINUTES);

  const session = startCli(sandbox, ['-f', audio], env);
  t.after(() => session.kill());
  const screen = await session.waitFor('[Enter] transcribe · [e] change engine · [q] cancel');

  assert.match(screen, /Audio: +6m 00s/);
  assert.match(screen, /› OpenAI +whisper-1 +~\$0\.04 +~18s \(guess\)/);
  assert.match(screen, / {2}OpenAI +gpt-4o-transcribe-diarize +~\$0\.13 +~18s \(guess\)/);
  assert.match(screen, / {2}Local +large-v3-turbo +free +~12m 00s \(guess\)/);

  await session.press('q');
  assert.equal(await session.exited, 0);
  assert.equal(api.requests.length, 0);
  assert.equal(sandbox.transcripts('imported').filter((file) => file.endsWith('.txt')).length, 0);
});

test('e moves to another engine and Enter sends the audio with it', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const audio = makeAudio(sandbox.file('meeting.wav'), SIX_MINUTES);

  const session = startCli(sandbox, ['-f', audio], env);
  t.after(() => session.kill());
  await session.waitFor('[Enter] transcribe');
  const mark = session.mark();
  await session.press('e');
  await session.waitFor(/› OpenAI +gpt-4o-transcribe-diarize/, { from: mark });
  await session.press(Key.ENTER);

  await session.waitFor('Transcription completed and saved.');
  assert.equal(await session.exited, 0);
  assert.equal(api.field(0, 'model'), 'gpt-4o-transcribe-diarize');
});

test('the estimate uses how fast this machine went before, model by model', async (t) => {
  const { sandbox, env } = await harness(t);
  const run = (seconds: number, tookMs: number, model = 'whisper-1') => ({
    engine: 'openai',
    model,
    audio: { file: 'x.wav', seconds },
    tookMs,
  });
  seedMeta(sandbox.data, '2026-09-01', '10-00-00', run(100, 10_000));
  seedMeta(sandbox.data, '2026-09-02', '10-00-00', run(300, 60_000));
  seedMeta(sandbox.data, '2026-09-03', '10-00-00', run(100, 900_000, 'gpt-4o-transcribe-diarize'));
  seedMeta(sandbox.data, '2026-09-04', '10-00-00', { audio: { seconds: 100 }, tookMs: 1 });
  seedMeta(sandbox.data, '2026-09-05', '10-00-00', 'not json');
  const audio = makeAudio(sandbox.file('meeting.wav'), SIX_MINUTES);

  const session = startCli(sandbox, ['-f', audio], env);
  t.after(() => session.kill());
  const screen = await session.waitFor('[Enter] transcribe');

  assert.match(screen, /› OpenAI +whisper-1 +~\$0\.04 +~1m 03s\r?\n/);
  assert.match(screen, /gpt-4o-transcribe-diarize +~\$0\.13 +~54m 00s\r?\n/);
  await session.press('q');
  await session.exited;
});

test('-y and TRANSCRIBE_YES skip the estimate and send at once', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const audio = makeAudio(sandbox.file('meeting.wav'), SIX_MINUTES);

  assert.equal((await runCli(sandbox, ['-f', audio, '-y'], { env })).code, 0);
  assert.equal(
    (await runCli(sandbox, ['-f', audio], { env: { ...env, TRANSCRIBE_YES: 'on' } })).code,
    0,
  );
  assert.equal(api.requests.length, 2);
});

async function failingImport(
  t: TestContext,
  reply: Parameters<Awaited<ReturnType<typeof harness>>['api']['replies']>[0],
  env: Record<string, string> = {},
) {
  const setup = await harness(t);
  setup.api.replies(reply);
  const audio = makeTone(setup.sandbox.file('talk.wav'), 1);
  const session = startCli(setup.sandbox, ['-f', audio], { ...setup.env, ...env });
  t.after(() => session.kill());
  const screen = await session.waitFor('Transcription failed. Pick an engine to try again.');
  return { ...setup, session, screen };
}

test('a rejected key says what to do, keeps the audio and leaves no transcript behind', async (t) => {
  const { sandbox, session, screen } = await failingImport(
    t,
    apiError(401, 'Incorrect API key provided: sk-test.'),
  );

  assert.match(screen, /Invalid API key — run transcribe-cli -c to update it\./);
  assert.doesNotMatch(screen, /401/);
  assert.match(screen, /Audio saved at .*__talk\.wav/);
  assert.deepEqual(
    sandbox.transcripts('imported').map((file) => file.replace(/.*__/, '')),
    ['talk.wav'],
  );
  await session.press('q');
  assert.equal(await session.exited, 0);
});

test('a quota failure is recognised from the status', async (t) => {
  const { screen } = await failingImport(t, {
    ...apiError(
      429,
      'You exceeded your current quota, please check your plan and billing details.',
      'insufficient_quota',
    ),
    headers: { 'retry-after': '0' },
  });
  assert.match(screen, /OpenAI quota exceeded — check your plan and billing\./);
});

test('a quota failure is recognised from the message when the status says otherwise', async (t) => {
  const { screen } = await failingImport(
    t,
    apiError(400, 'insufficient_quota for this organization'),
  );
  assert.match(screen, /OpenAI quota exceeded — check your plan and billing\./);
});

test('no connection suggests retrying instead of showing the transport error', async (t) => {
  const { screen } = await failingImport(
    t,
    { body: '' },
    { OPENAI_BASE_URL: 'http://127.0.0.1:9/v1' },
  );
  assert.match(screen, /No connection — retry once you are back online\./);
});

test('anything unrecognised keeps its own message', async (t) => {
  const { screen } = await failingImport(
    t,
    apiError(400, 'Invalid file format. Supported formats: flac, mp3.'),
  );
  assert.match(screen, /Invalid file format\. Supported formats: flac, mp3\./);
});

test('a diarized answer without segments is a failure, not an empty transcript', async (t) => {
  const setup = await harness(t);
  setup.api.replies({ body: { text: 'Hello', usage: { input_tokens: 1, output_tokens: 1 } } });
  const audio = makeTone(setup.sandbox.file('talk.wav'), 1);
  const session = startCli(setup.sandbox, ['-f', audio, '-s'], setup.env);
  t.after(() => session.kill());
  const screen = await session.waitFor('Transcription failed.');
  assert.match(screen, /Diarized response has no segments\./);
});

test('after a failure, Enter tries again with the same audio and saves the result', async (t) => {
  const { sandbox, api, session } = await failingImport(
    t,
    apiError(401, 'Incorrect API key provided.'),
  );
  api.replies({
    body: diarizedBody([{ speaker: 'A', start: 0, end: 1, text: 'Second time lucky.' }]),
  });
  const mark = session.mark();

  await session.press('e');
  await session.waitFor(/› OpenAI +gpt-4o-transcribe-diarize/, { from: mark });
  await session.press(Key.ENTER);
  await session.waitFor('Transcription completed and saved.', { from: mark });
  assert.equal(await session.exited, 0);

  assert.equal(api.requests.length, 2);
  assert.deepEqual(api.requests[1]!.file!.content, api.requests[0]!.file!.content);
  assert.equal(sandbox.transcripts('imported').filter((file) => file.endsWith('.wav')).length, 1);
  assert.equal(sandbox.read(sandbox.transcriptFile('imported', '.txt')), 'Second time lucky.');
});

test('a file that is not there, or is a folder, is named instead of failing to send', async (t) => {
  const { sandbox, api, env } = await harness(t);
  for (const target of [sandbox.file('missing.wav'), sandbox.root]) {
    const session = startCli(sandbox, ['-f', target], env);
    t.after(() => session.kill());
    const screen = await session.waitFor('Could not prepare the file.');
    assert.match(screen.replaceAll(/\s+/g, ' '), new RegExp(`File not found: ${target}`));
    await session.press('q');
    assert.equal(await session.exited, 0);
  }
  assert.equal(api.requests.length, 0);
});

test('a format that needs converting, without ffmpeg, says how to install it', async (t) => {
  const { sandbox, api, env } = await harness(t, { tools: [] });
  const aiff = sandbox.write('talk.aiff', 'not really audio');

  const session = startCli(sandbox, ['-f', aiff], env);
  t.after(() => session.kill());
  const screen = (await session.waitFor('Could not prepare the file.')).replaceAll(/\s+/g, ' ');

  assert.match(
    screen,
    /\.aiff has to be converted first\. ffmpeg is required to: convert imported audio the api will not take, and anything over 25 mb\. Install it with: sudo apt install ffmpeg Or point at an existing one: TRANSCRIBE_FFMPEG_PATH=\/path\/to\/ffmpeg/,
  );
  await session.press('q');
  await session.exited;
  assert.equal(api.requests.length, 0);
});
