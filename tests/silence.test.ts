import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSilencedetect, planCuts, type Silence } from '../src/audio/silence.js';

const STDERR = [
  "Input #0, mp3, from 'long.mp3':",
  '[silencedetect @ 0x55d0c1a2b3c0] silence_start: 612.345',
  '[silencedetect @ 0x55d0c1a2b3c0] silence_end: 613.101 | silence_duration: 0.756',
  'size=N/A time=00:20:00.00 bitrate=N/A speed= 812x',
  '[silencedetect @ 0x55d0c1a2b3c0] silence_start: -0.01',
  '[silencedetect @ 0x55d0c1a2b3c0] silence_end: 1.5 | silence_duration: 1.51',
  '[silencedetect @ 0x55d0c1a2b3c0] silence_start: 1190',
].join('\n');

test('silencedetect output becomes start/end pairs, with an open silence running to the end', () => {
  assert.deepEqual(parseSilencedetect(STDERR), [
    { start: 612.345, end: 613.101 },
    { start: 0, end: 1.5 },
    { start: 1190, end: Number.POSITIVE_INFINITY },
  ]);
  assert.deepEqual(parseSilencedetect(''), []);
});

test('audio at or under the limit is not cut', () => {
  assert.deepEqual(planCuts(600, 600, []), { cuts: [], hardCuts: 0 });
  assert.deepEqual(planCuts(599, 600, []), { cuts: [], hardCuts: 0 });
});

test('the cut goes in the last silence before the limit, not the longest one', () => {
  const silences = [
    { start: 400, end: 405 },
    { start: 540, end: 541 },
    { start: 580, end: 581 },
  ];
  assert.deepEqual(planCuts(900, 600, silences), { cuts: [580.5], hardCuts: 0 });
});

test('silences before the floor are ignored, and the lax list is tried before a hard cut', () => {
  const early = [{ start: 100, end: 102 }];
  assert.deepEqual(planCuts(900, 600, early), { cuts: [600], hardCuts: 1 });
  assert.deepEqual(planCuts(900, 600, early, [{ start: 450, end: 450.4 }]), {
    cuts: [450.2],
    hardCuts: 0,
  });
});

test('a silence that crosses the limit is cut inside the limit', () => {
  const { cuts } = planCuts(900, 600, [{ start: 598, end: 610 }]);
  assert.equal(cuts[0], 599);
});

test('no piece is ever longer than the limit, whatever the silences', () => {
  let seed = 42;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let run = 0; run < 50; run++) {
    const total = 600 + random() * 6600;
    const max = [300, 600][run % 2]!;
    const silences: Silence[] = Array.from({ length: Math.floor(random() * 40) }, () => {
      const start = random() * total;
      return { start, end: start + random() * 3 };
    }).sort((a, b) => a.start - b.start);
    const { cuts } = planCuts(total, max, silences);
    const edges = [0, ...cuts, total];
    for (let i = 1; i < edges.length; i++) {
      const length = edges[i]! - edges[i - 1]!;
      assert.ok(length > 0 && length <= max + 1e-9, `piece ${i} was ${length}s with max ${max}`);
    }
  }
});
