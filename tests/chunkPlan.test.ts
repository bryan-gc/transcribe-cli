import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkMinutesFrom,
  DEFAULT_CHUNK_MINUTES,
  limitsFor,
  needsChunking,
  needsCompression,
} from '../src/audio/chunkPlan.js';
import { DEFAULT_CONFIG } from '../src/config/configManager.js';
import { DIARIZE_MODEL, MAX_UPLOAD_BYTES, WHISPER_MODEL } from '../src/constants.js';

test('whisper-1 and diarize cut at ten minutes, the gpt-4o text models at five', () => {
  assert.equal(limitsFor(WHISPER_MODEL).maxSeconds, 600);
  assert.equal(limitsFor(DIARIZE_MODEL).maxSeconds, 600);
  assert.equal(limitsFor('gpt-4o-transcribe').maxSeconds, 300);
  assert.equal(limitsFor('gpt-4o-mini-transcribe').maxSeconds, 300);
});

test('the setting can shorten pieces but never pass the model cap', () => {
  assert.equal(limitsFor(WHISPER_MODEL, 4).maxSeconds, 240);
  assert.equal(limitsFor(WHISPER_MODEL, 20).maxSeconds, 600);
  assert.equal(limitsFor('gpt-4o-transcribe', 8).maxSeconds, 300);
});

test('a setting outside 2–20 minutes falls back to the default', () => {
  for (const bad of [1, 21, 0, -5, Number.NaN, 'ten', undefined]) {
    assert.equal(chunkMinutesFrom(bad), DEFAULT_CHUNK_MINUTES);
  }
  assert.equal(chunkMinutesFrom(2), 2);
  assert.equal(DEFAULT_CONFIG.chunkMaxMinutes, DEFAULT_CHUNK_MINUTES);
});

test('chunking starts one second past the limit, and unknown length never chunks', () => {
  const limits = limitsFor(WHISPER_MODEL);
  assert.equal(needsChunking(600, limits), false);
  assert.equal(needsChunking(601, limits), true);
  assert.equal(needsChunking(undefined, limits), false);
});

test('a fourteen-minute wav is over both limits: it gets compressed and cut', () => {
  const limits = limitsFor(WHISPER_MODEL);
  const wavBytes = 840 * 32_000;
  assert.equal(needsChunking(840, limits), true);
  assert.equal(needsCompression(wavBytes, limits), true);
  assert.equal(needsCompression(MAX_UPLOAD_BYTES * 0.5, limits), false);
  assert.ok(limits.maxBytes < MAX_UPLOAD_BYTES);
});
