import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareImportedAudio, ImportError, hasFfmpeg } from '../src/audio/audioImport.js';
import { sanitizeName } from '../src/utils/fileUtils.js';
import { DIR, MAX_UPLOAD_BYTES, RecordingKind } from '../src/constants.js';

const IMPORTED = path.join(DIR.DATA, RecordingKind.IMPORTED);
const AT = new Date(2026, 8, 7, 14, 30, 0);

function sandbox(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'import-'));
}

function realAudio(dir: string, name: string, seconds = 1): string {
  const file = path.join(dir, name);
  const rate = 16000;
  const samples = rate * seconds;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples * 2, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples * 2, 40);
  fs.writeFileSync(file, Buffer.concat([header, Buffer.alloc(samples * 2)]));
  return file;
}

test('a supported file is copied, leaving the original where it was', () => {
  const base = sandbox();
  const source = realAudio(sandbox(), 'nota.wav');

  const result = prepareImportedAudio(source, base, AT);

  assert.equal(result.converted, false);
  assert.ok(fs.existsSync(source), 'the original belongs to the user and stays put');
  assert.ok(result.audioPath.includes(path.join(IMPORTED, '2026-09-07')), result.audioPath);
  assert.ok(result.audioPath.endsWith('14-30-00__nota.wav'), result.audioPath);
  assert.equal(fs.statSync(result.audioPath).size, fs.statSync(source).size);
});

test('the subtitle and text paths sit beside the copied audio', () => {
  const base = sandbox();
  const result = prepareImportedAudio(realAudio(sandbox(), 'nota.wav'), base, AT);

  assert.equal(path.dirname(result.srtPath), path.dirname(result.audioPath));
  assert.ok(result.srtPath.endsWith('14-30-00__nota.srt'));
  assert.ok(result.textPath.endsWith('14-30-00__nota.txt'));
});

test('a missing file is reported by name rather than as a transport error', () => {
  assert.throws(
    () => prepareImportedAudio('/does/not/exist.mp3', sandbox(), AT),
    (e: unknown) => e instanceof ImportError && /File not found/.test((e as Error).message),
  );
});

test('a directory handed in by mistake is refused', () => {
  const dir = sandbox();
  assert.throws(() => prepareImportedAudio(dir, sandbox(), AT), ImportError);
});

test(
  'a format the API does not accept is converted to wav',
  { skip: hasFfmpeg() ? false : 'ffmpeg is not installed' },
  () => {
    const base = sandbox();
    const source = realAudio(sandbox(), 'voz.wav');
    const opus = path.join(path.dirname(source), 'voz.opus');
    fs.renameSync(source, opus);

    const result = prepareImportedAudio(opus, base, AT);

    assert.equal(result.converted, true);
    assert.ok(result.audioPath.endsWith('.wav'), result.audioPath);
    assert.ok(fs.statSync(result.audioPath).size > 0);
  },
);

test('names from a phone become paths that are safe to type', () => {
  assert.equal(sanitizeName('AUD-20260906-WA0012.opus'), 'aud-20260906-wa0012');
  assert.equal(sanitizeName('nota de voz (2).mp3'), 'nota-de-voz-2');
  assert.equal(sanitizeName('Reunión Dirección.m4a'), 'reunion-direccion');
  assert.equal(sanitizeName(`${'a'.repeat(200)}.mp3`).length, 40);
  assert.equal(sanitizeName('....mp3'), 'audio', 'a name that sanitizes to nothing still gets one');
  assert.equal(sanitizeName('___.wav'), 'audio');
});

test('the sanitized name never ends in a separator', () => {
  assert.ok(!sanitizeName('nota de voz .mp3').endsWith('-'));
  assert.ok(!sanitizeName(`${'ab '.repeat(30)}.mp3`).endsWith('-'));
});

test('the upload limit is the one the API documents', () => {
  assert.equal(MAX_UPLOAD_BYTES, 25 * 1024 * 1024);
});
