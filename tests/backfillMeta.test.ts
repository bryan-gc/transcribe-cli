import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backfillMeta, backfilledMeta, transcriptsWithoutMeta } from '../src/utils/backfillMeta.js';
import { DIR, RecordingKind } from '../src/constants.js';

function archive(): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-'));
  const put = (relative: string, content = 'x') => {
    const file = path.join(base, DIR.DATA, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  put('recorded/2026-05-15/19-37-24.txt');
  put('recorded/2026-05-15/19-37-24.wav');
  put('recorded/2026-09-08/10-00-00.txt');
  put('recorded/2026-09-08/10-00-00.meta.json', '{"engine":"openai"}');
  put('imported/2026-09-09/12-19-02__nota.txt');
  put('imported/2026-09-09/12-19-02__nota.ogg');
  put('imported/2026-09-09/12-19-02__nota.json');
  put('recorded/notes/readme.txt');
  return base;
}

const at = (base: string, relative: string) => path.join(base, DIR.DATA, relative);

test('only transcripts in a day folder and without a meta are listed', () => {
  const base = archive();
  assert.deepEqual(transcriptsWithoutMeta(base), [
    at(base, 'imported/2026-09-09/12-19-02__nota.txt'),
    at(base, 'recorded/2026-05-15/19-37-24.txt'),
  ]);
  fs.rmSync(base, { recursive: true, force: true });
});

test('the backfilled meta takes its time from the folder and the name, its source from the folder', () => {
  const base = archive();
  const meta = backfilledMeta(at(base, 'imported/2026-09-09/12-19-02__nota.txt'), () => 42);
  assert.deepEqual(meta, {
    at: new Date(2026, 8, 9, 12, 19, 2).toISOString(),
    source: RecordingKind.IMPORTED,
    audio: { file: '12-19-02__nota.ogg', seconds: 42 },
    backfilled: true,
  });
  fs.rmSync(base, { recursive: true, force: true });
});

test('backfilling writes the missing metas and never replaces one that exists', () => {
  const base = archive();
  const written = backfillMeta(
    [...transcriptsWithoutMeta(base), at(base, 'recorded/2026-09-08/10-00-00.txt')],
    () => undefined,
  );
  assert.equal(written, 2);
  assert.deepEqual(transcriptsWithoutMeta(base), []);
  assert.equal(
    fs.readFileSync(at(base, 'recorded/2026-09-08/10-00-00.meta.json'), 'utf8'),
    '{"engine":"openai"}',
  );
  const recorded = JSON.parse(
    fs.readFileSync(at(base, 'recorded/2026-05-15/19-37-24.meta.json'), 'utf8'),
  );
  assert.equal(recorded.source, RecordingKind.RECORDED);
  assert.deepEqual(recorded.audio, { file: '19-37-24.wav' });
  fs.rmSync(base, { recursive: true, force: true });
});
