import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { engineBlockers } from '../src/system/doctor.js';
import { engineOption } from '../src/components/statusFields.js';
import { envKeyFor, type ResolveSources } from '../src/system/dependencies.js';
import { DEFAULT_CONFIG, Engine, type AppConfig } from '../src/config/configManager.js';

const NOWHERE = '/nonexistent-for-tests';

function present(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-preflight-'));
  const bin = path.join(dir, name);
  fs.writeFileSync(bin, '#!/bin/sh\n', { mode: 0o755 });
  return bin;
}

const absent = (name: string): string => path.join(NOWHERE, name);

const withFfmpeg = (at: string): ResolveSources => ({
  platform: 'linux',
  env: { [envKeyFor('ffmpeg')]: at },
});

const config = (over: Partial<AppConfig> = {}): AppConfig => ({
  ...DEFAULT_CONFIG,
  apiKey: 'sk-test',
  ...over,
});

const withWhisperx = (at: string): Partial<AppConfig> => ({
  engine: Engine.LOCAL,
  localWhisper: { ...DEFAULT_CONFIG.localWhisper, binPath: at },
});

test('the OpenAI engine is ready when there is an API key, whatever else is missing', () => {
  const blockers = engineBlockers(config({ engine: Engine.OPENAI }), withFfmpeg(absent('ffmpeg')));
  assert.deepEqual(blockers, []);
});

test('the OpenAI engine reports the missing key, pointing at the menu', () => {
  const blockers = engineBlockers(
    config({ engine: Engine.OPENAI, apiKey: '' }),
    withFfmpeg(present('ffmpeg')),
  );
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0]?.name, 'API key');
  assert.equal(blockers[0]?.remedy, 'transcribe-cli -c');
});

test('the local engine reports whisperx when the binary is not where config says', () => {
  const blockers = engineBlockers(
    config(withWhisperx(absent('venv-whisperx/bin/whisperx'))),
    withFfmpeg(present('ffmpeg')),
  );
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0]?.name, 'whisperx');
  assert.equal(blockers[0]?.remedy, './scripts/install-whisperx.sh');
  assert.match(blockers[0]?.detail ?? '', new RegExp(`not found at ${NOWHERE}`));
});

test('the local engine needs ffmpeg too, not only whisperx', () => {
  const blockers = engineBlockers(
    config(withWhisperx(present('whisperx'))),
    withFfmpeg(absent('ffmpeg')),
  );
  assert.deepEqual(
    blockers.map((check) => check.name),
    ['ffmpeg'],
  );
});

test('the local engine is ready once whisperx and ffmpeg are both there', () => {
  const blockers = engineBlockers(
    config(withWhisperx(present('whisperx'))),
    withFfmpeg(present('ffmpeg')),
  );
  assert.deepEqual(blockers, []);
});

test('a blocked engine is labelled as not ready in the menu, naming what is missing', () => {
  const blocked = engineOption(
    config(withWhisperx(absent('whisperx'))),
    Engine.LOCAL,
    withFfmpeg(present('ffmpeg')),
  );
  assert.equal(blocked.ready, false);
  assert.match(blocked.label, /not ready \(whisperx\)/);
  assert.match(blocked.blocker, /install-whisperx\.sh/);
});

test('a ready engine keeps its plain label', () => {
  const ready = engineOption(
    config(withWhisperx(present('whisperx'))),
    Engine.LOCAL,
    withFfmpeg(present('ffmpeg')),
  );
  assert.equal(ready.ready, true);
  assert.equal(ready.label, 'Local · WhisperX');
  assert.equal(ready.blocker, '');
});
