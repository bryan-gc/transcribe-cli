import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { archiveEntries, keepAttempt, readAttempts } from '../src/utils/archive.js';
import { transcribeAgain } from '../src/utils/transcribeAgain.js';
import { MockTranscriber } from '../src/transcriber/MockTranscriber.js';
import { DEFAULT_CONFIG, Engine } from '../src/config/configManager.js';
import { GlossaryLearning } from '../src/glossary/learnGlossary.js';
import { DIR, RecordingKind } from '../src/constants.js';

const SRT = '1\n00:00:00,000 --> 00:00:01,000\nlo que dije de verdad\n';

function archive(): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-'));
  const put = (relative: string, content: string | Buffer = 'x') => {
    const file = path.join(base, DIR.DATA, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  put('recorded/2026-09-27/23-10-00.wav', Buffer.alloc(16));
  put('recorded/2026-09-28/00-57-32.wav', Buffer.alloc(16));
  put('recorded/2026-09-28/00-57-32.txt', 'этому Local ¡Gracias por ver!');
  put('recorded/2026-09-28/00-57-32.json', '{"segments":[]}');
  put(
    'recorded/2026-09-28/00-57-32.meta.json',
    JSON.stringify({
      at: '2026-09-28T05:59:43.769Z',
      engine: 'openai',
      model: 'whisper-1',
      aside: true,
    }),
  );
  put('imported/2026-09-28/00-30-00__nota.ogg');
  return base;
}

const config = (base: string) => ({
  ...DEFAULT_CONFIG,
  basePath: base,
  autoCopy: false,
  useGeneralGlossary: false,
  autoGlossary: GlossaryLearning.OFF,
});

test('the archive lists every audio, newest first, including ones never transcribed', () => {
  const base = archive();
  const entries = archiveEntries(base);
  assert.deepEqual(
    entries.map((e) => `${e.source}/${e.day}/${e.name}`),
    [
      'recorded/2026-09-28/00-57-32',
      'imported/2026-09-28/00-30-00__nota',
      'recorded/2026-09-27/23-10-00',
    ],
  );
  assert.deepEqual(readAttempts(entries[2]!), []);
  fs.rmSync(base, { recursive: true, force: true });
});

test('kept attempts come first, oldest first, and the saved transcript last', () => {
  const base = archive();
  const entry = archiveEntries(base)[0]!;
  keepAttempt(entry, { at: '2026-09-28T05:00:00.000Z', text: 'primero' });
  const attempts = readAttempts(entry);
  assert.deepEqual(
    attempts.map((a) => a.text),
    ['primero', 'этому Local ¡Gracias por ver!'],
  );
  assert.equal(attempts[1]!.model, 'whisper-1');
  fs.rmSync(base, { recursive: true, force: true });
});

test('transcribing again keeps the previous text as an attempt and saves the new one in place', async () => {
  const base = archive();
  const entry = archiveEntries(base)[0]!;
  const outcome = await transcribeAgain(
    entry,
    { engine: Engine.LOCAL, diarize: false },
    config(base),
    '',
    undefined,
    () => new MockTranscriber(SRT),
  );

  assert.equal(outcome.text, 'lo que dije de verdad');
  assert.equal(fs.readFileSync(entry.textPath, 'utf8'), 'lo que dije de verdad');
  const attempts = readAttempts(entry);
  assert.deepEqual(
    attempts.map((a) => a.text),
    ['этому Local ¡Gracias por ver!', 'lo que dije de verdad'],
  );
  assert.equal(attempts[0]!.model, 'whisper-1');
  const meta = JSON.parse(fs.readFileSync(entry.metaPath, 'utf8'));
  assert.equal(meta.source, RecordingKind.RECORDED);
  assert.equal(meta.aside, true);
  assert.equal(fs.existsSync(entry.diarizedPath), false, 'stale speaker data does not survive');
  assert.equal(
    fs.existsSync(path.join(base, DIR.DATA, 'imported', '2026-09-28', '00-57-32.wav')),
    false,
  );
  fs.rmSync(base, { recursive: true, force: true });
});

test('a failed attempt changes nothing on disk', async () => {
  const base = archive();
  const entry = archiveEntries(base)[0]!;
  await assert.rejects(() =>
    transcribeAgain(
      entry,
      { engine: Engine.OPENAI, diarize: false },
      config(base),
      '',
      undefined,
      () => new MockTranscriber(new Error('network down')),
    ),
  );
  assert.equal(fs.readFileSync(entry.textPath, 'utf8'), 'этому Local ¡Gracias por ver!');
  assert.equal(readAttempts(entry).length, 1);
  fs.rmSync(base, { recursive: true, force: true });
});
