import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  absorbShortFlips,
  pickReference,
  speakersByTalkTime,
} from '../src/speakers/pickReference.js';

const seg = (speaker: string, start: number, end: number) => ({ speaker, start, end, text: 'x' });

test('the longest clean stretch of a speaker is chosen, capped at ten seconds', () => {
  const segments = [seg('A', 0, 4), seg('B', 6, 9), seg('A', 12, 30), seg('B', 31, 33)];
  assert.deepEqual(pickReference(segments, 'A'), { speaker: 'A', start: 12, end: 22 });
});

test('the edges next to another voice are trimmed, and overlapping stretches are skipped', () => {
  const adjacent = [seg('A', 0, 8), seg('B', 8.2, 12), seg('A', 20, 24)];
  assert.deepEqual(pickReference(adjacent, 'A'), { speaker: 'A', start: 0, end: 7.5 });
  assert.deepEqual(pickReference(adjacent, 'B'), { speaker: 'B', start: 8.7, end: 12 });
  const overlapping = [seg('A', 0, 8), seg('B', 6, 7), seg('A', 20, 24)];
  assert.deepEqual(pickReference(overlapping, 'A'), { speaker: 'A', start: 20, end: 24 });
});

test('consecutive short segments of the same voice join into a usable clip', () => {
  const segments = [seg('A', 0, 1.5), seg('A', 1.7, 3.2), seg('A', 3.3, 4)];
  assert.deepEqual(pickReference(segments, 'A'), { speaker: 'A', start: 0, end: 4 });
});

test('a voice with nothing long or clean enough gets no reference', () => {
  assert.equal(pickReference([seg('A', 0, 2), seg('B', 3, 9)], 'A'), undefined);
  assert.equal(pickReference([seg('A', 0, 9)], 'C'), undefined);
});

test('speakers are ranked by how long they talk', () => {
  assert.deepEqual(speakersByTalkTime([seg('A', 0, 2), seg('B', 2, 10), seg('A', 10, 11)]), [
    'B',
    'A',
  ]);
});

test('a split second of another voice between two turns of the same one is absorbed', () => {
  const flips = absorbShortFlips([
    seg('A', 0, 5),
    seg('B', 5, 5.3),
    seg('A', 5.3, 9),
    seg('B', 9, 12),
  ]);
  assert.deepEqual(
    flips.map((s) => s.speaker),
    ['A', 'A', 'A', 'B'],
  );
  const real = absorbShortFlips([seg('A', 0, 5), seg('B', 5, 7), seg('A', 7, 9)]);
  assert.equal(real[1]!.speaker, 'B', 'a real two-second answer stays');
});
