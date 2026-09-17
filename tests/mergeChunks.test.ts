import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDiarized, mergeSrt } from '../src/utils/mergeChunks.js';
import { chunkFileName, chunkRanges, splitAudio } from '../src/audio/splitAudio.js';

const PART_ONE =
  '1\n00:00:00,000 --> 00:00:02,500\nhola\n\n2\n00:09:58,000 --> 00:09:59,900\nque tal\n';
const PART_TWO = '1\r\n00:00:00,400 --> 00:00:03,000\r\nbien\r\ny tú\r\n';

test('srt pieces are shifted by their offset and renumbered from one', () => {
  const merged = mergeSrt([
    { srt: PART_ONE, offsetSeconds: 0 },
    { srt: PART_TWO, offsetSeconds: 600.25 },
  ]);
  assert.equal(
    merged,
    '1\n00:00:00,000 --> 00:00:02,500\nhola\n\n' +
      '2\n00:09:58,000 --> 00:09:59,900\nque tal\n\n' +
      '3\n00:10:00,650 --> 00:10:03,250\nbien\ny tú\n',
  );
});

test('empty or malformed blocks are skipped instead of producing broken cues', () => {
  assert.equal(mergeSrt([{ srt: '', offsetSeconds: 0 }]), '');
  assert.equal(
    mergeSrt([{ srt: 'garbage\n\n1\n00:00:01,000 --> 00:00:02,000\n\n', offsetSeconds: 0 }]),
    '',
  );
});

test('diarized segments are shifted and labelled by piece when speakers are anonymous', () => {
  const merged = mergeDiarized(
    [
      { segments: [{ speaker: 'A', start: 1, end: 2, text: 'hola' }], offsetSeconds: 0 },
      { segments: [{ speaker: 'A', start: 0.5, end: 1, text: 'bien' }], offsetSeconds: 600 },
    ],
    { prefixSpeakers: true },
  );
  assert.deepEqual(merged, [
    { speaker: '1·A', start: 1, end: 2, text: 'hola' },
    { speaker: '2·A', start: 600.5, end: 601, text: 'bien' },
  ]);
});

test('named speakers and single pieces keep their labels', () => {
  const one = [{ segments: [{ speaker: 'A', start: 1, end: 2, text: 'x' }], offsetSeconds: 0 }];
  assert.equal(mergeDiarized(one, { prefixSpeakers: true })[0]!.speaker, 'A');
  const two = [
    ...one,
    { segments: [{ speaker: 'Ana', start: 0, end: 1, text: 'y' }], offsetSeconds: 60 },
  ];
  assert.equal(mergeDiarized(two, { prefixSpeakers: false })[1]!.speaker, 'Ana');
});

test('cuts become consecutive ranges that cover the whole audio', () => {
  assert.deepEqual(chunkRanges([597.97, 1194.175], 1450), [
    { from: 0, to: 597.97 },
    { from: 597.97, to: 1194.175 },
    { from: 1194.175, to: 1450 },
  ]);
  assert.deepEqual(chunkRanges([], 300), [{ from: 0, to: 300 }]);
});

test('splitting asks the converter for each range and names the pieces in order', () => {
  const calls: unknown[] = [];
  const chunks = splitAudio('/bin/ffmpeg', '/in/long.wav', [600], 900, '/work', (...args) => {
    calls.push(args);
  });
  assert.deepEqual(chunks, [
    { index: 0, path: `/work/${chunkFileName(0)}`, offsetSeconds: 0, durationSeconds: 600 },
    { index: 1, path: '/work/part-001.mp3', offsetSeconds: 600, durationSeconds: 300 },
  ]);
  assert.deepEqual(calls[1], [
    '/bin/ffmpeg',
    '/in/long.wav',
    '/work/part-001.mp3',
    true,
    { from: 600, to: 900 },
  ]);
});
