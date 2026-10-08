import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Key, runCli, startCli } from './support/cli.js';
import { audioSeconds, makeAudio } from './support/audio.js';
import { apiError, diarizedBody, srtBody, type RecordedRequest } from './support/openai-stub.js';
import { glossary, harness } from './support/setup.js';
import type { Sandbox } from './support/sandbox.js';

const TWO_MINUTE_PIECES = { chunkMaxMinutes: 2 };

function uploadedSeconds(sandbox: Sandbox, request: RecordedRequest, index: number): number {
  const file = sandbox.write(`uploads/${index}-${request.file!.name}`, request.file!.content);
  return audioSeconds(file);
}

function assertNear(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) < 0.75, `${label}: ${actual} is not near ${expected}`);
}

function partReply(request: RecordedRequest, index: number) {
  return { body: srtBody([{ start: 1, end: 3, text: `Part ${index + 1} speaks.` }]) };
}

test('a long recording is cut at the last silence before each limit, and merges back in time', async (t) => {
  const { sandbox, api, env } = await harness(t, { config: TWO_MINUTE_PIECES });
  const audio = makeAudio(sandbox.file('long.wav'), [
    { seconds: 30 },
    { seconds: 1, silence: true },
    { seconds: 39 },
    { seconds: 5, silence: true },
    { seconds: 25 },
    { seconds: 1, silence: true },
    { seconds: 91 },
    { seconds: 2, silence: true },
    { seconds: 106 },
  ]);
  api.respond(partReply);

  const result = await runCli(sandbox, ['-f', audio, '-y'], { env, deadlineMs: 60_000 });

  assert.equal(result.code, 0, result.screen);
  assert.equal(api.requests.length, 3);
  const pieces = api.requests.map((request, index) => uploadedSeconds(sandbox, request, index));
  assertNear(
    pieces[0]!,
    100.5,
    'cut inside the last pause before two minutes, not the longest one',
  );
  assertNear(pieces[1]!, 93, 'second cut in the next pause');
  assertNear(pieces[2]!, 106.5, 'the rest');

  const srt = sandbox.read(sandbox.transcriptFile('imported', '.srt'));
  const starts = [...srt.matchAll(/^(\d+)\n(\d{2}):(\d{2}):(\d{2}),(\d{3}) -->/gm)].map(
    (match) => ({
      index: Number(match[1]),
      seconds: Number(match[3]) * 60 + Number(match[4]) + Number(match[5]) / 1000,
    }),
  );
  assert.deepEqual(
    starts.map((cue) => cue.index),
    [1, 2, 3],
  );
  assertNear(starts[1]!.seconds, pieces[0]! + 1, 'part two is shifted by part one');
  assertNear(starts[2]!.seconds, pieces[0]! + pieces[1]! + 1, 'part three by both');
  assert.equal(
    sandbox.read(sandbox.transcriptFile('imported', '.txt')),
    'Part 1 speaks. Part 2 speaks. Part 3 speaks.',
  );
  assert.deepEqual(sandbox.meta('imported').chunks, { count: 3, hardCuts: 0, retries: 0 });
  assert.equal(
    fs.readdirSync(sandbox.dataFile('.cache', 'chunks')).length,
    0,
    'the pieces are cleaned up',
  );
});

test('without a pause the piece is cut hard at the limit, and a pause the strict pass misses still counts', async (t) => {
  const { sandbox, api, env } = await harness(t, { config: TWO_MINUTE_PIECES });
  const audio = makeAudio(sandbox.file('long.wav'), [
    { seconds: 100 },
    { seconds: 0.4, silence: true },
    { seconds: 149.6 },
  ]);
  api.respond(partReply);

  await runCli(sandbox, ['-f', audio, '-y'], { env, deadlineMs: 60_000 });

  const pieces = api.requests.map((request, index) => uploadedSeconds(sandbox, request, index));
  assert.equal(pieces.length, 3);
  assertNear(pieces[0]!, 100.2, 'the short pause');
  assertNear(pieces[1]!, 120, 'a hard cut at the limit');
  assert.deepEqual(sandbox.meta('imported').chunks, { count: 3, hardCuts: 1, retries: 0 });
});

test('audio exactly at the limit goes in one piece', async (t) => {
  const { sandbox, api, env } = await harness(t, { config: TWO_MINUTE_PIECES });
  const audio = makeAudio(sandbox.file('two.wav'), [{ seconds: 120 }]);

  await runCli(sandbox, ['-f', audio], { env });

  assert.equal(api.requests.length, 1);
  assert.equal('chunks' in sandbox.meta('imported'), false);
});

test('a piece length outside 2–20 minutes falls back to ten, and no setting passes the model cap', async (t) => {
  const { sandbox, api, env } = await harness(t, {
    config: { chunkMaxMinutes: 1, autoCopy: true },
  });
  sandbox.stubClipboard();
  const audio = makeAudio(sandbox.file('eleven.wav'), [{ seconds: 660 }]);
  api.respond(partReply);

  await runCli(sandbox, ['-f', audio, '-y'], { env, deadlineMs: 60_000 });
  assert.match(
    sandbox.clipboard()!,
    /^\[AUTOMATIC TRANSCRIPTION[^\n]*\]\n\[Audio length: 11 min\]\n\nPart 1 speaks\. Part 2 speaks\./,
  );
  sandbox.writeConfig({ autoGlossary: 'off', chunkMaxMinutes: 30 });
  await runCli(sandbox, ['-f', audio, '-y'], { env, deadlineMs: 60_000 });

  const pieces = api.requests.map((request, index) => uploadedSeconds(sandbox, request, index));
  assert.equal(pieces.length, 4);
  for (const index of [0, 2]) assertNear(pieces[index]!, 600, 'ten minutes');
});

test('each piece is prompted with the glossary and the last forty words before it, tail last', async (t) => {
  const { sandbox, api, env } = await harness(t, { config: TWO_MINUTE_PIECES });
  glossary(sandbox, 'general', ['Kubernetes']);
  const words = Array.from({ length: 50 }, (_, index) => `w${index}`);
  api.respond((_, index) => ({
    body: srtBody([{ start: 0, end: 2, text: index === 0 ? words.join(' ') : 'end' }]),
  }));
  const audio = makeAudio(sandbox.file('long.wav'), [{ seconds: 200 }]);

  await runCli(sandbox, ['-f', audio, '-y'], { env, deadlineMs: 60_000 });

  assert.equal(api.field(0, 'prompt'), 'Kubernetes');
  assert.equal(api.field(1, 'prompt'), `Kubernetes, ${words.slice(10).join(' ')}`);
});

test('with speakers, later pieces carry voice clips from the first one and keep its labels', async (t) => {
  const { sandbox, api, env } = await harness(t, { config: TWO_MINUTE_PIECES });
  const audio = makeAudio(sandbox.file('long.wav'), [
    { seconds: 100 },
    { seconds: 1, silence: true },
    { seconds: 99 },
  ]);
  api.respond((_, index) =>
    index === 0
      ? {
          body: diarizedBody(
            [
              { speaker: 'A', start: 0, end: 40, text: 'I talk the most.' },
              { speaker: 'B', start: 40, end: 60, text: 'I talk less.' },
              { speaker: 'A', start: 60, end: 100, text: 'Back to me.' },
            ],
            { input_tokens: 100, output_tokens: 10 },
          ),
        }
      : {
          body: diarizedBody(
            [
              { speaker: '1·B', start: 0, end: 10, text: 'Still me, B.' },
              { speaker: 'C', start: 10, end: 99, text: 'A new voice.' },
            ],
            { input_tokens: 50, output_tokens: 5 },
          ),
        },
  );

  const result = await runCli(sandbox, ['-f', audio, '-s', '-y'], { env, deadlineMs: 60_000 });

  assert.equal(result.code, 0, result.screen);
  assert.equal(api.requests[0]!.fields['known_speaker_names[]'], undefined);
  assert.deepEqual(api.requests[1]!.fields['known_speaker_names[]'], ['1·A', '1·B']);
  const references = api.requests[1]!.fields['known_speaker_references[]']!;
  assert.equal(references.length, 2);
  for (const reference of references) assert.match(reference, /^data:audio\/mpeg;base64,.{100}/);
  assert.equal(
    sandbox.read(sandbox.transcriptFile('imported', '.txt')),
    '[Speaker 1·A] I talk the most.\n[Speaker 1·B] I talk less.\n[Speaker 1·A] Back to me.\n[Speaker 1·B] Still me, B.\n[Speaker 2·C] A new voice.',
  );
  assert.deepEqual(sandbox.meta('imported').usage, {
    inputTokens: 150,
    outputTokens: 15,
    totalTokens: 165,
  });
});

test('no more than four voices from the first piece are sent along with the next one', async (t) => {
  const { sandbox, api, env } = await harness(t, { config: TWO_MINUTE_PIECES });
  const audio = makeAudio(sandbox.file('long.wav'), [
    { seconds: 100 },
    { seconds: 1, silence: true },
    { seconds: 99 },
  ]);
  const voices = ['A', 'B', 'C', 'D', 'E'];
  api.respond((_, index) => ({
    body: diarizedBody(
      index === 0
        ? voices.map((speaker, i) => ({
            speaker,
            start: i * 20,
            end: i * 20 + 20 - i,
            text: `Voice ${speaker}.`,
          }))
        : [{ speaker: 'A', start: 0, end: 5, text: 'More.' }],
    ),
  }));

  await runCli(sandbox, ['-f', audio, '-s', '-y'], { env, deadlineMs: 60_000 });

  assert.deepEqual(api.requests[1]!.fields['known_speaker_names[]'], ['1·A', '1·B', '1·C', '1·D']);
  assert.equal(api.requests[1]!.fields['known_speaker_references[]']!.length, 4);
});

test('a piece that fails once is retried and the meta counts the retry', async (t) => {
  const { sandbox, api, env } = await harness(t, { config: TWO_MINUTE_PIECES });
  const audio = makeAudio(sandbox.file('long.wav'), [{ seconds: 200 }]);
  api.respond((request, index) =>
    index === 1 ? apiError(400, 'Temporary trouble.') : partReply(request, index),
  );

  const result = await runCli(sandbox, ['-f', audio, '-y'], { env, deadlineMs: 60_000 });

  assert.equal(result.code, 0, result.screen);
  assert.equal(api.requests.length, 3);
  assert.deepEqual(sandbox.meta('imported').chunks, { count: 2, hardCuts: 1, retries: 1 });
});

test('a piece that keeps failing keeps the finished ones, and a retry continues from it', async (t) => {
  const { sandbox, api, env } = await harness(t, { config: TWO_MINUTE_PIECES });
  const audio = makeAudio(sandbox.file('long.wav'), [{ seconds: 300 }]);
  api.respond((request, index) =>
    index >= 1 && index <= 3 ? apiError(400, 'Still broken.') : partReply(request, index),
  );

  const session = startCli(sandbox, ['-f', audio, '-y'], env);
  t.after(() => session.kill());
  await session.waitFor('Pick an engine to try again.', { deadlineMs: 60_000 });
  await session.waitFor(
    /Part 2 of 3 failed: 400 Still broken\.\. The finished parts are kept; retry to continue from part 2\./,
    { flat: true },
  );
  assert.equal(api.requests.length, 4);
  const firstPiece = api.requests[0]!.file!.content;

  const mark = session.mark();
  await session.press(Key.ENTER);
  await session.waitFor('Transcription completed and saved.', { from: mark, deadlineMs: 60_000 });
  await session.exited;

  assert.equal(api.requests.length, 6, 'part 1 is not sent again');
  assert.ok(api.requests.slice(4).every((request) => !request.file!.content.equals(firstPiece)));
  assert.equal(
    sandbox.read(sandbox.transcriptFile('imported', '.txt')),
    'Part 1 speaks. Part 5 speaks. Part 6 speaks.',
  );
});

test('a file over the upload limit is compressed for sending and the temporary copy is removed', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const mono = makeAudio(sandbox.file('mono.wav'), [{ seconds: 140 }], 44100);
  const big = sandbox.file('big.wav');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-i', mono, '-ac', '2', big]);
  fs.mkdirSync(sandbox.file('tmp'));
  assert.ok(fs.statSync(big).size > 23_000_000 && fs.statSync(big).size < 25 * 1024 * 1024);

  const result = await runCli(sandbox, ['-f', big], {
    env: { ...env, TMPDIR: sandbox.file('tmp') },
  });

  assert.equal(result.code, 0, result.screen);
  const sent = api.requests[0]!.file!;
  assert.equal(path.extname(sent.name), '.mp3');
  assert.ok(sent.content.length < 2_000_000);
  assert.deepEqual(
    fs.readdirSync(sandbox.file('tmp')).filter((entry) => entry.startsWith('transcribe-upload-')),
    [],
  );
  assert.equal(path.extname(sandbox.transcriptFile('imported', '.txt')), '.txt');
});
