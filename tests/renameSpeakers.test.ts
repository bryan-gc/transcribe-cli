import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applySpeakerNames,
  parseNameArgs,
  renameSegments,
  transcriptStem,
} from '../src/speakers/renameSpeakers.js';
import { formatDiarized } from '../src/utils/diarizedParser.js';

const seg = (speaker: string, start: number, text: string) => ({
  speaker,
  start,
  end: start + 1,
  text,
});

function transcript() {
  const stem = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spk-')), '10-00-00');
  const segments = [seg('1·A', 0, 'hola'), seg('1·B', 2, 'qué tal'), seg('2·A', 4, 'bien')];
  fs.writeFileSync(`${stem}.json`, JSON.stringify({ text: 'x', segments }));
  fs.writeFileSync(`${stem}.txt`, formatDiarized(segments));
  fs.writeFileSync(`${stem}.srt`, 'old');
  return stem;
}

test('renaming rewrites text, subtitles and speaker data, and remembers the names', () => {
  const stem = transcript();
  applySpeakerNames(stem, { '1·A': 'Ana', '1·B': 'Luis' });

  assert.equal(
    fs.readFileSync(`${stem}.txt`, 'utf-8'),
    '[Ana] hola\n[Luis] qué tal\n[Speaker 2·A] bien',
  );
  assert.match(fs.readFileSync(`${stem}.srt`, 'utf-8'), /\[Luis\] qué tal/);
  const data = JSON.parse(fs.readFileSync(`${stem}.json`, 'utf-8'));
  assert.equal(data.text, 'x', 'the rest of the response is kept');
  assert.deepEqual(
    data.segments.map((s: { speaker: string }) => s.speaker),
    ['Ana', 'Luis', '2·A'],
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(`${stem}.speakers.json`, 'utf-8')), {
    '1·A': { name: 'Ana' },
    '1·B': { name: 'Luis' },
  });
});

test('giving two labels the same name merges them into one voice', () => {
  const stem = transcript();
  applySpeakerNames(stem, { '1·A': 'Ana', '2·A': 'Ana' });
  assert.equal(
    fs.readFileSync(`${stem}.txt`, 'utf-8'),
    '[Ana] hola\n[Speaker 1·B] qué tal\n[Ana] bien',
  );
});

test('a second rename works on the names from the first', () => {
  const stem = transcript();
  applySpeakerNames(stem, { '1·A': 'Ana' });
  applySpeakerNames(stem, { Ana: 'Ana María' });
  assert.match(fs.readFileSync(`${stem}.txt`, 'utf-8'), /^\[Ana María\] hola/);
});

test('without speaker data the error says only --speakers transcripts can be renamed', () => {
  const stem = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spk-')), 'plain');
  fs.writeFileSync(`${stem}.txt`, 'hola');
  assert.throws(
    () => applySpeakerNames(stem, { A: 'Ana' }),
    /only transcripts made with --speakers/i,
  );
});

test('rename arguments and file names are understood in any of their forms', () => {
  assert.deepEqual(parseNameArgs(['A=Ana', '2·B=Luis Pérez']), { A: 'Ana', '2·B': 'Luis Pérez' });
  assert.throws(() => parseNameArgs(['Ana']), /LABEL=Name/);
  assert.throws(() => parseNameArgs(['A=']), /LABEL=Name/);
  for (const file of [
    '/x/10-00-00.txt',
    '/x/10-00-00.srt',
    '/x/10-00-00.json',
    '/x/10-00-00.meta.json',
    '/x/10-00-00.speakers.json',
    '/x/10-00-00.wav',
  ]) {
    assert.equal(transcriptStem(file), '/x/10-00-00');
  }
});

test('names map only the labels they mention', () => {
  const renamed = renameSegments([seg('A', 0, 'x'), seg('B', 1, 'y')], { A: ' Ana ', B: '  ' });
  assert.deepEqual(
    renamed.map((s) => s.speaker),
    ['Ana', 'B'],
  );
});
