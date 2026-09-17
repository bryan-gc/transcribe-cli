import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutSpeakerClips, summarizeSpeakers } from '../src/speakers/speakerSummary.js';

const seg = (speaker: string, start: number, end: number, text = 'x') => ({
  speaker,
  start,
  end,
  text,
});

test('voices are listed by talk time with turns, seconds and their longest line', () => {
  const summary = summarizeSpeakers([
    seg('A', 0, 30, 'una frase bastante larga de la primera voz'),
    seg('B', 30, 35, 'corta'),
    seg('A', 35, 100, 'otra'),
    seg('B', 100, 101, 'sí'),
  ]);
  assert.deepEqual(summary, [
    { label: 'A', turns: 2, seconds: 95, sample: 'una frase bastante larga de la primera voz' },
    { label: 'B', turns: 2, seconds: 6, sample: 'corta' },
  ]);
});

test('long lines are shortened in the sample', () => {
  const [a] = summarizeSpeakers([seg('A', 0, 5, 'x'.repeat(200))]);
  assert.equal(a!.sample.length, 60);
  assert.ok(a!.sample.endsWith('…'));
});

test('a clip is cut for each voice that has a clean stretch, and a failed cut is skipped', () => {
  const cuts: unknown[] = [];
  const clips = cutSpeakerClips(
    '/audio/long.mp3',
    [seg('A', 0, 12), seg('B', 13, 14), seg('C', 20, 30)],
    '/work',
    (source, target, from, to) => {
      if (target.endsWith('voice-2.wav')) throw new Error('ffmpeg failed');
      cuts.push([source, target, from, to]);
    },
  );
  assert.deepEqual(clips, { A: '/work/voice-1.wav' });
  assert.deepEqual(cuts, [['/audio/long.mp3', '/work/voice-1.wav', 0, 10]]);
});
