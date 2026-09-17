import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WhisperTranscriber } from '../src/transcriber/WhisperTranscriber.js';
import { LanguageCode, TranscriptionFormat, WHISPER_MODEL } from '../src/constants.js';

function stubFetch(body: string) {
  const seen: { url: string; form?: FormData }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.startsWith('data:')) {
      seen.push({ url, form: init?.body instanceof FormData ? init.body : undefined });
    }
    return new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } });
  }) as unknown as typeof fetch;
  return { impl, seen };
}

function tempAudio(): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-')), 'audio.wav');
  fs.writeFileSync(file, Buffer.alloc(64));
  return file;
}

test('sends the configured model, language and format', async () => {
  const { impl, seen } = stubFetch('1\n00:00:00,000 --> 00:00:01,000\nhola\n');
  const audio = tempAudio();

  const result = await new WhisperTranscriber('sk-test', impl).transcribe({
    audioFilePath: audio,
    language: LanguageCode.SPANISH,
    format: TranscriptionFormat.SRT,
  });

  assert.equal(seen.length, 1);
  assert.match(seen[0]!.url, /\/audio\/transcriptions$/);
  assert.equal(seen[0]!.form?.get('model'), WHISPER_MODEL);
  assert.equal(seen[0]!.form?.get('language'), LanguageCode.SPANISH);
  assert.equal(seen[0]!.form?.get('response_format'), TranscriptionFormat.SRT);
  assert.match(result.raw, /hola/);
});

test('omits the prompt entirely when no glossary is active', async () => {
  const { impl, seen } = stubFetch('text');
  await new WhisperTranscriber('sk-test', impl).transcribe({
    audioFilePath: tempAudio(),
    language: LanguageCode.ENGLISH,
    format: TranscriptionFormat.TEXT,
  });
  assert.equal(seen[0]!.form?.has('prompt'), false, 'an empty prompt must not be sent at all');
});

test('forwards the glossary as the prompt when there is one', async () => {
  const { impl, seen } = stubFetch('text');
  await new WhisperTranscriber('sk-test', impl).transcribe({
    audioFilePath: tempAudio(),
    language: LanguageCode.ENGLISH,
    format: TranscriptionFormat.TEXT,
    prompt: 'Kubernetes, Terraform',
  });
  assert.equal(seen[0]!.form?.get('prompt'), 'Kubernetes, Terraform');
});

test('the diarize model never receives the glossary, since it does not accept a prompt', async () => {
  const { impl, seen } = stubFetch('{"text":"hola","segments":[]}');
  const result = await new WhisperTranscriber('sk-test', impl).transcribe({
    audioFilePath: tempAudio(),
    language: LanguageCode.SPANISH,
    format: TranscriptionFormat.SRT,
    diarize: true,
    prompt: 'Kubernetes, Terraform',
  });
  assert.equal(seen[0]!.form?.has('prompt'), false);
  assert.equal(result.promptApplied, false);
});

test('reports the glossary as applied only when it was actually sent', async () => {
  const { impl } = stubFetch('text');
  const transcriber = new WhisperTranscriber('sk-test', impl);
  const base = {
    audioFilePath: tempAudio(),
    language: LanguageCode.ENGLISH,
    format: TranscriptionFormat.TEXT,
  };
  assert.equal((await transcriber.transcribe({ ...base, prompt: 'Grafana' })).promptApplied, true);
  assert.equal((await transcriber.transcribe(base)).promptApplied, false);
});

test('a missing audio file fails before anything is sent', async () => {
  const { impl, seen } = stubFetch('text');
  await assert.rejects(
    () =>
      new WhisperTranscriber('sk-test', impl).transcribe({
        audioFilePath: '/does/not/exist.wav',
        language: LanguageCode.ENGLISH,
        format: TranscriptionFormat.TEXT,
      }),
    /Audio file not found/,
  );
  assert.equal(seen.length, 0);
});

test('audio over the upload limit is compressed first and the temporary copy is removed', async () => {
  const { impl, seen } = stubFetch('text');
  const big = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-')), 'long.wav');
  fs.writeFileSync(big, Buffer.alloc(24 * 1024 * 1024));
  const compressedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-small-'));
  const compressed = path.join(compressedDir, 'long.mp3');
  const progress: string[] = [];

  await new WhisperTranscriber('sk-test', impl, (source) => {
    assert.equal(source, big);
    fs.writeFileSync(compressed, Buffer.alloc(64));
    return compressed;
  }).transcribe({
    audioFilePath: big,
    language: LanguageCode.SPANISH,
    format: TranscriptionFormat.SRT,
    onProgress: (status) => progress.push(status),
  });

  const sent = seen[0]!.form?.get('file') as File;
  assert.equal(sent.name, 'long.mp3');
  assert.equal(sent.size, 64);
  assert.ok(progress.some((p) => /Compressing/.test(p)));
  assert.equal(fs.existsSync(compressedDir), false, 'the compressed copy is cleaned up');
  assert.ok(fs.existsSync(big), 'the original recording stays');
});

test('audio under the limit is sent as it is, without compressing', async () => {
  const { impl } = stubFetch('text');
  let compressed = false;
  await new WhisperTranscriber('sk-test', impl, () => {
    compressed = true;
    return '';
  }).transcribe({
    audioFilePath: tempAudio(),
    language: LanguageCode.SPANISH,
    format: TranscriptionFormat.SRT,
  });
  assert.equal(compressed, false);
});
