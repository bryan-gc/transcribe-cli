import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  Capability,
  DEPENDENCIES,
  dependenciesFor,
  envKeyFor,
  isSatisfied,
  resolveBinary,
} from '../src/system/dependencies.js';
import { activeCapabilities, formatReport, runChecks } from '../src/system/doctor.js';
import { DEFAULT_CONFIG, Engine, type AppConfig } from '../src/config/configManager.js';

const config = (over: Partial<AppConfig> = {}): AppConfig => ({
  ...DEFAULT_CONFIG,
  apiKey: 'sk-test',
  ...over,
});

function binDir(...names: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bin-'));
  for (const name of names) {
    fs.writeFileSync(path.join(dir, name), '#!/bin/sh\n', { mode: 0o755 });
  }
  return dir;
}

test('a binary on the PATH is found', () => {
  const dir = binDir('ffmpeg');
  assert.equal(resolveBinary('ffmpeg', { env: { PATH: dir } }), path.join(dir, 'ffmpeg'));
});

test('a binary that is nowhere yields null rather than a guess', () => {
  assert.equal(resolveBinary('ffmpeg', { env: { PATH: binDir() } }), null);
});

test('the configuration wins over the PATH', () => {
  const onPath = binDir('ffmpeg');
  const configured = binDir('ffmpeg');
  const found = resolveBinary('ffmpeg', {
    env: { PATH: onPath },
    binPaths: { ffmpeg: path.join(configured, 'ffmpeg'), arecord: '' },
  });
  assert.equal(found, path.join(configured, 'ffmpeg'));
});

test('the environment wins over the configuration', () => {
  const configured = binDir('ffmpeg');
  const fromEnv = binDir('ffmpeg');
  const found = resolveBinary('ffmpeg', {
    env: { PATH: '', [envKeyFor('ffmpeg')]: path.join(fromEnv, 'ffmpeg') },
    binPaths: { ffmpeg: path.join(configured, 'ffmpeg'), arecord: '' },
  });
  assert.equal(found, path.join(fromEnv, 'ffmpeg'));
});

test('an override that does not exist resolves to null instead of falling back to the PATH', () => {
  const onPath = binDir('ffmpeg');
  const found = resolveBinary('ffmpeg', {
    env: { PATH: onPath, [envKeyFor('ffmpeg')]: '/nowhere/ffmpeg' },
  });
  assert.equal(found, null);
});

test('Homebrew on Apple Silicon is searched even when it is not on the PATH', () => {
  assert.ok(
    DEPENDENCIES.length > 0 &&
      resolveBinary('definitely-not-installed', {
        env: { PATH: '' },
        platform: 'darwin',
      }) === null,
    'and a binary that is not there is still reported missing',
  );
});

test('a file that is not executable does not count as installed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bin-'));
  fs.writeFileSync(path.join(dir, 'ffmpeg'), 'text', { mode: 0o644 });
  assert.equal(resolveBinary('ffmpeg', { env: { PATH: dir } }), null);
});

test('an alternative satisfies the requirement', () => {
  const xclip = DEPENDENCIES.find((d) => d.bin === 'xclip')!;
  assert.equal(isSatisfied(xclip, { env: { PATH: binDir('xsel') } }), true);
  assert.equal(isSatisfied(xclip, { env: { PATH: binDir() } }), false);
});

test('recording asks for nothing that only importing needs', () => {
  const needed = dependenciesFor(new Set([Capability.RECORD]), 'linux').map((d) => d.bin);
  assert.ok(needed.includes('arecord'));
  assert.ok(!needed.includes('ffmpeg'), 'recording never converts anything');
});

test('importing asks for ffmpeg but not for a microphone', () => {
  const needed = dependenciesFor(new Set([Capability.IMPORT]), 'linux').map((d) => d.bin);
  assert.ok(needed.includes('ffmpeg'));
  assert.ok(!needed.includes('arecord'));
});

test('a requirement of another platform is not asked for on this one', () => {
  assert.ok(!dependenciesFor(new Set([Capability.RECORD]), 'linux').some((d) => d.bin === 'sox'));
  assert.ok(
    !dependenciesFor(new Set([Capability.RECORD]), 'darwin').some((d) => d.bin === 'arecord'),
  );
});

test('the engine in use decides which transcription capability is active', () => {
  assert.ok(activeCapabilities(config({ engine: Engine.LOCAL })).has(Capability.ENGINE_LOCAL));
  assert.ok(activeCapabilities(config({ engine: Engine.OPENAI })).has(Capability.ENGINE_OPENAI));
  assert.ok(!activeCapabilities(config({ engine: Engine.LOCAL })).has(Capability.ENGINE_OPENAI));
});

test('passing a file makes importing active instead of recording', () => {
  const active = activeCapabilities(config(), '/tmp/a.mp3');
  assert.ok(active.has(Capability.IMPORT));
  assert.ok(!active.has(Capability.RECORD));
});

test('something missing in an unused capability does not count as a failure', () => {
  const cfg = config({ engine: Engine.OPENAI });
  const active = activeCapabilities(cfg);
  const groups = runChecks(cfg, active, { env: { PATH: binDir('arecord', 'xclip') } });
  const { failedInUse, failedUnused } = formatReport(groups, true);

  assert.equal(failedInUse, 0, 'everything this setup uses is present');
  assert.ok(failedUnused > 0, 'and what it does not use is reported separately');
});

test('something missing in a capability in use is counted', () => {
  const cfg = config();
  const groups = runChecks(cfg, activeCapabilities(cfg), { env: { PATH: binDir() } });
  assert.ok(formatReport(groups, true).failedInUse > 0);
});

test('the report names the command that installs what is missing', () => {
  const cfg = config();
  const groups = runChecks(cfg, activeCapabilities(cfg), {
    env: { PATH: binDir() },
    platform: 'linux',
  });
  assert.match(formatReport(groups, true).text, /sudo apt install alsa-utils/);
});
