import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { engineBlockers } from '../src/system/doctor.js';
import { engineOption } from '../src/components/statusFields.js';
import { DEFAULT_CONFIG, Engine, type AppConfig } from '../src/config/configManager.js';

const config = (over: Partial<AppConfig> = {}): AppConfig => ({
  ...DEFAULT_CONFIG,
  apiKey: 'sk-test',
  ...over,
});

function installedWhisperx(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisperx-'));
  const bin = path.join(dir, 'whisperx');
  fs.writeFileSync(bin, '#!/bin/sh\n', { mode: 0o755 });
  return bin;
}

const withBinPath = (binPath: string): Partial<AppConfig> => ({
  engine: Engine.LOCAL,
  localWhisper: { ...DEFAULT_CONFIG.localWhisper, binPath },
});

test('the OpenAI engine is ready when there is an API key', () => {
  assert.deepEqual(engineBlockers(config({ engine: Engine.OPENAI })), []);
});

test('the OpenAI engine reports the missing key, pointing at the menu', () => {
  const blockers = engineBlockers(config({ engine: Engine.OPENAI, apiKey: '' }));
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0]?.name, 'API key');
  assert.equal(blockers[0]?.remedy, 'transcribe-cli -c');
});

test('the local engine reports whisperx when the binary is not where config says', () => {
  const blockers = engineBlockers(config(withBinPath('/nope/venv-whisperx/bin/whisperx')));
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0]?.name, 'whisperx');
  assert.equal(blockers[0]?.remedy, './scripts/install-whisperx.sh');
  assert.match(blockers[0]?.detail ?? '', /not found at \/nope/);
});

test('the local engine is ready once whisperx exists at that path', () => {
  assert.deepEqual(engineBlockers(config(withBinPath(installedWhisperx()))), []);
});

test('a blocked engine is labelled as not ready in the menu', () => {
  const blocked = engineOption(config(withBinPath('/nope/whisperx')), Engine.LOCAL);
  assert.equal(blocked.ready, false);
  assert.match(blocked.label, /not ready \(whisperx\)/);
  assert.match(blocked.blocker, /install-whisperx\.sh/);
});

test('a ready engine keeps its plain label', () => {
  const ready = engineOption(config(withBinPath(installedWhisperx())), Engine.LOCAL);
  assert.equal(ready.ready, true);
  assert.equal(ready.label, 'Local · WhisperX');
  assert.equal(ready.blocker, '');
});
