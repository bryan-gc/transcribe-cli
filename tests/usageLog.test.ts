import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  appendUsage,
  formatUsageReport,
  readUsage,
  summarizeUsage,
  usageLogPath,
} from '../src/utils/usageLog.js';
import { Engine } from '../src/config/configManager.js';
import { DIR, RecordingKind, WHISPER_MODEL } from '../src/constants.js';
import type { TranscriptionMeta } from '../src/utils/transcriptionMeta.js';

const meta = (over: Partial<TranscriptionMeta>): TranscriptionMeta => ({
  at: '2026-09-07T11:43:13.000Z',
  source: RecordingKind.RECORDED,
  audio: { file: 'a.wav', seconds: 60 },
  engine: Engine.OPENAI,
  model: WHISPER_MODEL,
  language: 'es' as TranscriptionMeta['language'],
  diarized: false,
  tookMs: 3000,
  cost: { usd: 0.006, estimated: true },
  pricingCheckedOn: '2026-09-07',
  ...over,
});

test('the month adds up by day and by engine, which is the question that matters', () => {
  const { byDay, byModel, total } = summarizeUsage([
    meta({}),
    meta({ at: '2026-09-07T15:00:00.000Z', cost: { usd: 0.01, estimated: true } }),
    meta({
      at: '2026-09-08T09:00:00.000Z',
      engine: Engine.LOCAL,
      model: 'large-v3-turbo',
      cost: { usd: 0, estimated: false },
    }),
  ]);
  assert.deepEqual(
    byDay.map(([day, t]) => [day, t.runs]),
    [
      ['2026-09-07', 2],
      ['2026-09-08', 1],
    ],
  );
  assert.equal(byModel[0][0], `${Engine.OPENAI} · ${WHISPER_MODEL}`);
  assert.equal(total.runs, 3);
  assert.equal(total.audioSeconds, 180);
  assert.equal(Math.round(total.usd * 1000), 16);
});

test('the report is readable and --all adds one line per run', () => {
  const entries = [
    meta({}),
    meta({ at: '2026-09-08T09:00:00.000Z', audio: { file: 'b.ogg', seconds: 30 } }),
  ];
  const short = formatUsageReport(entries);
  assert.match(short, /By day/);
  assert.match(short, /2026-09-07 +1 +1m 00s +3s +\$0\.0060/);
  assert.match(short, /Total +2/);
  assert.doesNotMatch(short, /b\.ogg/);
  assert.match(formatUsageReport(entries, true), /b\.ogg/);
  assert.equal(formatUsageReport([]), 'No transcriptions recorded yet.');
});

test('the log is appended one line per run and read back in order', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-'));
  appendUsage(base, meta({ tookMs: 1 }));
  appendUsage(base, meta({ tookMs: 2 }));
  fs.appendFileSync(usageLogPath(base), 'garbage\n');
  assert.deepEqual(
    readUsage(base).map((m) => m.tookMs),
    [1, 2],
  );
  fs.rmSync(base, { recursive: true, force: true });
});

test('without a log yet, the existing .meta.json files are gathered into one', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-'));
  const day = path.join(base, DIR.DATA, RecordingKind.RECORDED, '2026-09-07');
  fs.mkdirSync(day, { recursive: true });
  fs.writeFileSync(path.join(day, '10-00-00.meta.json'), JSON.stringify(meta({ tookMs: 1 })));
  fs.writeFileSync(path.join(day, '11-00-00.meta.json'), JSON.stringify(meta({ tookMs: 2 })));

  assert.deepEqual(
    readUsage(base).map((m) => m.tookMs),
    [1, 2],
  );
  assert.ok(fs.existsSync(usageLogPath(base)), 'the backfill is written so it happens once');
  fs.rmSync(base, { recursive: true, force: true });
});
