import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigManager } from '../src/config/configManager.js';
import { DIR, EXT, LEGACY_DATA_DIR, RecordingKind } from '../src/constants.js';
import { getTimestampPaths } from '../src/utils/fileUtils.js';

const RECORDED = path.join(DIR.DATA, RecordingKind.RECORDED);

function sandbox(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-'));
}

function write(base: string, relative: string, content = 'x'): void {
  const file = path.join(base, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const exists = (base: string, relative: string) => fs.existsSync(path.join(base, relative));
const read = (base: string, relative: string) =>
  fs.readFileSync(path.join(base, relative), 'utf-8');

test('a day folder moves under transcriptions/recorded with its contents intact', () => {
  const base = sandbox();
  write(base, `${LEGACY_DATA_DIR}/2026-05-15/19-11-00.wav`, 'audio');
  write(base, `${LEGACY_DATA_DIR}/2026-05-15/19-11-00.txt`, 'transcript');

  ConfigManager.migrateLegacyLayout(base);

  assert.equal(read(base, `${RECORDED}/2026-05-15/19-11-00.wav`), 'audio');
  assert.equal(read(base, `${RECORDED}/2026-05-15/19-11-00.txt`), 'transcript');
  assert.equal(exists(base, LEGACY_DATA_DIR), false, 'the emptied directory is removed');
});

test('the microphone test lands in the cache rather than the archive', () => {
  const base = sandbox();
  write(base, `${LEGACY_DATA_DIR}/mic-test${EXT.AUDIO}`, 'probe');

  ConfigManager.migrateLegacyLayout(base);

  assert.equal(read(base, `${DIR.CACHE}/mic-test${EXT.AUDIO}`), 'probe');
  assert.equal(exists(base, `${RECORDED}/mic-test${EXT.AUDIO}`), false);
});

test('running it twice changes nothing the second time', () => {
  const base = sandbox();
  write(base, `${LEGACY_DATA_DIR}/2026-05-15/a.wav`, 'first');

  ConfigManager.migrateLegacyLayout(base);
  ConfigManager.migrateLegacyLayout(base);

  assert.equal(read(base, `${RECORDED}/2026-05-15/a.wav`), 'first');
});

test('a tmp directory recreated after the migration is left untouched', () => {
  const base = sandbox();
  write(base, `${LEGACY_DATA_DIR}/2026-05-15/a.wav`, 'archive');
  ConfigManager.migrateLegacyLayout(base);

  write(base, `${LEGACY_DATA_DIR}/notes.txt`, 'mine');
  ConfigManager.migrateLegacyLayout(base);

  assert.equal(read(base, `${LEGACY_DATA_DIR}/notes.txt`), 'mine');
  assert.equal(exists(base, `${RECORDED}/notes.txt`), false);
});

test('an entry already present at the destination is never overwritten', () => {
  const base = sandbox();
  write(base, `${LEGACY_DATA_DIR}/2026-05-15/a.wav`, 'old');
  write(base, `${RECORDED}-staging/placeholder`, 'x');
  fs.mkdirSync(path.join(base, RECORDED), { recursive: true });
  write(base, `${RECORDED}/2026-05-15/a.wav`, 'already here');

  ConfigManager.migrateLegacyLayout(base);

  assert.equal(read(base, `${RECORDED}/2026-05-15/a.wav`), 'already here');
  assert.equal(read(base, `${LEGACY_DATA_DIR}/2026-05-15/a.wav`), 'old');
});

test('a base path with no legacy directory is left alone', () => {
  const base = sandbox();
  ConfigManager.migrateLegacyLayout(base);
  assert.equal(exists(base, DIR.DATA), false, 'nothing is created when there is nothing to move');
});

test('a file named tmp is not mistaken for the legacy directory', () => {
  const base = sandbox();
  write(base, LEGACY_DATA_DIR, 'not a directory');

  ConfigManager.migrateLegacyLayout(base);

  assert.equal(read(base, LEGACY_DATA_DIR), 'not a directory');
});

test('initializeBasePath migrates and then creates the full layout', () => {
  const base = sandbox();
  write(base, `${LEGACY_DATA_DIR}/2026-05-15/a.wav`, 'archive');

  ConfigManager.initializeBasePath(base);

  assert.equal(read(base, `${RECORDED}/2026-05-15/a.wav`), 'archive');
  for (const dir of [
    RECORDED,
    path.join(DIR.DATA, RecordingKind.IMPORTED),
    DIR.GLOSSARIES,
    DIR.CACHE,
  ]) {
    assert.ok(exists(base, dir), `${dir} should exist`);
  }
});

test('paths are grouped by day and land under the directory for their kind', () => {
  const base = sandbox();
  const at = new Date(2026, 4, 15, 19, 11, 0);

  const rec = getTimestampPaths(base, RecordingKind.RECORDED, at);
  const imp = getTimestampPaths(base, RecordingKind.IMPORTED, at);

  assert.equal(rec.audioPath, path.join(base, RECORDED, '2026-05-15', '19-11-00.wav'));
  assert.equal(rec.srtPath, path.join(base, RECORDED, '2026-05-15', '19-11-00.srt'));
  assert.equal(rec.textPath, path.join(base, RECORDED, '2026-05-15', '19-11-00.txt'));
  assert.ok(imp.audioPath.includes(path.join(DIR.DATA, RecordingKind.IMPORTED)));
  assert.ok(fs.existsSync(path.dirname(rec.audioPath)), 'the day directory is created');
});

test('recording is the kind assumed when none is given', () => {
  const base = sandbox();
  assert.ok(getTimestampPaths(base).audioPath.includes(RECORDED));
});

test('single-digit dates and times are zero padded', () => {
  const base = sandbox();
  const p = getTimestampPaths(base, RecordingKind.RECORDED, new Date(2026, 0, 3, 4, 5, 6));
  assert.ok(p.audioPath.endsWith(path.join('2026-01-03', '04-05-06.wav')), p.audioPath);
});
