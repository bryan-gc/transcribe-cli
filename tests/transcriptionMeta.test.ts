import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMeta, estimateCost, formatCost } from '../src/utils/transcriptionMeta.js';
import { DIARIZE_MODEL, LanguageCode, RecordingKind, WHISPER_MODEL } from '../src/constants.js';

const REAL_DIARIZED_USAGE = { inputTokens: 100, outputTokens: 322, totalTokens: 422 };

test('the diarized cost matches what the API actually charged', () => {
  const cost = estimateCost(DIARIZE_MODEL, REAL_DIARIZED_USAGE);
  assert.equal(cost.usd, 0.00347);
  assert.equal(cost.estimated, true);
});

test('an hour of diarized audio lands where the measurement said it would', () => {
  const perTenSeconds = estimateCost(DIARIZE_MODEL, REAL_DIARIZED_USAGE).usd;
  const perHour = perTenSeconds * 360;
  assert.ok(perHour > 1.1 && perHour < 1.4, `expected about $1.25 an hour, got ${perHour}`);
});

test('whisper-1 is charged by the length of the audio, since it reports no tokens', () => {
  assert.equal(estimateCost(WHISPER_MODEL, undefined, 60).usd, 0.006);
  assert.equal(estimateCost(WHISPER_MODEL, undefined, 66.96).usd, 0.006696);
});

test('the diarized model is around three and a half times whisper-1 a minute', () => {
  const diarized = (estimateCost(DIARIZE_MODEL, REAL_DIARIZED_USAGE).usd / 10) * 60;
  const plain = estimateCost(WHISPER_MODEL, undefined, 60).usd;
  assert.ok(diarized / plain > 3 && diarized / plain < 4, `ratio was ${diarized / plain}`);
});

test('a local run is free, and says so rather than guessing', () => {
  const cost = estimateCost('large-v3-turbo', undefined, 300);
  assert.equal(cost.usd, 0);
  assert.equal(cost.estimated, false, 'nothing was charged, so nothing is being estimated');
});

// An absent field breaks a jq that sums the month; an explicit zero adds up fine.
test('the cost is always present, never omitted', () => {
  const meta = buildMeta({
    source: RecordingKind.RECORDED,
    audioFile: 'a.wav',
    engine: 'local',
    model: 'large-v3-turbo',
    language: LanguageCode.SPANISH,
    diarized: false,
    tookMs: 1000,
  });
  assert.equal(meta.cost.usd, 0);
  assert.ok(Object.prototype.hasOwnProperty.call(meta.cost, 'usd'));
});

test('the record carries what a later comparison would need', () => {
  const meta = buildMeta({
    source: RecordingKind.IMPORTED,
    audioFile: 'nota.ogg',
    audioSeconds: 66.96,
    engine: 'openai',
    model: WHISPER_MODEL,
    language: LanguageCode.SPANISH,
    diarized: false,
    tookMs: 4120,
    at: new Date('2026-09-07T11:43:13.000Z'),
  });

  assert.equal(meta.at, '2026-09-07T11:43:13.000Z');
  assert.equal(meta.source, RecordingKind.IMPORTED);
  assert.equal(meta.audio.seconds, 66.96);
  assert.equal(meta.model, WHISPER_MODEL);
  assert.equal(meta.tookMs, 4120);
  assert.ok(meta.pricingCheckedOn, 'so a stale price table is visible rather than silent');
});

test('small amounts keep enough digits to mean something', () => {
  assert.equal(formatCost({ usd: 0.00347, estimated: true }), '$0.0035 (est.)');
  assert.equal(formatCost({ usd: 2.5, estimated: true }), '$2.50 (est.)');
  assert.equal(formatCost({ usd: 0, estimated: false }), 'free');
});
