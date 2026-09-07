import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  runTranscription,
  describeTranscriptionError,
  type TranscriptionJob,
} from '../src/utils/runTranscription.js';
import { MockTranscriber } from '../src/transcriber/MockTranscriber.js';
import { LanguageCode } from '../src/constants.js';

const SRT = '1\n00:00:00,000 --> 00:00:01,000\nhola que tal\n';

function job(over: Partial<TranscriptionJob> = {}): TranscriptionJob {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-'));
  const audioPath = path.join(dir, 'audio.wav');
  fs.writeFileSync(audioPath, Buffer.alloc(16));
  return {
    audioPath,
    srtPath: path.join(dir, 'audio.srt'),
    textPath: path.join(dir, 'audio.txt'),
    language: LanguageCode.SPANISH,
    copyToClipboard: false,
    ...over,
  };
}

test('writes the subtitles and the plain text, and returns the text', async () => {
  const j = job();
  const text = await runTranscription(new MockTranscriber(SRT), j);

  assert.equal(text, 'hola que tal');
  assert.equal(fs.readFileSync(j.srtPath, 'utf-8'), SRT);
  assert.equal(fs.readFileSync(j.textPath, 'utf-8'), 'hola que tal');
});

test('a failure leaves no files behind', async () => {
  const j = job();
  await assert.rejects(() => runTranscription(new MockTranscriber(new Error('boom')), j), /boom/);

  assert.equal(fs.existsSync(j.srtPath), false);
  assert.equal(fs.existsSync(j.textPath), false);
});

test('a retry after a failure succeeds without re-recording', async () => {
  const j = job();
  const transcriber = new MockTranscriber([new Error('network down'), SRT]);

  await assert.rejects(() => runTranscription(transcriber, j), /network down/);
  assert.ok(fs.existsSync(j.audioPath), 'the audio is still there to retry with');

  const text = await runTranscription(transcriber, j);
  assert.equal(text, 'hola que tal');
  assert.equal(transcriber.calls.length, 2);
  assert.equal(transcriber.calls[1]!.audioFilePath, j.audioPath);
});

test('a missing audio file is reported before the transcriber is called', async () => {
  const transcriber = new MockTranscriber(SRT);
  const j = job();
  fs.rmSync(j.audioPath);

  await assert.rejects(() => runTranscription(transcriber, j), /Audio file not found/);
  assert.equal(transcriber.calls.length, 0);
});

test('the glossary and language reach the transcriber', async () => {
  const transcriber = new MockTranscriber(SRT);
  await runTranscription(
    transcriber,
    job({ glossary: 'Kubernetes', language: LanguageCode.GERMAN }),
  );

  assert.equal(transcriber.calls[0]!.prompt, 'Kubernetes');
  assert.equal(transcriber.calls[0]!.language, LanguageCode.GERMAN);
});

test('an unauthorized response says what to do instead of naming a status code', () => {
  const message = describeTranscriptionError(
    Object.assign(new Error('401 whatever'), { status: 401 }),
  );
  assert.match(message, /Invalid API key/);
  assert.doesNotMatch(message, /401/);
});

test('a quota failure is recognised from the status and from the message', () => {
  assert.match(
    describeTranscriptionError(Object.assign(new Error('too many'), { status: 429 })),
    /quota exceeded/,
  );
  assert.match(describeTranscriptionError(new Error('insufficient_quota')), /quota exceeded/);
});

test('a connection failure suggests retrying rather than showing the transport error', () => {
  assert.match(
    describeTranscriptionError(Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' })),
    /No connection/,
  );
  assert.match(describeTranscriptionError(new Error('fetch failed')), /No connection/);
});

test('anything unrecognised keeps its own message rather than being hidden', () => {
  assert.equal(describeTranscriptionError(new Error('something specific')), 'something specific');
});
