import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTextFromSrt } from '../src/utils/srtParser.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('joins every subtitle into a single paragraph', () => {
  const srt = fs.readFileSync(path.join(FIXTURES, 'sample.srt'), 'utf-8');
  const text = extractTextFromSrt(srt);

  assert.equal(
    text,
    'Buenos días, empezamos con el reporte. Ya lo subí ayer por la tarde. Perfecto, entonces cerramos.',
  );
  assert.ok(!text.includes('-->'), 'timestamps must not leak into the text');
  assert.ok(!/\n/.test(text), 'the result is one paragraph');
});

test('survives the line endings a Windows client would send', () => {
  const srt = fs.readFileSync(path.join(FIXTURES, 'sample.srt'), 'utf-8');
  assert.equal(extractTextFromSrt(srt.replace(/\n/g, '\r\n')), extractTextFromSrt(srt));
});

test('empty input yields an empty string rather than throwing', () => {
  assert.equal(extractTextFromSrt(''), '');
});

test('a purely numeric subtitle is dropped along with the index lines', () => {
  const srt = '1\n00:00:00,000 --> 00:00:01,000\n2024\n';
  assert.equal(extractTextFromSrt(srt), '');
});
