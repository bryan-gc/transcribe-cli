import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockTranscriber } from '../src/transcriber/MockTranscriber.js';
import { LanguageCode, TranscriptionFormat } from '../src/constants.js';

const call = (t: MockTranscriber) =>
  t.transcribe('/tmp/audio.wav', LanguageCode.SPANISH, TranscriptionFormat.SRT);

test('a single outcome is returned on every call', async () => {
  const t = new MockTranscriber('canned');
  assert.equal(await call(t), 'canned');
  assert.equal(await call(t), 'canned');
});

test('a sequence is consumed in order and the last outcome repeats', async () => {
  const t = new MockTranscriber(['first', 'second']);
  assert.equal(await call(t), 'first');
  assert.equal(await call(t), 'second');
  assert.equal(await call(t), 'second');
});

test('an Error outcome is thrown and the next call still succeeds', async () => {
  const t = new MockTranscriber([new Error('network down'), 'recovered']);
  await assert.rejects(() => call(t), /network down/);
  assert.equal(await call(t), 'recovered');
});

test('every call is recorded with the arguments it received', async () => {
  const t = new MockTranscriber('x');
  await t.transcribe('/tmp/a.wav', LanguageCode.ENGLISH, TranscriptionFormat.TEXT, 'glossary');

  assert.equal(t.calls.length, 1);
  assert.deepEqual(t.calls[0], {
    audioFilePath: '/tmp/a.wav',
    language: LanguageCode.ENGLISH,
    format: TranscriptionFormat.TEXT,
    prompt: 'glossary',
  });
});

test('progress is reported so callers driving a spinner are exercised', async () => {
  const seen: string[] = [];
  const t = new MockTranscriber('x');
  await t.transcribe('/tmp/a.wav', LanguageCode.SPANISH, TranscriptionFormat.SRT, undefined, (s) =>
    seen.push(s),
  );
  assert.equal(seen.length, 1);
});

test('constructing with no outcomes fails loudly instead of at the first call', () => {
  assert.throws(() => new MockTranscriber([]), /at least one outcome/);
});
