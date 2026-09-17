import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  runTranscription,
  describeTranscriptionError,
  describeOutcome,
  ClipboardOutcome,
  type TranscriptionJob,
} from '../src/utils/runTranscription.js';
import { MockTranscriber } from '../src/transcriber/MockTranscriber.js';
import { GlossaryLearning } from '../src/glossary/learnGlossary.js';
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
  const outcome = await runTranscription(new MockTranscriber(SRT), j);

  assert.equal(outcome.text, 'hola que tal');
  assert.equal(outcome.clipboard, ClipboardOutcome.OFF);
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

  const outcome = await runTranscription(transcriber, j);
  assert.equal(outcome.text, 'hola que tal');
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

test('an oversized glossary is trimmed before it reaches the transcriber, and the outcome says so', async () => {
  const transcriber = new MockTranscriber(SRT);
  const lines = Array.from({ length: 40 }, (_, i) => `invented term ${i} used only in this test`);
  const outcome = await runTranscription(transcriber, job({ glossary: lines.join('\n') }));
  const sent = transcriber.calls[0]!.prompt!;
  assert.ok(sent.endsWith(lines.at(-1)!));
  assert.ok(!sent.includes(lines[0]!));
  assert.equal(outcome.glossaryPrompt?.trimmed, true);
  assert.equal(outcome.glossaryApplied, true);
});

test('comments in the glossary file are not sent', async () => {
  const transcriber = new MockTranscriber(SRT);
  await runTranscription(transcriber, job({ glossary: '# header\nGrafana' }));
  assert.equal(transcriber.calls[0]!.prompt, 'Grafana');
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

test('a clipboard that fails does not discard a good transcription', async () => {
  const j = job({ copyToClipboard: true });
  const outcome = await runTranscription(new MockTranscriber(SRT), j);

  assert.equal(outcome.text, 'hola que tal', 'the text survives whatever the clipboard did');
  assert.ok(fs.existsSync(j.textPath), 'and so do the files');
  assert.ok([ClipboardOutcome.COPIED, ClipboardOutcome.FAILED].includes(outcome.clipboard));
});

test('the status distinguishes copied from merely enabled', () => {
  assert.match(describeOutcome({ text: 'x', clipboard: ClipboardOutcome.COPIED }), /copied/);
  assert.match(
    describeOutcome({ text: 'x', clipboard: ClipboardOutcome.FAILED, clipboardError: 'no xclip' }),
    /Clipboard: no xclip/,
  );
  assert.doesNotMatch(
    describeOutcome({ text: 'x', clipboard: ClipboardOutcome.OFF }),
    /clipboard/i,
  );
});

test('the meta records which glossary was used and whether it was trimmed', async () => {
  const j = job({ glossary: 'Grafana', glossaryName: 'demo' });
  const outcome = await runTranscription(new MockTranscriber(SRT), j);
  assert.deepEqual(outcome.meta.glossary, {
    name: 'demo',
    applied: true,
    trimmed: false,
    estimatedTokens: 3,
  });
});

test('the copied text carries the notice while the saved text stays bare', async () => {
  const j = job({
    copyToClipboard: true,
    wrap: true,
    glossary: 'Grafana',
    language: LanguageCode.SPANISH,
  });
  const outcome = await runTranscription(new MockTranscriber(SRT), j);

  assert.match(outcome.clipboardText!, /^\[TRANSCRIPCIÓN AUTOMÁTICA/);
  assert.match(
    outcome.clipboardText!,
    /\[Glosario usado como referencia de ortografía: Grafana\]$/,
  );
  assert.equal(fs.readFileSync(j.textPath, 'utf-8'), 'hola que tal');
  assert.equal(outcome.text, 'hola que tal');
});

test('without wrap the copied text is the bare transcript', async () => {
  const outcome = await runTranscription(
    new MockTranscriber(SRT),
    job({ copyToClipboard: true, wrap: false }),
  );
  assert.equal(outcome.clipboardText, 'hola que tal');
});

test('glossary replacements fix the saved text and srt, and the meta counts them', async () => {
  const j = job({ glossary: 'Grafana\nque tal => qué tal', glossaryName: 'demo' });
  const outcome = await runTranscription(new MockTranscriber(SRT), j);
  assert.equal(outcome.text, 'hola qué tal');
  assert.match(fs.readFileSync(j.srtPath, 'utf-8'), /hola qué tal/);
  assert.equal(outcome.meta.glossary?.replacements, 1);
});

test('replacements also reach speaker-labelled transcripts, which get no prompt', async () => {
  const diarized = fs.readFileSync(
    path.join(import.meta.dirname, 'fixtures', 'diarized-response.json'),
    'utf-8',
  );
  const j = job({
    diarize: true,
    glossary: 'empezamos => arrancamos',
    diarizedPath: path.join(os.tmpdir(), `diarized-${Date.now()}.json`),
  });
  const outcome = await runTranscription(new MockTranscriber(diarized), j);
  assert.match(outcome.text, /arrancamos/);
  assert.doesNotMatch(outcome.text, /empezamos/);
  assert.match(fs.readFileSync(j.srtPath, 'utf-8'), /arrancamos/);
  const saved = JSON.parse(fs.readFileSync(j.diarizedPath!, 'utf-8'));
  assert.match(JSON.stringify(saved.segments), /arrancamos/, 'renaming later keeps the fix');
  assert.equal(saved.task, 'transcribe', 'the rest of the response is kept');
});

function jobInBase(over: Partial<TranscriptionJob> = {}): TranscriptionJob {
  const basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-'));
  const dir = path.join(basePath, 'transcriptions', 'recorded', '2026-09-10');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(basePath, 'glossaries'));
  const audioPath = path.join(dir, 'new.wav');
  fs.writeFileSync(audioPath, Buffer.alloc(16));
  return {
    ...job(),
    audioPath,
    srtPath: path.join(dir, 'new.srt'),
    textPath: path.join(dir, 'new.txt'),
    basePath,
    ...over,
  };
}

test('after transcribing, the history teaches the glossary without touching the result', async () => {
  const j = jobInBase({ glossaryLearning: GlossaryLearning.AUTO, glossaryName: 'devops' });
  const dir = path.dirname(j.textPath);
  for (let i = 0; i < 4; i++) {
    fs.writeFileSync(path.join(dir, `old-${i}.txt`), 'hablamos con Zorblax otra vez');
  }
  fs.writeFileSync(path.join(j.basePath!, 'glossaries', 'devops.txt'), 'Grafana\n');

  const outcome = await runTranscription(new MockTranscriber(SRT), j);
  assert.equal(outcome.text, 'hola que tal');
  assert.equal(outcome.learned?.autoAdded, 1);
  const glossaries = path.join(j.basePath!, 'glossaries');
  assert.match(fs.readFileSync(path.join(glossaries, 'general.txt'), 'utf-8'), /Zorblax/);
  assert.ok(fs.existsSync(path.join(glossaries, '.candidates', 'devops.json')));
});

test('with learning off nothing is written to the glossaries', async () => {
  const j = jobInBase({ glossaryLearning: GlossaryLearning.OFF });
  const outcome = await runTranscription(new MockTranscriber(SRT), j);
  assert.equal(outcome.learned, undefined);
  assert.deepEqual(fs.readdirSync(path.join(j.basePath!, 'glossaries')), []);
});
