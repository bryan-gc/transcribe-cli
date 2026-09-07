import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecordingClock, formatClock } from '../src/utils/recordingClock.js';

test('the clock counts recorded seconds, not wall time spent paused', () => {
  const clock = new RecordingClock();
  clock.tick();
  clock.tick();
  assert.equal(clock.elapsed, 2);

  clock.pause();
  clock.tick();
  clock.tick();
  clock.tick();
  assert.equal(clock.elapsed, 2, 'nothing was recorded while paused');

  clock.resume();
  clock.tick();
  assert.equal(clock.elapsed, 3, 'resumes from where it stopped');
});

test('the clock reads like a stopwatch', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(47), '0:47');
  assert.equal(formatClock(3725), '62:05');
});
