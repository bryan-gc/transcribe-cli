import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { estimateRun, formatEstimatedCost, formatEstimatedTime } from '../src/utils/estimate.js';
import { measuredSpeed, readRecentMeta } from '../src/utils/history.js';
import { Engine } from '../src/config/configManager.js';
import { DIARIZE_MODEL, DIR, RecordingKind, WHISPER_MODEL } from '../src/constants.js';
import type { TranscriptionMeta } from '../src/utils/transcriptionMeta.js';

const LOCAL_MODEL = 'large-v3-turbo';
const HOUR = 3600;

test('an hour with whisper-1 costs what the published price per hour says', () => {
  const run = estimateRun(HOUR, { engine: Engine.OPENAI, diarize: false }, LOCAL_MODEL);
  assert.equal(run.model, WHISPER_MODEL);
  assert.equal(run.cost.usd, 0.36);
});

test('an hour of speaker labels lands near the measured $1.25', () => {
  const run = estimateRun(HOUR, { engine: Engine.OPENAI, diarize: true }, LOCAL_MODEL);
  assert.equal(run.model, DIARIZE_MODEL);
  assert.ok(run.cost.usd > 1.1 && run.cost.usd < 1.4, `got ${run.cost.usd}`);
});

test('without history the time falls back to a conservative guess instead of failing', () => {
  const run = estimateRun(60, { engine: Engine.LOCAL, diarize: false }, LOCAL_MODEL);
  assert.equal(run.model, LOCAL_MODEL);
  assert.equal(run.cost.usd, 0);
  assert.equal(run.seconds, 120);
  assert.equal(run.measured, false);
  assert.equal(formatEstimatedTime(run), '~2m 00s (guess)');
  assert.equal(formatEstimatedCost(run.cost), 'free');
});

test('with history the time comes from this machine, not from a constant', () => {
  const speedOf = () => 0.5;
  const run = estimateRun(60, { engine: Engine.LOCAL, diarize: false }, LOCAL_MODEL, speedOf);
  assert.equal(run.seconds, 30);
  assert.equal(run.measured, true);
  assert.equal(formatEstimatedTime(run), '~30s');
});

test('estimated costs read as approximate', () => {
  const run = estimateRun(HOUR, { engine: Engine.OPENAI, diarize: false }, LOCAL_MODEL);
  assert.equal(formatEstimatedCost(run.cost), '~$0.36');
});

const meta = (over: Partial<TranscriptionMeta>): TranscriptionMeta => ({
  at: '2026-09-07T11:43:13.000Z',
  source: RecordingKind.RECORDED,
  audio: { file: 'a.wav', seconds: 10 },
  engine: Engine.LOCAL,
  model: LOCAL_MODEL,
  language: 'es' as TranscriptionMeta['language'],
  diarized: false,
  tookMs: 20000,
  cost: { usd: 0, estimated: false },
  pricingCheckedOn: '2026-09-07',
  ...over,
});

test('the measured speed averages every run of the same model and ignores the rest', () => {
  const speedOf = measuredSpeed([
    meta({ audio: { file: 'a.wav', seconds: 25 }, tookMs: 12000 }),
    meta({ audio: { file: 'b.wav', seconds: 67 }, tookMs: 14000 }),
    meta({ model: WHISPER_MODEL, audio: { file: 'c.wav', seconds: 60 }, tookMs: 3000 }),
    meta({ audio: { file: 'd.wav' }, tookMs: 99999 }),
  ]);
  assert.equal(speedOf(LOCAL_MODEL), 26000 / 92000);
  assert.equal(speedOf(WHISPER_MODEL), 0.05);
  assert.equal(speedOf('never-seen'), undefined);
});

test('the history is read from the archive, newest first, skipping files that are not JSON', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'history-'));
  const day = path.join(base, DIR.DATA, RecordingKind.RECORDED, '2026-09-07');
  fs.mkdirSync(day, { recursive: true });
  fs.writeFileSync(path.join(day, '10-00-00.meta.json'), JSON.stringify(meta({ tookMs: 1 })));
  fs.writeFileSync(path.join(day, '11-00-00.meta.json'), JSON.stringify(meta({ tookMs: 2 })));
  fs.writeFileSync(path.join(day, '12-00-00.meta.json'), 'not json');

  const history = readRecentMeta(base, 1);
  assert.equal(history.length, 1);
  assert.equal(history[0].tookMs, 2);
  assert.deepEqual(readRecentMeta(path.join(base, 'nowhere')), []);
  fs.rmSync(base, { recursive: true, force: true });
});
