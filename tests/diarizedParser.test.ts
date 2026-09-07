import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDiarized,
  formatDiarized,
  buildSrtFromDiarized,
} from '../src/utils/diarizedParser.js';
import type { DiarizedSegment } from '../src/transcriber/ITranscriber.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const RAW = fs.readFileSync(path.join(FIXTURES, 'diarized-response.json'), 'utf-8');

const seg = (speaker: string, start: number, end: number, text: string): DiarizedSegment => ({
  speaker,
  start,
  end,
  text,
});

test('the fixture from the real API parses into segments with seconds and speakers', () => {
  const segments = parseDiarized(RAW);

  assert.equal(segments.length, 6);
  assert.deepEqual([...new Set(segments.map((s) => s.speaker))].sort(), ['A', 'B']);
  assert.equal(typeof segments[0]!.start, 'number');
  assert.ok(segments[0]!.end > segments[0]!.start);
  assert.ok(segments.at(-1)!.end < 60, 'times are seconds in floating point');
});

test('a response without segments is rejected rather than yielding an empty transcription', () => {
  assert.throws(() => parseDiarized('{"text":"hello"}'), /no segments/);
});

test('consecutive turns from one speaker are joined into a single block', () => {
  const text = formatDiarized([
    seg('A', 0, 1, 'Buenos días,'),
    seg('A', 1, 2, 'empezamos.'),
    seg('B', 2, 3, 'Vale.'),
  ]);

  assert.equal(text, '[Speaker A] Buenos días, empezamos.\n[Speaker B] Vale.');
});

test('a single speaker gets no labels at all', () => {
  const text = formatDiarized([seg('A', 0, 1, 'Una nota'), seg('A', 1, 2, 'de voz.')]);
  assert.equal(text, 'Una nota de voz.');
});

test('empty segments are dropped instead of leaving gaps in the text', () => {
  const text = formatDiarized([
    seg('A', 0, 1, 'Hola'),
    seg('B', 1, 2, ''),
    seg('A', 2, 3, 'adiós'),
  ]);
  assert.equal(text, 'Hola adiós', 'and the speaker does not appear to change for silence');
});

test('nothing spoken yields an empty string', () => {
  assert.equal(formatDiarized([]), '');
  assert.equal(formatDiarized([seg('A', 0, 1, '')]), '');
});

test('subtitle timestamps use the comma that SRT requires', () => {
  const srt = buildSrtFromDiarized([seg('A', 0, 2, 'uno'), seg('B', 2, 4.5, 'dos')]);
  assert.match(srt, /00:00:00,000 --> 00:00:02,000/);
  assert.doesNotMatch(srt, /\d\.\d{3} --> /, 'a point instead of a comma breaks most players');
});

test('an hour into a recording is rendered as hours, not as minutes past sixty', () => {
  const srt = buildSrtFromDiarized([seg('A', 3661.5, 3663, 'tarde')]);
  assert.match(srt, /01:01:01,500 --> 01:01:03,000/);
});

test('very short segments from one speaker are merged into a readable subtitle', () => {
  const srt = buildSrtFromDiarized([
    seg('A', 0, 0.3, 'Sí'),
    seg('A', 0.3, 0.7, 'claro'),
    seg('A', 0.7, 1.4, 'perfecto'),
  ]);

  assert.equal(srt.match(/-->/g)?.length, 1, 'they become one cue');
  assert.match(srt, /Sí claro perfecto/);
  assert.match(srt, /00:00:00,000 --> 00:00:01,400/, 'and it spans the whole run');
});

test('segments are never merged across a change of speaker', () => {
  const srt = buildSrtFromDiarized([
    seg('A', 0, 0.3, 'Sí'),
    seg('B', 0.3, 0.6, 'No'),
    seg('A', 0.6, 0.9, 'Vale'),
  ]);

  assert.equal(srt.match(/-->/g)?.length, 3);
  assert.match(srt, /\[Speaker A\] Sí/);
  assert.match(srt, /\[Speaker B\] No/);
});

test('subtitles are numbered from one, in order', () => {
  const srt = buildSrtFromDiarized([seg('A', 0, 2, 'uno'), seg('B', 2, 4, 'dos')]);
  assert.ok(srt.startsWith('1\n'));
  assert.match(srt, /\n2\n/);
});

test('a single-speaker recording gets subtitles without a label', () => {
  const srt = buildSrtFromDiarized([seg('A', 0, 2, 'uno'), seg('A', 5, 7, 'dos')]);
  assert.doesNotMatch(srt, /Speaker/);
});

test('the fixture, where speakers alternate throughout, keeps one cue per segment', () => {
  const segments = parseDiarized(RAW);
  const srt = buildSrtFromDiarized(segments);
  const text = formatDiarized(segments);

  assert.equal(srt.match(/-->/g)?.length, segments.length);
  assert.equal(srt.match(/\[Speaker /g)?.length, segments.length, 'every cue is attributed');
  assert.equal(text.split('\n').length, segments.length, 'and the text is one line per turn');
  assert.match(text, /\[Speaker A\]/);
  assert.match(text, /\[Speaker B\]/);
});
