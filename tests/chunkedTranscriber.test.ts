import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChunkedTranscriber, continuityPrompt } from '../src/transcriber/ChunkedTranscriber.js';
import type {
  ITranscriber,
  TranscribeOptions,
  TranscriptionResult,
} from '../src/transcriber/ITranscriber.js';
import { chunkFileName } from '../src/audio/splitAudio.js';
import { LanguageCode, TranscriptionFormat } from '../src/constants.js';

class ScriptedTranscriber implements ITranscriber {
  readonly calls: TranscribeOptions[] = [];
  constructor(
    private readonly respond: (options: TranscribeOptions, call: number) => string | Error,
  ) {}
  async transcribe(options: TranscribeOptions): Promise<TranscriptionResult> {
    this.calls.push(options);
    const outcome = this.respond(options, this.calls.length);
    if (outcome instanceof Error) throw outcome;
    return {
      raw: outcome,
      engine: 'mock',
      model: 'whisper-1',
      promptApplied: Boolean(options.prompt),
    };
  }
}

const srt = (text: string) => `1\n00:00:01,000 --> 00:00:02,000\n${text}\n`;

function setup(durationSeconds: number) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-'));
  const audio = path.join(root, 'long.wav');
  fs.writeFileSync(audio, 'audio');
  const cacheDir = path.join(root, 'cache');
  const deps = {
    cacheDir,
    chunkMaxMinutes: 10,
    duration: () => durationSeconds,
    ffmpeg: () => '/bin/ffmpeg',
    silences: () => [{ start: 590, end: 592 }],
    split: (_ff: string, _file: string, cuts: number[], total: number, dir: string) =>
      [0, ...cuts].map((from, index) => ({
        index,
        path: path.join(dir, chunkFileName(index)),
        offsetSeconds: from,
        durationSeconds: ([...cuts, total][index] ?? total) - from,
      })),
    sleep: async () => {},
  };
  const options: TranscribeOptions = {
    audioFilePath: audio,
    language: LanguageCode.SPANISH,
    format: TranscriptionFormat.SRT,
    prompt: 'Grafana',
  };
  return { deps, options, cacheDir };
}

test('short audio goes straight to the engine, untouched', async () => {
  const { deps, options } = setup(300);
  const inner = new ScriptedTranscriber(() => srt('hola'));
  const result = await new ChunkedTranscriber(inner, deps).transcribe(options);
  assert.equal(inner.calls.length, 1);
  assert.equal(inner.calls[0]!.audioFilePath, options.audioFilePath);
  assert.equal(result.chunks, undefined);
});

test('long audio is sent in pieces, each with the tail of the previous one, and merged', async () => {
  const { deps, options, cacheDir } = setup(900);
  const inner = new ScriptedTranscriber((_o, call) =>
    srt(call === 1 ? 'primera parte' : 'segunda'),
  );
  const progress: string[] = [];
  const result = await new ChunkedTranscriber(inner, deps).transcribe({
    ...options,
    onProgress: (s) => progress.push(s),
  });

  assert.equal(inner.calls.length, 2);
  assert.equal(inner.calls[0]!.prompt, 'Grafana');
  assert.equal(inner.calls[1]!.prompt, 'Grafana\nprimera parte');
  assert.match(result.raw, /2\n00:09:52,000 --> 00:09:53,000\nsegunda/);
  assert.deepEqual(result.chunks, { count: 2, hardCuts: 0, retries: 0 });
  assert.ok(progress.some((p) => /part 2 of 2/.test(p)));
  assert.deepEqual(fs.readdirSync(cacheDir), [], 'the work folder is removed after success');
});

test('a piece that fails is retried, and a piece that keeps failing keeps the finished ones', async () => {
  const { deps, options, cacheDir } = setup(900);
  let failSecond = true;
  const flaky = new ScriptedTranscriber((o, call) => {
    if (o.audioFilePath.endsWith(chunkFileName(1)) && (failSecond || call === 2)) {
      return Object.assign(new Error('timeout'), { status: 504 });
    }
    return srt(`call ${call}`);
  });

  await assert.rejects(
    () => new ChunkedTranscriber(flaky, deps).transcribe(options),
    (error: Error & { status?: number }) =>
      /Part 2 of 2 failed: timeout\. .*continue from part 2/.test(error.message) &&
      error.status === 504,
  );
  assert.equal(flaky.calls.length, 4, 'one piece done, then three attempts on the second');

  failSecond = false;
  const result = await new ChunkedTranscriber(flaky, deps).transcribe(options);
  assert.equal(flaky.calls.length, 5, 'the retry only sends the piece that was missing');
  assert.match(result.raw, /call 1/);
  assert.deepEqual(fs.readdirSync(cacheDir), []);
});

test('the continuity prompt keeps the glossary and the last forty words, tail last', () => {
  const words = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ');
  const previous = { raw: srt(words), engine: 'm', model: 'm', promptApplied: false };
  const prompt = continuityPrompt('Grafana', previous)!;
  assert.ok(prompt.startsWith('Grafana\nw20 '));
  assert.ok(prompt.endsWith('w59'));
  assert.equal(continuityPrompt(undefined, undefined), undefined);
});
