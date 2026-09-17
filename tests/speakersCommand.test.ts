import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findAudioFor, runSpeakersCommand } from '../src/speakers/speakersCommand.js';

const seg = (speaker: string, start: number, text: string) => ({
  speaker,
  start,
  end: start + 4,
  text,
});

function transcript() {
  const stem = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spc-')), '10-00-00__obra');
  fs.writeFileSync(
    `${stem}.json`,
    JSON.stringify({
      segments: [seg('A', 0, 'hola'), seg('B', 5, 'qué tal'), seg('A', 10, 'bien')],
    }),
  );
  fs.writeFileSync(`${stem}.txt`, 'old');
  fs.writeFileSync(`${stem}.m4a`, 'audio');
  return stem;
}

test('names given on the command line are applied without any prompt', async () => {
  const stem = transcript();
  const out: string[] = [];
  await runSpeakersCommand([`${stem}.txt`, 'A=Ana', 'B=Luis'], { write: (t) => void out.push(t) });
  assert.equal(fs.readFileSync(`${stem}.txt`, 'utf-8'), '[Ana] hola\n[Luis] qué tal\n[Ana] bien');
  assert.match(out.join(''), /Renamed[\s\S]*Ana\s+2 turns/);
});

test('without names or a terminal it lists the voices and how to rename them', async () => {
  const stem = transcript();
  const out: string[] = [];
  await runSpeakersCommand([`${stem}.srt`], { write: (t) => void out.push(t) });
  assert.match(out.join(''), /Speaker A\s+2 turns[\s\S]*Speaker B[\s\S]*A=Name B=Name/);
  assert.equal(fs.readFileSync(`${stem}.txt`, 'utf-8'), 'old');
});

test('interactively it hands over the voices, segments and audio, and saves the names', async () => {
  const stem = transcript();
  let received: { labels: string[]; segments: number; audio?: string } | undefined;
  await runSpeakersCommand([`${stem}.meta.json`], {
    write: () => {},
    name: async (speakers, segments, audio) => {
      received = { labels: speakers.map((s) => s.label), segments: segments.length, audio };
      return { B: 'Luis' };
    },
  });
  assert.deepEqual(received, { labels: ['A', 'B'], segments: 3, audio: `${stem}.m4a` });
  assert.match(fs.readFileSync(`${stem}.txt`, 'utf-8'), /\[Luis\] qué tal/);
});

test('a missing path, or a transcript without speaker data, explains itself', async () => {
  await assert.rejects(
    () => runSpeakersCommand([], { write: () => {} }),
    /Usage: transcribe-cli speakers/,
  );
  const plain = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spc-')), 'nota.txt');
  fs.writeFileSync(plain, 'hola');
  await assert.rejects(() => runSpeakersCommand([plain], { write: () => {} }), /--speakers/);
  assert.equal(findAudioFor(plain.slice(0, -4)), undefined);
});
