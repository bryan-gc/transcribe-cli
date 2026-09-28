import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findRetryTarget, RetryError } from '../src/utils/retryTarget.js';
import { DIR, RecordingKind } from '../src/constants.js';

function archive(): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-'));
  const put = (relative: string, content = 'x') => {
    const file = path.join(base, DIR.DATA, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  put('recorded/2026-09-27/23-10-00.wav');
  put('recorded/2026-09-28/00-57-32.wav');
  put('recorded/2026-09-28/00-57-32.txt');
  put('imported/2026-09-28/00-30-00__nota.ogg');
  put('imported/2026-09-28/00-30-00__nota.meta.json', '{"source":"imported","aside":true}');
  return base;
}

const at = (base: string, relative: string) => path.join(base, DIR.DATA, relative);

test('with no file, the newest audio of either folder is retried in place', () => {
  const base = archive();
  const target = findRetryTarget(base);
  assert.equal(target.audioPath, at(base, 'recorded/2026-09-28/00-57-32.wav'));
  assert.equal(target.textPath, at(base, 'recorded/2026-09-28/00-57-32.txt'));
  assert.equal(target.metaPath, at(base, 'recorded/2026-09-28/00-57-32.meta.json'));
  assert.equal(target.source, RecordingKind.RECORDED);
  assert.equal(target.aside, false);
  fs.rmSync(base, { recursive: true, force: true });
});

test('a transcript or meta path leads to its audio, keeping source and aside', () => {
  const base = archive();
  const target = findRetryTarget(base, at(base, 'imported/2026-09-28/00-30-00__nota.meta.json'));
  assert.equal(target.audioPath, at(base, 'imported/2026-09-28/00-30-00__nota.ogg'));
  assert.equal(target.source, RecordingKind.IMPORTED);
  assert.equal(target.aside, true);
  fs.rmSync(base, { recursive: true, force: true });
});

test('a file outside the archive, or an empty archive, is refused with a reason', () => {
  const base = archive();
  assert.throws(() => findRetryTarget(base, '/tmp/nota.ogg'), RetryError);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-'));
  assert.throws(() => findRetryTarget(empty), /Nothing to retry/);
  fs.rmSync(base, { recursive: true, force: true });
  fs.rmSync(empty, { recursive: true, force: true });
});
